#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const selectedRoot = fileURLToPath(new URL('.', import.meta.url));
const quick = process.argv.includes('--quick');
const warmupCount = quick ? 1 : 2;
const sampleCount = quick ? 3 : 7;
const animationFrames = quick ? 8 : 24;
const workloads = quick
  ? [
      { id: 'synthetic-100', kind: 'synthetic', entityCount: 100 },
      { id: 'synthetic-1000', kind: 'synthetic', entityCount: 1_000 },
      { id: 'production-37071', kind: 'production' },
    ]
  : [100, 500, 1_000, 2_000, 5_000]
      .map((entityCount) => ({ id: `synthetic-${entityCount}`, kind: 'synthetic', entityCount }))
      .concat([{ id: 'production-37071', kind: 'production' }]);

function percentile(values, ratio) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * ratio) - 1);
  return sorted[index];
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function stats(values) {
  return {
    samples: values.length,
    raw: values,
    median: median(values),
    p95: percentile(values, 0.95),
    min: values.length === 0 ? 0 : Math.min(...values),
    max: values.length === 0 ? 0 : Math.max(...values),
  };
}

const scalarMetrics = [
  'normalizeMs',
  'rendererInitMs',
  'coreInitMs',
  'loadMs',
  'firstFlushMs',
  'firstFlushCoreCpuMs',
  'trustedCommitMs',
  'trustedFlushMs',
  'trustedCommitFlushMs',
  'randomCommitMs',
  'randomFlushMs',
  'randomCommitFlushMs',
  'animationScheduleMs',
  'hitTestMs',
  'postUpdateHitTestMs',
  'selectionCommitFlushMs',
  'destroyMs',
  'retainedJsHeapBytes',
  'retainedJsHeapPositiveBytes',
];

const arrayMetrics = ['animationFrameMs', 'animationAdvanceMs', 'animationFlushMs'];

function summarize(samples) {
  const summary = {};
  for (const metric of scalarMetrics) summary[metric] = stats(samples.map((sample) => sample[metric]));
  for (const metric of arrayMetrics) summary[metric] = stats(samples.flatMap((sample) => sample[metric]));
  return summary;
}

async function heapUsed(cdp) {
  await cdp.send('HeapProfiler.collectGarbage');
  const response = await cdp.send('Performance.getMetrics');
  return response.metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value ?? 0;
}

function workloadSpec(workload, sampleIndex) {
  return {
    ...workload,
    animationFrames,
    updateRatio: 0.1,
    seed: 0xc0de_1000 + sampleIndex,
  };
}

function number(value) {
  return Number(value).toFixed(2);
}

function markdownReport(result, resultPath) {
  const rows = result.workloads.map(({ id, entityCount, summary }) =>
    `| ${id} | ${entityCount.toLocaleString('en-US')} | ${number(summary.normalizeMs.median)} | ${number(summary.loadMs.median)} | ${number(summary.firstFlushMs.median)} | ${number(summary.trustedCommitFlushMs.median)} | ${number(summary.randomCommitFlushMs.median)} | ${number(summary.animationFrameMs.p95)} | ${number(summary.postUpdateHitTestMs.median)} | ${number(summary.selectionCommitFlushMs.median)} | ${number(summary.destroyMs.median)} | ${Math.round(summary.retainedJsHeapBytes.median).toLocaleString('en-US')} |`,
  );
  return `# Core v1 selected-path ${result.mode} performance checkpoint

- Mode: ${result.mode}; Chromium CDP CPU throttle ${result.environment.cpuThrottleRate}×
- Warmups: ${result.warmupCount}; measured samples: ${result.sampleCount}
- Result JSON: ${resultPath}
- Browser errors: ${result.browser.errors.length}; network failures: ${result.browser.networkFailures.length}
- Core invariant smoke: ${JSON.stringify(result.invariantSmoke)}
- Production fixture: ${result.fixture.bytes.toLocaleString('en-US')} bytes / ${result.fixture.sha256}; expanded ${result.fixture.expectedEntities.toLocaleString('en-US')} entities

| workload | entities | normalize median ms | load median ms | first flush median ms | trusted 10% commit+flush median ms | random 10% commit+flush median ms | animation frame p95 ms | post-update hit-test median ms | select+flush median ms | destroy median ms | retained JS heap median bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows.join('\n')}

## Measurement limits

- Chromium 4× CPU throttling is a development proxy, not Windows-native approval; Windows native remains pending.
- Forced CDP GC and JSHeapUsedSize cover retained JavaScript heap only. DOM, Canvas2D backing stores, browser native allocations, and GPU memory are excluded, and signed deltas can be noisy.
- Canvas renderer commandCount records aggregate Canvas2D submissions, not GPU draw calls. A command may cover multiple logical rectangles, while text, bars, relations, and selection can submit multiple commands.
- CPU timings include browser main-thread and GC interruption but do not partition CPU from GC. GPU upload is not directly observable for this Canvas2D backend.
- Spatial membership is updated lazily at the first post-geometry hit-test; the post-update hit metric includes that refresh boundary.
`;
}

