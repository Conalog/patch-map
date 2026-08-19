#!/usr/bin/env node

import path from 'node:path';

import { chromium } from 'playwright';
import { createServer } from 'vite';

import { parsePatchMapBrowserLaunch } from './patch-map-browser-launch.mjs';

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
    configFile: path.join(root, 'vite.patch-map-lab.config.ts'),
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
  const result = Object.freeze({
    revision: 'patch-map-asset-readiness-browser/1',
    status: 'pass',
    browser: browser.version(),
    target: browserLaunch.target,
    builtin,
    direct,
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
    const pending = await analyzeHost(page);
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
    return Object.freeze({ pending, ready, state, cleanup, errors });
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
    const pending = await analyzeHost(page);
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

async function installPage(page, baseUrl) {
  await page.setContent(`<!doctype html>
    <html><body style="margin:0;background:#000">
      <div id="host" style="width:180px;height:160px"></div>
      <script type="module">
        import * as PatchMapModule from '${new URL('src/index.ts', baseUrl).href}';
        globalThis.__PATCH_MAP_MODULE__ = PatchMapModule;
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
