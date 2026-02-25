import { z } from 'zod';
import { gunzipSync } from 'node:zlib';
import AdmZip from 'adm-zip';

export const OpenSubtitlesDownloadSchema = z.object({
  url: z.string().url(),
  lang: z.string().min(2),
  providerRef: z.string().optional(),
  quota: z
    .object({
      remaining: z.number().int().optional(),
      resetTimeUtc: z.string().optional(),
      message: z.string().optional(),
    })
    .optional(),
});

export type OpenSubtitlesDownload = z.infer<typeof OpenSubtitlesDownloadSchema>;

function getDebug(): boolean {
  return (
    (process.env.LOG_LEVEL || '').toLowerCase() === 'debug' ||
    process.env.DEBUG_OPENSUBTITLES === '1'
  );
}

function toIso639_2(iso639_1: string): string | null {
  const map: Record<string, string> = {
    en: 'eng',
    es: 'spa',
    fr: 'fre',
    de: 'ger',
    it: 'ita',
    pt: 'por',
    ru: 'rus',
    zh: 'chi',
    ja: 'jpn',
    ko: 'kor',
    ar: 'ara',
    he: 'heb',
    hi: 'hin',
    nl: 'dut',
    sv: 'swe',
    no: 'nor',
    da: 'dan',
    fi: 'fin',
    pl: 'pol',
    tr: 'tur',
    cs: 'cze',
    el: 'gre',
    ro: 'rum',
    hu: 'hun',
    uk: 'ukr',
  };
  return map[iso639_1] || null;
}

export function getOpenSubtitlesConfigStatus():
  | { configured: true; mode: 'xmlrpc' | 'rest' }
  | { configured: false; mode: 'none'; reason: string } {
  const apiKey = process.env.OPENSUBTITLES_API_KEY;
  if (apiKey) return { configured: true, mode: 'rest' };

  const xmlRpcUserAgent =
    process.env.OPENSUBTITLES_XMLRPC_USERAGENT || process.env.OPENSUBTITLES_USER_AGENT;
  if (xmlRpcUserAgent) return { configured: true, mode: 'xmlrpc' };

  return {
    configured: false,
    mode: 'none',
    reason:
      'OpenSubtitles not configured. Set OPENSUBTITLES_API_KEY (REST) or OPENSUBTITLES_XMLRPC_USERAGENT/OPENSUBTITLES_USER_AGENT (XML-RPC).',
  };
}

