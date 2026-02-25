import { Job, Queue } from 'bullmq';
import crypto from 'node:crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import {
  normalizeSubtitleToWebVTT,
  resolveSubtitleText,
  validateWebVTT,
  RateLimitError,
} from '@stremio-ai-subs/shared';
import {
  getOpenSubtitlesOrgConfigStatus,
  tryDownloadFromOpenSubtitlesOrg,
} from '../providers/opensubtitles-org';
import { db } from '../db';
import { BUCKET_NAME, s3Client } from '../storage';

function parseImdbFromStremioId(stremioId: string): {
  imdbTt: string;
  imdbNumeric: number | null;
  season: number | null;
  episode: number | null;
} {
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

export async function scrapeProcessor(job: Job, deps?: { translateQueue?: Queue }) {
  const srcRegistry = String(job.data?.srcRegistry || '');
  const srcId = String(job.data?.srcId || '');
  const lang = String(job.data?.lang || '').toLowerCase();
  const autoTranslate = job.data?.autoTranslate as
    | {
        dstLang: string;
        model: string;
        srcLang: string;
        userId: string;
        artifactHash: string;
      }
    | undefined;

  if (!srcRegistry || !srcId || !/^[a-z]{2}$/.test(lang)) {
    throw new Error('Invalid scrape job payload');
  }

  const maxAttempts =
    typeof job.opts?.attempts === 'number' && job.opts.attempts > 0 ? job.opts.attempts : 1;
  const attemptNumber = (typeof job.attemptsMade === 'number' ? job.attemptsMade : 0) + 1;
  const isLastAttempt = attemptNumber >= maxAttempts;

  job.log(`scrape: ${srcRegistry} ${srcId} lang=${lang}`);
  console.log(
    JSON.stringify({
      level: 'info',
      stage: 'scrape:start',
      srcRegistry,
      srcId,
      lang,
      attempt: `${attemptNumber}/${maxAttempts}`,
      jobId: job.id,
      autoTranslate: !!autoTranslate,
    })
  );

  async function markScrapeRequestFailure(
    errMsg: string,
    opts: { permanent: boolean; notFound?: boolean }
  ) {
    // 'not_found' = subtitle genuinely doesn't exist (negative cache).
    // 'failed'    = permanent error (bad config, invalid ID).
    // 'processing' = keep retrying via BullMQ.
    let nextStatus: string;
    if (opts.notFound && isLastAttempt) {
      nextStatus = 'not_found';
    } else if (opts.permanent || isLastAttempt) {
      nextStatus = 'failed';
    } else {
      nextStatus = 'processing';
    }

    await db.query(
      `UPDATE scrape_requests
       SET status = $1,
           attempt_count = GREATEST(attempt_count, $2),
           last_error = $3,
           checked_at = CASE WHEN $1 IN ('not_found', 'failed', 'completed') THEN NOW() ELSE checked_at END,
           updated_at = NOW()
       WHERE src_registry = $4 AND src_id = $5 AND lang = $6`,
      [nextStatus, attemptNumber, errMsg.slice(0, 2000), srcRegistry, srcId, lang]
    );
  }

  if (srcRegistry !== 'imdb') {
    await markScrapeRequestFailure(`Unsupported src_registry: ${srcRegistry}`, { permanent: true });
    return { status: 'failed', reason: 'unsupported_src_registry' };
  }

  const { imdbNumeric, season, episode } = parseImdbFromStremioId(srcId);
  if (imdbNumeric == null) {
    await markScrapeRequestFailure('Invalid imdb id', { permanent: true });
    return { status: 'failed', reason: 'invalid_imdb' };
  }

  const { imdbTt } = parseImdbFromStremioId(srcId);

  let provider:
    | 'opensubtitles_org'
    | 'subdl'
    | 'moviesubtitles'
    | 'opensubtitles'
    | 'podnapisi'
    | null = null;
  let providerRef: string | null = null;
  let downloadUrl: string | null = null;
  let rawText: string | null = null;
  let meta: Record<string, unknown> = {};

  // Try lightweight API providers first (SubDL, MovieSubtitles, OpenSubtitles REST),
  // then fall back to heavy OpenSubtitles.org headless Playwright as last resort.
  const resolved = await resolveSubtitleText({
    imdbTt,
    imdbNumeric,
    season,
    episode,
    lang,
  });

  // If all API providers failed, try OpenSubtitles.org headless (Playwright) as fallback.
  const osOrgCfg = getOpenSubtitlesOrgConfigStatus();
  const osOrg =
    !resolved.ok && osOrgCfg.enabled
      ? await tryDownloadFromOpenSubtitlesOrg({
          imdbNumeric,
          season,
          episode,
          lang,
        })
      : null;

  const finalResolved = osOrg
    ? ({
        ok: true,
        value: {
          provider: osOrg.provider,
          providerRef: osOrg.providerRef,
          downloadUrl: osOrg.downloadUrl,
          detectedLang: lang,
          filename: null,
          finalUrl: null,
          text: osOrg.text,
          meta: {},
        },
      } as const)
    : resolved;

  if (!finalResolved.ok) {
    const detail =
      finalResolved.errors.length > 0
        ? `; errors=${finalResolved.errors
            .map((e) => `${e.provider}:${e.stage}:${e.message}`)
            .slice(0, 5)
            .join(' | ')}`
        : '';

    const msg = `No subtitle candidate found (${finalResolved.reason})${detail}$${''}`.replace(
      '$',
      ''
    );
    const fullMsg = `${msg}${finalResolved.notes.length > 0 ? `; notes=${finalResolved.notes.join(' | ')}` : ''}`;

    // Not configured will never succeed on retry.
    const permanent = finalResolved.reason === 'not_configured';
    // 'no_candidate' after all providers tried = content doesn't exist on any source
    const notFound = finalResolved.reason === 'no_candidate';
    if (notFound) {
      console.log(
        JSON.stringify({ level: 'info', stage: 'scrape:not_found', srcId, lang, jobId: job.id })
      );
    }
    await markScrapeRequestFailure(fullMsg, { permanent, notFound });

    if (permanent) {
      return { status: 'failed', reason: finalResolved.reason };
    }

    // If it's a rate limit error from a provider, re-throw so BullMQ retries with backoff
    const rateLimitErr = finalResolved.errors.find((e) => e.message.includes('Rate limited'));
    if (rateLimitErr) {
      console.log(
        JSON.stringify({
          level: 'warn',
          stage: 'scrape:rate_limited',
          srcId,
          lang,
          provider: rateLimitErr.provider,
          retryAfterMs: 30_000,
          jobId: job.id,
        })
      );
      throw new RateLimitError(rateLimitErr.provider, 30_000);
    }

    throw new Error(fullMsg);
  }

  provider = finalResolved.value.provider;
  providerRef = finalResolved.value.providerRef;
  downloadUrl = finalResolved.value.downloadUrl;
  rawText = finalResolved.value.text;
  meta = {
    detectedLang: finalResolved.value.detectedLang,
    filename: finalResolved.value.filename,
    finalUrl: finalResolved.value.finalUrl,
    ...finalResolved.value.meta,
  };

  const normalized = normalizeSubtitleToWebVTT(rawText);
  const validation = validateWebVTT(normalized.vtt);

  if (!validation.valid) {
    // Grade F = truly broken (no cues, unparseable). Store as invalid.
    const details = validation.errors.slice(0, 5).join(' | ');
    job.log(
      `scrape: grade ${validation.grade} (score=${validation.score}); storing as invalid (attempt ${attemptNumber}/${maxAttempts})` +
        (details ? `; errors=${details}` : '')
    );
  } else if (validation.grade !== 'A') {
    // Grades B/C — usable but not perfect. Store as available with quality info.
    job.log(
      `scrape: grade ${validation.grade} (score=${validation.score}); ${validation.stats.cpsViolations} CPS violations, ${validation.stats.lineLengthViolations} line-length violations out of ${validation.stats.totalCues} cues`
    );
  }

  const contentHash = crypto.createHash('sha256').update(normalized.vtt).digest('hex');
  const storageKey = `sources/${contentHash}/${contentHash}.vtt`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: storageKey,
      Body: normalized.vtt,
      ContentType: 'text/vtt; charset=utf-8',
    })
  );

  await db.query(
    `INSERT INTO subtitle_sources (
       src_registry, src_id, lang, provider, provider_ref, download_url,
       content_hash, storage_key, original_format, status, validation, meta
     ) VALUES (
       $1,$2,$3,$4,$5,$6,
       $7,$8,$9,$10,$11,$12
     )
     ON CONFLICT (src_registry, src_id, lang, content_hash)
     DO UPDATE SET
       provider = EXCLUDED.provider,
       provider_ref = EXCLUDED.provider_ref,
       download_url = EXCLUDED.download_url,
       storage_key = EXCLUDED.storage_key,
       original_format = EXCLUDED.original_format,
       status = EXCLUDED.status,
       validation = EXCLUDED.validation,
       meta = EXCLUDED.meta,
       fetched_at = NOW(),
       updated_at = NOW()`,
    [
      srcRegistry,
      srcId,
      lang,
      provider,
      providerRef,
      downloadUrl,
      contentHash,
      storageKey,
      normalized.format,
      validation.valid ? 'available' : 'invalid',
      JSON.stringify(validation),
      JSON.stringify({ warnings: normalized.warnings, ...meta }),
    ]
  );

  await db.query(
    `UPDATE scrape_requests
     SET status = 'completed', provider = $1, last_error = NULL, checked_at = NOW(), updated_at = NOW()
     WHERE src_registry = $2 AND src_id = $3 AND lang = $4`,
    [provider, srcRegistry, srcId, lang]
  );

  job.log(`scrape: stored ${storageKey} (valid=${validation.valid})`);
  console.log(
    JSON.stringify({
      level: 'info',
      stage: 'scrape:completed',
      srcId,
      lang,
      provider,
      storageKey,
      valid: validation.valid,
      jobId: job.id,
    })
  );

  // ── Auto-translate callback ──
  // If this scrape was triggered by an ad-hoc request that needs LLM translation,
  // automatically enqueue a translate job now that the source is available.
  if (autoTranslate && deps?.translateQueue && validation.valid) {
    const { dstLang, model: translateModel, srcLang, userId, artifactHash } = autoTranslate;
    job.log(`scrape: auto-enqueuing translate job: ${srcLang} -> ${dstLang} (${translateModel})`);

    // Read the source we just stored
    const sourceSubtitle = normalized.vtt;

    // Create translation_requests row
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
          sourceLang: srcLang,
          dstLang,
          model: translateModel,
          sourceProvider: provider,
          autoTriggered: true,
        }),
      ]
    );

    await deps.translateQueue.add('translate', {
      sourceSubtitle,
      sourceLang: srcLang,
      targetLang: dstLang,
      model: translateModel,
      artifactHash,
      srcRegistry,
      srcId,
    });
  }

  return { status: 'completed', storageKey, contentHash, valid: validation.valid };
}
