import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // @ielts/shared ships TypeScript source; bundle it so the deployed API is self-contained.
  noExternal: ['@ielts/shared'],
});
