import AdmZip from 'adm-zip';
import { z } from 'zod';
import type Redis from 'ioredis';
import { acquireProviderSlot } from '@stremio-ai-subs/shared';

/** Shared Redis connection — set from scrapers entrypoint. */
let redis: Redis | null = null;
export function setSubdlRedis(r: Redis) {
  redis = r;
}

export const SubdlDownloadSchema = z.object({
  url: z.string().url(),
  lang: z.string().min(2),
  providerRef: z.string().optional(),
  meta: z.record(z.unknown()).optional(),
});

export type SubdlDownload = z.infer<typeof SubdlDownloadSchema>;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDebug(): boolean {
  return (process.env.LOG_LEVEL || '').toLowerCase() === 'debug' || process.env.DEBUG_SUBDL === '1';
}

export function getSubdlConfigStatus():
  | { configured: true }
  | { configured: false; reason: string } {
  const apiKey = process.env.SUBDL_API_KEY;
  if (!apiKey) {
    return {
      configured: false,
      reason: 'SubDL not configured. Set SUBDL_API_KEY.',
    };
  }
  return { configured: true };
}

const responseSchema = z
  .object({
    status: z.boolean(),
    error: z.string().optional(),
    subtitles: z.array(z.unknown()).optional(),
    results: z.array(z.unknown()).optional(),
  })
  .passthrough();

type SubdlApiResponse = z.infer<typeof responseSchema>;

let lastRequestAt = 0;
async function rateLimit() {
  // Prefer Redis-backed rate limiter for cross-process safety
  if (redis) {
    const result = await acquireProviderSlot(redis, 'subdl');
    if (!result.allowed) {
      await sleep(result.retryAfterMs);
    }
    return;
  }
  // Fallback: in-process limiter
  const minIntervalMs = Math.max(0, parseInt(process.env.SUBDL_MIN_INTERVAL_MS || '350', 10));
  const now = Date.now();
  const wait = Math.max(0, lastRequestAt + minIntervalMs - now);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

async function fetchJsonWithRetries(url: string, opts: { attempts: number }) {
  const debug = getDebug();

  let lastErr: unknown;
  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    try {
      await rateLimit();

      const res = await fetch(url, {
        headers: {
          accept: 'application/json',
          'user-agent':
            process.env.SUBDL_USER_AGENT ||
            process.env.OPENSUBTITLES_USER_AGENT ||
            'GlobalSubs/1.0',
        },
      });

      if (res.status === 429 || res.status >= 500) {
        const retryAfter = res.headers.get('retry-after');
        const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 0;
        const backoffMs = Math.min(30_000, 500 * 2 ** (attempt - 1));
        const waitMs = Math.max(retryAfterMs, backoffMs);
        if (debug)
          console.log('[subdl] retryable response', { status: res.status, attempt, waitMs });
        await sleep(waitMs);
        continue;
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`SubDL HTTP ${res.status}: ${body.slice(0, 200)}`);
      }

      return (await res.json()) as unknown;
    } catch (err) {
      lastErr = err;
      const backoffMs = Math.min(30_000, 500 * 2 ** (attempt - 1));
      if (debug)
        console.log('[subdl] fetch failed', { attempt, backoffMs, error: (err as Error).message });
      await sleep(backoffMs);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('SubDL request failed');
}

function normalizeLang(lang: string): string {
  return lang.trim().toUpperCase();
}

function extractString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return null;
}

