import { MOCK_ORDER, overallBand, writingPaperBand } from '@ielts/shared';
import type { MockScores, MockWritingResult, WritingFeedback } from '@ielts/shared';
import { query, queryOne } from './db';
import { HttpError } from './http';
import type { MockPapers } from './mockPapers';

export async function getMockPaper<S extends 'writing' | 'speaking'>(
  userId: string, mockId: string, skill: S, contentId: string, allowActive = false,
) {
  const row = await queryOne<{ paper: MockPapers[S]; writing: MockWritingResult | null }>(
    `select papers -> $3::text as paper,
            case when $3 = 'writing' then results -> 'writing' end as writing
     from mock_exams
     where user_id = $1 and id = $2
       and (step = $4 or ($5 and step = $6 and section_started_at is not null))`,
    [userId, mockId, skill, MOCK_ORDER.length, allowActive, MOCK_ORDER.indexOf(skill)],
  );
  if (!row?.paper || row.paper.id !== contentId) throw new HttpError(404, 'Mock exam paper not found');
  return row;
}

interface Evidence {
  reading: number | null;
  listening: number | null;
  writing_feedback: MockScores['writingFeedback'] | null;
  speaking_parts: { part: 1 | 2 | 3; band: number }[] | null;
}

export async function readMockScores(userId: string, mockId?: string): Promise<MockScores[]> {
  const rows = await query<Evidence>(
    `select (m.results #>> '{reading,band}')::float8 as reading,
            (m.results #>> '{listening,band}')::float8 as listening,
            (select jsonb_object_agg(task ->> 'task', w.ai_feedback)
               from jsonb_array_elements(m.results #> '{writing,tasks}') task
               join writing_submissions w on w.mock_id = m.id and w.user_id = m.user_id
                 and w.task_id = task ->> 'id'
               where w.ai_feedback ->> 'source' = 'ai') as writing_feedback,
            (select jsonb_agg(to_jsonb(part_score))
               from (select part, avg((ai_feedback ->> 'band')::float8) as band
                     from speaking_recordings
                     where mock_id = m.id and user_id = m.user_id
                       and part in (1, 2, 3) and jsonb_typeof(ai_feedback -> 'band') = 'number'
                     group by part order by part) part_score) as speaking_parts
     from mock_exams m
     where m.user_id = $1 and m.step = $2 ${mockId ? 'and m.id = $3' : ''}`,
    mockId ? [userId, MOCK_ORDER.length, mockId] : [userId, MOCK_ORDER.length],
  );
  return rows.map((row) => {
    const writingFeedback: Partial<Record<1 | 2, WritingFeedback>> = row.writing_feedback ?? {};
    const writing = writingPaperBand(writingFeedback[1], writingFeedback[2]);
    const parts = row.speaking_parts ?? [];
    const speaking = parts.length === 3 ? overallBand(parts.map(({ band }) => band)) : null;
    const { reading, listening } = row;
    const overall = reading != null && listening != null && writing != null && speaking != null
      ? overallBand([reading, listening, writing, speaking])
      : null;
    return { overall, writing, speaking, speakingParts: parts.map(({ part }) => part), writingFeedback };
  });
}
