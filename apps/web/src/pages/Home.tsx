import { useQuery } from '@tanstack/react-query';
import { BookOpen, Headphones, Mic, PenLine, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Badge, Card, Stat } from '../components/ui';
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
  activity: { weekAttempts: number; activeDays30: number };
  recent: RecentAttempt[];
  writing: WritingEntry[];
}

const SKILL_META = [
  { key: 'reading', icon: BookOpen, accent: 'bg-emerald-50 text-emerald-600' },
  { key: 'listening', icon: Headphones, accent: 'bg-sky-50 text-sky-600' },
  { key: 'writing', icon: PenLine, accent: 'bg-amber-50 text-amber-600' },
  { key: 'speaking', icon: Mic, accent: 'bg-rose-50 text-rose-600' },
] as const;

function Progress({ band }: { band: number | null }) {
  const pct = band == null ? 0 : Math.min(100, (band / 9) * 100);
  return (
    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function Home() {
  const { t, i18n } = useTranslation();
  const { user, isAdmin } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: () => api<StatsResponse>('/api/attempts/stats'),
  });

  const bestWriting =
    data?.writing.reduce<number | null>((best, entry) => {
      if (entry.ai_band == null) return best;
      return best == null ? entry.ai_band : Math.max(best, entry.ai_band);
    }, null) ?? null;

  const statFor = (skill: string) => data?.perSkill.find((entry) => entry.skill === skill);
  const totalAttempts = data?.perSkill.reduce((sum, entry) => sum + entry.attempts, 0) ?? 0;
  const bestOverall = data?.perSkill.reduce<number | null>((best, entry) => {
    if (entry.best_band == null) return best;
    return best == null ? entry.best_band : Math.max(best, entry.best_band);
  }, null);

  return (
    <div>
      <section className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-600 to-indigo-800 p-6 text-white shadow-lg shadow-brand-600/20 sm:p-8">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-100">
            {t('home.heroLabel')}
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
            {t('home.greeting', { name: user?.displayName || user?.email?.split('@')[0] || '' })}
          </h1>
          <p className="mt-1 text-sm text-brand-100">{t('home.subtitle')}</p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Link to="/practice/reading" className="btn bg-white text-brand-700 hover:bg-brand-50">
              {t('home.startPractice')}
            </Link>
            {isAdmin ? (
              <Link to="/admin" className="btn bg-white/15 text-white hover:bg-white/25">
                {t('home.adminPanel')}
              </Link>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap gap-8 text-sm">
            <div>
              <p className="text-2xl font-bold">{data?.activity.weekAttempts ?? 0}</p>
              <p className="text-xs text-brand-100">{t('home.weekAttempts')}</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{data?.activity.activeDays30 ?? 0}</p>
              <p className="text-xs text-brand-100">{t('home.activeDays')}</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{totalAttempts}</p>
              <p className="text-xs text-brand-100">{t('home.attempts')}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SKILL_META.map((meta) => {
          const Icon = meta.icon;
          const stat = statFor(meta.key);
          const band = meta.key === 'writing' ? bestWriting : stat?.best_band ?? null;
          return (
            <Card key={meta.key} className="card-hover flex flex-col">
              <div className="flex items-center justify-between">
                <div
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${meta.accent}`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-[11px] text-slate-400">
                  {stat?.last_at ? formatDate(stat.last_at, i18n.language) : '—'}
                </span>
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
                  <p className={`text-3xl font-black ${bandColor(band)}`}>
                    {band != null ? band.toFixed(1) : '—'}
                  </p>
                </div>
                <Link to={`/practice/${meta.key}`} className="btn-secondary text-xs">
                  {t('home.practiceNow')}
                </Link>
              </div>
              <Progress band={band} />
            </Card>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat
          label={t('home.bestBand')}
          value={bestOverall != null ? bestOverall.toFixed(1) : '—'}
          hint={t('home.bestBandHint')}
        />
        <Stat
          label={t('home.writingFeedback')}
          value={data?.writing.length ?? 0}
          hint={bestWriting != null ? `${t('home.bestBand')}: ${bestWriting.toFixed(1)}` : undefined}
        />
        <Stat label={t('admin.joined')} value={formatDate(user?.createdAt, i18n.language)} />
      </div>

      <h2 className="mb-3 mt-8 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {t('home.recent')}
      </h2>
      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((index) => (
            <div key={index} className="card flex items-center gap-3 p-4">
              <div className="skeleton h-8 w-16" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-3 w-1/2" />
                <div className="skeleton h-2 w-1/4" />
              </div>
              <div className="skeleton h-6 w-10" />
            </div>
          ))}
        </div>
      ) : (data?.recent.length ?? 0) === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <Sparkles className="h-6 w-6 text-brand-500" />
          <p className="text-sm font-semibold text-slate-700">{t('home.noData')}</p>
          <Link to="/practice/reading" className="btn-primary mt-2 text-xs">
            {t('home.startPractice')}
          </Link>
        </Card>
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
