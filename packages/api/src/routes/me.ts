import { FastifyInstance } from 'fastify';
import { authenticateUser } from '../middleware/auth';

export async function meRoutes(fastify: FastifyInstance) {
  fastify.get('/', { preHandler: authenticateUser }, async (request, reply) => {
    const user = request.user as { userId: string };

    const result = await fastify.db.query(
      `SELECT u.id, u.email, u.name, u.created_at, w.balance_credits
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       WHERE u.id = $1`,
      [user.userId]
    );

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return reply.send(result.rows[0]);
  });
}
