import './env';
import { Worker, Queue } from 'bullmq';
import Redis from 'ioredis';
import pino from 'pino';
import { ingestSubtitleProcessor } from './processors/ingest';
import { translateSubtitleProcessor } from './processors/translate';
import { postcheckSubtitleProcessor } from './processors/postcheck';
import { db } from './db';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

logger.info(
  {
    logLevel: process.env.LOG_LEVEL || 'info',
    debugWorkers: process.env.DEBUG_WORKERS === '1',
  },
  'logging config'
);

const connection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null,
  ...(process.env.REDIS_PASSWORD && { password: process.env.REDIS_PASSWORD }),
  ...(process.env.REDIS_TLS === 'true' && { tls: {} }),
});

// Create queues with production-safe defaults
const defaultJobOptions = {
  removeOnComplete: { count: 1000, age: 24 * 3600 }, // Keep last 1000 or 24h
  removeOnFail: { count: 5000, age: 7 * 24 * 3600 }, // Keep last 5000 or 7d
};

export const ingestQueue = new Queue('ingest', {
  connection,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
  },
});
export const translateQueue = new Queue('translate', {
  connection,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 3,
    backoff: { type: 'exponential', delay: 10_000 },
  },
});
export const postcheckQueue = new Queue('postcheck', {
  connection,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
  },
});

// Worker defaults for stall detection
const workerDefaults = {
  lockDuration: 300_000, // 5 min lock per job
  stalledInterval: 60_000, // Check for stalled jobs every 60s
};

// Create workers
const ingestWorker = new Worker('ingest', ingestSubtitleProcessor, {
  connection,
  concurrency: 5,
  ...workerDefaults,
});

const translateWorker = new Worker('translate', translateSubtitleProcessor, {
  connection,
  concurrency: 3,
  ...workerDefaults,
  lockDuration: 600_000, // 10 min for LLM calls
});

const postcheckWorker = new Worker('postcheck', postcheckSubtitleProcessor, {
  connection,
  concurrency: 10,
  ...workerDefaults,
});

// Event listeners
ingestWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Ingest job completed');
});

ingestWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, 'Ingest job failed');
});

translateWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Translate job completed');
});

translateWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, 'Translate job failed');

  const artifactHash = (job?.data as { artifactHash?: unknown } | undefined)?.artifactHash;
  if (typeof artifactHash !== 'string' || artifactHash.length === 0) return;

  // Best-effort status update; avoid crashing the worker on DB issues.
  db.query(
    `UPDATE translation_requests
     SET status = 'failed', error = $2, updated_at = NOW()
     WHERE artifact_hash = $1`,
    [artifactHash, err.message]
  ).catch(() => undefined);
});

postcheckWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Postcheck job completed');
});

postcheckWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, 'Postcheck job failed');
});

logger.info('🚀 Workers started successfully');

// Graceful shutdown
async function shutdown() {
  logger.info('Shutting down workers...');
  await Promise.all([ingestWorker.close(), translateWorker.close(), postcheckWorker.close()]);
  await connection.quit();
  await db.end();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