export async function findOpenSubtitlesDownload(params: {
  imdbNumeric: number;
  season: number | null;
  episode: number | null;
  languages: string; // ISO-639-1, comma separated
}): Promise<OpenSubtitlesDownload | null> {
  const debug = getDebug();

  const apiKey = process.env.OPENSUBTITLES_API_KEY;

  if (apiKey) {
    const baseUrl = process.env.OPENSUBTITLES_BASE_URL || 'https://api.opensubtitles.com/api/v1';

    const url = new URL(`${baseUrl.replace(/\/$/, '')}/subtitles`);
    url.searchParams.set('imdb_id', String(params.imdbNumeric));
    url.searchParams.set('languages', params.languages);
    if (params.season != null) url.searchParams.set('season_number', String(params.season));
    if (params.episode != null) url.searchParams.set('episode_number', String(params.episode));
    url.searchParams.set('order_by', 'download_count');

    const searchRes = await fetch(url.toString(), {
      headers: {
        'Api-Key': apiKey,
        'User-Agent': process.env.OPENSUBTITLES_USER_AGENT || 'GlobalSubs/1.0',
        accept: 'application/json',
      },
    });

    if (!searchRes.ok) {
      if (debug) console.log('[opensubtitles][rest] search failed', { status: searchRes.status });
    } else {
      const searchJson: unknown = await searchRes.json();
      const data =
        searchJson && typeof searchJson === 'object'
          ? (searchJson as { data?: unknown }).data
          : undefined;

      const candidates: unknown[] = Array.isArray(data) ? data : [];
      if (candidates.length === 0) {
        if (debug) console.log('[opensubtitles][rest] no candidates');
      } else {
        for (const item of candidates) {
          const itemObj = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
          const attributes =
            itemObj.attributes && typeof itemObj.attributes === 'object'
              ? (itemObj.attributes as Record<string, unknown>)
              : {};
          const featureDetails =
            attributes.feature_details && typeof attributes.feature_details === 'object'
              ? (attributes.feature_details as Record<string, unknown>)
              : {};

          const lang =
            (typeof attributes.language === 'string' && attributes.language) ||
            (typeof featureDetails.language === 'string' && featureDetails.language) ||
            (typeof attributes.lang === 'string' && attributes.lang) ||
            params.languages.split(',')[0];

          const files = attributes.files;
          const fileId =
            (Array.isArray(files) &&
              files[0] &&
              typeof files[0] === 'object' &&
              typeof (files[0] as Record<string, unknown>).file_id !== 'undefined' &&
              (files[0] as Record<string, unknown>).file_id) ||
            attributes.file_id ||
            itemObj.file_id ||
            null;

          if (!fileId) continue;

          const downloadRes = await fetch(`${baseUrl.replace(/\/$/, '')}/download`, {
            method: 'POST',
            headers: {
              'Api-Key': apiKey,
              'User-Agent': process.env.OPENSUBTITLES_USER_AGENT || 'GlobalSubs/1.0',
              'content-type': 'application/json',
              accept: 'application/json',
            },
            body: JSON.stringify({ file_id: fileId }),
          });

          if (!downloadRes.ok) continue;
          const downloadJson: unknown = await downloadRes.json();
          const downloadObj =
            downloadJson && typeof downloadJson === 'object'
              ? (downloadJson as Record<string, unknown>)
              : {};

          const remainingRaw = downloadObj.remaining;
          const remaining = typeof remainingRaw === 'number' ? remainingRaw : undefined;
          const resetTimeUtc =
            typeof downloadObj.reset_time_utc === 'string' ? downloadObj.reset_time_utc : undefined;
          const message = typeof downloadObj.message === 'string' ? downloadObj.message : undefined;

          // OpenSubtitles returns a temporary download link even when quota is exhausted.
          // In that case the link often serves a VIP placeholder instead of the real subtitle.
          if (typeof remaining === 'number' && remaining <= 0) {
            throw new Error(
              `OpenSubtitles quota exhausted${resetTimeUtc ? ` (resets at ${resetTimeUtc})` : ''}${
                message ? `: ${message}` : ''
              }`
            );
          }

          const link = downloadObj.link || downloadObj.url;
          if (typeof link === 'string' && link.startsWith('http')) {
            if (debug) console.log('[opensubtitles][rest] download link', { lang, fileId });
            return OpenSubtitlesDownloadSchema.parse({
              url: link,
              lang: typeof lang === 'string' ? lang : params.languages.split(',')[0],
              providerRef: String(fileId),
              quota: {
                remaining,
                resetTimeUtc,
                message,
              },
            });
          }
        }
      }
    }
  } else {
    if (debug) console.log('[opensubtitles][rest] disabled (missing OPENSUBTITLES_API_KEY)');
  }

  const xmlRpcUserAgent =
    process.env.OPENSUBTITLES_XMLRPC_USERAGENT || process.env.OPENSUBTITLES_USER_AGENT;

  if (xmlRpcUserAgent) {
    try {
      if (debug) {
        console.log('[opensubtitles][xmlrpc] search', {
          imdbNumeric: params.imdbNumeric,
          season: params.season,
          episode: params.episode,
          languages: params.languages,
        });
      }

      const lang2 = params.languages.split(',')[0].trim().toLowerCase();
      const sublanguageid = toIso639_2(lang2);
      if (sublanguageid) {
        type OpenSubtitlesClient = {
          search: (params: Record<string, string | boolean>) => Promise<unknown>;
        };
        type OpenSubtitlesCtor = new (opts: Record<string, unknown>) => OpenSubtitlesClient;

        const mod = (await import('opensubtitles-api')) as unknown as { default?: unknown };
        const OS = (mod.default ?? mod) as unknown as OpenSubtitlesCtor;

        const OpenSubtitles = new OS({
          useragent: xmlRpcUserAgent,
          username: process.env.OPENSUBTITLES_USERNAME,
          password: process.env.OPENSUBTITLES_PASSWORD,
          ssl: true,
        });

        const searchParams: Record<string, string | boolean> = {
          imdbid: String(params.imdbNumeric),
          sublanguageid,
          gzip: false,
        };
        if (params.season != null) searchParams.season = String(params.season);
        if (params.episode != null) searchParams.episode = String(params.episode);

        const subtitlesRaw = await OpenSubtitles.search(searchParams);
        const subtitlesObj =
          subtitlesRaw && typeof subtitlesRaw === 'object'
            ? (subtitlesRaw as Record<string, unknown>)
            : ({} as Record<string, unknown>);

        const best = subtitlesObj[lang2];
        const bestObj = best && typeof best === 'object' ? (best as Record<string, unknown>) : null;
        const url = bestObj?.url;
        if (typeof url === 'string' && url.startsWith('http')) {
          if (debug) console.log('[opensubtitles][xmlrpc] hit', { lang: lang2 });
          return OpenSubtitlesDownloadSchema.parse({ url, lang: lang2 });
        }
      }
    } catch {
      if (debug) console.log('[opensubtitles][xmlrpc] failed');
    }
  }

  return null;
}

