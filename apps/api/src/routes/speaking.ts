import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { MAX_SPEAKING_AUDIO_BYTES } from '@ielts/shared';
import type { SpeakingFeedback, SpeakingHistoryItem } from '@ielts/shared';
import { z } from 'zod';
import { findTest } from '../content';
import { query, queryOne } from '../db';
import { env } from '../env';
import { checkRateLimit, HttpError, parseBody, requireAuth } from '../http';
import { reviewSpeaking } from '../speakingAi';

export const speakingRoutes = new Hono();

const recordingSchema = z.object({
  clientId: z.string().uuid().optional(),
  contentId: z.string().min(1).max(120),
  part: z.number().int().min(1).max(3),
  promptIndex: z.number().int().min(0).max(99_999).optional(),
  prompt: z.string().max(2000).optional(),
  durationSec: z.number().int().min(0).max(2_147_483_647).optional(),
  createdAt: z.string().datetime().optional(),
});

speakingRoutes.use('*', requireAuth);

speakingRoutes.get('/status', (c) => c.json({
  provider: env.groq?.provider ?? null,
  transcriptBandEstimate: Boolean(env.groq),
  recordingHistory: true,
}));

const feedbackSchema = z.object({
  clientId: z.string().uuid().optional(),
  contentId: z.string().min(1).max(120),
  part: z.enum(['1', '2', '3']).transform((value) => Number(value) as 1 | 2 | 3),
  promptIndex: z.string().regex(/^\d{1,5}$/).transform(Number),
});

