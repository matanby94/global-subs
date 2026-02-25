import { type BaselineDownloadCandidate } from './types';

export function getTvSubtitlesConfigStatus():
  | { configured: true }
  | { configured: false; reason: string } {
  const enabled = process.env.TVSUBTITLES_ENABLED === '1';
  if (!enabled)
    return { configured: false, reason: 'TVsubtitles disabled. Set TVSUBTITLES_ENABLED=1.' };
  return { configured: true };
}

export async function findTvSubtitlesDownload(_params: {
  imdbTt: string;
  season: number | null;
  episode: number | null;
  lang: string;
}): Promise<BaselineDownloadCandidate | null> {
  // Not implemented.
  // Notes:
  // - Likely requires title matching (no guaranteed IMDb binding).
  // - Treat as low confidence unless we can prove an ID mapping.
  return null;
}
