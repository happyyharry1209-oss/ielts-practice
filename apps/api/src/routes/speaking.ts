import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { MAX_SPEAKING_AUDIO_BYTES } from '@ielts/shared';
import { z } from 'zod';
import { findTest } from '../content';
import { query } from '../db';
import { env } from '../env';
import { checkRateLimit, HttpError, parseBody, requireAuth } from '../http';
import { reviewSpeaking } from '../speakingAi';

export const speakingRoutes = new Hono();

const recordingSchema = z.object({
  contentId: z.string().min(1).max(120),
  part: z.number().int().min(1).max(3),
  prompt: z.string().max(2000).optional(),
  durationSec: z.number().int().min(0).max(60 * 30).optional(),
});

speakingRoutes.use('*', requireAuth);

speakingRoutes.get('/status', (c) => c.json({ provider: env.groq?.provider ?? null }));

const feedbackSchema = z.object({
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
      contentId: form?.get('contentId'),
      part: form?.get('part'),
      promptIndex: form?.get('promptIndex'),
    });
    const audio = form?.get('audio');
    if (!selection.success || !(audio instanceof File) || !audio.size) {
      throw new HttpError(400, 'speaking-invalid-audio');
    }
    if (audio.size > MAX_SPEAKING_AUDIO_BYTES) throw new HttpError(413, 'speaking-too-large');

    const { contentId, part, promptIndex } = selection.data;
    const test = findTest('speaking', contentId);
    if (test?.skill !== 'speaking') throw new HttpError(404, 'Speaking test not found');
    const card = part === 2 ? test.part2[promptIndex] : undefined;
    const prompt = part === 2
      ? card && [card.topic, ...card.points, card.closing].join('\n')
      : (part === 1 ? test.part1 : test.part3).flatMap((topic) => topic.questions)[promptIndex];
    if (!prompt) throw new HttpError(404, 'Speaking prompt not found');

    const filename = await audioFilename(audio);
    const userId = c.get('userId');
    if (!checkRateLimit(`ai:${userId}`, env.aiHourlyLimit, 60 * 60 * 1000)) {
      throw new HttpError(429, 'speaking-rate-limit');
    }
    const { feedback, usage } = await reviewSpeaking(part, prompt, audio, filename);
    await query(
      `insert into ai_usage (user_id, endpoint, tokens_in, tokens_out, cost_usd)
       values ($1, 'speaking-feedback', $2, $3, $4)`,
      [userId, usage.tokensIn, usage.tokensOut, usage.estimatedCostUsd],
    );
    return c.json({ feedback });
  },
);

/**
 * Records metadata about a speaking practice session.
 * This route does not handle audio.
 */
speakingRoutes.post('/recordings', async (c) => {
  const body = await parseBody(c, recordingSchema);
  const rows = await query<{ id: string; created_at: string }>(
    `insert into speaking_recordings (user_id, content_id, part, prompt, duration_sec)
     values ($1, $2, $3, $4, $5)
     returning id, created_at`,
    [c.get('userId'), body.contentId, body.part, body.prompt ?? null, body.durationSec ?? null],
  );
  return c.json({ id: rows[0]!.id, createdAt: rows[0]!.created_at }, 201);
});

speakingRoutes.get('/recordings', async (c) => {
  const rows = await query(
    `select id, content_id, part, prompt, duration_sec, created_at
     from speaking_recordings
     where user_id = $1
     order by created_at desc
     limit 50`,
    [c.get('userId')],
  );
  return c.json({ recordings: rows });
});
