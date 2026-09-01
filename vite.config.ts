import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const builtinFontModule = fileURLToPath(
  new URL('./src/assets/builtin-font-payload.ts', import.meta.url),
);
const builtinFontSource = fileURLToPath(
  new URL('./src/resources/fonts/FiraCode-VF.woff2', import.meta.url),
);
const builtinFontExpression =
  "new URL('../resources/fonts/FiraCode-VF.woff2', import.meta.url).href";
const builtinFontUrlImport = './FiraCode-VF.woff2?url';

function isPixiDependency(id: string): boolean {
  return id === 'pixi.js' || id.startsWith('pixi.js/');
}

function emitBuiltinFont(): Plugin {
  return {
    name: 'patch-map-external-builtin-font',
    apply: 'build',
    enforce: 'pre',
    buildStart() {
      this.emitFile({
        type: 'asset',
        fileName: 'FiraCode-VF.woff2',
        source: readFileSync(builtinFontSource),
      });
    },
    resolveId(source, importer) {
      if (source === builtinFontUrlImport && importer === builtinFontModule) {
        return { id: source, external: true };
      }
      return null;
    },
    transform(code, id) {
      if (id !== builtinFontModule || !code.includes(builtinFontExpression)) return null;
      return {
        code: `import patchMapFiraCodeUrl from '${builtinFontUrlImport}';\n${code.replace(
          builtinFontExpression,
          'patchMapFiraCodeUrl',
        )}`,
        map: null,
      };
    },
  };
}

export default defineConfig({
  plugins: [emitBuiltinFont()],
  build: {
    target: 'es2022',
    sourcemap: false,
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      name: 'PatchMap',
      formats: ['es', 'cjs'],
      fileName: (format) => {
        if (format === 'es') return 'index.js';
        return 'index.cjs';
      },
    },
    rollupOptions: {
      // Consumers must share their Pixi scene graph with PATCH MAP.
      external: isPixiDependency,
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
