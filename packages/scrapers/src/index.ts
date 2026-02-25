import './env';
import pino from 'pino';
import { Worker, type Job } from 'bullmq';
import { createRedisConnection } from './redis';
import { createQueues } from './queues';
import { tickProcessor } from './processors/tick';
import { scrapeProcessor } from './processors/scrape';
import { setOpenSubtitlesOrgRedis, closePooledBrowser } from './providers/opensubtitles-org';
import { setCinemetaRedis } from './discovery/cinemeta-popular';
import { setSubdlRedis } from './providers/subdl';
import { setMovieSubtitlesRedis } from './providers/moviesubtitles';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const connection = createRedisConnection();
const { tickQueue, scrapeQueue, translateQueue } = createQueues(connection);

// Share Redis connection with providers for cross-process rate limiting.
setOpenSubtitlesOrgRedis(connection);
setCinemetaRedis(connection);
setSubdlRedis(connection);
setMovieSubtitlesRedis(connection);

const scrapersEnabled = process.env.SCRAPERS_ENABLED !== '0';
const schedulerEnabled = process.env.SCRAPERS_SCHEDULER_ENABLED === '1';

const cron = (process.env.SCRAPERS_CRON || '*/15 * * * *').trim();
const scrapeConcurrency = Math.max(1, parseInt(process.env.SCRAPERS_CONCURRENCY || '8', 10));

async function ensureRepeatableTick() {
  await tickQueue.add(
    'tick',
    {},
    {
      jobId: 'scrape-tick',
      repeat: { pattern: cron },
      removeOnComplete: true,
      removeOnFail: true,
    }
  );

  logger.info({ cron }, 'scrapers tick scheduled');
}

async function main() {
  logger.info(
    {
      enabled: scrapersEnabled,
      schedulerEnabled,
      cron,
      scrapeConcurrency,
    },
    'scrapers config'
  );

  if (schedulerEnabled) {
    await ensureRepeatableTick();
  }

  const tickWorker = new Worker(
    'scrape-tick',
    async (job: Job) => tickProcessor(job, { scrapeQueue }),
    {
      connection,
      concurrency: 1,
    }
  );

  const scrapeWorker = new Worker(
    'scrape',
    async (job: Job) => scrapeProcessor(job, { translateQueue }),
    {
      connection,
      concurrency: scrapersEnabled ? scrapeConcurrency : 0,
      // Global rate limiter: cap total scrape throughput across all worker instances.
      // Individual provider rate limits are enforced separately via Redis in each provider.
      limiter: {
        max: parseInt(process.env.SCRAPERS_RATE_LIMIT_MAX || '60', 10),
        duration: parseInt(process.env.SCRAPERS_RATE_LIMIT_DURATION_MS || '60000', 10),
      },
    }
  );

  tickWorker.on('completed', (job: Job) => logger.info({ jobId: job.id }, 'tick completed'));
  tickWorker.on('failed', (job: Job | undefined, err: Error) =>
    logger.error({ jobId: job?.id, error: err.message }, 'tick failed')
  );

  scrapeWorker.on('completed', (job: Job) => logger.info({ jobId: job.id }, 'scrape completed'));
  scrapeWorker.on('failed', (job: Job | undefined, err: Error) =>
    logger.error({ jobId: job?.id, error: err.message }, 'scrape failed')
  );

  logger.info('🚀 Scrapers started successfully');

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, closing scrapers...');
    await Promise.all([tickWorker.close(), scrapeWorker.close()]);
    await closePooledBrowser();
    await connection.quit();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error({ error: err.message }, 'scrapers failed to start');
  process.exit(1);
});
