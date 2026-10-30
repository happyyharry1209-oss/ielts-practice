import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ContentManifest, Skill, TestSummary } from '@ielts/shared';
import { Badge, PageHeader } from '../components/ui';
import { api } from '../lib/api';
import { bandColor } from '../lib/utils';
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
    return <div className="text-sm text-slate-500">{t('errors.notFound')}</div>;
  }

  return (
    <div>
      <PageHeader
        title={`${t('practice.title')} — ${t(`home.skill${current.charAt(0).toUpperCase()}${current.slice(1)}`)}`}
        subtitle={t('practice.testCount', { count: tests.length })}
        actions={
          current === 'reading' || current === 'listening' ? (
            <div className="flex rounded-xl border border-slate-200 bg-white p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setMode('mock')}
                className={`rounded-lg px-3 py-1.5 transition ${mode === 'mock' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {t('exam.mockMode')}
              </button>
              <button
                type="button"
                onClick={() => setMode('practice')}
                className={`rounded-lg px-3 py-1.5 transition ${mode === 'practice' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {t('exam.practiceMode')}
              </button>
            </div>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
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
            className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
              filter === value
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-500 ring-1 ring-slate-200 hover:text-slate-700'
            }`}
          >
            {t(`practice.filter${value.charAt(0).toUpperCase()}${value.slice(1)}`)}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-500">{t('practice.noMatch')}</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visible.map((test) => {
            const best = bestByContent.get(`${current}:${test.id}`);
            const done = bestByContent.has(`${current}:${test.id}`);
            return (
              <div key={test.id} className="card card-hover flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">{test.title}</h2>
                    <p className="mt-1 text-sm text-slate-500">{test.description}</p>
                  </div>
                  <Badge tone={TONE[current]}>
                    {t(`home.skill${current.charAt(0).toUpperCase()}${current.slice(1)}`)}
                  </Badge>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                  <span className="chip bg-slate-100 text-slate-600">
                    {t('practice.minutes', { count: Math.round(test.durationSec / 60) })}
                  </span>
                  <span className="chip bg-slate-100 text-slate-600">
                    {t('practice.questions', { count: test.questionCount })}
                  </span>
                  {done ? (
                    <span className="chip bg-emerald-100 text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {best != null ? `${t('practice.best')} ${best.toFixed(1)}` : t('practice.done')}
                    </span>
                  ) : (
                    <span className="chip bg-slate-100 text-slate-500">{t('practice.new')}</span>
                  )}
                </div>

                <div className="mt-5 flex gap-2">
                  <button type="button" className="btn-primary" onClick={() => start(test)}>
                    {done ? t('practice.retry') : t('practice.startTest')}
                  </button>
                  <Link to="/" className="btn-ghost">
                    {t('common.back')}
                  </Link>
                  {done ? (
                    <span className={`ml-auto self-center text-sm font-bold ${bandColor(best)}`}>
                      {best != null ? best.toFixed(1) : ''}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
