import { FastifyInstance } from 'fastify';
import { authenticateInternal } from '../middleware/internal-auth';
import { db } from '../db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_PLATFORMS = [
  'reddit',
  'twitter',
  'discord',
  'hackernews',
  'producthunt',
  'stremio_forum',
];
const VALID_STATUSES = ['draft', 'approved', 'posted', 'rejected'];

export async function marketingRoutes(fastify: FastifyInstance) {
  // List drafts (paginated, filterable by status, platform, date range)
  fastify.get('/drafts', { preHandler: authenticateInternal }, async (request, reply) => {
    const {
      status,
      platform,
      from,
      to,
      limit = '20',
      offset = '0',
    } = request.query as Record<string, string>;

    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let idx = 1;

    if (status) {
      if (!VALID_STATUSES.includes(status)) {
        return reply.status(400).send({ error: 'Invalid status' });
      }
      conditions.push(`status = $${idx++}`);
      params.push(status);
    }
    if (platform) {
      if (!VALID_PLATFORMS.includes(platform)) {
        return reply.status(400).send({ error: 'Invalid platform' });
      }
      conditions.push(`platform = $${idx++}`);
      params.push(platform);
    }
    if (from) {
      conditions.push(`created_at >= $${idx++}`);
      params.push(from);
    }
    if (to) {
      conditions.push(`created_at <= $${idx++}`);
      params.push(to);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitVal = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const offsetVal = Math.max(parseInt(offset, 10) || 0, 0);

    params.push(limitVal, offsetVal);

    const result = await db.query(
      `SELECT id, platform, content_type, title, body, target, metadata, status,
                source_report_id, reviewed_at, posted_at, created_at
         FROM marketing_drafts ${where}
         ORDER BY created_at DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
      params
    );

    const countResult = await db.query(
      `SELECT COUNT(*)::int AS total FROM marketing_drafts ${where}`,
      params.slice(0, params.length - 2)
    );

    reply.send({
      drafts: result.rows,
      total: countResult.rows[0].total,
      limit: limitVal,
      offset: offsetVal,
    });
  });

  // Get single draft with full details
  fastify.get('/drafts/:id', { preHandler: authenticateInternal }, async (request, reply) => {
    const { id } = request.params as { id: string };

    if (!UUID_RE.test(id)) {
      return reply.status(400).send({ error: 'Invalid draft ID' });
    }

    const result = await db.query(`SELECT * FROM marketing_drafts WHERE id = $1`, [id]);

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Draft not found' });
    }

    reply.send({ draft: result.rows[0] });
  });

  // Approve a draft
  fastify.patch(
    '/drafts/:id/approve',
    { preHandler: authenticateInternal },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      if (!UUID_RE.test(id)) {
        return reply.status(400).send({ error: 'Invalid draft ID' });
      }

      const result = await db.query(
        `UPDATE marketing_drafts
         SET status = 'approved', reviewed_at = NOW()
         WHERE id = $1 AND status = 'draft'
         RETURNING id, platform, status, reviewed_at`,
        [id]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'Draft not found or not in draft status' });
      }

      reply.send({ draft: result.rows[0] });
    }
  );

  // Reject a draft
  fastify.patch(
    '/drafts/:id/reject',
    { preHandler: authenticateInternal },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { reason } = (request.body as { reason?: string }) || {};

      if (!UUID_RE.test(id)) {
        return reply.status(400).send({ error: 'Invalid draft ID' });
      }

      const result = await db.query(
        `UPDATE marketing_drafts
         SET status = 'rejected', reviewed_at = NOW(), rejection_reason = $2
         WHERE id = $1 AND status IN ('draft', 'approved')
         RETURNING id, platform, status, reviewed_at, rejection_reason`,
        [id, reason || null]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'Draft not found or already posted/rejected' });
      }

      reply.send({ draft: result.rows[0] });
    }
  );

  // Mark a draft as posted
  fastify.patch(
    '/drafts/:id/posted',
    { preHandler: authenticateInternal },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      if (!UUID_RE.test(id)) {
        return reply.status(400).send({ error: 'Invalid draft ID' });
      }

      const result = await db.query(
        `UPDATE marketing_drafts
         SET status = 'posted', posted_at = NOW()
         WHERE id = $1 AND status = 'approved'
         RETURNING id, platform, status, posted_at`,
        [id]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'Draft not found or not in approved status' });
      }

      reply.send({ draft: result.rows[0] });
    }
  );

  // Dashboard stats: counts by status and platform
  fastify.get('/stats', { preHandler: authenticateInternal }, async (_request, reply) => {
    const [byStatus, byPlatform, recent] = await Promise.all([
      db.query(`
          SELECT status, COUNT(*)::int AS count
          FROM marketing_drafts
          GROUP BY status
          ORDER BY status
        `),
      db.query(`
          SELECT platform, status, COUNT(*)::int AS count
          FROM marketing_drafts
          GROUP BY platform, status
          ORDER BY platform, status
        `),
      db.query(`
          SELECT id, platform, content_type, title, status, created_at
          FROM marketing_drafts
          ORDER BY created_at DESC
          LIMIT 10
        `),
    ]);

    reply.send({
      by_status: byStatus.rows,
      by_platform: byPlatform.rows,
      recent: recent.rows,
    });
  });
}
