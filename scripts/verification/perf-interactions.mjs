import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const canonicalSizes = Object.freeze([1_000, 2_000]);
const fullCommitPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const defaults = Object.freeze({
  cpuThrottle: 1,
  deviceScaleFactor: 1,
  iterations: 7,
  sizes: [1_000, 2_000],
  viewport: { height: 900, width: 1440 },
  warmups: 2,
});
const canonicalCommand = [
  'node scripts/verification/perf-interactions.mjs',
  '--cpu-throttle 4 --warmups 2 --iterations 7 --sizes 1000,2000',
  '--commit <full-implementation-commit-sha>',
  '--device-profile "low-end-windows-a"',
  '--power-mode "best-performance"',
  '--output .perf-results/perf-interactions-4x.json',
].join(' ');

const options = parseArgs(process.argv.slice(2));
const server = await startServer();
let browser;
let compatibilityFailure;

try {
  browser = await chromium.launch({
    headless: true,
    args: ['--enable-precise-memory-info'],
  });
  const context = await browser.newContext({
    deviceScaleFactor: defaults.deviceScaleFactor,
    viewport: defaults.viewport,
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const text = message.text();
      pageErrors.push(`console: ${text}`);
      process.stderr.write(`${text}\n`);
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push(`pageerror: ${error.message}`);
    process.stderr.write(`${error.stack ?? error.message}\n`);
  });

  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', {
    rate: options.cpuThrottle,
  });

  const harnessUrl = new URL(
    '/scripts/verification/perf-interactions-harness.html',
    server.resolvedUrls.local[0],
  );
  const response = await page.goto(harnessUrl.href, { waitUntil: 'networkidle' });
  assert(response?.ok(), `Harness failed with status ${response?.status()}`);
  await page.waitForFunction(
    () => Boolean(globalThis.patchMapInteractionsPerf),
  );

  const browserEnvironment = await readBrowserEnvironment(page);
  const scenarios = [];
  for (const itemCount of options.sizes) {
    process.stdout.write(`${itemCount} items: `);
    for (let index = 0; index < options.warmups; index += 1) {
      process.stdout.write(`warmup ${index + 1}/${options.warmups} `);
      await runSample(page, itemCount);
    }
    const samples = [];
    for (let index = 0; index < options.iterations; index += 1) {
      process.stdout.write(`sample ${index + 1}/${options.iterations} `);
      samples.push(await runSample(page, itemCount));
    }
    process.stdout.write('done\n');
    scenarios.push({
      itemCount,
      ...summarizeScenario(samples),
      samples,
    });
  }

  const assertions = scenarios.flatMap((scenario) =>
    scenario.samples.flatMap((sample, sampleIndex) =>
      sample.assertions.map((entry) => ({
        ...entry,
        itemCount: scenario.itemCount,
        sampleIndex,
      }))),
  );
  if (pageErrors.length > 0) {
    assertions.push({
      details: pageErrors,
      name: 'browser-emitted-no-uncaught-errors',
      pass: false,
    });
  }
  const failedAssertions = assertions.filter((entry) => !entry.pass);
  const canonical = assessCanonicalRun(options);
  const verificationPass = failedAssertions.length === 0;
  const evidenceStatus = classifyEvidence(
    canonical.eligible,
    verificationPass,
    options.cpuThrottle,
  );
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    target: {
      commit: options.commit,
      entry: '/src/index.ts',
      label: options.label,
      side: 'cleanroom-replacement',
    },
    environment: {
      architecture: os.arch(),
      cpu: os.cpus()[0]?.model ?? 'unknown',
      cpuThrottle: options.cpuThrottle,
      deviceProfile: options.deviceProfile,
      deviceScaleFactor: defaults.deviceScaleFactor,
      logicalCores: os.cpus().length,
      node: process.version,
      osRelease: os.release(),
      osVersion: os.version(),
      platform: process.platform,
      powerMode: options.powerMode,
      totalMemoryBytes: os.totalmem(),
      viewport: defaults.viewport,
      ...browserEnvironment,
    },
    run: {
      canonical,
      canonicalCommand,
      evidenceStatus,
      interactionInput:
        'actual Playwright mouse input for hit, hover, box, paint, resize, and rotation',
      iterations: options.iterations,
      noisePolicy: 'provisional when any p95/median ratio exceeds 1.35',
      quick: options.quick,
      renderBoundary:
        'S3 synchronous return, explicit app.render, then next requestAnimationFrame',
      sizes: options.sizes,
      warmups: options.warmups,
      windowsNativeGate:
        evidenceStatus === 'candidate-windows-native'
          ? 'candidate'
          : 'pending',
    },
    workloadCoverage: {
      s3: [
        'trusted bulk component update',
        'sequential per-item mixed component updates',
        'public live-handle alpha and tint highlight',
        'relation visibility and approved empty-link refresh',
      ],
      s4: [
        'public viewport pan and zoom',
        'actual pointer hit testing',
        'actual pointer hover',
        'actual box selection',
        'actual paint selection',
        'actual Transformer resize',
        'actual Transformer rotation',
      ],
      sourceBoundary:
        'approved performance/public contracts, public package entry, public '
        + 'PixiJS/pixi-viewport surfaces, and approved synthetic fixture only',
    },
    caveats: [
      'The approved schema has no separate highlight property; the workload '
        + 'uses public Pixi Container alpha and tint without inventing one.',
      'The approved handoff publishes no non-empty relation link shape; link '
        + 'refresh coverage is limited to approved empty links.',
      'Headless explicit render and rAF timing are proxy evidence; headed '
        + 'Windows native visible-pixel and interaction gates remain pending.',
    ],
    verification: {
      assertionCount: assertions.length,
      failedAssertionCount: failedAssertions.length,
      failedAssertions,
      pageErrors,
      pass: verificationPass,
    },
    scenarios,
  };

  const outputPath = resolvePerfOutput(options.output, report.generatedAt);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`Wrote ${path.relative(root, outputPath)}\n`);
  process.stdout.write(
    `Compatibility assertions: ${report.verification.pass ? 'PASS' : 'FAIL'} `
      + `(${failedAssertions.length}/${assertions.length} failed)\n`,
  );
  if (!verificationPass) {
    compatibilityFailure = new Error(
      `${failedAssertions.length} compatibility assertion(s) failed; `
        + `report preserved at ${path.relative(root, outputPath)}`,
    );
  }
  await context.close();
} finally {
  await browser?.close();
  await server.close();
}

