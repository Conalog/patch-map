#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const ROOT = process.cwd();
const SMOKE = process.argv.includes('--smoke');
const WARMUPS = SMOKE ? 0 : 2;
const MEASURED = SMOKE ? 1 : 7;
const SIZE = 5_000;
const SEED = 319;
const PROFILES = process.argv.includes('--1x-only') || SMOKE
  ? [{ id: 'chromium-headless-1x', cpuThrottleRate: 1 }]
  : [
      { id: 'chromium-headless-1x', cpuThrottleRate: 1 },
      { id: 'chromium-headless-4x', cpuThrottleRate: 4 },
    ];
const OUTPUT_PATH = path.resolve(
  process.env.CORE_V2_INTERACTION_PERF_OUTPUT
    ?? path.join(
      ROOT,
      'docs/tasks/2026/07-15/performance-core-v2/evidence/interaction-performance-5000.json',
    ),
);

function percentile(values, quantile) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)];
}

function stats(values, label) {
  if (
    values.length === 0
    || values.some((value) => !Number.isFinite(value) || value < 0)
  ) {
    throw new Error(`${label} has invalid samples`);
  }
  return Object.freeze({
    samples: Object.freeze([...values]),
    min: Math.min(...values),
    median: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: Math.max(...values),
  });
}

function summarize(trials, profileId) {
  const metricNames = new Set(trials.flatMap(({ metrics }) => Object.keys(metrics)));
  return Object.freeze(Object.fromEntries(
    [...metricNames].sort().map((name) => [
      name,
      stats(
        trials.map(({ metrics }) => {
          const value = metrics[name];
          if (value === undefined) throw new Error(`${profileId}/${name} is missing`);
          return value;
        }),
        `${profileId}/${name}`,
      ),
    ]),
  ));
}

async function command(page, name) {
  return page.evaluate(async (commandName) => {
    const bridge = window.__PATCH_MAP_CORE_V2_MANUAL_LAB__;
    const started = performance.now();
    const value = await bridge.run(commandName);
    return {
      ms: performance.now() - started,
      status:
        value !== null
        && typeof value === 'object'
        && typeof value.status === 'string'
          ? value.status
          : 'completed',
      state: bridge.state(),
    };
  }, name);
}

async function instrument(page) {
  await page.evaluate(() => {
    const engine = window.__PATCH_MAP_CORE_V2_MANUAL_LAB__.engine();
    const calls = Object.create(null);
    const wrap = (name) => {
      const original = engine[name];
      if (typeof original !== 'function') return;
      calls[name] = [];
      engine[name] = function instrumentedInteraction(...args) {
        const started = performance.now();
        try {
          return original.apply(this, args);
        } finally {
          calls[name].push(performance.now() - started);
        }
      };
    };
    [
      'applySelection',
      'hoverTooltipAtScreen',
      'toggleTooltipPinAtScreen',
      'selectBox',
      'selectPaint',
      'previewTransformerEdit',
      'completeTransformerEdit',
      'cancelTransformerEdit',
      'applyTransformerEdit',
      'updateBarHeights',
      'updateTexts',
      'publishFrame',
      'handleHistoryShortcut',
    ].forEach(wrap);
    window.__CORE_V2_INTERACTION_SAMPLE__ = { calls };
  });
}

async function callCursor(page, name) {
  return page.evaluate((method) => {
    const samples = window.__CORE_V2_INTERACTION_SAMPLE__?.calls[method] ?? [];
    return samples.length;
  }, name);
}

async function callDurations(page, name, cursor) {
  return page.evaluate(({ method, start }) => {
    const samples = window.__CORE_V2_INTERACTION_SAMPLE__?.calls[method] ?? [];
    return samples.slice(start);
  }, { method: name, start: cursor });
}

