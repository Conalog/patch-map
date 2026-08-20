const PACKED_CONSUMER_HOST_DEPENDENCIES = Object.freeze({
  'pixi.js': '8.19.0',
  'typescript': '5.9.3',
});

export function createPackedConsumerPackageJson(tarball) {
  return `${JSON.stringify({
    name: 'patch-map-package-consumer',
    private: true,
    type: 'module',
    dependencies: {
      '@conalog/patch-map': `file:${tarball}`,
      ...PACKED_CONSUMER_HOST_DEPENDENCIES,
    },
  }, null, 2)}\n`;
}

export function createPackedConsumerDependencySeedPackageJson() {
  return `${JSON.stringify({
    name: 'patch-map-package-consumer-dependency-seed',
    private: true,
    dependencies: PACKED_CONSUMER_HOST_DEPENDENCIES,
  }, null, 2)}\n`;
}

export const PACKED_CONSUMER_HTML_SOURCE =
  '<!doctype html>\n<html><body><div id="host" style="width:640px;height:360px"></div><script type="module" src="/main.js"></script></body></html>\n';

export const PACKED_CONSUMER_ESM_SOURCE = `
import * as packageApi from '@conalog/patch-map';
import {
  PatchMap,
  PatchMapAssetRuntime,
  assertPatchMapSemanticRoundtrip,
  materializePatchMapCompatibilityDataset,
  preparePatchMapPersistenceExport,
} from '@conalog/patch-map';

const input = [{
  type: 'item', id: 'consumer-item', show: true,
  attrs: { x: 20, y: 30 }, size: { width: 80, height: 120 },
  components: [
    { type: 'background', id: 'bg', source: { type: 'rect', fill: '#eef2ff' } },
    {
      type: 'bar', id: 'bar', source: { type: 'rect', fill: '#2563eb' },
      size: { width: '70%', height: 42 }, placement: 'bottom', animation: true,
    },
    { type: 'text', id: 'label', text: '42', placement: 'top' },
  ],
}];
const before = JSON.stringify(input);
const host = document.querySelector('#host');
const map = await PatchMap.mount({
  container: host,
  instanceId: 'packed-public-consumer',
  width: 640,
  height: 360,
  backend: 'webgl',
  resizeMode: 'manual',
  data: input,
});

const initial = map.debug.snapshot();
const bars = map.targets.query({ type: 'bar', scope: 'authored' });
const presentationDataBefore = map.data.serialize();
const presentationSet = map.presentation.set('packed:focus', {
  scope: bars,
  targets: [],
  unmatched: { alphaMultiplier: 0.5 },
});
const presentationSnapshot = map.debug.snapshot().presentation;
const presentationCapture = await map.capture.png();
const presentationClear = map.presentation.clear('packed:focus');
const presentationClearSnapshot = map.debug.snapshot().presentation;
const presentationClearCapture = await map.capture.png();
const presentationDataStable = presentationDataBefore === map.data.serialize();
const update = map.update({
  id: 'consumer-item',
  bar: { height: 64 },
}, { actionId: 'packed-bar-update', recordHistory: false });
const updatedBar = map.targets.get({ id: 'consumer-item', componentId: 'bar' });
const selection = map.selection.set('consumer-item');
const transform = map.transform.moveBy(
  { id: 'consumer-item' },
  [12, 8],
  { actionId: 'packed-move', recordHistory: true },
);
const undo = map.history.undo();
const redo = map.history.redo();
const transaction = map.transaction([{
  type: 'add',
  parentId: null,
  index: 1,
  value: {
    type: 'rect', id: 'packed-added', show: true,
    attrs: { x: 180, y: 40 }, size: { width: 48, height: 36 }, fill: '#f97316',
  },
}], { actionId: 'packed-add', selectedIds: ['packed-added'] });

const snapshot = map.data.snapshot();
const serialized = map.data.serialize();
const persistence = preparePatchMapPersistenceExport(snapshot);
const reloaded = materializePatchMapCompatibilityDataset(
  JSON.parse(persistence.serialized),
);
assertPatchMapSemanticRoundtrip(persistence, reloaded);
const legacy = materializePatchMapCompatibilityDataset({
  kind: 'generic-item', id: 'legacy-packed', width: 100, height: 80,
});

const beforeRejectedReplace = map.debug.snapshot();
let strictFailure = null;
try {
  map.data.replace([
    ...structuredClone(snapshot),
    {
      type: 'relations', id: 'invalid-links',
      links: [{ source: 'consumer-item', target: 'missing-target' }],
    },
  ], { strict: true, datasetRef: 'packed-invalid' });
} catch (error) {
  strictFailure = {
    code: error?.code ?? null,
    category: error?.category ?? error?.diagnostic?.category ?? null,
    path: error?.diagnostic?.datasetPath ?? error?.datasetPath ?? null,
  };
}
const afterRejectedReplace = map.debug.snapshot();
const assetStatus = map.assets.status();
const capture = await map.capture.png();
const presentationReplaceLifecycle = await verifyPresentationReplaceLifecycle();
const directImage = await verifyDirectImageLifecycle();
const theme = await verifyThemeLifecycle();
const builtins = await verifyBuiltinGlyphLifecycle();
const pointerInteraction = await verifyPointerInteractionLifecycle();
const selectionBoundsDisplay = await verifySelectionBoundsDisplayLifecycle();
const renderObjects = initial.resources.rendering.commandCount;
let constructorRejected = false;
try {
  Reflect.construct(PatchMap, []);
} catch {
  constructorRejected = true;
}
const instanceInternalsAbsent = [
  'initialize',
  'loadDataset',
  'publishFrame',
  'semanticProbe',
  'historyInspection',
  'configurePointerSelectionPolicy',
  'onPointerHover',
  'onPointerSelectionChange',
].every((name) => !(name in map));
const destroyResult = await map.destroy();

const internalNames = [
  'PatchMapFrameLoop',
  'PatchMapPixiRenderer',
  'PatchMapMigrationAuthority',
  'parsePatchMapV010',
  'planPatchMapMutationTransaction',
];

window.__PACKAGE_RESULT__ = {
  immutable: before === JSON.stringify(input),
  rootCount: snapshot.length,
  barTargetCount: bars.count,
  presentationSet,
  presentationSnapshot,
  presentationCaptureChanged:
    presentationCapture.dataUrl !== presentationClearCapture.dataUrl,
  presentationClear,
  presentationClearSnapshot,
  presentationDataStable,
  updateStatus: update.status,
  updatedBarHeight: updatedBar?.value?.size?.height ?? null,
  selection,
  transformStatus: transform.status,
  undoStatus: undo.status,
  redoStatus: redo.status,
  transactionStatus: transaction.status,
  serializedMatches: serialized === persistence.serialized,
  roundtripSemanticHashEqual: persistence.semanticHash === reloaded.semanticHash,
  legacySourceKind: legacy.sourceKind,
  strictFailure,
  rejectedReplaceAtomic:
    beforeRejectedReplace.revisions.sceneRevision === afterRejectedReplace.revisions.sceneRevision
    && beforeRejectedReplace.semanticHash === afterRejectedReplace.semanticHash,
  backend: initial.resources.renderer?.backend ?? null,
  renderObjects,
  assetRuntimeCount: assetStatus.runtime.resourceCount,
  assetSessionLeaseCount: assetStatus.session?.leaseCount ?? null,
  capturePrefix: capture.dataUrl.slice(0, 22),
  captureLength: capture.dataUrl.length,
  presentationReplaceLifecycle,
  directImage,
  theme,
  builtins,
  pointerInteraction,
  selectionBoundsDisplay,
  internalExportsAbsent: internalNames.every((name) => !(name in packageApi)),
  constructorRejected,
  instanceInternalsAbsent,
  destroyResult,
  destroyed: map.destroyed,
  canvasCountAfterDestroy: document.querySelectorAll('canvas').length,
};

async function verifyPresentationReplaceLifecycle() {
  const lifecycleHost = document.createElement('div');
  lifecycleHost.style.width = '320px';
  lifecycleHost.style.height = '180px';
  document.body.appendChild(lifecycleHost);
  const scene = (count, prefix) => Array.from({ length: count }, (_, index) => ({
    type: 'item',
    id: prefix + '-' + index,
    show: true,
    attrs: { x: 16 + index * 92, y: 24 },
    size: { width: 72, height: 96 },
    components: [{
      type: 'background',
      id: 'surface',
      source: { type: 'rect', fill: '#2563eb' },
    }],
  }));
  const initialData = scene(2, 'initial');
  const sameCapacityData = scene(2, 'same');
  const differentCapacityData = scene(3, 'different');
  const asyncData = scene(1, 'async');
  const immutableBefore = [
    initialData,
    sameCapacityData,
    differentCapacityData,
    asyncData,
  ].map((value) => JSON.stringify(value));
  let lifecycleMap = null;
  try {
    lifecycleMap = await PatchMap.mount({
      container: lifecycleHost,
      instanceId: 'packed-presentation-replace-lifecycle',
      width: 320,
      height: 180,
      backend: 'webgl',
      resizeMode: 'manual',
      fit: false,
      data: initialData,
    });
    const initialScope = lifecycleMap.targets.query({ type: 'item', scope: 'authored' });
    lifecycleMap.presentation.set('packed:replace-focus', {
      scope: initialScope,
      targets: ['initial-0'],
      unmatched: { alphaMultiplier: 0.32 },
    });
    const beforeFailedReplace = lifecycleMap.debug.snapshot();
    const dataBeforeFailedReplace = lifecycleMap.data.serialize();
    let failedReplaceRejected = false;
    try {
      lifecycleMap.data.replace([
        ...structuredClone(initialData),
        {
          type: 'relations',
          id: 'invalid-presentation-links',
          links: [{ source: 'initial-0', target: 'missing-presentation-target' }],
        },
      ], { strict: true, fit: false });
    } catch {
      failedReplaceRejected = true;
    }
    const afterFailedReplace = lifecycleMap.debug.snapshot();
    const dataAfterFailedReplace = lifecycleMap.data.serialize();
    const failedReplacePreserved =
      beforeFailedReplace.revisions.sceneRevision ===
        afterFailedReplace.revisions.sceneRevision &&
      afterFailedReplace.presentation.layerCount === 1 &&
      dataBeforeFailedReplace === dataAfterFailedReplace;

    lifecycleMap.data.replace(sameCapacityData, { strict: true, fit: false });
    const sameCapacityCleared = lifecycleMap.debug.snapshot().presentation;
    const sameCapacityScope = lifecycleMap.targets.query({ type: 'item', scope: 'authored' });
    const sameCapacitySet = lifecycleMap.presentation.set('packed:replace-focus', {
      scope: sameCapacityScope,
      targets: ['same-0'],
      unmatched: { alphaMultiplier: 0.32 },
    });
    const sameCapacityCapture = await lifecycleMap.capture.png();
    lifecycleMap.presentation.clear('packed:replace-focus');
    const sameCapacityClearCapture = await lifecycleMap.capture.png();

    lifecycleMap.data.replace(differentCapacityData, { strict: true, fit: false });
    const differentCapacityCleared = lifecycleMap.debug.snapshot().presentation;
    const differentCapacityScope = lifecycleMap.targets.query({
      type: 'item',
      scope: 'authored',
    });
    const differentCapacitySet = lifecycleMap.presentation.set('packed:replace-focus', {
      scope: differentCapacityScope,
      targets: ['different-0'],
      unmatched: { alphaMultiplier: 0.32 },
    });
    const differentCapacityCapture = await lifecycleMap.capture.png();

    await lifecycleMap.data.replaceAsync(asyncData, { strict: true, fit: false });
    const asyncCleared = lifecycleMap.debug.snapshot().presentation;
    const asyncScope = lifecycleMap.targets.query({ type: 'item', scope: 'authored' });
    const asyncSet = lifecycleMap.presentation.set('packed:replace-focus', {
      scope: asyncScope,
      targets: ['async-0'],
      unmatched: { alphaMultiplier: 0.32 },
    });
    const asyncCapture = await lifecycleMap.capture.png();
    const immutableAfter = [
      initialData,
      sameCapacityData,
      differentCapacityData,
      asyncData,
    ].map((value) => JSON.stringify(value));
    const firstDestroy = await lifecycleMap.destroy();
    const secondDestroy = await lifecycleMap.destroy();
    lifecycleMap = null;
    return {
      failedReplaceRejected,
      failedReplacePreserved,
      sameCapacityCleared,
      sameCapacitySet,
      sameCapacityCaptureChanged:
        sameCapacityCapture.dataUrl !== sameCapacityClearCapture.dataUrl,
      differentCapacityCleared,
      differentCapacitySet,
      differentCapacityCapturePrefix: differentCapacityCapture.dataUrl.slice(0, 22),
      asyncCleared,
      asyncSet,
      asyncCapturePrefix: asyncCapture.dataUrl.slice(0, 22),
      callerInputsImmutable:
        JSON.stringify(immutableBefore) === JSON.stringify(immutableAfter),
      firstDestroy,
      secondDestroy,
      canvasCountAfterDestroy: lifecycleHost.querySelectorAll('canvas').length,
    };
  } finally {
    await lifecycleMap?.destroy().catch(() => undefined);
    lifecycleHost.remove();
  }
}

async function verifyThemeLifecycle() {
  const defaultHost = document.createElement('div');
  const customHost = document.createElement('div');
  for (const host of [defaultHost, customHost]) {
    host.style.width = '120px';
    host.style.height = '120px';
    document.body.appendChild(host);
  }
  const scene = (id) => [{
    type: 'grid',
    id,
    cells: [[1]],
    item: {
      size: { width: 100, height: 100 },
      components: [{
        type: 'bar',
        id: 'bar',
        source: { type: 'rect', fill: 'white' },
        size: { width: 100, height: 100 },
        placement: 'center',
        tint: 'primary.default',
        animation: false,
      }],
    },
  }];
  const theme = { primary: { default: '#16a34a' } };
  const themeBefore = JSON.stringify(theme);
  let defaultMap = null;
  let customMap = null;
  try {
    defaultMap = await PatchMap.mount({
      container: defaultHost,
      width: 120,
      height: 120,
      background: '#000000',
      data: scene('packed-default-theme'),
      fit: false,
      resizeMode: 'manual',
    });
    customMap = await PatchMap.mount({
      container: customHost,
      width: 120,
      height: 120,
      background: '#000000',
      theme,
      data: scene('packed-custom-theme'),
      fit: false,
      resizeMode: 'manual',
    });
    const defaultCapture = await captureColorCounts(defaultMap);
    const customCapture = await captureColorCounts(customMap);
    const isolatedDefaultCapture = await captureColorCounts(defaultMap);
    const defaultDestroy = await defaultMap.destroy();
    defaultMap = null;
    const customDestroy = await customMap.destroy();
    customMap = null;
    return {
      defaultCapture,
      customCapture,
      isolatedDefaultCapture,
      themeImmutable: JSON.stringify(theme) === themeBefore,
      defaultDestroy,
      customDestroy,
      canvasCountAfterDestroy:
        defaultHost.querySelectorAll('canvas').length +
        customHost.querySelectorAll('canvas').length,
    };
  } finally {
    await defaultMap?.destroy().catch(() => undefined);
    await customMap?.destroy().catch(() => undefined);
    defaultHost.remove();
    customHost.remove();
  }
}

async function captureColorCounts(map) {
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
  const count = (red, green, blue) => {
    let matches = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (
        Math.abs(pixels[index] - red) <= 6 &&
        Math.abs(pixels[index + 1] - green) <= 6 &&
        Math.abs(pixels[index + 2] - blue) <= 6 &&
        pixels[index + 3] >= 245
      ) matches += 1;
    }
    return matches;
  };
  return {
    canonicalDefault: count(12, 115, 191),
    legacyPurple: count(79, 70, 229),
    custom: count(22, 163, 74),
  };
}

async function verifyDirectImageLifecycle() {
  const directHost = document.createElement('div');
  directHost.style.width = '180px';
  directHost.style.height = '140px';
  document.body.appendChild(directHost);
  const runtime = new PatchMapAssetRuntime();
  const resourceCountBeforeMount = runtime.probe().resourceCount;
  const assets = [
    { alias: '/icons/ess.svg', descriptor: '/icons/ess.svg' },
    { alias: '/icons/stick.svg', descriptor: '/icons/stick.svg' },
  ];
  const scene = (id, source) => [{
    id,
    type: 'image',
    source,
    show: true,
    attrs: { x: 16, y: 16 },
    size: { width: 96, height: 96 },
  }];
  let direct = null;
  try {
    direct = await PatchMap.mount({
      container: directHost,
      instanceId: 'packed-direct-image-first',
      width: 180,
      height: 140,
      resizeMode: 'manual',
      fit: false,
      assets,
      assetRuntime: runtime,
      assetPolicy: () => undefined,
      data: scene('initial-direct-image', '/icons/ess.svg'),
    });
    const initialCapture = await direct.capture.png();
    const initialState = direct.assets.status('/icons/ess.svg').runtime.resource?.state ?? null;
    const replacement = await direct.data.replaceAsync(
      scene('replacement-direct-image', '/icons/stick.svg'),
      { strict: true, fit: false },
    );
    const replacementCapture = await direct.capture.png();
    const replacementState =
      direct.assets.status('/icons/stick.svg').runtime.resource?.state ?? null;
    const firstDestroy = await direct.destroy();
    direct = null;
    const firstCleanupResourceCount = runtime.probe().resourceCount;
    const firstCleanupInitialResource =
      runtime.probe('/icons/ess.svg').resource ?? null;

    direct = await PatchMap.mount({
      container: directHost,
      instanceId: 'packed-direct-image-remount',
      width: 180,
      height: 140,
      resizeMode: 'manual',
      fit: false,
      assets,
      assetRuntime: runtime,
      assetPolicy: () => undefined,
      data: scene('remounted-direct-image', '/icons/stick.svg'),
    });
    const remountCapture = await direct.capture.png();
    const remountState = direct.assets.status('/icons/stick.svg').runtime.resource?.state ?? null;
    const remountDestroy = await direct.destroy();
    direct = null;
    return {
      initialState,
      initialCaptureLength: initialCapture.dataUrl.length,
      replacementRootId: replacement.rootIds[0] ?? null,
      replacementSceneRevision: replacement.sceneRevision,
      replacementState,
      replacementCaptureLength: replacementCapture.dataUrl.length,
      firstDestroy,
      firstCleanupResourceCount,
      resourceCountBeforeMount,
      firstCleanupInitialResource,
      remountState,
      remountCaptureLength: remountCapture.dataUrl.length,
      remountDestroy,
      finalResourceCount: runtime.probe().resourceCount,
      finalReplacementResource:
        runtime.probe('/icons/stick.svg').resource ?? null,
      canvasCountAfterDestroy: directHost.querySelectorAll('canvas').length,
    };
  } finally {
    await direct?.destroy().catch(() => undefined);
    directHost.remove();
  }
}

async function verifyBuiltinGlyphLifecycle() {
  const aliases = ['object', 'inverter', 'combiner', 'device', 'edge', 'loading', 'warning', 'wifi'];
  const injectedAliases = [
    'cloudAlert',
    'inverterFrame',
    'ess',
    'stick',
    'wiringPrimary',
    'wiringSecondary',
    'wiringTertiary',
  ];
  const injectedAssets = injectedAliases.map((alias) => ({
    alias,
    descriptor: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72" fill="#fff"><title>' +
        alias +
        '</title><path d="M36 4 68 36 36 68 4 36Z"/></svg>',
    ),
  }));
  const builtinHost = document.createElement('div');
  builtinHost.style.width = '128px';
  builtinHost.style.height = '128px';
  document.body.appendChild(builtinHost);
  const runtime = new PatchMapAssetRuntime();
  const runtimeBeforeMount = runtime.probe();
  const authoredScene = (alias, iconSize = 56) => [{
    type: 'grid',
    id: 'packed-authored-' + alias,
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
    id: 'packed-overlay-grid',
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
  let builtinMap = null;
  try {
    builtinMap = await PatchMap.mount({
      container: builtinHost,
      instanceId: 'packed-builtin-glyphs',
      width: 128,
      height: 128,
      background: '#000000',
      data: authoredScene(aliases[0]),
      assets: injectedAssets,
      assetRuntime: runtime,
      assetPolicy: () => undefined,
      fit: false,
      resizeMode: 'manual',
    });
    const authored = {};
    const overlay = {};
    const authoredResolved = {};
    const overlayResolved = {};
    for (const alias of aliases) {
      if (alias !== aliases[0]) {
        await builtinMap.data.replaceAsync(authoredScene(alias), { strict: true, fit: false });
      }
      authored[alias] = await captureGlyphMask(builtinMap, 'green');
      const status = builtinMap.assets.status(alias).runtime;
      authoredResolved[alias] =
        status.resource?.state === 'resolved' && status.pendingCount === 0;
    }
    await builtinMap.data.replaceAsync(authoredScene('inverter', 24), {
      strict: true,
      fit: false,
    });
    const inverter24 = await captureGlyphMask(builtinMap, 'green');
    const inverter24Status = builtinMap.assets.status('inverter').runtime;
    await builtinMap.data.replaceAsync(overlayScene, { strict: true, fit: false });
    const hidden = await captureGlyphMask(builtinMap, 'red');
    for (const alias of aliases) {
      const update = builtinMap.updateBatch({
        targets: ['packed-overlay-grid.0.0'],
        icon: {
          componentId: 'status',
          changes: {
            show: [true],
            source: [alias],
            tint: ['#ef4444'],
          },
        },
      });
      overlay[alias] = {
        updateStatus: update.status,
        ...(await captureGlyphMask(builtinMap, 'red')),
      };
      const status = builtinMap.assets.status(alias).runtime;
      overlayResolved[alias] =
        status.resource?.state === 'resolved' && status.pendingCount === 0;
    }
    await builtinMap.data.replaceAsync(authoredScene('inverterFrame', 24), {
      strict: true,
      fit: false,
    });
    const injectedCapture = await captureGlyphMask(builtinMap, 'green');
    const injectedStatus = builtinMap.assets.status('inverterFrame').runtime;
    const runtimeBeforeDestroy = runtime.probe();
    const destroy = await builtinMap.destroy();
    builtinMap = null;
    return {
      aliases,
      authored,
      overlay,
      authoredResolved,
      overlayResolved,
      inverter24,
      inverter24Resolved:
        inverter24Status.resource?.state === 'resolved' && inverter24Status.pendingCount === 0,
      injectedAliases,
      injectedCapture,
      injectedResolved:
        injectedStatus.resource?.state === 'resolved' && injectedStatus.pendingCount === 0,
      hidden,
      runtimeBeforeMount,
      runtimeBeforeDestroy,
      runtimeAfterDestroy: runtime.probe(),
      destroy,
      canvasCountAfterDestroy: builtinHost.querySelectorAll('canvas').length,
    };
  } finally {
    await builtinMap?.destroy().catch(() => undefined);
    builtinHost.remove();
  }
}

async function verifyPointerInteractionLifecycle() {
  const exactHost = document.createElement('div');
  exactHost.id = 'packed-concrete-cell-host';
  Object.assign(exactHost.style, {
    position: 'fixed',
    left: '260px',
    top: '0',
    zIndex: '2147483647',
    width: '640px',
    height: '480px',
  });
  document.body.appendChild(exactHost);
  const pointerHost = document.createElement('div');
  pointerHost.id = 'packed-pointer-host';
  Object.assign(pointerHost.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    zIndex: '2147483647',
    width: '240px',
    height: '160px',
  });
  document.body.appendChild(pointerHost);
  const dataset = [{
    type: 'grid',
    id: 'pointer-grid',
    attrs: { x: 20, y: 20 },
    cells: [[1, 1, 1]],
    item: {
      size: { width: 50, height: 60 },
      components: [{
        type: 'bar',
        id: 'bar',
        source: { type: 'rect', fill: '#2563eb' },
        size: { width: 50, height: 60 },
        placement: 'center',
        animation: false,
      }, {
        type: 'icon',
        id: 'status',
        source: 'device',
        size: { width: 30, height: 30 },
        placement: 'center',
        attrs: { zIndex: 10 },
      }],
    },
  }];
  const datasetBefore = JSON.stringify(dataset);
  let map = null;
  let exactMap = null;
  let releaseExactSelection = null;
  let releaseHover = null;
  let releaseSelection = null;
  const firstHover = [];
  const firstSelection = [];
  const remountHover = [];
  const remountSelection = [];
  const selectableTargets = [];
  const mount = async (instanceId, allowMultiple) => PatchMap.mount({
    container: pointerHost,
    instanceId,
    width: 240,
    height: 160,
    pixelRatio: 2,
    background: '#000000',
    resizeMode: 'manual',
    fit: false,
    data: dataset,
    selection: {
      allowMultiple,
      clearOnBlankClick: 'double',
      deselectOnTargetDoubleClick: true,
      box: instanceId.includes('remount')
        ? { partialIntersection: true, activationModifier: 'shift' }
        : {
            partialIntersection: true,
            activationModifier: 'shift',
            visual: { color: '#1099ff', strokeWidth: 1, fillAlpha: 0.08 },
          },
      isSelectable: (target) => {
        selectableTargets.push(target);
        return target.id !== 'pointer-grid.0.2';
      },
      visual: {
        color: '#ef4444',
        strokeWidth: 3,
        displayMode: 'element-only',
      },
    },
  });
  const subscribe = (hover, selection) => {
    releaseHover = map.pointer.onHover((event) => {
      hover.push(event);
      if (window.__PATCH_MAP_POINTER_PROBE__) {
        window.__PATCH_MAP_POINTER_PROBE__.lastPointerId = event.pointerId;
      }
    });
    releaseSelection = map.selection.onPointerChange((event) => selection.push(event));
  };
  const release = () => {
    releaseHover?.();
    releaseSelection?.();
    releaseHover = null;
    releaseSelection = null;
  };
  map = await mount('packed-pointer-first', true);
  const exactSelectableTargets = [];
  const exactSelectionChanges = [];
  exactMap = await PatchMap.mount({
    container: exactHost,
    instanceId: 'packed-concrete-cell-point-selection',
    width: 640,
    height: 480,
    pixelRatio: 1,
    background: '#000000',
    resizeMode: 'manual',
    fit: false,
    data: [{
      type: 'grid',
      id: 'selectable-grid',
      attrs: { x: 100, y: 100, display: 'panelGroup' },
      cells: [[1]],
      item: {
        size: { width: 80, height: 60 },
        components: [{
          type: 'bar',
          id: 'usage',
          show: true,
          size: { width: 80, height: 60 },
          source: { type: 'rect', fill: '#2563eb' },
          animation: false,
        }],
      },
    }],
    selection: {
      isSelectable: (target) => {
        exactSelectableTargets.push(target);
        return true;
      },
      visual: { color: '#ef4444', strokeWidth: 3, displayMode: 'element-only' },
    },
  });
  releaseExactSelection = exactMap.selection.onPointerChange((change) => {
    exactSelectionChanges.push(change);
  });
  const baselineRed = await captureGlyphMask(map, 'red');
  map.selection.set('pointer-grid.0.0');
  const programmaticRed = await captureGlyphMask(map, 'red');
  map.selection.set(['pointer-grid.0.0', 'pointer-grid.0.1']);
  const multiRed = await captureGlyphMask(map, 'red');
  map.selection.clear();
  const clearedRed = await captureGlyphMask(map, 'red');
  subscribe(firstHover, firstSelection);
  const firstViewportBefore = structuredClone(map.viewport.state);

  return new Promise((resolve, reject) => {
    let firstFinished = false;
    let remountFinished = false;
    window.__PATCH_MAP_POINTER_PROBE__ = {
      phase: 'first',
      captureDuring: false,
      captureAfter: true,
      remountCaptureDuring: false,
      remountCaptureAfter: true,
      record: (label) => {
        const probe = window.__PATCH_MAP_POINTER_PROBE__;
        probe[label] = structuredClone(map.viewport.state);
        probe[label + 'SelectionCount'] = firstSelection.length;
      },
      clearSelection: () => map.selection.clear(),
      ensureSelection: () => map.selection.set('pointer-grid.0.0'),
      captureColor: (color) => captureGlyphMask(map, color),
      selectionIds: () => [...map.selection.ids],
      captureExactColor: (color) => captureGlyphMask(exactMap, color),
      exactSelectionIds: () => [...exactMap.selection.ids],
      finishExact: async () => {
        releaseExactSelection?.();
        releaseExactSelection = null;
        const destroyed = await exactMap.destroy();
        exactMap = null;
        exactHost.remove();
        return destroyed;
      },
      markPostViewportHover: () => {
        window.__PATCH_MAP_POINTER_PROBE__.postViewportHoverStart = firstHover.length;
      },
      finishFirst: async () => {
        if (firstFinished) return;
        firstFinished = true;
        try {
          const firstViewportAfter = structuredClone(map.viewport.state);
          const firstSubscriptionCount = map.debug.snapshot().resources.subscriptions.active;
          release();
          const firstDestroy = await map.destroy();
          const firstCanvasCountAfterDestroy = pointerHost.querySelectorAll('canvas').length;
          map = await mount('packed-pointer-remount', false);
          subscribe(remountHover, remountSelection);
          Object.assign(window.__PATCH_MAP_POINTER_PROBE__, {
            phase: 'remount',
            firstViewportAfter,
            firstSubscriptionCount,
            firstDestroy,
            firstCanvasCountAfterDestroy,
          });
        } catch (error) {
          reject(error);
        }
      },
      finishRemount: async () => {
        if (remountFinished) return;
        remountFinished = true;
        try {
          const probe = window.__PATCH_MAP_POINTER_PROBE__;
          const remountSubscriptionCount = map.debug.snapshot().resources.subscriptions.active;
          release();
          const remountDestroy = await map.destroy();
          map = null;
          const canvasCountAfterDestroy = pointerHost.querySelectorAll('canvas').length;
          const result = {
            firstHover: firstHover.map(({ type, target, previousTarget, anchor }) => ({
              type, target, previousTarget, anchor,
            })),
            firstSelection,
            firstViewportBefore,
            firstViewportAfter: probe.firstViewportAfter,
            plainPanBefore: probe.plainPanBefore,
            plainPanAfter: probe.plainPanAfter,
            plainPanBeforeSelectionCount: probe.plainPanBeforeSelectionCount,
            plainPanAfterSelectionCount: probe.plainPanAfterSelectionCount,
            lateShiftPanBefore: probe.lateShiftPanBefore,
            lateShiftPanAfter: probe.lateShiftPanAfter,
            lateShiftPanBeforeSelectionCount: probe.lateShiftPanBeforeSelectionCount,
            lateShiftPanAfterSelectionCount: probe.lateShiftPanAfterSelectionCount,
            wheelBefore: probe.wheelBefore,
            wheelAfter: probe.wheelAfter,
            wheelBeforeSelectionCount: probe.wheelBeforeSelectionCount,
            wheelAfterSelectionCount: probe.wheelAfterSelectionCount,
            middlePanBefore: probe.middlePanBefore,
            middlePanAfter: probe.middlePanAfter,
            middlePanBeforeSelectionCount: probe.middlePanBeforeSelectionCount,
            middlePanAfterSelectionCount: probe.middlePanAfterSelectionCount,
            boxViewportBefore: probe.boxViewportBefore,
            boxViewportAfter: probe.boxViewportAfter,
            boxViewportBeforeSelectionCount: probe.boxViewportBeforeSelectionCount,
            boxViewportAfterSelectionCount: probe.boxViewportAfterSelectionCount,
            postViewportHoverStart: probe.postViewportHoverStart,
            firstSubscriptionCount: probe.firstSubscriptionCount,
            captureDuring: probe.captureDuring,
            captureAfter: probe.captureAfter,
            remountCaptureDuring: probe.remountCaptureDuring,
            remountCaptureAfter: probe.remountCaptureAfter,
            firstDestroy: probe.firstDestroy,
            firstCanvasCountAfterDestroy: probe.firstCanvasCountAfterDestroy,
            remountHover: remountHover.map(({ type, target }) => ({ type, target })),
            remountSelection,
            remountSubscriptionCount,
            remountDestroy,
            canvasCountAfterDestroy,
            baselineRed,
            programmaticRed,
            multiRed,
            clearedRed,
            clickRed: probe.clickRed,
            concreteBarClickRed: probe.concreteBarClickRed,
            concreteBarClickSelectionIds: probe.concreteBarClickSelectionIds,
            exactCellPointRed: probe.exactCellPointRed,
            exactCellPointSelectionIds: probe.exactCellPointSelectionIds,
            exactCellPointDestroy: probe.exactCellPointDestroy,
            exactCellPointCanvasCountAfterDestroy:
              probe.exactCellPointCanvasCountAfterDestroy,
            exactSelectableTargets,
            exactSelectionChanges,
            targetDoubleSelectionIds: probe.targetDoubleSelectionIds,
            targetDoubleSelectionCount: probe.targetDoubleSelectionCount,
            blankSingleSelectionIds: probe.blankSingleSelectionIds,
            blankSingleSelectionCount: probe.blankSingleSelectionCount,
            blankDoubleSelectionIds: probe.blankDoubleSelectionIds,
            blankDoubleSelectionCount: probe.blankDoubleSelectionCount,
            marqueeDuringBlue: probe.marqueeDuringBlue,
            marqueeDuringRed: probe.marqueeDuringRed,
            marqueeAfterBlue: probe.marqueeAfterBlue,
            marqueeAfterRed: probe.marqueeAfterRed,
            marqueeClearedRed: probe.marqueeClearedRed,
            remountMarqueeDuringRed: probe.remountMarqueeDuringRed,
            remountMarqueeDuringBlue: probe.remountMarqueeDuringBlue,
            remountMarqueeAfterRed: probe.remountMarqueeAfterRed,
            remountMarqueeAfterBlue: probe.remountMarqueeAfterBlue,
            selectableTargets,
            datasetImmutable: datasetBefore === JSON.stringify(dataset),
          };
          pointerHost.remove();
          probe.phase = 'complete';
          resolve(result);
        } catch (error) {
          reject(error);
        }
      },
    };
  }).finally(async () => {
    release();
    releaseExactSelection?.();
    await exactMap?.destroy().catch(() => undefined);
    exactHost.remove();
    await map?.destroy().catch(() => undefined);
    pointerHost.remove();
  });
}

async function verifySelectionBoundsDisplayLifecycle() {
  const host = document.createElement('div');
  Object.assign(host.style, { width: '240px', height: '130px' });
  document.body.appendChild(host);
  const data = [{
    type: 'grid',
    id: 'bounds-grid',
    attrs: { x: 20, y: 30 },
    cells: [[1, 0, 1]],
    item: {
      size: { width: 60, height: 60 },
      components: [{
        type: 'bar',
        id: 'bar',
        source: { type: 'rect', fill: '#ffffff' },
        size: { width: 60, height: 60 },
        placement: 'center',
        tint: '#2563eb',
        animation: false,
      }],
    },
  }];
  const selectedComponents = [
    'bounds-grid.0.0/bar',
    'bounds-grid.0.2/bar',
  ];
  const results = {};
  let map = null;
  try {
    for (const displayMode of ['element-only', 'group-only', 'all']) {
      map = await PatchMap.mount({
        container: host,
        instanceId: 'packed-selection-bounds-' + displayMode,
        width: 240,
        height: 130,
        pixelRatio: 1,
        background: '#000000',
        resizeMode: 'manual',
        fit: false,
        data,
        selection: {
          allowMultiple: true,
          visual: { color: '#ef4444', strokeWidth: 3, displayMode },
        },
      });
      map.selection.set(selectedComponents[0]);
      const single = await captureSelectionBoundsRaster(map);
      map.selection.set(selectedComponents);
      const multiple = await captureSelectionBoundsRaster(map);
      const selectionIds = [...map.selection.ids];
      const renderCommandCount = map.debug.snapshot().resources.rendering.commandCount;
      const destroy = await map.destroy();
      map = null;
      results[displayMode] = {
        single,
        multiple,
        selectionIds,
        renderCommandCount,
        destroy,
      };
    }
    return {
      ...results,
      canvasCountAfterDestroy: host.querySelectorAll('canvas').length,
    };
  } finally {
    await map?.destroy().catch(() => undefined);
    host.remove();
  }
}

async function captureSelectionBoundsRaster(map) {
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
  const isRed = (x, y) => {
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return false;
    const offset = (Math.trunc(y) * canvas.width + Math.trunc(x)) * 4;
    const red = pixels[offset];
    const green = pixels[offset + 1];
    const blue = pixels[offset + 2];
    const alpha = pixels[offset + 3];
    return red > 120 && red > green * 1.5 && red > blue * 1.5 && alpha > 180;
  };
  const near = (centerX, centerY) => {
    let count = 0;
    for (let y = centerY - 3; y <= centerY + 3; y += 1) {
      for (let x = centerX - 3; x <= centerX + 3; x += 1) {
        if (isRed(x, y)) count += 1;
      }
    }
    return count;
  };
  let redPixelCount = 0;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (isRed(x, y)) redPixelCount += 1;
    }
  }
  return {
    redPixelCount,
    outerTopGap: near(110, 30),
    firstInnerEdge: near(80, 60),
    secondInnerEdge: near(140, 60),
    gapCenter: near(110, 60),
  };
}

async function captureGlyphMask(map, color) {
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
  const points = [];
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const offset = (y * canvas.width + x) * 4;
      const red = pixels[offset];
      const green = pixels[offset + 1];
      const blue = pixels[offset + 2];
      const alpha = pixels[offset + 3];
      const matches = color === 'green'
        ? green > 110 && green > red * 1.3 && green > blue * 1.3 && alpha > 180
        : color === 'blue'
          ? blue > 120 && green > blue * 0.5 && red < green * 0.5 && alpha > 180
          : red > 120 && red > green * 1.5 && red > blue * 1.5 && alpha > 180;
      if (matches) points.push([x, y]);
    }
  }
  if (points.length === 0) return { pixelCount: 0, signature: '', occupancy: 0 };
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
  return {
    pixelCount: points.length,
    bounds: { minX, maxX, minY, maxY, width, height },
    occupancy: points.length / (width * height),
    signature: buckets
      .map((row) => row.map((count) => count >= 2 ? '1' : '0').join(''))
      .join('/'),
  };
}
`;

export const PACKED_CONSUMER_CJS_SOURCE = `
const packageApi = require('@conalog/patch-map');
const {
  PatchMap,
  materializePatchMapCompatibilityDataset,
  preparePatchMapPersistenceExport,
} = packageApi;
const canonical = materializePatchMapCompatibilityDataset([
  { type: 'rect', id: 'cjs-rect', size: 10, fill: '#ff0000' },
]);
const persistence = preparePatchMapPersistenceExport(canonical.canonicalDataset);
let constructorRejected = false;
try {
  Reflect.construct(PatchMap, []);
} catch {
  constructorRejected = true;
}
const internalNames = [
  'PatchMapFrameLoop',
  'PatchMapPixiRenderer',
  'PatchMapMigrationAuthority',
  'parsePatchMapV010',
  'planPatchMapMutationTransaction',
];
process.stdout.write(JSON.stringify({
  mountType: typeof PatchMap.mount,
  compatibilityType: typeof materializePatchMapCompatibilityDataset,
  persistenceType: typeof preparePatchMapPersistenceExport,
  rootKind: persistence.rootKind,
  id: persistence.dataset[0]?.id ?? null,
  internalExportsAbsent: internalNames.every((name) => !(name in packageApi)),
  constructorRejected,
}));
`;