if (compatibilityFailure) throw compatibilityFailure;

async function runSample(page, itemCount) {
  await page.evaluate(
    (count) => globalThis.patchMapInteractionsPerf.setup(count),
    itemCount,
  );
  try {
    const s3 = await page.evaluate(
      () => globalThis.patchMapInteractionsPerf.measureS3(),
    );
    const s4 = {
      viewportPanZoom: await page.evaluate(
        () => globalThis.patchMapInteractionsPerf.measureViewportPanZoom(),
      ),
      hover: await runHover(page),
      pointerHit: await runPointerHit(page),
      boxSelection: await runBoxSelection(page),
      paintSelection: await runPaintSelection(page),
      transformerResize: await runTransformerGesture(page, 'resize'),
      transformerRotation: await runTransformerGesture(page, 'rotation'),
    };
    return {
      assertions: collectAssertions(s3, s4),
      itemCount,
      s3,
      s4,
    };
  } finally {
    await page.evaluate(
      () => globalThis.patchMapInteractionsPerf.teardown(),
    );
  }
}

async function runHover(page) {
  const geometry = await prepareSelection(page, 'hover');
  await beginInteraction(page, 'pointer-hover');
  await page.mouse.move(geometry.outside.x, geometry.outside.y);
  await nextFrame(page);
  await page.mouse.move(
    geometry.firstItem.center.x,
    geometry.firstItem.center.y,
  );
  await nextFrame(page);
  const result = await finishPointerInteraction(page);
  const overIds = result.traces
    .filter((trace) => trace.name === 'onOver')
    .flatMap((trace) => trace.ids);
  result.expectedId = geometry.firstItem.id;
  result.assertions = [
    check(
      'hover-callback-observes-public-hit-target',
      overIds.includes(geometry.firstItem.id),
      { expectedId: geometry.firstItem.id, observedIds: unique(overIds) },
    ),
  ];
  return result;
}

