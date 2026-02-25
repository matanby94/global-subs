import { BaselineDownloadCandidateSchema, type BaselineDownloadCandidate } from './types';

export function getPodnapisiConfigStatus():
  | { configured: true }
  | { configured: false; reason: string } {
  // Podnapisi is publicly browsable, but they can aggressively rate-limit/bot-block.
  // Keep it disabled unless explicitly enabled.
  const enabled = process.env.PODNAPISI_ENABLED === '1';
  if (!enabled) {
    return { configured: false, reason: 'Podnapisi disabled. Set PODNAPISI_ENABLED=1.' };
  }
  return { configured: true };
}

export async function findPodnapisiDownload(_params: {
  imdbTt: string;
  season: number | null;
  episode: number | null;
  lang: string; // ISO-639-1 lower-case
}): Promise<BaselineDownloadCandidate | null> {
  // Not implemented. Podnapisi returned HTTP 429 (“Server is overloaded”) during automated access
  // in this environment, so it is kept disabled by default.
  // If/when implemented:
  // - Use very conservative rate limiting (e.g. >= 1000ms)
  // - Respect 429/Retry-After
  // - Use a stable selector strategy and add a small regression test if possible.
  // - Consider optional cookie support (PODNAPISI_COOKIE) if needed.
  return null;
}

export async function downloadPodnapisiSubtitleText(
  _downloadUrl: string
): Promise<{ text: string; filename: string }> {
  // Not implemented.
  // Podnapisi historically serves ZIP downloads; if so, reuse the same zip extraction approach as SubDL.
  throw new Error('Podnapisi download not implemented');
}

export function parsePodnapisiCandidate(raw: {
  url: string;
  lang: string;
  providerRef?: string;
  meta?: Record<string, unknown>;
}): BaselineDownloadCandidate {
  return BaselineDownloadCandidateSchema.parse(raw);
}
