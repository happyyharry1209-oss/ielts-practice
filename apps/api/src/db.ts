import { mkdirSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { env } from './env';
import { SCHEMA_SQL } from './schema';

const { Pool } = pg;

/** Minimal client shape used inside transactions. */
export interface TxClient {
  query(text: string, params?: unknown[]): Promise<{ rowCount: number | null }>;
}

interface PGliteLike {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
  close(): Promise<void>;
}

const usePglite = env.databaseUrl.startsWith('pglite:');
const pgliteTarget = env.databaseUrl.slice('pglite:'.length) || 'memory';

export const dbEngine: 'pglite' | 'postgres' = usePglite ? 'pglite' : 'postgres';

let pglitePromise: Promise<PGliteLike> | null = null;
let pool: pg.Pool | null = null;

async function pglite(): Promise<PGliteLike> {
  if (!pglitePromise) {
    pglitePromise = (async () => {
      let PGlite: new (dir?: string) => PGliteLike & { waitReady: Promise<void> };
      try {
        ({ PGlite } = await import('@electric-sql/pglite'));
      } catch {
        throw new Error(
          'DATABASE_URL starts with "pglite:" but @electric-sql/pglite is not installed. ' +
            'Run npm install, or point DATABASE_URL at a real Postgres server.',
        );
      }
      if (pgliteTarget !== 'memory') {
        mkdirSync(path.dirname(pgliteTarget), { recursive: true });
      }
      const instance = new PGlite(pgliteTarget === 'memory' ? undefined : pgliteTarget);
      await instance.waitReady;
      return instance;
    })();
  }
  return pglitePromise;
}

function getPool(): pg.Pool {
  if (!pool) {
    const needsSsl =
      /sslmode=require/.test(env.databaseUrl) || /supabase\.(co|com)/.test(env.databaseUrl);
    pool = new Pool({
      connectionString: env.databaseUrl,
      max: 5,
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    });
    pool.on('error', (err) => {
      console.error('[db] idle client error', err.message);
    });
  }
  return pool;
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (usePglite) {
    const db = await pglite();
    const result = await db.query<T>(text, params);
    return result.rows;
  }
  const result = await getPool().query(text, params);
  return result.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function withTransaction<T>(fn: (client: TxClient) => Promise<T>): Promise<T> {
  if (usePglite) {
    const db = await pglite();
    await db.exec('begin');
    try {
      const result = await fn({
        query: async (text, params) => {
          const outcome = await db.query(text, params ?? []);
          return { rowCount: outcome.rows.length };
        },
      });
      await db.exec('commit');
      return result;
    } catch (error) {
      await db.exec('rollback').catch(() => {});
      throw error;
    }
  }

  const client = await getPool().connect();
  try {
    await client.query('begin');
    const result = await fn(client as unknown as TxClient);
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
  if (usePglite) {
    const db = await pglite();
    await db.exec(SCHEMA_SQL);
  } else {
    await getPool().query(SCHEMA_SQL);
  }
  schemaReady = true;
}

/** True when the database answers; used by /api/health. */
export async function dbHealthy(): Promise<boolean> {
  try {
    await query('select 1');
    return true;
  } catch {
    return false;
  }
}

export async function closeDb(): Promise<void> {
  if (usePglite) {
    if (pglitePromise) {
      const db = await pglitePromise.catch(() => null);
      await db?.close();
      pglitePromise = null;
    }
    return;
  }
  if (pool) {
    await pool.end();
    pool = null;
  }
}
