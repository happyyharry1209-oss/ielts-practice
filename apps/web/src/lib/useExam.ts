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
  deadline?: number,
): ExamTimer {
  const [ticks, setTicks] = useState(0);
  const [expired, setExpired] = useState(false);
  const firedRef = useRef(false);
  const elapsedMs = useRef(0);

  useEffect(() => {
    if (!active) return;
    const start = Date.now();
    const id = window.setInterval(() => setTicks(Math.floor((elapsedMs.current + Date.now() - start) / 1000)), 1000);
    return () => {
      window.clearInterval(id);
      elapsedMs.current += Math.max(0, Date.now() - start);
    };
  }, [active]);

  const elapsed = deadline === undefined
    ? ticks
    : Math.min(totalSeconds, Math.max(0, totalSeconds - Math.ceil((deadline - Date.now()) / 1000)));
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
  waitingForMic: boolean;
  busy: boolean;
  error: string | null;
  url: string | null;
  /** Latest finished recording, for persistence. */
  blob: Blob | null;
  start: () => Promise<boolean>;
  stop: () => void;
  clear: () => void;
}

/** Thin MediaRecorder wrapper with codec detection for Safari. */
export function useRecorder(): RecorderState {
  const [state, setState] = useState<'idle' | 'starting' | 'recording' | 'finishing'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const urlRef = useRef<string | null>(null);
  const requestVersion = useRef(0);
  const startingRef = useRef(false);

  const supported =
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia);

  const clear = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setUrl(null);
    setBlob(null);
    setError(null);
  }, []);

  const stop = useCallback(() => {
    const active = recorderRef.current;
    if (!active || active.state === 'inactive') return;
    setState('finishing');
    active.stop();
    active.stream.getTracks().forEach((track) => track.stop());
  }, []);

  const start = useCallback(async () => {
    if (!supported) {
      setError('unsupported');
      return false;
    }
    if (startingRef.current || recorderRef.current) return false;
    clear();
    setState('starting');
    const version = ++requestVersion.current;
    startingRef.current = true;
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (requestVersion.current !== version) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        recorder.stream.getTracks().forEach((track) => track.stop());
        if (recorderRef.current !== recorder) return;
        recorderRef.current = null;
        setState('idle');
        if (!chunks.length) return;
        const finished = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const objectUrl = URL.createObjectURL(finished);
        urlRef.current = objectUrl;
        setBlob(finished);
        setUrl(objectUrl);
      };
      recorder.start();
      recorderRef.current = recorder;
      setState('recording');
      return true;
    } catch {
      stream?.getTracks().forEach((track) => track.stop());
      if (requestVersion.current === version) {
        setError('denied');
        setState('idle');
      }
      return false;
    } finally {
      if (requestVersion.current === version) startingRef.current = false;
    }
  }, [supported, clear]);

  useEffect(() => {
    return () => {
      requestVersion.current += 1;
      startingRef.current = false;
      const active = recorderRef.current;
      recorderRef.current = null;
      if (active && active.state !== 'inactive') active.stop();
      active?.stream.getTracks().forEach((track) => track.stop());
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  return { supported, recording: state === 'recording', waitingForMic: state === 'starting', busy: state !== 'idle', error, url, blob, start, stop, clear };
}
