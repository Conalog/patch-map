#!/usr/bin/env node

import path from 'node:path';

import { chromium } from 'playwright';
import { createServer } from 'vite';

import { parsePatchMapBrowserLaunch } from '../../verification/browser-launch.mjs';

const root = process.cwd();
const browserLaunch = parsePatchMapBrowserLaunch(process.argv.slice(2));
const controlledOrigin = 'https://assets.patch-map.test';
const sources = Object.freeze({
  custom: `${controlledOrigin}/custom.svg`,
  unused: `${controlledOrigin}/unused.svg`,
  a: `${controlledOrigin}/a.svg`,
  b: `${controlledOrigin}/b.svg`,
  bRapid: `${controlledOrigin}/b-rapid.svg`,
  c: `${controlledOrigin}/c.svg`,
});
const svgByPath = Object.freeze({
  '/custom.svg': svg('triangle', '#22c55e'),
  '/unused.svg': svg('square', '#f8fafc'),
  '/a.svg': svg('circle', '#ef4444'),
  '/b.svg': svg('square', '#f59e0b'),
  '/b-rapid.svg': svg('circle', '#a855f7'),
  '/c.svg': svg('triangle', '#3b82f6'),
});

let server;
let browser;
let context;

try {
  server = await createServer({
    root,
    configFile: path.join(root, 'vite.lab.config.ts'),
    logLevel: 'error',
    server: { host: '127.0.0.1', cors: true },
  });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  if (!baseUrl) throw new Error('PatchMap asset readiness server has no URL');

  browser = await chromium.launch(browserLaunch.launchOptions);
  context = await browser.newContext({
    viewport: { width: 220, height: 200 },
    deviceScaleFactor: 1,
  });

  const builtin = await verifyDelayedBuiltin(context, baseUrl);
  const direct = await verifyDelayedDirectAndRetarget(context, baseUrl);
  const backgrounds = await verifyInitialBackgrounds(context, baseUrl);
  const failedRetry = await verifyFailedInitialRetry(context, baseUrl);
  const injected = await verifyInjectedCanvasLifecycle(context, baseUrl);
  const failures = await verifyRejectedAndLostCandidates(context, baseUrl);
  const lifecycle = await verifyDelayedDestroyRemountAndSharing(context, baseUrl);
  const result = Object.freeze({
    revision: 'patch-map-asset-readiness-browser/2',
    status: 'pass',
    browser: browser.version(),
    target: browserLaunch.target,
    builtin,
    direct,
    backgrounds,
    failedRetry,
    injected,
    failures,
    lifecycle,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await context?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  await server?.close().catch(() => undefined);
}

async function verifyDelayedBuiltin(browserContext, baseUrl) {
  const page = await browserContext.newPage();
  const errors = collectPageErrors(page);
  try {
    await page.evaluate(() => {
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      const state = {
        started: 0,
        settled: 0,
        released: false,
        release: () => {
          state.released = true;
          release();
        },
      };
      const originalCreateImageBitmap = globalThis.createImageBitmap?.bind(globalThis);
      if (originalCreateImageBitmap !== undefined) {
        Object.defineProperty(globalThis, 'createImageBitmap', {
          configurable: true,
          writable: true,
          value: async (...args) => {
            state.started += 1;
            await gate;
            const bitmap = await originalCreateImageBitmap(...args);
            state.settled += 1;
            return bitmap;
          },
        });
      }
      const imageSource = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
      if (imageSource?.get !== undefined && imageSource.set !== undefined) {
        Object.defineProperty(HTMLImageElement.prototype, 'src', {
          configurable: true,
          enumerable: imageSource.enumerable,
          get: imageSource.get,
          set(value) {
            if (typeof value === 'string' && (/^data:image\//i.test(value) || /^blob:/i.test(value))) {
              if (state.released) {
                imageSource.set.call(this, value);
                return;
              }
              state.started += 1;
              void gate.then(() => {
                imageSource.set.call(this, value);
                state.settled += 1;
              });
              return;
            }
            imageSource.set.call(this, value);
          },
        });
      }
      globalThis.__PATCH_MAP_DECODER_GATE__ = state;
    });
    await installPage(page, baseUrl);
    await page.evaluate(() => {
      const { PatchMap, PatchMapAssetRuntime } = globalThis.__PATCH_MAP_MODULE__;
      const runtime = new PatchMapAssetRuntime();
      globalThis.__PATCH_MAP_RUNTIME__ = runtime;
      globalThis.__PATCH_MAP_MOUNT_PROMISE__ = PatchMap.mount({
        container: '#host',
        instanceId: 'delayed-builtin-initial',
        width: 180,
        height: 160,
        background: '#000000',
        resizeMode: 'manual',
        fit: false,
        assetRuntime: runtime,
        data: scene('device'),
      }).then((map) => {
        globalThis.__PATCH_MAP__ = map;
        return map;
      });
    });
    await page.waitForFunction(() => globalThis.__PATCH_MAP_DECODER_GATE__.started > 0);
    const pendingSurface = await inspectSurface(page);
    const pending = await analyzeHost(page);
    assert(
      pendingSurface.visibleCanvasCount === 0,
      'delayed builtin exposes no visible canvas before its first publication',
      pendingSurface,
    );
    assert(pending.grayCount === 0, 'delayed builtin exposes no gray placeholder pixels', pending);
    assert(pending.nonBlackCount === 0, 'delayed builtin remains unpublished before settlement', pending);
    const mountPending = await page.evaluate(() => globalThis.__PATCH_MAP__ === undefined);
    assert(mountPending, 'builtin mount remains private while its active binding is pending');

    await page.evaluate(() => globalThis.__PATCH_MAP_DECODER_GATE__.release());
    await page.waitForFunction(() => globalThis.__PATCH_MAP__ !== undefined);
    const ready = await analyzeHost(page);
    assert(ready.nonBlackCount > 500, 'first builtin publication contains the resolved glyph', ready);
    assert(ready.nonBlackCount < 6_000, 'first builtin publication is a glyph, not a filled square', ready);
    const state = await page.evaluate(() => ({
      decoder: { ...globalThis.__PATCH_MAP_DECODER_GATE__, release: undefined },
      frameRevision: globalThis.__PATCH_MAP__.debug.snapshot().frameRevision,
      runtime: globalThis.__PATCH_MAP__.assets.status('device').runtime,
    }));
    assert(state.decoder.settled > 0, 'builtin decoder settled before mount returned', state);
    assert(state.frameRevision === 1, 'builtin mount publishes exactly one initial frame', state);
    assert(state.runtime.resource?.state === 'resolved', 'builtin binding is resolved', state);
    const cleanup = await destroyAndProbe(page);
    assertCleanup(cleanup, 'builtin');
    assert(errors.length === 0, 'builtin browser emitted no errors', errors);
    return Object.freeze({ pendingSurface, pending, ready, state, cleanup, errors });
  } finally {
    await page.close();
  }
}

async function verifyDelayedDirectAndRetarget(browserContext, baseUrl) {
  const page = await browserContext.newPage();
  const errors = collectPageErrors(page);
  const gates = new Map();
  const requested = [];
  for (const pathname of Object.keys(svgByPath)) gates.set(pathname, deferredGate());
  gates.get('/a.svg')?.release();
  await page.route(`${controlledOrigin}/**`, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    requested.push(pathname);
    const gate = gates.get(pathname);
    if (gate === undefined) return route.abort('failed');
    await gate.promise;
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      headers: { 'access-control-allow-origin': '*' },
      body: svgByPath[pathname],
    });
  });
  try {
    await installPage(page, baseUrl);
    await page.evaluate(({ initial, unused }) => {
      const { PatchMap, PatchMapAssetRuntime } = globalThis.__PATCH_MAP_MODULE__;
      const runtime = new PatchMapAssetRuntime();
      globalThis.__PATCH_MAP_RUNTIME__ = runtime;
      globalThis.__PATCH_MAP_MOUNT_PROMISE__ = PatchMap.mount({
        container: '#host',
        instanceId: 'delayed-direct-initial',
        width: 180,
        height: 160,
        background: '#000000',
        resizeMode: 'manual',
        fit: false,
        assetPolicy: () => undefined,
        assetRuntime: runtime,
        assets: [
          { alias: 'custom', descriptor: initial },
          { alias: 'unused', descriptor: unused },
        ],
        data: scene('custom'),
      }).then((map) => {
        globalThis.__PATCH_MAP__ = map;
        return map;
      });
    }, { initial: sources.custom, unused: sources.unused });
    await waitForRequest(requested, '/custom.svg');
    const pendingSurface = await inspectSurface(page);
    const pending = await analyzeHost(page);
    assert(
      pendingSurface.visibleCanvasCount === 0,
      'delayed custom source exposes no visible canvas before its first publication',
      pendingSurface,
    );
    assert(pending.grayCount === 0, 'delayed custom initial source exposes no placeholder pixels', pending);
    assert(!requested.includes('/unused.svg'), 'unused registered source is not eagerly acquired', requested);
    gates.get('/custom.svg')?.release();
    await page.waitForFunction(() => globalThis.__PATCH_MAP__ !== undefined);
    const ready = await analyzeHost(page);
    assert(ready.greenCount > 100, 'custom initial source is visible when mount returns', ready);
    assert(ready.grayCount === 0, 'custom initial publication has no generic square', ready);

    const beforeA = await publicationState(page);
    await page.evaluate((source) => {
      globalThis.__PATCH_MAP__.data.replace(scene(source), { fit: false, strict: true });
    }, sources.a);
    await waitForRequest(requested, '/a.svg');
    await waitForResolved(page, beforeA.frameRevision);
    await nextFrames(page, 2);
    const a = await analyzeHost(page);
    assert(a.redCount > 100, 'A is visibly resolved before retarget', a);
    const beforeB = await publicationState(page);

    await page.evaluate((source) => {
      globalThis.__PATCH_MAP__.data.replace(scene(source), { fit: false, strict: true });
    }, sources.b);
    await waitForRequest(requested, '/b.svg');
    await nextFrames(page, 2);
    const pendingB = await analyzeHost(page);
    const duringB = await publicationState(page);
    assert(pendingB.redCount > 100, 'A remains visible while B is pending', pendingB);
    assert(pendingB.amberCount === 0, 'B does not attach before settlement', pendingB);
    assert(pendingB.grayCount === 0, 'A to B transition exposes no generic square', pendingB);
    assert(
      duringB.frameRevision === beforeB.frameRevision + 1,
      'pending B publishes the retained A exactly once',
      { beforeB, duringB },
    );
    gates.get('/b.svg')?.release();
    await waitForResolved(page, duringB.frameRevision);
    const resolvedB = await analyzeHost(page);
    const afterB = await publicationState(page);
    assert(resolvedB.amberCount > 100, 'B replaces A after settlement', resolvedB);
    assert(resolvedB.redCount === 0, 'B replacement removes A in one publication', resolvedB);
    assert(afterB.frameRevision === duringB.frameRevision + 1, 'B swaps in one resolved frame', {
      duringB,
      afterB,
    });

    const beforeRapid = await publicationState(page);
    await page.evaluate(({ b, c }) => {
      globalThis.__PATCH_MAP__.data.replace(scene(b), { fit: false, strict: true });
      globalThis.__PATCH_MAP__.data.replace(scene(c), { fit: false, strict: true });
    }, { b: sources.bRapid, c: sources.c });
    await waitForRequest(requested, '/b-rapid.svg');
    await waitForRequest(requested, '/c.svg');
    await nextFrames(page, 2);
    const pendingC = await analyzeHost(page);
    assert(pendingC.amberCount > 100, 'B remains visible through rapid B to C', pendingC);
    const beforeStaleB = await publicationState(page);
    gates.get('/b-rapid.svg')?.release();
    await page.waitForFunction((pendingCount) => (
      globalThis.__PATCH_MAP__.assets.status().runtime.pendingCount < pendingCount
    ), beforeStaleB.runtime.pendingCount);
    await nextFrames(page, 2);
    const afterStaleB = await publicationState(page);
    assert(
      afterStaleB.frameRevision === beforeStaleB.frameRevision,
      'stale B completion does not amplify publication count',
      { beforeStaleB, afterStaleB },
    );
    gates.get('/c.svg')?.release();
    await waitForResolved(page, beforeRapid.frameRevision);
    const resolvedC = await analyzeHost(page);
    const afterRapid = await publicationState(page);
    assert(resolvedC.blueCount > 100, 'C becomes the authoritative rapid-retarget texture', resolvedC);
    assert(resolvedC.amberCount === 0, 'C atomically removes retained B', resolvedC);
    assert(afterRapid.runtime.pendingCount === 0, 'rapid retarget leaves no pending lease', afterRapid);

    const capture = await page.evaluate(async () => {
      const before = globalThis.__PATCH_MAP__.debug.snapshot().frameRevision;
      const result = await globalThis.__PATCH_MAP__.capture.png();
      return {
        before,
        after: globalThis.__PATCH_MAP__.debug.snapshot().frameRevision,
        mime: result.mime,
        length: result.dataUrl.length,
      };
    });
    assert(capture.mime === 'image/png' && capture.length > 100, 'capture exact barrier remains active', capture);
    const cleanup = await destroyAndProbe(page);
    assertCleanup(cleanup, 'direct');
    assert(!requested.includes('/unused.svg'), 'unused registered source stays unacquired through destroy', requested);
    assert(errors.length === 0, 'direct browser emitted no errors', errors);
    return Object.freeze({
      requested,
      pendingSurface,
      pending,
      ready,
      a,
      pendingB,
      resolvedB,
      pendingC,
      resolvedC,
      publications: {
        beforeB,
        duringB,
        afterB,
        beforeRapid,
        beforeStaleB,
        afterStaleB,
        afterRapid,
      },
      capture,
      cleanup,
      errors,
    });
  } finally {
    await page.close();
  }
}

