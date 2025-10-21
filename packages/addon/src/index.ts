import { addonBuilder, serveHTTP } from 'stremio-addon-sdk';
import { db } from './db';

const PORT = parseInt(process.env.ADDON_PORT || '7000', 10);

const manifest = {
  id: 'com.stremio.ai.subtitles',
  version: '1.0.0',
  name: 'Stremio AI Subtitles',
  description: 'AI-powered translated subtitles for Stremio',
  resources: ['subtitles'],
  types: ['movie', 'series'],
  catalogs: [],
  idPrefixes: ['tt'],
};

const builder = new addonBuilder(manifest);

builder.defineSubtitlesHandler(async ({ type, id, extra }) => {
  console.log(`Subtitles request: ${type} ${id}`, extra);

  try {
    // Parse IMDB ID
    const imdbId = id.split(':')[0];

    // Look up available translations for this content
    const result = await db.query(
      `SELECT DISTINCT a.hash, a.dst_lang, a.storage_key
       FROM artifacts a
       WHERE a.src_registry = 'imdb' AND a.src_id = $1
       ORDER BY a.created_at DESC
       LIMIT 10`,
      [imdbId]
    );

    const subtitles = result.rows.map((row) => ({
      id: row.hash,
      url: `${process.env.API_URL || 'http://localhost:3001'}/api/sign/artifact/${row.hash}`,
      lang: row.dst_lang,
    }));

    return { subtitles };
  } catch (err) {
    console.error('Error fetching subtitles:', err);
    return { subtitles: [] };
  }
});

serveHTTP(builder.getInterface(), { port: PORT });

console.log(`🎬 Stremio addon running on http://localhost:${PORT}/manifest.json`);
