import { FastifyReply, FastifyRequest } from 'fastify';

export async function authenticateUserOrAddonToken(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const addonTokenRaw = request.headers['x-addon-token'];
  const addonToken = Array.isArray(addonTokenRaw) ? addonTokenRaw[0] : addonTokenRaw;

  if (typeof addonToken === 'string' && addonToken.length > 0) {
    const db = (request.server as any).db;
    if (!db) {
      reply.status(500).send({ error: 'DB not available' });
      return;
    }

    const res = await db.query(
      'SELECT user_id, dst_lang FROM addon_installations WHERE token = $1 LIMIT 1',
      [addonToken]
    );

    if (res.rows.length === 0) {
      reply.status(401).send({ error: 'Unauthorized' });
      return;
    }

    (request as any).user = { userId: res.rows[0].user_id };
    (request as any).addonInstallation = { token: addonToken, dstLang: res.rows[0].dst_lang };
    return;
  }

  try {
    await request.jwtVerify();
  } catch {
    reply.status(401).send({ error: 'Unauthorized' });
  }
}
