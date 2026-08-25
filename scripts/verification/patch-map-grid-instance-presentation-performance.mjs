#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = process.cwd();
const sizes = integerList(process.env.PATCH_MAP_GRID_PRESENTATION_PERF_SIZES ?? '5000,10000');
const scenarios = scenarioList(
  process.env.PATCH_MAP_GRID_PRESENTATION_PERF_SCENARIOS ?? 'background-text',
);
const warmups = integer(process.env.PATCH_MAP_GRID_PRESENTATION_PERF_WARMUPS ?? '2', true);
const measured = integer(process.env.PATCH_MAP_GRID_PRESENTATION_PERF_MEASURED ?? '7');
const updateCount = integer(process.env.PATCH_MAP_GRID_PRESENTATION_PERF_UPDATES ?? '4');
const viewport = viewportSize(process.env.PATCH_MAP_GRID_PRESENTATION_PERF_VIEWPORT ?? '800x600');
const pixelRatio = positiveNumber(process.env.PATCH_MAP_GRID_PRESENTATION_PERF_DPR ?? '1');
const viewportMotion = viewportMotionName(
  process.env.PATCH_MAP_GRID_PRESENTATION_PERF_VIEWPORT_MOTION ?? 'pan',
);
const artifactIdentity = process.env.PATCH_MAP_GRID_PRESENTATION_PERF_ARTIFACT ?? 'working-tree';
const outputPath = path.resolve(
  process.env.PATCH_MAP_GRID_PRESENTATION_PERF_OUTPUT ??
    '.artifacts/performance/instance-background-text-latest.json',
);
let server;
let browser;

