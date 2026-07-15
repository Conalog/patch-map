import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: projectRoot,
  publicDir: false,
  server: {
    fs: {
      allow: [projectRoot],
    },
  },
  build: {
    outDir: fileURLToPath(new URL('./.core-v2-lab-dist', import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: fileURLToPath(new URL('./lab/performance-v2/index.html', import.meta.url)),
    },
  },
});
