import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { Question } from '@ielts/shared';
import { Badge, Card, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { cn } from '../lib/utils';

export interface ReviewQuestion extends Question {
  yourAnswer: string | string[] | null;
}

export interface ReviewGroup {
  contentId: string;
  skill: string;
  title: string;
  questions: ReviewQuestion[];
}

export interface ReviewResponse {
  total: number;
  groups: ReviewGroup[];
}

function asText(value: string | string[] | null): string {
  if (value == null) return '—';
  return Array.isArray(value) ? value.join(', ') : value;
}

export default function Review() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['review', 'wrong'],
    queryFn: () => api<ReviewResponse>('/api/review/wrong'),
    // Marking happens on the session page, so refresh whenever this page opens.
    refetchOnMount: 'always',
  });

  const master = useMutation({
    mutationFn: ({ contentId, questionId }: { contentId: string; questionId: string }) =>
      api('/api/review/master', { method: 'POST', json: { contentId, questionId } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['review', 'wrong'] });
    },
  });

  if (isLoading) return <Spinner />;

  const total = data?.total ?? 0;

  return (
    <div>
      <PageHeader
        title={t('review.title')}
        subtitle={t('review.subtitle')}
        actions={
          total > 0 ? (
            <Link to="/review/session" className="btn-primary">
              {t('review.retryAll', { count: total })}
            </Link>
          ) : null
        }
      />

      {total === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-12 text-center">
          <CheckCheck className="h-8 w-8 text-emerald-500" />
          <p className="text-sm font-semibold text-slate-700">{t('review.empty')}</p>
          <p className="text-sm text-slate-500">{t('review.emptyHint')}</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {data?.groups.map((group) => (
            <section key={`${group.skill}:${group.contentId}`}>
              <div className="mb-2 flex items-center gap-2">
                <Badge tone={group.skill === 'reading' ? 'emerald' : 'sky'}>
                  {t(`home.skill${group.skill.charAt(0).toUpperCase()}${group.skill.slice(1)}`)}
                </Badge>
                <h2 className="text-sm font-semibold text-slate-800">{group.title}</h2>
                <span className="text-xs text-slate-400">
                  {t('review.count', { count: group.questions.length })}
                </span>
              </div>

              <div className="space-y-2">
                {group.questions.map((question) => (
                  <div key={question.id} className="card p-4">
                    <div className="flex gap-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
                        {question.number}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-6 text-slate-800">
                          {question.prompt}
                        </p>

                        <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                          <p>
                            <span className="text-xs text-slate-400">
                              {t('review.yourAnswer')}:{' '}
                            </span>
                            <span className="font-semibold text-rose-600">
                              {asText(question.yourAnswer)}
                            </span>
                          </p>
                          <p>
                            <span className="text-xs text-slate-400">
                              {t('review.correctAnswer')}:{' '}
                            </span>
                            <span className="font-semibold text-emerald-700">
                              {asText(question.answer)}
                            </span>
                          </p>
                        </div>

                        {question.explanation ? (
                          <p className="mt-2 text-xs leading-5 text-slate-500">
                            {question.explanation}
                          </p>
                        ) : null}

                        <div className="mt-3">
                          <button
                            type="button"
                            className={cn('btn-secondary text-xs')}
                            disabled={master.isPending}
                            onClick={() =>
                              master.mutate({
                                contentId: group.contentId,
                                questionId: question.id,
                              })
                            }
                          >
                            <CheckCheck className="h-3.5 w-3.5" />
                            {t('review.markMastered')}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
