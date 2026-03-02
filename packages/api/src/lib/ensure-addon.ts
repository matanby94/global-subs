import { FastifyInstance } from 'fastify';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { generateArtifactHash, normalizeSubtitleToWebVTT } from '@stremio-ai-subs/shared';
import { BUCKET_NAME, s3PresignClient } from '../storage';
import { translateQueue, sourceFetchQueue } from '../queue';

// ──────────────────────────────────────────────
// Addon Transaction Tracer — in-memory ring buffer
// ──────────────────────────────────────────────

export type TraceStep = {
  ts: string;
  stage: string;
  detail: string;
  data?: Record<string, unknown>;
};

export type AddonTransaction = {
  id: string;
  ts: string;
  type: 'movie' | 'series';
  stremioId: string;
  rawStremioId: string;
  dstLang: string;
  userId: string;
  finalStatus: string;
  httpCode: number;
  subtitlesReturned: number;
  durationMs: number;
  steps: TraceStep[];
};

const MAX_TRANSACTIONS = 200;
const transactionLog: AddonTransaction[] = [];

export function getAddonTransactions(limit = 50): AddonTransaction[] {
  return transactionLog.slice(-limit).reverse();
}

let txCounter = 0;
function newTxId(): string {
  txCounter += 1;
  return `tx-${Date.now()}-${txCounter}`;
}

function pushTransaction(opts: {
  input: EnsureAddonEnsureParams;
  rawId: string;
  dstLang: string;
  steps: TraceStep[];
  code: number;
  status: string;
  subtitles: number;
  t0: number;
}) {
  const tx: AddonTransaction = {
    id: newTxId(),
    ts: new Date().toISOString(),
    type: opts.input.type,
    stremioId: opts.rawId,
    rawStremioId: opts.input.stremioId,
    dstLang: opts.dstLang,
    userId: opts.input.userId,
    finalStatus: opts.status,
    httpCode: opts.code,
    subtitlesReturned: opts.subtitles,
    durationMs: Date.now() - opts.t0,
    steps: opts.steps,
  };
  transactionLog.push(tx);
  if (transactionLog.length > MAX_TRANSACTIONS) {
    transactionLog.splice(0, transactionLog.length - MAX_TRANSACTIONS);
  }
}

export type EnsureAddonEnsureParams = {
  userId: string;
  type: 'movie' | 'series';
  stremioId: string;
  dstLang: string;
};

export type EnsureAddonEnsureResponse = {
  status: string;
  charged?: boolean;
  artifactHash?: string | null;
  subtitles: Array<{ lang: string; url: string; id?: string; label?: string }>;
  imported?: boolean;
  note?: string;
  error?: string;
};

/** Negative cache TTL: don't re-scrape content marked not_found for this duration. */
const NEGATIVE_CACHE_TTL_MS = 24 * 60 * 60_000; // 24 hours

function toStremioSubtitleLabel(dstLang: string): string {
  let displayName: string | undefined;
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'language' });
    displayName = dn.of(dstLang) || undefined;
  } catch {
    displayName = undefined;
  }

  const pretty =
    displayName && displayName.toLowerCase() !== dstLang.toLowerCase()
      ? displayName
      : dstLang.toUpperCase();

  return `🌐 ${pretty} - GlobalSubs`;
}

/**
 * Build a custom lang string that Stremio will display as-is in the subtitle picker,
 * since it's not a recognized ISO 639-2 code. This is the only reliable way to
 * brand subtitles in the Stremio UI.
 */
function toStremioSubtitleLangBranded(dstLang: string): string {
  let displayName: string | undefined;
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'language' });
    displayName = dn.of(dstLang) || undefined;
  } catch {
    displayName = undefined;
  }

  const pretty =
    displayName && displayName.toLowerCase() !== dstLang.toLowerCase()
      ? displayName
      : dstLang.toUpperCase();

  return `${pretty} - GlobalSubs`;
}

export function getDefaultTranslationModel(): 'gpt-4' | 'gemini-pro' | 'deepl' {
  const raw = (
    process.env.ADDON_TRANSLATION_MODEL ||
    process.env.DEFAULT_TRANSLATION_MODEL ||
    process.env.TRANSLATION_MODEL
  )?.trim();

  if (raw === 'gemini-pro' || raw === 'deepl') return raw;
  return 'gpt-4';
}

