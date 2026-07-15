import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: false,
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(new URL('./src/core-v1/index.ts', import.meta.url)),
      name: 'PatchMapCore',
      formats: ['es', 'cjs', 'umd'],
      fileName: (format) => {
        if (format === 'es') return 'core-v1.js';
        if (format === 'cjs') return 'core-v1.cjs';
        return 'core-v1.umd.js';
      },
    },
  },
});
