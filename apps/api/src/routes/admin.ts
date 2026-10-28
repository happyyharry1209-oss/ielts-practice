import { Hono } from 'hono';
import { connect } from 'node:net';
import { z } from 'zod';
import { createResetToken } from '../authTokens';
import { getContent } from '../content';
import { query, queryOne } from '../db';
import { HttpError, parseBody, requireAdmin, requireAuth } from '../http';
import { mailerConfigured, sendMail } from '../mailer';

/** Try a TCP connection so we can tell whether the host blocks SMTP ports. */
function probe(host: string, port: number, timeoutMs = 8000): Promise<{
  host: string;
  port: number;
  ok: boolean;
  ms: number;
  error?: string;
}> {
  const started = Date.now();
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const finish = (ok: boolean, error?: string) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve({ host, port, ok, ms: Date.now() - started, error });
    };
    const timer = setTimeout(() => finish(false, 'timeout'), timeoutMs);
    socket.once('connect', () => {
      clearTimeout(timer);
      finish(true);
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      finish(false, error.message);
    });
  });
}

export const adminRoutes = new Hono();

adminRoutes.use('*', requireAuth, requireAdmin);

adminRoutes.get('/overview', async (c) => {
  const counts = await queryOne<{
    users: number;
    admins: number;
    attempts: number;
    submissions: number;
    recordings: number;
    ai_calls: number;
    ai_cost: number;
  }>(
    `select
       (select count(*) from users)::int as users,
       (select count(*) from users where role = 'admin')::int as admins,
       (select count(*) from attempts where submitted_at is not null)::int as attempts,
       (select count(*) from writing_submissions)::int as submissions,
       (select count(*) from speaking_recordings)::int as recordings,
       (select count(*) from ai_usage where created_at > now() - interval '30 days')::int as ai_calls,
       (select coalesce(sum(cost_usd), 0) from ai_usage where created_at > now() - interval '30 days')::float8 as ai_cost`,
  );

  const manifest = getContent().manifest;
  return c.json({
    counts,
    content: {
      reading: manifest.reading.length,
      listening: manifest.listening.length,
      writing: manifest.writing.length,
      speaking: manifest.speaking.length,
    },
  });
});

adminRoutes.get('/users', async (c) => {
  const search = (c.req.query('q') ?? '').trim();
  const rows = await query(
    `select u.id, u.email, u.display_name, u.role, u.created_at, u.last_login_at,
            (select count(*) from attempts a where a.user_id = u.id and a.submitted_at is not null)::int as attempts,
            (select count(*) from writing_submissions w where w.user_id = u.id)::int as writing_submissions,
            (select max(a.submitted_at) from attempts a where a.user_id = u.id) as last_attempt_at
     from users u
     where ($1 = '' or u.email ilike '%' || $1 || '%' or u.display_name ilike '%' || $1 || '%')
     order by u.created_at desc
     limit 100`,
    [search],
  );
  return c.json({ users: rows });
});

const roleSchema = z.object({ role: z.enum(['user', 'admin']) });

adminRoutes.patch('/users/:id', async (c) => {
  const body = await parseBody(c, roleSchema);
  const targetId = c.req.param('id');
  if (targetId === c.get('userId') && body.role !== 'admin') {
    throw new HttpError(400, 'You cannot remove your own admin role');
  }
  const rows = await query<{ id: string; email: string; role: string }>(
    'update users set role = $1 where id = $2 returning id, email, role',
    [body.role, targetId],
  );
  if (!rows[0]) throw new HttpError(404, 'User not found');
  return c.json({ user: rows[0] });
});

/**
 * Create a password-reset token for a user. This is the fallback when no mail
 * provider is configured: the admin copies the link and sends it manually.
 *
 * Only the token is returned — the browser builds the absolute URL from its own
 * origin and base path, so this works even when APP_URL is not configured.
 */
adminRoutes.post('/users/:id/reset-link', async (c) => {
  const target = await queryOne<{ id: string; email: string }>(
    'select id, email from users where id = $1',
    [c.req.param('id')],
  );
  if (!target) throw new HttpError(404, 'User not found');

  const token = await createResetToken(target.id);
  return c.json({
    email: target.email,
    token,
    expiresInMinutes: 60,
  });
});

adminRoutes.get('/usage', async (c) => {  const days = Math.min(Math.max(Number(c.req.query('days') ?? 30), 1), 365);
  const daily = await query(
    `select date_trunc('day', created_at)::date as day,
            count(*)::int as calls,
            coalesce(sum(tokens_in), 0)::int as tokens_in,
            coalesce(sum(tokens_out), 0)::int as tokens_out,
            coalesce(sum(cost_usd), 0)::float8 as cost_usd
     from ai_usage
     where created_at > now() - ($1 || ' days')::interval
     group by 1
     order by 1`,
    [days],
  );

  const topUsers = await query(
    `select u.email, count(*)::int as calls, coalesce(sum(a.cost_usd), 0)::float8 as cost_usd
     from ai_usage a join users u on u.id = a.user_id
     where a.created_at > now() - ($1 || ' days')::interval
     group by u.email
     order by cost_usd desc
     limit 10`,
    [days],
  );

  return c.json({ days, daily, topUsers });
});

adminRoutes.get('/content', (c) => {
  return c.json(getContent().manifest);
});

/**
 * Probe the outgoing SMTP ports. Some hosts block 465/587, which shows up as
 * "Connection timeout" when sending.
 */
adminRoutes.get('/mail-check', async (c) => {
  const targets: Array<[string, number]> = [
    ['smtp.gmail.com', 465],
    ['smtp.gmail.com', 587],
    ['smtp-relay.brevo.com', 587],
    ['api.resend.com', 443],
  ];
  const results = [];
  for (const [host, port] of targets) {
    results.push(await probe(host, port));
  }
  return c.json({ results });
});

/**
 * Send a test email to the admin's own address so SMTP settings can be checked
 * without waiting for a real sign-up or reset request.
 */
adminRoutes.post('/test-mail', async (c) => {
  const me = await queryOne<{ email: string }>('select email from users where id = $1', [
    c.get('userId'),
  ]);
  if (!me) throw new HttpError(404, 'User not found');

  if (!mailerConfigured()) {
    throw new HttpError(
      400,
      'No mail provider configured. Set SMTP_HOST + SMTP_USER + SMTP_PASS (or RESEND_API_KEY).',
    );
  }

  const result = await sendMail(
    me.email,
    'IELTS Practice — test email',
    '<p>If you can read this, email delivery is working.</p>',
    'If you can read this, email delivery is working.',
  );
  return c.json({ ...result, to: me.email });
});
