#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const ROOT = process.cwd();
const CODE_COMMIT = process.env.CORE_V2_CODE_COMMIT ?? 'uncommitted';
const OUTPUT_PATH = path.resolve(
  process.env.CORE_V2_WEBGPU_OUTPUT
    ?? path.join(ROOT, 'performance/core-v2/results/webgpu-experimental.json'),
);
const HEADED = process.argv.includes('--headed');
const DATASET = '5000';
const EXPECTED_ENTITY_COUNT = 25_499;
const CHROMIUM_ARGS = Object.freeze([
  '--enable-unsafe-webgpu',
  ...(process.platform === 'darwin' ? ['--use-angle=metal'] : []),
]);

let server;
let browser;
let context;
let page;
let adapter = null;
let fatalError = null;
const checks = [];
const failures = [];
const errors = {
  console: [],
  page: [],
  network: [],
};

try {
  server = await createServer({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.core-v2-lab.config.ts'),
    logLevel: 'error',
    optimizeDeps: { force: true },
  });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  if (!baseUrl) throw new Error('Core v2 WebGPU Lab server has no URL');

  browser = await chromium.launch({
    headless: !HEADED,
    args: CHROMIUM_ARGS,
  });
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
    if (response.status() >= 400) errors.network.push(`${response.url()} HTTP ${response.status()}`);
  });

  await page.goto(
    new URL(
      `lab/performance-v2/?dataset=${DATASET}&strategy=mesh&backend=webgpu`,
      baseUrl,
    ).href,
    { waitUntil: 'networkidle', timeout: 60_000 },
  );
  await page.waitForFunction(
    () => {
      const status = window.__PATCH_MAP_CORE_V2_LAB__?.state.status;
      return status === 'ready' || status === 'failed';
    },
    undefined,
    { timeout: 60_000 },
  );

  const initial = await page.evaluate(async () => {
    const bridge = window.__PATCH_MAP_CORE_V2_LAB__;
    const runtime = bridge.getRuntime();
    const gpuAdapter = await navigator.gpu?.requestAdapter({
      powerPreference: 'high-performance',
    });
    return {
      state: bridge.state,
      debug: runtime?.debugSnapshot() ?? null,
      canvasCount: document.querySelectorAll('canvas').length,
      inputImmutable:
        document.querySelector('[data-testid="input-immutability"]')?.textContent ?? null,
      navigatorGpu: typeof navigator.gpu !== 'undefined',
      adapter: gpuAdapter
        ? {
            vendor: gpuAdapter.info?.vendor ?? null,
            architecture: gpuAdapter.info?.architecture ?? null,
            device: gpuAdapter.info?.device ?? null,
            description: gpuAdapter.info?.description ?? null,
          }
        : null,
    };
  });
  adapter = initial.adapter;

  record(
    initial.navigatorGpu && adapter !== null,
    'secure-context WebGPU adapter is available',
    { navigatorGpu: initial.navigatorGpu, adapter },
  );
  record(
    initial.state.status === 'ready'
      && initial.state.activeBackend === 'webgpu'
      && initial.debug?.renderer.backend === 'webgpu',
    'Core v2 activates WebGPU without a silent WebGL fallback',
    initial.state,
  );
  if (initial.state.activeBackend !== 'webgpu') {
    throw new Error(
      `Core v2 WebGPU activation failed without fallback allowance: ${JSON.stringify(initial.state)}`,
    );
  }
  record(
    initial.state.loaded
      && initial.state.entityCount === EXPECTED_ENTITY_COUNT
      && initial.debug?.renderer.frame > 0
      && initial.canvasCount === 1,
    '5,000-record JSON load publishes one real WebGPU canvas',
    {
      entityCount: initial.state.entityCount,
      frame: initial.debug?.renderer.frame,
      canvasCount: initial.canvasCount,
    },
  );
  record(
    initial.inputImmutable === 'PASS',
    'caller-owned input remains immutable',
    { inputImmutable: initial.inputImmutable },
  );

  await action(page, 'prepare');
  const prepared = await rendererState(page);
  record(
    prepared.frame > initial.debug.renderer.frame,
    'prepare publishes a later visible WebGPU frame',
    { beforeFrame: initial.debug.renderer.frame, afterFrame: prepared.frame },
  );

  const assetBefore = await assetState(page);
  await action(page, 'asset-load');
  const assetLoaded = await assetState(page);
  await action(page, 'asset-unload');
  const assetUnloaded = await assetState(page);
  record(
    assetLoaded.loadedAssetCount === assetBefore.loadedAssetCount + 1
      && assetLoaded.unresolvedAssetCount < assetBefore.unresolvedAssetCount
      && assetUnloaded.loadedAssetCount === assetBefore.loadedAssetCount
      && assetUnloaded.unresolvedAssetCount === assetBefore.unresolvedAssetCount,
    'asset load and unload preserve explicit WebGPU texture ownership',
    { before: assetBefore, loaded: assetLoaded, unloaded: assetUnloaded },
  );

  const barsBefore = await barState(page);
  await action(page, 'animate-all');
  await page.waitForFunction(
    ({ digest, frame }) => {
      const runtime = window.__PATCH_MAP_CORE_V2_LAB__.getRuntime();
      if (!runtime || runtime.activeAnimations === 0) return false;
      const bars = runtime.snapshot().entities.filter((entity) => entity.kind === 'bar');
      let nextDigest = 0x811c9dc5;
      for (const bar of bars) {
        nextDigest ^= Math.round(bar.bounds.height * 1_000);
        nextDigest = Math.imul(nextDigest, 0x01000193);
      }
      return (nextDigest >>> 0) !== digest && runtime.debugSnapshot().renderer.frame > frame;
    },
    { digest: barsBefore.digest, frame: barsBefore.frame },
    { timeout: 10_000 },
  );
  const barsDuring = await barState(page);
  await page.waitForFunction(
    () => (window.__PATCH_MAP_CORE_V2_LAB__.getRuntime()?.activeAnimations ?? 0) === 0,
    undefined,
    { timeout: 10_000 },
  );
  const barsAfter = await barState(page);
  record(
    barsBefore.count === 5_000
      && barsDuring.activeAnimations === 5_000
      && barsDuring.digest !== barsBefore.digest
      && barsDuring.frame > barsBefore.frame
      && barsAfter.activeAnimations === 0
      && barsAfter.digest !== barsBefore.digest
      && barsAfter.frame > barsDuring.frame
      && barsAfter.percentageReferenceCount === 5_000
      && barsAfter.minPercent >= 0
      && barsAfter.maxPercent <= 100
      && barsAfter.distinctRoundedPercentCount >= 90,
    'all 5,000 bars independently animate within zero-to-one-hundred percent and settle',
    { before: barsBefore, during: barsDuring, after: barsAfter },
  );

  const textBefore = await textState(page);
  await action(page, 'random-text');
  const textAfter = await textState(page);
  record(
    textBefore.count === 5_000
      && textAfter.count === textBefore.count
      && textAfter.digest !== textBefore.digest
      && textAfter.frame > textBefore.frame,
    'seeded text changes preserve identity/count and publish a WebGPU frame',
    { before: textBefore, after: textAfter },
  );

  const canvas = page.locator('[data-testid="canvas-host"] canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Core v2 WebGPU canvas has no browser bounds');
  const target = await page.evaluate(() => {
    const runtime = window.__PATCH_MAP_CORE_V2_LAB__.getRuntime();
    if (!runtime) throw new Error('Core v2 WebGPU runtime is missing');
    const view = runtime.view;
    const radians = (view.rotation ?? 0) * Math.PI / 180;
    for (const entity of runtime.snapshot().entities) {
      if (!entity.visible || !entity.interactive) continue;
      const world = {
        x: entity.bounds.x + entity.bounds.width / 2,
        y: entity.bounds.y + entity.bounds.height / 2,
      };
      const scaledX = world.x * view.scale;
      const scaledY = world.y * view.scale;
      const screen = {
        x: view.x + scaledX * Math.cos(radians) - scaledY * Math.sin(radians),
        y: view.y + scaledX * Math.sin(radians) + scaledY * Math.cos(radians),
      };
      if (
        screen.x < 2
        || screen.y < 2
        || screen.x > runtime.renderer.width - 2
        || screen.y > runtime.renderer.height - 2
      ) {
        continue;
      }
      const hit = runtime.hitTestScreen(screen, { interactiveOnly: true });
      if (hit && runtime.get(hit)?.id === entity.id) {
        return { ...screen, id: entity.id };
      }
    }
    throw new Error('Core v2 WebGPU scene has no on-screen interactive target');
  });
  await page.mouse.click(box.x + target.x, box.y + target.y);
  await page.waitForFunction(
    () => (window.__PATCH_MAP_CORE_V2_LAB__.getRuntime()?.selection().refs.length ?? 0) === 1,
  );
  const selectedId = await page.evaluate(() => {
    const runtime = window.__PATCH_MAP_CORE_V2_LAB__.getRuntime();
    const ref = runtime?.selection().refs[0];
    return ref ? runtime?.get(ref)?.id ?? null : null;
  });
  record(
    selectedId === target.id,
    'root federated pointer hit selects the transformed entity',
    { expectedId: target.id, selectedId },
  );

  const zoomPoint = {
    x: Math.round(box.width * 0.45),
    y: Math.round(box.height * 0.45),
  };
  const viewBefore = await page.evaluate(() => window.__PATCH_MAP_CORE_V2_LAB__.getRuntime()?.view);
  await page.mouse.move(box.x + zoomPoint.x, box.y + zoomPoint.y);
  await page.mouse.wheel(0, -180);
  await page.waitForFunction(
    (scale) => (window.__PATCH_MAP_CORE_V2_LAB__.getRuntime()?.view.scale ?? scale) > scale,
    viewBefore.scale,
  );
  const interaction = await page.evaluate(() => {
    const runtime = window.__PATCH_MAP_CORE_V2_LAB__.getRuntime();
    if (!runtime) throw new Error('Core v2 WebGPU runtime is missing after wheel');
    const before = runtime.debugSnapshot().renderer.frame;
    runtime.panBy({ x: 36, y: -24 });
    runtime.flush('webgpu-experimental-pan');
    return {
      view: runtime.view,
      frameBeforePan: before,
      frameAfterPan: runtime.debugSnapshot().renderer.frame,
    };
  });
  record(
    interaction.view.scale > viewBefore.scale
      && interaction.frameAfterPan > interaction.frameBeforePan,
    'wheel zoom and viewport pan publish transformed WebGPU frames',
    { before: viewBefore, after: interaction },
  );

  await action(page, 'capture');
  const capture = await page.getByTestId('capture-image').getAttribute('src');
  record(
    capture?.startsWith('data:image/png') === true && capture.length > 100,
    'Pixi Extract captures the WebGPU frame as PNG',
    { encodedLength: capture?.length ?? 0 },
  );

  const widthBefore = await page.evaluate(
    () => window.__PATCH_MAP_CORE_V2_LAB__.getRuntime()?.renderer.width ?? null,
  );
  await page.setViewportSize({ width: 1_180, height: 840 });
  await page.waitForFunction(
    (width) => window.__PATCH_MAP_CORE_V2_LAB__.getRuntime()?.renderer.width !== width,
    widthBefore,
  );
  const widthAfter = await page.evaluate(
    () => window.__PATCH_MAP_CORE_V2_LAB__.getRuntime()?.renderer.width ?? null,
  );
  record(
    widthAfter !== null && widthAfter !== widthBefore,
    'responsive resize updates the WebGPU renderer',
    { widthBefore, widthAfter },
  );

  await action(page, 'destroy');
  const destroyed = await lifecycleState(page);
  record(
    destroyed.state.destroyed && destroyed.canvasCount === 0,
    'destroy releases the WebGPU canvas and runtime',
    destroyed,
  );

  await action(page, 'reinit');
  await action(page, 'load');
  const reinitialized = await lifecycleState(page);
  record(
    reinitialized.state.generation === 2
      && reinitialized.state.activeBackend === 'webgpu'
      && reinitialized.state.entityCount === EXPECTED_ENTITY_COUNT
      && reinitialized.canvasCount === 1,
    'fresh lifecycle reinitializes the same WebGPU backend and dataset',
    reinitialized,
  );
  await action(page, 'destroy');
  const finalCleanup = await lifecycleState(page);
  record(
    finalCleanup.state.destroyed && finalCleanup.canvasCount === 0,
    'final cleanup leaves no WebGPU canvas',
    finalCleanup,
  );

  record(errors.console.length === 0, 'console error count is zero', errors.console);
  record(errors.page.length === 0, 'page error count is zero', errors.page);
  record(errors.network.length === 0, 'network error count is zero', errors.network);
} catch (error) {
  fatalError = error instanceof Error ? error.stack ?? error.message : String(error);
  failures.push(`fatal: ${fatalError}`);
} finally {
  if (page) {
    await page.evaluate(async () => {
      const runtime = window.__PATCH_MAP_CORE_V2_LAB__?.getRuntime();
      if (runtime && !runtime.destroyed) await runtime.destroy();
    }).catch(() => undefined);
  }
  await page?.close().catch(() => undefined);
  await context?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  await server?.close().catch(() => undefined);

  const cpus = os.cpus();
  const status = failures.length === 0 ? 'pass' : adapter === null ? 'unsupported' : 'fail';
  const evidence = {
    $schema: 'core-v2-webgpu-experimental/1',
    generatedAt: new Date().toISOString(),
    codeCommit: CODE_COMMIT,
    classification: 'experimental-non-production',
    productionBaseline: 'PixiJS WebGL2 aggregate mesh',
    protocol: {
      dataset: DATASET,
      sourceRecords: 5_000,
      expectedEntities: EXPECTED_ENTITY_COUNT,
      strategy: 'mesh',
      requestedBackend: 'webgpu',
      browserMode: HEADED ? 'headed' : 'headless',
      chromiumArgs: CHROMIUM_ARGS,
      lifecycle: 'load -> prepare -> asset load/unload -> full bar animation -> text -> interaction -> capture -> resize -> destroy/re-init -> destroy',
      fallbackPolicy: 'fail when the active renderer backend is not exactly webgpu',
    },
    environment: {
      platform: process.platform,
      release: os.release(),
      architecture: process.arch,
      node: process.version,
      browser: browser?.version() ?? null,
      headed: HEADED,
      cpuModel: cpus[0]?.model ?? 'unknown',
      logicalCpuCount: cpus.length,
      adapter,
      windowsNative: 'not-applicable-to-this-experimental-macos-proxy',
    },
    checks,
    errors,
    status,
    failures,
    fatalError,
    limitations: [
      'This result does not replace the WebGL2 production baseline.',
      'The Chromium unsafe-WebGPU flag and host adapter profile are experimental.',
      'Native Windows Chrome/Edge and headed NVDA qualification are separate pending release gates.',
    ],
  };
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

  if (status === 'pass') {
    process.stdout.write(
      `PASS: ${checks.length} Core v2 WebGPU experimental checks; active backend webgpu; errors 0\n`,
    );
  } else if (status === 'unsupported') {
    process.stdout.write(`UNSUPPORTED: Core v2 WebGPU adapter unavailable; evidence saved to ${OUTPUT_PATH}\n`);
  } else {
    process.stderr.write(`FAIL: Core v2 WebGPU experimental smoke; evidence saved to ${OUTPUT_PATH}\n`);
    process.exitCode = 1;
  }
}

