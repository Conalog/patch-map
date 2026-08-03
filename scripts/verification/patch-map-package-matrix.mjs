import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFile,
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { build as viteBuild } from 'vite';

import {
  auditPackedHostAdapterSource,
  EXAMPLE_FILES,
  PACKAGE_NAME,
  projectPackedArtifactPolicy,
} from './patch-map-package-matrix/artifact-policy.mjs';
import { comparePackedJourneyRuns } from './patch-map-package-matrix/journey-comparison.mjs';
import {
  examplesRunnerSource,
  html,
  journeyRunnerSource,
  matrixRunnerSource,
} from './patch-map-package-matrix/runner-sources.mjs';

const execute = promisify(execFile);
const PACKED_JOURNEY_TIMEOUT_MS = 45_000;
const PACKED_EDITOR_LIFECYCLE_TIMEOUT_MS = 120_000;

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

export async function auditPackedHostAdapter(root) {
  const filename = path.join(root, 'examples/patch-map/host-adapter.ts');
  const source = await readFile(filename, 'utf8');
  return auditPackedHostAdapterSource(source);
}

export async function preparePackedConsumerMatrix({
  root,
  consumer,
  packageDigest,
  codeCommit,
}) {
  const exampleDirectory = path.join(consumer, 'examples');
  await mkdir(exampleDirectory, { recursive: true });
  for (const filename of EXAMPLE_FILES) {
    await copyFile(
      path.join(root, 'examples/patch-map', filename),
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
  type PatchMapTargetQuery,
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
};
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
// @ts-expect-error mount uses container, not the legacy target option.
PatchMap.mount({ target: '#legacy' });
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
  targetSelector,
  capabilities,
  mount,
  snapshot,
  PatchMapAdvanced,
];
`);
  await writeFile(path.join(consumer, 'examples.html'), html('/examples-runner.ts'));
  await writeFile(path.join(consumer, 'matrix.html'), html('/matrix-runner.ts'));
  await writeFile(path.join(consumer, 'journeys.html'), html('/journey-runner.ts'));
  await writeFile(path.join(consumer, 'examples-runner.ts'), examplesRunnerSource());
  await writeFile(path.join(consumer, 'matrix-runner.ts'), matrixRunnerSource());
  await writeFile(
    path.join(consumer, 'journey-runner.ts'),
    journeyRunnerSource({ root, packageDigest, codeCommit }),
  );
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

export function createPackedProductAlias({ root, consumer }) {
  const sourceRoot = path.resolve(root, 'src/patch-map');
  const sourceEntry = path.join(sourceRoot, 'index.ts');
  const packedEntry = path.resolve(
    consumer,
    'node_modules/@conalog/patch-map/dist/index.js',
  );
  const boundaryId = '\0patch-map-packed-product-boundary';
  const resolutions = [];
  return Object.freeze({
    plugin: {
      name: 'patch-map-packed-product-boundary',
      enforce: 'pre',
      resolveId(source, importer) {
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
        return boundaryId;
      },
      load(id) {
        if (id !== boundaryId) return null;
        return [
          `export { PatchMap } from ${JSON.stringify(packedEntry)};`,
          `export * from ${JSON.stringify(sourceEntry)};`,
        ].join('\n');
      },
    },
    probe() {
      return Object.freeze({
        packedEntry,
        resolutionCount: resolutions.length,
        sourceImportResolutionCount: resolutions.filter(({ importer }) =>
          typeof importer === 'string' && !importer.startsWith(consumer)).length,
        packageImportResolutionCount: 0,
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
          matrix: path.join(consumer, 'matrix-runner.ts'),
          journeys: path.join(consumer, 'journey-runner.ts'),
        },
        formats: ['es'],
        fileName: (_format, entryName) => `${entryName}.js`,
      },
    },
  });
  const outputBase = path.basename(outputDirectory);
  await writeFile(
    path.join(consumer, 'journeys-built.html'),
    html(`/${outputBase}/journeys.js`),
  );
  return Object.freeze({
    productionBundler: 'vite',
    target: 'es2022',
    sourceMap: false,
    entrypoints: Object.freeze(['consumer', 'examples', 'matrix', 'journeys']),
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

export async function runPackedJourneyMatrix(page, baseUrl) {
  const globalName = '__PATCH_MAP_PACKAGE_JOURNEY_RUNNER__';
  await page.goto(new URL('journeys-built.html', baseUrl).href, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    (name) => Object.hasOwn(window, name),
    globalName,
    { timeout: 60_000 },
  );
  const journeyIds = await page.evaluate(
    (name) => window[name].journeyIds,
    globalName,
  );
  const runs = [];
  for (const [index, caseId] of journeyIds.entries()) {
    process.stderr.write(
      `[patch-map-package] journey ${index + 1}/${journeyIds.length} ${caseId}\n`,
    );
    const run = await withTimeout(
      page.evaluate(
        ({ name, id }) => window[name].runJourney(id),
        { name: globalName, id: caseId },
      ),
      caseId === 'CSM-036'
        ? PACKED_EDITOR_LIFECYCLE_TIMEOUT_MS
        : PACKED_JOURNEY_TIMEOUT_MS,
      `packed journey ${caseId}`,
    );
    runs.push(run);
  }
  return Object.freeze({
    packageDigest: await page.evaluate(
      (name) => window[name].packageDigest,
      globalName,
    ),
    journeyIds: Object.freeze(journeyIds),
    runs: Object.freeze(runs),
    remainingCanvasCount: await page.locator('canvas').count(),
  });
}

export async function comparePackedJourneys({ root, browserResult, packageDigest }) {
  const expectedDocument = JSON.parse(await readFile(
    path.join(
      root,
      'docs/reference/core-v2-functional-contract/evidence/catalog-normalized-expected.v1.json',
    ),
    'utf8',
  ));
  return comparePackedJourneyRuns({
    browserResult,
    packageDigest,
    expectedDocument,
  });
}

function withTimeout(promise, timeoutMs, label) {
  let timeout;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeout = setTimeout(
        () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
    }),
  ]).finally(() => clearTimeout(timeout));
}
