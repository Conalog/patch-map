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
  throw new Error('usage: patch-map-installed-selection-smoke.mjs /absolute/artifact.tgz');
}
const artifact = artifactArgument;

const artifactBytes = await readFile(artifact);
const artifactSha256 = createHash('sha256').update(artifactBytes).digest('hex');
const temporary = await mkdtemp(path.join(tmpdir(), 'patch-map-installed-selection-'));
let server;
let browser;

try {
  await writeFile(path.join(temporary, 'package.json'), `${JSON.stringify({
    name: 'patch-map-installed-selection-smoke',
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
  if (
    installedEntryRelative.startsWith('..') ||
    path.isAbsolute(installedEntryRelative)
  ) {
    throw new Error(`package resolved outside the fresh consumer: ${installedEntry}`);
  }
  await writeFile(path.join(temporary, 'index.html'), [
    '<!doctype html>',
    '<html><body style="display:flex;margin:0">',
    '<div id="persistent-host" style="width:320px;height:240px"></div>',
    '<div id="compatible-host" style="width:320px;height:240px"></div>',
    '<script type="module" src="/main.js"></script>',
    '</body></html>',
  ].join('\n'));
  await writeFile(path.join(temporary, 'main.js'), `
import { PatchMap } from '@conalog/patch-map';

const changes = [];
const persistentHover = [];
const compatibleHover = [];
const data = [{
  type: 'rect',
  id: 'selectable-item',
  attrs: { x: 50, y: 50 },
  size: { width: 80, height: 60 },
  fill: '#2563eb',
}];
const map = await PatchMap.mount({
  container: document.querySelector('#persistent-host'),
  width: 320,
  height: 240,
  resizeMode: 'manual',
  fit: false,
  data,
  pointer: { hoverDuringPress: true },
  selection: {
    allowMultiple: true,
    clearOnBlankClick: 'double',
    deselectOnTargetDoubleClick: true,
    isSelectable: () => true,
  },
});
const compatibleMap = await PatchMap.mount({
  container: document.querySelector('#compatible-host'),
  width: 320,
  height: 240,
  resizeMode: 'manual',
  fit: false,
  data,
});
const release = map.selection.onPointerChange((change) => changes.push(change));
const releasePersistentHover = map.pointer.onHover((event) => persistentHover.push(event.type));
const releaseCompatibleHover = compatibleMap.pointer.onHover((event) => compatibleHover.push(event.type));
window.__PATCH_MAP_INSTALLED_SELECTION__ = {
  phase: 'ready',
  selectionIds: () => [...map.selection.ids],
  debugSelectionIds: () => [...map.debug.snapshot().selectionIds],
  selectItem: () => map.selection.set('selectable-item'),
  changes: () => structuredClone(changes),
  persistentHover: () => [...persistentHover],
  compatibleHover: () => [...compatibleHover],
  destroy: async () => {
    release();
    releasePersistentHover();
    releaseCompatibleHover();
    const destroyed = await Promise.all([map.destroy(), compatibleMap.destroy()]);
    return destroyed.every(Boolean);
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
  if (!baseUrl) throw new Error('installed selection smoke server has no URL');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
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
    () => window.__PATCH_MAP_INSTALLED_SELECTION__?.phase === 'ready',
    undefined,
    { timeout: 30_000 },
  );
  await page.mouse.move(90, 80);
  const persistentHoverBeforePress = await hoverState(page, 'persistentHover');
  await pointerDownUp(page, 90, 80);
  const persistentHoverAfterPress = await hoverState(page, 'persistentHover');
  await page.mouse.move(250, 200);
  const persistentHoverAfterLeave = await hoverState(page, 'persistentHover');
  await page.mouse.move(410, 80);
  const compatibleHoverBeforePress = await hoverState(page, 'compatibleHover');
  await pointerDownUp(page, 410, 80);
  const compatibleHoverAfterPress = await hoverState(page, 'compatibleHover');
  await page.evaluate(() => window.__PATCH_MAP_INSTALLED_SELECTION__.selectItem());
  await page.waitForTimeout(550);
  const selected = await selectionState(page);
  await pointerDownUp(page, 250, 200);
  const afterBlankSingle = await selectionState(page);
  await page.waitForTimeout(100);
  await pointerDownUp(page, 250, 200);
  const afterBlankDouble = await selectionState(page);
  const changes = await page.evaluate(
    () => window.__PATCH_MAP_INSTALLED_SELECTION__.changes(),
  );
  const destroyed = await page.evaluate(
    () => window.__PATCH_MAP_INSTALLED_SELECTION__.destroy(),
  );
  const canvasCountAfterDestroy = await page.locator('canvas').count();
  const result = {
    artifact,
    artifactSha256,
    installedEntry,
    hover: {
      persistentBeforePress: persistentHoverBeforePress,
      persistentAfterPress: persistentHoverAfterPress,
      persistentAfterLeave: persistentHoverAfterLeave,
      compatibleBeforePress: compatibleHoverBeforePress,
      compatibleAfterPress: compatibleHoverAfterPress,
    },
    selected,
    afterBlankSingle,
    afterBlankDouble,
    pointerChangeCount: changes.length,
    destroyed,
    canvasCountAfterDestroy,
    errors,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (
    !selectionEquals(selected, ['selectable-item']) ||
    !selectionEquals(afterBlankSingle, ['selectable-item']) ||
    !selectionEquals(afterBlankDouble, []) ||
    !valuesEqual(persistentHoverBeforePress, ['hover']) ||
    !valuesEqual(persistentHoverAfterPress, ['hover', 'move']) ||
    !valuesEqual(persistentHoverAfterLeave, ['hover', 'move', 'leave']) ||
    !valuesEqual(compatibleHoverBeforePress, ['hover']) ||
    !valuesEqual(compatibleHoverAfterPress, ['hover', 'move', 'leave']) ||
    destroyed !== true ||
    canvasCountAfterDestroy !== 0 ||
    errors.length !== 0
  ) {
    throw new Error('installed artifact selection policy smoke failed');
  }
} finally {
  await Promise.allSettled([browser?.close(), server?.close()]);
  await rm(temporary, { recursive: true, force: true });
}

async function selectionState(page) {
  return page.evaluate(() => ({
    ids: window.__PATCH_MAP_INSTALLED_SELECTION__.selectionIds(),
    debugIds: window.__PATCH_MAP_INSTALLED_SELECTION__.debugSelectionIds(),
  }));
}

async function pointerDownUp(page, x, y) {
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.up({ button: 'left' });
}

function selectionEquals(state, expected) {
  return valuesEqual(state.ids, expected) && valuesEqual(state.debugIds, expected);
}

function hoverState(page, key) {
  return page.evaluate(
    (name) => window.__PATCH_MAP_INSTALLED_SELECTION__[name](),
    key,
  );
}

function valuesEqual(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}
