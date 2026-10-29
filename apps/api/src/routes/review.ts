import { Hono } from 'hono';
import { z } from 'zod';
import { gradeQuestion } from '@ielts/shared';
import type { Question, Skill } from '@ielts/shared';
import { findTest } from '../content';
import { query } from '../db';
import { HttpError, parseBody, requireAuth } from '../http';

export const reviewRoutes = new Hono();

reviewRoutes.use('*', requireAuth);

interface WrongRow {
  content_id: string;
  skill: string;
  question_id: string;
  answer: unknown;
  submitted_at: string;
}

export interface ReviewQuestion extends Question {
  yourAnswer: string | string[] | null;
}

function questionsOfTest(skill: string, contentId: string): Question[] {
  const test = findTest(skill as Skill, contentId);
  if (!test) return [];
  if (test.skill === 'reading') return test.passages.flatMap((passage) => passage.questions);
  if (test.skill === 'listening') return test.sections.flatMap((section) => section.questions);
  return [];
}

function titleOfTest(skill: string, contentId: string): string {
  return findTest(skill as Skill, contentId)?.title ?? contentId;
}

/**
 * Wrong answers, using the most recent response per question so a later correct
 * answer removes it. Questions marked as mastered are excluded.
 */
reviewRoutes.get('/wrong', async (c) => {
  const userId = c.get('userId');

  const rows = await query<WrongRow>(
    `with latest as (
       select distinct on (a.content_id, r.question_id)
         a.content_id, a.skill, r.question_id, r.answer, r.is_correct, a.submitted_at
       from responses r
       join attempts a on a.id = r.attempt_id
       where a.user_id = $1 and a.submitted_at is not null
       order by a.content_id, r.question_id, a.submitted_at desc
     )
     select content_id, skill, question_id, answer, submitted_at
     from latest
     where is_correct = false
       -- unanswered questions are stored as jsonb null; they are not mistakes
       and coalesce(answer::text, 'null') not in ('null', '""', '[]')
       and not exists (
         select 1 from review_mastered m
         where m.user_id = $1 and m.content_id = latest.content_id and m.question_id = latest.question_id
       )
     order by submitted_at desc`,
    [userId],
  );

  const groups = new Map<
    string,
    { contentId: string; skill: string; title: string; questions: ReviewQuestion[] }
  >();

  for (const row of rows) {
    const test = findTest(row.skill as Skill, row.content_id);
    if (!test) continue;

    const question = questionsOfTest(row.skill, row.content_id).find((q) => q.id === row.question_id);
    if (!question) continue;

    const key = `${row.skill}:${row.content_id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        contentId: row.content_id,
        skill: row.skill,
        title: titleOfTest(row.skill, row.content_id),
        questions: [],
      });
    }
    groups.get(key)!.questions.push({
      ...question,
      yourAnswer: (row.answer as string | string[] | null) ?? null,
    });
  }

  const list = [...groups.values()].map((group) => ({
    ...group,
    questions: group.questions.sort((a, b) => a.number - b.number),
  }));

  return c.json({
    total: list.reduce((sum, group) => sum + group.questions.length, 0),
    groups: list,
  });
});

const masterSchema = z.object({
  contentId: z.string().min(1).max(120),
  questionId: z.string().min(1).max(120),
});

reviewRoutes.post('/master', async (c) => {
  const body = await parseBody(c, masterSchema);
  await query(
    `insert into review_mastered (user_id, content_id, question_id)
     values ($1, $2, $3)
     on conflict do nothing`,
    [c.get('userId'), body.contentId, body.questionId],
  );
  return c.json({ ok: true });
});

reviewRoutes.post('/unmaster', async (c) => {
  const body = await parseBody(c, masterSchema);
  await query(
    'delete from review_mastered where user_id = $1 and content_id = $2 and question_id = $3',
    [c.get('userId'), body.contentId, body.questionId],
  );
  return c.json({ ok: true });
});

const gradeSchema = z.object({
  items: z
    .array(
      z.object({
        contentId: z.string().min(1).max(120),
        skill: z.string().min(1).max(40),
        questionId: z.string().min(1).max(120),
        answer: z.union([z.string(), z.array(z.string()), z.null()]),
      }),
    )
    .max(200),
});

/** Grade retry answers without creating an attempt. */
reviewRoutes.post('/grade', async (c) => {
  const body = await parseBody(c, gradeSchema);

  const results = body.items.map((item) => {
    const question = questionsOfTest(item.skill, item.contentId).find(
      (q) => q.id === item.questionId,
    );
    if (!question) {
      return {
        contentId: item.contentId,
        questionId: item.questionId,
        correct: false,
        expected: '',
        explanation: undefined as string | undefined,
      };
    }
    const graded = gradeQuestion(question, item.answer);
    return {
      contentId: item.contentId,
      questionId: item.questionId,
      correct: graded.correct,
      reason: graded.reason,
      expected: question.answer,
      explanation: question.explanation,
    };
  });

  if (results.length === 0 && body.items.length > 0) {
    throw new HttpError(400, 'No questions could be graded');
  }
  return c.json({ results });
});
