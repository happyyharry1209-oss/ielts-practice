import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Minimal .env loader for the standalone scripts (no dotenv dependency).
 * Existing process.env values always win.
 */
export function loadEnvFiles(root = path.resolve(process.cwd())): void {
  const files = [path.join(root, '.env'), path.join(root, 'apps', 'api', '.env')];
  for (const file of files) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  }
}
