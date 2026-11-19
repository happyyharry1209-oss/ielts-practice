import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MockObjectiveResult, MockResults, MockWritingResult, WritingFeedback } from '@ielts/shared';
import { SavedItem } from '../pages/SpeakingExam';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { deleteRecording, listRecordings } from '../lib/recordings';
import { skillLabel } from '../lib/skills';
import { SpeakingFeedbackPanel } from './SpeakingFeedbackPanel';
import { WritingPaperEstimate } from './WritingPaperEstimate';

export function MockResultsView({ id, results }: { id: string; results: MockResults }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { writing } = results;
  const recordings = useQuery({
    queryKey: ['mock-recordings', user?.id, id],
    queryFn: async () => (await listRecordings()).filter((rec) => rec.mockId === id && rec.userId === user?.id),
  });
  const feedbackStatus = useQuery({
    queryKey: ['speaking', 'feedback-status'],
    queryFn: () => api<{ provider: 'groq' | null }>('/api/speaking/status'),
    enabled: Boolean(recordings.data?.length),
  });
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: deleteRecording,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['mock-recordings', user?.id, id] }),
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {(['listening', 'reading'] as const).map((skill) => (
          results[skill] ? <ObjectiveResult key={skill} skill={skill} result={results[skill]} /> : null
        ))}
      </div>
      {writing ? <WritingResults key={id} writing={writing} /> : null}
      <section className="card space-y-3 p-5">
        <h2 className="font-serif text-2xl font-semibold text-ink">{t(skillLabel('speaking'))}</h2>
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

function WritingResults({ writing }: { writing: MockWritingResult }) {
  const { t } = useTranslation();
  const [feedback, setFeedback] = useState<Partial<Record<1 | 2, WritingFeedback>>>({});

  return (
    <section className="card space-y-3 p-5">
      <h2 className="font-serif text-2xl font-semibold text-ink">{t(skillLabel('writing'))}</h2>
      <WritingPaperEstimate task1={feedback[1]} task2={feedback[2]} />
      {writing.tasks.map((task) => (
        <WritingResult key={task.id} contentId={writing.contentId} task={task}
          onReview={(result) => setFeedback((previous) => ({ ...previous, [task.task]: result }))} />
      ))}
    </section>
  );
}

function WritingResult({ contentId, task, onReview }: {
  contentId: string;
  task: MockWritingResult['tasks'][number];
  onReview: (feedback: WritingFeedback) => void;
}) {
  const { t } = useTranslation();
  const review = useMutation({
    mutationFn: () => api<{ feedback: WritingFeedback }>('/api/writing/submit', {
      method: 'POST',
      json: { contentId, taskId: task.id, text: task.text },
    }),
    onSuccess: ({ feedback }) => onReview(feedback),
  });
  const feedback = review.data?.feedback;
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
          ) : (
            <button type="button" className="btn-secondary" disabled={review.isPending} onClick={() => review.mutate()}>
              {t(review.isPending ? 'writing.submitting' : 'mock.writingReview')}
            </button>
          )}
          {review.isError ? <p role="alert" className="text-rose-600">{t('mock.error')}</p> : null}
        </div>
      ) : null}
    </details>
  );
}
