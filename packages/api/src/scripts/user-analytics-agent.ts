/**
 * User Analytics AI Agent
 *
 * Collects backend metrics (PostgreSQL) and frontend analytics (Umami API),
 * feeds them to GPT-4o via `gh models run` (or OpenAI fallback), and stores
 * structured reports in the analytics_reports table.
 *
 * Usage (in production via API package):
 *   tsx src/scripts/user-analytics-agent.ts --mode=daily
 *   tsx src/scripts/user-analytics-agent.ts --mode=weekly
 *
 * Usage (locally against production, via wrapper script):
 *   bash scripts/analytics-prod.sh --mode=daily
 */

import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { Pool } from 'pg';
import { execSync } from 'node:child_process';

// Load env: prefer .env.analytics (local-to-prod), then .env.production, fall back to .env (server)
const repoRoot = path.resolve(__dirname, '../../../..');
for (const name of ['.env.analytics', '.env.production', '.env']) {
  const candidate = path.join(repoRoot, name);
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}

// Standalone DB pool — doesn't depend on the full API env validation
const db = new Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgresql://stremio:stremio_dev@localhost:5432/stremio_ai_subs',
  max: 5,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000,
});

/* ─── Config ─── */
const MODE = process.argv.includes('--mode=weekly') ? 'weekly' : 'daily';
const LLM_MODEL = process.env.ANALYTICS_LLM_MODEL || 'gpt-4o';
const UMAMI_API_URL = process.env.UMAMI_API_URL || '';
const UMAMI_API_TOKEN = process.env.UMAMI_API_TOKEN || '';
const UMAMI_WEBSITE_ID = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

/* ─── Types ─── */
interface Metrics {
  signup: Record<string, unknown>;
  conversion: Record<string, unknown>;
  churn: Record<string, unknown>;
  adoption: Record<string, unknown>;
  revenue: Record<string, unknown>;
  addon: Record<string, unknown>;
}

interface UmamiData {
  stats: Record<string, unknown> | null;
  events: unknown[] | null;
  topPages: unknown[] | null;
  referrers: unknown[] | null;
  devices: unknown[] | null;
}

interface AnalysisResult {
  summary: string;
  metrics_snapshot: Record<string, unknown>;
  user_insights: unknown[];
  aggregate_insights: unknown[];
  frontend_insights: Record<string, unknown>;
  suggested_actions: string[];
}

/* ═══════════════════════════════════════════════════════
   Phase 1: Data Collection — Backend (PostgreSQL)
   ═══════════════════════════════════════════════════════ */

async function collectMetrics(): Promise<Metrics> {
  const signup = await collectSignupMetrics();
  const conversion = await collectConversionMetrics();
  const churn = await collectChurnMetrics();
  const adoption = await collectAdoptionMetrics();
  const revenue = await collectRevenueMetrics();
  const addon = await collectAddonMetrics();
  return { signup, conversion, churn, adoption, revenue, addon };
}

