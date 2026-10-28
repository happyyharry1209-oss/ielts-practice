import pg from 'pg';
import { env } from './env';
import { SCHEMA_SQL } from './schema';

const { Pool } = pg;

const needsSsl =
  /sslmode=require/.test(env.databaseUrl) || /supabase\.(co|com)/.test(env.databaseUrl);

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 5,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => {
  console.error('[db] idle client error', err.message);
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

let schemaReady = false;

/** Idempotent schema creation, safe to call on every boot. */
export async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  await pool.query(SCHEMA_SQL);
  schemaReady = true;
}

/** True when the database answers; used by /api/health. */
export async function dbHealthy(): Promise<boolean> {
  try {
    await pool.query('select 1');
    return true;
  } catch {
    return false;
  }
}