async function visibleTargets(page) {
  return page.evaluate(() => {
    const engine = window.__PATCH_MAP_CORE_V2_MANUAL_LAB__.engine();
    const canvas = engine.canvasHandle().element;
    const seen = new Set();
    return engine.geometryProbe().entities.flatMap((entity) => {
      const ownerId = entity.ownerItemId;
      const [x, y, width, height] = entity.screenBounds;
      if (
        ownerId === undefined
        || entity.componentId !== 'bg'
        || seen.has(ownerId)
        || x < 8
        || y < 8
        || x + width > canvas.clientWidth - 8
        || y + height > canvas.clientHeight - 8
      ) {
        return [];
      }
      seen.add(ownerId);
      return [{ ownerId, bounds: entity.screenBounds }];
    }).slice(0, 4);
  });
}

async function emptyPoint(page) {
  return page.evaluate(() => {
    const engine = window.__PATCH_MAP_CORE_V2_MANUAL_LAB__.engine();
    const canvas = engine.canvasHandle().element;
    for (let y = 6; y < canvas.clientHeight; y += 12) {
      for (let x = 6; x < canvas.clientWidth; x += 12) {
        if (engine.selectionHitTestScreen({ x, y }).target === null) return [x, y];
      }
    }
    return [canvas.clientWidth - 2, canvas.clientHeight - 2];
  });
}

function center(bounds) {
  return [bounds[0] + bounds[2] / 2, bounds[1] + bounds[3] / 2];
}

function union(bounds) {
  return [
    Math.min(...bounds.map((value) => value[0])) - 4,
    Math.min(...bounds.map((value) => value[1])) - 4,
    Math.max(...bounds.map((value) => value[0] + value[2])) + 4,
    Math.max(...bounds.map((value) => value[1] + value[3])) + 4,
  ];
}

async function canvasBox(page) {
  const box = await page.locator('[data-testid="manual-canvas-host"] canvas').boundingBox();
  if (box === null) throw new Error('manual canvas has no bounds');
  return box;
}

async function activateMode(page, mode) {
  await page.locator(`[data-manual-mode="${mode}"]`).evaluate((button) => {
    button.click();
  });
  await page.locator('[data-testid="manual-canvas-host"] canvas').evaluate((canvas) => {
    canvas.scrollIntoView({ block: 'start' });
  });
  return canvasBox(page);
}

function absolutePoint(box, point) {
  return [
    box.x + Math.max(1, Math.min(box.width - 1, point[0])),
    box.y + Math.max(1, Math.min(box.height - 1, point[1])),
  ];
}

async function drag(page, box, start, end, steps = 4) {
  const from = absolutePoint(box, start);
  const to = absolutePoint(box, end);
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move(to[0], to[1], { steps });
  await page.mouse.up();
}

async function productGestureMetric(page, method, action) {
  const cursor = await callCursor(page, method);
  await action();
  const durations = await callDurations(page, method, cursor);
  if (durations.length === 0) {
    throw new Error(`${method} did not execute`);
  }
  return {
    sum: durations.reduce((sum, value) => sum + value, 0),
    p95: percentile(durations, 0.95),
    max: Math.max(...durations),
    count: durations.length,
  };
}

async function waitForAnimations(page) {
  await page.waitForFunction(
    () => window.__PATCH_MAP_CORE_V2_MANUAL_LAB__.state().activeAnimations === 0,
    undefined,
    { timeout: 20_000 },
  );
}

async function selectIds(page, ids) {
  await page.evaluate((selectionIds) => {
    const engine = window.__PATCH_MAP_CORE_V2_MANUAL_LAB__.engine();
    engine.select(selectionIds);
    engine.setSelectionVisualPolicy({
      mode: 'all',
      handleCssPx: 10,
      strokeCssPx: 2,
    });
  }, ids);
}