async function collectSignupMetrics() {
  const [totals, neverTranslated, neverAddon, timeToFirst, byProvider] = await Promise.all([
    db.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS last_7d,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS last_24h
      FROM users
    `),
    db.query(`
      SELECT COUNT(*)::int AS count
      FROM users u
      WHERE NOT EXISTS (SELECT 1 FROM serve_events se WHERE se.user_id = u.id)
    `),
    db.query(`
      SELECT COUNT(*)::int AS count
      FROM users u
      WHERE NOT EXISTS (SELECT 1 FROM addon_installations ai WHERE ai.user_id = u.id)
    `),
    db.query(`
      SELECT
        AVG(EXTRACT(EPOCH FROM (first_tx - u.created_at)) / 3600)::numeric(10,1) AS avg_hours,
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (first_tx - u.created_at)) / 3600
        )::numeric(10,1) AS median_hours
      FROM users u
      JOIN LATERAL (
        SELECT MIN(se.served_at) AS first_tx
        FROM serve_events se WHERE se.user_id = u.id
      ) ft ON ft.first_tx IS NOT NULL
    `),
    db.query(`
      SELECT COALESCE(auth_provider, 'unknown') AS provider, COUNT(*)::int AS count
      FROM users GROUP BY auth_provider
    `),
  ]);

  return {
    totals: totals.rows[0],
    neverTranslated: neverTranslated.rows[0].count,
    neverInstalledAddon: neverAddon.rows[0].count,
    timeToFirstTranslation: timeToFirst.rows[0],
    byProvider: byProvider.rows,
  };
}

async function collectConversionMetrics() {
  const [freeOnly, exhaustedFree, purchasers, conversionRate] = await Promise.all([
    db.query(`
      SELECT COUNT(*)::int AS count
      FROM users u
      JOIN wallets w ON w.user_id = u.id
      WHERE NOT EXISTS (
        SELECT 1 FROM credit_transactions ct
        WHERE ct.user_id = u.id AND ct.delta > 10
      )
    `),
    db.query(`
      SELECT COUNT(*)::int AS count
      FROM wallets w
      WHERE w.balance_credits <= 0
        AND NOT EXISTS (
          SELECT 1 FROM credit_transactions ct
          WHERE ct.user_id = w.user_id AND ct.delta > 10
        )
    `),
    db.query(`
      SELECT COUNT(DISTINCT ct.user_id)::int AS count,
        AVG(EXTRACT(EPOCH FROM (ct.created_at - u.created_at)) / 86400)::numeric(10,1) AS avg_days_to_purchase
      FROM credit_transactions ct
      JOIN users u ON u.id = ct.user_id
      WHERE ct.delta > 10
    `),
    db.query(`
      SELECT
        DATE_TRUNC('week', u.created_at)::date AS cohort_week,
        COUNT(DISTINCT u.id)::int AS signups,
        COUNT(DISTINCT ct.user_id)::int AS purchasers
      FROM users u
      LEFT JOIN credit_transactions ct ON ct.user_id = u.id AND ct.delta > 10
      WHERE u.created_at > NOW() - INTERVAL '8 weeks'
      GROUP BY cohort_week ORDER BY cohort_week
    `),
  ]);

  return {
    freeOnlyUsers: freeOnly.rows[0].count,
    exhaustedFreeCredits: exhaustedFree.rows[0].count,
    purchasers: purchasers.rows[0],
    weeklyCohorts: conversionRate.rows,
  };
}

async function collectChurnMetrics() {
  const [activeInactive, declining, pendingCancel, recentChurn, addonInactive] = await Promise.all([
    db.query(`
      SELECT
        COUNT(DISTINCT user_id) FILTER (
          WHERE served_at > NOW() - INTERVAL '30 days'
        )::int AS active_30d,
        (SELECT COUNT(*)::int FROM users) -
        COUNT(DISTINCT user_id) FILTER (
          WHERE served_at > NOW() - INTERVAL '30 days'
        )::int AS inactive_30d
      FROM serve_events
    `),
    db.query(`
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT user_id,
          COUNT(*) FILTER (WHERE served_at > NOW() - INTERVAL '14 days') AS recent,
          COUNT(*) FILTER (WHERE served_at BETWEEN NOW() - INTERVAL '28 days' AND NOW() - INTERVAL '14 days') AS prior
        FROM serve_events
        WHERE served_at > NOW() - INTERVAL '28 days'
        GROUP BY user_id
        HAVING COUNT(*) FILTER (WHERE served_at > NOW() - INTERVAL '14 days') <
               COUNT(*) FILTER (WHERE served_at BETWEEN NOW() - INTERVAL '28 days' AND NOW() - INTERVAL '14 days')
      ) sub
    `),
    db.query(`
      SELECT COUNT(*)::int AS count
      FROM subscriptions WHERE cancel_at_period_end = TRUE AND status = 'active'
    `),
    db.query(`
      SELECT COUNT(*)::int AS count
      FROM subscriptions
      WHERE status IN ('past_due', 'canceled')
        AND updated_at > NOW() - INTERVAL '30 days'
    `),
    db.query(`
      SELECT COUNT(*)::int AS count
      FROM addon_installations ai
      WHERE NOT EXISTS (
        SELECT 1 FROM serve_events se
        WHERE se.user_id = ai.user_id AND se.served_at > NOW() - INTERVAL '14 days'
      )
    `),
  ]);

  return {
    activity: activeInactive.rows[0],
    decliningFrequency: declining.rows[0].count,
    pendingCancellations: pendingCancel.rows[0].count,
    recentChurn: recentChurn.rows[0].count,
    addonInstalledButInactive: addonInactive.rows[0].count,
  };
}

async function collectAdoptionMetrics() {
  const [addonRate, modelDist, libraryRate, langPairs] = await Promise.all([
    db.query(`
      SELECT
        (SELECT COUNT(DISTINCT user_id)::int FROM addon_installations) AS addon_users,
        (SELECT COUNT(*)::int FROM users) AS total_users
    `),
    db.query(`
      SELECT model, COUNT(*)::int AS count
      FROM artifacts WHERE model IS NOT NULL
      GROUP BY model ORDER BY count DESC
    `),
    db.query(`
      SELECT
        (SELECT COUNT(DISTINCT user_id)::int FROM user_library) AS library_users,
        (SELECT COUNT(*)::int FROM users) AS total_users
    `),
    db.query(`
      SELECT src_lang, dst_lang, COUNT(*)::int AS count
      FROM artifacts
      GROUP BY src_lang, dst_lang
      ORDER BY count DESC LIMIT 15
    `),
  ]);

  return {
    addonAdoption: addonRate.rows[0],
    modelDistribution: modelDist.rows,
    libraryAdoption: libraryRate.rows[0],
    languagePairs: langPairs.rows,
  };
}

async function collectRevenueMetrics() {
  const [bundleVsSub, avgCreditsBeforePurchase, creditUtil, subRetention] = await Promise.all([
    db.query(`
      SELECT
        reason,
        COUNT(*)::int AS transaction_count,
        SUM(delta)::numeric(10,2) AS total_credits
      FROM credit_transactions
      WHERE delta > 0 AND reason != 'Demo seed'
      GROUP BY reason ORDER BY total_credits DESC
    `),
    db.query(`
      SELECT AVG(credits_used)::numeric(10,1) AS avg_credits_before_purchase
      FROM (
        SELECT ct.user_id,
          (SELECT COALESCE(SUM(ABS(ct2.delta)), 0)
           FROM credit_transactions ct2
           WHERE ct2.user_id = ct.user_id AND ct2.delta < 0 AND ct2.created_at < ct.created_at
          ) AS credits_used
        FROM credit_transactions ct
        WHERE ct.delta > 10
        GROUP BY ct.user_id, ct.created_at
      ) sub
    `),
    db.query(`
      SELECT
        AVG(CASE WHEN se.user_id IS NOT NULL THEN w.balance_credits END)::numeric(10,1) AS active_avg,
        AVG(CASE WHEN se.user_id IS NULL THEN w.balance_credits END)::numeric(10,1) AS inactive_avg
      FROM wallets w
      LEFT JOIN (
        SELECT DISTINCT user_id FROM serve_events WHERE served_at > NOW() - INTERVAL '30 days'
      ) se ON se.user_id = w.user_id
    `),
    db.query(`
      SELECT
        COUNT(*)::int AS total_subscriptions,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active,
        COUNT(*) FILTER (WHERE status = 'canceled')::int AS canceled,
        AVG(EXTRACT(EPOCH FROM (
          CASE WHEN status = 'canceled' THEN updated_at ELSE NOW() END - created_at
        )) / 86400)::numeric(10,1) AS avg_duration_days
      FROM subscriptions
    `),
  ]);

  return {
    revenueByType: bundleVsSub.rows,
    avgCreditsBeforePurchase: avgCreditsBeforePurchase.rows[0],
    creditUtilization: creditUtil.rows[0],
    subscriptionRetention: subRetention.rows[0],
  };
}

async function collectAddonMetrics() {
  const [installTimeline, serveSuccess, noServes, topLangs] = await Promise.all([
    db.query(`
      SELECT
        AVG(EXTRACT(EPOCH FROM (ai.created_at - u.created_at)) / 3600)::numeric(10,1) AS avg_hours_to_install
      FROM addon_installations ai
      JOIN users u ON u.id = ai.user_id
    `),
    db.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(DISTINCT user_id)::int AS unique_users,
        COUNT(DISTINCT artifact_hash)::int AS unique_artifacts
      FROM serve_events
    `),
    db.query(`
      SELECT COUNT(DISTINCT ai.user_id)::int AS count
      FROM addon_installations ai
      WHERE NOT EXISTS (SELECT 1 FROM serve_events se WHERE se.user_id = ai.user_id)
    `),
    db.query(`
      SELECT dst_lang, COUNT(*)::int AS count
      FROM addon_installations
      GROUP BY dst_lang ORDER BY count DESC LIMIT 10
    `),
  ]);

  return {
    avgHoursToInstall: installTimeline.rows[0],
    serveEventStats: serveSuccess.rows[0],
    installedButNoServes: noServes.rows[0].count,
    topAddonLanguages: topLangs.rows,
  };
}

