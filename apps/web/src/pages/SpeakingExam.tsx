import { useQuery } from '@tanstack/react-query';
import { Download, Mic, Square, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import type { SpeakingTest } from '@ielts/shared';
import { Badge, Spinner } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { deleteRecording, listRecordings, saveRecording } from '../lib/recordings';
import type { SavedRecording } from '../lib/recordings';
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
  const [saved, setSaved] = useState<SavedRecording[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const savedBlobRef = useRef<Blob | null>(null);

  const refreshSaved = useCallback(async () => {
    try {
      setSaved(await listRecordings());
    } catch {
      /* IndexedDB can be unavailable in private mode */
    }
  }, []);

  useEffect(() => {
    void refreshSaved();
  }, [refreshSaved]);

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteRecording(id).catch(() => undefined);
      await refreshSaved();
    },
    [refreshSaved],
  );

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
      startedAtRef.current = Date.now();
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

  // Persist the finished recording so it survives a refresh.
  useEffect(() => {
    if (!test || !recorder.blob) return;
    if (recorder.blob === savedBlobRef.current) return;
    savedBlobRef.current = recorder.blob;

    const startedAt = startedAtRef.current ?? Date.now();
    const durationSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const topic =
      part === 2
        ? (card?.topic ?? 'Part 2')
        : `${current?.topic ?? ''}: ${current?.question ?? ''}`;

    void saveRecording({
      contentId: test.id,
      part,
      topic,
      durationSec,
      mimeType: recorder.blob.type || 'audio/webm',
      blob: recorder.blob,
    })
      .then(() => refreshSaved())
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.blob]);

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
    <div className="exam-surface min-h-screen">
      <header className="border-b border-paper/15 bg-ink text-paper">
        <div className="mx-auto max-w-4xl px-4 py-5">
          <p className="eyebrow text-paper/50">{t('home.skillSpeaking')}</p>
          <h1 className="mt-2 font-serif text-3xl font-medium text-paper">{test.title}</h1>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-paper/55">{t('speaking.intro')}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {([1, 2, 3] as Part[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setPart(value)}
                className={cn(
                  'min-h-10 rounded-sm px-3 py-1.5 text-xs font-semibold transition',
                  part === value
                    ? 'bg-paper text-ink'
                    : 'bg-paper/10 text-paper/65 hover:bg-paper/15 hover:text-paper',
                )}
              >
                {t(`speaking.part${value}`)}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-5 px-4 py-6 lg:py-8">
        {part === 2 ? (
          <>
            <div className="card border-t-2 border-t-brand-600 p-5 sm:p-7">
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
              <h2 className="mt-3 font-serif text-2xl font-semibold text-ink">{card?.topic}</h2>
              <p className="mt-1 text-sm text-slate-600">{t('speaking.youShouldSay')}</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {card?.points.map((point) => (
                  <li key={point}>• {point}</li>
                ))}
              </ul>
              <p className="mt-2 text-sm text-slate-600">{card?.closing}</p>
            </div>

            <div className="card border-t-2 border-t-brand-600 p-5 sm:p-7">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={cn(
                    'rounded-sm px-3 py-1.5 text-xs font-bold tabular-nums',
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
                      startedAtRef.current = Date.now();
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
                    className="min-h-[120px] w-full rounded-sm border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
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
            <div className="card border-t-2 border-t-brand-600 p-5 sm:p-7">
              <div className="flex items-center justify-between">
                <Badge tone="rose">
                  {t('speaking.question', { number: index + 1 })} / {list.length}
                </Badge>
                <span className="text-xs text-slate-400">{current?.topic}</span>
              </div>
              <p className="mt-4 font-serif text-2xl font-medium leading-8 text-ink">
                {current?.question}
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                {!recorder.recording ? (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      startedAtRef.current = Date.now();
                      void recorder.start();
                    }}
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

        <section className="mt-6">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-serif text-2xl font-semibold text-ink">
              {t('speaking.savedTitle')}
            </h2>
            <span className="text-xs text-slate-400">{t('speaking.savedHint')}</span>
          </div>

          {saved.length === 0 ? (
            <p className="card p-4 text-sm text-slate-500">{t('speaking.savedEmpty')}</p>
          ) : (
            <div className="space-y-3">
              {saved.map((recording) => (
                <SavedItem key={recording.id} recording={recording} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function SavedItem({
  recording,
  onDelete,
}: {
  recording: SavedRecording;
  onDelete: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(recording.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [recording.blob]);

  const date = new Date(recording.createdAt).toLocaleString(
    i18n.language === 'zh-TW' ? 'zh-TW' : 'en-GB',
    { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
  );
  const extension = recording.mimeType.includes('mp4') ? 'm4a' : 'webm';

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="rose">Part {recording.part}</Badge>
        <span className="text-xs text-slate-400">{date}</span>
        <span className="text-xs text-slate-400">{formatClock(recording.durationSec)}</span>
      </div>
      <p className="mt-2 text-sm text-slate-700">{recording.topic}</p>
      {url ? <audio src={url} controls className="mt-2 w-full" /> : null}
      <div className="mt-2 flex flex-wrap gap-1">
        <a
          className="btn-ghost text-xs"
          href={url ?? '#'}
          download={`ielts-speaking-p${recording.part}-${recording.createdAt}.${extension}`}
        >
          <Download className="h-3.5 w-3.5" /> {t('speaking.download')}
        </a>
        <button type="button" className="btn-ghost text-xs" onClick={() => onDelete(recording.id)}>
          <Trash2 className="h-3.5 w-3.5" /> {t('speaking.deleteRecording')}
        </button>
      </div>
    </div>
  );
}
