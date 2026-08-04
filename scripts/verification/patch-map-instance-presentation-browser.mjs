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
  if (!baseUrl) throw new Error('PatchMap presentation verification server has no URL');

  browser = await chromium.launch(browserLaunch.launchOptions);
  context = await browser.newContext({
    viewport: { width: 360, height: 260 },
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
      <div id="map" style="width:320px;height:220px"></div>
      <script type="module">
        import { PatchMap } from '${new URL('src/index.ts', baseUrl).href}';
        const assetCanvas = document.createElement('canvas');
        assetCanvas.width = 32;
        assetCanvas.height = 32;
        const assetContext = assetCanvas.getContext('2d');
        assetContext.fillStyle = '#ffffff';
        assetContext.fillRect(4, 4, 24, 24);
        const ess = assetCanvas.toDataURL('image/png');
        const data = [{
          type: 'grid',
          id: 'capture-grid',
          cells: [[1]],
          item: {
            size: { width: 120, height: 120 },
            components: [
              {
                type: 'bar',
                id: 'bar',
                source: { type: 'rect', fill: '#ffffff' },
                size: { width: 120, height: 120 },
                placement: 'center',
                tint: '#7c3aed',
                animation: false,
              },
              {
                type: 'icon',
                id: 'icon',
                source: 'ess',
                size: { width: 32, height: 32 },
                placement: 'center',
                tint: '#ffffff',
                show: false,
                attrs: { zIndex: 10 },
              },
            ],
          },
        }];
        const map = await PatchMap.mount({
          container: '#map',
          width: 320,
          height: 220,
          background: '#000000',
          assets: [{ alias: 'ess', descriptor: ess }],
          assetPolicy: () => undefined,
          data,
          resizeMode: 'manual',
        });
        const pixels = async () => {
          const capture = await map.capture.png();
          const image = new Image();
          image.src = capture.dataUrl;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          context.drawImage(image, 0, 0);
          const values = context.getImageData(0, 0, canvas.width, canvas.height).data;
          const count = (red, green, blue, tolerance = 8) => {
            let matches = 0;
            for (let index = 0; index < values.length; index += 4) {
              if (
                Math.abs(values[index] - red) <= tolerance &&
                Math.abs(values[index + 1] - green) <= tolerance &&
                Math.abs(values[index + 2] - blue) <= tolerance &&
                values[index + 3] >= 245
              ) matches += 1;
            }
            return matches;
          };
          let redDominant = 0;
          for (let index = 0; index < values.length; index += 4) {
            if (
              values[index] >= 80 &&
              values[index] > values[index + 1] * 1.5 &&
              values[index] > values[index + 2] * 1.5 &&
              values[index + 3] >= 200
            ) redDominant += 1;
          }
          return {
            purple: count(124, 58, 237),
            blue: count(37, 99, 235),
            red: count(239, 68, 68),
            redDominant,
          };
        };
        const before = await pixels();
        const snapshot = JSON.stringify(map.data.snapshot());
        const history = JSON.stringify(map.history.state);
        const semanticHash = map.debug.snapshot().semanticHash;
        const update = map.updateBatch({
          targets: ['capture-grid.0.0'],
          bar: {
            componentId: 'bar',
            changes: {
              tint: ['#2563eb'],
              source: [{ type: 'rect', fill: '#ffffff', radius: 8 }],
              show: [true],
            },
          },
          icon: {
            componentId: 'icon',
            changes: {
              show: [true],
              source: ['ess'],
              tint: ['#ef4444'],
            },
          },
        }, { animate: true });
        const deadline = performance.now() + 10_000;
        let after;
        do {
          await new Promise((resolve) => setTimeout(resolve, 32));
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          after = await pixels();
        } while (after.redDominant <= 50 && performance.now() < deadline);
        window.__PATCH_MAP_INSTANCE_PRESENTATION__ = {
          before,
          after,
          update,
          immutable: JSON.stringify(map.data.snapshot()) === snapshot,
          historyUnchanged: JSON.stringify(map.history.state) === history,
          semanticHashUnchanged: map.debug.snapshot().semanticHash === semanticHash,
          assets: map.assets.status(),
          debug: map.debug.snapshot(),
          canvasCount: document.querySelectorAll('#map canvas').length,
        };
        await map.destroy();
        window.__PATCH_MAP_INSTANCE_PRESENTATION__.canvasCountAfterDestroy =
          document.querySelectorAll('#map canvas').length;
      </script>
    </body></html>`);
  try {
    await page.waitForFunction(
      () => window.__PATCH_MAP_INSTANCE_PRESENTATION__?.canvasCountAfterDestroy === 0,
      undefined,
      { timeout: 60_000 },
    );
  } catch (error) {
    const state = await page.evaluate(() => ({
      result: window.__PATCH_MAP_INSTANCE_PRESENTATION__ ?? null,
      body: document.body.textContent,
    }));
    throw new Error(`instance presentation page did not finish: ${JSON.stringify({ errors, state })}`, {
      cause: error,
    });
  }
  const result = await page.evaluate(() => window.__PATCH_MAP_INSTANCE_PRESENTATION__);
  assert(result.update.status === 'committed' && result.update.changed, 'public update committed', result);
  assert(result.before.purple > 5_000, 'authored purple bar captured', result.before);
  assert(result.before.red === 0, 'authored hidden icon has no red pixels', result.before);
  assert(result.after.blue > 5_000, 'cell bar tint overlay captured', result.after);
  assert(result.after.redDominant > 50, 'shown red icon is captured above the full bar', result);
  assert(result.immutable, 'data snapshot identity is unchanged', result);
  assert(result.historyUnchanged, 'history is unchanged', result);
  assert(result.semanticHashUnchanged, 'semantic hash is unchanged', result);
  assert(result.canvasCount === 1 && result.canvasCountAfterDestroy === 0, 'mount/destroy owns one canvas', result);
  assert(errors.length === 0, 'browser has no console/page/network errors', errors);

  process.stdout.write(`${JSON.stringify({
    revision: 'patch-map-instance-presentation-browser/1',
    status: 'pass',
    browser: browser.version(),
    target: browserLaunch.target,
    result,
    errors,
  }, null, 2)}\n`);
} finally {
  await page?.close().catch(() => undefined);
  await context?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  await server?.close().catch(() => undefined);
}

function assert(condition, description, details) {
  if (!condition) throw new Error(`${description}: ${JSON.stringify(details)}`);
}
