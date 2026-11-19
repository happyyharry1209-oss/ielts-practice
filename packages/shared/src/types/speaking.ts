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
