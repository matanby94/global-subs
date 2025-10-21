import { Worker, Queue } from 'bullmq';
import Redis from 'ioredis';
import pino from 'pino';
import { ingestSubtitleProcessor } from './processors/ingest';
import { translateSubtitleProcessor } from './processors/translate';
import { postcheckSubtitleProcessor } from './processors/postcheck';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

const connection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null,
});

// Create queues
export const ingestQueue = new Queue('ingest', { connection });
export const translateQueue = new Queue('translate', { connection });
export const postcheckQueue = new Queue('postcheck', { connection });

// Create workers
const ingestWorker = new Worker('ingest', ingestSubtitleProcessor, {
  connection,
  concurrency: 5,
});

const translateWorker = new Worker('translate', translateSubtitleProcessor, {
  connection,
  concurrency: 3,
});

const postcheckWorker = new Worker('postcheck', postcheckSubtitleProcessor, {
  connection,
  concurrency: 10,
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
});

postcheckWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Postcheck job completed');
});

postcheckWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, 'Postcheck job failed');
});

logger.info('🚀 Workers started successfully');

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing workers...');
  await Promise.all([ingestWorker.close(), translateWorker.close(), postcheckWorker.close()]);
  await connection.quit();
  process.exit(0);
});
