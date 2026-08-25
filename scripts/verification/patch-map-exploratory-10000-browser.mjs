#!/usr/bin/env node

import path from 'node:path';

import { chromium } from 'playwright';
import { createServer } from 'vite';

import { parsePatchMapBrowserLaunch } from './patch-map-browser-launch.mjs';

const ROOT = process.cwd();
const browserLaunch = parsePatchMapBrowserLaunch(process.argv.slice(2));
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
    configFile: path.join(ROOT, 'vite.patch-map-lab.config.ts'),
    logLevel: 'error',
  });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  if (!baseUrl) throw new Error('PatchMap exploratory Lab server has no URL');

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

  const manualLab = await verifyManualLab(page, baseUrl);
  assert(
    Object.values(errors).every((entries) => entries.length === 0),
    'console/page/network error count is zero',
    errors,
  );

  process.stdout.write(`${JSON.stringify({
    revision: 'patch-map-exploratory-10000-browser/4',
    status: 'pass',
    browser: browser.version(),
    headed: browserLaunch.headed,
    target: browserLaunch.target,
    windowsNative: 'pending',
    checks,
    manualLab,
    errors,
  }, null, 2)}\n`);
} finally {
  await page?.close().catch(() => undefined);
  await context?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  await server?.close().catch(() => undefined);
}

async function verifyManualLab(activePage, baseUrl) {
  const started = performance.now();
  await activePage.goto(
    new URL(
      'lab/patch-map?scenario=REN-009&size=5000&seed=319',
      baseUrl,
    ).href,
    { waitUntil: 'networkidle', timeout: 60_000 },
  );
  await activePage.waitForFunction(
    () => {
      const status = window.__PATCH_MAP_MANUAL_LAB__?.state().status;
      return status === 'ready' || status === 'failed';
    },
    undefined,
    { timeout: 60_000 },
  );
  await activePage.locator('[data-manual-tool-button="animation"]').click();
  await activePage.locator('[data-manual-animation-duration]').fill('15000');
  await activePage.getByTestId('manual-dataset-size').selectOption('10000');
  await activePage.waitForFunction(
    () => {
      const state = window.__PATCH_MAP_MANUAL_LAB__?.state();
      return state?.status === 'ready' && state.sceneSize === '10000';
    },
    undefined,
    { timeout: 60_000 },
  );
  const loaded = await activePage.evaluate(() => {
    const bridge = window.__PATCH_MAP_MANUAL_LAB__;
    const engine = bridge?.engine();
    return {
      state: bridge?.state(),
      viewport: engine?.snapshot().viewport ?? null,
      rootCount: engine?.snapshot().rootIds.length ?? -1,
      semanticCounts: engine?.semanticProbe().scene.counts ?? null,
      rendererBackend: engine?.snapshot().resources.renderer?.backend ?? null,
      selectedSize:
        document.querySelector('[data-manual-scene-size]')?.value ?? null,
      selectedTopSize:
        document.querySelector('[data-testid="manual-dataset-size"]')?.value ?? null,
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
      loaded.selectedTopSize === '10000' &&
      loaded.immutable === '통과',
    'the single PatchMap Lab fits the exploratory 10,000 scene',
    loaded,
  );

  await activePage.locator('[data-manual-tool-button="view"]').click();
  for (let index = 0; index < 4; index += 1) {
    await activePage.locator('[data-manual-command="zoom-out"]').click();
  }
  const minimumZoom = await activePage.evaluate(
    () => window.__PATCH_MAP_MANUAL_LAB__?.engine()?.snapshot().viewport.scale ?? null,
  );
  assert(
    minimumZoom !== null && Math.abs(minimumZoom - 0.025) < 1e-9,
    'the single PatchMap Lab Zoom out button reaches the 2.5% exploratory floor',
    { initialViewport: loaded.viewport, minimumZoom },
  );

  await activePage.locator('[data-manual-command="fit-all"]').click();
  await activePage.locator('[data-manual-tool-button="animation"]').click();
  await activePage.locator('[data-manual-mode="pan"]').click();
  const canvas = activePage.locator('[data-testid="manual-canvas-host"] canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('PatchMap exploratory manual canvas has no bounds');
  const viewBefore = await activePage.evaluate(
    () => window.__PATCH_MAP_MANUAL_LAB__?.engine()?.snapshot().viewport,
  );
  await activePage.locator('[data-manual-command="animate-all"]').click();
  await activePage.waitForFunction(
    () =>
      (window.__PATCH_MAP_MANUAL_LAB__?.state().activeAnimations ?? 0) > 0,
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
    () => window.__PATCH_MAP_MANUAL_LAB__?.state().activeAnimations ?? 0,
  );
  await activePage.mouse.up();
  const viewAfter = await activePage.evaluate(
    () => window.__PATCH_MAP_MANUAL_LAB__?.engine()?.snapshot().viewport,
  );
  assert(
    animationsDuringPan > 0 &&
      viewBefore !== undefined &&
      viewAfter !== undefined &&
      (viewBefore.centerWorld[0] !== viewAfter.centerWorld[0] ||
        viewBefore.centerWorld[1] !== viewAfter.centerWorld[1]),
    'the single PatchMap Lab keeps 10,000-bar animation active during pan',
    { animationsDuringPan, viewBefore, viewAfter },
  );

  await activePage.evaluate(
    () => window.__PATCH_MAP_MANUAL_LAB__?.destroy(),
  );
  const cleanup = await activePage.evaluate(() => ({
    canvasCount:
      document.querySelectorAll('[data-testid="manual-canvas-host"] canvas').length,
    bridgePresent: window.__PATCH_MAP_MANUAL_LAB__ !== undefined,
  }));
  assert(
    cleanup.canvasCount === 0 && cleanup.bridgePresent === false,
    'the single PatchMap Lab destroy removes its 10,000-record canvas and bridge',
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

function assert(condition, description, details) {
  checks.push({ description, status: condition ? 'pass' : 'fail', details });
  if (!condition) {
    throw new Error(`${description}: ${JSON.stringify(details)}`);
  }
}
