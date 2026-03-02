import { Job, Queue } from 'bullmq';
import crypto from 'node:crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import {
  generateArtifactHash,
  normalizeSubtitleToWebVTT,
  resolveSubtitleText,
  validateWebVTT,
} from '@stremio-ai-subs/shared';
import { db } from '../db';
import { BUCKET_NAME, s3Client } from '../storage';

/**
 * source-fetch processor
 *
 * Lightweight replacement for the scrapers package `scrape` processor.
 * Fetches a subtitle source from online providers (SubDL, OpenSubtitles REST,
 * MovieSubtitles) via the shared `resolveSubtitleText` helper, stores the
 * result in S3 + `subtitle_sources`, and optionally chains into the
 * `translateQueue` when the fetched source is English and needs LLM translation.
 *
 * If the target language is found directly, the subtitle is stored as both a
 * source AND an artifact (direct import), so the next addon poll picks it up
 * via Stage 1 (artifact cache).
 */

function parseImdbFromStremioId(stremioId: string) {
  const parts = stremioId.split(':');
  const imdbTt = parts[0];
  const imdbNumeric = imdbTt.startsWith('tt') ? parseInt(imdbTt.slice(2), 10) : NaN;
  const season = parts.length >= 2 ? parseInt(parts[1], 10) : NaN;
  const episode = parts.length >= 3 ? parseInt(parts[2], 10) : NaN;

  return {
    imdbTt,
    imdbNumeric: Number.isFinite(imdbNumeric) ? imdbNumeric : null,
    season: Number.isFinite(season) ? season : null,
    episode: Number.isFinite(episode) ? episode : null,
  };
}

