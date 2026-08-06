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
const directImage = await verifyDirectImageLifecycle();
const theme = await verifyThemeLifecycle();
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
  capturePrefix: capture.dataUrl.slice(0, 22),
  captureLength: capture.dataUrl.length,
  directImage,
  theme,
  internalExportsAbsent: internalNames.every((name) => !(name in packageApi)),
  constructorRejected,
  instanceInternalsAbsent,
  destroyResult,
  destroyed: map.destroyed,
  canvasCountAfterDestroy: document.querySelectorAll('canvas').length,
};

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
      remountState,
      remountCaptureLength: remountCapture.dataUrl.length,
      remountDestroy,
      finalResourceCount: runtime.probe().resourceCount,
      canvasCountAfterDestroy: directHost.querySelectorAll('canvas').length,
    };
  } finally {
    await direct?.destroy().catch(() => undefined);
    directHost.remove();
  }
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
