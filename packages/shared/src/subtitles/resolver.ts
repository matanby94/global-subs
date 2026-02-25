import {
  downloadMovieSubtitlesSubtitleText,
  findMovieSubtitlesDownload,
  getMovieSubtitlesConfigStatus,
} from './providers/moviesubtitles';
import {
  downloadOpenSubtitlesSubtitleText,
  findOpenSubtitlesDownload,
  getOpenSubtitlesConfigStatus,
} from './providers/opensubtitles';
import {
  downloadSubdlSubtitleText,
  findSubdlDownload,
  getSubdlConfigStatus,
} from './providers/subdl';
import type { ResolveSubtitleParams, ResolvedSubtitleText } from './types';

export type ResolveError = {
  provider: string;
  stage: 'find' | 'download';
  message: string;
};

export type ResolveSubtitleResult =
  | { ok: true; value: ResolvedSubtitleText }
  | {
      ok: false;
      reason: 'no_candidate' | 'not_configured';
      errors: ResolveError[];
      notes: string[];
    };

export async function resolveSubtitleText(
  params: ResolveSubtitleParams
): Promise<ResolveSubtitleResult> {
  const lang = params.lang.toLowerCase();
  const errors: ResolveError[] = [];
  const notes: string[] = [];

  const configuredProviders: string[] = [];

  // ── Build list of provider tasks to run in parallel ──
  type ProviderTask = () => Promise<ResolvedSubtitleText | null>;
  const tasks: Array<{ name: string; task: ProviderTask }> = [];

  const subdlCfg = getSubdlConfigStatus();
  if (subdlCfg.configured) {
    configuredProviders.push('subdl');
    tasks.push({
      name: 'subdl',
      task: async () => {
        const candidate = await findSubdlDownload({
          imdbTt: params.imdbTt,
          season: params.season,
          episode: params.episode,
          lang,
        });
        if (!candidate) return null;
        const dl = await downloadSubdlSubtitleText(candidate.url);
        return {
          provider: 'subdl' as const,
          downloadUrl: candidate.url,
          providerRef: candidate.providerRef || null,
          detectedLang: candidate.lang || null,
          filename: dl.filename || null,
          finalUrl: null,
          text: dl.text,
          meta: (candidate.meta || {}) as Record<string, unknown>,
        };
      },
    });
  } else {
    notes.push(subdlCfg.reason);
  }

  const msCfg = getMovieSubtitlesConfigStatus();
  if (msCfg.configured) {
    configuredProviders.push('moviesubtitles');
    tasks.push({
      name: 'moviesubtitles',
      task: async () => {
        const candidate = await findMovieSubtitlesDownload({
          imdbTt: params.imdbTt,
          season: params.season,
          episode: params.episode,
          lang,
        });
        if (!candidate) return null;
        const dl = await downloadMovieSubtitlesSubtitleText(candidate.url);
        return {
          provider: 'moviesubtitles' as const,
          downloadUrl: candidate.url,
          providerRef: candidate.providerRef || null,
          detectedLang: candidate.lang || null,
          filename: dl.filename || null,
          finalUrl: dl.finalUrl || null,
          text: dl.text,
          meta: (candidate.meta || {}) as Record<string, unknown>,
        };
      },
    });
  } else {
    notes.push(msCfg.reason);
  }

  const osCfg = getOpenSubtitlesConfigStatus();
  if (osCfg.configured) {
    configuredProviders.push('opensubtitles');
    if (params.imdbNumeric != null) {
      tasks.push({
        name: 'opensubtitles',
        task: async () => {
          const candidate = await findOpenSubtitlesDownload({
            imdbNumeric: params.imdbNumeric!,
            season: params.season,
            episode: params.episode,
            languages: lang,
          });
          if (!candidate) return null;
          const dl = await downloadOpenSubtitlesSubtitleText(candidate.url);
          return {
            provider: 'opensubtitles' as const,
            downloadUrl: candidate.url,
            providerRef: candidate.providerRef || null,
            detectedLang: candidate.lang || null,
            filename: null,
            finalUrl: null,
            text: dl.text,
            meta: {},
          };
        },
      });
    } else {
      notes.push('OpenSubtitles skipped: imdbNumeric missing');
    }
  } else {
    notes.push(osCfg.reason);
  }

  if (configuredProviders.length === 0) {
    return { ok: false, reason: 'not_configured', errors, notes };
  }

  // ── Run all provider tasks in parallel with individual timeouts ──
  const PROVIDER_TIMEOUT_MS = 15_000;

  const wrappedTasks = tasks.map(({ name, task }) =>
    Promise.race([
      task().then(
        (result) => ({ name, result, error: null as Error | null }),
        (err) => ({ name, result: null as ResolvedSubtitleText | null, error: err as Error })
      ),
      new Promise<{ name: string; result: null; error: Error }>((resolve) =>
        setTimeout(
          () =>
            resolve({
              name,
              result: null,
              error: new Error(`Timed out after ${PROVIDER_TIMEOUT_MS}ms`),
            }),
          PROVIDER_TIMEOUT_MS
        )
      ),
    ])
  );

  const results = await Promise.all(wrappedTasks);

  // Return the first successful result (preserving priority order: subdl > moviesubtitles > opensubtitles)
  for (const { name, result, error } of results) {
    if (error) {
      // Determine stage from error context
      errors.push({
        provider: name,
        stage: 'find',
        message: error instanceof Error ? error.message : String(error),
      });
    } else if (result) {
      return { ok: true, value: result };
    }
  }

  return { ok: false, reason: 'no_candidate', errors, notes };
}
