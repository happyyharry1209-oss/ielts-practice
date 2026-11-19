import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Mic, Square, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';
import type { SpeakingTest } from '@ielts/shared';
import { ExamBackLink, ExamLoadState, TimerPill } from '../components/ExamShell';
import { SpeakingFeedbackPanel } from '../components/SpeakingFeedbackPanel';
import { MicrophoneCheck } from '../components/MicrophoneCheck';
import { Badge } from '../components/ui';
import { api, errorMessage, getToken } from '../lib/api';
import { useAuth } from '../lib/auth';
import { deleteRecording, listRecordings, saveRecording, syncSpeakingRecording } from '../lib/recordings';
import type { SavedRecording } from '../lib/recordings';
import { useExamTimer, useRecorder } from '../lib/useExam';
import type { MicrophoneInput } from '../lib/useExam';
import type { MockStage } from '../lib/mock';
import { cn, formatClock } from '../lib/utils';

type Part = 1 | 2 | 3;
type Phase = 'idle' | 'prep' | 'speak' | 'done';

export default function SpeakingExam({ mock, microphone }: { mock?: MockStage<SpeakingTest>; microphone?: MicrophoneInput } = {}) {
  const { testId } = useParams<{ testId: string }>();
  const [params] = useSearchParams();
  return <SpeakingPaper key={mock?.id ?? `${testId}:${params.get('mode')}`} mock={mock} testId={testId} microphone={microphone} />;
}

