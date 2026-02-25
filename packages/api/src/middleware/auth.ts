import { FastifyReply, FastifyRequest } from 'fastify';

export async function authenticateUser(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    reply.status(401).send({ error: 'Unauthorized' });
  }
}
