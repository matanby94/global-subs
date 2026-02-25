import { FastifyInstance } from 'fastify';
import { authenticateUser } from '../middleware/auth';
import { TranslateSubtitleSchema } from '@stremio-ai-subs/shared';
import { generateArtifactHash } from '@stremio-ai-subs/shared';
import { AppError } from '../lib/app-error';
import { ingestQueue } from '../queue';

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

    // Charge 1 credit per translation (bundle-based pricing model)
    const creditsToCharge = 1;

    // Check and debit credits in a transaction
    const client = await fastify.db.connect();
    try {
      await client.query('BEGIN');

      const walletResult = await client.query(
        'SELECT id, balance_credits FROM wallets WHERE user_id = $1 FOR UPDATE',
        [user.userId]
      );

      if (walletResult.rows.length === 0) {
        throw AppError.notFound('Wallet not found');
      }

      const wallet = walletResult.rows[0];
      const currentBalance = parseFloat(wallet.balance_credits);

      if (currentBalance < creditsToCharge) {
        throw AppError.insufficientCredits(currentBalance);
      }

      // Debit credits
      await client.query(
        'UPDATE wallets SET balance_credits = balance_credits - $1 WHERE id = $2',
        [creditsToCharge, wallet.id]
      );

      // Record transaction
      await client.query(
        'INSERT INTO credit_transactions (user_id, wallet_id, delta, reason, reference) VALUES ($1, $2, $3, $4, $5)',
        [user.userId, wallet.id, -creditsToCharge, 'Translation request', artifactHash]
      );

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

  // List user's translations
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
}
