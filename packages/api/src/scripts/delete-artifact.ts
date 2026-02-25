import '../env';

import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { db } from '../db';
import { BUCKET_NAME, s3Client } from '../storage';

async function main() {
  const hash = process.argv[2];
  if (!hash) {
    console.error('Usage: tsx src/scripts/delete-artifact.ts <artifactHash>');
    process.exit(1);
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const artifactRes = await client.query(
      'SELECT hash, storage_key FROM artifacts WHERE hash = $1',
      [hash]
    );

    if (artifactRes.rows.length === 0) {
      await client.query('ROLLBACK');
      console.log('No artifact found for hash:', hash);
      process.exit(0);
    }

    const storageKey = String(artifactRes.rows[0].storage_key);

    await client.query('DELETE FROM translation_requests WHERE artifact_hash = $1', [hash]);
    await client.query('DELETE FROM artifacts WHERE hash = $1', [hash]);

    await client.query('COMMIT');

    // Delete S3 object after DB commit (best-effort). If this fails, the artifact is still
    // removed from the app cache; the object can be cleaned up later.
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: storageKey,
      })
    );

    console.log('✅ Deleted artifact from DB and storage');
    console.log('   hash:', hash);
    console.log('   storageKey:', storageKey);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to delete artifact:', err);
    process.exit(1);
  } finally {
    client.release();
    // allow pool to drain
    await db.end().catch(() => undefined);
  }
}

main();
