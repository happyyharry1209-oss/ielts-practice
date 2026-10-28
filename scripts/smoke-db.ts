/**
 * Runs the production SQL against a real Postgres engine (PGlite, compiled to
 * WASM) so the schema and the API queries can be verified without Docker.
 *
 *   npm run smoke:db
 *
 * This is a development aid, not part of the deployed app.
 */
import { PGlite } from '@electric-sql/pglite';
import { SCHEMA_SQL } from '../apps/api/src/schema';

const db = new PGlite();
let checks = 0;

function ok(label: string, detail?: unknown) {
  checks += 1;
  console.log(`✔ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
}

async function main() {
  await db.exec(SCHEMA_SQL);
  ok('schema applied');

  const user = await db.query<{ id: string; role: string }>(
    `insert into users (email, password_hash, display_name)
     values ($1, $2, $3)
     returning id, email, display_name, role, created_at`,
    ['learner@example.com', 'scrypt$salt$hash', 'Learner'],
  );
  const userId = user.rows[0]!.id;
  ok('users insert returning', user.rows[0]);

  const found = await db.query('select * from users where email = $1', ['learner@example.com']);
  ok('users lookup by email', found.rows.length);

  const duplicate = await db.query(
    `select id from users where email = $1`,
    ['learner@example.com'],
  );
  ok('duplicate email check', duplicate.rows.length);

  const attempt = await db.query<{ id: string }>(
    `insert into attempts (user_id, skill, content_id, mode)
     values ($1, $2, $3, $4) returning id`,
    [userId, 'reading', 'reading-001', 'mock'],
  );
  const attemptId = attempt.rows[0]!.id;
  ok('attempts insert returning', { attemptId });

  await db.query(
    `update attempts
     set submitted_at = now(), duration_sec = $1, raw_score = $2, total = $3, band = $4
     where id = $5`,
    [1234, 31, 40, 7, attemptId],
  );
  ok('attempts submit update');

  await db.query(
    `insert into responses (attempt_id, question_id, answer, is_correct)
     values ($1, $2, $3, $4)`,
    [attemptId, 'p1q1', JSON.stringify('TRUE'), true],
  );
  ok('responses insert jsonb');

  const graded = await db.query<{ band: number; raw_score: number }>(
    `select id, user_id, skill, content_id, mode, started_at, submitted_at,
            duration_sec, raw_score, total, band::float8 as band
     from attempts where id = $1 and user_id = $2`,
    [attemptId, userId],
  );
  ok('attempts select with band::float8', graded.rows[0]);

  const stats = await db.query(
    `select skill,
            count(*)::int as attempts,
            max(band)::float8 as best_band,
            avg(band)::float8 as avg_band,
            max(submitted_at) as last_at
     from attempts
     where user_id = $1 and submitted_at is not null
     group by skill`,
    [userId],
  );
  ok('stats group by skill', stats.rows[0]);

  const recent = await db.query(
    `select id, skill, content_id, band::float8 as band, raw_score, total, submitted_at, mode
     from attempts
     where user_id = $1 and submitted_at is not null
     order by submitted_at desc
     limit 10`,
    [userId],
  );
  ok('recent attempts', recent.rows.length);

  const writing = await db.query<{ id: string }>(
    `insert into writing_submissions (user_id, content_id, task_id, text, word_count, ai_feedback, ai_band)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id, created_at`,
    [
      userId,
      'writing-001',
      't2',
      'A sample essay about university fees.',
      6,
      JSON.stringify({ overall: 6.5, source: 'heuristic' }),
      6.5,
    ],
  );
  ok('writing_submissions insert', writing.rows[0]);

  await db.query(
    `insert into ai_usage (user_id, endpoint, tokens_in, tokens_out, cost_usd)
     values ($1, 'writing-score', $2, $3, $4)`,
    [userId, 900, 300, 0.00058],
  );
  ok('ai_usage insert');

  const overview = await db.query(
    `select
       (select count(*) from users)::int as users,
       (select count(*) from users where role = 'admin')::int as admins,
       (select count(*) from attempts where submitted_at is not null)::int as attempts,
       (select count(*) from writing_submissions)::int as submissions,
       (select count(*) from speaking_recordings)::int as recordings,
       (select count(*) from ai_usage where created_at > now() - interval '30 days')::int as ai_calls,
       (select coalesce(sum(cost_usd), 0) from ai_usage where created_at > now() - interval '30 days')::float8 as ai_cost`,
  );
  ok('admin overview', overview.rows[0]);

  const users = await db.query(
    `select u.id, u.email, u.display_name, u.role, u.created_at, u.last_login_at,
            (select count(*) from attempts a where a.user_id = u.id and a.submitted_at is not null)::int as attempts,
            (select count(*) from writing_submissions w where w.user_id = u.id)::int as writing_submissions,
            (select max(a.submitted_at) from attempts a where a.user_id = u.id) as last_attempt_at
     from users u
     where ($1 = '' or u.email ilike '%' || $1 || '%' or u.display_name ilike '%' || $1 || '%')
     order by u.created_at desc
     limit 100`,
    [''],
  );
  ok('admin users search', users.rows.length);

  const daily = await db.query(
    `select date_trunc('day', created_at)::date as day,
            count(*)::int as calls,
            coalesce(sum(tokens_in), 0)::int as tokens_in,
            coalesce(sum(tokens_out), 0)::int as tokens_out,
            coalesce(sum(cost_usd), 0)::float8 as cost_usd
     from ai_usage
     where created_at > now() - ($1 || ' days')::interval
     group by 1
     order by 1`,
    [30],
  );
  ok('ai usage daily', daily.rows.length);

  const topUsers = await db.query(
    `select u.email, count(*)::int as calls, coalesce(sum(a.cost_usd), 0)::float8 as cost_usd
     from ai_usage a join users u on u.id = a.user_id
     where a.created_at > now() - ($1 || ' days')::interval
     group by u.email
     order by cost_usd desc
     limit 10`,
    [30],
  );
  ok('ai usage top users', topUsers.rows.length);

  const recordings = await db.query(
    `insert into speaking_recordings (user_id, content_id, part, prompt, duration_sec)
     values ($1, $2, $3, $4, $5)
     returning id, created_at`,
    [userId, 'speaking-001', 2, 'A skill you would like to learn', 120],
  );
  ok('speaking_recordings insert', recordings.rows[0]);

  console.log(`\n${checks} SQL checks passed against PGlite.`);
}

main()
  .then(() => db.close())
  .catch(async (error) => {
    console.error('✖ SQL check failed:', error.message);
    await db.close();
    process.exit(1);
  });
