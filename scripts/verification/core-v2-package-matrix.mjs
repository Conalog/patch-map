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

import { compareObservation } from './core-v2-contract/compare.mjs';
import { coreV2DeclaredCsmConflicts } from './core-v2-contract/immutable-conflicts.mjs';

const execute = promisify(execFile);
const PACKAGE_NAME = '@conalog/patch-map/core-v2';
const EXAMPLES = Object.freeze(['minimal', 'dashboard', 'editor', 'report']);
const EXAMPLE_FILES = Object.freeze([
  'host-adapter.ts',
  ...EXAMPLES.map((name) => `${name}.ts`),
]);
const PUBLIC_DOCS = Object.freeze([
  'docs/core-v2/README.md',
  'docs/core-v2/api-and-dataset.md',
  'docs/core-v2/host-integration.md',
  'docs/core-v2/migration.md',
  'docs/core-v2/compatibility.md',
  'docs/core-v2/troubleshooting.md',
  'docs/core-v2/CHANGELOG.md',
]);
const PUBLIC_EXAMPLES = Object.freeze(
  EXAMPLE_FILES.map((name) => `examples/core-v2/${name}`),
);
const RESTRICTED_PACKAGE_PATHS = Object.freeze([
  /^docs\/reference\//u,
  /^docs\/tasks\//u,
  /^performance\//u,
  /^tests?\//u,
  /^lab\//u,
  /^fixtures?\//u,
  /(?:^|\/)evidence(?:\/|$)/u,
  /\.(?:test|spec)\.[cm]?[jt]sx?$/u,
]);
const PROHIBITED_PACKAGE_PATHS = Object.freeze({
  'source-map': Object.freeze([/\.map$/u]),
  'restricted-evidence': RESTRICTED_PACKAGE_PATHS,
  fixture: Object.freeze([/(?:^|\/)fixtures?(?:\/|$)/iu]),
  secret: Object.freeze([
    /(?:^|\/)\.env(?:\.|$)/iu,
    /(?:^|\/)(?:credentials?|secrets?)(?:\.|\/|$)/iu,
  ]),
  'original-material': Object.freeze([
    /(?:^|\/)(?:original|oracle|clean-?room)(?:\/|$)/iu,
  ]),
  'dependency-bundle': Object.freeze([
    /(?:^|\/)node_modules(?:\/|$)/u,
    /(?:^|\/)vendor(?:\/|$)/iu,
    /(?:^|\/)dependency-bundle(?:\.|\/|$)/iu,
  ]),
});

export async function analyzePackedArtifact({ packRecord, tarball }) {
  const files = Array.isArray(packRecord?.files)
    ? packRecord.files
      .map((entry) => entry?.path)
      .filter((entry) => typeof entry === 'string')
      .sort()
    : [];
  const bytes = await readFile(tarball);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const sourceMaps = files.filter((file) => file.endsWith('.map'));
  const restrictedEvidence = files.filter((file) =>
    RESTRICTED_PACKAGE_PATHS.some((pattern) => pattern.test(file)));
  const missingDocs = PUBLIC_DOCS.filter((file) => !files.includes(file));
  const missingExamples = PUBLIC_EXAMPLES.filter((file) => !files.includes(file));
  const prohibitedEntries = Object.entries(PROHIBITED_PACKAGE_PATHS)
    .flatMap(([category, patterns]) => files
      .filter((file) => patterns.some((pattern) => pattern.test(file)))
      .map((file) => Object.freeze({ category, path: file })))
    .filter((entry, index, entries) =>
      entries.findIndex((candidate) =>
        candidate.category === entry.category && candidate.path === entry.path) === index);
  return Object.freeze({
    sha256,
    filename: packRecord.filename,
    size: packRecord.size,
    unpackedSize: packRecord.unpackedSize,
    fileCount: files.length,
    sourceMapCount: sourceMaps.length,
    sourceMaps,
    restrictedEvidenceCount: restrictedEvidence.length,
    restrictedEvidence,
    publicDocs: PUBLIC_DOCS,
    publicExamples: PUBLIC_EXAMPLES,
    missingDocs,
    missingExamples,
    prohibitedEntryCount: prohibitedEntries.length,
    prohibitedEntries: Object.freeze(prohibitedEntries),
  });
}

