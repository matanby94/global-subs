import { addonBuilder } from 'stremio-addon-sdk';
import http from 'node:http';
import qs from 'node:querystring';

const PORT = parseInt(process.env.ADDON_PORT || process.env.PORT || '3012', 10);
const HOST = process.env.ADDON_HOST || '0.0.0.0';

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

builder.defineSubtitlesHandler(async (args: any) => {
  const { type, id } = args as { type: 'movie' | 'series'; id: string };
  console.log(`Subtitles request: ${type} ${id}`);

  const cfg = (args?.config || {}) as any;
  const addonToken = typeof cfg.addonToken === 'string' ? cfg.addonToken : undefined;
  const jwtToken = typeof cfg.token === 'string' ? cfg.token : undefined;
  const dstLang = typeof cfg.dstLang === 'string' ? cfg.dstLang : process.env.ADDON_DST_LANG;

  if (!addonToken && (!jwtToken || !dstLang)) {
    console.warn('Addon not configured: missing addon token (or JWT+dstLang)');
    return { subtitles: [] };
  }

  const apiUrl = process.env.API_URL || 'http://localhost:3011';

  try {
    const res = await fetch(`${apiUrl}/api/addon/ensure`, {
      method: 'POST',
      headers: {
        ...(addonToken ? { 'x-addon-token': addonToken } : { authorization: `Bearer ${jwtToken}` }),
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        type,
        stremioId: id,
        ...(addonToken ? {} : { dstLang }),
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('Addon ensure failed:', res.status, text);
      return { subtitles: [] };
    }

    const json: any = await res.json();
    const subtitles = Array.isArray(json?.subtitles)
      ? json.subtitles.map((s: any) => ({ id: s.id || s.url, url: s.url, lang: s.lang }))
      : [];

    return { subtitles };
  } catch (err) {
    console.error('Error calling API ensure:', err);
    return { subtitles: [] };
  }
});

const addonInterface = builder.getInterface();

function sendJson(res: http.ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
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

function extractPrefixConfig(pathname: string): { restPath: string; config: any } {
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
      const id = parts[2].slice(0, -5);
      try {
        const resp = await addonInterface.get('subtitles', type, id, {}, config);
        return sendJson(res, 200, resp);
      } catch (err: any) {
        console.error(err);
        return sendJson(res, 500, { err: 'handler error' });
      }
    }

    if (parts.length === 4 && parts[3].endsWith('.json')) {
      const id = parts[2];
      const extraRaw = parts[3].slice(0, -5);
      const extra = extraRaw ? (qs.parse(extraRaw) as any) : {};
      try {
        const resp = await addonInterface.get('subtitles', type, id, extra, config);
        return sendJson(res, 200, resp);
      } catch (err: any) {
        console.error(err);
        return sendJson(res, 500, { err: 'handler error' });
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