function record(condition, name, observation) {
  checks.push({
    name,
    status: condition ? 'pass' : 'fail',
    observation,
  });
  if (!condition) failures.push(name);
}

async function action(activePage, testId) {
  await activePage.waitForFunction(
    () => {
      const state = window.__PATCH_MAP_CORE_V2_LAB__?.state;
      return state && state.status !== 'busy' && state.status !== 'booting';
    },
    undefined,
    { timeout: 30_000 },
  );
  await activePage.getByTestId(testId).click();
  await activePage.waitForFunction(
    (actionName) => {
      const state = window.__PATCH_MAP_CORE_V2_LAB__.state;
      return state.lastAction === actionName && state.status !== 'busy';
    },
    testId,
    { timeout: 30_000 },
  );
  const state = await activePage.evaluate(() => window.__PATCH_MAP_CORE_V2_LAB__.state);
  if (state.error) throw new Error(`${testId}: ${state.error}`);
}

function rendererState(activePage) {
  return activePage.evaluate(() => {
    const runtime = window.__PATCH_MAP_CORE_V2_LAB__.getRuntime();
    if (!runtime) throw new Error('Core v2 WebGPU runtime is missing');
    return runtime.debugSnapshot().renderer;
  });
}

function assetState(activePage) {
  return activePage.evaluate(() => {
    const runtime = window.__PATCH_MAP_CORE_V2_LAB__.getRuntime();
    if (!runtime) throw new Error('Core v2 WebGPU runtime is missing for asset state');
    const renderer = runtime.debugSnapshot().renderer;
    return {
      loadedAssetCount: renderer.loadedAssetCount,
      unresolvedAssetCount: renderer.unresolvedAssetCount,
      frame: renderer.frame,
    };
  });
}

