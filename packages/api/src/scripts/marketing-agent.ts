/**
 * Marketing AI Agent
 *
 * Reads analytics reports + collects marketing-specific metrics, uses GPT-4o
 * to generate platform-tailored marketing content (Reddit, Twitter/X, Discord,
 * Hacker News, Product Hunt, Stremio Forum), and stores drafts in the
 * marketing_drafts table with a semi-automated review workflow.
 *
 * Usage:
 *   tsx src/scripts/marketing-agent.ts --mode=daily
 *   tsx src/scripts/marketing-agent.ts --mode=campaign
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
const MODE = process.argv.includes('--mode=campaign') ? 'campaign' : 'daily';
const LLM_MODEL = process.env.ANALYTICS_LLM_MODEL || 'gpt-4o';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

/* ─── Types ─── */
interface AnalyticsReport {
  id: string;
  report_type: string;
  report_date: string;
  summary: string;
  metrics: Record<string, unknown>;
  user_insights: unknown[];
}

interface MarketingMetrics {
  trendingLanguages: { src_lang: string; dst_lang: string; count: number; growth: number }[];
  signupGrowth: { current_week: number; prev_week: number; growth_pct: number };
  popularModels: { model: string; count: number; pct: number }[];
  totalTranslations: number;
  revenueBreakdown: { subscriptions: number; bundles: number; total_users: number };
  milestones: string[];
}

interface ContentDraft {
  platform: string;
  content_type: string;
  title: string | null;
  body: string;
  target: string | null;
  metadata: Record<string, unknown>;
}

interface LLMOutput {
  drafts: ContentDraft[];
  strategy_notes: string;
}

const PLATFORMS = [
  'reddit',
  'twitter',
  'discord',
  'hackernews',
  'producthunt',
  'stremio_forum',
] as const;

/* ═══════════════════════════════════════════════════════
   Phase 1: Data Collection — Latest Analytics Report
   ═══════════════════════════════════════════════════════ */

async function fetchLatestReport(): Promise<AnalyticsReport | null> {
  const result = await db.query(
    `SELECT id, report_type, report_date, summary, metrics, user_insights
     FROM analytics_reports
     ORDER BY report_date DESC, created_at DESC
     LIMIT 1`
  );
  return result.rows[0] || null;
}

/* ═══════════════════════════════════════════════════════
   Phase 2: Supplemental Marketing Metrics
   ═══════════════════════════════════════════════════════ */

async function collectMarketingMetrics(): Promise<MarketingMetrics> {
  const [trending, signupGrowth, models, totalTx, revBreakdown] = await Promise.all([
    // Trending language pairs (this week vs last week)
    db.query(`
      WITH this_week AS (
        SELECT src_lang, dst_lang, COUNT(*)::int AS cnt
        FROM artifacts
        WHERE created_at > NOW() - INTERVAL '7 days'
        GROUP BY src_lang, dst_lang
      ),
      last_week AS (
        SELECT src_lang, dst_lang, COUNT(*)::int AS cnt
        FROM artifacts
        WHERE created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days'
        GROUP BY src_lang, dst_lang
      )
      SELECT
        tw.src_lang, tw.dst_lang, tw.cnt AS count,
        CASE WHEN COALESCE(lw.cnt, 0) = 0 THEN 100
             ELSE ROUND(((tw.cnt - lw.cnt)::numeric / lw.cnt) * 100, 1)
        END AS growth
      FROM this_week tw
      LEFT JOIN last_week lw ON tw.src_lang = lw.src_lang AND tw.dst_lang = lw.dst_lang
      ORDER BY tw.cnt DESC
      LIMIT 10
    `),

    // Signup growth rate (this week vs last week)
    db.query(`
      SELECT
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS current_week,
        COUNT(*) FILTER (WHERE created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days')::int AS prev_week,
        CASE
          WHEN COUNT(*) FILTER (WHERE created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days') = 0 THEN 100
          ELSE ROUND(
            ((COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') -
              COUNT(*) FILTER (WHERE created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days'))::numeric /
              NULLIF(COUNT(*) FILTER (WHERE created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days'), 0)) * 100, 1)
        END AS growth_pct
      FROM users
    `),

    // Most popular models (with percentage)
    db.query(`
      SELECT
        model,
        COUNT(*)::int AS count,
        ROUND((COUNT(*)::numeric / NULLIF(SUM(COUNT(*)) OVER (), 0)) * 100, 1) AS pct
      FROM artifacts
      WHERE model IS NOT NULL
      GROUP BY model
      ORDER BY count DESC
    `),

    // Total translations served (for milestone detection)
    db.query(`SELECT COUNT(*)::int AS total FROM serve_events`),

    // Revenue breakdown: subscriptions vs bundles
    db.query(`
      SELECT
        COUNT(DISTINCT s.user_id)::int AS subscriptions,
        COUNT(DISTINCT CASE WHEN ct.delta > 10 THEN ct.user_id END)::int AS bundles,
        (SELECT COUNT(*)::int FROM users) AS total_users
      FROM subscriptions s
      FULL OUTER JOIN credit_transactions ct ON ct.delta > 10
      WHERE s.status = 'active' OR ct.user_id IS NOT NULL
    `),
  ]);

  const totalTranslations = totalTx.rows[0]?.total || 0;

  // Detect milestones
  const milestones: string[] = [];
  const milestoneThresholds = [100, 500, 1000, 5000, 10000, 25000, 50000, 100000];
  for (const threshold of milestoneThresholds) {
    if (totalTranslations >= threshold && totalTranslations < threshold * 1.1) {
      milestones.push(`${threshold.toLocaleString()} translations served`);
    }
  }

  const growth = signupGrowth.rows[0];
  if (growth.growth_pct > 50) {
    milestones.push(`${growth.growth_pct}% signup growth this week`);
  }

  return {
    trendingLanguages: trending.rows,
    signupGrowth: signupGrowth.rows[0],
    popularModels: models.rows,
    totalTranslations,
    revenueBreakdown: revBreakdown.rows[0] || { subscriptions: 0, bundles: 0, total_users: 0 },
    milestones,
  };
}

