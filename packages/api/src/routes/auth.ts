import { FastifyInstance } from 'fastify';
import { CreateUserSchema } from '@stremio-ai-subs/shared';

export async function authRoutes(fastify: FastifyInstance) {
  // Simple email-based auth (OTP would be added here)
  fastify.post('/signup', async (request, reply) => {
    try {
      const body = CreateUserSchema.parse(request.body);

      const existingUser = await fastify.db.query(
        'SELECT id FROM users WHERE email = $1',
        [body.email]
      );

      if (existingUser.rows.length > 0) {
        return reply.status(400).send({ error: 'User already exists' });
      }

      const result = await fastify.db.query(
        'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id, email, name, created_at',
        [body.email, body.name]
      );

      const user = result.rows[0];

      // Create wallet
      await fastify.db.query('INSERT INTO wallets (user_id, balance_credits) VALUES ($1, $2)', [
        user.id,
        0,
      ]);

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

      const result = await fastify.db.query(
        'SELECT id, email, name FROM users WHERE email = $1',
        [email]
      );

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
