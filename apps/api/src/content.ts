import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AnyTest,
  ContentManifest,
  ListeningTest,
  Question,
  ReadingTest,
  Skill,
  TestSummary,
} from '@ielts/shared';
import { env } from './env';

const here = path.dirname(fileURLToPath(import.meta.url));

const SKILLS: Skill[] = ['reading', 'listening', 'writing', 'speaking'];

function candidateDirs(): string[] {
  return [
    env.contentDir,
    path.resolve(process.cwd(), 'content'),
    path.resolve(process.cwd(), '../../content'),
    path.resolve(here, '../../../content'),
    path.resolve(here, '../content'),
    path.resolve(here, '../../content'),
  ].filter(Boolean);
}

export function resolveContentDir(): string {
  for (const dir of candidateDirs()) {
    if (existsSync(path.join(dir, 'reading')) || existsSync(path.join(dir, 'listening'))) {
      return dir;
    }
  }
  throw new Error(
    `Content directory not found. Set CONTENT_DIR. Tried:\n${candidateDirs().join('\n')}`,
  );
}

function questionCount(test: AnyTest): number {
  switch (test.skill) {
    case 'reading':
      return test.passages.reduce((n, p) => n + p.questions.length, 0);
    case 'listening':
      return test.sections.reduce((n, s) => n + s.questions.length, 0);
    case 'writing':
      return test.tasks.length;
    case 'speaking':
      return test.part1.length + test.part2.length + test.part3.length;
  }
}

function toSummary(test: AnyTest): TestSummary {
  return {
    id: test.id,
    skill: test.skill,
    title: test.title,
    description: test.description,
    durationSec: test.durationSec,
    questionCount: questionCount(test),
    ...(test.skill === 'reading' ? { variant: test.variant } : {}),
  };
}

export interface ContentStore {
  dir: string;
  manifest: ContentManifest;
  tests: Map<string, AnyTest>;
}

let store: ContentStore | null = null;

export async function loadContent(): Promise<ContentStore> {
  const dir = resolveContentDir();
  const tests = new Map<string, AnyTest>();
  const manifest: ContentManifest = {
    reading: [],
    listening: [],
    writing: [],
    speaking: [],
  };

  for (const skill of SKILLS) {
    const skillDir = path.join(dir, skill);
    if (!existsSync(skillDir)) continue;
    const files = (await readdir(skillDir)).filter((f) => f.endsWith('.json')).sort();
    for (const file of files) {
      const raw = await readFile(path.join(skillDir, file), 'utf8');
      const parsed = JSON.parse(raw) as AnyTest;
      if (parsed.skill !== skill) {
        throw new Error(`${skill}/${file}: expected skill "${skill}", got "${parsed.skill}"`);
      }
      const key = `${parsed.skill}:${parsed.id}`;
      if (tests.has(key)) throw new Error(`Duplicate test id: ${key}`);
      tests.set(key, parsed);
      manifest[skill].push(toSummary(parsed));
    }
  }

  store = { dir, manifest, tests };
  return store;
}

export function getContent(): ContentStore {
  if (!store) throw new Error('Content not loaded');
  return store;
}

export function findTest(skill: Skill, id: string): AnyTest | null {
  return getContent().tests.get(`${skill}:${id}`) ?? null;
}

function stripQuestion(q: Question): Question {
  const { answer: _answer, acceptableAnswers: _aa, explanation: _ex, ...rest } = q;
  return rest as Question;
}

/**
 * Remove answer keys before sending a test to the browser.
 * Answers are only revealed by the submit endpoint, after grading.
 */
export function toPublicTest(test: AnyTest): AnyTest {
  if (test.skill === 'reading') {
    const t = test as ReadingTest;
    return {
      ...t,
      passages: t.passages.map((p) => ({ ...p, questions: p.questions.map(stripQuestion) })),
    };
  }
  if (test.skill === 'listening') {
    const t = test as ListeningTest;
    return {
      ...t,
      // Transcript reveals answers, so hide it until submission.
      sections: t.sections.map(({ transcript: _t, ...s }) => ({
        ...s,
        questions: s.questions.map(stripQuestion),
      })),
    };
  }
  return test;
}

export function questionsOf(test: AnyTest): Question[] {
  if (test.skill === 'reading') return test.passages.flatMap((p) => p.questions);
  if (test.skill === 'listening') return test.sections.flatMap((s) => s.questions);
  return [];
}
