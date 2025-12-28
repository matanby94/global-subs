import { Pool } from 'pg';

const connectionString =
  process.env.DATABASE_URL || 'postgresql://stremio:stremio_dev@localhost:5466/stremio_ai_subs';

export const db = new Pool({
  connectionString,
  max: 10,
});
