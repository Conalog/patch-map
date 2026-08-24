#!/usr/bin/env node

import path from 'node:path';

import { chromium } from 'playwright';
import { createServer } from 'vite';

import { parsePatchMapBrowserLaunch } from './patch-map-browser-launch.mjs';

const root = process.cwd();
const browserLaunch = parsePatchMapBrowserLaunch(process.argv.slice(2));
let server;
let browser;
let page;

try {
  server = await createServer({
    root,
    configFile: path.join(root, 'vite.patch-map-lab.config.ts'),
    logLevel: 'error',
    server: { cors: true },
  });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  if (!baseUrl) throw new Error('PatchMap keyed grid presentation server has no URL');

  browser = await chromium.launch(browserLaunch.launchOptions);
  page = await browser.newPage({ viewport: { width: 240, height: 120 } });
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`page: ${error.stack ?? error.message}`));
  page.on('requestfailed', (request) => {
    errors.push(`network: ${request.url()} ${request.failure()?.errorText ?? ''}`);
  });

  await page.setContent(`<!doctype html>
    <html><body style="margin:0;background:#000">
      <div id="map" style="width:240px;height:120px"></div>
      <script type="module">
        import { PatchMap } from '${new URL('src/index.ts', baseUrl).href}';
        window.__PATCH_MAP_GRID_KEYED__ = { phase: 'mounting' };

        const assetCanvas = document.createElement('canvas');
        assetCanvas.width = 16;
        assetCanvas.height = 16;
        const assetContext = assetCanvas.getContext('2d');
        assetContext.fillStyle = '#d946ef';
        assetContext.fillRect(0, 0, 16, 16);
        const iconSurface = assetCanvas.toDataURL('image/png');
        const data = [{
          type: 'grid',
          id: 'focus-grid',
          attrs: { x: 10, y: 10 },
          cells: [[1, 1, 1, 1]],
          gap: 10,
          item: {
            size: { width: 100, height: 100 },
            components: [{
              type: 'background',
              id: 'surface',
              source: { type: 'rect', fill: '#334155' },
              attrs: { zIndex: 0 },
            }, {
              type: 'bar',
              id: 'load',
              source: { type: 'rect', fill: '#f97316' },
              size: { width: 64, height: 14 },
              placement: 'bottom',
              margin: 8,
              attrs: { zIndex: 10 },
            }, {
              type: 'icon',
              id: 'status',
              source: 'status-icon',
              size: { width: 16, height: 16 },
              placement: 'left-top',
              margin: 8,
              attrs: { zIndex: 15 },
            }, {
              type: 'text',
              id: 'value',
              text: '0%',
              placement: 'center',
              style: { fontFamily: 'Arial', fontSize: 24, fontWeight: 700, fill: '#ffffff' },
              show: false,
              attrs: { zIndex: 20 },
            }],
          },
        }, {
          type: 'item',
          id: 'authored-a',
          attrs: { x: 10, y: 140 },
          size: { width: 100, height: 100 },
          components: [{
            type: 'background',
            id: 'surface',
            source: { type: 'rect', fill: '#dc2626' },
          }],
        }, {
          type: 'item',
          id: 'authored-b',
          attrs: { x: 120, y: 140 },
          size: { width: 100, height: 100 },
          components: [{
            type: 'background',
            id: 'surface',
            source: { type: 'rect', fill: '#2563eb' },
          }],
        }];
        const beforeInput = JSON.stringify(data);
        let map = await PatchMap.mount({
          container: '#map',
          width: 240,
          height: 120,
          pixelRatio: 1,
          antialias: false,
          backend: 'webgl',
          resizeMode: 'manual',
          fit: false,
          background: '#000000',
          assets: [{ alias: 'status-icon', descriptor: iconSurface }],
          assetPolicy: () => undefined,
          data,
        });

        const colorMask = (pixels, width, color, region = null) => {
          const points = [];
          for (let offset = 0; offset < pixels.length; offset += 4) {
            const pixel = offset / 4;
            const x = pixel % width;
            const y = Math.floor(pixel / width);
            if (region !== null &&
              (x < region[0] || x >= region[2] || y < region[1] || y >= region[3])) continue;
            const red = pixels[offset];
            const green = pixels[offset + 1];
            const blue = pixels[offset + 2];
            const matches = color === 'red'
              ? red > 160 && red > green * 1.7 && red > blue * 1.7
              : color === 'blue'
                ? blue > 150 && blue > red * 1.5 && blue > green * 1.25
                : color === 'green'
                  ? green > 150 && green > red * 1.5 && green > blue * 1.15
                  : color === 'yellow'
                    ? red > 180 && green > 150 && blue < 100
                    : color === 'magenta'
                      ? red > 170 && blue > 170 && green < 120
                      : red > 180 && green > 70 && green < 155 && blue < 70;
            if (matches) {
              points.push([x, y]);
            }
          }
          if (points.length === 0) return { pixelCount: 0, bounds: null };
          const xs = points.map(([x]) => x);
          const ys = points.map(([, y]) => y);
          return {
            pixelCount: points.length,
            bounds: {
              minX: Math.min(...xs),
              maxX: Math.max(...xs),
              minY: Math.min(...ys),
              maxY: Math.max(...ys),
            },
          };
        };
        const analyzeDataUrl = async (dataUrl, scaleOverride = null) => {
          const image = new Image();
          image.src = dataUrl;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          context.drawImage(image, 0, 0);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          const colors = ['red', 'blue', 'green', 'yellow', 'magenta', 'orange'];
          const regionMasks = (region) => Object.fromEntries(colors
            .map((color) => [color, colorMask(pixels, canvas.width, color, region)]));
          const captureScale = scaleOverride ?? (canvas.width < 300 ? 0.5 : 1);
          const scaled = (region) => region.map((value) => value * captureScale);
          return {
            width: canvas.width,
            height: canvas.height,
            regions: {
              first: regionMasks(scaled([10, 10, 110, 110])),
              second: regionMasks(scaled([120, 10, 220, 110])),
              firstBackground: regionMasks(scaled([70, 34, 105, 45])),
              secondBackground: regionMasks(scaled([180, 34, 215, 45])),
              third: regionMasks(scaled([230, 10, 330, 110])),
              fourth: regionMasks(scaled([340, 10, 440, 110])),
              thirdBackground: regionMasks(scaled([290, 34, 325, 45])),
              fourthBackground: regionMasks(scaled([400, 34, 435, 45])),
              authoredFirstBackground: regionMasks(scaled([70, 164, 105, 175])),
              authoredSecondBackground: regionMasks(scaled([180, 164, 215, 175])),
            },
            ...Object.fromEntries(colors
              .map((color) => [color, colorMask(pixels, canvas.width, color)])),
          };
        };
        const capture = async () => {
          const managed = await map.capture.png();
          return {
            managedPrefix: managed.dataUrl.slice(0, 22),
            ...await analyzeDataUrl(managed.dataUrl),
          };
        };
        const overlay = () => map.updateBatch({
          targets: ['focus-grid.0.0', 'focus-grid.0.1', 'focus-grid.0.2', 'focus-grid.0.3'],
          background: {
            componentId: 'surface',
            changes: { source: [
              { type: 'rect', fill: '#dc2626' },
              { type: 'rect', fill: '#2563eb' },
              { type: 'rect', fill: '#dc2626' },
              { type: 'rect', fill: '#2563eb' },
            ] },
          },
          text: {
            componentId: 'value',
            text: ['83%', '41%', '83%', '41%'],
            style: [
              { fontFamily: 'Arial', fontSize: 24, fontWeight: 700, fill: '#22c55e' },
              { fontFamily: 'Arial', fontSize: 24, fontWeight: 700, fill: '#fde047' },
              { fontFamily: 'Arial', fontSize: 24, fontWeight: 700, fill: '#22c55e' },
              { fontFamily: 'Arial', fontSize: 24, fontWeight: 700, fill: '#fde047' },
            ],
            changes: {
              show: [true, true, true, true],
              tint: ['#22c55e', '#fde047', '#22c55e', '#fde047'],
            },
          },
        });

        const snapshotBefore = JSON.stringify(map.data.snapshot());
        const historyBefore = JSON.stringify(map.history.state);
        const hashBefore = map.debug.snapshot().semanticHash;
        const overlayResult = overlay();
        const overlaid = await capture();
        const scope = map.targets.query({ type: 'grid-cell', scope: 'instances' });
        const first = map.presentation.set('test:focus', {
          scope,
          targets: ['focus-grid.0.0'],
          unmatched: { alphaMultiplier: 0.32 },
        });
        const focusedFirst = await capture();
        window.__PATCH_MAP_GRID_KEYED__.phase = 'hit-ready';
        await new Promise((resolve) => { window.__PATCH_MAP_GRID_KEYED__.resumeHit = resolve; });
        const hitSelectionIds = [...map.selection.ids];
        const second = map.presentation.set('test:focus', {
          scope,
          targets: ['focus-grid.0.1'],
          unmatched: { alphaMultiplier: 0.32 },
        });
        const focusedSecond = await capture();
        const cleared = map.presentation.clear('test:focus');
        const clearedPixels = await capture();

        const lazy = map.presentation.set('test:focus', {
          scope,
          targets: ['focus-grid.0.2'],
          unmatched: { alphaMultiplier: 0.32 },
        });
        map.viewport.panBy([-220, 0]);
        window.__PATCH_MAP_GRID_KEYED__.phase = 'lazy-ready';
        const lazySurfaceDataUrl = await new Promise((resolve) => {
          window.__PATCH_MAP_GRID_KEYED__.resumeLazy = resolve;
        });
        const lazySurfacePixels = await analyzeDataUrl(lazySurfaceDataUrl, 1);
        const lazyPixels = await capture();
        map.presentation.clear('test:focus');
        map.viewport.panBy([220, 0]);

        const authoredScope = map.targets.query({ type: 'item', scope: 'authored' });
        const authored = map.presentation.set('test:authored', {
          scope: authoredScope,
          targets: ['authored-a'],
          unmatched: { alphaMultiplier: 0.32 },
        });
        map.viewport.panBy([0, -130]);
        const authoredPixels = await capture();
        map.presentation.clear('test:authored');
        map.viewport.panBy([0, 130]);

        const immutable = {
          input: JSON.stringify(data) === beforeInput,
          snapshot: JSON.stringify(map.data.snapshot()) === snapshotBefore,
          history: JSON.stringify(map.history.state) === historyBefore,
          semanticHash: map.debug.snapshot().semanticHash === hashBefore,
        };
        map.presentation.set('replace:old', {
          scope,
          targets: ['focus-grid.0.0'],
          unmatched: { alphaMultiplier: 0.32 },
        });
        const replace = map.data.replace(data, { strict: true });
        const layerCountAfterReplace = map.debug.snapshot().presentation.layerCount;
        const replayScope = map.targets.query({ type: 'grid-cell', scope: 'instances' });
        const replayOverlay = overlay();
        const replay = map.presentation.set('test:focus', {
          scope: replayScope,
          targets: ['focus-grid.0.0'],
          unmatched: { alphaMultiplier: 0.32 },
        });
        const replayPixels = await capture();
        const destroy = await map.destroy();
        map = await PatchMap.mount({
          container: '#map',
          width: 240,
          height: 120,
          pixelRatio: 1,
          antialias: false,
          backend: 'webgl',
          resizeMode: 'manual',
          fit: false,
          background: '#000000',
          assets: [{ alias: 'status-icon', descriptor: iconSurface }],
          assetPolicy: () => undefined,
          data,
        });
        const remountScope = map.targets.query({ type: 'grid-cell', scope: 'instances' });
        const remount = map.presentation.set('test:focus', {
          scope: remountScope,
          targets: ['focus-grid.0.0'],
          unmatched: { alphaMultiplier: 0.32 },
        });
        const remountDestroy = await map.destroy();
        window.__PATCH_MAP_GRID_KEYED__ = {
          phase: 'complete',
          overlayResult,
          overlaid,
          first,
          focusedFirst,
          hitSelectionIds,
          second,
          focusedSecond,
          cleared,
          clearedPixels,
          lazy,
          lazySurfacePixels,
          lazyPixels,
          authored,
          authoredPixels,
          immutable,
          replace,
          layerCountAfterReplace,
          replayOverlay,
          replay,
          replayPixels,
          destroy,
          remount,
          remountDestroy,
          canvasCountAfterDestroy: document.querySelectorAll('#map canvas').length,
        };
      </script>
    </body></html>`);

  try {
    await page.waitForFunction(
      () => window.__PATCH_MAP_GRID_KEYED__?.phase === 'hit-ready',
      undefined,
      { timeout: 60_000 },
    );
  } catch (error) {
    const state = await page.evaluate(() => ({
      result: window.__PATCH_MAP_GRID_KEYED__ ?? null,
      body: document.body.innerText,
    })).catch(() => null);
    throw new Error(`keyed grid presentation page did not reach hit phase: ${JSON.stringify({
      cause: error instanceof Error ? error.message : String(error),
      errors,
      state,
    })}`);
  }
  await page.mouse.click(60, 60);
  await page.waitForTimeout(50);
  await page.evaluate(() => window.__PATCH_MAP_GRID_KEYED__.resumeHit());
  await page.waitForFunction(
    () => window.__PATCH_MAP_GRID_KEYED__?.phase === 'lazy-ready',
    undefined,
    { timeout: 60_000 },
  );
  const lazySurface = await page.locator('#map canvas').screenshot();
  await page.evaluate((dataUrl) => {
    window.__PATCH_MAP_GRID_KEYED__.resumeLazy(dataUrl);
  }, `data:image/png;base64,${lazySurface.toString('base64')}`);
  try {
    await page.waitForFunction(
      () => window.__PATCH_MAP_GRID_KEYED__?.phase === 'complete',
      undefined,
      { timeout: 60_000 },
    );
  } catch (error) {
    const state = await page.evaluate(() => ({
      result: window.__PATCH_MAP_GRID_KEYED__ ?? null,
      body: document.body.innerText,
    })).catch(() => null);
    throw new Error(`keyed grid presentation page did not complete: ${JSON.stringify({
      cause: error instanceof Error ? error.message : String(error),
      errors,
      state,
    })}`);
  }
  const result = await page.evaluate(() => window.__PATCH_MAP_GRID_KEYED__);
  assert(result.overlayResult.status === 'committed' && result.overlayResult.appliedCount === 8,
    'concrete overlay publishes four backgrounds and texts', result.overlayResult);
  assertFullPair(result.overlaid, 'clear baseline');
  assertFirstOnly(result.focusedFirst, 'first grid-cell focus');
  assert(result.first.scopeCount === 4 && result.first.matchedCount === 1 &&
    result.first.unmatchedCount === 3, 'grid-cell scope partitions logically', result.first);
  assert(result.hitSelectionIds.includes('focus-grid.0.0'),
    'presentation retains concrete grid-cell pointer hit identity', result.hitSelectionIds);
  assertSecondOnly(result.focusedSecond, 'same-key retarget');
  assert(result.second.changed === true && result.second.revision === result.first.revision + 1,
    'same key atomically replaces its membership', result.second);
  assert(result.cleared === true, 'clear removes only the keyed layer', result);
  assertFullPair(result.clearedPixels, 'clear restores base paint');
  assertFirstOnly(result.lazyPixels, 'lazy visible chunk inherits presentation', 'third');
  assertFirstOnly(result.lazySurfacePixels, 'first visible lazy frame inherits presentation');
  assert(result.lazy.changed === true, 'offscreen retarget commits', result.lazy);
  assertAuthoredFirstOnly(result.authoredPixels, 'authored item remains supported');
  assert(result.authored.scopeCount === 2 && result.authored.matchedCount === 1,
    'authored scope remains independent', result.authored);
  assert(Object.values(result.immutable).every(Boolean),
    'presentation stays outside input, snapshot, history, and semantic hash', result.immutable);
  assert(result.replace.sceneRevision > 0 && result.layerCountAfterReplace === 0,
    'successful replace clears the old layer', result);
  assert(result.replayOverlay.status === 'committed' && result.replayOverlay.appliedCount === 8,
    'concrete columns replay after replacement', result.replayOverlay);
  assert(result.replay.changed === true, 'new-revision presentation replay commits', result.replay);
  assertFirstOnly(result.replayPixels, 'replace replay visible pixels');
  assert(result.destroy === true && result.remount.changed === true &&
    result.remountDestroy === true && result.canvasCountAfterDestroy === 0,
  'destroy/remount releases renderer presentation resources', result);
  assert(errors.length === 0, 'browser verification emitted no errors', errors);
  process.stdout.write(`${JSON.stringify({ status: 'pass', result, errors }, null, 2)}\n`);
} finally {
  await page?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  await server?.close().catch(() => undefined);
}