async function audioFilename(file: File): Promise<string> {
  const header = Buffer.from(await file.slice(0, 12).arrayBuffer());
  if (header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'answer.webm';
  if (header.toString('ascii', 4, 8) === 'ftyp') return 'answer.mp4';
  if (header.toString('ascii', 0, 4) === 'OggS') return 'answer.ogg';
  if (header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WAVE') {
    return 'answer.wav';
  }
  throw new HttpError(415, 'speaking-invalid-audio');
}

speakingRoutes.post(
  '/feedback',
  bodyLimit({
    maxSize: MAX_SPEAKING_AUDIO_BYTES + 4096,
    onError: (c) => c.json({ error: 'speaking-too-large' }, 413),
  }),
  async (c) => {
    if (!env.groq) throw new HttpError(503, 'speaking-unavailable');
    const form = await c.req.formData().catch(() => null);
    const selection = feedbackSchema.safeParse({
      clientId: form?.get('clientId') ?? undefined,
      contentId: form?.get('contentId'),
      part: form?.get('part'),
      promptIndex: form?.get('promptIndex'),
    });
    const audio = form?.get('audio');
    if (!selection.success || !(audio instanceof File) || !audio.size) {
      throw new HttpError(400, 'speaking-invalid-audio');
    }
    if (audio.size > MAX_SPEAKING_AUDIO_BYTES) throw new HttpError(413, 'speaking-too-large');

    const { clientId, contentId, part, promptIndex } = selection.data;
    const test = findTest('speaking', contentId);
    if (test?.skill !== 'speaking') throw new HttpError(404, 'Speaking test not found');
    const card = part === 2 ? test.part2[promptIndex] : undefined;
    const prompt = part === 2
      ? card && [card.topic, ...card.points, card.closing].join('\n')
      : (part === 1 ? test.part1 : test.part3).flatMap((topic) => topic.questions)[promptIndex];
    if (!prompt) throw new HttpError(404, 'Speaking prompt not found');

    const userId = c.get('userId');
    if (clientId) {
      const saved = await queryOne<{
        content_id: string; part: number; prompt_index: number | null; feedback: SpeakingFeedback | null;
      }>(
        'select content_id, part, prompt_index, ai_feedback as feedback from speaking_recordings where user_id = $1 and client_id = $2',
        [userId, clientId],
      );
      if (saved && (saved.content_id !== contentId || saved.part !== part || saved.prompt_index !== promptIndex)) {
        throw new HttpError(409, 'speaking-recording-mismatch');
      }
      if (saved?.feedback) return c.json({ feedback: saved.feedback });
    }

    const filename = await audioFilename(audio);
    if (!checkRateLimit(`ai:${userId}`, env.aiHourlyLimit, 60 * 60 * 1000)) {
      throw new HttpError(429, 'speaking-rate-limit');
    }
    const { feedback, usage } = await reviewSpeaking(part, prompt, audio, filename);
    const saved = await queryOne<{ feedback: SpeakingFeedback }>(
      `with usage_log as (
         insert into ai_usage (user_id, endpoint, tokens_in, tokens_out, cost_usd)
         values ($1, 'speaking-feedback', $2, $3, $4)
       )
       insert into speaking_recordings (user_id, client_id, content_id, part, prompt_index, prompt, ai_feedback)
       values ($1, $5, $6, $7, $8, $9, $10)
       on conflict (user_id, client_id) do update
         set ai_feedback = coalesce(speaking_recordings.ai_feedback, excluded.ai_feedback)
         where speaking_recordings.content_id = excluded.content_id
           and speaking_recordings.part = excluded.part
           and speaking_recordings.prompt_index = excluded.prompt_index
       returning ai_feedback as feedback`,
      [userId, usage.tokensIn, usage.tokensOut, usage.estimatedCostUsd,
        clientId ?? null, contentId, part, promptIndex, card?.topic ?? prompt, JSON.stringify(feedback)],
    );
    if (!saved) throw new HttpError(409, 'speaking-recording-mismatch');
    return c.json({ feedback: saved.feedback });
  },
);

/**
 * Records metadata about a speaking practice session.
 * This route does not handle audio.
 */
speakingRoutes.post('/recordings', async (c) => {
  const body = await parseBody(c, recordingSchema);
  const saved = await queryOne<{ id: string; created_at: string; client_id: string | null }>(
    `insert into speaking_recordings (user_id, client_id, content_id, part, prompt_index, prompt, duration_sec, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, coalesce($8::timestamptz, now()))
     on conflict (user_id, client_id) do update
       set duration_sec = coalesce(speaking_recordings.duration_sec, excluded.duration_sec),
           created_at = case when speaking_recordings.duration_sec is null then excluded.created_at
                             else speaking_recordings.created_at end
       where speaking_recordings.content_id = excluded.content_id
         and speaking_recordings.part = excluded.part
         and speaking_recordings.prompt_index is not distinct from excluded.prompt_index
     returning id, client_id, created_at`,
    [c.get('userId'), body.clientId ?? null, body.contentId, body.part, body.promptIndex ?? null,
      body.prompt ?? null, body.durationSec ?? null, body.createdAt ?? null],
  );
  if (!saved) throw new HttpError(409, 'speaking-recording-mismatch');
  return c.json({ id: saved.id, clientId: saved.client_id, createdAt: saved.created_at }, 201);
});

speakingRoutes.get('/recordings', async (c) => {
  const offset = z.coerce.number().int().min(0).max(2_147_483_647).safeParse(c.req.query('offset') ?? 0);
  if (!offset.success) throw new HttpError(400, 'Invalid history offset');
  const pageSize = 50;
  const rows = await query<Omit<SpeakingHistoryItem, 'title'>>(
    `select id, client_id, content_id, part, prompt, duration_sec, created_at, ai_feedback as feedback
     from speaking_recordings
     where user_id = $1
     order by created_at desc, id desc
     limit $2 offset $3`,
    [c.get('userId'), pageSize + 1, offset.data],
  );
  return c.json({
    recordings: rows.slice(0, pageSize).map((row) => ({
      ...row,
      title: findTest('speaking', row.content_id)?.title ?? row.content_id,
    })),
    nextOffset: rows.length > pageSize ? offset.data + pageSize : null,
  });
});
