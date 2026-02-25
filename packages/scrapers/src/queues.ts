import { Queue } from 'bullmq';
import type Redis from 'ioredis';

export function createQueues(connection: Redis) {
  const tickQueue = new Queue('scrape-tick', { connection });
  const scrapeQueue = new Queue('scrape', { connection });
  // Translate queue handle so scrape processor can auto-enqueue translations.
  const translateQueue = new Queue('translate', { connection });
  return { tickQueue, scrapeQueue, translateQueue };
}