async function runTrial(page, baseUrl, trialIndex) {
  await page.goto(
    new URL(`lab/core-v2?scenario=EVT-001&size=${SIZE}&seed=${SEED}`, baseUrl).href,
    { waitUntil: 'networkidle', timeout: 60_000 },
  );
  await page.evaluate(() => window.__PATCH_MAP_CORE_V2_MANUAL_LAB__.ready);
  await page.locator('[data-testid="manual-canvas-host"] canvas').evaluate((canvas) => {
    canvas.scrollIntoView({ block: 'start' });
  });
  const initial = await page.evaluate(() =>
    window.__PATCH_MAP_CORE_V2_MANUAL_LAB__.state());
  if (initial.status !== 'ready' || initial.canvasCount !== 1) {
    throw new Error(`trial ${trialIndex} failed to initialize`);
  }
  await instrument(page);
  const targets = await visibleTargets(page);
  if (targets.length < 4) throw new Error(`trial ${trialIndex} lacks visible targets`);
  let box = await canvasBox(page);
  const points = targets.map(({ bounds }) => center(bounds));
  const blank = await emptyPoint(page);
  const metrics = {};
  const facts = {};
  const recordCommand = async (metric, name) => {
    const result = await command(page, name);
    metrics[metric] = result.ms;
    facts[`${metric}Status`] = result.status;
    return result;
  };

  const hover = await productGestureMetric(page, 'hoverTooltipAtScreen', async () => {
    const point = absolutePoint(box, points[0]);
    await page.mouse.move(point[0], point[1]);
  });
  metrics.pointerHoverProductMs = hover.max;

  const click = await productGestureMetric(page, 'applySelection', async () => {
    const point = absolutePoint(box, points[0]);
    await page.mouse.click(point[0], point[1]);
  });
  metrics.pointerClickSelectionMs = click.sum;

  const shiftClick = await productGestureMetric(page, 'applySelection', async () => {
    const point = absolutePoint(box, points[1]);
    await page.keyboard.down('Shift');
    await page.mouse.click(point[0], point[1]);
    await page.keyboard.up('Shift');
  });
  metrics.pointerShiftClickSelectionMs = shiftClick.sum;
  facts.shiftClickSelectionCount = (
    await page.evaluate(() => window.__PATCH_MAP_CORE_V2_MANUAL_LAB__.state())
  ).selectedIds.length;

  const context = await productGestureMetric(page, 'toggleTooltipPinAtScreen', async () => {
    const point = absolutePoint(box, points[0]);
    await page.mouse.click(point[0], point[1], { button: 'right' });
  });
  metrics.contextMenuTooltipMs = context.max;

  const empty = await productGestureMetric(page, 'applySelection', async () => {
    const point = absolutePoint(box, blank);
    await page.mouse.click(point[0], point[1]);
  });
  metrics.pointerEmptySelectionMs = empty.sum;

  box = await activateMode(page, 'box');
  const region = union(targets.slice(0, 2).map(({ bounds }) => bounds));
  const boxSelection = await productGestureMetric(page, 'selectBox', async () => {
    await drag(page, box, [region[0], region[1]], [region[2], region[3]]);
  });
  metrics.boxSelectionMs = boxSelection.max;

  box = await activateMode(page, 'paint');
  const paintSelection = await productGestureMetric(page, 'selectPaint', async () => {
    await drag(page, box, points[0], points[2], 5);
  });
  metrics.paintSelectionMs = paintSelection.max;

  await selectIds(page, [targets[0].ownerId]);
  box = await activateMode(page, 'move');
  const movePreviewCursor = await callCursor(page, 'previewTransformerEdit');
  const moveCommitCursor = await callCursor(page, 'completeTransformerEdit');
  await drag(page, box, points[0], [points[0][0] + 24, points[0][1] + 16], 5);
  const movePreview = await callDurations(
    page,
    'previewTransformerEdit',
    movePreviewCursor,
  );
  const moveCommit = await callDurations(
    page,
    'completeTransformerEdit',
    moveCommitCursor,
  );
  if (movePreview.length === 0 || moveCommit.length === 0) {
    throw new Error('move gesture did not preview and commit');
  }
  metrics.transformMovePreviewP95Ms = percentile(movePreview, 0.95);
  metrics.transformMoveCommitMs = moveCommit[0];
  await recordCommand('historyUndoAfterMoveMs', 'undo');

  await selectIds(page, [targets[1].ownerId]);
  box = await activateMode(page, 'resize');
  const resizeHandle = await page.evaluate(() =>
    window.__PATCH_MAP_CORE_V2_MANUAL_LAB__.engine()
      .transformerHandleProbe().regions.find(({ id }) => id === 'se')?.center ?? null);
  if (resizeHandle === null) throw new Error('resize handle is unavailable');
  const resizePreviewCursor = await callCursor(page, 'previewTransformerEdit');
  const resizeCommitCursor = await callCursor(page, 'completeTransformerEdit');
  await drag(
    page,
    box,
    resizeHandle,
    [resizeHandle[0] + 24, resizeHandle[1] + 18],
    5,
  );
  const resizePreview = await callDurations(
    page,
    'previewTransformerEdit',
    resizePreviewCursor,
  );
  const resizeCommit = await callDurations(
    page,
    'completeTransformerEdit',
    resizeCommitCursor,
  );
  if (resizePreview.length === 0 || resizeCommit.length === 0) {
    throw new Error('resize gesture did not preview and commit');
  }
  metrics.transformResizePreviewP95Ms = percentile(resizePreview, 0.95);
  metrics.transformResizeCommitMs = resizeCommit[0];
  await recordCommand('historyUndoAfterResizeMs', 'undo');

  await selectIds(page, [targets[1].ownerId]);
  box = await activateMode(page, 'rotate');
  const rotateHandle = await page.evaluate(() =>
    window.__PATCH_MAP_CORE_V2_MANUAL_LAB__.engine()
      .transformerHandleProbe().regions.find(({ id }) => id === 'rotate')?.center ?? null);
  if (rotateHandle === null) throw new Error('rotate handle is unavailable');
  const rotatePreviewCursor = await callCursor(page, 'previewTransformerEdit');
  const rotateCommitCursor = await callCursor(page, 'completeTransformerEdit');
  await drag(
    page,
    box,
    rotateHandle,
    [rotateHandle[0] + 28, rotateHandle[1] + 10],
    5,
  );
  const rotatePreview = await callDurations(
    page,
    'previewTransformerEdit',
    rotatePreviewCursor,
  );
  const rotateCommit = await callDurations(
    page,
    'completeTransformerEdit',
    rotateCommitCursor,
  );
  if (rotatePreview.length === 0 || rotateCommit.length === 0) {
    throw new Error('rotate gesture did not preview and commit');
  }
  metrics.transformRotatePreviewP95Ms = percentile(rotatePreview, 0.95);
  metrics.transformRotateCommitMs = rotateCommit[0];
  await recordCommand('historyUndoAfterRotateMs', 'undo');

  await selectIds(page, [targets[0].ownerId]);
  box = await activateMode(page, 'move');
  const cancelCursor = await callCursor(page, 'cancelTransformerEdit');
  const cancelStart = absolutePoint(box, points[0]);
  await page.mouse.move(cancelStart[0], cancelStart[1]);
  await page.mouse.down();
  await page.mouse.move(cancelStart[0] + 20, cancelStart[1] + 12);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  const cancel = await callDurations(page, 'cancelTransformerEdit', cancelCursor);
  metrics.transformCancelMs = cancel[0];

  box = await activateMode(page, 'pan');
  const publishCursor = await callCursor(page, 'publishFrame');
  const panStarted = performance.now();
  await drag(
    page,
    box,
    [box.width * 0.45, box.height * 0.55],
    [box.width * 0.60, box.height * 0.62],
    5,
  );
  metrics.panGestureWallMs = performance.now() - panStarted;
  const panFrames = await callDurations(page, 'publishFrame', publishCursor);
  metrics.panFrameP95Ms = panFrames.length === 0 ? 0 : percentile(panFrames, 0.95);
  const wheelStarted = performance.now();
  const wheelPublishCursor = await callCursor(page, 'publishFrame');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -180);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  metrics.wheelZoomWallMs = performance.now() - wheelStarted;
  const wheelFrames = await callDurations(page, 'publishFrame', wheelPublishCursor);
  metrics.wheelFrameP95Ms = wheelFrames.length === 0
    ? 0
    : percentile(wheelFrames, 0.95);

  await selectIds(page, [targets[2].ownerId]);
  box = await activateMode(page, 'select');
  const nudgeCursor = await callCursor(page, 'applyTransformerEdit');
  const nudgeStarted = performance.now();
  await page.keyboard.press('ArrowRight');
  metrics.keyboardNudgeWallMs = performance.now() - nudgeStarted;
  const nudgeDurations = await callDurations(page, 'applyTransformerEdit', nudgeCursor);
  metrics.keyboardNudgeProductMs = nudgeDurations[0] ?? 0;
  const shortcutCursor = await callCursor(page, 'handleHistoryShortcut');
  const undoShortcutStarted = performance.now();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z');
  metrics.keyboardUndoWallMs = performance.now() - undoShortcutStarted;
  const redoShortcutStarted = performance.now();
  await page.keyboard.press(
    process.platform === 'darwin' ? 'Meta+Shift+Z' : 'Control+Shift+Z',
  );
  metrics.keyboardRedoWallMs = performance.now() - redoShortcutStarted;
  const shortcutDurations = await callDurations(
    page,
    'handleHistoryShortcut',
    shortcutCursor,
  );
  facts.historyShortcutCalls = shortcutDurations.length;
  metrics.keyboardUndoProductMs = shortcutDurations[0] ?? 0;
  metrics.keyboardRedoProductMs = shortcutDurations[1] ?? 0;

  await recordCommand('fitAllMs', 'fit-all');
  await selectIds(page, [targets[0].ownerId]);
  await recordCommand('fitSelectionMs', 'fit-selection');
  await recordCommand('viewResetMs', 'view-reset');
  await recordCommand('zoomInMs', 'zoom-in');
  await recordCommand('zoomOutMs', 'zoom-out');
  await recordCommand('worldRotateMs', 'world-rotate-right');
  await recordCommand('worldFlipXMs', 'world-flip-x');
  await recordCommand('worldFlipYMs', 'world-flip-y');

  await selectIds(page, [targets[0].ownerId]);
  await recordCommand('animateSelectedActionMs', 'animate-selected');
  await waitForAnimations(page);
  await recordCommand('animatePartialActionMs', 'animate-partial');
  await waitForAnimations(page);
  const allAnimation = await recordCommand('animateAllActionMs', 'animate-all');
  const allAnimationCalls = await callDurations(page, 'updateBarHeights', 0);
  metrics.animateAllProductMs = allAnimationCalls.at(-1) ?? 0;
  facts.allAnimationStarted = allAnimation.state.activeAnimations > 0;
  const animationPublishCursor = await callCursor(page, 'publishFrame');
  box = await activateMode(page, 'pan');
  const animationPanStarted = performance.now();
  await drag(
    page,
    box,
    [box.width * 0.52, box.height * 0.50],
    [box.width * 0.66, box.height * 0.55],
    6,
  );
  metrics.animateAllPanGestureWallMs = performance.now() - animationPanStarted;
  const animationPanFrames = await callDurations(
    page,
    'publishFrame',
    animationPublishCursor,
  );
  metrics.animateAllPanFrameP95Ms = animationPanFrames.length === 0
    ? 0
    : percentile(animationPanFrames, 0.95);
  metrics.animateAllPanFrameMaxMs = animationPanFrames.length === 0
    ? 0
    : Math.max(...animationPanFrames);
  await waitForAnimations(page);

  await recordCommand('randomTextMs', 'random-text');
  const textUpdateCalls = await callDurations(page, 'updateTexts', 0);
  metrics.randomTextProductMs = textUpdateCalls.at(-1) ?? 0;
  await recordCommand('createElementMs', 'create-element');
  await recordCommand('undoCreateMs', 'undo');
  await recordCommand('redoCreateMs', 'redo');
  await recordCommand('undoRedoCreateMs', 'undo');
  await recordCommand('selectFirstForDuplicateMs', 'select-first');
  await recordCommand('duplicateSelectedMs', 'duplicate-selected');
  await recordCommand('undoDuplicateMs', 'undo');
  await recordCommand('selectFirstThreeForGroupMs', 'select-first-three');
  await recordCommand('groupSelectedMs', 'group-selected');
  await recordCommand('undoGroupMs', 'undo');
  await recordCommand('selectFirstForFrontMs', 'select-first');
  await recordCommand('frontSelectedMs', 'front-selected');
  await recordCommand('undoFrontMs', 'undo');
  await recordCommand('selectFirstForDeleteMs', 'select-first');
  await recordCommand('deleteSelectedMs', 'delete-selected');
  await recordCommand('undoDeleteMs', 'undo');
  await recordCommand('selectFirstThreeForAlignMs', 'select-first-three');
  await recordCommand('alignSelectedMs', 'align-selected');
  await recordCommand('undoAlignMs', 'undo');
  await recordCommand('distributeSelectedMs', 'distribute-selected');
  await recordCommand('undoDistributeMs', 'undo');
  await recordCommand('textSelectedMs', 'text-selected');
  await recordCommand('undoTextMs', 'undo');

  await recordCommand('assetAcquireMs', 'asset-acquire');
  await recordCommand('assetReleaseMs', 'asset-release');
  await recordCommand('resizeSmallMs', 'resize-small');
  await recordCommand('resizeLargeMs', 'resize-large');
  await recordCommand('pageHideMs', 'page-hide');
  await recordCommand('pageShowMs', 'page-show');
  await recordCommand('accessibilityTreeMs', 'accessibility-tree');
  await recordCommand('probeRefreshMs', 'probe-refresh');
  await recordCommand('captureMs', 'capture');

  const destroy = await recordCommand('destroySessionMs', 'destroy-session');
  facts.destroyCanvasCount = destroy.state.canvasCount;
  const reinitialize = await recordCommand(
    'reinitializeSessionMs',
    'reinitialize-session',
  );
  facts.reinitializeCanvasCount = reinitialize.state.canvasCount;
  const cleanup = await page.evaluate(async () => {
    const bridge = window.__PATCH_MAP_CORE_V2_MANUAL_LAB__;
    await bridge.destroy();
    return {
      canvasCount:
        document.querySelectorAll('[data-testid="manual-canvas-host"] canvas').length,
      bridgeRemoved: window.__PATCH_MAP_CORE_V2_MANUAL_LAB__ === undefined,
    };
  });
  facts.cleanup = cleanup;
  return Object.freeze({ trial: trialIndex, metrics, facts });
}

