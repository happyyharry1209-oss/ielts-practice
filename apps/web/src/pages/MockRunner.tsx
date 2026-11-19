import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { MOCK_DURATION, MOCK_ORDER } from '@ielts/shared';
import type { MockSession, MockSubmission, Skill } from '@ielts/shared';
import { MockResultsView } from '../components/MockResultsView';
import { MicrophoneCheck } from '../components/MicrophoneCheck';
import { LoadError, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { skillLabel } from '../lib/skills';
import { cn } from '../lib/utils';
import ListeningExam from './ListeningExam';
import ReadingExam from './ReadingExam';
import SpeakingExam from './SpeakingExam';
import WritingExam from './WritingExam';

export default function MockRunner() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [checkedMicFor, setCheckedMicFor] = useState<string>();
  const queryClient = useQueryClient();
  const queryKey = ['mock-session', user?.id, id];
  const path = `/api/mock/${id}`;
  const sessionQuery = useQuery({
    queryKey,
    queryFn: ({ signal }) => api<{ session: MockSession }>(path, { signal }),
    staleTime: 0,
  });
  const session = sessionQuery.data?.session;
  const current = session?.current;

  function update(data: { session: MockSession }) {
    queryClient.setQueryData(queryKey, data);
    void queryClient.invalidateQueries({ queryKey: ['mock-sessions', user?.id] });
    window.scrollTo(0, 0);
  }

  const start = useMutation({
    mutationFn: async (skill: Skill) => {
      await queryClient.cancelQueries({ queryKey });
      return api<{ session: MockSession }>(`${path}/start`, { method: 'POST', json: { skill } });
    },
    onSuccess: update,
  });

  if (session?.test && session.deadline && current) {
    const { test, deadline } = session;
    const stage = {
      id: session.id,
      deadline,
      finish: async (submission: MockSubmission) => {
        await queryClient.cancelQueries({ queryKey });
        update(await api<{ session: MockSession }>(`${path}/submit`, {
          method: 'POST',
          json: { skill: test.skill, ...submission },
        }));
      },
    };
    const key = `${session.id}:${test.skill}`;
    switch (test.skill) {
      case 'listening': return <ListeningExam key={key} mock={{ ...stage, test }} />;
      case 'reading': return <ReadingExam key={key} mock={{ ...stage, test }} />;
      case 'writing': return <WritingExam key={key} mock={{ ...stage, test }} />;
      case 'speaking': return <SpeakingExam key={key} mock={{ ...stage, test }} />;
    }
  }

  const currentIndex = current ? MOCK_ORDER.indexOf(current) : MOCK_ORDER.length;
  return (
    <main className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:py-10">
      <Link to="/mock" className="btn-secondary">← {t('mock.back')}</Link>
      {sessionQuery.isLoading ? <Spinner label={t('common.loading')} /> : !session ? (
        <LoadError message={t('mock.error')} retryLabel={t('common.retry')} busy={sessionQuery.isFetching} onRetry={() => void sessionQuery.refetch()} />
      ) : (
        <>
          <div className="card border-t-2 border-t-brand-600 p-5 sm:p-7">
            <h1 className="page-title">{t(current ? 'mock.title' : 'mock.complete')}</h1>
            <ol className="my-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {MOCK_ORDER.map((skill, index) => (
                <li key={skill} aria-current={index === currentIndex ? 'step' : undefined}
                  className={cn('rounded-sm border border-line px-3 py-2 text-sm', index === currentIndex ? 'border-brand-500 font-semibold text-ink' : 'text-muted')}>
                  {t(skillLabel(skill))}
                  {index < currentIndex ? <span className="ml-2 text-emerald-600" aria-label={t('practice.done')}>✓</span> : null}
                </li>
              ))}
            </ol>
            {current ? (
              <>
                <p className="mb-1 font-semibold text-ink">{t('mock.nextSkill', { skill: t(skillLabel(current)) })}</p>
                <p className="mb-4 text-sm text-muted">
                  {t('practice.minutes', { count: MOCK_DURATION[current] / 60 })} · {t(`mock.${current}Format`)}
                </p>
                <p className="mb-4 text-sm text-muted">{t('mock.timerNotice')}</p>
                {current === 'speaking' && checkedMicFor !== session.id ? (
                  <MicrophoneCheck key={session.id} onReady={() => setCheckedMicFor(session.id)} />
                ) : <button type="button" className="btn-primary" onClick={() => start.mutate(current)} disabled={start.isPending}>
                  {t(start.isPending ? 'common.loading' : 'mock.startSection')}
                </button>}
                {start.isError ? <p className="mt-3 text-sm text-rose-600" role="alert">{t('mock.error')}</p> : null}
              </>
            ) : <p className="text-sm text-muted">{t('mock.resultsNotice')}</p>}
          </div>
          {session.results ? <MockResultsView id={session.id} results={session.results} /> : null}
        </>
      )}
    </main>
  );
}
