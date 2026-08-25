#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { chromium } from 'playwright';
import { createServer } from 'vite';

import {
  parsePatchMapBrowserLaunch,
  parsePatchMapNativeWindowsCell,
} from '../../verification/browser-launch.mjs';

const ROOT = process.cwd();
const browserLaunch = parsePatchMapBrowserLaunch(process.argv.slice(2), {
  extraArgs: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
});
const nativeWindows = parsePatchMapNativeWindowsCell(process.argv.slice(2), browserLaunch);
const protocol = Object.freeze({
  warmups: nativeWindows.requested ? 0 : 2,
  measured: nativeWindows.requested ? 10 : 7,
  size: 1_000,
  seed: 0x4d454d,
});
const resultsRoot = path.resolve(
  process.env.PATCH_MAP_MEMORY_ARTIFACT_DIR
    ?? path.join(ROOT, '.artifacts/performance/memory'),
);

const server = await createServer({
  root: ROOT,
  configFile: false,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
});
let browser;
let context;
try {
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  if (!baseUrl) throw new Error('memory probe server has no URL');
  browser = await chromium.launch(browserLaunch.launchOptions);
  context = await browser.newContext({ viewport: { width: 1_280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`page: ${error.stack ?? error.message}`));
  page.on('requestfailed', (request) => errors.push(`network: ${request.url()}`));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('HeapProfiler.enable');
  await page.goto(new URL('performance/probes/memory/index.html', baseUrl).href, {
    waitUntil: 'networkidle',
  });
  await page.waitForFunction(() => typeof window.__PATCH_MAP_MEMORY__?.run === 'function');
  const gpu = await collectGpu(page);
  await cdp.send('HeapProfiler.collectGarbage');
  const processHeapBefore = metric(await cdp.send('Performance.getMetrics'), 'JSHeapUsedSize');
  const run = await page.evaluate(
    (spec) => window.__PATCH_MAP_MEMORY__.run(spec),
    protocol,
  );
  await cdp.send('HeapProfiler.collectGarbage');
  const processHeapAfter = metric(await cdp.send('Performance.getMetrics'), 'JSHeapUsedSize');
  const samples = run.measuredRaw.map(({ retainedJsHeapBytes }) => retainedJsHeapBytes);
  const sorted = [...samples].sort((left, right) => left - right);
  const median = percentile(sorted, 0.5);
  const p95 = percentile(sorted, 0.95);
  const maximum = Math.max(...samples);
  const trend = samples.at(-1) - samples[0];
  const processDelta = processHeapAfter - processHeapBefore;
  const lifecycleFailures = run.measuredRaw.filter((trial) => (
    trial.destroyed !== true
    || trial.lifecycleAfterDestroy !== 'destroyed'
    || trial.canvasCountAfterDestroy !== 0
    || trial.pendingWorkAfterDestroy !== 0
    || trial.subscriptionCountAfterDestroy !== 0
    || trial.hostChildCountAfterDestroy !== 0
    || trial.inputUnchanged !== true
    || trial.backend !== 'webgl'
  ));
  const gpuIdentity = [gpu.renderer, gpu.unmaskedRenderer].filter(Boolean).join(' ');
  const softwareGpu = /swiftshader|llvmpipe|software raster/iu.test(gpuIdentity);
  const failures = [
    ...(errors.length > 0 ? ['browser errors are not empty'] : []),
    ...(lifecycleFailures.length > 0 ? ['mount/load/destroy did not release resources'] : []),
    ...(!samples.every((value) => Number.isFinite(value) && value >= 0)
      ? ['retained heap samples are invalid'] : []),
    ...(median > 20 * 1024 * 1024 ? [`retained heap median ${median} exceeds 20 MiB`] : []),
    ...(maximum > 50 * 1024 * 1024 ? [`retained heap max ${maximum} exceeds 50 MiB`] : []),
    ...(trend > 10 * 1024 * 1024 ? [`retained heap trend ${trend} exceeds 10 MiB`] : []),
    ...(processDelta > 20 * 1024 * 1024 ? [`post-GC process delta ${processDelta} exceeds 20 MiB`] : []),
    ...(nativeWindows.requested && processDelta > 2 * 1024 * 1024
      ? [`native post-GC process delta ${processDelta} exceeds 2 MiB`] : []),
    ...(nativeWindows.requested && gpu.context !== 'webgl2'
      ? ['native memory run did not acquire WebGL2'] : []),
    ...(nativeWindows.requested && softwareGpu
      ? [`native memory run used a software GPU: ${gpuIdentity}`] : []),
  ];
  const result = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    codeCommit: process.env.PATCH_MAP_CODE_COMMIT ?? 'uncommitted',
    protocol,
    environment: {
      platform: process.platform,
      architecture: process.arch,
      browserVersion: browser.version(),
      browserTarget: browserLaunch.target,
      headed: browserLaunch.headed,
      windowsNative: nativeWindows.requested,
      osRelease: os.release(),
      cpuModel: os.cpus()[0]?.model ?? 'unknown',
      gpu,
    },
    jsHeap: { samples, median, p95, maximum, trend, processHeapBefore, processHeapAfter, processDelta },
    lifecycleFailureCount: lifecycleFailures.length,
    errors,
    status: failures.length === 0 ? 'pass' : 'fail',
    failures,
  };
  await mkdir(resultsRoot, { recursive: true });
  await writeFile(path.join(resultsRoot, 'memory-lifecycle.json'), `${JSON.stringify(result, null, 2)}\n`);
  if (failures.length > 0) throw new Error(failures.join('; '));
  process.stdout.write(
    `PASS: PatchMap memory ${protocol.warmups}+${protocol.measured}, retained heap median `
      + `${Math.round(median)} bytes, mount/load/destroy resources released\n`,
  );
} finally {
  await context?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  await server.close().catch(() => undefined);
}

async function collectGpu(page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return { context: null, renderer: null, unmaskedRenderer: null };
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      context: 'webgl2',
      renderer: gl.getParameter(gl.RENDERER),
      unmaskedRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
    };
  });
}

function metric(result, name) {
  return result.metrics.find((entry) => entry.name === name)?.value ?? 0;
}

function percentile(sorted, quantile) {
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)];
}
