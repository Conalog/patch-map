import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { build as viteBuild } from 'vite';

import {
  EXAMPLE_FILES,
  PACKAGE_NAME,
  projectPackedArtifactPolicy,
} from './artifact-policy.mjs';
import {
  examplesRunnerSource,
  html,
} from './example-runner.mjs';

const execute = promisify(execFile);
const require = createRequire(import.meta.url);

export async function analyzePackedArtifact({ packRecord, tarball }) {
  const files = Array.isArray(packRecord?.files)
    ? packRecord.files
      .map((entry) => entry?.path)
      .filter((entry) => typeof entry === 'string')
      .sort()
    : [];
  const bytes = await readFile(tarball);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return projectPackedArtifactPolicy({ packRecord, files, sha256 });
}

export async function preparePackedConsumer({
  root,
  consumer,
}) {
  const exampleDirectory = path.join(consumer, 'examples');
  await mkdir(exampleDirectory, { recursive: true });
  for (const filename of EXAMPLE_FILES) {
    await copyFile(
      path.join(root, 'examples', filename),
      path.join(exampleDirectory, filename),
    );
  }

  await writeFile(
    path.join(consumer, 'tsconfig.json'),
    `${JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        useDefineForClassFields: true,
        lib: ['ES2022', 'DOM', 'DOM.Iterable'],
        module: 'ESNext',
        moduleResolution: 'Bundler',
        moduleDetection: 'force',
        strict: true,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        noImplicitOverride: true,
        noFallthroughCasesInSwitch: true,
        noUncheckedSideEffectImports: true,
        verbatimModuleSyntax: true,
        isolatedModules: true,
        skipLibCheck: true,
        noEmit: true,
        types: [],
      },
      files: [
        'strict-consumer.ts',
        ...EXAMPLE_FILES.map((filename) => `examples/${filename}`),
      ],
    }, null, 2)}\n`,
  );
  await writeFile(path.join(consumer, 'strict-consumer.ts'), `
import {
  PatchMap,
  type PatchMapDebugSnapshot,
  type PatchMapOptions,
  type PatchMapPointerHoverEvent,
  type PatchMapPointerSelectionChange,
  type PatchMapPresentationSetResult,
  type PatchMapTargetQuery,
  type PatchMapTheme,
} from '${PACKAGE_NAME}';
import {
  PATCH_MAP_HOST_ADAPTER_CAPABILITIES,
  PatchMapHostAdapter,
} from './examples/host-adapter';
// @ts-expect-error PatchMapAdvanced is intentionally not a package export.
import { PatchMapAdvanced } from '${PACKAGE_NAME}';

const Engine: typeof PatchMap = PatchMap;
const highLevelMount: typeof PatchMap.mount = PatchMap.mount;
const mountOptions: PatchMapOptions = {
  container: '#strict-types-only',
  data: [],
  fit: { padding: 24 },
  theme: {
    primary: { default: '#0c73bf', dark: '#063559' },
    gray: { light: '#9eb3c3' },
  },
  selection: {
    allowMultiple: true,
    box: { partialIntersection: true, activationModifier: 'shift' },
    isSelectable: ({ id }) => id !== 'locked-target',
  },
};
const theme: PatchMapTheme = mountOptions.theme ?? {};
const targetSelector: PatchMapTargetQuery = {
  within: 'rack-grid',
  componentId: 'usage',
  type: 'bar',
  scope: 'instances',
};
const capabilities: readonly string[] = PATCH_MAP_HOST_ADAPTER_CAPABILITIES;
const mount: typeof PatchMapHostAdapter.mount = PatchMapHostAdapter.mount;
const snapshot: PatchMapDebugSnapshot | null = null;
declare const mounted: Awaited<ReturnType<typeof PatchMap.mount>>;
const presentationScope = mounted.targets.query({ type: 'item', scope: 'authored' });
const presentationResult: PatchMapPresentationSetResult = mounted.presentation.set(
  'strict:focus',
  {
    scope: presentationScope,
    targets: ['strict-bar-fill'],
    unmatched: { alphaMultiplier: 0.32 },
  },
);
mounted.presentation.clear('strict:focus');
const releaseHover = mounted.pointer.onHover((event: PatchMapPointerHoverEvent) => {
  const targetId: string | null = event.target?.id ?? null;
  void targetId;
});
const releasePointerSelection = mounted.selection.onPointerChange(
  (change: PatchMapPointerSelectionChange) => {
    const selectedCount: number = change.selected.length;
    void selectedCount;
  },
);
// @ts-expect-error targets.compile is intentionally not a public API.
mounted.targets.compile(targetSelector);
// @ts-expect-error data replacement is named replace, not load.
mounted.data.load([]);
// @ts-expect-error detached data is named snapshot, not export.
mounted.data.export();
// @ts-expect-error transforms expose relative intent in the method name.
mounted.transform.move({ id: 'strict-bar-fill' }, [1, 1]);
// @ts-expect-error viewport movement exposes relative intent in the method name.
mounted.viewport.pan(1, 1);
// @ts-expect-error asset diagnostics use a typed status result.
mounted.assets.inspect();
// @ts-expect-error mount rejects unknown options.
PatchMap.mount({ container: '#strict-types-only', unsupportedOption: true });
// @ts-expect-error mount owns the aggregate renderer strategy.
PatchMap.mount({ container: '#strict-types-only', strategy: 'particle' });
mounted.update({
  id: 'strict-bar-fill',
  bar: {
    // @ts-expect-error Non-hot-path bar fill belongs under bar.changes.source.fill.
    fill: '#22c55e',
  },
});
mounted.updateBatch({
  targets: ['strict-bar-width'],
  bar: {
    // @ts-expect-error Non-hot-path bar width belongs under bar.changes.size.width.
    width: [80],
  },
});
void [
  Engine,
  highLevelMount,
  mountOptions,
  theme,
  targetSelector,
  capabilities,
  mount,
  snapshot,
  presentationResult,
  PatchMapAdvanced,
  releaseHover,
  releasePointerSelection,
];
`);
  await writeFile(path.join(consumer, 'examples.html'), html('/examples-runner.ts'));
  await writeFile(path.join(consumer, 'examples-runner.ts'), examplesRunnerSource());
}

