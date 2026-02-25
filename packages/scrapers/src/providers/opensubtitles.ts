import { z } from 'zod';

export const OpenSubtitlesDownloadSchema = z.object({
  url: z.string().url(),
  lang: z.string().min(2),
  providerRef: z.string().optional(),
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
  const xmlRpcUserAgent =
    process.env.OPENSUBTITLES_XMLRPC_USERAGENT || process.env.OPENSUBTITLES_USER_AGENT;
  if (xmlRpcUserAgent) return { configured: true, mode: 'xmlrpc' };

  const apiKey = process.env.OPENSUBTITLES_API_KEY;
  if (apiKey) return { configured: true, mode: 'rest' };

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

  // 1) Prefer opensubtitles-api (XML-RPC) if configured.
  const xmlRpcUserAgent =
    process.env.OPENSUBTITLES_XMLRPC_USERAGENT || process.env.OPENSUBTITLES_USER_AGENT;

  if (xmlRpcUserAgent) {
    try {
      if (debug) {
        // Do not log credentials; only the lookup parameters.
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
      if (debug) console.log('[opensubtitles][xmlrpc] failed; falling back to REST');
      // Best-effort fallthrough
    }
  }

  // 2) REST v1 fallback
  const apiKey = process.env.OPENSUBTITLES_API_KEY;
  if (!apiKey) {
    if (debug) console.log('[opensubtitles][rest] disabled (missing OPENSUBTITLES_API_KEY)');
    return null;
  }

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
    return null;
  }

  const searchJson: unknown = await searchRes.json();
  const data =
    searchJson && typeof searchJson === 'object'
      ? (searchJson as { data?: unknown }).data
      : undefined;

  const candidates: unknown[] = Array.isArray(data) ? data : [];
  if (candidates.length === 0) {
    if (debug) console.log('[opensubtitles][rest] no candidates');
    return null;
  }

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
    const link = downloadObj.link || downloadObj.url;
    if (typeof link === 'string' && link.startsWith('http')) {
      if (debug) console.log('[opensubtitles][rest] download link', { lang, fileId });
      return OpenSubtitlesDownloadSchema.parse({
        url: link,
        lang: typeof lang === 'string' ? lang : params.languages.split(',')[0],
        providerRef: String(fileId),
      });
    }
  }

  return null;
}
