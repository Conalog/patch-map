#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = process.cwd();
const sizes = integerList(process.env.PATCH_MAP_GRID_PRESENTATION_PERF_SIZES ?? '5000,10000');
const warmups = integer(process.env.PATCH_MAP_GRID_PRESENTATION_PERF_WARMUPS ?? '2', true);
const measured = integer(process.env.PATCH_MAP_GRID_PRESENTATION_PERF_MEASURED ?? '7');
const updateCount = integer(process.env.PATCH_MAP_GRID_PRESENTATION_PERF_UPDATES ?? '4');
const outputPath = path.resolve(
  process.env.PATCH_MAP_GRID_PRESENTATION_PERF_OUTPUT ??
    '.perf-results/patch-map/instance-background-text-latest.json',
);
let server;
let browser;

try {
  server = await createServer({
    root,
    configFile: path.join(root, 'vite.patch-map-lab.config.ts'),
    logLevel: 'error',
  });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  if (!baseUrl) throw new Error('PatchMap grid presentation performance server has no URL');
  browser = await chromium.launch({ headless: true });
  const raw = [];
  const failures = [];

  for (const size of sizes) {
    for (let trial = 0; trial < warmups + measured; trial += 1) {
      const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
      const errors = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(`console: ${message.text()}`);
      });
      page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
      await page.goto(
        new URL('scripts/verification/patch-map-public-animation-performance.html', baseUrl).href,
        { waitUntil: 'networkidle', timeout: 120_000 },
      );
      await page.waitForFunction(
        () => window.__PATCH_MAP_PUBLIC_ANIMATION_MODULE__,
        undefined,
        { timeout: 120_000 },
      );
      const result = await page.evaluate(async ({ recordCount, sequenceCount, run }) => {
        const { PatchMap } = window.__PATCH_MAP_PUBLIC_ANIMATION_MODULE__;
        const columns = 100;
        const rows = Math.ceil(recordCount / columns);
        const cells = Array.from({ length: rows }, (_rowValue, row) =>
          Array.from({ length: columns }, (_columnValue, column) =>
            row * columns + column < recordCount ? 1 : 0));
        const dataset = [{
          type: 'grid',
          id: 'presentation-grid',
          cells,
          gap: 2,
          item: {
            size: { width: 34, height: 46 },
            components: [{
              type: 'background',
              id: 'surface',
              source: { type: 'rect', fill: '#e2e8f0', radius: 3 },
            }, {
              type: 'text',
              id: 'value',
              text: '0%',
              placement: 'center',
              margin: 2,
              tint: '#0f172a',
              style: { fontFamily: 'Arial', fontSize: 11, fontWeight: 600 },
            }],
          },
        }];
        const host = document.querySelector('#patch-map-performance-host');
        Object.assign(host.style, { width: '800px', height: '600px', overflow: 'hidden' });
        let map = null;
        try {
          const mountStarted = performance.now();
          map = await PatchMap.mount({
            container: host,
            instanceId: 'grid-presentation-perf-' + recordCount + '-' + run,
            width: 800,
            height: 600,
            pixelRatio: 1,
            antialias: false,
            backend: 'webgl',
            resizeMode: 'manual',
            fit: false,
            data: dataset,
          });
          const mountMs = performance.now() - mountStarted;
          const targets = map.targets.query({
            within: 'presentation-grid',
            type: 'grid-cell',
            scope: 'instances',
          });
          const before = map.debug.snapshot();
          const backgroundSources = new Array(targets.count);
          const backgroundShows = new Array(targets.count).fill(true);
          const textValues = new Array(targets.count);
          const textStyles = new Array(targets.count);
          const textTints = new Array(targets.count);
          const textPlacements = new Array(targets.count);
          const textMargins = new Array(targets.count);
          const palette = ['#1d4ed8', '#7c3aed', '#0f766e', '#b45309'];
          const textPalette = ['#eff6ff', '#faf5ff', '#f0fdfa', '#fffbeb'];
          const publish = (sequence) => {
            for (let index = 0; index < targets.count; index += 1) {
              const state = index % palette.length;
              backgroundSources[index] = {
                type: 'rect',
                fill: palette[(state + sequence) % palette.length],
                radius: 2 + state,
              };
              textValues[index] = String((index * 17 + sequence * 23) % 101) + '%';
              textStyles[index] = {
                fontFamily: 'Arial',
                fontSize: 10 + (state % 2),
                fontWeight: state % 2 === 0 ? 600 : 700,
                align: state % 2 === 0 ? 'left' : 'right',
              };
              textTints[index] = textPalette[state];
              textPlacements[index] = state % 2 === 0 ? 'left-top' : 'right-bottom';
              textMargins[index] = 2 + (state % 2);
            }
            const started = performance.now();
            const action = map.updateBatch({
              targets,
              background: {
                componentId: 'surface',
                changes: { source: backgroundSources, show: backgroundShows },
              },
              text: {
                componentId: 'value',
                text: textValues,
                style: textStyles,
                changes: {
                  show: backgroundShows,
                  tint: textTints,
                  placement: textPlacements,
                  margin: textMargins,
                },
              },
            });
            return {
              action,
              updateMs: performance.now() - started,
            };
          };
          const firstOverlayStarted = performance.now();
          const firstOverlay = publish(0);
          await new Promise((resolve) => requestAnimationFrame(() =>
            requestAnimationFrame(resolve)));
          const firstOverlaySettleMs = performance.now() - firstOverlayStarted;

          const sample = { stopped: false, raf: [], longTasks: [] };
          const observer = new PerformanceObserver((list) => {
            sample.longTasks.push(...list.getEntries().map((entry) => entry.duration));
          });
          try {
            observer.observe({ type: 'longtask', buffered: false });
          } catch {
            // Older Chromium variants may not expose the long-task entry type.
          }
          const tick = (time) => {
            sample.raf.push(time);
            if (!sample.stopped) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          const actionMs = [];
          const actions = [];
          for (let sequence = 1; sequence <= sequenceCount; sequence += 1) {
            const published = publish(sequence);
            actionMs.push(published.updateMs);
            actions.push({
              status: published.action.status,
              appliedCount: published.action.appliedCount,
            });
            map.viewport.panBy(sequence % 2 === 0 ? [8, 4] : [-7, -3]);
            await new Promise((resolve) => setTimeout(resolve, 75));
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
          sample.stopped = true;
          observer.disconnect();
          const after = map.debug.snapshot();
          const rafGapsMs = sample.raf.slice(1).map((time, index) => time - sample.raf[index]);
          const destroy = await map.destroy();
          map = null;
          return {
            mountMs,
            targetCount: targets.count,
            firstOverlay: {
              status: firstOverlay.action.status,
              appliedCount: firstOverlay.action.appliedCount,
              updateMs: firstOverlay.updateMs,
              settleMs: firstOverlaySettleMs,
            },
            actionMs,
            actions,
            rafGapsMs,
            longTasks: sample.longTasks,
            semanticHashStable: before.semanticHash === after.semanticHash,
            sceneRevisionStable:
              before.revisions.sceneRevision === after.revisions.sceneRevision,
            renderer: before.resources.renderer?.backend ?? null,
            initialRenderCommandCount: before.resources.rendering.commandCount,
            finalRenderCommandCount: after.resources.rendering.commandCount,
            visiblePrimitiveCount:
              after.resources.rendering.visiblePrimitiveCount,
            destroy,
            canvasCountAfterDestroy: host.querySelectorAll('canvas').length,
          };
        } finally {
          await map?.destroy().catch(() => undefined);
        }
      }, { recordCount: size, sequenceCount: updateCount, run: trial });
      result.errors = errors;
      const record = Object.freeze({
        size,
        trial,
        warmup: trial < warmups,
        ...result,
      });
      raw.push(record);
      failures.push(...validate(record));
      await page.close();
    }
  }

  const summaries = Object.fromEntries(sizes.map((size) => {
    const trials = raw.filter((record) => record.size === size && !record.warmup);
    return [size, Object.freeze({
      mountMs: stats(trials.map(({ mountMs }) => mountMs)),
      firstOverlayUpdateMs: stats(trials.map(({ firstOverlay }) => firstOverlay.updateMs)),
      firstOverlaySettleMs: stats(trials.map(({ firstOverlay }) => firstOverlay.settleMs)),
      updateMs: stats(trials.flatMap(({ actionMs }) => actionMs)),
      repeatedUpdateP95Ms: stats(trials.map(({ actionMs }) => percentile(actionMs, 0.95))),
      rafGapP95Ms: stats(trials.map(({ rafGapsMs }) => percentile(rafGapsMs, 0.95))),
      rafGapMaxMs: stats(trials.map(({ rafGapsMs }) => Math.max(...rafGapsMs))),
      longTaskCount: stats(trials.map(({ longTasks }) => longTasks.length)),
      initialRenderCommandCount: stats(trials.map(({ initialRenderCommandCount }) =>
        initialRenderCommandCount)),
      finalRenderCommandCount: stats(trials.map(({ finalRenderCommandCount }) =>
        finalRenderCommandCount)),
      visiblePrimitiveCount: stats(trials.map(({ visiblePrimitiveCount }) => visiblePrimitiveCount)),
    })];
  }));
  const output = Object.freeze({
    schemaVersion: 1,
    checkpoint: 'patch-map-concrete-grid-background-text-presentation',
    generatedAt: new Date().toISOString(),
    protocol: Object.freeze({
      sizes,
      warmups,
      measured,
      updateCount,
      firstOverlay: 'one comprehensive style/layout/content/background publication before sampling',
      updateIntervalMs: 75,
      settleMs: 250,
      viewport: [800, 600],
      pixelRatio: 1,
      backend: 'webgl',
      publicApi: 'PatchMap.mount + targets.query + updateBatch',
      workload: 'all-cell background source/show plus text content/style/show/tint/placement/margin',
      offscreenObservation:
        'fit disabled; updates address the full grid while the 800x600 viewport shows only a subset',
      textMaterializationObservation:
        'public render-command counts plus leaf lifecycle tests prove bounded initial text ownership',
      windowsNative: 'pending',
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
  process.stdout.write(`${JSON.stringify({
    output: outputPath,
    status: output.status,
    summaries,
    failures,
  }, null, 2)}\n`);
  if (failures.length > 0) process.exitCode = 1;
} finally {
  await browser?.close().catch(() => undefined);
  await server?.close().catch(() => undefined);
}

function validate(record) {
  const failures = [...record.errors];
  if (record.targetCount !== record.size) failures.push(`${record.size}: target count mismatch`);
  if (record.actions.some(({ status, appliedCount }) =>
    status !== 'committed' || appliedCount !== record.size * 2)) {
    failures.push(`${record.size}: update result mismatch`);
  }
  if (
    record.firstOverlay.status !== 'committed' ||
    record.firstOverlay.appliedCount !== record.size * 2
  ) failures.push(`${record.size}: first overlay result mismatch`);
  if (!record.semanticHashStable) failures.push(`${record.size}: semantic hash changed`);
  if (!record.sceneRevisionStable) failures.push(`${record.size}: scene revision changed`);
  if (record.renderer !== 'webgl') failures.push(`${record.size}: renderer was ${record.renderer}`);
  if (record.initialRenderCommandCount <= 0 || record.initialRenderCommandCount >= record.size) {
    failures.push(`${record.size}: initial render-command materialization was ineffective`);
  }
  if (
    record.finalRenderCommandCount < record.initialRenderCommandCount ||
    record.finalRenderCommandCount >= record.size
  ) {
    failures.push(`${record.size}: retained render-command materialization count was invalid`);
  }
  if (record.destroy !== true || record.canvasCountAfterDestroy !== 0) {
    failures.push(`${record.size}: destroy cleanup failed`);
  }
  return failures;
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

function percentile(values, quantile) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(ordered.length * quantile) - 1)] ?? 0;
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