async function verifyInitialBackgrounds(browserContext, baseUrl) {
  return Object.freeze({
    default: await verifyInitialBackground(browserContext, baseUrl, undefined, [250, 250, 250, 255]),
    custom: await verifyInitialBackground(browserContext, baseUrl, '#123456', [18, 52, 86, 255]),
  });
}

async function verifyInitialBackground(browserContext, baseUrl, background, expectedRgba) {
  const page = await browserContext.newPage();
  const errors = collectPageErrors(page);
  try {
    await installPage(page, baseUrl);
    const result = await page.evaluate(async ({ backgroundValue }) => {
      const { PatchMap } = globalThis.__PATCH_MAP_MODULE__;
      const Application = globalThis.__PATCH_MAP_PIXI_APPLICATION__;
      const host = document.querySelector('#host');
      const originalRender = Application.prototype.render;
      const originalAppend = host.appendChild.bind(host);
      let renderCount = 0;
      const appends = [];
      const readPixel = (canvas) => {
        const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
        if (gl === null) throw new Error('WebGL context unavailable for initial pixel probe');
        const pixel = new Uint8Array(4);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        return Array.from(pixel);
      };
      Application.prototype.render = function (...args) {
        renderCount += 1;
        return originalRender.apply(this, args);
      };
      host.appendChild = function (node) {
        const appended = originalAppend(node);
        if (node instanceof HTMLCanvasElement) {
          appends.push({
            rgba: readPixel(node),
            renderCount,
            connected: node.isConnected,
          });
        }
        return appended;
      };
      let map;
      try {
        map = await PatchMap.mount({
          container: host,
          instanceId: `initial-background-${backgroundValue ?? 'default'}`,
          width: 180,
          height: 160,
          resizeMode: 'manual',
          fit: false,
          ...(backgroundValue === undefined ? {} : { background: backgroundValue }),
          data: [{
            type: 'rect', id: 'rect', show: true,
            attrs: { x: 120, y: 100 }, size: { width: 20, height: 20 }, fill: '#ef4444',
          }],
        });
        const snapshot = map.debug.snapshot();
        return {
          appends,
          renderCount,
          frameRevision: snapshot.frameRevision,
          canvasCount: host.querySelectorAll('canvas').length,
          interaction: snapshot.resources.subscriptions,
          destroy: await map.destroy(),
          canvasCountAfterDestroy: host.querySelectorAll('canvas').length,
        };
      } catch (error) {
        return {
          error: error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error),
          appends,
          renderCount,
          canvasCount: host.querySelectorAll('canvas').length,
        };
      } finally {
        Application.prototype.render = originalRender;
        delete host.appendChild;
        await map?.destroy().catch(() => undefined);
      }
    }, { backgroundValue: background });
    assert(result.error === undefined, 'initial background mount succeeds', result);
    assert(result.appends.length === 1, 'initial background installs one canvas once', result);
    assert(result.appends[0].renderCount === 1, 'canvas installation follows the only initial render', result);
    assert(sameRgba(result.appends[0].rgba, expectedRgba), 'first visible pixel has the configured background', {
      expectedRgba,
      result,
    });
    assert(result.renderCount === 1, 'background mount performs one initial render', result);
    assert(result.frameRevision === 1, 'background mount performs one publication', result);
    assert(result.canvasCount === 1 && result.canvasCountAfterDestroy === 0, 'background canvas lifecycle is singular', result);
    assert(result.destroy === true, 'background mount destroys cleanly', result);
    assert(errors.length === 0, 'background browser emitted no errors', errors);
    return Object.freeze({ ...result, errors });
  } finally {
    await page.close();
  }
}

