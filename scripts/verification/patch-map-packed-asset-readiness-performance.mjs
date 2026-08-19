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
const warmups = integerEnv('PATCH_MAP_ASSET_READY_WARMUPS', 2);
const measuredTrials = integerEnv('PATCH_MAP_ASSET_READY_MEASURED', 7);
const cases = parseCases(process.env.PATCH_MAP_ASSET_READY_CASES);
const artifacts = parseArtifacts(process.env.PATCH_MAP_ASSET_READY_ARTIFACTS);
const outputPath = path.resolve(
  process.env.PATCH_MAP_ASSET_READY_OUTPUT ??
    '.perf-results/patch-map/asset-readiness/final.json',
);
const temporary = await mkdtemp(path.join(os.tmpdir(), 'patch-map-asset-ready-'));
const servers = [];
let browser;

try {
  const consumers = [];
  for (const artifact of artifacts) {
    const consumer = path.join(temporary, artifact.label);
    await mkdir(consumer, { recursive: true });
    await writeFile(path.join(consumer, 'package.json'), `${JSON.stringify({
      name: `patch-map-asset-ready-${artifact.label}`,
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

  browser = await chromium.launch({
    headless: true,
    args: ['--enable-precise-memory-info'],
  });
  const raw = Object.fromEntries(consumers.map(({ label }) => [label, []]));
  const failures = [];
  for (const workload of cases) {
    for (let trial = 0; trial < warmups + measuredTrials; trial += 1) {
      const ordered = trial % 2 === 0 ? consumers : [...consumers].reverse();
      for (const consumer of ordered) {
        const page = await browser.newPage({ viewport: { width: 1_440, height: 1_000 } });
        const errors = [];
        page.on('console', (message) => {
          if (message.type() === 'error') errors.push(`console: ${message.text()}`);
        });
        page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
        await page.goto(consumer.baseURL, { waitUntil: 'networkidle', timeout: 120_000 });
        await page.waitForFunction(() => window.__PATCH_MAP_ASSET_READY_PERF__ !== undefined);
        const cdp = await page.context().newCDPSession(page);
        const heapBefore = await collectHeap(cdp);
        const value = await page.evaluate(
          ({ input, run }) => window.__PATCH_MAP_ASSET_READY_PERF__(input, run),
          { input: workload, run: trial },
        );
        const heapAfter = await collectHeap(cdp);
        await cdp.detach();
        const record = Object.freeze({
          caseId: caseId(workload),
          workload,
          trial,
          warmup: trial < warmups,
          ...value,
          heap: Object.freeze({
            beforeBytes: heapBefore,
            afterDestroyBytes: heapAfter,
            retainedDeltaBytes: heapAfter - heapBefore,
          }),
          errors,
        });
        raw[consumer.label].push(record);
        failures.push(...validate(record, consumer.label));
        await page.close();
      }
    }
  }

  const summaries = Object.fromEntries(consumers.map(({ label, path: artifactPath }) => [
    label,
    Object.freeze({
      artifactPath,
      byCase: Object.fromEntries(cases.map((workload) => {
        const id = caseId(workload);
        const values = raw[label].filter((value) => value.caseId === id && !value.warmup);
        return [id, summarize(values)];
      })),
    }),
  ]));
  const output = Object.freeze({
    schemaVersion: 1,
    checkpoint: 'patch-map-packed-asset-readiness-cross',
    generatedAt: new Date().toISOString(),
    protocol: Object.freeze({
      cases,
      warmups,
      measuredTrials,
      artifacts: consumers.map(({ label, path: artifactPath }) => ({ label, artifactPath })),
      order: 'alternating-per-trial-in-one-chromium-process',
      imageDelay: 'release-after-all-active-unique-loads-start-and-two-raf',
      backend: 'webgl',
      pixelRatio: 1,
      antialias: false,
      gpuRetainedBytes: 'unavailable; load/unload parity and zero runtime/canvas are ownership proxies',
    }),
    environment: Object.freeze({
      platform: process.platform,
      architecture: process.arch,
      cpuModel: os.cpus()[0]?.model ?? 'unknown',
      browser: browser.version(),
    }),
    summaries,
    raw,
    status: failures.length === 0 ? 'PASS' : 'FAIL',
    failures,
  });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    output: outputPath,
    status: output.status,
    summaries,
    failures,
  }, null, 2)}\n`);
  if (failures.length > 0) process.exitCode = 1;
} finally {
  await browser?.close().catch(() => undefined);
  await Promise.all(servers.map((server) => server.close().catch(() => undefined)));
  await rm(temporary, { recursive: true, force: true });
}

async function collectHeap(cdp) {
  await cdp.send('HeapProfiler.collectGarbage');
  const usage = await cdp.send('Runtime.getHeapUsage');
  return usage.usedSize;
}

function integerEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? String(fallback), 10);
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`${name} must be a non-negative integer`);
  return value;
}