/* ═══════════════════════════════════════════════════════
   Phase 2: Data Collection — Frontend (Umami API)
   ═══════════════════════════════════════════════════════ */

async function collectUmamiData(): Promise<UmamiData | null> {
  if (!UMAMI_API_URL || !UMAMI_API_TOKEN || !UMAMI_WEBSITE_ID) {
    console.log('ℹ️  Umami not configured — skipping frontend analytics');
    return null;
  }

  const now = Date.now();
  const lookback = MODE === 'weekly' ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const startAt = now - lookback;
  const headers = { Authorization: `Bearer ${UMAMI_API_TOKEN}`, Accept: 'application/json' };
  const base = `${UMAMI_API_URL}/api/websites/${UMAMI_WEBSITE_ID}`;

  async function fetchJson(url: string): Promise<unknown> {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  const [stats, events, topPages, referrers, devices] = await Promise.all([
    fetchJson(`${base}/stats?startAt=${startAt}&endAt=${now}`),
    fetchJson(`${base}/events?startAt=${startAt}&endAt=${now}`),
    fetchJson(`${base}/metrics?type=url&startAt=${startAt}&endAt=${now}&limit=20`),
    fetchJson(`${base}/metrics?type=referrer&startAt=${startAt}&endAt=${now}&limit=10`),
    fetchJson(`${base}/metrics?type=device&startAt=${startAt}&endAt=${now}`),
  ]);

  return {
    stats: stats as Record<string, unknown> | null,
    events: events as unknown[] | null,
    topPages: topPages as unknown[] | null,
    referrers: referrers as unknown[] | null,
    devices: devices as unknown[] | null,
  };
}

/* ═══════════════════════════════════════════════════════
   Phase 3: LLM Analysis
   ═══════════════════════════════════════════════════════ */

function buildPrompt(metrics: Metrics, umami: UmamiData | null): string {
  const modeInstruction =
    MODE === 'weekly'
      ? 'This is a WEEKLY deep-dive report. Provide full trend analysis, cohort comparisons, and strategic recommendations across all 5 pillars.'
      : 'This is a DAILY quick summary. Focus on anomalies, urgent churn risks, and quick wins. Keep it concise.';

  const umamiSection = umami
    ? `
## Frontend Analytics (Umami — last ${MODE === 'weekly' ? '7 days' : '24 hours'})

### Site Stats
${JSON.stringify(umami.stats, null, 2)}

### Custom Events
${JSON.stringify(umami.events, null, 2)}

### Top Pages
${JSON.stringify(umami.topPages, null, 2)}

### Traffic Sources
${JSON.stringify(umami.referrers, null, 2)}

### Devices
${JSON.stringify(umami.devices, null, 2)}
`
    : '\n## Frontend Analytics\nUmami not configured — analyze backend data only.\n';

  return `You are a SaaS growth analyst for GlobalSubs, an AI-powered subtitle translation platform for Stremio.
The main product is a Stremio addon that provides AI-translated subtitles. Users sign up, get 10 free credits, and can buy credit packs ($9/50, $15/100) or an unlimited subscription ($12/month).

${modeInstruction}

Analyze the following data and produce actionable insights.

## Backend Metrics

### Signup Funnel
${JSON.stringify(metrics.signup, null, 2)}

### Free Trial → Purchase Conversion
${JSON.stringify(metrics.conversion, null, 2)}

### Churn Risk
${JSON.stringify(metrics.churn, null, 2)}

### Feature Adoption
${JSON.stringify(metrics.adoption, null, 2)}

### Revenue
${JSON.stringify(metrics.revenue, null, 2)}

### Addon Funnel (Critical — this is the primary product)
${JSON.stringify(metrics.addon, null, 2)}
${umamiSection}

## Required Output Format (JSON)
Respond with valid JSON only, no markdown fences:
{
  "summary": "Executive summary in markdown (3-5 paragraphs)",
  "metrics_snapshot": { "key_metric_name": { "value": number, "trend": "↑|↓|→", "note": "brief context" } },
  "user_insights": [{ "segment": "string", "riskLevel": "high|medium|low", "recommendation": "string", "supportingData": {} }],
  "aggregate_insights": [{ "category": "signup|conversion|churn|adoption|revenue|addon", "finding": "string", "recommendation": "string", "priority": "high|medium|low" }],
  "frontend_insights": { "key_finding": "string" },
  "suggested_actions": ["Top 3 prioritized actions for the team"]
}`;
}

/** Extract and parse JSON from an LLM response that may contain surrounding text. */
function extractJson(raw: string): unknown {
  // Strip markdown fences
  let text = raw
    .replace(/^```(?:json)?\s*\n?/gm, '')
    .replace(/\n?```\s*$/gm, '')
    .trim();

  // Isolate the outermost JSON object
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
  }

  // Remove trailing commas before } or ] (common LLM mistake)
  text = text.replace(/,\s*([}\]])/g, '$1');

  return JSON.parse(text);
}

