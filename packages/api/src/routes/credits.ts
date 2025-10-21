import { FastifyInstance } from 'fastify';
import { authenticateUser } from '../middleware/auth';
import { TopUpCreditsSchema } from '@stremio-ai-subs/shared';

export async function creditsRoutes(fastify: FastifyInstance) {
  // Get wallet balance
  fastify.get('/balance', { preHandler: authenticateUser }, async (request, reply) => {
    const user = request.user as { userId: string };

    const result = await fastify.db.query(
      'SELECT balance_credits FROM wallets WHERE user_id = $1',
      [user.userId]
    );

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Wallet not found' });
    }

    return reply.send({ balance: result.rows[0].balance_credits });
  });

  // Top up credits (sandbox mode for demo)
  fastify.post('/topup', { preHandler: authenticateUser }, async (request, reply) => {
    try {
      const user = request.user as { userId: string };
      const body = TopUpCreditsSchema.parse(request.body);

      // In production, verify payment with Stripe here
      // For now, just add credits

      const client = await fastify.db.connect();
      try {
        await client.query('BEGIN');

        // Get wallet
        const walletResult = await client.query(
          'SELECT id, balance_credits FROM wallets WHERE user_id = $1 FOR UPDATE',
          [user.userId]
        );

        if (walletResult.rows.length === 0) {
          throw new Error('Wallet not found');
        }

        const wallet = walletResult.rows[0];

        // Update balance
        await client.query('UPDATE wallets SET balance_credits = balance_credits + $1 WHERE id = $2', [
          body.amount,
          wallet.id,
        ]);

        // Record transaction
        await client.query(
          'INSERT INTO credit_transactions (user_id, wallet_id, delta, reason, reference) VALUES ($1, $2, $3, $4, $5)',
          [user.userId, wallet.id, body.amount, 'Top-up', body.paymentMethodId]
        );

        await client.query('COMMIT');

        const newBalance = parseFloat(wallet.balance_credits) + body.amount;

        return reply.send({ success: true, newBalance });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      fastify.log.error(err);
      return reply.status(400).send({ error: 'Failed to top up credits' });
    }
  });

  // Get transaction history
  fastify.get('/history', { preHandler: authenticateUser }, async (request, reply) => {
    const user = request.user as { userId: string };

    const result = await fastify.db.query(
      'SELECT id, delta, reason, reference, created_at FROM credit_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [user.userId]
    );

    return reply.send({ transactions: result.rows });
  });
}