try {
  server = await createServer({
    root,
    configFile: path.join(root, 'vite.lab.config.ts'),
    logLevel: 'error',
  });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  if (!baseUrl) throw new Error('PatchMap grid presentation performance server has no URL');
  browser = await chromium.launch({ headless: true });
  const raw = [];
  const failures = [];

  for (const scenario of scenarios) {
    for (const size of sizes) {
      for (let trial = 0; trial < warmups + measured; trial += 1) {
      const page = await browser.newPage({
        viewport: { width: viewport[0] + 100, height: viewport[1] + 100 },
      });
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
      const result = await page.evaluate(async ({
        recordCount,
        sequenceCount,
        run,
        scenarioName,
        targetPixelRatio,
        viewportMotionName,
        viewportSize: [viewportWidth, viewportHeight],
      }) => {
        const { PatchMap } = window.__PATCH_MAP_PUBLIC_ANIMATION_MODULE__;
        const multiGrid = scenarioName === 'multi-grid-bar-height' ||
          scenarioName === 'multi-grid-bar-height-tint';
        const multiGridTint = scenarioName === 'multi-grid-bar-height-tint';
        const columns = multiGrid ? 30 : 100;
        const gridCount = multiGrid ? 26 : 1;
        const cellsInGrid = (gridIndex) => multiGrid
          ? Math.max(0, Math.min(360, recordCount - gridIndex * 360))
          : recordCount;
        const cellsForGrid = (gridIndex) => {
          const count = cellsInGrid(gridIndex);
          const rows = Math.ceil(count / columns);
          return Array.from({ length: rows }, (_rowValue, row) =>
            Array.from({ length: columns }, (_columnValue, column) =>
              row * columns + column < count ? 1 : 0));
        };
        const grid = (gridIndex) => ({
          type: 'grid',
          id: multiGrid ? 'plant-grid-' + gridIndex : 'presentation-grid',
          ...(multiGrid
            ? {
                attrs: {
                  x: (gridIndex % 5) * 510,
                  y: Math.floor(gridIndex / 5) * 215,
                },
              }
            : {}),
          cells: cellsForGrid(gridIndex),
          gap: multiGrid ? 1 : 2,
          item: {
            size: multiGrid ? { width: 12, height: 16 } : { width: 34, height: 46 },
            components: [{
              type: 'background',
              id: 'surface',
              source: { type: 'rect', fill: '#e2e8f0', radius: 3 },
            }, ...(
              scenarioName === 'bar-height' ||
              scenarioName === 'mode-switch' ||
              scenarioName === 'multi-grid-bar-height' ||
              scenarioName === 'multi-grid-bar-height-tint'
                ? [{
                    type: 'bar',
                    id: 'chart',
                    size: multiGrid ? { width: 10, height: 12 } : { width: 24, height: 18 },
                    placement: 'bottom',
                    source: { type: 'rect', fill: '#2563eb', radius: 2 },
                  }]
                : []
            ), {
              type: 'text',
              id: 'value',
              text: '0%',
              ...(scenarioName === 'mode-switch' || multiGrid ? { show: false } : {}),
              placement: 'center',
              margin: 2,
              tint: '#0f172a',
              style: { fontFamily: 'Arial', fontSize: 11, fontWeight: 600 },
            }],
          },
        });
        const dataset = Array.from({ length: gridCount }, (_value, index) => grid(index));
        const host = document.querySelector('#patch-map-performance-host');
        Object.assign(host.style, {
          width: viewportWidth + 'px',
          height: viewportHeight + 'px',
          overflow: 'hidden',
        });
        let map = null;
        try {
          const mountStarted = performance.now();
          map = await PatchMap.mount({
            container: host,
            instanceId: 'grid-presentation-perf-' + scenarioName + '-' + recordCount + '-' + run,
            width: viewportWidth,
            height: viewportHeight,
            pixelRatio: targetPixelRatio,
            antialias: false,
            backend: 'webgl',
            resizeMode: 'manual',
            fit: false,
            data: dataset,
          });
          const mountMs = performance.now() - mountStarted;
          const queryStarted = performance.now();
          const targetGroups = multiGrid
            ? Array.from({ length: gridCount }, (_value, index) => map.targets.query({
                within: 'plant-grid-' + index,
                componentId: 'chart',
                type: 'bar',
                scope: 'instances',
              }))
            : [map.targets.query({
                within: 'presentation-grid',
                type: 'grid-cell',
                scope: 'instances',
              })];
          const queryMs = performance.now() - queryStarted;
          const targets = targetGroups[0];
          const targetCount = targetGroups.reduce((sum, group) => sum + group.count, 0);
          const before = map.debug.snapshot();
          const backgroundSources = new Array(targets.count);
          const backgroundShows = new Array(targets.count).fill(true);
          const barHeights = new Array(targets.count);
          const multiGridBarHeights = multiGrid
            ? targetGroups.map((group) => new Array(group.count))
            : null;
          const multiGridBarTints = multiGridTint
            ? targetGroups.map((group) => new Array(group.count))
            : null;
          const textShows = new Array(targets.count);
          const textValues = new Array(targets.count);
          const textStyles = new Array(targets.count);
          const textTints = new Array(targets.count);
          const textPlacements = new Array(targets.count);
          const textMargins = new Array(targets.count);
          const palette = ['#1d4ed8', '#7c3aed', '#0f766e', '#b45309'];
          const textPalette = ['#eff6ff', '#faf5ff', '#f0fdfa', '#fffbeb'];
          const publish = (sequence) => {
            if (multiGrid) {
              const callMs = [];
              const results = [];
              const started = performance.now();
              for (let gridIndex = 0; gridIndex < targetGroups.length; gridIndex += 1) {
                const group = targetGroups[gridIndex];
                const groupBarHeights = multiGridBarHeights[gridIndex];
                const groupBarTints = multiGridBarTints?.[gridIndex] ?? null;
                for (let index = 0; index < group.count; index += 1) {
                  groupBarHeights[index] =
                    ((gridIndex * 29 + index * 13 + sequence * 19) % 13) + 1;
                  if (groupBarTints !== null) {
                    groupBarTints[index] = (gridIndex + index + sequence) % 3 === 0
                      ? '#16a34a'
                      : '#2563eb';
                  }
                }
                const callStarted = performance.now();
                results.push(map.updateBatch({
                  targets: group,
                  bar: {
                    componentId: 'chart',
                    height: groupBarHeights,
                    ...(groupBarTints === null ? {} : { changes: { tint: groupBarTints } }),
                  },
                }, { animate: true }));
                callMs.push(performance.now() - callStarted);
              }
              return {
                action: {
                  status: results.every(({ status }) => status === 'committed')
                    ? 'committed'
                    : 'rejected',
                  appliedCount: results.reduce((sum, result) => sum + result.appliedCount, 0),
                },
                updateMs: performance.now() - started,
                callMs,
              };
            }
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
                fontSize: 10 + ((state + sequence) % 2),
                fontWeight: (state + sequence) % 2 === 0 ? 600 : 700,
                align: state % 2 === 0 ? 'left' : 'right',
              };
              textTints[index] = textPalette[state];
              textPlacements[index] = state % 2 === 0 ? 'left-top' : 'right-bottom';
              textMargins[index] = 2 + (state % 2);
              barHeights[index] = ((index * 13 + sequence * 19) % 91) + 5;
              textShows[index] = scenarioName === 'mode-switch'
                ? sequence % 3 !== 2
                : sequence % 2 === 1;
            }
            let request;
            if (scenarioName === 'bar-height') {
              request = {
                targets,
                bar: { componentId: 'chart', height: barHeights },
              };
            } else if (scenarioName === 'text-show') {
              request = {
                targets,
                text: { componentId: 'value', changes: { show: textShows } },
              };
            } else if (scenarioName === 'text-content') {
              request = {
                targets,
                text: { componentId: 'value', text: textValues },
              };
            } else if (scenarioName === 'text-style') {
              request = {
                targets,
                text: { componentId: 'value', style: textStyles },
              };
            } else if (scenarioName === 'mode-switch') {
              const mode = sequence % 3;
              if (mode === 0) {
                for (let index = 0; index < targets.count; index += 1) {
                  textValues[index] = String((index * 17 + sequence * 23) % 10_001);
                  textShows[index] = true;
                  barHeights[index] = 0;
                }
              } else if (mode === 1) {
                for (let index = 0; index < targets.count; index += 1) {
                  textValues[index] = String((index * 17 + sequence * 23) % 101) + '%';
                  textShows[index] = true;
                  barHeights[index] = 0;
                }
              } else {
                textShows.fill(false);
              }
              request = {
                targets,
                bar: { componentId: 'chart', height: barHeights },
                text: {
                  componentId: 'value',
                  text: textValues,
                  style: textStyles,
                  changes: { show: textShows },
                },
              };
            } else {
              request = {
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
              };
            }
            const started = performance.now();
            const action = map.updateBatch(request);
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
          const callMs = [];
          const actionToFirstFrameMs = [];
          const actionToSettleMs = [];
          const actions = [];
          for (let sequence = 1; sequence <= sequenceCount; sequence += 1) {
            const sequenceStarted = performance.now();
            const published = publish(sequence);
            actionMs.push(published.updateMs);
            callMs.push(...(published.callMs ?? []));
            actions.push({
              status: published.action.status,
              appliedCount: published.action.appliedCount,
            });
            map.viewport.panBy(sequence % 2 === 0 ? [8, 4] : [-7, -3]);
            if (viewportMotionName === 'pan-zoom') {
              map.viewport.zoomBy(
                sequence % 2 === 0 ? 1.01 : 1 / 1.01,
                [viewportWidth / 2, viewportHeight / 2],
              );
            }
            if (multiGrid) {
              actionToFirstFrameMs.push(await new Promise((resolve) =>
                requestAnimationFrame(() => resolve(performance.now() - sequenceStarted))));
            }
            await new Promise((resolve) => setTimeout(resolve, 75));
          }
          if (multiGrid) {
            const settleStarted = performance.now();
            let priorRevision = map.debug.snapshot().frameRevision;
            let stableFrames = 0;
            while (stableFrames < 2 && performance.now() - settleStarted < 2_000) {
              await new Promise((resolve) => requestAnimationFrame(resolve));
              const revision = map.debug.snapshot().frameRevision;
              if (revision === priorRevision) stableFrames += 1;
              else stableFrames = 0;
              priorRevision = revision;
            }
            actionToSettleMs.push(performance.now() - settleStarted + 75);
          } else {
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
          sample.stopped = true;
          observer.disconnect();
          const after = map.debug.snapshot();
          const rafGapsMs = sample.raf.slice(1).map((time, index) => time - sample.raf[index]);
          const destroy = await map.destroy();
          map = null;
          return {
            mountMs,
            targetCount,
            queryMs,
            firstOverlay: {
              status: firstOverlay.action.status,
              appliedCount: firstOverlay.action.appliedCount,
              updateMs: firstOverlay.updateMs,
              settleMs: firstOverlaySettleMs,
            },
            actionMs,
            callMs,
            actionToFirstFrameMs,
            actionToSettleMs,
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
            longTaskTotalMs: sample.longTasks.reduce((sum, duration) => sum + duration, 0),
            destroy,
            canvasCountAfterDestroy: host.querySelectorAll('canvas').length,
          };
        } finally {
          await map?.destroy().catch(() => undefined);
        }
      }, {
        recordCount: size,
        sequenceCount: updateCount,
        run: trial,
        scenarioName: scenario,
        viewportMotionName: viewportMotion,
        targetPixelRatio: pixelRatio,
        viewportSize: viewport,
      });
      result.errors = errors;
      const record = Object.freeze({
        size,
        scenario,
        trial,
        warmup: trial < warmups,
        ...result,
      });
      raw.push(record);
      failures.push(...validate(record));
      await page.close();
      }
    }
  }

  const summaries = Object.fromEntries(scenarios.map((scenario) => [
    scenario,
    Object.fromEntries(sizes.map((size) => {
    const trials = raw.filter((record) =>
      record.scenario === scenario && record.size === size && !record.warmup);
    return [size, Object.freeze({
      mountMs: stats(trials.map(({ mountMs }) => mountMs)),
      firstOverlayUpdateMs: stats(trials.map(({ firstOverlay }) => firstOverlay.updateMs)),
      firstOverlaySettleMs: stats(trials.map(({ firstOverlay }) => firstOverlay.settleMs)),
      updateMs: stats(trials.flatMap(({ actionMs }) => actionMs)),
      perCallMs: stats(trials.flatMap(({ callMs }) => callMs)),
      actionToFirstFrameMs: stats(trials.flatMap(({ actionToFirstFrameMs }) =>
        actionToFirstFrameMs)),
      actionToSettleMs: stats(trials.flatMap(({ actionToSettleMs }) =>
        actionToSettleMs)),
      queryMs: stats(trials.map(({ queryMs }) => queryMs)),
      repeatedUpdateP95Ms: stats(trials.map(({ actionMs }) => percentile(actionMs, 0.95))),
      rafGapP95Ms: stats(trials.map(({ rafGapsMs }) => percentile(rafGapsMs, 0.95))),
      rafGapMaxMs: stats(trials.map(({ rafGapsMs }) => Math.max(...rafGapsMs))),
      rafGapMedianMs: stats(trials.map(({ rafGapsMs }) => percentile(rafGapsMs, 0.5))),
      longTaskCount: stats(trials.map(({ longTasks }) => longTasks.length)),
      longTaskDurationMs: stats(trials.flatMap(({ longTasks }) => longTasks)),
      longTaskMaxMs: stats(trials.map(({ longTasks }) => Math.max(0, ...longTasks))),
      longTaskTotalMs: stats(trials.map(({ longTaskTotalMs }) => longTaskTotalMs)),
      initialRenderCommandCount: stats(trials.map(({ initialRenderCommandCount }) =>
        initialRenderCommandCount)),
      finalRenderCommandCount: stats(trials.map(({ finalRenderCommandCount }) =>
        finalRenderCommandCount)),
      visiblePrimitiveCount: stats(trials.map(({ visiblePrimitiveCount }) => visiblePrimitiveCount)),
    })];
  })),
  ]));
  const output = Object.freeze({
    schemaVersion: 2,
    checkpoint: 'patch-map-concrete-grid-presentation-scenarios',
    generatedAt: new Date().toISOString(),
    protocol: Object.freeze({
      sizes,
      scenarios,
      warmups,
      measured,
      updateCount,
      artifactIdentity,
      trialOrder: 'scenario then ascending size; each trial uses a fresh page and fixed update order',
      firstOverlay: 'one scenario publication before measured repeated updates',
      updateIntervalMs: 75,
      settleMs: 'two stable frame revisions for multi-grid; fixed 250ms otherwise',
      viewport,
      viewportMotion,
      pixelRatio,
      backend: 'webgl',
      publicApi: 'PatchMap.mount + targets.query + updateBatch',
      workload: 'scenario-selected concrete bar/text/background updateBatch columns',
      offscreenObservation:
        'fit disabled; updates address the full grid while the fixed viewport shows only a subset',
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
  const expectedAppliedCount = record.size * (
    record.scenario === 'mode-switch' || record.scenario === 'background-text' ? 2 : 1
  );
  if (record.targetCount !== record.size) failures.push(`${record.size}: target count mismatch`);
  if (record.actions.some(({ status, appliedCount }) =>
    status !== 'committed' || appliedCount !== expectedAppliedCount)) {
    failures.push(`${record.size}: update result mismatch`);
  }
  if (
    record.firstOverlay.status !== 'committed' ||
    record.firstOverlay.appliedCount !== expectedAppliedCount
  ) failures.push(`${record.size}: first overlay result mismatch`);
  if (!record.semanticHashStable) failures.push(`${record.size}: semantic hash changed`);
  if (!record.sceneRevisionStable) failures.push(`${record.size}: scene revision changed`);
  if (record.renderer !== 'webgl') failures.push(`${record.size}: renderer was ${record.renderer}`);
  if (record.initialRenderCommandCount <= 0) {
    failures.push(`${record.size}: initial render-command materialization was ineffective`);
  }
  if (record.finalRenderCommandCount <= 0) {
    failures.push(`${record.size}: retained render-command materialization count was invalid`);
  }
  if (
    record.size >= 1_024 &&
    record.scenario !== 'bar-height' &&
    (
      record.initialRenderCommandCount >= record.size ||
      record.finalRenderCommandCount >= record.size
    )
  ) failures.push(`${record.size}: text viewport materialization was ineffective`);
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

function scenarioList(value) {
  const allowed = new Set([
    'background-text',
    'bar-height',
    'text-show',
    'text-content',
    'text-style',
    'mode-switch',
    'multi-grid-bar-height',
    'multi-grid-bar-height-tint',
  ]);
  const result = value.split(',').map((entry) => entry.trim());
  if (result.length === 0 || result.some((entry) => !allowed.has(entry))) {
    throw new TypeError('grid presentation performance scenario must be supported');
  }
  return result;
}

function positiveNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new TypeError('performance number must be finite and positive');
  }
  return parsed;
}

function viewportSize(value) {
  const match = /^(\d+)x(\d+)$/u.exec(value.trim());
  if (match === null) throw new TypeError('performance viewport must use WIDTHxHEIGHT');
  return Object.freeze([integer(match[1]), integer(match[2])]);
}

function viewportMotionName(value) {
  if (value !== 'pan' && value !== 'pan-zoom') {
    throw new TypeError('grid presentation viewport motion must be pan or pan-zoom');
  }
  return value;
}

function percentile(values, quantile) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(ordered.length * quantile) - 1)] ?? 0;
}

function stats(values) {
  if (values.length === 0) {
    return Object.freeze({ samples: Object.freeze([]), min: 0, median: 0, p95: 0, max: 0 });
  }
  return Object.freeze({
    samples: Object.freeze([...values]),
    min: Math.min(...values),
    median: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: Math.max(...values),
  });
}
