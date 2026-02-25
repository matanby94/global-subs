# Free Subtitle Scraper Sources

This repo’s **scrapers** service (packages/scrapers) fetches _baseline_ source subtitles (NOT translated artifacts), normalizes them to WebVTT, stores them in S3 under:

- `sources/{contentHash}/{contentHash}.vtt`

…and UPSERTs a row into `subtitle_sources` (Postgres) keyed by:

- `(src_registry, src_id, lang, content_hash)`

The translation pipeline later consumes these baselines.

## Goals

- Reduce dependency on OpenSubtitles (rate limits / outages / API key requirements).
- Increase cache hit rate for baseline subtitles for a given `(srcRegistry, srcId, lang)`.
- Keep scrapers **idempotent**, **polite**, and **metadata-aware**.

## Non-goals

- No LLM calls.
- No translation job enqueueing.
- No user-facing UX changes.

## Common patterns (all providers)

### Input identity

Current scrape jobs are driven by Stremio-style IDs:

- `srcRegistry`: currently `imdb`
- `srcId`: `tt1234567` for movies, or `tt1234567:S:E` for episodes
- `lang`: ISO-639-1 lower-case (e.g. `en`)

### Output normalization

- Download subtitle (SRT/VTT/ASS/SSA)
- Normalize to WebVTT via `@stremio-ai-subs/shared` (no provider-specific formatting)
- Compute `contentHash = sha256(vtt)`
- Store S3 key `sources/{contentHash}/{contentHash}.vtt`

### Idempotency

- Each `(src_registry, src_id, lang)` is tracked in `scrape_requests`.
- Each baseline insert is UPSERTed on `(src_registry, src_id, lang, content_hash)`.
- Scraper should be safe to re-run for the same content.

### Polite scraping

- Per-provider minimum request interval (e.g. 250–1000ms).
- Retries with exponential backoff for `429` and transient `5xx`.
- Set an explicit `User-Agent`.
- Prefer APIs when they are stable and do not require paid access; prefer HTML only when no API exists.

### Quality / priority heuristics (proposal)

When multiple providers return candidates, score and pick best. Suggested scoring signals (provider-dependent):

- Exact ID match (IMDb/TMDB) > fuzzy title match
- Exact season/episode match > inferred
- Hearing-impaired flag: prefer **non-HI** by default (configurable)
- “Full season” pack: prefer single-episode subs when scraping a specific episode
- Presence of release match string(s)
- Community rating / download count

Store the score & signals inside `subtitle_sources.meta` for later auditing.

## Provider designs (prioritized)

### 1) SubDL (Subscene successor)

**Access method**: Public HTTP JSON API, but requires an API key tied to an account.

- Search endpoint: `GET https://api.subdl.com/api/v1/subtitles`
- Download: `https://dl.subdl.com/subtitle/{zipId}.zip` (zip contains subtitle files)

**Search strategy**

- Primary: `imdb_id=tt...` + `type=movie|tv` + `season_number`/`episode_number` + `languages`.
- Secondary (fallback): `film_name` + `year` (only if we later add title/year to job meta).

**Download strategy**

- Download zip (`.zip`), extract first subtitle-looking file (`.srt`/`.vtt`/`.ass`/`.ssa`).
- Normalize to WebVTT.

**Metadata extraction**

- Use API response fields when present: imdb/tmdb ids, season/episode, HI flag, releases, comment.
- Map to internal identity: `(src_registry='imdb', src_id=stremioId, lang)`.

**Failure modes**

- Missing/invalid API key → skip provider.
- 429 / rate limit → retry with backoff; may fall back to other providers.
- Zip contains multiple subtitle files → pick best candidate (initially: first supported file).
- Download fails or content unreadable → mark request failed only after exhausting providers.

**Rate limiting**

- API notes indicate rate limiting is applied; implement a min-interval and respect 429.

**Legal/licensing risk (notes)**

- Community subtitles may have unclear redistribution rights; treat as operational risk.
- Keep a `status` path for `takedown` / `blocked` already exists in schema.

### 2) Podnapisi

**Access method**: Site is publicly browsable; API documentation appears to be behind login/forum access.

**Reality check (Dec 2025)**: In automated access from this environment, Podnapisi responded with HTTP 429 and a “Server is overloaded” page. Treat this source as **highly rate-limited / bot-protected** and keep it disabled by default.

**Strategy**

- Phase 1: HTML scraping of “advanced search” endpoints (polite rate limiting), extract subtitle IDs and download links.
- Phase 2: If an open API exists, switch to API.

**Metadata mapping**

- Often includes season/episode and release names on listing pages.
- IMDb linkage may be available for many titles; if not, use title/year matching.

**Failure modes**

- HTML structure changes; requires robust selectors and tests.
- Potential anti-bot measures.

### 3) Podnapisi (video hash) / SubDB (hash)

If we later feed **video hash** or **file hash** into scrape jobs, these become strong “supplemental” sources.

- Requires an upstream component that computes hashes from the user’s media (not currently in scope).

**Reality check (Dec 2025)**: `subdb.com` appears to be parked/for-sale in this environment, so SubDB integration is not actionable right now.

### 4) Addic7ed

**Access method**: HTML scraping, often with login and rate limits.

**Strategy**

- TV-first: scrape episode pages by show/season/episode.
- Requires careful compliance with ToS and strong rate limiting.

**Failure modes**

- Login + session cookies, anti-scraping protections, frequent layout changes.

### 5) TVsubtitles.net / Moviesubtitles.org

**Access method**: HTML, no auth.

**Strategy**

- Title/year matching + season/episode path extraction.
- Use conservative matching and store low confidence if no direct IDs.

### (Optional) Amara

**Access method**: API.

**Strategy**

- Good for legally safe captions but content catalog differs (education/CC).
- Useful as a “safe baseline” source.

## Integration plan (current repo)

### Where it plugs in

- Tick discovers candidates and inserts/refreshes `scrape_requests`.
  - Default mode is "popular": seed from Cinemeta top catalogs (proactive backfill).
  - Legacy mode is "requests": seed from in-flight `translation_requests`.
- Scrape processor becomes **multi-provider**:
  1. Try free sources (e.g. SubDL) if configured.
  2. Fall back to OpenSubtitles.
  3. If all fail, mark `scrape_requests` as `failed` with aggregated reason.

### Provider adapter shape (recommended)

Each provider module should expose:

- `getXConfigStatus()` → `{ configured: boolean, reason?: string }`
- `findXDownload(params)` → returns a minimal candidate:
  - `downloadUrl`
  - `providerRef`
  - `detectedLang`
  - `originalFormatHint` (optional)
  - `meta` (raw response fields + scoring inputs)

Download/parsing can be either inside provider or in the common scrape processor.

---

## Next implementation step

Implement SubDL first (real API docs are accessible) and wire it into `scrapeProcessor` as the first-choice provider, with OpenSubtitles as fallback.