function SpeakingPaper({ mock, testId, microphone }: { mock?: MockStage<SpeakingTest>; testId?: string; microphone?: MicrophoneInput }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isFullMock = Boolean(mock);
  const [params] = useSearchParams();
  const mode = mock || params.get('mode') === 'mock' ? 'mock' : 'practice';
  const { data, isLoading, error: loadError } = useQuery({
    queryKey: ['content', 'speaking', testId],
    queryFn: () => api<{ test: SpeakingTest }>(`/api/content/speaking/${testId}`),
    enabled: Boolean(testId) && !mock,
  });
  const { data: feedbackStatus } = useQuery({
    queryKey: ['speaking', 'feedback-status'],
    queryFn: () => api<{ provider: 'groq' | null }>('/api/speaking/status'),
    enabled: !mock,
  });

  const test = mock?.test ?? data?.test;
  const [part, setPart] = useState<Part>(1);
  const [index, setIndex] = useState(0);
  const [cardIndex, setCardIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [seconds, setSeconds] = useState(0);
  const [notes, setNotes] = useState('');
  const recorder = useRecorder();
  const [saved, setSaved] = useState<SavedRecording[]>([]);
  const [answer, setAnswer] = useState<SavedRecording | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [finishRequested, setFinishRequested] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [checkedMic, setCheckedMic] = useState<MicrophoneInput | null>(microphone ?? null);
  const [checkAgain, setCheckAgain] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const running = isFullMock || startedAt !== null;
  const [finished, setFinished] = useState(false);
  const duration = test?.durationSec ?? 840;
  const timer = useExamTimer(duration, mode, running && !finished && !finishing,
    mock?.deadline ?? (mode === 'mock' && startedAt !== null ? startedAt + duration * 1000 : undefined));
  const startedAtRef = useRef<number | null>(null);
  const savedBlobRef = useRef<Blob | null>(null);
  const savingRef = useRef<Promise<void>>(Promise.resolve());

  const refreshSaved = useCallback(async () => {
    if (mock?.id) return;
    try {
      setSaved((await listRecordings()).filter((recording) =>
        !recording.mockId && recording.contentId === testId && recording.userId === user?.id,
      ));
    } catch {
      /* IndexedDB can be unavailable in private mode */
    }
  }, [mock?.id, testId, user?.id]);

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
  const list = part === 1 ? part1 : part3;
  const current = list[index];

  async function startRecording() {
    if (checkAgain || finished || finishRequested || finishing || (mode === 'mock' && timer.remaining === 0)) return;
    if (part === 2) {
      setSeconds(0);
      setPhase('speak');
    }
    if (await recorder.start(checkedMic ?? undefined)) {
      startedAtRef.current = Date.now();
    } else if (part === 2) {
      setPhase('done');
    }
  }

  useEffect(() => {
    if (phase !== 'prep' && !(phase === 'speak' && recorder.recording)) return;
    const id = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [phase, recorder.recording]);

  useEffect(() => {
    if (!test || !card) return;
    if (phase === 'prep' && seconds >= 60) {
      void startRecording();
    } else if (part === 2 && phase === 'speak' && seconds >= 120) {
      recorder.stop();
      setPhase('done');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, seconds]);

  // Persist the finished recording so it survives a refresh.
  useEffect(() => {
    if (!test || !recorder.blob) return;
    if (recorder.blob === savedBlobRef.current) return;
    savedBlobRef.current = recorder.blob;
    if (part === 2) setPhase('done');

    const startedAt = startedAtRef.current ?? Date.now();
    const durationSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const topic =
      part === 2
        ? (card?.topic ?? 'Part 2')
        : `${current?.topic ?? ''}: ${current?.question ?? ''}`;

    const recording: SavedRecording = {
      id: crypto.randomUUID(),
      userId: user?.id,
      contentId: test.id,
      part,
      mockId: mock?.id,
      promptIndex: part === 2 ? cardIndex : index,
      topic,
      durationSec,
      createdAt: Date.now(),
      mimeType: recorder.blob.type || 'audio/webm',
      blob: recorder.blob,
    };
    const token = getToken();
    setAnswer(recording);
    setSaveError(false);
    savingRef.current = saveRecording(recording).then(async () => {
      void queryClient.invalidateQueries({ queryKey: ['local-speaking-recordings', user?.id] });
      await refreshSaved();
    }).catch(() => setSaveError(true));

    void savingRef.current.then(() => syncSpeakingRecording(recording, token)).then(() => {
      void queryClient.invalidateQueries({ queryKey: ['speaking-history', user?.id] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
    }).catch(() => {
      // The local recording can retry when Home opens.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.blob]);

  useEffect(() => {
    if (timer.expired) setFinishRequested(true);
  }, [timer.expired]);

  useEffect(() => {
    if (!finishRequested || finishing) return;
    if (recorder.recording) {
      recorder.stop();
      return;
    }
    if (recorder.busy && !recorder.waitingForMic) return;
    setFinishRequested(false);
    if (!mock) {
      setFinished(true);
      setPhase('done');
      return;
    }
    setFinishing(true);
    setFinishError(null);
    void savingRef.current.then(() => mock.finish({})).catch((error: unknown) => {
      setFinishError(errorMessage(error));
      setFinishing(false);
    });
  }, [mock, finishRequested, finishing, recorder.busy, recorder.recording, recorder.stop, recorder.waitingForMic]);

  if (isLoading) return <ExamLoadState skill="speaking" />;
  if (loadError || !test) {
    return <ExamLoadState skill="speaking" error={errorMessage(loadError)} />;
  }
  const savedForPart = saved.filter((recording) => recording.part === part);
  if (!running) {
    return (
      <div className="exam-surface min-h-screen">
        <div className="bg-ink text-paper"><div className="mx-auto max-w-4xl px-4 py-3"><ExamBackLink skill="speaking" /></div></div>
        <main className="mx-auto max-w-4xl space-y-4 px-4 py-6">
          <h1 className="page-title">{test.title}</h1>
          {checkedMic === null ? <MicrophoneCheck onReady={setCheckedMic} /> : (
            <button type="button" className="btn-primary" onClick={() => setStartedAt(Date.now())}>{t('mock.startSection')}</button>
          )}
          {saved.length > 0 ? <section className="space-y-2">
            <h2 className="font-serif text-xl font-semibold">{t('speaking.savedTitle')}</h2>
            {saved.map((recording) => <SavedItem key={recording.id} recording={recording} onDelete={handleDelete} />)}
          </section> : null}
        </main>
      </div>
    );
  }

  const feedbackPanel = recorder.blob && answer?.blob === recorder.blob ? (
    <>
      {saveError ? <p role="alert" className="mt-2 text-sm text-rose-600">{t('speaking.history.localSaveError')}</p> : null}
      {!mock && feedbackStatus?.provider === 'groq'
        ? <SpeakingFeedbackPanel key={answer.id} recording={answer} />
        : null}
    </>
  ) : null;

  const recorderError = recorder.error ? t(`speaking.${recorder.error}`) : null;

  return (
    <div className="exam-surface min-h-screen">
      <div className="sticky top-0 z-30 bg-ink text-paper">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2 px-4 py-2">
          <ExamBackLink
            skill="speaking"
            mock={isFullMock}
            confirmMessage={mock ? t(recorder.busy ? 'mock.leaveRecording' : 'mock.leave') : recorder.busy ? t('exam.leaveRecording') : undefined}
          />
          {running ? (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <TimerPill remaining={timer.remaining} elapsed={timer.elapsed} mode={mode} />
              {mode === 'mock' ? <button
                type="button"
                className="btn bg-brand-600 text-white hover:bg-brand-500"
                disabled={finishing || finishRequested || finished}
                onClick={() => {
                  if (timer.expired || window.confirm(t('mock.confirmFinish'))) setFinishRequested(true);
                }}
              >
                {t('mock.finishSection')}
              </button> : null}
            </div>
          ) : null}
        </div>
      </div>
      <header className="border-b border-paper/15 bg-ink text-paper">
        <div className="mx-auto max-w-4xl px-4 pb-5">
          <p className="eyebrow text-paper/50">{t('home.skillSpeaking')}</p>
          <h1 className="mt-2 font-serif text-3xl font-medium text-paper">{test.title}</h1>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-paper/55">{t('speaking.intro')}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {([1, 2, 3] as Part[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  if (value === part) return;
                  setPart(value);
                  setIndex(0);
                  setPhase('idle');
                  setSeconds(0);
                  recorder.clear();
                }}
                disabled={recorder.busy}
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
        {!finished ? (
          <button type="button" className="btn-secondary" disabled={recorder.busy || phase === 'prep' || finishRequested || finishing}
            onClick={() => setCheckAgain((previous) => !previous)} aria-expanded={checkAgain}>
            {t(checkAgain ? 'common.cancel' : 'speaking.micChange')}
          </button>
        ) : null}
        {checkAgain && !finished ? (
          <MicrophoneCheck initialInput={checkedMic} onReady={(input) => {
            setCheckedMic(input);
            setCheckAgain(false);
          }} />
        ) : null}
        {finished ? <p role="status" className="card p-4 text-sm">{t('exam.timedFinished')}</p> : null}
        {finishError ? <p role="alert" className="text-sm text-rose-600">{finishError}</p> : null}
        {part === 2 ? (
          <>
            <div className="card border-t-2 border-t-brand-600 p-5 sm:p-7">
              <div className="flex items-center justify-between">
                <Badge tone="rose">{t('speaking.cueCard')}</Badge>
                {test.part2.length > 1 ? <button
                  type="button"
                  className="btn-ghost text-xs"
                  disabled={recorder.busy}
                  onClick={() => {
                    setCardIndex((value) => (value + 1) % test.part2.length);
                    setPhase('idle');
                    setSeconds(0);
                    recorder.clear();
                    setNotes('');
                  }}
                >
                  {t('speaking.newCard')}
                </button> : null}
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
                    disabled={finished || checkAgain}
                    onClick={() => {
                      setPhase('prep');
                      setSeconds(0);
                      recorder.clear();
                    }}
                  >
                    {t('speaking.prepare')}
                  </button>
                ) : null}

                {phase === 'prep' ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => void startRecording()}
                  >
                    {t('speaking.startRecording')}
                  </button>
                ) : null}

                {phase === 'speak' ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={!recorder.recording}
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
                    <Trash2 className="h-3.5 w-3.5" /> {t('speaking.hidePlayback')}
                  </button>
                  {feedbackPanel}
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
                    disabled={finished || checkAgain || recorder.busy || !current}
                    onClick={() => void startRecording()}
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
                  disabled={recorder.busy || index >= list.length - 1}
                  onClick={() => {
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
                <>
                  <audio src={recorder.url} controls className="mt-4 w-full" />
                  {feedbackPanel}
                </>
              ) : null}
            </div>
          </>
        )}

        {!mock ? <section className="mt-6">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-serif text-2xl font-semibold text-ink">
              {t('speaking.savedTitle')}
            </h2>
            <span className="text-xs text-slate-400">{t('speaking.savedHint')}</span>
          </div>

          {savedForPart.length === 0 ? (
            <p className="card p-4 text-sm text-slate-500">{t('speaking.savedEmpty')}</p>
          ) : (
            <div className="space-y-3">
              {savedForPart.map((recording) => (
                <SavedItem key={recording.id} recording={recording} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </section> : null}
      </main>
    </div>
  );
}

export function SavedItem({
  recording,
  onDelete,
  children,
}: {
  recording: SavedRecording;
  onDelete: (id: string) => void;
  children?: ReactNode;
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
      {children}
    </div>
  );
}
