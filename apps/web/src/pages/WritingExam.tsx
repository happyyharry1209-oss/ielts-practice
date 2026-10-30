import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';
import type { WritingTest } from '@ielts/shared';
import { TimerPill } from '../components/ExamShell';
import { Markdown } from '../components/Markdown';
import { Badge, Spinner } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { useExamTimer } from '../lib/useExam';
import { bandColor, cn, formatClock, assetUrl } from '../lib/utils';

interface Criterion {
  key: string;
  label: string;
  band: number;
  comment: string;
}

interface Feedback {
  source: 'ai' | 'heuristic';
  estimated: boolean;
  overall: number;
  criteria: Criterion[];
  summary: string;
  strengths: string[];
  improvements: string[];
  errors: { sentence: string; issue: string; suggestion: string }[];
  vocabulary: { original: string; better: string; why: string }[];
  wordCount: number;
  notes?: string;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export default function WritingExam() {
  const { t } = useTranslation();
  const { testId } = useParams<{ testId: string }>();
  const [params] = useSearchParams();
  const mode = params.get('mode') === 'mock' ? 'mock' : 'practice';

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: ['content', 'writing', testId],
    queryFn: () => api<{ test: WritingTest }>(`/api/content/writing/${testId}`),
    enabled: Boolean(testId),
  });

  const test = data?.test;
  const [taskIndex, setTaskIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSample, setShowSample] = useState(false);
  const [savedLabel, setSavedLabel] = useState(false);
  const savedTimer = useRef<number | null>(null);

  const timer = useExamTimer(test?.durationSec ?? 3600, mode, Boolean(test) && !submitting);
  const task = test?.tasks[taskIndex];

  const draft = useMemo(() => {
    if (!test || !task) return '';
    if (drafts[task.id] !== undefined) return drafts[task.id]!;
    try {
      return localStorage.getItem(`ielts.draft.${test.id}.${task.id}`) ?? '';
    } catch {
      return '';
    }
  }, [drafts, test, task]);

  useEffect(() => {
    if (!test || !task) return;
    const id = window.setTimeout(() => {
      try {
        localStorage.setItem(`ielts.draft.${test.id}.${task.id}`, draft);
        setSavedLabel(true);
        if (savedTimer.current) window.clearTimeout(savedTimer.current);
        savedTimer.current = window.setTimeout(() => setSavedLabel(false), 1500);
      } catch {
        /* ignore */
      }
    }, 600);
    return () => window.clearTimeout(id);
  }, [draft, test, task]);

  useEffect(() => {
    setFeedback(null);
    setShowSample(false);
  }, [taskIndex]);

  const words = countWords(draft);

  const submit = async () => {
    if (!test || !task) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await api<{ feedback: Feedback }>('/api/writing/submit', {
        method: 'POST',
        json: { contentId: test.id, taskId: task.id, text: draft },
      });
      setFeedback(response.feedback);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) return <Spinner label={t('common.loading')} />;
  if (loadError || !test || !task) {
    return <div className="p-10 text-center text-sm text-rose-600">{errorMessage(loadError)}</div>;
  }

  return (
    <div className="exam-surface min-h-screen">
      <header className="sticky top-0 z-30 border-b border-paper/15 bg-ink text-paper shadow-sm">
        <div className="mx-auto flex min-h-[70px] max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-serif text-base font-semibold text-paper">{test.title}</p>
            <p className="text-[11px] text-paper/55">
              {task.suggestedMinutes} {t('common.min')} · {t('writing.minWords', { count: task.minWords })}
            </p>
          </div>
          <span
            className={cn(
              'rounded-sm px-3 py-1.5 text-xs font-semibold tabular-nums',
              words >= task.minWords ? 'bg-emerald-50 text-emerald-700' : 'bg-paper/10 text-paper/75',
            )}
          >
            {t('writing.wordCount', { count: words })}
          </span>
          <TimerPill remaining={timer.remaining} mode={mode} />
          <button
            type="button"
            className="btn bg-brand-600 text-white hover:bg-brand-500"
            onClick={() => void submit()}
            disabled={submitting || words < 30}
          >
            {submitting ? t('writing.submitting') : t('writing.submit')}
          </button>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:py-8">
        <div className="space-y-4">
          <div className="flex gap-2">
            {test.tasks.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTaskIndex(index)}
                className={cn(
                  'min-h-10 rounded-sm px-3 py-1.5 text-xs font-semibold transition',
                  index === taskIndex
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50',
                )}
              >
                {t(`writing.task${item.task}`)}
              </button>
            ))}
          </div>

          <div className="card border-t-2 border-t-amber-500 p-5 sm:p-7">
            <Badge tone="amber">{t(`writing.task${task.task}`)}</Badge>
            <p className="mt-3 text-xs text-slate-500">
              {task.task === 1 ? t('writing.taskIntro1') : t('writing.taskIntro2')}
            </p>
            <div className="mt-4 border-t border-line pt-4">
              <Markdown text={task.prompt} />
            </div>
            {task.imageUrl ? (
              <img
                src={assetUrl(task.imageUrl)}
                alt={t('writing.prompt')}
                className="mt-4 w-full rounded-xl border border-slate-200"
              />
            ) : null}
          </div>

          <div className="card p-5 text-xs leading-5 text-slate-500">
            <p className="font-semibold text-slate-700">{t('writing.feedback')}</p>
            <p className="mt-1">{t('writing.aiDisclaimer')}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card border-t-2 border-t-brand-600 p-4 sm:p-5">
            <textarea
              value={draft}
              onChange={(event) =>
                setDrafts((previous) => ({ ...previous, [task.id]: event.target.value }))
              }
              placeholder={t('writing.startTyping')}
              className="min-h-[420px] w-full resize-y rounded-sm border border-line bg-surface p-4 font-serif text-[16px] leading-7 text-ink outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              spellCheck
            />
            <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
              <span>{savedLabel ? t('writing.draftSaved') : t('common.saved')}</span>
              <span>{formatClock(timer.elapsed)}</span>
            </div>
          </div>

          {error ? (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          ) : null}

          {feedback ? (
            <div className="card space-y-5 border-t-2 border-t-brand-600 p-5 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t('writing.overallBand')}
                  </p>
                  <p className={`font-serif text-4xl font-medium ${bandColor(feedback.overall)}`}>
                    {feedback.overall.toFixed(1)}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {feedback.source === 'ai' ? t('writing.aiDisclaimer') : t('writing.offlineDisclaimer')}
                  </p>
                </div>
                <Badge tone={feedback.source === 'ai' ? 'brand' : 'slate'}>
                  {feedback.source === 'ai' ? 'AI' : 'Offline'}
                </Badge>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {feedback.criteria.map((criterion) => (
                  <div key={criterion.key} className="rounded-xl bg-slate-50 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-600">{criterion.label}</p>
                      <p className={`text-sm font-bold ${bandColor(criterion.band)}`}>
                        {criterion.band.toFixed(1)}
                      </p>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{criterion.comment}</p>
                  </div>
                ))}
              </div>

              {feedback.summary ? (
                <p className="text-sm leading-6 text-slate-700">{feedback.summary}</p>
              ) : null}

              {feedback.strengths.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                    {t('writing.strengths')}
                  </p>
                  <ul className="mt-1 space-y-1 text-sm text-slate-700">
                    {feedback.strengths.map((item, index) => (
                      <li key={index}>• {item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {feedback.improvements.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">
                    {t('writing.improvements')}
                  </p>
                  <ul className="mt-1 space-y-1 text-sm text-slate-700">
                    {feedback.improvements.map((item, index) => (
                      <li key={index}>• {item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {feedback.errors.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">
                    {t('writing.errors')}
                  </p>
                  <div className="mt-2 space-y-2">
                    {feedback.errors.map((item, index) => (
                      <div key={index} className="rounded-sm bg-rose-50 p-3 text-sm">
                        <p className="text-slate-700">“{item.sentence}”</p>
                        <p className="mt-1 text-xs text-rose-700">{item.issue}</p>
                        <p className="mt-1 text-xs text-emerald-700">→ {item.suggestion}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {feedback.vocabulary.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                    {t('writing.vocabulary')}
                  </p>
                  <div className="mt-2 space-y-1 text-sm">
                    {feedback.vocabulary.map((item, index) => (
                      <p key={index} className="text-slate-700">
                        <span className="line-through decoration-rose-400">{item.original}</span>{' '}
                        → <span className="font-semibold text-emerald-700">{item.better}</span>{' '}
                        <span className="text-xs text-slate-400">({item.why})</span>
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}

              {feedback.notes ? (
                <p className="text-xs text-slate-400">{feedback.notes}</p>
              ) : null}

              {task.modelAnswer ? (
                <div className="border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    onClick={() => setShowSample((value) => !value)}
                  >
                    {showSample ? t('writing.hideSample') : t('writing.showSample')}
                  </button>
                  {showSample ? (
                    <div className="mt-3 rounded-xl bg-slate-50 p-4">
                      <Markdown text={task.modelAnswer} />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
