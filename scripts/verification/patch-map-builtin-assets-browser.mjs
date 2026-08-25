#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';
import { createServer } from 'vite';

import { parsePatchMapBrowserLaunch } from '../../verification/browser-launch.mjs';

const aliases = ['object', 'inverter', 'combiner', 'device', 'edge', 'loading', 'warning', 'wifi'];
const expectedSourceDigests = Object.freeze({
  object: 'e87c2ae562c7a3941a0c79249aa4c37494ef6222de31e57779d2aaa31d79e4d4',
  inverter: 'd7527c15410edb84e560a9dcd763edf4914be13494c5a99509c373dff803992d',
  combiner: '2965f5e1c28bd8779d7f02e967cefa43893d4171046708243b1ab03451ed1ee5',
  device: 'a11ac1f84f74afb9a2e888d615c79d45312f2194c64510e64e10db7c8eb70680',
  edge: '46cc54309389013808f40bcbfaa8574fdfec78521b52e3178b3a53eb7f7c3c84',
  loading: '30645d95659f451df9d847f9dadf4d7a641e421c158c54619d7c817057ea00a5',
  warning: '8d485f34e7fa054c787a6775a76a7e62f04e18b93f4741dab3137db15e45f1e8',
  wifi: 'ef2c14fd831d067d559737b7f281be6e550605024a8d9e01a23579e4ccac206c',
});
const root = process.cwd();
const sourceSvgs = Object.fromEntries(await Promise.all(aliases.map(async (alias) => [
  alias,
  await readFile(path.join(root, 'src', 'assets', 'icons', `${alias}.svg`), 'utf8'),
])));
const sourceDigests = Object.fromEntries(Object.entries(sourceSvgs).map(([alias, svg]) => [
  alias,
  createHash('sha256').update(svg).digest('hex'),
]));
const sourceDataUris = Object.fromEntries(Object.entries(sourceSvgs).map(([alias, svg]) => [
  alias,
  `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
]));
const browserLaunch = parsePatchMapBrowserLaunch(process.argv.slice(2));
let server;
let browser;
let context;
let page;

try {
  server = await createServer({
    root,
    configFile: path.join(root, 'vite.lab.config.ts'),
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
        const sourceDataUris = ${JSON.stringify(sourceDataUris)};
        const sourceDigests = ${JSON.stringify(sourceDigests)};
        const runtimeSourceDataUris = sourceDataUris;
        const host = document.querySelector('#map');
        const runtime = new PatchMapAssetRuntime();
        const authoredScene = (alias, iconSize = 56) => [{
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
              size: iconSize,
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

        const analyzePixels = (pixels, canvasWidth, canvasHeight, color) => {
          const points = [];
          const colorCounts = new Map();
          for (let y = 0; y < canvasHeight; y += 1) {
            for (let x = 0; x < canvasWidth; x += 1) {
              const offset = (y * canvasWidth + x) * 4;
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
          return analyzePixels(
            captureContext.getImageData(0, 0, canvas.width, canvas.height).data,
            canvas.width,
            canvas.height,
            color,
          );
        };

        const analyzeSource = async (source, iconSize) => {
          const image = new Image();
          image.src = source;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = 128;
          canvas.height = 128;
          const sourceContext = canvas.getContext('2d', { willReadFrequently: true });
          const offset = 24 + (64 - iconSize) / 2;
          sourceContext.drawImage(image, offset, offset, iconSize, iconSize);
          sourceContext.globalCompositeOperation = 'source-in';
          sourceContext.fillStyle = '#22c55e';
          sourceContext.fillRect(0, 0, canvas.width, canvas.height);
          return analyzePixels(
            sourceContext.getImageData(0, 0, canvas.width, canvas.height).data,
            canvas.width,
            canvas.height,
            'green',
          );
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
            assets: [{
              alias: 'inverterFrame',
              descriptor: sourceDataUris.inverter,
            }],
            assetPolicy: () => undefined,
            assetRuntime: runtime,
            fit: false,
            resizeMode: 'manual',
          });
          const authored = {};
          const overlay = {};
          const source = {};
          const runtimeSource = {};
          const authoredStatuses = {};
          const overlayStatuses = {};
          for (const alias of aliases) {
            source[alias] = await analyzeSource(sourceDataUris[alias], 56);
            runtimeSource[alias] = await analyzeSource(runtimeSourceDataUris[alias], 56);
            if (alias !== aliases[0]) {
              await map.data.replaceAsync(authoredScene(alias), { strict: true, fit: false });
            }
            authored[alias] = await analyze(map, 'green');
            authoredStatuses[alias] = map.assets.status(alias).runtime;
          }
          await map.data.replaceAsync(authoredScene('inverter', 24), { strict: true, fit: false });
          const inverter24 = {
            source: await analyzeSource(sourceDataUris.inverter, 24),
            runtimeSource: await analyzeSource(runtimeSourceDataUris.inverter, 24),
            runtime: await analyze(map, 'green'),
          };
          await map.data.replaceAsync(authoredScene('inverterFrame', 24), {
            strict: true,
            fit: false,
          });
          const injectedInverterFrame24 = {
            runtime: await analyze(map, 'green'),
            status: map.assets.status('inverterFrame').runtime,
          };

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
            sourceDigests,
            source,
            runtimeSource,
            authored,
            overlay,
            inverter24,
            injectedInverterFrame24,
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
  const overlaySignatures = new Set();
  for (const alias of aliases) {
    const source = result.source[alias];
    const runtimeSource = result.runtimeSource[alias];
    const authored = result.authored[alias];
    const overlay = result.overlay[alias];
    assert(result.sourceDigests[alias] === expectedSourceDigests[alias],
      `${alias} source digest matches PatchMap`, result.sourceDigests);
    assert(source.pixelCount > 80,
      `${alias} direct SVG raster has visible pixels`, source);
    assert(Math.max(source.bounds?.width ?? 0, source.bounds?.height ?? 0) < 56,
      `${alias} original 72x72 source retains outer whitespace`, source);
    assert(runtimeSource.signature === source.signature &&
      JSON.stringify(runtimeSource.bounds) === JSON.stringify(source.bounds),
    `${alias} runtime source preserves the exact authored canvas and padding`, {
      source,
      runtimeSource,
    });
    assert(authored.pixelCount > 80, `${alias} authored glyph has visible pixels`, {
      authored,
      status: result.authoredStatuses[alias],
      runtime: result.runtimeBeforeDestroy,
    });
    assert(authored.occupancy < 0.58, `${alias} authored glyph is not a filled square`, authored);
    const sourceDistances = aliases
      .map((candidate) => ({
        alias: candidate,
        distance: signatureDistance(authored.signature, result.runtimeSource[candidate].signature),
      }))
      .sort((left, right) => left.distance - right.distance || left.alias.localeCompare(right.alias));
    assert(sourceDistances[0]?.alias === alias &&
      sourceDistances[0].distance < sourceDistances[1].distance,
    `${alias} authored runtime texture is uniquely closest to its original source SVG`, {
      source,
      runtimeSource,
      authored,
      sourceDistances,
    });
    assert(overlay.update.status === 'committed', `${alias} overlay committed`, overlay);
    assert(overlay.pixelCount > 80, `${alias} overlay glyph is above the bar`, overlay);
    assert(overlay.occupancy < 0.58, `${alias} overlay glyph is not a filled square`, overlay);
    const overlaySourceDistances = aliases
      .map((candidate) => ({
        alias: candidate,
        distance: signatureDistance(overlay.signature, result.runtimeSource[candidate].signature),
      }))
      .sort((left, right) => left.distance - right.distance || left.alias.localeCompare(right.alias));
    assert(overlaySourceDistances[0]?.alias === alias &&
      overlaySourceDistances[0].distance < overlaySourceDistances[1].distance,
    `${alias} overlay runtime texture is uniquely closest to its original source SVG`, {
      overlay,
      overlaySourceDistances,
    });
    assert(result.authoredStatuses[alias].resource?.state === 'resolved',
      `${alias} authored capture settled the asset`, result.authoredStatuses[alias]);
    assert(result.overlayStatuses[alias].resource?.state === 'resolved',
      `${alias} overlay capture settled the asset`, result.overlayStatuses[alias]);
    authoredSignatures.add(authored.signature);
    overlaySignatures.add(overlay.signature);
  }
  assert(signatureDistance(
    result.inverter24.runtime.signature,
    result.inverter24.runtimeSource.signature,
  ) <= 4, '24px inverter runtime texture resolves the original inverter SVG', result.inverter24);
  assert(result.inverter24.runtime.bounds?.width === 18 &&
    result.inverter24.runtime.bounds?.height === 18 &&
    result.inverter24.source.bounds?.width === 18 &&
    result.inverter24.source.bounds?.height === 18,
  '24px draw box preserves the 54/72 artwork ratio as an 18px visible glyph',
  result.inverter24);
  assert(result.injectedInverterFrame24.runtime.bounds?.width === 18 &&
    result.injectedInverterFrame24.runtime.bounds?.height === 18 &&
    result.injectedInverterFrame24.runtime.signature === result.inverter24.source.signature,
  'host-injected SVG sizing remains untrimmed', result.injectedInverterFrame24);
  assert(result.injectedInverterFrame24.status.resource?.state === 'resolved',
    'host-injected SVG capture settles the asset', result.injectedInverterFrame24);
  assert(result.hidden.pixelCount === 0, 'hidden overlay icon has no red pixels', result.hidden);
  assert(authoredSignatures.size === aliases.length, 'every builtin has a distinct raster silhouette', result);
  assert(overlaySignatures.size === aliases.length,
    'every overlay builtin has a distinct raster silhouette', result);
  assert(result.runtimeBeforeDestroy.resourceCount === 7,
    'five required fonts plus active builtin and host alias remain leased', result);
  assert(result.runtimeBeforeDestroy.pendingCount === 0, 'capture leaves no pending assets', result);
  assert(result.runtimeBeforeDestroy.leaseCount === 7,
    'five required fonts plus active builtin and host alias each have one lease', result);
  assert(result.runtimeAfterDestroy.resourceCount === 0, 'destroy releases builtin texture', result);
  assert(result.runtimeAfterDestroy.leaseCount === 0, 'destroy releases builtin lease', result);
  assert(result.destroy === true && result.canvasCountAfterDestroy === 0,
    'destroy removes canvas', result);
  assert(errors.length === 0, 'browser has no cache/console/page/network errors', errors);

  process.stdout.write(`${JSON.stringify({
    revision: 'patch-map-builtin-assets-browser/2',
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
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) {
    return Number.POSITIVE_INFINITY;
  }
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) distance += 1;
  }
  return distance;
}