async function verifyFailedInitialRetry(browserContext, baseUrl) {
  const page = await browserContext.newPage();
  const errors = collectPageErrors(page);
  const retryGate = deferredGate();
  let requestCount = 0;
  const source = `${controlledOrigin}/failed-retry.svg`;
  await page.route(source, async (route) => {
    requestCount += 1;
    if (requestCount === 1) {
      await route.fulfill({ status: 503, contentType: 'text/plain', body: 'retry' });
      return;
    }
    await retryGate.promise;
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      headers: { 'access-control-allow-origin': '*' },
      body: svg('triangle', '#22c55e'),
    });
  });
  try {
    await installPage(page, baseUrl);
    await page.evaluate((imageSource) => {
      const { PatchMap, PatchMapAssetRuntime } = globalThis.__PATCH_MAP_MODULE__;
      const runtime = new PatchMapAssetRuntime();
      globalThis.__PATCH_MAP_RUNTIME__ = runtime;
      globalThis.__PATCH_MAP_MOUNT_PROMISE__ = PatchMap.mount({
        container: '#host',
        instanceId: 'failed-initial-retry',
        width: 180,
        height: 160,
        background: '#123456',
        resizeMode: 'manual',
        fit: false,
        assetPolicy: () => undefined,
        assetRuntime: runtime,
        data: scene(imageSource),
      }).then((map) => {
        globalThis.__PATCH_MAP__ = map;
        return map;
      });
    }, source);
    await page.waitForFunction(() => globalThis.__PATCH_MAP__ !== undefined);
    const failed = await analyzeHost(page);
    const failedState = await publicationState(page);
    assert(failedState.frameRevision === 1, 'failed initial asset still publishes one coherent background frame', failedState);
    assert(failed.greenCount === 0 && failed.nonBlackCount > 20_000, 'failed initial asset exposes background without an image square', failed);

    const beforeRetry = failedState.frameRevision;
    await page.evaluate((imageSource) => {
      globalThis.__PATCH_MAP__.data.replace([], { fit: false, strict: true });
      globalThis.__PATCH_MAP__.data.replace(scene(imageSource), { fit: false, strict: true });
    }, source);
    await waitForValue(() => requestCount >= 2, 'retry request did not start');
    const pendingRetry = await analyzeHost(page);
    assert(pendingRetry.greenCount === 0 && pendingRetry.nonBlackCount > 20_000, 'retry retains the configured background without black pixels', pendingRetry);
    retryGate.release();
    await waitForResolved(page, beforeRetry);
    const resolved = await analyzeHost(page);
    assert(resolved.greenCount > 100, 'retry publishes the resolved image', resolved);
    const cleanup = await destroyAndProbe(page);
    assertCleanup(cleanup, 'failed retry');
    assert(
      errors.length === 1 && errors[0].includes('503 (Service Unavailable)'),
      'failed retry emits only the controlled initial network failure',
      errors,
    );
    return Object.freeze({ requestCount, failed, failedState, pendingRetry, resolved, cleanup, errors });
  } finally {
    await page.close();
  }
}

