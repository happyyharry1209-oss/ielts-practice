import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { MockObjectiveResult, MockResults, MockScores, MockWritingResult, WritingFeedback } from '@ielts/shared';
import { SavedItem } from '../pages/SpeakingExam';
import { api, getToken } from '../lib/api';
import { useAuth } from '../lib/auth';
import { deleteRecording, isRecordingSynced, listRecordings, syncSpeakingRecording } from '../lib/recordings';
import { skillLabel } from '../lib/skills';
import { bandColor } from '../lib/utils';
import { SpeakingFeedbackPanel } from './SpeakingFeedbackPanel';
import { WritingPaperEstimate } from './WritingPaperEstimate';

export function MockResultsView({ id, results, scores }: { id: string; results: MockResults; scores?: MockScores }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { writing } = results;
  const queryClient = useQueryClient();
  const refreshScores = () => {
    void queryClient.invalidateQueries({ queryKey: ['mock-session', user?.id, id] });
    void queryClient.invalidateQueries({ queryKey: ['stats', user?.id] });
  };
  const recordings = useQuery({
    queryKey: ['mock-recordings', user?.id, id],
    queryFn: async () => {
      const token = getToken();
      const saved = (await listRecordings()).filter((rec) => rec.mockId === id && rec.userId === user?.id);
      const pending = saved.filter((recording) => !isRecordingSynced(recording));
      if (pending.length) {
        void Promise.allSettled(pending.map((recording) => syncSpeakingRecording(recording, token))).then((synced) => {
          if (synced.some(({ status }) => status === 'fulfilled')) refreshScores();
        });
      }
      return saved;
    },
  });
  const feedbackStatus = useQuery({
    queryKey: ['speaking', 'feedback-status'],
    queryFn: () => api<{ provider: 'groq' | null }>('/api/speaking/status'),
    enabled: Boolean(recordings.data?.length),
  });
  const remove = useMutation({
    mutationFn: deleteRecording,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['mock-recordings', user?.id, id] }),
  });

  return (
    <div className="space-y-4">
      {scores?.overall != null ? (
        <section className="card border-t-2 border-t-brand-600 p-5" aria-label={t('mock.overallBand')}>
          <h2 className="font-serif text-2xl font-semibold text-ink">{t('mock.overallBand')}</h2>
          <p className={`mt-1 font-serif text-4xl font-medium ${bandColor(scores.overall)}`}>Band {scores.overall.toFixed(1)}</p>
        </section>
      ) : <p className="text-sm text-muted">{t('mock.overallPending')}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {(['listening', 'reading'] as const).map((skill) => (
          results[skill] ? <ObjectiveResult key={skill} skill={skill} result={results[skill]} /> : null
        ))}
      </div>
      {writing ? <WritingResults key={id} mockId={id} writing={writing}
        feedback={scores?.writingFeedback} onReview={refreshScores} /> : null}
      <section className="card space-y-3 p-5">
        <h2 className="font-serif text-2xl font-semibold text-ink">{t(skillLabel('speaking'))}</h2>
        {scores?.speaking != null ? (
          <>
            <p className={`font-semibold ${bandColor(scores.speaking)}`}>{t('mock.estimatedBand', { band: scores.speaking.toFixed(1) })}</p>
            <p className="text-sm text-muted">{t('speaking.feedback.scope')}</p>
          </>
        ) : null}
        <p className="text-sm text-muted">{t('mock.recordingNotice')}</p>
        {!recordings.isLoading && !recordings.data?.length ? <p className="text-sm text-muted">{t('speaking.savedEmpty')}</p> : null}
        {recordings.data?.map((recording) => (
          <SavedItem key={recording.id} recording={recording} onDelete={(id) => remove.mutate(id)}>
            {feedbackStatus.data?.provider === 'groq' ? <SpeakingFeedbackPanel recording={recording} /> : null}
          </SavedItem>
        ))}
      </section>
    </div>
  );
}

