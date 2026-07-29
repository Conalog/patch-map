#!/usr/bin/env node

import path from 'node:path';

import { chromium } from 'playwright';
import { createServer } from 'vite';

import { parseCoreV2BrowserLaunch } from './core-v2-browser-launch.mjs';

const ROOT = process.cwd();
const browserLaunch = parseCoreV2BrowserLaunch(process.argv.slice(2));
const checks = [];
const errors = {
  console: [],
  page: [],
  network: [],
};
let server;
let browser;
let context;
let page;

try {
  server = await createServer({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.core-v2-lab.config.ts'),
    logLevel: 'error',
  });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  if (!baseUrl) throw new Error('Core v2 exploratory Lab server has no URL');

  browser = await chromium.launch(browserLaunch.launchOptions);
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
    errors.network.push(`${request.url()} ${request.failure()?.errorText ?? ''}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      errors.network.push(`${response.url()} HTTP ${response.status()}`);
    }
  });

  const playground = await verifyPerformancePlayground(page, baseUrl);
  const manualLab = await verifyManualLab(page, baseUrl);
  assert(
    Object.values(errors).every((entries) => entries.length === 0),
    'console/page/network error count is zero',
    errors,
  );

  process.stdout.write(`${JSON.stringify({
    revision: 'core-v2-exploratory-10000-browser/2',
    status: 'pass',
    browser: browser.version(),
    headed: browserLaunch.headed,
    target: browserLaunch.target,
    windowsNative: 'pending',
    checks,
    playground,
    manualLab,
    errors,
  }, null, 2)}\n`);
} finally {
  await page?.close().catch(() => undefined);
  await context?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  await server?.close().catch(() => undefined);
}

async function verifyPerformancePlayground(activePage, baseUrl) {
  const started = performance.now();
  await activePage.goto(
    new URL(
      'lab/performance-v2/?dataset=10000&strategy=mesh&backend=webgl',
      baseUrl,
    ).href,
    { waitUntil: 'networkidle', timeout: 60_000 },
  );
  await activePage.waitForFunction(
    () => document.body.dataset.labReady === 'true',
    undefined,
    { timeout: 60_000 },
  );
  const loaded = await activePage.evaluate(() => ({
    state: window.__PATCH_MAP_CORE_V2_LAB__.state,
    view: window.__PATCH_MAP_CORE_V2_LAB__.getRuntime()?.view ?? null,
    selectedSize:
      document.querySelector('[data-testid="dataset-select"]')?.value ?? null,
    immutable:
      document.querySelector('[data-testid="input-immutability"]')?.textContent ?? null,
    canvasCount:
      document.querySelectorAll('[data-testid="canvas-host"] canvas').length,
  }));
  assert(
    loaded.state.dataset === '10000' &&
      loaded.selectedSize === '10000' &&
      loaded.state.entityCount === 50_999 &&
      loaded.state.activeStrategy === 'mesh' &&
      loaded.state.activeBackend === 'webgl' &&
      loaded.view?.scale >= 0.025 &&
      loaded.view.scale < 0.1 &&
      loaded.immutable === 'PASS' &&
      loaded.canvasCount === 1,
    'performance Playground fits 10,000 immutable records below the former 10% zoom floor',
    loaded,
  );

  const before = await samplePlaygroundBars(activePage);
  const canvas = activePage.locator('[data-testid="canvas-host"] canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Core v2 exploratory Playground canvas has no bounds');
  const anchorCss = { x: box.width / 2, y: box.height / 2 };
  const worldBeforeZoom = await activePage.evaluate((anchor) => {
    const runtime = window.__PATCH_MAP_CORE_V2_LAB__.getRuntime();
    if (!runtime) throw new Error('Core v2 exploratory Playground runtime is missing');
    return runtime.screenToWorld(anchor);
  }, anchorCss);
  await activePage.mouse.move(
    box.x + anchorCss.x,
    box.y + anchorCss.y,
  );
  await activePage.mouse.wheel(0, 10_000);
  await activePage.waitForFunction(
    () =>
      (window.__PATCH_MAP_CORE_V2_LAB__.getRuntime()?.view.scale ?? 1) <= 0.025_001,
    undefined,
    { timeout: 10_000 },
  );
  const zoomed = await activePage.evaluate((anchor) => {
    const runtime = window.__PATCH_MAP_CORE_V2_LAB__.getRuntime();
    if (!runtime) throw new Error('Core v2 exploratory Playground runtime is missing');
    return {
      view: runtime.view,
      worldAtAnchor: runtime.screenToWorld(anchor),
    };
  }, anchorCss);
  const anchorDriftCss = Math.hypot(
    worldBeforeZoom.x - zoomed.worldAtAnchor.x,
    worldBeforeZoom.y - zoomed.worldAtAnchor.y,
  ) * zoomed.view.scale;
  assert(
    Math.abs(zoomed.view.scale - 0.025) < 1e-9 &&
      anchorDriftCss <= 0.5,
    'performance Playground wheel reaches 2.5% while preserving the cursor anchor',
    { worldBeforeZoom, zoomed, anchorDriftCss },
  );
  await activePage.evaluate(() => {
    const runtime = window.__PATCH_MAP_CORE_V2_LAB__.getRuntime();
    if (!runtime) throw new Error('Core v2 exploratory Playground runtime is missing');
    runtime.fit();
    runtime.flush('exploratory-zoom-reset');
  });
  await activePage.getByTestId('animate-all').click();
  await activePage.waitForFunction(
    () => {
      const state = window.__PATCH_MAP_CORE_V2_LAB__.state;
      return state.lastAction === 'animate-all' && state.status !== 'busy';
    },
    undefined,
    { timeout: 30_000 },
  );
  await activePage.waitForFunction(
    () =>
      (window.__PATCH_MAP_CORE_V2_LAB__.getRuntime()?.activeAnimations ?? 1) === 0,
    undefined,
    { timeout: 30_000 },
  );
  const afterButton = await samplePlaygroundBars(activePage);
  assert(
    before.some((value, index) => value !== afterButton[index]),
    'the visible Animate all bars button changes 10,000-record bar output',
    { before, afterButton },
  );
  const overlapAnimation = await activePage.evaluate(() => {
    const runtime = window.__PATCH_MAP_CORE_V2_LAB__.getRuntime();
    if (!runtime) throw new Error('Core v2 exploratory Playground runtime is missing');
    const result = runtime.animateBarHeights({
      fraction: 1,
      durationMs: 15_000,
      seed: 0x10_000,
      minPercent: 0,
      maxPercent: 100,
    });
    return {
      operationCount: result.operationCount,
      activeAnimations: runtime.activeAnimations,
    };
  });
  const viewBefore = await activePage.evaluate(
    () => window.__PATCH_MAP_CORE_V2_LAB__.getRuntime()?.view,
  );
  await activePage.mouse.move(box.x + box.width - 24, box.y + box.height - 24);
  await activePage.mouse.down();
  await activePage.mouse.move(
    box.x + box.width - 124,
    box.y + box.height - 76,
    { steps: 8 },
  );
  const animationsDuringPan = await activePage.evaluate(
    () => window.__PATCH_MAP_CORE_V2_LAB__.getRuntime()?.activeAnimations ?? 0,
  );
  await activePage.mouse.up();
  const viewAfter = await activePage.evaluate(
    () => window.__PATCH_MAP_CORE_V2_LAB__.getRuntime()?.view,
  );
  const after = await samplePlaygroundBars(activePage);
  assert(
    overlapAnimation.operationCount === 10_000 &&
      overlapAnimation.activeAnimations > 0 &&
      animationsDuringPan > 0 &&
      viewBefore !== undefined &&
      viewAfter !== undefined &&
      (viewBefore.x !== viewAfter.x || viewBefore.y !== viewAfter.y) &&
      afterButton.some((value, index) => value !== after[index]),
    '10,000-bar animation remains active while the viewport moves and changes heights',
    {
      overlapAnimation,
      animationsDuringPan,
      viewBefore,
      viewAfter,
      afterButton,
      after,
    },
  );

  await activePage.getByTestId('destroy').click();
  await activePage.waitForFunction(
    () => window.__PATCH_MAP_CORE_V2_LAB__.state.status === 'offline',
    undefined,
    { timeout: 30_000 },
  );
  const cleanup = await activePage.evaluate(() => ({
    canvasCount:
      document.querySelectorAll('[data-testid="canvas-host"] canvas').length,
    runtimePresent: window.__PATCH_MAP_CORE_V2_LAB__.getRuntime() !== null,
  }));
  assert(
    cleanup.canvasCount === 0 && cleanup.runtimePresent === false,
    'performance Playground destroy releases its 10,000-record canvas',
    cleanup,
  );
  return {
    loadAndInteractionMs: performance.now() - started,
    entityCount: loaded.state.entityCount,
    animationsDuringPan,
    cleanupCanvasCount: cleanup.canvasCount,
  };
}

async function verifyManualLab(activePage, baseUrl) {
  const started = performance.now();
  await activePage.goto(
    new URL(
      'lab/core-v2?scenario=REN-009&size=5000&seed=319',
      baseUrl,
    ).href,
    { waitUntil: 'networkidle', timeout: 60_000 },
  );
  await activePage.waitForFunction(
    () => {
      const status = window.__PATCH_MAP_CORE_V2_MANUAL_LAB__?.state().status;
      return status === 'ready' || status === 'failed';
    },
    undefined,
    { timeout: 60_000 },
  );
  await activePage.locator('[data-manual-tool-button="animation"]').click();
  await activePage.locator('[data-manual-animation-duration]').fill('15000');
  await activePage.locator('[data-manual-tool-button="data"]').click();
  await activePage.locator('[data-manual-scene-size]').selectOption('10000');
  await activePage.locator('[data-manual-command="scene-size"]').click();
  await activePage.waitForFunction(
    () => {
      const state = window.__PATCH_MAP_CORE_V2_MANUAL_LAB__?.state();
      return state?.status === 'ready' && state.sceneSize === '10000';
    },
    undefined,
    { timeout: 60_000 },
  );
  const loaded = await activePage.evaluate(() => {
    const bridge = window.__PATCH_MAP_CORE_V2_MANUAL_LAB__;
    const engine = bridge?.engine();
    return {
      state: bridge?.state(),
      viewport: engine?.snapshot().viewport ?? null,
      rootCount: engine?.snapshot().rootIds.length ?? -1,
      semanticCounts: engine?.semanticProbe().scene.counts ?? null,
      rendererBackend: engine?.snapshot().resources.renderer?.backend ?? null,
      selectedSize:
        document.querySelector('[data-manual-scene-size]')?.value ?? null,
      immutable:
        document.querySelector('[data-manual-readout="immutability"]')?.textContent ?? null,
    };
  });
  assert(
    loaded.state?.sceneSize === '10000' &&
      loaded.rootCount === 10_005 &&
      loaded.semanticCounts?.rootElements === 10_005 &&
      loaded.semanticCounts?.components === 30_000 &&
      loaded.rendererBackend === 'webgl' &&
      loaded.viewport?.scale >= 0.025 &&
      loaded.viewport.scale < 0.5 &&
      loaded.selectedSize === '10000' &&
      loaded.immutable === '통과',
    'human-operated Lab fits the exploratory 10,000 scene below the former 50% zoom floor',
    loaded,
  );

  await activePage.locator('[data-manual-tool-button="view"]').click();
  for (let index = 0; index < 4; index += 1) {
    await activePage.locator('[data-manual-command="zoom-out"]').click();
  }
  const minimumZoom = await activePage.evaluate(
    () => window.__PATCH_MAP_CORE_V2_MANUAL_LAB__?.engine()?.snapshot().viewport.scale ?? null,
  );
  assert(
    minimumZoom !== null && Math.abs(minimumZoom - 0.025) < 1e-9,
    'human-operated Lab Zoom out button reaches the 2.5% exploratory floor',
    { initialViewport: loaded.viewport, minimumZoom },
  );
  await activePage.locator('[data-manual-command="fit-all"]').click();
  await activePage.locator('[data-manual-tool-button="animation"]').click();
  await activePage.locator('[data-manual-mode="pan"]').click();
  const canvas = activePage.locator('[data-testid="manual-canvas-host"] canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Core v2 exploratory manual canvas has no bounds');
  const viewBefore = await activePage.evaluate(
    () => window.__PATCH_MAP_CORE_V2_MANUAL_LAB__?.engine()?.snapshot().viewport,
  );
  await activePage.locator('[data-manual-command="animate-all"]').click();
  await activePage.waitForFunction(
    () =>
      (window.__PATCH_MAP_CORE_V2_MANUAL_LAB__?.state().activeAnimations ?? 0) > 0,
    undefined,
    { timeout: 30_000 },
  );
  await activePage.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.55);
  await activePage.mouse.down();
  await activePage.mouse.move(
    box.x + box.width * 0.55 + 120,
    box.y + box.height * 0.55 + 40,
    { steps: 10 },
  );
  const animationsDuringPan = await activePage.evaluate(
    () => window.__PATCH_MAP_CORE_V2_MANUAL_LAB__?.state().activeAnimations ?? 0,
  );
  await activePage.mouse.up();
  const viewAfter = await activePage.evaluate(
    () => window.__PATCH_MAP_CORE_V2_MANUAL_LAB__?.engine()?.snapshot().viewport,
  );
  assert(
    animationsDuringPan > 0 &&
      viewBefore !== undefined &&
      viewAfter !== undefined &&
      (viewBefore.centerWorld[0] !== viewAfter.centerWorld[0] ||
        viewBefore.centerWorld[1] !== viewAfter.centerWorld[1]),
    'human-operated 10,000-bar animation overlaps a visible pan gesture',
    { animationsDuringPan, viewBefore, viewAfter },
  );
  await activePage.evaluate(
    () => window.__PATCH_MAP_CORE_V2_MANUAL_LAB__?.destroy(),
  );
  const cleanup = await activePage.evaluate(() => ({
    canvasCount:
      document.querySelectorAll('[data-testid="manual-canvas-host"] canvas').length,
    bridgePresent: window.__PATCH_MAP_CORE_V2_MANUAL_LAB__ !== undefined,
  }));
  assert(
    cleanup.canvasCount === 0 && cleanup.bridgePresent === false,
    'human-operated Lab destroy removes its 10,000-record canvas and bridge',
    cleanup,
  );
  return {
    loadAndInteractionMs: performance.now() - started,
    rootCount: loaded.rootCount,
    componentCount: loaded.semanticCounts?.components ?? null,
    animationsDuringPan,
    cleanupCanvasCount: cleanup.canvasCount,
  };
}

async function samplePlaygroundBars(activePage) {
  return activePage.evaluate(() => {
    const runtime = window.__PATCH_MAP_CORE_V2_LAB__.getRuntime();
    if (!runtime) throw new Error('Core v2 exploratory Playground runtime is missing');
    return runtime.snapshot().entities
      .filter((entity) => entity.kind === 'bar')
      .slice(0, 16)
      .map((entity) => entity.bounds.height);
  });
}

function assert(condition, description, details) {
  checks.push({ description, status: condition ? 'pass' : 'fail', details });
  if (!condition) {
    throw new Error(`${description}: ${JSON.stringify(details)}`);
  }
}
