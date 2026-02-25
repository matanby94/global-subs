import { Job } from 'bullmq';
import { validateWebVTT } from '@stremio-ai-subs/shared';

export async function postcheckSubtitleProcessor(job: Job) {
  const { content } = job.data;

  job.log('Running post-checks on translated subtitle');

  const validation = validateWebVTT(content);

  job.log(
    `Quality: grade=${validation.grade} score=${validation.score} cues=${validation.stats.totalCues} cpsViolations=${validation.stats.cpsViolations} lineViolations=${validation.stats.lineLengthViolations}`
  );

  // Only reject truly broken translations (F-grade = no parseable cues or catastrophic quality)
  if (!validation.valid) {
    job.log(`Validation errors: ${validation.errors.join(', ')}`);
    throw new Error(
      `Post-check failed (grade ${validation.grade}): ${validation.errors.join(', ')}`
    );
  }

  if (validation.grade !== 'A') {
    job.log(
      `Warning: translated output is grade ${validation.grade} (${validation.errors.slice(0, 3).join('; ')})`
    );
  }

  job.log('Post-check passed');

  return { valid: true, score: validation.score, grade: validation.grade };
}