async function runPointerHit(page) {
  const geometry = await prepareSelection(page, 'hit');
  await beginInteraction(page, 'pointer-hit');
  await page.mouse.move(
    geometry.firstItem.center.x,
    geometry.firstItem.center.y,
  );
  await nextFrame(page);
  await page.mouse.down({ button: 'left' });
  await page.mouse.up({ button: 'left' });
  const result = await finishPointerInteraction(page);
  const clickIds = result.traces
    .filter((trace) => trace.name === 'onClick')
    .flatMap((trace) => trace.ids);
  const observedIds = unique([
    ...clickIds,
    ...result.selectedIds,
    ...result.traceIds,
  ]);
  result.expectedId = geometry.firstItem.id;
  result.assertions = [
    check(
      'pointer-hit-resolves-expected-public-item',
      observedIds.includes(geometry.firstItem.id),
      { expectedId: geometry.firstItem.id, observedIds },
    ),
    check(
      'pointer-hit-emits-click-callback',
      result.traces.some((trace) => trace.name === 'onClick'),
      { traceNames: result.traces.map((trace) => trace.name) },
    ),
  ];
  return result;
}

async function runBoxSelection(page) {
  const geometry = await prepareSelection(page, 'box');
  await beginInteraction(page, 'box-selection');
  await dragPointer(page, geometry.box.start, geometry.box.end, 12);
  const result = await finishPointerInteraction(page);
  const selectedIds = preferredSelectionIds(result);
  result.expectedIds = geometry.box.expectedIds;
  result.observedIds = selectedIds;
  result.selectionSource = result.selectedIds.length > 0
    ? 'public-transformer-elements'
    : 'public-selection-callbacks';
  result.assertions = selectionAssertions(
    'box-selection',
    selectedIds,
    geometry.box.expectedIds,
  );
  return result;
}

async function runPaintSelection(page) {
  const geometry = await prepareSelection(page, 'paint');
  await beginInteraction(page, 'paint-selection');
  const [start, ...points] = geometry.paint.points;
  await page.mouse.move(start.x, start.y);
  await nextFrame(page);
  await page.mouse.down({ button: 'left' });
  for (const point of points) {
    await page.mouse.move(point.x, point.y);
    await nextFrame(page);
  }
  await page.mouse.up({ button: 'left' });
  const result = await finishPointerInteraction(page);
  const selectedIds = preferredSelectionIds(result);
  result.expectedIds = geometry.paint.expectedIds;
  result.observedIds = selectedIds;
  result.selectionSource = result.selectedIds.length > 0
    ? 'public-transformer-elements'
    : 'public-selection-callbacks';
  result.assertions = selectionAssertions(
    'paint-selection',
    selectedIds,
    geometry.paint.expectedIds,
  );
  return result;
}

async function runTransformerGesture(page, kind) {
  const prepared = await page.evaluate(
    (gesture) =>
      globalThis.patchMapInteractionsPerf.prepareTransformerGesture(gesture),
    kind,
  );
  await beginInteraction(page, `transformer-${kind}`);
  await dragPointer(page, prepared.start, prepared.end, 10);
  const result = await page.evaluate(
    ({ gesture, before }) =>
      globalThis.patchMapInteractionsPerf.finishTransformerGesture(
        gesture,
        before,
      ),
    { before: prepared.before, gesture: kind },
  );
  result.elementId = prepared.elementId;
  result.geometryRule = prepared.geometryRule;
  result.pointer = { end: prepared.end, start: prepared.start };
  return result;
}

async function prepareSelection(page, mode) {
  return page.evaluate(
    (selectionMode) =>
      globalThis.patchMapInteractionsPerf.prepareSelection(selectionMode),
    mode,
  );
}

async function beginInteraction(page, name) {
  await page.evaluate(
    (interactionName) =>
      globalThis.patchMapInteractionsPerf.beginInteraction(interactionName),
    name,
  );
}

async function finishPointerInteraction(page) {
  return page.evaluate(
    () => globalThis.patchMapInteractionsPerf.finishPointerInteraction(),
  );
}

async function dragPointer(page, start, end, steps) {
  await page.mouse.move(start.x, start.y);
  await nextFrame(page);
  await page.mouse.down({ button: 'left' });
  for (let index = 1; index <= steps; index += 1) {
    const progress = index / steps;
    await page.mouse.move(
      start.x + (end.x - start.x) * progress,
      start.y + (end.y - start.y) * progress,
    );
    await nextFrame(page);
  }
  await page.mouse.up({ button: 'left' });
}

async function nextFrame(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
}

function preferredSelectionIds(result) {
  return result.selectedIds.length > 0
    ? unique(result.selectedIds)
    : unique(result.traceIds);
}

