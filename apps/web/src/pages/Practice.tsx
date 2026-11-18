import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, Clock3, ListChecks, Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import type { ContentManifest, TestSummary } from '@ielts/shared';
import { EmptyState, LoadError, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { SKILLS, skillLabel } from '../lib/skills';
import { useAuth } from '../lib/auth';
import { clearStoredAnswers } from '../lib/useExam';
import { cn } from '../lib/utils';

interface StatsResponse {
  byContent: { skill: string; content_id: string; best_band: number | null }[];
}

const FILTERS = ['all', 'new', 'done'] as const;
type Filter = (typeof FILTERS)[number];
type Mode = 'mock' | 'practice';

export default function Practice() {
  const { skill } = useParams();
  const { t } = useTranslation();
  const current = SKILLS.find((item) => item.key === skill);
  if (!current) return <EmptyState title={t('errors.notFound')} />;

  return <TestPicker key={current.key} current={current} />;
}

function TestPicker({ current }: { current: (typeof SKILLS)[number] }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('mock');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const skill = current.key;
  const hasExamModes = skill === 'reading' || skill === 'listening';

  const manifest = useQuery({
    queryKey: ['manifest'],
    queryFn: () => api<ContentManifest>('/api/content/manifest'),
  });
  const stats = useQuery({
    queryKey: ['stats', user?.id],
    queryFn: () => api<StatsResponse>('/api/attempts/stats'),
    enabled: hasExamModes,
  });

  const tests = manifest.data?.[skill] ?? [];
  const progress = new Map(
    stats.data?.byContent
      .filter((entry) => entry.skill === skill)
      .map((entry) => [entry.content_id, entry.best_band]),
  );
  const search = query.trim().toLowerCase();
  const visibleTests = tests.filter((test) => {
    const done = progress.has(test.id);
    if (filter === 'new' && done) return false;
    if (filter === 'done' && !done) return false;
    return [test.title, test.description].some((value) => value?.toLowerCase().includes(search));
  });

  const start = (test: TestSummary) => {
    if (hasExamModes) clearStoredAnswers(test.id);
    navigate(`/exam/${skill}/${test.id}${hasExamModes ? `?mode=${mode}` : ''}`);
  };

  return (
    <div>
      <div className="flex items-center gap-4">
        <span className={cn('skill-icon', current.accent)}><current.Icon aria-hidden="true" size={21} /></span>
        <div>
          <h1 className="page-title">{t(skillLabel(skill))}</h1>
          {manifest.data ? <p className="mt-1 text-sm text-muted">{t('practice.testCount', { count: tests.length })}</p> : null}
        </div>
      </div>
      <nav aria-label={t('home.chooseSkill')} className="mb-7 mt-5 grid grid-cols-4 gap-1 border-b border-line">
        {SKILLS.map(({ key }) => (
          <NavLink key={key} to={`/practice/${key}`} className={({ isActive }) => cn(
            'flex min-h-11 items-center justify-center border-b-2 px-1 text-center text-sm font-semibold sm:justify-start sm:px-4',
            isActive ? 'border-brand-600 text-ink' : 'border-transparent text-muted hover:text-ink',
          )}>
            {t(skillLabel(key))}
          </NavLink>
        ))}
      </nav>

      {manifest.isLoading ? (
        <Spinner label={t('common.loading')} />
      ) : !manifest.data ? (
        <LoadError message={t('errors.tests')} retryLabel={t('common.retry')} busy={manifest.isFetching} onRetry={() => void manifest.refetch()} />
      ) : tests.length === 0 ? (
        <EmptyState title={t('practice.empty')} />
      ) : (
        <>
          {hasExamModes ? (
            <fieldset className="mb-6">
              <legend className="mb-3 text-sm font-semibold text-ink">{t('practice.mode')}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {(['mock', 'practice'] as const).map((value) => (
                  <label key={value} className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-lg border bg-surface p-4 transition focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-500',
                    mode === value ? 'border-brand-600' : 'border-line hover:border-ink/50',
                  )}>
                    <input className="mt-1 h-4 w-4 shrink-0 accent-brand-600" type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} />
                    <span>
                      <span className="block text-sm font-semibold text-ink">{t(value === 'mock' ? 'exam.mockMode' : 'exam.practiceMode')}</span>
                      <span className="mt-1 block text-sm leading-5 text-muted">{t(`practice.${value}Hint`)}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:min-w-52 sm:flex-1">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input type="search" aria-label={t('practice.search')} className="input pl-9" placeholder={t('practice.search')} value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            {hasExamModes && stats.data ? (
              <div role="group" aria-label={t('practice.filterStatus')} className="flex flex-wrap gap-2">
                {FILTERS.map((value) => (
                  <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}
                    className={cn('btn-secondary text-xs', filter === value && 'border-ink bg-ink text-paper hover:bg-ink-soft dark:hover:bg-ink-soft')}>
                    {t(`practice.filter${value.charAt(0).toUpperCase()}${value.slice(1)}`)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {hasExamModes && stats.isError && !stats.data ? (
            <p role="status" className="mb-4 text-sm text-muted">{t('errors.progress')}</p>
          ) : null}

          {visibleTests.length === 0 ? (
            <div className="card p-8 text-center">
              <p role="status" className="text-sm text-muted">{t('practice.noMatch')}</p>
              <button className="btn-secondary mt-4" type="button" onClick={() => { setQuery(''); setFilter('all'); }}>
                {t('practice.clearFilters')}
              </button>
            </div>
          ) : (
            <ul className="space-y-3">
              {visibleTests.map((test) => {
                const best = progress.get(test.id);
                const done = hasExamModes && progress.has(test.id);
                return (
                  <li key={test.id} className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                    <div className="min-w-0">
                      <h2 className="break-words font-serif text-[25px] font-semibold leading-tight text-ink">{test.title}</h2>
                      {test.description ? <p className="mt-1.5 text-sm leading-6 text-muted">{test.description}</p> : null}
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-muted">
                        <span className="inline-flex items-center gap-1.5"><Clock3 aria-hidden="true" size={14} />{t('practice.minutes', { count: Math.round(test.durationSec / 60) })}</span>
                        <span className="inline-flex items-center gap-1.5"><ListChecks aria-hidden="true" size={14} />{t(skill === 'writing' ? 'practice.tasks' : 'practice.questions', { count: test.questionCount })}</span>
                        {done ? <span className="inline-flex items-center gap-1.5 text-emerald-700"><Check aria-hidden="true" size={14} />{best != null ? `${t('practice.best')} ${best.toFixed(1)}` : t('practice.done')}</span> : null}
                      </div>
                    </div>
                    <button type="button" className="btn-primary shrink-0 self-start sm:self-center" onClick={() => start(test)}>
                      {done ? t('practice.retry') : t('practice.startTest')}
                      <ArrowRight aria-hidden="true" size={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
