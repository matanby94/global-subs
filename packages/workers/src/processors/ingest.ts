import { Job } from 'bullmq';
import axios from 'axios';
import { normalizeSubtitleToWebVTT } from '@stremio-ai-subs/shared';

export async function ingestSubtitleProcessor(job: Job) {
  const { sourceSubtitle } = job.data;

  if (typeof sourceSubtitle === 'string' && sourceSubtitle.startsWith('http')) {
    job.log(`Ingesting subtitle from URL: ${sourceSubtitle}`);
  } else {
    const preview =
      typeof sourceSubtitle === 'string'
        ? sourceSubtitle.slice(0, 120).replace(/\s+/g, ' ')
        : String(sourceSubtitle);
    job.log(
      `Ingesting subtitle from inline content: ${preview}${typeof sourceSubtitle === 'string' && sourceSubtitle.length > 120 ? '…' : ''}`
    );
  }

  // Download or load subtitle
  let content: string;

  if (sourceSubtitle.startsWith('http')) {
    const response = await axios.get(sourceSubtitle, { timeout: 30_000 });
    content = response.data;
  } else {
    content = sourceSubtitle;
  }

  const normalized = normalizeSubtitleToWebVTT(content);
  content = normalized.vtt;

  job.log('Subtitle ingested and normalized');

  return { content };
}
