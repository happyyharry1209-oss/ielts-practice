import { useQuery } from '@tanstack/react-query';
import { Mic, Square, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import type { SpeakingTest } from '@ielts/shared';
import { Badge, Spinner } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { useRecorder } from '../lib/useExam';
import { cn, formatClock } from '../lib/utils';

type Part = 1 | 2 | 3;
type Phase = 'idle' | 'prep' | 'speak' | 'done';

export default function SpeakingExam() {
  const { t } = useTranslation();
  const { testId } = useParams<{ testId: string }>();
  const { data, isLoading, error: loadError } = useQuery({
    queryKey: ['content', 'speaking', testId],
    queryFn: () => api<{ test: SpeakingTest }>(`/api/content/speaking/${testId}`),
    enabled: Boolean(testId),
  });

  const test = data?.test;
  const [part, setPart] = useState<Part>(1);
  const [index, setIndex] = useState(0);
  const [cardIndex, setCardIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [seconds, setSeconds] = useState(0);
  const [notes, setNotes] = useState('');
  const recorder = useRecorder();

  const part1 = useMemo(
    () =>
      (test?.part1 ?? []).flatMap((topic, topicIndex) =>
        topic.questions.map((question, questionIndex) => ({
          key: `p1-${topicIndex}-${questionIndex}`,
          topic: topic.topic,
          question,
        })),
      ),
    [test],
  );
  const part3 = useMemo(
    () =>
      (test?.part3 ?? []).flatMap((topic, topicIndex) =>
        topic.questions.map((question, questionIndex) => ({
          key: `p3-${topicIndex}-${questionIndex}`,
          topic: topic.topic,
          question,
        })),
      ),
    [test],
  );

  const card = test?.part2[cardIndex];

  useEffect(() => {
    if (phase !== 'prep' && phase !== 'speak') return;
    const id = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (!test || !card) return;
    if (phase === 'prep' && seconds >= 60) {
      setSeconds(0);
      setPhase('speak');
      void recorder.start();
    } else if (phase === 'speak' && seconds >= 120) {
      recorder.stop();
      setPhase('done');
      void api('/api/speaking/recordings', {
        method: 'POST',
        json: { contentId: test.id, part: 2, prompt: card.topic, durationSec: 120 },
      }).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, seconds]);

  useEffect(() => {
    setIndex(0);
    setPhase('idle');
    setSeconds(0);
    recorder.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part]);

  if (isLoading) return <Spinner label={t('common.loading')} />;
  if (loadError || !test) {
    return <div className="p-10 text-center text-sm text-rose-600">{errorMessage(loadError)}</div>;
  }

  const list = part === 1 ? part1 : part3;
  const current = list[Math.min(index, Math.max(list.length - 1, 0))];

  const recorderError =
    recorder.error === 'denied'
      ? t('speaking.micDenied')
      : recorder.error === 'unsupported'
        ? t('speaking.micUnsupported')
        : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-4">
          <h1 className="text-lg font-bold text-slate-900">{test.title}</h1>
          <p className="mt-1 text-xs text-slate-500">{t('speaking.intro')}</p>
          <div className="mt-4 flex gap-2">
            {([1, 2, 3] as Part[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setPart(value)}
                className={cn(
                  'rounded-xl px-3 py-1.5 text-sm font-medium transition',
                  part === value
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                )}
              >
                {t(`speaking.part${value}`)}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        {part === 2 ? (
          <>
            <div className="card p-5">
              <div className="flex items-center justify-between">
                <Badge tone="rose">{t('speaking.cueCard')}</Badge>
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  onClick={() => {
                    setCardIndex((value) => (value + 1) % test.part2.length);
                    setPhase('idle');
                    setSeconds(0);
                    recorder.clear();
                    setNotes('');
                  }}
                >
                  {t('speaking.newCard')}
                </button>
              </div>
              <h2 className="mt-3 text-lg font-bold text-slate-900">{card?.topic}</h2>
              <p className="mt-1 text-sm text-slate-600">{t('speaking.youShouldSay')}</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {card?.points.map((point) => (
                  <li key={point}>• {point}</li>
                ))}
              </ul>
              <p className="mt-2 text-sm text-slate-600">{card?.closing}</p>
            </div>

            <div className="card p-5">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={cn(
                    'rounded-xl px-3 py-1.5 text-sm font-bold tabular-nums',
                    phase === 'speak' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700',
                  )}
                >
                  {phase === 'prep'
                    ? `${t('speaking.preparationTime')} ${formatClock(Math.max(0, 60 - seconds))}`
                    : phase === 'speak'
                      ? `${t('speaking.speakingTime')} ${formatClock(Math.max(0, 120 - seconds))}`
                      : t('speaking.preparationTime')}
                </span>

                {phase === 'idle' || phase === 'done' ? (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      setPhase('prep');
                      setSeconds(0);
                    }}
                  >
                    {t('speaking.prepare')}
                  </button>
                ) : null}

                {phase === 'prep' ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setPhase('speak');
                      setSeconds(0);
                      void recorder.start();
                    }}
                  >
                    {t('speaking.startRecording')}
                  </button>
                ) : null}

                {phase === 'speak' ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      recorder.stop();
                      setPhase('done');
                    }}
                  >
                    <Square className="h-4 w-4" /> {t('speaking.stopRecording')}
                  </button>
                ) : null}
              </div>

              {recorderError ? (
                <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {recorderError}
                </p>
              ) : null}

              {phase === 'prep' ? (
                <div className="mt-4">
                  <label className="label" htmlFor="notes">
                    {t('speaking.notes')}
                  </label>
                  <textarea
                    id="notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className="min-h-[120px] w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />
                </div>
              ) : null}

              {recorder.url ? (
                <div className="mt-4">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t('speaking.playback')}
                  </p>
                  <audio src={recorder.url} controls className="w-full" />
                  <button
                    type="button"
                    className="btn-ghost mt-1 text-xs"
                    onClick={() => recorder.clear()}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> {t('speaking.deleteRecording')}
                  </button>
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <div className="card p-5">
              <div className="flex items-center justify-between">
                <Badge tone="rose">
                  {t('speaking.question', { number: index + 1 })} / {list.length}
                </Badge>
                <span className="text-xs text-slate-400">{current?.topic}</span>
              </div>
              <p className="mt-4 text-lg font-semibold leading-7 text-slate-900">
                {current?.question}
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                {!recorder.recording ? (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void recorder.start()}
                  >
                    <Mic className="h-4 w-4" /> {t('speaking.startRecording')}
                  </button>
                ) : (
                  <button type="button" className="btn-secondary" onClick={recorder.stop}>
                    <Square className="h-4 w-4" /> {t('speaking.stopRecording')}
                  </button>
                )}
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    recorder.stop();
                    recorder.clear();
                    setIndex((value) => Math.min(value + 1, list.length - 1));
                  }}
                >
                  {t('speaking.next')}
                </button>
              </div>

              {recorderError ? (
                <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {recorderError}
                </p>
              ) : null}

              {recorder.url ? (
                <audio src={recorder.url} controls className="mt-4 w-full" />
              ) : null}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
