export function createPackedConsumerPackageJson(tarball) {
  return `${JSON.stringify({
    name: 'patch-map-package-consumer',
    private: true,
    type: 'module',
    dependencies: {
      '@conalog/patch-map': `file:${tarball}`,
      'pixi.js': '8.19.0',
      'typescript': '5.9.3',
    },
  }, null, 2)}\n`;
}

export const PACKED_CONSUMER_HTML_SOURCE =
  '<!doctype html>\n<html><body><div id="host" style="width:640px;height:360px"></div><script type="module" src="/main.js"></script></body></html>\n';

export const PACKED_CONSUMER_ESM_SOURCE = `
import * as packageApi from '@conalog/patch-map';
import {
  PatchMap,
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
  internalExportsAbsent: internalNames.every((name) => !(name in packageApi)),
  constructorRejected,
  instanceInternalsAbsent,
  destroyResult,
  destroyed: map.destroyed,
  canvasCountAfterDestroy: document.querySelectorAll('canvas').length,
};
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
