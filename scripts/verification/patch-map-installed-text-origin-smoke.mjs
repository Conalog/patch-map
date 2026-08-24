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
  throw new Error('usage: patch-map-installed-text-origin-smoke.mjs /absolute/artifact.tgz');
}

const artifactBytes = await readFile(artifact);
const artifactSha256 = createHash('sha256').update(artifactBytes).digest('hex');
const temporary = await mkdtemp(path.join(tmpdir(), 'patch-map-installed-text-origin-'));
let server;
let browser;

try {
  await writeFile(path.join(temporary, 'package.json'), `${JSON.stringify({
    name: 'patch-map-installed-text-origin-smoke',
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

  await writeFile(path.join(temporary, 'index.html'), [
    '<!doctype html>',
    '<html><body style="margin:0;background:#000">',
    '<div id="map" style="width:960px;height:760px"></div>',
    '<script type="module" src="/main.js"></script>',
    '</body></html>',
  ].join('\n'));
  await writeFile(path.join(temporary, 'main.js'), `
import { PatchMap } from '@conalog/patch-map';

const host = document.querySelector('#map');
let map = null;
try {
  map = await PatchMap.mount({
    container: host,
    width: 960,
    height: 760,
    pixelRatio: 2,
    resizeMode: 'manual',
    background: '#000000',
    fit: false,
    selection: {
      visual: {
        color: '#1099ff',
        strokeWidth: 1,
        displayMode: 'element-only',
      },
    },
    data: [{
      type: 'rect',
      id: 'actual-owner',
      attrs: { x: 180, y: 115 },
      size: { width: 585, height: 271 },
      fill: '#ffffff',
    }, {
      type: 'text',
      id: 'actual-text',
      attrs: { x: 219, y: 135 },
      text: '구조물 높이\\n0.8~3.2m',
      style: {
        fontFamily: 'FiraCode',
        fontSize: 100,
        fontWeight: 400,
        fill: '#ef4444',
      },
    }, {
      type: 'text',
      id: 'rotated-text',
      attrs: { x: 760, y: 100, angle: 31 },
      text: 'R',
      style: {
        fontFamily: 'FiraCode',
        fontSize: 64,
        fontWeight: 700,
        fill: '#facc15',
      },
    }, {
      type: 'item',
      id: 'component-owner',
      attrs: { x: 50, y: 500 },
      size: { width: 320, height: 180 },
      components: [{
        type: 'background',
        id: 'surface',
        source: { type: 'rect', fill: '#ffffff' },
      }, {
        type: 'text',
        id: 'component-text',
        text: 'component',
        placement: 'left-top',
        margin: 10,
        tint: '#16a34a',
        style: { fontFamily: 'FiraCode', fontSize: 52, fontWeight: 600 },
      }],
    }],
  });
  map.selection.set('actual-text');

  async function captureAt(zoom) {
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
    const analyze = (kind, crop = null) => {
      let pixelCount = 0;
      let observedMinX = Number.POSITIVE_INFINITY;
      let observedMinY = Number.POSITIVE_INFINITY;
      let observedMaxX = Number.NEGATIVE_INFINITY;
      let observedMaxY = Number.NEGATIVE_INFINITY;
      const minX = crop?.minX ?? 0;
      const minY = crop?.minY ?? 0;
      const maxX = crop?.maxX ?? canvas.width - 1;
      const maxY = crop?.maxY ?? canvas.height - 1;
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const offset = (y * canvas.width + x) * 4;
          const red = pixels[offset];
          const green = pixels[offset + 1];
          const blue = pixels[offset + 2];
          const alpha = pixels[offset + 3];
          const match = kind === 'red'
            ? red > 145 && red > green * 1.35 && red > blue * 1.35 && alpha > 170
            : kind === 'blue'
              ? blue > 145 && blue > red * 1.25 && blue > green * 1.05 && alpha > 170
              : kind === 'green'
                ? green > 90 && green > red * 1.25 && green > blue * 1.1 && alpha > 170
                : red > 180 && green > 130 && blue < 90 && red > green * 1.1 && alpha > 170;
          if (match) {
            pixelCount += 1;
            observedMinX = Math.min(observedMinX, x);
            observedMinY = Math.min(observedMinY, y);
            observedMaxX = Math.max(observedMaxX, x);
            observedMaxY = Math.max(observedMaxY, y);
          }
        }
      }
      if (pixelCount === 0) return { pixelCount: 0, bounds: null };
      return {
        pixelCount,
        bounds: {
          minX: observedMinX,
          minY: observedMinY,
          maxX: observedMaxX,
          maxY: observedMaxY,
          width: observedMaxX - observedMinX + 1,
          height: observedMaxY - observedMinY + 1,
        },
      };
    };
    const selection = analyze('blue');
    const ratio = selection.bounds === null
      ? 0
      : (
          (selection.bounds.minX + 1) / (219 * zoom) +
          (selection.bounds.minY + 1) / (135 * zoom)
        ) / 2;
    const text = analyze('red', selection.bounds === null ? null : {
      minX: Math.max(0, selection.bounds.minX - 2),
      minY: Math.max(0, selection.bounds.minY - 2),
      maxX: Math.min(canvas.width - 1, selection.bounds.maxX + 2),
      maxY: Math.min(canvas.height - 1, selection.bounds.maxY + 2),
    });
    return {
      zoom,
      ratio,
      width: canvas.width,
      height: canvas.height,
      text,
      selection,
      component: analyze('green', {
        minX: Math.floor(40 * ratio * zoom),
        minY: Math.floor(490 * ratio * zoom),
        maxX: Math.min(canvas.width - 1, Math.ceil(380 * ratio * zoom)),
        maxY: Math.min(canvas.height - 1, Math.ceil(690 * ratio * zoom)),
      }),
      rotated: analyze('orange'),
      normalizedOriginDelta: text.bounds && selection.bounds ? {
        x: (text.bounds.minX - selection.bounds.minX - 1) / ratio / zoom,
        y: (text.bounds.minY - selection.bounds.minY - 1) / ratio / zoom,
      } : null,
    };
  }

  const one = await captureAt(1);
  map.viewport.zoomBy(2, [0, 0]);
  const two = await captureAt(2);
  const destroy = await map.destroy();
  map = null;
  window.__PATCH_MAP_TEXT_ORIGIN__ = {
    phase: 'complete',
    one,
    two,
    destroy,
    canvasCountAfterDestroy: host.querySelectorAll('canvas').length,
  };
} catch (error) {
  window.__PATCH_MAP_TEXT_ORIGIN__ = {
    phase: 'error',
    message: error instanceof Error ? error.message : String(error),
  };
  throw error;
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
  if (!baseUrl) throw new Error('installed text-origin smoke server has no URL');

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 960, height: 760 } });
  const errors = [];
  const driverWarnings = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      const observation = `console ${message.type()}: ${message.text()}`;
      if (message.type() === 'warning' && message.text().includes('GL Driver Message')) {
        driverWarnings.push(observation);
      } else {
        errors.push(observation);
      }
    }
  });
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('requestfailed', (request) => {
    errors.push(`request: ${request.url()} ${request.failure()?.errorText ?? ''}`);
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  try {
    await page.waitForFunction(
      () => ['complete', 'error'].includes(window.__PATCH_MAP_TEXT_ORIGIN__?.phase),
      undefined,
      { timeout: 15_000 },
    );
  } catch (error) {
    throw new Error(`installed text-origin smoke did not complete: ${JSON.stringify(errors)}`, {
      cause: error,
    });
  }
  const observed = await page.evaluate(() => window.__PATCH_MAP_TEXT_ORIGIN__);
  assert(observed.phase === 'complete', 'installed text-origin page completed', observed);
  for (const sample of [observed.one, observed.two]) {
    assert(Math.abs(sample.ratio - 2) <= 0.02, 'capture preserves DPR2 backing coordinates', sample);
    assert(sample.text.pixelCount > 1_000, 'multiline standalone text is rasterized', sample.text);
    assert(sample.selection.pixelCount > 500, 'standalone selection bounds are rasterized', sample.selection);
    assert(sample.normalizedOriginDelta !== null, 'origin delta is measurable', sample);
    assert(sample.normalizedOriginDelta.x >= -2 && sample.normalizedOriginDelta.x <= 24,
      'standalone glyph left edge stays at the authored origin without half-box drift', sample);
    assert(sample.normalizedOriginDelta.y >= -2 && sample.normalizedOriginDelta.y <= 28,
      'standalone glyph top edge stays at the authored origin without half-box drift', sample);
  }
  assert(Math.abs(observed.one.normalizedOriginDelta.x - observed.two.normalizedOriginDelta.x) <= 3,
    'zoom preserves the standalone x-origin projection', observed);
  assert(Math.abs(observed.one.normalizedOriginDelta.y - observed.two.normalizedOriginDelta.y) <= 3,
    'zoom preserves the standalone y-origin projection', observed);
  assert(observed.one.component.pixelCount > 300,
    'component text remains rasterized in its semantic placement lane', observed.one.component);
  assert(observed.one.rotated.pixelCount > 100,
    'rotated standalone text remains rasterized', observed.one.rotated);
  assert(observed.destroy === true && observed.canvasCountAfterDestroy === 0,
    'destroy removes the root-owned canvas', observed);
  assert(errors.length === 0, 'fresh installed consumer has no browser warnings or errors', errors);

  process.stdout.write(`${JSON.stringify({
    revision: 'patch-map-installed-text-origin-smoke/1',
    status: 'pass',
    artifact,
    artifactSha256,
    installedEntry,
    one: observed.one,
    two: observed.two,
    errors,
    driverWarnings,
  }, null, 2)}\n`);
} finally {
  await browser?.close().catch(() => undefined);
  await server?.close().catch(() => undefined);
  await rm(temporary, { recursive: true, force: true });
}

function assert(condition, description, details) {
  if (!condition) throw new Error(`${description}: ${JSON.stringify(details)}`);
}
