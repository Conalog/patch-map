#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const ROOT = process.cwd();
const SCALES = Object.freeze([100, 500, 1_000, 2_000, 5_000, 'production']);
const WARMUPS = 2;
const MEASURED = 7;
const EXTRACTIONS_PER_TRIAL = 10;
const CPU_THROTTLE_RATE = 4;
const SEED_BASE = 0xe7ac_7000;
const ARTIFACT_DIRECTORY = path.resolve(
  process.env.PATCH_MAP_EXTRACTION_PERF_ARTIFACT_DIR
    ?? path.join(ROOT, 'contracts/evidence/qualification'),
);

function percentile(values, quantile) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)];
}

function stats(values, label) {
  if (
    values.length === 0
    || values.some((value) => typeof value !== 'number' || !Number.isFinite(value))
  ) {
    throw new Error(`${label} must contain finite samples`);
  }
  return Object.freeze({
    samples: Object.freeze([...values]),
    min: Math.min(...values),
    median: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: Math.max(...values),
  });
}

function sameTuple(left, right) {
  return left?.scene === right?.scene
    && left?.view === right?.view
    && left?.interaction === right?.interaction;
}

function validateTrial(trial, label) {
  if (!Array.isArray(trial.extractionSamplesMs)) {
    throw new Error(`${label} extraction samples are missing`);
  }
  if (
    trial.extractionSamplesMs.length !== EXTRACTIONS_PER_TRIAL
    || trial.extractionSamplesMs.some((value) => !Number.isFinite(value) || value < 0)
  ) {
    throw new Error(`${label} must preserve ten finite extraction samples`);
  }
  const diagnostics = trial.diagnostics;
  if (
    !diagnostics
    || !sameTuple(diagnostics.capturedTuple, diagnostics.requestedTuple)
    || JSON.stringify(diagnostics.cssSize) !== JSON.stringify([960, 540])
    || !Array.isArray(diagnostics.backingSize)
    || !diagnostics.backingSize.every((value) => Number.isFinite(value) && value > 0)
    || !Array.isArray(diagnostics.dataUrlLengths)
    || diagnostics.dataUrlLengths.length !== EXTRACTIONS_PER_TRIAL
    || !diagnostics.dataUrlLengths.every((value) => Number.isSafeInteger(value) && value > 100)
    || diagnostics.sameCanvasObject !== true
    || diagnostics.authoritativeCanvasRetained !== true
    || diagnostics.temporaryImageCount !== 0
    || diagnostics.renderTextureCount !== 0
    || diagnostics.pendingWorkAfter !== 0
    || diagnostics.inputUnchanged !== true
    || diagnostics.backend !== 'webgl'
    || diagnostics.destroyReturned !== true
    || diagnostics.lifecycleAfterDestroy !== 'destroyed'
    || diagnostics.canvasCountAfterDestroy !== 0
  ) {
    throw new Error(`${label} extraction lifecycle invariant failed`);
  }
}

function summarize(measuredRaw, label) {
  for (const [index, trial] of measuredRaw.entries()) {
    validateTrial(trial, `${label}/measured/${index}`);
  }
  return Object.freeze({
    extractionTotalMs: stats(
      measuredRaw.map(({ totalMs }) => totalMs),
      `${label}/extractionTotalMs`,
    ),
    firstExtractionMs: stats(
      measuredRaw.map(({ extractionSamplesMs }) => extractionSamplesMs[0]),
      `${label}/firstExtractionMs`,
    ),
    repeatExtractionMedianMs: stats(
      measuredRaw.map(({ extractionSamplesMs }) => (
        percentile(extractionSamplesMs.slice(1), 0.5)
      )),
      `${label}/repeatExtractionMedianMs`,
    ),
    retainedJsHeapBytes: stats(
      measuredRaw.map(({ retainedJsHeapBytes }) => retainedJsHeapBytes),
      `${label}/retainedJsHeapBytes`,
    ),
    allExtractionSamplesMs: stats(
      measuredRaw.flatMap(({ extractionSamplesMs }) => extractionSamplesMs),
      `${label}/allExtractionSamplesMs`,
    ),
  });
}

async function collectGpuMetadata(page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return { context: null, renderer: null, unmaskedRenderer: null };
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      context: gl instanceof WebGL2RenderingContext ? 'webgl2' : 'webgl',
      renderer: gl.getParameter(gl.RENDERER),
      unmaskedRenderer: debug
        ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
        : null,
    };
  });
}