async function verifyInjectedCanvasLifecycle(browserContext, baseUrl) {
  const page = await browserContext.newPage();
  const errors = collectPageErrors(page);
  try {
    await installPage(page, baseUrl);
    const result = await page.evaluate(async () => {
      const Engine = globalThis.__PATCH_MAP_ENGINE__;
      const originalHost = document.createElement('div');
      originalHost.id = 'caller-canvas-parent';
      const foreignTarget = document.createElement('div');
      foreignTarget.id = 'engine-target';
      originalHost.style.cssText = foreignTarget.style.cssText = 'width:180px;height:160px';
      document.body.append(originalHost, foreignTarget);
      const canvas = document.createElement('canvas');
      canvas.style.setProperty('visibility', 'visible', 'important');
      canvas.style.setProperty('touch-action', 'pan-x', 'important');
      canvas.style.setProperty('border', '3px solid rgb(255, 0, 0)');
      canvas.dataset.patchMapProduct = 'caller-marker';
      const originalInlineStyle = canvas.style.cssText;
      const styleSnapshot = () => Array.from(canvas.style)
        .sort()
        .map((property) => [
          property,
          canvas.style.getPropertyValue(property),
          canvas.style.getPropertyPriority(property),
        ]);
      const originalStyleSnapshot = styleSnapshot();
      originalHost.appendChild(canvas);
      const engine = new Engine();
      await engine.initialize({
        instanceId: 'injected-canvas',
        target: foreignTarget,
        canvas,
        width: 180,
        height: 160,
        pixelRatio: 1,
        antialias: false,
        background: '#123456',
        strategy: 'mesh',
        preference: 'webgl',
        backend: 'webgl2',
        devtools: true,
        powerPreference: 'high-performance',
      });
      const staged = {
        parent: canvas.parentElement?.id ?? null,
        visibility: canvas.style.getPropertyValue('visibility'),
        visibilityPriority: canvas.style.getPropertyPriority('visibility'),
        interaction: engine.interactionOwnershipProbe(),
        loss: engine.rendererLossProbe(),
        publicSurface: engine.rendererPublicSurfaceProbe(),
      };
      engine.loadDataset([{
        type: 'rect', id: 'rect', show: true,
        attrs: { x: 120, y: 100 }, size: { width: 20, height: 20 }, fill: '#ef4444',
      }]);
      const loop = engine.createFrameLoop();
      loop.publishNow();
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      if (gl === null) throw new Error('WebGL context unavailable for injected canvas pixel probe');
      const pixel = new Uint8Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      const published = {
        parent: canvas.parentElement?.id ?? null,
        visibility: canvas.style.getPropertyValue('visibility'),
        visibilityPriority: canvas.style.getPropertyPriority('visibility'),
        touchAction: canvas.style.getPropertyValue('touch-action'),
        border: canvas.style.getPropertyValue('border'),
        marker: canvas.dataset.patchMapProduct,
        rgba: Array.from(pixel),
        interaction: engine.interactionOwnershipProbe(),
        loss: engine.rendererLossProbe(),
        publicSurface: engine.rendererPublicSurfaceProbe(),
        frameRevision: engine.snapshot().frameRevision,
      };
      const destroy = await engine.destroy();
      const destroyed = {
        parent: canvas.parentElement?.id ?? null,
        visibility: canvas.style.getPropertyValue('visibility'),
        visibilityPriority: canvas.style.getPropertyPriority('visibility'),
        touchAction: canvas.style.getPropertyValue('touch-action'),
        touchActionPriority: canvas.style.getPropertyPriority('touch-action'),
        border: canvas.style.getPropertyValue('border'),
        marker: canvas.dataset.patchMapProduct,
        canvasCount: engine.snapshot().resources.canvasCount,
        connected: canvas.isConnected,
        inlineStyle: canvas.style.cssText,
        originalInlineStyle,
        styleSnapshot: styleSnapshot(),
        originalStyleSnapshot,
      };
      canvas.remove();
      originalHost.remove();
      foreignTarget.remove();
      return { staged, published, destroy, destroyed };
    });
    assert(result.staged.parent === 'caller-canvas-parent', 'staging preserves injected canvas parent', result);
    assert(result.staged.visibility === 'hidden' && result.staged.visibilityPriority === 'important', 'staging hides the injected canvas exactly', result);
    assert(result.staged.interaction?.rootBindingCount === 0, 'root interaction is inactive before publication', result);
    assert(result.staged.loss?.listenerCount === 0, 'context-loss listeners are inactive before publication', result);
    assert(result.published.parent === 'caller-canvas-parent', 'publication does not move the injected canvas', result);
    assert(result.published.visibility === 'visible' && result.published.visibilityPriority === 'important', 'publication restores injected visibility', result);
    assert(result.published.interaction?.rootBindingCount === 6 && result.published.interaction?.rootListenerCount === 8, 'publication activates one root interaction owner', result);
    assert(result.published.loss?.listenerCount === 2, 'publication activates one context-loss listener pair', result);
    assert(result.published.publicSurface?.stage.discoverableByDevTools === true, 'publication registers devtools once', result);
    assert(result.published.frameRevision === 1 && sameRgba(result.published.rgba, [18, 52, 86, 255]), 'injected canvas first visible frame is complete', result);
    assert(result.destroy === true && result.destroyed.canvasCount === 0, 'injected engine resource ownership destroys cleanly', result);
    assert(result.destroyed.parent === 'caller-canvas-parent' && result.destroyed.connected === true, 'destroy preserves caller DOM ownership', result);
    assert(result.destroyed.visibility === 'visible' && result.destroyed.visibilityPriority === 'important', 'destroy preserves caller visibility', result);
    assert(result.destroyed.touchAction === 'pan-x' && result.destroyed.touchActionPriority === 'important', 'destroy restores caller touch action', result);
    assert(result.destroyed.marker === 'caller-marker', 'destroy restores caller dataset identity', result);
    assert(
      JSON.stringify(result.destroyed.styleSnapshot) === JSON.stringify(result.destroyed.originalStyleSnapshot),
      'destroy restores every caller inline style declaration',
      result,
    );
    assert(errors.length === 0, 'injected canvas browser emitted no errors', errors);
    return Object.freeze({ ...result, errors });
  } finally {
    await page.close();
  }
}