function parseCases(input) {
  const values = input === undefined
    ? [
        { entities: 3_000, images: 300, bindings: 1 },
        { entities: 10_000, images: 300, bindings: 1 },
        { entities: 10_000, images: 3_000, bindings: 1 },
        { entities: 10_000, images: 3_000, bindings: 8 },
      ]
    : JSON.parse(input);
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError('PATCH_MAP_ASSET_READY_CASES must be a non-empty array');
  }
  return values.map((value, index) => {
    const entities = value?.entities;
    const images = value?.images;
    const bindings = value?.bindings;
    if (!Number.isInteger(entities) || !Number.isInteger(images) || !Number.isInteger(bindings) ||
      entities < 1 || images < 1 || images > entities || bindings < 1 || bindings > images) {
      throw new TypeError(`invalid asset readiness case at index ${index}`);
    }
    return Object.freeze({ entities, images, bindings });
  });
}

function parseArtifacts(input) {
  if (!input) throw new Error('PATCH_MAP_ASSET_READY_ARTIFACTS is required');
  const values = JSON.parse(input);
  if (!Array.isArray(values) || values.length < 2) {
    throw new Error('PATCH_MAP_ASSET_READY_ARTIFACTS must contain at least two artifacts');
  }
  return values.map((value, index) => {
    if (!value || typeof value !== 'object' || typeof value.label !== 'string' ||
      !/^[a-z0-9-]+$/u.test(value.label) || typeof value.path !== 'string' ||
      !path.isAbsolute(value.path)) {
      throw new TypeError(`invalid packed asset readiness artifact at index ${index}`);
    }
    return Object.freeze({ label: value.label, path: value.path });
  });
}

function caseId({ entities, images, bindings }) {
  return `e${entities}-i${images}-u${bindings}`;
}

function summarize(values) {
  return Object.freeze({
    mountReturnMs: stats(values.map(({ timing }) => timing.mountReturnMs)),
    firstCompleteMs: stats(values.map(({ timing }) => timing.firstCompleteMs)),
    releaseToCompleteMs: stats(values.map(({ timing }) => timing.releaseToCompleteMs)),
    publicationCount: stats(values.map(({ publication }) => publication.firstCompleteRevision)),
    acquireCalls: stats(values.map(({ counters }) => counters.acquireCalls)),
    acquireSourceCalls: stats(values.map(({ counters }) => counters.acquireSourceCalls)),
    imageLoadCount: stats(values.map(({ counters }) => counters.imageLoadStarted)),
    imageDecodeReadyCount: stats(values.map(({ counters }) => counters.imageLoadResolved)),
    imageUnloadCount: stats(values.map(({ counters }) => counters.imageUnloadCount)),
    textureUploadProxyCount: stats(values.map(({ counters }) => counters.textureUploads)),
    mountRafGapP95Ms: stats(values.map(({ frames }) => percentile(frames.mountGapsMs, 0.95))),
    steadyRafGapP95Ms: stats(values.map(({ frames }) => percentile(frames.steadyGapsMs, 0.95))),
    steadyRafGapMaxMs: stats(values.map(({ frames }) => Math.max(0, ...frames.steadyGapsMs))),
    longTaskCount: stats(values.map(({ longTasks }) => longTasks.length)),
    longTaskTotalMs: stats(values.map(({ longTasks }) => sum(longTasks))),
    heapRetainedDeltaBytes: stats(values.map(({ heap }) => heap.retainedDeltaBytes)),
  });
}

