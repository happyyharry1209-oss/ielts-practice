/** Normalisation rules shared by the grader and the content validator. */

const EDGE_PUNCTUATION = /^[\s"'“”‘’()[\]{}.,;:!?]+|[\s"'“”‘’()[\]{}.,;:!?]+$/g;

/**
 * Case-insensitive, whitespace-collapsed, edge-punctuation-free comparison form.
 * Deliberately keeps internal hyphens/slashes so "state-of-the-art" stays distinct.
 */
export function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\u00a0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(EDGE_PUNCTUATION, '')
    .toLowerCase();
}

/** Word count as IELTS counts it: whitespace tokens, hyphenated words count once. */
export function countWords(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

const CHOICE_ALIASES: Record<string, string> = {
  t: 'true',
  f: 'false',
  y: 'yes',
  n: 'no',
  ng: 'not given',
  'notgiven': 'not given',
  'not-given': 'not given',
  'not mentioned': 'not given',
};

/** Map shorthand answers ("T", "NG", "y") onto the canonical option text. */
export function canonicalChoice(value: string): string {
  const n = normalizeText(value);
  return CHOICE_ALIASES[n] ?? n;
}

/**
 * For choice questions: does the candidate answer match the expected option?
 * Accepts either the option letter ("b") or the option text ("the cost of fuel").
 */
export function matchesChoice(
  userAnswer: string,
  expected: string,
  options?: string[],
): boolean {
  const user = canonicalChoice(userAnswer);
  const target = canonicalChoice(expected);
  if (user === target) return true;

  if (!options || options.length === 0) return false;

  const letterIndex = /^[a-z]$/i.test(expected.trim())
    ? expected.trim().toLowerCase().charCodeAt(0) - 97
    : -1;

  if (letterIndex >= 0 && letterIndex < options.length) {
    const optionText = canonicalChoice(options[letterIndex] ?? '');
    return user === optionText;
  }

  // Candidate typed the letter, expected is the option text.
  if (/^[a-z]$/i.test(userAnswer.trim())) {
    const idx = userAnswer.trim().toLowerCase().charCodeAt(0) - 97;
    return idx >= 0 && idx < options.length && canonicalChoice(options[idx] ?? '') === target;
  }

  return false;
}

export function asArray(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

/** Set equality after normalisation — order does not matter for multi-answer questions. */
export function setEquals(a: string[], b: string[]): boolean {
  const left = [...new Set(a.map(canonicalChoice))].sort();
  const right = [...new Set(b.map(canonicalChoice))].sort();
  return left.length === right.length && left.every((v, i) => v === right[i]);
}