function selectionAssertions(prefix, observedIds, expectedIds) {
  return [
    check(
      `${prefix}-selects-at-least-one-item`,
      observedIds.length > 0,
      { observedIds },
    ),
    check(
      `${prefix}-returns-only-expected-item-ids`,
      observedIds.every((id) => expectedIds.includes(id)),
      { expectedIds, observedIds },
    ),
    check(
      `${prefix}-preserves-deterministic-ordered-ids`,
      arraysEqual(observedIds, expectedIds),
      { expectedIds, observedIds },
    ),
  ];
}

function collectAssertions(s3, s4) {
  const assertions = [];
  for (const [scenario, measurement] of Object.entries({ ...s3, ...s4 })) {
    for (const assertion of measurement.assertions ?? []) {
      assertions.push({
        ...assertion,
        name: `${scenario}:${assertion.name}`,
      });
    }
  }
  return assertions;
}

function summarizeScenario(samples) {
  const summary = { s3: {}, s4: {} };
  const timingFields = [
    'nextFrameAfterReturnMs',
    'renderMs',
    'syncMs',
    'totalMs',
  ];
  for (const scenario of [
    'bulkAlphaHighlight',
    'relationLinkRefresh',
    'relationVisibility',
    'sequentialMixed',
    'trustedBulk',
  ]) {
    summary.s3[scenario] = {};
    for (const field of timingFields) {
      summary.s3[scenario][field] = summarize(
        samples.map((sample) => sample.s3[scenario][field]),
      );
    }
  }
  for (const scenario of [
    'viewportPanZoom',
    'hover',
    'pointerHit',
    'boxSelection',
    'paintSelection',
    'transformerResize',
    'transformerRotation',
  ]) {
    summary.s4[scenario] = {
      durationMs: summarize(
        samples.map((sample) => sample.s4[scenario].durationMs),
      ),
      frameIntervalMaxMs: summarize(
        samples.map((sample) => sample.s4[scenario].frameStats?.max),
      ),
      frameIntervalMedianMs: summarize(
        samples.map((sample) => sample.s4[scenario].frameStats?.median),
      ),
      frameIntervalP95Ms: summarize(
        samples.map((sample) => sample.s4[scenario].frameStats?.p95),
      ),
      longTaskCount: summarize(
        samples.map((sample) => sample.s4[scenario].longTaskCount),
      ),
      longTaskTotalMs: summarize(
        samples.map((sample) => sample.s4[scenario].longTaskTotalMs),
      ),
    };
  }

  const noisyMetrics = [];
  walkStats(summary, [], (metric, stats) => {
    if (stats.median > 0 && stats.p95MedianRatio > 1.35) {
      noisyMetrics.push({ metric: metric.join('.'), p95MedianRatio: stats.p95MedianRatio });
    }
  });
  return {
    noiseAssessment: {
      noisyMetrics,
      provisional: noisyMetrics.length > 0,
    },
    summary,
  };
}

function summarize(values) {
  assert(values.length > 0, 'A performance summary requires raw samples');
  for (const [index, value] of values.entries()) {
    assert(
      Number.isFinite(value),
      `Performance sample ${index + 1} must be finite`,
    );
  }
  const sorted = [...values].sort((left, right) => left - right);
  const median = percentile(sorted, 0.5);
  const p95 = percentile(sorted, 0.95);
  return {
    max: round(sorted.at(-1)),
    median: round(median),
    min: round(sorted[0]),
    p95: round(p95),
    p95MedianRatio: median > 0 ? round(p95 / median) : null,
  };
}

function walkStats(value, pathParts, visit) {
  if (!value || typeof value !== 'object') return;
  if (
    Object.hasOwn(value, 'median')
    && Object.hasOwn(value, 'p95')
    && Object.hasOwn(value, 'p95MedianRatio')
  ) {
    visit(pathParts, value);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    walkStats(child, [...pathParts, key], visit);
  }
}

function percentile(sorted, ratio) {
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
}

function round(value) {
  return Number(value.toFixed(3));
}

async function readBrowserEnvironment(page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') ?? canvas.getContext('webgl2');
    const debugInfo = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      browserPlatform: navigator.platform,
      gpuRenderer: debugInfo
        ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        : 'unavailable',
      gpuVendor: debugInfo
        ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
        : 'unavailable',
      userAgent: navigator.userAgent,
    };
  });
}