/* ═══════════════════════════════════════════════════════
   Phase 3: LLM Content Generation
   ═══════════════════════════════════════════════════════ */

function buildPrompt(report: AnalyticsReport | null, marketing: MarketingMetrics): string {
  const modeInstruction =
    MODE === 'campaign'
      ? `This is a CAMPAIGN burst. Generate high-impact content for all platforms, focused on milestones and key highlights. Be more promotional than daily mode.`
      : `This is a DAILY content generation run. Generate 1-2 pieces of engaging content per platform. Focus on community engagement, tips, and soft promotion.`;

  const reportSection = report
    ? `## Latest Analytics Report (${report.report_type} — ${report.report_date})

### Executive Summary
${report.summary}

### Key Metrics
${JSON.stringify(report.metrics, null, 2)}
`
    : `## Analytics Report
No recent analytics report available. Generate content based on marketing metrics only.
`;

  const milestonesSection =
    marketing.milestones.length > 0
      ? `### 🎉 Milestones Detected
${marketing.milestones.map((m) => `- ${m}`).join('\n')}
`
      : '';

  return `You are a marketing content strategist for GlobalSubs, an AI-powered subtitle translation platform.

## Product Context
GlobalSubs is a Stremio addon that provides AI-translated subtitles. Users install the addon, sign up on the website, and get 10 free translation credits. They can then buy credit packs ($9 for 50, $15 for 100) or subscribe to unlimited translations for $12/month. The addon works in the Stremio media player and automatically provides translated subtitles for movies and series.

Key value propositions:
- AI-powered translations (GPT-4, Gemini, DeepL) — much better quality than auto-generated subs
- Works directly inside Stremio — no separate tools needed
- Supports 50+ language pairs
- Free trial with 10 credits — try before you buy
- Affordable pricing — from $0.15 per translation

${modeInstruction}

${reportSection}

## Marketing Metrics

### Trending Language Pairs (this week)
${JSON.stringify(marketing.trendingLanguages, null, 2)}

### Signup Growth
${JSON.stringify(marketing.signupGrowth, null, 2)}

### Popular Models
${JSON.stringify(marketing.popularModels, null, 2)}

### Total Translations Served
${marketing.totalTranslations.toLocaleString()}

### Revenue Breakdown
${JSON.stringify(marketing.revenueBreakdown, null, 2)}

${milestonesSection}

## Platform Guidelines

### Reddit
- Target subreddits: r/Stremio, r/Addons4Stremio, r/cordcutters, r/subtitles
- Tone: Helpful community member, NOT overt advertising. Share genuine value.
- Format: Post title + body text. Titles should be catchy but not clickbaity.
- Reference real data: "We just hit X translations" or "Most popular pair this week: EN→ES"
- Include discussion prompts: "What language pairs would you like to see?"
- Content types: tip posts, milestone announcements, feature highlights, community questions

### Twitter/X
- Max 280 characters per tweet. Can suggest a thread (array of tweets) for announcements.
- Use relevant hashtags: #Stremio #AI #subtitles #StreamingTips #AITranslation
- Tone: Concise, engaging, slightly techy. Emoji welcome but don't overdo it.
- Include a CTA: link to website or addon install.

### Discord
- Format: Embed-ready with title, description, and optional fields.
- Tone: Casual, friendly, gamer-adjacent. Use emoji naturally.
- Target: Stremio community servers, streaming communities.
- Good for: Quick updates, tips, polls, engagement posts.

### Hacker News
- Only generate if there's a genuine milestone or technical achievement worth sharing.
- Format: "Show HN: ..." title + concise comment explaining the tech.
- Tone: Technical, factual, understated. NO hype language.
- Focus on the engineering: AI translation pipeline, caching strategy, multi-model support.

### Product Hunt
- Format: Maker update with title and body.
- Tone: Startup-friendly, metrics-driven, forward-looking.
- Include real numbers (translations served, growth).
- Good for: Feature launches, milestone updates.

### Stremio Community Forum
- Format: Detailed post with title and markdown body.
- Tone: Official but friendly. Community-centric.
- Content: Addon updates, changelogs, new features, known issues.
- Use structured format: What's new, How to use it, What's coming next.

## Required Output Format (JSON)
Respond with valid JSON only, no markdown fences:
{
  "drafts": [
    {
      "platform": "reddit|twitter|discord|hackernews|producthunt|stremio_forum",
      "content_type": "social_post|forum_reply|changelog",
      "title": "Post title or null",
      "body": "Main content (markdown for Reddit/forum/PH, plain text for Twitter, embed format for Discord)",
      "target": "r/Stremio, @channel, thread URL, or null",
      "metadata": { "hashtags": [], "flair": "", "tags": [], "thread": [] }
    }
  ],
  "strategy_notes": "Brief notes on content strategy and reasoning for this batch"
}

Generate ${MODE === 'campaign' ? '2-3' : '1-2'} drafts per platform. Skip platforms where content would feel forced or low-quality — better to have fewer, higher-quality pieces.`;
}

