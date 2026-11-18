import type { AnyTest, MockSubmission } from '@ielts/shared';

export interface MockStage<T extends AnyTest> {
  id: string;
  test: T;
  deadline: number;
  finish: (submission: MockSubmission) => Promise<void>;
}
