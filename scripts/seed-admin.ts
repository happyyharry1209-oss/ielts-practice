import path from 'node:path';
import process from 'node:process';
import pg from 'pg';
import { hashPassword } from '../apps/api/src/auth';
import { SCHEMA_SQL } from '../apps/api/src/schema';
import { loadEnvFiles } from './env';

loadEnvFiles(path.resolve(import.meta.dirname, '..'));

const { Pool } = pg;

function fail(message: string): never {
  console.error(`✖ ${message}`);
  console.error(`
Usage:
  ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-password' npm run seed:admin

Optional:
  ADMIN_NAME           display name (default: Administrator)
  ADMIN_RESET_PASSWORD=true   also reset the password of an existing admin
  DATABASE_URL         Postgres connection string
`);
  process.exit(1);
}

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? '';
  const name = process.env.ADMIN_NAME ?? 'Administrator';

  if (!email || !password) fail('ADMIN_EMAIL and ADMIN_PASSWORD are required');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('ADMIN_EMAIL does not look like an email');
  if (password.length < 10) fail('ADMIN_PASSWORD must be at least 10 characters');

  const connectionString =
    process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/ielts';
  const pool = new Pool({
    connectionString,
    max: 1,
    ssl: /sslmode=require|supabase\.(co|com)/.test(connectionString)
      ? { rejectUnauthorized: false }
      : undefined,
  });

  try {
    await pool.query(SCHEMA_SQL);

    const existing = await pool.query<{ id: string; role: string }>(
      'select id, role from users where email = $1',
      [email],
    );

    if (existing.rows[0]) {
      const id = existing.rows[0].id;
      await pool.query("update users set role = 'admin' where id = $1", [id]);
      if (process.env.ADMIN_RESET_PASSWORD === 'true') {
        await pool.query('update users set password_hash = $1 where id = $2', [
          hashPassword(password),
          id,
        ]);
        console.log(`✔ existing account ${email} promoted to admin and password reset`);
      } else {
        console.log(`✔ existing account ${email} promoted to admin (password unchanged)`);
      }
      console.log('  Use ADMIN_RESET_PASSWORD=true if you have lost the password.');
      return;
    }

    await pool.query(
      `insert into users (email, password_hash, display_name, role)
       values ($1, $2, $3, 'admin')`,
      [email, hashPassword(password), name],
    );
    console.log(`✔ admin account created: ${email}`);
    console.log('  Keep these credentials out of git. Log in and change the password if you expose the site.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('✖ failed:', error.message);
  process.exit(1);
});
