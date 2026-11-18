export const MAX_SPEAKING_AUDIO_BYTES = 10 * 1024 * 1024;

export interface SpeakingFeedback {
  transcript: string;
  wordsPerMinute: number | null;
  coherence: string;
  lexical: string;
  grammar: string;
  improvements: string[];
}