export async function verifyPackedConsumerTypes(consumer) {
  const result = await execute(
    'npm',
    ['exec', '--offline', '--', 'tsc', '-p', 'tsconfig.json'],
    {
      cwd: consumer,
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  return Object.freeze({
    strict: true,
    exactOptionalPropertyTypes: true,
    dependencyDeclarationCheck: 'skipped-pixi-peer',
    exitCode: 0,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  });
}

export async function verifyPackedFontArtifacts(consumer) {
  const distribution = path.join(
    consumer,
    'node_modules/@conalog/patch-map/dist',
  );
  const files = await readdir(distribution);
  const esmChunks = files.filter((file) => /^builtin-font-payload-.*\.js$/u.test(file));
  const cjsChunks = files.filter((file) => /^builtin-font-payload-.*\.cjs$/u.test(file));
  if (esmChunks.length !== 1 || cjsChunks.length !== 1) {
    throw new Error('packed font payload must have one ESM chunk and one CJS chunk');
  }

  const font = path.join(distribution, 'FiraCode-VF.woff2');
  const fontData = path.join(distribution, 'FiraCode-VF.data.js');
  const esmPath = path.join(distribution, esmChunks[0]);
  const cjsPath = path.join(distribution, cjsChunks[0]);
  const [esmSource, cjsSource, fontBytes, fontDataSource, esmModule] = await Promise.all([
    readFile(esmPath, 'utf8'),
    readFile(cjsPath, 'utf8'),
    readFile(font),
    readFile(fontData, 'utf8'),
    import(pathToFileURL(esmPath).href),
  ]);
  const dataModulePrefix = 'export default ';
  if (!fontDataSource.startsWith(dataModulePrefix) || !fontDataSource.endsWith(';\n')) {
    throw new Error('packed font data fallback is not an exact ESM default export');
  }
  const dataUrl = JSON.parse(fontDataSource.slice(dataModulePrefix.length, -2));
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:font/woff2;base64,')) {
    throw new Error('packed font data fallback does not export a WOFF2 data URL');
  }
  const fallbackBytes = Buffer.from(dataUrl.split(',', 2)[1], 'base64');
  const cjsModule = require(cjsPath);
  const [esmUrl, cjsUrl] = await Promise.all([
    esmModule.builtinFiraCodeUrl(),
    cjsModule.builtinFiraCodeUrl(),
  ]);
  return Object.freeze({
    esmChunk: esmChunks[0],
    cjsChunk: cjsChunks[0],
    esmReferencesFontAsset: /new URL\(["']FiraCode-VF\.woff2["'], import\.meta\.url\)/u
      .test(esmSource),
    cjsReferencesFontAsset: /pathToFileURL\(__dirname\s*\+\s*["']\/FiraCode-VF\.woff2["']\)/u
      .test(cjsSource),
    esmReferencesDataFallback: /import\(["']\.\/FiraCode-VF\.data\.js["']\)/u
      .test(esmSource),
    cjsReferencesDataFallback: /import\(["']\.\/FiraCode-VF\.data\.js["']\)/u
      .test(cjsSource),
    esmLoadsDataFallback: esmUrl === dataUrl,
    cjsLoadsDataFallback: cjsUrl === dataUrl,
    dataFallbackMatchesFontBytes:
      createHash('sha256').update(fallbackBytes).digest('hex')
      === createHash('sha256').update(fontBytes).digest('hex'),
    cjsRequiresFontAsModule: /require\(["'][^"']*\.woff2["']\)/u.test(cjsSource),
  });
}

export function createPackedProductAlias({ root, consumer }) {
  const sourceRoot = path.resolve(root, 'src');
  const sourceEntry = path.join(sourceRoot, 'index.ts');
  const packedEntry = path.resolve(
    consumer,
    'node_modules/@conalog/patch-map/dist/index.js',
  );
  const resolutions = [];
  const packageImports = [];
  return Object.freeze({
    plugin: {
      name: 'patch-map-packed-product-boundary',
      enforce: 'pre',
      resolveId(source, importer) {
        if (source === PACKAGE_NAME) {
          packageImports.push(Object.freeze({ source, importer: importer ?? null }));
          return null;
        }
        if (typeof importer !== 'string' || !source.startsWith('.')) return null;
        const cleanImporter = importer.split('?', 1)[0];
        const resolved = path.resolve(path.dirname(cleanImporter), source);
        if (
          resolved !== sourceRoot &&
          resolved !== path.join(sourceRoot, 'index') &&
          resolved !== sourceEntry
        ) {
          return null;
        }
        resolutions.push(Object.freeze({ source, importer: cleanImporter }));
        return null;
      },
    },
    probe() {
      return Object.freeze({
        packedEntry,
        resolutionCount: resolutions.length,
        sourceImportResolutionCount: resolutions.filter(({ importer }) =>
          typeof importer === 'string' && !importer.startsWith(consumer)).length,
        packageImportResolutionCount: packageImports.length,
      });
    },
  });
}

export async function verifyPackedProductionBuild({
  consumer,
  outputDirectory,
  aliasPlugin,
}) {
  await viteBuild({
    root: consumer,
    configFile: false,
    logLevel: 'silent',
    plugins: [aliasPlugin],
    build: {
      target: 'es2022',
      sourcemap: false,
      outDir: outputDirectory,
      emptyOutDir: true,
      lib: {
        entry: {
          consumer: path.join(consumer, 'main.js'),
          examples: path.join(consumer, 'examples-runner.ts'),
        },
        formats: ['es'],
        fileName: (_format, entryName) => `${entryName}.js`,
      },
    },
  });
  return Object.freeze({
    productionBundler: 'vite',
    target: 'es2022',
    sourceMap: false,
    entrypoints: Object.freeze(['consumer', 'examples']),
  });
}

export async function readPackedBrowserResult(page, baseUrl, pathname, globalName, timeoutMs) {
  await page.goto(new URL(pathname, baseUrl).href, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    (name) => Object.hasOwn(window, name),
    globalName,
    { timeout: timeoutMs },
  );
  return page.evaluate((name) => window[name], globalName);
}
