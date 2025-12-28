import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticateUser } from '../middleware/auth';
import { authenticateUserOrAddonToken } from '../middleware/addon-auth';
import { generateArtifactHash, normalizeWebVTT } from '@stremio-ai-subs/shared';
import { translateQueue } from '../queue';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { BUCKET_NAME } from '../storage';
import crypto from 'node:crypto';

const EnsureAddonSubtitleSchema = z.object({
  type: z.enum(['movie', 'series']),
  stremioId: z.string().min(1),
  dstLang: z.string().length(2).optional(),
});

const CreateAddonInstallationSchema = z.object({
  dstLang: z.string().length(2),
});

function getAddonPublicUrl(): string {
  const raw = (process.env.ADDON_PUBLIC_URL || process.env.ADDON_URL || '').trim();
  return raw.length > 0 ? raw.replace(/\/$/, '') : 'http://127.0.0.1:3012';
}

function getDefaultTranslationModel(): 'gpt-4' | 'gemini-pro' | 'deepl' {
  const raw = (
    process.env.ADDON_TRANSLATION_MODEL ||
    process.env.DEFAULT_TRANSLATION_MODEL ||
    process.env.TRANSLATION_MODEL
  )?.trim();

  if (raw === 'gemini-pro' || raw === 'deepl') return raw;
  return 'gpt-4';
}

function parseImdbFromStremioId(stremioId: string): {
  imdbTt: string;
  imdbNumeric: number | null;
  season: number | null;
  episode: number | null;
} {
  const parts = stremioId.split(':');
  const imdbTt = parts[0];
  const imdbNumeric = imdbTt.startsWith('tt') ? parseInt(imdbTt.slice(2), 10) : NaN;

  const season = parts.length >= 2 ? parseInt(parts[1], 10) : NaN;
  const episode = parts.length >= 3 ? parseInt(parts[2], 10) : NaN;

  return {
    imdbTt,
    imdbNumeric: Number.isFinite(imdbNumeric) ? imdbNumeric : null,
    season: Number.isFinite(season) ? season : null,
    episode: Number.isFinite(episode) ? episode : null,
  };
}

async function findOpenSubtitlesDownload(params: {
  imdbNumeric: number;
  season: number | null;
  episode: number | null;
  languages: string;
}): Promise<{ url: string; lang: string } | null> {
  // Strategy:
  // 1) Prefer opensubtitles-api (XML-RPC) if configured with a valid UserAgent.
  // 2) Fallback to OpenSubtitles REST v1 if API key is provided.

  const xmlRpcUserAgent =
    process.env.OPENSUBTITLES_XMLRPC_USERAGENT || process.env.OPENSUBTITLES_USER_AGENT;

  if (xmlRpcUserAgent) {
    try {
      // opensubtitles-api expects ISO-639-2 (3-letter) in `sublanguageid`, but returns
      // results keyed by ISO-639-1 (2-letter), e.g. subtitles['fr'].
      const lang2 = params.languages.split(',')[0].trim();
      const toIso639_2 = (iso639_1: string): string | null => {
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
      };

      const sublanguageid = toIso639_2(lang2);
      if (sublanguageid) {
        const mod: any = await import('opensubtitles-api');
        const OS = mod?.default || mod;

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

        const subtitles: any = await OpenSubtitles.search(searchParams);
        const best = subtitles?.[lang2];
        const url = best?.url;
        if (typeof url === 'string' && url.startsWith('http')) {
          return { url, lang: lang2 };
        }
      }
    } catch {
      // Best-effort: fall through to REST implementation.
    }
  }

  const apiKey = process.env.OPENSUBTITLES_API_KEY;
  if (!apiKey) return null;

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

  if (!searchRes.ok) return null;
  const searchJson: any = await searchRes.json();

  const candidates: any[] = Array.isArray(searchJson?.data) ? searchJson.data : [];
  if (candidates.length === 0) return null;

  // Find first file_id we can download
  for (const item of candidates) {
    const lang =
      item?.attributes?.language ||
      item?.attributes?.feature_details?.language ||
      item?.attributes?.lang ||
      params.languages.split(',')[0];

    const files = item?.attributes?.files;
    const fileId =
      (Array.isArray(files) && files[0]?.file_id) ||
      item?.attributes?.file_id ||
      item?.file_id ||
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
    const downloadJson: any = await downloadRes.json();
    const link = downloadJson?.link || downloadJson?.url;
    if (typeof link === 'string' && link.startsWith('http')) {
      return { url: link, lang: typeof lang === 'string' ? lang : params.languages.split(',')[0] };
    }
  }

  return null;
}

