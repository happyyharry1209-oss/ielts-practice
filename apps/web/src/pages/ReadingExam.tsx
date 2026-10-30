import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { ReadingTest } from '@ielts/shared';
import { ConfirmDialog, ExamShell, TimerPill } from '../components/ExamShell';
import { Markdown } from '../components/Markdown';
import { QuestionInput } from '../components/QuestionInput';
import { Spinner } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { useExamState, useExamTimer } from '../lib/useExam';
import { cn } from '../lib/utils';

export default function ReadingExam() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { testId } = useParams<{ testId: string }>();
  const [params] = useSearchParams();
  const mode = params.get('mode') === 'practice' ? 'practice' : 'mock';

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: ['content', 'reading', testId],
    queryFn: () => api<{ test: ReadingTest }>(`/api/content/reading/${testId}`),
    enabled: Boolean(testId),
  });

  const test = data?.test;
  const questions = useMemo(
    () => test?.passages.flatMap((passage) => passage.questions) ?? [],
    [test],
  );

  const exam = useExamState(test?.id ?? testId ?? '', questions);
  const [passageIndex, setPassageIndex] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const timer = useExamTimer(test?.durationSec ?? 3600, mode, Boolean(test) && !submitting);

  const submit = async () => {
    if (!test || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const created = await api<{ attemptId: string }>('/api/attempts', {
        method: 'POST',
        json: { skill: 'reading', contentId: test.id, mode },
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

  // Question id -> passage index, so sidebar jumps can switch passage first.
  const passageIndexFor = useMemo(() => {
    const map = new Map<string, number>();
    test?.passages.forEach((item, index) => {
      item.questions.forEach((question) => map.set(question.id, index));
    });
    return map;
  }, [test]);

  const [pendingScroll, setPendingScroll] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingScroll) return;
    const timer = window.setTimeout(() => {
      document
        .getElementById(`q-${pendingScroll}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setPendingScroll(null);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [pendingScroll, passageIndex]);

  if (isLoading) return <Spinner label={t('common.loading')} />;
  if (loadError || !test) {
    return <div className="p-10 text-center text-sm text-rose-600">{errorMessage(loadError)}</div>;
  }

  const passage = test.passages[passageIndex]!;

  const goToPassage = (index: number) => {
    const next = Math.max(0, Math.min(test.passages.length - 1, index));
    setPassageIndex(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const jumpTo = (questionId: string) => {
    const target = passageIndexFor.get(questionId);
    if (target === undefined) return;
    if (target === passageIndex) {
      document
        .getElementById(`q-${questionId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setPassageIndex(target);
    setPendingScroll(questionId);
  };

  return (
    <>
      <ExamShell
        title={test.title}
        subtitle={`${t('exam.passage', { number: passageIndex + 1 })} · ${passage.title}`}
        timer={<TimerPill remaining={timer.remaining} mode={mode} />}
        answered={exam.answeredCount}
        total={questions.length}
        onSubmit={() => setConfirmOpen(true)}
        submitLabel={t('exam.submitExam')}
        disabled={submitting}
        sidebar={
          <div className="card sticky top-24 border-t-2 border-t-brand-600 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t('exam.answered')} {exam.answeredCount}/{questions.length}
            </p>
            <div className="mt-3 grid grid-cols-5 gap-1.5">
              {questions.map((question) => {
                const answered = Boolean(
                  exam.answers[question.id] &&
                    (Array.isArray(exam.answers[question.id])
                      ? (exam.answers[question.id] as string[]).length > 0
                      : String(exam.answers[question.id]).trim()),
                );
                return (
                  <button
                    key={question.id}
                    type="button"
                    onClick={() => jumpTo(question.id)}
                    className={cn(
                      'flex h-8 items-center justify-center rounded-sm text-xs font-semibold transition',
                      answered
                        ? 'bg-brand-600 text-white'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                    )}
                  >
                    {question.number}
                  </button>
                );
              })}
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-400">{t('exam.practiceMode')}</p>
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap gap-2">
          {test.passages.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => goToPassage(index)}
              className={cn(
                'min-h-10 rounded-sm px-3 py-1.5 text-xs font-semibold transition',
                index === passageIndex
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50',
              )}
            >
              {t('exam.passage', { number: index + 1 })}
            </button>
          ))}
        </div>

        {error ? (
          <p className="mb-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="card p-5 lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:p-7">
            <p className="eyebrow mb-3">{t('exam.passage', { number: passageIndex + 1 })}</p>
            <h2 className="mb-4 font-serif text-2xl font-semibold text-ink">{passage.title}</h2>
            <div className="border-t border-line pt-4">
              <Markdown text={passage.body} />
            </div>
          </section>

          <section className="space-y-3">
            {passage.questions.map((question) => (
              <div key={question.id} id={`q-${question.id}`}>
                <QuestionInput
                  question={question}
                  value={exam.answers[question.id]}
                  onChange={(value) => exam.setAnswer(question.id, value)}
                  disabled={submitting}
                />
              </div>
            ))}

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                className="btn-secondary"
                disabled={passageIndex === 0}
                onClick={() => goToPassage(passageIndex - 1)}
              >
                ← {t('exam.previousPassage')}
              </button>
              {passageIndex < test.passages.length - 1 ? (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => goToPassage(passageIndex + 1)}
                >
                  {t('exam.nextPassage')} →
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setConfirmOpen(true)}
                >
                  {t('exam.submitExam')}
                </button>
              )}
            </div>
          </section>
        </div>
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
