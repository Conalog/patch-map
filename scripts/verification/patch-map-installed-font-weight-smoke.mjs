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
const expectation = process.argv[3] ?? 'fixed';
if (artifact === undefined || !path.isAbsolute(artifact) || !['broken', 'fixed'].includes(expectation)) {
  throw new Error('usage: patch-map-installed-font-weight-smoke.mjs /absolute/artifact.tgz [broken|fixed]');
}

const artifactBytes = await readFile(artifact);
const artifactSha256 = createHash('sha256').update(artifactBytes).digest('hex');
const temporary = await mkdtemp(path.join(tmpdir(), 'patch-map-installed-font-weight-'));
let server;
let browser;

try {
  await writeFile(path.join(temporary, 'package.json'), `${JSON.stringify({
    name: 'patch-map-installed-font-weight-smoke',
    private: true,
    type: 'module',
    dependencies: {
      '@conalog/patch-map': `file:${artifact}`,
      'pixi.js': '8.19.0',
    },
  }, null, 2)}\n`);
  await execute('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: temporary,
    maxBuffer: 20 * 1024 * 1024,
  });

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
  const commonJsProbe = await execute(process.execPath, ['--input-type=commonjs', '--eval', [
    "const root = require('@conalog/patch-map');",
    "if (typeof root.PatchMap?.mount !== 'function') process.exit(2);",
    "process.stdout.write('root-cjs-ok');",
  ].join('')], { cwd: temporary });
  if (commonJsProbe.stdout !== 'root-cjs-ok') {
    throw new Error(`fresh consumer CJS root failed: ${commonJsProbe.stdout}`);
  }

  await writeFile(path.join(temporary, 'index.html'), [
    '<!doctype html>',
    '<html><body style="margin:0;background:#111827">',
    '<div id="map-a" style="width:640px;height:340px"></div>',
    '<div id="map-b" style="width:640px;height:340px"></div>',
    '<script type="module" src="/main.js"></script>',
    '</body></html>',
  ].join('\n'));
  await writeFile(path.join(temporary, 'main.js'), `
import { PatchMap } from '@conalog/patch-map';

// Browsers are allowed to serialize a multi-word FontFace family as a quoted
// CSS string. Force that valid representation so Pixi load/unload cache keys
// must round-trip instead of only passing in Chromium builds that omit quotes.
const nativeFontFamily = Object.getOwnPropertyDescriptor(FontFace.prototype, 'family');
Object.defineProperty(FontFace.prototype, 'family', {
  configurable: true,
  enumerable: nativeFontFamily?.enumerable ?? true,
  get() {
    const family = nativeFontFamily?.get?.call(this) ?? '';
    return family.includes(' ') ? '"' + family + '"' : family;
  },
});

const ascii = '0.8~3.2m';
const phrase = '구조물 높이\\n0.8~3.2m';
const hostA = document.querySelector('#map-a');
const hostB = document.querySelector('#map-b');

const labelOwner = (id, x, y, width, height, text, fontWeight) => ({
  type: 'item', id, attrs: { x, y }, size: { width, height },
  components: [{
    type: 'background', id: 'surface',
    source: { type: 'rect', fill: '#ffffff' },
  }, {
    type: 'text', id: 'label', text, placement: 'center', tint: '#111111',
    style: { fontFamily: 'FiraCode', fontSize: 52, fontWeight },
  }],
});

function fontFaces() {
  return [...document.fonts]
    .filter((face) => face.family.replaceAll('"', '').replaceAll(' ', '') === 'FiraCode')
    .map((face) => ({ family: face.family, weight: face.weight, status: face.status }))
    .sort((left, right) => Number(left.weight) - Number(right.weight));
}

function fontPayloadResources() {
  return performance.getEntriesByType('resource')
    .filter(({ name, initiatorType }) => (
      initiatorType === 'script' && name.includes('builtin-font-payload')
    ))
    .map(({ name, duration, transferSize, encodedBodySize, decodedBodySize }) => ({
      name,
      duration,
      transferSize,
      encodedBodySize,
      decodedBodySize,
    }));
}

function analyzeBlack(pixels, canvasWidth, crop) {
  const points = [];
  const rows = new Set();
  for (let y = crop.minY; y <= crop.maxY; y += 1) {
    for (let x = crop.minX; x <= crop.maxX; x += 1) {
      const offset = (y * canvasWidth + x) * 4;
      const red = pixels[offset];
      const green = pixels[offset + 1];
      const blue = pixels[offset + 2];
      const alpha = pixels[offset + 3];
      if (red < 80 && green < 80 && blue < 80 && alpha > 180) {
        points.push([x, y]);
        rows.add(y);
      }
    }
  }
  if (points.length === 0) return { pixelCount: 0, density: 0, bounds: null, rowRuns: [] };
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const bounds = {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minY: Math.min(...ys), maxY: Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs) + 1,
    height: Math.max(...ys) - Math.min(...ys) + 1,
  };
  const rowRuns = [];
  for (const row of [...rows].sort((left, right) => left - right)) {
    const last = rowRuns.at(-1);
    if (last && row === last.end + 1) last.end = row;
    else rowRuns.push({ start: row, end: row });
  }
  return {
    pixelCount: points.length,
    density: points.length / (bounds.width * bounds.height),
    bounds,
    center: {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
    },
    rowRuns,
  };
}

async function capture(map) {
  const captured = await map.capture.png();
  const image = new Image();
  image.src = captured.dataUrl;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  return {
    regular: analyzeBlack(pixels, canvas.width, { minX: 20, maxX: 259, minY: 20, maxY: 89 }),
    semibold: analyzeBlack(pixels, canvas.width, { minX: 20, maxX: 259, minY: 105, maxY: 174 }),
    bold: analyzeBlack(pixels, canvas.width, { minX: 20, maxX: 259, minY: 190, maxY: 259 }),
    phrase: analyzeBlack(pixels, canvas.width, { minX: 300, maxX: 619, minY: 20, maxY: 179 }),
    live: analyzeBlack(pixels, canvas.width, { minX: 300, maxX: 619, minY: 200, maxY: 289 }),
  };
}

async function mountMap(host) {
  const startedAt = performance.now();
  const map = await PatchMap.mount({
    container: host,
    width: 640,
    height: 340,
    pixelRatio: 1,
    resizeMode: 'manual',
    background: '#111827',
    fit: false,
    data: [
      labelOwner('regular-owner', 20, 20, 240, 70, ascii, 400),
      labelOwner('semibold-owner', 20, 105, 240, 70, ascii, 600),
      labelOwner('bold-owner', 20, 190, 240, 70, ascii, 700),
      labelOwner('phrase-owner', 300, 20, 320, 160, phrase, 600),
      labelOwner('live-owner', 300, 200, 320, 90, ascii, 400),
    ],
  });
  return { map, mountMs: performance.now() - startedAt };
}

async function mountAndMeasure(host) {
  let map = null;
  try {
    const mounted = await mountMap(host);
    map = mounted.map;
    const facesBeforeCapture = fontFaces();
    const initial = await capture(map);
    const facesAfterCapture = fontFaces();
    const live600Update = map.update({
      id: 'live-owner',
      text: { componentId: 'label', style: { fontWeight: 600 } },
    });
    const live600 = await capture(map);
    const live700Update = map.update({
      id: 'live-owner',
      text: { componentId: 'label', style: { fontWeight: 700 } },
    });
    const live700 = await capture(map);
    const runtimeBeforeDestroy = map.assets.status().runtime;
    const destroy = await map.destroy();
    map = null;
    return {
      facesBeforeCapture,
      facesAfterCapture,
      mountMs: mounted.mountMs,
      fontPayloadResources: fontPayloadResources(),
      initial,
      live600Update,
      live600: live600.live,
      live700Update,
      live700: live700.live,
      runtimeBeforeDestroy,
      destroy,
      facesAfterDestroy: fontFaces(),
      canvasCountAfterDestroy: host.querySelectorAll('canvas').length,
    };
  } finally {
    await map?.destroy().catch(() => undefined);
  }
}

async function measureSharedInstances() {
  performance.clearResourceTimings();
  let first = null;
  let second = null;
  try {
    first = await mountMap(hostA);
    await first.map.capture.png();
    const facesAfterFirstMount = fontFaces();
    second = await mountMap(hostB);
    await second.map.capture.png();
    const firstMountMs = first.mountMs;
    const secondMountMs = second.mountMs;
    const facesAfterSecondMount = fontFaces();
    const runtimeWithBoth = second.map.assets.status().runtime;
    const warmPayloadResources = fontPayloadResources();
    await first.map.destroy();
    first = null;
    const facesAfterFirstDestroy = fontFaces();
    const runtimeAfterFirstDestroy = second.map.assets.status().runtime;
    await second.map.destroy();
    second = null;
    return {
      firstMountMs,
      secondMountMs,
      facesAfterFirstMount,
      facesAfterSecondMount,
      runtimeWithBoth,
      warmPayloadResources,
      facesAfterFirstDestroy,
      runtimeAfterFirstDestroy,
      facesAfterSecondDestroy: fontFaces(),
      canvasCountAfterDestroy: document.querySelectorAll('canvas').length,
    };
  } finally {
    await first?.map.destroy().catch(() => undefined);
    await second?.map.destroy().catch(() => undefined);
  }
}

try {
  performance.clearResourceTimings();
  const first = await mountAndMeasure(hostA);
  const shared = await measureSharedInstances();
  window.__PATCH_MAP_FONT_WEIGHT__ = { phase: 'complete', first, shared };
} catch (error) {
  window.__PATCH_MAP_FONT_WEIGHT__ = {
    phase: 'error',
    message: error instanceof Error ? error.message : String(error),
  };
  throw error;
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
  if (!baseUrl) throw new Error('installed font-weight smoke server has no URL');

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 640, height: 340 } });
  const errors = [];
  const assetTraffic = [];
  page.on('request', (request) => {
    if (request.url().includes('FiraCode-') || request.url().includes('/.vite/deps/chunk-')) {
      assetTraffic.push({ phase: 'request', url: request.url() });
    }
  });
  page.on('response', (response) => {
    if (response.url().includes('FiraCode-') || response.url().includes('/.vite/deps/chunk-')) {
      assetTraffic.push({ phase: 'response', url: response.url(), status: response.status() });
    }
  });
  page.on('console', (message) => {
    if (message.type() === 'error' || message.text().includes('[Assets]')) {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('requestfailed', (request) => {
    errors.push(`request: ${request.url()} ${request.failure()?.errorText ?? ''}`);
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => ['complete', 'error'].includes(window.__PATCH_MAP_FONT_WEIGHT__?.phase),
    undefined,
    { timeout: 15_000 },
  );
  // Pixi's asset teardown warning is delivered through the browser console
  // after the final FontFace unload promise resolves. Keep the packed smoke
  // alive long enough to observe that queue instead of racing page teardown.
  await page.waitForTimeout(100);
  const observed = await page.evaluate(() => window.__PATCH_MAP_FONT_WEIGHT__);
  assert(observed.phase === 'complete', 'installed font-weight page completed', {
    observed,
    errors,
    assetTraffic,
  });
  assert(errors.length === 0, 'fresh installed consumer has no browser/cache errors', errors);
  const { first, shared } = observed;
  const weights = first.facesAfterCapture.map(({ weight }) => weight);

  for (const measurement of [
    first.initial.regular,
    first.initial.semibold,
    first.initial.bold,
    first.initial.phrase,
    first.live600,
    first.live700,
  ]) {
    assert(measurement.pixelCount > 100, 'text raster contains visible dark pixels', measurement);
  }
  assert(first.initial.phrase.rowRuns.length === 2,
    'CJK+ASCII phrase retains the two resolved line runs', first.initial.phrase);
  assert(first.live600Update.status === 'committed' && first.live700Update.status === 'committed',
    'public live font-weight updates commit', first);
  if (expectation === 'broken') {
    assert(weights.length !== 5,
      'baseline proves package font faces are not ready at first capture', first.facesAfterCapture);
  } else {
    assert(JSON.stringify(weights) === JSON.stringify(['300', '400', '500', '600', '700']),
      'all five exact package faces are ready before first capture', first.facesAfterCapture);
    assert(first.facesAfterCapture.every(({ status }) => status === 'loaded'),
      'every package font face is loaded', first.facesAfterCapture);
    assert(first.initial.regular.pixelCount < first.initial.semibold.pixelCount &&
      first.initial.semibold.pixelCount < first.initial.bold.pixelCount,
    'static raster density distinguishes 400, 600, and 700', first.initial);
    assert(first.initial.regular.bounds.width === first.initial.semibold.bounds.width &&
      first.initial.semibold.bounds.width === first.initial.bold.bounds.width,
    'monospaced weight faces keep ASCII advance width stable', first.initial);
    assert(first.live600.pixelCount > first.initial.live.pixelCount &&
      first.live700.pixelCount > first.live600.pixelCount,
    'live 400→600→700 update changes only the expected raster weight', first);
    assert(first.fontPayloadResources.length === 1,
      'cold mount transfers one isolated font payload chunk', first.fontPayloadResources);
  }
  assert(first.destroy === true && first.canvasCountAfterDestroy === 0,
    'single destroy removes the package canvas', first);
  assert(first.facesAfterDestroy.length === 0,
    'single destroy releases package-owned FontFace entries', first.facesAfterDestroy);
  assert(first.runtimeBeforeDestroy.pendingCount === 0,
    'capture leaves no pending package assets', first.runtimeBeforeDestroy);
  if (expectation === 'fixed') {
    assert(shared.facesAfterFirstMount.length === 5 && shared.facesAfterSecondMount.length === 5,
      'concurrent mounts share five browser FontFace entries', shared);
    assert(shared.runtimeWithBoth.resourceCount === 5 && shared.runtimeWithBoth.leaseCount === 10,
      'concurrent mounts share five resources with two instance leases each', shared.runtimeWithBoth);
    assert(shared.warmPayloadResources.length === 0,
      'warm concurrent mounts reuse the evaluated font payload module', shared.warmPayloadResources);
    assert(shared.runtimeAfterFirstDestroy.resourceCount === 5 &&
      shared.runtimeAfterFirstDestroy.leaseCount === 5,
    'destroying one instance retains resources leased by the other', shared.runtimeAfterFirstDestroy);
    assert(shared.facesAfterFirstDestroy.length === 5,
      'destroying one instance retains shared browser FontFace entries', shared.facesAfterFirstDestroy);
    assert(shared.facesAfterSecondDestroy.length === 0 && shared.canvasCountAfterDestroy === 0,
      'destroying the final instance releases faces and canvases', shared);
  }
  process.stdout.write(`${JSON.stringify({
    revision: 'patch-map-installed-font-weight-smoke/1',
    status: 'pass',
    expectation,
    artifact,
    artifactSha256,
    installedEntry,
    commonJsProbe: commonJsProbe.stdout,
    observed,
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
