import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const DEFAULTS = Object.freeze({
  cpuThrottle: 4,
  iterations: 7,
  warmups: 2,
  sizes: [100, 500, 1_000, 2_000, 5_000],
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  entry: '/src/patchmap.js',
  label: '@conalog/patch-map@0.10.0',
});

const KNOWN_OPTIONS = new Set([
  'cpu-throttle',
  'commit',
  'device-profile',
  'entry',
  'iterations',
  'label',
  'output',
  'power-mode',
  'sizes',
  'warmups',
]);

const main = async () => {
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..',
  );
  const options = parseArgs(process.argv.slice(2));
  const server = await startServer(root);
  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'],
    });
    const page = await browser.newPage({
      viewport: DEFAULTS.viewport,
      deviceScaleFactor: DEFAULTS.deviceScaleFactor,
    });
    page.on('console', (message) => {
      if (message.type() === 'error') console.error(message.text());
    });
    page.on('pageerror', (error) => console.error(error));

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', {
      rate: options.cpuThrottle,
    });

    const harnessUrl = new URL(
      '/scripts/perf/low-end-harness.html',
      server.resolvedUrls.local[0],
    );
    harnessUrl.searchParams.set('entry', options.entry);
    await page.goto(harnessUrl.href, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(globalThis.patchMapPerf));
    const browserEnvironment = await readBrowserEnvironment(page);

    const scenarios = [];
    for (const itemCount of options.sizes) {
      process.stdout.write(`Measuring ${itemCount} items... `);
      for (let index = 0; index < options.warmups; index += 1) {
        await runWorkload(page, itemCount);
      }

      const samples = [];
      for (let index = 0; index < options.iterations; index += 1) {
        samples.push(await runWorkload(page, itemCount));
      }
      scenarios.push({
        itemCount,
        ...assessScenario(samples),
        samples,
      });
      process.stdout.write('done\n');
    }

    const report = {
      schemaVersion: 4,
      generatedAt: new Date().toISOString(),
      target: {
        label: options.label,
        entry: options.entry,
        commit: options.commit,
      },
      environment: {
        platform: process.platform,
        osRelease: os.release(),
        osVersion: os.version(),
        architecture: os.arch(),
        cpu: os.cpus()[0]?.model ?? 'unknown',
        logicalCores: os.cpus().length,
        totalMemoryBytes: os.totalmem(),
        node: process.version,
        chromium: browser.version(),
        viewport: DEFAULTS.viewport,
        deviceScaleFactor: DEFAULTS.deviceScaleFactor,
        cpuThrottle: options.cpuThrottle,
        deviceProfile: options.deviceProfile,
        powerMode: options.powerMode,
        ...browserEnvironment,
      },
      run: {
        warmups: options.warmups,
        iterations: options.iterations,
        sizes: options.sizes,
        renderBoundary: 'synchronous-final-state-app-render-after-return',
        evidenceStatus:
          process.platform === 'win32'
            ? 'candidate-native-or-proxy'
            : 'provisional-non-windows',
        windowsNativeGate:
          process.platform === 'win32' && options.cpuThrottle === 1
            ? 'candidate'
            : 'pending',
        noisePolicy: 'provisional when any p95/median ratio exceeds 1.35',
      },
      scenarios,
    };

    const outputPath = await writeReport(root, options.output, report);
    console.info(`Baseline written to ${path.relative(root, outputPath)}`);
  } finally {
    await browser?.close();
    await server.close();
  }
};

const parseArgs = (args) => {
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    const [key, inlineValue] = arg.slice(2).split('=', 2);
    if (!KNOWN_OPTIONS.has(key)) throw new Error(`Unknown option: --${key}`);
    const value = inlineValue ?? args[++index];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }
    values.set(key, value);
  }

  return {
    cpuThrottle: readPositiveNumber(
      values.get('cpu-throttle') ?? DEFAULTS.cpuThrottle,
      'cpu-throttle',
    ),
    iterations: readPositiveInteger(
      values.get('iterations') ?? DEFAULTS.iterations,
      'iterations',
    ),
    warmups: readNonNegativeInteger(
      values.get('warmups') ?? DEFAULTS.warmups,
      'warmups',
    ),
    sizes: readSizes(values.get('sizes')),
    output: values.get('output'),
    entry: values.get('entry') ?? DEFAULTS.entry,
    label: values.get('label') ?? DEFAULTS.label,
    deviceProfile: values.get('device-profile') ?? 'unspecified',
    powerMode: values.get('power-mode') ?? 'unspecified',
    commit: values.get('commit') ?? 'unrecorded',
  };
};

