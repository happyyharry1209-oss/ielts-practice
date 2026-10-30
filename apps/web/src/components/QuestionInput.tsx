import type { Question } from '@ielts/shared';
import { useTranslation } from 'react-i18next';
import type { AnswerValue } from '../lib/useExam';
import { cn, letterFor } from '../lib/utils';

const TEXT_TYPES = new Set([
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
]);

const NO_LETTER_TYPES = new Set([
  'true-false-not-given',
  'yes-no-not-given',
  'matching-information',
]);

export interface ReviewInfo {
  correct: boolean;
  expected: string | string[];
  userAnswer: AnswerValue | null;
  explanation?: string;
  location?: string;
  reason?: string;
}

interface Props {
  question: Question;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue | null) => void;
  review?: ReviewInfo;
  disabled?: boolean;
  showNumber?: boolean;
}

function asText(value: string | string[] | undefined): string {
  if (value == null) return '';
  return Array.isArray(value) ? value.join(', ') : value;
}

export function QuestionInput({
  question,
  value,
  onChange,
  review,
  disabled,
  showNumber = true,
}: Props) {
  const { t } = useTranslation();
  const options = question.options ?? [];
  const isText = TEXT_TYPES.has(question.type);
  const isMulti = question.type === 'multiple-answer';
  const isHeading = question.type === 'matching-headings';
  const singleLetterOptions = options.every((option) => /^[A-Za-z]$/.test(option.trim()));

  const selectedValue = typeof value === 'string' ? value : '';
  const selectedArray: string[] = Array.isArray(value) ? value : [];

  const toggleMulti = (option: string) => {
    const next = selectedArray.includes(option)
      ? selectedArray.filter((entry) => entry !== option)
      : [...selectedArray, option];
    onChange(next);
  };

  const expectedList = review
    ? Array.isArray(review.expected)
      ? review.expected
      : [review.expected]
    : [];

  const isChosen = (option: string, index: number) => {
    const key = singleLetterOptions ? option : letterFor(index);
    return selectedValue === option || selectedValue === key;
  };

  return (
    <div
      className={cn(
        'rounded-md border bg-surface p-4 transition',
        review
          ? review.correct
            ? 'border-emerald-200 bg-emerald-50'
            : 'border-rose-200 bg-rose-50'
          : 'border-slate-200',
      )}
    >
      <div className="flex gap-3">
        {showNumber ? (
          <span
            className={cn(
              'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-xs font-bold',
              review
                ? review.correct
                  ? 'bg-emerald-600 text-white'
                  : 'bg-rose-600 text-white'
                : 'bg-slate-900 text-white',
            )}
          >
            {question.number}
          </span>
        ) : null}

        <div className="min-w-0 flex-1">
          {question.instructions && !review ? (
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
              {question.instructions}
            </p>
          ) : null}
          <p className="text-sm font-medium leading-6 text-slate-800">{question.prompt}</p>

          {isText ? (
            <div className="mt-3">
              <input
                type="text"
                className="input"
                value={selectedValue}
                disabled={disabled}
                onChange={(event) => onChange(event.target.value)}
                placeholder={t('exam.typeAnswer')}
                autoComplete="off"
                spellCheck={false}
              />
              {question.wordLimit ? (
                <p className="mt-1 text-xs text-slate-400">
                  {t('exam.wordLimit', { count: question.wordLimit })}
                </p>
              ) : null}
            </div>
          ) : isHeading ? (
            <select
              className="input mt-3"
              value={selectedValue}
              disabled={disabled}
              onChange={(event) => onChange(event.target.value || null)}
            >
              <option value="">{t('exam.selectHeading')}</option>
              {(question.bank ?? []).map((heading) => (
                <option key={heading.id} value={heading.id}>
                  {heading.id}. {heading.text}
                </option>
              ))}
            </select>
          ) : isMulti ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {options.map((option, index) => {
                const checked =
                  selectedArray.includes(option) || selectedArray.includes(letterFor(index));
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleMulti(option)}
                    className={cn(
                      'flex min-h-11 items-start gap-2 rounded-sm border px-3 py-2 text-left text-sm transition',
                      checked
                        ? 'border-brand-500 bg-brand-50 text-brand-800'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border text-[11px] font-bold',
                        checked ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-300 text-slate-500',
                      )}
                    >
                      {letterFor(index)}
                    </span>
                    <span>{option}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 grid gap-2">
              {options.map((option, index) => {
                const checked = isChosen(option, index);
                const isExpected = expectedList.some(
                  (expected) =>
                    expected === option ||
                    expected === letterFor(index) ||
                    expected.toLowerCase() === letterFor(index).toLowerCase(),
                );
                return (
                  <button
                    key={`${option}-${index}`}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange(option)}
                    className={cn(
                      'flex min-h-11 items-start gap-2 rounded-sm border px-3 py-2 text-left text-sm transition',
                      review && isExpected
                        ? 'border-emerald-500 bg-emerald-50'
                        : review && checked
                          ? 'border-rose-400 bg-rose-50'
                          : checked
                            ? 'border-brand-500 bg-brand-50 text-brand-800'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                    )}
                  >
                    {!NO_LETTER_TYPES.has(question.type) && !singleLetterOptions ? (
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-slate-300 text-[11px] font-bold text-slate-500">
                        {letterFor(index)}
                      </span>
                    ) : null}
                    <span>{option}</span>
                  </button>
                );
              })}
            </div>
          )}

          {review ? (
            <div className="mt-3 space-y-1 border-t border-slate-200/70 pt-3 text-sm">
              <p>
                <span className="text-slate-500">{t('results.yourAnswer')}: </span>
                <span className={review.correct ? 'font-semibold text-emerald-700' : 'font-semibold text-rose-700'}>
                  {asText(review.userAnswer ?? undefined) || '—'}
                </span>
              </p>
              {!review.correct ? (
                <p>
                  <span className="text-slate-500">{t('results.correctAnswer')}: </span>
                  <span className="font-semibold text-emerald-700">
                    {Array.isArray(review.expected) ? review.expected.join(' / ') : review.expected}
                  </span>
                </p>
              ) : null}
              {review.reason === 'word-limit' ? (
                <p className="text-xs font-medium text-rose-600">
                  {t('exam.wordLimitError')}
                </p>
              ) : null}
              {review.explanation ? (
                <p className="text-slate-600">
                  <span className="font-medium text-slate-700">{t('results.explanation')}: </span>
                  {review.explanation}
                </p>
              ) : null}
              {review.location ? (
                <p className="text-xs text-slate-400">
                  {t('results.location')}: {review.location}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
