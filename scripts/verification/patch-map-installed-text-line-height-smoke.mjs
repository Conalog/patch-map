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
const expectation = process.argv[3] ?? 'resolved';
if (artifact === undefined || !path.isAbsolute(artifact) || !['overlap', 'resolved'].includes(expectation)) {
  throw new Error('usage: patch-map-installed-text-line-height-smoke.mjs /absolute/artifact.tgz [overlap|resolved]');
}

const artifactBytes = await readFile(artifact);
const artifactSha256 = createHash('sha256').update(artifactBytes).digest('hex');
const temporary = await mkdtemp(path.join(tmpdir(), 'patch-map-installed-text-line-height-'));
let server;
let browser;

try {
  await writeFile(path.join(temporary, 'package.json'), `${JSON.stringify({
    name: 'patch-map-installed-text-line-height-smoke',
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
    '<div id="map" style="width:620px;height:380px"></div>',
    '<script type="module" src="/main.js"></script>',
    '</body></html>',
  ].join('\n'));
  await writeFile(path.join(temporary, 'main.js'), `
import { PatchMap } from '@conalog/patch-map';

const source = '구조물 높이\\n0.8~3.2m';
const rect = (id, x, y) => ({
  type: 'rect', id, attrs: { x, y }, size: { width: 260, height: 150 },
  fill: '#ffffff',
});
const text = (id, x, y, fill, explicit = false) => ({
  type: 'text', id, attrs: { x, y }, text: source,
  style: {
    fontFamily: 'FiraCode', fontSize: 52, fill,
    ...(explicit ? { lineHeight: 20 } : {}),
  },
});

const host = document.querySelector('#map');
let map = null;
try {
  map = await PatchMap.mount({
    container: host,
    width: 620,
    height: 380,
    pixelRatio: 1,
    resizeMode: 'manual',
    background: '#000000',
    fit: false,
    data: [
      rect('standalone-bg', 20, 20),
      text('standalone-omitted', 30, 25, '#ef4444'),
      rect('explicit-bg', 330, 20),
      text('standalone-explicit', 340, 25, '#2563eb', true),
      {
        type: 'item', id: 'component-owner', attrs: { x: 20, y: 210 },
        size: { width: 260, height: 150 },
        components: [{
          type: 'background', id: 'surface',
          source: { type: 'rect', fill: '#ffffff' },
        }, {
          type: 'text', id: 'component-omitted', text: source,
          placement: 'left-top', margin: 10, tint: '#16a34a',
          style: { fontFamily: 'FiraCode', fontSize: 52 },
        }],
      },
    ],
  });

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

  function analyzeColor(kind, crop) {
    const points = [];
    const rows = new Set();
    for (let y = crop.minY; y <= crop.maxY; y += 1) {
      for (let x = crop.minX; x <= crop.maxX; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        const red = pixels[offset];
        const green = pixels[offset + 1];
        const blue = pixels[offset + 2];
        const alpha = pixels[offset + 3];
        const match = kind === 'red'
          ? red > 130 && red > green * 1.35 && red > blue * 1.35 && alpha > 170
          : kind === 'blue'
            ? blue > 120 && blue > red * 1.2 && blue > green * 1.05 && alpha > 170
            : green > 90 && green > red * 1.25 && green > blue * 1.15 && alpha > 170;
        if (match) {
          points.push([x, y]);
          rows.add(y);
        }
      }
    }
    if (points.length === 0) return { pixelCount: 0, bounds: null, rowRuns: [] };
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    const sortedRows = [...rows].sort((left, right) => left - right);
    const rowRuns = [];
    for (const row of sortedRows) {
      const last = rowRuns.at(-1);
      if (last && row === last.end + 1) last.end = row;
      else rowRuns.push({ start: row, end: row });
    }
    return {
      pixelCount: points.length,
      bounds: {
        minX: Math.min(...xs), maxX: Math.max(...xs),
        minY: Math.min(...ys), maxY: Math.max(...ys),
        width: Math.max(...xs) - Math.min(...xs) + 1,
        height: Math.max(...ys) - Math.min(...ys) + 1,
      },
      rowRuns,
    };
  }

  function analyzeWhite(crop) {
    const points = [];
    for (let y = crop.minY; y <= crop.maxY; y += 1) {
      for (let x = crop.minX; x <= crop.maxX; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        if (pixels[offset] > 235 && pixels[offset + 1] > 235 && pixels[offset + 2] > 235 && pixels[offset + 3] > 200) {
          points.push([x, y]);
        }
      }
    }
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    return {
      pixelCount: points.length,
      bounds: points.length === 0 ? null : {
        minX: Math.min(...xs), maxX: Math.max(...xs),
        minY: Math.min(...ys), maxY: Math.max(...ys),
        width: Math.max(...xs) - Math.min(...xs) + 1,
        height: Math.max(...ys) - Math.min(...ys) + 1,
      },
    };
  }

  const result = {
    omitted: analyzeColor('red', { minX: 20, maxX: 279, minY: 20, maxY: 169 }),
    explicit: analyzeColor('blue', { minX: 330, maxX: 589, minY: 20, maxY: 169 }),
    component: analyzeColor('green', { minX: 20, maxX: 279, minY: 210, maxY: 359 }),
    standaloneOwner: analyzeWhite({ minX: 20, maxX: 279, minY: 20, maxY: 169 }),
    componentOwner: analyzeWhite({ minX: 20, maxX: 279, minY: 210, maxY: 359 }),
  };
  const destroy = await map.destroy();
  map = null;
  window.__PATCH_MAP_TEXT_LINE_HEIGHT__ = {
    phase: 'complete', result, destroy,
    canvasCountAfterDestroy: host.querySelectorAll('canvas').length,
  };
} catch (error) {
  window.__PATCH_MAP_TEXT_LINE_HEIGHT__ = {
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
  if (!baseUrl) throw new Error('installed text line-height smoke server has no URL');

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 620, height: 380 } });
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('requestfailed', (request) => {
    errors.push(`request: ${request.url()} ${request.failure()?.errorText ?? ''}`);
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  try {
    await page.waitForFunction(
      () => ['complete', 'error'].includes(window.__PATCH_MAP_TEXT_LINE_HEIGHT__?.phase),
      undefined,
      { timeout: 15_000 },
    );
  } catch (error) {
    throw new Error(`installed text smoke did not complete: ${JSON.stringify(errors)}`, {
      cause: error,
    });
  }
  const observed = await page.evaluate(() => window.__PATCH_MAP_TEXT_LINE_HEIGHT__);
  assert(observed.phase === 'complete', 'installed text smoke page completed', observed);
  const { result } = observed;

  assert(result.omitted.pixelCount > 100, 'standalone omitted text is rasterized', result.omitted);
  assert(result.explicit.pixelCount > 100, 'standalone explicit control is rasterized', result.explicit);
  assert(result.component.pixelCount > 100, 'component omitted text is rasterized', result.component);
  assert(result.standaloneOwner.bounds?.width === 260 && result.standaloneOwner.bounds?.height === 150,
    'standalone white owner remains 260x150 at the authored position', result.standaloneOwner);
  assert(result.componentOwner.bounds?.width === 260 && result.componentOwner.bounds?.height === 150,
    'component white owner remains 260x150 at the authored position', result.componentOwner);
  if (expectation === 'overlap') {
    assert(result.omitted.bounds.height <= result.explicit.bounds.height + 8,
      'baseline omitted line height has the same overlapping extent as explicit 20px', result);
  } else {
    assert(result.omitted.bounds.height >= result.explicit.bounds.height + 28,
      'resolved omitted line height separates the standalone lines', result);
    assert(result.component.bounds.height >= result.explicit.bounds.height + 28,
      'component text shares the resolved omitted line height', result);
  }
  assert(observed.destroy === true && observed.canvasCountAfterDestroy === 0,
    'destroy removes the root-owned canvas', observed);
  assert(errors.length === 0, 'fresh installed consumer has no browser errors', errors);

  process.stdout.write(`${JSON.stringify({
    revision: 'patch-map-installed-text-line-height-smoke/1',
    status: 'pass',
    expectation,
    artifact,
    artifactSha256,
    installedEntry,
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
