#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const ROOT = process.cwd();
const SIZES = integerList(
  process.env.PATCH_MAP_PRODUCTION_PRESENTATION_SIZES ?? '349,3332,5000,10000',
);
const MODES = stringList(
  process.env.PATCH_MAP_PRODUCTION_PRESENTATION_MODES
    ?? 'animated,immediate,static-presentation',
);
const WARMUPS = integer(
  process.env.PATCH_MAP_PRODUCTION_PRESENTATION_WARMUPS ?? '1',
  true,
);
const MEASURED = integer(
  process.env.PATCH_MAP_PRODUCTION_PRESENTATION_MEASURED ?? '3',
);
const UPDATE_COUNT = integer(
  process.env.PATCH_MAP_PRODUCTION_PRESENTATION_UPDATES ?? '4',
);
const UPDATE_INTERVAL_MS = integer(
  process.env.PATCH_MAP_PRODUCTION_PRESENTATION_INTERVAL_MS ?? '35',
  true,
);
const PROFILE = process.env.PATCH_MAP_PRODUCTION_PRESENTATION_PROFILE === '1';
const OUTPUT = path.resolve(
  process.env.PATCH_MAP_PRODUCTION_PRESENTATION_OUTPUT
    ?? path.join(ROOT, '.perf-results/patch-map/production-presentation-latest.json'),
);
const PIXEL_RATIO = 1.5;
const DEVICE_SCALE_FACTOR = 2;
const ANIMATION_DURATION_MS = 200;

for (const mode of MODES) {
  if (!['animated', 'immediate', 'static-presentation'].includes(mode)) {
    throw new TypeError(`unsupported mode: ${mode}`);
  }
}

function integer(value, allowZero = false) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < (allowZero ? 0 : 1)) {
    throw new TypeError('performance integer must be valid');
  }
  return parsed;
}

function integerList(value) {
  return value.split(',').map((entry) => integer(entry.trim()));
}

function stringList(value) {
  const result = value.split(',').map((entry) => entry.trim()).filter(Boolean);
  if (result.length === 0) throw new TypeError('performance modes must not be empty');
  return result;
}

function percentile(values, quantile) {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(ordered.length * quantile) - 1)] ?? 0;
}

function stats(values) {
  return Object.freeze({
    samples: values.length,
    min: values.length === 0 ? 0 : Math.min(...values),
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: values.length === 0 ? 0 : Math.max(...values),
  });
}

function summarizeCpuProfile(profile) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parents = new Map();
  for (const node of profile.nodes) {
    for (const child of node.children ?? []) parents.set(child, node.id);
  }
  const timing = new Map();
  const add = (nodeId, name, deltaUs) => {
    const current = timing.get(nodeId) ?? { selfUs: 0, inclusiveUs: 0 };
    current[name] += deltaUs;
    timing.set(nodeId, current);
  };
  for (let index = 0; index < profile.samples.length; index += 1) {
    const nodeId = profile.samples[index];
    const deltaUs = profile.timeDeltas[index] ?? 0;
    add(nodeId, 'selfUs', deltaUs);
    let ancestor = nodeId;
    while (ancestor !== undefined) {
      add(ancestor, 'inclusiveUs', deltaUs);
      ancestor = parents.get(ancestor);
    }
  }
  return Object.freeze([...timing]
    .map(([nodeId, value]) => {
      const frame = nodes.get(nodeId)?.callFrame;
      return frame === undefined ? null : Object.freeze({
        functionName: frame.functionName || '(anonymous)',
        url: frame.url,
        lineNumber: frame.lineNumber + 1,
        selfMs: value.selfUs / 1_000,
        inclusiveMs: value.inclusiveUs / 1_000,
      });
    })
    .filter((entry) => entry !== null && entry.functionName !== '(idle)')
    .sort((left, right) => right.inclusiveMs - left.inclusiveMs)
    .slice(0, 50));
}