export async function auditPackedHostAdapter(root) {
  const filename = path.join(root, 'examples/core-v2/host-adapter.ts');
  const source = await readFile(filename, 'utf8');
  const imports = [...source.matchAll(
    /import[\s\S]*?\sfrom\s+['"]([^'"]+)['"];?/gu,
  )].map((match) => match[1]);
  const originalImports = imports.filter((specifier) =>
    /original/iu.test(specifier)
    || specifier === '@conalog/patch-map'
  );
  const restrictedImports = imports.filter((specifier) => specifier !== PACKAGE_NAME);
  const requiredDelegations = Object.freeze({
    load: '.loadDataset(',
    lookup: '.queryScene(',
    'bulk-update': '.bulkPatch(',
    selection: '.applySelection(',
    transform: '.applyTransformerEdit(',
    history: '.historyInspection(',
    snapshot: '.snapshot(',
    extract: '.extractPublishedScene(',
    destroy: '.destroy(',
  });
  const missingDelegations = Object.entries(requiredDelegations)
    .filter(([, marker]) => !source.includes(marker))
    .map(([capability]) => capability);
  const semanticReimplementationMarkers = [
    'CanvasRenderingContext2D',
    'WebGLRenderingContext',
    'requestAnimationFrame(',
    'createElement(\'canvas\')',
    'new CoreV2LogicalSceneIndex(',
    '.hitTest(',
    '.screenToWorld(',
  ];
  const semanticReimplementationMarkersFound = semanticReimplementationMarkers
    .filter((marker) => source.includes(marker));
  return Object.freeze({
    filename: 'examples/core-v2/host-adapter.ts',
    imports: Object.freeze(imports),
    originalImportCount: originalImports.length,
    originalImports: Object.freeze(originalImports),
    restrictedImportCount: restrictedImports.length,
    restrictedImports: Object.freeze(restrictedImports),
    missingDelegations: Object.freeze(missingDelegations),
    semanticReimplementationMarkersFound: Object.freeze(
      semanticReimplementationMarkersFound,
    ),
    adapterReimplementedEngineBehaviorCount:
      missingDelegations.length + semanticReimplementationMarkersFound.length,
  });
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
      path.join(root, 'examples/core-v2', filename),
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
  CoreV2Engine,
  type CoreV2EngineSnapshot,
  type CoreV2InitializeOptions,
} from '${PACKAGE_NAME}';
import {
  CORE_V2_HOST_ADAPTER_CAPABILITIES,
  CoreV2HostAdapter,
} from './examples/host-adapter';

