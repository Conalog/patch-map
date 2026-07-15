#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const ROOT = process.cwd();
const RESULTS = path.join(ROOT, 'performance/core-v2/results');
const server = await createServer({
  root: ROOT,
  configFile: false,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
});
await server.listen();
const baseUrl = server.resolvedUrls?.local?.[0];
if (!baseUrl) throw new Error('Core v2 memory Vite server has no URL');
const browser = await chromium.launch({
  headless: true,
  args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
});
const context = await browser.newContext({ viewport: { width: 1_280, height: 720 } });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
const errors = { console: [], page: [], network: [] };
page.on('console', (message) => {
  if (message.type() === 'error') errors.console.push(message.text());
});
page.on('pageerror', (error) => errors.page.push(error.stack ?? error.message));
page.on('requestfailed', (request) => errors.network.push(`${request.url()} ${request.failure()?.errorText ?? ''}`));
page.on('response', (response) => {
  if (response.status() >= 400) errors.network.push(`${response.url()} HTTP ${response.status()}`);
});

try {
  await cdp.send('Performance.enable');
  await cdp.send('HeapProfiler.enable');
  await page.goto(new URL('performance/core-v2/index.html', baseUrl).href, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.__PATCH_MAP_CORE_V2_BENCHMARK__?.run === 'function');
  await cdp.send('HeapProfiler.collectGarbage');
  const before = metric(await cdp.send('Performance.getMetrics'), 'JSHeapUsedSize');
  const run = await page.evaluate(async () => window.__PATCH_MAP_CORE_V2_BENCHMARK__.run({
    strategy: 'mesh',
    scale: 1_000,
    seed: 0x4d454d,
    warmups: 2,
    measured: 7,
  }));
  await cdp.send('HeapProfiler.collectGarbage');
  const after = metric(await cdp.send('Performance.getMetrics'), 'JSHeapUsedSize');
  const dom = await page.evaluate(() => ({
    canvasCount: document.querySelectorAll('#surface canvas').length,
    surfaceChildren: document.querySelector('#surface')?.childElementCount ?? -1,
  }));
  const samples = run.measuredRaw.map((trial) => trial.phases.retainedJsHeapBytes);
  const sorted = [...samples].sort((left, right) => left - right);
  const median = percentile(sorted, 0.5);
  const p95 = percentile(sorted, 0.95);
  const maximum = Math.max(...samples);
  const trend = samples.at(-1) - samples[0];
  const lifecycleFailures = [];
  for (const [index, trial] of run.measuredRaw.entries()) {
    const diagnostics = trial.diagnostics;
    if (
      diagnostics.runtimeDestroyed !== true ||
      diagnostics.rendererDestroyed !== true ||
      diagnostics.schedulerDestroyed !== true ||
      diagnostics.lifecycleCanvasCount !== 0
    ) {
      lifecycleFailures.push(`measured trial ${index} did not release runtime/renderer/scheduler/canvas`);
    }
  }
  const failures = [
    ...(errors.console.length || errors.page.length || errors.network.length ? ['browser errors are not empty'] : []),
    ...(dom.canvasCount !== 0 || dom.surfaceChildren !== 0 ? ['surface retains a lifecycle DOM node'] : []),
    ...lifecycleFailures,
    ...(!samples.every((value) => Number.isFinite(value) && value >= 0) ? ['retained heap samples are invalid'] : []),
    ...(median > 20 * 1024 * 1024 ? [`retained heap median ${median} exceeds 20 MiB`] : []),
    ...(maximum > 50 * 1024 * 1024 ? [`retained heap max ${maximum} exceeds 50 MiB`] : []),
    ...(trend > 10 * 1024 * 1024 ? [`retained heap trend ${trend} exceeds 10 MiB`] : []),
    ...(after - before > 20 * 1024 * 1024 ? [`post-GC process delta ${after - before} exceeds 20 MiB`] : []),
  ];
  const evidence = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    workload: { sourceItems: 1_000, expandedEntities: run.measuredRaw[0]?.diagnostics.expandedEntityCount },
    protocol: { warmups: 2, measured: 7 },
    jsHeap: { before, after, processDelta: after - before, samples, median, p95, maximum, trend },
    dom,
    lifecycleFailures,
    errors,
    limits: {
      retainedHeap: 'Post-GC JS heap after each trial has returned and runtime/input clone references have left lexical scope; DOM, browser-native, texture, and GPU allocations are not included',
      gpu: 'No portable browser GPU retained-memory counter is exposed',
    },
    status: failures.length === 0 ? 'pass' : 'fail',
    failures,
  };
  await mkdir(RESULTS, { recursive: true });
  await writeFile(path.join(RESULTS, 'memory-lifecycle.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  if (failures.length) throw new Error(failures.join('; '));
  process.stdout.write(
    `PASS: Core v2 2+7 lifecycle, ${evidence.workload.expandedEntities} entities, retained heap median ${Math.round(median)} bytes, DOM/scheduler/renderer released\n`,
  );
} finally {
  await browser.close();
  await server.close();
}

function metric(result, name) {
  return result.metrics.find((entry) => entry.name === name)?.value ?? 0;
}

function percentile(sorted, quantile) {
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)];
}