async function main() {
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  if (!baseUrl) throw new Error('Vite did not expose a local URL');

  const browser = await chromium.launch({ headless: true, args: ['--js-flags=--expose-gc'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const errors = [];
  const networkFailures = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`page: ${error.stack ?? error.message}`));
  page.on('requestfailed', (request) => networkFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`));

  let output;
  try {
    await cdp.send('Performance.enable');
    await cdp.send('HeapProfiler.enable');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.goto(new URL('performance/core-v1/selected/index.html', baseUrl).href, { waitUntil: 'networkidle' });
    const fixture = await page.evaluate(async () => {
      const api = await window.__CORE_V1_SELECTED_PERF_READY__;
      if (!api) throw new Error('selected performance harness did not initialize');
      return api.fixture;
    });
    const invariantSmoke = await page.evaluate(() => {
      const api = window.__CORE_V1_SELECTED_PERF__;
      if (!api) throw new Error('selected performance harness API is unavailable');
      return api.runInvariantSmoke();
    });
    if (!invariantSmoke.atomicFailure || !invariantSmoke.destroyed || !invariantSmoke.idempotent) {
      throw new Error(`Core invariant smoke failed: ${JSON.stringify(invariantSmoke)}`);
    }

    const measured = [];
    for (const workload of workloads) {
      process.stdout.write(`[selected-perf] ${workload.id}: warmup ${warmupCount}, samples ${sampleCount}\n`);
      for (let index = 0; index < warmupCount; index += 1) {
        await heapUsed(cdp);
        await page.evaluate((spec) => window.__CORE_V1_SELECTED_PERF__.runTrial(spec), workloadSpec(workload, -index - 1));
      }
      const samples = [];
      for (let index = 0; index < sampleCount; index += 1) {
        const heapBefore = await heapUsed(cdp);
        const trial = await page.evaluate((spec) => window.__CORE_V1_SELECTED_PERF__.runTrial(spec), workloadSpec(workload, index));
        const heapAfter = await heapUsed(cdp);
        samples.push({
          ...trial,
          heapBeforeBytes: heapBefore,
          heapAfterBytes: heapAfter,
          retainedJsHeapBytes: heapAfter - heapBefore,
          retainedJsHeapPositiveBytes: Math.max(0, heapAfter - heapBefore),
        });
        process.stdout.write(`[selected-perf] ${workload.id}: sample ${index + 1}/${sampleCount}, first flush ${number(trial.firstFlushMs)} ms\n`);
      }
      measured.push({
        id: workload.id,
        kind: workload.kind,
        entityCount: samples[0].entityCount,
        rawSamples: samples,
        summary: summarize(samples),
      });
    }

    const userAgent = await page.evaluate(() => navigator.userAgent);
    const hardwareConcurrency = await page.evaluate(() => navigator.hardwareConcurrency);
    output = {
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      mode: quick ? 'quick' : 'full',
      warmupCount,
      sampleCount,
      fixture,
      invariantSmoke,
      environment: {
        platform: process.platform,
        architecture: process.arch,
        node: process.version,
        browser: browser.version(),
        userAgent,
        hardwareConcurrency,
        viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
        cpuThrottleRate: 4,
        headed: false,
        windowsNative: 'pending',
      },
      browser: { errors, networkFailures },
      limitations: {
        cpu: 'CDP 4x throttling is a development proxy; CPU and GC time are not independently partitioned.',
        gc: 'Forced CDP GC and JSHeapUsedSize exclude DOM, Canvas2D/native, and GPU allocations; signed deltas can be noisy.',
        drawCommands: 'Canvas commandCount is aggregate Canvas2D submissions, not GPU draw calls or logical entity count.',
        gpuUpload: 'Canvas2D GPU upload is not directly observable through the public browser surface.',
        spatialIndex: 'Spatial membership refresh is lazy and included in postUpdateHitTestMs after geometry commits.',
        windowsNative: 'Pending actual low-end Windows hardware.',
      },
      workloads: measured,
    };
  } finally {
    await context.close();
    await browser.close();
    await server.close();
  }

  const resultsDir = path.join(selectedRoot, 'results');
  await mkdir(resultsDir, { recursive: true });
  const stamp = output.generatedAt.replaceAll(':', '-').replaceAll('.', '-');
  const namedPath = path.join(resultsDir, `${output.mode}-4x-${stamp}.json`);
  const latestPath = path.join(resultsDir, `latest-${output.mode}-4x.json`);
  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  await writeFile(namedPath, serialized, 'utf8');
  await writeFile(latestPath, serialized, 'utf8');
  const report = markdownReport(output, path.relative(root, namedPath));
  const namedReportPath = path.join(resultsDir, `${output.mode}-4x-${stamp}.md`);
  const latestReportPath = path.join(resultsDir, `latest-${output.mode}-4x.md`);
  await writeFile(namedReportPath, report, 'utf8');
  await writeFile(latestReportPath, report, 'utf8');
  await writeFile('/tmp/core-v1-selected-perf.md', report, 'utf8');
  process.stdout.write(`${report}\n`);
  if (output.browser.errors.length > 0 || output.browser.networkFailures.length > 0) {
    throw new Error(`browser errors detected: ${JSON.stringify(output.browser)}`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
