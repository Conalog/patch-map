const HOST_DEPENDENCIES = Object.freeze({
  'pixi.js': '8.19.0',
  typescript: '5.9.3',
});

export function createPackedConsumerPackageJson(tarball) {
  return `${JSON.stringify({
    name: 'patch-map-package-consumer',
    private: true,
    type: 'module',
    dependencies: {
      '@conalog/patch-map': `file:${tarball}`,
      ...HOST_DEPENDENCIES,
    },
  }, null, 2)}\n`;
}

export function createPackedConsumerDependencySeedPackageJson() {
  return `${JSON.stringify({
    name: 'patch-map-package-consumer-dependency-seed',
    private: true,
    dependencies: HOST_DEPENDENCIES,
  }, null, 2)}\n`;
}

export const PACKED_CONSUMER_HTML_SOURCE =
  '<!doctype html>\n<html><body><div id="host" style="width:640px;height:360px"></div><button id="host-overlay" style="position:fixed;left:60px;top:50px;width:80px;height:60px;z-index:10">Host overlay</button><script type="module" src="/main.js"></script></body></html>\n';

export const PACKED_CONSUMER_ESM_SOURCE = `
import * as packageApi from '@conalog/patch-map';
import { PatchMap } from '@conalog/patch-map';

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
const immutableBefore = JSON.stringify(input);
const map = await PatchMap.mount({
  container: document.querySelector('#host'),
  instanceId: 'packed-public-consumer',
  width: 640,
  height: 360,
  backend: 'webgl',
  resizeMode: 'manual',
  data: input,
});

const initial = map.debug.snapshot();
const bars = map.targets.query({ type: 'bar', scope: 'authored' });
const presentation = map.presentation.set('packed:focus', {
  scope: bars,
  targets: [],
  unmatched: { alphaMultiplier: 0.5 },
});
const presentationCleared = map.presentation.clear('packed:focus');
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
const serialized = JSON.parse(map.data.serialize());
const capture = await map.capture.png();
const pointerHoverTargets = [];
const releasePointerHover = map.pointer.onHover((event) => {
  pointerHoverTargets.push(event.target?.id ?? null);
});

let constructorRejected = false;
try {
  Reflect.construct(PatchMap, []);
} catch {
  constructorRejected = true;
}
const internalNames = [
  'PatchMapFrameLoop',
  'PatchMapPixiRenderer',
  'parsePatchMap',
  'planPatchMapMutationTransaction',
];
window.__PACKAGE_POINTER_OWNERSHIP__ = Object.freeze({
  hoverTargets: () => [...pointerHoverTargets],
  viewport: () => map.viewport.snapshot(),
  finalize: async (pointerOwnership) => {
    releasePointerHover();
    const destroyResult = await map.destroy();
    window.__PACKAGE_RESULT__ = {
      immutable: immutableBefore === JSON.stringify(input),
      backend: initial.resources.renderer?.backend ?? null,
      renderObjects: initial.resources.rendering.commandCount,
      barTargetCount: bars.count,
      presentationChanged: presentation.changed,
      presentationCleared,
      updateStatus: update.status,
      updatedBarHeight: updatedBar?.value?.size?.height ?? null,
      selection,
      transformStatus: transform.status,
      undoStatus: undo.status,
      redoStatus: redo.status,
      transactionStatus: transaction.status,
      serializedRootCount: serialized.length,
      serializedAddedId: serialized[1]?.id ?? null,
      capturePrefix: capture.dataUrl.slice(0, 22),
      captureLength: capture.dataUrl.length,
      pointerOwnership,
      internalExportsAbsent: internalNames.every((name) => !(name in packageApi)),
      constructorRejected,
      destroyResult,
      destroyed: map.destroyed,
      canvasCountAfterDestroy: document.querySelectorAll('canvas').length,
    };
  },
});
`;

export const PACKED_CONSUMER_CJS_SOURCE = `
const packageApi = require('@conalog/patch-map');
const { PatchMap } = packageApi;
let constructorRejected = false;
try {
  Reflect.construct(PatchMap, []);
} catch {
  constructorRejected = true;
}
const internalNames = [
  'PatchMapFrameLoop',
  'PatchMapPixiRenderer',
  'parsePatchMap',
  'planPatchMapMutationTransaction',
];
process.stdout.write(JSON.stringify({
  mountType: typeof PatchMap.mount,
  internalExportsAbsent: internalNames.every((name) => !(name in packageApi)),
  constructorRejected,
}));
`;
