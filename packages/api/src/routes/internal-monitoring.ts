import { FastifyInstance } from 'fastify';
import { authenticateInternal } from '../middleware/internal-auth';
import {
  ingestQueue,
  postcheckQueue,
  scrapeQueue,
  scrapeTickQueue,
  translateQueue,
  redisConnection,
} from '../queue';
import { db } from '../db';
import { DEFAULT_PROVIDER_LIMITS, getProviderBlockMs } from '@stremio-ai-subs/shared';
import { getAddonTransactions } from '../lib/ensure-addon';
import type { Queue } from 'bullmq';

// ──────────────────────────────────────────────
// Helper: get queue job counts in a consistent shape
// ──────────────────────────────────────────────
async function getQueueStats(queue: Queue) {
  const counts = await queue.getJobCounts(
    'waiting',
    'active',
    'completed',
    'failed',
    'delayed',
    'paused',
    'prioritized'
  );
  return {
    name: queue.name,
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
    delayed: counts.delayed ?? 0,
    paused: counts.paused ?? 0,
    prioritized: counts.prioritized ?? 0,
  };
}

export async function internalMonitoringRoutes(fastify: FastifyInstance) {
  // ──────────────────────────────────────────────
  // GET /api/internal/monitoring/pipeline
  //
  // Full pipeline overview: queue stats + DB stats + rate-limit state.
  // Single endpoint for dashboards and alerting.
  // ──────────────────────────────────────────────
  fastify.get('/pipeline', { preHandler: authenticateInternal }, async (_request, reply) => {
    const [
      // Queue stats
      scrapeTickStats,
      scrapeStats,
      ingestStats,
      translateStats,
      postcheckStats,

      // DB: scrape_requests summary
      scrapeRequestsSummary,

      // DB: negative cache stats
      negativeCacheStats,

      // DB: recent failures
      recentFailures,

      // DB: artifacts created recently
      artifactStats,

      // DB: subtitle sources
      sourceStats,
      sourcesByProvider,

      // Rate-limit state for all known providers
      ...providerBlockResults
    ] = await Promise.all([
      // Queue stats
      getQueueStats(scrapeTickQueue),
      getQueueStats(scrapeQueue),
      getQueueStats(ingestQueue),
      getQueueStats(translateQueue),
      getQueueStats(postcheckQueue),

      // Scrape requests aggregation
      db.query(`
          SELECT
            status,
            COUNT(*) AS count,
            MIN(updated_at) AS oldest_updated,
            MAX(updated_at) AS newest_updated
          FROM scrape_requests
          GROUP BY status
          ORDER BY status
        `),

      // Negative cache: how many not_found entries, how many still within TTL
      db.query(`
          SELECT
            COUNT(*) FILTER (WHERE status = 'not_found') AS total_not_found,
            COUNT(*) FILTER (
              WHERE status = 'not_found'
              AND checked_at > NOW() - INTERVAL '24 hours'
            ) AS active_negative_cache,
            COUNT(*) FILTER (
              WHERE status = 'not_found'
              AND (checked_at IS NULL OR checked_at <= NOW() - INTERVAL '24 hours')
            ) AS expired_negative_cache
          FROM scrape_requests
        `),

      // Recent scrape failures (last 24h)
      db.query(`
          SELECT
            provider,
            last_error,
            COUNT(*) AS count,
            MAX(updated_at) AS most_recent
          FROM scrape_requests
          WHERE status = 'failed' AND updated_at > NOW() - INTERVAL '24 hours'
          GROUP BY provider, last_error
          ORDER BY count DESC
          LIMIT 20
        `),

      // Artifacts created in windows
      db.query(`
          SELECT
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') AS last_1h,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS last_24h,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS last_7d,
            COUNT(*) AS total
          FROM artifacts
        `),

      // Subtitle sources breakdown by provider and status
      db.query(`
          SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'available') AS available,
            COUNT(*) FILTER (WHERE status = 'invalid') AS invalid,
            COUNT(*) FILTER (WHERE status NOT IN ('available', 'invalid')) AS other,
            COUNT(DISTINCT (src_registry, src_id)) AS unique_content,
            COUNT(*) FILTER (WHERE validation->>'grade' = 'A') AS grade_a,
            COUNT(*) FILTER (WHERE validation->>'grade' = 'B') AS grade_b,
            COUNT(*) FILTER (WHERE validation->>'grade' = 'C') AS grade_c,
            COUNT(*) FILTER (WHERE validation->>'grade' = 'F') AS grade_f,
            ROUND(AVG((validation->>'score')::numeric) FILTER (WHERE validation ? 'score'), 1) AS avg_score
          FROM subtitle_sources
        `),

      db.query(`
          SELECT provider, COUNT(*) AS cnt
          FROM subtitle_sources
          GROUP BY provider
          ORDER BY cnt DESC
        `),

      // Provider block status for each known provider
      ...Object.keys(DEFAULT_PROVIDER_LIMITS).map(async (provider) => {
        const blockMs = await getProviderBlockMs(redisConnection, provider);
        return { provider, blockedMs: blockMs, blocked: blockMs > 0 };
      }),
    ]);

    // Provider rate-limit window state (sliding window current count)
    const providerRateLimits: Record<
      string,
      {
        currentCount: number;
        maxRequests: number;
        windowMs: number;
        blocked: boolean;
        blockedMs: number;
      }
    > = {};
    for (const result of providerBlockResults) {
      const config = DEFAULT_PROVIDER_LIMITS[result.provider] || {
        maxRequests: 10,
        windowMs: 1_000,
      };

      // Read current window count from Redis sorted set
      const key = `ratelimit:provider:${result.provider}`;
      const now = Date.now();
      const windowStart = now - config.windowMs;
      // Remove expired entries and count the rest
      await redisConnection.zremrangebyscore(key, '-inf', windowStart);
      const currentCount = await redisConnection.zcard(key);

      providerRateLimits[result.provider] = {
        currentCount,
        maxRequests: config.maxRequests,
        windowMs: config.windowMs,
        blocked: result.blocked,
        blockedMs: result.blockedMs,
      };
    }

    return reply.send({
      timestamp: new Date().toISOString(),

      queues: {
        'scrape-tick': scrapeTickStats,
        scrape: scrapeStats,
        ingest: ingestStats,
        translate: translateStats,
        postcheck: postcheckStats,
      },

      scrapeRequests: {
        byStatus: scrapeRequestsSummary.rows.reduce(
          (
            acc: Record<string, { count: number; oldest: string | null; newest: string | null }>,
            row: {
              status: string;
              count: string;
              oldest_updated: string | null;
              newest_updated: string | null;
            }
          ) => {
            acc[row.status] = {
              count: parseInt(row.count, 10),
              oldest: row.oldest_updated,
              newest: row.newest_updated,
            };
            return acc;
          },
          {}
        ),
      },

      negativeCache: negativeCacheStats.rows[0]
        ? {
            totalNotFound: parseInt(negativeCacheStats.rows[0].total_not_found, 10),
            activeWithinTTL: parseInt(negativeCacheStats.rows[0].active_negative_cache, 10),
            expired: parseInt(negativeCacheStats.rows[0].expired_negative_cache, 10),
          }
        : { totalNotFound: 0, activeWithinTTL: 0, expired: 0 },

      recentFailures: recentFailures.rows.map(
        (row: {
          provider: string | null;
          last_error: string | null;
          count: string;
          most_recent: string;
        }) => ({
          provider: row.provider,
          error: row.last_error?.slice(0, 200),
          count: parseInt(row.count, 10),
          mostRecent: row.most_recent,
        })
      ),

      artifacts: artifactStats.rows[0]
        ? {
            last1h: parseInt(artifactStats.rows[0].last_1h, 10),
            last24h: parseInt(artifactStats.rows[0].last_24h, 10),
            last7d: parseInt(artifactStats.rows[0].last_7d, 10),
            total: parseInt(artifactStats.rows[0].total, 10),
          }
        : { last1h: 0, last24h: 0, last7d: 0, total: 0 },

      subtitleSources: sourceStats.rows[0]
        ? {
            total: parseInt(sourceStats.rows[0].total, 10),
            available: parseInt(sourceStats.rows[0].available, 10),
            invalid: parseInt(sourceStats.rows[0].invalid, 10),
            other: parseInt(sourceStats.rows[0].other, 10),
            uniqueContent: parseInt(sourceStats.rows[0].unique_content, 10),
            quality: {
              A: parseInt(sourceStats.rows[0].grade_a, 10),
              B: parseInt(sourceStats.rows[0].grade_b, 10),
              C: parseInt(sourceStats.rows[0].grade_c, 10),
              F: parseInt(sourceStats.rows[0].grade_f, 10),
              avgScore: parseFloat(sourceStats.rows[0].avg_score) || 0,
            },
            byProvider: sourcesByProvider.rows.reduce(
              (acc: Record<string, number>, row: { provider: string; cnt: string }) => {
                acc[row.provider] = parseInt(row.cnt, 10);
                return acc;
              },
              {}
            ),
          }
        : {
            total: 0,
            available: 0,
            invalid: 0,
            other: 0,
            uniqueContent: 0,
            quality: { A: 0, B: 0, C: 0, F: 0, avgScore: 0 },
            byProvider: {},
          },

      rateLimits: providerRateLimits,
    });
  });

  // ──────────────────────────────────────────────
  // GET /api/internal/monitoring/rate-limits
  //
  // Focused view: only rate-limit state per provider.
  // Lightweight endpoint for frequent polling.
  // ──────────────────────────────────────────────
  fastify.get('/rate-limits', { preHandler: authenticateInternal }, async (_request, reply) => {
    const providers = Object.keys(DEFAULT_PROVIDER_LIMITS);
    const results: Record<
      string,
      {
        currentCount: number;
        maxRequests: number;
        windowMs: number;
        utilization: string;
        blocked: boolean;
        blockedMs: number;
      }
    > = {};

    await Promise.all(
      providers.map(async (provider) => {
        const config = DEFAULT_PROVIDER_LIMITS[provider];
        const blockMs = await getProviderBlockMs(redisConnection, provider);

        const key = `ratelimit:provider:${provider}`;
        const now = Date.now();
        await redisConnection.zremrangebyscore(key, '-inf', now - config.windowMs);
        const currentCount = await redisConnection.zcard(key);

        results[provider] = {
          currentCount,
          maxRequests: config.maxRequests,
          windowMs: config.windowMs,
          utilization: `${Math.round((currentCount / config.maxRequests) * 100)}%`,
          blocked: blockMs > 0,
          blockedMs: blockMs,
        };
      })
    );

    return reply.send({
      timestamp: new Date().toISOString(),
      providers: results,
    });
  });

  // ──────────────────────────────────────────────
  // GET /api/internal/monitoring/negative-cache
  //
  // Detailed negative cache entries: what content is marked as not found.
  // Useful to audit false negatives.
  // ──────────────────────────────────────────────
  fastify.get('/negative-cache', { preHandler: authenticateInternal }, async (request, reply) => {
    const query = request.query as { limit?: string; expired?: string };
    const limit = Math.min(parseInt(query.limit || '50', 10) || 50, 200);
    const includeExpired = query.expired === '1' || query.expired === 'true';

    const whereClause = includeExpired
      ? `WHERE status = 'not_found'`
      : `WHERE status = 'not_found' AND checked_at > NOW() - INTERVAL '24 hours'`;

    const result = await db.query(
      `SELECT src_registry, src_id, lang, checked_at, last_error, provider, updated_at
         FROM scrape_requests
         ${whereClause}
         ORDER BY checked_at DESC NULLS LAST
         LIMIT $1`,
      [limit]
    );

    return reply.send({
      timestamp: new Date().toISOString(),
      count: result.rows.length,
      entries: result.rows,
    });
  });

  // ──────────────────────────────────────────────
  // POST /api/internal/monitoring/negative-cache/clear
  //
  // Reset specific negative cache entries to 'pending' for re-scraping.
  // Body: { srcRegistry, srcId, lang } or { all: true } for full reset.
  // ──────────────────────────────────────────────
  fastify.post(
    '/negative-cache/clear',
    { preHandler: authenticateInternal },
    async (request, reply) => {
      const body = request.body as {
        all?: boolean;
        srcRegistry?: string;
        srcId?: string;
        lang?: string;
      };

      if (body.all === true) {
        const result = await db.query(
          `UPDATE scrape_requests
           SET status = 'pending', last_error = NULL, checked_at = NULL, priority = 5
           WHERE status = 'not_found'`
        );
        return reply.send({
          cleared: result.rowCount ?? 0,
          message: 'All negative cache entries reset to pending',
        });
      }

      if (!body.srcRegistry || !body.srcId || !body.lang) {
        return reply.status(400).send({
          error: 'Provide srcRegistry, srcId, and lang — or set all: true',
        });
      }

      const result = await db.query(
        `UPDATE scrape_requests
         SET status = 'pending', last_error = NULL, checked_at = NULL, priority = 1
         WHERE src_registry = $1 AND src_id = $2 AND lang = $3 AND status = 'not_found'`,
        [body.srcRegistry, body.srcId, body.lang]
      );

      return reply.send({
        cleared: result.rowCount ?? 0,
        message: result.rowCount ? 'Entry reset to pending' : 'No matching entry found',
      });
    }
  );

  // ──────────────────────────────────────────────
  // GET /api/internal/monitoring/scrape-rate
  //
  // Hourly scrape download rate for the last 48 hours.
  // Used by the dashboard chart to visualize throughput over time.
  // ──────────────────────────────────────────────
  fastify.get('/scrape-rate', { preHandler: authenticateInternal }, async (request, reply) => {
    const query = request.query as { hours?: string };
    const hours = Math.min(Math.max(1, parseInt(query.hours || '48', 10) || 48), 168); // max 7 days

    const result = await db.query(
      `WITH hourly AS (
         SELECT
           date_trunc('hour', fetched_at) AS hour,
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'available') AS available,
           COUNT(*) FILTER (WHERE status = 'invalid') AS invalid
         FROM subtitle_sources
         WHERE fetched_at >= NOW() - ($1 || ' hours')::interval
         GROUP BY date_trunc('hour', fetched_at)
       ),
       hours_series AS (
         SELECT generate_series(
           date_trunc('hour', NOW() - ($1 || ' hours')::interval),
           date_trunc('hour', NOW()),
           '1 hour'::interval
         ) AS hour
       )
       SELECT
         hs.hour,
         COALESCE(h.total, 0) AS total,
         COALESCE(h.available, 0) AS available,
         COALESCE(h.invalid, 0) AS invalid
       FROM hours_series hs
       LEFT JOIN hourly h ON h.hour = hs.hour
       ORDER BY hs.hour ASC`,
      [hours]
    );

    // Also get completed scrape_requests per hour (broader metric — includes re-fetches)
    const scrapeResult = await db.query(
      `WITH hourly AS (
         SELECT
           date_trunc('hour', checked_at) AS hour,
           COUNT(*) AS completed,
           COUNT(*) FILTER (WHERE status = 'not_found') AS not_found
         FROM scrape_requests
         WHERE checked_at >= NOW() - ($1 || ' hours')::interval
           AND status IN ('completed', 'not_found')
         GROUP BY date_trunc('hour', checked_at)
       ),
       hours_series AS (
         SELECT generate_series(
           date_trunc('hour', NOW() - ($1 || ' hours')::interval),
           date_trunc('hour', NOW()),
           '1 hour'::interval
         ) AS hour
       )
       SELECT
         hs.hour,
         COALESCE(h.completed, 0) AS completed,
         COALESCE(h.not_found, 0) AS not_found
       FROM hours_series hs
       LEFT JOIN hourly h ON h.hour = hs.hour
       ORDER BY hs.hour ASC`,
      [hours]
    );

    const sourcesPerHour = result.rows.map(
      (row: { hour: string; total: string; available: string; invalid: string }) => ({
        hour: row.hour,
        total: parseInt(row.total, 10),
        available: parseInt(row.available, 10),
        invalid: parseInt(row.invalid, 10),
      })
    );

    const scrapesPerHour = scrapeResult.rows.map(
      (row: { hour: string; completed: string; not_found: string }) => ({
        hour: row.hour,
        completed: parseInt(row.completed, 10),
        notFound: parseInt(row.not_found, 10),
      })
    );

    // Summary stats
    const totalDownloads = sourcesPerHour.reduce(
      (a: number, b: { total: number }) => a + b.total,
      0
    );
    const avgPerHour = hours > 0 ? Math.round(totalDownloads / hours) : 0;
    const maxHour = sourcesPerHour.reduce(
      (max: { total: number; hour: string }, b: { total: number; hour: string }) =>
        b.total > max.total ? b : max,
      { total: 0, hour: '' }
    );

    return reply.send({
      timestamp: new Date().toISOString(),
      hours,
      summary: {
        totalDownloads,
        avgPerHour,
        peakHour: maxHour.hour || null,
        peakCount: maxHour.total,
      },
      sourcesPerHour,
      scrapesPerHour,
    });
  });

  // ──────────────────────────────────────────────
  // GET /api/internal/monitoring/addon-transactions
  //
  // Returns the most recent addon ensure transactions with full trace steps.
  // Used by the admin dashboard to debug subtitle delivery issues.
  // ──────────────────────────────────────────────
  fastify.get(
    '/addon-transactions',
    { preHandler: authenticateInternal },
    async (request, reply) => {
      const q = (request.query as Record<string, unknown>) || {};
      const limit = Math.min(200, Math.max(1, parseInt(String(q.limit || '50'), 10) || 50));
      return reply.send({ transactions: getAddonTransactions(limit) });
    }
  );
}
