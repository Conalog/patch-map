import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

function isPixiDependency(id: string): boolean {
  return id === 'pixi.js' || id.startsWith('pixi.js/');
}

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: true,
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      name: 'PatchMap',
      formats: ['es', 'cjs', 'umd'],
      fileName: (format) => {
        if (format === 'es') return 'index.js';
        if (format === 'cjs') return 'index.cjs';
        return 'index.umd.js';
      },
    },
    rollupOptions: {
      // Consumers must share their Pixi scene graph with PATCH MAP. The other
      // runtime helpers are bundled so the documented UMD usage needs only PIXI.
      external: isPixiDependency,
      output: {
        globals: {
          'pixi.js': 'PIXI',
        },
      },
    },
  },
  test: {
    root: projectRoot,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
    clearMocks: true,
    restoreMocks: true,
  },
});
