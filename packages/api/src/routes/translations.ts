import { FastifyInstance } from 'fastify';
import { authenticateUser } from '../middleware/auth';
import { TranslateSubtitleSchema } from '@stremio-ai-subs/shared';
import { generateArtifactHash } from '@stremio-ai-subs/shared';
import { AppError } from '../lib/app-error';
import { ingestQueue } from '../queue';
import { hasActiveSubscription } from './credits';
import { ensureAddonSubtitle } from '../lib/ensure-addon';

// Models that actually have working adapters
const SUPPORTED_MODELS = new Set(['gpt-4']);

export async function translationsRoutes(fastify: FastifyInstance) {
  // Request translation
  fastify.post('/', { preHandler: authenticateUser }, async (request, reply) => {
    const user = request.user as { userId: string };
    const body = TranslateSubtitleSchema.parse(request.body);

    // Reject models that don't have working adapters yet
    if (!SUPPORTED_MODELS.has(body.model)) {
      throw AppError.badRequest(
        `Model '${body.model}' is not yet available. Supported models: ${[...SUPPORTED_MODELS].join(', ')}`,
        'UNSUPPORTED_MODEL'
      );
    }

    // Generate artifact hash
    const artifactHash = generateArtifactHash({
      srcRegistry: 'upload',
      srcId: body.sourceSubtitle,
      srcLang: body.sourceLang,
      dstLang: body.targetLang,
      model: body.model,
      normalization: 'v1',
      segPolicy: 'preserve_cues',
    });

    // Check if artifact exists (cache hit)
    const artifactResult = await fastify.db.query('SELECT * FROM artifacts WHERE hash = $1', [
      artifactHash,
    ]);

    let cached = false;
    let signedUrl = '';

    if (artifactResult.rows.length > 0) {
      // Cache hit - serve existing translation
      cached = true;
      signedUrl = `/api/sign/artifact/${artifactHash}`;
    } else {
      // Cache miss - enqueue translation job via BullMQ
      await ingestQueue.add(
        'translate',
        {
          sourceSubtitle: body.sourceSubtitle,
          sourceLang: body.sourceLang,
          targetLang: body.targetLang,
          model: body.model,
          artifactHash,
          userId: user.userId,
        },
        {
          jobId: artifactHash, // Deduplicate by artifact hash
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        }
      );

      signedUrl = `/api/translations/status/${artifactHash}`;
    }

    // ── Charging: subscription users bypass credits, others pay 1 credit ──
    const isSubscriber = await hasActiveSubscription(fastify, user.userId);
    const creditsToCharge = isSubscriber ? 0 : 1;

    // Check and debit credits in a transaction
    const client = await fastify.db.connect();
    try {
      await client.query('BEGIN');

      if (!isSubscriber) {
        const walletResult = await client.query(
          'SELECT id, balance_credits FROM wallets WHERE user_id = $1 FOR UPDATE',
          [user.userId]
        );

        if (walletResult.rows.length === 0) {
          throw AppError.notFound('Wallet not found');
        }

        const wallet = walletResult.rows[0];
        const currentBalance = parseFloat(wallet.balance_credits);

        if (currentBalance < 1) {
          throw AppError.insufficientCredits(currentBalance);
        }

        // Debit credits
        await client.query(
          'UPDATE wallets SET balance_credits = balance_credits - $1 WHERE id = $2',
          [1, wallet.id]
        );

        // Record transaction
        await client.query(
          'INSERT INTO credit_transactions (user_id, wallet_id, delta, reason, reference) VALUES ($1, $2, $3, $4, $5)',
          [user.userId, wallet.id, -1, 'Translation request', artifactHash]
        );
      } else {
        // Subscriber: log zero-cost transaction for audit trail
        const walletResult = await client.query('SELECT id FROM wallets WHERE user_id = $1', [
          user.userId,
        ]);
        if (walletResult.rows.length > 0) {
          await client.query(
            'INSERT INTO credit_transactions (user_id, wallet_id, delta, reason, reference) VALUES ($1, $2, $3, $4, $5)',
            [
              user.userId,
              walletResult.rows[0].id,
              0,
              'Subscription translation (unlimited)',
              artifactHash,
            ]
          );
        }
      }

      // Record serve event for cache hits
      if (cached) {
        const pricingResult = await client.query('SELECT id FROM pricing_rules LIMIT 1');
        const pricingRuleId = pricingResult.rows.length > 0 ? pricingResult.rows[0].id : null;

        if (pricingRuleId) {
          await client.query(
            'INSERT INTO serve_events (user_id, artifact_hash, pricing_rule_id, credits_debited, request_meta) VALUES ($1, $2, $3, $4, $5)',
            [
              user.userId,
              artifactHash,
              pricingRuleId,
              creditsToCharge,
              JSON.stringify({ cached: true }),
            ]
          );
        }
      }

      await client.query('COMMIT');

      return reply.send({
        artifactHash,
        signedUrl,
        cached,
        creditsCharged: creditsToCharge,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // Get translation status
  fastify.get('/status/:hash', { preHandler: authenticateUser }, async (request, reply) => {
    const { hash } = request.params as { hash: string };

    // Check if artifact is ready
    const artifactResult = await fastify.db.query('SELECT * FROM artifacts WHERE hash = $1', [
      hash,
    ]);

    if (artifactResult.rows.length > 0) {
      return reply.send({
        status: 'completed',
        artifactHash: hash,
        signedUrl: `/api/sign/artifact/${hash}`,
      });
    }

    // Check BullMQ job status
    const job = await ingestQueue.getJob(hash);

    if (!job) {
      throw AppError.notFound('Translation not found');
    }

    const state = await job.getState();
    const failedReason = job.failedReason;

    return reply.send({
      status: state === 'completed' ? 'completed' : state === 'failed' ? 'failed' : 'processing',
      artifactHash: hash,
      ...(failedReason && { error: failedReason }),
    });
  });

  // List user's translations (from web UI serve_events)
  fastify.get('/list', { preHandler: authenticateUser }, async (request, reply) => {
    const user = request.user as { userId: string };

    const result = await fastify.db.query(
      `SELECT DISTINCT ON (se.artifact_hash)
        se.artifact_hash,
        a.src_lang,
        a.dst_lang,
        a.model,
        se.served_at,
        se.credits_debited
       FROM serve_events se
       JOIN artifacts a ON a.hash = se.artifact_hash
       WHERE se.user_id = $1
       ORDER BY se.artifact_hash, se.served_at DESC
       LIMIT 50`,
      [user.userId]
    );

    return reply.send({ translations: result.rows });
  });

  // ──────────────────────────────────────────────
  // Unified library: combines addon translations (user_library) with
  // web UI translations (serve_events), all joined to artifacts.
  // ──────────────────────────────────────────────
  fastify.get('/library', { preHandler: authenticateUser }, async (request, reply) => {
    const user = request.user as { userId: string };

    // Query 1: Addon-originated translations from user_library
    // library_key format: "imdb|tt1234567|es" → parse out src_id and dst_lang
    // Join with artifacts to get full metadata.
    const addonResult = await fastify.db.query(
      `SELECT
         ul.library_key,
         ul.created_at,
         ul.retry_count,
         ul.last_retry_at,
         a.hash        AS artifact_hash,
         a.src_registry,
         a.src_id,
         a.src_lang,
         a.dst_lang,
         a.model,
         a.storage_key,
         tr.status      AS request_status,
         sr.status      AS scrape_status
       FROM user_library ul
       LEFT JOIN artifacts a
         ON a.src_registry = split_part(ul.library_key, '|', 1)
         AND a.src_id      = split_part(ul.library_key, '|', 2)
         AND a.dst_lang    = split_part(ul.library_key, '|', 3)
       LEFT JOIN translation_requests tr
         ON tr.user_id = ul.user_id
         AND tr.artifact_hash = a.hash
       LEFT JOIN scrape_requests sr
         ON sr.src_registry = split_part(ul.library_key, '|', 1)
         AND sr.src_id      = split_part(ul.library_key, '|', 2)
         AND sr.lang        = split_part(ul.library_key, '|', 3)
       WHERE ul.user_id = $1
       ORDER BY ul.created_at DESC
       LIMIT 100`,
      [user.userId]
    );

    // Query 2: Web UI translations from serve_events (not already in addon results)
    const webResult = await fastify.db.query(
      `SELECT DISTINCT ON (se.artifact_hash)
         se.artifact_hash,
         a.src_registry,
         a.src_id,
         a.src_lang,
         a.dst_lang,
         a.model,
         a.storage_key,
         se.served_at   AS created_at,
         'completed'    AS request_status
       FROM serve_events se
       JOIN artifacts a ON a.hash = se.artifact_hash
       WHERE se.user_id = $1
       ORDER BY se.artifact_hash, se.served_at DESC
       LIMIT 100`,
      [user.userId]
    );

    // Merge and deduplicate by (src_id + dst_lang) — addon entries take priority
    const seen = new Set<string>();
    const items: Array<Record<string, unknown>> = [];

    for (const row of addonResult.rows) {
      const parts = (row.library_key as string).split('|');
      const dedup = `${parts[1]}|${parts[2]}`;
      if (seen.has(dedup)) continue;
      seen.add(dedup);

      // Determine effective status:
      // 1. If artifact exists → completed
      // 2. If translation_requests says failed → failed
      // 3. If scrape_requests says failed/not_found → failed
      // 4. Otherwise → processing
      let status = 'processing';
      if (row.artifact_hash) {
        status = 'completed';
      } else if (row.request_status === 'failed') {
        status = 'failed';
      } else if (row.scrape_status === 'failed' || row.scrape_status === 'not_found') {
        status = 'failed';
      } else if (row.request_status) {
        status = row.request_status;
      }

      items.push({
        src_registry: row.src_registry || parts[0],
        src_id: row.src_id || parts[1],
        dst_lang: row.dst_lang || parts[2],
        src_lang: row.src_lang || null,
        model: row.model || null,
        artifact_hash: row.artifact_hash || null,
        status,
        created_at: row.created_at,
        library_key: row.library_key,
        retry_count: row.retry_count ?? 0,
      });
    }

    for (const row of webResult.rows) {
      const dedup = `${row.src_id}|${row.dst_lang}`;
      if (seen.has(dedup)) continue;
      seen.add(dedup);

      items.push({
        src_registry: row.src_registry,
        src_id: row.src_id,
        dst_lang: row.dst_lang,
        src_lang: row.src_lang,
        model: row.model,
        artifact_hash: row.artifact_hash,
        status: 'completed',
        created_at: row.created_at,
      });
    }

    // Sort by created_at descending
    items.sort((a, b) => {
      const da = a.created_at ? new Date(a.created_at as string).getTime() : 0;
      const db = b.created_at ? new Date(b.created_at as string).getTime() : 0;
      return db - da;
    });

    return reply.send({ library: items });
  });

  // ──────────────────────────────────────────────
  // Retry a stuck processing library item.
  // Conditions: >1 min since last attempt, max 2 retries.
  // Re-invokes the ensureAddonSubtitle pipeline.
  // ──────────────────────────────────────────────
  fastify.post('/library/retry', { preHandler: authenticateUser }, async (request, reply) => {
    const user = request.user as { userId: string };
    const { library_key } = request.body as { library_key?: string };

    if (!library_key || typeof library_key !== 'string') {
      throw AppError.badRequest('library_key is required');
    }

    const parts = library_key.split('|');
    if (parts.length !== 3) {
      throw AppError.badRequest('Invalid library_key format');
    }
    const [srcRegistry, srcId, dstLang] = parts;

    // 1. Verify ownership and read retry state from user_library
    const ownerCheck = await fastify.db.query(
      'SELECT created_at, retry_count, last_retry_at FROM user_library WHERE user_id = $1 AND library_key = $2',
      [user.userId, library_key]
    );
    if (ownerCheck.rows.length === 0) {
      throw AppError.notFound('Library item not found');
    }

    const row = ownerCheck.rows[0];
    const retryCount: number = row.retry_count ?? 0;

    // 2. Check that no artifact already exists (already completed)
    const artifactCheck = await fastify.db.query(
      'SELECT 1 FROM artifacts WHERE src_registry = $1 AND src_id = $2 AND dst_lang = $3 LIMIT 1',
      [srcRegistry, srcId, dstLang]
    );
    if (artifactCheck.rows.length > 0) {
      return reply.send({ status: 'already_completed', retryCount: 0 });
    }

    // 3. Only allow retry when the pipeline has actually failed
    //    Check translation_requests and scrape_requests for failure status
    const failCheck = await fastify.db.query(
      `SELECT
         (SELECT status FROM translation_requests
          WHERE user_id = $1 AND request_meta->>'srcId' = $2 AND request_meta->>'dstLang' = $3
          ORDER BY updated_at DESC LIMIT 1) AS tr_status,
         (SELECT status FROM scrape_requests
          WHERE src_registry = $4 AND src_id = $2 AND lang = $3
          ORDER BY updated_at DESC LIMIT 1) AS sr_status`,
      [user.userId, srcId, dstLang, srcRegistry]
    );

    const trStatus = failCheck.rows[0]?.tr_status;
    const srStatus = failCheck.rows[0]?.sr_status;
    const isFailed =
      trStatus === 'failed' ||
      srStatus === 'failed' ||
      srStatus === 'not_found' ||
      // No pipeline state at all and no artifact → stuck/lost, allow retry
      (!trStatus && !srStatus);

    if (!isFailed) {
      return reply.status(400).send({
        error: 'Translation is still being processed',
        retryCount,
      });
    }

    // 4. Enforce max 2 retries
    if (retryCount >= 2) {
      return reply.status(400).send({ error: 'Maximum retries reached (2)', retryCount });
    }

    // 5. Atomically increment retry_count and stamp last_retry_at BEFORE
    //    running the pipeline so a concurrent retry is blocked.
    const newRetryCount = retryCount + 1;
    await fastify.db.query(
      `UPDATE user_library
       SET retry_count = $1, last_retry_at = NOW()
       WHERE user_id = $2 AND library_key = $3`,
      [newRetryCount, user.userId, library_key]
    );

    // 6. Clean up stale pipeline state so the ensure pipeline can re-run
    await fastify.db
      .query(
        `DELETE FROM translation_requests
       WHERE user_id = $1
         AND request_meta->>'srcId' = $2
         AND request_meta->>'dstLang' = $3`,
        [user.userId, srcId, dstLang]
      )
      .catch(() => undefined);

    await fastify.db
      .query(
        `UPDATE scrape_requests
       SET status = 'failed', updated_at = NOW()
       WHERE src_registry = $1 AND src_id = $2 AND lang = $3
         AND status IN ('pending', 'processing')`,
        [srcRegistry, srcId, dstLang]
      )
      .catch(() => undefined);

    // 7. Re-invoke the ensure pipeline (won't re-charge — user_library ON CONFLICT)
    const type = srcId.includes(':') ? 'series' : 'movie';
    const result = await ensureAddonSubtitle(fastify, {
      userId: user.userId,
      type,
      stremioId: srcId,
      dstLang,
    });

    return reply.send({
      status: result.body.status,
      retryCount: newRetryCount,
      artifactHash: result.body.artifactHash || null,
    });
  });
}
