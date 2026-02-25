import { chromium, type Browser, type BrowserContext } from 'playwright';
import { gunzipSync } from 'node:zlib';
import { access, readFile, unlink } from 'node:fs/promises';
import * as path from 'node:path';
import AdmZip from 'adm-zip';
import type Redis from 'ioredis';
import {
  acquireProviderSlot,
  reportProviderBlock,
  getProviderBlockMs,
  RateLimitError,
} from '@stremio-ai-subs/shared';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(value: string | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  // Usually seconds.
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(60_000, Math.floor(seconds * 1000));
  // Sometimes HTTP-date.
  const dateMs = Date.parse(trimmed);
  if (Number.isFinite(dateMs)) {
    const delta = dateMs - Date.now();
    if (delta > 0) return Math.min(60_000, delta);
  }
  return null;
}

// Redis connection injected by the scraper entry point for cross-process rate limiting.
let _redis: Redis | null = null;

// Consecutive 429s counter (local to this process for exponential backoff calculation).
let osOrgConsecutive429s = 0;

/**
 * Call once at startup to enable Redis-backed rate limiting.
 * Without this, falls back to a basic in-process serial chain.
 */
export function setOpenSubtitlesOrgRedis(redis: Redis): void {
  _redis = redis;
}

function compute429BackoffMs(retryAfterMs: number | null): number {
  const attempt = Math.max(1, osOrgConsecutive429s);
  const baseMs = retryAfterMs ?? 30_000;
  const expMs = Math.min(15 * 60_000, baseMs * 2 ** (attempt - 1));
  const jitterMs = Math.floor(Math.random() * 2_000);
  return expMs + jitterMs;
}

// ---------- Browser pool (singleton) ----------
let _pooledBrowser: Browser | null = null;
let _browserLaunchPromise: Promise<Browser> | null = null;

async function getPooledBrowser(headless: boolean, _userAgent: string): Promise<Browser> {
  if (_pooledBrowser && _pooledBrowser.isConnected()) return _pooledBrowser;
  if (_browserLaunchPromise) return _browserLaunchPromise;

  _browserLaunchPromise = chromium
    .launch({ headless, args: ['--disable-blink-features=AutomationControlled'] })
    .then((b) => {
      _pooledBrowser = b;
      b.on('disconnected', () => {
        _pooledBrowser = null;
        _browserLaunchPromise = null;
      });
      return b;
    })
    .finally(() => {
      _browserLaunchPromise = null;
    });

  return _browserLaunchPromise;
}

export async function closePooledBrowser(): Promise<void> {
  if (_pooledBrowser) {
    await _pooledBrowser.close().catch(() => undefined);
    _pooledBrowser = null;
  }
}

// This package compiles with a Node-only TS lib (no `dom`), but Playwright's `$$eval`
// callbacks run in a browser context. Use tiny structural types instead of DOM types.
type DomElementLike = {
  textContent?: string | null;
  querySelectorAll?: (selectors: string) => ArrayLike<DomElementLike>;
  getAttribute?: (name: string) => string | null;
};

async function runWithOpenSubtitlesOrgRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  const redis = _redis;

  if (redis) {
    // Redis-backed: check cross-process block first, then acquire a slot.
    const blockMs = await getProviderBlockMs(redis, 'opensubtitles_org');
    if (blockMs > 0) {
      throw new RateLimitError('opensubtitles_org', blockMs);
    }

    const minIntervalMs = Math.max(
      0,
      parseInt(process.env.OPENSUBTITLES_ORG_MIN_INTERVAL_MS || '6000', 10) || 0
    );

    const slot = await acquireProviderSlot(redis, 'opensubtitles_org', {
      maxRequests: 1,
      windowMs: minIntervalMs,
    });

    if (!slot.allowed) {
      // Wait for the slot to become available instead of failing immediately.
      await sleep(slot.retryAfterMs);
    }

    return fn();
  }

  // Fallback: simple serial sleep (single-process only).
  const minIntervalMs = Math.max(
    0,
    parseInt(process.env.OPENSUBTITLES_ORG_MIN_INTERVAL_MS || '6000', 10) || 0
  );
  await sleep(minIntervalMs);
  return fn();
}

