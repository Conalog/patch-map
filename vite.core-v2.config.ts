import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: false,
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(new URL('./src/core-v2/index.ts', import.meta.url)),
      name: 'PatchMapCoreV2',
      formats: ['es', 'cjs'],
      fileName: (format) => format === 'es' ? 'core-v2.js' : 'core-v2.cjs',
    },
    rollupOptions: {
      external: ['pixi.js', 'pixi.js/prepare'],
    },
  },
});
