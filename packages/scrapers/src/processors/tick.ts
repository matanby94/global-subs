import { Job } from 'bullmq';
import { db } from '../db';
import type { Queue } from 'bullmq';
import { discoverPopularScrapeTargets } from '../discovery/cinemeta-popular';

function getDiscoveryMode(): 'popular' | 'requests' | 'both' {
  const raw = (process.env.SCRAPERS_DISCOVERY_MODE || 'popular').trim().toLowerCase();
  if (raw === 'requests') return 'requests';
  if (raw === 'both') return 'both';
  return 'popular';
}

async function seedFromTranslationRequests(job: Job) {
  job.log('tick: discovering candidates from translation_requests');

  // Discover candidates from addon translation_requests (request_meta carries srcRegistry/srcId/sourceLang)
  await db.query(
    `INSERT INTO scrape_requests (src_registry, src_id, lang, status)
     SELECT DISTINCT
       (request_meta->>'srcRegistry') AS src_registry,
       (request_meta->>'srcId')       AS src_id,
       (request_meta->>'sourceLang')  AS lang,
       'pending'::text
     FROM translation_requests
     WHERE status IN ('pending', 'processing')
       AND request_meta ? 'srcRegistry'
       AND request_meta ? 'srcId'
       AND request_meta ? 'sourceLang'
       AND (request_meta->>'sourceLang') ~ '^[a-z]{2}$'
     ON CONFLICT (src_registry, src_id, lang)
     DO UPDATE SET
       status = CASE WHEN scrape_requests.status = 'failed' THEN 'pending' ELSE scrape_requests.status END,
       last_error = CASE WHEN scrape_requests.status = 'failed' THEN NULL ELSE scrape_requests.last_error END,
       updated_at = NOW()
    `
  );
}

async function seedFromPopularCatalog(job: Job) {
  job.log('tick: discovering candidates from Cinemeta top catalogs');

  const targets = await discoverPopularScrapeTargets();
  if (targets.length === 0) {
    job.log('tick: no popular targets discovered (check SCRAPERS_SOURCE_LANGS / counts)');
    return;
  }

  const srcRegistries: string[] = [];
  const srcIds: string[] = [];
  const langs: string[] = [];

  for (const t of targets) {
    for (const lang of t.langs) {
      srcRegistries.push(t.srcRegistry);
      srcIds.push(t.srcId);
      langs.push(lang);
    }
  }

  await db.query(
    `INSERT INTO scrape_requests (src_registry, src_id, lang, status)
     SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[])
     ON CONFLICT (src_registry, src_id, lang)
     DO UPDATE SET
       status = CASE WHEN scrape_requests.status = 'failed' THEN 'pending' ELSE scrape_requests.status END,
       last_error = CASE WHEN scrape_requests.status = 'failed' THEN NULL ELSE scrape_requests.last_error END,
       updated_at = NOW()`,
    [srcRegistries, srcIds, langs, new Array(srcRegistries.length).fill('pending')]
  );
}

export async function tickProcessor(job: Job, deps: { scrapeQueue: Queue }) {
  const batch = Math.max(1, parseInt(process.env.SCRAPERS_TICK_BATCH || '80', 10));

  const mode = getDiscoveryMode();

  if (mode === 'popular' || mode === 'both') {
    await seedFromPopularCatalog(job);
  }

  if (mode === 'requests' || mode === 'both') {
    await seedFromTranslationRequests(job);
  }

  // ── Recover stuck "processing" rows (orphaned by crashed jobs / lost Redis) ──
  const stuckThresholdMin = Math.max(
    5,
    parseInt(process.env.SCRAPERS_STUCK_THRESHOLD_MIN || '30', 10)
  );
  const recovered = await db.query(
    `UPDATE scrape_requests
     SET status = 'pending', last_error = 'recovered from stuck processing', updated_at = NOW()
     WHERE status = 'processing'
       AND updated_at < NOW() - ($1 || ' minutes')::interval`,
    [stuckThresholdMin]
  );
  if (recovered.rowCount && recovered.rowCount > 0) {
    job.log(
      `tick: recovered ${recovered.rowCount} stuck processing rows (threshold ${stuckThresholdMin}min)`
    );
  }

  // ── Negative cache TTL: re-open stale "not_found" rows for re-scraping ──
  const negativeCacheTtlDays = Math.max(
    1,
    parseInt(process.env.SCRAPERS_NEGATIVE_CACHE_TTL_DAYS || '7', 10)
  );
  const reopened = await db.query(
    `UPDATE scrape_requests
     SET status = 'pending', last_error = NULL, attempt_count = 0, updated_at = NOW()
     WHERE status = 'not_found'
       AND checked_at < NOW() - ($1 || ' days')::interval`,
    [negativeCacheTtlDays]
  );
  if (reopened.rowCount && reopened.rowCount > 0) {
    job.log(
      `tick: reopened ${reopened.rowCount} stale not_found rows (TTL ${negativeCacheTtlDays}d)`
    );
  }

  job.log(`tick: selecting up to ${batch} pending scrape_requests`);

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const claim = await client.query(
      `WITH cte AS (
         SELECT id, src_registry, src_id, lang
         FROM scrape_requests
         WHERE status = 'pending'
         ORDER BY priority ASC, updated_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE scrape_requests sr
       SET status = 'processing',
           attempt_count = attempt_count + 1,
           last_error = NULL,
           updated_at = NOW()
       FROM cte
       WHERE sr.id = cte.id
       RETURNING cte.id, cte.src_registry, cte.src_id, cte.lang
      `,
      [batch]
    );

    await client.query('COMMIT');

    for (const row of claim.rows) {
      const srcRegistry = row.src_registry as string;
      const srcId = row.src_id as string;
      const lang = row.lang as string;

      const jobId = `${srcRegistry}|${srcId}|${lang}`;
      await deps.scrapeQueue.add(
        'scrape',
        { srcRegistry, srcId, lang },
        {
          jobId,
          priority: 10, // Background scrapes: lower priority than ad-hoc (priority 1)
          removeOnComplete: true,
          attempts: 5,
          backoff: { type: 'exponential', delay: 30_000 },
        }
      );
    }

    job.log(`tick: enqueued ${claim.rows.length} scrape jobs`);
    return { enqueued: claim.rows.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
