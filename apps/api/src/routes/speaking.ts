import { Hono } from 'hono';
import { z } from 'zod';
import { query } from '../db';
import { parseBody, requireAuth } from '../http';

export const speakingRoutes = new Hono();

const recordingSchema = z.object({
  contentId: z.string().min(1).max(120),
  part: z.number().int().min(1).max(3),
  prompt: z.string().max(2000).optional(),
  durationSec: z.number().int().min(0).max(60 * 30).optional(),
});

speakingRoutes.use('*', requireAuth);

/**
 * Records metadata about a speaking practice session.
 * The audio itself stays in the candidate's browser (IndexedDB) in v1.
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
