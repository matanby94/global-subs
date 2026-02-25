import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticateInternal } from '../middleware/internal-auth';
import { ensureAddonSubtitle } from '../lib/ensure-addon';

const InternalEnsureSchema = z.object({
  userId: z.string().min(1),
  type: z.enum(['movie', 'series']),
  stremioId: z.string().min(1),
  dstLang: z.string().length(2),
});

export async function internalAddonRoutes(fastify: FastifyInstance) {
  fastify.post('/ensure', { preHandler: authenticateInternal }, async (request, reply) => {
    let body: z.infer<typeof InternalEnsureSchema>;
    try {
      body = InternalEnsureSchema.parse(request.body);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid request';
      return reply.status(400).send({ status: 'error', error: msg, subtitles: [] });
    }

    const result = await ensureAddonSubtitle(fastify, {
      userId: body.userId,
      type: body.type,
      stremioId: body.stremioId,
      dstLang: body.dstLang,
    });

    return reply.status(result.code).send(result.body);
  });
}
