import { describe, expect, it } from 'vitest';
import type { Question } from '../src/types/content';
import { gradeQuestion, gradeQuestions } from '../src/scoring/grade';
import { rawToBand, overallBand, roundToHalf } from '../src/scoring/bands';
import { countWords, normalizeText, setEquals } from '../src/scoring/normalize';

function q(overrides: Partial<Question>): Question {
  return {
    id: 'q1',
    number: 1,
    type: 'short-answer',
    prompt: 'test',
    answer: 'answer',
    ...overrides,
  };
}

describe('normalizeText', () => {
  it('ignores case, extra spaces and edge punctuation', () => {
    expect(normalizeText('  The   Answer. ')).toBe('the answer');
    expect(normalizeText('"water"')).toBe('water');
  });

  it('keeps internal hyphens', () => {
    expect(normalizeText('state-of-the-art')).toBe('state-of-the-art');
  });
});

describe('countWords', () => {
  it('counts hyphenated words as one', () => {
    expect(countWords('a state-of-the-art device')).toBe(3);
  });
  it('treats an empty string as zero', () => {
    expect(countWords('   ')).toBe(0);
  });
});

describe('gradeQuestion — completion', () => {
  it('accepts case and whitespace differences', () => {
    const r = gradeQuestion(q({ answer: 'the museum' }), '  The   Museum ');
    expect(r.correct).toBe(true);
  });

  it('accepts alternative spellings via acceptableAnswers', () => {
    const r = gradeQuestion(
      q({ answer: 'color', acceptableAnswers: ['colour'] }),
      'colour',
    );
    expect(r.correct).toBe(true);
  });

  it('rejects over-limit answers even when the word is present', () => {
    const r = gradeQuestion(
      q({ type: 'sentence-completion', answer: 'river', wordLimit: 1 }),
      'the river',
    );
    expect(r.correct).toBe(false);
    expect(r.reason).toBe('word-limit');
  });

  it('marks an empty answer as empty, not wrong', () => {
    const r = gradeQuestion(q({}), '');
    expect(r.correct).toBe(false);
    expect(r.reason).toBe('empty');
  });
});

describe('gradeQuestion — choice', () => {
  it('matches a letter answer', () => {
    const r = gradeQuestion(
      q({ type: 'multiple-choice', answer: 'B', options: ['first', 'second'] }),
      'b',
    );
    expect(r.correct).toBe(true);
  });

  it('matches the option text when the candidate typed it', () => {
    const r = gradeQuestion(
      q({ type: 'multiple-choice', answer: 'B', options: ['first', 'second'] }),
      'second',
    );
    expect(r.correct).toBe(true);
  });

  it('maps T/F/NG shorthand', () => {
    const tfng = q({ type: 'true-false-not-given', answer: 'NOT GIVEN', options: ['TRUE', 'FALSE', 'NOT GIVEN'] });
    expect(gradeQuestion(tfng, 'ng').correct).toBe(true);
    expect(gradeQuestion(tfng, 'not given').correct).toBe(true);
    expect(gradeQuestion(tfng, 'false').correct).toBe(false);
  });

  it('maps Y/N/NG shorthand', () => {
    const ynng = q({ type: 'yes-no-not-given', answer: 'YES', options: ['YES', 'NO', 'NOT GIVEN'] });
    expect(gradeQuestion(ynng, 'y').correct).toBe(true);
  });

  it('requires every letter for multiple-answer', () => {
    const ma = q({ type: 'multiple-answer', answer: ['A', 'C'], options: ['a', 'b', 'c', 'd'] });
    expect(gradeQuestion(ma, ['C', 'A']).correct).toBe(true);
    expect(gradeQuestion(ma, ['A']).correct).toBe(false);
    expect(gradeQuestion(ma, ['A', 'B']).correct).toBe(false);
  });
});

describe('gradeQuestions', () => {
  it('aggregates raw score and answered count', () => {
    const questions = [
      q({ id: 'a', number: 1, answer: 'one' }),
      q({ id: 'b', number: 2, answer: 'two' }),
      q({ id: 'c', number: 3, answer: 'three' }),
    ];
    const result = gradeQuestions(questions, { a: 'one', b: 'wrong' });
    expect(result.correct).toBe(1);
    expect(result.answered).toBe(2);
    expect(result.total).toBe(3);
  });
});

describe('setEquals', () => {
  it('ignores order and duplicates', () => {
    expect(setEquals(['a', 'b'], ['B', 'A', 'a'])).toBe(true);
    expect(setEquals(['a'], ['a', 'b'])).toBe(false);
  });
});

describe('band conversion', () => {
  it('maps listening raw scores', () => {
    expect(rawToBand('listening', 40)).toBe(9);
    expect(rawToBand('listening', 30)).toBe(7);
    expect(rawToBand('listening', 23)).toBe(6);
    expect(rawToBand('listening', 0)).toBe(0);
  });

  it('uses the general reading table', () => {
    expect(rawToBand('reading', 30, 40, 'general')).toBe(6);
    expect(rawToBand('reading', 30, 40, 'academic')).toBe(7);
  });

  it('scales tests that are not out of 40', () => {
    expect(rawToBand('listening', 5, 10)).toBe(rawToBand('listening', 20, 40));
  });

  it('rounds overall writing bands to the nearest half', () => {
    expect(roundToHalf(6.25)).toBe(6.5);
    expect(roundToHalf(6.74)).toBe(6.5);
    expect(overallBand([6, 6, 7, 6])).toBe(6.5);
    expect(overallBand([7, 7, 7, 6])).toBe(7);
  });
});
