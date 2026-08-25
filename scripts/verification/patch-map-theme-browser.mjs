#!/usr/bin/env node

import path from 'node:path';

import { chromium } from 'playwright';
import { createServer } from 'vite';

import { parsePatchMapBrowserLaunch } from './patch-map-browser-launch.mjs';

const root = process.cwd();
const browserLaunch = parsePatchMapBrowserLaunch(process.argv.slice(2));
let server;
let browser;
let context;
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
  if (!baseUrl) throw new Error('PatchMap theme verification server has no URL');

  browser = await chromium.launch(browserLaunch.launchOptions);
  context = await browser.newContext({
    viewport: { width: 420, height: 420 },
    deviceScaleFactor: 1,
  });
  page = await context.newPage();
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
      <div id="default-map" style="width:120px;height:120px"></div>
      <div id="custom-map" style="width:240px;height:120px"></div>
      <div id="invalid-map" style="width:120px;height:120px"></div>
      <script type="module">
        import { PatchMap } from '${new URL('src/index.ts', baseUrl).href}';

        const whiteCanvas = document.createElement('canvas');
        whiteCanvas.width = 24;
        whiteCanvas.height = 24;
        const whiteContext = whiteCanvas.getContext('2d');
        whiteContext.fillStyle = '#ffffff';
        whiteContext.fillRect(0, 0, 24, 24);
        const statusAsset = whiteCanvas.toDataURL('image/png');

        const bar = (tint) => ({
          type: 'bar',
          id: 'bar',
          source: { type: 'rect', fill: 'white' },
          size: { width: 100, height: 100 },
          placement: 'center',
          tint,
          animation: false,
        });
        const defaultData = [{
          type: 'grid',
          id: 'default-grid',
          cells: [[1]],
          item: { size: { width: 100, height: 100 }, components: [bar('primary.default')] },
        }];
        const customData = [{
          type: 'grid',
          id: 'custom-grid',
          cells: [[1]],
          item: {
            size: { width: 100, height: 100 },
            components: [
              bar('primary.default'),
              {
                type: 'icon',
                id: 'status',
                source: 'status',
                size: { width: 24, height: 24 },
                placement: 'center',
                tint: 'white',
                show: false,
                attrs: { zIndex: 10 },
              },
              {
                type: 'text',
                id: 'label',
                text: 'T',
                placement: 'top',
                tint: 'gray.light',
                style: { fontSize: 32 },
                attrs: { zIndex: 20 },
              },
            ],
          },
        }, {
          type: 'rect',
          id: 'custom-rect',
          attrs: { x: 120, y: 0 },
          size: { width: 80, height: 80 },
          fill: 'primary.dark',
        }];
        const theme = {
          primary: {
            default: '#16a34a',
            dark: '#f59e0b',
            accent: '#ef4444',
          },
          gray: { light: '#3b82f6' },
        };
        const themeBefore = JSON.stringify(theme);
        const dataBefore = JSON.stringify(customData);

        const defaultMap = await PatchMap.mount({
          container: '#default-map',
          width: 120,
          height: 120,
          background: '#000000',
          data: defaultData,
          fit: false,
          resizeMode: 'manual',
        });
        const customMap = await PatchMap.mount({
          container: '#custom-map',
          width: 240,
          height: 120,
          background: '#000000',
          theme,
          assets: [{ alias: 'status', descriptor: statusAsset }],
          assetPolicy: () => undefined,
          data: customData,
          fit: false,
          resizeMode: 'manual',
        });

        const colorCounts = async (map) => {
          const capture = await map.capture.png();
          const image = new Image();
          image.src = capture.dataUrl;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const captureContext = canvas.getContext('2d', { willReadFrequently: true });
          captureContext.drawImage(image, 0, 0);
          const pixels = captureContext.getImageData(0, 0, canvas.width, canvas.height).data;
          const count = (red, green, blue, tolerance = 6) => {
            let matches = 0;
            for (let index = 0; index < pixels.length; index += 4) {
              if (
                Math.abs(pixels[index] - red) <= tolerance &&
                Math.abs(pixels[index + 1] - green) <= tolerance &&
                Math.abs(pixels[index + 2] - blue) <= tolerance &&
                pixels[index + 3] >= 245
              ) matches += 1;
            }
            return matches;
          };
          return {
            canonicalDefault: count(12, 115, 191),
            customBar: count(22, 163, 74),
            customRect: count(245, 158, 11),
            customIcon: count(239, 68, 68),
            customText: count(59, 130, 246),
          };
        };

        const defaultCapture = await colorCounts(defaultMap);
        const customBefore = await colorCounts(customMap);
        const snapshotBefore = JSON.stringify(customMap.data.snapshot());
        const historyBefore = JSON.stringify(customMap.history.state);
        const semanticHashBefore = customMap.debug.snapshot().semanticHash;
        const showIcon = () => customMap.updateBatch({
          targets: ['custom-grid.0.0'],
          icon: {
            componentId: 'status',
            changes: {
              show: [true],
              source: ['status'],
              tint: ['primary.accent'],
            },
          },
        });
        const firstOverlay = showIcon();
        const customOverlay = await colorCounts(customMap);
        const overlayImmutable =
          JSON.stringify(customMap.data.snapshot()) === snapshotBefore &&
          JSON.stringify(customMap.history.state) === historyBefore &&
          customMap.debug.snapshot().semanticHash === semanticHashBefore;

        await customMap.data.replaceAsync(structuredClone(customData), { fit: false, strict: true });
        const customReplaced = await colorCounts(customMap);
        const secondOverlay = showIcon();
        const customReplay = await colorCounts(customMap);
        const replaceHashStable = customMap.debug.snapshot().semanticHash === semanticHashBefore;

        let invalidTheme = null;
        try {
          await PatchMap.mount({
            container: '#invalid-map',
            width: 120,
            height: 120,
            theme: { primary: { default: [0, Number.NaN, 1] } },
            resizeMode: 'manual',
          });
        } catch (error) {
          invalidTheme = {
            code: error?.code ?? null,
            path: error?.datasetPath ?? error?.diagnostic?.datasetPath ?? null,
          };
        }

        await Promise.all([defaultMap.destroy(), customMap.destroy()]);
        window.__PATCH_MAP_THEME__ = {
          defaultCapture,
          customBefore,
          customOverlay,
          customReplaced,
          customReplay,
          firstOverlay,
          secondOverlay,
          themeImmutable: JSON.stringify(theme) === themeBefore,
          dataImmutable: JSON.stringify(customData) === dataBefore,
          overlayImmutable,
          replaceHashStable,
          invalidTheme,
          canvasCountAfterDestroy: document.querySelectorAll('canvas').length,
          invalidCanvasCount: document.querySelectorAll('#invalid-map canvas').length,
        };
      </script>
    </body></html>`);

  try {
    await page.waitForFunction(
      () => window.__PATCH_MAP_THEME__?.canvasCountAfterDestroy === 0,
      undefined,
      { timeout: 60_000 },
    );
  } catch (error) {
    const state = await page.evaluate(() => ({
      result: window.__PATCH_MAP_THEME__ ?? null,
      body: document.body.textContent,
    }));
    throw new Error(`theme page did not finish: ${JSON.stringify({ errors, state })}`, {
      cause: error,
    });
  }

  const result = await page.evaluate(() => window.__PATCH_MAP_THEME__);
  assert(result.defaultCapture.canonicalDefault > 8_000, 'canonical default bar captured', result);
  assert(result.customBefore.customBar > 8_000, 'custom bar theme captured', result);
  assert(result.customBefore.customRect > 5_000, 'custom rect theme captured', result);
  assert(result.customBefore.customText > 10, 'custom text theme captured', result);
  assert(result.customBefore.customIcon === 0, 'authored hidden icon remains hidden', result);
  assert(result.customOverlay.customIcon > 300, 'overlay icon theme captured', result);
  assert(result.customReplaced.customIcon === 0, 'replace clears overlay icon', result);
  assert(result.customReplaced.customBar > 8_000, 'replace keeps custom bar theme', result);
  assert(result.customReplay.customIcon > 300, 'replayed overlay keeps custom icon theme', result);
  assert(result.firstOverlay.status === 'committed', 'first overlay committed', result);
  assert(result.secondOverlay.status === 'committed', 'second overlay committed', result);
  assert(result.themeImmutable, 'caller theme remained immutable', result);
  assert(result.dataImmutable, 'caller dataset remained immutable', result);
  assert(result.overlayImmutable, 'overlay kept snapshot/history/hash immutable', result);
  assert(result.replaceHashStable, 'equivalent replace kept semantic hash stable', result);
  assert(
    result.invalidTheme?.code === 'INVALID_VALUE' &&
      result.invalidTheme?.path === '$.theme.primary.default',
    'invalid theme rejected with path',
    result,
  );
  assert(result.invalidCanvasCount === 0, 'invalid theme allocated no canvas', result);
  if (errors.length > 0) throw new Error(`theme verification emitted errors: ${JSON.stringify(errors)}`);

  process.stdout.write(`${JSON.stringify({ status: 'pass', ...result }, null, 2)}\n`);
} finally {
  await page?.close().catch(() => undefined);
  await context?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  await server?.close().catch(() => undefined);
}

function assert(condition, label, context) {
  if (!condition) throw new Error(`${label}: ${JSON.stringify(context)}`);
}
