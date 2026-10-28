import type { AnyTest, Question, QuestionType } from './types/content';
import { countWords, normalizeText } from './scoring/normalize';

export interface ValidationIssue {
  level: 'error' | 'warning';
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

const CHOICE_TYPES: QuestionType[] = [
  'multiple-choice',
  'true-false-not-given',
  'yes-no-not-given',
  'matching-information',
  'matching-features',
  'matching-sentence-endings',
  'multiple-answer',
];

const COMPLETION_TYPES: QuestionType[] = [
  'sentence-completion',
  'summary-completion',
  'table-completion',
  'flowchart-completion',
  'note-completion',
  'form-completion',
  'diagram-labelling',
  'map-labelling',
  'plan-labelling',
  'short-answer',
];

function isLetter(value: string): boolean {
  return /^[A-Za-z]$/.test(value.trim());
}

export function validateQuestion(question: Question, path: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const error = (message: string) => issues.push({ level: 'error', path, message });
  const warn = (message: string) => issues.push({ level: 'warning', path, message });

  if (!question.id) error('missing id');
  if (!question.prompt?.trim()) error('missing prompt');
  if (!Number.isInteger(question.number) || question.number < 1) error('number must be a positive integer');

  const answerText = Array.isArray(question.answer) ? question.answer.join(' ') : question.answer;
  if (!answerText || !answerText.trim()) error('missing answer');

  const options = question.options ?? [];

  if (CHOICE_TYPES.includes(question.type) && options.length === 0) {
    error(`type "${question.type}" needs options`);
  }

  if (question.type === 'multiple-choice') {
    if (options.length < 2) error('multiple-choice needs at least two options');
    if (!Array.isArray(question.answer) && !isLetter(question.answer)) {
      error('multiple-choice answer must be a single letter (A, B, C, ...)');
    } else if (!Array.isArray(question.answer)) {
      const index = question.answer.trim().toUpperCase().charCodeAt(0) - 65;
      if (index < 0 || index >= options.length) error('answer letter is outside the options range');
    }
  }

  if (question.type === 'multiple-answer') {
    if (!Array.isArray(question.answer) || question.answer.length < 2) {
      error('multiple-answer needs an array with at least two letters');
    } else {
      for (const letter of question.answer) {
        const index = letter.trim().toUpperCase().charCodeAt(0) - 65;
        if (index < 0 || index >= options.length) error(`answer "${letter}" is outside the options range`);
      }
    }
  }

  if (question.type === 'true-false-not-given') {
    const allowed = ['true', 'false', 'not given'];
    const value = normalizeText(String(question.answer));
    if (!allowed.includes(value)) error('answer must be TRUE, FALSE or NOT GIVEN');
  }

  if (question.type === 'yes-no-not-given') {
    const allowed = ['yes', 'no', 'not given'];
    const value = normalizeText(String(question.answer));
    if (!allowed.includes(value)) error('answer must be YES, NO or NOT GIVEN');
  }

  if (question.type === 'matching-headings') {
    if (!question.bank || question.bank.length < 2) {
      error('matching-headings needs a bank of at least two headings');
    } else {
      const ids = question.bank.map((h) => h.id);
      if (new Set(ids).size !== ids.length) error('duplicate ids in the heading bank');
      if (!ids.includes(String(question.answer))) error('answer must be one of the heading ids');
    }
  }

  if (question.type === 'matching-information' || question.type === 'matching-features' || question.type === 'matching-sentence-endings') {
    const value = String(question.answer).trim().toUpperCase();
    if (options.length >= 2) {
      const index = value.charCodeAt(0) - 65;
      if (index < 0 || index >= options.length) error('answer must be one of the option letters');
    }
  }

  if (COMPLETION_TYPES.includes(question.type)) {
    if (!question.wordLimit) {
      warn('completion question has no wordLimit; the word-limit rule cannot be enforced');
    } else {
      const values = [
        ...(Array.isArray(question.answer) ? question.answer : [question.answer]),
        ...(question.acceptableAnswers ?? []),
      ];
      for (const value of values) {
        if (countWords(value) > question.wordLimit) {
          warn(`answer "${value}" is longer than the ${question.wordLimit}-word limit`);
        }
      }
    }
  }

  if (!question.explanation) warn('no explanation; the review screen will be less useful');
  if (options.length > 1 && new Set(options.map(normalizeText)).size !== options.length) {
    warn('duplicate option text');
  }

  return issues;
}

export function validateTest(test: AnyTest): ValidationResult {
  const issues: ValidationIssue[] = [];
  const base = test.id || 'unnamed';

  if (!test.id) issues.push({ level: 'error', path: base, message: 'test has no id' });
  if (!test.title?.trim()) issues.push({ level: 'error', path: base, message: 'test has no title' });
  if (!test.durationSec || test.durationSec <= 0) {
    issues.push({ level: 'error', path: base, message: 'durationSec must be positive' });
  }

  const questions: Question[] = [];
  if (test.skill === 'reading') {
    if (test.passages.length === 0) {
      issues.push({ level: 'error', path: base, message: 'reading test has no passages' });
    }
    test.passages.forEach((passage, index) => {
      const p = `${base}/passages[${index}]`;
      if (!passage.id) issues.push({ level: 'error', path: p, message: 'passage has no id' });
      if (!passage.title?.trim()) issues.push({ level: 'error', path: p, message: 'passage has no title' });
      if (!passage.body?.trim()) issues.push({ level: 'error', path: p, message: 'passage has no body' });
      if (passage.questions.length === 0) {
        issues.push({ level: 'error', path: p, message: 'passage has no questions' });
      }
      passage.questions.forEach((q, qi) => {
        issues.push(...validateQuestion(q, `${p}/questions[${qi}]`));
        questions.push(q);
      });
    });
  } else if (test.skill === 'listening') {
    if (test.sections.length === 0) {
      issues.push({ level: 'error', path: base, message: 'listening test has no sections' });
    }
    test.sections.forEach((section, index) => {
      const p = `${base}/sections[${index}]`;
      if (!section.id) issues.push({ level: 'error', path: p, message: 'section has no id' });
      if (!section.audioUrl?.trim()) issues.push({ level: 'error', path: p, message: 'section has no audioUrl' });
      if (section.questions.length === 0) {
        issues.push({ level: 'error', path: p, message: 'section has no questions' });
      }
      section.questions.forEach((q, qi) => {
        issues.push(...validateQuestion(q, `${p}/questions[${qi}]`));
        questions.push(q);
      });
    });
  } else if (test.skill === 'writing') {
    if (test.tasks.length === 0) issues.push({ level: 'error', path: base, message: 'writing test has no tasks' });
    for (const task of test.tasks) {
      if (![1, 2].includes(task.task)) issues.push({ level: 'error', path: `${base}/${task.id}`, message: 'task must be 1 or 2' });
      if (!task.prompt?.trim()) issues.push({ level: 'error', path: `${base}/${task.id}`, message: 'task has no prompt' });
      if (!task.minWords || task.minWords < 50) issues.push({ level: 'error', path: `${base}/${task.id}`, message: 'minWords looks wrong' });
    }
  } else if (test.skill === 'speaking') {
    if (test.part1.length === 0) issues.push({ level: 'error', path: base, message: 'speaking test has no part 1 topics' });
    if (test.part2.length === 0) issues.push({ level: 'error', path: base, message: 'speaking test has no part 2 cue cards' });
    if (test.part3.length === 0) issues.push({ level: 'error', path: base, message: 'speaking test has no part 3 topics' });
    for (const card of test.part2) {
      if (card.points.length < 3) {
        issues.push({ level: 'warning', path: `${base}/${card.id}`, message: 'cue card has fewer than three bullet points' });
      }
    }
  }

  const numbers = questions.map((q) => q.number);
  const duplicateNumbers = numbers.filter((n, i) => numbers.indexOf(n) !== i);
  if (duplicateNumbers.length > 0) {
    issues.push({
      level: 'error',
      path: base,
      message: `duplicate question numbers: ${[...new Set(duplicateNumbers)].join(', ')}`,
    });
  }

  const ids = questions.map((q) => q.id);
  const duplicateIds = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (duplicateIds.length > 0) {
    issues.push({
      level: 'error',
      path: base,
      message: `duplicate question ids: ${[...new Set(duplicateIds)].join(', ')}`,
    });
  }

  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  return { ok: errors.length === 0, errors, warnings };
}
