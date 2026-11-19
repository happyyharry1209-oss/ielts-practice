export interface WritingCriterion {
  key: 'taskAchievement' | 'coherence' | 'lexical' | 'grammar';
  label: string;
  band: number;
  comment: string;
}

export interface WritingFeedback {
  source: 'ai' | 'heuristic';
  estimated: boolean;
  overall: number;
  criteria: WritingCriterion[];
  summary: string;
  strengths: string[];
  improvements: string[];
  errors: { sentence: string; issue: string; suggestion: string }[];
  vocabulary: { original: string; better: string; why: string }[];
  wordCount: number;
  notes?: string;
}
