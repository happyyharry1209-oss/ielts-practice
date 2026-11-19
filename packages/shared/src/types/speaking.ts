export const MAX_SPEAKING_AUDIO_BYTES = 10 * 1024 * 1024;

export interface SpeakingFeedback {
  band: number;
  criteriaBands: { coherence: number; lexical: number; grammar: number };
  transcript: string;
  wordsPerMinute: number | null;
  coherence: string;
  lexical: string;
  grammar: string;
  improvements: string[];
}

export interface SpeakingHistoryItem {
  id: string;
  client_id: string | null;
  content_id: string;
  part: 1 | 2 | 3;
  prompt: string | null;
  duration_sec: number | null;
  created_at: string;
  title: string;
  feedback: SpeakingFeedback | null;
}
