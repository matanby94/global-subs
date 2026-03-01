import './env';
import './fastify-decorators';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import { ZodError } from 'zod';
import { AppError } from './lib/app-error';
import { authRoutes } from './routes/auth';
import { creditsRoutes } from './routes/credits';
import { translationsRoutes } from './routes/translations';
import { meRoutes } from './routes/me';
import { signRoutes } from './routes/sign';
import { addonRoutes } from './routes/addon';
import { internalAddonRoutes } from './routes/internal-addon';
import { internalQueuesRoutes } from './routes/internal-queues';
import { internalMonitoringRoutes } from './routes/internal-monitoring';
import { internalDashboardRoutes } from './routes/internal-dashboard';
import { webhookRoutes } from './routes/webhooks';
import { paypalWebhookRoutes } from './routes/paypal-webhooks';
import { db } from './db';
import { s3Client, BUCKET_NAME } from './storage';
import { redisConnection } from './queue';

const PORT = parseInt(process.env.API_PORT || process.env.PORT || '3011', 10);
const HOST = process.env.API_HOST || '0.0.0.0';

async function buildServer() {
  const fastify = Fastify({
    ignoreTrailingSlash: true,
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.Authorization',
          'req.headers.x-addon-token',
          'req.headers["x-addon-token"]',
          'req.headers.x-internal-token',
          'req.headers["x-internal-token"]',
          'req.headers.cookie',
          'req.headers.Cookie',
        ],
        censor: '[REDACTED]',
      },
      transport:
        process.env.NODE_ENV !== 'production'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
              },
            }
          : undefined,
    },
  });

  // Optional deep request/response logging.
  // Enable with LOG_LEVEL=debug or DEBUG_HTTP=1
  const debugHttp =
    (process.env.LOG_LEVEL || '').toLowerCase() === 'debug' || process.env.DEBUG_HTTP === '1';

  fastify.log.info(
    {
      logLevel: process.env.LOG_LEVEL || 'info',
      debugHttp,
      debugOpenSubtitles: process.env.DEBUG_OPENSUBTITLES === '1',
    },
    'logging config'
  );

  if (debugHttp) {
    fastify.addHook('onRequest', async (request) => {
      request.log.debug(
        {
          method: request.method,
          url: request.url,
          headers: request.headers,
        },
        'HTTP request'
      );
    });

    fastify.addHook('preHandler', async (request) => {
      // Avoid logging huge bodies; log size + a safe preview.
      const body = (request as unknown as { body?: unknown }).body;
      let preview: unknown = body;
      try {
        const s = typeof body === 'string' ? body : JSON.stringify(body);
        preview = s.length > 2000 ? `${s.slice(0, 2000)}…(truncated)` : s;
      } catch {
        // keep preview as-is
      }
      request.log.debug(
        {
          params: (request as unknown as { params?: unknown }).params,
          query: (request as unknown as { query?: unknown }).query,
          bodyPreview: preview,
        },
        'HTTP preHandler'
      );
    });

    fastify.addHook('onSend', async (request, reply, payload) => {
      let payloadPreview: unknown = payload;
      try {
        const s = typeof payload === 'string' ? payload : JSON.stringify(payload);
        payloadPreview = s.length > 2000 ? `${s.slice(0, 2000)}…(truncated)` : s;
      } catch {
        // keep payloadPreview as-is
      }

      request.log.debug(
        {
          statusCode: reply.statusCode,
          payloadPreview,
        },
        'HTTP response'
      );

      return payload;
    });
  }

  // Plugins
  const defaultCorsOrigin =
    process.env.WEB_ORIGIN ||
    process.env.WEB_URL ||
    (process.env.WEB_PORT ? `http://localhost:${process.env.WEB_PORT}` : 'http://localhost:3010');

  const corsOriginRaw = process.env.CORS_ORIGIN || defaultCorsOrigin;
  // Support comma-separated origins so both localhost and LAN IP work
  const corsOrigin = corsOriginRaw.includes(',')
    ? corsOriginRaw.split(',').map((o) => o.trim())
    : corsOriginRaw;

  await fastify.register(cors, {
    origin: corsOrigin,
    credentials: true,
  });

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable must be set');
  }
  await fastify.register(jwt, {
    secret: jwtSecret,
  });

  await fastify.register(helmet, {
    contentSecurityPolicy: false, // CSP is handled by the Next.js frontend
  });

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    // Internal routes are already protected by INTERNAL_API_TOKEN and are typically used
    // by dashboards / automation that can burst many requests (e.g. bull-board polling).
    allowList: (request) =>
      request.url.startsWith('/api/internal/') ||
      request.url === '/healthz' ||
      request.url === '/readyz',
  });

  // ── Global Error Handler (M4 + M5) ───────────────────────
  // All errors flow through here, producing a consistent JSON shape:
  //   { error: { code, message, statusCode, details? } }
  fastify.setErrorHandler((error, request, reply) => {
    // AppError — our own structured errors
    if (error instanceof AppError) {
      request.log.warn({ err: error, code: error.code }, error.message);
      return reply.status(error.statusCode).send(error.toJSON());
    }

    // Zod validation errors
    if (error instanceof ZodError) {
      const details = error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      }));
      request.log.warn({ validationErrors: details }, 'Request validation failed');
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          statusCode: 400,
          details,
        },
      });
    }

    // Fastify native errors (rate-limit, payload too large, etc.)
    if (error.statusCode && error.statusCode < 500) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code || 'REQUEST_ERROR',
          message: error.message,
          statusCode: error.statusCode,
        },
      });
    }

    // Unexpected errors — log full stack, return generic message
    request.log.error(error, 'Unhandled error');
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message:
          process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : error.message || 'Internal server error',
        statusCode: 500,
      },
    });
  });

  // Decorators
  fastify.decorate('db', db);
  fastify.decorate('s3', s3Client);

  // Health check — liveness (always returns ok if the process is alive)
  fastify.get('/healthz', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Readiness probe — checks DB, Redis, and S3 connectivity
  fastify.get('/readyz', async (_request, reply) => {
    const checks: Record<string, { ok: boolean; latencyMs: number; error?: string }> = {};

    // Check PostgreSQL
    const dbStart = Date.now();
    try {
      await db.query('SELECT 1');
      checks.database = { ok: true, latencyMs: Date.now() - dbStart };
    } catch (err: unknown) {
      checks.database = {
        ok: false,
        latencyMs: Date.now() - dbStart,
        error: (err as Error).message,
      };
    }

    // Check Redis
    const redisStart = Date.now();
    try {
      await redisConnection.ping();
      checks.redis = { ok: true, latencyMs: Date.now() - redisStart };
    } catch (err: unknown) {
      checks.redis = {
        ok: false,
        latencyMs: Date.now() - redisStart,
        error: (err as Error).message,
      };
    }

    // Check S3 — use ListObjectsV2 (MaxKeys=1) which works across all S3-compatible providers
    const s3Start = Date.now();
    try {
      const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
      await s3Client.send(new ListObjectsV2Command({ Bucket: BUCKET_NAME, MaxKeys: 1 }));
      checks.s3 = { ok: true, latencyMs: Date.now() - s3Start };
    } catch (err: unknown) {
      checks.s3 = { ok: false, latencyMs: Date.now() - s3Start, error: (err as Error).message };
    }

    const allOk = Object.values(checks).every((c) => c.ok);
    const code = allOk ? 200 : 503;

    return reply.status(code).send({
      status: allOk ? 'ready' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    });
  });

  // Routes
  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(creditsRoutes, { prefix: '/api/credits' });
  await fastify.register(translationsRoutes, { prefix: '/api/translations' });
  await fastify.register(meRoutes, { prefix: '/api/me' });
  await fastify.register(signRoutes, { prefix: '/api/sign' });
  await fastify.register(addonRoutes, { prefix: '/api/addon' });
  await fastify.register(internalAddonRoutes, { prefix: '/api/internal/addon' });
  await fastify.register(internalQueuesRoutes, { prefix: '/api/internal/queues' });
  await fastify.register(internalMonitoringRoutes, { prefix: '/api/internal/monitoring' });
  await fastify.register(internalDashboardRoutes, { prefix: '/api/internal/dashboard' });
  await fastify.register(webhookRoutes, { prefix: '/api/webhooks/stripe' });
  await fastify.register(paypalWebhookRoutes, { prefix: '/api/webhooks/paypal' });

  return fastify;
}

async function main() {
  let server: Awaited<ReturnType<typeof buildServer>> | undefined;

  try {
    server = await buildServer();

    await server.listen({ port: PORT, host: HOST });
    server.log.info(`🚀 API server listening on http://${HOST}:${PORT}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }

  // ── Graceful shutdown ─────────────────────────────────────
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received — shutting down gracefully…`);
    try {
      if (server) await server.close();
      await db.end();
      await redisConnection.quit();
      console.log('Cleanup complete. Exiting.');
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Catch unhandled errors so the process doesn't crash silently
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
    // In production you may want to exit; for now just log.
  });
  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
  });
}

if (require.main === module) {
  main();
}

export { buildServer };
