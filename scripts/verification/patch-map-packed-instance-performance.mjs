#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const execute = promisify(execFile);
const WARMUPS = Number.parseInt(process.env.PATCH_MAP_PACKED_PERF_WARMUPS ?? '2', 10);
const MEASURED = Number.parseInt(process.env.PATCH_MAP_PACKED_PERF_MEASURED ?? '7', 10);
const SIZES = (process.env.PATCH_MAP_PACKED_PERF_SIZES ?? '5000,10000')
  .split(',')
  .map((value) => Number.parseInt(value, 10));
const artifacts = parseArtifacts(process.env.PATCH_MAP_PACKED_PERF_ARTIFACTS);
const outputPath = path.resolve(
  process.env.PATCH_MAP_PACKED_PERF_OUTPUT ??
    '.perf-results/patch-map/packed-instance-height-cross.json',
);
const temporary = await mkdtemp(path.join(os.tmpdir(), 'patch-map-packed-perf-'));
const servers = [];
let browser;

try {
  const consumers = [];
  for (const artifact of artifacts) {
    const consumer = path.join(temporary, artifact.label);
    await mkdir(consumer, { recursive: true });
    await writeFile(path.join(consumer, 'package.json'), `${JSON.stringify({
      name: `patch-map-packed-perf-${artifact.label}`,
      private: true,
      type: 'module',
      dependencies: {
        '@conalog/patch-map': `file:${artifact.path}`,
        'pixi.js': '8.19.0',
      },
    }, null, 2)}\n`);
    await writeFile(
      path.join(consumer, 'index.html'),
      '<!doctype html><html><body style="margin:0"><script type="module" src="/main.js"></script></body></html>\n',
    );
    await writeFile(path.join(consumer, 'main.js'), browserSource());
    await execute('npm', [
      'install',
      '--prefer-offline',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
    ], { cwd: consumer, maxBuffer: 20 * 1024 * 1024 });
    const server = await createServer({
      root: consumer,
      configFile: false,
      logLevel: 'error',
      server: { host: '127.0.0.1', port: 0, strictPort: false },
    });
    await server.listen();
    servers.push(server);
    const baseURL = server.resolvedUrls?.local?.[0];
    if (!baseURL) throw new Error(`missing Vite URL for ${artifact.label}`);
    consumers.push(Object.freeze({ ...artifact, baseURL }));
  }

  browser = await chromium.launch({ headless: true });
  const raw = Object.fromEntries(consumers.map(({ label }) => [label, []]));
  const failures = [];
  for (const size of SIZES) {
    for (let trial = 0; trial < WARMUPS + MEASURED; trial += 1) {
      const ordered = trial % 2 === 0 ? consumers : [...consumers].reverse();
      for (const consumer of ordered) {
        const page = await browser.newPage({ viewport: { width: 1_440, height: 1_000 } });
        const errors = [];
        page.on('console', (message) => {
          if (message.type() === 'error') errors.push(`console: ${message.text()}`);
        });
        page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
        await page.goto(consumer.baseURL, { waitUntil: 'networkidle', timeout: 120_000 });
        await page.waitForFunction(() => window.__PATCH_MAP_PACKED_PERF__ !== undefined);
        const value = await page.evaluate(
          ({ recordCount, run }) => window.__PATCH_MAP_PACKED_PERF__(recordCount, run),
          { recordCount: size, run: trial },
        );
        value.errors = errors;
        raw[consumer.label].push(Object.freeze({
          size,
          trial,
          warmup: trial < WARMUPS,
          ...value,
        }));
        failures.push(...validate(value, consumer.label, size));
        await page.close();
      }
    }
  }

  const summaries = Object.fromEntries(consumers.map(({ label, path: artifactPath }) => {
    const bySize = Object.fromEntries(SIZES.map((size) => {
      const measured = raw[label].filter((value) => value.size === size && !value.warmup);
      const repeated = measured.flatMap(({ actionMs }) => actionMs.slice(1));
      const gaps = measured.flatMap(({ rafGapsMs }) => rafGapsMs);
      return [size, Object.freeze({
        mountMs: stats(measured.map(({ mountMs }) => mountMs)),
        firstActionMs: stats(measured.map(({ actionMs }) => actionMs[0])),
        repeatedActionMs: stats(repeated),
        repeatedActionP95Ms: stats(measured.map(({ actionMs }) =>
          percentile(actionMs.slice(1), 0.95))),
        rafGapMs: stats(gaps),
        rafGapP95Ms: stats(measured.map(({ rafGapsMs }) => percentile(rafGapsMs, 0.95))),
        rafGapMaxMs: stats(measured.map(({ rafGapsMs }) => Math.max(...rafGapsMs))),
        longTaskCount: stats(measured.map(({ longTasks }) => longTasks.length)),
      })];
    }));
    return [label, Object.freeze({ artifactPath, bySize })];
  }));
  const output = Object.freeze({
    schemaVersion: 1,
    checkpoint: 'patch-map-packed-public-instance-height-cross',
    generatedAt: new Date().toISOString(),
    protocol: Object.freeze({
      sizes: SIZES,
      warmups: WARMUPS,
      measured: MEASURED,
      updateCount: 6,
      updateIntervalMs: 75,
      artifacts: consumers.map(({ label, path: artifactPath }) => ({ label, artifactPath })),
      order: 'alternating-per-trial-in-one-chromium-process',
      backend: 'webgl2',
      pixelRatio: 1,
      antialias: false,
    }),
    environment: Object.freeze({
      platform: process.platform,
      architecture: process.arch,
      cpuModel: os.cpus()[0]?.model ?? 'unknown',
      browser: 'playwright chromium',
    }),
    summaries,
    raw,
    status: failures.length === 0 ? 'PASS' : 'FAIL',
    failures,
  });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ output: outputPath, status: output.status, summaries, failures }, null, 2)}\n`);
  if (failures.length > 0) process.exitCode = 1;
} finally {
  await browser?.close().catch(() => undefined);
  await Promise.all(servers.map((server) => server.close().catch(() => undefined)));
  await rm(temporary, { recursive: true, force: true });
}

function parseArtifacts(input) {
  if (!input) throw new Error('PATCH_MAP_PACKED_PERF_ARTIFACTS is required');
  const values = JSON.parse(input);
  if (!Array.isArray(values) || values.length < 2) {
    throw new Error('PATCH_MAP_PACKED_PERF_ARTIFACTS must contain at least two artifacts');
  }
  return values.map((value, index) => {
    if (!value || typeof value !== 'object' || typeof value.label !== 'string' ||
      !/^[a-z0-9-]+$/u.test(value.label) || typeof value.path !== 'string' ||
      !path.isAbsolute(value.path)) {
      throw new TypeError(`invalid packed performance artifact at index ${index}`);
    }
    return Object.freeze({ label: value.label, path: value.path });
  });
}

function percentile(values, quantile) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)] ?? 0;
}

function stats(values) {
  return Object.freeze({
    samples: Object.freeze([...values]),
    min: Math.min(...values),
    median: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: Math.max(...values),
  });
}

function validate(value, label, size) {
  const failures = [...value.errors];
  if (value.targetCount !== size) failures.push(`${label}/${size}: target count mismatch`);
  if (value.actions.some(({ status, appliedCount }) => status !== 'committed' || appliedCount !== size)) {
    failures.push(`${label}/${size}: update result mismatch`);
  }
  if (value.semanticHashBefore !== value.semanticHashAfter) {
    failures.push(`${label}/${size}: semantic hash changed`);
  }
  if (value.sceneRevisionBefore !== value.sceneRevisionAfter) {
    failures.push(`${label}/${size}: scene revision changed`);
  }
  if (value.canvasCountAfterDestroy !== 0) failures.push(`${label}/${size}: canvas cleanup failed`);
  if (value.renderer !== 'webgl') failures.push(`${label}/${size}: renderer was ${value.renderer}`);
  return failures;
}

function browserSource() {
  return String.raw`
