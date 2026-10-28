export type Skill = 'listening' | 'reading' | 'writing' | 'speaking';

export type ReadingVariant = 'academic' | 'general';

/**
 * Every question type the practice engine understands.
 * Adding a type here forces the grader + renderer to handle it (exhaustive switch).
 */
export type QuestionType =
  | 'multiple-choice'
  | 'multiple-answer'
  | 'true-false-not-given'
  | 'yes-no-not-given'
  | 'matching-headings'
  | 'matching-information'
  | 'matching-features'
  | 'matching-sentence-endings'
  | 'sentence-completion'
  | 'summary-completion'
  | 'table-completion'
  | 'flowchart-completion'
  | 'note-completion'
  | 'form-completion'
  | 'diagram-labelling'
  | 'map-labelling'
  | 'plan-labelling'
  | 'short-answer';

export interface Question {
  /** Stable id, unique inside a test. */
  id: string;
  /** Question number as printed on the paper (1-40). */
  number: number;
  type: QuestionType;
  /** The question stem shown to the candidate. */
  prompt: string;
  /** Optional per-question instruction, e.g. "Choose TWO letters." */
  instructions?: string;
  /** Options for choice-based questions. For MCQ the correct answer is the letter. */
  options?: string[];
  /** Word bank / heading list for matching + summary completion. */
  bank?: { id: string; text: string }[];
  /** Canonical answer. Single string, or string[] for multi-answer questions. */
  answer: string | string[];
  /** Extra accepted spellings, e.g. ["colour"] for "color". */
  acceptableAnswers?: string[];
  /** Hard maximum word count for completion questions. Exceeding it = wrong. */
  wordLimit?: number;
  /** Shown after submission. */
  explanation?: string;
  /** Where the answer lives, e.g. "Paragraph C". */
  location?: string;
}

export interface ReadingPassage {
  id: string;
  title: string;
  /** Markdown body. */
  body: string;
  questions: Question[];
}

export interface ReadingTest {
  id: string;
  skill: 'reading';
  variant: ReadingVariant;
  title: string;
  description?: string;
  durationSec: number;
  passages: ReadingPassage[];
}

export interface ListeningSection {
  id: string;
  title: string;
  /** Public path or absolute URL to the audio file. */
  audioUrl: string;
  transcript?: string;
  questions: Question[];
}

export interface ListeningTest {
  id: string;
  skill: 'listening';
  title: string;
  description?: string;
  durationSec: number;
  /** Extra time after the audio ends (real test: 10 minutes to transfer answers). */
  transferSec?: number;
  sections: ListeningSection[];
}

export interface WritingTask {
  id: string;
  task: 1 | 2;
  prompt: string;
  /** Optional chart/diagram image for Task 1. */
  imageUrl?: string;
  minWords: number;
  suggestedMinutes: number;
  /** Sample band 8/9 answer, hidden until the candidate submits. */
  modelAnswer?: string;
}

export interface WritingTest {
  id: string;
  skill: 'writing';
  title: string;
  description?: string;
  durationSec: number;
  tasks: WritingTask[];
}

export interface SpeakingTopic {
  topic: string;
  questions: string[];
}

export interface CueCard {
  id: string;
  topic: string;
  /** Bullet points on the cue card. */
  points: string[];
  /** Final line, e.g. "and explain why you liked it." */
  closing: string;
}

export interface SpeakingTest {
  id: string;
  skill: 'speaking';
  title: string;
  description?: string;
  durationSec: number;
  part1: SpeakingTopic[];
  part2: CueCard[];
  part3: SpeakingTopic[];
}

export type AnyTest = ReadingTest | ListeningTest | WritingTest | SpeakingTest;

export interface TestSummary {
  id: string;
  skill: Skill;
  title: string;
  description?: string;
  durationSec: number;
  questionCount: number;
  variant?: ReadingVariant;
}

export interface ContentManifest {
  reading: TestSummary[];
  listening: TestSummary[];
  writing: TestSummary[];
  speaking: TestSummary[];
}

export function isReadingTest(t: AnyTest): t is ReadingTest {
  return t.skill === 'reading';
}
export function isListeningTest(t: AnyTest): t is ListeningTest {
  return t.skill === 'listening';
}
export function isWritingTest(t: AnyTest): t is WritingTest {
  return t.skill === 'writing';
}
export function isSpeakingTest(t: AnyTest): t is SpeakingTest {
  return t.skill === 'speaking';
}

/** All questions of a reading/listening test, flattened. */
export function flattenQuestions(test: ReadingTest | ListeningTest): Question[] {
  if (test.skill === 'reading') {
    return test.passages.flatMap((p) => p.questions);
  }
  return test.sections.flatMap((s) => s.questions);
}