const startServer = async (root) => {
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  await server.listen();
  return server;
};

const runWorkload = (page, itemCount) =>
  page.evaluate(
    (count) => globalThis.patchMapPerf.measureScalingWorkload(count),
    itemCount,
  );

const readBrowserEnvironment = (page) =>
  page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') ?? canvas.getContext('webgl2');
    const debugInfo = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      browserPlatform: navigator.platform,
      userAgent: navigator.userAgent,
      gpuVendor: debugInfo
        ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
        : 'unavailable',
      gpuRenderer: debugInfo
        ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        : 'unavailable',
    };
  });

const summarizeSamples = (samples) => ({
  initMs: summarize(samples.map((sample) => sample.initMs)),
  initialSyncMs: summarize(samples.map((sample) => sample.initial.syncMs)),
  initialRenderMs: summarize(samples.map((sample) => sample.initial.renderMs)),
  initialTotalMs: summarize(samples.map((sample) => sample.initial.totalMs)),
  updateSyncMs: summarize(samples.map((sample) => sample.update.syncMs)),
  updateRenderMs: summarize(samples.map((sample) => sample.update.renderMs)),
  updateTotalMs: summarize(samples.map((sample) => sample.update.totalMs)),
  teardownSyncMs: summarize(samples.map((sample) => sample.teardownSyncMs)),
  retainedHeapAfterDrawBytes: summarize(
    samples.map((sample) => sample.retainedHeapAfterDrawBytes),
  ),
  retainedHeapAfterUpdateBytes: summarize(
    samples.map((sample) => sample.retainedHeapAfterUpdateBytes),
  ),
  postDestroyRetainedHeapBytes: summarize(
    samples.map((sample) => sample.postDestroyRetainedHeapBytes),
  ),
  initialManagedObjects: summarize(
    samples.map((sample) => sample.initial.scene.managed),
  ),
  initialSceneNodes: summarize(
    samples.map((sample) => sample.initial.scene.total),
  ),
  updatedManagedObjects: summarize(
    samples.map((sample) => sample.update.scene.managed),
  ),
  updatedSceneNodes: summarize(
    samples.map((sample) => sample.update.scene.total),
  ),
});

const assessScenario = (samples) => {
  const summary = summarizeSamples(samples);
  const noisyMetrics = Object.entries(summary)
    .filter(([, stats]) => stats?.median > 0 && stats.p95 / stats.median > 1.35)
    .map(([metric, stats]) => ({
      metric,
      p95MedianRatio: round(stats.p95 / stats.median),
    }));
  return {
    summary,
    noiseAssessment: {
      provisional: noisyMetrics.length > 0,
      noisyMetrics,
    },
  };
};

const summarize = (values) => {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  return {
    min: round(sorted[0]),
    median: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    max: round(sorted.at(-1)),
  };
};

const percentile = (sortedValues, ratio) => {
  const index = Math.max(0, Math.ceil(sortedValues.length * ratio) - 1);
  return sortedValues[index];
};

const round = (value) => Number(value.toFixed(2));

const writeReport = async (root, output, report) => {
  const timestamp = report.generatedAt.replace(/[:.]/g, '-');
  const outputPath = path.resolve(
    root,
    output ?? `.perf-results/low-end-${timestamp}.json`,
  );
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return outputPath;
};

const readSizes = (value) => {
  if (!value) return DEFAULTS.sizes;
  const sizes = value
    .split(',')
    .map((item) => readPositiveInteger(item, 'sizes'));
  if (sizes.length === 0) throw new Error('--sizes must not be empty.');
  return sizes;
};

const readPositiveInteger = (value, name) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`--${name} must be a positive integer.`);
  }
  return number;
};

const readNonNegativeInteger = (value, name) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`--${name} must be a non-negative integer.`);
  }
  return number;
};

const readPositiveNumber = (value, name) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`--${name} must be a positive number.`);
  }
  return number;
};

await main();