function toIso639_2(iso639_1: string): string | null {
  const map: Record<string, string> = {
    en: 'eng',
    es: 'spa',
    fr: 'fre',
    de: 'ger',
    it: 'ita',
    pt: 'por',
    ru: 'rus',
    zh: 'chi',
    ja: 'jpn',
    ko: 'kor',
    ar: 'ara',
    he: 'heb',
    hi: 'hin',
    nl: 'dut',
    sv: 'swe',
    no: 'nor',
    da: 'dan',
    fi: 'fin',
    pl: 'pol',
    tr: 'tur',
    cs: 'cze',
    el: 'gre',
    ro: 'rum',
    hu: 'hun',
    uk: 'ukr',
  };
  return map[iso639_1] || null;
}

function normalizeEncodingLabel(label: string): string {
  const raw = label.trim().toLowerCase().replace(/^"|"$/g, '');
  if (raw === 'utf8') return 'utf-8';
  if (raw === 'latin1') return 'iso-8859-1';
  if (raw === 'cp1255' || raw === 'windows1255') return 'windows-1255';
  if (raw === 'cp1252' || raw === 'windows1252') return 'windows-1252';
  return raw;
}

function decodeWith(encoding: string, bytes: Buffer): string {
  const dec = new TextDecoder(encoding, { fatal: false });
  return dec.decode(bytes);
}

function scoreDecodedText(text: string): number {
  let hebrew = 0;
  let replacements = 0;
  let mojibakeMarker = 0;

  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 0x0590 && code <= 0x05ff) hebrew++;
    if (code === 0xfffd) replacements++;
    if (ch === '×') mojibakeMarker++;
  }

  return hebrew * 5 - replacements * 10 - mojibakeMarker * 2;
}

function decodeSubtitleBytes(bytes: Buffer, contentType: string | null): string {
  const charsetMatch = (contentType || '').match(/charset\s*=\s*([^;]+)/i);
  const headerCharset = charsetMatch ? normalizeEncodingLabel(charsetMatch[1]) : null;

  const candidates: string[] = [];
  if (headerCharset) candidates.push(headerCharset);
  candidates.push('utf-8', 'windows-1255', 'windows-1252', 'iso-8859-1');

  let bestText: string | null = null;
  let bestScore = -Infinity;

  for (const enc of candidates) {
    try {
      const decoded = decodeWith(enc, bytes);
      const score = scoreDecodedText(decoded);
      if (score > bestScore) {
        bestScore = score;
        bestText = decoded;
      }
    } catch {
      // ignore
    }
  }

  return bestText ?? bytes.toString('utf8');
}

function extractSubtitlePayload(buf: Buffer): Buffer {
  // gzip
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    return gunzipSync(buf);
  }

  // zip
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b) {
    const zip = new AdmZip(buf);
    type ZipEntry = {
      entryName: string;
      isDirectory: boolean;
      getData: () => Buffer;
    };
    const entries = zip.getEntries() as unknown as ZipEntry[];

    const byExt = (name: string) => name.toLowerCase().split('.').pop() || '';
    const preferredExt = new Set(['vtt', 'srt', 'ass', 'ssa', 'sub', 'txt']);

    const best =
      entries.find((e) => {
        const name = e.entryName || '';
        if (e.isDirectory) return false;
        const ext = byExt(name);
        return preferredExt.has(ext);
      }) || entries.find((e) => !e.isDirectory);

    if (!best) throw new Error('OpenSubtitles.org zip contained no files');
    return best.getData();
  }

  return buf;
}

function isHtml(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  return (
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<html') ||
    trimmed.includes('<head') ||
    trimmed.includes('<body')
  );
}

function maybeBestMatchScore(text: string, season: number | null, episode: number | null): number {
  const t = text.toLowerCase();
  let score = 0;
  if (season != null && episode != null) {
    const s2 = String(season).padStart(2, '0');
    const e2 = String(episode).padStart(2, '0');
    if (t.includes(`s${s2}e${e2}`)) score += 50;
    if (t.includes(`${season}x${episode}`)) score += 40;
    if (t.includes(`season ${season}`)) score += 10;
    if (t.includes(`episode ${episode}`)) score += 10;
  }
  return score;
}

