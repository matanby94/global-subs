import { FastifyInstance } from 'fastify';
import { authenticateInternal } from '../middleware/internal-auth';
import { db } from '../db';

export async function analyticsRoutes(fastify: FastifyInstance) {
  // List reports (paginated, filterable by type and date range)
  fastify.get(
    '/api/internal/analytics/reports',
    { preHandler: authenticateInternal },
    async (request, reply) => {
      const { type, from, to, limit = '20', offset = '0' } = request.query as Record<string, string>;

      const conditions: string[] = [];
      const params: (string | number)[] = [];
      let idx = 1;

      if (type) {
        conditions.push(`report_type = $${idx++}`);
        params.push(type);
      }
      if (from) {
        conditions.push(`report_date >= $${idx++}`);
        params.push(from);
      }
      if (to) {
        conditions.push(`report_date <= $${idx++}`);
        params.push(to);
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const limitVal = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
      const offsetVal = Math.max(parseInt(offset, 10) || 0, 0);

      params.push(limitVal, offsetVal);

      const result = await db.query(
        `SELECT id, report_type, report_date, summary, created_at
         FROM analytics_reports ${where}
         ORDER BY report_date DESC, created_at DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        params,
      );

      const countResult = await db.query(
        `SELECT COUNT(*)::int AS total FROM analytics_reports ${where}`,
        params.slice(0, params.length - 2),
      );

      reply.send({
        reports: result.rows,
        total: countResult.rows[0].total,
        limit: limitVal,
        offset: offsetVal,
      });
    },
  );

  // Get single report with full details
  fastify.get(
    '/api/internal/analytics/reports/:id',
    { preHandler: authenticateInternal },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      // Validate UUID format
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        return reply.status(400).send({ error: 'Invalid report ID' });
      }

      const result = await db.query(
        `SELECT * FROM analytics_reports WHERE id = $1`,
        [id],
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'Report not found' });
      }

      reply.send({ report: result.rows[0] });
    },
  );

  // Get latest report by type
  fastify.get(
    '/api/internal/analytics/reports/latest',
    { preHandler: authenticateInternal },
    async (request, reply) => {
      const { type = 'daily' } = request.query as { type?: string };

      if (!['daily', 'weekly'].includes(type)) {
        return reply.status(400).send({ error: 'Type must be "daily" or "weekly"' });
      }

      const result = await db.query(
        `SELECT * FROM analytics_reports
         WHERE report_type = $1
         ORDER BY report_date DESC, created_at DESC
         LIMIT 1`,
        [type],
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: `No ${type} report found` });
      }

      reply.send({ report: result.rows[0] });
    },
  );
}