async function main() {
  const server = await createServer({
    root: ROOT,
    configFile: false,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  let browser = null;
  let context = null;
  const errors = { console: [], page: [], network: [], external: [] };
  try {
    await server.listen();
    const baseUrl = server.resolvedUrls?.local?.[0];
    if (!baseUrl) throw new Error('PatchMap extraction performance server has no URL');
    const pageUrl = new URL('performance/index.html', baseUrl);

    browser = await chromium.launch({
      headless: true,
      args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
    });
    context = await browser.newContext({
      viewport: { width: 1_280, height: 720 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    page.on('console', (message) => {
      if (message.type() === 'error') errors.console.push(message.text());
    });
    page.on('pageerror', (error) => errors.page.push(error.stack ?? error.message));
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (
        (url.protocol === 'http:' || url.protocol === 'https:')
        && url.origin !== pageUrl.origin
      ) {
        errors.external.push(`${request.method()} ${request.url()}`);
      }
    });
    page.on('requestfailed', (request) => {
      errors.network.push(
        `${request.method()} ${request.url()} ${request.failure()?.errorText ?? 'failed'}`,
      );
    });
    page.on('response', (response) => {
      if (response.status() >= 400) {
        errors.network.push(
          `${response.request().method()} ${response.url()} HTTP ${response.status()}`,
        );
      }
    });

    await cdp.send('Performance.enable');
    await cdp.send('HeapProfiler.enable');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE_RATE });
    await page.goto(pageUrl.href, { waitUntil: 'networkidle' });
    await page.waitForFunction(
      () => typeof window.__PATCH_MAP_BENCHMARK__?.runExtraction === 'function',
      undefined,
      { timeout: 30_000 },
    );

    const runs = [];
    for (const [index, scale] of SCALES.entries()) {
      process.stdout.write(
        `[patch-map-extraction-perf] mesh/${String(scale)}: `
        + `${WARMUPS}+${MEASURED} x ${EXTRACTIONS_PER_TRIAL}\n`,
      );
      const result = await page.evaluate(
        (spec) => window.__PATCH_MAP_BENCHMARK__.runExtraction(spec),
        {
          strategy: 'mesh',
          scale,
          seed: SEED_BASE + index,
          warmups: WARMUPS,
          measured: MEASURED,
        },
      );
      if (
        !result
        || result.warmupRaw?.length !== WARMUPS
        || result.measuredRaw?.length !== MEASURED
      ) {
        throw new Error(`mesh/${String(scale)} did not preserve the 2+7 protocol`);
      }
      result.warmupRaw.forEach((trial, trialIndex) => {
        validateTrial(trial, `mesh/${String(scale)}/warmup/${trialIndex}`);
      });
      runs.push(Object.freeze({
        strategy: 'mesh',
        scale,
        warmupRaw: result.warmupRaw,
        measuredRaw: result.measuredRaw,
        summary: summarize(result.measuredRaw, `mesh/${String(scale)}`),
        harnessEnvironment: result.environment,
      }));
    }

    const gpu = await collectGpuMetadata(page);
    const output = {
      $schema: 'patch-map-extraction-performance-checkpoint/1',
      generatedAt: new Date().toISOString(),
      protocol: {
        warmups: WARMUPS,
        measured: MEASURED,
        extractionsPerTrial: EXTRACTIONS_PER_TRIAL,
        cpuThrottleRate: CPU_THROTTLE_RATE,
        scales: SCALES,
      },
      environment: {
        platform: process.platform,
        architecture: process.arch,
        node: process.version,
        browser: browser.version(),
        headed: false,
        viewport: { width: 1_280, height: 720, deviceScaleFactor: 1 },
        gpu,
        windowsNative: 'pending',
      },
      comparison: {
        webgpu: 'experimental-not-run',
      },
      errors,
      runs,
      status: Object.values(errors).every((entries) => entries.length === 0)
        ? 'pass'
        : 'fail',
    };

    await mkdir(ARTIFACT_DIRECTORY, { recursive: true });
    const artifactPath = path.join(
      ARTIFACT_DIRECTORY,
      'extraction-performance-4x.json',
    );
    await writeFile(artifactPath, `${JSON.stringify(output, null, 2)}\n`);
    if (output.status !== 'pass') {
      throw new Error(`PatchMap extraction browser errors: ${JSON.stringify(errors)}`);
    }
    for (const run of runs) {
      const total = run.summary.extractionTotalMs;
      const repeat = run.summary.repeatExtractionMedianMs;
      process.stdout.write(
        `[patch-map-extraction-perf] ${String(run.scale)} `
        + `total median/p95=${total.median.toFixed(2)}/${total.p95.toFixed(2)}ms, `
        + `repeat median/p95=${repeat.median.toFixed(2)}/${repeat.p95.toFixed(2)}ms\n`,
      );
    }
    process.stdout.write(`PASS: PatchMap extraction performance 2+7 across six scales\n`);
  } finally {
    await context?.close();
    await browser?.close();
    await server.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
