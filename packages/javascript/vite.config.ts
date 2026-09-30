import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { normalizePath, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const builtinFontModule = normalizePath(
  fileURLToPath(new URL('./src/assets/builtin-font-payload.ts', import.meta.url)),
);
const builtinFontSource = fileURLToPath(
  new URL('./src/resources/fonts/FiraCode-VF.woff2', import.meta.url),
);
const builtinFontExpression =
  "new URL('../resources/fonts/FiraCode-VF.woff2', import.meta.url).href";
const builtinFontDataImport = 'patch-map-builtin-font-data';

function isPixiDependency(id: string): boolean {
  return id === 'pixi.js' || id.startsWith('pixi.js/');
}

function emitBuiltinFont(): Plugin {
  let emittedFontReference: string | undefined;
  let transformedFontModule = false;
  let externalizedFontData = false;
  return {
    name: 'patch-map-external-builtin-font',
    apply: 'build',
    enforce: 'pre',
    buildStart() {
      transformedFontModule = false;
      externalizedFontData = false;
      const fontBytes = readFileSync(builtinFontSource);
      emittedFontReference = this.emitFile({
        type: 'asset',
        fileName: 'FiraCode-VF.woff2',
        source: fontBytes,
      });
      this.emitFile({
        type: 'asset',
        fileName: 'FiraCode-VF.data.js',
        source: `export default ${JSON.stringify(
          `data:font/woff2;base64,${fontBytes.toString('base64')}`,
        )};\n`,
      });
    },
    resolveId(source, importer) {
      if (source === builtinFontDataImport && importer === builtinFontModule) {
        externalizedFontData = true;
        return { id: './FiraCode-VF.data.js', external: true };
      }
      return null;
    },
    transform(code, id) {
      if (id !== builtinFontModule || !code.includes(builtinFontExpression)) return null;
      if (emittedFontReference === undefined) {
        this.error('built-in font asset was not emitted before transforming its URL');
      }
      transformedFontModule = true;
      return {
        code: code.replace(
          builtinFontExpression,
          `import.meta.ROLLUP_FILE_URL_${emittedFontReference}`,
        ),
        map: null,
      };
    },
    buildEnd(error) {
      if (error !== undefined) return;
      if (!transformedFontModule || !externalizedFontData) {
        this.error('built-in font asset URLs were not linked into the library chunks');
      }
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
