import { useQuery } from '@tanstack/react-query';
import { Play } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { ListeningTest } from '@ielts/shared';
import { ConfirmDialog, ExamShell, TimerPill } from '../components/ExamShell';
import { QuestionInput } from '../components/QuestionInput';
import { Spinner } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { useExamState, useExamTimer } from '../lib/useExam';
import { assetUrl, cn } from '../lib/utils';

export default function ListeningExam() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { testId } = useParams<{ testId: string }>();
  const [params] = useSearchParams();
  const mode = params.get('mode') === 'practice' ? 'practice' : 'mock';

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: ['content', 'listening', testId],
    queryFn: () => api<{ test: ListeningTest }>(`/api/content/listening/${testId}`),
    enabled: Boolean(testId),
  });

  const test = data?.test;
  const questions = useMemo(
    () => test?.sections.flatMap((section) => section.questions) ?? [],
    [test],
  );

  const exam = useExamState(test?.id ?? testId ?? '', questions);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [played, setPlayed] = useState<Record<string, boolean>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const timer = useExamTimer(test?.durationSec ?? 1800, mode, Boolean(test) && !submitting);

  const submit = async () => {
    if (!test || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const created = await api<{ attemptId: string }>('/api/attempts', {
        method: 'POST',
        json: { skill: 'listening', contentId: test.id, mode },
      });
      await api(`/api/attempts/${created.attemptId}/submit`, {
        method: 'POST',
        json: { responses: exam.answers, durationSec: timer.elapsed },
      });
      navigate(`/result/${created.attemptId}`, { replace: true });
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

  if (isLoading) return <Spinner label={t('common.loading')} />;
  if (loadError || !test) {
    return <div className="p-10 text-center text-sm text-rose-600">{errorMessage(loadError)}</div>;
  }

  const section = test.sections[sectionIndex]!;
  const alreadyPlayed = Boolean(played[section.id]);

  const startPlayback = async () => {
    const element = audioRef.current;
    if (!element) return;
    element.currentTime = 0;
    try {
      await element.play();
    } catch {
      setError('The audio file could not be played.');
    }
  };

  return (
    <>
      <ExamShell
        title={test.title}
        subtitle={`${t('exam.section', { number: sectionIndex + 1 })} · ${section.title}`}
        timer={<TimerPill remaining={timer.remaining} mode={mode} />}
        answered={exam.answeredCount}
        total={questions.length}
        onSubmit={() => setConfirmOpen(true)}
        submitLabel={t('exam.submitExam')}
        disabled={submitting}
        sidebar={
          <div className="card sticky top-24 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('exam.answered')} {exam.answeredCount}/{questions.length}
            </p>
            <div className="mt-3 space-y-2">
              {test.sections.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSectionIndex(index)}
                  className={cn(
                    'w-full rounded-lg px-3 py-2 text-left text-xs font-medium transition',
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
              onClick={() => setSectionIndex(index)}
              className={cn(
                'rounded-xl px-3 py-1.5 text-sm font-medium transition',
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

        <section className="card mb-5 p-5">
          <h2 className="text-base font-semibold text-slate-900">{section.title}</h2>
          <p className="mt-1 text-xs text-slate-500">{t('exam.listeningTip')}</p>

          <div className="mt-4">
            <audio
              key={section.id}
              ref={audioRef}
              src={assetUrl(section.audioUrl)}
              controls={mode === 'practice'}
              hidden={mode === 'mock'}
              preload="auto"
              onEnded={() => setPlayed((previous) => ({ ...previous, [section.id]: true }))}
              className="w-full"
            />
            {mode === 'mock' ? (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void startPlayback()}
                  disabled={alreadyPlayed || submitting}
                >
                  <Play className="h-4 w-4" />
                  {alreadyPlayed ? t('exam.onePlay') : t('exam.onePlay')}
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
              disabled={submitting}
            />
          ))}
        </section>
      </ExamShell>

      <ConfirmDialog
        open={confirmOpen}
        title={t('exam.submitConfirm')}
        body={t('exam.submitConfirmBody', {
          answered: exam.answeredCount,
          total: questions.length,
        })}
        confirmLabel={t('exam.submitExam')}
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