async function generateWithLLM(
  prompt: string
): Promise<{ output: LLMOutput | null; rawResponse: string }> {
  const systemPrompt = 'You are a SaaS marketing content strategist. Respond with valid JSON only.';

  // Try 1: gh models run (uses Copilot Pro+ subscription — no API key cost)
  try {
    const ghModel = LLM_MODEL.includes('/') ? LLM_MODEL : `openai/${LLM_MODEL}`;
    const tmpFile = path.join(os.tmpdir(), `marketing-prompt-${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, prompt, 'utf-8');
    try {
      const stdout = execSync(
        `cat "${tmpFile}" | gh models run ${ghModel} --system-prompt "${systemPrompt}" --temperature 0.7 --max-tokens 8192`,
        {
          maxBuffer: 10 * 1024 * 1024,
          timeout: 180_000,
          encoding: 'utf-8',
        }
      );
      const rawResponse = stdout.trim();
      const cleaned = rawResponse
        .replace(/^```(?:json)?\n?/m, '')
        .replace(/\n?```$/m, '')
        .trim();
      const output = JSON.parse(cleaned) as LLMOutput;
      console.log('✅ Content generated via gh models run (Copilot Pro+)');
      return { output, rawResponse };
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
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 8192,
        }),
      });
      if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const rawResponse = data.choices?.[0]?.message?.content?.trim() || '';
      const cleaned = rawResponse
        .replace(/^```(?:json)?\n?/m, '')
        .replace(/\n?```$/m, '')
        .trim();
      const output = JSON.parse(cleaned) as LLMOutput;
      console.log('✅ Content generated via OpenAI API');
      return { output, rawResponse };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`⚠️  OpenAI API failed: ${message}`);
    }
  }

  // Try 3: No LLM available
  console.warn('⚠️  No LLM available — cannot generate marketing content');
  return { output: null, rawResponse: '' };
}

/* ═══════════════════════════════════════════════════════
   Phase 4: Store Drafts
   ═══════════════════════════════════════════════════════ */

async function storeDrafts(
  drafts: ContentDraft[],
  sourceReportId: string | null,
  rawPrompt: string,
  rawResponse: string
): Promise<number> {
  let stored = 0;

  for (const draft of drafts) {
    // Validate platform
    if (!PLATFORMS.includes(draft.platform as (typeof PLATFORMS)[number])) {
      console.warn(`⚠️  Skipping draft with unknown platform: ${draft.platform}`);
      continue;
    }

    // Validate content_type
    const validTypes = ['social_post', 'forum_reply', 'changelog'];
    if (!validTypes.includes(draft.content_type)) {
      console.warn(`⚠️  Skipping draft with unknown content_type: ${draft.content_type}`);
      continue;
    }

    // Validate body is non-empty
    if (!draft.body || draft.body.trim().length === 0) {
      console.warn(`⚠️  Skipping draft with empty body for ${draft.platform}`);
      continue;
    }

    await db.query(
      `INSERT INTO marketing_drafts
         (platform, content_type, title, body, target, metadata, status, source_report_id, raw_prompt, raw_response)
       VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7, $8, $9)`,
      [
        draft.platform,
        draft.content_type,
        draft.title || null,
        draft.body.trim(),
        draft.target || null,
        JSON.stringify(draft.metadata || {}),
        sourceReportId,
        rawPrompt,
        rawResponse,
      ]
    );
    stored++;
  }

  return stored;
}

/* ═══════════════════════════════════════════════════════
   Main
   ═══════════════════════════════════════════════════════ */

async function main() {
  console.log(`\n📣 GlobalSubs Marketing Agent — ${MODE} mode\n`);

  // Step 1: Fetch latest analytics report
  console.log('📊 Fetching latest analytics report...');
  const report = await fetchLatestReport();
  if (report) {
    console.log(`   ✓ Found ${report.report_type} report from ${report.report_date}`);
  } else {
    console.log('   ⚠ No analytics report found — will use marketing metrics only');
  }

  // Step 2: Collect marketing-specific metrics
  console.log('📈 Collecting marketing metrics...');
  const marketing = await collectMarketingMetrics();
  console.log(`   ✓ ${marketing.totalTranslations.toLocaleString()} total translations`);
  console.log(`   ✓ ${marketing.trendingLanguages.length} trending language pairs`);
  if (marketing.milestones.length > 0) {
    console.log(`   🎉 Milestones: ${marketing.milestones.join(', ')}`);
  }

  // Step 3: Generate content with LLM
  console.log(`🤖 Generating content with ${LLM_MODEL}...`);
  const prompt = buildPrompt(report, marketing);
  const { output, rawResponse } = await generateWithLLM(prompt);

  if (!output || !output.drafts || output.drafts.length === 0) {
    console.log('❌ No content generated — exiting');
    return;
  }

  // Step 4: Store drafts
  console.log('💾 Storing drafts...');
  const stored = await storeDrafts(output.drafts, report?.id || null, prompt, rawResponse);
  console.log(`   ✓ ${stored} drafts stored (${output.drafts.length - stored} skipped)`);

  // Step 5: Print summary
  console.log('\n' + '═'.repeat(60));
  console.log('MARKETING CONTENT SUMMARY');
  console.log('═'.repeat(60));

  if (output.strategy_notes) {
    console.log(`\n📋 Strategy: ${output.strategy_notes}\n`);
  }

  // Group by platform
  const byPlatform = new Map<string, ContentDraft[]>();
  for (const draft of output.drafts) {
    const existing = byPlatform.get(draft.platform) || [];
    existing.push(draft);
    byPlatform.set(draft.platform, existing);
  }

  for (const [platform, drafts] of byPlatform) {
    console.log(
      `\n🔹 ${platform.toUpperCase()} (${drafts.length} draft${drafts.length > 1 ? 's' : ''}):`
    );
    for (const draft of drafts) {
      const title = draft.title ? `"${draft.title}"` : '(no title)';
      const target = draft.target ? `→ ${draft.target}` : '';
      const preview = draft.body.slice(0, 100).replace(/\n/g, ' ');
      console.log(`   • ${title} ${target}`);
      console.log(`     ${preview}${draft.body.length > 100 ? '...' : ''}`);
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`✅ ${stored} drafts ready for review at /api/internal/marketing/drafts`);
  console.log('═'.repeat(60) + '\n');
}

main()
  .then(() => {
    db.end();
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Marketing agent failed:', err);
    db.end();
    process.exit(1);
  });