async function verifyRejectedAndLostCandidates(browserContext, baseUrl) {
  const page = await browserContext.newPage();
  const errors = collectPageErrors(page);
  try {
    await installPage(page, baseUrl);
    const result = await page.evaluate(async () => {
      const { PatchMap, PatchMapAssetRuntime } = globalThis.__PATCH_MAP_MODULE__;
      const Engine = globalThis.__PATCH_MAP_ENGINE__;
      const host = document.querySelector('#host');
      let appendCount = 0;
      const originalAppend = host.appendChild.bind(host);
      host.appendChild = function (node) {
        if (node instanceof HTMLCanvasElement) appendCount += 1;
        return originalAppend(node);
      };
      const runtime = new PatchMapAssetRuntime();
      let rejected = false;
      try {
        await PatchMap.mount({
          container: host,
          instanceId: 'rejected-candidate',
          width: 180,
          height: 160,
          resizeMode: 'manual',
          assetRuntime: runtime,
          data: [{
            type: 'rect', id: 'invalid',
            attrs: { x: Number.NaN, y: 0 }, size: { width: 10, height: 10 },
          }],
        });
      } catch {
        rejected = true;
      }
      const rejection = {
        rejected,
        appendCount,
        canvasCount: host.querySelectorAll('canvas').length,
        runtime: runtime.probe(),
      };

      const engine = new Engine();
      await engine.initialize({
        instanceId: 'lost-candidate', target: host, width: 180, height: 160,
        pixelRatio: 1, antialias: false, background: '#123456', strategy: 'mesh',
        preference: 'webgl', backend: 'webgl2', powerPreference: 'high-performance',
      });
      const forced = engine.forceRendererLoss();
      engine.loadDataset([]);
      const loop = engine.createFrameLoop();
      let publicationRejected = false;
      try {
        loop.publishNow();
      } catch {
        publicationRejected = true;
      }
      const lostBeforeDestroy = {
        forced,
        publicationRejected,
        appendCount,
        canvasCount: host.querySelectorAll('canvas').length,
      };
      const lostDestroy = await engine.destroy();
      const lostAfterDestroy = {
        destroy: lostDestroy,
        canvasCount: host.querySelectorAll('canvas').length,
        resources: engine.snapshot().resources,
      };
      delete host.appendChild;
      return { rejection, lostBeforeDestroy, lostAfterDestroy };
    });
    assert(result.rejection.rejected === true, 'invalid initial data rejects mount', result);
    assert(result.rejection.appendCount === 0 && result.rejection.canvasCount === 0, 'rejected mount never installs a candidate canvas', result);
    assert(result.rejection.runtime.resourceCount === 0 && result.rejection.runtime.leaseCount === 0, 'rejected mount releases shared assets', result);
    assert(result.lostBeforeDestroy.forced === true && result.lostBeforeDestroy.publicationRejected === true, 'lost first renderer rejects publication', result);
    assert(result.lostBeforeDestroy.appendCount === 0 && result.lostBeforeDestroy.canvasCount === 0, 'lost first renderer never exposes a candidate canvas', result);
    assert(result.lostAfterDestroy.destroy === true && result.lostAfterDestroy.canvasCount === 0 && result.lostAfterDestroy.resources.canvasCount === 0, 'lost candidate destroys without residue', result);
    return Object.freeze({ ...result, errors });
  } finally {
    await page.close();
  }
}

