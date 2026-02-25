import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { timingSafeEqual } from '../lib/timing-safe';

/**
 * Serves a self-contained admin dashboard HTML page at /api/internal/dashboard.
 * Auth: INTERNAL_API_TOKEN via query param, header, or cookie (same as bull-board).
 */

function parseCookie(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(value);
  }
  return out;
}

async function authenticateDashboard(request: FastifyRequest, reply: FastifyReply) {
  const expected = (process.env.INTERNAL_API_TOKEN || '').trim();
  if (!expected) {
    return reply.status(500).send('INTERNAL_API_TOKEN not configured');
  }

  const header = request.headers['x-internal-token'];
  const headerToken = Array.isArray(header) ? header[0] : header;

  const queryToken = (() => {
    const q = (request.query as Record<string, unknown> | undefined) || undefined;
    const t = q?.token;
    return typeof t === 'string' ? t : null;
  })();

  const cookies = parseCookie(request.headers.cookie);
  const cookieToken = typeof cookies.internal_token === 'string' ? cookies.internal_token : null;

  const token = headerToken || queryToken || cookieToken;
  if (!token || !timingSafeEqual(token, expected)) {
    return reply.status(401).send('Unauthorized — pass ?token=YOUR_INTERNAL_API_TOKEN');
  }

  if (
    queryToken &&
    timingSafeEqual(queryToken, expected) &&
    (!cookieToken || !timingSafeEqual(cookieToken, expected))
  ) {
    reply.header(
      'set-cookie',
      `internal_token=${encodeURIComponent(expected)}; Path=/api/internal/; HttpOnly; SameSite=Lax`
    );
  }
}

export async function internalDashboardRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateDashboard);

  fastify.get('/', async (_request, reply) => {
    reply.type('text/html').send(dashboardHTML());
  });
}

function dashboardHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GlobalSubs — Admin Dashboard</title>
<style>
  :root {
    --bg: #0f1117;
    --surface: #1a1d27;
    --surface2: #242836;
    --border: #2e3345;
    --text: #e4e6ef;
    --text2: #9499b3;
    --green: #34d399;
    --yellow: #fbbf24;
    --red: #f87171;
    --blue: #60a5fa;
    --purple: #a78bfa;
    --cyan: #22d3ee;
    --orange: #fb923c;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    padding: 0;
  }
  .header {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 16px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .header h1 {
    font-size: 18px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .header h1 span { opacity: 0.5; font-weight: 400; }
  .header-right {
    display: flex;
    align-items: center;
    gap: 16px;
    font-size: 13px;
    color: var(--text2);
  }
  .status-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 4px;
  }
  .status-dot.ok { background: var(--green); }
  .status-dot.warn { background: var(--yellow); }
  .status-dot.error { background: var(--red); }
  .content { padding: 24px; max-width: 1400px; margin: 0 auto; }

  /* Grid */
  .grid { display: grid; gap: 16px; margin-bottom: 24px; }
  .grid-5 { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
  .grid-4 { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
  .grid-3 { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
  .grid-2 { grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); }

  /* Cards */
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px;
  }
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  .card-title {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text2);
    font-weight: 600;
    display: flex;
    align-items: center;
  }
  .card-badge {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 600;
  }

  /* Stat cards */
  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px;
    display: flex;
    flex-direction: column;
  }
  .stat-label {
    font-size: 12px;
    color: var(--text2);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
  }
  .stat-value {
    font-size: 32px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .stat-sub {
    font-size: 12px;
    color: var(--text2);
    margin-top: 8px;
  }

  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  thead th {
    text-align: left;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    color: var(--text2);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
  }
  tbody td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
  }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover { background: var(--surface2); }

  /* Tags */
  .tag {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
  }
  .tag-green { background: #34d39920; color: var(--green); }
  .tag-yellow { background: #fbbf2420; color: var(--yellow); }
  .tag-red { background: #f8717120; color: var(--red); }
  .tag-blue { background: #60a5fa20; color: var(--blue); }
  .tag-purple { background: #a78bfa20; color: var(--purple); }
  .tag-gray { background: #9499b320; color: var(--text2); }

  /* Progress bars */
  .progress-bar {
    height: 6px;
    background: var(--surface2);
    border-radius: 3px;
    overflow: hidden;
    margin-top: 8px;
  }
  .progress-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.5s ease;
  }

  /* Section headers */
  .section-title {
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* Refresh indicator */
  .refreshing { opacity: 0.5; transition: opacity 0.2s; }
  .loading-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid var(--border);
    border-top-color: var(--blue);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Queue bars */
  .queue-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
  }
  .queue-row:last-child { border-bottom: none; }
  .queue-name {
    font-weight: 600;
    min-width: 110px;
    font-size: 13px;
  }
  .queue-counts {
    display: flex;
    gap: 12px;
    font-size: 12px;
    flex: 1;
  }
  .queue-count {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .queue-count .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  /* Links */
  a { color: var(--blue); text-decoration: none; }
  a:hover { text-decoration: underline; }

  .empty-state {
    text-align: center;
    padding: 32px;
    color: var(--text2);
    font-size: 13px;
  }

  /* Info tooltips */
  .info-tip {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--surface2);
    color: var(--text2);
    font-size: 10px;
    font-weight: 700;
    cursor: help;
    margin-left: 6px;
    flex-shrink: 0;
    vertical-align: middle;
    border: 1px solid var(--border);
    font-style: normal;
    line-height: 1;
  }
  .info-tip:hover { background: var(--border); color: var(--text); }
  .info-tip .tip-content {
    display: none;
    position: fixed;
    background: #1e2130;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px 14px;
    font-size: 12px;
    font-weight: 400;
    line-height: 1.5;
    color: var(--text);
    min-width: 260px;
    max-width: 340px;
    white-space: normal;
    z-index: 1000;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    text-transform: none;
    letter-spacing: 0;
    pointer-events: none;
  }
  .info-tip .tip-content::after {
    content: '';
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    border: 6px solid transparent;
  }
  .info-tip .tip-content.tip-above::after {
    top: 100%;
    border-top-color: var(--border);
  }
  .info-tip .tip-content.tip-below::after {
    bottom: 100%;
    border-bottom-color: var(--border);
  }
  .info-tip .tip-content.tip-visible { display: block; }
  .tip-content strong { color: var(--cyan); }
  .tip-content .tip-warn { color: var(--yellow); }
  .tip-content .tip-action { color: var(--green); font-style: italic; }

  /* Button */
  .btn {
    padding: 6px 14px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--surface2);
    color: var(--text);
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: background 0.15s;
  }
  .btn:hover { background: var(--border); }
  .btn-sm { padding: 3px 10px; font-size: 11px; }
  .btn-green { border-color: #34d39960; color: var(--green); }
  .btn-green:hover { background: #34d39920; }
  .btn-blue { border-color: #60a5fa60; color: var(--blue); }
  .btn-blue:hover { background: #60a5fa20; }

  /* Addon Transaction Log */
  .tx-list { max-height: 600px; overflow-y: auto; }
  .tx-row {
    border-bottom: 1px solid var(--border);
    padding: 12px 0;
    cursor: pointer;
    transition: background 0.1s;
  }
  .tx-row:hover { background: var(--surface2); }
  .tx-row:last-child { border-bottom: none; }
  .tx-header {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .tx-id {
    font-family: monospace;
    font-size: 11px;
    color: var(--text2);
  }
  .tx-steps {
    display: none;
    margin-top: 10px;
    padding: 10px 14px;
    background: var(--bg);
    border-radius: 8px;
    border: 1px solid var(--border);
    font-family: monospace;
    font-size: 12px;
    line-height: 1.7;
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 400px;
    overflow-y: auto;
  }
  .tx-steps.open { display: block; }
  .tx-step-stage {
    color: var(--cyan);
    font-weight: 600;
  }
  .tx-step-detail { color: var(--text); }
  .tx-step-data { color: var(--text2); font-size: 11px; }
  .tx-copy-area {
    display: none;
    margin-top: 8px;
  }
  .tx-copy-area.open { display: block; }
  .tx-copy-area textarea {
    width: 100%;
    height: 180px;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 10px;
    font-family: monospace;
    font-size: 11px;
    resize: vertical;
  }
  .tx-filter {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .tx-filter select, .tx-filter input {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    padding: 4px 10px;
    font-size: 12px;
  }

  /* Chart */
  .chart-container {
    position: relative;
    width: 100%;
    overflow-x: auto;
  }
  .chart-legend {
    display: flex;
    gap: 20px;
    font-size: 12px;
    margin-top: 12px;
    color: var(--text2);
  }
  .chart-legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .chart-legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 2px;
  }
  .chart-summary {
    display: flex;
    gap: 32px;
    margin-bottom: 16px;
    font-size: 13px;
  }
  .chart-summary-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .chart-summary-value {
    font-size: 22px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .chart-summary-label {
    font-size: 11px;
    color: var(--text2);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
</style>
</head>
<body>

<div class="header">
  <h1>🌐 GlobalSubs <span>Admin Dashboard</span></h1>
  <div class="header-right">
    <span id="systemStatus"></span>
    <span id="lastUpdate"></span>
    <span id="loadingIndicator" style="display:none"><span class="loading-spinner"></span></span>
    <button class="btn" onclick="refresh()">Refresh</button>
    <a href="/api/internal/queues" class="btn" style="text-decoration:none">Queue Board →</a>
  </div>
</div>

<div class="content" id="app">
  <div style="text-align:center;padding:80px;color:var(--text2)">
    <span class="loading-spinner" style="width:24px;height:24px;border-width:3px"></span>
    <p style="margin-top:16px">Loading dashboard…</p>
  </div>
</div>

<script>
const BASE = '';  // same origin
const TOKEN = document.cookie.split(';').map(c=>c.trim()).find(c=>c.startsWith('internal_token='))?.split('=')[1] || '';

async function api(path) {
  const res = await fetch(BASE + path, {
    headers: { 'X-Internal-Token': TOKEN },
    credentials: 'include'
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

let data = {};
let loading = false;

async function refresh() {
  if (loading) return;
  loading = true;
  document.getElementById('loadingIndicator').style.display = '';
  try {
    const [pipeline, rateLimit, readyz, scrapeRate, addonTx] = await Promise.all([
      api('/api/internal/monitoring/pipeline'),
      api('/api/internal/monitoring/rate-limits'),
      api('/readyz'),
      api('/api/internal/monitoring/scrape-rate?hours=48'),
      api('/api/internal/monitoring/addon-transactions?limit=100'),
    ]);
    data = { pipeline, rateLimit, readyz, scrapeRate, addonTx };
    render();
  } catch(e) {
    console.error('Fetch error:', e);
  } finally {
    loading = false;
    document.getElementById('loadingIndicator').style.display = 'none';
    document.getElementById('lastUpdate').textContent = 'Updated ' + new Date().toLocaleTimeString();
  }
}

function n(v) { return Number(v) || 0; }

function tip(text) {
  return '<span class="info-tip" onmouseenter="showTip(this)" onmouseleave="hideTip(this)">i<span class="tip-content">' + text + '</span></span>';
}

function showTip(el) {
  var tc = el.querySelector('.tip-content');
  if (!tc) return;
  tc.classList.remove('tip-above', 'tip-below');
  tc.style.left = ''; tc.style.top = ''; tc.style.bottom = '';
  tc.classList.add('tip-visible');
  var rect = el.getBoundingClientRect();
  var tw = 320;
  var spaceAbove = rect.top;
  var spaceBelow = window.innerHeight - rect.bottom;
  // Vertical: prefer above, flip below if not enough room
  if (spaceAbove > 200) {
    tc.classList.add('tip-above');
    tc.style.bottom = 'auto';
    tc.style.top = (rect.top - 8) + 'px';
    tc.style.transform = 'translateX(-50%) translateY(-100%)';
  } else {
    tc.classList.add('tip-below');
    tc.style.top = (rect.bottom + 8) + 'px';
    tc.style.transform = 'translateX(-50%)';
  }
  // Horizontal: center on icon, clamp to viewport
  var cx = rect.left + rect.width / 2;
  var left = cx;
  tc.style.left = left + 'px';
  // After positioning, check bounds and adjust
  var tcRect = tc.getBoundingClientRect();
  if (tcRect.right > window.innerWidth - 12) {
    tc.style.left = (left - (tcRect.right - window.innerWidth + 12)) + 'px';
  }
  if (tcRect.left < 12) {
    tc.style.left = (left + (12 - tcRect.left)) + 'px';
  }
}

function hideTip(el) {
  var tc = el.querySelector('.tip-content');
  if (tc) tc.classList.remove('tip-visible', 'tip-above', 'tip-below');
}

function render() {
  const p = data.pipeline || {};
  const rl = data.rateLimit || {};
  const rz = data.readyz || {};

  // System status
  const sysEl = document.getElementById('systemStatus');
  const allOk = rz.status === 'ready';
  sysEl.innerHTML = '<span class="status-dot ' + (allOk ? 'ok' : 'error') + '"></span>' + (allOk ? 'All systems operational' : 'Degraded');

  const q = p.queues || {};
  const sr = p.scrapeRequests?.byStatus || {};
  const nc = p.negativeCache || {};
  const art = p.artifacts || {};
  const src = p.subtitleSources || {};
  const failures = p.recentFailures || [];
  const providers = rl.providers || {};

  // Totals
  const totalScrapeJobs = Object.values(sr).reduce((a,b) => a + n(b.count), 0);
  const totalQueueFailed = Object.values(q).reduce((a,b) => a + n(b.failed), 0);
  const totalQueueActive = Object.values(q).reduce((a,b) => a + n(b.active), 0);
  const totalQueueWaiting = Object.values(q).reduce((a,b) => a + n(b.waiting) + n(b.prioritized), 0);
  const blockedProviders = Object.values(providers).filter(p => p.blocked).length;

  document.getElementById('app').innerHTML = \`
    <!-- KPI Row -->
    <div class="grid grid-5">
      <div class="stat-card">
        <div class="stat-label">Subtitle Sources\${tip('Raw subtitle files scraped from external providers (SubDL, OpenSubtitles). These are the English source files used as input for LLM translations.<br><br><strong>Available:</strong> Passed quality checks (grade A/B/C), ready for translation.<br><strong>Invalid:</strong> Grade F — broken or unparseable, not used.<br><br><strong>Quality Grades:</strong> A (90+) excellent, B (70-89) minor issues, C (50-69) noticeable, F (&lt;50) broken.<br><br><span class="tip-warn">If invalid count is high:</span> Check scrape provider output quality. <span class="tip-action">Run backfill-quality.ts to re-score.</span>')}</div>
        <div class="stat-value" style="color:var(--cyan)">\${n(src.total)}</div>
        <div class="stat-sub">
          <span style="color:var(--green)">\${n(src.available)} available</span> &middot;
          <span style="color:var(--red)">\${n(src.invalid)} invalid</span>
          \${n(src.uniqueContent) ? '&middot; ' + n(src.uniqueContent) + ' titles' : ''}
        </div>
        \${src.quality ? '<div style="margin-top:6px;font-size:11px">' +
          '<span style="color:var(--green)">A:' + n(src.quality.A) + '</span> &middot; ' +
          '<span style="color:var(--blue)">B:' + n(src.quality.B) + '</span> &middot; ' +
          '<span style="color:var(--yellow)">C:' + n(src.quality.C) + '</span> &middot; ' +
          '<span style="color:var(--red)">F:' + n(src.quality.F) + '</span>' +
          (src.quality.avgScore ? ' &middot; <span style="color:var(--text2)">avg ' + src.quality.avgScore + '</span>' : '') +
          '</div>' : ''}
        \${Object.keys(src.byProvider || {}).length ? '<div style="margin-top:4px;font-size:11px;color:var(--text2)">' + Object.entries(src.byProvider).map(([p,c]) => p + ': ' + c).join(' &middot; ') + '</div>' : ''}
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Artifacts\${tip('Translated subtitle files stored in S3. Each artifact is the final output delivered to users via the Stremio addon.<br><br><strong>last hour/24h/7d:</strong> How many new translations were produced in each window. A healthy pipeline should show steady growth here.<br><br><span class="tip-warn">If last 24h is 0:</span> Check translate queue for failures and ensure LLM API keys are valid. <span class="tip-action">Review the Queue Health card and Recent Failures.</span>')}</div>
        <div class="stat-value" style="color:var(--green)">\${n(art.total)}</div>
        <div class="stat-sub">
          \${n(art.last1h)} last hour &middot; \${n(art.last24h)} last 24h &middot; \${n(art.last7d)} last 7d
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Scrape Requests\${tip('Jobs to download subtitles from external providers. Created by the scrape-tick scheduler or ad-hoc user requests via ensure-addon.<br><br><strong>done:</strong> Successfully scraped and stored as subtitle source.<br><strong>active:</strong> Currently being processed by a scraper worker.<br><strong>pending:</strong> Waiting in the database queue for the next tick.<br><br><span class="tip-warn">If pending stays high:</span> Scrapers may be rate-limited or all workers busy. Check Rate Limits and queue concurrency. <span class="tip-action">Consider increasing SCRAPERS_CONCURRENCY or SCRAPERS_TICK_BATCH in .env.</span>')}</div>
        <div class="stat-value">\${totalScrapeJobs}</div>
        <div class="stat-sub">
          <span style="color:var(--green)">\${n(sr.completed?.count)} done</span> &middot;
          <span style="color:var(--blue)">\${n(sr.processing?.count)} active</span> &middot;
          <span style="color:var(--yellow)">\${n(sr.pending?.count)} pending</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Queue Health\${tip('Aggregate health of all 5 BullMQ queues (scrape-tick, scrape, ingest, translate, postcheck).<br><br><strong>Healthy:</strong> No failed jobs across any queue.<br><strong>X failed:</strong> Total failed jobs — click Open Bull Board to inspect and retry.<br><br><strong>active:</strong> Jobs currently being processed.<br><strong>waiting:</strong> Jobs queued and ready for a worker.<br><br><span class=tip-warn>If failed count grows:</span> Check Recent Failures for error patterns. <span class=tip-action>Use Bull Board to retry or clear failed jobs.</span>')}</div>
        <div class="stat-value" style="color:\${totalQueueFailed > 0 ? 'var(--red)' : 'var(--green)'}">\${totalQueueFailed > 0 ? totalQueueFailed + ' failed' : 'Healthy'}</div>
        <div class="stat-sub">
          \${totalQueueActive} active &middot; \${totalQueueWaiting} waiting
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Rate Limits\${tip('Shows whether any subtitle providers are currently rate-limited or blocked.<br><br><strong>Clear:</strong> All providers accepting requests normally.<br><strong>X blocked:</strong> Providers temporarily refusing requests (429 responses).<br><br>Blocked providers auto-recover after cooldown. The Redis sliding-window limiter prevents hitting limits preemptively.<br><br><span class=tip-warn>If a provider stays blocked:</span> <span class=tip-action>Adjust limits in DEFAULT_PROVIDER_LIMITS (shared/rate-limiter.ts).</span>')}</div>
        <div class="stat-value" style="color:\${blockedProviders > 0 ? 'var(--red)' : 'var(--green)'}">\${blockedProviders > 0 ? blockedProviders + ' blocked' : 'Clear'}</div>
        <div class="stat-sub">
          \${Object.keys(providers).length} providers monitored
        </div>
      </div>
    </div>

    <!-- Infrastructure Health -->
    <div class="section-title">🏥 Infrastructure Health\${tip('Real-time connectivity checks for core dependencies. Runs a lightweight query/ping against each service.<br><br><strong>database:</strong> PostgreSQL — SELECT 1 probe. Latency should be &lt;5ms locally.<br><strong>redis:</strong> Redis PING. Latency should be &lt;2ms locally.<br><strong>s3:</strong> S3 ListObjects (1 key). Latency depends on provider — Backblaze B2 ~80-200ms, local MinIO ~5ms.<br><br><span class="tip-warn">If any shows "Down":</span> <span class="tip-action">Check docker containers: docker ps. Restart with: cd infra && docker-compose up -d</span>')}</div>
    <div class="grid grid-3" style="margin-bottom:24px">
      \${Object.entries(rz.checks || {}).map(([name, c]) => \`
        <div class="stat-card" style="border-left: 3px solid \${c.ok ? 'var(--green)' : 'var(--red)'}">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div class="stat-label">\${name}</div>
            <span class="tag \${c.ok ? 'tag-green' : 'tag-red'}">\${c.ok ? 'Connected' : 'Down'}</span>
          </div>
          <div style="font-size:24px;font-weight:700;margin-top:8px">\${c.latencyMs}ms</div>
        </div>
      \`).join('')}
    </div>

    <!-- Queues -->
    <div class="grid grid-2">
      <div class="card">
        <div class="card-header">
          <div class="card-title">📦 BullMQ Queues\${tip('The 5-stage processing pipeline. Each subtitle goes through these queues in order:<br><br><strong>scrape-tick:</strong> Scheduler — picks pending scrape_requests from DB every 30s and adds them to the scrape queue.<br><strong>scrape:</strong> Downloads subtitles from providers (SubDL, OpenSubtitles). Rate-limited per provider.<br><strong>ingest:</strong> Normalizes raw subtitles to WebVTT format and stores in S3.<br><strong>translate:</strong> Sends source subtitle to LLM (GPT-4/Gemini/DeepL) for translation. 3 retries with exponential backoff.<br><strong>postcheck:</strong> Quality validation of translated output before final storage.<br><br><strong>States:</strong> active=processing now, waiting=queued, delayed=scheduled for later, failed=needs attention, done=completed successfully.<br><br><span class="tip-action">Click "Open Bull Board" for detailed job inspection, retry, and cleanup.</span>')}</div>
          <a href="/api/internal/queues" style="font-size:12px">Open Bull Board →</a>
        </div>
        \${renderQueues(q)}
      </div>

      <!-- Rate Limits -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">🚦 Provider Rate Limits\${tip('Redis sliding-window rate limiter for each subtitle provider. Prevents 429 errors by tracking request counts within each provider&#39;s allowed window.<br><br><strong>Progress bar:</strong> Current usage vs. max allowed requests in the window.<br><strong>Green:</strong> Under 80% utilization — healthy.<br><strong>Yellow:</strong> Over 80% — approaching limit.<br><strong>Red/BLOCKED:</strong> Provider returned 429 — cooldown in progress, auto-recovers.<br><br><strong>Providers:</strong><br>• subdl — 3 req/s (API-based)<br>• opensubtitles — 5 req/day (API key quota)<br>• opensubtitles_org — 1 req/6s (headless browser)<br>• moviesubtitles — 1 req/1.2s (web scraping)<br><br><span class="tip-action">Adjust in shared/rate-limiter.ts DEFAULT_PROVIDER_LIMITS.</span>')}</div>
        </div>
        \${renderRateLimits(providers)}
      </div>
    </div>

    <!-- Scrape & Negative Cache -->
    <div class="grid grid-2" style="margin-top:16px">
      <div class="card">
        <div class="card-header">
          <div class="card-title">🔍 Scrape Requests\${tip('Database-level tracking of subtitle download requests. More granular than BullMQ queue stats.<br><br><strong>pending:</strong> Waiting to be picked up by scrape-tick. Oldest shows the backlog depth.<br><strong>processing:</strong> Currently being worked on. If "oldest" is very old, a job may be stuck.<br><strong>completed:</strong> Successfully downloaded and stored as a subtitle source.<br><strong>failed:</strong> All provider attempts exhausted. Check Recent Failures for details.<br><strong>not_found:</strong> No subtitle exists at any provider for this content (negative cached for 24h).<br><br><span class="tip-warn">If processing count is high with old timestamps:</span> <span class="tip-action">Workers may have crashed. Restart scrapers: pnpm --filter @stremio-ai-subs/scrapers dev</span>')}</div>
        </div>
        \${renderScrapeRequests(sr)}
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">🚫 Negative Cache\${tip('Tracks content where no subtitles were found at any provider. Prevents repeated lookups for the same missing content.<br><br><strong>Active (within 24h TTL):</strong> Entries still in cooldown — won&#39;t be re-scraped until TTL expires. This saves API quota.<br><strong>Expired:</strong> Past the 24h window — will be retried on next request.<br><strong>Total Not Found:</strong> All-time count of "no subtitle available" results.<br><br>A growing negative cache is normal — not all content has subtitles. <span class="tip-warn">If it&#39;s very high relative to sources:</span> <span class="tip-action">Check if providers are returning errors that are being misclassified as "not found". Review scrape processor logs.</span>')}</div>
        </div>
        <div style="display:flex;gap:24px;margin-bottom:12px">
          <div>
            <div class="stat-label">Active (within 24h TTL)</div>
            <div style="font-size:24px;font-weight:700;color:var(--yellow)">\${n(nc.activeWithinTTL)}</div>
          </div>
          <div>
            <div class="stat-label">Expired</div>
            <div style="font-size:24px;font-weight:700;color:var(--text2)">\${n(nc.expired)}</div>
          </div>
          <div>
            <div class="stat-label">Total Not Found</div>
            <div style="font-size:24px;font-weight:700">\${n(nc.totalNotFound)}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Recent Failures -->
    <!-- Scrape Rate Chart -->
    <div style="margin-top:16px">
      <div class="card">
        <div class="card-header">
          <div class="card-title">\u{1f4c8} Downloads Per Hour (48h)\${tip('Subtitle source downloads per hour over the last 48 hours. Each bar shows how many subtitle files were fetched from providers in that hour.<br><br><strong>Green bars:</strong> Valid subtitles (available).<br><strong>Red overlay:</strong> Invalid/broken downloads.<br><strong>Blue line:</strong> Completed scrape requests.<br><br>Use this to verify scraping throughput after config changes.')}</div>
        </div>
        <div id="scrapeRateChart"></div>
      </div>
    </div>

    <!-- Recent Failures -->
    \${failures.length > 0 ? \`
    <div style="margin-top:16px">
      <div class="card">
        <div class="card-header">
          <div class="card-title">\u{26a0}\u{fe0f} Recent Failures (24h)\${tip('Aggregated error messages from failed scrape requests in the last 24 hours, grouped by provider and error type.<br><br><strong>Common errors:</strong><br>\u{2022} <em>VIP placeholder subtitle</em> \u{2014} OpenSubtitles requires VIP for this file. No fix, expected for some content.<br>\u{2022} <em>ADM-ZIP: Invalid zip format</em> \u{2014} Provider returned a corrupted download. Usually transient.<br>\u{2022} <em>no_candidate</em> \u{2014} No provider had a matching subtitle, stored as negative cache.<br>\u{2022} <em>Rate limit</em> \u{2014} Provider returned 429. Auto-handled by cooldown.<br><br><span class="tip-action">High count of the same error? Check if a provider API changed or credentials expired.</span>')}</div>
          <span class="tag tag-red">\${failures.length} types</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th>Error</th>
              <th>Count</th>
              <th>Most Recent</th>
            </tr>
          </thead>
          <tbody>
            \${failures.map(f => \`
              <tr>
                <td><span class="tag tag-purple">\${f.provider || 'unknown'}</span></td>
                <td style="max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--text2)">\${escHtml(f.error || '')}</td>
                <td style="font-weight:600;color:var(--red)">\${f.count}</td>
                <td style="font-size:12px;color:var(--text2)">\${timeAgo(f.mostRecent)}</td>
              </tr>
            \`).join('')}
          </tbody>
        </table>
      </div>
    </div>
    \` : ''}

    <!-- Addon Transaction Log -->
    <div style="margin-top:16px">
      <div class="card">
        <div class="card-header">
          <div class="card-title">\u{1f4cb} Addon Transactions\${tip('Every addon /ensure request is traced here with full step-by-step details. Click a row to expand and see each stage the ensure logic went through.<br><br>Use <strong>Copy for Agent</strong> to copy the full trace as text you can paste to a coding agent for debugging.<br><br>Stages: init \u2192 stage1 (artifact cache) \u2192 stage2 (source import) \u2192 stage3 (en source + translate) \u2192 stage4 (negative cache) \u2192 stage5 (in-flight check) \u2192 stage6 (enqueue scrape)')}</div>
          <div class="tx-filter">
            <select id="txFilterStatus" onchange="renderAddonTx()">
              <option value="">All statuses</option>
              <option value="completed">completed</option>
              <option value="processing">processing</option>
              <option value="unavailable">unavailable</option>
              <option value="error">error</option>
            </select>
            <input id="txFilterId" placeholder="Filter by stremioId..." oninput="renderAddonTx()" style="width:160px" />
            <span style="font-size:12px;color:var(--text2)" id="txCount"></span>
          </div>
        </div>
        <div id="addonTxList"></div>
      </div>
    </div>
  \`;

  // Render the chart after innerHTML is set
  renderScrapeRateChart(data.scrapeRate);
  renderAddonTx();
}

function renderScrapeRateChart(scrapeRate) {
  const el = document.getElementById('scrapeRateChart');
  if (!el || !scrapeRate) {
    if (el) el.innerHTML = '<div class="empty-state">No data yet</div>';
    return;
  }

  const sources = scrapeRate.sourcesPerHour || [];
  const scrapes = scrapeRate.scrapesPerHour || [];
  const summary = scrapeRate.summary || {};

  if (sources.length === 0) {
    el.innerHTML = '<div class="empty-state">No download data in the last 48 hours</div>';
    return;
  }

  // Chart dimensions
  const W = 900, H = 220, PAD_L = 45, PAD_R = 10, PAD_T = 10, PAD_B = 40;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;
  const barCount = sources.length;
  const barW = Math.max(2, (chartW / barCount) - 1);
  const gap = 1;

  // Find max for Y axis
  const allVals = sources.map(s => s.total);
  scrapes.forEach(s => allVals.push(s.completed + s.notFound));
  const maxVal = Math.max(1, ...allVals);

  // Y-axis ticks
  const yTicks = [];
  const yStep = Math.max(1, Math.ceil(maxVal / 4));
  for (let v = 0; v <= maxVal; v += yStep) yTicks.push(v);
  if (yTicks[yTicks.length - 1] < maxVal) yTicks.push(maxVal);

  // Build bars (green = available, red top = invalid)
  let bars = '';
  for (let i = 0; i < barCount; i++) {
    const s = sources[i];
    const x = PAD_L + i * (barW + gap);
    const totalH = (s.total / maxVal) * chartH;
    const availH = (s.available / maxVal) * chartH;
    const invalH = (s.invalid / maxVal) * chartH;
    // Available bar (green)
    bars += '<rect x="' + x + '" y="' + (PAD_T + chartH - totalH) + '" width="' + barW + '" height="' + availH + '" fill="#34d399" rx="1" opacity="0.85"><title>' + formatHour(s.hour) + ': ' + s.available + ' available</title></rect>';
    // Invalid portion on top (red)
    if (invalH > 0) {
      bars += '<rect x="' + x + '" y="' + (PAD_T + chartH - totalH) + '" width="' + barW + '" height="' + invalH + '" fill="#f87171" rx="1" opacity="0.85"><title>' + formatHour(s.hour) + ': ' + s.invalid + ' invalid</title></rect>';
    }
  }

  // Build scrape completed line (blue)
  let linePath = '';
  for (let i = 0; i < scrapes.length && i < barCount; i++) {
    const s = scrapes[i];
    const x = PAD_L + i * (barW + gap) + barW / 2;
    const y = PAD_T + chartH - ((s.completed / maxVal) * chartH);
    linePath += (i === 0 ? 'M' : 'L') + x + ',' + y;
  }

  // Y axis labels
  let yLabels = '';
  for (const v of yTicks) {
    const y = PAD_T + chartH - ((v / maxVal) * chartH);
    yLabels += '<text x="' + (PAD_L - 6) + '" y="' + (y + 4) + '" fill="#9499b3" font-size="10" text-anchor="end">' + v + '</text>';
    yLabels += '<line x1="' + PAD_L + '" y1="' + y + '" x2="' + (W - PAD_R) + '" y2="' + y + '" stroke="#2e3345" stroke-width="0.5"/>';
  }

  // X axis labels (every 6 hours)
  let xLabels = '';
  const labelEvery = Math.max(1, Math.floor(barCount / 8));
  for (let i = 0; i < barCount; i += labelEvery) {
    const s = sources[i];
    const x = PAD_L + i * (barW + gap) + barW / 2;
    xLabels += '<text x="' + x + '" y="' + (H - 8) + '" fill="#9499b3" font-size="10" text-anchor="middle" transform="rotate(-35,' + x + ',' + (H - 8) + ')">' + formatHour(s.hour) + '</text>';
  }

  // Compute current hour rate and previous full-day average for comparison
  const last6h = sources.slice(-6).reduce(function(a,b){ return a + b.total; }, 0);
  const avgLast6h = sources.length >= 6 ? Math.round(last6h / 6) : '-';
  const olderSlice = sources.slice(0, Math.max(1, sources.length - 6));
  const olderAvg = olderSlice.length > 0 ? Math.round(olderSlice.reduce(function(a,b){ return a + b.total; }, 0) / olderSlice.length) : 0;
  const rateChange = (typeof avgLast6h === 'number' && olderAvg > 0)
    ? Math.round(((avgLast6h - olderAvg) / olderAvg) * 100)
    : null;
  const changeLabel = rateChange !== null
    ? (rateChange > 0 ? '+' + rateChange + '%' : rateChange + '%')
    : '-';
  const changeColor = rateChange !== null ? (rateChange > 0 ? 'var(--green)' : rateChange < 0 ? 'var(--red)' : 'var(--text2)') : 'var(--text2)';

  el.innerHTML = '<div class="chart-summary">' +
    '<div class="chart-summary-item"><div class="chart-summary-label">Total (48h)</div><div class="chart-summary-value" style="color:var(--cyan)">' + n(summary.totalDownloads) + '</div></div>' +
    '<div class="chart-summary-item"><div class="chart-summary-label">Avg / hour</div><div class="chart-summary-value">' + n(summary.avgPerHour) + '</div></div>' +
    '<div class="chart-summary-item"><div class="chart-summary-label">Peak hour</div><div class="chart-summary-value" style="color:var(--green)">' + n(summary.peakCount) + '</div></div>' +
    '<div class="chart-summary-item"><div class="chart-summary-label">Last 6h avg vs prior</div><div class="chart-summary-value" style="color:' + changeColor + '">' + changeLabel + '</div></div>' +
    '</div>' +
    '<div class="chart-container">' +
    '<svg class="chart-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' +
    yLabels +
    bars +
    (linePath ? '<path d="' + linePath + '" fill="none" stroke="#60a5fa" stroke-width="2" opacity="0.7"/>' : '') +
    xLabels +
    '</svg>' +
    '</div>' +
    '<div class="chart-legend">' +
    '<div class="chart-legend-item"><div class="chart-legend-dot" style="background:#34d399"></div> Available downloads</div>' +
    '<div class="chart-legend-item"><div class="chart-legend-dot" style="background:#f87171"></div> Invalid downloads</div>' +
    '<div class="chart-legend-item"><div class="chart-legend-dot" style="background:#60a5fa"></div> Completed scrapes</div>' +
    '</div>';
}

function formatHour(ts) {
  if (!ts) return '';
  var d = new Date(ts);
  var month = d.getMonth() + 1;
  var day = d.getDate();
  var h = d.getHours();
  return (month < 10 ? '0' : '') + month + '/' + (day < 10 ? '0' : '') + day + ' ' + (h < 10 ? '0' : '') + h + ':00';
}

function renderQueues(q) {
  const order = ['scrape-tick', 'scrape', 'ingest', 'translate', 'postcheck'];
  const colors = { active: 'var(--blue)', waiting: 'var(--yellow)', failed: 'var(--red)', delayed: 'var(--purple)', completed: 'var(--green)', prioritized: 'var(--cyan)' };
  return order.map(name => {
    const s = q[name] || {};
    const total = n(s.active) + n(s.waiting) + n(s.failed) + n(s.delayed) + n(s.prioritized);
    return \`
      <div class="queue-row">
        <div class="queue-name">\${name}</div>
        <div class="queue-counts">
          \${[
            ['active', s.active, colors.active],
            ['waiting', s.waiting, colors.waiting],
            ['prioritized', s.prioritized, colors.prioritized],
            ['delayed', s.delayed, colors.delayed],
            ['failed', s.failed, colors.failed],
            ['done', s.completed, colors.completed],
          ].map(([label, val, color]) => n(val) > 0 ? \`
            <span class="queue-count">
              <span class="dot" style="background:\${color}"></span>
              <span style="color:\${color}">\${n(val)}</span>
              <span style="color:var(--text2)">\${label}</span>
            </span>
          \` : '').join('')}
          \${total === 0 && n(s.completed) === 0 ? '<span style="color:var(--text2);font-size:12px">idle</span>' : ''}
        </div>
      </div>
    \`;
  }).join('');
}

function renderRateLimits(providers) {
  return Object.entries(providers).map(([name, p]) => {
    const pct = Math.min(100, Math.round((p.currentCount / p.maxRequests) * 100));
    const barColor = p.blocked ? 'var(--red)' : pct > 80 ? 'var(--yellow)' : 'var(--green)';
    return \`
      <div style="padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span style="font-weight:600;font-size:13px">\${name}</span>
          <span>
            \${p.blocked
              ? '<span class="tag tag-red">BLOCKED ' + Math.round(p.blockedMs/1000) + 's</span>'
              : '<span class="tag tag-green">' + p.currentCount + '/' + p.maxRequests + '</span>'}
          </span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width:\${pct}%;background:\${barColor}"></div>
        </div>
        <div style="font-size:11px;color:var(--text2);margin-top:4px">
          Window: \${p.windowMs >= 86400000 ? Math.round(p.windowMs/86400000) + 'd' : p.windowMs >= 60000 ? Math.round(p.windowMs/60000) + 'm' : (p.windowMs/1000) + 's'}
          &middot; \${p.utilization} utilized
        </div>
      </div>
    \`;
  }).join('');
}

function renderScrapeRequests(sr) {
  const statuses = ['pending', 'processing', 'completed', 'failed', 'not_found'];
  const colors = { pending: 'tag-yellow', processing: 'tag-blue', completed: 'tag-green', failed: 'tag-red', not_found: 'tag-gray' };
  const total = statuses.reduce((a, s) => a + n(sr[s]?.count), 0);
  if (total === 0) return '<div class="empty-state">No scrape requests</div>';

  return \`
    <table>
      <thead><tr><th>Status</th><th>Count</th><th>%</th><th>Oldest</th><th>Newest</th></tr></thead>
      <tbody>
        \${statuses.filter(s => n(sr[s]?.count) > 0).map(s => {
          const d = sr[s];
          const pct = total > 0 ? Math.round((n(d.count) / total) * 100) : 0;
          return \`
            <tr>
              <td><span class="tag \${colors[s]}">\${s}</span></td>
              <td style="font-weight:600">\${n(d.count)}</td>
              <td>
                <div style="display:flex;align-items:center;gap:8px">
                  <div style="flex:1;max-width:80px;height:4px;background:var(--surface2);border-radius:2px;overflow:hidden">
                    <div style="width:\${pct}%;height:100%;background:var(--blue);border-radius:2px"></div>
                  </div>
                  <span style="font-size:12px;color:var(--text2)">\${pct}%</span>
                </div>
              </td>
              <td style="font-size:12px;color:var(--text2)">\${d.oldest ? timeAgo(d.oldest) : '-'}</td>
              <td style="font-size:12px;color:var(--text2)">\${d.newest ? timeAgo(d.newest) : '-'}</td>
            </tr>
          \`;
        }).join('')}
      </tbody>
    </table>
  \`;
}

function timeAgo(ts) {
  if (!ts) return '-';
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return Math.round(diff/1000) + 's ago';
  if (diff < 3600000) return Math.round(diff/60000) + 'm ago';
  if (diff < 86400000) return Math.round(diff/3600000) + 'h ago';
  return Math.round(diff/86400000) + 'd ago';
}

function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function renderAddonTx() {
  var el = document.getElementById('addonTxList');
  if (!el) return;
  var txData = (data.addonTx || {}).transactions || [];
  var filterStatus = document.getElementById('txFilterStatus')?.value || '';
  var filterId = (document.getElementById('txFilterId')?.value || '').toLowerCase();

  var filtered = txData.filter(function(tx) {
    if (filterStatus && tx.finalStatus !== filterStatus) return false;
    if (filterId && tx.stremioId.toLowerCase().indexOf(filterId) === -1) return false;
    return true;
  });

  var countEl = document.getElementById('txCount');
  if (countEl) countEl.textContent = filtered.length + '/' + txData.length + ' shown';

  if (filtered.length === 0) {
    el.innerHTML = '<div class="empty-state">' + (txData.length === 0 ? 'No addon transactions yet. Open a movie or series in Stremio to generate traces.' : 'No transactions match filter') + '</div>';
    return;
  }

  var statusColors = { completed: 'tag-green', processing: 'tag-blue', unavailable: 'tag-yellow', error: 'tag-red' };

  el.innerHTML = '<div class="tx-list">' + filtered.map(function(tx, i) {
    var stepsText = tx.steps.map(function(s) {
      var line = '[' + s.ts.split('T')[1].slice(0,12) + '] ' + s.stage + ': ' + s.detail;
      if (s.data) line += '\\n    ' + JSON.stringify(s.data);
      return line;
    }).join('\\n');

    var copyText = '=== Addon Transaction Trace ===\\n' +
      'ID: ' + tx.id + '\\n' +
      'Time: ' + tx.ts + '\\n' +
      'Type: ' + tx.type + '\\n' +
      'StremioId: ' + tx.stremioId + '\\n' +
      'RawStremioId: ' + tx.rawStremioId + '\\n' +
      'DstLang: ' + tx.dstLang + '\\n' +
      'UserId: ' + tx.userId + '\\n' +
      'Status: ' + tx.finalStatus + '\\n' +
      'HTTP Code: ' + tx.httpCode + '\\n' +
      'Subtitles Returned: ' + tx.subtitlesReturned + '\\n' +
      'Duration: ' + tx.durationMs + 'ms\\n' +
      '\\n--- Steps ---\\n' + stepsText + '\\n';

    return '<div class="tx-row" onclick="toggleTx(' + i + ')">' +
      '<div class="tx-header">' +
        '<span class="tag ' + (statusColors[tx.finalStatus] || 'tag-gray') + '">' + tx.finalStatus + '</span>' +
        '<span style="font-weight:600">' + escHtml(tx.stremioId) + '</span>' +
        '<span class="tag tag-purple">' + tx.type + '</span>' +
        '<span class="tag tag-blue">' + tx.dstLang + '</span>' +
        '<span style="font-size:12px;color:var(--text2)">' + tx.durationMs + 'ms</span>' +
        '<span style="font-size:12px;color:var(--text2)">' + (tx.subtitlesReturned > 0 ? '\\u2705 ' + tx.subtitlesReturned + ' sub' : '\\u274c 0 subs') + '</span>' +
        '<span style="font-size:11px;color:var(--text2)">' + timeAgo(tx.ts) + '</span>' +
      '</div>' +
      '<div class="tx-steps" id="txSteps' + i + '">' +
        tx.steps.map(function(s) {
          return '<div>' +
            '<span style="color:var(--text2);font-size:10px">' + s.ts.split('T')[1].slice(0,12) + '</span> ' +
            '<span class="tx-step-stage">' + escHtml(s.stage) + '</span> ' +
            '<span class="tx-step-detail">' + escHtml(s.detail) + '</span>' +
            (s.data ? '<div class="tx-step-data">' + escHtml(JSON.stringify(s.data, null, 2)) + '</div>' : '') +
          '</div>';
        }).join('') +
        '<div style="margin-top:10px;display:flex;gap:8px">' +
          '<button class="btn btn-sm btn-green" onclick="event.stopPropagation();copyTxTrace(' + i + ')">\\u{1f4cb} Copy for Agent</button>' +
          '<button class="btn btn-sm btn-blue" onclick="event.stopPropagation();copyTxJson(' + i + ')">Copy JSON</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('') + '</div>';

  // Store tx data for copy functions
  window._addonTxFiltered = filtered;
}

function toggleTx(i) {
  var el = document.getElementById('txSteps' + i);
  if (el) el.classList.toggle('open');
}

function copyTxTrace(i) {
  var tx = window._addonTxFiltered && window._addonTxFiltered[i];
  if (!tx) return;
  var stepsText = tx.steps.map(function(s) {
    var line = '[' + s.ts.split('T')[1].slice(0,12) + '] ' + s.stage + ': ' + s.detail;
    if (s.data) line += '\\n    ' + JSON.stringify(s.data);
    return line;
  }).join('\\n');

  var text = '=== Addon Transaction Trace ===\\n' +
    'ID: ' + tx.id + '\\n' +
    'Time: ' + tx.ts + '\\n' +
    'Type: ' + tx.type + '\\n' +
    'StremioId: ' + tx.stremioId + '\\n' +
    'RawStremioId: ' + tx.rawStremioId + '\\n' +
    'DstLang: ' + tx.dstLang + '\\n' +
    'UserId: ' + tx.userId + '\\n' +
    'Status: ' + tx.finalStatus + '\\n' +
    'HTTP Code: ' + tx.httpCode + '\\n' +
    'Subtitles Returned: ' + tx.subtitlesReturned + '\\n' +
    'Duration: ' + tx.durationMs + 'ms\\n' +
    '\\n--- Steps ---\\n' + stepsText + '\\n';
  navigator.clipboard.writeText(text).then(function() {
    alert('Trace copied to clipboard!');
  });
}

function copyTxJson(i) {
  var tx = window._addonTxFiltered && window._addonTxFiltered[i];
  if (!tx) return;
  navigator.clipboard.writeText(JSON.stringify(tx, null, 2)).then(function() {
    alert('JSON copied to clipboard!');
  });
}

// Auto-refresh every 15 seconds
refresh();
setInterval(refresh, 15000);
</script>
</body>
</html>`;
}
