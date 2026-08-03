#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const ROOT = process.cwd();
const CODE_COMMIT = process.env.PATCH_MAP_CODE_COMMIT ?? 'uncommitted';
const SMOKE = process.argv.includes('--smoke');
const WARMUPS = SMOKE ? 0 : 2;
const MEASURED = SMOKE ? 1 : 7;
const SCENE_SIZE = process.env.PATCH_MAP_PERF_SCENE_SIZE ?? '5000';
const NUMERIC_SCENE_SIZE = /^\d+$/.test(SCENE_SIZE)
  ? Number.parseInt(SCENE_SIZE, 10)
  : null;
const LOAD_TIMEOUT_MS =
  SCENE_SIZE === 'actual-production' ||
  (NUMERIC_SCENE_SIZE !== null && NUMERIC_SCENE_SIZE > 5_000)
    ? 120_000
    : 60_000;
const SEED = 319;
const PAN_MOVES = 12;
const PAN_MOVE_WAIT_MS = 28;
const FULL_PROFILES = Object.freeze([
  Object.freeze({
    id: 'chromium-headless-1x',
    cpuThrottleRate: 1,
    budgets: Object.freeze({
      actionP95Ms: 500,
      panWallP95Ms: 3_500,
      panRafGapP95Ms: 250,
      panCanvasFrameRateHz: 20,
      panCanvasFrameGapP95Ms: 150,
    }),
  }),
  Object.freeze({
    id: 'chromium-headless-4x',
    cpuThrottleRate: 4,
    budgets: Object.freeze({
      actionP95Ms: 1_800,
      panWallP95Ms: 5_000,
      panRafGapP95Ms: 500,
      panCanvasFrameRateHz: 10,
      panCanvasFrameGapP95Ms: 250,
    }),
  }),
]);
const PROFILES = SMOKE
  ? Object.freeze([
      process.argv.includes('--4x') ? FULL_PROFILES[1] : FULL_PROFILES[0],
    ])
  : FULL_PROFILES;
const OUTPUT_PATH = path.resolve(
  process.env.PATCH_MAP_BAR_PAN_PERF_OUTPUT
    ?? path.join(
      ROOT,
      '.perf-results/patch-map/bar-animation-pan-performance.json',
    ),
);

function percentile(values, quantile) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)];
}

function stats(values, label) {
  if (
    values.length === 0
    || values.some((value) => typeof value !== 'number' || !Number.isFinite(value) || value < 0)
  ) {
    throw new Error(`${label} must contain finite non-negative samples`);
  }
  return Object.freeze({
    samples: Object.freeze([...values]),
    min: Math.min(...values),
    median: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: Math.max(...values),
  });
}

function summarize(trials, label) {
  return Object.freeze({
    actionMs: stats(trials.map(({ actionMs }) => actionMs), `${label}/actionMs`),
    panWallMs: stats(trials.map(({ panWallMs }) => panWallMs), `${label}/panWallMs`),
    settleMs: stats(trials.map(({ settleMs }) => settleMs), `${label}/settleMs`),
    panRafGapMedianMs: stats(
      trials.map(({ panRafGapsMs }) => percentile(panRafGapsMs, 0.5)),
      `${label}/panRafGapMedianMs`,
    ),
    panRafGapP95Ms: stats(
      trials.map(({ panRafGapsMs }) => percentile(panRafGapsMs, 0.95)),
      `${label}/panRafGapP95Ms`,
    ),
    panRafGapMaxMs: stats(
      trials.map(({ panRafGapsMs }) => Math.max(...panRafGapsMs)),
      `${label}/panRafGapMaxMs`,
    ),
    panCanvasFrameRateHz: stats(
      trials.map(({ panCanvasFrameRateHz }) => panCanvasFrameRateHz),
      `${label}/panCanvasFrameRateHz`,
    ),
    panCanvasFrameGapP95Ms: stats(
      trials.map(({ panCanvasFrameGapsMs }) => percentile(panCanvasFrameGapsMs, 0.95)),
      `${label}/panCanvasFrameGapP95Ms`,
    ),
    panCanvasFrameDurationP95Ms: stats(
      trials.map(({ panPublishedFrames }) =>
        percentile(panPublishedFrames.map(({ duration }) => duration), 0.95)),
      `${label}/panCanvasFrameDurationP95Ms`,
    ),
    panViewportOnlyFrameCount: stats(
      trials.map(({ panViewportOnlyFrameCount }) => panViewportOnlyFrameCount),
      `${label}/panViewportOnlyFrameCount`,
    ),
    panLongTaskCount: stats(
      trials.map(({ panLongTasks }) => panLongTasks.length),
      `${label}/panLongTaskCount`,
    ),
    panLongTaskMaxMs: stats(
      trials.map(({ panLongTasks }) => Math.max(0, ...panLongTasks.map(({ duration }) => duration))),
      `${label}/panLongTaskMaxMs`,
    ),
  });
}

