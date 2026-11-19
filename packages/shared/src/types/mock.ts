import type { ItemResult } from '../scoring/grade';
import type { AnyTest, Skill } from './content';
import type { WritingFeedback } from './writing';

export const MOCK_ORDER = ['listening', 'reading', 'writing', 'speaking'] as const satisfies readonly Skill[];

export const MOCK_DURATION: Record<Skill, number> = {
  listening: 30 * 60,
  reading: 60 * 60,
  writing: 60 * 60,
  speaking: 14 * 60,
};

export interface MockObjectiveResult {
  correct: number;
  total: number;
  band: number;
  items: (ItemResult & { prompt: string; explanation?: string })[];
  transcripts?: { id: string; title: string; text: string }[];
}

export interface MockWritingResult {
  contentId: string;
  tasks: { id: string; task: 1 | 2; prompt: string; text: string }[];
}

export interface MockResults {
  reading?: MockObjectiveResult;
  listening?: MockObjectiveResult;
  writing?: MockWritingResult;
}

export interface MockScores {
  overall: number | null;
  writing: number | null;
  speaking: number | null;
  speakingParts: (1 | 2 | 3)[];
  writingFeedback: Partial<Record<1 | 2, WritingFeedback>>;
}

export interface MockSummary {
  id: string;
  current: Skill | null;
  createdAt: string;
  deadline: number | null;
}

export interface MockSession extends MockSummary {
  test: AnyTest | null;
  results: MockResults | null;
  scores?: MockScores;
}

export interface MockSubmission {
  responses?: Record<string, string | string[] | null>;
  drafts?: Record<string, string>;
}
