import { Hono } from 'hono';
import { z } from 'zod';
import { gradeQuestions, rawToBand } from '@ielts/shared';
import type { AnswerValue, Question, ReadingVariant } from '@ielts/shared';
import { findTest, getContent, questionsOf } from '../content';
import { query, queryOne, withTransaction } from '../db';
import { HttpError, parseBody, requireAuth } from '../http';

export const attemptRoutes = new Hono();

const createSchema = z.object({
  skill: z.enum(['reading', 'listening']),
  contentId: z.string().min(1).max(120),
  mode: z.enum(['mock', 'practice']).default('practice'),
});

const submitSchema = z.object({
  responses: z.record(z.union([z.string(), z.array(z.string()), z.null()])).default({}),
  durationSec: z.number().int().min(0).max(60 * 60 * 6).optional(),
});

interface AttemptRow {
  id: string;
  user_id: string;
  skill: string;
  content_id: string;
  mode: string;
  started_at: string;
  submitted_at: string | null;
  duration_sec: number | null;
  raw_score: number | null;
  total: number | null;
  band: number | null;
}

attemptRoutes.use('*', requireAuth);

attemptRoutes.post('/', async (c) => {
  const body = await parseBody(c, createSchema);
  const test = findTest(body.skill, body.contentId);
  if (!test || (test.skill !== 'reading' && test.skill !== 'listening')) {
    throw new HttpError(404, 'Test not found');
  }
  const rows = await query<{ id: string }>(
    `insert into attempts (user_id, skill, content_id, mode)
     values ($1, $2, $3, $4)
     returning id`,
    [c.get('userId'), body.skill, body.contentId, body.mode],
  );
  return c.json({ attemptId: rows[0]!.id }, 201);
});

attemptRoutes.post('/:id/submit', async (c) => {
  const attemptId = c.req.param('id');
  const body = await parseBody(c, submitSchema);

  const attempt = await queryOne<AttemptRow>(
    'select * from attempts where id = $1 and user_id = $2',
    [attemptId, c.get('userId')],
  );
  if (!attempt) throw new HttpError(404, 'Attempt not found');
  if (attempt.submitted_at) throw new HttpError(409, 'This attempt has already been submitted');

  const test = findTest(attempt.skill as 'reading' | 'listening', attempt.content_id);
  if (!test) throw new HttpError(410, 'The test content is no longer available');

  const questions = questionsOf(test);
  const responses = body.responses as Record<string, AnswerValue>;
  const graded = gradeQuestions(questions, responses);
  const variant: ReadingVariant = test.skill === 'reading' ? test.variant : 'academic';
  const band =
    test.skill === 'reading' || test.skill === 'listening'
      ? rawToBand(test.skill, graded.correct, graded.total || 40, variant)
      : 0;

  const byId = new Map<string, Question>(questions.map((q) => [q.id, q]));
  const detailed = graded.items.map((item) => {
    const question = byId.get(item.questionId);
    return {
      ...item,
      explanation: question?.explanation,
      location: question?.location,
    };
  });

  await withTransaction(async (client) => {
    await client.query(
      `update attempts
       set submitted_at = now(), duration_sec = $1, raw_score = $2, total = $3, band = $4
       where id = $5`,
      [body.durationSec ?? null, graded.correct, graded.total, band, attemptId],
    );
    await client.query('delete from responses where attempt_id = $1', [attemptId]);
    for (const item of graded.items) {
      await client.query(
        `insert into responses (attempt_id, question_id, answer, is_correct)
         values ($1, $2, $3, $4)`,
        [attemptId, item.questionId, JSON.stringify(item.userAnswer ?? null), item.correct],
      );
    }
  });

  return c.json({
    attempt: {
      id: attemptId,
      skill: attempt.skill,
      contentId: attempt.content_id,
      mode: attempt.mode,
      submittedAt: new Date().toISOString(),
      durationSec: body.durationSec ?? null,
      band,
    },
    result: {
      total: graded.total,
      correct: graded.correct,
      answered: graded.answered,
      band,
      items: detailed,
    },
  });
});

attemptRoutes.get('/stats', async (c) => {
  const userId = c.get('userId');
  const perSkill = await query<{
    skill: string;
    attempts: number;
    best_band: number | null;
    avg_band: number | null;
    last_at: string | null;
  }>(
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

  const recent = await query<{
    id: string;
    skill: string;
    content_id: string;
    band: number | null;
    raw_score: number | null;
    total: number | null;
    submitted_at: string | null;
    mode: string;
  }>(
    `select id, skill, content_id, band::float8 as band, raw_score, total, submitted_at, mode
     from attempts
     where user_id = $1 and submitted_at is not null
     order by submitted_at desc
     limit 10`,
    [userId],
  );

  const writing = await query<{
    id: string;
    content_id: string;
    task_id: string;
    ai_band: number | null;
    word_count: number;
    created_at: string;
  }>(
    `select id, content_id, task_id, ai_band::float8 as ai_band, word_count, created_at
     from writing_submissions
     where user_id = $1
     order by created_at desc
     limit 10`,
    [userId],
  );

  const titles = new Map<string, string>();
  for (const list of Object.values(getContent().manifest)) {
    for (const summary of list) titles.set(`${summary.skill}:${summary.id}`, summary.title);
  }

  return c.json({
    perSkill,
    recent: recent.map((r) => ({
      ...r,
      title: titles.get(`${r.skill}:${r.content_id}`) ?? r.content_id,
    })),
    writing: writing.map((w) => ({ ...w, title: titles.get(`writing:${w.content_id}`) ?? w.content_id })),
  });
});

attemptRoutes.get('/', async (c) => {
  const rows = await query<AttemptRow>(
    `select id, user_id, skill, content_id, mode, started_at, submitted_at,
            duration_sec, raw_score, total, band::float8 as band
     from attempts
     where user_id = $1
     order by started_at desc
     limit 30`,
    [c.get('userId')],
  );
  return c.json({ attempts: rows });
});

attemptRoutes.get('/:id', async (c) => {
  const attempt = await queryOne<AttemptRow>(
    `select id, user_id, skill, content_id, mode, started_at, submitted_at,
            duration_sec, raw_score, total, band::float8 as band
     from attempts where id = $1 and user_id = $2`,
    [c.req.param('id'), c.get('userId')],
  );
  if (!attempt) throw new HttpError(404, 'Attempt not found');

  const responses = await query<{ question_id: string; answer: unknown; is_correct: boolean }>(
    'select question_id, answer, is_correct from responses where attempt_id = $1',
    [attempt.id],
  );

  // Attach the original question so the review screen can show prompt,
  // expected answer and explanation without another round trip.
  const test =
    attempt.skill === 'reading' || attempt.skill === 'listening'
      ? findTest(attempt.skill, attempt.content_id)
      : null;
  const byId = new Map((test ? questionsOf(test) : []).map((question) => [question.id, question]));

  const items = responses
    .map((response) => {
      const question = byId.get(response.question_id);
      return {
        questionId: response.question_id,
        number: question?.number ?? 0,
        type: question?.type,
        prompt: question?.prompt,
        instructions: question?.instructions,
        options: question?.options,
        bank: question?.bank,
        userAnswer: response.answer,
        expected: question?.answer ?? '',
        correct: response.is_correct,
        explanation: question?.explanation,
        location: question?.location,
      };
    })
    .sort((a, b) => a.number - b.number);

  return c.json({ attempt, items });
});
