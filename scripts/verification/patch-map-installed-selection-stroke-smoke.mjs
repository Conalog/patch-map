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
    '<div id="host" style="width:1000px;height:800px"></div>',
    '<script type="module" src="/main.js"></script>',
    '</body></html>',
  ].join('\n'));
  await writeFile(path.join(temporary, 'main.js'), `
import { PatchMap } from '@conalog/patch-map';

const map = await PatchMap.mount({
  container: document.querySelector('#host'),
  width: 1000,
  height: 800,
  pixelRatio: 1,
  resizeMode: 'manual',
  background: '#000000',
  fit: false,
  zoomLimits: [0.05, 30],
  data: [{
    type: 'grid',
    id: 'selected-grid',
    attrs: { x: 100, y: 100, display: 'panelGroup' },
    cells: Array.from({ length: 5 }, () => Array(5).fill(1)),
    gap: 20,
    item: {
      size: { width: 80, height: 60 },
      components: [
        {
          type: 'background',
          id: 'surface',
          source: {
            type: 'rect',
            fill: '#ffffff',
            borderWidth: 2,
            borderColor: '#063559',
            radius: 6,
          },
        },
        {
          type: 'bar',
          id: 'usage',
          show: true,
          source: { type: 'rect', fill: '#ffffff' },
          tint: '#1e3a5f',
          size: { width: 74, height: 54 },
          placement: 'center',
          animation: false,
        },
      ],
    },
  }],
  selection: {
    allowMultiple: true,
    visual: {
      color: '#ef4444',
      strokeWidth: 3,
      strokeScale: 'viewport',
      minStrokeWidth: 1,
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
let rendererPixelRatio = 1;

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
  const matches = (x, y) => matchesColor(capture, color, x, y);
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

function matchesColor(capture, color, x, y) {
  const offset = (y * capture.width + x) * 4;
  const red = capture.pixels[offset];
  const green = capture.pixels[offset + 1];
  const blue = capture.pixels[offset + 2];
  const alpha = capture.pixels[offset + 3];
  if (color === 'red') {
    return red > 140 && red > green * 1.5 && red > blue * 1.5 && alpha > 180;
  }
  if (color === 'navy') {
    return red < 45 && green >= 35 && green < 100 && blue >= 60 && blue < 140 && alpha > 180;
  }
  return red < 60 && green > 110 && blue > 180 && alpha > 180;
}

function analyzeStraightEdges(baseline, selected, bounds) {
  const centerX = Math.round((bounds.targetMinX + bounds.targetMaxX) / 2);
  const centerY = Math.round((bounds.targetMinY + bounds.targetMaxY) / 2);
  const edges = {
    top: [],
    bottom: [],
    left: [],
    right: [],
  };
  for (let y = bounds.targetMinY; y <= bounds.targetMaxY; y += 1) {
    if (!matchesColor(baseline, 'navy', centerX, y)) continue;
    (y <= centerY ? edges.top : edges.bottom).push([centerX, y]);
  }
  for (let x = bounds.targetMinX; x <= bounds.targetMaxX; x += 1) {
    if (!matchesColor(baseline, 'navy', x, centerY)) continue;
    (x <= centerX ? edges.left : edges.right).push([x, centerY]);
  }
  return Object.fromEntries(Object.entries(edges).map(([edge, points]) => [edge, {
    navyPixels: points.length,
    redOverlapPixels: points.filter(([x, y]) => matchesColor(selected, 'red', x, y)).length,
  }]));
}

async function capturePersistent() {
  map.selection.clear();
  const baseline = await capturePixels();
  map.selection.set('selected-grid.2.2');
  const selected = await capturePixels();
  const red = analyzeColor(selected, 'red');
  let targetMinX = Number.POSITIVE_INFINITY;
  let targetMaxX = Number.NEGATIVE_INFINITY;
  let targetMinY = Number.POSITIVE_INFINITY;
  let targetMaxY = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < baseline.pixels.length; index += 4) {
    const pixel = index / 4;
    const x = pixel % baseline.width;
    const y = Math.floor(pixel / baseline.width);
    if (
      x < red.bounds.minX || x > red.bounds.maxX ||
      y < red.bounds.minY || y > red.bounds.maxY ||
      !matchesColor(baseline, 'navy', x, y)
    ) continue;
    targetMinX = Math.min(targetMinX, x);
    targetMaxX = Math.max(targetMaxX, x);
    targetMinY = Math.min(targetMinY, y);
    targetMaxY = Math.max(targetMaxY, y);
  }
  if (!Number.isFinite(targetMinX) || !Number.isFinite(targetMinY)) {
    throw new Error('installed artifact baseline has no navy target paint');
  }
  const centerX = Math.floor((targetMinX + targetMaxX) / 2);
  const centerY = Math.floor((targetMinY + targetMaxY) / 2);
  const centerOffset = (centerY * baseline.width + centerX) * 4;
  const selectedCenterOffset = (centerY * selected.width + centerX) * 4;
  const baselineCenter = [...baseline.pixels.slice(centerOffset, centerOffset + 4)];
  const selectedCenter = [
    ...selected.pixels.slice(selectedCenterOffset, selectedCenterOffset + 4),
  ];
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
    targetCenter: { baseline: baselineCenter, selected: selectedCenter },
    straightEdges: analyzeStraightEdges(baseline, selected, {
      targetMinX,
      targetMaxX,
      targetMinY,
      targetMaxY,
    }),
  };
}

async function captureLowZoomGrid() {
  map.selection.clear();
  const baseline = await capturePixels();
  map.selection.set(Array.from({ length: 25 }, (_, index) =>
    'selected-grid.' + Math.floor(index / 5) + '.' + (index % 5)));
  const selected = await capturePixels();
  const red = analyzeColor(selected, 'red');
  const bboxArea = (red.bounds.maxX - red.bounds.minX + 1) *
    (red.bounds.maxY - red.bounds.minY + 1);
  let targetInteriorPixels = 0;
  let baselineTargetPixels = 0;
  for (let y = red.bounds.minY; y <= red.bounds.maxY; y += 1) {
    for (let x = red.bounds.minX; x <= red.bounds.maxX; x += 1) {
      if (matchesColor(baseline, 'navy', x, y)) baselineTargetPixels += 1;
      if (matchesColor(selected, 'navy', x, y)) targetInteriorPixels += 1;
    }
  }
  return {
    ...red,
    bboxArea,
    projectedWidthCss: (red.bounds.maxX - red.bounds.minX + 1) / rendererPixelRatio,
    projectedHeightCss: (red.bounds.maxY - red.bounds.minY + 1) / rendererPixelRatio,
    redCoverage: red.pixelCount / bboxArea,
    baselineTargetPixels,
    targetInteriorPixels,
    targetInteriorRetention: baselineTargetPixels === 0
      ? 0
      : targetInteriorPixels / baselineTargetPixels,
  };
}

window.__PATCH_MAP_SELECTION_STROKE__ = {
  phase: 'ready',
  setScale(scale) {
    const current = map.viewport.state.scale;
    map.viewport.zoomBy(scale / current, [100, 100]);
  },
  resize(pixelRatio) {
    rendererPixelRatio = pixelRatio;
    map.viewport.resize(1000, 800, pixelRatio);
  },
  persistent: () => capturePersistent(),
  lowZoomGrid: () => captureLowZoomGrid(),
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
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
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
  for (const pixelRatio of [1, 2]) {
    const scale = 5;
    await page.evaluate((value) => window.__PATCH_MAP_SELECTION_STROKE__.resize(value), pixelRatio);
    await page.evaluate((value) => window.__PATCH_MAP_SELECTION_STROKE__.setScale(value), scale);
    persistent.push({
      scale,
      pixelRatio,
      ...(await page.evaluate(() => window.__PATCH_MAP_SELECTION_STROKE__.persistent())),
    });
  }

  const lowZoom = [];
  for (const pixelRatio of [1, 2]) {
    const scale = 0.1;
    await page.evaluate((value) => window.__PATCH_MAP_SELECTION_STROKE__.resize(value), pixelRatio);
    await page.evaluate((value) => window.__PATCH_MAP_SELECTION_STROKE__.setScale(value), scale);
    lowZoom.push({
      scale,
      pixelRatio,
      ...(await page.evaluate(() => window.__PATCH_MAP_SELECTION_STROKE__.lowZoomGrid())),
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
    lowZoom,
    marquee: marqueeMeasurement,
    destroyed,
    canvasCountAfterDestroy,
    errors,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  const persistentStable = persistentMeasurements.every(({ cssPx }) => cssPx >= 2 && cssPx <= 4);
  const persistentOutside = persistentMeasurements.every(({
    backingPx,
    outsideExtents,
    straightEdges,
    targetCenterPreserved,
  }) =>
    Object.values(outsideExtents).every((extent) => extent >= backingPx - 1) &&
    Object.values(straightEdges).every(({ navyPixels, redOverlapPixels }) =>
      navyPixels > 0 && redOverlapPixels === 0) &&
    targetCenterPreserved === true);
  const marqueeStable = marqueeMeasurement.cssPx >= 0.5 && marqueeMeasurement.cssPx <= 2;
  const lowZoomLegible = lowZoom.every(({
    projectedWidthCss,
    projectedHeightCss,
    redCoverage,
    targetInteriorPixels,
    targetInteriorRetention,
  }) =>
    projectedWidthCss >= 35 && projectedWidthCss <= 60 &&
    projectedHeightCss >= 25 && projectedHeightCss <= 50 &&
    redCoverage < 0.9 && targetInteriorPixels > 0 && targetInteriorRetention > 0.5);
  if (
    !persistentStable ||
    !persistentOutside ||
    !marqueeStable ||
    !lowZoomLegible ||
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