function validate(value, label) {
  const failures = [...value.errors];
  const prefix = `${label}/${value.caseId}`;
  if (value.observed.entities !== value.workload.entities) failures.push(`${prefix}: entity mismatch`);
  if (value.observed.images !== value.workload.images) failures.push(`${prefix}: image mismatch`);
  if (value.observed.bindings !== value.workload.bindings) failures.push(`${prefix}: binding mismatch`);
  if (value.counters.acquireSourceCalls !== value.workload.bindings) {
    failures.push(`${prefix}: acquireSource did not scale with unique bindings`);
  }
  if (value.counters.imageLoadStarted !== value.workload.bindings ||
    value.counters.imageLoadResolved !== value.workload.bindings ||
    value.counters.imageUnloadCount !== value.workload.bindings) {
    failures.push(`${prefix}: image load/decode/unload count mismatch`);
  }
  if (value.counters.backendLoadStarted !== value.counters.backendLoadResolved ||
    value.counters.backendLoadResolved !== value.counters.backendUnloadCount) {
    failures.push(`${prefix}: backend load/unload ownership mismatch`);
  }
  if (value.cleanup.canvasCount !== 0 || value.cleanup.runtime.resourceCount !== 0 ||
    value.cleanup.runtime.pendingCount !== 0 || value.cleanup.runtime.leaseCount !== 0 ||
    value.cleanup.runtime.cleanupPendingCount !== 0) {
    failures.push(`${prefix}: lifecycle cleanup mismatch`);
  }
  if (value.publication.firstCompleteRevision < 1) failures.push(`${prefix}: no complete publication`);
  if (value.renderer !== 'webgl') failures.push(`${prefix}: renderer was ${value.renderer}`);
  return failures;
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

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function browserSource() {
  return String.raw`
import {
  PatchMap,
  PatchMapAssetRuntime,
  createPatchMapPixiAssetBackend,
} from '@conalog/patch-map';

window.__PATCH_MAP_ASSET_READY_PERF__ = async (input, run) => {
  const host = document.createElement('div');
  host.style.width = '1440px';
  host.style.height = '1000px';
  document.body.appendChild(host);
  const sources = Array.from({ length: input.bindings }, (_, index) => imageSource(index));
  const data = Array.from({ length: input.entities }, (_, index) => {
    const attrs = { x: (index % 180) * 8, y: Math.floor(index / 180) * 8 };
    if (index < input.images) {
      return {
        type: 'image', id: 'image-' + index, show: true, attrs,
        size: { width: 6, height: 6 }, source: sources[index % sources.length],
      };
    }
    return {
      type: 'rect', id: 'rect-' + index, show: true, attrs,
      size: { width: 6, height: 6 }, fill: '#334155',
    };
  });
  const metric = createMeasuredRuntime();
  const uploads = installUploadCounter();
  const mountFrames = [];
  let frameSampling = true;
  const sampleFrame = (time) => {
    mountFrames.push(time);
    if (frameSampling) requestAnimationFrame(sampleFrame);
  };
  requestAnimationFrame(sampleFrame);
  const longTasks = [];
  const observer = new PerformanceObserver((list) => {
    longTasks.push(...list.getEntries().map((entry) => entry.duration));
  });
  try { observer.observe({ type: 'longtask', buffered: false }); } catch {}
  let map = null;
  let mountedMap = null;
  let mountReturnAt = null;
  const mountStarted = performance.now();
  try {
    const mountPromise = PatchMap.mount({
      container: host,
      instanceId: 'asset-ready-' + input.entities + '-' + input.images + '-' + input.bindings + '-' + run,
      width: 1440,
      height: 1000,
      pixelRatio: 1,
      antialias: false,
      backend: 'webgl',
      powerPreference: 'high-performance',
      resizeMode: 'manual',
      fit: false,
      assetPolicy: () => undefined,
      assetRuntime: metric.runtime,
      data,
    }).then((value) => {
      mountedMap = value;
      mountReturnAt = performance.now();
      return value;
    });
    await waitUntil(() => metric.counters.imageLoadStarted === input.bindings, 120000);
    await nextFrames(2);
    const pending = {
      mountReturned: mountedMap !== null,
      frameRevision: mountedMap?.debug.snapshot().frameRevision ?? 0,
      pendingCount: metric.runtime.probe().pendingCount,
    };
    const releasedAt = performance.now();
    metric.release();
    map = await mountPromise;
    await waitUntil(() => map.assets.status().runtime.pendingCount === 0, 120000);
    await nextFrames(2);
    const completeAt = performance.now();
    const complete = map.debug.snapshot();
    const mountGapsMs = gaps(mountFrames);

    const steadyFrames = [];
    let steadySampling = true;
    const sampleSteady = (time) => {
      steadyFrames.push(time);
      if (steadySampling) requestAnimationFrame(sampleSteady);
    };
    requestAnimationFrame(sampleSteady);
    for (let sequence = 0; sequence < 6; sequence += 1) {
      map.viewport.panBy([sequence % 2 === 0 ? 5 : -5, 2]);
      if (sequence === 2 || sequence === 4) map.viewport.zoomBy(sequence === 2 ? 1.005 : 1 / 1.005);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await nextFrames(2);
    steadySampling = false;
    frameSampling = false;
    observer.disconnect();
    const renderer = complete.resources.renderer?.backend ?? null;
    const firstCompleteRevision = complete.frameRevision;
    const destroy = await map.destroy();
    map = null;
    await nextFrames(2);
    const cleanup = {
      destroy,
      canvasCount: host.querySelectorAll('canvas').length,
      runtime: metric.runtime.probe(),
    };
    return {
      observed: { entities: data.length, images: input.images, bindings: new Set(sources).size },
      timing: {
        mountReturnMs: mountReturnAt - mountStarted,
        firstCompleteMs: completeAt - mountStarted,
        releaseToCompleteMs: completeAt - releasedAt,
      },
      pending,
      publication: { firstCompleteRevision },
      counters: { ...metric.counters, textureUploads: uploads.count() },
      frames: { mountGapsMs, steadyGapsMs: gaps(steadyFrames) },
      longTasks,
      renderer,
      cleanup,
      gpuRetainedBytes: null,
    };
  } finally {
    observer.disconnect();
    frameSampling = false;
    await map?.destroy().catch(() => undefined);
    await mountedMap?.destroy().catch(() => undefined);
    uploads.restore();
    host.remove();
  }
};

function createMeasuredRuntime() {
  const base = createPatchMapPixiAssetBackend();
  let releaseGate;
  const gate = new Promise((resolve) => { releaseGate = resolve; });
  let released = false;
  const imageKeys = new Set();
  const counters = {
    acquireCalls: 0,
    acquireSourceCalls: 0,
    backendGetCalls: 0,
    backendLoadStarted: 0,
    backendLoadResolved: 0,
    backendUnloadCount: 0,
    imageLoadStarted: 0,
    imageLoadResolved: 0,
    imageUnloadCount: 0,
  };
  const backend = {
    keyNamespace: base.keyNamespace + '-asset-readiness',
    get(request) {
      counters.backendGetCalls += 1;
      return base.get(request);
    },
    async load(request) {
      counters.backendLoadStarted += 1;
      const image = !request.packageOwned;
      if (image) {
        imageKeys.add(request.key);
        counters.imageLoadStarted += 1;
        await gate;
      }
      const resource = await base.load(request);
      counters.backendLoadResolved += 1;
      if (image) counters.imageLoadResolved += 1;
      return resource;
    },
    describe: base.describe?.bind(base),
    async unload(key) {
      await base.unload(key);
      counters.backendUnloadCount += 1;
      if (imageKeys.has(key)) counters.imageUnloadCount += 1;
    },
  };
  const runtime = new PatchMapAssetRuntime(backend);
  const originalCreateSession = runtime.createSession.bind(runtime);
  runtime.createSession = (options) => {
    const session = originalCreateSession(options);
    const originalAcquire = session.acquire.bind(session);
    const originalAcquireSource = session.acquireSource.bind(session);
    session.acquire = (...args) => {
      counters.acquireCalls += 1;
      return originalAcquire(...args);
    };
    session.acquireSource = (...args) => {
      counters.acquireSourceCalls += 1;
      return originalAcquireSource(...args);
    };
    return session;
  };
  return {
    runtime,
    counters,
    release: () => {
      if (released) return;
      released = true;
      releaseGate();
    },
  };
}

function installUploadCounter() {
  let count = 0;
  const originals = [];
  for (const constructor of [globalThis.WebGLRenderingContext, globalThis.WebGL2RenderingContext]) {
    if (constructor === undefined) continue;
    for (const name of ['texImage2D', 'texSubImage2D']) {
      const original = constructor.prototype[name];
      if (typeof original !== 'function') continue;
      originals.push([constructor.prototype, name, original]);
      constructor.prototype[name] = function (...args) {
        count += 1;
        return original.apply(this, args);
      };
    }
  }
  return {
    count: () => count,
    restore: () => {
      for (const [prototype, name, original] of originals) prototype[name] = original;
    },
  };
}

async function waitUntil(predicate, timeoutMs) {
  const started = performance.now();
  while (!predicate()) {
    if (performance.now() - started > timeoutMs) throw new Error('asset readiness timeout');
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function nextFrames(count) {
  for (let index = 0; index < count; index += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

function gaps(values) {
  return values.slice(1).map((time, index) => time - values[index]);
}

function imageSource(index) {
  const hue = (index * 47) % 360;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
    '<circle cx="16" cy="16" r="12" fill="hsl(' + hue + ' 80% 55%)"/></svg>';
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
`;
}
