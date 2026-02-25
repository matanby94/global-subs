import { Pool } from 'pg';

const connectionString =
  process.env.DATABASE_URL || 'postgresql://stremio:stremio_dev@localhost:5432/stremio_ai_subs';

export const db = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ...(process.env.DATABASE_SSL === 'true' && { ssl: { rejectUnauthorized: true } }),
});
