import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { SpeakingHistoryItem } from '@ielts/shared';
import { api, getToken } from '../lib/api';
import { claimLegacyRecordings, listRecordings, syncSpeakingRecording } from '../lib/recordings';
import type { SavedRecording } from '../lib/recordings';
import { bandColor, formatClock, formatDateTime } from '../lib/utils';
import { SpeakingFeedbackPanel, SpeakingFeedbackView } from './SpeakingFeedbackPanel';
import { Spinner } from './ui';

interface HistoryPage {
  recordings: SpeakingHistoryItem[];
  nextOffset: number | null;
}

export function SpeakingHistory({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const history = useInfiniteQuery({
    queryKey: ['speaking-history', userId],
    queryFn: ({ pageParam, signal }) => api<HistoryPage>(`/api/speaking/recordings?offset=${pageParam}`, { signal }),
    initialPageParam: 0,
    getNextPageParam: (page) => page.nextOffset ?? undefined,
  });
  const local = useQuery({
    queryKey: ['local-speaking-recordings', userId],
    queryFn: async () => {
      const all = await listRecordings();
      return {
        recordings: all.filter((recording) => recording.userId === userId),
        hasLegacy: all.some((recording) => !recording.userId),
      };
    },
    staleTime: 0,
    retry: false,
  });
  const feedbackStatus = useQuery({
    queryKey: ['speaking', 'feedback-status'],
    queryFn: () => api<{ provider: 'groq' | null }>('/api/speaking/status'),
    enabled: Boolean(local.data?.recordings.length),
  });
  const refreshHistory = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['speaking-history', userId] }),
      queryClient.invalidateQueries({ queryKey: ['local-speaking-recordings', userId] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] }),
    ]);
  };
  const sync = useMutation({
    mutationFn: async (importLegacy: boolean) => {
      const token = getToken();
      if (importLegacy) await claimLegacyRecordings(userId);
      const pending = (await listRecordings()).filter((recording) => recording.userId === userId && !recording.synced);
      let failed = false;
      for (let index = 0; index < pending.length && token === getToken(); index += 5) {
        const batch = await Promise.allSettled(pending.slice(index, index + 5).map((recording) => syncSpeakingRecording(recording, token)));
        if (batch.some((result) => result.status === 'rejected')) failed = true;
      }
      if (failed) throw new Error('Some speaking recordings are pending');
    },
    onSettled: refreshHistory,
  });
  const { mutate: syncRecordings, isIdle } = sync;
  const pending = local.data?.recordings.filter((recording) => !recording.synced) ?? [];
  useEffect(() => {
    if (pending.length && isIdle) syncRecordings(false);
  }, [pending.length, isIdle, syncRecordings]);

  const recordings = history.data?.pages.flatMap((page) => page.recordings) ?? [];
  const localById = new Map(local.data?.recordings.map((recording) => [recording.id, recording]));
  const syncedIds = new Set(recordings.map((recording) => recording.client_id));
  const pendingOnly = pending.filter((recording) => !syncedIds.has(recording.id));
  const canReview = feedbackStatus.data?.provider === 'groq';

  return (
    <section aria-labelledby="speaking-history-title">
      <h2 id="speaking-history-title" className="section-title mb-3">{t('home.speakingFeedback')}</h2>
      <div className="card">
        {local.data?.hasLegacy ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
            <p className="text-sm text-muted">{t('speaking.history.legacy')}</p>
            <button type="button" className="btn-secondary text-xs" disabled={sync.isPending} onClick={() => syncRecordings(true)}>
              {t('speaking.history.import')}
            </button>
          </div>
        ) : null}
        {sync.isError ? (
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
            <p role="alert" className="text-sm text-rose-600">{t('speaking.history.syncError')}</p>
            <button type="button" className="btn-secondary text-xs" onClick={() => syncRecordings(Boolean(local.data?.hasLegacy && sync.variables))}>
              {t('common.retry')}
            </button>
          </div>
        ) : null}
        {pendingOnly.length || recordings.length ? (
          <ul className="divide-y divide-line">
            {pendingOnly.map((recording) => (
              <HistoryRow
                key={recording.id}
                entry={{
                  id: recording.id,
                  client_id: recording.id,
                  content_id: recording.contentId,
                  part: recording.part,
                  prompt: recording.topic,
                  duration_sec: recording.durationSec,
                  created_at: new Date(recording.createdAt).toISOString(),
                  title: t('speaking.history.pending'),
                  feedback: null,
                }}
                audio={recording}
                canReview={canReview}
              />
            ))}
            {recordings.map((entry) => (
              <HistoryRow
                key={entry.client_id ?? entry.id}
                entry={entry}
                audio={entry.client_id ? localById.get(entry.client_id) : undefined}
                canReview={canReview}
              />
            ))}
          </ul>
        ) : history.isPending || local.isPending ? (
          <Spinner label={t('common.loading')} />
        ) : !history.isError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-5">
            <p className="text-sm text-muted">{t('speaking.history.empty')}</p>
            <Link className="btn-secondary text-xs" to="/practice/speaking">{t('home.practiceNow')}</Link>
          </div>
        ) : null}
        {history.isError ? (
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
            <p role="alert" className="text-sm text-rose-600">{t('speaking.history.loadError')}</p>
            <button type="button" className="btn-secondary text-xs" onClick={() => void history.refetch()}>{t('common.retry')}</button>
          </div>
        ) : null}
        {history.hasNextPage ? (
          <div className="border-t border-line px-4 py-3 sm:px-5">
            <button type="button" className="btn-secondary text-xs" disabled={history.isFetching} onClick={() => void history.fetchNextPage()}>
              {t(history.isFetchingNextPage ? 'common.loading' : 'speaking.history.older')}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function HistoryRow({ entry, audio, canReview }: { entry: SpeakingHistoryItem; audio?: SavedRecording; canReview: boolean }) {
  const { t, i18n } = useTranslation();
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const blob = audio?.blob;
  useEffect(() => {
    if (!blob) {
      setAudioUrl(null);
      return;
    }
    const url = URL.createObjectURL(blob);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  return (
    <li className="px-4 py-3 sm:px-5">
      <details>
        <summary className="cursor-pointer rounded-sm text-sm text-ink">
          <span className="inline-flex w-[calc(100%-1.5em)] items-center justify-between gap-3 align-middle">
            <span className="min-w-0">
              <span className="block break-words font-semibold">{entry.title}</span>
              <span className="mt-1 block text-xs leading-5 text-muted">
                Part {entry.part} · {formatDateTime(entry.created_at, i18n.language)}
                {entry.duration_sec != null ? ` · ${formatClock(entry.duration_sec)}` : ''}
              </span>
            </span>
            {entry.feedback ? (
              <span className={`shrink-0 font-serif text-xl ${bandColor(entry.feedback.band)}`}>Band {entry.feedback.band.toFixed(1)}</span>
            ) : null}
          </span>
        </summary>
        <div className="mt-3 space-y-3 pl-4">
          {entry.prompt ? <p className="break-words text-sm text-ink">{entry.prompt}</p> : null}
          {audioUrl ? (
            <audio className="w-full" aria-label={t('speaking.playback')} src={audioUrl} controls preload="none" />
          ) : (
            <p className="text-xs text-muted">{t('speaking.history.audioLocal')}</p>
          )}
          {entry.feedback ? (
            <SpeakingFeedbackView feedback={entry.feedback} />
          ) : canReview && audio?.promptIndex != null ? (
            <SpeakingFeedbackPanel recording={audio} />
          ) : (
            <p className="text-xs text-muted">{t('speaking.history.noFeedback')}</p>
          )}
        </div>
      </details>
    </li>
  );
}
