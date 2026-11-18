import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ClipboardList } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { MOCK_DURATION, MOCK_ORDER } from '@ielts/shared';
import type { MockSession, MockSummary } from '@ielts/shared';
import { LoadError, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { SKILLS, skillLabel } from '../lib/skills';
import { cn, formatDateTime } from '../lib/utils';

export default function MockLobby() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const listKey = ['mock-sessions', user?.id];
  const sessions = useQuery({
    queryKey: listKey,
    queryFn: () => api<{ sessions: MockSummary[] }>('/api/mock'),
  });
  const create = useMutation({
    mutationFn: () => api<{ session: MockSession }>('/api/mock', { method: 'POST' }),
    onSuccess: ({ session }) => {
      queryClient.setQueryData(['mock-session', user?.id, session.id], { session });
      void queryClient.invalidateQueries({ queryKey: listKey });
      navigate(`/mock/${session.id}`);
      window.scrollTo(0, 0);
    },
  });
  return (
    <div className="space-y-7">
      <section className="card border-t-2 border-t-brand-600 p-5 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="eyebrow mb-2">IELTS Academic</p>
            <h1 className="page-title">{t('mock.title')}</h1>
            <p className="mt-2 text-sm leading-6 text-muted">{t('mock.intro')}</p>
          </div>
          <button type="button" className="btn-primary" disabled={create.isPending} onClick={() => create.mutate()}>
            <ClipboardList aria-hidden="true" size={17} />
            {t(create.isPending ? 'common.loading' : 'mock.new')}
          </button>
        </div>
        {create.isError ? <p role="alert" className="mt-3 text-sm text-rose-600">{t('mock.error')}</p> : null}
        <ol className="mt-6 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {MOCK_ORDER.map((skill) => {
            const { Icon, accent } = SKILLS.find(({ key }) => key === skill)!;
            return (
              <li key={skill} className="rounded-sm border border-line bg-paper p-3 sm:p-4">
                <span className={cn('skill-icon', accent)}><Icon aria-hidden="true" size={17} /></span>
                <h2 className="mt-2 font-semibold text-ink">{t(skillLabel(skill))}</h2>
                <p className="mt-1 text-xs leading-5 text-muted">
                  {t('practice.minutes', { count: MOCK_DURATION[skill] / 60 })} · {t(`mock.${skill}Format`)}
                </p>
              </li>
            );
          })}
        </ol>
        <p className="mt-4 text-xs leading-5 text-muted">{t('mock.practiceNotice')}</p>
      </section>

      <section aria-labelledby="mock-history">
        <h2 id="mock-history" className="mb-3 font-serif text-2xl font-semibold text-ink">{t('mock.history')}</h2>
        {sessions.isLoading ? <Spinner label={t('common.loading')} /> : sessions.isError ? (
          <LoadError message={t('mock.error')} retryLabel={t('common.retry')} busy={sessions.isFetching} onRetry={() => void sessions.refetch()} />
        ) : sessions.data?.sessions.length ? (
          <ul className="space-y-2">
            {sessions.data.sessions.map((session) => (
              <li key={session.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold text-ink">{formatDateTime(session.createdAt, i18n.language)}</p>
                  <p className="mt-1 text-xs text-muted">
                    {session.current ? t('mock.nextSkill', { skill: t(skillLabel(session.current)) }) : t('mock.complete')}
                  </p>
                </div>
                <Link to={`/mock/${session.id}`} className="btn-secondary">
                  {t(session.current ? 'mock.resume' : 'mock.viewResult')}
                  <ArrowRight aria-hidden="true" size={16} />
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="card p-4 text-sm text-muted">{t('mock.empty')}</p>}
      </section>
    </div>
  );
}
