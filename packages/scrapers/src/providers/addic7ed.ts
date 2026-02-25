import { type BaselineDownloadCandidate } from './types';

export function getAddic7edConfigStatus():
  | { configured: true }
  | { configured: false; reason: string } {
  // Addic7ed scraping can require login and is sensitive to rate limits / ToS.
  // Keep disabled unless explicitly enabled and reviewed.
  const enabled = process.env.ADDIC7ED_ENABLED === '1';
  if (!enabled) return { configured: false, reason: 'Addic7ed disabled. Set ADDIC7ED_ENABLED=1.' };

  // If login becomes required, add env vars (ADDIC7ED_USERNAME/PASSWORD or cookie).
  return { configured: true };
}

export async function findAddic7edDownload(_params: {
  imdbTt: string;
  season: number | null;
  episode: number | null;
  lang: string;
}): Promise<BaselineDownloadCandidate | null> {
  // Not implemented.
  // - TV-first: show page -> season -> episode -> language download link
  // - Enforce very strict request pacing, retries, and avoid parallelism.
  // - Store providerRef as the episode/subtitle id.
  return null;
}
