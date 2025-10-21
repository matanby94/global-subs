import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { authRoutes } from './routes/auth';
import { creditsRoutes } from './routes/credits';
import { translationsRoutes } from './routes/translations';
import { meRoutes } from './routes/me';
import { signRoutes } from './routes/sign';
import { db } from './db';
import { s3Client } from './storage';

const PORT = parseInt(process.env.API_PORT || '3001', 10);
const HOST = process.env.API_HOST || '0.0.0.0';

async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
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

  // Plugins
  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });

  await fastify.register(jwt, {
    secret: process.env.JWT_SECRET || 'supersecretkey_change_in_production',
  });

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // Decorators
  fastify.decorate('db', db);
  fastify.decorate('s3', s3Client);

  // Health check
  fastify.get('/healthz', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Routes
  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(creditsRoutes, { prefix: '/api/credits' });
  await fastify.register(translationsRoutes, { prefix: '/api/translations' });
  await fastify.register(meRoutes, { prefix: '/api/me' });
  await fastify.register(signRoutes, { prefix: '/api/sign' });

  return fastify;
}

async function main() {
  try {
    const server = await buildServer();

    await server.listen({ port: PORT, host: HOST });
    server.log.info(`🚀 API server listening on http://${HOST}:${PORT}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { buildServer };
