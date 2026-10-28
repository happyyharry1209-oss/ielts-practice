import { z } from 'zod';
import { writingOverall } from '@ielts/shared';
import { env } from './env';

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

const criterionSchema = z.object({
  band: z.number().min(0).max(9),
  comment: z.string().default(''),
});

const aiSchema = z.object({
  taskAchievement: criterionSchema,
  coherence: criterionSchema,
  lexical: criterionSchema,
  grammar: criterionSchema,
  summary: z.string().default(''),
  strengths: z.array(z.string()).default([]),
  improvements: z.array(z.string()).default([]),
  errors: z
    .array(
      z.object({
        sentence: z.string(),
        issue: z.string(),
        suggestion: z.string(),
      }),
    )
    .default([]),
  vocabulary: z
    .array(
      z.object({ original: z.string(), better: z.string(), why: z.string() }),
    )
    .default([]),
});

export function countWritingWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const LABELS = {
  taskAchievement: 'Task Achievement',
  coherence: 'Coherence & Cohesion',
  lexical: 'Lexical Resource',
  grammar: 'Grammatical Range & Accuracy',
};

const LINKING_WORDS = [
  'however', 'although', 'therefore', 'moreover', 'furthermore', 'nevertheless',
  'consequently', 'in addition', 'on the other hand', 'for instance', 'for example',
  'in contrast', 'whereas', 'finally', 'firstly', 'secondly', 'in conclusion',
  'to sum up', 'as a result', 'despite', 'while',
];

function heuristicFeedback(
  essay: string,
  taskType: 1 | 2,
  minWords: number,
): WritingFeedback {
  const words = countWritingWords(essay);
  const sentences = essay.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const paragraphs = essay.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const lower = essay.toLowerCase();
  const linkers = LINKING_WORDS.filter((w) => lower.includes(w));
  const avgSentence = sentences.length ? words / sentences.length : 0;

  let band = 4.5;
  if (words >= minWords) band += 0.75;
  if (words >= minWords * 1.3) band += 0.25;
  if (paragraphs.length >= 4) band += 0.5;
  if (avgSentence >= 11 && avgSentence <= 26) band += 0.5;
  if (linkers.length >= 4) band += 0.5;
  else if (linkers.length >= 2) band += 0.25;
  if (sentences.length >= 8) band += 0.25;
  band = Math.max(4, Math.min(7.5, Math.round(band * 2) / 2));

  const criteria: WritingCriterion[] = [
    {
      key: 'taskAchievement',
      label: taskType === 1 ? LABELS.taskAchievement : 'Task Response',
      band,
      comment:
        words >= minWords
          ? `The response is long enough (${words} words). This offline check cannot judge how well it answers the task.`
          : `The response is under the ${minWords}-word minimum (${words} words), which caps the score for this criterion.`,
    },
    {
      key: 'coherence',
      label: LABELS.coherence,
      band,
      comment: `${paragraphs.length} paragraph(s) detected, with ${linkers.length} linking expression(s).`,
    },
    {
      key: 'lexical',
      label: LABELS.lexical,
      band,
      comment: 'Vocabulary range cannot be assessed without an AI model.',
    },
    {
      key: 'grammar',
      label: LABELS.grammar,
      band,
      comment: `Average sentence length is ${avgSentence.toFixed(1)} words. Grammar accuracy cannot be assessed offline.`,
    },
  ];

  return {
    source: 'heuristic',
    estimated: true,
    overall: writingOverall({
      taskAchievement: band,
      coherence: band,
      lexical: band,
      grammar: band,
    }),
    criteria,
    summary:
      'Offline estimate based on length, paragraphing and linking words. It is not a real assessment.',
    strengths: [
      words >= minWords ? `Meets the minimum length (${words} words).` : '',
      paragraphs.length >= 3 ? 'The essay is divided into paragraphs.' : '',
      linkers.length > 0 ? `Uses linking words such as "${linkers.slice(0, 3).join('", "')}".` : '',
    ].filter(Boolean),
    improvements: [
      words < minWords ? `Write at least ${minWords} words.` : '',
      paragraphs.length < 4 ? 'Use a clear four- or five-paragraph structure.' : '',
      linkers.length < 3 ? 'Add more cohesive devices between sentences and paragraphs.' : '',
      'Set DEEPSEEK_API_KEY on the server to get real AI feedback on language and ideas.',
    ].filter(Boolean),
    errors: [],
    vocabulary: [],
    wordCount: words,
    notes: 'Heuristic feedback: no AI model configured.',
  };
}

