import { Job } from 'bullmq';
import axios from 'axios';
import { normalizeWebVTT } from '@stremio-ai-subs/shared';

export async function ingestSubtitleProcessor(job: Job) {
  const { sourceSubtitle } = job.data;

  job.log(`Ingesting subtitle from: ${sourceSubtitle}`);

  // Download or load subtitle
  let content: string;

  if (sourceSubtitle.startsWith('http')) {
    const response = await axios.get(sourceSubtitle);
    content = response.data;
  } else {
    content = sourceSubtitle;
  }

  // Normalize to WebVTT
  const normalized = normalizeWebVTT(content);

  // Ensure it's valid WebVTT
  if (!normalized.startsWith('WEBVTT')) {
    // Simple SRT to WebVTT conversion
    content = 'WEBVTT\n\n' + normalized;
  } else {
    content = normalized;
  }

  job.log('Subtitle ingested and normalized');

  return { content };
}