function validateTrial(trial, label) {
  const violations = [];
  const check = (condition, description) => {
    if (!condition) violations.push(`${label} ${description}`);
  };
  check(trial.action.status === 'committed', 'bar batch did not commit');
  check(
    NUMERIC_SCENE_SIZE === null ||
      trial.action.appliedCount + trial.action.unchangedCount === NUMERIC_SCENE_SIZE,
    `bar batch count did not cover the ${SCENE_SIZE} targets`,
  );
  check(trial.activeAnimationsAfterAction > 0, 'animation was not visible after action');
  if (NUMERIC_SCENE_SIZE !== null) {
    check(
      trial.presentationDistinctHeightCount >= 2,
      'presentation height did not visibly interpolate',
    );
  }
  check(trial.panRafGapsMs.length >= 3, 'rAF sample was too short');
  check(trial.panCanvasFrameGapsMs.length >= 3, 'canvas frame sample was too short');
  if (trial.activeAnimationsAtPointerDown > 0) {
    check(
      trial.panViewportOnlyFrameCount >= 1,
      'overlapping animation did not publish a viewport-only frame',
    );
  }
  check(Math.hypot(...trial.viewportDelta) >= 100, 'viewport did not move');
  check(trial.finalState.activeAnimations === 0, 'animation did not settle');
  check(trial.finalState.canvasCount === 1, 'live Lab did not retain exactly one canvas');
  check(trial.finalState.lastAction === 'pan-gesture', 'pan gesture did not complete');
  check(trial.cleanup.canvasCount === 0, 'canvas survived destroy');
  check(trial.cleanup.bridgeRemoved === true, 'manual bridge survived destroy');
  return violations;
}

function profileBudgetViolations(profile) {
  const violations = [];
  if (
    !SMOKE &&
    (profile.warmupRaw.length !== WARMUPS || profile.measuredRaw.length !== MEASURED)
  ) {
    violations.push(`${profile.id} did not preserve the 2+7 protocol`);
  }
  profile.warmupRaw.forEach((trial, index) => {
    violations.push(...validateTrial(trial, `${profile.id}/warmup/${index}`));
  });
  profile.measuredRaw.forEach((trial, index) => {
    violations.push(...validateTrial(trial, `${profile.id}/measured/${index}`));
  });
  const { budgets, summary } = profile;
  if (summary.actionMs.p95 > budgets.actionP95Ms) {
    violations.push(`action p95 ${summary.actionMs.p95} > ${budgets.actionP95Ms}`);
  }
  if (summary.panWallMs.p95 > budgets.panWallP95Ms) {
    violations.push(`pan wall p95 ${summary.panWallMs.p95} > ${budgets.panWallP95Ms}`);
  }
  if (summary.panRafGapP95Ms.p95 > budgets.panRafGapP95Ms) {
    violations.push(
      `pan rAF p95 ${summary.panRafGapP95Ms.p95} > ${budgets.panRafGapP95Ms}`,
    );
  }
  if (summary.panCanvasFrameRateHz.median < budgets.panCanvasFrameRateHz) {
    violations.push(
      `pan canvas frame rate median ${summary.panCanvasFrameRateHz.median}`
      + ` < ${budgets.panCanvasFrameRateHz}`,
    );
  }
  if (summary.panCanvasFrameGapP95Ms.p95 > budgets.panCanvasFrameGapP95Ms) {
    violations.push(
      `pan canvas frame gap p95 ${summary.panCanvasFrameGapP95Ms.p95}`
      + ` > ${budgets.panCanvasFrameGapP95Ms}`,
    );
  }
  return Object.freeze(violations);
}

