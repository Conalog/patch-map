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
    '<div id="initial-host" style="width:320px;height:240px"></div>',
    '<script type="module" src="/main.js"></script>',
    '</body></html>',
  ].join('\n'));
  await writeFile(path.join(temporary, 'main.js'), `
import { PatchMap } from '@conalog/patch-map';

const changes = [];
const persistentHover = [];
const compatibleHover = [];
const tooltipEvents = [];
const settledViewports = [];
const data = [
  {
    type: 'rect',
    id: 'selectable-item',
    attrs: { x: 50, y: 50 },
    size: { width: 80, height: 60 },
    fill: '#2563eb',
  },
  {
    type: 'rect',
    id: 'related-item',
    attrs: { x: 170, y: 50 },
    size: { width: 40, height: 60 },
    fill: '#22c55e',
  },
  ...['owner-a', 'owner-b'].map((id, index) => ({
    type: 'item',
    id,
    attrs: { x: 500 + index * 120, y: 20 },
    size: { width: 100, height: 100 },
    components: [
      {
        type: 'bar',
        id: 'usage',
        source: { type: 'rect', fill: '#2563eb' },
        size: { width: 80, height: 10 },
        animation: true,
      },
      { type: 'text', id: 'label', text: id },
    ],
  })),
  {
    type: 'grid',
    id: 'grid',
    attrs: { x: 500, y: 150 },
    cells: [[1, 1]],
    item: {
      size: { width: 40, height: 40 },
      components: [{
        type: 'bar',
        id: 'usage',
        source: { type: 'rect', fill: '#2563eb' },
        size: { width: 32, height: 10 },
        animation: true,
      }],
    },
  },
];
const map = await PatchMap.mount({
  container: document.querySelector('#persistent-host'),
  width: 320,
  height: 240,
  resizeMode: 'manual',
  fit: false,
  data,
  pointer: {
    hoverDuringPress: true,
    tooltip: { pinOnContextMenu: true, preventDefault: true },
  },
  selection: {
    allowMultiple: true,
    clearOnBlankClick: 'double',
    deselectOnTargetDoubleClick: true,
    isSelectable: () => true,
    resolveModifierSelection: ({ target }) =>
      target.id === 'selectable-item'
        ? ['selectable-item', 'related-item']
        : [target.id],
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
const initialMap = await PatchMap.mount({
  container: document.querySelector('#initial-host'),
  width: 320,
  height: 240,
  resizeMode: 'manual',
  data,
  fit: { padding: 48 },
  viewport: { initial: { centerWorld: [25, 35], scale: 2 } },
});
const release = map.selection.onPointerChange((change) => changes.push(change));
const releasePersistentHover = map.pointer.onHover((event) => persistentHover.push(event.type));
const releaseCompatibleHover = compatibleMap.pointer.onHover((event) => compatibleHover.push(event.type));
const releaseTooltip = map.pointer.onTooltip((event) => tooltipEvents.push(event));
const releaseViewport = map.viewport.onSettled(() => {
  settledViewports.push(map.viewport.snapshot());
});
window.__PATCH_MAP_INSTALLED_SELECTION__ = {
  phase: 'ready',
  selectionIds: () => [...map.selection.ids],
  debugSelectionIds: () => [...map.debug.snapshot().selectionIds],
  selectItem: () => map.selection.set('selectable-item'),
  changes: () => structuredClone(changes),
  persistentHover: () => [...persistentHover],
  compatibleHover: () => [...compatibleHover],
  tooltipEvents: () => structuredClone(tooltipEvents),
  initialViewport: () => initialMap.viewport.snapshot(),
  mixedOwnerMutation: () => {
    const beforeRevision = map.debug.snapshot().revisions.sceneRevision;
    const result = map.transaction([
      {
        type: 'update',
        id: 'owner-a',
        bar: { height: 24, changes: { source: { fill: '#2563eb' } } },
        text: { text: 'immediate' },
      },
      {
        type: 'update',
        id: 'owner-b',
        bar: { height: 72, changes: { source: { fill: '#22c55e' } } },
      },
    ], { animate: [false, true], actionId: 'packed-mixed-owner' });
    return {
      status: result.status,
      sceneRevisionDelta: map.debug.snapshot().revisions.sceneRevision - beforeRevision,
      ownerAHeight: map.targets.get({ id: 'owner-a', componentId: 'usage' })?.value.size.height,
      ownerBHeight: map.targets.get({ id: 'owner-b', componentId: 'usage' })?.value.size.height,
    };
  },
  mixedGridMutation: () => {
    const targets = map.targets.query({
      within: 'grid',
      scope: 'instances',
      type: 'bar',
      componentId: 'usage',
    });
    const result = map.updateBatch({
      targets,
      bar: {
        componentId: 'usage',
        height: new Float32Array([18, 34]),
        changes: { tint: ['#2563eb', '#22c55e'] },
      },
    }, { animate: [false, true] });
    return { status: result.status, appliedCount: result.appliedCount, targetCount: targets.count };
  },
  viewportBurst: async () => {
    map.viewport.restore({ centerWorld: [150, 100], scale: 1.5 });
    map.viewport.panBy([10, 0]);
    await new Promise((resolve) => setTimeout(resolve, 140));
    return {
      snapshot: map.viewport.snapshot(),
      settled: structuredClone(settledViewports),
    };
  },
  destroy: async () => {
    release();
    releasePersistentHover();
    releaseCompatibleHover();
    releaseTooltip();
    releaseViewport();
    const destroyed = await Promise.all([map.destroy(), compatibleMap.destroy(), initialMap.destroy()]);
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
  const page = await browser.newPage({ viewport: { width: 960, height: 480 } });
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

  await page.mouse.move(90, 80);
  await page.mouse.click(90, 80, { button: 'right' });
  const tooltipAfterPin = await page.evaluate(
    () => window.__PATCH_MAP_INSTALLED_SELECTION__.tooltipEvents(),
  );
  await page.mouse.move(250, 200);
  const tooltipDuringPinnedLeave = await page.evaluate(
    () => window.__PATCH_MAP_INSTALLED_SELECTION__.tooltipEvents(),
  );
  await pointerDownUp(page, 190, 80);
  const tooltipAfterPrimaryClick = await page.evaluate(
    () => window.__PATCH_MAP_INSTALLED_SELECTION__.tooltipEvents(),
  );

  await page.keyboard.down('Control');
  await pointerDownUp(page, 90, 80);
  await page.keyboard.up('Control');
  const modifierSelection = await selectionState(page);

  const initialViewport = await page.evaluate(
    () => window.__PATCH_MAP_INSTALLED_SELECTION__.initialViewport(),
  );
  const mixedOwner = await page.evaluate(
    () => window.__PATCH_MAP_INSTALLED_SELECTION__.mixedOwnerMutation(),
  );
  const mixedGrid = await page.evaluate(
    () => window.__PATCH_MAP_INSTALLED_SELECTION__.mixedGridMutation(),
  );
  const viewportBurst = await page.evaluate(
    () => window.__PATCH_MAP_INSTALLED_SELECTION__.viewportBurst(),
  );

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
    tooltip: {
      afterPin: tooltipAfterPin.at(-1),
      eventCountAfterPin: tooltipAfterPin.length,
      eventCountDuringPinnedLeave: tooltipDuringPinnedLeave.length,
      afterPrimaryClick: tooltipAfterPrimaryClick.at(-1),
    },
    modifierSelection,
    initialViewport,
    mixedOwner,
    mixedGrid,
    viewportBurst,
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
    tooltipAfterPin.at(-1)?.type !== 'pin' ||
    tooltipAfterPin.at(-1)?.target?.id !== 'selectable-item' ||
    tooltipAfterPin.at(-1)?.pinned !== true ||
    tooltipDuringPinnedLeave.length !== tooltipAfterPin.length ||
    tooltipAfterPrimaryClick.at(-1)?.type !== 'show' ||
    tooltipAfterPrimaryClick.at(-1)?.target?.id !== 'related-item' ||
    tooltipAfterPrimaryClick.at(-1)?.pinned !== false ||
    !selectionEquals(modifierSelection, ['selectable-item', 'related-item']) ||
    !valuesEqual(initialViewport, { centerWorld: [25, 35], scale: 2 }) ||
    mixedOwner.status !== 'committed' ||
    mixedOwner.sceneRevisionDelta !== 1 ||
    mixedOwner.ownerAHeight !== 24 ||
    mixedOwner.ownerBHeight !== 72 ||
    mixedGrid.status !== 'committed' ||
    mixedGrid.targetCount !== 2 ||
    mixedGrid.appliedCount !== 2 ||
    viewportBurst.snapshot.scale !== 1.5 ||
    viewportBurst.settled.length !== 1 ||
    !valuesEqual(viewportBurst.settled[0], viewportBurst.snapshot) ||
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
