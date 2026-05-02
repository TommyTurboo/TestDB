import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.PGHOST ?? 'localhost',
  port: Number(process.env.PGPORT ?? 5436),
  database: process.env.PGDATABASE ?? 'tablelab',
  user: process.env.PGUSER ?? 'tablelab',
  password: process.env.PGPASSWORD ?? 'tablelab',
  max: 12
});

export async function query(sql, params = []) {
  const start = performance.now();
  const result = await pool.query(sql, params);
  return {
    ...result,
    durationMs: Math.round((performance.now() - start) * 10) / 10
  };
}
