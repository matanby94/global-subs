import './env';
import { addonBuilder } from 'stremio-addon-sdk';
import http from 'node:http';
import qs from 'node:querystring';

const PORT = parseInt(process.env.ADDON_PORT || process.env.PORT || '3012', 10);
const HOST = process.env.ADDON_HOST || '0.0.0.0';

console.log('[addon] logging config', {
  logLevel: process.env.LOG_LEVEL || 'info',
  debugAddon: process.env.DEBUG_ADDON === '1',
});

const manifest = {
  id: 'com.globalsubs.addon',
  version: '1.0.0',
  name: 'GlobalSubs',
  description: 'AI-powered subtitle translations in 100+ languages',
  resources: ['subtitles'],
  types: ['movie', 'series'],
  catalogs: [],
  idPrefixes: ['tt'],
};

const builder = new addonBuilder(manifest);

builder.defineSubtitlesHandler(async (args: unknown) => {
  const a = args as unknown as {
    type: 'movie' | 'series';
    id: string;
    config?: Record<string, unknown>;
  };
  const { type, id } = a;
  console.log(`Subtitles request: ${type} ${id}`);

  const cfg = (a?.config || {}) as Record<string, unknown>;
  const addonToken = typeof cfg.addonToken === 'string' ? cfg.addonToken : undefined;
  const jwtToken = typeof cfg.token === 'string' ? cfg.token : undefined;
  const dstLang = typeof cfg.dstLang === 'string' ? cfg.dstLang : process.env.ADDON_DST_LANG;

  if (!addonToken && (!jwtToken || !dstLang)) {
    console.warn('Addon not configured: missing addon token (or JWT+dstLang)');
    return { subtitles: [] };
  }

  const apiUrl = process.env.API_URL || 'http://localhost:3011';

  const debug =
    (process.env.LOG_LEVEL || '').toLowerCase() === 'debug' || process.env.DEBUG_ADDON === '1';
  const redact = (value: string | undefined): string | undefined => {
    if (!value) return value;
    if (value.length <= 8) return '[REDACTED]';
    return `${value.slice(0, 3)}…${value.slice(-3)}`;
  };

  if (debug) {
    console.log('[addon] subtitles handler config', {
      type,
      id,
      apiUrl,
      dstLang: addonToken ? undefined : dstLang,
      addonToken: redact(addonToken),
      jwtToken: jwtToken ? '[REDACTED]' : undefined,
    });
  }

  // Placeholder VTT shown while translation is in progress.
  // Uses a data URI so no hosting is needed — Stremio loads it inline.
  const PLACEHOLDER_VTT = [
    'WEBVTT',
    '',
    '1',
    '00:00:01.000 --> 00:01:00.000',
    '🌐 GlobalSubs is translating your subtitles…',
    'Please wait a few minutes and reopen this episode.',
    '',
    '2',
    '00:01:00.000 --> 00:05:00.000',
    '🌐 Translation in progress…',
    'Close and reopen to check if subtitles are ready.',
    '',
    '3',
    '00:05:00.000 --> 99:59:59.000',
    '🌐 Subtitles should be ready by now.',
    'Close and reopen this episode to load them.',
  ].join('\n');
  const PLACEHOLDER_URL = `data:text/vtt;charset=utf-8,${encodeURIComponent(PLACEHOLDER_VTT)}`;

  try {
    const ensureBody = {
      type,
      stremioId: id,
      ...(addonToken ? {} : { dstLang }),
    };

    const headers = {
      ...(addonToken ? { 'x-addon-token': addonToken } : { authorization: `Bearer ${jwtToken}` }),
      'content-type': 'application/json',
      accept: 'application/json',
    };

    if (debug) console.log('[addon] POST /api/addon/ensure', ensureBody);

    const res = await fetch(`${apiUrl}/api/addon/ensure`, {
      method: 'POST',
      headers,
      body: JSON.stringify(ensureBody),
    });

    if (debug) {
      console.log('[addon] ensure response', {
        status: res.status,
        ok: res.ok,
      });
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (debug) {
        console.log(
          '[addon] ensure non-200 body',
          text.length > 2000 ? `${text.slice(0, 2000)}…(truncated)` : text
        );
      }
      console.error('Addon ensure failed:', res.status);
      return { subtitles: [] };
    }

    const json: unknown = await res.json();
    if (debug) {
      let preview: string;
      try {
        const s = JSON.stringify(json);
        preview = s.length > 2000 ? `${s.slice(0, 2000)}…(truncated)` : s;
      } catch {
        preview = '[unserializable json]';
      }
      console.log('[addon] ensure json', preview);
    }

    const status =
      json &&
      typeof json === 'object' &&
      typeof (json as Record<string, unknown>).status === 'string'
        ? ((json as Record<string, unknown>).status as string)
        : 'unknown';

    const subtitlesRaw =
      json && typeof json === 'object' && Array.isArray((json as { subtitles?: unknown }).subtitles)
        ? ((json as { subtitles?: unknown }).subtitles as unknown[])
        : [];

    const subtitles = subtitlesRaw
      .map((s: unknown) => {
        const o = s && typeof s === 'object' ? (s as Record<string, unknown>) : null;
        const url = typeof o?.url === 'string' ? o.url : null;
        const lang = typeof o?.lang === 'string' ? o.lang : null;
        const label = typeof o?.label === 'string' ? o.label : null;
        const id = typeof o?.id === 'string' ? o.id : url;
        if (!url || !lang) return null;
        return label ? { id: id || url, url, lang, label } : { id: id || url, url, lang };
      })
      .filter((x): x is { id: string; url: string; lang: string; label?: string } => Boolean(x));

    // If translation is in-flight, return a placeholder subtitle immediately
    // so the user knows their subtitles are being prepared.
    if (status === 'processing' && subtitles.length === 0) {
      console.log(`[addon] Translation in-flight for ${id}, returning placeholder subtitle`);
      return {
        subtitles: [
          {
            id: 'globalsubs-processing',
            url: PLACEHOLDER_URL,
            lang: 'heb',
            label: '🌐 Translating… (reload in a few min)',
          },
        ],
        // Tell Stremio not to cache this response so the real
        // subtitles appear when the user re-enters the stream.
        cacheMaxAge: 0,
      } as {
        subtitles: { id: string; url: string; lang: string; label?: string }[];
        cacheMaxAge?: number;
      };
    }

    return { subtitles };
  } catch (err: unknown) {
    console.error('Error calling API ensure:', err);
    return { subtitles: [] };
  }
});

