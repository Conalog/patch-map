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
const artifact = process.argv[2];
if (artifact === undefined || !path.isAbsolute(artifact)) {
  throw new Error('usage: patch-map-installed-builtin-assets-smoke.mjs /absolute/artifact.tgz');
}

const root = process.cwd();
const sourceSvg = await readFile(path.join(root, 'src/assets/icons/inverter.svg'), 'utf8');
const sourceDigest = createHash('sha256').update(sourceSvg).digest('hex');
const artifactBytes = await readFile(artifact);
const artifactSha256 = createHash('sha256').update(artifactBytes).digest('hex');
const temporary = await mkdtemp(path.join(tmpdir(), 'patch-map-installed-builtin-'));
let server;
let browser;

try {
  await writeFile(path.join(temporary, 'package.json'), `${JSON.stringify({
    name: 'patch-map-installed-builtin-assets-smoke',
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
    '<div id="map" style="width:80px;height:80px"></div>',
    '<script type="module" src="/main.js"></script>',
    '</body></html>',
  ].join('\n'));
  await writeFile(path.join(temporary, 'main.js'), `
import { PatchMap } from '@conalog/patch-map';

const host = document.querySelector('#map');
const sourceSvg = ${JSON.stringify(sourceSvg)};
const sourceDataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sourceSvg);
const scene = (source, show = true) => [{
  type: 'grid',
  id: 'owner-grid',
  attrs: { x: 20, y: 20 },
  cells: [[1]],
  item: {
    size: { width: 40, height: 40 },
    components: [{
      type: 'bar',
      id: 'frame',
      source: { type: 'rect', fill: '#ffffff' },
      size: { width: 40, height: 40 },
      placement: 'center',
      tint: '#1d4ed8',
      animation: false,
    }, {
      type: 'icon',
      id: 'status',
      source,
      size: 24,
      placement: 'center',
      tint: '#22c55e',
      show,
      attrs: { zIndex: 10 },
    }],
  },
}];

function mask(pixels, width, height, color) {
  const points = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const red = pixels[offset];
      const green = pixels[offset + 1];
      const blue = pixels[offset + 2];
      const alpha = pixels[offset + 3];
      const matches = color === 'green'
        ? green > 110 && green > red * 1.3 && green > blue * 1.3 && alpha > 180
        : color === 'red'
          ? red > 120 && red > green * 1.5 && red > blue * 1.5 && alpha > 180
          : blue > 120 && blue > red * 1.5 && blue > green * 1.1 && alpha > 180;
      if (matches) points.push([x, y]);
    }
  }
  if (points.length === 0) return { pixelCount: 0, bounds: null, signature: '' };
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const bounds = {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
  const buckets = Array.from({ length: 8 }, () => Array(8).fill(0));
  for (const [x, y] of points) {
    const bucketX = Math.min(7, Math.floor(((x - minX) * 8) / bounds.width));
    const bucketY = Math.min(7, Math.floor(((y - minY) * 8) / bounds.height));
    buckets[bucketY][bucketX] += 1;
  }
  return {
    pixelCount: points.length,
    bounds,
    signature: buckets
      .map((row) => row.map((count) => count >= 1 ? '1' : '0').join(''))
      .join('/'),
  };
}

async function capture(map) {
  const capture = await map.capture.png();
  const image = new Image();
  image.src = capture.dataUrl;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  return {
    green: mask(pixels, canvas.width, canvas.height, 'green'),
    red: mask(pixels, canvas.width, canvas.height, 'red'),
    frame: mask(pixels, canvas.width, canvas.height, 'blue'),
  };
}

