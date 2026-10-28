import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Question } from '@ielts/shared';

export type AnswerValue = string | string[];
export type Answers = Record<string, AnswerValue>;

const KEY_PREFIX = 'ielts.answers.';

export const answersKey = (testId: string): string => `${KEY_PREFIX}${testId}`;

export function clearStoredAnswers(testId: string): void {
  try {
    localStorage.removeItem(answersKey(testId));
  } catch {
    /* ignore */
  }
}

export interface ExamState {
  answers: Answers;
  setAnswer: (id: string, value: AnswerValue | null) => void;
  answeredCount: number;
  reset: () => void;
}

/** Answer state persisted to localStorage so a refresh does not lose work. */
export function useExamState(testId: string, questions: Question[]): ExamState {
  const [answers, setAnswers] = useState<Answers>(() => {
    try {
      const raw = localStorage.getItem(answersKey(testId));
      return raw ? (JSON.parse(raw) as Answers) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(answersKey(testId), JSON.stringify(answers));
    } catch {
      /* ignore quota errors */
    }
  }, [testId, answers]);

  const setAnswer = useCallback((id: string, value: AnswerValue | null) => {
    setAnswers((previous) => {
      const next = { ...previous };
      const empty =
        value === null ||
        (typeof value === 'string' && value.trim() === '') ||
        (Array.isArray(value) && value.length === 0);
      if (empty) delete next[id];
      else next[id] = value;
      return next;
    });
  }, []);

  const answeredCount = useMemo(
    () =>
      questions.filter((question) => {
        const value = answers[question.id];
        return Array.isArray(value) ? value.length > 0 : Boolean(value && String(value).trim());
      }).length,
    [answers, questions],
  );

  const reset = useCallback(() => {
    setAnswers({});
    clearStoredAnswers(testId);
  }, [testId]);

  return { answers, setAnswer, answeredCount, reset };
}

export interface ExamTimer {
  elapsed: number;
  remaining: number;
  expired: boolean;
}

/**
 * Mock mode counts down; practice mode counts up with no limit.
 * Returns `expired` exactly once when the countdown reaches zero.
 */
export function useExamTimer(
  totalSeconds: number,
  mode: 'mock' | 'practice',
  active = true,
): ExamTimer {
  const [elapsed, setElapsed] = useState(0);
  const [expired, setExpired] = useState(false);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  const remaining = mode === 'mock' ? Math.max(0, totalSeconds - elapsed) : totalSeconds;

  useEffect(() => {
    if (mode !== 'mock' || !active) return;
    if (remaining === 0 && elapsed > 0 && !firedRef.current) {
      firedRef.current = true;
      setExpired(true);
    }
  }, [mode, remaining, elapsed, active]);

  return { elapsed, remaining, expired };
}

export interface RecorderState {
  supported: boolean;
  recording: boolean;
  error: string | null;
  url: string | null;
  start: () => Promise<void>;
  stop: () => void;
  clear: () => void;
}

/** Thin MediaRecorder wrapper with codec detection for Safari. */
export function useRecorder(): RecorderState {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const supported =
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia);

  const clear = useCallback(() => {
    setUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
  }, []);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setRecording(false);
  }, []);

  const start = useCallback(async () => {
    if (!supported) {
      setError('unsupported');
      return;
    }
    setError(null);
    clear();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setUrl(URL.createObjectURL(blob));
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      setError('denied');
      setRecording(false);
    }
  }, [supported, clear]);

  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return { supported, recording, error, url, start, stop, clear };
}