export function parseImdbFromStremioId(stremioId: string): {
  imdbTt: string;
  imdbNumeric: number | null;
  season: number | null;
  episode: number | null;
} {
  let decoded = stremioId;
  try {
    decoded = decodeURIComponent(stremioId);
  } catch {
    // keep original
  }

  const parts = decoded.split(':');
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

async function getSignedArtifactUrl(
  fastify: FastifyInstance,
  hash: string
): Promise<string | null> {
  const result = await fastify.db.query('SELECT storage_key FROM artifacts WHERE hash = $1', [
    hash,
  ]);
  if (result.rows.length === 0) return null;

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: result.rows[0].storage_key,
    ResponseContentType: 'text/vtt; charset=utf-8',
  });
  return getSignedUrl(s3PresignClient, command, { expiresIn: 3600 });
}

async function chargeAddonOncePerLibraryKey(
  fastify: FastifyInstance,
  params: { userId: string; libraryKey: string }
) {
  const creditsToCharge = 1;

  // Subscription users bypass credit charging entirely
  const subResult = await fastify.db.query(
    `SELECT id FROM subscriptions
     WHERE user_id = $1 AND status = 'active' AND current_period_end > NOW()`,
    [params.userId]
  );
  const isSubscriber = subResult.rows.length > 0;

  const client = await fastify.db.connect();
  try {
    await client.query('BEGIN');

    const claimed = await client.query(
      'INSERT INTO user_library (user_id, library_key) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING 1',
      [params.userId, params.libraryKey]
    );

    if (claimed.rows.length === 0) {
      await client.query('COMMIT');
      return false;
    }

    const walletResult = await client.query(
      'SELECT id, balance_credits FROM wallets WHERE user_id = $1 FOR UPDATE',
      [params.userId]
    );

    if (walletResult.rows.length === 0) throw new Error('Wallet not found');

    const wallet = walletResult.rows[0];

    if (isSubscriber) {
      // Subscriber: log zero-cost audit transaction, skip wallet debit
      await client.query(
        'INSERT INTO credit_transactions (user_id, wallet_id, delta, reason, reference) VALUES ($1, $2, $3, $4, $5)',
        [
          params.userId,
          wallet.id,
          0,
          'Addon subscription translation (unlimited)',
          params.libraryKey,
        ]
      );
    } else {
      const currentBalance = parseFloat(wallet.balance_credits);
      if (currentBalance < creditsToCharge) throw new Error('Insufficient credits');

      await client.query(
        'UPDATE wallets SET balance_credits = balance_credits - $1 WHERE id = $2',
        [creditsToCharge, wallet.id]
      );

      await client.query(
        'INSERT INTO credit_transactions (user_id, wallet_id, delta, reason, reference) VALUES ($1, $2, $3, $4, $5)',
        [params.userId, wallet.id, -creditsToCharge, 'Addon translation', params.libraryKey]
      );
    }

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Check subtitle_sources table for a pre-scraped source in the given language.
 * Returns the storage_key + content if found.
 */
async function findCachedSource(
  fastify: FastifyInstance,
  srcRegistry: string,
  srcId: string,
  lang: string
): Promise<{ storageKey: string; contentHash: string } | null> {
  const result = await fastify.db.query(
    `SELECT storage_key, content_hash
     FROM subtitle_sources
     WHERE src_registry = $1 AND src_id = $2 AND lang = $3 AND status = 'available'
     ORDER BY
       COALESCE((validation->>'score')::int, 0) DESC,
       fetched_at DESC
     LIMIT 1`,
    [srcRegistry, srcId, lang]
  );
  if (result.rows.length === 0) return null;
  return {
    storageKey: result.rows[0].storage_key as string,
    contentHash: result.rows[0].content_hash as string,
  };
}

/**
 * Check scrape_requests for a negative cache entry (status = 'not_found' within TTL).
 */
async function isNegativelyCached(
  fastify: FastifyInstance,
  srcRegistry: string,
  srcId: string,
  lang: string
): Promise<boolean> {
  const result = await fastify.db.query(
    `SELECT 1 FROM scrape_requests
     WHERE src_registry = $1 AND src_id = $2 AND lang = $3
       AND status = 'not_found'
       AND checked_at > NOW() - INTERVAL '1 millisecond' * $4
     LIMIT 1`,
    [srcRegistry, srcId, lang, NEGATIVE_CACHE_TTL_MS]
  );
  return result.rows.length > 0;
}

export async function ensureAddonSubtitle(
  fastify: FastifyInstance,
  input: EnsureAddonEnsureParams
): Promise<{ code: number; body: EnsureAddonEnsureResponse }> {
  const t0 = Date.now();
  const steps: TraceStep[] = [];
  const trace = (stage: string, detail: string, data?: Record<string, unknown>) => {
    steps.push({ ts: new Date().toISOString(), stage, detail, data });
  };

  const dstLang = (input.dstLang || '').toLowerCase();
  if (!/^[a-z]{2}$/.test(dstLang)) {
    trace('validate', 'FAIL: invalid dstLang', { dstLang: input.dstLang });
    pushTransaction({
      input,
      rawId: input.stremioId,
      dstLang: input.dstLang || '',
      steps,
      code: 400,
      status: 'error',
      subtitles: 0,
      t0,
    });
    return { code: 400, body: { status: 'error', error: 'dstLang required', subtitles: [] } };
  }

  const model = getDefaultTranslationModel();
  const srcRegistry = 'imdb' as const;
  // Decode percent-encoded colons (Stremio series IDs may arrive as tt1234567%3A1%3A1)
  let srcId = input.stremioId;
  try {
    srcId = decodeURIComponent(srcId);
  } catch {
    /* keep original */
  }
  const libraryKey = `${srcRegistry}|${srcId}|${dstLang}`;

  trace('init', `srcId=${srcId} dstLang=${dstLang} model=${model} type=${input.type}`, {
    rawStremioId: input.stremioId,
    decodedSrcId: srcId,
    wasEncoded: srcId !== input.stremioId,
    userId: input.userId,
    model,
    libraryKey,
  });

  // ──────────────────────────────────────────────
  // Stage 1: Artifact cache hit (translated subtitle already exists)
  // ──────────────────────────────────────────────

  const existing = await fastify.db.query(
    `SELECT hash
     FROM artifacts
     WHERE src_registry = $1 AND src_id = $2 AND dst_lang = $3
     ORDER BY created_at DESC
     LIMIT 1`,
    [srcRegistry, srcId, dstLang]
  );

  trace(
    'stage1:artifact_check',
    `Querying artifacts table: src_registry=${srcRegistry} src_id=${srcId} dst_lang=${dstLang}`,
    { srcRegistry, srcId, dstLang }
  );

  if (existing.rows.length > 0) {
    const hash = existing.rows[0].hash as string;
    trace('stage1:artifact_found', `Artifact cache HIT, hash=${hash}`, { hash });
    const signedUrl = await getSignedArtifactUrl(fastify, hash);
    if (!signedUrl) {
      trace('stage1:sign_fail', 'Artifact found in DB but S3 sign failed', { hash });
      pushTransaction({
        input,
        rawId: srcId,
        dstLang,
        steps,
        code: 404,
        status: 'not_found',
        subtitles: 0,
        t0,
      });
      return { code: 404, body: { status: 'not_found', subtitles: [] } };
    }

    fastify.log.info({ stage: 'ensure:cache_hit', srcId, dstLang, hash }, 'artifact cache hit');

    // Backfill: older worker versions didn't update translation_requests.
    await fastify.db
      .query(
        `UPDATE translation_requests
         SET status = 'completed', error = NULL, updated_at = NOW()
         WHERE artifact_hash = $1 AND status <> 'completed'`,
        [hash]
      )
      .catch(() => undefined);

    let charged = false;
    try {
      charged = await chargeAddonOncePerLibraryKey(fastify, { userId: input.userId, libraryKey });
      trace(
        'stage1:charge',
        charged ? 'Charged 1 credit' : 'Already charged (library key exists)',
        { charged }
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to charge credits';
      const code = msg === 'Insufficient credits' ? 402 : 400;
      trace('stage1:charge_fail', `Charge failed: ${msg}`, { error: msg });
      pushTransaction({
        input,
        rawId: srcId,
        dstLang,
        steps,
        code,
        status: 'error',
        subtitles: 0,
        t0,
      });
      return { code, body: { status: 'error', error: msg, subtitles: [] } };
    }

    trace('stage1:done', 'Returning cached artifact with signed URL', { hash, charged });
    pushTransaction({
      input,
      rawId: srcId,
      dstLang,
      steps,
      code: 200,
      status: 'completed',
      subtitles: 1,
      t0,
    });
    return {
      code: 200,
      body: {
        status: 'completed',
        charged,
        artifactHash: hash,
        subtitles: [
          {
            lang: toStremioSubtitleLangBranded(dstLang),
            label: toStremioSubtitleLabel(dstLang),
            url: signedUrl,
            id: hash,
          },
        ],
      },
    };
  }

  trace('stage1:artifact_miss', 'No artifact found in DB', { srcRegistry, srcId, dstLang });

  // ──────────────────────────────────────────────
  // Stage 2: Check subtitle_sources for a pre-scraped source in the target language
  //          If found, import it directly as an artifact (no LLM translation needed).
  // ──────────────────────────────────────────────

  trace(
    'stage2:source_check',
    `Checking subtitle_sources for target lang: src_id=${srcId} lang=${dstLang}`,
    { srcRegistry, srcId, lang: dstLang }
  );
  const targetSource = await findCachedSource(fastify, srcRegistry, srcId, dstLang);
  if (targetSource) {
    trace('stage2:source_found', `Found pre-scraped source in target lang, importing directly`, {
      storageKey: targetSource.storageKey,
      contentHash: targetSource.contentHash,
    });
    fastify.log.info(
      { stage: 'ensure:source_import', srcId, dstLang },
      'importing pre-scraped source directly'
    );
    // Read the source from S3 and store it as an artifact.
    try {
      const obj = await fastify.s3.send(
        new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: targetSource.storageKey,
        })
      );

      let sourceText = '';
      if (obj.Body) {
        if (typeof (obj.Body as { transformToString?: unknown }).transformToString === 'function') {
          sourceText = await (
            obj.Body as { transformToString: () => Promise<string> }
          ).transformToString();
        } else {
          const chunks: Buffer[] = [];
          const stream = obj.Body as NodeJS.ReadableStream;
          await new Promise<void>((resolve, reject) => {
            stream.on('data', (chunk: Buffer) =>
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
            );
            stream.on('end', () => resolve());
            stream.on('error', (err: Error) => reject(err));
          });
          sourceText = Buffer.concat(chunks).toString('utf8');
        }
      }

      if (sourceText.length > 0) {
        const normalized = normalizeSubtitleToWebVTT(sourceText);
        const artifactHash = generateArtifactHash({
          srcRegistry,
          srcId,
          srcLang: dstLang,
          dstLang,
          model: 'import',
          normalization: 'v1',
          segPolicy: 'preserve_cues',
        });

        let charged = false;
        try {
          charged = await chargeAddonOncePerLibraryKey(fastify, {
            userId: input.userId,
            libraryKey,
          });
          trace(
            'stage2:charge',
            charged ? 'Charged 1 credit (imported source)' : 'Already charged',
            { charged }
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Failed to charge credits';
          const code = msg === 'Insufficient credits' ? 402 : 400;
          trace('stage2:charge_fail', `Charge failed: ${msg}`, { error: msg });
          pushTransaction({
            input,
            rawId: srcId,
            dstLang,
            steps,
            code,
            status: 'error',
            subtitles: 0,
            t0,
          });
          return { code, body: { status: 'error', error: msg, subtitles: [] } };
        }

        const storageKey = `artifacts/${artifactHash}/${artifactHash}.vtt`;

        await fastify.s3.send(
          new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: storageKey,
            Body: normalized.vtt,
            ContentType: 'text/vtt; charset=utf-8',
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
            normalized.vtt.length,
            storageKey,
            JSON.stringify({ cps: true, charsPerLine: true }),
          ]
        );

        const signedUrl = await getSignedArtifactUrl(fastify, artifactHash);
        if (!signedUrl) {
          trace('stage2:sign_fail', 'Imported artifact but S3 sign failed', { artifactHash });
          pushTransaction({
            input,
            rawId: srcId,
            dstLang,
            steps,
            code: 500,
            status: 'error',
            subtitles: 0,
            t0,
          });
          return {
            code: 500,
            body: { status: 'error', error: 'Failed to sign imported subtitle', subtitles: [] },
          };
        }

        trace('stage2:done', 'Imported pre-scraped source as artifact', { artifactHash, charged });
        pushTransaction({
          input,
          rawId: srcId,
          dstLang,
          steps,
          code: 200,
          status: 'completed',
          subtitles: 1,
          t0,
        });
        return {
          code: 200,
          body: {
            status: 'completed',
            charged,
            artifactHash,
            subtitles: [
              {
                lang: toStremioSubtitleLangBranded(dstLang),
                label: toStremioSubtitleLabel(dstLang),
                url: signedUrl,
                id: artifactHash,
              },
            ],
            imported: true,
          },
        };
      }
    } catch {
      // If we can't read the source from S3, fall through to scrape.
      trace('stage2:s3_error', 'Failed to read source from S3, falling through to stage 3');
    }
  } else {
    trace('stage2:source_miss', `No pre-scraped source found for target lang=${dstLang}`);
  }

  // ──────────────────────────────────────────────
  // Stage 3: Check subtitle_sources for an English source (for LLM translation)
  //          If found, enqueue a translate job, skip scraping.
  // ──────────────────────────────────────────────

  if (dstLang !== 'en') {
    trace(
      'stage3:en_source_check',
      `Checking subtitle_sources for English source: src_id=${srcId} lang=en`
    );
    const englishSource = await findCachedSource(fastify, srcRegistry, srcId, 'en');
    if (englishSource) {
      trace('stage3:en_source_found', 'Found cached English source, enqueuing LLM translation', {
        storageKey: englishSource.storageKey,
        model,
      });
      fastify.log.info(
        { stage: 'ensure:translate_cached_en', srcId, dstLang, model },
        'found cached English source, enqueuing translation'
      );
      const artifactHash = generateArtifactHash({
        srcRegistry,
        srcId,
        srcLang: 'en',
        dstLang,
        model,
        normalization: 'v1',
        segPolicy: 'preserve_cues',
      });

      let charged = false;
      try {
        charged = await chargeAddonOncePerLibraryKey(fastify, { userId: input.userId, libraryKey });
        trace('stage3:charge', charged ? 'Charged 1 credit (en→translate)' : 'Already charged', {
          charged,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to charge credits';
        const code = msg === 'Insufficient credits' ? 402 : 400;
        trace('stage3:charge_fail', `Charge failed: ${msg}`, { error: msg });
        pushTransaction({
          input,
          rawId: srcId,
          dstLang,
          steps,
          code,
          status: 'error',
          subtitles: 0,
          t0,
        });
        return { code, body: { status: 'error', error: msg, subtitles: [] } };
      }

      await fastify.db.query(
        `INSERT INTO translation_requests (user_id, artifact_hash, status, request_meta)
         VALUES ($1, $2, 'pending', $3)
         ON CONFLICT (user_id, artifact_hash) DO UPDATE SET updated_at = NOW()`,
        [
          input.userId,
          artifactHash,
          JSON.stringify({
            srcRegistry,
            srcId,
            sourceLang: 'en',
            dstLang,
            model,
            sourceProvider: 'subtitle_sources_cache',
          }),
        ]
      );

      // Read the source content and pass it inline to the translate job
      let sourceSubtitle: string | undefined;
      try {
        const obj = await fastify.s3.send(
          new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: englishSource.storageKey,
          })
        );
        if (obj.Body) {
          if (
            typeof (obj.Body as { transformToString?: unknown }).transformToString === 'function'
          ) {
            sourceSubtitle = await (
              obj.Body as { transformToString: () => Promise<string> }
            ).transformToString();
          }
        }
      } catch {
        // Fall through — translate worker will try to fetch from subtitle_sources itself
      }

      await translateQueue.add(
        'translate',
        {
          sourceSubtitle: sourceSubtitle || `s3://${BUCKET_NAME}/${englishSource.storageKey}`,
          sourceLang: 'en',
          targetLang: dstLang,
          model,
          artifactHash,
          srcRegistry,
          srcId,
        },
        {
          jobId: artifactHash,
          attempts: 3,
          backoff: { type: 'exponential', delay: 10_000 },
        }
      );

      trace('stage3:done', `Translation job enqueued: ${model} en→${dstLang}`, {
        artifactHash,
        model,
        charged,
      });
      pushTransaction({
        input,
        rawId: srcId,
        dstLang,
        steps,
        code: 200,
        status: 'processing',
        subtitles: 0,
        t0,
      });
      return {
        code: 200,
        body: { status: 'processing', charged, artifactHash, subtitles: [] },
      };
    } else {
      trace('stage3:en_source_miss', 'No cached English source found');
    }
  } else {
    trace('stage3:skip', 'dstLang is en, skipping English source lookup');
  }

  // ──────────────────────────────────────────────
  // Stage 4: Negative cache check
  //          If we recently confirmed this content doesn't exist, bail early.
  // ──────────────────────────────────────────────

  // Check for both target language and English source
  trace('stage4:neg_cache_check', `Checking negative cache for ${srcId}`, {
    dstLang,
    checkEn: dstLang !== 'en',
  });
  const [dstNeg, enNeg] = await Promise.all([
    isNegativelyCached(fastify, srcRegistry, srcId, dstLang),
    dstLang !== 'en'
      ? isNegativelyCached(fastify, srcRegistry, srcId, 'en')
      : Promise.resolve(false),
  ]);

  trace('stage4:neg_cache_result', `dstNeg=${dstNeg} enNeg=${enNeg}`, { dstNeg, enNeg });

  if (dstNeg && (dstLang === 'en' || enNeg)) {
    trace(
      'stage4:neg_cache_hit',
      'Both target and English negatively cached, returning unavailable'
    );
    fastify.log.debug(
      { stage: 'ensure:negative_cache', srcId, dstLang },
      'negative cache hit — no sources exist'
    );
    pushTransaction({
      input,
      rawId: srcId,
      dstLang,
      steps,
      code: 200,
      status: 'unavailable',
      subtitles: 0,
      t0,
    });
    return {
      code: 200,
      body: {
        status: 'unavailable',
        charged: false,
        artifactHash: null,
        subtitles: [],
        note: 'No subtitle sources found for this content (checked recently)',
      },
    };
  }

  // ──────────────────────────────────────────────
  // Stage 5: Check if a scrape is already in-flight
  // ──────────────────────────────────────────────

  trace(
    'stage5:inflight_check',
    `Checking scrape_requests for in-flight scrape: ${srcId} lang=${dstLang}`
  );
  const inflight = await fastify.db.query(
    `SELECT status FROM scrape_requests
     WHERE src_registry = $1 AND src_id = $2 AND lang = $3
       AND status IN ('pending', 'processing')
     LIMIT 1`,
    [srcRegistry, srcId, dstLang]
  );

  if (inflight.rows.length > 0) {
    const inflightStatus = inflight.rows[0].status;
    trace('stage5:inflight_found', `Scrape already in-flight: status=${inflightStatus}`, {
      inflightStatus,
    });
    fastify.log.debug(
      { stage: 'ensure:inflight', srcId, dstLang, inflightStatus },
      'scrape already in-flight'
    );
    pushTransaction({
      input,
      rawId: srcId,
      dstLang,
      steps,
      code: 200,
      status: 'processing',
      subtitles: 0,
      t0,
    });
    return {
      code: 200,
      body: {
        status: 'processing',
        charged: false,
        artifactHash: null,
        subtitles: [],
        note: 'Source subtitle is being fetched',
      },
    };
  }

  trace('stage5:no_inflight', 'No in-flight scrape found, will enqueue source-fetch');

  // ──────────────────────────────────────────────
  // Stage 6: Enqueue source-fetch job
  //          The workers package will fetch the subtitle from providers
  //          (SubDL, OpenSubtitles REST, MovieSubtitles), store it in
  //          subtitle_sources, and either import directly or chain into
  //          the translateQueue for LLM translation.
  // ──────────────────────────────────────────────

  // Create a scrape_requests row so Stage 5 detects the in-flight job on next poll
  await fastify.db
    .query(
      `INSERT INTO scrape_requests (src_registry, src_id, lang, status, priority, checked_at)
       VALUES ($1, $2, $3, 'processing', 5, NOW())
       ON CONFLICT (src_registry, src_id, lang)
       DO UPDATE SET
         status = CASE
           WHEN scrape_requests.status IN ('failed', 'not_found', 'pending') THEN 'processing'
           ELSE scrape_requests.status
         END,
         updated_at = NOW()`,
      [srcRegistry, srcId, dstLang]
    )
    .catch(() => undefined);

  const jobId = `sf:${srcRegistry}:${srcId}:${dstLang}:${model}`;

  await sourceFetchQueue.add(
    'source-fetch',
    {
      srcRegistry,
      srcId,
      dstLang,
      model,
      userId: input.userId,
      dstNeg,
      enNeg,
    },
    {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 15_000 },
    }
  );

  trace('stage6:enqueued', `Source-fetch job enqueued: ${jobId}`, {
    srcId,
    dstLang,
    model,
    dstNeg,
    enNeg,
  });
  pushTransaction({
    input,
    rawId: srcId,
    dstLang,
    steps,
    code: 200,
    status: 'processing',
    subtitles: 0,
    t0,
  });
  return {
    code: 200,
    body: {
      status: 'processing',
      charged: false,
      artifactHash: null,
      subtitles: [],
      note: 'Source subtitle is being fetched from providers',
    },
  };
}