async function installWebGlProbe(page) {
  await page.addInitScript(() => {
    const counters = {
      bufferDataCalls: 0,
      bufferDataBytes: 0,
      bufferSubDataCalls: 0,
      bufferSubDataBytes: 0,
      drawCalls: 0,
    };
    const byteLength = (value) => {
      if (typeof value === 'number') return value;
      return value?.byteLength ?? 0;
    };
    const patch = (prototype) => {
      if (!prototype) return;
      const bufferData = prototype.bufferData;
      const bufferSubData = prototype.bufferSubData;
      const drawArrays = prototype.drawArrays;
      const drawElements = prototype.drawElements;
      prototype.bufferData = function patchedBufferData(...args) {
        counters.bufferDataCalls += 1;
        counters.bufferDataBytes += byteLength(args[1]);
        return bufferData.apply(this, args);
      };
      prototype.bufferSubData = function patchedBufferSubData(...args) {
        counters.bufferSubDataCalls += 1;
        counters.bufferSubDataBytes += byteLength(args[2]);
        return bufferSubData.apply(this, args);
      };
      prototype.drawArrays = function patchedDrawArrays(...args) {
        counters.drawCalls += 1;
        return drawArrays.apply(this, args);
      };
      prototype.drawElements = function patchedDrawElements(...args) {
        counters.drawCalls += 1;
        return drawElements.apply(this, args);
      };
    };
    patch(globalThis.WebGLRenderingContext?.prototype);
    patch(globalThis.WebGL2RenderingContext?.prototype);
    globalThis.__PATCH_MAP_WEBGL_PROBE__ = {
      snapshot: () => ({ ...counters }),
      reset: () => {
        for (const key of Object.keys(counters)) counters[key] = 0;
      },
    };
  });
}

async function mount(page, size, mode, trial) {
  await page.goto('/scripts/verification/patch-map-public-animation-performance.html', {
    waitUntil: 'networkidle',
    timeout: 120_000,
  });
  await page.waitForFunction(
    () => globalThis.__PATCH_MAP_PUBLIC_ANIMATION_MODULE__?.PatchMap !== undefined,
    undefined,
    { timeout: 120_000 },
  );
  return page.evaluate(async ({ recordCount, workloadMode, sequence }) => {
    const { PatchMap } = globalThis.__PATCH_MAP_PUBLIC_ANIMATION_MODULE__;
    const host = document.querySelector('#patch-map-performance-host');
    Object.assign(host.style, { width: '800px', height: '600px', overflow: 'hidden' });
    const columns = Math.min(64, Math.ceil(Math.sqrt(recordCount)));
    const rows = Math.ceil(recordCount / columns);
    const cells = Array.from({ length: rows }, (_, row) =>
      Array.from({ length: columns }, (_, column) =>
        row * columns + column < recordCount ? 1 : 0));
    const dataset = [{
      type: 'grid',
      id: 'production-grid',
      cells,
      gap: 2,
      item: {
        size: { width: 34, height: 46 },
        components: [{
          type: 'bar',
          id: 'level',
          source: { type: 'rect', fill: '#ffffff', radius: 3 },
          tint: '#4f46e5',
          size: { width: 24, height: 8 },
          placement: 'bottom',
          animation: workloadMode === 'animated',
          animationDuration: 200,
        }, {
          type: 'icon',
          id: 'status',
          source: 'wifi',
          tint: '#ffffff',
          size: { width: 12, height: 12 },
          placement: 'center',
          show: false,
          attrs: { zIndex: 10 },
        }],
      },
    }];
    const started = performance.now();
    const map = await PatchMap.mount({
      instanceId: `production-${recordCount}-${workloadMode}-${sequence}`,
      container: host,
      width: 800,
      height: 600,
      pixelRatio: 1.5,
      antialias: true,
      backend: 'webgl',
      resizeMode: 'manual',
      powerPreference: 'high-performance',
      data: dataset,
      fit: { padding: 24 },
    });
    const targets = map.targets.query({
      within: 'production-grid',
      type: 'grid-cell',
      scope: 'instances',
    });
    await map.capture.png();
    const snapshot = map.debug.snapshot();
    globalThis.__PATCH_MAP_PRODUCTION_PRESENTATION__ = { map, targets };
    globalThis.__PATCH_MAP_WEBGL_PROBE__.reset();
    return {
      mountMs: performance.now() - started,
      targetCount: targets.count,
      semanticHash: snapshot.semanticHash,
      sceneRevision: snapshot.revisions.sceneRevision,
      frameRevision: snapshot.frameRevision,
      renderer: snapshot.resources.renderer,
      canvas: snapshot.resources.canvas,
      devicePixelRatio: globalThis.devicePixelRatio,
      visiblePrimitiveCount: snapshot.resources.rendering.visiblePrimitiveCount,
    };
  }, { recordCount: size, workloadMode: mode, sequence: trial });
}