async function runTrial(page, trialIndex) {
  const initialSceneSize =
    NUMERIC_SCENE_SIZE !== null && NUMERIC_SCENE_SIZE > 5_000
      ? '100'
      : SCENE_SIZE;
  await page.goto(
    `lab/patch-map/?scenario=REN-009&size=${initialSceneSize}&seed=${SEED}`,
    { waitUntil: 'networkidle', timeout: LOAD_TIMEOUT_MS },
  );
  await page.waitForFunction(
    () => {
      const status = window.__PATCH_MAP_MANUAL_LAB__?.state().status;
      return status === 'ready' || status === 'failed';
    },
    undefined,
    { timeout: LOAD_TIMEOUT_MS },
  );
  const initialState = await page.evaluate(() =>
    window.__PATCH_MAP_MANUAL_LAB__?.state());
  if (initialState?.status !== 'ready') {
    throw new Error(`trial ${trialIndex} Lab failed: ${initialState?.error ?? 'unknown'}`);
  }
  if (initialSceneSize !== SCENE_SIZE) {
    await page.evaluate((sceneSize) => {
      const select = document.querySelector('[data-testid="manual-dataset-size"]');
      if (!(select instanceof HTMLSelectElement)) {
        throw new Error('manual dataset-size select is unavailable');
      }
      if (select.disabled) {
        throw new Error('manual dataset-size select is unexpectedly disabled');
      }
      select.value = sceneSize;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }, SCENE_SIZE);
    await page.waitForFunction(
      (targetSceneSize) => {
        const state = window.__PATCH_MAP_MANUAL_LAB__?.state();
        return state?.status === 'failed' ||
          (state?.status === 'ready' && state.sceneSize === targetSceneSize);
      },
      SCENE_SIZE,
      { timeout: LOAD_TIMEOUT_MS },
    );
    const configuredState = await page.evaluate(() =>
      window.__PATCH_MAP_MANUAL_LAB__?.state());
    if (configuredState?.status !== 'ready') {
      throw new Error(
        `trial ${trialIndex} Lab reconfiguration failed: `
        + `${configuredState?.error ?? 'unknown'}`,
      );
    }
  }

  // Keep the historical performance protocol explicit even though the human
  // REN-009 Lab defaults to a slower duration for hands-on pan inspection.
  await page.locator('[data-manual-animation-duration]').fill('200');
  await page.locator('[data-manual-command="animation-duration"]').click();
  await page.locator('[data-manual-mode="pan"]').click();
  const canvas = page.locator('[data-testid="manual-canvas-host"] canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error(`trial ${trialIndex} canvas has no bounds`);
  const viewportBefore = await page.evaluate(() =>
    window.__PATCH_MAP_MANUAL_LAB__.engine().snapshot().viewport);
  const startX = box.x + box.width * 0.55;
  const startY = box.y + box.height * 0.55;
  // Position the pointer before the animation action so pointer-down follows
  // the commit immediately. Moving to the start point after the action lets a
  // short animation finish before the measured gesture has even begun.
  await page.mouse.move(startX, startY);

  await page.evaluate(() => {
    const sample = {
      stopped: false,
      raf: [],
      longTasks: [],
      heights: [],
      publishedFrames: [],
      lastPublishedClock: null,
      observer: null,
    };
    const engine = window.__PATCH_MAP_MANUAL_LAB__.engine();
    const publishFrame = engine.publishFrame.bind(engine);
    engine.publishFrame = (time) => {
      const start = performance.now();
      const presentationAdvanced = sample.lastPublishedClock !== time;
      const result = publishFrame(time);
      sample.publishedFrames.push({
        start,
        duration: performance.now() - start,
        time,
        presentationAdvanced,
      });
      sample.lastPublishedClock = time;
      return result;
    };
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
      // Long Task observation is diagnostic; rAF and product facts stay normative.
    }
    const size = Number.parseInt(
      window.__PATCH_MAP_MANUAL_LAB__.state().sceneSize,
      10,
    );
    const targets = Number.isSafeInteger(size)
      ? [0, Math.min(77, size - 1), size - 1]
      : [];
    const tick = (time) => {
      sample.raf.push(time);
      const bridge = window.__PATCH_MAP_MANUAL_LAB__;
      if (bridge?.state().activeAnimations > 0) {
        sample.heights.push(targets.map((index) =>
          bridge.engine()?.barPresentationProbe({
            ownerId: `node-${index}`,
            componentId: 'bar',
          })?.presentationHeight ?? null));
      }
      if (!sample.stopped) requestAnimationFrame(tick);
    };
    window.__PATCH_MAP_BAR_PAN_SAMPLE__ = sample;
    requestAnimationFrame(tick);
  });

  const action = await page.evaluate(async () => {
    const started = performance.now();
    const result = await window.__PATCH_MAP_MANUAL_LAB__.run('animate-all');
    return {
      durationMs: performance.now() - started,
      status: result?.status ?? null,
      appliedCount: result?.applied?.length ?? -1,
      unchangedCount: result?.unchanged?.length ?? -1,
    };
  });
  const activeAnimationsAfterAction = await page.evaluate(() =>
    window.__PATCH_MAP_MANUAL_LAB__.state().activeAnimations);

  await page.evaluate(() => {
    window.__PATCH_MAP_BAR_PAN_SAMPLE__.panStart = performance.now();
  });
  await page.mouse.down();
  const activeAnimationsAtPointerDown = await page.evaluate(() =>
    window.__PATCH_MAP_MANUAL_LAB__.state().activeAnimations);
  for (let index = 1; index <= PAN_MOVES; index += 1) {
    await page.mouse.move(startX + index * 18, startY + index * 4);
    await page.waitForTimeout(PAN_MOVE_WAIT_MS);
  }
  await page.mouse.up();
  const panWallMs = await page.evaluate(() => {
    const sample = window.__PATCH_MAP_BAR_PAN_SAMPLE__;
    sample.panEnd = performance.now();
    return sample.panEnd - sample.panStart;
  });

  const settleStarted = Date.now();
  await page.waitForFunction(
    () => window.__PATCH_MAP_MANUAL_LAB__.state().activeAnimations === 0,
    undefined,
    { timeout: 20_000 },
  );
  const settleMs = Date.now() - settleStarted;
  await page.waitForTimeout(100);
  const captured = await page.evaluate(() => {
    const sample = window.__PATCH_MAP_BAR_PAN_SAMPLE__;
    sample.stopped = true;
    sample.observer?.disconnect();
    const result = {
      raf: sample.raf,
      longTasks: sample.longTasks,
      heights: sample.heights,
      publishedFrames: sample.publishedFrames,
      panStart: sample.panStart,
      panEnd: sample.panEnd,
    };
    delete window.__PATCH_MAP_BAR_PAN_SAMPLE__;
    return result;
  });
  const viewportAfter = await page.evaluate(() =>
    window.__PATCH_MAP_MANUAL_LAB__.engine().snapshot().viewport);
  const finalState = await page.evaluate(() =>
    window.__PATCH_MAP_MANUAL_LAB__.state());
  const panRafGapsMs = captured.raf.slice(1).flatMap((time, index) => {
    const previous = captured.raf[index];
    if (
      previous === undefined
      || time < captured.panStart
      || previous > captured.panEnd
    ) {
      return [];
    }
    return [time - previous];
  });
  const panLongTasks = captured.longTasks.filter(({ startTime, duration }) =>
    startTime + duration >= captured.panStart && startTime <= captured.panEnd);
  const panPublishedFrames = captured.publishedFrames.filter(({ start }) =>
    start >= captured.panStart && start <= captured.panEnd);
  const panCanvasFrameGapsMs = panPublishedFrames.slice(1).map(
    ({ start }, index) => start - panPublishedFrames[index].start,
  );
  const panCanvasFrameRateHz = panPublishedFrames.length / (panWallMs / 1_000);
  const panViewportOnlyFrameCount = panPublishedFrames.filter(
    ({ presentationAdvanced }) => !presentationAdvanced,
  ).length;
  const presentationDistinctHeightCount = Math.max(
    0,
    ...[0, 1, 2].map((targetIndex) => new Set(
      captured.heights
        .map((sample) => sample[targetIndex])
        .filter((height) => typeof height === 'number')
        .map((height) => height.toFixed(3)),
    ).size),
  );
  const cleanup = await page.evaluate(async () => {
    const bridge = window.__PATCH_MAP_MANUAL_LAB__;
    await bridge.destroy();
    return {
      canvasCount:
        document.querySelectorAll('[data-testid="manual-canvas-host"] canvas').length,
      bridgeRemoved: window.__PATCH_MAP_MANUAL_LAB__ === undefined,
    };
  });

  return Object.freeze({
    trial: trialIndex,
    actionMs: action.durationMs,
    action: Object.freeze({
      status: action.status,
      appliedCount: action.appliedCount,
      unchangedCount: action.unchangedCount,
    }),
    activeAnimationsAfterAction,
    activeAnimationsAtPointerDown,
    presentationDistinctHeightCount,
    panWallMs,
    panRafGapsMs: Object.freeze(panRafGapsMs),
    panLongTasks: Object.freeze(panLongTasks),
    panPublishedFrames: Object.freeze(panPublishedFrames),
    panCanvasFrameGapsMs: Object.freeze(panCanvasFrameGapsMs),
    panCanvasFrameRateHz,
    panViewportOnlyFrameCount,
    settleMs,
    viewportDelta: Object.freeze([
      viewportAfter.centerWorld[0] - viewportBefore.centerWorld[0],
      viewportAfter.centerWorld[1] - viewportBefore.centerWorld[1],
    ]),
    finalState,
    cleanup: Object.freeze(cleanup),
  });
}