async function startServer() {
  const server = await createServer({
    configFile: false,
    logLevel: 'error',
    root,
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  await server.listen();
  return server;
}

function parseArgs(args) {
  const valueOptions = new Set([
    'commit',
    'cpu-throttle',
    'device-profile',
    'iterations',
    'label',
    'output',
    'power-mode',
    'sizes',
    'warmups',
  ]);
  const values = new Map();
  let quick = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--quick') {
      quick = true;
      continue;
    }
    if (!argument.startsWith('--')) {
      throw new Error(`Unexpected argument: ${argument}`);
    }
    const [key, inlineValue] = argument.slice(2).split('=', 2);
    if (!valueOptions.has(key)) throw new Error(`Unknown option: --${key}`);
    const value = inlineValue ?? args[++index];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }
    values.set(key, value);
  }
  return {
    commit: values.get('commit') ?? 'unrecorded',
    commitExplicit: values.has('commit'),
    cpuThrottle: readPositiveNumber(
      values.get('cpu-throttle') ?? defaults.cpuThrottle,
      'cpu-throttle',
    ),
    deviceProfile: values.get('device-profile')
      ?? (quick ? 'developer-native-quick' : 'unspecified'),
    deviceProfileExplicit: values.has('device-profile'),
    iterations: readPositiveInteger(
      values.get('iterations') ?? (quick ? 1 : defaults.iterations),
      'iterations',
    ),
    label: values.get('label') ?? 'cleanroom-implementation',
    output: values.get('output'),
    powerMode: values.get('power-mode') ?? (quick ? 'developer-current' : 'unspecified'),
    powerModeExplicit: values.has('power-mode'),
    quick,
    sizes: readSizes(values.get('sizes')),
    warmups: readNonNegativeInteger(
      values.get('warmups') ?? (quick ? 1 : defaults.warmups),
      'warmups',
    ),
  };
}

function assessCanonicalRun(runOptions) {
  const requirements = {
    commit:
      runOptions.commitExplicit
      && fullCommitPattern.test(runOptions.commit),
    deviceProfile:
      runOptions.deviceProfileExplicit
      && isExplicitEnvironmentLabel(runOptions.deviceProfile),
    iterations: runOptions.iterations === defaults.iterations,
    notQuick: !runOptions.quick,
    powerMode:
      runOptions.powerModeExplicit
      && isExplicitEnvironmentLabel(runOptions.powerMode),
    sizes: arraysEqual(runOptions.sizes, canonicalSizes),
    warmups: runOptions.warmups === defaults.warmups,
  };
  return {
    eligible: Object.values(requirements).every(Boolean),
    requirements,
  };
}

function classifyEvidence(canonical, verificationPass, cpuThrottle) {
  if (!verificationPass) return 'failed-compatibility';
  if (!canonical) return 'provisional-noncanonical';
  if (process.platform === 'win32' && cpuThrottle === 1) {
    return 'candidate-windows-native';
  }
  if (cpuThrottle === 4) return 'candidate-canonical-4x-proxy';
  return 'provisional-canonical-unsupported-environment';
}

function isExplicitEnvironmentLabel(value) {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.trim().toLowerCase() !== 'unspecified';
}

function readSizes(value) {
  if (!value) return defaults.sizes;
  const sizes = value.split(',').map((item) => readPositiveInteger(item, 'sizes'));
  if (sizes.length === 0) throw new Error('--sizes must not be empty');
  return sizes;
}

function readPositiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`--${name} must be a positive safe integer`);
  }
  return number;
}

function readNonNegativeInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`--${name} must be a non-negative safe integer`);
  }
  return number;
}

function readPositiveNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`--${name} must be a positive number`);
  }
  return number;
}

function resolvePerfOutput(candidate, generatedAt) {
  const timestamp = generatedAt.replace(/[:.]/gu, '-');
  const outputPath = path.resolve(
    root,
    candidate
      ?? `.perf-results/perf-interactions-${options.quick ? 'quick' : timestamp}.json`,
  );
  const perfRoot = path.resolve(root, '.perf-results');
  const relative = path.relative(perfRoot, outputPath);
  assert(
    relative !== '..' && !relative.startsWith(`..${path.sep}`),
    'Performance output must stay inside .perf-results',
  );
  return outputPath;
}

function check(name, pass, details = undefined) {
  return {
    ...(details === undefined ? {} : { details }),
    name,
    pass: Boolean(pass),
  };
}

function arraysEqual(left, right) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function unique(values) {
  return [...new Set(values)];
}
