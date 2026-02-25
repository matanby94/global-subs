import AdmZip from 'adm-zip';
import { z } from 'zod';

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

  for (const v of Object.values(sub)) {
    if (typeof v === 'string' && v.trim()) candidates.push(v.trim());
  }

  for (const c of candidates) {
    if (/^https?:\/\//i.test(c) && /\.zip($|\?)/i.test(c)) return c;

    const m = c.match(/(\d+-\d+)(?:\.zip)?$/);
    if (m) return `${m[1]}.zip`;
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
  imdbTt: string;
  season: number | null;
  episode: number | null;
  lang: string;
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

  for (const item of subtitles) {
    const sub = item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
    if (!sub) continue;

    const zipIdOrUrl = findZipIdInSubtitleObject(sub);
    if (!zipIdOrUrl) continue;

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

export async function downloadSubdlSubtitleText(
  downloadUrl: string
): Promise<{ text: string; filename: string }> {
  const debug = getDebug();

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
  type ZipEntry = {
    isDirectory: boolean;
    entryName: string;
    header?: { size?: number };
    getData: () => Buffer;
  };
  const entries = zip.getEntries() as ZipEntry[];

  const pick = (ext: string) =>
    entries.find((e: ZipEntry) => !e.isDirectory && e.entryName.toLowerCase().endsWith(ext));

  const entry =
    pick('.srt') ||
    pick('.vtt') ||
    pick('.ass') ||
    pick('.ssa') ||
    entries.find((e: ZipEntry) => !e.isDirectory);
  if (!entry) {
    throw new Error('SubDL zip had no entries');
  }

  if (debug)
    console.log('[subdl] extracted', { entry: entry.entryName, size: entry.header?.size ?? null });

  const text = entry.getData().toString('utf8');
  const filename = entry.entryName.split('/').pop() || 'subtitle';
  return { text, filename };
}
