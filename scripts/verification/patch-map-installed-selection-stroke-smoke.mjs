#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const execute = promisify(execFile);
const artifactArgument = process.argv[2];
if (artifactArgument === undefined || !path.isAbsolute(artifactArgument)) {
  throw new Error('usage: patch-map-installed-selection-stroke-smoke.mjs /absolute/artifact.tgz');
}

const artifact = artifactArgument;
const artifactBytes = await readFile(artifact);
const artifactSha256 = createHash('sha256').update(artifactBytes).digest('hex');
const temporary = await mkdtemp(path.join(tmpdir(), 'patch-map-installed-selection-stroke-'));
let server;
let browser;

try {
  await writeFile(path.join(temporary, 'package.json'), `${JSON.stringify({
    name: 'patch-map-installed-selection-stroke-smoke',
    private: true,
    type: 'module',
    dependencies: {
      '@conalog/patch-map': `file:${artifact}`,
      'pixi.js': '8.19.0',
    },
  }, null, 2)}\n`);
  await execute('npm', [
    'install',
    '--offline',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
  ], { cwd: temporary, maxBuffer: 20 * 1024 * 1024 });
  const installedEntry = await realpath(
    createRequire(path.join(temporary, 'package.json')).resolve('@conalog/patch-map'),
  );
  const installedPackageRoot = await realpath(path.join(
    temporary,
    'node_modules',
    '@conalog',
    'patch-map',
  ));
  const installedEntryRelative = path.relative(installedPackageRoot, installedEntry);
  if (installedEntryRelative.startsWith('..') || path.isAbsolute(installedEntryRelative)) {
    throw new Error(`package resolved outside the fresh consumer: ${installedEntry}`);
  }

  await writeFile(path.join(temporary, 'index.html'), [
    '<!doctype html>',
    '<html><body style="margin:0;background:#000">',
    '<div id="host" style="width:320px;height:240px"></div>',
    '<script type="module" src="/main.js"></script>',
    '</body></html>',
  ].join('\n'));
  await writeFile(path.join(temporary, 'main.js'), `
import { PatchMap } from '@conalog/patch-map';

const map = await PatchMap.mount({
  container: document.querySelector('#host'),
  width: 320,
  height: 240,
  pixelRatio: 1,
  resizeMode: 'manual',
  background: '#000000',
  fit: false,
  data: [{
    type: 'grid',
    id: 'selected-grid',
    attrs: { x: 50, y: 50, display: 'panelGroup' },
    cells: [[1]],
    item: {
      size: { width: 80, height: 60 },
      components: [{
        type: 'bar',
        id: 'usage',
        show: true,
        source: { type: 'rect', fill: '#ffffff' },
        tint: '#1e3a5f',
        size: { width: 80, height: 60 },
        placement: 'center',
        animation: false,
      }],
    },
  }],
  selection: {
    allowMultiple: true,
    visual: {
      color: '#ef4444',
      strokeWidth: 3,
      strokeAlignment: 'outside',
      displayMode: 'element-only',
    },
    box: {
      activationModifier: 'shift',
      partialIntersection: true,
      visual: { color: '#1099ff', strokeWidth: 1, fillAlpha: 0.08 },
    },
  },
});

async function capturePixels() {
  const capture = await map.capture.png();
  const image = new Image();
  image.src = capture.dataUrl;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  return {
    width: canvas.width,
    height: canvas.height,
    pixels: context.getImageData(0, 0, canvas.width, canvas.height).data,
  };
}

function analyzeColor(capture, color) {
  const { width, height, pixels } = capture;
  const matches = (x, y) => {
    const offset = (y * width + x) * 4;
    const red = pixels[offset];
    const green = pixels[offset + 1];
    const blue = pixels[offset + 2];
    const alpha = pixels[offset + 3];
    return color === 'red'
      ? red > 140 && red > green * 1.5 && red > blue * 1.5 && alpha > 180
      : red < 60 && green > 110 && blue > 180 && alpha > 180;
  };
  const points = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (matches(x, y)) points.push([x, y]);
    }
  }
  if (points.length === 0) return { cssPx: 0, backingPx: 0, pixelCount: 0 };
  const minX = Math.min(...points.map(([x]) => x));
  const maxX = Math.max(...points.map(([x]) => x));
  const centerX = Math.round((minX + maxX) / 2);
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    if (matches(centerX, y)) rows.push(y);
  }
  const runs = [];
  for (const row of rows) {
    const last = runs.at(-1);
    if (last && row === last.end + 1) last.end = row;
    else runs.push({ start: row, end: row });
  }
  const backingPx = Math.max(...runs.map(({ start, end }) => end - start + 1));
  return {
    backingPx,
    pixelCount: points.length,
    bounds: { minX, maxX, minY: Math.min(...points.map(([, y]) => y)), maxY: Math.max(...points.map(([, y]) => y)) },
  };
}

async function capturePersistent() {
  map.selection.clear();
  const baseline = await capturePixels();
  map.selection.set('selected-grid.0.0');
  const selected = await capturePixels();
  const red = analyzeColor(selected, 'red');
  const targetPoints = [];
  for (let index = 0; index < baseline.pixels.length; index += 4) {
    const baselineTarget = baseline.pixels[index] < 80 &&
      baseline.pixels[index + 1] > 30 &&
      baseline.pixels[index + 2] > 60 &&
      baseline.pixels[index + 3] > 180;
    if (baselineTarget) {
      const pixel = index / 4;
      targetPoints.push([pixel % baseline.width, Math.floor(pixel / baseline.width)]);
    }
  }
  const targetMinX = Math.min(...targetPoints.map(([x]) => x));
  const targetMaxX = Math.max(...targetPoints.map(([x]) => x));
  const targetMinY = Math.min(...targetPoints.map(([, y]) => y));
  const targetMaxY = Math.max(...targetPoints.map(([, y]) => y));
  const centerX = Math.floor((targetMinX + targetMaxX) / 2);
  const centerY = Math.floor((targetMinY + targetMaxY) / 2);
  const centerOffset = (centerY * baseline.width + centerX) * 4;
  const baselineCenter = [...baseline.pixels.slice(centerOffset, centerOffset + 4)];
  const selectedCenter = [...selected.pixels.slice(centerOffset, centerOffset + 4)];
  const targetWidth = targetMaxX - targetMinX + 1;
  const targetHeight = targetMaxY - targetMinY + 1;
  const redWidth = red.bounds.maxX - red.bounds.minX + 1;
  const redHeight = red.bounds.maxY - red.bounds.minY + 1;
  return {
    ...red,
    targetBounds: { targetMinX, targetMaxX, targetMinY, targetMaxY },
    outsideExtents: {
      left: targetMinX - red.bounds.minX,
      right: red.bounds.maxX - targetMaxX,
      top: targetMinY - red.bounds.minY,
      bottom: red.bounds.maxY - targetMaxY,
    },
    expectedOutsideRingPixels: redWidth * redHeight - targetWidth * targetHeight,
    targetCenterPreserved: JSON.stringify(baselineCenter) === JSON.stringify(selectedCenter),
  };
}

window.__PATCH_MAP_SELECTION_STROKE__ = {
  phase: 'ready',
  setScale(scale) {
    const current = map.viewport.state.scale;
    map.viewport.zoomBy(scale / current, [0, 0]);
  },
  resize(pixelRatio) {
    map.viewport.resize(320, 240, pixelRatio);
  },
  persistent: () => capturePersistent(),
  marquee: async () => analyzeColor(await capturePixels(), 'blue'),
  destroy: () => map.destroy(),
};
`);

  server = await createServer({
    root: temporary,
    configFile: false,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  if (!baseUrl) throw new Error('installed selection stroke smoke server has no URL');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('requestfailed', (request) => {
    errors.push(`request: ${request.url()} ${request.failure()?.errorText ?? ''}`);
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => window.__PATCH_MAP_SELECTION_STROKE__?.phase === 'ready',
    undefined,
    { timeout: 30_000 },
  );

  const persistent = [];
  for (const scale of [1, 2]) {
    const pixelRatio = 2;
    await page.evaluate((value) => window.__PATCH_MAP_SELECTION_STROKE__.resize(value), pixelRatio);
    await page.evaluate((value) => window.__PATCH_MAP_SELECTION_STROKE__.setScale(value), scale);
    persistent.push({
      scale,
      pixelRatio,
      ...(await page.evaluate(() => window.__PATCH_MAP_SELECTION_STROKE__.persistent())),
    });
  }

  await page.evaluate(() => {
    window.__PATCH_MAP_SELECTION_STROKE__.resize(2);
    window.__PATCH_MAP_SELECTION_STROKE__.setScale(1);
  });
  await page.keyboard.down('Shift');
  await page.mouse.move(150, 140);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(280, 210, { steps: 3 });
  await page.evaluate(() => window.__PATCH_MAP_SELECTION_STROKE__.setScale(2));
  const marquee = await page.evaluate(() => window.__PATCH_MAP_SELECTION_STROKE__.marquee());
  await page.mouse.up({ button: 'left' });
  await page.keyboard.up('Shift');
  const destroyed = await page.evaluate(() => window.__PATCH_MAP_SELECTION_STROKE__.destroy());
  const canvasCountAfterDestroy = await page.locator('canvas').count();
  const persistentMeasurements = persistent.map((measurement) => ({
    ...measurement,
    cssPx: measurement.backingPx / measurement.pixelRatio,
  }));
  const marqueeMeasurement = { ...marquee, cssPx: marquee.backingPx / 2 };
  const result = {
    artifact,
    artifactSha256,
    installedEntry,
    persistent: persistentMeasurements,
    marquee: marqueeMeasurement,
    destroyed,
    canvasCountAfterDestroy,
    errors,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  const persistentStable = persistentMeasurements.every(({ cssPx }) => cssPx >= 2 && cssPx <= 4);
  const persistentOutside = persistentMeasurements.every(({
    backingPx,
    pixelCount,
    outsideExtents,
    expectedOutsideRingPixels,
    targetCenterPreserved,
  }) =>
    Object.values(outsideExtents).every((extent) => extent === backingPx) &&
    pixelCount === expectedOutsideRingPixels &&
    targetCenterPreserved === true);
  const marqueeStable = marqueeMeasurement.cssPx >= 0.5 && marqueeMeasurement.cssPx <= 2;
  if (
    !persistentStable ||
    !persistentOutside ||
    !marqueeStable ||
    destroyed !== true ||
    canvasCountAfterDestroy !== 0 ||
    errors.length !== 0
  ) {
    throw new Error('installed artifact selection stroke smoke failed');
  }
} finally {
  await Promise.allSettled([browser?.close(), server?.close()]);
  await rm(temporary, { recursive: true, force: true });
}
