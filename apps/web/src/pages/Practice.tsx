import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ContentManifest, Skill, TestSummary } from '@ielts/shared';
import { Badge, PageHeader } from '../components/ui';
import { api } from '../lib/api';
import { bandColor, cn } from '../lib/utils';
import { clearStoredAnswers } from '../lib/useExam';

const SKILLS: Skill[] = ['reading', 'listening', 'writing', 'speaking'];
const TONE: Record<string, 'emerald' | 'sky' | 'amber' | 'rose'> = {
  reading: 'emerald',
  listening: 'sky',
  writing: 'amber',
  speaking: 'rose',
};

interface StatsResponse {
  byContent: { skill: string; content_id: string; attempts: number; best_band: number | null }[];
}

type Filter = 'all' | 'new' | 'done';

export default function Practice() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { skill } = useParams<{ skill: string }>();
  const [mode, setMode] = useState<'mock' | 'practice'>('mock');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const current = (skill ?? 'reading') as Skill;
  const valid = SKILLS.includes(current);

  const { data } = useQuery({
    queryKey: ['manifest'],
    queryFn: () => api<ContentManifest>('/api/content/manifest'),
  });
  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: () => api<StatsResponse>('/api/attempts/stats'),
  });

  const bestByContent = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const entry of stats?.byContent ?? []) {
      map.set(`${entry.skill}:${entry.content_id}`, entry.best_band);
    }
    return map;
  }, [stats]);

  const tests: TestSummary[] = valid ? data?.[current] ?? [] : [];
  const visible = tests.filter((test) => {
    const done = bestByContent.has(`${current}:${test.id}`);
    if (filter === 'new' && done) return false;
    if (filter === 'done' && !done) return false;
    if (query.trim() && !test.title.toLowerCase().includes(query.trim().toLowerCase())) return false;
    return true;
  });

  const start = (test: TestSummary) => {
    clearStoredAnswers(test.id);
    const queryString = current === 'reading' || current === 'listening' ? `?mode=${mode}` : '';
    navigate(`/exam/${current}/${test.id}${queryString}`);
  };

  if (!valid) {
    return <div className="py-10 text-sm text-slate-500">{t('errors.notFound')}</div>;
  }

  return (
    <div>
      <PageHeader
        title={`${t('practice.title')} — ${t(`home.skill${current.charAt(0).toUpperCase()}${current.slice(1)}`)}`}
        subtitle={t('practice.testCount', { count: tests.length })}
        actions={
          current === 'reading' || current === 'listening' ? (
            <div className="flex border border-line bg-surface p-1 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setMode('mock')}
                className={cn(
                  'min-h-9 px-3 transition',
                  mode === 'mock' ? 'bg-ink text-paper' : 'text-slate-500 hover:text-ink',
                )}
              >
                {t('exam.mockMode')}
              </button>
              <button
                type="button"
                onClick={() => setMode('practice')}
                className={cn(
                  'min-h-9 px-3 transition',
                  mode === 'practice' ? 'bg-ink text-paper' : 'text-slate-500 hover:text-ink',
                )}
              >
                {t('exam.practiceMode')}
              </button>
            </div>
          ) : null
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input border-ink/30 pl-9"
            placeholder={t('practice.search')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {(['all', 'new', 'done'] as Filter[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={cn(
              'min-h-11 border px-3 text-[11px] font-semibold transition',
              filter === value
                ? 'border-ink bg-ink text-paper'
                : 'border-line bg-transparent text-slate-500 hover:border-ink hover:text-ink',
            )}
          >
            {t(`practice.filter${value.charAt(0).toUpperCase()}${value.slice(1)}`)}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="border-y border-line py-12 text-center">
          <p className="font-serif text-xl text-ink">{t('practice.noMatch')}</p>
        </div>
      ) : (
        <div className="test-list">
          {visible.map((test, index) => {
            const best = bestByContent.get(`${current}:${test.id}`);
            const done = bestByContent.has(`${current}:${test.id}`);
            return (
              <article key={test.id} className="test-entry">
                <span className="font-serif text-[11px] text-brand-600">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge tone={TONE[current]}>
                      {t(`home.skill${current.charAt(0).toUpperCase()}${current.slice(1)}`)}
                    </Badge>
                    {done ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-sage">
                        <CheckCircle2 className="h-3 w-3" />
                        {t('practice.done')}
                      </span>
                    ) : (
                      <span className="text-[10px] uppercase tracking-[0.12em] text-slate-400">
                        {t('practice.new')}
                      </span>
                    )}
                  </div>
                  <h2 className="font-serif text-2xl font-semibold leading-tight text-ink">
                    {test.title}
                  </h2>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{test.description}</p>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-slate-500">
                  <span>{t('practice.minutes', { count: Math.round(test.durationSec / 60) })}</span>
                  <span>{t('practice.questions', { count: test.questionCount })}</span>
                  <span className={cn('font-serif text-xl', bandColor(best))}>
                    {done && best != null ? `${t('practice.best')} ${best.toFixed(1)}` : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <button type="button" className="btn-primary text-xs" onClick={() => start(test)}>
                    {done ? t('practice.retry') : t('practice.startTest')}
                  </button>
                  <Link to="/" aria-label={t('common.back')} className="text-ink">
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
