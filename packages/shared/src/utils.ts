import crypto from 'crypto';

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
    'deepl': 0.00002,
  };
  return tokens * (pricePerToken[model as keyof typeof pricePerToken] || 0);
}

export function validateWebVTT(content: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!content.startsWith('WEBVTT')) {
    errors.push('Missing WEBVTT header');
  }

  const lines = content.split('\n');
  let inCue = false;
  let cueText = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line.includes('-->')) {
      inCue = true;
      cueText = '';
      continue;
    }

    if (inCue && line === '') {
      // Check CPS and chars per line
      const cps = cueText.length / 3; // Assume 3s average
      if (cps > 21) {
        errors.push(`Cue at line ${i} exceeds 21 CPS`);
      }
      
      const cueLines = cueText.split('\n');
      for (const cueLine of cueLines) {
        if (cueLine.length > 42) {
          errors.push(`Cue line at ${i} exceeds 42 chars`);
        }
      }
      
      inCue = false;
    } else if (inCue) {
      cueText += line + '\n';
    }
  }

  return { valid: errors.length === 0, errors };
}

export function normalizeWebVTT(content: string): string {
  // Basic normalization: ensure proper line endings, remove extra spaces
  return content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
}
