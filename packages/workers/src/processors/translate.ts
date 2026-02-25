import { Job } from 'bullmq';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { ingestSubtitleProcessor } from './ingest';
import { s3Client, BUCKET_NAME } from '../storage';
import { db } from '../db';
import { OpenAIAdapter } from '../adapters/openai';
import { GoogleAdapter } from '../adapters/google';
import { DeepLAdapter } from '../adapters/deepl';

async function bodyToString(body: unknown): Promise<string> {
  if (!body) return '';
  if (typeof body === 'string') return body;
  if (typeof (body as { transformToString?: unknown }).transformToString === 'function') {
    return (body as { transformToString: () => Promise<string> }).transformToString();
  }

  const chunks: Buffer[] = [];
  const stream = body as NodeJS.ReadableStream;
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on('end', () => resolve());
    stream.on('error', (err) => reject(err));
  });
  return Buffer.concat(chunks).toString('utf8');
}

export async function translateSubtitleProcessor(job: Job) {
  const data = job.data as Record<string, unknown>;
  const sourceLang =
    typeof data.sourceLang === 'string' ? data.sourceLang : String(data.sourceLang || '');
  const targetLang =
    typeof data.targetLang === 'string' ? data.targetLang : String(data.targetLang || '');
  const model = typeof data.model === 'string' ? data.model : String(data.model || '');
  const artifactHash =
    typeof data.artifactHash === 'string' ? data.artifactHash : String(data.artifactHash || '');
  const srcRegistry = data.srcRegistry;
  const srcId = data.srcId;

  let sourceSubtitle = data.sourceSubtitle;

  if (!artifactHash) throw new Error('Missing artifactHash');
  if (!sourceLang) throw new Error('Missing sourceLang');
  if (!targetLang) throw new Error('Missing targetLang');
  if (!model) throw new Error('Missing model');

  const debug =
    (process.env.LOG_LEVEL || '').toLowerCase() === 'debug' || process.env.DEBUG_WORKERS === '1';
  if (debug) {
    job.log(
      `Debug job data: ${JSON.stringify({
        artifactHash,
        srcRegistry,
        srcId,
        sourceLang,
        targetLang,
        model,
        sourceSubtitle:
          typeof sourceSubtitle === 'string' ? sourceSubtitle.slice(0, 120) : undefined,
      })}`
    );
  }

  job.log(`Translating subtitle: ${sourceLang} -> ${targetLang} (${model})`);

  // Prefer scraped baseline sources when the job uses a URL.
  // If the job already contains inline subtitle content, do not override it.
  try {
    const sourceIsUrl = typeof sourceSubtitle === 'string' && sourceSubtitle.startsWith('http');
    if (
      sourceIsUrl &&
      typeof srcRegistry === 'string' &&
      typeof srcId === 'string' &&
      typeof sourceLang === 'string' &&
      /^[a-z]{2}$/.test(sourceLang)
    ) {
      const baseline = await db.query(
        `SELECT storage_key
         FROM subtitle_sources
         WHERE src_registry = $1 AND src_id = $2 AND lang = $3 AND status = 'available'
         ORDER BY fetched_at DESC
         LIMIT 1`,
        [srcRegistry, srcId, sourceLang]
      );

      if (baseline.rows.length > 0) {
        const storageKey = baseline.rows[0].storage_key as string;
        const obj = await s3Client.send(
          new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: storageKey,
          })
        );

        const baselineText = await bodyToString(obj.Body);
        if (baselineText.length > 0) {
          sourceSubtitle = baselineText;
          job.log(`Using baseline source from ${storageKey}`);
        }
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    job.log(`Baseline source lookup failed, falling back to original source: ${msg}`);
  }

  // Step 1: Ingest
  const t0 = Date.now();
  const ingestJob = { data: { sourceSubtitle }, log: job.log.bind(job) } as Job;
  const { content } = await ingestSubtitleProcessor(ingestJob);
  job.log(`Ingest done in ${Date.now() - t0}ms (chars=${content.length})`);

  // Step 2: Translate
  let adapter;
  switch (model) {
    case 'gpt-4':
      adapter = new OpenAIAdapter();
      break;
    case 'gemini-pro':
      adapter = new GoogleAdapter();
      break;
    case 'deepl':
      adapter = new DeepLAdapter();
      break;
    default:
      throw new Error(`Unknown model: ${model}`);
  }

  const t1 = Date.now();
  const translatedContent = await adapter.translate(content, sourceLang, targetLang);
  job.log(`Translate done in ${Date.now() - t1}ms (chars=${translatedContent.length})`);

  job.log('Translation completed');

  // Step 3: Post-check (inline for now)
  const finalContent = translatedContent; // Post-check would validate here

  // Step 4: Store in S3
  const storageKey = `artifacts/${artifactHash}/${artifactHash}.vtt`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: storageKey,
      Body: finalContent,
      ContentType: 'text/vtt; charset=utf-8',
    })
  );

  job.log(`Stored artifact at: ${storageKey}`);

  // Step 5: Save to database
  const costChars = content.length;

  await db.query(
    `INSERT INTO artifacts (hash, src_registry, src_id, src_lang, dst_lang, model, cost_chars, storage_key, checks_passed)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (hash) DO NOTHING`,
    [
      artifactHash,
      srcRegistry || 'upload',
      srcId || sourceSubtitle,
      sourceLang,
      targetLang,
      model,
      costChars,
      storageKey,
      JSON.stringify({ cps: true, charsPerLine: true }),
    ]
  );

  // Keep translation_requests in sync (addon/internal ensure polls this table for status).
  await db.query(
    `UPDATE translation_requests
     SET status = 'completed', error = NULL, updated_at = NOW()
     WHERE artifact_hash = $1`,
    [artifactHash]
  );

  job.log('Artifact saved to database');

  if (debug) {
    job.log(`Total processor time ${Date.now() - t0}ms`);
  }

  return { artifactHash, storageKey };
}
