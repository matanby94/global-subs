import AdmZip from 'adm-zip';
import { z } from 'zod';
import type Redis from 'ioredis';
import { acquireProviderSlot } from '@stremio-ai-subs/shared';

import { type BaselineDownloadCandidate } from './types';

/** Shared Redis connection — set from scrapers entrypoint. */
let redis: Redis | null = null;
export function setMovieSubtitlesRedis(r: Redis) {
  redis = r;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDebug(): boolean {
  return (
    (process.env.LOG_LEVEL || '').toLowerCase() === 'debug' ||
    process.env.DEBUG_MOVIESUBTITLES === '1'
  );
}

function getUserAgent(): string {
  return (
    process.env.MOVIESUBTITLES_USER_AGENT ||
    process.env.OPENSUBTITLES_USER_AGENT ||
    'GlobalSubs/1.0'
  );
}

let lastRequestAt = 0;
async function rateLimit() {
  // Prefer Redis-backed rate limiter for cross-process safety
  if (redis) {
    const result = await acquireProviderSlot(redis, 'moviesubtitles');
    if (!result.allowed) {
      await sleep(result.retryAfterMs);
    }
    return;
  }
  // Fallback: in-process limiter
  const minIntervalMs = Math.max(
    0,
    parseInt(process.env.MOVIESUBTITLES_MIN_INTERVAL_MS || '1200', 10)
  );
  const now = Date.now();
  const wait = Math.max(0, lastRequestAt + minIntervalMs - now);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

async function fetchTextWithRetries(url: string, opts: { attempts: number }) {
  const debug = getDebug();

  let lastErr: unknown;
  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    try {
      await rateLimit();
      const res = await fetch(url, {
        headers: {
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'user-agent': getUserAgent(),
        },
        redirect: 'follow',
      });

      if (res.status === 429 || res.status >= 500) {
        const retryAfter = res.headers.get('retry-after');
        const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 0;
        const backoffMs = Math.min(30_000, 500 * 2 ** (attempt - 1));
        const waitMs = Math.max(retryAfterMs, backoffMs);
        if (debug)
          console.log('[moviesubtitles] retryable response', {
            status: res.status,
            attempt,
            waitMs,
            url,
          });
        await sleep(waitMs);
        continue;
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Moviesubtitles HTTP ${res.status}: ${body.slice(0, 200)}`);
      }

      return await res.text();
    } catch (err) {
      lastErr = err;
      const backoffMs = Math.min(30_000, 500 * 2 ** (attempt - 1));
      if (debug)
        console.log('[moviesubtitles] fetch failed', {
          attempt,
          backoffMs,
          error: err instanceof Error ? err.message : String(err),
        });
      await sleep(backoffMs);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('Moviesubtitles request failed');
}

async function fetchBinaryWithRetries(url: string, opts: { attempts: number }) {
  const debug = getDebug();

  let lastErr: unknown;
  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    try {
      await rateLimit();
      const res = await fetch(url, {
        headers: {
          accept: '*/*',
          'user-agent': getUserAgent(),
        },
        redirect: 'follow',
      });

      if (res.status === 429 || res.status >= 500) {
        const retryAfter = res.headers.get('retry-after');
        const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 0;
        const backoffMs = Math.min(30_000, 500 * 2 ** (attempt - 1));
        const waitMs = Math.max(retryAfterMs, backoffMs);
        if (debug)
          console.log('[moviesubtitles] retryable download', {
            status: res.status,
            attempt,
            waitMs,
            url,
          });
        await sleep(waitMs);
        continue;
      }

      if (!res.ok) {
        throw new Error(`Moviesubtitles download failed: ${res.status}`);
      }

      const buf = Buffer.from(await res.arrayBuffer());
      return {
        buf,
        finalUrl: res.url,
        contentType: res.headers.get('content-type') || '',
        contentDisposition: res.headers.get('content-disposition') || '',
      };
    } catch (err) {
      lastErr = err;
      const backoffMs = Math.min(30_000, 500 * 2 ** (attempt - 1));
      if (debug)
        console.log('[moviesubtitles] download failed', {
          attempt,
          backoffMs,
          error: err instanceof Error ? err.message : String(err),
        });
      await sleep(backoffMs);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('Moviesubtitles download failed');
}

function decodeHtml(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
}

function normalizeTitle(input: string): string {
  return input
    .toLowerCase()
    .replace(/\(\d{4}\)/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const cinemetaSchema = z
  .object({
    meta: z
      .object({
        name: z.string(),
        year: z.union([z.number(), z.string()]).optional(),
        releaseInfo: z.string().optional(),
      })
      .passthrough(),
  })
  .passthrough();

async function fetchMovieTitleYear(
  imdbTt: string
): Promise<{ title: string; year: number | null } | null> {
  const base = (process.env.CINEMETA_BASE_URL || 'https://v3-cinemeta.strem.io').replace(/\/$/, '');
  const url = `${base}/meta/movie/${encodeURIComponent(imdbTt)}.json`;

  await rateLimit();
  const res = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': getUserAgent() },
  });
  if (!res.ok) return null;

  const raw = (await res.json().catch(() => null)) as unknown;
  const parsed = cinemetaSchema.safeParse(raw);
  if (!parsed.success) return null;

  const title = parsed.data.meta.name.trim();
  let year: number | null = null;

  const y = parsed.data.meta.year;
  if (typeof y === 'number' && Number.isFinite(y)) year = y;
  if (year == null && typeof y === 'string') {
    const m = y.match(/\b(19|20)\d{2}\b/);
    if (m) year = parseInt(m[0], 10);
  }

  if (year == null && parsed.data.meta.releaseInfo) {
    const m = parsed.data.meta.releaseInfo.match(/\b(19|20)\d{2}\b/);
    if (m) year = parseInt(m[0], 10);
  }

  return { title, year };
}

const langSectionName: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  ru: 'Russian',
  ar: 'Arabic',
  tr: 'Turkish',
  pl: 'Polish',
  hu: 'Hungarian',
  el: 'Greek',
  gr: 'Greek',
  uk: 'Ukrainian',
  pt: 'Portugese(br)',
  br: 'Portugese(br)',
};

function extractMovieCandidates(
  html: string
): Array<{ movieId: string; label: string; year: number | null }> {
  const out: Array<{ movieId: string; label: string; year: number | null }> = [];
  const re = /<a[^>]+href="(?:\/)?movie-(\d+)\.html"[^>]*>([^<]+)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) != null) {
    const movieId = m[1];
    const label = decodeHtml(m[2]);
    const ym = label.match(/\((\d{4})\)/);
    const year = ym ? parseInt(ym[1], 10) : null;
    out.push({ movieId, label, year });
  }
  return out;
}

function chooseBestMovieId(
  candidates: Array<{ movieId: string; label: string; year: number | null }>,
  target: { title: string; year: number | null }
): { movieId: string; label: string; year: number | null } | null {
  if (candidates.length === 0) return null;

  const targetNorm = normalizeTitle(target.title);
  const exact = candidates.filter((c) => normalizeTitle(c.label) === targetNorm);
  if (exact.length > 0) {
    if (target.year != null) {
      const exactYear = exact.find((c) => c.year === target.year);
      if (exactYear) return exactYear;
    }
    return exact[0];
  }

  if (target.year != null) {
    const yearMatch = candidates.find((c) => c.year === target.year);
    if (yearMatch) return yearMatch;
  }

  return candidates[0];
}

function extractSubtitleIdForLang(html: string, lang: string): string | null {
  const name = langSectionName[lang];
  if (!name) return null;

  const headerRe = new RegExp(`${escapeRegExp(name)}\\s*subtitles:`, 'i');
  const headerMatch = headerRe.exec(html);
  if (!headerMatch) return null;

  const start = headerMatch.index;
  const slice = html.slice(start, Math.min(html.length, start + 80_000));
  const sid = slice.match(/subtitle-(\d+)\.html/i);
  return sid ? sid[1] : null;
}

export function getMovieSubtitlesConfigStatus():
  | { configured: true }
  | { configured: false; reason: string } {
  const enabled = process.env.MOVIESUBTITLES_ENABLED === '1';
  if (!enabled)
    return { configured: false, reason: 'Moviesubtitles disabled. Set MOVIESUBTITLES_ENABLED=1.' };
  return { configured: true };
}

export async function findMovieSubtitlesDownload(_params: {
  imdbTt: string;
  season: number | null;
  episode: number | null;
  lang: string;
}): Promise<BaselineDownloadCandidate | null> {
  const cfg = getMovieSubtitlesConfigStatus();
  if (!cfg.configured) return null;

  const params = {
    imdbTt: _params.imdbTt,
    season: _params.season,
    episode: _params.episode,
    lang: _params.lang.toLowerCase(),
  };

  // Movie-focused source; should return null if season/episode is provided.
  if (params.season != null || params.episode != null) return null;

  const titleYear = await fetchMovieTitleYear(params.imdbTt);
  if (!titleYear) return null;

  const base = (process.env.MOVIESUBTITLES_BASE_URL || 'https://www.moviesubtitles.org').replace(
    /\/$/,
    ''
  );

  const queries = [
    titleYear.year != null ? `${titleYear.title} ${titleYear.year}` : null,
    titleYear.title,
  ].filter(Boolean) as string[];

  for (const q of queries) {
    const searchUrl = `${base}/search.php?q=${encodeURIComponent(q)}`;
    const searchHtml = await fetchTextWithRetries(searchUrl, { attempts: 4 });
    const candidates = extractMovieCandidates(searchHtml);
    const chosen = chooseBestMovieId(candidates, titleYear);
    if (!chosen) continue;

    const movieUrl = `${base}/movie-${chosen.movieId}.html`;
    const movieHtml = await fetchTextWithRetries(movieUrl, { attempts: 4 });

    const subtitleId = extractSubtitleIdForLang(movieHtml, params.lang);
    if (!subtitleId) continue;

    const downloadUrl = `${base}/download-${subtitleId}.html`;
    return {
      url: downloadUrl,
      lang: params.lang,
      providerRef: `moviesubtitles:subtitle:${subtitleId}`,
      meta: {
        provider: 'moviesubtitles',
        imdbTt: params.imdbTt,
        title: titleYear.title,
        year: titleYear.year,
        query: q,
        chosenMovie: chosen,
        movieUrl,
        subtitleId,
      },
    };
  }

  return null;
}

function parseFilenameFromContentDisposition(cd: string): string | null {
  const m = cd.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  const raw = m ? m[1] || m[2] : null;
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function downloadMovieSubtitlesSubtitleText(
  downloadUrl: string
): Promise<{ text: string; filename: string; finalUrl: string }> {
  const { buf, finalUrl, contentType, contentDisposition } = await fetchBinaryWithRetries(
    downloadUrl,
    { attempts: 4 }
  );

  // Occasionally, the site returns HTML error pages with 200 status.
  if (/text\/html/i.test(contentType) && buf.length < 200_000) {
    const snippet = buf.toString('utf8').slice(0, 300);
    throw new Error(`Moviesubtitles returned HTML instead of file: ${snippet}`);
  }

  const cdName = parseFilenameFromContentDisposition(contentDisposition);
  const urlName = (() => {
    try {
      const u = new URL(finalUrl);
      const parts = u.pathname.split('/');
      return parts[parts.length - 1] || null;
    } catch {
      return null;
    }
  })();

  const filename = cdName || urlName || 'subtitle.zip';

  if (
    filename.toLowerCase().endsWith('.zip') ||
    /^application\/(zip|x-zip-compressed)/i.test(contentType)
  ) {
    const zip = new AdmZip(buf);
    const entries = zip.getEntries();

    const pick = (ext: string) =>
      entries.find((e) => !e.isDirectory && e.entryName.toLowerCase().endsWith(ext));

    const entry =
      pick('.srt') ||
      pick('.vtt') ||
      pick('.ass') ||
      pick('.ssa') ||
      entries.find((e) => !e.isDirectory);

    if (!entry) throw new Error('Moviesubtitles zip had no entries');

    return { text: entry.getData().toString('utf8'), filename: entry.entryName, finalUrl };
  }

  return { text: buf.toString('utf8'), filename, finalUrl };
}