async function getSignedArtifactUrl(
  fastify: FastifyInstance,
  hash: string
): Promise<string | null> {
  const result = await fastify.db.query('SELECT storage_key FROM artifacts WHERE hash = $1', [
    hash,
  ]);
  if (result.rows.length === 0) return null;

  const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: result.rows[0].storage_key });
  return getSignedUrl(fastify.s3, command, { expiresIn: 3600 });
}

export async function addonRoutes(fastify: FastifyInstance) {
  // Creates an opaque install token so users can install a personalized addon without exposing JWTs in the URL.
  fastify.post('/installations', { preHandler: authenticateUser }, async (request, reply) => {
    const user = request.user as { userId: string };
    const body = CreateAddonInstallationSchema.parse(request.body);
    const dstLang = body.dstLang.toLowerCase();

    const existing = await fastify.db.query(
      'SELECT token FROM addon_installations WHERE user_id = $1 AND dst_lang = $2 ORDER BY created_at DESC LIMIT 1',
      [user.userId, dstLang]
    );

    const token =
      existing.rows.length > 0
        ? (existing.rows[0].token as string)
        : crypto.randomBytes(12).toString('base64url');

    if (existing.rows.length === 0) {
      await fastify.db.query(
        'INSERT INTO addon_installations (user_id, dst_lang, token) VALUES ($1, $2, $3)',
        [user.userId, dstLang, token]
      );
    }

    const addonBase = getAddonPublicUrl();
    const manifestUrl = `${addonBase}/user/${user.userId}/${token}/manifest.json`;

    let stremioInstallUrl = manifestUrl;
    try {
      const url = new URL(manifestUrl);
      stremioInstallUrl = `stremio://${url.host}${url.pathname}`;
    } catch {
      // ignore
    }

    return reply.send({ token, dstLang, manifestUrl, stremioInstallUrl });
  });

  // Called by the add-on server (authenticated with the user's JWT stored in the manifest config)
  // It ensures a subtitle exists for stremioId+dstLang (import if available, else enqueue LLM translation).
  fastify.post('/ensure', { preHandler: authenticateUserOrAddonToken }, async (request, reply) => {
    const user = (request as any).user as { userId: string };
    const body = EnsureAddonSubtitleSchema.parse(request.body);
    const installationDstLang = (request as any)?.addonInstallation?.dstLang as string | undefined;
    const dstLang = (body.dstLang || installationDstLang || '').toLowerCase();
    if (!/^[a-z]{2}$/.test(dstLang)) {
      return reply.status(400).send({ error: 'dstLang required' });
    }
    const model = getDefaultTranslationModel();

    const srcRegistry = 'imdb';
    const srcId = body.stremioId; // keep full stremio id (episodes: tt...:S:E)

    const libraryKey = `${srcRegistry}|${srcId}|${dstLang}`;

    // Charge only if not in user's library
    const client = await fastify.db.connect();
    let shouldCharge = false;
    try {
      await client.query('BEGIN');

      const owned = await client.query(
        'SELECT 1 FROM user_library WHERE user_id = $1 AND library_key = $2 LIMIT 1',
        [user.userId, libraryKey]
      );

      if (owned.rows.length === 0) {
        shouldCharge = true;

        const creditsToCharge = 1;
        const walletResult = await client.query(
          'SELECT id, balance_credits FROM wallets WHERE user_id = $1 FOR UPDATE',
          [user.userId]
        );

        if (walletResult.rows.length === 0) throw new Error('Wallet not found');

        const wallet = walletResult.rows[0];
        const currentBalance = parseFloat(wallet.balance_credits);
        if (currentBalance < creditsToCharge) throw new Error('Insufficient credits');

        await client.query(
          'UPDATE wallets SET balance_credits = balance_credits - $1 WHERE id = $2',
          [creditsToCharge, wallet.id]
        );

        await client.query(
          'INSERT INTO credit_transactions (user_id, wallet_id, delta, reason, reference) VALUES ($1, $2, $3, $4, $5)',
          [user.userId, wallet.id, -creditsToCharge, 'Addon translation', libraryKey]
        );

        await client.query(
          'INSERT INTO user_library (user_id, library_key) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [user.userId, libraryKey]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // If we already have an artifact for this content+dstLang, return it.
    const existing = await fastify.db.query(
      `SELECT hash
       FROM artifacts
       WHERE src_registry = $1 AND src_id = $2 AND dst_lang = $3
       ORDER BY created_at DESC
       LIMIT 1`,
      [srcRegistry, srcId, dstLang]
    );

    if (existing.rows.length > 0) {
      const hash = existing.rows[0].hash as string;
      const signedUrl = await getSignedArtifactUrl(fastify, hash);
      if (!signedUrl) return reply.status(404).send({ status: 'not_found' });

      return reply.send({
        status: 'completed',
        charged: shouldCharge,
        subtitles: [{ lang: dstLang, url: signedUrl, id: hash }],
      });
    }

    // Try importing target language from OpenSubtitles
    const { imdbNumeric, season, episode } = parseImdbFromStremioId(body.stremioId);
    if (imdbNumeric != null) {
      const targetDownload = await findOpenSubtitlesDownload({
        imdbNumeric,
        season: body.type === 'series' ? season : null,
        episode: body.type === 'series' ? episode : null,
        languages: dstLang,
      });

      if (targetDownload) {
        const res = await fetch(targetDownload.url);
        if (res.ok) {
          const raw = await res.text();
          const normalized = normalizeWebVTT(raw);
          const finalContent = normalized.startsWith('WEBVTT')
            ? normalized
            : `WEBVTT\n\n${normalized}`;

          const artifactHash = generateArtifactHash({
            srcRegistry,
            srcId,
            srcLang: dstLang,
            dstLang,
            model: 'import',
            normalization: 'v1',
            segPolicy: 'preserve_cues',
          });

          const storageKey = `artifacts/${artifactHash}/${artifactHash}.vtt`;

          await fastify.s3.send(
            new PutObjectCommand({
              Bucket: BUCKET_NAME,
              Key: storageKey,
              Body: finalContent,
              ContentType: 'text/vtt',
            })
          );

          await fastify.db.query(
            `INSERT INTO artifacts (hash, src_registry, src_id, src_lang, dst_lang, model, cost_chars, storage_key, checks_passed)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (hash) DO NOTHING`,
            [
              artifactHash,
              srcRegistry,
              srcId,
              dstLang,
              dstLang,
              'import',
              finalContent.length,
              storageKey,
              JSON.stringify({ cps: true, charsPerLine: true }),
            ]
          );

          const signedUrl = await getSignedArtifactUrl(fastify, artifactHash);
          if (!signedUrl)
            return reply.status(500).send({ error: 'Failed to sign imported subtitle' });

          return reply.send({
            status: 'completed',
            charged: shouldCharge,
            subtitles: [{ lang: dstLang, url: signedUrl, id: artifactHash }],
            imported: true,
          });
        }
      }

      // Otherwise, try to fetch English (or any available) and translate
      const sourceDownload = await findOpenSubtitlesDownload({
        imdbNumeric,
        season: body.type === 'series' ? season : null,
        episode: body.type === 'series' ? episode : null,
        languages: 'en',
      });

      if (sourceDownload) {
        const artifactHash = generateArtifactHash({
          srcRegistry,
          srcId,
          srcLang: 'en',
          dstLang,
          model,
          normalization: 'v1',
          segPolicy: 'preserve_cues',
        });

        // Record/ensure request row so we don't enqueue endlessly per user
        await fastify.db.query(
          `INSERT INTO translation_requests (user_id, artifact_hash, status, request_meta)
           VALUES ($1, $2, 'pending', $3)
           ON CONFLICT (user_id, artifact_hash) DO UPDATE SET updated_at = NOW()`,
          [
            user.userId,
            artifactHash,
            JSON.stringify({ srcRegistry, srcId, sourceLang: 'en', dstLang, model }),
          ]
        );

        // Enqueue translate job (idempotency best-effort: BullMQ will still accept duplicates; DB record reduces spam per user)
        await translateQueue.add('translate', {
          sourceSubtitle: sourceDownload.url,
          sourceLang: 'en',
          targetLang: dstLang,
          model,
          artifactHash,
          srcRegistry,
          srcId,
        });

        return reply.send({ status: 'processing', charged: shouldCharge, artifactHash });
      }
    }

    return reply.send({
      status: 'processing',
      charged: shouldCharge,
      artifactHash: null,
      note: 'No source subtitle available yet',
    });
  });
}
