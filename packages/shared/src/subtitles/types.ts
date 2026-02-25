import { z } from 'zod';

export const BaselineDownloadCandidateSchema = z.object({
  url: z.string().url(),
  lang: z.string().min(2),
  providerRef: z.string().optional(),
  meta: z.record(z.unknown()).optional(),
});

export type BaselineDownloadCandidate = z.infer<typeof BaselineDownloadCandidateSchema>;

export type ProviderConfigStatus = { configured: true } | { configured: false; reason: string };

export type ResolveSubtitleParams = {
  imdbTt: string; // tt123...
  imdbNumeric: number | null;
  season: number | null;
  episode: number | null;
  lang: string; // ISO-639-1 lower-case
};

export type SubtitleProviderId = 'subdl' | 'moviesubtitles' | 'opensubtitles' | 'podnapisi';

export type ResolvedSubtitleText = {
  provider: SubtitleProviderId;
  downloadUrl: string;
  providerRef: string | null;
  detectedLang: string | null;
  filename: string | null;
  finalUrl: string | null;
  text: string;
  meta: Record<string, unknown>;
};
