#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const ROOT = process.cwd();
const execute = promisify(execFile);
const PACKAGE_SPECS = packageSpecs(
  process.env.PATCH_MAP_PRODUCTION_PRESENTATION_PACKAGES ??
    process.env.PATCH_MAP_PRODUCTION_PRESENTATION_PACKAGE ?? null,
);
const SIZES = integerList(
  process.env.PATCH_MAP_PRODUCTION_PRESENTATION_SIZES ?? '349,3332,5000,10000',
);
const MODES = stringList(
  process.env.PATCH_MAP_PRODUCTION_PRESENTATION_MODES
    ?? 'animated,immediate,static-presentation',
);
const SCENARIOS = stringList(
  process.env.PATCH_MAP_PRODUCTION_PRESENTATION_SCENARIOS ?? 'fit,zoomed',
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
const COVERAGE = process.env.PATCH_MAP_PRODUCTION_PRESENTATION_COVERAGE === '1';
const OUTPUT = path.resolve(
  process.env.PATCH_MAP_PRODUCTION_PRESENTATION_OUTPUT
    ?? path.join(ROOT, '.artifacts/performance/production-presentation-latest.json'),
);
const PIXEL_RATIO = 1.5;
const DEVICE_SCALE_FACTOR = 2;
const ANIMATION_DURATION_MS = 200;

for (const mode of MODES) {
  if (!['animated', 'immediate', 'static-presentation'].includes(mode)) {
    throw new TypeError(`unsupported mode: ${mode}`);
  }
}
for (const scenario of SCENARIOS) {
  if (!['fit', 'zoomed'].includes(scenario)) {
    throw new TypeError(`unsupported scenario: ${scenario}`);
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

function packageSpecs(input) {
  if (input === null) return Object.freeze([{ label: 'source', path: null }]);
  const parsed = input.trim().startsWith('[')
    ? JSON.parse(input)
    : [{ label: 'package', path: input }];
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new TypeError('performance package list must not be empty');
  }
  return Object.freeze(parsed.map((entry, index) => {
    if (
      entry === null ||
      typeof entry !== 'object' ||
      typeof entry.label !== 'string' ||
      !/^[a-z0-9-]+$/u.test(entry.label) ||
      typeof entry.path !== 'string' ||
      !path.isAbsolute(entry.path)
    ) {
      throw new TypeError(`invalid performance package at index ${index}`);
    }
    return Object.freeze({ label: entry.label, path: entry.path });
  }));
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

async function mount(page, fixturePath, size, mode, scenario, trial) {
  await page.goto(fixturePath, {
    waitUntil: 'networkidle',
    timeout: 120_000,
  });
  await page.waitForFunction(
    () => globalThis.__PATCH_MAP_PUBLIC_ANIMATION_MODULE__?.PatchMap !== undefined,
    undefined,
    { timeout: 120_000 },
  );
  return page.evaluate(async ({ recordCount, workloadMode, viewportScenario, sequence }) => {
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
    if (viewportScenario === 'zoomed') {
      for (let index = 0; index < 5; index += 1) {
        map.viewport.zoomBy(1.25, [400, 300]);
      }
      await map.capture.png();
    }
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
  }, { recordCount: size, workloadMode: mode, viewportScenario: scenario, sequence: trial });
}

async function runTrial(page, fixturePath, size, mode, scenario, trial, cdp) {
  const mounted = await mount(page, fixturePath, size, mode, scenario, trial);
  await page.evaluate(() => {
    const sample = { stopped: false, raf: [], longTasks: [], actionEnds: [], observer: null };
    const observer = new PerformanceObserver((list) => {
      sample.longTasks.push(...list.getEntries().map((entry) => ({
        startTime: entry.startTime,
        duration: entry.duration,
      })));
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
    if (COVERAGE) {
      await cdp.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
    }
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
      globalThis.__PATCH_MAP_PRODUCTION_SAMPLE__.actionEnds.push(performance.now());
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
      actionEnds: current.actionEnds,
      gpu: globalThis.__PATCH_MAP_WEBGL_PROBE__.snapshot(),
      semanticHash: snapshot.semanticHash,
      sceneRevision: snapshot.revisions.sceneRevision,
      frameRevision: snapshot.frameRevision,
    };
  });
  const cpuProfile = cdp === null
    ? null
    : summarizeCpuProfile((await cdp.send('Profiler.stop')).profile);
  const preciseCoverage = cdp === null || !COVERAGE
    ? null
    : summarizePreciseCoverage((await cdp.send('Profiler.takePreciseCoverage')).result);
  if (cdp !== null && COVERAGE) await cdp.send('Profiler.stopPreciseCoverage');
  const cleanup = await page.evaluate(async () => {
    const { map } = globalThis.__PATCH_MAP_PRODUCTION_PRESENTATION__;
    await map.destroy();
    delete globalThis.__PATCH_MAP_PRODUCTION_PRESENTATION__;
    return document.querySelectorAll('#patch-map-performance-host canvas').length;
  });
  const rafGapsMs = sample.raf.slice(1).map((time, index) => time - sample.raf[index]);
  const finalActionEnd = sample.actionEnds.at(-1) ?? Number.POSITIVE_INFINITY;
  const settlementWindowStart = finalActionEnd + ANIMATION_DURATION_MS - 50;
  const settlementWindowEnd = finalActionEnd + ANIMATION_DURATION_MS + 100;
  const settlementFrameGapsMs = sample.raf.slice(1).flatMap((time, index) => {
    const previous = sample.raf[index] ?? time;
    return time >= settlementWindowStart && previous <= settlementWindowEnd
      ? [time - previous]
      : [];
  });
  const settlementLongTasks = sample.longTasks.filter(({ startTime, duration }) =>
    startTime + duration >= settlementWindowStart && startTime <= settlementWindowEnd);
  return Object.freeze({
    trial,
    mounted,
    actions: Object.freeze(actions),
    rafGapsMs: Object.freeze(rafGapsMs),
    settlementFrameGapsMs: Object.freeze(settlementFrameGapsMs),
    settlementLongTasks: Object.freeze(settlementLongTasks),
    longTasks: Object.freeze(sample.longTasks),
    gpu: Object.freeze(sample.gpu),
    semanticHash: sample.semanticHash,
    sceneRevision: sample.sceneRevision,
    frameRevision: sample.frameRevision,
    cleanupCanvasCount: cleanup,
    cpuProfile,
    preciseCoverage,
  });
}

function summarizePreciseCoverage(scripts) {
  const names = /^(advanceForReconcile|sampleAt|applyBarHeight|writeReconcileUpdate|retargetForReconcile|readActiveForReconcile|materializeDeferredSettlements)$/u;
  const counts = {};
  for (const script of scripts) {
    if (
      !script.url.includes('/src/') &&
      !script.url.includes('/node_modules/.vite/deps/@conalog_patch-map.js')
    ) continue;
    for (const fn of script.functions) {
      if (!names.test(fn.functionName)) continue;
      counts[fn.functionName] = (counts[fn.functionName] ?? 0) +
        (fn.ranges[0]?.count ?? 0);
    }
  }
  return Object.freeze(counts);
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
  const longTasks = trials.flatMap((trial) => trial.longTasks.map(({ duration }) => duration));
  const settlementGaps = trials.flatMap((trial) => trial.settlementFrameGapsMs);
  const settlementLongTasks = trials.flatMap((trial) =>
    trial.settlementLongTasks.map(({ duration }) => duration));
  return Object.freeze({
    mountMs: stats(trials.map(({ mounted }) => mounted.mountMs)),
    retargetMs: stats(updates),
    frameGapMs: stats(gaps),
    settlementFrameGapMs: stats(settlementGaps),
    settlementLongTasks: Object.freeze({
      count: settlementLongTasks.length,
      durationMs: stats(settlementLongTasks),
    }),
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

const servers = [];
const temporaryConsumers = [];
let browser;
try {
  const consumers = [];
  for (const spec of PACKAGE_SPECS) {
    let serverRoot = ROOT;
    let serverConfig = path.join(ROOT, 'vite.lab.config.ts');
    let fixturePath = '/scripts/verification/patch-map-public-animation-performance.html';
    if (spec.path !== null) {
      const temporary = await mkdtemp(path.join(os.tmpdir(), 'patch-map-presentation-perf-'));
      temporaryConsumers.push(temporary);
      await writeFile(path.join(temporary, 'package.json'), `${JSON.stringify({
        name: `patch-map-production-presentation-${spec.label}`,
        private: true,
        type: 'module',
        dependencies: {
          '@conalog/patch-map': `file:${spec.path}`,
          'pixi.js': '8.19.0',
        },
      }, null, 2)}\n`);
      await writeFile(path.join(temporary, 'index.html'), `<!doctype html>
<html><body><div id="patch-map-performance-host"></div>
<script type="module" src="/main.js"></script></body></html>\n`);
      await writeFile(path.join(temporary, 'main.js'), `
import { PatchMap } from '@conalog/patch-map';
window.__PATCH_MAP_PUBLIC_ANIMATION_MODULE__ = Object.freeze({ PatchMap });
`);
      await execute('npm', [
        'install',
        '--prefer-offline',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
      ], { cwd: temporary, maxBuffer: 20 * 1024 * 1024 });
      serverRoot = temporary;
      serverConfig = false;
      fixturePath = '/index.html';
    }
    const server = await createServer({
      root: serverRoot,
      configFile: serverConfig,
      logLevel: 'error',
      server: { host: '127.0.0.1', port: 0, strictPort: false },
    });
    await server.listen();
    servers.push(server);
    const baseURL = server.resolvedUrls?.local?.[0];
    if (!baseURL) throw new Error(`missing local Vite URL for ${spec.label}`);
    consumers.push(Object.freeze({ ...spec, baseURL, fixturePath }));
  }
  browser = await chromium.launch({ headless: true });
  const runs = [];
  const failures = [];
  for (const size of SIZES) {
    for (const scenario of SCENARIOS) {
      for (const mode of MODES) {
        const values = new Map(consumers.map(({ label }) => [label, {
          warmups: [],
          measured: [],
        }]));
        for (let trial = 0; trial < WARMUPS + MEASURED; trial += 1) {
          const ordered = trial % 2 === 0 ? consumers : [...consumers].reverse();
          for (const consumer of ordered) {
            const page = await browser.newPage({
              baseURL: consumer.baseURL,
              viewport: { width: 900, height: 700 },
              deviceScaleFactor: DEVICE_SCALE_FACTOR,
            });
            await installWebGlProbe(page);
            const cdp = (PROFILE || COVERAGE) && trial === WARMUPS
              ? await page.context().newCDPSession(page)
              : null;
            const result = await runTrial(
              page,
              consumer.fixturePath,
              size,
              mode,
              scenario,
              trial,
              cdp,
            );
            await cdp?.detach();
            failures.push(...validate(result, size, mode));
            const bucket = values.get(consumer.label);
            if (bucket === undefined) throw new Error('missing performance result bucket');
            (trial < WARMUPS ? bucket.warmups : bucket.measured).push(result);
            await page.close();
          }
        }
        for (const consumer of consumers) {
          const value = values.get(consumer.label);
          if (value === undefined) throw new Error('missing performance result');
          runs.push(Object.freeze({
            artifact: consumer.label,
            size,
            scenario,
            mode,
            warmups: Object.freeze(value.warmups),
            measured: Object.freeze(value.measured),
            summary: summarize(value.measured),
          }));
        }
      }
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
      scenarios: Object.freeze(SCENARIOS),
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
      preciseCoverage: COVERAGE,
      packages: PACKAGE_SPECS,
      order: PACKAGE_SPECS.length > 1 ? 'alternating-per-trial' : 'single',
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
    runs: runs.map(({ artifact, size, scenario, mode, summary }) => ({
      artifact,
      size,
      scenario,
      mode,
      summary,
    })),
    profiles: runs.map(({ artifact, size, scenario, mode, measured }) => ({
      artifact,
      size,
      scenario,
      mode,
      cpuProfile: measured.find((trial) => trial.cpuProfile !== null)?.cpuProfile ?? null,
      preciseCoverage: measured.find((trial) => trial.preciseCoverage !== null)
        ?.preciseCoverage ?? null,
    })),
    failures,
  }, null, 2)}\n`);
  if (failures.length > 0) process.exitCode = 1;
} finally {
  await browser?.close().catch(() => undefined);
  await Promise.all(servers.map((server) => server.close().catch(() => undefined)));
  await Promise.all(temporaryConsumers.map((temporary) =>
    rm(temporary, { recursive: true, force: true })));
}
