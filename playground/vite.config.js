import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const playgroundRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(playgroundRoot, '..');

export default defineConfig({
  root: playgroundRoot,
  server: {
    port: 5173,
    fs: {
      allow: [repoRoot],
    },
  },
  resolve: {
    alias: {
      '@patchmap': resolve(repoRoot, 'src/patch-map.ts'),
    },
  },
});
