import { Hono } from 'hono';
import { z } from 'zod';
import { gradeQuestions, MOCK_DURATION, MOCK_ORDER, rawToBand } from '@ielts/shared';
import type { MockResults, MockSession, MockSummary } from '@ielts/shared';
import { questionsOf, toPublicTest } from '../content';
import { query, queryOne } from '../db';
import { HttpError, parseBody, requireAuth } from '../http';
import { drawMockPapers, type MockPapers } from '../mockPapers';
import { readMockScores } from '../mockScores';

export const mockRoutes = new Hono();

interface SummaryRow {
  id: string;
  step: number;
  created_at: Date | string;
  section_started_at: Date | string | null;
}

interface MockRow extends SummaryRow {
  papers: MockPapers;
  results: MockResults;
}

const sectionSchema = z.object({ skill: z.enum(MOCK_ORDER) });
const submitSchema = sectionSchema.extend({
  responses: z.record(z.union([z.string().max(500), z.array(z.string().max(500)).max(10), z.null()])).default({}),
  drafts: z.record(z.string().max(30_000)).default({}),
});
const idSchema = z.string().uuid();

function summary(row: SummaryRow): MockSummary {
  const current = MOCK_ORDER[row.step] ?? null;
  const deadline = row.section_started_at && current
    ? new Date(row.section_started_at).getTime() + MOCK_DURATION[current] * 1000
    : null;
  return { id: row.id, current, createdAt: new Date(row.created_at).toISOString(), deadline };
}

async function view(row: MockRow, userId: string): Promise<MockSession> {
  const info = summary(row);
  const test = info.current && info.deadline ? row.papers[info.current] : null;
  // Model answers and objective answer keys stay on the server during the exam.
  const publicTest = test?.skill === 'writing'
    ? { ...test, tasks: test.tasks.map(({ modelAnswer: _sample, ...task }) => task) }
    : test && toPublicTest(test);
  if (info.current) return { ...info, test: publicTest, results: null };
  const [scores] = await readMockScores(userId, row.id);
  return { ...info, test: publicTest, results: row.results, scores };
}

function requireId(value: string): string {
  const result = idSchema.safeParse(value);
  if (!result.success) throw new HttpError(404, 'Mock exam not found');
  return result.data;
}

async function getMock(id: string, userId: string): Promise<MockRow> {
  const row = await queryOne<MockRow>('select * from mock_exams where id = $1 and user_id = $2', [id, userId]);
  if (!row) throw new HttpError(404, 'Mock exam not found');
  return row;
}

mockRoutes.use('*', requireAuth);

mockRoutes.get('/', async (c) => {
  const rows = await query<SummaryRow>(
    `select id, step, created_at, section_started_at
     from mock_exams where user_id = $1 order by created_at desc limit 20`,
    [c.get('userId')],
  );
  return c.json({ sessions: rows.map(summary) });
});

mockRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const row = await queryOne<MockRow>(
    'insert into mock_exams (user_id, papers) values ($1, $2) returning *',
    [userId, JSON.stringify(drawMockPapers())],
  );
  return c.json({ session: await view(row!, userId) }, 201);
});

mockRoutes.get('/:id', async (c) => {
  const userId = c.get('userId');
  const row = await getMock(requireId(c.req.param('id')), userId);
  return c.json({ session: await view(row, userId) });
});

mockRoutes.post('/:id/start', async (c) => {
  const id = requireId(c.req.param('id'));
  const userId = c.get('userId');
  const { skill } = await parseBody(c, sectionSchema);
  const step = MOCK_ORDER.indexOf(skill);
  const row = await queryOne<MockRow>(
    `update mock_exams set section_started_at = coalesce(section_started_at, now())
     where id = $1 and user_id = $2 and step = $3 returning *`,
    [id, userId, step],
  );
  return c.json({ session: await view(row ?? await getMock(id, userId), userId) });
});

mockRoutes.post('/:id/submit', async (c) => {
  const id = requireId(c.req.param('id'));
  const userId = c.get('userId');
  const input = await parseBody(c, submitSchema);
  const row = await getMock(id, userId);
  const step = MOCK_ORDER.indexOf(input.skill);
  if (row.step > step) return c.json({ session: await view(row, userId) });
  if (row.step !== step || !row.section_started_at) throw new HttpError(409, 'mock-section-not-active');

  const test = row.papers[input.skill];
  if (test.skill === 'listening' || test.skill === 'reading') {
    const questions = questionsOf(test);
    const grade = gradeQuestions(questions, input.responses ?? {});
    row.results[test.skill] = {
      correct: grade.correct,
      total: grade.total,
      band: rawToBand(test.skill, grade.correct, grade.total, 'academic'),
      items: grade.items.map((item, index) => ({
        ...item,
        prompt: questions[index]!.prompt,
        explanation: questions[index]!.explanation,
      })),
      ...(test.skill === 'listening' && {
        transcripts: test.sections.flatMap(({ id, title, transcript }) => transcript ? [{ id, title, text: transcript }] : []),
      }),
    };
  } else if (test.skill === 'writing') {
    row.results.writing = {
      contentId: test.id,
      tasks: test.tasks.map(({ id: taskId, task, prompt }) => ({
        id: taskId, task, prompt, text: input.drafts?.[taskId] ?? '',
      })),
    };
  }

  const updated = await queryOne<MockRow>(
    `update mock_exams set results = $4, step = step + 1, section_started_at = null
     where id = $1 and user_id = $2 and step = $3 returning *`,
    [id, userId, step, JSON.stringify(row.results)],
  );
  return c.json({ session: await view(updated ?? await getMock(id, userId), userId) });
});
