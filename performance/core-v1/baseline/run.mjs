import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const output = path.join(root, 'performance/core-v1/results/baseline-quick.json');
const quick = process.argv.includes('--quick');
if (!quick || process.argv.length !== 3) {
  throw new Error('Usage: node performance/core-v1/baseline/run.mjs --quick');
}

const config = Object.freeze({
  cpuThrottle: 4,
  iterations: 3,
  warmups: 1,
  scenarios: ['100', '500', '1000', 'production'],
  viewport: { width: 1440, height: 900 },
});

const server = await createServer({
  root,
  configFile: false,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, strictPort: false },
});
let browser;

try {
  await server.listen();
  browser = await chromium.launch({
    headless: true,
    args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'],
  });
  const context = await browser.newContext({ viewport: config.viewport });
  const page = await context.newPage();
  const browserErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: config.cpuThrottle });

  const url = new URL(
    '/performance/core-v1/baseline/harness.html',
    server.resolvedUrls.local[0],
  );
  const response = await page.goto(url.href, { waitUntil: 'networkidle' });
  if (!response?.ok()) throw new Error(`Harness HTTP ${response?.status()}`);
  await page.waitForFunction(() => Boolean(globalThis.compatibilityBaseline));

  const environment = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      userAgent: navigator.userAgent,
      browserPlatform: navigator.platform,
      gpuVendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : 'unavailable',
      gpuRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable',
      preciseHeapAvailable: typeof performance.memory?.usedJSHeapSize === 'number',
    };
  });

  const scenarios = [];
  for (const name of config.scenarios) {
    process.stdout.write(`${name}: prepare `);
    const workload = await page.evaluate(
      (scenario) => globalThis.compatibilityBaseline.prepare(scenario),
      name,
    );
    for (let index = 0; index < config.warmups; index += 1) {
      process.stdout.write(`warmup ${index + 1}/${config.warmups} `);
      await page.evaluate(
        (scenario) => globalThis.compatibilityBaseline.measure(scenario),
        name,
      );
    }
    const samples = [];
    for (let index = 0; index < config.iterations; index += 1) {
      process.stdout.write(`sample ${index + 1}/${config.iterations} `);
      samples.push(await page.evaluate(
        (scenario) => globalThis.compatibilityBaseline.measure(scenario),
        name,
      ));
    }
    scenarios.push({
      name,
      workload,
      samples,
      summary: summarizeSamples(samples),
    });
    process.stdout.write('done\n');
  }

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    target: {
      label: '@conalog/patch-map compatibility implementation (frozen baseline)',
      entry: '/src/patchmap.ts',
    },
    environment: {
      platform: process.platform,
      architecture: os.arch(),
      cpu: os.cpus()[0]?.model ?? 'unknown',
      logicalCores: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
      node: process.version,
      chromium: browser.version(),
      cpuThrottle: config.cpuThrottle,
      viewport: config.viewport,
      ...environment,
    },
    run: {
      mode: 'quick',
      warmups: config.warmups,
      iterations: config.iterations,
      scenarios: config.scenarios,
      rawSamplesPreserved: true,
      windowsNativeGate: 'pending',
      evidenceStatus: 'headless-chromium-4x-development-proxy',
    },
    measurementBoundaries: {
      normalize: 'direct self-authored materializeMapData probe',
      managedSceneBuild: 'direct self-authored buildManagedScene probe',
      load: 'public Patchmap.draw; overlaps normalize and ManagedNode/render preparation',
      firstRender: 'explicit synchronous Patchmap.app.render after draw',
      trustedBulkUpdate: 'single public update over all item handles with validation disabled, then explicit render',
      validatedRandomBulkUpdate: 'single public update over deterministic 10% item subset with validation enabled, then explicit render',
      barAnimationFrame: 'wrapped compatibility-owned rAF callback plus explicit render; first refresh frame is included',
      hitTestSelection: 'Pixi rootBoundary hitTest plus SelectionState dispatch; known-handle fallback is counted',
      retainedHeap: 'performance.memory delta after exposed GC; negative deltas clamp to zero',
    },
    limitations: [
      'Responsibility probes are standalone and overlap the public draw load metric; they are not additive.',
      'The production fixture has 458 top-level elements but compatibility grid expansion is reported separately.',
      'Headless Chromium GPU submission is proxy evidence and does not prove visible-pixel presentation cost.',
      'rAF capture includes the first managed-scene refresh callback because the private render layer has no public animation-frame hook.',
      'Native hit-test misses fall back to the known public item handle and are reported per sample.',
      'performance.memory and exposed GC are Chromium diagnostics, not exact retained-object accounting.',
      'Windows-native measurements are pending.',
    ],
    browserErrors,
    scenarios,
  };

  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`Wrote ${path.relative(root, output)}\n`);
  if (browserErrors.length > 0) {
    throw new Error(`Browser emitted ${browserErrors.length} error(s); report preserved`);
  }
  await context.close();
} finally {
  await browser?.close();
  await server.close();
}

function summarizeSamples(samples) {
  const metric = (read) => summarize(samples.map(read));
  return {
    initMs: metric((sample) => sample.initMs),
    normalizeMs: metric((sample) => sample.normalizeMs),
    managedSceneBuildMs: metric((sample) => sample.managedSceneBuildMs),
    managedSceneDestroyMs: metric((sample) => sample.managedSceneDestroyMs),
    loadMs: metric((sample) => sample.loadMs),
    firstRenderMs: metric((sample) => sample.firstRenderMs),
    itemLookupMs: metric((sample) => sample.itemLookupMs),
    trustedBulkUpdateSyncMs: metric((sample) => sample.trustedBulkUpdate.syncMs),
    trustedBulkUpdateRenderMs: metric((sample) => sample.trustedBulkUpdate.renderMs),
    trustedBulkUpdateTotalMs: metric((sample) => sample.trustedBulkUpdate.totalMs),
    validatedRandomBulkUpdateSyncMs: metric((sample) => sample.validatedRandomBulkUpdate.syncMs),
    validatedRandomBulkUpdateRenderMs: metric((sample) => sample.validatedRandomBulkUpdate.renderMs),
    validatedRandomBulkUpdateTotalMs: metric((sample) => sample.validatedRandomBulkUpdate.totalMs),
    barAnimationUpdateSyncMs: metric((sample) => sample.barAnimation.updateSyncMs),
    barAnimationFrameMs: summarize(samples.flatMap((sample) => sample.barAnimation.frameMs)),
    hitTestSelectionSetupMs: metric((sample) => sample.hitTestSelection.setupMs),
    hitTestSelectionBatchMs: metric((sample) => sample.hitTestSelection.batchMs),
    hitTestSelectionPerOperationMs: metric((sample) => sample.hitTestSelection.perOperationMs),
    teardownMs: metric((sample) => sample.teardownMs),
    retainedHeapAfterLoadBytes: metric((sample) => sample.retainedHeapAfterLoadBytes),
    retainedHeapAfterWorkloadBytes: metric((sample) => sample.retainedHeapAfterWorkloadBytes),
    postDestroyRetainedHeapBytes: metric((sample) => sample.postDestroyRetainedHeapBytes),
    managedNodes: metric((sample) => sample.publicScene.managedNodes),
    totalSceneNodes: metric((sample) => sample.publicScene.totalNodes),
  };
}

function summarize(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  return {
    rawCount: sorted.length,
    min: round(sorted[0]),
    median: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    max: round(sorted.at(-1)),
  };
}

function percentile(sorted, ratio) {
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
}

function round(value) {
  return Number(value.toFixed(3));
}
