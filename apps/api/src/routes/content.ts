import { Hono } from 'hono';
import type { Skill } from '@ielts/shared';
import { findTest, getContent, toPublicTest } from '../content';
import { HttpError } from '../http';

const SKILLS: Skill[] = ['reading', 'listening', 'writing', 'speaking'];

export const contentRoutes = new Hono();

contentRoutes.get('/manifest', (c) => {
  return c.json(getContent().manifest);
});

contentRoutes.get('/:skill/:id', (c) => {
  const skill = c.req.param('skill') as Skill;
  if (!SKILLS.includes(skill)) throw new HttpError(404, 'Unknown skill');
  const test = findTest(skill, c.req.param('id'));
  if (!test) throw new HttpError(404, 'Test not found');
  return c.json({ test: toPublicTest(test) });
});