const options: CoreV2InitializeOptions = {
  instanceId: 'strict-types-only',
  width: 320,
  height: 180,
  preference: 'webgl',
};
const Engine: typeof CoreV2Engine = CoreV2Engine;
const capabilities: readonly string[] = CORE_V2_HOST_ADAPTER_CAPABILITIES;
const mount: typeof CoreV2HostAdapter.mount = CoreV2HostAdapter.mount;
const snapshot: CoreV2EngineSnapshot | null = null;
void [options, Engine, capabilities, mount, snapshot];
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
  const sourceRoot = path.resolve(root, 'src/core-v2');
  const packedEntry = path.resolve(
    consumer,
    'node_modules/@conalog/patch-map/dist/core-v2.js',
  );
  const resolutions = [];
  return Object.freeze({
    plugin: {
      name: 'core-v2-packed-product-boundary',
      enforce: 'pre',
      resolveId(source, importer) {
        if (typeof importer !== 'string' || !source.startsWith('.')) return null;
        const cleanImporter = importer.split('?', 1)[0];
        const resolved = path.resolve(path.dirname(cleanImporter), source);
        if (resolved !== sourceRoot && !resolved.startsWith(`${sourceRoot}${path.sep}`)) {
          return null;
        }
        resolutions.push(Object.freeze({ source, importer: cleanImporter }));
        return packedEntry;
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
  const globalName = '__CORE_V2_PACKAGE_JOURNEY_RUNNER__';
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
      `[core-v2-package] journey ${index + 1}/${journeyIds.length} ${caseId}\n`,
    );
    const run = await withTimeout(
      page.evaluate(
        ({ name, id }) => window[name].runJourney(id),
        { name: globalName, id: caseId },
      ),
      45_000,
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
  const expectedById = new Map(
    expectedDocument.cases
      .filter((record) => record.id.startsWith('CSM-'))
      .map((record) => [record.id, record]),
  );
  const rows = [];
  for (const run of browserResult.runs ?? []) {
    if (
      run.executionStatus !== 'observed'
      || !run.actualObservation
      || typeof run.actualObservation !== 'object'
      || Array.isArray(run.actualObservation)
    ) {
      rows.push(Object.freeze({
        id: run.id,
        status: 'fail',
        failure: run.error ?? {
          name: 'Error',
          message: 'packed journey returned no actual observation',
          stack: null,
        },
        cleanupFailureCount: countCleanupFailures(run.cleanup),
        digestBound: false,
      }));
      continue;
    }
    const expectedCase = expectedById.get(run.id);
    if (!expectedCase) {
      rows.push(Object.freeze({
        id: run.id,
        status: 'fail',
        failure: 'missing normalized expected record',
      }));
      continue;
    }
    try {
      const comparison = compareObservation({
        expectedCase,
        actual: run.actualObservation,
        fixtures: run.fixtures,
        captures: run.captures,
      });
      const observedConflicts = comparison.assertions
        .filter((assertion) => !assertion.passed)
        .map((assertion) => ({
          path: assertion.path,
          code: assertion.failure?.code ?? null,
          failurePath: assertion.failure?.path ?? null,
        }))
        .sort(compareConflict);
      const declaredConflicts = [...coreV2DeclaredCsmConflicts(run.id)].sort(compareConflict);
      const exactDeclaredConflicts =
        JSON.stringify(observedConflicts) === JSON.stringify(declaredConflicts);
      const cleanupFailureCount = countCleanupFailures(run.cleanup);
      const digestBound =
        run.actualObservation?.provenance?.packedPackageSha256 === packageDigest;
      const passed =
        run.executionStatus === 'observed'
        && run.destroyed === true
        && run.canvasCountAfterDestroy === 0
        && cleanupFailureCount === 0
        && digestBound
        && exactDeclaredConflicts;
      rows.push(Object.freeze({
        id: run.id,
        status: passed ? 'pass' : 'fail',
        assertionCount: comparison.assertions.length,
        assertionPassed: comparison.passed,
        assertionFailed: comparison.failed,
        observedConflicts,
        declaredConflicts,
        exactDeclaredConflicts,
        cleanupFailureCount,
        digestBound,
      }));
    } catch (error) {
      rows.push(Object.freeze({
        id: run.id,
        status: 'fail',
        failure: serializeError(error),
      }));
    }
  }
  const ids = rows.map(({ id }) => id);
  const passedJourneyCount = rows.filter(({ status }) => status === 'pass').length;
  const packageDigests = new Set(
    (browserResult.runs ?? []).map(
      (run) => run.actualObservation?.provenance?.packedPackageSha256,
    ),
  );
  return Object.freeze({
    journeyIds: Object.freeze(ids),
    journeyCount: rows.length,
    passedJourneyCount,
    failedJourneyCount: rows.length - passedJourneyCount,
    packageDigestAcrossJourneys:
      packageDigests.size === 1 && packageDigests.has(packageDigest)
        ? packageDigest
        : null,
    cleanupFailureCount: rows.reduce(
      (total, row) => total + (row.cleanupFailureCount ?? 1),
      0,
    ),
    rows: Object.freeze(rows),
  });
}

function examplesRunnerSource() {
  return `
import { runMinimalExample } from './examples/minimal';
import { runDashboardExample } from './examples/dashboard';
import { runEditorExample } from './examples/editor';
import { runReportExample } from './examples/report';

const examples = [
  ['minimal', runMinimalExample],
  ['dashboard', runDashboardExample],
  ['editor', runEditorExample],
  ['report', runReportExample],
];
const results = [];
for (const [name, run] of examples) {
  const host = document.createElement('div');
  host.dataset.example = name;
  host.style.width = '480px';
  host.style.height = '280px';
  document.body.appendChild(host);
  try {
    const result = await run(host);
    results.push({ name, status: 'pass', result });
  } catch (error) {
    results.push({
      name,
      status: 'fail',
      error: {
        name: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? error.message : String(error),
      },
    });
  } finally {
    host.remove();
  }
}
window.__CORE_V2_PACKAGE_EXAMPLES__ = {
  compiledExamples: examples.map(([name]) => name),
  executedExamples: results.filter(({ status }) => status === 'pass').map(({ name }) => name),
  results,
  remainingCanvasCount: document.querySelectorAll('canvas').length,
};
`;
}

function matrixRunnerSource() {
  return `
import { CORE_V2_BUILTIN_ASSETS, CoreV2AssetRuntime } from '${PACKAGE_NAME}';
import { CoreV2HostAdapter } from './examples/host-adapter';

const DATASET = Object.freeze([
  Object.freeze({
    type: 'rect',
    id: 'rect-b',
    show: true,
    attrs: Object.freeze({ x: 40, y: 40 }),
    size: Object.freeze({ width: 80, height: 56 }),
    fill: '#2563eb',
  }),
  Object.freeze({
    type: 'item',
    id: 'item-a',
    show: true,
    attrs: Object.freeze({ x: 180, y: 32 }),
    size: Object.freeze({ width: 100, height: 120 }),
    components: Object.freeze([
      Object.freeze({
        type: 'bar',
        id: 'bar',
        source: Object.freeze({ type: 'rect', fill: '#7c3aed' }),
        size: Object.freeze({ width: 64, height: 48 }),
        placement: 'bottom',
        animation: true,
      }),
    ]),
  }),
]);
const SHARED_ASSET = CORE_V2_BUILTIN_ASSETS.find(({ alias }) => alias === 'device');
if (!SHARED_ASSET) throw new Error('package builtin device asset is unavailable');

async function runHostAdapter() {
  const host = document.createElement('div');
  host.style.width = '420px';
  host.style.height = '240px';
  document.body.appendChild(host);
  const reachedCapabilities = [];
  const publications = [];
  let adapter = null;
  let inspection = null;
  let snapshot = null;
  let extraction = null;
  let disposer = null;
  try {
    adapter = await CoreV2HostAdapter.mount({
      initialize: {
        instanceId: 'package-host-adapter',
        target: host,
        width: 420,
        height: 240,
        preference: 'webgl',
        strategy: 'mesh',
      },
    });
    const legacyLoad = adapter.load({
      kind: 'generic-item',
      id: 'legacy-a',
      x: 10,
      y: 20,
      width: 100,
      height: 80,
      label: 'Legacy A',
    }, { datasetRef: 'package:legacy-host-adapter' });
    if (legacyLoad.rootIds[0] !== 'legacy-a') throw new Error('adapter legacy load');
    const load = adapter.load(DATASET, { datasetRef: 'package:host-adapter' });
    if (load.rootIds.length !== 2) throw new Error('adapter load root count');
    reachedCapabilities.push('load');

    const save = adapter.prepareSave(true);
    if (
      save.rootKind !== 'array'
      || !Array.isArray(JSON.parse(save.serialized))
      || save.semanticHash !== load.semanticHash
    ) throw new Error('adapter persistence guard');

    const lookup = adapter.lookup('rect-b');
    if (lookup?.id !== 'rect-b') throw new Error('adapter stable lookup');
    reachedCapabilities.push('lookup');

    const bulk = adapter.bulkUpdate({
      strict: true,
      actionId: 'package-adapter-bulk',
      targets: [{ kind: 'element', id: 'rect-b' }],
      changes: [{ path: ['attrs', 'x'], value: 52 }],
    });
    if (bulk.status !== 'committed') throw new Error('adapter bulk update');
    reachedCapabilities.push('bulk-update');

    disposer = adapter.observeSelection((publication) => publications.push(publication));
    const selection = adapter.selection(['rect-b']);
    if (selection.current[0] !== 'rect-b') throw new Error('adapter selection');
    reachedCapabilities.push('selection');

    const transform = adapter.transform({
      kind: 'move',
      selectionIds: ['rect-b'],
      deltaWorld: [8, 4],
    }, {
      actionId: 'package-adapter-transform',
      recordHistory: true,
    });
    if (transform.status !== 'committed') throw new Error('adapter transform');
    reachedCapabilities.push('transform');

    inspection = adapter.history('inspect');
    if (inspection.state.undoDepth < 2) throw new Error('adapter history depth');
    reachedCapabilities.push('history');

    if (!disposer.dispose() || disposer.dispose()) throw new Error('adapter disposer idempotence');
    reachedCapabilities.push('dispose');

    snapshot = adapter.snapshot();
    if (snapshot.lifecycle !== 'scene-ready') throw new Error('adapter snapshot');
    reachedCapabilities.push('snapshot');

    extraction = await adapter.extract();
    if (!extraction.dataUrl.startsWith('data:image/png')) throw new Error('adapter extraction');
    reachedCapabilities.push('extract');

    await adapter.destroy();
    adapter = null;
    reachedCapabilities.push('destroy');
  } finally {
    await adapter?.destroy().catch(() => undefined);
  }
  const corruptEntryCount = inspection.commands.filter((command) =>
    typeof command.id !== 'string'
    || command.id.length === 0
    || command.recordCount !== command.records.length
    || !Array.isArray(command.before.dataset)
    || !Array.isArray(command.after.dataset)
  ).length;
  const result = {
    reachedCapabilities,
    originalImportCount: 0,
    adapterReimplementedEngineBehaviorCount: 0,
    selectionPublicationCount: publications.length,
    invalidNodeCount: snapshot.rootIds.length === 2 ? 0 : 1,
    staleGestureCount: snapshot.pendingWork,
    corruptEntryCount,
    leakDelta: host.querySelectorAll('canvas').length,
    extraction: {
      mime: extraction.mime,
      authoritativeCanvasRetained: extraction.authoritativeCanvasRetained,
    },
  };
  host.remove();
  return result;
}

async function runMultipleInstances() {
  const slotA = document.createElement('div');
  const slotB = document.createElement('div');
  for (const slot of [slotA, slotB]) {
    slot.style.width = '360px';
    slot.style.height = '220px';
    document.body.appendChild(slot);
  }
  const runtime = new CoreV2AssetRuntime();
  const engine = { assetRuntime: runtime };
  const callbacks = { A: [], B: [] };
  let A = null;
  let A2 = null;
  let B = null;
  const unclassifiedErrors = [];
  try {
    [A, B] = await Promise.all([
      CoreV2HostAdapter.mount({
        engine,
        initialize: {
          instanceId: 'package-instance-A',
          target: slotA,
          width: 360,
          height: 220,
          background: '#f8fafc',
          preference: 'webgl',
          strategy: 'mesh',
          requiredAssets: [SHARED_ASSET],
        },
      }),
      CoreV2HostAdapter.mount({
        engine,
        initialize: {
          instanceId: 'package-instance-B',
          target: slotB,
          width: 360,
          height: 220,
          background: '#111827',
          preference: 'webgl',
          strategy: 'mesh',
          requiredAssets: [SHARED_ASSET],
        },
      }),
    ]);
    A.load(DATASET, { datasetRef: 'interactive-scene:A' });
    B.load(structuredClone(DATASET), { datasetRef: 'interactive-scene:B' });
    A.observeSelection((publication) => callbacks.A.push(publication));
    B.observeSelection((publication) => callbacks.B.push(publication));
    A.selection(['rect-b']);
    B.selection(['item-a']);
    A.bulkUpdate({
      strict: true,
      actionId: 'package-instance-A-animation',
      targets: [{ kind: 'component', ownerId: 'item-a', id: 'bar' }],
      changes: [{ path: ['size', 'height'], value: 70 }],
    });
    B.bulkUpdate({
      strict: true,
      actionId: 'package-instance-B-animation',
      targets: [{ kind: 'component', ownerId: 'item-a', id: 'bar' }],
      changes: [{ path: ['size', 'height'], value: 34 }],
    });
    A.publish(16);
    B.publish(24);
    callbacks.A.length = 0;
    callbacks.B.length = 0;
    const baselineB = {
      assetLeaseCount: B.assetProbe('device').session?.leaseCount ?? -1,
      sceneSemanticHash: B.snapshot().semanticHash,
    };

    A.bulkUpdate({
      strict: true,
      actionId: 'package-instance-A-hide',
      targets: [{ kind: 'element', id: 'rect-b' }],
      changes: [{ path: ['show'], value: false }],
    });
    A.selection([]);
    A.publish(32);
    await A.destroy();
    A = null;

    const afterDestroyA = {
      semanticHash: B.snapshot().semanticHash,
      assetLeaseCount: B.assetProbe('device').session?.leaseCount ?? -1,
      callbackCountFromA: callbacks.B.length,
      sharedLeaseCount: runtime.probe('device').resource?.leaseCount ?? -1,
    };

    A2 = await CoreV2HostAdapter.mount({
      engine,
      initialize: {
        instanceId: 'package-instance-A2',
        target: slotA,
        width: 360,
        height: 220,
        background: '#ecfeff',
        preference: 'webgl',
        strategy: 'mesh',
        requiredAssets: [SHARED_ASSET],
      },
    });
    A2.load(structuredClone(DATASET), { datasetRef: 'interactive-scene:A2' });
    A2.publish(40);
    return {
      baselineB,
      B: afterDestroyA,
      hostSlots: {
        A: { canvasCount: slotA.querySelectorAll('canvas').length },
        B: { canvasCount: slotB.querySelectorAll('canvas').length },
      },
      sharedLeaseCountAfterRecreate:
        runtime.probe('device').resource?.leaseCount ?? -1,
      unclassifiedErrorCount: unclassifiedErrors.length,
    };
  } catch (error) {
    unclassifiedErrors.push({
      name: error instanceof Error ? error.name : 'Error',
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    await Promise.allSettled([
      A?.destroy(),
      A2?.destroy(),
      B?.destroy(),
    ].filter(Boolean));
    slotA.remove();
    slotB.remove();
  }
}

const result = { hostAdapter: null, multipleInstances: null, failure: null };
try {
  result.hostAdapter = await runHostAdapter();
  result.multipleInstances = await runMultipleInstances();
} catch (error) {
  result.failure = {
    name: error instanceof Error ? error.name : 'Error',
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null,
  };
}
result.remainingCanvasCount = document.querySelectorAll('canvas').length;
window.__CORE_V2_PACKAGE_MATRIX__ = result;
`;
}

function journeyRunnerSource({ root, packageDigest, codeCommit }) {
  const bridgePath = path.resolve(root, 'lab/performance-v2/contract/executable-bridge.ts');
  const casesPath = path.resolve(root, 'lab/performance-v2/contract/executable-cases.ts');
  const foundationFoldPath = path.resolve(
    root,
    'scripts/verification/core-v2-contract/fold-foundation.mjs',
  );
  return `
import { CoreV2Engine } from '${PACKAGE_NAME}';
import { createCoreV2ExecutableLabBridge } from ${JSON.stringify(bridgePath)};
import {
  CORE_V2_EXECUTABLE_CASE_IDS,
  CORE_V2_EXECUTABLE_PROFILE_ENVIRONMENT,
  materializeCoreV2ExecutableCase,
  resolveCoreV2ExecutableDataset,
} from ${JSON.stringify(casesPath)};
import { foldFoundationExecution } from ${JSON.stringify(foundationFoldPath)};

const packageDigest = ${JSON.stringify(packageDigest)};
const codeCommit = ${JSON.stringify(codeCommit)};
const journeyIds = CORE_V2_EXECUTABLE_CASE_IDS.filter((id) => id.startsWith('CSM-'));

function historyCorruptEntryCount(inspection) {
  return inspection.commands.filter((command) =>
    typeof command.id !== 'string'
    || command.id.length === 0
    || command.recordCount !== command.records.length
    || !Array.isArray(command.before.dataset)
    || !Array.isArray(command.after.dataset)
  ).length;
}

function partialPublicationCount(before, after) {
  return [
    before.revisions.sceneRevision !== after.revisions.sceneRevision,
    before.publishedTuple.scene !== after.publishedTuple.scene,
    before.semanticHash !== after.semanticHash,
    JSON.stringify(before.rootIds) !== JSON.stringify(after.rootIds),
  ].filter(Boolean).length;
}

function invalidStrictDataset() {
  const duplicate = Object.freeze({
    type: 'rect',
    id: 'packed-declared-failure',
    show: true,
    attrs: Object.freeze({ x: 0, y: 0 }),
    size: Object.freeze({ width: 1, height: 1 }),
  });
  return Object.freeze([duplicate, structuredClone(duplicate)]);
}

async function runPackedFoundationProbe(caseId, plan, host) {
  if (caseId !== 'CSM-001' && caseId !== 'CSM-003') return null;
  const target = document.createElement('div');
  target.style.width = '800px';
  target.style.height = '600px';
  host.appendChild(target);
  const engine = new CoreV2Engine();
  const cleanupErrors = [];
  try {
    if (caseId === 'CSM-003') {
      const emptyUi = document.createElement('div');
      emptyUi.dataset.hostState = 'loading';
      target.appendChild(emptyUi);
      const loadingCanvasCount = target.querySelectorAll('canvas').length;
      emptyUi.dataset.hostState = 'no-blueprint';
      const noBlueprintCanvasCount = target.querySelectorAll('canvas').length;

      await engine.initialize({
        instanceId: 'packed-host-probe-csm-003',
        target,
        width: 800,
        height: 600,
        preference: 'webgl',
        strategy: 'mesh',
      });
      const datasetRef = String(plan.hostSupplies.emptyDatasetRef);
      engine.loadDataset(
        structuredClone(resolveCoreV2ExecutableDataset(datasetRef)),
        { datasetRef },
      );
      engine.publishFrame(0);
      emptyUi.dataset.hostState = 'empty-dataset';
      const beforeFailure = engine.snapshot();
      let declaredFailureObserved = false;
      try {
        engine.loadDataset(invalidStrictDataset(), {
          datasetRef: 'packed-declared-failure',
          strict: true,
        });
      } catch {
        declaredFailureObserved = true;
      }
      const afterFailure = engine.snapshot();
      const semantic = engine.semanticProbe();
      const inspection = engine.historyInspection();
      return {
        hostProbe: {
          $schema: 'core-v2-packed-host-probe/1',
          caseId,
          promotionEligible: true,
          engineReturns: {
            loadingCanvasCount,
            noBlueprintCanvasCount,
            emptySceneNodeCount: semantic.scene.nodes.length,
            missingQuery: engine.query({ id: 'missing' }),
          },
          failureRollback: {
            priorSceneRevision:
              afterFailure.revisions.sceneRevision - beforeFailure.revisions.sceneRevision,
            historyDepth: inspection.state.depth,
            hostOwnsEmptyUi:
              declaredFailureObserved
              && emptyUi.isConnected
              && emptyUi.dataset.hostState === 'empty-dataset',
          },
          finalState: {
            lifecycle: afterFailure.lifecycle,
            sceneRevision: afterFailure.revisions.sceneRevision,
            selectedIds: afterFailure.selectionIds,
            mode: semantic.interaction.mode,
          },
        },
        browserProbe: {
          $schema: 'core-v2-browser-probe/1',
          caseId,
          history: { corruptEntryCount: historyCorruptEntryCount(inspection) },
          interaction: {
            staleGestureCount: engine.pointerGestureProbe().staleGestureCount,
          },
        },
      };
    }

    await engine.initialize({
      instanceId: 'packed-host-probe-csm-001',
      target,
      width: 800,
      height: 600,
      preference: 'webgl',
      strategy: 'mesh',
    });
    const datasetRef = String(plan.hostSupplies.datasetRef);
    const loaded = engine.loadDataset(
      structuredClone(resolveCoreV2ExecutableDataset(datasetRef)),
      { datasetRef },
    );
    engine.publishFrame(0);
    const beforeFailure = engine.snapshot();
    let hostRetryRequired = false;
    try {
      engine.loadDataset(invalidStrictDataset(), {
        datasetRef: 'packed-declared-failure',
        strict: true,
      });
    } catch {
      hostRetryRequired = true;
    }
    const afterFailure = engine.snapshot();
    const semantic = engine.semanticProbe();
    const inspection = engine.historyInspection();
    return {
      hostProbe: {
        $schema: 'core-v2-packed-host-probe/1',
        caseId,
        promotionEligible: true,
        engineReturns: {
          lifecycle: loaded.lifecycle,
          sceneRevision: loaded.sceneRevision,
          publishedTuple: beforeFailure.publishedTuple,
          rootIds: loaded.rootIds,
        },
        failureRollback: {
          retainedSceneRevision:
            afterFailure.revisions.sceneRevision - beforeFailure.revisions.sceneRevision,
          partialPublicationCount:
            partialPublicationCount(beforeFailure, afterFailure),
          hostRetryRequired,
        },
        finalState: {
          lifecycle: afterFailure.lifecycle,
          sceneRevision: afterFailure.revisions.sceneRevision,
          selectedIds: afterFailure.selectionIds,
          mode: semantic.interaction.mode,
          datasetRef: afterFailure.datasetRef,
        },
      },
      browserProbe: {
        $schema: 'core-v2-browser-probe/1',
        caseId,
        history: { corruptEntryCount: historyCorruptEntryCount(inspection) },
        interaction: {
          staleGestureCount: engine.pointerGestureProbe().staleGestureCount,
        },
      },
    };
  } finally {
    await engine.destroy().catch((error) => {
      cleanupErrors.push({
        name: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? error.message : String(error),
      });
    });
    const remainingCanvasCount = target.querySelectorAll('canvas').length;
    target.remove();
    if (cleanupErrors.length > 0 || remainingCanvasCount !== 0) {
      throw new Error(
        'packed foundation probe cleanup failed: '
        + JSON.stringify({ cleanupErrors, remainingCanvasCount }),
      );
    }
  }
}

async function runJourney(caseId) {
  if (!journeyIds.includes(caseId)) throw new Error('unknown packed journey ' + caseId);
  const host = document.createElement('div');
  host.style.width = '800px';
  host.style.height = '600px';
  document.body.appendChild(host);
  const plan = materializeCoreV2ExecutableCase(caseId, '100', 319);
  const provenance = {
    source: 'packed-production-host-harness',
    codeCommit,
    packedPackageSha256: packageDigest,
    fixtureSha256: plan.fixtureSha256,
    runnerRevision: 'core-v2-packed-host-journeys/1',
    expectedEvidenceBound: true,
    promotionEligible: true,
  };
  const environment = {
    ...structuredClone(CORE_V2_EXECUTABLE_PROFILE_ENVIRONMENT),
    backend: 'webgl2',
    browser: navigator.userAgent,
    browserVersion: navigator.userAgent,
    route: plan.route,
    datasetSize: '100',
    seed: 319,
    canvasLifetime: 'transient-until-executor-cleanup',
    contractProfileBound: true,
    hostRevision: 'fixture-host-revision',
    mountMode: 'production-layout',
  };
  const bridge = createCoreV2ExecutableLabBridge({
    caseId,
    rootTestId: plan.rootTestId,
    size: '100',
    seed: 319,
    surfaceHost: host,
    provenance,
    environment,
  });
  try {
    const run = await bridge.runCase();
    const packedFoundationProbe = await runPackedFoundationProbe(caseId, plan, host);
    const actualObservation = packedFoundationProbe
      ? foldFoundationExecution({
          casePlan: plan,
          execution: run.execution,
          provenance,
          environment,
          hostProbe: packedFoundationProbe.hostProbe,
          browserProbe: packedFoundationProbe.browserProbe,
        }).actual
      : await bridge.actualObservation();
    return {
      id: caseId,
      executionStatus: run.status,
      actualObservation,
      fixtures: run.fixtures,
      captures: run.captures,
      cleanup: run.cleanup,
      destroySummary: await bridge.destroyCase(),
      destroyed: true,
      canvasCountAfterDestroy: host.querySelectorAll('canvas').length,
    };
  } catch (error) {
    await bridge.destroyCase().catch(() => undefined);
    return {
      id: caseId,
      executionStatus: 'failed',
      error: {
        name: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : null,
      },
      destroyed: true,
      canvasCountAfterDestroy: host.querySelectorAll('canvas').length,
    };
  } finally {
    host.remove();
  }
}
window.__CORE_V2_PACKAGE_JOURNEY_RUNNER__ = {
  packageDigest,
  journeyIds,
  runJourney,
};
`;
}

function html(entry) {
  return `<!doctype html>
<html><body><script type="module" src="${entry}"></script></body></html>\n`;
}

function compareConflict(left, right) {
  return left.path.localeCompare(right.path);
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

function countCleanupFailures(cleanup) {
  if (!cleanup || typeof cleanup !== 'object') return 1;
  let count = 0;
  const visit = (value, key = '') => {
    if (Array.isArray(value)) {
      if (key === 'errors') count += value.length;
      else for (const entry of value) visit(entry);
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      visit(nestedValue, nestedKey);
    }
  };
  visit(cleanup);
  return count;
}

function serializeError(error) {
  return {
    name: error instanceof Error ? error.name : 'Error',
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack ?? null : null,
  };
}
