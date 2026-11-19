import type { AnyTest, Difficulty, ListeningTest, PaperBank, Question, ReadingTest, WritingTest } from '@ielts/shared';

type Objective = ListeningTest | ReadingTest;

function words(text: string): number {
  return text.match(/\b[\w'-]+\b/g)?.length ?? 0;
}

// Estimate the demands of each paper from its material, independently of a student's score.
function complexity(test: AnyTest): number {
  if (test.skill === 'writing') {
    return test.tasks.reduce((score, task) => score + words(task.prompt) / 18
      + (task.dataTable ? task.dataTable.columns.length * task.dataTable.rows.length / 3 : 0)
      + (task.diagram?.kind === 'map' ? 5 : task.diagram ? 2 : 0)
      + (task.prompt.includes('both views') ? 3 : 0), 0);
  }
  if (test.skill === 'speaking') {
    const questions = test.part3.flatMap((topic) => topic.questions);
    return questions.reduce((score, question) => score + words(question)
      + (/government|responsib|polic|econom|technology|institut|research/i.test(question) ? 7 : 0), 0)
      / Math.max(1, questions.length);
  }
  const groups = test.skill === 'reading' ? test.passages : test.sections;
  const demand = groups.map((group) => {
    const length = words('body' in group ? group.body : group.transcript ?? '');
    return length / 90 + group.questions.reduce((sum, q) => sum
      + (q.type.startsWith('matching') || q.type.endsWith('not-given') || q.type === 'multiple-answer' ? 3 : q.options ? 1 : 2),
    0) / Math.max(1, group.questions.length);
  });
  return demand.reduce((sum, n) => sum + n, 0) / Math.max(1, groups.length);
}

function levels<T extends AnyTest>(bank: T[]): { test: T; difficulty: Difficulty }[] {
  const rank = bank.map((test) => ({ test, score: complexity(test) }))
    .sort((a, b) => a.score - b.score || a.test.id.localeCompare(b.test.id));
  return rank.map(({ test }, i) => ({
    test,
    difficulty: rank.length === 1 ? 'medium' : i / rank.length < 1 / 3 ? 'easy' : i / rank.length < 2 / 3 ? 'medium' : 'hard',
  }));
}

export function renumberGroups<T extends { id: string; questions: Question[] }>(groups: T[]): T[] {
  let number = 0;
  return groups.map((group, index) => ({
    ...group, id: `group-${index + 1}`,
    questions: group.questions.map((q) => {
      number += 1;
      return { ...q, id: `q${number}`, number };
    }),
  }));
}

export function combineDrills(test: Objective, partners: Objective[]): Objective {
  const drills = [test, ...partners];
  const fields = {
    id: `practice-${test.id}-${partners.map((item) => item.id.slice(item.skill.length + 1)).join('-')}`,
    description: drills.map((drill) => drill.skill === 'reading' ? drill.passages[0]?.title : drill.sections[0]?.title).join(' · '),
    durationSec: drills.reduce((seconds, drill) => seconds + drill.durationSec, 0),
    shortPractice: true,
  };
  return test.skill === 'reading'
    ? { ...test, ...fields, passages: renumberGroups(drills.flatMap((drill) => drill.skill === 'reading' ? drill.passages : [])) }
    : { ...test, ...fields, sections: renumberGroups(drills.flatMap((drill) => drill.skill === 'listening' ? drill.sections : [])) };
}

function extendDrills<T extends Objective>(short: T[]): Objective[] {
  const sorted = [...short].sort((a, b) => complexity(a) - complexity(b) || a.id.localeCompare(b.id));
  if (sorted.length < 3) return sorted;
  return sorted.map((test, i) => {
    const partners = [0.29, 0.57].map((fraction) =>
      sorted[(i + Math.max(1, Math.round(sorted.length * fraction))) % sorted.length]!,
    );
    if (new Set([test, ...partners]).size < 3) partners.splice(0, 2, sorted[(i + 1) % sorted.length]!, sorted[(i + 2) % sorted.length]!);
    return combineDrills(test, partners);
  });
}

export function withWritingVisual(test: WritingTest): WritingTest {
  const number = Number(test.id.split('-').at(-1));
  return {
    ...test,
    tasks: test.tasks.map((task) => {
      if (!task.dataTable || task.imageUrl || task.visualKind) return task;
      if (!/^The table\b/i.test(task.prompt) || number % 4 === 0) return task;
      const orderedDates = task.dataTable.columns.every((col) => /^(?:\d{4}|Year \d+)$/i.test(col));
      const visualKind = orderedDates && number % 2 ? 'line' : 'bar';
      return {
        ...task, visualKind,
        prompt: task.prompt.replace(/^The table\b/i, visualKind === 'line' ? 'The line graph' : 'The bar chart'),
      };
    }),
  };
}

export function buildCatalog(tests: AnyTest[]): { test: AnyTest; bank: PaperBank; difficulty: Difficulty }[] {
  const attach = (items: AnyTest[], bank: PaperBank) => levels(items).map((item) => ({ ...item, bank }));
  const reading = tests.filter((test): test is ReadingTest => test.skill === 'reading');
  const listening = tests.filter((test): test is ListeningTest => test.skill === 'listening');
  const readingFull = reading.filter((test) => test.variant === 'academic' && test.passages.length === 3 && test.passages.flatMap((p) => p.questions).length === 40);
  const listeningFull = listening.filter((test) => test.sections.length === 4 && test.sections.every((p) => p.questions.length === 10));
  const passages = reading.filter((test) => test.variant === 'academic').flatMap((test) => test.passages);
  const thirteen = passages.filter((p) => p.questions.length === 13);
  const fourteen = passages.filter((p) => p.questions.length === 14);
  if (thirteen.length >= 2 && fourteen.length) {
    Array.from({ length: Math.min(6, thirteen.length - 1) }, (_, i) => {
      readingFull.push({
        id: `academic-reading-${i + 2}`, skill: 'reading', variant: 'academic',
        title: `Academic Reading — Paper ${i + 2}`, durationSec: 3600,
        passages: renumberGroups([thirteen[i]!, thirteen[i + 1]!, fourteen[i % fourteen.length]!]),
      });
    });
  }
  const academic = [
    ...attach(readingFull, 'academic'),
    ...attach(listeningFull, 'academic'),
  ];
  const practice = [
    ...attach([...reading.filter((test) => !test.shortPractice && !readingFull.includes(test)), ...extendDrills(reading.filter((test) => test.shortPractice))], 'practice'),
    ...attach([...listening.filter((test) => !test.shortPractice && !listeningFull.includes(test)), ...extendDrills(listening.filter((test) => test.shortPractice))], 'practice'),
  ];
  for (const skill of ['writing', 'speaking'] as const) {
    const papers = levels(tests.filter((test) => test.skill === skill));
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      papers.filter((paper) => paper.difficulty === difficulty).forEach((paper, i) => {
        const { test } = paper;
        const specialVisual = test.skill === 'writing' && test.tasks.some((task) => task.diagram || task.visualKind === 'pie');
        const complete = test.skill === 'writing' ? [1, 2].every((task) => test.tasks.some((item) => item.task === task))
          : test.skill === 'speaking' && test.part1.length > 0 && test.part2.length > 0 && test.part3.length > 0;
        const fullPaper = complete && (specialVisual ? Number(test.id.split('-').at(-1)) % 2 === 1 : i % 4 === 0);
        const item = { ...paper, bank: (fullPaper ? 'academic' : 'practice') as PaperBank };
        (item.bank === 'academic' ? academic : practice).push(item);
      });
    }
  }
  return [...academic, ...practice].sort((a, b) => a.test.id.replace(/^practice-/, '').localeCompare(b.test.id.replace(/^practice-/, ''), 'en', { numeric: true }));
}
