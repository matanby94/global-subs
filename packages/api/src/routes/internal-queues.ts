import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter } from '@bull-board/fastify';
import { timingSafeEqual } from '../lib/timing-safe';
import {
  ingestQueue,
  postcheckQueue,
  scrapeQueue,
  scrapeTickQueue,
  translateQueue,
} from '../queue';

function parseCookie(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(value);
  }
  return out;
}

async function authenticateInternalForBrowser(request: FastifyRequest, reply: FastifyReply) {
  const expected = (process.env.INTERNAL_API_TOKEN || '').trim();
  if (!expected) {
    return reply.status(500).send({ status: 'error', error: 'INTERNAL_API_TOKEN not configured' });
  }

  const header = request.headers['x-internal-token'];
  const headerToken = Array.isArray(header) ? header[0] : header;

  const queryToken = (() => {
    const q = (request.query as Record<string, unknown> | undefined) || undefined;
    const t = q?.token;
    return typeof t === 'string' ? t : null;
  })();

  const cookies = parseCookie(request.headers.cookie);
  const cookieToken = typeof cookies.internal_token === 'string' ? cookies.internal_token : null;

  const token = headerToken || queryToken || cookieToken;
  if (!token || !timingSafeEqual(token, expected)) {
    return reply.status(401).send({ status: 'error', error: 'Unauthorized' });
  }

  // If user used ?token=..., set a cookie so the UI can load assets.
  if (
    queryToken &&
    timingSafeEqual(queryToken, expected) &&
    (!cookieToken || !timingSafeEqual(cookieToken, expected))
  ) {
    // Dev-friendly cookie: HttpOnly, SameSite=Lax, scoped to this route prefix.
    reply.header(
      'set-cookie',
      `internal_token=${encodeURIComponent(expected)}; Path=/api/internal/queues; HttpOnly; SameSite=Lax`
    );
  }
}

export async function internalQueuesRoutes(fastify: FastifyInstance) {
  const serverAdapter = new FastifyAdapter();
  serverAdapter.setBasePath('/api/internal/queues');

  createBullBoard({
    serverAdapter,
    // bull-board v5 types are slightly behind BullMQ v5's JobProgress typing.
    // Runtime compatibility is fine; cast to keep TS happy.
    queues: [
      new BullMQAdapter(translateQueue) as unknown as never,
      new BullMQAdapter(ingestQueue) as unknown as never,
      new BullMQAdapter(postcheckQueue) as unknown as never,
      new BullMQAdapter(scrapeTickQueue) as unknown as never,
      new BullMQAdapter(scrapeQueue) as unknown as never,
    ],
  });

  // bull-board uses BullMQ scripts under the hood. If a user clicks "retry" on a job that is
  // no longer in a retryable state (e.g. it moved from failed -> active, or was removed),
  // BullMQ throws "Job ... is not in the latest state. reprocessJob". Surface a clean 409
  // instead of bull-board's default 500.
  // bull-board v5's typings only allow a small set of HTTP statuses, but the Fastify adapter
  // will happily send any numeric status at runtime.
  serverAdapter.setErrorHandler(((err: Error) => {
    const message = err?.message || String(err);

    if (message.includes('is not in the latest state. reprocessJob')) {
      return {
        status: 409 as unknown as 500,
        body: {
          error: 'Conflict',
          message:
            'Job is not in a retryable state. Refresh the queue and retry only jobs currently in Failed state.',
        },
      };
    }

    const details = err?.stack;
    return {
      status: 500,
      body: {
        error: 'Internal server error',
        message,
        details,
      },
    };
  }) as unknown as Parameters<typeof serverAdapter.setErrorHandler>[0]);

  fastify.addHook('preHandler', authenticateInternalForBrowser);

  await fastify.register(serverAdapter.registerPlugin(), { basePath: '/api/internal/queues' });
}