async function analyzeWithLLM(
  prompt: string
): Promise<{ analysis: AnalysisResult | null; rawResponse: string }> {
  // Try 1: gh models run (uses Copilot Pro+ subscription — no API key cost)
  try {
    const ghModel = LLM_MODEL.includes('/') ? LLM_MODEL : `openai/${LLM_MODEL}`;
    // Write prompt to temp file to avoid shell argument length limits
    const tmpFile = path.join(os.tmpdir(), `analytics-prompt-${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, prompt, 'utf-8');
    try {
      const stdout = execSync(
        `cat "${tmpFile}" | gh models run ${ghModel} --system-prompt "You are a SaaS growth analyst. Respond with valid JSON only." --temperature 0.3 --max-tokens 4096`,
        {
          maxBuffer: 10 * 1024 * 1024,
          timeout: 120_000,
          encoding: 'utf-8',
        }
      );
      const rawResponse = stdout.trim();
      const analysis = extractJson(rawResponse) as AnalysisResult;
      console.log('✅ Analysis completed via gh models run (Copilot Pro+)');
      return { analysis, rawResponse };
    } finally {
      fs.unlinkSync(tmpFile);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`⚠️  gh models run failed: ${message}`);
  }

  // Try 2: OpenAI API (requires OPENAI_API_KEY)
  if (OPENAI_API_KEY) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: LLM_MODEL.startsWith('gpt') ? LLM_MODEL : 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: 'You are a SaaS growth analyst. Respond with valid JSON only.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 4096,
        }),
      });
      if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const rawResponse = data.choices?.[0]?.message?.content?.trim() || '';
      const analysis = extractJson(rawResponse) as AnalysisResult;
      console.log('✅ Analysis completed via OpenAI API');
      return { analysis, rawResponse };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`⚠️  OpenAI API failed: ${message}`);
    }
  }

  // Try 3: No LLM available
  console.warn('⚠️  No LLM available — storing metrics-only report');
  return { analysis: null, rawResponse: '' };
}

/* ═══════════════════════════════════════════════════════
   Phase 4: Store Report
   ═══════════════════════════════════════════════════════ */

async function storeReport(
  metrics: Metrics,
  analysis: AnalysisResult | null,
  rawPrompt: string,
  rawResponse: string
): Promise<void> {
  const reportDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const summary = analysis?.summary || `Metrics-only report (no LLM analysis). Mode: ${MODE}`;
  const metricsJson = {
    ...(analysis?.metrics_snapshot || {}),
    raw_backend: metrics,
  };
  const userInsights = analysis?.user_insights || [];

  await db.query(
    `INSERT INTO analytics_reports (report_type, report_date, summary, metrics, user_insights, raw_prompt, raw_response)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (report_type, report_date)
     DO UPDATE SET
       summary = EXCLUDED.summary,
       metrics = EXCLUDED.metrics,
       user_insights = EXCLUDED.user_insights,
       raw_prompt = EXCLUDED.raw_prompt,
       raw_response = EXCLUDED.raw_response,
       created_at = NOW()`,
    [
      MODE,
      reportDate,
      summary,
      JSON.stringify(metricsJson),
      JSON.stringify(userInsights),
      rawPrompt,
      rawResponse,
    ]
  );

  console.log(`✅ Report stored: type=${MODE}, date=${reportDate}`);
}

/* ═══════════════════════════════════════════════════════
   Main
   ═══════════════════════════════════════════════════════ */

async function main() {
  console.log(`\n🔍 GlobalSubs Analytics Agent — ${MODE} mode\n`);

  // Step 1: Collect data
  console.log('📊 Collecting backend metrics...');
  const metrics = await collectMetrics();
  console.log('   ✓ Backend metrics collected');

  console.log('📈 Collecting frontend analytics...');
  const umami = await collectUmamiData();
  if (umami) console.log('   ✓ Umami data collected');

  // Step 2: Build prompt & analyze
  console.log(`🤖 Analyzing with ${LLM_MODEL}...`);
  const prompt = buildPrompt(metrics, umami);
  const { analysis, rawResponse } = await analyzeWithLLM(prompt);

  // Step 3: Store report
  console.log('💾 Storing report...');
  await storeReport(metrics, analysis, prompt, rawResponse);

  // Step 4: Print summary
  if (analysis) {
    console.log('\n' + '═'.repeat(60));
    console.log('EXECUTIVE SUMMARY');
    console.log('═'.repeat(60));
    console.log(analysis.summary);

    if (analysis.suggested_actions?.length) {
      console.log('\n📋 TOP ACTIONS:');
      analysis.suggested_actions.forEach((action, i) => {
        console.log(`   ${i + 1}. ${action}`);
      });
    }
    console.log('═'.repeat(60) + '\n');
  }
}

main()
  .then(() => {
    db.end();
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Analytics agent failed:', err);
    db.end();
    process.exit(1);
  });