async function verifyDelayedDestroyRemountAndSharing(browserContext, baseUrl) {
  const page = await browserContext.newPage();
  const errors = collectPageErrors(page);
  const abortGate = deferredGate();
  const remountGate = deferredGate();
  const requestCounts = new Map();
  await page.route(`${controlledOrigin}/lifecycle-**`, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    requestCounts.set(pathname, (requestCounts.get(pathname) ?? 0) + 1);
    if (pathname === '/lifecycle-abort.svg') await abortGate.promise;
    if (pathname === '/lifecycle-remount.svg') await remountGate.promise;
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      headers: { 'access-control-allow-origin': '*' },
      body: svg('circle', '#22c55e'),
    });
  });
  try {
    await page.evaluate(() => {
      const NativeResizeObserver = globalThis.ResizeObserver;
      const nativeRequestAnimationFrame = globalThis.requestAnimationFrame.bind(globalThis);
      const nativeCancelAnimationFrame = globalThis.cancelAnimationFrame.bind(globalThis);
      const resizeState = {
        active: 0,
        observeCount: 0,
        disconnectCount: 0,
        activeTargets: {},
        events: [],
      };
      const rafState = { pending: new Set(), requestCount: 0, cancelCount: 0 };
      if (NativeResizeObserver !== undefined) {
        globalThis.ResizeObserver = class {
          constructor(callback) {
            this.inner = new NativeResizeObserver(callback);
            this.active = false;
            this.targets = new Set();
          }
          observe(target, options) {
            if (!this.active) {
              this.active = true;
              resizeState.active += 1;
              resizeState.observeCount += 1;
            }
            const targetLabel = `${target.tagName ?? 'unknown'}#${target.id ?? ''}`;
            if (!this.targets.has(targetLabel)) {
              this.targets.add(targetLabel);
              resizeState.activeTargets[targetLabel] =
                (resizeState.activeTargets[targetLabel] ?? 0) + 1;
            }
            resizeState.events.push({ type: 'observe', target: targetLabel });
            this.inner.observe(target, options);
          }
          unobserve(target) {
            this.inner.unobserve(target);
          }
          disconnect() {
            if (this.active) {
              this.active = false;
              resizeState.active -= 1;
              resizeState.disconnectCount += 1;
              for (const targetLabel of this.targets) {
                resizeState.activeTargets[targetLabel] -= 1;
                if (resizeState.activeTargets[targetLabel] === 0) {
                  delete resizeState.activeTargets[targetLabel];
                }
              }
              resizeState.events.push({ type: 'disconnect', targets: [...this.targets] });
              this.targets.clear();
            }
            this.inner.disconnect();
          }
        };
      }
      globalThis.requestAnimationFrame = (callback) => {
        let id = 0;
        id = nativeRequestAnimationFrame((time) => {
          rafState.pending.delete(id);
          callback(time);
        });
        rafState.pending.add(id);
        rafState.requestCount += 1;
        return id;
      };
      globalThis.cancelAnimationFrame = (id) => {
        if (rafState.pending.delete(id)) rafState.cancelCount += 1;
        nativeCancelAnimationFrame(id);
      };
      globalThis.__PATCH_MAP_LIFECYCLE_COUNTERS__ = { resizeState, rafState };
    });
    await installPage(page, baseUrl);
    const abortSource = `${controlledOrigin}/lifecycle-abort.svg`;
    await page.evaluate((source) => {
      const Engine = globalThis.__PATCH_MAP_ENGINE__;
      const { PatchMapAssetRuntime } = globalThis.__PATCH_MAP_MODULE__;
      const runtime = new PatchMapAssetRuntime();
      const engine = new Engine({ assetRuntime: runtime, assetPolicy: () => undefined });
      globalThis.__PATCH_MAP_ABORT_RUNTIME__ = runtime;
      globalThis.__PATCH_MAP_ABORT_ENGINE__ = engine;
      globalThis.__PATCH_MAP_ABORT_STARTED__ = (async () => {
        await engine.initialize({
          instanceId: 'delayed-destroy', target: document.querySelector('#host'),
          width: 180, height: 160, pixelRatio: 1, antialias: false,
          background: '#123456', strategy: 'mesh', preference: 'webgl',
          backend: 'webgl2', powerPreference: 'high-performance',
        });
        engine.loadDataset(scene(source));
        globalThis.__PATCH_MAP_ABORT_SETTLE__ = engine.settleSceneImages()
          .then(() => 'resolved', () => 'rejected');
      })();
    }, abortSource);
    await waitForValue(
      () => (requestCounts.get('/lifecycle-abort.svg') ?? 0) >= 1,
      'delayed destroy request did not start',
    );
    const abortPending = await inspectSurface(page);
    await page.evaluate(async () => {
      await globalThis.__PATCH_MAP_ABORT_STARTED__;
      globalThis.__PATCH_MAP_ABORT_DESTROY__ = globalThis.__PATCH_MAP_ABORT_ENGINE__.destroy();
    });
    abortGate.release();
    const abort = await page.evaluate(async () => ({
      destroy: await globalThis.__PATCH_MAP_ABORT_DESTROY__,
      settle: await globalThis.__PATCH_MAP_ABORT_SETTLE__,
      canvasCount: document.querySelectorAll('#host canvas').length,
      runtime: globalThis.__PATCH_MAP_ABORT_RUNTIME__.probe(),
    }));
    assert(abortPending.visibleCanvasCount === 0, 'destroy-during-settlement keeps the candidate private', abortPending);
    assert(abort.destroy === true && abort.canvasCount === 0, 'destroy-during-settlement leaves no canvas', abort);
    assert(abort.runtime.resourceCount === 0 && abort.runtime.pendingCount === 0 && abort.runtime.leaseCount === 0, 'destroy-during-settlement releases all assets', abort);

    const remountSource = `${controlledOrigin}/lifecycle-remount.svg`;
    await page.evaluate((source) => {
      const { PatchMap, PatchMapAssetRuntime } = globalThis.__PATCH_MAP_MODULE__;
      const runtime = new PatchMapAssetRuntime();
      globalThis.__PATCH_MAP_SHARED_RUNTIME__ = runtime;
      globalThis.__PATCH_MAP_REMOUNT_ONE__ = PatchMap.mount({
        container: '#host', instanceId: 'rapid-remount-one', width: 180, height: 160,
        resizeMode: 'container', fit: false, assetRuntime: runtime, data: [],
      });
      globalThis.__PATCH_MAP_REMOUNT_SOURCE__ = source;
    }, remountSource);
    const remountOne = await page.evaluate(async () => {
      const map = await globalThis.__PATCH_MAP_REMOUNT_ONE__;
      const mounted = {
        canvasCount: document.querySelectorAll('#host canvas').length,
        resizeActive: globalThis.__PATCH_MAP_LIFECYCLE_COUNTERS__.resizeState.active,
        resizeTargets: { ...globalThis.__PATCH_MAP_LIFECYCLE_COUNTERS__.resizeState.activeTargets },
        resizeEvents: [...globalThis.__PATCH_MAP_LIFECYCLE_COUNTERS__.resizeState.events],
        frameRevision: map.debug.snapshot().frameRevision,
      };
      const destroy = await map.destroy();
      return {
        mounted,
        destroy,
        canvasCount: document.querySelectorAll('#host canvas').length,
        resizeActive: globalThis.__PATCH_MAP_LIFECYCLE_COUNTERS__.resizeState.active,
      };
    });
    assert(
      remountOne.mounted.canvasCount === 1 &&
        remountOne.mounted.resizeActive === 2 &&
        remountOne.mounted.resizeTargets['CANVAS#'] === 1 &&
        remountOne.mounted.resizeTargets['DIV#host'] === 1,
      'first rapid mount owns one canvas observer and one host observer',
      remountOne,
    );
    assert(remountOne.destroy === true && remountOne.canvasCount === 0 && remountOne.resizeActive === 0, 'first rapid mount tears down before remount', remountOne);
    await page.evaluate(() => {
      const { PatchMap } = globalThis.__PATCH_MAP_MODULE__;
      globalThis.__PATCH_MAP_REMOUNT_TWO__ = PatchMap.mount({
        container: '#host', instanceId: 'rapid-remount-two', width: 180, height: 160,
        resizeMode: 'container', fit: false, assetPolicy: () => undefined,
        assetRuntime: globalThis.__PATCH_MAP_SHARED_RUNTIME__,
        data: scene(globalThis.__PATCH_MAP_REMOUNT_SOURCE__),
      });
    });
    await waitForValue(
      () => (requestCounts.get('/lifecycle-remount.svg') ?? 0) >= 1,
      'rapid remount request did not start',
    );
    const remountPending = await page.evaluate(() => ({
      canvasCount: document.querySelectorAll('#host canvas').length,
      resizeActive: globalThis.__PATCH_MAP_LIFECYCLE_COUNTERS__.resizeState.active,
      resizeTargets: { ...globalThis.__PATCH_MAP_LIFECYCLE_COUNTERS__.resizeState.activeTargets },
    }));
    assert(
      remountPending.canvasCount === 0 &&
        remountPending.resizeActive === 1 &&
        remountPending.resizeTargets['CANVAS#'] === 1 &&
        remountPending.resizeTargets['DIV#host'] === undefined,
      'second rapid mount keeps only Pixi canvas observation while detached',
      remountPending,
    );
    remountGate.release();
    const remountTwo = await page.evaluate(async () => {
      const map = await globalThis.__PATCH_MAP_REMOUNT_TWO__;
      const mounted = {
        canvasCount: document.querySelectorAll('#host canvas').length,
        resizeActive: globalThis.__PATCH_MAP_LIFECYCLE_COUNTERS__.resizeState.active,
        resizeTargets: { ...globalThis.__PATCH_MAP_LIFECYCLE_COUNTERS__.resizeState.activeTargets },
        frameRevision: map.debug.snapshot().frameRevision,
      };
      const destroy = await map.destroy();
      return {
        mounted,
        destroy,
        canvasCount: document.querySelectorAll('#host canvas').length,
        resizeActive: globalThis.__PATCH_MAP_LIFECYCLE_COUNTERS__.resizeState.active,
      };
    });
    assert(
      remountTwo.mounted.canvasCount === 1 &&
        remountTwo.mounted.resizeActive === 2 &&
        remountTwo.mounted.resizeTargets['CANVAS#'] === 1 &&
        remountTwo.mounted.resizeTargets['DIV#host'] === 1 &&
        remountTwo.mounted.frameRevision === 1,
      'second rapid mount publishes one complete surface with singular observers per owner',
      remountTwo,
    );
    assert(remountTwo.destroy === true && remountTwo.canvasCount === 0 && remountTwo.resizeActive === 0, 'second rapid mount tears down completely', remountTwo);

    const sharedSource = `${controlledOrigin}/lifecycle-shared.svg`;
    const shared = await page.evaluate(async (source) => {
      const { PatchMap } = globalThis.__PATCH_MAP_MODULE__;
      const runtime = globalThis.__PATCH_MAP_SHARED_RUNTIME__;
      const hostA = document.createElement('div');
      const hostB = document.createElement('div');
      hostA.style.cssText = hostB.style.cssText = 'width:180px;height:160px';
      document.body.append(hostA, hostB);
      const options = (container, instanceId) => ({
        container, instanceId, width: 180, height: 160, resizeMode: 'manual', fit: false,
        assetPolicy: () => undefined, assetRuntime: runtime, data: scene(source),
      });
      const [mapA, mapB] = await Promise.all([
        PatchMap.mount(options(hostA, 'shared-a')),
        PatchMap.mount(options(hostB, 'shared-b')),
      ]);
      const mounted = {
        canvasCount: document.querySelectorAll('canvas').length,
        runtime: runtime.probe(),
        revisions: [mapA.debug.snapshot().frameRevision, mapB.debug.snapshot().frameRevision],
      };
      const destroyA = await mapA.destroy();
      const afterA = { canvasCount: document.querySelectorAll('canvas').length, runtime: runtime.probe() };
      const destroyB = await mapB.destroy();
      const afterB = { canvasCount: document.querySelectorAll('canvas').length, runtime: runtime.probe() };
      hostA.remove();
      hostB.remove();
      return { mounted, destroyA, afterA, destroyB, afterB };
    }, sharedSource);
    assert(
      shared.mounted.canvasCount === 2 &&
        shared.mounted.runtime.resourceCount === 6 &&
        shared.mounted.runtime.leaseCount === 12 &&
        requestCounts.get('/lifecycle-shared.svg') === 1,
      'shared mounts deduplicate five fonts and one image across two sessions',
      shared,
    );
    assert(shared.mounted.revisions.every((revision) => revision === 1), 'shared mounts each publish exactly once', shared);
    assert(shared.destroyA === true && shared.afterA.canvasCount === 1 && shared.afterA.runtime.resourceCount === 6 && shared.afterA.runtime.leaseCount === 6, 'first shared destroy preserves one complete remaining session', shared);
    assert(shared.destroyB === true && shared.afterB.canvasCount === 0 && shared.afterB.runtime.resourceCount === 0 && shared.afterB.runtime.leaseCount === 0, 'last shared destroy releases all ownership', shared);
    const counters = await page.evaluate(() => ({
      resize: { ...globalThis.__PATCH_MAP_LIFECYCLE_COUNTERS__.resizeState },
      raf: {
        pending: globalThis.__PATCH_MAP_LIFECYCLE_COUNTERS__.rafState.pending.size,
        requestCount: globalThis.__PATCH_MAP_LIFECYCLE_COUNTERS__.rafState.requestCount,
        cancelCount: globalThis.__PATCH_MAP_LIFECYCLE_COUNTERS__.rafState.cancelCount,
      },
      runtime: globalThis.__PATCH_MAP_SHARED_RUNTIME__.probe(),
    }));
    assert(
      counters.resize.active === 0 && Object.keys(counters.resize.activeTargets).length === 0,
      'remount observers have no active target after destroy',
      counters,
    );
    assert(counters.raf.pending === 0, 'destroyed lifecycle leaves no requested animation frame', counters);
    assert(counters.runtime.resourceCount === 0 && counters.runtime.leaseCount === 0, 'remount and sharing leave the runtime empty', counters);
    assert(errors.length === 0, 'lifecycle browser emitted no errors', errors);
    return Object.freeze({
      requestCounts: Object.fromEntries(requestCounts),
      abortPending,
      abort,
      remountOne,
      remountPending,
      remountTwo,
      shared,
      counters,
      errors,
    });
  } finally {
    await page.close();
  }
}