async function runTrial(page, size, mode, trial, cdp) {
  const mounted = await mount(page, size, mode, trial);
  await page.evaluate(() => {
    const sample = { stopped: false, raf: [], longTasks: [], observer: null };
    const observer = new PerformanceObserver((list) => {
      sample.longTasks.push(...list.getEntries().map((entry) => entry.duration));
    });
    try {
      observer.observe({ type: 'longtask', buffered: false });
      sample.observer = observer;
    } catch {
      // rAF gaps still expose blocked publication when Long Tasks are unavailable.
    }
    const tick = (time) => {
      sample.raf.push(time);
      if (!sample.stopped) requestAnimationFrame(tick);
    };
    globalThis.__PATCH_MAP_PRODUCTION_SAMPLE__ = sample;
    requestAnimationFrame(tick);
  });
  if (cdp !== null) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
    await cdp.send('Profiler.start');
  }

  const actions = [];
  for (let sequence = 0; sequence < UPDATE_COUNT; sequence += 1) {
    actions.push(await page.evaluate(({ actionSequence, workloadMode }) => {
      const { map, targets } = globalThis.__PATCH_MAP_PRODUCTION_PRESENTATION__;
      const count = targets.count;
      const heights = new Float64Array(count);
      const barTints = new Array(count);
      const barSources = new Array(count);
      const barShows = new Array(count);
      const iconShows = new Array(count);
      const iconSources = new Array(count);
      const iconTints = new Array(count);
      const roundedSource = { type: 'rect', fill: '#ffffff', radius: 3 };
      const palette = ['#2563eb', '#7c3aed', '#0891b2'];
      for (let index = 0; index < count; index += 1) {
        const cohortChanges = index % 10 === actionSequence % 10;
        const state = cohortChanges ? actionSequence % 3 : index % 3;
        heights[index] = 5 + ((index * 17 + actionSequence * 23) % 37);
        barTints[index] = palette[state];
        barSources[index] = roundedSource;
        barShows[index] = true;
        iconShows[index] = state === 2;
        iconSources[index] = state === 1 ? 'device' : 'wifi';
        iconTints[index] = state === 2 ? '#ef4444' : '#f97316';
      }
      const beforeGpu = globalThis.__PATCH_MAP_WEBGL_PROBE__.snapshot();
      const started = performance.now();
      const bar = {
        componentId: 'level',
        ...(workloadMode === 'static-presentation' ? {} : { height: heights }),
        changes: { tint: barTints, source: barSources, show: barShows },
      };
      const result = map.updateBatch({
        targets,
        bar,
        icon: {
          componentId: 'status',
          changes: { show: iconShows, source: iconSources, tint: iconTints },
        },
      }, { animate: workloadMode === 'animated' });
      const updateMs = performance.now() - started;
      map.viewport.panBy([actionSequence % 2 === 0 ? 5 : -4, 3]);
      map.viewport.zoomBy(
        actionSequence % 2 === 0 ? 1.004 : 1 / 1.004,
        [400, 300],
      );
      return { result, updateMs, beforeGpu };
    }, { actionSequence: sequence + 1, workloadMode: mode }));
    if (UPDATE_INTERVAL_MS > 0) await page.waitForTimeout(UPDATE_INTERVAL_MS);
  }
  await page.waitForTimeout(ANIMATION_DURATION_MS + 150);

  const sample = await page.evaluate(() => {
    const current = globalThis.__PATCH_MAP_PRODUCTION_SAMPLE__;
    current.stopped = true;
    current.observer?.disconnect();
    const { map } = globalThis.__PATCH_MAP_PRODUCTION_PRESENTATION__;
    const snapshot = map.debug.snapshot();
    return {
      raf: current.raf,
      longTasks: current.longTasks,
      gpu: globalThis.__PATCH_MAP_WEBGL_PROBE__.snapshot(),
      semanticHash: snapshot.semanticHash,
      sceneRevision: snapshot.revisions.sceneRevision,
      frameRevision: snapshot.frameRevision,
    };
  });
  const cpuProfile = cdp === null
    ? null
    : summarizeCpuProfile((await cdp.send('Profiler.stop')).profile);
  const cleanup = await page.evaluate(async () => {
    const { map } = globalThis.__PATCH_MAP_PRODUCTION_PRESENTATION__;
    await map.destroy();
    delete globalThis.__PATCH_MAP_PRODUCTION_PRESENTATION__;
    return document.querySelectorAll('#patch-map-performance-host canvas').length;
  });
  const rafGapsMs = sample.raf.slice(1).map((time, index) => time - sample.raf[index]);
  return Object.freeze({
    trial,
    mounted,
    actions: Object.freeze(actions),
    rafGapsMs: Object.freeze(rafGapsMs),
    longTasks: Object.freeze(sample.longTasks),
    gpu: Object.freeze(sample.gpu),
    semanticHash: sample.semanticHash,
    sceneRevision: sample.sceneRevision,
    frameRevision: sample.frameRevision,
    cleanupCanvasCount: cleanup,
    cpuProfile,
  });
}

