import { Hono } from 'hono';
import { z } from 'zod';
import { createResetToken } from '../authTokens';
import { getContent } from '../content';
import { query, queryOne } from '../db';
import { HttpError, parseBody, requireAdmin, requireAuth } from '../http';
import { appLink } from '../mailer';

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
 * Create a password-reset link for a user. This is the fallback when no mail
 * provider is configured: the admin copies the link and sends it manually.
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
    link: appLink(`reset-password?token=${encodeURIComponent(token)}`),
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
