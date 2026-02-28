import crypto from 'crypto';

export type SubtitleFormat = 'vtt' | 'srt' | 'ass' | 'ssa' | 'unknown';

export function generateArtifactHash(data: {
  srcRegistry: string;
  srcId: string;
  srcLang: string;
  dstLang: string;
  model: string;
  normalization: string;
  segPolicy: string;
}): string {
  const input = `${data.srcRegistry}|${data.srcId}|${data.srcLang}|${data.dstLang}|${data.model}|${data.normalization}|${data.segPolicy}`;
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function estimateTokens(text: string): number {
  // Rough estimation: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}

export function estimateCost(text: string, model: string): number {
  const tokens = estimateTokens(text);
  const pricePerToken = {
    'gpt-4': 0.00003,
    'gemini-pro': 0.000001,
    deepl: 0.00002,
  };
  return tokens * (pricePerToken[model as keyof typeof pricePerToken] || 0);
}

export function validateWebVTT(content: string): {
  valid: boolean;
  errors: string[];
  score: number;
  grade: 'A' | 'B' | 'C' | 'F';
  stats: {
    totalCues: number;
    cpsViolations: number;
    lineLengthViolations: number;
    avgCps: number;
    maxCps: number;
    meanLineLength: number;
  };
} {
  const errors: string[] = [];

  if (!content.startsWith('WEBVTT')) {
    errors.push('Missing WEBVTT header');
    return {
      valid: false,
      errors,
      score: 0,
      grade: 'F',
      stats: {
        totalCues: 0,
        cpsViolations: 0,
        lineLengthViolations: 0,
        avgCps: 0,
        maxCps: 0,
        meanLineLength: 0,
      },
    };
  }

  const lines = content.split('\n');
  const cues: { startMs: number; endMs: number; text: string; lineIndex: number }[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    const timingMatch = line.match(
      /^(\d{1,2}:\d{2}:\d{2}[.]\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[.]\d{3})/
    );
    if (timingMatch) {
      const startMs = parseVttTimestamp(timingMatch[1]);
      const endMs = parseVttTimestamp(timingMatch[2]);
      const lineIndex = i;
      i++;

      // Collect cue text lines until blank line or EOF
      let cueText = '';
      while (i < lines.length && lines[i].trim() !== '') {
        cueText += (cueText ? '\n' : '') + lines[i].trim();
        i++;
      }

      if (cueText.length > 0 && endMs > startMs) {
        cues.push({ startMs, endMs, text: cueText, lineIndex });
      }
    } else {
      i++;
    }
  }

  if (cues.length === 0) {
    errors.push('No valid cues found');
    return {
      valid: false,
      errors,
      score: 0,
      grade: 'F',
      stats: {
        totalCues: 0,
        cpsViolations: 0,
        lineLengthViolations: 0,
        avgCps: 0,
        maxCps: 0,
        meanLineLength: 0,
      },
    };
  }

  // ── Per-cue quality checks ──
  const CPS_LIMIT = 25; // Characters per second (Netflix standard is ~20, we allow some margin)
  const LINE_LENGTH_LIMIT = 47; // Characters per line (industry standard 42, +margin for non-Latin scripts)

  let cpsViolations = 0;
  let lineLengthViolations = 0;
  let totalCps = 0;
  let maxCps = 0;
  const allLineLengths: number[] = [];

  for (const cue of cues) {
    const durationSec = (cue.endMs - cue.startMs) / 1000;
    // Strip HTML tags for character counting
    const plainText = cue.text.replace(/<[^>]+>/g, '');
    const charCount = plainText.replace(/\n/g, '').length;
    const cps = durationSec > 0 ? charCount / durationSec : 0;

    totalCps += cps;
    if (cps > maxCps) maxCps = cps;

    if (cps > CPS_LIMIT) {
      cpsViolations++;
      if (cpsViolations <= 3) {
        errors.push(`Cue at line ${cue.lineIndex} has ${cps.toFixed(1)} CPS (limit: ${CPS_LIMIT})`);
      }
    }

    for (const cueLine of plainText.split('\n')) {
      allLineLengths.push(cueLine.length);
      if (cueLine.length > LINE_LENGTH_LIMIT) {
        lineLengthViolations++;
        if (lineLengthViolations <= 3) {
          errors.push(
            `Cue line at ${cue.lineIndex} is ${cueLine.length} chars (limit: ${LINE_LENGTH_LIMIT})`
          );
        }
      }
    }
  }

  // ── Quality score (0–100) ──
  // Based on the percentage of cues that pass all checks.
  // CPS violations are weighted more heavily than line-length ones.
  const cpsPassRate = 1 - cpsViolations / cues.length;
  const linePassRate =
    allLineLengths.length > 0 ? 1 - lineLengthViolations / allLineLengths.length : 1;
  // 60% weight on CPS, 40% on line length
  const rawScore = cpsPassRate * 60 + linePassRate * 40;
  const score = Math.round(Math.max(0, Math.min(100, rawScore)));

  // Grade thresholds
  let grade: 'A' | 'B' | 'C' | 'F';
  if (score >= 90) grade = 'A';
  else if (score >= 70) grade = 'B';
  else if (score >= 50) grade = 'C';
  else grade = 'F';

  // Only truly broken subtitles are "invalid" (F-grade)
  const valid = grade !== 'F';

  const avgCps = cues.length > 0 ? totalCps / cues.length : 0;
  const meanLineLength =
    allLineLengths.length > 0
      ? allLineLengths.reduce((a, b) => a + b, 0) / allLineLengths.length
      : 0;

  if (cpsViolations > 3) {
    errors.push(`... and ${cpsViolations - 3} more CPS violations`);
  }
  if (lineLengthViolations > 3) {
    errors.push(`... and ${lineLengthViolations - 3} more line-length violations`);
  }

  return {
    valid,
    errors,
    score,
    grade,
    stats: {
      totalCues: cues.length,
      cpsViolations,
      lineLengthViolations,
      avgCps: Math.round(avgCps * 10) / 10,
      maxCps: Math.round(maxCps * 10) / 10,
      meanLineLength: Math.round(meanLineLength * 10) / 10,
    },
  };
}

/**
 * Parse a VTT timestamp string (HH:MM:SS.mmm) to milliseconds.
 */
function parseVttTimestamp(ts: string): number {
  const m = ts.match(/^(\d{1,2}):(\d{2}):(\d{2})\.(\d{3})$/);
  if (!m) return 0;
  return (
    parseInt(m[1], 10) * 3600000 +
    parseInt(m[2], 10) * 60000 +
    parseInt(m[3], 10) * 1000 +
    parseInt(m[4], 10)
  );
}

export function normalizeWebVTT(content: string): string {
  // Basic normalization: ensure proper line endings, remove extra spaces
  return content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

function stripUtf8Bom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function countMatches(text: string, re: RegExp): number {
  const m = text.match(re);
  return m ? m.length : 0;
}

function maybeRepairUtf8MojibakeFromLatin1(text: string): string {
  // Heuristic fix for a common issue where UTF-8 subtitle bytes were decoded as Latin-1.
  // Example symptom (Hebrew): "×¢×•×ž×“" instead of "עומד".
  //
  // We only apply the repair if it clearly improves the text for Hebrew and
  // reduces the mojibake markers.
  const mojibakeMarkers = countMatches(text, /×[\u0080-\u00FF]/g);
  if (mojibakeMarkers < 10) return text;

  const hebrewChars = countMatches(text, /[\u0590-\u05FF]/g);
  if (hebrewChars > mojibakeMarkers / 2) return text;

  const repaired = Buffer.from(text, 'latin1').toString('utf8');
  const repairedMojibake = countMatches(repaired, /×[\u0080-\u00FF]/g);
  const repairedHebrew = countMatches(repaired, /[\u0590-\u05FF]/g);

  const improvesHebrew = repairedHebrew >= Math.max(10, hebrewChars * 5);
  const reducesMojibake = repairedMojibake <= Math.floor(mojibakeMarkers / 10);

  return improvesHebrew && reducesMojibake ? repaired : text;
}

export function detectSubtitleFormat(input: string): SubtitleFormat {
  const text = stripUtf8Bom(input).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const head = text.slice(0, 2048);

  if (/^\s*WEBVTT\b/i.test(head)) return 'vtt';
  if (/\[Events\]/i.test(head) || /\bDialogue:\s*/i.test(head)) return 'ass';
  if (/\[Script Info\]/i.test(head) || /\bStyle:\s*/i.test(head)) return 'ass';

  // Common SRT signature: timing line with comma milliseconds
  if (/\b\d{1,2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{1,2}:\d{2}:\d{2},\d{3}\b/.test(text)) {
    return 'srt';
  }

  // Generic timing line (SRT or VTT without header)
  if (/\b\d{1,2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[.,]\d{3}\b/.test(text)) {
    // Ambiguous: could be VTT missing header or SRT with dot ms.
    // Prefer SRT behavior (we'll emit a proper WEBVTT header anyway).
    return 'srt';
  }

  return 'unknown';
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function pad3(n: number): string {
  if (n < 10) return `00${n}`;
  if (n < 100) return `0${n}`;
  return String(n);
}

function srtTimeToVtt(time: string): string {
  // 00:00:01,234 -> 00:00:01.234
  return time.replace(',', '.');
}

function assTimeToVtt(time: string): string {
  // ASS: H:MM:SS.cc (centiseconds)
  const m = time.trim().match(/^(\d+):(\d{1,2}):(\d{1,2})[.:](\d{1,3})$/);
  if (!m) return time.trim();
  const hours = parseInt(m[1], 10);
  const minutes = parseInt(m[2], 10);
  const seconds = parseInt(m[3], 10);
  const frac = parseInt(m[4], 10);
  // Treat 1-2 digits as centiseconds; 3 digits as milliseconds
  const ms = m[4].length <= 2 ? frac * 10 : frac;
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}.${pad3(ms)}`;
}

function stripAssOverrideTags(text: string): string {
  // Remove override tags like {\i1} and drawing commands.
  return text.replace(/\{[^}]*\}/g, '');
}

function convertSrtToVtt(input: string): { vtt: string; warnings: string[] } {
  const warnings: string[] = [];
  const text = normalizeWebVTT(stripUtf8Bom(input));
  const lines = text.split('\n');

  const out: string[] = ['WEBVTT', ''];
  let i = 0;

  while (i < lines.length) {
    // Skip blank lines
    while (i < lines.length && lines[i].trim() === '') i++;
    if (i >= lines.length) break;

    // Optional cue identifier/index
    const maybeIndex = lines[i].trim();
    if (/^\d+$/.test(maybeIndex)) i++;

    if (i >= lines.length) break;
    const timingLine = lines[i].trim();
    const timingMatch = timingLine.match(
      /^(\d{1,2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{3})(.*)$/
    );

    if (!timingMatch) {
      warnings.push(`Skipping unexpected line (no timing): ${timingLine.slice(0, 80)}`);
      // Try to recover by advancing
      i++;
      continue;
    }

    const start = srtTimeToVtt(timingMatch[1]);
    const end = srtTimeToVtt(timingMatch[2]);
    const settings = timingMatch[3] || '';
    out.push(`${start} --> ${end}${settings}`.trimEnd());
    i++;

    // Cue text until blank line
    while (i < lines.length && lines[i].trim() !== '') {
      out.push(lines[i]);
      i++;
    }
    out.push('');
  }

  return { vtt: normalizeWebVTT(out.join('\n')) + '\n', warnings };
}

function splitAssCsv(line: string, fields: number): string[] {
  // Split into `fields` pieces, allowing commas inside last field.
  const parts: string[] = [];
  let current = '';
  let count = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === ',' && count < fields - 1) {
      parts.push(current);
      current = '';
      count++;
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

function convertAssToVtt(input: string): {
  vtt: string;
  warnings: string[];
  format: 'ass' | 'ssa';
} {
  const warnings: string[] = [];
  const raw = stripUtf8Bom(input).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const format: 'ass' | 'ssa' = /\[Script Info\]/i.test(raw) ? 'ass' : 'ass';

  const lines = raw.split('\n');
  let inEvents = false;
  let formatFields: string[] | null = null;
  let startIdx = -1;
  let endIdx = -1;
  let textIdx = -1;

  const out: string[] = ['WEBVTT', ''];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (/^\[Events\]$/i.test(trimmed)) {
      inEvents = true;
      continue;
    }
    if (/^\[.+\]$/.test(trimmed) && !/^\[Events\]$/i.test(trimmed)) {
      inEvents = false;
      continue;
    }
    if (!inEvents) continue;

    if (/^Format:/i.test(trimmed)) {
      const fieldsRaw = trimmed.replace(/^Format:\s*/i, '');
      formatFields = fieldsRaw.split(',').map((s) => s.trim().toLowerCase());
      startIdx = formatFields.indexOf('start');
      endIdx = formatFields.indexOf('end');
      textIdx = formatFields.indexOf('text');
      if (startIdx === -1 || endIdx === -1 || textIdx === -1) {
        warnings.push('ASS Format line missing Start/End/Text fields; best-effort parsing.');
      }
      continue;
    }

    if (!/^Dialogue:/i.test(trimmed)) continue;
    const payload = trimmed.replace(/^Dialogue:\s*/i, '');

    const fieldCount = formatFields?.length ?? 10;
    const parts = splitAssCsv(payload, fieldCount);

    const get = (idx: number): string => {
      if (idx < 0) return '';
      return (parts[idx] ?? '').trim();
    };

    const startRaw = startIdx >= 0 ? get(startIdx) : get(1);
    const endRaw = endIdx >= 0 ? get(endIdx) : get(2);
    let textRaw = textIdx >= 0 ? get(textIdx) : parts.slice(9).join(',').trim();

    textRaw = textRaw.replace(/\\N/g, '\n').replace(/\\n/g, '\n').replace(/\\h/g, ' ');
    textRaw = stripAssOverrideTags(textRaw).trim();
    if (textRaw.length === 0) continue;

    const start = assTimeToVtt(startRaw);
    const end = assTimeToVtt(endRaw);
    out.push(`${start} --> ${end}`);
    out.push(...textRaw.split('\n'));
    out.push('');
  }

  return { vtt: normalizeWebVTT(out.join('\n')) + '\n', warnings, format };
}

export function normalizeSubtitleToWebVTT(input: string): {
  vtt: string;
  format: SubtitleFormat;
  warnings: string[];
} {
  let raw = stripUtf8Bom(input);
  raw = maybeRepairUtf8MojibakeFromLatin1(raw);
  const detected = detectSubtitleFormat(raw);

  if (detected === 'vtt') {
    const normalized = normalizeWebVTT(raw);
    const vtt = normalized.startsWith('WEBVTT') ? normalized : `WEBVTT\n\n${normalized}`;
    return { vtt: vtt + '\n', format: 'vtt', warnings: [] };
  }

  if (detected === 'srt') {
    const { vtt, warnings } = convertSrtToVtt(raw);
    return { vtt, format: 'srt', warnings };
  }

  if (detected === 'ass' || detected === 'ssa') {
    const { vtt, warnings, format } = convertAssToVtt(raw);
    return { vtt, format, warnings };
  }

  // Unknown: treat as plain text cues without timestamps (best-effort); still emit valid header.
  const normalized = normalizeWebVTT(raw);
  return {
    vtt: `WEBVTT\n\n${normalized}\n`,
    format: 'unknown',
    warnings: ['Unknown subtitle format'],
  };
}
