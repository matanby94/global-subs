import { z } from 'zod';

export const BaselineDownloadCandidateSchema = z.object({
  url: z.string().url(),
  lang: z.string().min(2),
  providerRef: z.string().optional(),
  // Free-form provider payload for debugging/quality scoring.
  meta: z.record(z.unknown()).optional(),
});

export type BaselineDownloadCandidate = z.infer<typeof BaselineDownloadCandidateSchema>;
