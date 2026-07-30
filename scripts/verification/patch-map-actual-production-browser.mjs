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
  if (!baseUrl) throw new Error('PatchMap actual-production Lab server has no URL');

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

  const result = await verifyActualProductionLab(page, baseUrl);
  assert(
    Object.values(errors).every((entries) => entries.length === 0),
    'console/page/network error count is zero',
    errors,
  );
  process.stdout.write(`${JSON.stringify({
    revision: 'patch-map-actual-production-browser/1',
    status: 'pass',
    browser: browser.version(),
    headed: browserLaunch.headed,
    target: browserLaunch.target,
    windowsNative: 'pending',
    checks,
    result,
    errors,
  }, null, 2)}\n`);
} finally {
  await page?.close().catch(() => undefined);
  await context?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  await server?.close().catch(() => undefined);
}

async function verifyActualProductionLab(activePage, baseUrl) {
  const started = performance.now();
  await activePage.goto(
    new URL(
      'lab/patch-map/?scenario=REN-009&size=100&seed=319',
      baseUrl,
    ).href,
    { waitUntil: 'networkidle', timeout: 60_000 },
  );
  await activePage.waitForFunction(
    () => window.__PATCH_MAP_MANUAL_LAB__?.state().status === 'ready',
    undefined,
    { timeout: 60_000 },
  );
  await activePage.getByTestId('manual-dataset-size')
    .selectOption('actual-production');
  await activePage.waitForFunction(
    () => {
      const state = window.__PATCH_MAP_MANUAL_LAB__?.state();
      return state?.status === 'ready' &&
        state.sceneSize === 'actual-production';
    },
    undefined,
    { timeout: 60_000 },
  );

  const loaded = await activePage.evaluate(() => {
    const bridge = window.__PATCH_MAP_MANUAL_LAB__;
    const engine = bridge?.engine();
    const snapshot = engine?.snapshot();
    return {
      state: bridge?.state(),
      rootCount: snapshot?.rootIds.length ?? -1,
      firstRootIds: snapshot?.rootIds.slice(0, 3) ?? [],
      semanticCounts: engine?.semanticProbe().scene.counts ?? null,
      rendererBackend: snapshot?.resources.renderer?.backend ?? null,
      selectedSize:
        document.querySelector('[data-manual-scene-size]')?.value ?? null,
      selectedTopSize:
        document.querySelector('[data-testid="manual-dataset-size"]')?.value ?? null,
      immutable:
        document.querySelector('[data-manual-readout="immutability"]')?.textContent ?? null,
      viewport: snapshot?.viewport ?? null,
      canvasCount:
        document.querySelectorAll('[data-testid="manual-canvas-host"] canvas').length,
    };
  });
  assert(
    loaded.state?.sceneSize === 'actual-production' &&
      loaded.rootCount === 605 &&
      loaded.firstRootIds.join(',') ===
        '0VQUL2c700nbal7,0VQUMUbL004tcz7,F70QxBkaoSjfPH8' &&
      loaded.semanticCounts?.rootElements === 605 &&
      loaded.semanticCounts?.components === 643 &&
      loaded.rendererBackend === 'webgl' &&
      loaded.selectedSize === 'actual-production' &&
      loaded.selectedTopSize === 'actual-production' &&
      loaded.immutable === '통과' &&
      loaded.canvasCount === 1,
    'the single PatchMap Lab loads the unmodified actual production JSON',
    loaded,
  );

  await activePage.locator('[data-manual-tool-button="view"]').click();
  await activePage.locator('[data-manual-command="fit-all"]').click();
  await activePage.locator('[data-manual-mode="pan"]').click();
  const canvas = activePage.locator('[data-testid="manual-canvas-host"] canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('PatchMap actual-production canvas has no bounds');
  const viewBefore = await activePage.evaluate(
    () => window.__PATCH_MAP_MANUAL_LAB__?.engine()?.snapshot().viewport,
  );
  await activePage.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.55);
  await activePage.mouse.down();
  await activePage.mouse.move(
    box.x + box.width * 0.55 + 120,
    box.y + box.height * 0.55 + 40,
    { steps: 10 },
  );
  await activePage.mouse.up();
  const viewAfter = await activePage.evaluate(
    () => window.__PATCH_MAP_MANUAL_LAB__?.engine()?.snapshot().viewport,
  );
  assert(
    viewBefore !== undefined &&
      viewAfter !== undefined &&
      (viewBefore.centerWorld[0] !== viewAfter.centerWorld[0] ||
        viewBefore.centerWorld[1] !== viewAfter.centerWorld[1]),
    'the actual production scene remains pannable after fit',
    { viewBefore, viewAfter },
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
    'destroy removes the actual production canvas and bridge',
    cleanup,
  );
  return {
    loadAndInteractionMs: performance.now() - started,
    rootCount: loaded.rootCount,
    componentCount: loaded.semanticCounts?.components ?? null,
    rendererBackend: loaded.rendererBackend,
    cleanupCanvasCount: cleanup.canvasCount,
  };
}

function assert(condition, description, details) {
  checks.push({ description, status: condition ? 'pass' : 'fail', details });
  if (!condition) {
    throw new Error(`${description}: ${JSON.stringify(details)}`);
  }
}
