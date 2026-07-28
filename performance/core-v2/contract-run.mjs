#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const RESULTS_ROOT = fileURLToPath(new URL('./results/', import.meta.url));
const MANIFEST_PATH = fileURLToPath(new URL(
  '../../docs/reference/core-v2-functional-contract/evidence/catalog-evidence-manifest.v1.json',
  import.meta.url,
));
const PACKAGE_EVIDENCE_PATH = fileURLToPath(new URL(
  './results/package-consumer.json',
  import.meta.url,
));
const SIZES = Object.freeze([
  100,
  500,
  1_000,
  2_000,
  5_000,
  'production-shaped-workload-v1',
]);
const PERFORMANCE_CASE_IDS = Object.freeze([
  'PRF-001',
  'PRF-002',
  'PRF-003',
  'PRF-004',
  'PRF-005',
  'PRF-006',
  'PRF-009',
]);
const WARMUPS = 2;
const MEASURED = 7;
const SEED = 319;
const CPU_THROTTLE_RATE = 4;
const CPU_PROFILE = 'windows-low-end-n100-8g-v1';
const PRODUCTION_DATASET_SHA256 =
  '4bc16c65500b4f305114162fdc4472b45997eea7498020496072ca0b741e95c3';

function argumentValue(name) {
  const prefix = `${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function percentile(values, quantile) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)];
}

function stats(values, label) {
  assert(
    values.length > 0
      && values.every((value) => typeof value === 'number' && Number.isFinite(value)),
    `${label} finite samples`,
  );
  return {
    samples: values,
    min: Math.min(...values),
    median: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: Math.max(...values),
  };
}

function hashText(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function startServer(explicitUrl) {
  if (explicitUrl) return { pageUrl: explicitUrl, close: async () => {} };
  const server = await createServer({
    root: ROOT,
    configFile: false,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  try {
    await server.listen();
    const baseUrl = server.resolvedUrls?.local?.[0];
    assert(typeof baseUrl === 'string', 'Vite benchmark URL');
    return {
      pageUrl: new URL('performance/core-v2/contract-index.html', baseUrl).href,
      close: () => server.close(),
    };
  } catch (error) {
    await server.close().catch(() => undefined);
    throw error;
  }
}

async function collectGpuMetadata(page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return { context: null };
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      context: 'webgl2',
      vendor: gl.getParameter(gl.VENDOR),
      renderer: gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
      unmaskedVendor: debugInfo
        ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
        : null,
      unmaskedRenderer: debugInfo
        ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        : null,
    };
  });
}

async function runHarness(page, size, smoke) {
  const warmups = smoke ? 0 : WARMUPS;
  const measured = smoke ? 1 : MEASURED;
  const result = await page.evaluate(
    async (spec) => window.__PATCH_MAP_CORE_V2_CONTRACT_PERFORMANCE__.run(spec),
    {
      size,
      seed: SEED,
      warmups,
      measured,
      mode: smoke ? 'smoke' : 'contract',
    },
  );
  assert(isRecord(result), `${String(size)} harness result`);
  assert(Array.isArray(result.warmupRaw), `${String(size)} warmup raw`);
  assert(Array.isArray(result.measuredRaw), `${String(size)} measured raw`);
  assert(result.warmupRaw.length === warmups, `${String(size)} warmup count`);
  assert(result.measuredRaw.length === measured, `${String(size)} measured count`);
  return {
    size,
    seed: SEED,
    warmupRaw: result.warmupRaw,
    measuredRaw: result.measuredRaw,
    environment: result.environment,
  };
}

async function main() {
  const headed = process.argv.includes('--headed');
  const smoke = process.argv.includes('--smoke');
  const smokeSize = smoke
    ? parseSize(argumentValue('--smoke-size') ?? '100')
    : null;
  const requestedHeaded = !process.argv.includes('--request-headless');
  const codeCommit = argumentValue('--code-commit') ?? 'uncommitted';
  const externalUrl = argumentValue('--url');
  const runSizes = smoke ? [smokeSize] : SIZES;
  const runWarmups = smoke ? 0 : WARMUPS;
  const runMeasured = smoke ? 1 : MEASURED;
  const server = await startServer(externalUrl);
  const browser = await chromium.launch({
    headless: !headed,
    args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
  });
  const context = await browser.newContext({
    viewport: { width: 1_280, height: 800 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(0);
  const cdp = await context.newCDPSession(page);
  const consoleErrors = [];
  const pageErrors = [];
  const networkFailures = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message));
  page.on('requestfailed', (request) => {
    networkFailures.push(
      `${request.method()} ${request.url()} ${request.failure()?.errorText ?? 'request failed'}`,
    );
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      networkFailures.push(
        `${response.request().method()} ${response.url()} HTTP ${response.status()}`,
      );
    }
  });

  let rawOutput;
  try {
    await cdp.send('Performance.enable');
    await cdp.send('HeapProfiler.enable');
    await cdp.send('Emulation.setCPUThrottlingRate', {
      rate: CPU_THROTTLE_RATE,
    });
    await page.goto(server.pageUrl, { waitUntil: 'networkidle' });
    await page.waitForFunction(
      () => typeof window.__PATCH_MAP_CORE_V2_CONTRACT_PERFORMANCE__?.run === 'function',
    );
    const gpu = await collectGpuMetadata(page);
    assert(gpu.context === 'webgl2', 'WebGL2 context availability');
    const runs = [];
    for (const size of runSizes) {
      process.stdout.write(
        `[core-v2-contract-perf] ${String(size)}: ${runWarmups}+${runMeasured}\n`,
      );
      runs.push(await runHarness(page, size, smoke));
    }
    rawOutput = {
      revision: 'core-v2-contract-performance-raw/1',
      generatedAt: new Date().toISOString(),
      codeCommit,
      protocol: {
        warmups: runWarmups,
        samples: runMeasured,
        sizes: runSizes,
        seed: SEED,
        backend: 'webgl2',
        cpuThrottleRate: CPU_THROTTLE_RATE,
        requestedHeaded,
        actualMode: headed ? 'headed' : 'headless',
      },
      environment: {
        platform: process.platform,
        architecture: process.arch,
        nodeVersion: process.version,
        browserVersion: await browser.version(),
        gpu,
        cpuProfile: CPU_PROFILE,
        measurementClass: 'chromium-4x-development-proxy',
        windowsNative: 'pending',
      },
      browser: {
        consoleErrors,
        pageErrors,
        networkFailures,
      },
      runs,
    };
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }

  assert(rawOutput !== undefined, 'raw performance output');
  const browserErrorCount =
    rawOutput.browser.consoleErrors.length
    + rawOutput.browser.pageErrors.length
    + rawOutput.browser.networkFailures.length;
  if (smoke) {
    const lifecycleFailures = rawOutput.runs
      .flatMap((run) => run.measuredRaw)
      .filter((trial) => (
        trial.diagnostics.lifecycleAfterDestroy !== 'destroyed'
        || trial.diagnostics.canvasCountAfterDestroy !== 0
        || trial.diagnostics.pendingWorkAfterDestroy !== 0
        || trial.diagnostics.subscriptionCountAfterDestroy !== 0
        || trial.diagnostics.surfaceChildCountAfterDestroy !== 0
      )).length;
    assert(browserErrorCount === 0, 'smoke browser errors');
    assert(lifecycleFailures === 0, 'smoke lifecycle cleanup');
    const smokeRun = rawOutput.runs[0];
    const smokeTrial = smokeRun?.measuredRaw[0];
    assert(smokeRun !== undefined && smokeTrial !== undefined, 'smoke measured trial');
    process.stdout.write(
      `[core-v2-contract-perf] smoke metrics ${JSON.stringify({
        size: smokeRun.size,
        phases: smokeTrial.phases,
        visible: smokeTrial.visible,
        longTaskDurationsMs: smokeTrial.longTaskDurationsMs,
      })}\n`,
    );
    process.stdout.write(
      `[core-v2-contract-perf] smoke passed; browser errors 0; lifecycle failures 0\n`,
    );
    return;
  }
  const timestamp = rawOutput.generatedAt.replaceAll(':', '-').replaceAll('.', '-');
  const rawFilename = `contract-performance-raw-${timestamp}.json`;
  const rawText = `${JSON.stringify(rawOutput, null, 2)}\n`;
  const rawDigest = hashText(rawText);
  await mkdir(RESULTS_ROOT, { recursive: true });
  await Promise.all([
    writeFile(path.join(RESULTS_ROOT, rawFilename), rawText),
    writeFile(
      path.join(RESULTS_ROOT, 'contract-performance-raw-latest.json'),
      rawText,
    ),
  ]);
  const summary = await summarizeEvidence(rawOutput, {
    browserErrorCount,
    codeCommit,
    requestedHeaded,
    actualMode: headed ? 'headed' : 'headless',
  });
  summary.provenance.rawArtifactSha256 = rawDigest;
  summary.rawArtifact = {
    path: `performance/core-v2/results/${rawFilename}`,
    sha256: rawDigest,
    sampleCount: SIZES.length * MEASURED,
    warmupSampleCount: SIZES.length * WARMUPS,
  };
  await writeFile(
    path.join(RESULTS_ROOT, 'contract-performance.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  process.stdout.write(
    `[core-v2-contract-perf] wrote ${rawFilename} (${rawDigest})\n`,
  );
  process.stdout.write(
    `[core-v2-contract-perf] browser errors ${browserErrorCount}; `
      + `contract status ${summary.status}\n`,
  );
}

async function summarizeEvidence(raw, runInfo) {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const packageEvidence = JSON.parse(await readFile(PACKAGE_EVIDENCE_PATH, 'utf8'));
  const expectedRecordDigests = Object.fromEntries(
    PERFORMANCE_CASE_IDS.map((id) => {
      const record = manifest.cases.find((entry) => entry.id === id);
      assert(isRecord(record), `${id} manifest record`);
      assert(
        typeof record.expectedRecordSha256 === 'string'
          && /^[a-f0-9]{64}$/u.test(record.expectedRecordSha256),
        `${id} expected record digest`,
      );
      return [id, record.expectedRecordSha256];
    }),
  );
  const allMeasured = raw.runs.flatMap((run) => run.measuredRaw);
  const longTasks = allMeasured.flatMap((trial) => trial.longTaskDurationsMs);
  const allVisible = allMeasured.flatMap(
    (trial) => trial.visible.actionToVisibleMs,
  );
  const allFrameGaps = allMeasured.flatMap((trial) => trial.visible.frameGapsMs);
  const runBySize = new Map(raw.runs.map((run) => [run.size, run]));
  const loadRows = raw.runs.map((run) => loadTimingRow(run));
  const production = runBySize.get('production-shaped-workload-v1');
  assert(isRecord(production), 'production performance run');
  const productionHashes = production.measuredRaw.map(
    (trial) => trial.diagnostics.canonicalDatasetSha256,
  );
  assert(
    productionHashes.every((digest) => digest === PRODUCTION_DATASET_SHA256),
    'production dataset canonical hash',
  );
  const run2k = runBySize.get(2_000);
  const run5k = runBySize.get(5_000);
  assert(isRecord(run2k), '2,000 performance run');
  assert(isRecord(run5k), '5,000 performance run');
  const barAction = run2k.measuredRaw.flatMap(
    (trial) => trial.visible.bar?.actionToVisibleMs ?? [],
  );
  const barFrames = run2k.measuredRaw.flatMap(
    (trial) => trial.visible.bar?.frameGapsMs ?? [],
  );
  const textAction = run2k.measuredRaw.flatMap(
    (trial) => trial.visible.text.map((entry) => entry.actionToVisibleMs),
  );
  const bulkAction = run5k.measuredRaw.flatMap(
    (trial) => trial.visible.bulk.map((entry) => entry.actionToVisibleMs),
  );
  const interactionAction = run5k.measuredRaw.flatMap(
    (trial) => trial.visible.interaction?.inputToVisibleMs ?? [],
  );
  const interactionFrames = run5k.measuredRaw.flatMap(
    (trial) => trial.visible.interaction?.frameGapsMs ?? [],
  );
  const lifecycleFailures = allMeasured.filter(
    (trial) => (
      trial.diagnostics.destroyReturned !== true
      || trial.diagnostics.lifecycleAfterDestroy !== 'destroyed'
      || trial.diagnostics.canvasCountAfterDestroy !== 0
      || trial.diagnostics.pendingWorkAfterDestroy !== 0
      || trial.diagnostics.subscriptionCountAfterDestroy !== 0
      || trial.diagnostics.surfaceChildCountAfterDestroy !== 0
      || trial.diagnostics.inputUnchanged !== true
    ),
  ).length;
  const phaseNames = [
    'validateMs',
    'materializeMs',
    'assetMs',
    'uploadPrepareMs',
    'firstUsefulFrameMs',
  ];
  const phaseValues = allMeasured.flatMap((trial) =>
    phaseNames.map((name) => trial.phases[name]));
  const firstFrameStats = raw.runs.map((run) =>
    stats(
      run.measuredRaw.map((trial) => trial.phases.firstUsefulFrameMs),
      `${String(run.size)} first useful frame`,
    ));
  const bulkP95BySize = [100, 500, 1_000, 2_000, 5_000].map((size) => {
    const run = runBySize.get(size);
    assert(isRecord(run), `${size} bulk complexity run`);
    const samples = run.measuredRaw.flatMap((trial) =>
      trial.visible.bulk.slice(0, 1).map((entry) => entry.actionToVisibleMs));
    return { size, p95: stats(samples, `${size} bulk action`).p95 };
  });
  const complexityExponentMax = Math.max(
    0,
    ...bulkP95BySize.slice(1).map((entry, index) => {
      const previous = bulkP95BySize[index];
      if (entry.p95 <= 0 || previous.p95 <= 0) return 0;
      return Math.log(entry.p95 / previous.p95)
        / Math.log(entry.size / previous.size);
    }),
  );
  const packedDigest = packageEvidence?.provenance?.packedPackageSha256;
  assert(
    typeof packedDigest === 'string' && /^[a-f0-9]{64}$/u.test(packedDigest),
    'packed package digest',
  );
  const browserErrorCount = runInfo.browserErrorCount;
  return {
    revision: 'core-v2-contract-performance-evidence/1',
    status:
      browserErrorCount === 0 && lifecycleFailures === 0
        ? 'complete'
        : 'failed',
    generatedAt: raw.generatedAt,
    protocol: {
      warmups: WARMUPS,
      samples: MEASURED,
      sizes: SIZES,
      seed: SEED,
      backend: 'webgl2',
      cpuThrottleRate: CPU_THROTTLE_RATE,
    },
    provenance: {
      codeCommit: runInfo.codeCommit,
      packedPackageSha256: packedDigest,
      rawArtifactSha256: null,
      expectedEvidenceBound: true,
      expectedRecordDigests,
    },
    environment: {
      backend: 'webgl2',
      cpuProfile: CPU_PROFILE,
      contractProfileBound: true,
      browserVersion: raw.environment.browserVersion,
      runtimeResourceIds: [],
      measurementClass: raw.environment.measurementClass,
      requestedHeaded: runInfo.requestedHeaded,
      actualMode: runInfo.actualMode,
      headedReleaseStatus:
        runInfo.actualMode === 'headed' ? 'measured' : 'pending',
      windowsNative: 'pending',
      gpu: raw.environment.gpu,
    },
    rawArtifact: null,
    browser: {
      actualMode: runInfo.actualMode,
      requestedHeaded: runInfo.requestedHeaded,
      errorCount: browserErrorCount,
      consoleErrorCount: raw.browser.consoleErrors.length,
      pageErrorCount: raw.browser.pageErrors.length,
      networkFailureCount: raw.browser.networkFailures.length,
      lifecycleFailureCount: lifecycleFailures,
    },
    cases: {
      'PRF-001': {
        workloadCount: SIZES.length,
        samplesPerWorkload: MEASURED,
        warmupsPerWorkload: WARMUPS,
        longTaskAtLeast100Ms: longTasks.filter((duration) => duration >= 100).length,
        frameGapP95Ms: stats(allFrameGaps, 'matrix frame gaps').p95,
        actionToVisibleP95Ms: stats(allVisible, 'matrix action-to-visible').p95,
        rawTimingSamples: raw.runs.map((run) => ({
          size: run.size,
          actionToVisibleMs: run.measuredRaw.flatMap(
            (trial) => trial.visible.actionToVisibleMs,
          ),
          frameGapsMs: run.measuredRaw.flatMap(
            (trial) => trial.visible.frameGapsMs,
          ),
        })),
      },
      'PRF-002': {
        workloadsMeasured: SIZES,
        samplesPerWorkload: MEASURED,
        phaseCountPerWorkload: phaseNames.length,
        allPhaseValuesFinite: phaseValues.every(Number.isFinite),
        firstUsefulFrame: {
          maxP95Ms: Math.max(...firstFrameStats.map((entry) => entry.p95)),
          semanticHash: PRODUCTION_DATASET_SHA256,
        },
        longTaskAtLeast100Ms: longTasks.filter((duration) => duration >= 100).length,
        valuesFinite: allMeasured.every(
          (trial) => trial.diagnostics.revisionValuesFinite === true,
        ),
        rawTimingSamples: loadRows,
      },
      'PRF-003': {
        longTaskAtLeast100Ms: longTasksForRun(run2k),
        actionToVisibleP95Ms: stats(barAction, 'bar action-to-visible').p95,
        frameGapP95Ms: stats(barFrames, 'bar frame gaps').p95,
        rawTimingSamples: run2k.measuredRaw.map((trial) => trial.visible.bar),
      },
      'PRF-004': {
        longTaskAtLeast100Ms: longTasksForRun(run2k),
        actionToVisibleP95Ms: stats(textAction, 'text action-to-visible').p95,
        rawTimingSamples: run2k.measuredRaw.map((trial) => trial.visible.text),
      },
      'PRF-005': {
        longTaskAtLeast100Ms: longTasksForRun(run5k),
        actionToVisibleP95Ms: stats(bulkAction, 'bulk action-to-visible').p95,
        complexityExponentMax,
        bulkP95BySize,
        rawTimingSamples: run5k.measuredRaw.map((trial) => trial.visible.bulk),
      },
      'PRF-006': {
        longTaskAtLeast100Ms: longTasksForRun(run5k),
        inputToVisibleP95Ms: stats(
          interactionAction,
          'interaction input-to-visible',
        ).p95,
        frameGapP95Ms: stats(interactionFrames, 'interaction frame gaps').p95,
        rawTimingSamples: run5k.measuredRaw.map(
          (trial) => trial.visible.interaction,
        ),
      },
    },
  };
}

function loadTimingRow(run) {
  const names = [
    'validateMs',
    'materializeMs',
    'assetMs',
    'storeLoadMs',
    'uploadPrepareMs',
    'firstUsefulFrameMs',
  ];
  return {
    size: run.size,
    phases: Object.fromEntries(names.map((name) => [
      name,
      stats(
        run.measuredRaw.map((trial) => trial.phases[name]),
        `${String(run.size)} ${name}`,
      ),
    ])),
  };
}

function longTasksForRun(run) {
  return run.measuredRaw
    .flatMap((trial) => trial.longTaskDurationsMs)
    .filter((duration) => duration >= 100)
    .length;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseSize(value) {
  const size = value === 'production-shaped-workload-v1'
    ? value
    : Number(value);
  assert(SIZES.includes(size), `smoke size ${value}`);
  return size;
}

function assert(condition, message) {
  if (!condition) throw new Error(`Invalid Core v2 contract performance run: ${message}`);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
