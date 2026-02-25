import '../env';

import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { db } from '../db';
import { BUCKET_NAME, s3PresignClient } from '../storage';

function asJson(v: unknown): unknown {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(String(v));
  } catch {
    return v;
  }
}

async function presign(key: string): Promise<string> {
  const cmd = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ResponseContentType: 'text/vtt; charset=utf-8',
  });
  return getSignedUrl(s3PresignClient, cmd, { expiresIn: 3600 });
}

async function main() {
  const hash = process.argv[2];
  if (!hash) {
    console.error('Usage: tsx src/scripts/inspect-artifact.ts <artifactHash>');
    process.exit(1);
  }

  const client = await db.connect();
  try {
    const artifactRes = await client.query(
      `SELECT hash, src_registry, src_id, src_lang, dst_lang, model, storage_key, created_at
       FROM artifacts
       WHERE hash = $1`,
      [hash]
    );

    if (artifactRes.rows.length === 0) {
      console.log('No artifact found for hash:', hash);
      return;
    }

    const a = artifactRes.rows[0];
    console.log('Artifact:', {
      hash: a.hash,
      srcRegistry: a.src_registry,
      srcId: a.src_id,
      srcLang: a.src_lang,
      dstLang: a.dst_lang,
      model: a.model,
      storageKey: a.storage_key,
      createdAt: a.created_at,
    });

    const artifactUrl = await presign(String(a.storage_key)).catch(() => null);
    if (artifactUrl) console.log('Artifact URL (1h):', artifactUrl);

    const reqRes = await client.query(
      `SELECT user_id, status, request_meta, error, created_at, updated_at
       FROM translation_requests
       WHERE artifact_hash = $1
       ORDER BY updated_at DESC`,
      [hash]
    );

    if (reqRes.rows.length > 0) {
      console.log('Translation requests (most recent first):');
      for (const r of reqRes.rows) {
        console.log({
          userId: r.user_id,
          status: r.status,
          requestMeta: asJson(r.request_meta),
          error: r.error,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        });
      }
    } else {
      console.log('No translation_requests rows for this hash.');
    }

    // Best-effort: find baseline source (subtitle_sources) matching the artifact's source language.
    const sourceRes = await client.query(
      `SELECT provider, provider_ref, download_url, storage_key, fetched_at, content_hash, status
       FROM subtitle_sources
       WHERE src_registry = $1 AND src_id = $2 AND lang = $3 AND status = 'available'
       ORDER BY fetched_at DESC
       LIMIT 1`,
      [a.src_registry, a.src_id, a.src_lang]
    );

    if (sourceRes.rows.length === 0) {
      console.log(
        'No baseline source found in subtitle_sources for',
        `${a.src_registry}|${a.src_id}|${a.src_lang}`
      );
      console.log(
        'Note: if the source was fetched on-demand (API resolver) and not scraped, it may not be persisted.'
      );
      return;
    }

    const s = sourceRes.rows[0];
    console.log('Baseline source (subtitle_sources):', {
      provider: s.provider,
      providerRef: s.provider_ref,
      downloadUrl: s.download_url,
      storageKey: s.storage_key,
      fetchedAt: s.fetched_at,
      contentHash: s.content_hash,
      status: s.status,
    });

    const sourceUrl = await presign(String(s.storage_key)).catch(() => null);
    if (sourceUrl) console.log('Baseline source URL (1h):', sourceUrl);
  } finally {
    client.release();
    await db.end().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
