import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MAX_SPEAKING_AUDIO_BYTES } from '@ielts/shared';
import type { SpeakingFeedback } from '@ielts/shared';
import { useTranslation } from 'react-i18next';
import { ApiError, api } from '../lib/api';
import type { SavedRecording } from '../lib/recordings';
import { bandColor } from '../lib/utils';

function feedbackError(error: unknown) {
  if (!(error instanceof ApiError)) return 'providerError';
  switch (error.message) {
    case 'speaking-no-speech': return 'noSpeech';
    case 'speaking-invalid-audio': return 'invalidAudio';
    case 'speaking-too-large': return 'tooLarge';
    case 'speaking-rate-limit': return 'rateLimit';
    case 'speaking-unavailable': return 'unavailable';
    default: return 'providerError';
  }
}

export function SpeakingFeedbackPanel({ recording }: { recording: SavedRecording }) {
  const { id, blob, contentId, part, promptIndex, userId, mockId } = recording;
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const review = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.set('audio', blob, 'answer');
      form.set('clientId', id);
      if (mockId) form.set('mockId', mockId);
      form.set('contentId', contentId);
      form.set('part', String(part));
      form.set('promptIndex', String(promptIndex));
      const { feedback } = await api<{ feedback: SpeakingFeedback }>('/api/speaking/feedback', {
        method: 'POST',
        body: form,
      });
      return feedback;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['speaking-history', userId] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
      if (mockId) {
        void queryClient.invalidateQueries({ queryKey: ['mock-session', userId, mockId] });
        void queryClient.invalidateQueries({ queryKey: ['stats', userId] });
      }
    },
  });
  if (promptIndex === undefined) return null;

  return (
    <section className="mt-4 border-t border-line pt-4 text-sm">
      {blob.size > MAX_SPEAKING_AUDIO_BYTES ? (
        <p className="text-rose-600">{t('speaking.feedback.tooLarge')}</p>
      ) : review.data ? (
        <SpeakingFeedbackView feedback={review.data} />
      ) : (
        <div className="space-y-2">
          <p className="text-xs leading-5 text-slate-600">{t('speaking.feedback.uploadNotice')}</p>
          <button type="button" className="btn-secondary" disabled={review.isPending} onClick={() => review.mutate()}>
            {t(review.isPending ? 'speaking.feedback.pending' : 'speaking.feedback.request')}
          </button>
          {review.error ? <p role="alert" className="text-rose-600">{t(`speaking.feedback.${feedbackError(review.error)}`)}</p> : null}
        </div>
      )}
    </section>
  );
}

export function SpeakingFeedbackView({ feedback }: { feedback: SpeakingFeedback }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4 text-sm" aria-live="polite">
      <h3 className="font-serif text-xl font-semibold text-ink">{t('speaking.feedback.title')}</h3>
      {Number.isFinite(feedback.band) ? (
        <div className="rounded-sm border border-line bg-surface px-4 py-3">
          <p className="text-sm font-semibold text-ink">{t('speaking.feedback.bandLabel')}</p>
          <p className={`font-serif text-4xl font-medium ${bandColor(feedback.band)}`}>Band {feedback.band.toFixed(1)}</p>
        </div>
      ) : null}
      <p className="text-sm text-slate-600">{t('speaking.feedback.scope')}</p>
      <dl className="space-y-3">
        {(['coherence', 'lexical', 'grammar'] as const).map((criterion) => (
          <div key={criterion}>
            <dt className="flex flex-wrap items-baseline justify-between gap-2 font-semibold text-ink">
              {t(`speaking.feedback.${criterion}`)}
              {feedback.criteriaBands?.[criterion] != null ? (
                <span className={bandColor(feedback.criteriaBands[criterion])}>{feedback.criteriaBands[criterion].toFixed(1)}</span>
              ) : null}
            </dt>
            <dd className="mt-1 leading-relaxed text-slate-700">{feedback[criterion]}</dd>
          </div>
        ))}
      </dl>
      <div>
        <h4 className="font-semibold text-ink">{t('speaking.feedback.improvements')}</h4>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700">
          {feedback.improvements.map((tip, index) => <li key={index}>{tip}</li>)}
        </ul>
      </div>
      <details className="rounded-sm border border-line bg-surface p-3">
        <summary className="cursor-pointer font-semibold text-ink">{t('speaking.feedback.transcript')}</summary>
        {feedback.wordsPerMinute !== null ? (
          <p className="mt-2 text-xs text-slate-600">{t('speaking.feedback.pace', { count: feedback.wordsPerMinute })}</p>
        ) : null}
        <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed text-slate-700">{feedback.transcript}</p>
      </details>
    </div>
  );
}
