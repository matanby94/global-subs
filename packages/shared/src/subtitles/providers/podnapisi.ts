import { BaselineDownloadCandidateSchema, type BaselineDownloadCandidate } from '../types';

export function getPodnapisiConfigStatus():
  | { configured: true }
  | { configured: false; reason: string } {
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
  lang: string;
}): Promise<BaselineDownloadCandidate | null> {
  return null;
}

export async function downloadPodnapisiSubtitleText(
  _downloadUrl: string
): Promise<{ text: string; filename: string }> {
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
