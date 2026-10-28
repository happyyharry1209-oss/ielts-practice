import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * Load .env files without adding a dependency. Values already present in the
 * environment always win, which is what hosted platforms expect.
 */
function loadEnv(): void {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
    path.resolve(process.cwd(), '../../.env'),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  }
}

loadEnv();

function parseOrigins(value: string | undefined): string[] {
  return (value ?? 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const isProd = process.env.NODE_ENV === 'production';
const jwtSecret = process.env.JWT_SECRET ?? 'dev-only-insecure-secret-change-me';

if (isProd && jwtSecret.startsWith('dev-only')) {
  throw new Error('JWT_SECRET must be set in production');
}

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Local default: an embedded Postgres (PGlite) stored in <repo>/.pglite.
 * This keeps `npm run dev` working with no Docker and no Postgres install.
 * Production must set DATABASE_URL.
 */
const defaultDatabaseUrl = `pglite:${path.resolve(here, '../../../.pglite')}`;

export const env = {
  isProd,
  port: Number(process.env.PORT ?? 8787),
  databaseUrl: process.env.DATABASE_URL ?? defaultDatabaseUrl,
  jwtSecret,
  corsOrigins: parseOrigins(process.env.CORS_ORIGIN),
  deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? '',
  deepseekModel: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
  contentDir: process.env.CONTENT_DIR ?? '',
  autoMigrate: process.env.AUTO_MIGRATE !== 'false',
  /** Max AI scoring requests per user per hour. */
  aiHourlyLimit: Number(process.env.AI_HOURLY_LIMIT ?? 20),
};
