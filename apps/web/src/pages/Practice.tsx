import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, PageHeader, Spinner } from '../components/ui';
import type { ContentManifest, Skill, TestSummary } from '@ielts/shared';
import { api } from '../lib/api';
import { clearStoredAnswers } from '../lib/useExam';

const SKILLS: Skill[] = ['reading', 'listening', 'writing', 'speaking'];

const TONE: Record<string, 'emerald' | 'sky' | 'amber' | 'rose'> = {
  reading: 'emerald',
  listening: 'sky',
  writing: 'amber',
  speaking: 'rose',
};

export default function Practice() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { skill } = useParams<{ skill: string }>();
  const [mode, setMode] = useState<'mock' | 'practice'>('mock');

  const current = (skill ?? 'reading') as Skill;
  const valid = SKILLS.includes(current);

  const { data, isLoading } = useQuery({
    queryKey: ['manifest'],
    queryFn: () => api<ContentManifest>('/api/content/manifest'),
  });

  const tests: TestSummary[] = valid ? data?.[current] ?? [] : [];

  const start = (test: TestSummary) => {
    clearStoredAnswers(test.id);
    const query = current === 'reading' || current === 'listening' ? `?mode=${mode}` : '';
    navigate(`/exam/${current}/${test.id}${query}`);
  };

  if (!valid) {
    return <div className="text-sm text-slate-500">{t('errors.notFound')}</div>;
  }

  return (
    <div>
      <PageHeader
        title={`${t('practice.title')} — ${t(`home.skill${current.charAt(0).toUpperCase()}${current.slice(1)}`)}`}
        subtitle={t('home.practiceNow')}
        actions={
          current === 'reading' || current === 'listening' ? (
            <div className="flex rounded-xl border border-slate-200 bg-white p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setMode('mock')}
                className={`rounded-lg px-3 py-1.5 ${mode === 'mock' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}
              >
                {t('exam.mockMode')}
              </button>
              <button
                type="button"
                onClick={() => setMode('practice')}
                className={`rounded-lg px-3 py-1.5 ${mode === 'practice' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}
              >
                {t('exam.practiceMode')}
              </button>
            </div>
          ) : null
        }
      />

      {isLoading ? (
        <Spinner />
      ) : tests.length === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-500">{t('practice.empty')}</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {tests.map((test) => (
            <div key={test.id} className="card flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">{test.title}</h2>
                  <p className="mt-1 text-sm text-slate-500">{test.description}</p>
                </div>
                <Badge tone={TONE[current]}>
                  {t(`home.skill${current.charAt(0).toUpperCase()}${current.slice(1)}`)}
                </Badge>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="chip bg-slate-100 text-slate-600">
                  {t('practice.minutes', { count: Math.round(test.durationSec / 60) })}
                </span>
                <span className="chip bg-slate-100 text-slate-600">
                  {t('practice.questions', { count: test.questionCount })}
                </span>
              </div>
              <div className="mt-5 flex gap-2">
                <button type="button" className="btn-primary" onClick={() => start(test)}>
                  {t('practice.startTest')}
                </button>
                <Link to="/" className="btn-ghost">
                  {t('common.back')}
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
