import './env';
import { addonBuilder } from 'stremio-addon-sdk';
import http from 'node:http';
import qs from 'node:querystring';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { convertVttToSrt } from '@stremio-ai-subs/shared';
import { db } from './db';

const PORT = parseInt(process.env.ADDON_PORT || process.env.PORT || '3012', 10);
const HOST = process.env.ADDON_HOST || '0.0.0.0';
const ADDON_PUBLIC_URL = process.env.ADDON_PUBLIC_URL || `http://127.0.0.1:${PORT}`;

console.log('[addon] logging config', {
  logLevel: process.env.LOG_LEVEL || 'info',
  debugAddon: process.env.DEBUG_ADDON === '1',
});

// ──────────────────────────────────────────────
// S3 client for presigning artifact URLs
// ──────────────────────────────────────────────
const s3PresignClient = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
});
const S3_BUCKET = process.env.S3_BUCKET || 'GlobalSubs';

// ──────────────────────────────────────────────
// Placeholder VTT shown while translation is in progress.
// ──────────────────────────────────────────────
const PLACEHOLDER_SRT = [
  '1',
  '00:00:01,000 --> 00:01:00,000',
  '🌐 GlobalSubs is translating your subtitles…',
  'Please wait a few minutes and reopen this episode.',
  '',
  '2',
  '00:01:00,000 --> 00:05:00,000',
  '🌐 Translation in progress…',
  'Close and reopen to check if subtitles are ready.',
  '',
  '3',
  '00:05:00,000 --> 99:59:59,000',
  '🌐 Subtitles should be ready by now.',
  'Close and reopen this episode to load them.',
].join('\n');

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

// Stremio addon protocol cache directives — prevent stremio-server from
// caching subtitle responses so "translating" placeholders get replaced by
// real subtitles on the next video open.
const NO_CACHE = { cacheMaxAge: 0, staleRevalidate: 0, staleError: 0 } as const;

/**
 * Build a branded lang string for Stremio's subtitle picker.
 * Uses a non-ISO string so Stremio displays it verbatim instead of mapping
 * it to a built-in language name.
 */
function buildSubtitleLang(dstLang: string): string {
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'language' });
    const pretty = dn.of(dstLang);
    if (pretty && pretty.toLowerCase() !== dstLang.toLowerCase()) return `${pretty} - GlobalSubs`;
  } catch {
    /* fall through */
  }
  return `${dstLang.toUpperCase()} - GlobalSubs`;
}

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
    return { subtitles: [], ...NO_CACHE };
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

    // Fire-and-forget: call ensure to trigger the scrape/translate pipeline.
    // We don't wait for the result to decide what URL to return — we always
    // return a dynamic /sub URL that resolves at play-time.
    const res = await fetch(`${apiUrl}/api/addon/ensure`, {
      method: 'POST',
      headers,
      body: JSON.stringify(ensureBody),
    });

    if (debug) {
      console.log('[addon] ensure response', { status: res.status, ok: res.ok });
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
      return { subtitles: [], ...NO_CACHE };
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

    // Resolve the dstLang for label and dynamic URL.
    // Prefer what the API returned (authoritative for token-based auth),
    // then the locally-known dstLang from config.
    const responseDstLang =
      json &&
      typeof json === 'object' &&
      typeof (json as Record<string, unknown>).dstLang === 'string'
        ? ((json as Record<string, unknown>).dstLang as string)
        : null;
    const effectiveDstLang = responseDstLang || dstLang || 'he';

    // Build a dynamic VTT URL that the addon serves itself.
    // This URL always resolves to the latest content: if the artifact
    // exists, it 302-redirects to the S3 signed URL; if translation is
    // still processing, it returns the placeholder VTT inline.
    //
    // This bypasses stremio-core's in-memory subtitle response cache:
    // even if Stremio caches the subtitle picker entry, the VTT URL
    // is fetched fresh on each play.
    const encodedId = encodeURIComponent(id);
    const dynamicSrtUrl = `${ADDON_PUBLIC_URL}/${addonToken || 'jwt'}/sub/${effectiveDstLang}/${type}/${encodedId}.srt`;

    const brandedLang = buildSubtitleLang(effectiveDstLang);

    console.log(`[addon] Returning dynamic SRT URL for ${id}: ${dynamicSrtUrl}`);

    // Return two subtitle entries pointing to the same SRT URL:
    //   1. A real ISO 639-1 lang code — Chromecast/cast receivers require
    //      a recognised code to set up the text track correctly.
    //   2. A branded non-ISO string ("Hebrew - GlobalSubs") — displayed
    //      verbatim on desktop Stremio for branding.
    //
    // We serve SRT (not VTT) because Chromecast and other embedded
    // players handle SRT natively, matching what other Stremio addons do.
    return {
      subtitles: [
        {
          id: `globalsubs-${effectiveDstLang}-iso`,
          url: dynamicSrtUrl,
          lang: effectiveDstLang,
        },
        {
          id: `globalsubs-${effectiveDstLang}`,
          url: dynamicSrtUrl,
          lang: brandedLang,
        },
      ],
      ...NO_CACHE,
    };
  } catch (err: unknown) {
    console.error('Error calling API ensure:', err);
    return { subtitles: [], ...NO_CACHE };
  }
});

const addonInterface = builder.getInterface();

