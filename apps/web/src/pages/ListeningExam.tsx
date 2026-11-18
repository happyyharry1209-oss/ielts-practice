import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Play } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { ListeningTest } from '@ielts/shared';
import { ConfirmDialog, ExamBackLink, ExamLoadState, ExamShell, TimerPill } from '../components/ExamShell';
import { QuestionInput } from '../components/QuestionInput';
import { api, errorMessage } from '../lib/api';
import { useExamState, useExamTimer } from '../lib/useExam';
import { assetUrl, cn } from '../lib/utils';
import type { MockStage } from '../lib/mock';

export default function ListeningExam({ mock }: { mock?: MockStage<ListeningTest> } = {}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { testId } = useParams<{ testId: string }>();
  const [params] = useSearchParams();
  const mode = !mock && params.get('mode') === 'practice' ? 'practice' : 'mock';

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: ['content', 'listening', testId],
    queryFn: () => api<{ test: ListeningTest }>(`/api/content/listening/${testId}`),
    enabled: Boolean(testId) && !mock,
  });

  const test = mock?.test ?? data?.test;
  const questions = useMemo(
    () => test?.sections.flatMap((section) => section.questions) ?? [],
    [test],
  );

  const exam = useExamState(mock ? `mock.${mock.id}.listening` : test?.id ?? testId ?? '', questions);
  const [sectionIndex, setSectionIndex] = useState(0);
  const playedKey = mock ? `ielts.mock.played.${mock.id}` : null;
  const [played, setPlayed] = useState<Record<string, boolean>>(() => {
    if (!playedKey) return {};
    try {
      return JSON.parse(localStorage.getItem(playedKey) ?? '{}') ?? {};
    } catch {
      return {};
    }
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const leftExam = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playbackPending = useRef(false);

  const timer = useExamTimer(test?.durationSec ?? 1800, mode, Boolean(test) && !submitting, mock?.deadline);
  const submitLabel = t(mock ? 'mock.finishSection' : 'exam.submitExam');

  function markPlayed(id: string) {
    const next = { ...played, [id]: true };
    setPlayed(next);
    if (playedKey) {
      try {
        localStorage.setItem(playedKey, JSON.stringify(next));
      } catch {
        /* Browser storage may be unavailable. */
      }
    }
  }

  const submit = async () => {
    if (!test || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      if (mock) {
        await mock.finish({ responses: exam.answers });
        return;
      }
      const created = await api<{ attemptId: string }>('/api/attempts', {
        method: 'POST',
        json: { skill: 'listening', contentId: test.id, mode },
      });
      await api(`/api/attempts/${created.attemptId}/submit`, {
        method: 'POST',
        json: { responses: exam.answers, durationSec: timer.elapsed },
      });
      void queryClient.invalidateQueries({ queryKey: ['stats'] });
      void queryClient.invalidateQueries({ queryKey: ['review'] });
      if (!leftExam.current) navigate(`/result/${created.attemptId}`, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (timer.expired) void submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer.expired]);

  if (isLoading) return <ExamLoadState skill="listening" />;
  if (loadError || !test) {
    return <ExamLoadState skill="listening" error={errorMessage(loadError)} />;
  }

  const section = test.sections[sectionIndex]!;
  const alreadyPlayed = Boolean(played[section.id]);

  const goToSection = (index: number) => {
    const next = Math.max(0, Math.min(test.sections.length - 1, index));
    setSectionIndex(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const startPlayback = async () => {
    const element = audioRef.current;
    if (!element || playbackPending.current || alreadyPlayed) return;
    playbackPending.current = true;
    element.currentTime = 0;
    try {
      await element.play();
      if (mock) markPlayed(section.id);
    } catch {
      setError(t('exam.audioError'));
    } finally {
      playbackPending.current = false;
    }
  };

  return (
    <>
      <ExamShell
        back={
          <ExamBackLink
            skill="listening"
            mock={Boolean(mock)}
            confirmMessage={mock ? t('mock.leave') : exam.answeredCount > 0 && !submitting ? t('exam.leaveUnsubmitted') : undefined}
            onLeave={() => { leftExam.current = true; }}
          />
        }
        title={test.title}
        subtitle={`${t('exam.section', { number: sectionIndex + 1 })} · ${section.title}`}
        timer={<TimerPill remaining={timer.remaining} mode={mode} />}
        answered={exam.answeredCount}
        total={questions.length}
        onSubmit={() => setConfirmOpen(true)}
        submitLabel={submitLabel}
        disabled={submitting}
        sidebar={
          <div className="card sticky top-24 border-t-2 border-t-sky-500 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('exam.answered')} {exam.answeredCount}/{questions.length}
            </p>
            <div className="mt-3 space-y-2">
              {test.sections.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => goToSection(index)}
                  className={cn(
                    'min-h-11 w-full rounded-sm px-3 py-2 text-left text-xs font-medium transition',
                    index === sectionIndex
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  )}
                >
                  {t('exam.section', { number: index + 1 })}
                  <span className="block truncate text-[11px] font-normal opacity-70">
                    {item.title}
                  </span>
                </button>
              ))}
            </div>
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap gap-2">
          {test.sections.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => goToSection(index)}
              className={cn(
                'min-h-10 rounded-sm px-3 py-1.5 text-xs font-semibold transition',
                index === sectionIndex
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50',
              )}
            >
              {t('exam.section', { number: index + 1 })}
            </button>
          ))}
        </div>

        {error ? (
          <p className="mb-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        ) : null}

        <section className="card mb-5 border-t-2 border-t-sky-500 p-5 sm:p-7">
          <p className="eyebrow">{t('exam.section', { number: sectionIndex + 1 })}</p>
          <h2 className="mt-2 font-serif text-2xl font-semibold text-ink">{section.title}</h2>
          <p className="mt-1 text-xs text-slate-500">{t('exam.listeningTip')}</p>

          <div className="mt-5 border border-line bg-paper/60 p-4 dark:bg-black/10">
            <audio
              key={section.id}
              ref={audioRef}
              src={assetUrl(section.audioUrl)}
              controls={mode === 'practice'}
              hidden={mode === 'mock'}
              preload="auto"
              onEnded={() => { if (!mock) markPlayed(section.id); }}
              className="w-full"
            />
            {mode === 'mock' ? (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void startPlayback()}
                  disabled={alreadyPlayed || submitting || Boolean(mock && timer.expired)}
                >
                  <Play className="h-4 w-4" />
                  {alreadyPlayed ? t('exam.playedOnce') : t('exam.onePlay')}
                </button>
                <span className="text-xs text-slate-500">{t('exam.audioHint')}</span>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">{t('exam.practiceMode')}</p>
            )}
          </div>
        </section>

        <section className="space-y-3">
          {section.questions.map((question) => (
            <QuestionInput
              key={question.id}
              question={question}
              value={exam.answers[question.id]}
              onChange={(value) => exam.setAnswer(question.id, value)}
              disabled={submitting || Boolean(mock && timer.expired)}
            />
          ))}

          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={sectionIndex === 0}
              onClick={() => goToSection(sectionIndex - 1)}
            >
              ← {t('exam.previousSection')}
            </button>
            {sectionIndex < test.sections.length - 1 ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => goToSection(sectionIndex + 1)}
              >
                {t('exam.nextSection')} →
              </button>
            ) : (
              <button type="button" className="btn-primary" onClick={() => setConfirmOpen(true)}>
                {submitLabel}
              </button>
            )}
          </div>
        </section>
      </ExamShell>

      <ConfirmDialog
        open={confirmOpen}
        title={t('exam.submitConfirm')}
        body={t('exam.submitConfirmBody', {
          answered: exam.answeredCount,
          total: questions.length,
        })}
        confirmLabel={submitLabel}
        cancelLabel={t('common.cancel')}
        onConfirm={() => {
          setConfirmOpen(false);
          void submit();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