export async function sourceFetchProcessor(job: Job, deps?: { translateQueue?: Queue }) {
  const srcRegistry = String(job.data?.srcRegistry || '');
  const srcId = String(job.data?.srcId || '');
  const dstLang = String(job.data?.dstLang || '').toLowerCase();
  const model = String(job.data?.model || 'gpt-4');
  const userId = String(job.data?.userId || '');
  const dstNeg = Boolean(job.data?.dstNeg);
  const enNeg = Boolean(job.data?.enNeg);

  if (!srcRegistry || !srcId || !/^[a-z]{2}$/.test(dstLang)) {
    throw new Error('Invalid source-fetch job payload');
  }

  const { imdbTt, imdbNumeric, season, episode } = parseImdbFromStremioId(srcId);
  if (imdbNumeric == null) {
    await markScrapeStatus(srcRegistry, srcId, dstLang, 'failed', 'Invalid IMDB id');
    return { status: 'failed', reason: 'invalid_imdb' };
  }

  job.log(`source-fetch: ${srcRegistry} ${srcId} dst=${dstLang} model=${model}`);

  // Build list of languages to try (same logic as ensure-addon Stage 6)
  const langsToTry: Array<{ lang: string; purpose: 'direct_import' | 'translate' }> = [];
  if (!dstNeg) {
    langsToTry.push({ lang: dstLang, purpose: 'direct_import' });
  }
  if (dstLang !== 'en' && !enNeg) {
    langsToTry.push({ lang: 'en', purpose: 'translate' });
  }

  for (const { lang, purpose } of langsToTry) {
    job.log(`source-fetch: trying lang=${lang} purpose=${purpose}`);

    let resolved: Awaited<ReturnType<typeof resolveSubtitleText>>;
    try {
      resolved = await resolveSubtitleText({
        imdbTt,
        imdbNumeric,
        season,
        episode,
        lang,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      job.log(`source-fetch: resolveSubtitleText threw for lang=${lang}: ${msg}`);
      continue;
    }

    if (!resolved.ok) {
      job.log(
        `source-fetch: no subtitle for lang=${lang}: ${resolved.reason} (errors=${resolved.errors.map((e) => `${e.provider}:${e.message}`).slice(0, 3).join(' | ')})`
      );

      // Record negative cache
      await db
        .query(
          `INSERT INTO scrape_requests (src_registry, src_id, lang, status, priority, checked_at)
           VALUES ($1, $2, $3, 'not_found', 1, NOW())
           ON CONFLICT (src_registry, src_id, lang)
           DO UPDATE SET
             status = CASE
               WHEN scrape_requests.status IN ('failed', 'not_found') THEN 'not_found'
               ELSE scrape_requests.status
             END,
             checked_at = CASE
               WHEN scrape_requests.status IN ('failed', 'not_found') THEN NOW()
               ELSE scrape_requests.checked_at
             END,
             updated_at = NOW()
           WHERE scrape_requests.status IN ('failed', 'not_found', 'pending')`,
          [srcRegistry, srcId, lang]
        )
        .catch(() => undefined);
      continue;
    }

    // ── Found a subtitle ──
    job.log(
      `source-fetch: found subtitle from ${resolved.value.provider} for lang=${lang} (${resolved.value.text.length} chars)`
    );

    const normalized = normalizeSubtitleToWebVTT(resolved.value.text);
    const validation = validateWebVTT(normalized.vtt);

    if (!validation.valid) {
      job.log(
        `source-fetch: grade ${validation.grade} from ${resolved.value.provider} — skipping (invalid)`
      );
      continue;
    }

    // Store in S3 + subtitle_sources
    const contentHash = crypto.createHash('sha256').update(normalized.vtt).digest('hex');
    const sourceStorageKey = `sources/${contentHash}/${contentHash}.vtt`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: sourceStorageKey,
        Body: normalized.vtt,
        ContentType: 'text/vtt; charset=utf-8',
      })
    );

    await db.query(
      `INSERT INTO subtitle_sources (
         src_registry, src_id, lang, provider, provider_ref, download_url,
         content_hash, storage_key, original_format, status, validation, meta
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (src_registry, src_id, lang, content_hash)
       DO UPDATE SET
         storage_key = EXCLUDED.storage_key,
         status = EXCLUDED.status,
         validation = EXCLUDED.validation,
         fetched_at = NOW(),
         updated_at = NOW()`,
      [
        srcRegistry,
        srcId,
        lang,
        resolved.value.provider,
        resolved.value.providerRef,
        resolved.value.downloadUrl,
        contentHash,
        sourceStorageKey,
        normalized.format,
        'available',
        JSON.stringify(validation),
        JSON.stringify({
          detectedLang: resolved.value.detectedLang,
          filename: resolved.value.filename,
          ...resolved.value.meta,
          sourceFetched: true,
        }),
      ]
    );

    job.log(`source-fetch: stored source at ${sourceStorageKey}`);

    if (purpose === 'direct_import') {
      // Target language found — store as artifact directly (no LLM needed).
      const artifactHash = generateArtifactHash({
        srcRegistry,
        srcId,
        srcLang: dstLang,
        dstLang,
        model: 'import',
        normalization: 'v1',
        segPolicy: 'preserve_cues',
      });

      const artifactStorageKey = `artifacts/${artifactHash}/${artifactHash}.vtt`;

      await s3Client.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: artifactStorageKey,
          Body: normalized.vtt,
          ContentType: 'text/vtt; charset=utf-8',
        })
      );

      await db.query(
        `INSERT INTO artifacts (hash, src_registry, src_id, src_lang, dst_lang, model, cost_chars, storage_key, checks_passed)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (hash) DO NOTHING`,
        [
          artifactHash,
          srcRegistry,
          srcId,
          dstLang,
          dstLang,
          'import',
          normalized.vtt.length,
          artifactStorageKey,
          JSON.stringify({ cps: true, charsPerLine: true }),
        ]
      );

      // Mark scrape_requests as completed
      await markScrapeStatus(srcRegistry, srcId, dstLang, 'completed', null, resolved.value.provider);

      job.log(`source-fetch: direct import artifact stored at ${artifactStorageKey}`);
      return { status: 'completed', purpose: 'direct_import', artifactHash, sourceStorageKey };
    }

    // purpose === 'translate': English source found, enqueue LLM translation
    if (deps?.translateQueue) {
      const artifactHash = generateArtifactHash({
        srcRegistry,
        srcId,
        srcLang: 'en',
        dstLang,
        model,
        normalization: 'v1',
        segPolicy: 'preserve_cues',
      });

      // Create translation_requests row for status tracking
      await db.query(
        `INSERT INTO translation_requests (user_id, artifact_hash, status, request_meta)
         VALUES ($1, $2, 'pending', $3)
         ON CONFLICT (user_id, artifact_hash) DO UPDATE SET updated_at = NOW()`,
        [
          userId,
          artifactHash,
          JSON.stringify({
            srcRegistry,
            srcId,
            sourceLang: 'en',
            dstLang,
            model,
            sourceProvider: resolved.value.provider,
            sourceFetched: true,
          }),
        ]
      );

      await deps.translateQueue.add(
        'translate',
        {
          sourceSubtitle: normalized.vtt,
          sourceLang: 'en',
          targetLang: dstLang,
          model,
          artifactHash,
          srcRegistry,
          srcId,
        },
        {
          jobId: artifactHash,
          attempts: 3,
          backoff: { type: 'exponential', delay: 10_000 },
        }
      );

      // Mark scrape as completed (source fetched successfully)
      await markScrapeStatus(srcRegistry, srcId, dstLang, 'completed', null, resolved.value.provider);

      job.log(
        `source-fetch: enqueued translate job ${model} en→${dstLang} (artifactHash=${artifactHash})`
      );
      return { status: 'completed', purpose: 'translate', artifactHash, sourceStorageKey };
    }

    // No translateQueue provided — just store the source
    await markScrapeStatus(srcRegistry, srcId, dstLang, 'completed', null, resolved.value.provider);
    return { status: 'completed', purpose: 'source_only', sourceStorageKey };
  }

  // ── All languages exhausted — no subtitle available ──
  job.log(`source-fetch: no subtitle found from any provider for any language`);

  // Mark negative cache for dstLang
  await markScrapeStatus(srcRegistry, srcId, dstLang, 'not_found', 'No subtitle sources found at any provider');

  return { status: 'not_found' };
}

// ── Helper: update scrape_requests status ──
async function markScrapeStatus(
  srcRegistry: string,
  srcId: string,
  lang: string,
  status: string,
  error?: string | null,
  provider?: string | null
) {
  await db
    .query(
      `UPDATE scrape_requests
       SET status = $1,
           last_error = $2,
           provider = COALESCE($3, provider),
           checked_at = NOW(),
           updated_at = NOW()
       WHERE src_registry = $4 AND src_id = $5 AND lang = $6`,
      [status, error || null, provider || null, srcRegistry, srcId, lang]
    )
    .catch(() => undefined);
}