function buildPrompt(taskType: 1 | 2, prompt: string, essay: string): string {
  return `You are a strict, experienced IELTS examiner. Score the candidate's response against the public IELTS writing band descriptors.

Task type: Academic Writing Task ${taskType}
Task prompt:
"""
${prompt}
"""
Candidate response:
"""
${essay}
"""

Rules:
- Give each criterion a band from 0 to 9 in 0.5 steps.
- Be strict: most candidates score 5.5-7.0. Do not inflate.
- "errors" must quote short exact sentences from the response and suggest a corrected version.
- "vocabulary" must quote exact words/phrases from the response.
- Comments must be specific to this response, not generic advice.
- Write comments in English.

Return ONLY valid JSON with this shape:
{
  "taskAchievement": { "band": 6.5, "comment": "..." },
  "coherence": { "band": 6.5, "comment": "..." },
  "lexical": { "band": 6.0, "comment": "..." },
  "grammar": { "band": 6.5, "comment": "..." },
  "summary": "two or three sentences",
  "strengths": ["...", "..."],
  "improvements": ["...", "..."],
  "errors": [{ "sentence": "...", "issue": "...", "suggestion": "..." }],
  "vocabulary": [{ "original": "...", "better": "...", "why": "..." }]
}`;
}

function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('No JSON object in model output');
  return JSON.parse(text.slice(start, end + 1));
}

export interface AiUsage {
  tokensIn: number;
  tokensOut: number;
}

export async function scoreWriting(
  taskType: 1 | 2,
  prompt: string,
  essay: string,
  minWords: number,
): Promise<{ feedback: WritingFeedback; usage: AiUsage }> {
  const wordCount = countWritingWords(essay);
  if (!env.deepseekApiKey) {
    return { feedback: heuristicFeedback(essay, taskType, minWords), usage: { tokensIn: 0, tokensOut: 0 } };
  }

  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.deepseekApiKey}`,
      },
      body: JSON.stringify({
        model: env.deepseekModel,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are an IELTS examiner. Output JSON only.' },
          { role: 'user', content: buildPrompt(taskType, prompt, essay) },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = data.choices?.[0]?.message?.content ?? '';
    const parsed = aiSchema.parse(extractJson(content));

    const criteria: WritingCriterion[] = [
      { key: 'taskAchievement', label: taskType === 1 ? LABELS.taskAchievement : 'Task Response', ...parsed.taskAchievement },
      { key: 'coherence', label: LABELS.coherence, ...parsed.coherence },
      { key: 'lexical', label: LABELS.lexical, ...parsed.lexical },
      { key: 'grammar', label: LABELS.grammar, ...parsed.grammar },
    ];

    const feedback: WritingFeedback = {
      source: 'ai',
      estimated: true,
      overall: writingOverall({
        taskAchievement: parsed.taskAchievement.band,
        coherence: parsed.coherence.band,
        lexical: parsed.lexical.band,
        grammar: parsed.grammar.band,
      }),
      criteria,
      summary: parsed.summary,
      strengths: parsed.strengths,
      improvements: parsed.improvements,
      errors: parsed.errors,
      vocabulary: parsed.vocabulary,
      wordCount,
      notes: 'AI-generated estimate. Not an official IELTS result.',
    };

    return {
      feedback,
      usage: {
        tokensIn: data.usage?.prompt_tokens ?? 0,
        tokensOut: data.usage?.completion_tokens ?? 0,
      },
    };
  } catch (error) {
    console.error('[ai] writing score failed:', (error as Error).message);
    const fallback = heuristicFeedback(essay, taskType, minWords);
    fallback.notes = `AI scoring failed, showing the offline estimate. (${(error as Error).message})`;
    return { feedback: fallback, usage: { tokensIn: 0, tokensOut: 0 } };
  }
}