function barState(activePage) {
  return activePage.evaluate(() => {
    const runtime = window.__PATCH_MAP_CORE_V2_LAB__.getRuntime();
    if (!runtime) throw new Error('Core v2 WebGPU runtime is missing for bar state');
    const bars = runtime.snapshot().entities.filter((entity) => entity.kind === 'bar');
    let digest = 0x811c9dc5;
    let minPercent = Number.POSITIVE_INFINITY;
    let maxPercent = Number.NEGATIVE_INFINITY;
    let percentageReferenceCount = 0;
    const distinctRoundedPercents = new Set();
    for (const bar of bars) {
      digest ^= Math.round(bar.bounds.height * 1_000);
      digest = Math.imul(digest, 0x01000193);
      const reference =
        runtime.projection?.barsByEntityId?.[bar.id]?.percentageReferenceHeight;
      if (typeof reference === 'number' && reference > 0) {
        const percent = bar.bounds.height / reference * 100;
        minPercent = Math.min(minPercent, percent);
        maxPercent = Math.max(maxPercent, percent);
        percentageReferenceCount += 1;
        distinctRoundedPercents.add(Math.round(percent));
      }
    }
    return {
      count: bars.length,
      digest: digest >>> 0,
      activeAnimations: runtime.activeAnimations,
      frame: runtime.debugSnapshot().renderer.frame,
      minPercent,
      maxPercent,
      percentageReferenceCount,
      distinctRoundedPercentCount: distinctRoundedPercents.size,
    };
  });
}

function textState(activePage) {
  return activePage.evaluate(() => {
    const runtime = window.__PATCH_MAP_CORE_V2_LAB__.getRuntime();
    if (!runtime) throw new Error('Core v2 WebGPU runtime is missing for text state');
    const texts = runtime.snapshot().entities.filter((entity) => entity.kind === 'text');
    let digest = 0x811c9dc5;
    for (const text of texts) {
      const value = `${text.id}:${String(text.data.text ?? '')}`;
      for (let index = 0; index < value.length; index += 1) {
        digest ^= value.charCodeAt(index);
        digest = Math.imul(digest, 0x01000193);
      }
    }
    return {
      count: texts.length,
      digest: digest >>> 0,
      frame: runtime.debugSnapshot().renderer.frame,
    };
  });
}

function lifecycleState(activePage) {
  return activePage.evaluate(() => ({
    state: window.__PATCH_MAP_CORE_V2_LAB__.state,
    canvasCount: document.querySelectorAll('canvas').length,
  }));
}
