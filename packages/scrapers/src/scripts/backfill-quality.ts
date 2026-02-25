/**
 * Backfill quality scores for existing subtitle_sources.
 *
 * Downloads each source's WebVTT from S3, re-validates with the new
 * quality scoring system, and updates the validation JSON + status.
 *
 * Usage:
 *   cd packages/scrapers && npx tsx src/scripts/backfill-quality.ts
 */

import '../env';
import { db } from '../db';
import { s3Client, BUCKET_NAME } from '../storage';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { validateWebVTT } from '@stremio-ai-subs/shared';

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function main() {
  console.log('=== Subtitle Sources Quality Backfill ===\n');

  // Get all sources
  const { rows: sources } = await db.query(
    `SELECT id, storage_key, status, validation
     FROM subtitle_sources
     ORDER BY created_at ASC`
  );

  console.log(`Found ${sources.length} sources to re-validate\n`);

  const stats = {
    total: sources.length,
    processed: 0,
    upgraded: 0, // invalid → available
    downgraded: 0, // available → invalid (shouldn't happen normally)
    unchanged: 0,
    errors: 0,
    grades: { A: 0, B: 0, C: 0, F: 0 } as Record<string, number>,
  };

  for (const source of sources) {
    try {
      // Download from S3
      const resp = await s3Client.send(
        new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: source.storage_key,
        })
      );

      if (!resp.Body) {
        console.log(`  [SKIP] ${source.id} — no body from S3`);
        stats.errors++;
        continue;
      }

      const content = await streamToString(resp.Body as NodeJS.ReadableStream);
      const validation = validateWebVTT(content);
      const newStatus = validation.valid ? 'available' : 'invalid';
      const oldStatus = source.status;

      stats.grades[validation.grade] = (stats.grades[validation.grade] || 0) + 1;

      if (oldStatus !== newStatus) {
        if (oldStatus === 'invalid' && newStatus === 'available') stats.upgraded++;
        else if (oldStatus === 'available' && newStatus === 'invalid') stats.downgraded++;
      } else {
        stats.unchanged++;
      }

      // Update the row
      await db.query(
        `UPDATE subtitle_sources
         SET status = $1, validation = $2, updated_at = NOW()
         WHERE id = $3`,
        [newStatus, JSON.stringify(validation), source.id]
      );

      stats.processed++;

      if (stats.processed % 100 === 0) {
        console.log(
          `  Progress: ${stats.processed}/${stats.total} (${stats.upgraded} upgraded, ${stats.downgraded} downgraded)`
        );
      }
    } catch (err: unknown) {
      stats.errors++;
      console.error(`  [ERROR] ${source.id}: ${(err as Error).message}`);
    }
  }

  console.log('\n=== Backfill Complete ===');
  console.log(`  Total:      ${stats.total}`);
  console.log(`  Processed:  ${stats.processed}`);
  console.log(`  Upgraded:   ${stats.upgraded} (invalid → available)`);
  console.log(`  Downgraded: ${stats.downgraded} (available → invalid)`);
  console.log(`  Unchanged:  ${stats.unchanged}`);
  console.log(`  Errors:     ${stats.errors}`);
  console.log(
    `  Grades:     A=${stats.grades.A} B=${stats.grades.B} C=${stats.grades.C} F=${stats.grades.F}`
  );

  await db.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
