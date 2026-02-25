import OpenAI from 'openai';
import { jsonrepair } from 'jsonrepair';

export class OpenAIAdapter {
  private client: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable must be set');
    }
    this.client = new OpenAI({ apiKey });
  }

  async translate(content: string, sourceLang: string, targetLang: string): Promise<string> {
    // Parse WebVTT and extract cues
    const cues = this.extractCues(content);

    // Translate in batches
    const translatedCues = await this.translateCues(cues, sourceLang, targetLang);

    // Reconstruct WebVTT
    return this.reconstructWebVTT(content, translatedCues);
  }

  private extractCues(content: string): Array<{ time: string; text: string }> {
    const lines = content.split('\n');
    const cues: Array<{ time: string; text: string }> = [];

    let currentCue: { time: string; text: string } | null = null;

    for (const line of lines) {
      if (line.includes('-->')) {
        if (currentCue) {
          cues.push(currentCue);
        }
        currentCue = { time: line, text: '' };
      } else if (currentCue && line.trim() !== '') {
        // Preserve line breaks inside a cue
        currentCue.text += (currentCue.text ? '\n' : '') + line;
      } else if (currentCue && line.trim() === '') {
        cues.push(currentCue);
        currentCue = null;
      }
    }

    if (currentCue) {
      cues.push(currentCue);
    }

    return cues;
  }

  private async translateCues(
    cues: Array<{ time: string; text: string }>,
    sourceLang: string,
    targetLang: string
  ): Promise<string[]> {
    const textsToTranslate = cues.map((c) => c.text);

    const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

    // Batch translate — larger batches = fewer API calls = faster pipeline
    const batchSize = parseInt(process.env.OPENAI_BATCH_SIZE || '50', 10);
    const concurrency = parseInt(process.env.OPENAI_CONCURRENCY || '3', 10);
    const translated: string[] = new Array(textsToTranslate.length).fill('');

    // Build all batch tasks
    const batches: Array<{ start: number; batch: string[] }> = [];
    for (let i = 0; i < textsToTranslate.length; i += batchSize) {
      batches.push({ start: i, batch: textsToTranslate.slice(i, i + batchSize) });
    }

    // Process batches with bounded concurrency
    for (let c = 0; c < batches.length; c += concurrency) {
      const chunk = batches.slice(c, c + concurrency);
      const results = await Promise.all(
        chunk.map(async ({ start, batch }) => {
          const payload = batch.map((text, idx) => ({ id: start + idx, text }));
          const prompt =
            `Translate each item's "text" from ${sourceLang} to ${targetLang}.\n` +
            `Rules:\n` +
            `- Return ONLY valid JSON (no markdown, no code fences).\n` +
            `- Output must be a JSON array of objects: {"id": number, "translation": string}.\n` +
            `- For multi-line cues, use a real newline character inside the JSON string value (the standard JSON \\n escape).\n` +
            `- Keep the same ids and the same order as input.\n` +
            `- If input text is empty, translation must be "".\n\n` +
            `Input JSON:\n${JSON.stringify(payload)}`;

          const response = await this.client.chat.completions.create({
            model,
            messages: [
              {
                role: 'system',
                content: 'You are a professional subtitle translator. Preserve meaning and timing.',
              },
              { role: 'user', content: prompt },
            ],
            temperature: 0.3,
          });

          const result = response.choices[0].message.content || '';

          const parsed = this.parseJsonArray(result);
          const byId = new Map<number, string>();
          for (const item of parsed) {
            if (!item || typeof item !== 'object') continue;
            const id = (item as { id?: unknown }).id;
            const translation = (item as { translation?: unknown }).translation;
            if (typeof id === 'number' && typeof translation === 'string') {
              // Fix LLMs that return literal two-char "\n" instead of real newlines.
              byId.set(id, translation.replace(/\\n/g, '\n'));
            }
          }

          return { start, batch, byId };
        })
      );

      for (const { start, batch, byId } of results) {
        for (let j = 0; j < batch.length; j++) {
          translated[start + j] = byId.get(start + j) ?? '';
        }
      }
    }

    return translated;
  }

  private parseJsonArray(text: string): unknown[] {
    const trimmed = text.trim();
    // Defensive: strip accidental ``` fences if the model adds them.
    const unfenced = trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();

    // Candidate collection is intentionally generous because the model sometimes returns:
    // - a JSON array
    // - a JSON *string* that contains a JSON array (e.g. "[{\"id\":...}]" )
    // - extra text around the JSON
    const candidates: string[] = this.collectJsonCandidates(unfenced);

    let lastError: unknown;
    for (const candidate of candidates) {
      const parsed = this.tryParseJsonArray(candidate);
      if (parsed) return parsed;

      try {
        const repaired = jsonrepair(candidate);
        const repairedCandidates = this.collectJsonCandidates(repaired);
        for (const repairedCandidate of repairedCandidates) {
          const repairedParsed = this.tryParseJsonArray(repairedCandidate);
          if (repairedParsed) return repairedParsed;
        }
      } catch (err) {
        lastError = err;
      }
    }

    // Last resort: best-effort extraction of {id, translation} pairs from malformed JSON-ish output.
    // This prevents the whole job from failing when the model returns a mostly-correct array with a single broken entry.
    for (const candidate of candidates) {
      const recovered = this.extractIdTranslationPairs(candidate);
      if (recovered.length > 0) return recovered;
    }

    // Never crash the worker over model formatting issues; degrade by returning no translations.
    const preview = unfenced.length > 400 ? `${unfenced.slice(0, 400)}…` : unfenced;
    console.warn(
      `OpenAI returned invalid JSON for subtitle translations. Returning empty translations. Preview: ${JSON.stringify(
        preview
      )}. Error: ${String(lastError ?? 'unknown')}`
    );
    return [];
  }

  private collectJsonCandidates(text: string): string[] {
    const out: string[] = [];
    const seen = new Set<string>();

    const push = (value: string | null | undefined) => {
      if (!value) return;
      const v = value.trim();
      if (!v) return;
      if (seen.has(v)) return;
      seen.add(v);
      out.push(v);
    };

    // Seed
    push(text);

    // Expand a little (bounded) so we can unwrap "..." -> ... and also extract first [...] substring.
    for (let i = 0; i < out.length && i < 20; i++) {
      const current = out[i];

      push(this.extractFirstJsonArraySubstring(current));

      const unwrapped = this.tryUnwrapJsonString(current);
      if (unwrapped) {
        push(unwrapped);
        push(this.extractFirstJsonArraySubstring(unwrapped));
      }
    }

    return out;
  }

  private tryUnwrapJsonString(text: string): string | null {
    const t = text.trim();
    if (t.length < 2 || t[0] !== '"' || t[t.length - 1] !== '"') return null;

    try {
      const parsed = JSON.parse(t) as unknown;
      return typeof parsed === 'string' ? parsed : null;
    } catch {
      return null;
    }
  }

  private extractFirstJsonArraySubstring(text: string): string {
    let start = -1;
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (inString) {
        if (escape) {
          escape = false;
          continue;
        }
        if (ch === '\\') {
          escape = true;
          continue;
        }
        if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === '[') {
        if (start === -1) start = i;
        depth++;
        continue;
      }

      if (ch === ']') {
        if (start !== -1) {
          depth--;
          if (depth === 0) {
            return text.slice(start, i + 1).trim();
          }
        }
      }
    }

    return '';
  }

  private extractIdTranslationPairs(text: string): Array<{ id: number; translation: string }> {
    const results: Array<{ id: number; translation: string }> = [];

    // We scan for occurrences of: "id": <number> ... "translation": <string>
    // and decode the JSON string literal (tolerating raw newlines).
    const idRe = /"id"\s*:\s*(\d+)/g;
    let match: RegExpExecArray | null;

    while ((match = idRe.exec(text)) !== null) {
      const id = Number(match[1]);
      if (!Number.isFinite(id)) continue;

      const afterIdIndex = idRe.lastIndex;
      const translationKeyIndex = text.indexOf('"translation"', afterIdIndex);
      if (translationKeyIndex === -1) continue;

      const colonIndex = text.indexOf(':', translationKeyIndex + '"translation"'.length);
      if (colonIndex === -1) continue;

      const firstQuoteIndex = this.findNextNonWhitespace(text, colonIndex + 1);
      if (firstQuoteIndex === -1 || text[firstQuoteIndex] !== '"') continue;

      const first = this.readJsonStringLiteralLenient(text, firstQuoteIndex);
      if (!first) continue;

      // Handle a common malformed pattern we’ve seen from the model:
      //   "translation":"":"<actual translation>"
      // i.e. an empty string literal followed by another string literal separated by a colon.
      let translation = first.value;
      const cursor = this.findNextNonWhitespace(text, firstQuoteIndex + first.length);
      if (cursor !== -1 && text[cursor] === ':') {
        const next = this.findNextNonWhitespace(text, cursor + 1);
        if (next !== -1 && text[next] === '"') {
          const second = this.readJsonStringLiteralLenient(text, next);
          if (second) {
            translation = second.value;
          }
        }
      }

      results.push({ id, translation });
    }

    return results;
  }

  private findNextNonWhitespace(text: string, startIndex: number): number {
    for (let i = startIndex; i < text.length; i++) {
      const ch = text[i];
      if (ch !== ' ' && ch !== '\n' && ch !== '\r' && ch !== '\t') return i;
    }
    return -1;
  }

  private readJsonStringLiteralLenient(
    text: string,
    startQuoteIndex: number
  ): { value: string; length: number } | null {
    if (text[startQuoteIndex] !== '"') return null;

    let i = startQuoteIndex + 1;
    let escape = false;
    for (; i < text.length; i++) {
      const ch = text[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') {
        // end of string literal
        const rawInner = text.slice(startQuoteIndex + 1, i);
        const value = this.unescapeJsonStringLenient(rawInner);
        return { value, length: i - startQuoteIndex + 1 };
      }
      // NOTE: raw newlines inside the string are tolerated here.
    }

    // Unterminated string.
    const rawInner = text.slice(startQuoteIndex + 1);
    const value = this.unescapeJsonStringLenient(rawInner);
    return { value, length: text.length - startQuoteIndex };
  }

  private unescapeJsonStringLenient(raw: string): string {
    // Minimal JSON string unescaper. Also tolerates raw newlines.
    let out = '';
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (ch !== '\\') {
        out += ch;
        continue;
      }

      const next = raw[i + 1];
      if (next === undefined) {
        out += '\\';
        continue;
      }

      switch (next) {
        case '"':
          out += '"';
          i++;
          break;
        case '\\':
          out += '\\';
          i++;
          break;
        case '/':
          out += '/';
          i++;
          break;
        case 'b':
          out += '\b';
          i++;
          break;
        case 'f':
          out += '\f';
          i++;
          break;
        case 'n':
          out += '\n';
          i++;
          break;
        case 'r':
          out += '\r';
          i++;
          break;
        case 't':
          out += '\t';
          i++;
          break;
        case 'u': {
          const hex = raw.slice(i + 2, i + 6);
          if (/^[0-9a-fA-F]{4}$/.test(hex)) {
            out += String.fromCharCode(parseInt(hex, 16));
            i += 5;
          } else {
            out += 'u';
            i++;
          }
          break;
        }
        default:
          // Unknown escape; keep the escaped character.
          out += next;
          i++;
          break;
      }
    }
    return out;
  }

  private tryParseJsonArray(text: string): unknown[] | null {
    try {
      const parsed = JSON.parse(text) as unknown;
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private reconstructWebVTT(original: string, translatedTexts: string[]): string {
    let result = 'WEBVTT\n\n';
    const lines = original.split('\n');

    let cueIndex = 0;
    let inCue = false;
    let pendingCueText = false;
    let translationPresent = false;
    let didWriteTranslation = false;
    let translationLines: string[] = [];

    for (const line of lines) {
      if (line.includes('-->')) {
        result += line + '\n';
        inCue = true;
        pendingCueText = true;
        didWriteTranslation = false;
        const t = translatedTexts[cueIndex] || '';
        translationPresent = t.trim().length > 0;
        translationLines = translationPresent ? t.split('\n') : [];
        continue;
      }

      if (inCue && line.trim() === '') {
        // Cue ended. If the cue had no text lines but we do have a translation, write it.
        if (pendingCueText && translationPresent && !didWriteTranslation) {
          result += translationLines.join('\n') + '\n';
        }
        result += '\n';
        inCue = false;
        pendingCueText = false;
        translationPresent = false;
        didWriteTranslation = false;
        translationLines = [];
        cueIndex++;
        continue;
      }

      if (inCue) {
        if (pendingCueText) {
          pendingCueText = false;
          if (translationPresent) {
            result += translationLines.join('\n') + '\n';
            didWriteTranslation = true;
            // Skip original cue text lines until blank line
            continue;
          }
        }

        if (translationPresent) {
          // We're skipping original cue text lines.
          continue;
        }

        // No translation available: preserve original cue text
        result += line + '\n';
        continue;
      }

      if (!line.includes('WEBVTT')) {
        result += line + '\n';
      }
    }

    // Handle file ending mid-cue
    if (inCue && pendingCueText && translationPresent && !didWriteTranslation) {
      result += translationLines.join('\n') + '\n';
    }

    return result.trim();
  }
}