async function collectGpuMetadata(page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return { context: null, renderer: null, unmaskedRenderer: null };
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      context: 'webgl2',
      renderer: gl.getParameter(gl.RENDERER),
      unmaskedRenderer: extension
        ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
        : null,
    };
  });
}

async function main() {
  const server = await createServer({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.patch-map-lab.config.ts'),
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  let browser = null;
  let context = null;
  let page = null;
  const errors = { console: [], page: [], network: [], external: [] };
  try {
    await server.listen();
    const baseUrl = server.resolvedUrls?.local?.[0];
    if (!baseUrl) throw new Error('PatchMap bar/pan performance server has no URL');
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      baseURL: baseUrl,
      viewport: { width: 1_440, height: 1_000 },
      deviceScaleFactor: 1,
    });
    page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    page.on('console', (message) => {
      if (message.type() === 'error') errors.console.push(message.text());
    });
    page.on('pageerror', (error) => errors.page.push(error.stack ?? error.message));
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (
        (url.protocol === 'http:' || url.protocol === 'https:')
        && url.origin !== new URL(baseUrl).origin
      ) {
        errors.external.push(`${request.method()} ${request.url()}`);
      }
    });
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

    const gpu = await collectGpuMetadata(page);
    const profiles = [];
    for (const profile of PROFILES) {
      await cdp.send('Emulation.setCPUThrottlingRate', {
        rate: profile.cpuThrottleRate,
      });
      const warmupRaw = [];
      const measuredRaw = [];
      const total = WARMUPS + MEASURED;
      for (let index = 0; index < total; index += 1) {
        process.stdout.write(
          `[patch-map-bar-pan] ${profile.id} ${index + 1}/${total}\n`,
        );
        const trial = await runTrial(page, index);
        if (index < WARMUPS) warmupRaw.push(trial);
        else measuredRaw.push(trial);
      }
      const profileDraft = {
        id: profile.id,
        cpuThrottleRate: profile.cpuThrottleRate,
        budgets: profile.budgets,
        warmupRaw: Object.freeze(warmupRaw),
        measuredRaw: Object.freeze(measuredRaw),
        summary: summarize(measuredRaw, profile.id),
      };
      const record = Object.freeze({
        ...profileDraft,
        budgetViolations: profileBudgetViolations(profileDraft),
      });
      profiles.push(record);
    }

    const cpus = os.cpus();
    const output = Object.freeze({
      $schema: 'patch-map-bar-animation-pan-performance/2',
      generatedAt: new Date().toISOString(),
      codeCommit: CODE_COMMIT,
      protocol: Object.freeze({
        warmups: WARMUPS,
        measured: MEASURED,
      size: SCENE_SIZE,
        seed: SEED,
        panMoves: PAN_MOVES,
        panMoveWaitMs: PAN_MOVE_WAIT_MS,
        route: 'REN-009',
        renderer: 'PixiJS WebGL2 aggregate mesh',
        canvasFrameProbe:
          'instrumented public Engine.publishFrame calls; repeated clocks are viewport-only frames',
      }),
      environment: Object.freeze({
        platform: process.platform,
        architecture: process.arch,
        node: process.version,
        browser: browser.version(),
        headed: false,
        viewport: Object.freeze({ width: 1_440, height: 1_000, deviceScaleFactor: 1 }),
        cpuModel: cpus[0]?.model ?? 'unknown',
        logicalCpuCount: cpus.length,
        gpu,
        windowsNative: 'pending',
      }),
      comparison: Object.freeze({
        beforeOptimizationDiagnostic: Object.freeze({
          comparability: 'same route/size/seed and combined animate-all plus 12-move pan',
          preservation: 'exploratory medians retained in the task log; pre-harness raw samples unavailable',
          actionMedianMs: 1_498.5,
          actionP95Ms: 1_619.9,
          panWallMedianMs: 5_611.1,
          panWallP95Ms: 5_803,
        }),
        webgpu: 'experimental-not-run',
      }),
      errors,
      profiles: Object.freeze(profiles),
      status: Object.values(errors).every((entries) => entries.length === 0)
        && profiles.every(({ budgetViolations }) => budgetViolations.length === 0)
        ? 'pass'
        : 'fail',
    });
    await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
    for (const profile of profiles) {
      process.stdout.write(
        `[patch-map-bar-pan] ${profile.id} action median/p95=`
        + `${profile.summary.actionMs.median.toFixed(1)}/`
        + `${profile.summary.actionMs.p95.toFixed(1)}ms, pan median/p95=`
        + `${profile.summary.panWallMs.median.toFixed(1)}/`
        + `${profile.summary.panWallMs.p95.toFixed(1)}ms, pan rAF p95=`
        + `${profile.summary.panRafGapP95Ms.median.toFixed(1)}ms, canvas=`
        + `${profile.summary.panCanvasFrameRateHz.median.toFixed(1)}fps, `
        + `gap p95=${profile.summary.panCanvasFrameGapP95Ms.median.toFixed(1)}ms\n`,
      );
    }
    if (output.status !== 'pass') {
      throw new Error(
        `PatchMap bar/pan checkpoint failed; evidence saved to ${OUTPUT_PATH}`,
      );
    }
    process.stdout.write(
      `PASS: PatchMap ${SCENE_SIZE}-scene animation plus pan 2+7\n`,
    );
  } finally {
    await page?.close().catch(() => undefined);
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    await server.close();
  }
}

await main();