function assertFullPair(pixels, description) {
  const first = pixels.regions.first;
  const second = pixels.regions.second;
  assert(pixels.regions.firstBackground.red.pixelCount > 50 &&
    pixels.regions.secondBackground.blue.pixelCount > 50,
    `${description}: both backgrounds are visible`, pixels);
  assert(first.green.pixelCount > 20 && second.yellow.pixelCount > 20,
    `${description}: both text leaves are visible`, pixels);
  assert(first.orange.pixelCount > 40 && second.orange.pixelCount > 40,
    `${description}: both bar meshes are visible`, pixels.regions);
  assert(first.magenta.pixelCount > 20 && second.magenta.pixelCount > 20,
    `${description}: both icon sprites are visible`, pixels.regions);
}

function assertFirstOnly(pixels, description, pair = 'first') {
  const first = pixels.regions[pair];
  const second = pixels.regions[pair === 'first' ? 'second' : 'fourth'];
  const firstBackground = pixels.regions[`${pair}Background`];
  const secondBackground = pixels.regions[pair === 'first'
    ? 'secondBackground'
    : 'fourthBackground'];
  assert(firstBackground.red.pixelCount > 50 && secondBackground.blue.pixelCount === 0,
    `${description}: unmatched background is dimmed`, pixels);
  assert(first.green.pixelCount > 20 && second.yellow.pixelCount === 0,
    `${description}: unmatched text is dimmed`, pixels);
  assert(first.orange.pixelCount > 40 && second.orange.pixelCount === 0,
    `${description}: unmatched bar is dimmed`, pixels.regions);
  assert(first.magenta.pixelCount > 20 && second.magenta.pixelCount === 0,
    `${description}: unmatched icon is dimmed`, pixels.regions);
}

function assertAuthoredFirstOnly(pixels, description) {
  assert(pixels.regions.authoredFirstBackground.red.pixelCount > 50 &&
    pixels.regions.authoredSecondBackground.blue.pixelCount === 0,
  `${description}: authored descendant paint follows its item layer`, pixels.regions);
}

function assertSecondOnly(pixels, description) {
  const first = pixels.regions.first;
  const second = pixels.regions.second;
  assert(pixels.regions.firstBackground.red.pixelCount === 0 &&
    pixels.regions.secondBackground.blue.pixelCount > 50,
    `${description}: previous background is restored and dimmed`, pixels);
  assert(first.green.pixelCount === 0 && second.yellow.pixelCount > 20,
    `${description}: previous text is restored and dimmed`, pixels);
  assert(first.orange.pixelCount === 0 && second.orange.pixelCount > 40,
    `${description}: previous bar is restored and dimmed`, pixels.regions);
  assert(first.magenta.pixelCount === 0 && second.magenta.pixelCount > 20,
    `${description}: previous icon is restored and dimmed`, pixels.regions);
}

function assert(condition, description, details) {
  if (!condition) throw new Error(`${description}: ${JSON.stringify(details)}`);
}
