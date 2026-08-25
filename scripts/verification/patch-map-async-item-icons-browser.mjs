#!/usr/bin/env node

import path from 'node:path';

import { chromium } from 'playwright';
import { createServer } from 'vite';

import { parsePatchMapBrowserLaunch } from './patch-map-browser-launch.mjs';

const root = process.cwd();
const browserEntry = process.env.PATCH_MAP_BROWSER_ENTRY ?? 'src/index.ts';
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
  page = await browser.newPage({ viewport: { width: 500, height: 180 } });
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
      <div id="map" style="width:500px;height:180px"></div>
      <script type="module">
        import { PatchMap } from '${new URL(browserEntry, baseUrl).href}';

        const baseUrl = ${JSON.stringify(baseUrl)};
        const inverterSource = new URL('__async-icon/inverter.svg', baseUrl).href;
        const edgeSource = new URL('__async-icon/edge.svg', baseUrl).href;
        const item = (id, x, y, source, tint, inverter = false) => ({
          type: 'item',
          id,
          size: 40,
          attrs: { x, y, display: inverter ? 'inverter' : 'edge' },
          components: [{
            type: 'background',
            source: {
              type: 'rect',
              fill: '#ffffffff',
              borderWidth: 2,
              borderColor: '#0f172aff',
              radius: 6,
            },
          }, {
            type: 'icon',
            source,
            size: 24,
            tint,
            show: !inverter,
            ...(inverter ? { attrs: { zIndex: 10 } } : {}),
          }, {
            type: 'bar',
            show: false,
            size: '100%',
            source: { type: 'rect', fill: '#ffffffff', radius: 3 },
          }, ...(inverter ? [{
            type: 'text',
            id: id + '-value',
            text: '',
            show: false,
            attrs: { zIndex: 10 },
          }, {
            type: 'text',
            id: id + '-label',
            text: '',
            show: false,
          }] : [])],
        });
        const data = [
          {
            type: 'image',
            id: 'underlay',
            source: 'object',
            size: { width: 476, height: 140 },
            opacity: 0.08,
            attrs: { x: 0, y: 0, zIndex: -10 },
          },
          ...Array.from({ length: 4 }, (_, index) =>
            item('inverter-' + index, 10 + index * 50, 15, inverterSource, '#ef4444', true)),
          ...Array.from({ length: 4 }, (_, index) =>
            item('edge-' + index, 10 + index * 50, 75, edgeSource, '#3b82f6')),
          {
            type: 'grid',
            id: 'panels',
            cells: Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => 1)),
            attrs: { x: 280, y: 15 },
            item: {
              size: 40,
              components: [{
                type: 'background',
                id: 'panel-background',
                source: { type: 'rect', fill: '#ffffffff', radius: 4 },
              }, {
                type: 'icon',
                id: 'panel-icon',
                source: 'loading',
                size: 20,
                tint: '#22c55e',
                show: false,
              }],
            },
          },
          {
            type: 'relations',
            id: 'wiring',
            show: false,
            links: Array.from({ length: 4 }, (_, index) => ({
              source: 'edge-' + index,
              target: 'inverter-' + index,
            })),
          },
        ];
        const panelIndex = data.findIndex(({ id }) => id === 'panels');
        const [panel] = data.splice(panelIndex, 1);
        data.splice(1, 0, panel);
        const map = await PatchMap.mount({
          container: '#map',
          width: 500,
          height: 180,
          pixelRatio: 1,
          antialias: false,
          backend: 'webgl',
          devtools: true,
          resizeMode: 'manual',
          fit: false,
          background: '#000000',
          assetPolicy: () => undefined,
          data,
        });

        window.__PATCH_MAP_ASYNC_ITEM_ICONS_MOUNTED__ = true;
        await Promise.resolve();

        const operations = [];
        for (let index = 0; index < 4; index += 1) {
          operations.push({
            type: 'update',
            id: 'inverter-' + index,
            changes: { size: 40, padding: 0 },
            background: {
              changes: { source: { borderColor: '#0f172aff' } },
            },
            bar: {
              changes: { show: false },
            },
            icon: {
              changes: {
                show: true,
                size: 24,
                source: inverterSource,
                tint: '#ef4444',
                attrs: { zIndex: 10 },
              },
            },
          });
          operations.push({
            type: 'update',
            id: 'inverter-' + index,
            text: {
              componentId: 'inverter-' + index + '-value',
              text: '',
              changes: { show: false },
            },
          });
        }
        const panelTargets = map.targets.query({
          within: 'panels',
          type: 'grid-cell',
          scope: 'instances',
        });
        const panelUpdate = map.updateBatch({
          targets: panelTargets,
          icon: {
            componentId: 'panel-icon',
            changes: {
              show: Array.from({ length: panelTargets.count }, (_, index) => index < 75),
              source: Array.from({ length: panelTargets.count }, () => 'loading'),
              tint: Array.from({ length: panelTargets.count }, () => '#22c55e'),
            },
          },
        }, { animate: true });
        if (panelUpdate.status !== 'committed') {
          throw new Error('service-shape grid presentation failed: ' + JSON.stringify(panelUpdate));
        }
        await Promise.resolve();
        const transaction = map.transaction(operations, { recordHistory: false, animate: true });
        if (transaction.status !== 'committed' && transaction.status !== 'unchanged') {
          throw new Error('service-shape transaction failed: ' + JSON.stringify(transaction));
        }

        window.__PATCH_MAP_ASYNC_ITEM_ICONS_UPDATES__ = true;
        window.__PATCH_MAP_ASYNC_ITEM_ICONS_STATUS__ = () => map.assets.status().runtime;
        while (window.__PATCH_MAP_ASYNC_ITEM_ICONS_FINISH__ !== true) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        await map.destroy();
        window.__PATCH_MAP_ASYNC_ITEM_ICONS_DESTROYED__ = true;
      </script>
    </body></html>`);

  await waitForHeldAsset('edge', errors);
  releaseIcon('edge');
  try {
    await page.waitForFunction(
      () => globalThis.__PATCH_MAP_ASYNC_ITEM_ICONS_UPDATES__ === true,
      undefined,
      { timeout: 30_000 },
    );
  } catch (error) {
    throw new Error(`updates did not complete: ${JSON.stringify({ errors, cause: String(error) })}`);
  }
  await waitForHeldAsset('inverter', errors);
  await page.waitForTimeout(500);
  const initiallyReady = await captureCompositedPixels(page);
  const initiallyReadyScene = await captureSceneGraph(page);
  releaseIcon('inverter');
  await page.waitForFunction(
    () => globalThis.__PATCH_MAP_ASYNC_ITEM_ICONS_STATUS__?.().pendingCount === 0,
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(500);
  const allReady = await captureCompositedPixels(page);
  const allReadyScene = await captureSceneGraph(page);
  const assets = await page.evaluate(() => globalThis.__PATCH_MAP_ASYNC_ITEM_ICONS_STATUS__());
  const result = { initiallyReady, initiallyReadyScene, allReady, allReadyScene, assets };
  assert(result.initiallyReadyScene.renderLayerSpriteWidths['20'] === 75
    && result.initiallyReadyScene.renderLayerSpriteWidths['24'] === 4
    && result.initiallyReadyScene.renderLayerSpriteWidths['476'] === 1,
    'initially visible root-item icons appear after mount settlement', result);
  assert(result.allReadyScene.renderLayerSpriteWidths['20'] === 75
    && result.allReadyScene.renderLayerSpriteWidths['24'] === 8
    && result.allReadyScene.renderLayerSpriteWidths['476'] === 1,
    'all root-item and grid icons remain after reverse-order settlement', result);
  assert(result.allReady.red > 0 && result.allReady.blue > 0 && result.allReady.green > 0,
    'root-item and grid icons contribute visible pixels', result);
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

async function waitForHeldAsset(alias, errors) {
  const started = Date.now();
  while ((waiting.get(alias)?.length ?? 0) === 0) {
    if (Date.now() - started > 10_000) {
      throw new Error(`timed out waiting for held icon requests: ${JSON.stringify(
        {
          waiting: Object.fromEntries([...waiting].map(([key, responses]) => [key, responses.length])),
          errors,
        },
      )}`);
    }
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

async function captureSceneGraph(targetPage) {
  return targetPage.evaluate(() => {
    const app = globalThis.__PIXI_DEVTOOLS__?.app;
    if (!app) throw new Error('Pixi devtools application is unavailable');
    const stack = [...app.stage.children];
    let renderLayer = null;
    const sprites = [];
    while (stack.length > 0) {
      const object = stack.pop();
      if (object.label === 'PatchMap / hierarchical scene paint') renderLayer = object;
      if (object.constructor?.name === 'Sprite') sprites.push(object);
      stack.push(...(object.children ?? []));
    }
    const spriteWidths = {};
    const renderLayerChildTypes = {};
    for (const sprite of sprites) {
      const width = String(Math.round(sprite.width));
      spriteWidths[width] = (spriteWidths[width] ?? 0) + 1;
    }
    return {
      spriteCount: sprites.length,
      spriteWidths,
      renderLayerChildCount: renderLayer?.renderLayerChildren?.length ?? null,
      renderLayerSpriteWidths: (renderLayer?.renderLayerChildren ?? []).reduce((counts, child) => {
        const type = child.constructor?.name ?? 'unknown';
        renderLayerChildTypes[type] = (renderLayerChildTypes[type] ?? 0) + 1;
        if (typeof child.texture !== 'object') return counts;
        const width = String(Math.round(child.width));
        counts[width] = (counts[width] ?? 0) + 1;
        return counts;
      }, {}),
      renderLayerChildTypes,
    };
  });
}

function assert(condition, message, details) {
  if (condition) return;
  throw new Error(`${message}: ${JSON.stringify(details)}`);
}
