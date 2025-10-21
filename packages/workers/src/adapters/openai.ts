import OpenAI from 'openai';

export class OpenAIAdapter {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || 'sk-test',
    });
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
        currentCue.text += (currentCue.text ? ' ' : '') + line.trim();
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

    // Batch translate
    const batchSize = 10;
    const translated: string[] = [];

    for (let i = 0; i < textsToTranslate.length; i += batchSize) {
      const batch = textsToTranslate.slice(i, i + batchSize);
      const prompt = `Translate the following subtitle lines from ${sourceLang} to ${targetLang}. Preserve formatting and timing. Return only the translations, one per line:\n\n${batch.join('\n')}`;

      const response = await this.client.chat.completions.create({
        model: 'gpt-4',
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
      const lines = result.split('\n').filter((l) => l.trim());
      translated.push(...lines);
    }

    return translated;
  }

  private reconstructWebVTT(original: string, translatedTexts: string[]): string {
    let result = 'WEBVTT\n\n';
    const lines = original.split('\n');

    let cueIndex = 0;
    let inCue = false;
    let skipNextText = false;

    for (const line of lines) {
      if (line.includes('-->')) {
        result += line + '\n';
        inCue = true;
        skipNextText = true;
        continue;
      }

      if (inCue && line.trim() === '') {
        result += '\n';
        inCue = false;
        continue;
      }

      if (inCue && skipNextText && line.trim() !== '') {
        // Replace with translated text
        result += translatedTexts[cueIndex] || line;
        result += '\n';
        cueIndex++;
        skipNextText = false;
      } else if (!inCue && !line.includes('WEBVTT')) {
        result += line + '\n';
      }
    }

    return result.trim();
  }
}
