#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';
import { createServer } from 'vite';

import {
  parsePatchMapBrowserLaunch,
  parsePatchMapNativeWindowsCell,
} from './patch-map-browser-launch.mjs';

const ROOT = process.cwd();
const RESULTS = path.join(ROOT, 'performance/core-v2/results');
const codeCommit = process.env.PATCH_MAP_CODE_COMMIT ?? 'uncommitted';
const browserLaunch = parsePatchMapBrowserLaunch(process.argv.slice(2));
const nativeWindows = parsePatchMapNativeWindowsCell(
  process.argv.slice(2),
  browserLaunch,
);
const headed = browserLaunch.headed;
const outputPath = path.resolve(
  process.env.PATCH_MAP_BROWSER_OUTPUT
    ?? path.join(RESULTS, 'browser-functional.json'),
);
const server = await createServer({
  root: ROOT,
  configFile: path.join(ROOT, 'vite.patch-map-lab.config.ts'),
  logLevel: 'error',
});
await server.listen();
const baseUrl = server.resolvedUrls?.local?.[0];
if (!baseUrl) throw new Error('PatchMap lab server has no URL');
const browser = await chromium.launch(browserLaunch.launchOptions);
const context = await browser.newContext({ viewport: { width: 1_440, height: 1_000 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = { console: [], page: [], network: [] };
page.on('console', (message) => {
  if (message.type() === 'error') errors.console.push(message.text());
});
page.on('pageerror', (error) => errors.page.push(error.stack ?? error.message));
page.on('requestfailed', (request) => errors.network.push(`${request.url()} ${request.failure()?.errorText ?? ''}`));
page.on('response', (response) => {
  if (response.status() >= 400) errors.network.push(`${response.url()} HTTP ${response.status()}`);
});

const checks = [];
const failures = [];
try {
  await page.goto(new URL('lab/patch-map/', baseUrl).href, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.body.dataset.labReady === 'true');
  await waitReady(page);
  const initial = await labState(page);
  check(initial.loaded && initial.entityCount > 0, 'initial direct synthetic load', checks, failures);
  check(initial.activeStrategy === 'mesh' && initial.activeBackend === 'webgl', 'Mesh WebGL production baseline', checks, failures);
  check(await page.getByTestId('input-immutability').textContent() === 'PASS', 'caller input immutability readout', checks, failures);

  await action(page, 'prepare');
  const assetBeforeLoad = await assetState(page);
  await action(page, 'asset-load');
  const assetAfterLoad = await assetState(page);
  check(
    assetAfterLoad.loadedAssetCount === assetBeforeLoad.loadedAssetCount + 1 &&
      assetAfterLoad.unresolvedAssetCount < assetBeforeLoad.unresolvedAssetCount &&
      assetAfterLoad.lastInvalidation.endsWith(':load') &&
      assetAfterLoad.frame > assetBeforeLoad.frame,
    'asset load binds the texture and publishes its debug transition',
    checks,
    failures,
    { before: assetBeforeLoad, after: assetAfterLoad },
  );

  const textBefore = await textState(page);
  await action(page, 'random-text');
  const textAfter = await textState(page);
  const textChanges = changedValues(textBefore.values, textAfter.values);
  check(
    textBefore.values.length === textAfter.values.length && textChanges.count > 0,
    'seeded random text changes actual values while preserving text identity/count',
    checks,
    failures,
    {
      beforeCount: textBefore.values.length,
      afterCount: textAfter.values.length,
      changedCount: textChanges.count,
      changedSamples: textChanges.samples,
    },
  );
  check(
    textAfter.renderedTextCount === textAfter.values.length &&
      textAfter.renderedTextCount === textBefore.renderedTextCount &&
      textAfter.frame > textBefore.frame,
    'random text change is represented by aggregate text leaves in a new frame',
    checks,
    failures,
    { before: textStateSummary(textBefore), after: textStateSummary(textAfter) },
  );

  await action(page, 'capture');
  const capture = await page.getByTestId('capture-image').getAttribute('src');
  check(capture?.startsWith('data:image/png') === true && capture.length > 100, 'Pixi Extract PNG capture', checks, failures);

  const assetBeforeUnload = await assetState(page);
  await action(page, 'asset-unload');
  const assetAfterUnload = await assetState(page);
  check(
    assetAfterUnload.loadedAssetCount === assetBeforeUnload.loadedAssetCount - 1 &&
      assetAfterUnload.unresolvedAssetCount > assetBeforeUnload.unresolvedAssetCount &&
      assetAfterUnload.lastInvalidation.endsWith(':unload') &&
      assetAfterUnload.frame > assetBeforeUnload.frame,
    'asset unload restores the unresolved fallback and records its debug transition',
    checks,
    failures,
    { before: assetBeforeUnload, after: assetAfterUnload },
  );
  const assetNextFrame = await page.evaluate(() => {
    const runtime = window.__PATCH_MAP_LAB__.getRuntime();
    if (!runtime) throw new Error('missing PatchMap runtime after asset unload');
    runtime.flush('browser-after-asset-unload');
    const debug = runtime.debugSnapshot().renderer;
    return {
      loadedAssetCount: debug.loadedAssetCount,
      unresolvedAssetCount: debug.unresolvedAssetCount,
      frame: debug.frame,
      lastInvalidation: debug.lastInvalidation,
    };
  });
  check(
    assetNextFrame.frame > assetAfterUnload.frame &&
      assetNextFrame.loadedAssetCount === assetAfterUnload.loadedAssetCount &&
      assetNextFrame.unresolvedAssetCount === assetAfterUnload.unresolvedAssetCount,
    'the frame after asset unload renders without a stale texture binding',
    checks,
    failures,
    { afterUnload: assetAfterUnload, nextFrame: assetNextFrame },
  );

  const beforeReset = await viewState(page);
  await action(page, 'reset');
  const afterReset = await viewState(page);
  check(
    !sameView(beforeReset.view, afterReset.view) &&
      afterReset.view.x === 0 &&
      afterReset.view.y === 0 &&
      afterReset.view.scale === 1 &&
      (afterReset.view.rotation ?? 0) === 0 &&
      afterReset.frame > beforeReset.frame,
    'reset publishes the identity viewport in a new frame',
    checks,
    failures,
    { before: beforeReset, after: afterReset },
  );
  await action(page, 'fit');
  const afterFit = await fittedViewState(page);
  check(
    !sameView(afterReset.view, afterFit.view) &&
      (afterFit.view.rotation ?? 0) === 0 &&
      afterFit.frame > afterReset.frame &&
      afterFit.presentedBounds.left >= 23.5 &&
      afterFit.presentedBounds.top >= 23.5 &&
      afterFit.presentedBounds.right <= afterFit.viewport.width - 23.5 &&
      afterFit.presentedBounds.bottom <= afterFit.viewport.height - 23.5,
    'fit publishes a distinct viewport with visible scene bounds inside padding',
    checks,
    failures,
    { reset: afterReset, fit: afterFit },
  );
  const canvas = page.locator('[data-testid="canvas-host"] canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('PatchMap canvas has no browser bounds');
  const target = await page.evaluate(() => {
    const runtime = window.__PATCH_MAP_LAB__.getRuntime();
    if (!runtime) throw new Error('missing PatchMap runtime');
    const entity = runtime.snapshot().entities.find((entry) => entry.visible && entry.interactive);
    if (!entity) throw new Error('no interactive entity');
    const world = {
      x: entity.bounds.x + entity.bounds.width / 2,
      y: entity.bounds.y + entity.bounds.height / 2,
    };
    const view = runtime.view;
    const radians = (view.rotation ?? 0) * Math.PI / 180;
    const scaledX = world.x * view.scale;
    const scaledY = world.y * view.scale;
    return {
      x: view.x + scaledX * Math.cos(radians) - scaledY * Math.sin(radians),
      y: view.y + scaledX * Math.sin(radians) + scaledY * Math.cos(radians),
      id: entity.id,
    };
  });
  await page.mouse.click(box.x + target.x, box.y + target.y);
  await page.waitForFunction(() => (window.__PATCH_MAP_LAB__.getRuntime()?.selection().refs.length ?? 0) === 1);
  check(true, 'transformed root-event hit and selection', checks, failures);

  const nonTarget = await page.evaluate(() => {
    const runtime = window.__PATCH_MAP_LAB__.getRuntime();
    if (!runtime) throw new Error('missing PatchMap runtime');
    const id = '__core_v2_browser_non_target__';
    const screen = { x: runtime.renderer.width - 12, y: runtime.renderer.height - 12 };
    const world = runtime.screenToWorld(screen);
    const size = 12 / runtime.view.scale;
    runtime.commit({
      operations: [{
        type: 'add',
        entity: {
          kind: 'rect',
          id,
          x: world.x - size / 2,
          y: world.y - size / 2,
          width: size,
          height: size,
          fill: 0xff00ffff,
          visible: true,
          interactive: false,
          zIndex: 1_000_000,
          tags: ['browser-proof', 'non-target'],
        },
      }],
    });
    runtime.flush('browser-non-target-add');
    const anyRef = runtime.hitTestScreen(screen, { interactiveOnly: false });
    const interactiveRef = runtime.hitTestScreen(screen, { interactiveOnly: true });
    return {
      id,
      screen,
      anyHitId: anyRef ? runtime.get(anyRef)?.id ?? null : null,
      interactiveHitId: interactiveRef ? runtime.get(interactiveRef)?.id ?? null : null,
    };
  });
  await page.mouse.click(box.x + nonTarget.screen.x, box.y + nonTarget.screen.y);
  await page.waitForTimeout(50);
  const nonTargetSelectionCount = await page.evaluate(
    () => window.__PATCH_MAP_LAB__.getRuntime()?.selection().refs.length ?? -1,
  );
  check(
    nonTarget.anyHitId === nonTarget.id &&
      nonTarget.interactiveHitId === null &&
      nonTargetSelectionCount === 0,
    'non-interactive non-target hit clears selection without becoming a target',
    checks,
    failures,
    { ...nonTarget, selectionCount: nonTargetSelectionCount },
  );
  await page.evaluate((id) => {
    const runtime = window.__PATCH_MAP_LAB__.getRuntime();
    if (!runtime) throw new Error('missing PatchMap runtime');
    runtime.commit({ operations: [{ type: 'remove', target: id }] });
    runtime.flush('browser-non-target-remove');
  }, nonTarget.id);
  await page.mouse.click(box.x + target.x, box.y + target.y);
  await page.waitForFunction(
    () => (window.__PATCH_MAP_LAB__.getRuntime()?.selection().refs.length ?? 0) === 1,
  );

  const beforePan = await page.evaluate(() => window.__PATCH_MAP_LAB__.getRuntime()?.view);
  await page.mouse.move(box.x + box.width - 12, box.y + box.height - 12);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 72, box.y + box.height - 52, { steps: 4 });
  await page.mouse.up();
  const afterPan = await page.evaluate(() => window.__PATCH_MAP_LAB__.getRuntime()?.view);
  check(
    beforePan && afterPan && (beforePan.x !== afterPan.x || beforePan.y !== afterPan.y),
    'real pointer drag pans an empty transformed viewport',
    checks,
    failures,
  );
  check(
    await page.evaluate(() => window.__PATCH_MAP_LAB__.getRuntime()?.selection().refs.length) === 0,
    'empty hit clears selection',
    checks,
    failures,
  );

  const cursor = { x: Math.round(box.width * 0.45), y: Math.round(box.height * 0.45) };
  const zoomProbe = { point: cursor, cssSize: { width: box.width, height: box.height } };
  const beforeZoom = await page.evaluate(({ point, cssSize }) => {
    const runtime = window.__PATCH_MAP_LAB__.getRuntime();
    if (!runtime) return null;
    const logical = {
      x: point.x * runtime.renderer.width / cssSize.width,
      y: point.y * runtime.renderer.height / cssSize.height,
    };
    return { world: runtime.screenToWorld(logical), scale: runtime.view.scale };
  }, zoomProbe);
  await page.mouse.move(box.x + cursor.x, box.y + cursor.y);
  await page.mouse.wheel(0, -180);
  await page.waitForTimeout(50);
  const afterZoom = await page.evaluate(({ point, cssSize }) => {
    const runtime = window.__PATCH_MAP_LAB__.getRuntime();
    if (!runtime) return null;
    const logical = {
      x: point.x * runtime.renderer.width / cssSize.width,
      y: point.y * runtime.renderer.height / cssSize.height,
    };
    return { world: runtime.screenToWorld(logical), scale: runtime.view.scale };
  }, zoomProbe);
  const zoomScreenError = beforeZoom && afterZoom
    ? Math.hypot(
        afterZoom.world.x - beforeZoom.world.x,
        afterZoom.world.y - beforeZoom.world.y,
      ) * afterZoom.scale
    : Number.POSITIVE_INFINITY;
  // Federated global coordinates are quantized through the CSS-sized canvas;
  // require the preserved world point to remain within one presented pixel.
  const zoomStable = beforeZoom && afterZoom && afterZoom.scale > beforeZoom.scale && zoomScreenError < 1;
  check(
    zoomStable,
    `real wheel zoom remains cursor-centered (${JSON.stringify({ beforeZoom, afterZoom, zoomScreenError })})`,
    checks,
    failures,
  );

  const barsBeforeAnimation = await barState(page);
  await action(page, 'animate-partial');
  const barsDuringAnimation = await waitForBarAnimationEvidence(page, barsBeforeAnimation);
  check(
    barsDuringAnimation.activeAnimations > 0 &&
      barsDuringAnimation.changedCount > 0 &&
      barsDuringAnimation.rendererFrame > barsBeforeAnimation.rendererFrame &&
      barsDuringAnimation.schedulerFrame > barsBeforeAnimation.schedulerFrame,
    'bar animation presents an intermediate height through the central scheduler',
    checks,
    failures,
    { before: barStateSummary(barsBeforeAnimation), during: barsDuringAnimation },
  );
  await page.waitForFunction(() => (window.__PATCH_MAP_LAB__.getRuntime()?.activeAnimations ?? 0) === 0, undefined, { timeout: 10_000 });
  const barsAfterAnimation = await barState(page);
  const completedBarChanges = changedValues(barsBeforeAnimation.values, barsAfterAnimation.values);
  check(
    barsAfterAnimation.activeAnimations === 0 &&
      completedBarChanges.count > 0 &&
      barsAfterAnimation.rendererFrame > barsDuringAnimation.rendererFrame &&
      barsAfterAnimation.schedulerFrame > barsDuringAnimation.schedulerFrame,
    'visible central-scheduler bar animation completes at changed heights',
    checks,
    failures,
    {
      changedCount: completedBarChanges.count,
      changedSamples: completedBarChanges.samples,
      during: barsDuringAnimation,
      after: barStateSummary(barsAfterAnimation),
    },
  );
  const layerLabels = await page.evaluate(() => {
    const runtime = window.__PATCH_MAP_LAB__.getRuntime();
    if (!runtime) return [];
    return [runtime.renderer.application.stage.label, ...runtime.renderer.application.stage.children.map((child) => child.label)];
  });
  check(
    layerLabels.some((label) => label.includes('PatchMap')) && layerLabels.some((label) => label.includes('world')),
    'Pixi DevTools exposes Application stage and aggregate world labels',
    checks,
    failures,
  );

  await page.evaluate(() => window.__PATCH_MAP_LAB__.loadProduction());
  await waitReady(page);
  const production = await labState(page);
  check(production.entityCount === 37_071, 'production JSON direct load expands to 37,071 entities', checks, failures);
  check(await page.getByTestId('input-immutability').textContent() === 'PASS', 'production input remains immutable', checks, failures);

  const productionOriginalBars = await productionBarVisibilityState(page);
  check(
    productionOriginalBars.totalBarCount === 9_365 &&
      productionOriginalBars.visibleBarCount === 0 &&
      productionOriginalBars.rendererFrame > 0,
    'production direct-load first frame preserves all 9,365 source-hidden bars',
    checks,
    failures,
    productionOriginalBars,
  );
  const productionVisibleBars = await showAllProductionBars(page);
  check(
    productionVisibleBars.operationCount === 9_365 &&
      productionVisibleBars.changedCount === 9_365 &&
      productionVisibleBars.totalBarCount === 9_365 &&
      productionVisibleBars.visibleBarCount === 9_365 &&
      productionVisibleBars.strategy === 'mesh' &&
      productionVisibleBars.uploadedChunks > 0 &&
      productionVisibleBars.uploadedBytes > 0 &&
      productionVisibleBars.rendererFrame > productionOriginalBars.rendererFrame,
    'separate production visibility transaction presents 9,365 bars with a Mesh upload',
    checks,
    failures,
    { before: productionOriginalBars, after: productionVisibleBars },
  );

  const productionBarsBeforeAnimation = await barState(page);
  const productionAnimationStart = await startProductionPartialAnimation(page);
  const productionBarsDuringAnimation = await waitForBarAnimationEvidence(page, productionBarsBeforeAnimation);
  check(
    productionAnimationStart.requestedFraction === 0.01 &&
      productionAnimationStart.scheduledAnimations > 0 &&
      productionAnimationStart.scheduledAnimations <= Math.ceil(productionBarsBeforeAnimation.values.length * 0.1) &&
      productionBarsDuringAnimation.activeAnimations > 0 &&
      productionBarsDuringAnimation.changedCount > 0 &&
      productionBarsDuringAnimation.rendererFrame > productionBarsBeforeAnimation.rendererFrame &&
      productionBarsDuringAnimation.uploadedChunks > 0 &&
      productionBarsDuringAnimation.uploadedBytes > 0,
    'production 1% bar animation presents intermediate heights with non-zero Mesh uploads',
    checks,
    failures,
    {
      start: productionAnimationStart,
      before: barStateSummary(productionBarsBeforeAnimation),
      during: productionBarsDuringAnimation,
    },
  );
  await page.waitForFunction(() => (window.__PATCH_MAP_LAB__.getRuntime()?.activeAnimations ?? 0) === 0, undefined, { timeout: 10_000 });
  const productionBarsAfterAnimation = await barState(page);
  const productionCompletedBarChanges = changedValues(
    productionBarsBeforeAnimation.values,
    productionBarsAfterAnimation.values,
  );
  check(
    productionBarsAfterAnimation.activeAnimations === 0 &&
      productionCompletedBarChanges.count > 0 &&
      productionBarsAfterAnimation.rendererFrame > productionBarsDuringAnimation.rendererFrame &&
      productionBarsAfterAnimation.schedulerFrame > productionBarsDuringAnimation.schedulerFrame,
    'production partial bar animation completes with actual final height changes',
    checks,
    failures,
    {
      requestedFraction: productionAnimationStart.requestedFraction,
      scheduledAnimations: productionAnimationStart.scheduledAnimations,
      changedCount: productionCompletedBarChanges.count,
      changedSamples: productionCompletedBarChanges.samples,
      during: productionBarsDuringAnimation,
      after: barStateSummary(productionBarsAfterAnimation),
    },
  );

  const previousWidth = await page.evaluate(() => window.__PATCH_MAP_LAB__.getRuntime()?.renderer.width);
  await page.setViewportSize({ width: 1_180, height: 840 });
  await page.waitForFunction((width) => window.__PATCH_MAP_LAB__.getRuntime()?.renderer.width !== width, previousWidth);
  check(true, 'responsive resize updates Pixi renderer', checks, failures);

  await action(page, 'destroy');
  check(await canvas.count() === 0, 'destroy removes canvas and releases application lifecycle', checks, failures);
  await action(page, 'reinit');
  await page.getByTestId('strategy-select').selectOption('particle');
  await action(page, 'reinit');
  await page.getByTestId('dataset-select').selectOption('100');
  await action(page, 'load');
  await action(page, 'asset-load');
  await action(page, 'prepare');
  await action(page, 'asset-unload');
  await page.evaluate(() => window.__PATCH_MAP_LAB__.getRuntime()?.flush('particle-post-unload-frame'));
  await action(page, 'animate-all');
  await page.waitForFunction(() => (window.__PATCH_MAP_LAB__.getRuntime()?.activeAnimations ?? 0) === 0, undefined, { timeout: 10_000 });
  const particle = await labState(page);
  check(particle.activeStrategy === 'particle' && particle.entityCount === 509, 'rejected Particle spike remains functionally testable', checks, failures);
  await action(page, 'destroy');

  check(errors.console.length === 0, 'console error count is zero', checks, failures);
  check(errors.page.length === 0, 'page error count is zero', checks, failures);
  check(errors.network.length === 0, 'network error count is zero', checks, failures);
  const evidence = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    codeCommit,
    headed,
    checks,
    errors,
    status: failures.length === 0 ? 'pass' : 'fail',
    failures,
    environment: {
      platform: process.platform,
      architecture: process.arch,
      browserTarget: browserLaunch.target,
      browserVersion: browser.version(),
      nativeCellId: nativeWindows.cellId,
    },
    windowsNative: nativeWindows.evidenceStatus,
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  if (failures.length) throw new Error(failures.join('; '));
  process.stdout.write(`PASS: ${checks.length} PatchMap ${headed ? 'headed ' : ''}browser checks, Mesh+Particle+production, console/page/network errors 0\n`);
} finally {
  await browser.close();
  await server.close();
}

async function action(page, testId) {
  await waitReady(page, true);
  await page.getByTestId(testId).click();
  await page.waitForFunction(
    (actionName) => {
      const state = window.__PATCH_MAP_LAB__.state;
      return state.lastAction === actionName && state.status !== 'busy';
    },
    testId,
    { timeout: 30_000 },
  );
  const state = await labState(page);
  if (state.error) throw new Error(`${testId}: ${state.error}`);
}

async function waitReady(page, allowOffline = false) {
  await page.waitForFunction(
    (offline) => {
      const state = window.__PATCH_MAP_LAB__?.state;
      return state && state.status !== 'busy' && state.status !== 'booting' && (offline || state.status === 'ready');
    },
    allowOffline,
    { timeout: 30_000 },
  );
}

function labState(page) {
  return page.evaluate(() => window.__PATCH_MAP_LAB__.state);
}

function assetState(page) {
  return page.evaluate(() => {
    const runtime = window.__PATCH_MAP_LAB__.getRuntime();
    if (!runtime) throw new Error('missing PatchMap runtime for asset state');
    const debug = runtime.debugSnapshot().renderer;
    return {
      loadedAssetCount: debug.loadedAssetCount,
      unresolvedAssetCount: debug.unresolvedAssetCount,
      imageCount: debug.imageCount,
      frame: debug.frame,
      lastInvalidation: debug.lastInvalidation,
    };
  });
}

function textState(page) {
  return page.evaluate(() => {
    const runtime = window.__PATCH_MAP_LAB__.getRuntime();
    if (!runtime) throw new Error('missing PatchMap runtime for text state');
    const debug = runtime.debugSnapshot().renderer;
    return {
      values: runtime.snapshot().entities
        .filter((entity) => entity.kind === 'text')
        .map((entity) => ({ id: entity.id, value: String(entity.data.text ?? '') })),
      renderedTextCount: debug.bitmapTextCount + debug.fallbackTextCount,
      bitmapTextCount: debug.bitmapTextCount,
      fallbackTextCount: debug.fallbackTextCount,
      frame: debug.frame,
    };
  });
}

function viewState(page) {
  return page.evaluate(() => {
    const runtime = window.__PATCH_MAP_LAB__.getRuntime();
    if (!runtime) throw new Error('missing PatchMap runtime for view state');
    return {
      view: runtime.view,
      frame: runtime.debugSnapshot().renderer.frame,
      viewport: { width: runtime.renderer.width, height: runtime.renderer.height },
    };
  });
}

function fittedViewState(page) {
  return page.evaluate(() => {
    const runtime = window.__PATCH_MAP_LAB__.getRuntime();
    if (!runtime) throw new Error('missing PatchMap runtime for fitted view state');
    const entities = runtime.snapshot().entities.filter((entity) => entity.visible && entity.kind !== 'relation');
    const minX = Math.min(...entities.map((entity) => entity.bounds.x));
    const minY = Math.min(...entities.map((entity) => entity.bounds.y));
    const maxX = Math.max(...entities.map((entity) => entity.bounds.x + entity.bounds.width));
    const maxY = Math.max(...entities.map((entity) => entity.bounds.y + entity.bounds.height));
    const view = runtime.view;
    return {
      view,
      frame: runtime.debugSnapshot().renderer.frame,
      viewport: { width: runtime.renderer.width, height: runtime.renderer.height },
      presentedBounds: {
        left: view.x + minX * view.scale,
        top: view.y + minY * view.scale,
        right: view.x + maxX * view.scale,
        bottom: view.y + maxY * view.scale,
      },
    };
  });
}

function productionBarVisibilityState(page) {
  return page.evaluate(() => {
    const runtime = window.__PATCH_MAP_LAB__.getRuntime();
    if (!runtime) throw new Error('missing PatchMap runtime for production bar visibility state');
    const bars = runtime.snapshot().entities.filter((entity) => entity.kind === 'bar');
    const debug = runtime.debugSnapshot().renderer;
    return {
      totalBarCount: bars.length,
      visibleBarCount: bars.filter((entity) => entity.visible).length,
      rendererFrame: debug.frame,
      strategy: debug.strategy,
      uploadedChunks: debug.uploadedChunks,
      uploadedBytes: debug.uploadedBytes,
    };
  });
}

function showAllProductionBars(page) {
  return page.evaluate(() => {
    const runtime = window.__PATCH_MAP_LAB__.getRuntime();
    if (!runtime) throw new Error('missing PatchMap runtime for production visibility transaction');
    const bars = runtime.snapshot().entities.filter((entity) => entity.kind === 'bar');
    const result = runtime.commit({
      operations: bars.map((entity) => ({ type: 'visibility', target: entity.id, visible: true })),
    });
    runtime.flush('browser-production-show-bars');
    const visibleBars = runtime.snapshot().entities.filter((entity) => entity.kind === 'bar' && entity.visible);
    const debug = runtime.debugSnapshot().renderer;
    return {
      operationCount: result.operationCount,
      changedCount: result.changed,
      totalBarCount: bars.length,
      visibleBarCount: visibleBars.length,
      rendererFrame: debug.frame,
      strategy: debug.strategy,
      uploadedChunks: debug.uploadedChunks,
      uploadedBytes: debug.uploadedBytes,
      lastInvalidation: debug.lastInvalidation,
    };
  });
}

function startProductionPartialAnimation(page) {
  return page.evaluate(() => {
    const runtime = window.__PATCH_MAP_LAB__.getRuntime();
    if (!runtime) throw new Error('missing PatchMap runtime for production partial animation');
    const requestedFraction = 0.01;
    const result = runtime.animateBarHeights({
      fraction: requestedFraction,
      durationMs: 600,
      seed: 0xc0def17e,
    });
    const debug = runtime.debugSnapshot();
    return {
      requestedFraction,
      scheduledAnimations: result.operationCount,
      activeAnimations: runtime.activeAnimations,
      rendererFrame: debug.renderer.frame,
      schedulerFrame: debug.scheduler.frameCount,
    };
  });
}

function barState(page) {
  return page.evaluate(() => {
    const runtime = window.__PATCH_MAP_LAB__.getRuntime();
    if (!runtime) throw new Error('missing PatchMap runtime for bar state');
    const debug = runtime.debugSnapshot();
    return {
      values: runtime.snapshot().entities
        .filter((entity) => entity.kind === 'bar')
        .map((entity) => ({ id: entity.id, value: entity.bounds.height })),
      activeAnimations: runtime.activeAnimations,
      rendererFrame: debug.renderer.frame,
      schedulerFrame: debug.scheduler.frameCount,
      uploadedChunks: debug.renderer.uploadedChunks,
      uploadedBytes: debug.renderer.uploadedBytes,
    };
  });
}

function waitForBarAnimationEvidence(page, before) {
  return page.evaluate(async (initial) => new Promise((resolve, reject) => {
    const initialValues = new Map(initial.values.map((entry) => [entry.id, entry.value]));
    const deadline = performance.now() + 10_000;
    const observe = () => {
      const runtime = window.__PATCH_MAP_LAB__.getRuntime();
      if (!runtime) {
        reject(new Error('PatchMap runtime disappeared during bar animation'));
        return;
      }
      const debug = runtime.debugSnapshot();
      const changed = runtime.snapshot().entities
        .filter((entity) => entity.kind === 'bar')
        .flatMap((entity) => {
          const beforeValue = initialValues.get(entity.id);
          return beforeValue !== undefined && Math.abs(entity.bounds.height - beforeValue) > 1e-6
            ? [{ id: entity.id, before: beforeValue, during: entity.bounds.height }]
            : [];
        });
      if (
        runtime.activeAnimations > 0 &&
        changed.length > 0 &&
        debug.renderer.frame > initial.rendererFrame &&
        debug.scheduler.frameCount > initial.schedulerFrame
      ) {
        resolve({
          activeAnimations: runtime.activeAnimations,
          changedCount: changed.length,
          changedSamples: changed.slice(0, 5),
          rendererFrame: debug.renderer.frame,
          schedulerFrame: debug.scheduler.frameCount,
          uploadedChunks: debug.renderer.uploadedChunks,
          uploadedBytes: debug.renderer.uploadedBytes,
        });
        return;
      }
      if (performance.now() >= deadline) {
        reject(new Error('timed out before observing an intermediate bar height in a presented frame'));
        return;
      }
      requestAnimationFrame(observe);
    };
    observe();
  }), before);
}

function changedValues(before, after) {
  const prior = new Map(before.map((entry) => [entry.id, entry.value]));
  const changes = after.flatMap((entry) => {
    const beforeValue = prior.get(entry.id);
    return beforeValue !== undefined && entry.value !== beforeValue
      ? [{ id: entry.id, before: beforeValue, after: entry.value }]
      : [];
  });
  return { count: changes.length, samples: changes.slice(0, 5) };
}

function textStateSummary(state) {
  return {
    entityCount: state.values.length,
    renderedTextCount: state.renderedTextCount,
    bitmapTextCount: state.bitmapTextCount,
    fallbackTextCount: state.fallbackTextCount,
    frame: state.frame,
  };
}

function barStateSummary(state) {
  return {
    barCount: state.values.length,
    activeAnimations: state.activeAnimations,
    rendererFrame: state.rendererFrame,
    schedulerFrame: state.schedulerFrame,
    uploadedChunks: state.uploadedChunks,
    uploadedBytes: state.uploadedBytes,
  };
}

function sameView(left, right) {
  return left.x === right.x &&
    left.y === right.y &&
    left.scale === right.scale &&
    (left.rotation ?? 0) === (right.rotation ?? 0);
}

function check(condition, label, checks, failures, details) {
  checks.push({ label, passed: Boolean(condition), ...(details === undefined ? {} : { details }) });
  if (!condition) failures.push(label);
}