const addonInterface = builder.getInterface();

function sendJson(res: http.ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  // If the response includes cacheMaxAge: 0 (e.g. placeholder subtitles),
  // set Cache-Control headers so Stremio doesn't cache stale responses.
  if (body && typeof body === 'object' && (body as Record<string, unknown>).cacheMaxAge === 0) {
    res.setHeader('cache-control', 'no-cache, no-store, must-revalidate');
  }
  res.end(JSON.stringify(body));
}

function sendManifest(res: http.ServerResponse) {
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(addonInterface.manifest));
}

function withCors(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type, authorization, x-addon-token');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

function extractPrefixConfig(pathname: string): {
  restPath: string;
  config: Record<string, unknown>;
} {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] === 'user' && parts.length >= 4) {
    const userId = parts[1];
    const addonToken = parts[2];
    const rest = '/' + parts.slice(3).join('/');
    return { restPath: rest, config: { addonToken, userId } };
  }
  // Backwards-compatible: /:token/... (opaque token) or /:b64config/... (JSON config)
  if (parts.length >= 2 && (parts[1] === 'manifest.json' || parts[1] === 'subtitles')) {
    const first = parts[0];
    const rest = '/' + parts.slice(1).join('/');
    // We do NOT JSON-parse opaque tokens here.
    // If caller wants JSON config, they can still pass base64url JSON and the client can decode elsewhere.
    return { restPath: rest, config: { addonToken: first } };
  }
  return { restPath: pathname, config: {} };
}

async function handleAddonRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  if (withCors(req, res)) return;

  const base = `http://${req.headers.host || '127.0.0.1'}`;
  const url = new URL(req.url || '/', base);

  const { restPath, config } = extractPrefixConfig(url.pathname);
  const parts = restPath.split('/').filter(Boolean);

  if (restPath === '/manifest.json') {
    return sendManifest(res);
  }

  if (parts[0] === 'subtitles') {
    // /subtitles/:type/:id.json
    // /subtitles/:type/:id/:extra.json
    const type = parts[1];
    if (!type) return sendJson(res, 404, { error: 'not found' });

    if (parts.length === 3 && parts[2].endsWith('.json')) {
      let id = parts[2].slice(0, -5);
      try {
        id = decodeURIComponent(id);
      } catch {
        /* keep original */
      }
      try {
        const resp = await addonInterface.get('subtitles', type, id, {}, config);
        // Disable Stremio's internal caching for subtitle responses so
        // placeholder results are replaced by real subtitles on reload.
        res.setHeader('cache-control', 'no-cache, no-store, must-revalidate');
        return sendJson(res, 200, resp);
      } catch (err: unknown) {
        console.error(err);
        // Be defensive: Stremio clients can behave poorly on non-200 addon responses.
        // Always return a valid subtitles payload.
        return sendJson(res, 200, { subtitles: [] });
      }
    }

    if (parts.length === 4 && parts[3].endsWith('.json')) {
      let id = parts[2];
      try {
        id = decodeURIComponent(id);
      } catch {
        /* keep original */
      }
      const extraRaw = parts[3].slice(0, -5);
      const extra = extraRaw ? (qs.parse(extraRaw) as qs.ParsedUrlQuery) : {};
      try {
        const resp = await addonInterface.get('subtitles', type, id, extra, config);
        res.setHeader('cache-control', 'no-cache, no-store, must-revalidate');
        return sendJson(res, 200, resp);
      } catch (err: unknown) {
        console.error(err);
        // Be defensive: Stremio clients can behave poorly on non-200 addon responses.
        // Always return a valid subtitles payload.
        return sendJson(res, 200, { subtitles: [] });
      }
    }
  }

  return sendJson(res, 404, { error: 'not found' });
}

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '') {
    const host = req.headers.host || `127.0.0.1:${PORT}`;
    const installUrl = `stremio://${host}/manifest.json`;
    res.statusCode = 200;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(
      `<!doctype html><html><head><meta charset="utf-8" /><title>GlobalSubs - Stremio Addon</title></head><body style="font-family: system-ui; padding: 24px;">
        <h1>GlobalSubs</h1>
        <p><a href="${installUrl}">Install in Stremio</a></p>
        <p>Manifest: <a href="/manifest.json">/manifest.json</a></p>
      </body></html>`
    );
    return;
  }

  handleAddonRequest(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`🎬 GlobalSubs addon running on http://${HOST}:${PORT}/manifest.json`);
  console.log(`   For Stremio Desktop install: http://127.0.0.1:${PORT}/manifest.json`);
});

// Graceful shutdown
async function shutdown() {
  console.log('Shutting down addon...');
  server.close();
  const { db } = await import('./db');
  await db.end();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
