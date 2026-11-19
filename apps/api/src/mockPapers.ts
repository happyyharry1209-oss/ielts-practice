import { randomInt } from 'node:crypto';
import { MOCK_DURATION } from '@ielts/shared';
import type { AnyTest, ListeningTest, ReadingTest, Skill } from '@ielts/shared';
import { renumberGroups } from './catalog';
import { getContent } from './content';
import { HttpError } from './http';

export type MockPapers = Record<Skill, AnyTest>;

function draw<T>(pool: readonly T[]): T {
  if (!pool.length) throw new HttpError(503, 'mock-bank-unavailable');
  return pool[randomInt(pool.length)]!;
}

export function drawMockPapers(): MockPapers {
  const bank = Array.from(getContent().tests.values());
  const passages = bank.flatMap((test) =>
    test.skill === 'reading' && test.variant === 'academic' && !test.id.startsWith('academic-') && !test.shortPractice ? test.passages : [],
  );
  const thirteen = passages.filter((passage) => passage.questions.length === 13);
  const first = draw(thirteen);
  const second = draw(thirteen.filter((passage) => passage !== first));
  const third = draw(passages.filter((passage) => passage.questions.length === 14));

  const listeningPapers = bank.filter((test): test is ListeningTest => test.skill === 'listening'
    && test.sections.length === 4 && test.sections.every((section) => section.questions.length === 10));
  const listeningSections = [0, 1, 2, 3].map((index) =>
    draw(listeningPapers.map((test) => test.sections[index]!)),
  );


  const reading: ReadingTest = {
    id: 'mock-reading',
    skill: 'reading',
    variant: 'academic',
    title: 'IELTS Academic Reading',
    durationSec: MOCK_DURATION.reading,
    passages: renumberGroups([first, second, third]),
  };
  const listening: ListeningTest = {
    id: 'mock-listening',
    skill: 'listening',
    title: 'IELTS Listening',
    durationSec: MOCK_DURATION.listening,
    sections: renumberGroups(listeningSections),
  };
  const writing = draw(bank.filter((test) => test.skill === 'writing'
    && test.tasks.length === 2 && test.tasks.some((task) => task.task === 1)
    && test.tasks.some((task) => task.task === 2)));
  const speaking = draw(bank.filter((test) => test.skill === 'speaking'
    && test.part2.length === 1 && test.part1.some((topic) => topic.questions.length)
    && test.part3.some((topic) => topic.questions.length)));

  return {
    reading,
    listening,
    writing: { ...writing, durationSec: MOCK_DURATION.writing },
    speaking: { ...speaking, durationSec: MOCK_DURATION.speaking },
  };
}