function sendJson(res: http.ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  // Set aggressive no-cache headers on all subtitle responses so
  // stremio-server never serves stale "translating" placeholders.
  if (body && typeof body === 'object' && (body as Record<string, unknown>).cacheMaxAge === 0) {
    res.setHeader(
      'cache-control',
      'no-cache, no-store, must-revalidate, max-age=0, stale-while-revalidate=0, stale-if-error=0'
    );
    res.setHeader('pragma', 'no-cache');
    res.setHeader('expires', '0');
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
  if (
    parts.length >= 2 &&
    (parts[1] === 'manifest.json' || parts[1] === 'subtitles' || parts[1] === 'sub')
  ) {
    const first = parts[0];
    const rest = '/' + parts.slice(1).join('/');
    // We do NOT JSON-parse opaque tokens here.
    // If caller wants JSON config, they can still pass base64url JSON and the client can decode elsewhere.
    return { restPath: rest, config: { addonToken: first } };
  }
  return { restPath: pathname, config: {} };
}

// ──────────────────────────────────────────────
// Dynamic /sub endpoint — serves SRT subtitle content on every request.
//
// URL format: /<token>/sub/<dstLang>/<type>/<stremioId>.srt
//
// Artifacts are stored as VTT in S3. This endpoint converts them to SRT
// on the fly because Chromecast and most Stremio clients handle SRT
// natively (matching what other Stremio addons serve).
//
// On each request we query the DB:
//   • Artifact exists  → fetch VTT from S3, convert to SRT, serve inline
//   • Still processing → serve placeholder SRT inline (no-cache)
// ──────────────────────────────────────────────
async function handleSubEndpoint(
  res: http.ServerResponse,
  dstLang: string,
  _type: string,
  stremioId: string
) {
  const srcRegistry = 'imdb';

  // Decode percent-encoded colons (Stremio series IDs arrive as tt1234567%3A1%3A1)
  let srcId = stremioId;
  try {
    srcId = decodeURIComponent(srcId);
  } catch {
    /* keep original */
  }

  try {
    const result = await db.query(
      `SELECT hash
       FROM artifacts
       WHERE src_registry = $1 AND src_id = $2 AND dst_lang = $3
       ORDER BY created_at DESC
       LIMIT 1`,
      [srcRegistry, srcId, dstLang]
    );

    if (result.rows.length > 0) {
      const hash = result.rows[0].hash as string;
      const s3Key = `artifacts/${hash}/${hash}.vtt`;

      try {
        const s3Response = await s3PresignClient.send(
          new GetObjectCommand({ Bucket: S3_BUCKET, Key: s3Key })
        );

        if (s3Response.Body) {
          // Read the full VTT body and convert to SRT
          const chunks: Buffer[] = [];
          const bodyStream = s3Response.Body as import('node:stream').Readable;
          for await (const chunk of bodyStream) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          const vttContent = Buffer.concat(chunks).toString('utf-8');
          const srtContent = convertVttToSrt(vttContent);

          console.log(`[addon/sub] Artifact found for ${srcId} (${dstLang}), serving as SRT`);
          res.writeHead(200, {
            'content-type': 'application/x-subrip; charset=utf-8',
            'cache-control': 'no-cache, no-store, must-revalidate, max-age=0',
            pragma: 'no-cache',
            expires: '0',
            'access-control-allow-origin': '*',
            'content-length': String(Buffer.byteLength(srtContent, 'utf-8')),
          });
          res.end(srtContent);
          return;
        }
      } catch (s3Err) {
        console.error(`[addon/sub] S3 fetch error for ${s3Key}:`, s3Err);
        // Fall through to placeholder
      }
    }

    // No artifact yet — serve placeholder SRT inline.
    console.log(`[addon/sub] No artifact for ${srcId} (${dstLang}), serving placeholder SRT`);
    res.writeHead(200, {
      'content-type': 'application/x-subrip; charset=utf-8',
      'cache-control': 'no-cache, no-store, must-revalidate, max-age=0',
      pragma: 'no-cache',
      expires: '0',
      'access-control-allow-origin': '*',
    });
    res.end(PLACEHOLDER_SRT);
  } catch (err) {
    console.error('[addon/sub] DB query error:', err);
    // On error, still serve the placeholder so Stremio doesn't break.
    res.writeHead(200, {
      'content-type': 'application/x-subrip; charset=utf-8',
      'cache-control': 'no-cache, no-store, must-revalidate',
      'access-control-allow-origin': '*',
    });
    res.end(PLACEHOLDER_SRT);
  }
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

  // ──────────────────────────────────────────────
  // /sub/:dstLang/:type/:stremioId.srt — dynamic SRT endpoint
  // (also accepts .vtt for backward compat)
  // ──────────────────────────────────────────────
  if (
    parts[0] === 'sub' &&
    parts.length === 4 &&
    (parts[3].endsWith('.srt') || parts[3].endsWith('.vtt'))
  ) {
    const dstLang = parts[1];
    const type = parts[2];
    const ext = parts[3].endsWith('.srt') ? '.srt' : '.vtt';
    let stremioId = parts[3].slice(0, -ext.length);
    try {
      stremioId = decodeURIComponent(stremioId);
    } catch {
      /* keep original */
    }
    return handleSubEndpoint(res, dstLang, type, stremioId);
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
        res.setHeader('cache-control', 'no-cache, no-store, must-revalidate');
        return sendJson(res, 200, resp);
      } catch (err: unknown) {
        console.error(err);
        return sendJson(res, 200, { subtitles: [], ...NO_CACHE });
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
        return sendJson(res, 200, { subtitles: [], ...NO_CACHE });
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