function findZipIdInSubtitleObject(sub: Record<string, unknown>): string | null {
  // Common candidates: url/link/file/zip/download
  const direct = extractString(sub, [
    'zip',
    'zip_id',
    'zipId',
    'zip_file',
    'zipFile',
    'download',
    'download_url',
    'downloadUrl',
    'link',
    'url',
    'file',
  ]);

  const candidates: string[] = [];
  if (direct) candidates.push(direct);

  // Shallow scan of string values
  for (const v of Object.values(sub)) {
    if (typeof v === 'string' && v.trim()) candidates.push(v.trim());
  }

  for (const c of candidates) {
    // Full URL already?
    if (/^https?:\/\//i.test(c) && /\.zip($|\?)/i.test(c)) return c;

    // Looks like the documented zip id pattern (example: 3197651-3213944.zip)
    const m = c.match(/(\d+-\d+)(?:\.zip)?$/);
    if (m) return `${m[1]}.zip`;

    // Sometimes a direct numeric id exists; cannot reliably turn into zip without the second part.
  }

  return null;
}

function toDownloadUrl(zipIdOrUrl: string): { url: string; providerRef: string } {
  if (/^https?:\/\//i.test(zipIdOrUrl)) {
    return { url: zipIdOrUrl, providerRef: zipIdOrUrl };
  }

  const zipId = zipIdOrUrl.endsWith('.zip') ? zipIdOrUrl : `${zipIdOrUrl}.zip`;
  const dlBase = (process.env.SUBDL_DL_BASE_URL || 'https://dl.subdl.com/subtitle').replace(
    /\/$/,
    ''
  );
  return { url: `${dlBase}/${zipId}`, providerRef: zipId };
}

export async function findSubdlDownload(params: {
  imdbTt: string; // tt123
  season: number | null;
  episode: number | null;
  lang: string; // ISO-639-1 (lowercase)
}): Promise<SubdlDownload | null> {
  const cfg = getSubdlConfigStatus();
  if (!cfg.configured) return null;

  const apiKey = process.env.SUBDL_API_KEY as string;
  const apiBase = (process.env.SUBDL_BASE_URL || 'https://api.subdl.com/api/v1').replace(/\/$/, '');

  const type = params.season != null || params.episode != null ? 'tv' : 'movie';

  const url = new URL(`${apiBase}/subtitles`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('imdb_id', params.imdbTt);
  url.searchParams.set('type', type);
  url.searchParams.set('languages', normalizeLang(params.lang));
  if (params.season != null) url.searchParams.set('season_number', String(params.season));
  if (params.episode != null) url.searchParams.set('episode_number', String(params.episode));

  const raw = (await fetchJsonWithRetries(url.toString(), { attempts: 4 })) as unknown;
  const parsed: SubdlApiResponse = responseSchema.parse(raw);

  if (!parsed.status) return null;

  const subtitles = Array.isArray(parsed.subtitles) ? parsed.subtitles : [];

  // Rank entries: prefer episode-specific over multi-episode packs.
  type Candidate = { sub: Record<string, unknown>; zipIdOrUrl: string; score: number };
  const candidates: Candidate[] = [];

  for (const item of subtitles) {
    const sub = item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
    if (!sub) continue;

    const zipIdOrUrl = findZipIdInSubtitleObject(sub);
    if (!zipIdOrUrl) continue;

    // Check season match — reject entries from the wrong season
    const subSeason = typeof sub.season === 'number' ? sub.season : null;
    if (params.season != null && subSeason != null && subSeason !== params.season) {
      continue;
    }

    let score = 0;
    if (params.season != null && subSeason === params.season) score += 10;

    if (params.episode != null) {
      const epFrom = typeof sub.episode_from === 'number' ? sub.episode_from : null;
      const epEnd = typeof sub.episode_end === 'number' ? sub.episode_end : null;
      const ep = typeof sub.episode === 'number' ? sub.episode : null;

      if (epFrom === params.episode && epEnd === params.episode) {
        score += 3;
      } else if (ep === params.episode && (epFrom == null || epEnd == null)) {
        score += 2;
      } else if (epFrom != null && epEnd != null && epFrom <= params.episode && epEnd >= params.episode) {
        score += 1;
      }
    }

    candidates.push({ sub, zipIdOrUrl, score });
  }

  candidates.sort((a, b) => b.score - a.score);

  for (const { sub, zipIdOrUrl } of candidates) {
    const { url: dlUrl, providerRef } = toDownloadUrl(zipIdOrUrl);
    return SubdlDownloadSchema.parse({
      url: dlUrl,
      lang: params.lang,
      providerRef,
      meta: {
        provider: 'subdl',
        apiQuery: {
          imdb_id: params.imdbTt,
          season: params.season,
          episode: params.episode,
          type,
          languages: normalizeLang(params.lang),
        },
        subdl: sub,
      },
    });
  }

  return null;
}

/**
 * Match a ZIP entry filename to a specific episode number.
 * Looks for patterns like S01E07, s1e7, E07, .107. etc.
 */
function entryMatchesEpisode(entryName: string, episode: number, season?: number | null): boolean {
  const name = entryName.toLowerCase();
  const seMatch = name.match(/s(\d{1,2})e(\d{1,3})/i);
  if (seMatch) {
    const fileSeason = parseInt(seMatch[1], 10);
    const fileEpisode = parseInt(seMatch[2], 10);
    if (season != null) {
      return fileSeason === season && fileEpisode === episode;
    }
    return fileEpisode === episode;
  }
  const eMatch = name.match(/\be(\d{1,3})\b/i);
  if (eMatch) return parseInt(eMatch[1], 10) === episode;
  return false;
}

export async function downloadSubdlSubtitleText(
  downloadUrl: string,
  opts?: { episode?: number | null; season?: number | null }
): Promise<{ text: string; filename: string }> {
  const debug = getDebug();
  const targetEpisode = opts?.episode ?? null;
  const targetSeason = opts?.season ?? null;

  await rateLimit();

  const res = await fetch(downloadUrl, {
    headers: {
      'user-agent':
        process.env.SUBDL_USER_AGENT || process.env.OPENSUBTITLES_USER_AGENT || 'GlobalSubs/1.0',
      accept: '*/*',
    },
  });

  if (!res.ok) {
    throw new Error(`SubDL download failed: ${res.status}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const zip = new AdmZip(buf);
  const entries = zip.getEntries();

  const SUBTITLE_EXTS = ['.srt', '.vtt', '.ass', '.ssa'];
  const subtitleEntries = entries.filter(
    (e) => !e.isDirectory && SUBTITLE_EXTS.some((ext) => e.entryName.toLowerCase().endsWith(ext))
  );

  let entry: ReturnType<typeof zip.getEntries>[number] | undefined;

  // If we have a target episode, match by season+episode number
  if (targetEpisode != null && subtitleEntries.length > 1) {
    entry = subtitleEntries.find((e) => entryMatchesEpisode(e.entryName, targetEpisode, targetSeason));
    if (debug && entry) {
      console.log('[subdl] matched episode', {
        season: targetSeason,
        episode: targetEpisode,
        entry: entry.entryName,
        totalEntries: subtitleEntries.length,
      });
    }
  }

  // Fallback: pick first subtitle by extension priority
  if (!entry) {
    const pick = (ext: string) =>
      entries.find((e) => !e.isDirectory && e.entryName.toLowerCase().endsWith(ext));
    entry = pick('.srt') || pick('.vtt') || pick('.ass') || pick('.ssa') || entries.find((e) => !e.isDirectory);
  }

  if (!entry) {
    throw new Error('SubDL zip had no entries');
  }

  if (debug) console.log('[subdl] extracted', { entry: entry.entryName, size: entry.header.size });

  const text = entry.getData().toString('utf8');
  return { text, filename: entry.entryName };
}
