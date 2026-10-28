import { useQuery } from '@tanstack/react-query';
import { BookOpen, Headphones, Mic, PenLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Badge, Card, PageHeader, Spinner, Stat } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { bandColor, formatDate, formatDateTime } from '../lib/utils';

interface SkillStat {
  skill: string;
  attempts: number;
  best_band: number | null;
  avg_band: number | null;
  last_at: string | null;
}

interface RecentAttempt {
  id: string;
  skill: string;
  content_id: string;
  band: number | null;
  raw_score: number | null;
  total: number | null;
  submitted_at: string;
  mode: string;
  title: string;
}

interface WritingEntry {
  id: string;
  content_id: string;
  task_id: string;
  ai_band: number | null;
  word_count: number;
  created_at: string;
  title: string;
}

interface StatsResponse {
  perSkill: SkillStat[];
  recent: RecentAttempt[];
  writing: WritingEntry[];
}

const SKILL_META = [
  {
    key: 'reading',
    icon: BookOpen,
    accent: 'bg-emerald-50 text-emerald-600',
    ring: 'ring-emerald-100',
  },
  {
    key: 'listening',
    icon: Headphones,
    accent: 'bg-sky-50 text-sky-600',
    ring: 'ring-sky-100',
  },
  {
    key: 'writing',
    icon: PenLine,
    accent: 'bg-amber-50 text-amber-600',
    ring: 'ring-amber-100',
  },
  {
    key: 'speaking',
    icon: Mic,
    accent: 'bg-rose-50 text-rose-600',
    ring: 'ring-rose-100',
  },
] as const;

export default function Home() {
  const { t, i18n } = useTranslation();
  const { user, isAdmin } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: () => api<StatsResponse>('/api/attempts/stats'),
  });

  const bestWriting = data?.writing.reduce<number | null>((best, entry) => {
    if (entry.ai_band == null) return best;
    return best == null ? entry.ai_band : Math.max(best, entry.ai_band);
  }, null);

  const statFor = (skill: string) => data?.perSkill.find((entry) => entry.skill === skill);

  return (
    <div>
      <PageHeader
        title={t('home.greeting', { name: user?.displayName || user?.email?.split('@')[0] || '' })}
        subtitle={t('home.subtitle')}
        actions={
          isAdmin ? (
            <Link to="/admin" className="btn-secondary">
              {t('home.adminPanel')}
            </Link>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SKILL_META.map((meta) => {
          const Icon = meta.icon;
          const stat = statFor(meta.key);
          const band = meta.key === 'writing' ? bestWriting : stat?.best_band ?? null;
          return (
            <Card key={meta.key} className="flex flex-col">
              <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${meta.accent}`}>
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-3 text-base font-semibold text-slate-900">
                {t(`home.skill${meta.key.charAt(0).toUpperCase()}${meta.key.slice(1)}`)}
              </h3>
              <p className="mt-1 flex-1 text-xs leading-5 text-slate-500">
                {t(`home.${meta.key}Desc`)}
              </p>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">
                    {t('home.bestBand')}
                  </p>
                  <p className={`text-2xl font-black ${bandColor(band)}`}>
                    {band != null ? band.toFixed(1) : '—'}
                  </p>
                </div>
                <Link to={`/practice/${meta.key}`} className="btn-secondary text-xs">
                  {t('home.practiceNow')}
                </Link>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat
          label={t('home.attempts')}
          value={data?.perSkill.reduce((sum, entry) => sum + entry.attempts, 0) ?? 0}
          hint={`${data?.recent.length ?? 0} recent`}
        />
        <Stat
          label={t('home.writingFeedback')}
          value={data?.writing.length ?? 0}
          hint={bestWriting != null ? `${t('home.bestBand')}: ${bestWriting.toFixed(1)}` : undefined}
        />
        <Stat label={t('admin.joined')} value={formatDate(user?.createdAt, i18n.language)} />
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {t('home.recent')}
      </h2>
      {isLoading ? (
        <Spinner />
      ) : (data?.recent.length ?? 0) === 0 ? (
        <Card className="text-sm text-slate-500">{t('home.noData')}</Card>
      ) : (
        <div className="card divide-y divide-slate-100 overflow-hidden">
          {data?.recent.map((attempt) => (
            <Link
              key={attempt.id}
              to={`/result/${attempt.id}`}
              className="flex items-center gap-3 px-5 py-3 transition hover:bg-slate-50"
            >
              <Badge tone={attempt.skill === 'reading' ? 'emerald' : 'sky'}>
                {t(`home.skill${attempt.skill.charAt(0).toUpperCase()}${attempt.skill.slice(1)}`)}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{attempt.title}</p>
                <p className="text-xs text-slate-400">
                  {formatDateTime(attempt.submitted_at, i18n.language)} · {attempt.mode}
                </p>
              </div>
              <div className="text-right">
                <p className={`text-lg font-bold ${bandColor(attempt.band)}`}>
                  {attempt.band != null ? attempt.band.toFixed(1) : '—'}
                </p>
                <p className="text-xs text-slate-400">
                  {attempt.raw_score ?? 0}/{attempt.total ?? 0}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {(data?.writing.length ?? 0) > 0 ? (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">
            {t('home.writingFeedback')}
          </h2>
          <div className="card divide-y divide-slate-100 overflow-hidden">
            {data?.writing.map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 px-5 py-3">
                <Badge tone="amber">{entry.task_id}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{entry.title}</p>
                  <p className="text-xs text-slate-400">
                    {formatDateTime(entry.created_at, i18n.language)} · {entry.word_count} words
                  </p>
                </div>
                <p className={`text-lg font-bold ${bandColor(entry.ai_band)}`}>
                  {entry.ai_band != null ? entry.ai_band.toFixed(1) : '—'}
                </p>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
