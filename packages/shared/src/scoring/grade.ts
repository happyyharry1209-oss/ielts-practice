import type { Question, QuestionType } from '../types/content';
import {
  asArray,
  countWords,
  matchesChoice,
  normalizeText,
  setEquals,
} from './normalize';

export type AnswerValue = string | string[] | null | undefined;

export interface ItemResult {
  questionId: string;
  number: number;
  type: QuestionType;
  correct: boolean;
  /** Why it was marked wrong; useful for the review screen. */
  reason?: 'empty' | 'word-limit' | 'wrong';
  userAnswer: AnswerValue;
  expected: string | string[];
}

export interface GradeResult {
  total: number;
  correct: number;
  answered: number;
  /** Raw score out of `total`, i.e. what IELTS converts into a band. */
  rawScore: number;
  items: ItemResult[];
}

/** Questions whose answer is a set of options rather than a single value. */
const MULTI_ANSWER_TYPES: QuestionType[] = ['multiple-answer'];

export function isMultiAnswer(type: QuestionType): boolean {
  return MULTI_ANSWER_TYPES.includes(type);
}

/**
 * Multi-answer questions are authored as letters (["A", "C"]) but the UI may
 * store the option text the candidate clicked. Convert text back to letters
 * before comparing sets.
 */
function mapToLetters(values: string[], expected: string[], options?: string[]): string[] {
  const expectedAreLetters = expected.every((value) => /^[a-z]$/i.test(value.trim()));
  if (!expectedAreLetters || !options || options.length === 0) return values;
  return values.map((value) => {
    const normalized = normalizeText(value);
    const index = options.findIndex((option) => normalizeText(option) === normalized);
    return index >= 0 ? String.fromCharCode(65 + index) : value;
  });
}

function isEmpty(value: AnswerValue): boolean {
  if (value == null) return true;
  if (Array.isArray(value)) return value.every((v) => !String(v).trim());
  return !String(value).trim();
}

/** Grade one question. Pure function — used by the API and covered by unit tests. */
export function gradeQuestion(question: Question, userAnswer: AnswerValue): ItemResult {
  const base = {
    questionId: question.id,
    number: question.number,
    type: question.type,
    userAnswer,
    expected: question.answer,
  };

  if (isEmpty(userAnswer)) {
    return { ...base, correct: false, reason: 'empty' };
  }

  const value = userAnswer as string | string[];
  const given: string[] = Array.isArray(value) ? value : [value];
  const accepted = [...asArray(question.answer), ...(question.acceptableAnswers ?? [])];

  // Completion questions: exceeding the word limit is always wrong, even if the word is right.
  if (question.wordLimit) {
    const tooLong = given.some((v) => countWords(v) > question.wordLimit!);
    if (tooLong) {
      return { ...base, correct: false, reason: 'word-limit' };
    }
  }

  if (isMultiAnswer(question.type)) {
    const expected = asArray(question.answer);
    const chosen = mapToLetters(given, expected, question.options);
    const ok =
      chosen.length === expected.length && setEquals(chosen, expected);
    return { ...base, correct: ok, reason: ok ? undefined : 'wrong' };
  }

  // A single-answer question given several values: accept if exactly one matches.
  const single = given.filter((v) => String(v).trim().length > 0);
  if (single.length !== 1) {
    return { ...base, correct: false, reason: 'wrong' };
  }

  const candidate = single[0]!;
  const matched = accepted.some((expected) => {
    if (question.options && question.options.length > 0) {
      return matchesChoice(candidate, expected, question.options);
    }
    return normalizeText(candidate) === normalizeText(expected);
  });

  return { ...base, correct: matched, reason: matched ? undefined : 'wrong' };
}

export function gradeQuestions(
  questions: Question[],
  responses: Record<string, AnswerValue>,
): GradeResult {
  const items = questions.map((q) => gradeQuestion(q, responses[q.id]));
  const correct = items.filter((i) => i.correct).length;
  const answered = items.filter((i) => !isEmpty(i.userAnswer)).length;
  return {
    total: questions.length,
    correct,
    answered,
    rawScore: correct,
    items,
  };
}

/** Word limit check used by the UI before submission, so candidates see it early. */
export function checkWordLimit(question: Question, value: string): boolean {
  if (!question.wordLimit) return true;
  return countWords(value) <= question.wordLimit;
}