function sameRgba(actual, expected, tolerance = 2) {
  return Array.isArray(actual) && actual.length === 4 &&
    actual.every((value, index) => Math.abs(value - expected[index]) <= tolerance);
}

async function waitForValue(predicate, message) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > 10_000) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function inspectSurface(page) {
  return page.evaluate(() => {
    const canvases = [...document.querySelectorAll('#host canvas')];
    return Object.freeze({
      canvasCount: canvases.length,
      visibleCanvasCount: canvases.filter((canvas) => {
        const style = getComputedStyle(canvas);
        return style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.visibility !== 'collapse' &&
          Number.parseFloat(style.opacity) > 0;
      }).length,
    });
  });
}

async function installPage(page, baseUrl) {
  await page.setContent(`<!doctype html>
    <html><body style="margin:0;background:#000">
      <div id="host" style="width:180px;height:160px"></div>
      <script type="module">
        import {
          PixiApplication,
          PatchMapEngine,
          PatchMapModule,
        } from '${new URL('scripts/verification/patch-map-asset-readiness-browser-entry.ts', baseUrl).href}';
        globalThis.__PATCH_MAP_PIXI_APPLICATION__ = PixiApplication;
        globalThis.__PATCH_MAP_MODULE__ = PatchMapModule;
        globalThis.__PATCH_MAP_ENGINE__ = PatchMapEngine;
        globalThis.scene = (source) => [{
          type: 'image', id: 'image', source, show: true,
          attrs: { x: 40, y: 30 }, size: { width: 100, height: 100 },
        }];
      </script>
    </body></html>`);
  try {
    await page.waitForFunction(
      () => globalThis.__PATCH_MAP_MODULE__?.PatchMap !== undefined,
      undefined,
      { timeout: 30_000 },
    );
  } catch (error) {
    const state = await page.evaluate(() => ({
      body: document.body.textContent,
      module: globalThis.__PATCH_MAP_MODULE__ ?? null,
      gate: globalThis.__PATCH_MAP_DECODER_GATE__ === undefined
        ? null
        : {
            started: globalThis.__PATCH_MAP_DECODER_GATE__.started,
            settled: globalThis.__PATCH_MAP_DECODER_GATE__.settled,
          },
    }));
    throw new Error(`asset readiness module did not load: ${JSON.stringify(state)}`, {
      cause: error,
    });
  }
}

