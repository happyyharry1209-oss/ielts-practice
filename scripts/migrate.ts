import path from 'node:path';
import pg from 'pg';
import { SCHEMA_SQL } from '../apps/api/src/schema';
import { loadEnvFiles } from './env';

loadEnvFiles(path.resolve(import.meta.dirname, '..'));

const { Pool } = pg;

async function main() {
  const connectionString =
    process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/ielts';
  const needsSsl =
    /sslmode=require/.test(connectionString) || /supabase\.(co|com)/.test(connectionString);

  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });

  try {
    await pool.query(SCHEMA_SQL);
    console.log(`✔ schema applied to ${connectionString.replace(/:[^:@/]+@/, ':***@')}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('✖ migration failed:', error.message);
  process.exit(1);
});
