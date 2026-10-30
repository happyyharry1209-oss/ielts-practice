import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, BookOpen, Headphones, Mic, PenLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { bandColor, cn, formatDate, formatDateTime } from '../lib/utils';

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
  {
    key: 'reading',
    icon: BookOpen,
    accent: 'bg-[#e0e8df] text-[#466e56] dark:bg-sage/20 dark:text-sage',
  },
  {
    key: 'listening',
    icon: Headphones,
    accent: 'bg-[#dfe9ee] text-[#4d7892] dark:bg-sky-900/40 dark:text-sky-300',
  },
  {
    key: 'writing',
    icon: PenLine,
    accent: 'bg-[#efe3cc] text-[#946221] dark:bg-amber-900/40 dark:text-amber-300',
  },
  {
    key: 'speaking',
    icon: Mic,
    accent: 'bg-[#ecdcd5] text-[#a55441] dark:bg-rose-900/40 dark:text-rose-300',
  },
] as const;

function skillKey(skill: string): string {
  return `${skill.charAt(0).toUpperCase()}${skill.slice(1)}`;
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
  const headlineBand = Math.max(bestOverall ?? 0, bestWriting ?? 0) || null;

  return (
    <div>
      <section className="grid gap-8 pb-9 lg:grid-cols-[1.35fr_0.65fr] lg:gap-16 lg:pb-12">
        <div>
          <h1 className="editorial-title max-w-3xl">
            <span className="block">{t('home.headlineLead')}</span>
            <span className="block whitespace-nowrap">
              <em className="text-brand-600">{t('home.headlineAccent')}</em>
              {t('home.headlineTail')}
            </span>
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-600">{t('home.subtitle')}</p>
          <div className="mt-7 flex flex-wrap items-center gap-5">
            <Link to="/practice/reading" className="btn-primary gap-6 px-5">
              {t('home.startPractice')}
              <ArrowUpRight className="h-4 w-4" />
            </Link>
            <button
              type="button"
              className="border-b border-ink pb-1 text-xs font-semibold text-ink"
              onClick={() => document.getElementById('recent')?.scrollIntoView({ behavior: 'smooth' })}
            >
              {t('home.viewWeek')}
            </button>
            {isAdmin ? (
              <Link to="/admin" className="text-xs font-semibold text-slate-500 hover:text-ink">
                {t('home.adminPanel')}
              </Link>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto] items-end border-t border-line pt-5 lg:border-l lg:border-t-0 lg:py-5 lg:pl-10">
          <div>
            <p className="eyebrow">{t('home.bestBand')}</p>
            <p className="mt-3 font-serif text-[64px] font-medium leading-[0.85] tracking-[-0.05em] text-ink">
              {headlineBand != null ? headlineBand.toFixed(1) : '—'}
              <span className="ml-1 font-sans text-lg text-slate-500">/9</span>
            </p>
          </div>
          <p className="max-w-[145px] text-right font-serif text-xs leading-5 text-slate-500 lg:text-left">
            {t('home.bestBandHint')}
          </p>
        </div>
      </section>

      <section className="grid grid-cols-3 border-y border-line">
        {[
          [data?.activity.weekAttempts ?? 0, t('home.weekAttempts')],
          [data?.activity.activeDays30 ?? 0, t('home.activeDays')],
          [totalAttempts, t('home.attempts')],
        ].map(([value, label], index) => (
          <div
            key={String(label)}
            className={cn('flex items-baseline gap-3 py-4', index > 0 && 'border-l border-line pl-4 sm:pl-8')}
          >
            <b className="font-serif text-2xl font-medium text-ink sm:text-[28px]">{value}</b>
            <span className="text-[10px] leading-4 text-slate-500">{label}</span>
          </div>
        ))}
      </section>

      <div className="mb-2 mt-9 flex items-end justify-between">
        <h2 className="section-title">{t('home.chooseSkill')}</h2>
        <span className="hidden text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-400 sm:block">
          {t('home.fourSkills')}
        </span>
      </div>

      <section className="border-t border-ink">
        {SKILL_META.map((meta, index) => {
          const Icon = meta.icon;
          const stat = statFor(meta.key);
          const band = meta.key === 'writing' ? bestWriting : stat?.best_band ?? null;
          const pct = band == null ? 0 : Math.min(100, (band / 9) * 100);

          return (
            <div key={meta.key} className="skill-row">
              <span className="font-serif text-[10px] text-brand-600">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="flex min-w-0 items-center gap-3">
                <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full', meta.accent)}>
                  <Icon className="h-4 w-4" strokeWidth={1.7} />
                </span>
                <div className="min-w-0">
                  <h3 className="font-serif text-xl font-semibold text-ink sm:text-[23px]">
                    {t(`home.skill${skillKey(meta.key)}`)}
                  </h3>
                  <span className={cn('mt-1 block font-serif text-lg sm:hidden', bandColor(band))}>
                    {band != null ? band.toFixed(1) : '—'}
                  </span>
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-xs leading-5 text-slate-500">{t(`home.${meta.key}Desc`)}</p>
                <div className="track">
                  <span style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="hidden sm:block">
                <small className="block text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  {t('home.bestBand')}
                </small>
                <b className={cn('font-serif text-2xl font-medium', bandColor(band))}>
                  {band != null ? band.toFixed(1) : '—'}
                </b>
              </div>
              <Link
                to={`/practice/${meta.key}`}
                className="flex items-center justify-between border-b border-ink pb-2 text-[10px] font-semibold text-ink"
              >
                {t('home.practiceNow')}
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          );
        })}
      </section>

      <div className="mt-11 grid gap-10 lg:grid-cols-[1.35fr_0.65fr] lg:gap-14" id="recent">
        <section>
          <div className="mb-3 flex items-end justify-between">
            <h2 className="section-title">{t('home.recent')}</h2>
            <span className="text-[9px] uppercase tracking-[0.13em] text-slate-400">
              {t('home.recentHint')}
            </span>
          </div>
          {isLoading ? (
            <div className="space-y-3 border-t border-ink pt-4">
              {[0, 1, 2].map((index) => (
                <div key={index} className="skeleton h-12 w-full" />
              ))}
            </div>
          ) : (data?.recent.length ?? 0) === 0 ? (
            <div className="border-y border-line py-10 text-center">
              <p className="font-serif text-xl text-ink">{t('home.noData')}</p>
              <Link to="/practice/reading" className="btn-primary mt-5 text-xs">
                {t('home.startPractice')}
              </Link>
            </div>
          ) : (
            <div className="border-t border-ink">
              {data?.recent.map((attempt) => (
                <Link
                  key={attempt.id}
                  to={`/result/${attempt.id}`}
                  className="grid grid-cols-[48px_minmax(0,1fr)_52px] items-center gap-3 border-b border-line py-3.5 transition hover:bg-surface/60"
                >
                  <span className="font-serif text-[9px] uppercase text-brand-600">
                    {attempt.skill.slice(0, 4)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-ink">{attempt.title}</p>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      {formatDateTime(attempt.submitted_at, i18n.language)} ·{' '}
                      {attempt.mode === 'mock' ? t('exam.mockMode') : t('exam.practiceMode')}
                    </p>
                  </div>
                  <p className={cn('text-right font-serif text-xl', bandColor(attempt.band))}>
                    {attempt.band != null ? attempt.band.toFixed(1) : '—'}
                  </p>
                </Link>
              ))}
            </div>
          )}

          {(data?.writing.length ?? 0) > 0 ? (
            <div className="mt-7">
              <h3 className="mb-3 font-serif text-xl font-semibold text-ink">
                {t('home.writingFeedback')}
              </h3>
              <div className="border-t border-line">
                {data?.writing.map((entry) => (
                  <div
                    key={entry.id}
                    className="grid grid-cols-[60px_minmax(0,1fr)_44px] items-center gap-3 border-b border-line py-3"
                  >
                    <span className="text-[9px] font-semibold uppercase text-slate-500">
                      {entry.task_id}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-ink">{entry.title}</p>
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        {formatDate(entry.created_at, i18n.language)} · {entry.word_count}{' '}
                        {t('common.words')}
                      </p>
                    </div>
                    <p className={cn('text-right font-serif text-xl', bandColor(entry.ai_band))}>
                      {entry.ai_band != null ? entry.ai_band.toFixed(1) : '—'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <aside className="self-start bg-ink p-6 text-paper sm:p-8">
          <p className="font-serif text-xs uppercase tracking-[0.13em] text-paper/60">
            {t('home.noteLabel')}
          </p>
          <p className="mt-4 font-serif text-xl leading-[1.45] sm:text-[24px]">{t('home.note')}</p>
          <p className="mt-7 text-[9px] font-semibold uppercase tracking-[0.14em] text-paper/45">
            {t('home.noteSignature')}
          </p>
        </aside>
      </div>
    </div>
  );
}
