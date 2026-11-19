import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, ClipboardList, NotebookPen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { SpeakingHistory } from '../components/SpeakingHistory';
import { Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { SKILLS, skillLabel } from '../lib/skills';
import { bandColor, cn, formatDateTime } from '../lib/utils';

interface StatsResponse {
  bestMockBand: number | null;
  perSkill: { skill: string; attempts: number; best_band: number | null }[];
  activity: { weekAttempts: number; activeDays30: number };
  recent: {
    id: string;
    skill: string;
    band: number | null;
    raw_score: number | null;
    total: number | null;
    submitted_at: string;
    mode: string;
    title: string;
  }[];
  writing: {
    id: string;
    task_id: string;
    ai_band: number | null;
    word_count: number;
    created_at: string;
    title: string;
  }[];
}

export default function Home() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['stats', user?.id],
    queryFn: () => api<StatsResponse>('/api/attempts/stats'),
  });

  const bestWriting = data?.writing.reduce<number | null>((best, entry) => {
    if (entry.ai_band == null) return best;
    return best == null ? entry.ai_band : Math.max(best, entry.ai_band);
  }, null);
  const bestMockBand = data?.bestMockBand;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">{t('home.chooseSkill')}</h1>
          <p className="mt-2 text-sm leading-6 text-muted">{t('home.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/mock" className="btn-primary">
            <ClipboardList aria-hidden="true" size={17} />
            {t('mock.nav')}
          </Link>
          <Link to="/review" className="btn-secondary">
            <NotebookPen aria-hidden="true" size={17} />
            {t('nav.review')}
          </Link>
        </div>
      </div>

      <div className="grid items-stretch gap-5 lg:grid-cols-[minmax(0,1fr)_17.5rem]">
        <ul className="grid min-w-0 gap-3 min-[360px]:grid-cols-2 sm:gap-4">
          {SKILLS.map(({ key, Icon, accent }) => {
            const band = key === 'writing'
              ? bestWriting
              : data?.perSkill.find((entry) => entry.skill === key)?.best_band;

            return (
              <li key={key}>
                <Link to={`/practice/${key}`} className="skill-card group">
                  <span className={cn('skill-icon', accent)}><Icon aria-hidden="true" size={21} /></span>
                  <h2 className="font-serif text-[26px] font-semibold leading-tight text-ink">
                    {t(skillLabel(key))}
                  </h2>
                  <p className="text-sm leading-6 text-muted">{t(`home.${key}Desc`)}</p>
                  <span className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-2 text-sm font-semibold text-ink">
                    {t('home.practiceNow')}
                    <ArrowRight aria-hidden="true" size={16} className="transition-transform group-hover:translate-x-1" />
                    {band != null ? (
                      <span className="text-xs sm:ml-auto font-medium text-muted">
                        {t('home.bestBand')} <strong className="text-ink">{band.toFixed(1)}</strong>
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        <aside className="progress-panel" aria-labelledby="progress-title">
          <h2 id="progress-title" className="font-serif text-[27px] font-semibold">{t('home.progress')}</h2>
          {data ? (
            <>
              {bestMockBand != null ? (
                <div className="mt-5 border-b border-white/20 pb-5">
                  <p className="text-sm text-[#c4d0d9]">{t('home.bestMockBand')}</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="font-serif text-6xl font-medium leading-none">{bestMockBand.toFixed(1)}</span>
                    <span className="text-sm text-[#c4d0d9]">/ 9</span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[#c4d0d9]">{t('home.bestMockBandHint')}</p>
                </div>
              ) : null}
              <dl className="mt-5 space-y-4 text-sm">
                <div className="flex justify-between gap-3"><dt>{t('home.weekAttempts')}</dt><dd className="font-semibold tabular-nums">{data.activity.weekAttempts}</dd></div>
                <div className="flex justify-between gap-3"><dt>{t('home.activeDays')}</dt><dd className="font-semibold tabular-nums">{data.activity.activeDays30}</dd></div>
                <div className="flex justify-between gap-3"><dt>{t('home.attempts')}</dt><dd className="font-semibold tabular-nums">{data.perSkill.reduce((sum, entry) => sum + entry.attempts, 0)}</dd></div>
              </dl>
            </>
          ) : isLoading ? (
            <p role="status" className="mt-5 text-sm text-[#c4d0d9]">{t('common.loading')}</p>
          ) : (
            <div className="mt-5 space-y-3">
              <p role="alert" className="text-sm text-[#c4d0d9]">{t('errors.progress')}</p>
              <button className="btn border border-white/30 text-white hover:bg-white/10" type="button" disabled={isFetching} onClick={() => void refetch()}>
                {t('common.retry')}
              </button>
            </div>
          )}
        </aside>
      </div>

      {data || isLoading ? (
        <section aria-labelledby="recent-title">
          <h2 id="recent-title" className="section-title mb-3">{t('home.recent')}</h2>
          <div className="card overflow-hidden">
            {isLoading ? (
              <Spinner label={t('common.loading')} />
            ) : data?.recent.length ? (
              <ul className="divide-y divide-line">
                {data.recent.map((attempt) => (
                  <li key={attempt.id}>
                    <Link to={`/result/${attempt.id}`} className="flex items-center gap-4 px-4 py-4 transition hover:bg-paper sm:px-5">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-semibold text-ink">{attempt.title}</p>
                        <p className="mt-1 text-xs leading-5 text-muted">
                          {t(skillLabel(attempt.skill))} · {formatDateTime(attempt.submitted_at, i18n.language)} ·{' '}
                          {attempt.mode === 'mock' ? t('exam.mockMode') : t('exam.practiceMode')}
                        </p>
                      </div>
                      {attempt.band != null ? (
                      <span className={cn('font-serif text-2xl', bandColor(attempt.band))}>{attempt.band.toFixed(1)}</span>
                    ) : attempt.raw_score != null && attempt.total != null ? (
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                        {attempt.raw_score} / {attempt.total}
                      </span>
                    ) : null}
                      <ArrowRight aria-hidden="true" size={16} className="shrink-0 text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-center gap-4 p-5 sm:px-6">
                <span className="skill-icon bg-paper text-muted"><BookOpen aria-hidden="true" size={19} /></span>
                <div>
                  <p className="text-sm font-semibold text-ink">{t('home.noData')}</p>
                  <p className="mt-1 text-sm leading-5 text-muted">{t('home.noDataHint')}</p>
                </div>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {data?.writing.length ? (
        <section aria-labelledby="writing-title">
          <h2 id="writing-title" className="section-title mb-3">{t('home.writingFeedback')}</h2>
          <ul className="card divide-y divide-line">
            {data.writing.map((entry) => (
              <li key={entry.id} className="flex items-center gap-4 px-4 py-4 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold text-ink">{entry.title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    {entry.task_id} · {formatDateTime(entry.created_at, i18n.language)} · {t('writing.wordCount', { count: entry.word_count })}
                  </p>
                </div>
                {entry.ai_band != null ? <span className={cn('font-serif text-2xl', bandColor(entry.ai_band))}>{entry.ai_band.toFixed(1)}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {user ? <SpeakingHistory key={user.id} userId={user.id} /> : null}
    </div>
  );
}