function validate(trial, size, mode) {
  const failures = [];
  if (trial.mounted.targetCount !== size) failures.push(`${size}/${mode}: target mismatch`);
  if (trial.mounted.renderer?.backend !== 'webgl') failures.push(`${size}/${mode}: not WebGL`);
  if (trial.mounted.renderer?.resolution !== PIXEL_RATIO) {
    failures.push(`${size}/${mode}: renderer resolution mismatch`);
  }
  if (trial.mounted.renderer?.antialias !== true) failures.push(`${size}/${mode}: AA disabled`);
  if (trial.mounted.devicePixelRatio !== DEVICE_SCALE_FACTOR) {
    failures.push(`${size}/${mode}: DPR mismatch`);
  }
  if (trial.actions.some(({ result }) => result.status !== 'committed')) {
    failures.push(`${size}/${mode}: update did not commit`);
  }
  if (trial.semanticHash !== trial.mounted.semanticHash) {
    failures.push(`${size}/${mode}: semantic hash changed`);
  }
  if (trial.sceneRevision !== trial.mounted.sceneRevision) {
    failures.push(`${size}/${mode}: scene revision changed`);
  }
  if (trial.frameRevision <= trial.mounted.frameRevision) {
    failures.push(`${size}/${mode}: no frame published`);
  }
  if (trial.cleanupCanvasCount !== 0) failures.push(`${size}/${mode}: cleanup failed`);
  return failures;
}

