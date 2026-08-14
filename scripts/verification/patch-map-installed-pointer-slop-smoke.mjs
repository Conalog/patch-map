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
  throw new Error('usage: patch-map-installed-pointer-slop-smoke.mjs /absolute/artifact.tgz');
}

const artifact = artifactArgument;
const artifactBytes = await readFile(artifact);
const artifactSha256 = createHash('sha256').update(artifactBytes).digest('hex');
const temporary = await mkdtemp(path.join(tmpdir(), 'patch-map-installed-pointer-slop-'));
let server;
let browser;

try {
  await writeFile(path.join(temporary, 'package.json'), `${JSON.stringify({
    name: 'patch-map-installed-pointer-slop-smoke',
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
    '<html><body style="margin:0;background:#f8fafc">',
    '<div id="host" style="width:320px;height:240px"></div>',
    '<script type="module" src="/main.js"></script>',
    '</body></html>',
  ].join('\n'));
  await writeFile(path.join(temporary, 'main.js'), `
import { PatchMap } from '@conalog/patch-map';

const pixelRatio = Number(new URLSearchParams(location.search).get('pixelRatio') ?? '1');
const changes = [];
const map = await PatchMap.mount({
  container: document.querySelector('#host'),
  width: 320,
  height: 240,
  pixelRatio,
  resizeMode: 'manual',
  fit: false,
  zoomLimits: [0.05, 4],
  data: [{
    type: 'rect',
    id: 'jitter-target',
    attrs: { x: 60, y: 40 },
    size: { width: 200, height: 160 },
    fill: '#2563eb',
  }],
  pointer: { hoverDuringPress: true },
  selection: {
    allowMultiple: true,
    box: { activationModifier: 'shift', partialIntersection: true },
    visual: { color: '#ef4444', strokeWidth: 3, displayMode: 'element-only' },
  },
});
const release = map.selection.onPointerChange((change) => {
  changes.push({
    selected: change.selected.map(({ id }) => id),
    added: change.added.map(({ id }) => id),
    removed: change.removed.map(({ id }) => id),
  });
});
const originalCenter = [...map.viewport.state.centerWorld];

function reset(scale) {
  map.selection.clear();
  const currentScale = map.viewport.state.scale;
  map.viewport.zoomBy(scale / currentScale, [160, 120]);
  const current = map.viewport.state;
  map.viewport.panBy([
    (current.centerWorld[0] - originalCenter[0]) * current.scale,
    (current.centerWorld[1] - originalCenter[1]) * current.scale,
  ]);
  changes.length = 0;
  return snapshot();
}

function snapshot() {
  const debug = map.debug.snapshot();
  return {
    selectionIds: [...map.selection.ids],
    viewport: structuredClone(map.viewport.state),
    viewRevision: debug.revisions.viewRevision,
    pointerChanges: structuredClone(changes),
    canvasCount: document.querySelectorAll('canvas').length,
    renderCommandCount: debug.resources.rendering.commandCount,
  };
}

window.__PATCH_MAP_POINTER_SLOP__ = {
  phase: 'ready',
  reset,
  snapshot,
  destroy: async () => {
    release();
    return map.destroy();
  },
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
  if (!baseUrl) throw new Error('installed pointer slop smoke server has no URL');
  browser = await chromium.launch({ headless: true });
  const errors = [];
  const runs = [];

  for (const pixelRatio of [1, 2]) {
    const context = await browser.newContext({
      viewport: { width: 640, height: 480 },
      deviceScaleFactor: pixelRatio,
    });
    const page = await context.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console@${pixelRatio}: ${message.text()}`);
    });
    page.on('pageerror', (error) => errors.push(`page@${pixelRatio}: ${error.message}`));
    page.on('requestfailed', (request) => {
      errors.push(`request@${pixelRatio}: ${request.url()} ${request.failure()?.errorText ?? ''}`);
    });
    await page.goto(`${baseUrl}?pixelRatio=${pixelRatio}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(
      () => window.__PATCH_MAP_POINTER_SLOP__?.phase === 'ready',
      undefined,
      { timeout: 30_000 },
    );
    const canvas = page.locator('#host canvas');
    const box = await canvas.boundingBox();
    if (box === null) throw new Error(`pointer slop canvas has no bounds at DPR ${pixelRatio}`);

    const cases = [
      { name: 'stationary', scale: 1, offsets: [] },
      { name: 'x1', scale: 1, offsets: [[1, 0]] },
      { name: 'x4', scale: 1, offsets: [[4, 0]] },
      { name: 'y4', scale: 1, offsets: [[0, 4]] },
      { name: 'diagonal4', scale: 1, offsets: [[4, 4]] },
      { name: 'x5', scale: 1, offsets: [[5, 0]], drag: true },
      { name: 'y5', scale: 1, offsets: [[0, 5]], drag: true },
      { name: 'out-back1', scale: 1, offsets: [[1, 0], [0, 0]] },
      { name: 'out-back5', scale: 1, offsets: [[5, 0], [0, 0]], drag: true, returned: true },
      { name: 'shift4', scale: 1, offsets: [[4, 0]], shift: true },
      { name: 'shift5', scale: 1, offsets: [[5, 0]], shift: true, box: true },
      ...[0.1, 0.5, 2].flatMap((scale) => [
        { name: `x4@${scale}`, scale, offsets: [[4, 0]] },
        { name: `x5@${scale}`, scale, offsets: [[5, 0]], drag: true },
      ]),
    ];
    for (const testCase of cases) {
      const before = await page.evaluate(
        (scale) => window.__PATCH_MAP_POINTER_SLOP__.reset(scale),
        testCase.scale,
      );
      const startX = box.x + 160;
      const startY = box.y + 120;
      await page.mouse.move(startX, startY);
      if (testCase.shift === true) await page.keyboard.down('Shift');
      await page.mouse.down({ button: 'left' });
      for (const [dx, dy] of testCase.offsets) {
        await page.mouse.move(startX + dx, startY + dy);
      }
      await page.mouse.up({ button: 'left' });
      if (testCase.shift === true) await page.keyboard.up('Shift');
      const after = await page.evaluate(() => window.__PATCH_MAP_POINTER_SLOP__.snapshot());
      runs.push({ pixelRatio, ...testCase, before, after });
    }

    const destroyed = await page.evaluate(() => window.__PATCH_MAP_POINTER_SLOP__.destroy());
    const canvasCountAfterDestroy = await page.locator('canvas').count();
    runs.push({ pixelRatio, name: 'destroy', destroyed, canvasCountAfterDestroy });
    await context.close();
  }

  const result = { artifact, artifactSha256, installedEntry, runs, errors };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  const gestureRuns = runs.filter(({ name }) => name !== 'destroy');
  const passed = gestureRuns.every((run) => {
    const selection = run.after.selectionIds;
    const changes = run.after.pointerChanges;
    const viewChanged = !sameViewport(run.before.viewport, run.after.viewport);
    const revisionChanged = run.after.viewRevision > run.before.viewRevision;
    if (run.box === true) {
      return valuesEqual(selection, ['jitter-target']) &&
        changes.length === 1 && !viewChanged;
    }
    if (run.drag === true) {
      return selection.length === 0 && changes.length === 0 &&
        (run.returned === true ? !viewChanged && revisionChanged : viewChanged);
    }
    return valuesEqual(selection, ['jitter-target']) &&
      changes.length === 1 && !viewChanged;
  }) && runs.filter(({ name }) => name === 'destroy').every((run) =>
    run.destroyed === true && run.canvasCountAfterDestroy === 0);
  if (!passed || errors.length !== 0) {
    throw new Error('installed artifact pointer slop smoke failed');
  }
} finally {
  await Promise.allSettled([browser?.close(), server?.close()]);
  await rm(temporary, { recursive: true, force: true });
}

function sameViewport(left, right) {
  return left.scale === right.scale &&
    near(left.centerWorld[0], right.centerWorld[0]) &&
    near(left.centerWorld[1], right.centerWorld[1]);
}

function near(left, right, tolerance = 1e-8) {
  return Math.abs(left - right) <= tolerance;
}

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
