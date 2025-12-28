import { FastifyInstance } from 'fastify';
import { authenticateUser } from '../middleware/auth';
import { TranslateSubtitleSchema } from '@stremio-ai-subs/shared';
import { generateArtifactHash } from '@stremio-ai-subs/shared';

export async function translationsRoutes(fastify: FastifyInstance) {
  // Request translation
  fastify.post('/', { preHandler: authenticateUser }, async (request, reply) => {
    try {
      const user = request.user as { userId: string };
      const body = TranslateSubtitleSchema.parse(request.body);

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
        // Cache hit
        cached = true;
        const artifact = artifactResult.rows[0];

        // Generate signed URL (this would call the sign endpoint)
        signedUrl = `/api/sign/artifact/${artifactHash}`;
      } else {
        // Cache miss - enqueue translation job
        await fastify.db.query('INSERT INTO jobs (kind, status, payload) VALUES ($1, $2, $3)', [
          'translate',
          'pending',
          JSON.stringify({
            sourceSubtitle: body.sourceSubtitle,
            sourceLang: body.sourceLang,
            targetLang: body.targetLang,
            model: body.model,
            artifactHash,
          }),
        ]);

        signedUrl = `/api/translations/status/${artifactHash}`;
      }

      // Charge 1 credit per translation (bundle-based pricing model)
      const creditsToCharge = 1;

      // Check and debit credits
      const client = await fastify.db.connect();
      try {
        await client.query('BEGIN');

        const walletResult = await client.query(
          'SELECT id, balance_credits FROM wallets WHERE user_id = $1 FOR UPDATE',
          [user.userId]
        );

        if (walletResult.rows.length === 0) {
          throw new Error('Wallet not found');
        }

        const wallet = walletResult.rows[0];
        const currentBalance = parseFloat(wallet.balance_credits);

        if (currentBalance < creditsToCharge) {
          throw new Error('Insufficient credits');
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

        // Record serve event (log for both cache hit and miss)
        // For cached translations, get pricing_rule_id from first rule or use default
        let pricingRuleId = null;
        if (cached && artifactResult.rows.length > 0) {
          const pricingResult = await client.query('SELECT id FROM pricing_rules LIMIT 1');
          pricingRuleId = pricingResult.rows.length > 0 ? pricingResult.rows[0].id : null;

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
    } catch (err: any) {
      fastify.log.error(err);
      return reply.status(400).send({ error: err.message || 'Failed to process translation' });
    }
  });

  // Get translation status
  fastify.get('/status/:hash', { preHandler: authenticateUser }, async (request, reply) => {
    const { hash } = request.params as { hash: string };

    // Check artifact
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

    // Check job
    const jobResult = await fastify.db.query(
      "SELECT * FROM jobs WHERE kind = 'translate' AND payload->>'artifactHash' = $1 ORDER BY created_at DESC LIMIT 1",
      [hash]
    );

    if (jobResult.rows.length === 0) {
      return reply.status(404).send({ error: 'Translation not found' });
    }

    const job = jobResult.rows[0];

    return reply.send({
      status: job.status,
      artifactHash: hash,
      error: job.error,
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