async function analyzeHost(page) {
  const canvas = page.locator('#host canvas');
  if (await canvas.count() === 0) {
    return Object.freeze(emptyPixels());
  }
  const png = await canvas.screenshot({ type: 'png' });
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const result = {
      nonBlackCount: 0,
      grayCount: 0,
      redCount: 0,
      greenCount: 0,
      blueCount: 0,
      amberCount: 0,
    };
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const red = pixels[offset];
      const green = pixels[offset + 1];
      const blue = pixels[offset + 2];
      const alpha = pixels[offset + 3];
      if (alpha < 100) continue;
      if (red > 12 || green > 12 || blue > 12) result.nonBlackCount += 1;
      if (red > 150 && green > 150 && blue > 150 && Math.max(red, green, blue) - Math.min(red, green, blue) < 40) {
        result.grayCount += 1;
      }
      if (red > 140 && green < red * 0.5 && blue < red * 0.5) result.redCount += 1;
      if (green > 90 && green > red * 1.25 && green > blue * 1.25) result.greenCount += 1;
      if (blue > 120 && blue > red * 1.35 && blue > green * 1.2) result.blueCount += 1;
      if (red > 150 && green > 70 && green < red * 0.85 && blue < 80) result.amberCount += 1;
    }
    return Object.freeze(result);
  }, png.toString('base64'));
}

async function publicationState(page) {
  return page.evaluate(() => {
    const snapshot = globalThis.__PATCH_MAP__.debug.snapshot();
    return {
      frameRevision: snapshot.frameRevision,
      runtime: globalThis.__PATCH_MAP__.assets.status().runtime,
    };
  });
}

async function waitForResolved(page, afterFrame) {
  await page.waitForFunction((frame) => {
    const map = globalThis.__PATCH_MAP__;
    return map.assets.status().runtime.pendingCount === 0 &&
      map.debug.snapshot().frameRevision > frame;
  }, afterFrame);
}

async function destroyAndProbe(page) {
  return page.evaluate(async () => {
    const map = globalThis.__PATCH_MAP__;
    const runtime = globalThis.__PATCH_MAP_RUNTIME__;
    const destroyed = await map.destroy();
    globalThis.__PATCH_MAP__ = undefined;
    return {
      destroyed,
      canvasCount: document.querySelectorAll('#host canvas').length,
      runtime: runtime?.probe() ?? map.assets.status().runtime,
    };
  });
}

function assertCleanup(cleanup, label) {
  assert(cleanup.destroyed === true, `${label} destroy succeeds`, cleanup);
  assert(cleanup.canvasCount === 0, `${label} destroy removes its canvas`, cleanup);
  assert(cleanup.runtime.resourceCount === 0, `${label} destroy releases resources`, cleanup);
  assert(cleanup.runtime.pendingCount === 0, `${label} destroy releases pending users`, cleanup);
  assert(cleanup.runtime.leaseCount === 0, `${label} destroy releases leases`, cleanup);
}

function collectPageErrors(page) {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`page: ${error.stack ?? error.message}`));
  page.on('requestfailed', (request) => {
    errors.push(`network: ${request.url()} ${request.failure()?.errorText ?? ''}`);
  });
  return errors;
}

function deferredGate() {
  let resolve;
  let released = false;
  const promise = new Promise((next) => { resolve = next; });
  return Object.freeze({
    promise,
    release: () => {
      if (released) return;
      released = true;
      resolve();
    },
  });
}

async function waitForRequest(requested, pathname) {
  const started = Date.now();
  while (!requested.includes(pathname)) {
    if (Date.now() - started > 10_000) throw new Error(`request did not start: ${pathname}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function nextFrames(page, count) {
  await page.evaluate(async (frameCount) => {
    for (let index = 0; index < frameCount; index += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }, count);
}

function svg(shape, fill) {
  const body = shape === 'circle'
    ? '<circle cx="36" cy="36" r="25"/>'
    : shape === 'square'
      ? '<rect x="12" y="12" width="48" height="48" rx="5"/>'
      : '<path d="M36 8 L66 62 L6 62 Z"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72" fill="${fill}">${body}</svg>`;
}

function emptyPixels() {
  return {
    nonBlackCount: 0,
    grayCount: 0,
    redCount: 0,
    greenCount: 0,
    blueCount: 0,
    amberCount: 0,
  };
}

function assert(condition, description, details = null) {
  if (!condition) throw new Error(`${description}: ${JSON.stringify(details)}`);
}
