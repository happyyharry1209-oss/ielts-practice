import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, Clock3, ListChecks, Search } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { ContentManifest, PaperBank, TestSummary } from '@ielts/shared';
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
const PAGE_SIZE = 20;
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
  const { search: practiceSearch } = useLocation();
  const [params, setParams] = useSearchParams();
  const bank: PaperBank = params.get('bank') === 'academic' ? 'academic' : 'practice';
  const selectedMode = params.get('mode');
  const mode: Mode = selectedMode === 'mock' || selectedMode === 'practice' ? selectedMode : bank === 'academic' ? 'mock' : 'practice';
  const difficultyParam = params.get('difficulty');
  const difficulty = difficultyParam === 'easy' || difficultyParam === 'medium' || difficultyParam === 'hard' ? difficultyParam : 'all';
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const query = params.get('q') ?? '';
  const filterParam = params.get('status');
  const filter: Filter = filterParam === 'new' || filterParam === 'done' ? filterParam : 'all';
  const skill = current.key;
  const hasStats = skill === 'reading' || skill === 'listening';

  const manifest = useQuery({
    queryKey: ['manifest'],
    queryFn: () => api<ContentManifest>('/api/content/manifest'),
  });
  const stats = useQuery({
    queryKey: ['stats', user?.id],
    queryFn: () => api<StatsResponse>('/api/attempts/stats'),
    enabled: hasStats,
  });

  const tests = (manifest.data?.[skill] ?? []).filter((test) => (test.bank ?? 'practice') === bank);
  const progress = new Map(
    stats.data?.byContent
      .filter((entry) => entry.skill === skill)
      .map((entry) => [entry.content_id, entry.best_band]),
  );
  const searchTerms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const results = tests.filter((test) => {
    if (difficulty !== 'all' && test.difficulty !== difficulty) return false;
    const done = progress.has(test.id);
    if (hasStats && stats.data) {
      if (filter === 'new' && done) return false;
      if (filter === 'done' && !done) return false;
    }
    const searchable = [test.id, test.title, test.description, test.visualKind,
      test.visualKind ? t(`writing.visual-${test.visualKind}`) : ''].join(' ').toLowerCase();
    return searchTerms.every((term) => searchable.includes(term));
  });
  const pageCount = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const requestedPage = Number(params.get('page'));
  const page = Number.isSafeInteger(requestedPage)
    ? Math.min(pageCount, Math.max(1, requestedPage))
    : 1;
  const firstIndex = (page - 1) * PAGE_SIZE;
  const pageTests = results.slice(firstIndex, firstIndex + PAGE_SIZE);

  const changeFilters = (search: string, status: Filter) => {
    const next = new URLSearchParams(params);
    if (search) next.set('q', search);
    else next.delete('q');
    if (status === 'all') next.delete('status');
    else next.set('status', status);
    next.delete('page');
    setParams(next, { replace: true });
  };

  const changePage = (nextPage: number) => {
    const next = new URLSearchParams(params);
    if (nextPage === 1) next.delete('page');
    else next.set('page', String(nextPage));
    setParams(next);
    resultsHeading.current?.focus();
  };

  const start = (test: TestSummary) => {
    if (hasStats) clearStoredAnswers(test.id);
    navigate(`/exam/${skill}/${test.id}?mode=${mode}`, {
      state: { practiceSearch },
    });
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

      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label={t('practice.bank')}>
        {(['academic', 'practice'] as const).map((value) => (
          <button key={value} type="button" aria-pressed={bank === value}
            className={bank === value ? 'btn-primary' : 'btn-secondary'}
            onClick={() => {
              if (bank === value) return;
              const next = new URLSearchParams();
              if (value === 'academic') next.set('bank', 'academic');
              setParams(next);
            }}>
            {t(`practice.bank-${value}`)}
          </button>
        ))}
      </div>
      <p className="mb-5 text-sm text-muted">{t(`practice.bank-${bank}-hint`)}</p>

      {manifest.isLoading ? (
        <Spinner label={t('common.loading')} />
      ) : !manifest.data ? (
        <LoadError message={t('errors.tests')} retryLabel={t('common.retry')} busy={manifest.isFetching} onRetry={() => void manifest.refetch()} />
      ) : tests.length === 0 ? (
        <EmptyState title={t('practice.empty')} />
      ) : (
        <>
            <fieldset className="mb-6">
              <legend className="mb-3 text-sm font-semibold text-ink">{t('practice.mode')}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {(['mock', 'practice'] as const).map((value) => (
                  <label key={value} className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-lg border bg-surface p-4 transition focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-500',
                    mode === value ? 'border-brand-600' : 'border-line hover:border-ink/50',
                  )}>
                    <input className="mt-1 h-4 w-4 shrink-0 accent-brand-600" type="radio" name="mode" value={value} checked={mode === value} onChange={() => {
                      const next = new URLSearchParams(params);
                      next.set('mode', value);
                      setParams(next, { replace: true });
                    }} />
                    <span>
                      <span className="block text-sm font-semibold text-ink">{t(value === 'mock' ? 'exam.mockMode' : 'exam.practiceMode')}</span>
                      <span className="mt-1 block text-sm leading-5 text-muted">{t(`practice.${value}Hint`)}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:min-w-52 sm:flex-1">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input type="search" aria-label={t('practice.search')} className="input pl-9" placeholder={t('practice.search')} value={query} onChange={(event) => changeFilters(event.target.value, filter)} />
            </div>
            <select className="input w-auto" aria-label={t('practice.difficulty')} value={difficulty} onChange={(event) => {
              const next = new URLSearchParams(params);
              if (event.target.value === 'all') next.delete('difficulty');
              else next.set('difficulty', event.target.value);
              next.delete('page');
              setParams(next, { replace: true });
            }}>
              {(['all', 'easy', 'medium', 'hard'] as const).map((value) => <option key={value} value={value}>{t(`practice.difficulty-${value}`)}</option>)}
            </select>
            {hasStats && stats.data ? (
              <div role="group" aria-label={t('practice.filterStatus')} className="flex flex-wrap gap-2">
                {FILTERS.map((value) => (
                  <button key={value} type="button" aria-pressed={filter === value} onClick={() => changeFilters(query, value)}
                    className={cn('btn-secondary text-xs', filter === value && 'border-ink bg-ink text-paper hover:bg-ink-soft dark:hover:bg-ink-soft')}>
                    {t(`practice.filter${value.charAt(0).toUpperCase()}${value.slice(1)}`)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {hasStats && stats.isError && !stats.data ? (
            <p role="status" className="mb-4 text-sm text-muted">{t('errors.progress')}</p>
          ) : null}

          {results.length === 0 ? (
            <div className="card p-8 text-center">
              <p role="status" className="text-sm text-muted">{t('practice.noMatch')}</p>
              <button className="btn-secondary mt-4" type="button" onClick={() => setParams(bank === 'academic' ? { bank } : {}, { replace: true })}>
                {t('practice.clearFilters')}
              </button>
            </div>
          ) : (
            <section aria-labelledby="practice-results">
              <h2 id="practice-results" ref={resultsHeading} tabIndex={-1} className="mb-3 scroll-mt-24 text-sm font-medium text-muted">
                {t('practice.resultRange', { start: firstIndex + 1, end: firstIndex + pageTests.length, total: results.length })}
              </h2>
              <ul className="space-y-3">
                {pageTests.map((test) => {
                  const best = progress.get(test.id);
                  const done = hasStats && progress.has(test.id);
                  const testNumber = test.id.match(/^(?:practice-)?(?:reading|listening|writing|speaking)-(\d+)/)?.[1]
                    ?? test.id.slice(test.id.lastIndexOf('-') + 1);
                  return (
                    <li key={test.id} className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                      <div className="min-w-0">
                        <h3 className="break-words font-serif text-[25px] font-semibold leading-tight text-ink">{test.title}</h3>
                        {test.description ? <p className="mt-1.5 text-sm leading-6 text-muted">{test.description}</p> : null}
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-muted">
                          <span className="rounded-sm border border-line px-2 py-1 text-ink">{t(`practice.difficulty-${test.difficulty ?? 'medium'}`)}</span>
                          {test.visualKind ? <span>{t(`writing.visual-${test.visualKind}`)}</span> : null}
                          <span className="tabular-nums">{t('practice.setNumber', { number: testNumber })}</span>
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
              {pageCount > 1 ? (
                <nav aria-label={t('practice.pagination')} className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <button type="button" className="btn-secondary" disabled={page === 1} onClick={() => changePage(page - 1)}>
                    {t('practice.previousPage')}
                  </button>
                  <label className="flex items-center gap-2 text-sm text-muted">
                    <span className="sr-only">{t('practice.goToPage')}</span>
                    <select className="input w-auto" value={page} onChange={(event) => changePage(Number(event.target.value))}>
                      {Array.from({ length: pageCount }, (_, index) => (
                        <option key={index + 1} value={index + 1}>{index + 1}</option>
                      ))}
                    </select>
                    <span aria-hidden="true">/ {pageCount}</span>
                  </label>
                  <button type="button" className="btn-secondary" disabled={page === pageCount} onClick={() => changePage(page + 1)}>
                    {t('practice.nextPage')}
                  </button>
                </nav>
              ) : null}
            </section>
          )}
        </>
      )}
    </div>
  );
}
