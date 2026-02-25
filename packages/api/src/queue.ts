import { Queue } from 'bullmq';
import Redis from 'ioredis';

export const redisConnection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null,
  ...(process.env.REDIS_PASSWORD && { password: process.env.REDIS_PASSWORD }),
  ...(process.env.REDIS_TLS === 'true' && { tls: {} }),
});

export const ingestQueue = new Queue('ingest', { connection: redisConnection });
export const translateQueue = new Queue('translate', { connection: redisConnection });
export const postcheckQueue = new Queue('postcheck', { connection: redisConnection });

export const scrapeTickQueue = new Queue('scrape-tick', { connection: redisConnection });
export const scrapeQueue = new Queue('scrape', { connection: redisConnection });
