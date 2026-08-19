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
  if (!baseUrl) throw new Error('PatchMap grid presentation server has no URL');

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

        const data = [{
          type: 'grid',
          id: 'status-grid',
          attrs: { x: 10, y: 10 },
          cells: [[1, 1]],
          gap: 10,
          item: {
            size: { width: 100, height: 100 },
            components: [{
              type: 'background',
              id: 'surface',
              source: { type: 'rect', fill: '#334155', radius: 4 },
              attrs: { zIndex: 0 },
            }, {
              type: 'text',
              id: 'value',
              text: 'authored',
              placement: 'center',
              margin: 2,
              style: { fontFamily: 'Arial', fontSize: 14, fill: '#ffffff', align: 'center' },
              show: false,
              attrs: { zIndex: 20 },
            }],
          },
        }];
        const beforeInput = JSON.stringify(data);
        const map = await PatchMap.mount({
          container: '#map',
          width: 240,
          height: 120,
          pixelRatio: 1,
          antialias: false,
          backend: 'webgl',
          resizeMode: 'manual',
          fit: false,
          background: '#000000',
          data,
        });

        const colorMask = (pixels, width, color) => {
          const points = [];
          for (let offset = 0; offset < pixels.length; offset += 4) {
            const red = pixels[offset];
            const green = pixels[offset + 1];
            const blue = pixels[offset + 2];
            const alpha = pixels[offset + 3];
            const matches = color === 'red'
              ? red > 160 && red > green * 1.7 && red > blue * 1.7
              : color === 'blue'
                ? blue > 150 && blue > red * 1.5 && blue > green * 1.25
                : color === 'green'
                  ? green > 150 && green > red * 1.5 && green > blue * 1.15
                  : color === 'yellow'
                    ? red > 180 && green > 150 && blue < 100
                    : red > 35 && red < 90 && green > 45 && green < 105 && blue > 60 && blue < 125;
            if (matches && alpha > 180) {
              const pixel = offset / 4;
              points.push([pixel % width, Math.floor(pixel / width)]);
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
        const capture = async () => {
          const result = await map.capture.png();
          const image = new Image();
          image.src = result.dataUrl;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          context.drawImage(image, 0, 0);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          return Object.fromEntries(['red', 'blue', 'green', 'yellow', 'authored'].map((color) => [
            color,
            colorMask(pixels, canvas.width, color),
          ]));
        };

        const initial = await capture();
        const snapshotBefore = JSON.stringify(map.data.snapshot());
        const historyBefore = JSON.stringify(map.history.state);
        const hashBefore = map.debug.snapshot().semanticHash;
        const first = map.update({
          id: 'status-grid.0.0',
          background: {
            componentId: 'surface',
            changes: {
              source: { type: 'rect', fill: '#dc2626', radius: 12 },
              show: true,
            },
          },
          text: {
            componentId: 'value',
            text: '83\\n%',
            style: {
              fontFamily: 'Arial',
              fontSize: 28,
              fontWeight: 700,
              fill: '#22c55e',
              align: 'left',
              lineHeight: 30,
            },
            changes: {
              show: true,
              placement: 'left-top',
              margin: 8,
              tint: '#22c55e',
            },
          },
        });
        const second = map.updateBatch({
          targets: ['status-grid.0.1'],
          background: {
            componentId: 'surface',
            changes: { source: [{ type: 'rect', fill: '#2563eb', radius: 2 }] },
          },
          text: {
            componentId: 'value',
            text: ['41%'],
            style: [{
              fontFamily: 'Arial',
              fontSize: 24,
              fontWeight: 700,
              fill: '#fde047',
              align: 'right',
            }],
            changes: {
              show: [true],
              placement: ['right-bottom'],
              margin: [8],
              tint: ['#fde047'],
            },
          },
        });
        const overlay = await capture();
        const immutable = {
          input: JSON.stringify(data) === beforeInput,
          snapshot: JSON.stringify(map.data.snapshot()) === snapshotBefore,
          history: JSON.stringify(map.history.state) === historyBefore,
          semanticHash: map.debug.snapshot().semanticHash === hashBefore,
        };
        const restore = map.updateBatch({
          targets: ['status-grid.0.0', 'status-grid.0.1'],
          background: {
            componentId: 'surface',
            changes: { source: [null, null], show: [null, null] },
          },
          text: {
            componentId: 'value',
            text: [null, null],
            style: [null, null],
            changes: {
              show: [null, null],
              placement: [null, null],
              margin: [null, null],
              tint: [null, null],
            },
          },
        });
        const restored = await capture();
        const destroy = await map.destroy();
        window.__PATCH_MAP_GRID_PRESENTATION__ = {
          phase: 'complete',
          initial,
          first,
          second,
          overlay,
          immutable,
          restore,
          restored,
          destroy,
          canvasCountAfterDestroy: document.querySelectorAll('#map canvas').length,
        };
      </script>
    </body></html>`);

  await page.waitForFunction(
    () => window.__PATCH_MAP_GRID_PRESENTATION__?.phase === 'complete',
    undefined,
    { timeout: 60_000 },
  );
  const result = await page.evaluate(() => window.__PATCH_MAP_GRID_PRESENTATION__);
  assert(result.initial.green.pixelCount === 0 && result.initial.yellow.pixelCount === 0,
    'authored hidden text stays hidden', result.initial);
  assert(result.first.status === 'committed' && result.first.appliedCount === 2,
    'update() commits one concrete background and text', result.first);
  assert(result.second.status === 'committed' && result.second.appliedCount === 2,
    'updateBatch() commits one concrete background and text', result.second);
  assert(result.overlay.red.pixelCount > 7_000 && result.overlay.red.bounds.maxX < 110,
    'first cell owns its red rounded background', result.overlay.red);
  assert(result.overlay.blue.pixelCount > 7_000 && result.overlay.blue.bounds.minX > 110,
    'second cell owns its blue background', result.overlay.blue);
  assert(result.overlay.green.pixelCount > 100 &&
    result.overlay.green.bounds.maxX < 110 && result.overlay.green.bounds.minY < 55,
  'first text keeps its font/style and left-top placement above the background', result.overlay.green);
  assert(result.overlay.yellow.pixelCount > 80 &&
    result.overlay.yellow.bounds.minX > 110 && result.overlay.yellow.bounds.minY > 55,
  'second text keeps its font/style and right-bottom placement above the background', result.overlay.yellow);
  assert(Object.values(result.immutable).every(Boolean),
    'overlay stays outside input, snapshot, history, and semantic hash', result.immutable);
  assert(result.restore.status === 'committed' && result.restore.appliedCount === 4,
    'null restores all concrete fields', result.restore);
  assert(result.restored.red.pixelCount === 0 && result.restored.blue.pixelCount === 0 &&
    result.restored.green.pixelCount === 0 && result.restored.yellow.pixelCount === 0 &&
    result.restored.authored.pixelCount > 10_000,
  'restore returns to authored backgrounds and hidden text', result.restored);
  assert(result.destroy === true && result.canvasCountAfterDestroy === 0,
    'destroy removes the package canvas', result);
  assert(errors.length === 0, 'browser verification emitted no errors', errors);

  process.stdout.write(`${JSON.stringify({ status: 'pass', result, errors }, null, 2)}\n`);

} finally {
  await page?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  await server?.close().catch(() => undefined);
}

function assert(condition, description, details) {
  if (!condition) throw new Error(`${description}: ${JSON.stringify(details)}`);
}
