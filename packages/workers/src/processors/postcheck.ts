import { Job } from 'bullmq';
import { validateWebVTT } from '@stremio-ai-subs/shared';

export async function postcheckSubtitleProcessor(job: Job) {
  const { content } = job.data;

  job.log('Running post-checks on translated subtitle');

  const validation = validateWebVTT(content);

  if (!validation.valid) {
    job.log(`Validation errors: ${validation.errors.join(', ')}`);
    throw new Error(`Post-check failed: ${validation.errors.join(', ')}`);
  }

  job.log('Post-check passed');

  return { valid: true };
}
