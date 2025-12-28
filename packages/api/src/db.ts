import { Pool } from 'pg';

const connectionString =
  process.env.DATABASE_URL || 'postgresql://stremio:stremio_dev@localhost:5466/stremio_ai_subs';

export const db = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection
db.on('connect', () => {
  console.log('✅ Database connected');
});

db.on('error', (err) => {
  console.error('❌ Database error:', err);
});