import { PatchMap } from '@conalog/patch-map';

window.__PATCH_MAP_PACKED_PERF__ = async (recordCount, run) => {
  const host = document.createElement('div');
  host.style.width = '1440px';
  host.style.height = '1000px';
  document.body.appendChild(host);
  const columns = 100;
  const rows = Math.ceil(recordCount / columns);
  const cells = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) => row * columns + column < recordCount ? 1 : 0));
  const data = [{
    type: 'grid', id: 'perf-grid', cells, gap: 2,
    item: {
      size: { width: 34, height: 46 },
      components: [{
        type: 'bar', id: 'level',
        source: { type: 'rect', fill: '#ffffff', radius: 3 },
        tint: '#4f46e5', size: { width: 24, height: 8 }, placement: 'bottom',
        animation: true, animationDuration: 2000,
      }],
    },
  }];
  let map;
  try {
    const mountStarted = performance.now();
    map = await PatchMap.mount({
      container: host,
      instanceId: 'packed-perf-' + recordCount + '-' + run,
      width: 1440,
      height: 1000,
      pixelRatio: 1,
      antialias: false,
      backend: 'webgl',
      powerPreference: 'high-performance',
      resizeMode: 'manual',
      fit: { padding: 24 },
      data,
    });
    const mountMs = performance.now() - mountStarted;
    const targets = map.targets.query({ within: 'perf-grid', type: 'grid-cell', scope: 'instances' });
    const initial = map.debug.snapshot();
    const sample = { stopped: false, raf: [], longTasks: [] };
    const observer = new PerformanceObserver((list) => {
      sample.longTasks.push(...list.getEntries().map((entry) => entry.duration));
    });
    try { observer.observe({ type: 'longtask', buffered: false }); } catch {}
    const tick = (time) => {
      sample.raf.push(time);
      if (!sample.stopped) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const actions = [];
    for (let sequence = 1; sequence <= 6; sequence += 1) {
      const heights = new Float64Array(targets.count);
      for (let index = 0; index < heights.length; index += 1) {
        heights[index] = 5 + ((index * 17 + sequence * 23) % 37);
      }
      const started = performance.now();
      const result = map.updateBatch({
        targets,
        bar: { componentId: 'level', height: heights },
      }, { animate: true });
      actions.push({
        status: result.status,
        appliedCount: result.appliedCount,
        wallMs: performance.now() - started,
      });
      map.viewport.panBy([6, 3]);
      if (sequence === 3) map.viewport.zoomBy(1.005);
      await new Promise((resolve) => setTimeout(resolve, 75));
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
    sample.stopped = true;
    observer.disconnect();
    const settled = map.debug.snapshot();
    const rafGapsMs = sample.raf.slice(1).map((time, index) => time - sample.raf[index]);
    const destroy = await map.destroy();
    map = null;
    return {
      mountMs,
      targetCount: targets.count,
      actions,
      actionMs: actions.map(({ wallMs }) => wallMs),
      rafGapsMs,
      longTasks: sample.longTasks,
      semanticHashBefore: initial.semanticHash,
      semanticHashAfter: settled.semanticHash,
      sceneRevisionBefore: initial.revisions.sceneRevision,
      sceneRevisionAfter: settled.revisions.sceneRevision,
      renderer: initial.resources.renderer?.backend ?? null,
      destroy,
      canvasCountAfterDestroy: host.querySelectorAll('canvas').length,
    };
  } finally {
    await map?.destroy().catch(() => undefined);
    host.remove();
  }
};
`;
}