export async function downloadOpenSubtitlesSubtitleText(
  downloadUrl: string
): Promise<{ text: string }> {
  const res = await fetch(downloadUrl, {
    headers: {
      accept: '*/*',
      'user-agent': process.env.OPENSUBTITLES_USER_AGENT || 'GlobalSubs/1.0',
    },
  });
  if (!res.ok) {
    throw new Error(`OpenSubtitles download failed: ${res.status}`);
  }

  const contentType = res.headers.get('content-type') || '';
  const raw = Buffer.from(await res.arrayBuffer());

  const payload = extractSubtitlePayload(raw);
  const text = decodeSubtitleBytes(payload, contentType);
  const trimmed = text.trim().toLowerCase();

  if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<html') || trimmed.includes('<head')) {
    throw new Error('OpenSubtitles returned HTML instead of subtitle content');
  }

  if (
    trimmed.includes('osdb.link/vip') ||
    (trimmed.includes('become opensubtitles') && trimmed.includes('vip'))
  ) {
    throw new Error('OpenSubtitles returned VIP placeholder subtitle');
  }

  return { text };
}

function extractSubtitlePayload(buf: Buffer): Buffer {
  // gzip
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    return gunzipSync(buf);
  }

  // zip
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b) {
    const zip = new AdmZip(buf);
    type ZipEntry = {
      entryName: string;
      isDirectory: boolean;
      getData: () => Buffer;
    };

    const entries = zip.getEntries() as unknown as ZipEntry[];

    const byExt = (name: string) => name.toLowerCase().split('.').pop() || '';
    const preferredExt = new Set(['vtt', 'srt', 'ass', 'ssa', 'sub', 'txt']);

    const best =
      entries.find((e: ZipEntry) => {
        const name = e.entryName || '';
        if (e.isDirectory) return false;
        const ext = byExt(name);
        return preferredExt.has(ext);
      }) || entries.find((e: ZipEntry) => !e.isDirectory);

    if (!best) {
      throw new Error('OpenSubtitles zip contained no files');
    }

    return best.getData();
  }

  return buf;
}

function normalizeEncodingLabel(label: string): string {
  const raw = label.trim().toLowerCase().replace(/^"|"$/g, '');
  if (raw === 'utf8') return 'utf-8';
  if (raw === 'latin1') return 'iso-8859-1';
  if (raw === 'cp1255' || raw === 'windows1255') return 'windows-1255';
  if (raw === 'cp1252' || raw === 'windows1252') return 'windows-1252';
  return raw;
}

function decodeWith(encoding: string, bytes: Buffer): string {
  const dec = new TextDecoder(encoding, { fatal: false });
  return dec.decode(bytes);
}

function scoreDecodedText(text: string): number {
  // Prefer real Hebrew letters over mojibake markers/replacements.
  let hebrew = 0;
  let replacements = 0;
  let mojibakeMarker = 0;

  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 0x0590 && code <= 0x05ff) hebrew++;
    if (code === 0xfffd) replacements++;
    if (ch === '×') mojibakeMarker++;
  }

  return hebrew * 5 - replacements * 10 - mojibakeMarker * 2;
}

function decodeSubtitleBytes(bytes: Buffer, contentType: string): string {
  const charsetMatch = contentType.match(/charset\s*=\s*([^;]+)/i);
  const headerCharset = charsetMatch ? normalizeEncodingLabel(charsetMatch[1]) : null;

  const candidates: string[] = [];
  if (headerCharset) candidates.push(headerCharset);
  // Heuristic order: UTF-8 first, then common legacy encodings.
  candidates.push('utf-8', 'windows-1255', 'windows-1252', 'iso-8859-1');

  let bestText: string | null = null;
  let bestScore = -Infinity;

  for (const enc of candidates) {
    try {
      const decoded = decodeWith(enc, bytes);
      const score = scoreDecodedText(decoded);
      if (score > bestScore) {
        bestScore = score;
        bestText = decoded;
      }
    } catch {
      // Ignore unsupported encodings
    }
  }

  if (!bestText) {
    // Last resort: treat as UTF-8.
    return bytes.toString('utf8');
  }

  return bestText;
}