function ObjectiveResult({ skill, result }: { skill: 'listening' | 'reading'; result: MockObjectiveResult }) {
  const { t } = useTranslation();
  return (
    <section className="card p-5">
      <h2 className="font-serif text-2xl font-semibold text-ink">{t(skillLabel(skill))}</h2>
      <p className="mt-2 font-semibold text-ink">{result.correct} / {result.total} · {t('mock.estimatedBand', { band: result.band.toFixed(1) })}</p>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-semibold text-ink">{t('mock.reviewAnswers')}</summary>
        <ol className="mt-3 space-y-3">
          {result.items.map((item) => (
            <li key={item.questionId} className="border-b border-line pb-3">
              <p className="font-semibold text-ink">{item.number}. {item.prompt}</p>
              <p className={item.correct ? 'text-emerald-700' : 'text-rose-600'}>
                {t('mock.yourAnswer', { answer: ([] as string[]).concat(item.userAnswer ?? []).join(', ') || '—' })}
              </p>
              <p className="text-muted">{t('mock.correctAnswer', { answer: ([] as string[]).concat(item.expected).join(', ') })}</p>
              {item.explanation ? <p className="mt-1 text-muted">{item.explanation}</p> : null}
            </li>
          ))}
        </ol>
      </details>
      {result.transcripts?.length ? (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold text-ink">{t('exam.showTranscript')}</summary>
          {result.transcripts.map((part) => (
            <div key={part.id} className="mt-3">
              <h3 className="font-semibold text-ink">{part.title}</h3>
              <p className="mt-1 whitespace-pre-line text-muted">{part.text}</p>
            </div>
          ))}
        </details>
      ) : null}
    </section>
  );
}

function WritingResults({ mockId, writing, feedback = {}, onReview }: {
  mockId: string;
  writing: MockWritingResult;
  feedback?: MockScores['writingFeedback'];
  onReview: () => void;
}) {
  const { t } = useTranslation();

  return (
    <section className="card space-y-3 p-5">
      <h2 className="font-serif text-2xl font-semibold text-ink">{t(skillLabel('writing'))}</h2>
      <WritingPaperEstimate task1={feedback[1]} task2={feedback[2]} />
      {writing.tasks.map((task) => (
        <WritingResult key={task.id} mockId={mockId} contentId={writing.contentId} task={task}
          savedFeedback={feedback[task.task]} onReview={onReview} />
      ))}
    </section>
  );
}

function WritingResult({ mockId, contentId, task, savedFeedback, onReview }: {
  mockId: string;
  contentId: string;
  task: MockWritingResult['tasks'][number];
  savedFeedback?: WritingFeedback;
  onReview: () => void;
}) {
  const { t } = useTranslation();
  const review = useMutation({
    mutationFn: () => api<{ feedback: WritingFeedback }>('/api/writing/submit', {
      method: 'POST',
      json: { mockId, contentId, taskId: task.id, text: task.text },
    }),
    onSuccess: onReview,
  });
  const feedback = savedFeedback ?? review.data?.feedback;
  return (
    <details className="rounded-sm border border-line p-3 text-sm">
      <summary className="cursor-pointer font-semibold text-ink">{t(`writing.task${task.task}`)}</summary>
      <p className="mt-3 whitespace-pre-wrap text-muted">{task.prompt}</p>
      <p className="mt-3 whitespace-pre-wrap break-words text-ink">{task.text || t('mock.blankAnswer')}</p>
      {task.text.trim() ? (
        <div className="mt-4 space-y-2">
          <p className="text-xs text-muted">{t('mock.writingReviewNotice')}</p>
          {feedback ? (
            <>
              <p className="font-semibold text-ink">{t('mock.estimatedBand', { band: feedback.overall.toFixed(1) })} · {feedback.source === 'ai' ? 'AI' : 'Offline'}</p>
              <p className="text-muted">{feedback.summary}</p>
              <ul className="list-disc space-y-1 pl-5 text-muted">
                {feedback.criteria.map((criterion) => <li key={criterion.label}>{criterion.label} · {criterion.band.toFixed(1)} · {criterion.comment}</li>)}
                {feedback.improvements.map((tip) => <li key={tip}>{tip}</li>)}
              </ul>
            </>
          ) : null}
          {feedback?.source !== 'ai' ? (
            <button type="button" className="btn-secondary" disabled={review.isPending} onClick={() => review.mutate()}>
              {t(review.isPending ? 'writing.submitting' : 'mock.writingReview')}
            </button>
          ) : null}
          {review.isError ? <p role="alert" className="text-rose-600">{t('mock.error')}</p> : null}
        </div>
      ) : null}
    </details>
  );
}
