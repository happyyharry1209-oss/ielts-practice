import process from 'node:process';
import { hashPassword } from '../apps/api/src/auth';
import { closeDb, dbEngine, ensureSchema, query, queryOne } from '../apps/api/src/db';

function fail(message: string): never {
  console.error(`✖ ${message}`);
  console.error(`
Usage:
  ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-password' npm run seed:admin

PowerShell:
  $env:ADMIN_EMAIL="you@example.com"; $env:ADMIN_PASSWORD="a-long-password"; npm run seed:admin

Optional:
  ADMIN_NAME           display name (default: Administrator)
  ADMIN_RESET_PASSWORD=true   also reset the password of an existing admin
  DATABASE_URL         Postgres connection string (default: embedded PGlite)
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

  try {
    await ensureSchema();
    console.log(`[seed] database: ${dbEngine}`);

    const existing = await queryOne<{ id: string; role: string }>(
      'select id, role from users where email = $1',
      [email],
    );

    if (existing) {
      await query("update users set role = 'admin', email_verified = true where id = $1", [
        existing.id,
      ]);
      if (process.env.ADMIN_RESET_PASSWORD === 'true') {
        await query('update users set password_hash = $1 where id = $2', [
          hashPassword(password),
          existing.id,
        ]);
        console.log(`✔ existing account ${email} promoted to admin and password reset`);
      } else {
        console.log(`✔ existing account ${email} promoted to admin (password unchanged)`);
      }
      console.log('  Use ADMIN_RESET_PASSWORD=true if you have lost the password.');
      return;
    }

    await query(
      `insert into users (email, password_hash, display_name, role, email_verified)
       values ($1, $2, $3, 'admin', true)`,
      [email, hashPassword(password), name],
    );
    console.log(`✔ admin account created: ${email}`);
    console.log('  Keep these credentials out of git.');
  } finally {
    await closeDb();
  }
}

main().catch((error) => {
  console.error('✖ failed:', error.message);
  process.exit(1);
});
