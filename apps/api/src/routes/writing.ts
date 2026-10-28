import { Hono } from 'hono';
import { z } from 'zod';
import type { WritingTest } from '@ielts/shared';
import { scoreWriting } from '../ai';
import { findTest } from '../content';
import { query, queryOne } from '../db';
import { checkRateLimit, HttpError, parseBody, requireAuth } from '../http';
import { env } from '../env';

export const writingRoutes = new Hono();

const submitSchema = z.object({
  contentId: z.string().min(1).max(120),
  taskId: z.string().min(1).max(120),
  text: z.string().min(1).max(30_000),
});

writingRoutes.use('*', requireAuth);

writingRoutes.post('/submit', async (c) => {
  const userId = c.get('userId');
  const body = await parseBody(c, submitSchema);

  const test = findTest('writing', body.contentId) as WritingTest | null;
  if (!test || test.skill !== 'writing') throw new HttpError(404, 'Writing test not found');
  const task = test.tasks.find((t) => t.id === body.taskId);
  if (!task) throw new HttpError(404, 'Task not found in this test');

  if (!checkRateLimit(`ai:${userId}`, env.aiHourlyLimit, 60 * 60 * 1000)) {
    throw new HttpError(429, `AI scoring limit reached (${env.aiHourlyLimit}/hour). Try again later.`);
  }

  const { feedback, usage } = await scoreWriting(task.task, task.prompt, body.text, task.minWords);
  const cost = (usage.tokensIn * 0.27 + usage.tokensOut * 1.1) / 1_000_000;

  const rows = await query<{ id: string; created_at: string }>(
    `insert into writing_submissions (user_id, content_id, task_id, text, word_count, ai_feedback, ai_band)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id, created_at`,
    [userId, body.contentId, body.taskId, body.text, feedback.wordCount, JSON.stringify(feedback), feedback.overall],
  );

  await query(
    `insert into ai_usage (user_id, endpoint, tokens_in, tokens_out, cost_usd)
     values ($1, 'writing-score', $2, $3, $4)`,
    [userId, usage.tokensIn, usage.tokensOut, cost],
  );

  return c.json(
    { submissionId: rows[0]!.id, createdAt: rows[0]!.created_at, feedback },
    201,
  );
});

writingRoutes.get('/submissions', async (c) => {
  const contentId = c.req.query('contentId');
  const rows = await query(
    `select id, content_id, task_id, word_count, ai_band::float8 as ai_band, created_at
     from writing_submissions
     where user_id = $1 ${contentId ? 'and content_id = $2' : ''}
     order by created_at desc
     limit 30`,
    contentId ? [c.get('userId'), contentId] : [c.get('userId')],
  );
  return c.json({ submissions: rows });
});

writingRoutes.get('/submissions/:id', async (c) => {
  const row = await queryOne<{ id: string; text: string; ai_feedback: unknown; created_at: string }>(
    `select id, text, ai_feedback, created_at
     from writing_submissions where id = $1 and user_id = $2`,
    [c.req.param('id'), c.get('userId')],
  );
  if (!row) throw new HttpError(404, 'Submission not found');
  return c.json({ submission: row });
});