let map = null;
try {
  map = await PatchMap.mount({
    container: host,
    width: 80,
    height: 80,
    resizeMode: 'manual',
    fit: false,
    background: '#000000',
    data: scene('inverter'),
    assets: [{ alias: 'inverterFrame', descriptor: sourceDataUri }],
    assetPolicy: () => undefined,
  });
  const authored = await capture(map);
  const authoredStatus = map.assets.status('inverter').runtime;

  await map.data.replaceAsync(scene('device', false), { strict: true, fit: false });
  const hidden = await capture(map);
  const overlayUpdate = map.updateBatch({
    targets: ['owner-grid.0.0'],
    icon: {
      componentId: 'status',
      changes: { show: [true], source: ['inverter'], tint: ['#ef4444'] },
    },
  });
  const overlay = await capture(map);
  const overlayStatus = map.assets.status('inverter').runtime;

  await map.data.replaceAsync(scene('inverterFrame'), { strict: true, fit: false });
  const injected = await capture(map);
  const injectedStatus = map.assets.status('inverterFrame').runtime;
  const runtimeBeforeDestroy = map.assets.status().runtime;
  const destroy = await map.destroy();
  map = null;
  window.__PATCH_MAP_INSTALLED_BUILTIN__ = {
    phase: 'complete',
    configured: { owner: { width: 40, height: 40 }, iconDrawBox: { width: 24, height: 24 } },
    authored,
    authoredStatus,
    hidden,
    overlayUpdate,
    overlay,
    overlayStatus,
    injected,
    injectedStatus,
    runtimeBeforeDestroy,
    destroy,
    canvasCountAfterDestroy: host.querySelectorAll('canvas').length,
  };
} finally {
  await map?.destroy().catch(() => undefined);
}
`);

  server = await createServer({
    root: temporary,
    configFile: false,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  if (!baseUrl) throw new Error('installed builtin smoke server has no URL');

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 80, height: 80 } });
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.text().includes('[Assets] Asset id')) {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('requestfailed', (request) => {
    errors.push(`request: ${request.url()} ${request.failure()?.errorText ?? ''}`);
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => window.__PATCH_MAP_INSTALLED_BUILTIN__?.phase === 'complete',
    undefined,
    { timeout: 30_000 },
  );
  const result = await page.evaluate(() => window.__PATCH_MAP_INSTALLED_BUILTIN__);

  assert(sourceDigest === 'd7527c15410edb84e560a9dcd763edf4914be13494c5a99509c373dff803992d',
    'inverter source digest is exact PatchMap', sourceDigest);
  assert(sourceSvg.includes('width="72" height="72" viewBox="0 0 72 72"'),
    'inverter source keeps its 72x72 canvas', sourceSvg.slice(0, 160));
  assert(result.configured.iconDrawBox.width === 24 && result.configured.iconDrawBox.height === 24,
    'public icon draw box is 24x24', result.configured);
  assert(result.authored.green.bounds?.width === 18 &&
    result.authored.green.bounds?.height === 18,
  'builtin inverter preserves 54/72 padding as an 18x18 visible glyph', result.authored);
  assert(result.authored.frame.bounds?.width === 40 && result.authored.frame.bounds?.height === 40,
    '40x40 owner frame is unchanged', result.authored);
  assert(result.authored.green.bounds.width / result.configured.owner.width === 0.45,
    'visible inverter occupies 45% of its 40px owner', result.authored);
  assert(result.hidden.red.pixelCount === 0, 'hidden authored icon has no overlay pixels', result.hidden);
  assert(result.overlayUpdate.status === 'committed' &&
    result.overlay.red.bounds?.width === 18 && result.overlay.red.bounds?.height === 18,
  'concrete inverter overlay preserves the same padded texture', result.overlay);
  assert(result.overlay.frame.bounds?.width === 40 && result.overlay.frame.bounds?.height === 40,
    'overlay does not change owner layout', result.overlay);
  assert(result.injected.green.bounds?.width === 18 && result.injected.green.bounds?.height === 18,
    'host-injected raw SVG keeps its authored view box', result.injected);
  assert(result.authoredStatus.resource?.state === 'resolved' &&
    result.overlayStatus.resource?.state === 'resolved' &&
    result.injectedStatus.resource?.state === 'resolved',
  'capture settles builtin, overlay, and injected sources', result);
  assert(result.runtimeBeforeDestroy.pendingCount === 0,
    'capture leaves no pending assets', result.runtimeBeforeDestroy);
  assert(result.destroy === true && result.canvasCountAfterDestroy === 0,
    'destroy completes root-owned asset cleanup and removes the package canvas', result);
  assert(errors.length === 0, 'fresh packed consumer has no asset/cache errors', errors);

  process.stdout.write(`${JSON.stringify({
    revision: 'patch-map-installed-builtin-assets-smoke/1',
    status: 'pass',
    artifact,
    artifactSha256,
    installedEntry,
    sourceDigest,
    result,
    errors,
  }, null, 2)}\n`);
} finally {
  await browser?.close().catch(() => undefined);
  await server?.close().catch(() => undefined);
  await rm(temporary, { recursive: true, force: true });
}

function assert(condition, description, details) {
  if (!condition) throw new Error(`${description}: ${JSON.stringify(details)}`);
}
