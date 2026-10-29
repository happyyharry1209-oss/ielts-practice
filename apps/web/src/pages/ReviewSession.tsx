import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { QuestionInput } from '../components/QuestionInput';
import { Badge, Card, PageHeader, Spinner } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import type { ReviewResponse } from './Review';

interface GradeResult {
  contentId: string;
  questionId: string;
  correct: boolean;
  reason?: string;
  expected: string | string[];
  explanation?: string;
}

export default function ReviewSession() {
  const { t } = useTranslation();

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: ['review', 'wrong'],
    queryFn: () => api<ReviewResponse>('/api/review/wrong'),
  });

  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [results, setResults] = useState<Record<string, GradeResult>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = useMemo(
    () =>
      (data?.groups ?? []).flatMap((group) =>
        group.questions.map((question) => ({
          group,
          question,
          key: `${group.contentId}::${question.id}`,
        })),
      ),
    [data],
  );

  const [marked, setMarked] = useState<Record<string, boolean>>({});

  const master = useMutation({
    mutationFn: ({
      key,
      contentId,
      questionId,
    }: {
      key: string;
      contentId: string;
      questionId: string;
    }) => api('/api/review/master', { method: 'POST', json: { contentId, questionId } }),
    onSuccess: (_data, variables) => {
      // Keep the question on screen so the review result does not disappear.
      setMarked((previous) => ({ ...previous, [variables.key]: true }));
    },
  });

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const payload = items.map((item) => ({
        contentId: item.group.contentId,
        skill: item.group.skill,
        questionId: item.question.id,
        answer: answers[item.key] ?? null,
      }));
      const response = await api<{ results: GradeResult[] }>('/api/review/grade', {
        method: 'POST',
        json: { items: payload },
      });
      const map: Record<string, GradeResult> = {};
      for (const result of response.results) {
        map[`${result.contentId}::${result.questionId}`] = result;
      }
      setResults(map);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) return <Spinner />;
  if (loadError) {
    return <div className="p-10 text-center text-sm text-rose-600">{errorMessage(loadError)}</div>;
  }
  if (items.length === 0) {
    return (
      <Card className="p-10 text-center">
        <p className="text-sm font-semibold text-slate-700">{t('review.empty')}</p>
        <Link to="/review" className="btn-secondary mt-4">
          {t('review.backToList')}
        </Link>
      </Card>
    );
  }

  const graded = Object.keys(results).length > 0;
  const correctCount = Object.values(results).filter((result) => result.correct).length;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t('review.sessionTitle')}
        subtitle={t('review.sessionSubtitle', { count: items.length })}
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={() => void submit()}
            disabled={submitting}
          >
            {submitting ? t('common.loading') : t('review.checkAnswers')}
          </button>
        }
      />

      {graded ? (
        <Card className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-800">
            {t('review.resultLine', { correct: correctCount, total: items.length })}
          </p>
          <Link to="/review" className="btn-secondary text-xs">
            {t('review.backToList')}
          </Link>
        </Card>
      ) : null}

      {error ? (
        <p className="mb-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : null}

      <div className="space-y-4">
        {items.map((item) => {
          const result = results[item.key];
          return (
            <div key={item.key}>
              <div className="mb-1 flex items-center gap-2">
                <Badge tone={item.group.skill === 'reading' ? 'emerald' : 'sky'}>
                  {t(`home.skill${item.group.skill.charAt(0).toUpperCase()}${item.group.skill.slice(1)}`)}
                </Badge>
                <span className="truncate text-xs text-slate-400">{item.group.title}</span>
              </div>

              <QuestionInput
                question={item.question}
                value={answers[item.key]}
                disabled={Boolean(result)}
                onChange={(value) =>
                  setAnswers((previous) => {
                    const next = { ...previous };
                    if (value === null) delete next[item.key];
                    else next[item.key] = value;
                    return next;
                  })
                }
                review={
                  result
                    ? {
                        correct: result.correct,
                        expected: result.expected,
                        userAnswer: answers[item.key] ?? null,
                        explanation: result.explanation,
                      }
                    : undefined
                }
              />

              {result ? (
                <div className="mt-1 flex justify-end">
                  <button
                    type="button"
                    className="btn-ghost text-xs"
                    disabled={master.isPending || marked[item.key]}
                    onClick={() =>
                      master.mutate({
                        key: item.key,
                        contentId: item.group.contentId,
                        questionId: item.question.id,
                      })
                    }
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    {marked[item.key] ? t('review.marked') : t('review.markMastered')}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex justify-between">
        <Link to="/review" className="btn-secondary">
          {t('review.backToList')}
        </Link>
        {!graded ? (
          <button
            type="button"
            className="btn-primary"
            onClick={() => void submit()}
            disabled={submitting}
          >
            {submitting ? t('common.loading') : t('review.checkAnswers')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
