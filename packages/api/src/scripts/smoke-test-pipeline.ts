#!/usr/bin/env tsx
/**
 * Smoke-test script for the unified scraping + translation pipeline.
 *
 * Usage:
 *   npx tsx packages/api/src/scripts/smoke-test-pipeline.ts
 *
 * Prerequisites:
 *   - API running on API_URL (default http://localhost:3011)
 *   - Scrapers running
 *   - Workers running
 *   - PostgreSQL, Redis, MinIO up
 *
 * What it tests:
 *   1. /readyz — all backends reachable
 *   2. /api/internal/monitoring/pipeline — endpoint works
 *   3. /api/internal/monitoring/rate-limits — rate-limit state visible
 *   4. Queue health — no stuck jobs beyond threshold
 *   5. Negative cache state visibility
 */

const API_URL = process.env.API_URL || 'http://localhost:3011';
const INTERNAL_TOKEN = process.env.INTERNAL_API_TOKEN || 'default';

const passed: string[] = [];
const failed: string[] = [];
const warnings: string[] = [];

function ok(name: string, detail?: string) {
  passed.push(name);
  console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name: string, detail: string) {
  failed.push(name);
  console.error(`  ❌ ${name} — ${detail}`);
}

function warn(name: string, detail: string) {
  warnings.push(name);
  console.warn(`  ⚠️  ${name} — ${detail}`);
}

async function get(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'X-Internal-Token': INTERNAL_TOKEN },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return (await res.json()) as Record<string, unknown>;
}

async function testReadiness() {
  console.log('\n─── Readiness ───');
  try {
    const data = await get('/readyz');
    if (data.status === 'ready') {
      ok('Readiness probe', 'all backends reachable');
      for (const [name, check] of Object.entries(
        data.checks as Record<string, { ok: boolean; latencyMs: number }>
      )) {
        ok(`  └ ${name}`, `${check.latencyMs}ms`);
      }
    } else {
      for (const [name, check] of Object.entries(
        data.checks as Record<string, { ok: boolean; error?: string }>
      )) {
        if (check.ok) {
          ok(`  └ ${name}`);
        } else {
          fail(`  └ ${name}`, check.error || 'unreachable');
        }
      }
    }
  } catch (err) {
    fail('Readiness probe', (err as Error).message);
  }
}

async function testPipelineMonitoring() {
  console.log('\n─── Pipeline Monitoring ───');
  try {
    const data = await get('/api/internal/monitoring/pipeline');
    ok(
      'Pipeline endpoint',
      `queues: ${Object.keys(data.queues as Record<string, unknown>).length}`
    );

    // Check queues
    for (const [queueName, stats] of Object.entries(
      data.queues as Record<
        string,
        { failed: number; active: number; waiting: number; delayed: number }
      >
    )) {
      if (stats.failed > 0) {
        warn(`Queue ${queueName}`, `${stats.failed} failed jobs`);
      } else {
        ok(
          `Queue ${queueName}`,
          `active=${stats.active} waiting=${stats.waiting} delayed=${stats.delayed}`
        );
      }
    }

    // Check scrape requests
    const sr =
      (data.scrapeRequests as { byStatus?: Record<string, { count: number }> })?.byStatus || {};
    const statusLine = Object.entries(sr)
      .map(([s, d]) => `${s}=${(d as { count: number }).count}`)
      .join(', ');
    ok('Scrape requests', statusLine || 'empty');

    // Check negative cache
    const nc = (data.negativeCache as { activeWithinTTL?: number; expired?: number }) || {};
    ok('Negative cache', `active=${nc.activeWithinTTL || 0}, expired=${nc.expired || 0}`);

    // Check artifact production
    const art = (data.artifacts as { last1h?: number; last24h?: number; total?: number }) || {};
    ok(
      'Artifacts',
      `last1h=${art.last1h || 0}, last24h=${art.last24h || 0}, total=${art.total || 0}`
    );

    // Check recent failures
    const failures = (data.recentFailures || []) as Array<{
      provider?: string;
      error?: string;
      count: number;
    }>;
    if (failures.length > 0) {
      for (const f of failures.slice(0, 5)) {
        warn('Recent failure', `${f.provider || 'unknown'}: ${f.error} (×${f.count})`);
      }
    } else {
      ok('Recent failures', 'none in last 24h');
    }
  } catch (err) {
    fail('Pipeline endpoint', (err as Error).message);
  }
}

async function testRateLimits() {
  console.log('\n─── Rate Limits ───');
  try {
    const data = await get('/api/internal/monitoring/rate-limits');
    ok('Rate-limits endpoint');

    for (const [provider, state] of Object.entries(
      (data.providers || {}) as Record<
        string,
        {
          currentCount: number;
          maxRequests: number;
          utilization: string;
          blocked: boolean;
          blockedMs: number;
        }
      >
    )) {
      const status = state.blocked
        ? `BLOCKED (${Math.round(state.blockedMs / 1000)}s remaining)`
        : `${state.utilization} (${state.currentCount}/${state.maxRequests})`;
      if (state.blocked) {
        warn(`Provider: ${provider}`, status);
      } else {
        ok(`Provider: ${provider}`, status);
      }
    }
  } catch (err) {
    fail('Rate-limits endpoint', (err as Error).message);
  }
}

async function testNegativeCache() {
  console.log('\n─── Negative Cache ───');
  try {
    const data = await get('/api/internal/monitoring/negative-cache?limit=5');
    ok('Negative cache endpoint', `${data.count} entries returned`);
    const entries = (data.entries || []) as Array<{
      src_registry: string;
      src_id: string;
      lang: string;
      checked_at: string;
    }>;
    if (entries.length > 0) {
      const entry = entries[0];
      ok(
        `  └ Sample: ${entry.src_registry}|${entry.src_id}|${entry.lang}`,
        `checked_at=${entry.checked_at}`
      );
    }
  } catch (err) {
    fail('Negative cache endpoint', (err as Error).message);
  }
}

async function testHealthz() {
  console.log('\n─── Basic Health ───');
  try {
    const data = await get('/healthz');
    ok('Healthz', String(data.status));
  } catch (err) {
    fail('Healthz', (err as Error).message);
  }
}

async function main() {
  console.log(`\n🔍 Pipeline Smoke Test — ${API_URL}`);
  console.log(`   Token: ${INTERNAL_TOKEN.slice(0, 4)}...`);

  await testHealthz();
  await testReadiness();
  await testPipelineMonitoring();
  await testRateLimits();
  await testNegativeCache();

  console.log('\n═══════════════════════════');
  console.log(`  ✅ Passed:   ${passed.length}`);
  console.log(`  ⚠️  Warnings: ${warnings.length}`);
  console.log(`  ❌ Failed:   ${failed.length}`);
  console.log('═══════════════════════════\n');

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(2);
});