function functionalViolations(trial, label) {
  const violations = [];
  if (trial.facts.shiftClickSelectionCount !== 2) {
    violations.push(`${label} Shift-click did not retain two selections`);
  }
  if (trial.facts.historyShortcutCalls !== 2) {
    violations.push(`${label} keyboard undo/redo did not use two product shortcuts`);
  }
  if (!trial.facts.allAnimationStarted) {
    violations.push(`${label} full bar animation was not visible`);
  }
  if (trial.facts.destroyCanvasCount !== 0) {
    violations.push(`${label} destroy retained a canvas`);
  }
  if (trial.facts.reinitializeCanvasCount !== 1) {
    violations.push(`${label} reinitialize did not own one canvas`);
  }
  if (
    trial.facts.cleanup.canvasCount !== 0
    || trial.facts.cleanup.bridgeRemoved !== true
  ) {
    violations.push(`${label} final cleanup failed`);
  }
  return violations;
}

async function main() {
  const server = await createServer({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.core-v2-lab.config.ts'),
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  let browser;
  let context;
  let page;
  const errors = { console: [], page: [], network: [], external: [] };
  try {
    await server.listen();
    const baseUrl = server.resolvedUrls?.local?.[0];
    if (baseUrl === undefined) throw new Error('interaction server has no URL');
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      viewport: { width: 1_440, height: 1_000 },
      deviceScaleFactor: 1,
    });
    page = await context.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') errors.console.push(message.text());
    });
    page.on('pageerror', (error) => errors.page.push(error.stack ?? error.message));
    page.on('requestfailed', (request) => {
      errors.network.push(
        `${request.method()} ${request.url()} ${request.failure()?.errorText ?? 'failed'}`,
      );
    });
    page.on('response', (response) => {
      if (response.status() >= 400) {
        errors.network.push(`${response.url()} HTTP ${response.status()}`);
      }
    });
    page.on('request', (request) => {
      const requestUrl = new URL(request.url());
      if (
        (requestUrl.protocol === 'http:' || requestUrl.protocol === 'https:')
        && requestUrl.origin !== new URL(baseUrl).origin
      ) {
        errors.external.push(`${request.method()} ${request.url()}`);
      }
    });
    const cdp = await context.newCDPSession(page);
    const profiles = [];
    const violations = [];
    for (const profile of PROFILES) {
      await cdp.send('Emulation.setCPUThrottlingRate', {
        rate: profile.cpuThrottleRate,
      });
      const warmupRaw = [];
      const measuredRaw = [];
      for (let index = 0; index < WARMUPS + MEASURED; index += 1) {
        process.stdout.write(
          `[core-v2-interactions] ${profile.id} ${index + 1}/${WARMUPS + MEASURED}\n`,
        );
        const trial = await runTrial(page, baseUrl, index);
        violations.push(...functionalViolations(
          trial,
          `${profile.id}/${index < WARMUPS ? 'warmup' : 'measured'}/${index}`,
        ));
        (index < WARMUPS ? warmupRaw : measuredRaw).push(trial);
      }
      profiles.push(Object.freeze({
        ...profile,
        warmupRaw: Object.freeze(warmupRaw),
        measuredRaw: Object.freeze(measuredRaw),
        summary: summarize(measuredRaw, profile.id),
      }));
    }
    const cpus = os.cpus();
    const output = Object.freeze({
      $schema: 'core-v2-interaction-performance/1',
      generatedAt: new Date().toISOString(),
      protocol: Object.freeze({
        warmups: WARMUPS,
        measured: MEASURED,
        size: SIZE,
        seed: SEED,
        renderer: 'PixiJS WebGL2 aggregate mesh',
        scope:
          'pointer, selection, transformer, viewport, keyboard, history, animation, text, authoring, assets, resize, lifecycle, accessibility, extraction',
      }),
      environment: Object.freeze({
        platform: process.platform,
        architecture: process.arch,
        node: process.version,
        browser: browser.version(),
        headed: false,
        viewport: Object.freeze({ width: 1_440, height: 1_000 }),
        cpuModel: cpus[0]?.model ?? 'unknown',
        logicalCpuCount: cpus.length,
        windowsNative: 'pending',
      }),
      profiles: Object.freeze(profiles),
      errors,
      violations: Object.freeze(violations),
      status:
        Object.values(errors).every((entries) => entries.length === 0)
        && violations.length === 0
          ? 'pass'
          : 'fail',
    });
    await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
    for (const profile of profiles) {
      process.stdout.write(
        `[core-v2-interactions] ${profile.id} click/shift/box/paint p95=`
        + `${profile.summary.pointerClickSelectionMs.p95.toFixed(1)}/`
        + `${profile.summary.pointerShiftClickSelectionMs.p95.toFixed(1)}/`
        + `${profile.summary.boxSelectionMs.p95.toFixed(1)}/`
        + `${profile.summary.paintSelectionMs.p95.toFixed(1)}ms, `
        + `move preview/commit=${profile.summary.transformMovePreviewP95Ms.p95.toFixed(1)}/`
        + `${profile.summary.transformMoveCommitMs.p95.toFixed(1)}ms, `
        + `create/delete=${profile.summary.createElementMs.p95.toFixed(1)}/`
        + `${profile.summary.deleteSelectedMs.p95.toFixed(1)}ms\n`,
      );
    }
    if (output.status !== 'pass') {
      throw new Error(`interaction checkpoint failed; see ${OUTPUT_PATH}`);
    }
    process.stdout.write(`PASS: Core v2 5,000 interaction 2+7 checkpoint\n`);
  } finally {
    await page?.close().catch(() => undefined);
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    await server.close();
  }
}

await main();