function buildSearchUrl(params: {
  imdbNumeric: number;
  season: number | null;
  lang2: string;
}): string {
  // For TV series, OpenSubtitles.org exposes better season/episode listings under /search/.../pimdbid-<id>/season-<n>
  if (params.season != null) {
    return `https://www.opensubtitles.org/en/search/sublanguageid-${params.lang2}/pimdbid-${params.imdbNumeric}/season-${params.season}`;
  }

  // Movies (and series without a season specified)
  return `https://www.opensubtitles.org/en/search/sublanguageid-${params.lang2}/imdbid-${params.imdbNumeric}`;
}

export type OpenSubtitlesOrgResult = {
  provider: 'opensubtitles_org';
  downloadUrl: string;
  providerRef: string | null;
  text: string;
};

export function getOpenSubtitlesOrgConfigStatus():
  | { enabled: true }
  | { enabled: false; reason: string } {
  if (process.env.OPENSUBTITLES_ORG_HEADLESS === '1') return { enabled: true };
  return {
    enabled: false,
    reason: 'OpenSubtitles.org headless disabled. Set OPENSUBTITLES_ORG_HEADLESS=1 to enable.',
  };
}

export async function tryDownloadFromOpenSubtitlesOrg(params: {
  imdbNumeric: number;
  season: number | null;
  episode: number | null;
  lang: string; // iso639-1
}): Promise<OpenSubtitlesOrgResult | null> {
  const debug =
    (process.env.LOG_LEVEL || '').toLowerCase() === 'debug' ||
    process.env.DEBUG_OPENSUBTITLES_ORG === '1';

  const lang1 = params.lang.toLowerCase();
  const lang2 = toIso639_2(lang1);
  if (!lang2) return null;

  const searchUrl = buildSearchUrl({
    imdbNumeric: params.imdbNumeric,
    season: params.season,
    lang2,
  });

  const fileExists = async (p: string): Promise<boolean> => {
    try {
      await access(p);
      return true;
    } catch {
      return false;
    }
  };

  const resolveStorageStatePath = async (): Promise<string | null> => {
    const explicit = process.env.OPENSUBTITLES_ORG_STORAGE_STATE_PATH;
    if (explicit && (await fileExists(explicit))) return explicit;

    const candidates = [
      // When running `pnpm --filter @stremio-ai-subs/scrapers ...`, cwd is typically packages/scrapers
      path.join(process.cwd(), '.cache', 'opensubtitles-org.storage-state.json'),
      // When users set env from repo root (`$PWD/...`) but scripts run from package dir
      path.join(
        process.cwd(),
        'packages',
        'scrapers',
        '.cache',
        'opensubtitles-org.storage-state.json'
      ),
    ];

    for (const c of candidates) {
      if (await fileExists(c)) return c;
    }

    if (explicit && debug) {
      console.log('[opensubtitles_org][scrapers] storageState path not found', {
        explicit,
        tried: candidates,
      });
    }

    return null;
  };

  const resolvedStorageStatePath = await resolveStorageStatePath();
  const hasSessionConfig =
    Boolean(process.env.OPENSUBTITLES_ORG_USER_DATA_DIR) ||
    Boolean(process.env.OPENSUBTITLES_ORG_COOKIE) ||
    Boolean(process.env.OPENSUBTITLES_ORG_STORAGE_STATE_PATH) ||
    Boolean(resolvedStorageStatePath);

  // If we were blocked for a long time (e.g. captcha-wall cooldown) but a session config
  // is now present, do not keep honoring that stale block.
  if (_redis && hasSessionConfig) {
    const blockMs = await getProviderBlockMs(_redis, 'opensubtitles_org');
    if (blockMs > 10 * 60_000) {
      // Clear the Redis block
      await _redis.del('ratelimit:blocked:opensubtitles_org');
      osOrgConsecutive429s = 0;
      if (debug)
        console.log('[opensubtitles_org][scrapers] cleared long block due to session config', {
          previousBlockedForMs: blockMs,
        });
    }
  }

  // If we've recently hit 429, skip OS.org attempts for a while to avoid thrashing.
  if (_redis) {
    const blockMs = await getProviderBlockMs(_redis, 'opensubtitles_org');
    if (blockMs > 0) {
      if (debug) {
        console.log('[opensubtitles_org][scrapers] temporarily blocked due to recent 429', {
          blockedForMs: blockMs,
        });
      }
      return null;
    }
  }

  return runWithOpenSubtitlesOrgRateLimit(async () => {
    // Default to headful when a session config is available (more browser-like; helps with bot walls).
    const headless =
      process.env.OPENSUBTITLES_ORG_HEADFUL === '1' ? false : hasSessionConfig ? false : true;
    const userDataDir = process.env.OPENSUBTITLES_ORG_USER_DATA_DIR;

    type ChromiumContext = BrowserContext;

    let browser: Browser | null = null;
    const contextOwned = true;
    let context: ChromiumContext | null = null;
    try {
      const userAgent =
        process.env.OPENSUBTITLES_USER_AGENT ||
        process.env.OPENSUBTITLES_ORG_USER_AGENT ||
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

      const commonHeaders: Record<string, string> = {
        'accept-language': 'en-US,en;q=0.9',
        dnt: '1',
      };

      // Optional: reuse a browser-derived session (Cloudflare clearance, etc.).
      // This is the most reliable way to match “works in my browser” behavior.
      const cookieHeader = process.env.OPENSUBTITLES_ORG_COOKIE;
      if (cookieHeader && cookieHeader.trim()) {
        commonHeaders.cookie = cookieHeader.trim();
      }

      const storageStatePath = resolvedStorageStatePath;
      if (debug) {
        console.log('[opensubtitles_org][scrapers] session config', {
          userDataDir: Boolean(userDataDir),
          cookieHeader: Boolean(cookieHeader && cookieHeader.trim()),
          storageStatePath: storageStatePath || null,
          headless,
        });
      }

      if (userDataDir) {
        // Persistent context — cannot use pooled browser
        context = (await chromium.launchPersistentContext(userDataDir, {
          headless,
          userAgent,
          locale: 'en-US',
          extraHTTPHeaders: commonHeaders,
          acceptDownloads: true,
        })) as unknown as ChromiumContext;
      } else {
        // Use pooled browser: reuse a single Chromium instance across scrape jobs
        browser = await getPooledBrowser(headless, userAgent);
        context = await browser.newContext({
          userAgent,
          locale: 'en-US',
          extraHTTPHeaders: commonHeaders,
          acceptDownloads: true,
          ...(storageStatePath ? { storageState: storageStatePath } : {}),
        });
      }

      if (!context) return null;

      const page = await context.newPage();

      const browserDownloadBytes = async (
        url: string,
        timeoutMs: number
      ): Promise<Buffer | null> => {
        try {
          const response = await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: timeoutMs,
          });
          const status = response?.status() || null;
          if (status === 429) return null;

          // Many OS.org endpoints return an HTML interstitial that requires a click to start the download.
          // Try common download link patterns.
          const candidates = [
            'a[href*="/download/sub/"]',
            'a[href*="dl.opensubtitles.org"]',
            'a[href*="/download/"]',
            'a[href*="subtitleserve"]',
            'a:has-text("Download")',
          ];

          let download: unknown = null;
          for (const selector of candidates) {
            const el = await page.$(selector).catch(() => null);
            if (!el) continue;
            try {
              const downloadPromise = page.waitForEvent('download', { timeout: timeoutMs });
              await el.click({ timeout: timeoutMs });
              download = await downloadPromise;
              break;
            } catch {
              // try next selector
            }
          }

          if (!download) {
            if (debug) {
              const sample = await page
                .$$eval('a', (as) => {
                  const out: Array<{ href: string; text: string }> = [];
                  for (const a of Array.from(as).slice(0, 200)) {
                    const href = (a.getAttribute('href') || '').trim();
                    const text = (a.textContent || '').trim().slice(0, 60);
                    if (!href) continue;
                    if (
                      href.includes('download') ||
                      href.includes('login') ||
                      href.includes('subtitleserve') ||
                      href.includes('dl.opensubtitles.org')
                    ) {
                      out.push({ href, text });
                      if (out.length >= 10) break;
                    }
                  }
                  return out;
                })
                .catch(() => [] as Array<{ href: string; text: string }>);

              console.log(
                '[opensubtitles_org][scrapers] browser download: no download event; link sample',
                {
                  sample,
                }
              );
            }

            // As a last resort, some sites trigger download on navigation.
            try {
              download = await page.waitForEvent('download', {
                timeout: Math.min(2_000, timeoutMs),
              });
            } catch {
              return null;
            }
          }

          const dlObj = download as {
            suggestedFilename: () => string;
            saveAs: (path: string) => Promise<void>;
          };

          const suggested = dlObj.suggestedFilename();
          const tmpPath = `/tmp/opensubtitles_org_${Date.now()}_${Math.random()
            .toString(16)
            .slice(2)}_${suggested || 'subtitle.bin'}`;

          await dlObj.saveAs(tmpPath);
          const buf = await readFile(tmpPath);
          await unlink(tmpPath).catch(() => undefined);
          return buf;
        } catch {
          return null;
        }
      };

      if (debug) console.log('[opensubtitles_org][scrapers] search', { searchUrl });

      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

      // Prefer selecting by row text (contains [SxxEyy]) rather than anchor text.
      const rows = await page
        .$$eval('tr', (trs) => {
          return (trs as unknown as DomElementLike[])
            .map((trEl) => {
              const tr = trEl as DomElementLike;
              const text = (tr.textContent || '').trim();
              const anchors = Array.from(
                (tr.querySelectorAll?.('a') || []) as ArrayLike<DomElementLike>
              );
              const hrefs = anchors
                .map((a) => (a.getAttribute?.('href') || '') as string)
                .filter((h) => typeof h === 'string' && h.length > 0);
              return { text, hrefs };
            })
            .filter((r) =>
              r.hrefs.some((h) => typeof h === 'string' && h.includes('/en/subtitles/'))
            );
        })
        .catch(() => [] as Array<{ text: string; hrefs: string[] }>);

      const candidates: Array<{ href: string; text: string }> = [];
      for (const row of rows) {
        const href = row.hrefs.find((h) => h.includes('/en/subtitles/'));
        if (!href) continue;
        candidates.push({ href, text: row.text });
      }

      if (candidates.length === 0) {
        if (debug) console.log('[opensubtitles_org][scrapers] no subtitle links found');
        return null;
      }

      let best = candidates[0];
      let bestScore = -Infinity;
      for (const c of candidates.slice(0, 200)) {
        const s = maybeBestMatchScore(c.text, params.season, params.episode);
        if (s > bestScore) {
          bestScore = s;
          best = c;
        }
      }

      if (params.season != null && params.episode != null && bestScore < 30) {
        if (debug) {
          console.log(
            '[opensubtitles_org][scrapers] no confident season/episode match; falling back',
            {
              season: params.season,
              episode: params.episode,
              bestScore,
              bestText: best.text.slice(0, 200),
              searchUrl,
            }
          );
        }
        return null;
      }

      const subtitleUrl = new URL(best.href, 'https://www.opensubtitles.org').toString();
      const providerRefMatch = subtitleUrl.match(/\/subtitles\/(\d+)/);
      const providerRef = providerRefMatch ? providerRefMatch[1] : null;
      if (debug)
        console.log('[opensubtitles_org][scrapers] open subtitle page', { subtitleUrl, bestScore });

      await page.goto(subtitleUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

      const downloadHrefs = await page
        .$$eval('a', (as) => {
          const links = (as as unknown as DomElementLike[])
            .map((a) => (a.getAttribute?.('href') || '') as string)
            .filter(Boolean)
            .filter(
              (href) =>
                href.includes('/subtitleserve/') ||
                href.includes('/en/subtitleserve/') ||
                href.includes('/en/download/')
            );
          return links;
        })
        .catch(() => [] as string[]);

      if (downloadHrefs.length === 0) {
        if (debug) console.log('[opensubtitles_org][scrapers] no download link found');
        return null;
      }

      const uniq = Array.from(new Set(downloadHrefs.map((h) => String(h)))).filter(Boolean);
      const rank = (href: string): number => {
        const h = href.toLowerCase();
        // Prefer same-site subtitleserve endpoints.
        if (h.includes('/subtitleserve/')) return 0;
        if (h.includes('/en/subtitleserve/')) return 1;
        if (h.includes('/download/sub/')) return 2;
        if (h.includes('/en/download/')) return 3;
        return 9;
      };

      uniq.sort((a, b) => rank(a) - rank(b));
      const downloadHref = uniq[0];

      const downloadUrl = new URL(downloadHref, 'https://www.opensubtitles.org').toString();
      if (debug) console.log('[opensubtitles_org][scrapers] download', { downloadUrl });

      let contentType: string | null = null;
      let raw: Buffer | null = null;

      const resp = await context.request.get(downloadUrl, {
        headers: {
          ...commonHeaders,
          accept: '*/*',
          referer: subtitleUrl,
          'user-agent': userAgent,
        },
        timeout: 60_000,
      });

      if (resp.ok()) {
        contentType = resp.headers()['content-type'] || null;
        raw = Buffer.from(await resp.body());
        osOrgConsecutive429s = 0;
      } else {
        const status = resp.status();
        const retryAfterHeader = resp.headers()['retry-after'];
        const retryAfterMs = parseRetryAfterMs(retryAfterHeader);

        if (debug) {
          console.log('[opensubtitles_org][scrapers] download failed', {
            status,
            retryAfter: retryAfterHeader || null,
          });
        }

        // Some protection layers treat APIRequestContext differently than a real browser.
        // If we got 429 here, try an actual browser-driven download once.
        if (status === 429) {
          osOrgConsecutive429s++;
          const fallbackTimeoutMs = Math.max(
            1_000,
            parseInt(process.env.OPENSUBTITLES_ORG_BROWSER_FALLBACK_TIMEOUT_MS || '15000', 10) ||
              15_000
          );

          if (debug) {
            console.log('[opensubtitles_org][scrapers] attempting browser download fallback', {
              fallbackTimeoutMs,
            });
          }

          const buf = await browserDownloadBytes(downloadUrl, fallbackTimeoutMs);
          if (!buf) {
            const backoffMs = compute429BackoffMs(retryAfterMs);
            if (_redis) {
              await reportProviderBlock(_redis, 'opensubtitles_org', backoffMs);
            }
            if (debug) {
              console.log(
                '[opensubtitles_org][scrapers] browser fallback also got 429; cooling down',
                {
                  backoffMs,
                }
              );
            }
            return null;
          }

          raw = buf;
          osOrgConsecutive429s = 0;
        } else {
          return null;
        }
      }

      if (!raw) return null;

      const payload = extractSubtitlePayload(raw);
      const text = decodeSubtitleBytes(payload, contentType);

      if (isHtml(text)) {
        const fallbackTimeoutMs = Math.max(
          1_000,
          parseInt(process.env.OPENSUBTITLES_ORG_BROWSER_FALLBACK_TIMEOUT_MS || '15000', 10) ||
            15_000
        );

        if (debug) {
          const preview = text.replace(/\s+/g, ' ').slice(0, 240);
          const hints = {
            hasLogin: /\blog\s*in\b|\bsign\s*in\b|\blogin\b/i.test(text),
            hasCaptcha: /captcha|cloudflare|turnstile|challenge/i.test(text),
            hasDownloadWord: /\bdownload\b/i.test(text),
          };
          console.log('[opensubtitles_org][scrapers] got HTML', { preview, hints });

          if (hints.hasCaptcha || hints.hasLogin) {
            const hasAnySession =
              Boolean(process.env.OPENSUBTITLES_ORG_USER_DATA_DIR) ||
              Boolean(process.env.OPENSUBTITLES_ORG_STORAGE_STATE_PATH) ||
              Boolean(process.env.OPENSUBTITLES_ORG_COOKIE) ||
              Boolean(resolvedStorageStatePath);

            const coolDownMs = hasAnySession ? 2 * 60_000 : 30 * 60_000;
            if (_redis) {
              await reportProviderBlock(_redis, 'opensubtitles_org', coolDownMs);
            }
            console.log('[opensubtitles_org][scrapers] captcha/login wall detected; backing off', {
              coolDownMs,
              hint: hasAnySession
                ? 'Session is present but bot wall still triggers; try OPENSUBTITLES_ORG_USER_DATA_DIR (Windows Chrome/Edge profile) for best results.'
                : 'Set OPENSUBTITLES_ORG_USER_DATA_DIR (best), OPENSUBTITLES_ORG_STORAGE_STATE_PATH, or OPENSUBTITLES_ORG_COOKIE to reuse a browser session.',
            });
          }
        }

        // Often /subtitleserve/ returns an HTML interstitial (challenge/login) that *renders*
        // a real dl.opensubtitles.org link. Try to extract it from the DOM first, so we can
        // reuse any cookies gained by navigating in the browser context.
        try {
          await page.goto(downloadUrl, {
            waitUntil: 'domcontentloaded',
            timeout: fallbackTimeoutMs,
          });
          const renderedDlUrl = await page
            .$$eval('a', (as) => {
              const hrefs = (
                as as unknown as Array<{ getAttribute?: (n: string) => string | null }>
              )
                .map((a) => (a.getAttribute?.('href') || '') as string)
                .filter(Boolean);
              return (
                hrefs.find((h) => h.includes('dl.opensubtitles.org/en/download/sub/')) ||
                hrefs.find((h) => h.includes('/download/sub/')) ||
                null
              );
            })
            .catch(() => null as string | null);

          if (renderedDlUrl) {
            const candidateUrl = renderedDlUrl.startsWith('http')
              ? renderedDlUrl
              : new URL(renderedDlUrl, 'https://www.opensubtitles.org').toString();

            if (debug)
              console.log('[opensubtitles_org][scrapers] trying DOM-extracted download URL', {
                candidateUrl,
              });

            const r2 = await context.request
              .get(candidateUrl, {
                headers: {
                  ...commonHeaders,
                  accept: '*/*',
                  referer: page.url(),
                  'user-agent': userAgent,
                },
                timeout: 60_000,
              })
              .catch(() => null);

            if (r2 && r2.ok()) {
              const ct2 = r2.headers()['content-type'] || null;
              const raw2 = Buffer.from(await r2.body());
              const payload2 = extractSubtitlePayload(raw2);
              const text2 = decodeSubtitleBytes(payload2, ct2);
              if (!isHtml(text2)) {
                return {
                  provider: 'opensubtitles_org',
                  downloadUrl: candidateUrl,
                  providerRef,
                  text: text2,
                };
              }
            }
          }
        } catch {
          // ignore and continue
        }

        // Next best: Try to extract a direct /download/sub/<id> (or dl.opensubtitles.org) link from the raw HTML.
        const extracted: string[] = [];
        const rel = text.match(/\/(?:en\/)?download\/sub\/\d+/gi);
        if (rel) extracted.push(...rel);
        const abs = text.match(/https?:\/\/dl\.opensubtitles\.org[^"'\s<]+/gi);
        if (abs) extracted.push(...abs);

        const uniqueCandidates = Array.from(new Set(extracted))
          .map((h) =>
            h.startsWith('http') ? h : new URL(h, 'https://www.opensubtitles.org').toString()
          )
          .slice(0, 3);

        for (const candidateUrl of uniqueCandidates) {
          if (debug)
            console.log('[opensubtitles_org][scrapers] trying extracted download URL', {
              candidateUrl,
            });

          const r2 = await context.request
            .get(candidateUrl, {
              headers: {
                ...commonHeaders,
                accept: '*/*',
                referer: subtitleUrl,
                'user-agent': userAgent,
              },
              timeout: 60_000,
            })
            .catch(() => null);

          if (r2 && r2.ok()) {
            const ct2 = r2.headers()['content-type'] || null;
            const raw2 = Buffer.from(await r2.body());
            const payload2 = extractSubtitlePayload(raw2);
            const text2 = decodeSubtitleBytes(payload2, ct2);
            if (!isHtml(text2)) {
              return {
                provider: 'opensubtitles_org',
                downloadUrl: candidateUrl,
                providerRef,
                text: text2,
              };
            }
          }
        }

        if (debug)
          console.log('[opensubtitles_org][scrapers] got HTML; attempting browser download', {
            fallbackTimeoutMs,
          });

        const buf = await browserDownloadBytes(downloadUrl, fallbackTimeoutMs);
        if (!buf) {
          if (debug)
            console.log('[opensubtitles_org][scrapers] browser download after HTML failed');
          return null;
        }

        const payload2 = extractSubtitlePayload(buf);
        const text2 = decodeSubtitleBytes(payload2, contentType);
        if (isHtml(text2)) {
          if (debug)
            console.log(
              '[opensubtitles_org][scrapers] browser download still returned HTML, skipping'
            );
          return null;
        }

        return {
          provider: 'opensubtitles_org',
          downloadUrl,
          providerRef,
          text: text2,
        };
      }

      return {
        provider: 'opensubtitles_org',
        downloadUrl,
        providerRef,
        text,
      };
    } catch (err) {
      if (debug) {
        console.log('[opensubtitles_org][scrapers] error', {
          message: err instanceof Error ? err.message : String(err),
        });
      }
      return null;
    } finally {
      // Close only the context (not the pooled browser)
      if (contextOwned && context) await context.close().catch(() => undefined);
    }
  });
}
