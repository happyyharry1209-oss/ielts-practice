import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { loadContent, getContent } from './content';
import { dbHealthy, dbEngine, ensureSchema } from './db';
import { env } from './env';
import { HttpError } from './http';
import { mailerConfigured } from './mailer';
import { adminRoutes } from './routes/admin';
import { attemptRoutes } from './routes/attempts';
import { authRoutes } from './routes/auth';
import { contentRoutes } from './routes/content';
import { speakingRoutes } from './routes/speaking';
import { writingRoutes } from './routes/writing';

const app = new Hono();

app.use('*', logger());

const allowedOrigins = new Set(env.corsOrigins);
function originAllowed(origin: string): boolean {
  if (allowedOrigins.has('*') || allowedOrigins.has(origin)) return true;
  if (!env.isProd && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return false;
}

app.use(
  '/api/*',
  cors({
    origin: (origin) => (originAllowed(origin) ? origin : undefined),
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 86400,
  }),
);

app.get('/api/health', async (c) => {
  return c.json({
    ok: true,
    db: await dbHealthy(),
    engine: dbEngine,
    ai: Boolean(env.deepseekApiKey),
    mail: mailerConfigured(),
    // Booleans only — never expose the actual credentials. Useful when a
    // deployment is not picking up environment variables.
    mailConfig: {
      smtpHost: Boolean(env.smtpHost),
      smtpUser: Boolean(env.smtpUser),
      smtpPass: Boolean(env.smtpPass),
      resend: Boolean(env.resendApiKey),
      mailFrom: env.mailFrom,
      appUrl: env.appUrl,
    },
    contentDir: getContent().dir,
    tests: Object.fromEntries(
      Object.entries(getContent().manifest).map(([skill, list]) => [skill, list.length]),
    ),
  });
});

app.route('/api/auth', authRoutes);
app.route('/api/content', contentRoutes);
app.route('/api/attempts', attemptRoutes);
app.route('/api/writing', writingRoutes);
app.route('/api/speaking', speakingRoutes);
app.route('/api/admin', adminRoutes);

app.notFound((c) => c.json({ error: 'Not found' }, 404));

app.onError((error, c) => {
  if (error instanceof HttpError) {
    return c.json({ error: error.message }, error.status as 400);
  }
  const code = (error as { code?: string }).code;
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === '28P01' || code === '3D000') {
    console.error('[db] unavailable:', (error as Error).message);
    return c.json(
      { error: 'Database unavailable. Start Postgres (docker compose up -d) or set DATABASE_URL.' },
      503,
    );
  }
  console.error('[api] unhandled error:', error);
  return c.json({ error: 'Internal server error' }, 500);
});

async function main() {
  const content = await loadContent();
  console.log(
    `[content] ${content.dir} — ` +
      Object.entries(content.manifest)
        .map(([skill, list]) => `${skill}:${list.length}`)
        .join(' '),
  );

  if (env.autoMigrate) {
    try {
      await ensureSchema();
      console.log('[db] schema ready');
    } catch (error) {
      console.warn(
        '[db] could not reach the database — auth/attempts will fail until it is available.',
        (error as Error).message,
      );
    }
  }

  serve({ fetch: app.fetch, port: env.port }, (info) => {
    console.log(`[api] listening on http://localhost:${info.port}`);
  });
}

main().catch((error) => {
  console.error('[api] failed to start:', error);
  process.exit(1);
});
