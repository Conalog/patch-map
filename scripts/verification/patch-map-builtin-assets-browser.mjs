#!/usr/bin/env node

import path from 'node:path';

import { chromium } from 'playwright';
import { createServer } from 'vite';

import { parsePatchMapBrowserLaunch } from './patch-map-browser-launch.mjs';

const aliases = ['object', 'inverter', 'combiner', 'device', 'edge', 'loading', 'warning', 'wifi'];
const expectedSignatures = Object.freeze({
  object: '01111110/11100111/11100111/11111111/10011001/11011011/11111111/00111100',
  inverter: '11111111/11100001/11110111/11111111/10011101/11111101/11111111/11111111',
  combiner: '11111111/11011111/11111111/11111111/10011001/10011001/10011001/11111111',
  device: '11111111/10000001/10110111/11100111/10001101/11111111/11111111/00111100',
  edge: '00000111/00000101/11111111/11110000/11111000/11011111/00000111/00000111',
  loading: '11111000/00011110/00000111/00000011/00000011/00000111/00001110/00111000',
  warning: '00011000/00111000/00111100/01111100/01111110/11011010/11011011/11111111',
  wifi: '01111110/11100111/10111101/01111110/01011010/00111100/00111000/00011000',
});
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
    server: { host: '127.0.0.1', cors: true },
  });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  if (!baseUrl) throw new Error('PatchMap builtin asset verification server has no URL');

  browser = await chromium.launch(browserLaunch.launchOptions);
  context = await browser.newContext({
    viewport: { width: 180, height: 180 },
    deviceScaleFactor: 1,
  });
  page = await context.newPage();
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.text().includes('[Assets] Asset id')) {
      errors.push(`console-${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => errors.push(`page: ${error.stack ?? error.message}`));
  page.on('requestfailed', (request) => {
    errors.push(`network: ${request.url()} ${request.failure()?.errorText ?? ''}`);
  });

  await page.setContent(`<!doctype html>
    <html><body style="margin:0;background:#000">
      <div id="map" style="width:128px;height:128px"></div>
      <script type="module">
        import {
          PatchMap,
          PatchMapAssetRuntime,
        } from '${new URL('src/index.ts', baseUrl).href}';

        const aliases = ${JSON.stringify(aliases)};
        const host = document.querySelector('#map');
        const runtime = new PatchMapAssetRuntime();
        const authoredScene = (alias) => [{
          type: 'grid',
          id: 'authored-' + alias,
          attrs: { x: 24, y: 24 },
          cells: [[1]],
          item: {
            size: { width: 64, height: 64 },
            components: [{
              type: 'bar',
              id: 'bar',
              source: { type: 'rect', fill: '#ffffff' },
              size: { width: 64, height: 64 },
              placement: 'center',
              tint: '#1d4ed8',
              animation: false,
            }, {
              type: 'icon',
              id: 'status',
              source: alias,
              size: { width: 56, height: 56 },
              placement: 'center',
              tint: '#22c55e',
              show: true,
              attrs: { zIndex: 10 },
            }],
          },
        }];
        const overlayScene = [{
          type: 'grid',
          id: 'overlay-grid',
          attrs: { x: 24, y: 24 },
          cells: [[1]],
          item: {
            size: { width: 64, height: 64 },
            components: [{
              type: 'bar',
              id: 'bar',
              source: { type: 'rect', fill: '#ffffff' },
              size: { width: 64, height: 64 },
              placement: 'center',
              tint: '#1d4ed8',
              animation: false,
            }, {
              type: 'icon',
              id: 'status',
              source: 'device',
              size: { width: 56, height: 56 },
              placement: 'center',
              tint: '#ffffff',
              show: false,
              attrs: { zIndex: 10 },
            }],
          },
        }];

        const analyze = async (map, color) => {
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
          const points = [];
          const colorCounts = new Map();
          for (let y = 0; y < canvas.height; y += 1) {
            for (let x = 0; x < canvas.width; x += 1) {
              const offset = (y * canvas.width + x) * 4;
              const red = pixels[offset];
              const green = pixels[offset + 1];
              const blue = pixels[offset + 2];
              const alpha = pixels[offset + 3];
              if (alpha > 180 && (red > 16 || green > 16 || blue > 16)) {
                const key = [red, green, blue].map((value) => Math.round(value / 16) * 16).join(',');
                colorCounts.set(key, (colorCounts.get(key) ?? 0) + 1);
              }
              const matches = color === 'green'
                ? green > 110 && green > red * 1.3 && green > blue * 1.3 && alpha > 180
                : red > 120 && red > green * 1.5 && red > blue * 1.5 && alpha > 180;
              if (matches) points.push([x, y]);
            }
          }
          const topColors = [...colorCounts.entries()]
            .sort((left, right) => right[1] - left[1])
            .slice(0, 8);
          if (points.length === 0) {
            return { pixelCount: 0, signature: '', occupancy: 0, topColors };
          }
          const xs = points.map(([x]) => x);
          const ys = points.map(([, y]) => y);
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);
          const width = maxX - minX + 1;
          const height = maxY - minY + 1;
          const buckets = Array.from({ length: 8 }, () => Array(8).fill(0));
          for (const [x, y] of points) {
            const bucketX = Math.min(7, Math.floor(((x - minX) * 8) / width));
            const bucketY = Math.min(7, Math.floor(((y - minY) * 8) / height));
            buckets[bucketY][bucketX] += 1;
          }
          const signature = buckets
            .map((row) => row.map((count) => count >= 2 ? '1' : '0').join(''))
            .join('/');
          return {
            pixelCount: points.length,
            bounds: { minX, maxX, minY, maxY, width, height },
            occupancy: points.length / (width * height),
            signature,
            topColors,
          };
        };

        let map = null;
        try {
          map = await PatchMap.mount({
            container: host,
            instanceId: 'builtin-glyph-source-browser',
            width: 128,
            height: 128,
            background: '#000000',
            data: authoredScene(aliases[0]),
            assetRuntime: runtime,
            fit: false,
            resizeMode: 'manual',
          });
          const authored = {};
          const overlay = {};
          const authoredStatuses = {};
          const overlayStatuses = {};
          for (const alias of aliases) {
            if (alias !== aliases[0]) {
              await map.data.replaceAsync(authoredScene(alias), { strict: true, fit: false });
            }
            authored[alias] = await analyze(map, 'green');
            authoredStatuses[alias] = map.assets.status(alias).runtime;
          }

          await map.data.replaceAsync(overlayScene, { strict: true, fit: false });
          const hidden = await analyze(map, 'red');
          for (const alias of aliases) {
            const update = map.updateBatch({
              targets: ['overlay-grid.0.0'],
              icon: {
                componentId: 'status',
                changes: {
                  show: [true],
                  source: [alias],
                  tint: ['#ef4444'],
                },
              },
            });
            overlay[alias] = { update, ...(await analyze(map, 'red')) };
            overlayStatuses[alias] = map.assets.status(alias).runtime;
          }
          const runtimeBeforeDestroy = runtime.probe();
          const destroy = await map.destroy();
          map = null;
          window.__PATCH_MAP_BUILTINS__ = {
            aliases,
            authored,
            overlay,
            authoredStatuses,
            overlayStatuses,
            hidden,
            runtimeBeforeDestroy,
            runtimeAfterDestroy: runtime.probe(),
            destroy,
            canvasCountAfterDestroy: host.querySelectorAll('canvas').length,
          };
        } finally {
          await map?.destroy().catch(() => undefined);
        }
      </script>
    </body></html>`);

  try {
    await page.waitForFunction(
      () => window.__PATCH_MAP_BUILTINS__?.canvasCountAfterDestroy === 0,
      undefined,
      { timeout: 60_000 },
    );
  } catch (error) {
    const state = await page.evaluate(() => ({
      result: window.__PATCH_MAP_BUILTINS__ ?? null,
      body: document.body.textContent,
    }));
    throw new Error(`builtin asset page did not finish: ${JSON.stringify({ errors, state })}`, {
      cause: error,
    });
  }

  const result = await page.evaluate(() => window.__PATCH_MAP_BUILTINS__);
  const authoredSignatures = new Set();
  for (const alias of aliases) {
    const authored = result.authored[alias];
    const overlay = result.overlay[alias];
    assert(authored.pixelCount > 80, `${alias} authored glyph has visible pixels`, {
      authored,
      status: result.authoredStatuses[alias],
      runtime: result.runtimeBeforeDestroy,
    });
    assert(authored.occupancy < 0.58, `${alias} authored glyph is not a filled square`, authored);
    assert(authored.signature === expectedSignatures[alias],
      `${alias} authored glyph matches its raster fixture`, authored);
    assert(overlay.update.status === 'committed', `${alias} overlay committed`, overlay);
    assert(overlay.pixelCount > 80, `${alias} overlay glyph is above the bar`, overlay);
    assert(overlay.occupancy < 0.58, `${alias} overlay glyph is not a filled square`, overlay);
    assert(
      JSON.stringify(authored.bounds) === JSON.stringify(overlay.bounds) &&
        Math.abs(authored.occupancy - overlay.occupancy) < 0.03 &&
        signatureDistance(authored.signature, overlay.signature) <= 2,
      `${alias} authored/overlay texture matches`, {
      authored,
      overlay,
      },
    );
    assert(result.authoredStatuses[alias].resource?.state === 'resolved',
      `${alias} authored capture settled the asset`, result.authoredStatuses[alias]);
    assert(result.overlayStatuses[alias].resource?.state === 'resolved',
      `${alias} overlay capture settled the asset`, result.overlayStatuses[alias]);
    authoredSignatures.add(authored.signature);
  }
  assert(result.hidden.pixelCount === 0, 'hidden overlay icon has no red pixels', result.hidden);
  assert(authoredSignatures.size === aliases.length, 'every builtin has a distinct raster silhouette', result);
  assert(result.runtimeBeforeDestroy.resourceCount === 1, 'only active alias remains leased', result);
  assert(result.runtimeBeforeDestroy.pendingCount === 0, 'capture leaves no pending assets', result);
  assert(result.runtimeBeforeDestroy.leaseCount === 1, 'active alias has one lease', result);
  assert(result.runtimeAfterDestroy.resourceCount === 0, 'destroy releases builtin texture', result);
  assert(result.runtimeAfterDestroy.leaseCount === 0, 'destroy releases builtin lease', result);
  assert(result.destroy === true && result.canvasCountAfterDestroy === 0,
    'destroy removes canvas', result);
  assert(errors.length === 0, 'browser has no cache/console/page/network errors', errors);

  process.stdout.write(`${JSON.stringify({
    revision: 'patch-map-builtin-assets-browser/1',
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

function signatureDistance(left, right) {
  if (left.length !== right.length) return Number.POSITIVE_INFINITY;
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) distance += 1;
  }
  return distance;
}
