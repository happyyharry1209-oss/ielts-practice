import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import type { Question, QuestionType } from '@ielts/shared';
import { QuestionInput } from '../components/QuestionInput';
import { PageHeader, Spinner } from '../components/ui';
import type { ContentManifest } from '@ielts/shared';
import { api, errorMessage } from '../lib/api';
import { bandColor, cn } from '../lib/utils';

interface AttemptItem {
  questionId: string;
  number: number;
  type?: QuestionType;
  prompt?: string;
  instructions?: string;
  options?: string[];
  bank?: { id: string; text: string }[];
  userAnswer: string | string[] | null;
  expected: string | string[];
  correct: boolean;
  explanation?: string;
  location?: string;
}

interface AttemptDetail {
  attempt: {
    id: string;
    skill: string;
    content_id: string;
    mode: string;
    submitted_at: string | null;
    duration_sec: number | null;
    raw_score: number | null;
    total: number | null;
    band: number | null;
  };
  items: AttemptItem[];
}

export default function Result() {
  const { t } = useTranslation();
  const { attemptId } = useParams<{ attemptId: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['attempt', attemptId],
    queryFn: () => api<AttemptDetail>(`/api/attempts/${attemptId}`),
    enabled: Boolean(attemptId),
  });

  const { data: manifest } = useQuery({
    queryKey: ['manifest'],
    queryFn: () => api<ContentManifest>('/api/content/manifest'),
  });

  if (isLoading) return <Spinner label={t('results.loading')} />;
  if (error || !data) {
    return <div className="p-10 text-center text-sm text-rose-600">{errorMessage(error)}</div>;
  }

  const { attempt, items } = data;
  const title =
    manifest?.[attempt.skill as keyof ContentManifest]?.find(
      (entry) => entry.id === attempt.content_id,
    )?.title ?? attempt.content_id;

  const answered = items.filter((item) => {
    const value = item.userAnswer;
    return Array.isArray(value) ? value.length > 0 : value != null && String(value).trim() !== '';
  }).length;

  return (
    <div>
      <PageHeader
        title={t('results.title')}
        subtitle={title}
        actions={
          <Link to={`/practice/${attempt.skill}`} className="btn-secondary">
            {t('results.tryAgain')}
          </Link>
        }
      />

      <section className="grid border-y border-line md:grid-cols-[0.9fr_1.1fr]">
        <div className="border-b border-line py-7 md:border-b-0 md:border-r md:pr-8">
          <p className="eyebrow">{t('results.band')}</p>
          <p className={cn('mt-3 font-serif text-7xl font-medium tracking-[-0.05em]', bandColor(attempt.band))}>
            {attempt.band != null ? attempt.band.toFixed(1) : '—'}
            <span className="ml-1 font-sans text-lg font-normal text-slate-400">/ 9</span>
          </p>
          <p className="mt-3 max-w-md text-xs leading-5 text-slate-500">{t('results.disclaimer')}</p>
        </div>
        <div className="grid grid-cols-2 md:pl-8">
          <div className="py-7 md:pr-6">
            <p className="eyebrow">{t('results.correct')}</p>
            <p className="mt-2 font-serif text-4xl font-medium text-ink">
              {attempt.raw_score ?? 0}
              <span className="font-sans text-sm font-normal text-slate-400"> / {attempt.total ?? 0}</span>
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {t('results.scoreLine', {
                correct: attempt.raw_score ?? 0,
                total: attempt.total ?? 0,
              })}
            </p>
          </div>
          <div className="border-l border-line py-7 pl-5 md:pl-6">
            <p className="eyebrow">{t('results.answered')}</p>
            <p className="mt-2 font-serif text-4xl font-medium text-ink">
              {answered}
              <span className="font-sans text-sm font-normal text-slate-400"> / {items.length}</span>
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {t('results.unanswered')}: {items.length - answered}
            </p>
          </div>
        </div>
      </section>

      <h2 className="mb-4 mt-10 border-b border-ink pb-3 font-serif text-2xl font-semibold text-ink">
        {t('results.review')}
      </h2>

      <div className="space-y-3">
        {items.map((item) => {
          const question: Question = {
            id: item.questionId,
            number: item.number,
            type: item.type ?? 'short-answer',
            prompt: item.prompt ?? '',
            instructions: item.instructions,
            options: item.options,
            bank: item.bank,
            answer: item.expected,
          };
          return (
            <QuestionInput
              key={item.questionId}
              question={question}
              value={Array.isArray(item.userAnswer) ? item.userAnswer : item.userAnswer ?? ''}
              onChange={() => undefined}
              disabled
              review={{
                correct: item.correct,
                expected: item.expected,
                userAnswer: item.userAnswer,
                explanation: item.explanation,
                location: item.location,
              }}
            />
          );
        })}
      </div>

      <div className="mt-8 flex gap-2">
        <Link to={`/practice/${attempt.skill}`} className="btn-primary">
          {t('results.tryAgain')}
        </Link>
        <Link to="/" className="btn-secondary">
          {t('results.backToPractice')}
        </Link>
      </div>
    </div>
  );
}
