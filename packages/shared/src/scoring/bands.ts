import type { ReadingVariant, Skill } from '../types/content';

type BandTable = Array<[minRaw: number, band: number]>;

// Approximate public conversion tables. Always configurable — see PLAN.md §6.
const LISTENING: BandTable = [
  [39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6],
  [18, 5.5], [16, 5], [13, 4.5], [11, 4], [8, 3.5], [6, 3], [4, 2.5], [3, 2], [1, 1],
];

const READING_ACADEMIC: BandTable = [
  [39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6],
  [19, 5.5], [15, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5], [3, 2], [1, 1],
];

const READING_GENERAL: BandTable = [
  [40, 9], [39, 8.5], [37, 8], [36, 7.5], [34, 7], [32, 6.5], [30, 6],
  [27, 5.5], [23, 5], [19, 4.5], [15, 4], [12, 3.5], [9, 3], [6, 2.5], [4, 2], [1, 1],
];

export function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function lookup(table: BandTable, raw: number): number {
  for (const [minRaw, band] of table) {
    if (raw >= minRaw) return band;
  }
  return 0;
}

/**
 * Convert a raw score into an estimated band.
 * If the test is not out of 40 the raw score is scaled first (approximation).
 */
export function rawToBand(
  skill: Extract<Skill, 'listening' | 'reading'>,
  raw: number,
  total = 40,
  variant: ReadingVariant = 'academic',
): number {
  const scaled = total === 40 ? raw : Math.round((raw / Math.max(total, 1)) * 40);
  const clamped = Math.max(0, Math.min(40, scaled));
  if (skill === 'listening') return lookup(LISTENING, clamped);
  return lookup(variant === 'general' ? READING_GENERAL : READING_ACADEMIC, clamped);
}

/**
 * Writing/Speaking overall band: mean of the four criteria, rounded to the
 * nearest half band (IELTS rounds .25 up to .5, .75 up to the next whole).
 */
export function overallBand(criteria: number[]): number {
  if (criteria.length === 0) return 0;
  const mean = criteria.reduce((sum, v) => sum + v, 0) / criteria.length;
  return Math.max(0, Math.min(9, roundToHalf(mean)));
}

export const WRITING_CRITERIA = {
  1: ['Task Achievement', 'Coherence & Cohesion', 'Lexical Resource', 'Grammatical Range & Accuracy'],
  2: ['Task Response', 'Coherence & Cohesion', 'Lexical Resource', 'Grammatical Range & Accuracy'],
} as const;

export const SPEAKING_CRITERIA = [
  'Fluency & Coherence',
  'Lexical Resource',
  'Grammatical Range & Accuracy',
  'Pronunciation',
] as const;

export interface WritingScores {
  taskAchievement: number;
  coherence: number;
  lexical: number;
  grammar: number;
}

export function writingOverall(scores: WritingScores): number {
  return overallBand([
    scores.taskAchievement,
    scores.coherence,
    scores.lexical,
    scores.grammar,
  ]);
}