function summarize(trials) {
  const updates = trials.flatMap((trial) => trial.actions.map(({ updateMs }) => updateMs));
  const gaps = trials.flatMap((trial) => trial.rafGapsMs);
  const longTasks = trials.flatMap((trial) => trial.longTasks);
  return Object.freeze({
    mountMs: stats(trials.map(({ mounted }) => mounted.mountMs)),
    retargetMs: stats(updates),
    frameGapMs: stats(gaps),
    longTasks: Object.freeze({
      count: longTasks.length,
      durationMs: stats(longTasks),
      trialsWithLongTasks: trials.filter((trial) => trial.longTasks.length > 0).length,
    }),
    gpu: Object.freeze({
      bufferDataCalls: stats(trials.map((trial) => trial.gpu.bufferDataCalls)),
      bufferDataBytes: stats(trials.map((trial) => trial.gpu.bufferDataBytes)),
      bufferSubDataCalls: stats(trials.map((trial) => trial.gpu.bufferSubDataCalls)),
      bufferSubDataBytes: stats(trials.map((trial) => trial.gpu.bufferSubDataBytes)),
      drawCalls: stats(trials.map((trial) => trial.gpu.drawCalls)),
    }),
  });
}

const server = await createServer({
  root: ROOT,
  configFile: path.join(ROOT, 'vite.patch-map-lab.config.ts'),
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, strictPort: false },
});
let browser;
try {
  await server.listen();
  const baseURL = server.resolvedUrls?.local?.[0];
  if (!baseURL) throw new Error('missing local Vite URL');
  browser = await chromium.launch({ headless: true });
  const runs = [];
  const failures = [];
  for (const size of SIZES) {
    for (const mode of MODES) {
      const warmups = [];
      const measured = [];
      for (let trial = 0; trial < WARMUPS + MEASURED; trial += 1) {
        const page = await browser.newPage({
          baseURL,
          viewport: { width: 900, height: 700 },
          deviceScaleFactor: DEVICE_SCALE_FACTOR,
        });
        await installWebGlProbe(page);
        const cdp = PROFILE && trial === WARMUPS
          ? await page.context().newCDPSession(page)
          : null;
        const result = await runTrial(page, size, mode, trial, cdp);
        await cdp?.detach();
        failures.push(...validate(result, size, mode));
        (trial < WARMUPS ? warmups : measured).push(result);
        await page.close();
      }
      runs.push(Object.freeze({
        size,
        mode,
        warmups: Object.freeze(warmups),
        measured: Object.freeze(measured),
        summary: summarize(measured),
      }));
    }
  }
  const output = Object.freeze({
    schemaVersion: 1,
    checkpoint: 'patch-map-production-grid-presentation',
    generatedAt: new Date().toISOString(),
    commit: process.env.PATCH_MAP_PRODUCTION_PRESENTATION_COMMIT ?? null,
    protocol: Object.freeze({
      sizes: Object.freeze(SIZES),
      modes: Object.freeze(MODES),
      warmups: WARMUPS,
      measured: MEASURED,
      updateCount: UPDATE_COUNT,
      updateIntervalMs: UPDATE_INTERVAL_MS,
      animationDurationMs: ANIMATION_DURATION_MS,
      pixelRatio: PIXEL_RATIO,
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
      antialias: true,
      backend: 'webgl',
      publicApi: 'PatchMap.mount + targets.query + updateBatch + viewport + capture',
      cpuProfile: PROFILE,
      windowsNative: 'pending',
    }),
    environment: Object.freeze({
      platform: process.platform,
      architecture: process.arch,
      cpuModel: os.cpus()[0]?.model ?? 'unknown',
      browser: 'playwright chromium',
    }),
    runs: Object.freeze(runs),
    status: failures.length === 0 ? 'PASS' : 'FAIL',
    failures: Object.freeze(failures),
  });
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    output: OUTPUT,
    status: output.status,
    runs: runs.map(({ size, mode, summary }) => ({ size, mode, summary })),
    profiles: runs.map(({ size, mode, measured }) => ({
      size,
      mode,
      cpuProfile: measured.find((trial) => trial.cpuProfile !== null)?.cpuProfile ?? null,
    })),
    failures,
  }, null, 2)}\n`);
  if (failures.length > 0) process.exitCode = 1;
} finally {
  await browser?.close().catch(() => undefined);
  await server.close();
}
