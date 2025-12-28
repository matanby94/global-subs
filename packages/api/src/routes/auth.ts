import { FastifyInstance } from 'fastify';
import { CreateUserSchema } from '@stremio-ai-subs/shared';

export async function authRoutes(fastify: FastifyInstance) {
  // Simple email-based auth (OTP would be added here)
  fastify.post('/signup', async (request, reply) => {
    try {
      const body = CreateUserSchema.parse(request.body);

      const existingUser = await fastify.db.query('SELECT id FROM users WHERE email = $1', [
        body.email,
      ]);

      if (existingUser.rows.length > 0) {
        return reply.status(400).send({ error: 'User already exists' });
      }

      const result = await fastify.db.query(
        'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id, email, name, created_at',
        [body.email, body.name]
      );

      const user = result.rows[0];

      // Create wallet with 10 free trial credits
      await fastify.db.query('INSERT INTO wallets (user_id, balance_credits) VALUES ($1, $2)', [
        user.id,
        10,
      ]);

      // Log free trial credit grant
      const walletResult = await fastify.db.query('SELECT id FROM wallets WHERE user_id = $1', [
        user.id,
      ]);
      const walletId = walletResult.rows[0].id;

      await fastify.db.query(
        'INSERT INTO credit_transactions (user_id, wallet_id, delta, reason, reference) VALUES ($1, $2, $3, $4, $5)',
        [user.id, walletId, 10, 'Free trial welcome bonus', 'signup']
      );

      const token = fastify.jwt.sign({ userId: user.id, email: user.email });

      return reply.send({ user, token });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(400).send({ error: 'Invalid request' });
    }
  });

  fastify.post('/signin', async (request, reply) => {
    try {
      const { email } = request.body as { email: string };

      const result = await fastify.db.query('SELECT id, email, name FROM users WHERE email = $1', [
        email,
      ]);

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'User not found' });
      }

      const user = result.rows[0];
      const token = fastify.jwt.sign({ userId: user.id, email: user.email });

      return reply.send({ user, token });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(400).send({ error: 'Invalid request' });
    }
  });
}
