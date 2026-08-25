#!/usr/bin/env node

import path from 'node:path';

import { chromium } from 'playwright';
import { createServer } from 'vite';

import { parsePatchMapBrowserLaunch } from './patch-map-browser-launch.mjs';

const root = process.cwd();
const browserLaunch = parsePatchMapBrowserLaunch(process.argv.slice(2));
const waiting = new Map([
  ['inverter', []],
  ['edge', []],
]);
const released = new Set();
const whiteIcon = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" fill="white"/></svg>',
);
let server;
let browser;
let page;

try {
  server = await createServer({
    root,
    configFile: path.join(root, 'vite.patch-map-lab.config.ts'),
    logLevel: 'error',
    server: { host: '127.0.0.1', cors: true },
    plugins: [{
      name: 'patch-map-async-item-icon-fixture',
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          const url = new URL(request.url ?? '/', 'http://fixture.test');
          const asset = /^\/__async-icon\/(inverter|edge)\.svg$/u.exec(url.pathname)?.[1];
          if (asset !== undefined) {
            if (released.has(asset)) respondWithIcon(response);
            else waiting.get(asset)?.push(response);
            return;
          }
          const release = /^\/__release-icon\/(inverter|edge)$/u.exec(url.pathname)?.[1];
          if (release !== undefined) {
            released.add(release);
            for (const pending of waiting.get(release) ?? []) respondWithIcon(pending);
            waiting.set(release, []);
            response.statusCode = 204;
            response.end();
            return;
          }
          next();
        });
      },
    }],
  });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  if (!baseUrl) throw new Error('PatchMap async item icon server has no URL');

  browser = await chromium.launch(browserLaunch.launchOptions);
  page = await browser.newPage({ viewport: { width: 220, height: 100 } });
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
      <div id="map" style="width:220px;height:100px"></div>
      <script type="module">
        import { PatchMap } from '${new URL('src/index.ts', baseUrl).href}';

        const baseUrl = ${JSON.stringify(baseUrl)};
        const item = (id, x, source, tint, componentZIndex) => ({
          type: 'item',
          id,
          size: { width: 64, height: 64 },
          attrs: { x, y: 18 },
          components: [{
            type: 'background',
            id: id + '-background',
            source: { type: 'rect', fill: '#ffffffff', radius: 8 },
          }, {
            type: 'icon',
            id: id + '-icon',
            source,
            size: 24,
            tint,
            show: false,
            ...(componentZIndex === undefined ? {} : { attrs: { zIndex: componentZIndex } }),
          }],
        });
        const data = [
          item('inverter', 10, 'async-inverter', '#ef4444', 10),
          item('edge', 50, 'async-edge', '#3b82f6'),
          {
            type: 'grid',
            id: 'panels',
            cells: [[1]],
            attrs: { x: 140, y: 18 },
            item: {
              size: { width: 64, height: 64 },
              components: [{
                type: 'background',
                id: 'panel-background',
                source: { type: 'rect', fill: '#ffffffff', radius: 8 },
              }, {
                type: 'icon',
                id: 'panel-icon',
                source: 'async-edge',
                size: 24,
                tint: '#22c55e',
                show: false,
              }],
            },
          },
        ];
        const map = await PatchMap.mount({
          container: '#map',
          width: 220,
          height: 100,
          pixelRatio: 1,
          antialias: false,
          backend: 'webgl',
          resizeMode: 'manual',
          fit: false,
          background: '#000000',
          assetPolicy: () => undefined,
          assets: [{
            alias: 'async-inverter',
            descriptor: new URL('__async-icon/inverter.svg', baseUrl).href,
          }, {
            alias: 'async-edge',
            descriptor: new URL('__async-icon/edge.svg', baseUrl).href,
          }],
          data,
        });

        map.update({
          id: 'inverter',
          icon: { componentId: 'inverter-icon', changes: { show: true } },
        });
        map.update({
          id: 'edge',
          icon: { componentId: 'edge-icon', changes: { show: true } },
        });
        map.update({
          id: 'panels.0.0',
          icon: { componentId: 'panel-icon', changes: { show: true } },
        });

        window.__PATCH_MAP_ASYNC_ITEM_ICONS_UPDATES__ = true;
        window.__PATCH_MAP_ASYNC_ITEM_ICONS_STATUS__ = () => map.assets.status().runtime;
        while (window.__PATCH_MAP_ASYNC_ITEM_ICONS_FINISH__ !== true) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        await map.destroy();
        window.__PATCH_MAP_ASYNC_ITEM_ICONS_DESTROYED__ = true;
      </script>
    </body></html>`);

  await waitForHeldAssets();
  await page.waitForFunction(
    () => globalThis.__PATCH_MAP_ASYNC_ITEM_ICONS_UPDATES__ === true,
    undefined,
    { timeout: 30_000 },
  );
  releaseIcon('edge');
  await page.waitForTimeout(500);
  const edgeReady = await captureCompositedPixels(page);
  releaseIcon('inverter');
  await page.waitForFunction(
    () => globalThis.__PATCH_MAP_ASYNC_ITEM_ICONS_STATUS__?.().pendingCount === 0,
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(500);
  const allReady = await captureCompositedPixels(page);
  const assets = await page.evaluate(() => globalThis.__PATCH_MAP_ASYNC_ITEM_ICONS_STATUS__());
  const result = { edgeReady, allReady, assets };
  assert(result.edgeReady.red === 0 && result.edgeReady.blue > 100 && result.edgeReady.green > 100,
    'edge and grid icons appear before inverter settlement', result);
  assert(result.allReady.red > 100 && result.allReady.blue > 100 && result.allReady.green > 100,
    'all root-item and grid icons remain after reverse-order settlement', result);
  assert(result.assets.pendingCount === 0, 'all asset work settled', result);
  assert(errors.length === 0, 'browser emitted no errors', errors);
  console.log(JSON.stringify({ browser: browserLaunch.target, result }, null, 2));
  await page.evaluate(() => {
    globalThis.__PATCH_MAP_ASYNC_ITEM_ICONS_FINISH__ = true;
  });
  await page.waitForFunction(
    () => globalThis.__PATCH_MAP_ASYNC_ITEM_ICONS_DESTROYED__ === true,
    undefined,
    { timeout: 30_000 },
  );
} finally {
  await page?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  await server?.close().catch(() => undefined);
}

function respondWithIcon(response) {
  response.statusCode = 200;
  response.setHeader('access-control-allow-origin', '*');
  response.setHeader('cache-control', 'no-store');
  response.setHeader('content-type', 'image/svg+xml');
  response.end(whiteIcon);
}

async function waitForHeldAssets() {
  const started = Date.now();
  while ((waiting.get('inverter')?.length ?? 0) === 0 || (waiting.get('edge')?.length ?? 0) === 0) {
    if (Date.now() - started > 10_000) throw new Error('timed out waiting for held icon requests');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function releaseIcon(alias) {
  released.add(alias);
  for (const response of waiting.get(alias) ?? []) respondWithIcon(response);
  waiting.set(alias, []);
}

async function captureCompositedPixels(targetPage) {
  const screenshot = await targetPage.locator('#map canvas').screenshot({ type: 'png' });
  return targetPage.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const counts = { red: 0, blue: 0, green: 0, white: 0, nonBlack: 0 };
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const red = pixels[offset];
      const green = pixels[offset + 1];
      const blue = pixels[offset + 2];
      const alpha = pixels[offset + 3];
      if (alpha < 180) continue;
      if (red > 230 && green > 230 && blue > 230) counts.white += 1;
      if (red > 20 || green > 20 || blue > 20) counts.nonBlack += 1;
      if (red > 160 && red > green * 1.6 && red > blue * 1.6) counts.red += 1;
      if (blue > 150 && blue > red * 1.4 && blue > green * 1.2) counts.blue += 1;
      if (green > 120 && green > red * 1.25 && green > blue * 1.1) counts.green += 1;
    }
    return counts;
  }, screenshot.toString('base64'));
}

function assert(condition, message, details) {
  if (condition) return;
  throw new Error(`${message}: ${JSON.stringify(details)}`);
}
