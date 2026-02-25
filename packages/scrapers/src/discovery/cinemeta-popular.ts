import { z } from 'zod';
import Redis from 'ioredis';

/** Shared Redis connection for caching – set from scrapers entrypoint. */
let redis: Redis | null = null;
export function setCinemetaRedis(r: Redis) {
  redis = r;
}

const CATALOG_CACHE_TTL_SEC = 600; // 10 minutes

function getUserAgent(): string {
  return (
    process.env.SCRAPERS_USER_AGENT || process.env.OPENSUBTITLES_USER_AGENT || 'GlobalSubs/1.0'
  );
}

const cinemetaCatalogSchema = z
  .object({
    metas: z
      .array(
        z
          .object({
            imdb_id: z.string().optional(),
            type: z.string().optional(),
          })
          .passthrough()
      )
      .optional(),
  })
  .passthrough();

const cinemetaSeriesMetaSchema = z
  .object({
    meta: z
      .object({
        videos: z
          .array(
            z
              .object({
                id: z.string().optional(),
                season: z.number().int().optional(),
                episode: z.number().int().optional(),
              })
              .passthrough()
          )
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

async function fetchCatalogImdbIds(params: { type: 'movie' | 'series' }): Promise<string[]> {
  // Check Redis cache first
  const cacheKey = `cinemeta:catalog:${params.type}`;
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as string[];
    } catch {
      /* cache miss, fetch normally */
    }
  }

  const base = (process.env.CINEMETA_BASE_URL || 'https://v3-cinemeta.strem.io').replace(/\/$/, '');
  const url = `${base}/catalog/${params.type}/top.json`;

  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': getUserAgent(),
    },
  });

  if (!res.ok) {
    throw new Error(`Cinemeta catalog failed: ${params.type} HTTP ${res.status}`);
  }

  const raw = (await res.json().catch(() => null)) as unknown;
  const parsed = cinemetaCatalogSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.metas) return [];

  const ids = parsed.data.metas
    .map((m) => (typeof m.imdb_id === 'string' ? m.imdb_id : null))
    .filter((x): x is string => !!x && /^tt\d+$/.test(x));

  // Deduplicate while preserving order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }

  // Cache in Redis for subsequent ticks
  if (redis && out.length > 0) {
    try {
      await redis.set(cacheKey, JSON.stringify(out), 'EX', CATALOG_CACHE_TTL_SEC);
    } catch {
      /* non-critical */
    }
  }

  return out;
}

async function fetchSeriesEpisodeSrcIds(imdbTt: string): Promise<string[]> {
  const base = (process.env.CINEMETA_BASE_URL || 'https://v3-cinemeta.strem.io').replace(/\/$/, '');
  const url = `${base}/meta/series/${imdbTt}.json`;

  const res = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': getUserAgent(),
    },
  });

  if (!res.ok) {
    throw new Error(`Cinemeta meta failed: ${imdbTt} HTTP ${res.status}`);
  }

  const raw = (await res.json().catch(() => null)) as unknown;
  const parsed = cinemetaSeriesMetaSchema.safeParse(raw);
  if (!parsed.success) return [];

  const videos = parsed.data.meta?.videos ?? [];

  const out: Array<{ id: string; season: number; episode: number }> = [];
  for (const v of videos) {
    const id = typeof v.id === 'string' ? v.id : null;
    if (id && /^tt\d+:\d+:\d+$/.test(id)) {
      const parts = id.split(':');
      const season = parseInt(parts[1] || '', 10);
      const episode = parseInt(parts[2] || '', 10);
      if (Number.isFinite(season) && season > 0 && Number.isFinite(episode) && episode > 0) {
        out.push({ id, season, episode });
      }
      continue;
    }

    const season = typeof v.season === 'number' ? v.season : NaN;
    const episode = typeof v.episode === 'number' ? v.episode : NaN;
    if (Number.isFinite(season) && season > 0 && Number.isFinite(episode) && episode > 0) {
      out.push({ id: `${imdbTt}:${season}:${episode}`, season, episode });
    }
  }

  // Deduplicate (and normalize ordering) to keep inserts stable.
  out.sort((a, b) => a.season - b.season || a.episode - b.episode);
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const e of out) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    deduped.push(e.id);
  }
  return deduped;
}

function parseLangList(input: string): string[] {
  const langs = input
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .filter((s) => /^[a-z]{2}$/.test(s));
  return Array.from(new Set(langs));
}

function parseSeriesEpisode(input: string): { season: number; episode: number } {
  const trimmed = input.trim();
  const m = trimmed.match(/^(\d+):(\d+)$/);
  if (!m) return { season: 1, episode: 1 };
  const season = parseInt(m[1], 10);
  const episode = parseInt(m[2], 10);
  if (!Number.isFinite(season) || season <= 0) return { season: 1, episode: 1 };
  if (!Number.isFinite(episode) || episode <= 0) return { season: 1, episode: 1 };
  return { season, episode };
}

export async function discoverPopularScrapeTargets(): Promise<
  Array<{ srcRegistry: 'imdb'; srcId: string; langs: string[] }>
> {
  const langs = parseLangList(process.env.SCRAPERS_SOURCE_LANGS || 'en');
  if (langs.length === 0) return [];

  const maxMovies = Math.max(0, parseInt(process.env.SCRAPERS_POPULAR_MOVIES_COUNT || '100', 10));
  const maxSeries = Math.max(0, parseInt(process.env.SCRAPERS_POPULAR_SERIES_COUNT || '100', 10));

  const seriesEpisode = parseSeriesEpisode(process.env.SCRAPERS_POPULAR_SERIES_EPISODE || '1:1');

  const [movieIds, seriesIds] = await Promise.all([
    maxMovies > 0 ? fetchCatalogImdbIds({ type: 'movie' }) : Promise.resolve([]),
    maxSeries > 0 ? fetchCatalogImdbIds({ type: 'series' }) : Promise.resolve([]),
  ]);

  const movies = movieIds.slice(0, maxMovies).map((tt) => ({
    srcRegistry: 'imdb' as const,
    srcId: tt,
    langs,
  }));

  const series: Array<{ srcRegistry: 'imdb'; srcId: string; langs: string[] }> = [];

  // Parallelize series episode discovery in chunks of 15 for faster throughput.
  const SERIES_CONCURRENCY = 15;
  const seriesSlice = seriesIds.slice(0, maxSeries);
  for (let i = 0; i < seriesSlice.length; i += SERIES_CONCURRENCY) {
    const chunk = seriesSlice.slice(i, i + SERIES_CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map(async (tt) => {
        try {
          return await fetchSeriesEpisodeSrcIds(tt);
        } catch {
          return [];
        }
      })
    );
    for (let j = 0; j < chunk.length; j++) {
      let episodeIds = chunkResults[j];
      const tt = chunk[j];
      // Fallback: if Cinemeta meta is missing/unavailable, scrape at least one episode.
      if (episodeIds.length === 0) {
        episodeIds = [`${tt}:${seriesEpisode.season}:${seriesEpisode.episode}`];
      }
      for (const srcId of episodeIds) {
        series.push({ srcRegistry: 'imdb', srcId, langs });
      }
    }
  }

  return [...movies, ...series];
}
