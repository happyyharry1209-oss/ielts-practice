import { Hono } from 'hono';
import { z } from 'zod';
import type { WritingFeedback } from '@ielts/shared';
import { scoreWriting } from '../ai';
import { findTest } from '../content';
import { query, queryOne } from '../db';
import { checkRateLimit, HttpError, parseBody, requireAuth } from '../http';
import { env } from '../env';
import { getMockPaper } from '../mockScores';

export const writingRoutes = new Hono();

const submitSchema = z.object({
  contentId: z.string().min(1).max(120),
  taskId: z.string().min(1).max(120),
  text: z.string().min(1).max(30_000),
  mockId: z.string().uuid().optional(),
});

interface Submission {
  id: string;
  created_at: string;
  feedback: WritingFeedback;
}

writingRoutes.use('*', requireAuth);

writingRoutes.get('/status', (c) => c.json({ provider: env.writingAi?.provider ?? null }));

writingRoutes.post('/submit', async (c) => {
  const userId = c.get('userId');
  const body = await parseBody(c, submitSchema);

  const mock = body.mockId ? await getMockPaper(userId, body.mockId, 'writing', body.contentId) : null;
  const test = mock?.paper ?? findTest('writing', body.contentId);
  if (!test || test.skill !== 'writing') throw new HttpError(404, 'Writing test not found');
  const task = test.tasks.find((t) => t.id === body.taskId);
  if (!task) throw new HttpError(404, 'Task not found in this test');

  if (mock) {
    const answer = mock.writing?.tasks.find(({ id }) => id === task.id)?.text;
    if (!answer?.trim() || answer !== body.text) throw new HttpError(409, 'mock-writing-answer-mismatch');
    const saved = await queryOne<Submission>(
      `select id, created_at, ai_feedback as feedback from writing_submissions
       where mock_id = $1 and user_id = $2 and task_id = $3 and ai_feedback ->> 'source' = 'ai'`,
      [body.mockId, userId, task.id],
    );
    if (saved) return c.json({ submissionId: saved.id, createdAt: saved.created_at, feedback: saved.feedback });
  }

  if (!checkRateLimit(`ai:${userId}`, env.aiHourlyLimit, 60 * 60 * 1000)) {
    throw new HttpError(429, `AI scoring limit reached (${env.aiHourlyLimit}/hour). Try again later.`);
  }

  let prompt = task.prompt;
  if (task.dataTable) {
    const { unit, columns, rows } = task.dataTable;
    const tableLines = [
      ['Category', ...columns].join(' | '),
      ...rows.map(({ label, values }) => [label, ...values].join(' | ')),
    ];
    prompt += `\n\nPractice data (${unit}):\n${tableLines.join('\n')}`;
  }
  if (task.diagram) {
    const panels = task.diagram.panels.map((panel) =>
      `${panel.title}\n${panel.items.map(({ label, detail }) => `- ${label}: ${detail}`).join('\n')}`);
    prompt += `\n\nSource ${task.diagram.kind} shown to the student:\n${panels.join('\n\n')}`;
  }
  const { feedback, usage } = await scoreWriting(task.task, prompt, body.text, task.minWords);

  const saved = await queryOne<Submission>(
    `insert into writing_submissions (user_id, content_id, task_id, text, word_count, ai_feedback, ai_band, mock_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (mock_id, task_id) do update
       set ai_feedback = case when writing_submissions.ai_feedback ->> 'source' = 'ai'
                             then writing_submissions.ai_feedback else excluded.ai_feedback end,
           ai_band = case when writing_submissions.ai_feedback ->> 'source' = 'ai'
                          then writing_submissions.ai_band else excluded.ai_band end
     returning id, created_at, ai_feedback as feedback`,
    [userId, body.contentId, body.taskId, body.text, feedback.wordCount, JSON.stringify(feedback), feedback.overall, body.mockId ?? null],
  );

  if (usage) {
    await query(
      `insert into ai_usage (user_id, endpoint, tokens_in, tokens_out, cost_usd)
       values ($1, 'writing-score', $2, $3, $4)`,
      [userId, usage.tokensIn, usage.tokensOut, usage.estimatedCostUsd],
    );
  }

  return c.json(
    { submissionId: saved!.id, createdAt: saved!.created_at, feedback: saved!.feedback },
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
