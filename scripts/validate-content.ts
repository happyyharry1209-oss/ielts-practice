import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AnyTest } from '../packages/shared/src/index';
import { validateTest } from '../packages/shared/src/index';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT = path.join(ROOT, 'content');
const SKILLS = ['reading', 'listening', 'writing', 'speaking'] as const;

async function main() {
  let errorCount = 0;
  let warningCount = 0;
  let testCount = 0;

  for (const skill of SKILLS) {
    const dir = path.join(CONTENT, skill);
    if (!existsSync(dir)) continue;
    const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
    for (const file of files) {
      const full = path.join(dir, file);
      let test: AnyTest;
      try {
        test = JSON.parse(await readFile(full, 'utf8')) as AnyTest;
      } catch (error) {
        console.error(`✖ ${skill}/${file}: invalid JSON — ${(error as Error).message}`);
        errorCount += 1;
        continue;
      }
      if (test.skill !== skill) {
        console.error(`✖ ${skill}/${file}: skill is "${test.skill}", expected "${skill}"`);
        errorCount += 1;
        continue;
      }
      testCount += 1;
      const result = validateTest(test);
      if (result.errors.length === 0 && result.warnings.length === 0) {
        console.log(`✔ ${skill}/${file} (${test.id})`);
      }
      for (const issue of result.errors) {
        console.error(`✖ [error] ${skill}/${file} ${issue.path}: ${issue.message}`);
        errorCount += 1;
      }
      for (const issue of result.warnings) {
        console.warn(`⚠ [warn]  ${skill}/${file} ${issue.path}: ${issue.message}`);
        warningCount += 1;
      }
    }
  }

  console.log(
    `\n${testCount} test(s) checked — ${errorCount} error(s), ${warningCount} warning(s)`,
  );
  if (errorCount > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
