#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { chromium } from 'playwright';
import { createServer } from 'vite';

const execute = promisify(execFile);
const ROOT = process.cwd();
const RESULTS = path.join(ROOT, 'performance/core-v2/results');
const temporary = await mkdtemp(path.join(tmpdir(), 'patch-map-core-v2-package-'));
const consumer = path.join(temporary, 'consumer');
const errors = { console: [], page: [], network: [] };
let server;
let browser;

try {
  await mkdir(consumer, { recursive: true });
  const packed = await execute('npm', ['pack', '--json', '--pack-destination', temporary], {
    cwd: ROOT,
    maxBuffer: 10 * 1024 * 1024,
  });
  const packResult = JSON.parse(packed.stdout);
  const filename = packResult[0]?.filename;
  if (typeof filename !== 'string') throw new Error('npm pack did not return a tarball filename');
  const tarball = path.join(temporary, filename);
  await writeFile(
    path.join(consumer, 'package.json'),
    `${JSON.stringify({
      name: 'core-v2-package-consumer',
      private: true,
      type: 'module',
      dependencies: {
        '@conalog/patch-map': `file:${tarball}`,
        'pixi.js': '8.19.0',
      },
    }, null, 2)}\n`,
  );
  await writeFile(path.join(consumer, 'index.html'), `<!doctype html>
<html><body><div id="host" style="width:640px;height:360px"></div><script type="module" src="/main.js"></script></body></html>\n`);
  await writeFile(path.join(consumer, 'main.js'), `
import {
  CORE_V2_HOST_INTERACTION_REVISION,
  CORE_V2_MUTATION_TRANSACTION_REVISION,
  CORE_V2_POINTER_GESTURE_REVISION,
  CORE_V2_PRESENTATION_POLICY_REVISION,
  CORE_V2_SELECTION_TRANSFORMER_REVISION,
  CORE_V2_TRANSFORMER_EDIT_REVISION,
  CoreV2Engine,
  CoreV2HostInteractionAuthority,
  CoreV2PointerGestureAuthority,
  CoreV2TransformerGestureAuthority,
  createCoreV2,
  hitCoreV2BoxRegion,
  hitCoreV2PaintRegion,
  parsePatchMapV010,
  planCoreV2TransformerEdit,
  resolveCoreV2RotationSnap,
} from '@conalog/patch-map/core-v2';

const input = [{
  type: 'item', id: 'consumer-item', show: true, attrs: { x: 20, y: 30 }, size: { width: 80, height: 120 },
  components: [
    { type: 'background', id: 'bg', source: { type: 'rect', fill: '#eef2ff', borderColor: '#334155', borderWidth: 1, radius: 6 } },
    { type: 'bar', id: 'bar', source: { type: 'rect', fill: '#2563eb' }, tint: '#2563eb', size: { width: '70%', height: '80%' }, placement: 'bottom', animation: true },
    { type: 'text', id: 'label', text: '42', placement: 'top', style: { fontSize: 14, fill: '#111827' } },
  ],
}];
const hierarchyInput = [
  {
    type: 'group', id: 'group-a', attrs: { x: 0, y: 0 }, children: [
      { type: 'rect', id: 'rect-b', size: { width: 40, height: 30 }, fill: '#ff8800', attrs: { x: 160, y: 40 } },
    ],
  },
  { type: 'group', id: 'group-b', attrs: { x: 240, y: 0 }, children: [] },
];
const before = JSON.stringify(input);
const hierarchyBefore = JSON.stringify(hierarchyInput);
const parsed = parsePatchMapV010(input);
const pointerAuthority = new CoreV2PointerGestureAuthority({
  hitTest: ({ x, y }) => x <= 100 && y <= 100 ? 'consumer-item' : null,
});
const pointerInput = (type, timeMs, buttons) => ({
  type,
  pointerId: 1,
  pointerType: 'mouse',
  button: 0,
  buttons,
  screen: [20, 30],
  timeMs,
  modifiers: { shift: false, ctrl: false, alt: false, meta: false },
  viewRevision: 0,
});
pointerAuthority.dispatch(pointerInput('down', 0, 1));
const pointerClick = pointerAuthority.dispatch(pointerInput('up', 16, 0));
const pointerBox = hitCoreV2BoxRegion([
  {
    id: 'consumer-item',
    screenBounds: [10, 20, 80, 120],
    visible: true,
    interactive: true,
  },
], [], [0, 0], [100, 160]);
const pointerPaint = hitCoreV2PaintRegion([
  {
    id: 'consumer-item',
    screenBounds: [10, 20, 80, 120],
    visible: true,
    interactive: true,
  },
], [], [[[0, 30], [100, 30]]]);
pointerAuthority.destroy();
const core = await createCoreV2({ target: document.querySelector('#host'), width: 640, height: 360, strategy: 'mesh', preference: 'webgl', autoRender: false });
const loaded = core.load(input);
await core.prepare();
core.fit();
core.flush('consumer-first-frame');
core.animateBarHeights({ durationMs: 32, seed: 1 });
core.advance(16);
core.flush('consumer-animation');
const capture = await core.captureBase64();
const debugBeforeDestroy = core.debugSnapshot();
await core.destroy();
const engine = new CoreV2Engine();
await engine.initialize({
  instanceId: 'packed-engine-transaction',
  target: document.querySelector('#host'),
  width: 640,
  height: 360,
  strategy: 'mesh',
  preference: 'webgl',
});
engine.loadDataset(input);
const hostBindingDeliveries = [];
const hostBinding = engine.bindLogicalEvents([
  {
    id: 'consumer-direct',
    event: 'click',
    target: { kind: 'element', id: 'consumer-item' },
  },
], (delivery) => hostBindingDeliveries.push(delivery.targetId));
hostBinding.enable();
engine.dispatchPointerInput(pointerInput('down', 40, 1));
engine.dispatchPointerInput(pointerInput('up', 56, 0));
hostBinding.dispose();
engine.applySelection({ op: 'clear', source: 'programmatic' });
const hostEvents = [];
const hostEventSubscription = engine.subscribeHostEvent(
  'selection',
  'changed',
  (event) => hostEvents.push(event),
);
const hostSelectionPublications = [];
const unbindSelectionHost = engine.bindSelectionHost(
  (publication) => hostSelectionPublications.push(publication),
);
engine.applySelection({
  op: 'replace',
  ids: ['consumer-item'],
  source: 'canvas',
});
const externalSelection = engine.setExternalSelection(['consumer-item', 'missing']);
const logicalPropagation = engine.dispatchLogicalPropagation({
  kind: 'component',
  ownerId: 'consumer-item',
  id: 'label',
});
engine.applyInteractionModeOperation({ op: 'replace', state: 'select' });
engine.applyInteractionModeOperation({ op: 'push', state: 'pan' });
engine.applyInteractionModeOperation({ op: 'pop' });
hostEventSubscription.dispose();
unbindSelectionHost();
const hostInteractionBeforeDestroy = engine.hostInteractionProbe();
const emptyBulk = engine.bulkPatch({
  strict: true,
  actionId: 'packed-empty-target-set',
  targets: [],
  changes: [{ path: ['attrs', 'x'], value: 999 }],
});
const transaction = engine.transact({
  strict: true,
  actionId: 'packed-bar-update',
  operations: [{
    op: 'merge',
    target: { kind: 'component', ownerId: 'consumer-item', id: 'bar' },
    changes: [{ path: ['size', 'height'], value: 30 }],
  }],
});
await engine.publishFrame(16);
const resolvedBar = engine.resolveTarget({
  kind: 'component',
  ownerId: 'consumer-item',
  id: 'bar',
});
const presentationSet = engine.setPresentationPolicy({
  highlightIds: ['consumer-item'],
  deEmphasisAlpha: 0.2,
});
engine.publishFrame(20);
const presentationProbe = engine.presentationPolicyProbe();
const presentationClear = engine.clearPresentationPolicy();
engine.publishFrame(24);
const overlayHistoryBefore = engine.historyState();
const liveOverlay = engine.applyLiveOverlay({
  sourceRevision: 2,
  payloadHash: 'packed-overlay-2',
  transaction: {
    strict: true,
    recordHistory: false,
    actionId: 'packed-live-overlay',
    operations: [{
      op: 'merge',
      target: { kind: 'component', ownerId: 'consumer-item', id: 'label' },
      changes: [{ path: ['text'], value: '43' }],
    }],
  },
});
engine.publishFrame(28);
const liveOverlayProbe = engine.liveOverlayProbe();
const externalDependency = engine.replaceExternalDependency('font-fixture', 'font-fixture-2');
const refreshBefore = engine.snapshot();
const semanticRefresh = engine.refreshSemantic({
  targets: [{ kind: 'component', ownerId: 'consumer-item', id: 'label' }],
  recordHistory: false,
});
engine.publishFrame(32);
const refreshAfter = engine.snapshot();
const overlayHistoryAfter = engine.historyState();
engine.loadDataset(hierarchyInput, { datasetRef: 'packed-hierarchy' });
engine.select(['rect-b']);
const transformerEditPlan = planCoreV2TransformerEdit(engine.exportDataset(), {
  kind: 'resize',
  selectionIds: ['rect-b'],
  handle: 'se',
  deltaWorld: [10, 10],
});
const transformerSnap = resolveCoreV2RotationSnap(350, 7, true, 15);
const transformerSessionBegin = engine.beginTransformerEdit({
  pointerId: 92,
  actionId: 'packed-transform-preview',
  kind: 'move',
  handle: 'frame',
  selectionIds: ['rect-b'],
});
const transformerPreview = engine.previewTransformerEdit(92, {
  kind: 'move',
  selectionIds: ['rect-b'],
  deltaWorld: [10, 5],
});
const transformerSessionCancel = engine.cancelTransformerEdit(92, 'escape');
const transformerEditProbe = engine.transformerEditProbe();
const transformerSubset = engine.transformableSubset(['rect-b']);
const transformerVisual = engine.setSelectionVisualPolicy({
  selectionIds: ['rect-b'],
  mode: 'all',
  handleCssPx: 8,
  strokeCssPx: 1,
});
const transformerHandles = engine.transformerHandleProbe({
  selectionIds: ['rect-b'],
  cornerCssPx: 8,
  edgeStripCssPx: 6,
  rotateZoneCssPx: 12,
});
engine.beginTransformerHandleGesture(91, 'se');
const transformerSelectionRoute = engine.routeTransformerInput(91, 'selection');
const transformerDeliveryRoute = engine.routeTransformerInput(91, 'transform');
const transformerCompletion = engine.completeTransformerHandleGesture(91);
const hierarchyMove = engine.transact({
  strict: true,
  actionId: 'packed-structure-1',
  operations: [{
    op: 'move',
    target: { kind: 'element', id: 'rect-b' },
    parent: { kind: 'element', id: 'group-b' },
    index: 0,
  }],
});
const hierarchyGroup = engine.transact({
  strict: true,
  actionId: 'packed-structure-2',
  operations: [{
    op: 'group',
    targets: [{ kind: 'element', id: 'rect-b' }],
    value: { type: 'group', id: 'group-c' },
  }],
});
const hierarchyUngroup = engine.transact({
  strict: true,
  actionId: 'packed-structure-3',
  operations: [{
    op: 'ungroup',
    target: { kind: 'element', id: 'group-c' },
    relationPolicy: 'reject',
  }],
});
const hierarchyUnrecorded = engine.transact({
  strict: true,
  recordHistory: false,
  operations: [{
    op: 'move',
    target: { kind: 'element', id: 'group-a' },
    parent: { kind: 'element', id: 'group-b' },
    index: 1,
  }],
});
const hierarchyCycleRevision = engine.snapshot().revisions.sceneRevision;
const hierarchyCycle = engine.transact({
  strict: true,
  operations: [{
    op: 'move',
    target: { kind: 'element', id: 'group-b' },
    parent: { kind: 'element', id: 'group-a' },
    index: 0,
  }],
});
await engine.publishFrame(32);
const hierarchyDataset = engine.exportDataset();
const hierarchyRect = findHierarchyRecord(hierarchyDataset, 'rect-b');
const hierarchyRelations = engine.relationProbe();
const hierarchySnapshot = engine.snapshot();
const hierarchyHistory = engine.historyState();
const hierarchyCycleRevisionDelta =
  hierarchySnapshot.revisions.sceneRevision - hierarchyCycleRevision;
const historyCompanionBefore = engine.setHistoryCompanion({
  selectedIds: ['rect-b'],
  mode: 'select',
  dirty: false,
});
const historyTransaction = engine.transact({
  strict: true,
  actionId: 'packed-history',
  operations: [
    {
      op: 'add',
      parent: { kind: 'element', id: 'group-b' },
      collection: 'children',
      index: 0,
      value: {
        type: 'rect',
        id: 'packed-history-added',
        size: { width: 16, height: 12 },
        fill: '#334455',
      },
    },
    {
      op: 'merge',
      target: { kind: 'element', id: 'group-a' },
      changes: [{ path: ['attrs', 'x'], value: 12 }],
    },
  ],
  history: {
    selectedIds: ['rect-b'],
    mode: 'transform',
    dirty: true,
  },
});
const historyInspection = engine.historyInspection();
const historyUndo = engine.undo();
const historyCompanionAfterUndo = engine.historyCompanionState();
const historyAddedAfterUndo = engine.resolveTarget({
  kind: 'element',
  id: 'packed-history-added',
});
await engine.publishFrame(36);
const historyRedo = engine.redo();
const historyCompanionAfterRedo = engine.historyCompanionState();
const historyAddedAfterRedo = engine.resolveTarget({
  kind: 'element',
  id: 'packed-history-added',
});
await engine.publishFrame(40);
const historyInvalidCapacity = engine.setHistoryCapacity(-1);
const historyProtectedShortcut = engine.handleHistoryShortcut({
  key: 'z',
  code: 'KeyZ',
  ctrlKey: true,
  metaKey: false,
  shiftKey: false,
  pathKind: 'input',
});
const historyClear = engine.clearHistory();
const historyAfterClear = engine.historyState();
const interactionOwnership = engine.interactionOwnershipProbe();
const engineDestroyResult = await engine.destroy();
const hostInteractionAfterDestroy = engine.hostInteractionProbe();
const transformerAfterDestroy = engine.transformerGestureProbe();
const engineAfterDestroy = engine.snapshot();
window.__PACKAGE_RESULT__ = {
  immutable: before === JSON.stringify(input),
  hierarchyImmutable: hierarchyBefore === JSON.stringify(hierarchyInput),
  parsedEntities: parsed.identity.counts.entities,
  loadedEntities: loaded.store.entityCount,
  capturePrefix: capture.slice(0, 22),
  captureLength: capture.length,
  backend: debugBeforeDestroy.renderer.backend,
  strategy: debugBeforeDestroy.renderer.strategy,
  renderObjects: debugBeforeDestroy.renderer.aggregateRenderObjects,
  canvasCountAfterDestroy: document.querySelectorAll('canvas').length,
  destroyed: core.debugSnapshot().destroyed,
  transactionRevision: CORE_V2_MUTATION_TRANSACTION_REVISION,
  hostInteractionRevision: CORE_V2_HOST_INTERACTION_REVISION,
  pointerRevision: CORE_V2_POINTER_GESTURE_REVISION,
  presentationRevision: CORE_V2_PRESENTATION_POLICY_REVISION,
  selectionTransformerRevision: CORE_V2_SELECTION_TRANSFORMER_REVISION,
  transformerEditRevision: CORE_V2_TRANSFORMER_EDIT_REVISION,
  pointerPackage: {
    eventTypes: pointerClick.events.map(({ type }) => type),
    clickTarget: pointerClick.events.at(-1)?.payload.target?.id ?? null,
    boxTargets: pointerBox.candidateIds,
    paintTargets: pointerPaint.candidateIds,
    destroyed: pointerAuthority.probe().destroyed,
  },
  hostInteractionPackage: {
    authorityType: typeof CoreV2HostInteractionAuthority,
    bindingDeliveries: hostBindingDeliveries,
    eventCount: hostEvents.length,
    hostPublicationCount: hostSelectionPublications.length,
    missingIds: externalSelection.missingIds,
    propagationTarget: logicalPropagation?.target ?? null,
    propagationPhases: logicalPropagation?.phases ?? [],
    activeState: hostInteractionBeforeDestroy.mode.activeState,
    liveResources: {
      bindings: hostInteractionBeforeDestroy.bindings,
      subscriptions: hostInteractionBeforeDestroy.eventSubscriptions,
      selectionHosts: hostInteractionBeforeDestroy.selectionHostListeners,
    },
    destroyed: hostInteractionAfterDestroy.destroyed,
    destroyedOwnerCount: hostInteractionAfterDestroy.mode.activeOwnerCount,
  },
  selectionTransformerPackage: {
    authorityType: typeof CoreV2TransformerGestureAuthority,
    subsetIndicator: transformerSubset.subsetIndicator,
    activeResizeHandles: transformerSubset.activeResizeHandles,
    overlayCount: transformerVisual?.overlayCount ?? 0,
    visibleCorners: transformerHandles?.visibleCorners ?? [],
    selectionRoute: transformerSelectionRoute,
    transformRoute: transformerDeliveryRoute,
    completed: transformerCompletion.completed,
    settledActiveGestureCount: transformerCompletion.probe.activeGestureCount,
    destroyed: transformerAfterDestroy.destroyed,
    destroyedActiveGestureCount: transformerAfterDestroy.activeGestureCount,
  },
  transformerEditPackage: {
    plannerType: typeof planCoreV2TransformerEdit,
    snapType: typeof resolveCoreV2RotationSnap,
    planStatus: transformerEditPlan.status,
    plannedSize: [
      transformerEditPlan.after['rect-b']?.width ?? null,
      transformerEditPlan.after['rect-b']?.height ?? null,
    ],
    snapAppliedDegrees: transformerSnap.appliedDegrees,
    sessionActiveCount: transformerSessionBegin.activeSessionCount,
    previewStatus: transformerPreview.status,
    cancelStatus: transformerSessionCancel.status,
    settledActiveCount: transformerEditProbe.activeSessionCount,
    settledOverlayCount: transformerEditProbe.previewOverlayCount,
    settledCaptureCount: engine.transformerGestureProbe().pointerCaptureCount,
  },
  emptyBulkStatus: emptyBulk.status,
  emptyBulkSceneRevision: emptyBulk.revisions.sceneRevision,
  transactionStatus: transaction.status,
  transactionSceneRevision: transaction.revisions.sceneRevision,
  transactionBarHeight: resolvedBar?.value?.size?.height ?? null,
  presentation: {
    setChanged: presentationSet.changed,
    status: presentationProbe.status,
    itemEmphasis:
      presentationProbe.entities.find(({ id }) => id === 'consumer-item')?.emphasis ?? null,
    clearChanged: presentationClear.changed,
    clearedStatus: presentationClear.policy.status,
  },
  liveOverlay: {
    status: liveOverlay.status,
    latestAcceptedRevision: liveOverlayProbe.latestAccepted?.sourceRevision ?? null,
    latestPublishedRevision: liveOverlayProbe.latestPublished?.sourceRevision ?? null,
    pendingPublicationCount: liveOverlayProbe.pendingPublicationCount,
    historyUnchanged:
      JSON.stringify(overlayHistoryBefore) === JSON.stringify(overlayHistoryAfter),
  },
  semanticRefresh: {
    dependencyChanged: externalDependency.changed,
    status: semanticRefresh.status,
    recomputedTargets: semanticRefresh.recomputedTargets,
    dataDiffCount: semanticRefresh.dataDiffCount,
    revisionDelta:
      refreshAfter.revisions.sceneRevision - refreshBefore.revisions.sceneRevision,
    representedSceneRevision: refreshAfter.publishedTuple.scene,
  },
  hierarchy: {
    moveStatus: hierarchyMove.status,
    groupStatus: hierarchyGroup.status,
    ungroupStatus: hierarchyUngroup.status,
    unrecordedStatus: hierarchyUnrecorded.status,
    cycleStatus: hierarchyCycle.status,
    cycleCode: hierarchyCycle.transactionDiagnostic?.code ?? hierarchyCycle.diagnostic?.code ?? null,
    cycleRevisionDelta: hierarchyCycleRevisionDelta,
    rectParentId: hierarchyRect?.parentId ?? null,
    rectLocalPosition: hierarchyRect === null
      ? null
      : [hierarchyRect.record.attrs.x, hierarchyRect.record.attrs.y],
    selectionIds: hierarchySnapshot.selectionIds,
    historyDepth: hierarchyHistory.undoDepth,
    relationRevisionLag: hierarchyRelations?.revisionLag ?? null,
  },
  historyPackage: {
    companionBefore: historyCompanionBefore,
    transactionStatus: historyTransaction.status,
    transactionActionId: historyTransaction.history?.commandId ?? null,
    inspectedDepth: historyInspection.state.depth,
    inspectedLastActionId: historyInspection.commands.at(-1)?.id ?? null,
    inspectedLastRecordCount:
      historyInspection.commands.at(-1)?.records.length ?? null,
    undoStatus: historyUndo.status,
    undoDirection: historyUndo.direction,
    undoActionId: historyUndo.actionId,
    companionAfterUndo: historyCompanionAfterUndo,
    addedPresentAfterUndo: historyAddedAfterUndo !== null,
    redoStatus: historyRedo.status,
    redoDirection: historyRedo.direction,
    redoActionId: historyRedo.actionId,
    companionAfterRedo: historyCompanionAfterRedo,
    addedTypeAfterRedo: historyAddedAfterRedo?.value?.type ?? null,
    invalidCapacityStatus: historyInvalidCapacity.status,
    invalidCapacityCode: historyInvalidCapacity.code,
    protectedShortcut: historyProtectedShortcut,
    clearChanged: historyClear.changed,
    clearReason: historyClear.reason,
    clearedDepth: historyAfterClear.depth,
  },
  interactionOwnership,
  engineDestroyResult,
  engineAfterDestroy: {
    lifecycle: engineAfterDestroy.lifecycle,
    rootIds: engineAfterDestroy.rootIds,
    datasetRef: engineAfterDestroy.datasetRef,
    semanticHash: engineAfterDestroy.semanticHash,
    historyDepth: engineAfterDestroy.historyDepth,
    pendingWork: engineAfterDestroy.pendingWork,
    canvasCount: engineAfterDestroy.resources.canvasCount,
    subscriptions: engineAfterDestroy.resources.subscriptions,
    renderer: engineAfterDestroy.resources.renderer,
    assets: engineAfterDestroy.resources.assets,
  },
};

function findHierarchyRecord(values, id, parentId = null) {
  for (const value of values) {
    if (value.id === id) return { record: value, parentId };
    if (value.type !== 'group') continue;
    const nested = findHierarchyRecord(value.children, id, value.id);
    if (nested !== null) return nested;
  }
  return null;
}
`);
  await writeFile(path.join(consumer, 'consumer.cjs'), `
const {
  CORE_V2_HOST_INTERACTION_REVISION,
  CORE_V2_MUTATION_TRANSACTION_REVISION,
  CORE_V2_POINTER_GESTURE_REVISION,
  CORE_V2_PRESENTATION_POLICY_REVISION,
  CORE_V2_SELECTION_TRANSFORMER_REVISION,
  CORE_V2_TRANSFORMER_EDIT_REVISION,
  CoreV2PointerGestureAuthority,
  CoreV2Engine,
  CoreV2HostInteractionAuthority,
  CoreV2TransformerGestureAuthority,
  parsePatchMapV010,
  planCoreV2TransformerEdit,
  planCoreV2MutationTransaction,
  resolveCoreV2RotationSnap,
} = require('@conalog/patch-map/core-v2');
const result = parsePatchMapV010([{ type: 'rect', id: 'cjs-rect', size: 10, fill: '#ff0000' }]);
process.stdout.write(JSON.stringify({
  entities: result.identity.counts.entities,
  id: result.document.entities[0].id,
  transactionRevision: CORE_V2_MUTATION_TRANSACTION_REVISION,
  pointerRevision: CORE_V2_POINTER_GESTURE_REVISION,
  pointerAuthorityType: typeof CoreV2PointerGestureAuthority,
  hostInteractionRevision: CORE_V2_HOST_INTERACTION_REVISION,
  hostInteractionAuthorityType: typeof CoreV2HostInteractionAuthority,
  selectionTransformerRevision: CORE_V2_SELECTION_TRANSFORMER_REVISION,
  selectionTransformerAuthorityType: typeof CoreV2TransformerGestureAuthority,
  transformerEditRevision: CORE_V2_TRANSFORMER_EDIT_REVISION,
  transformerEditPlannerType: typeof planCoreV2TransformerEdit,
  transformerSnapType: typeof resolveCoreV2RotationSnap,
  transformerSessionType: typeof CoreV2Engine.prototype.beginTransformerEdit,
  presentationRevision: CORE_V2_PRESENTATION_POLICY_REVISION,
  plannerType: typeof planCoreV2MutationTransaction,
  historyEngineType: typeof CoreV2Engine,
  historyInspectionType: typeof CoreV2Engine.prototype.historyInspection,
  historyCompanionType: typeof CoreV2Engine.prototype.setHistoryCompanion,
  historyCapacityType: typeof CoreV2Engine.prototype.setHistoryCapacity,
  historyShortcutType: typeof CoreV2Engine.prototype.handleHistoryShortcut,
  historyClearType: typeof CoreV2Engine.prototype.clearHistory,
}));
`);

  await execute('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: consumer,
    maxBuffer: 20 * 1024 * 1024,
  });
  const cjs = JSON.parse((await execute('node', ['consumer.cjs'], { cwd: consumer })).stdout);
  server = await createServer({
    root: consumer,
    configFile: false,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  if (!baseUrl) throw new Error('package consumer Vite server has no URL');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  page.on('console', (message) => {
    if (message.type() === 'error') errors.console.push(message.text());
  });
  page.on('pageerror', (error) => errors.page.push(error.stack ?? error.message));
  page.on('requestfailed', (request) => errors.network.push(`${request.url()} ${request.failure()?.errorText ?? ''}`));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.network.push(`${response.url()} HTTP ${response.status()}`);
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  try {
    await page.waitForFunction(() => window.__PACKAGE_RESULT__ !== undefined, undefined, {
      timeout: 30_000,
    });
  } catch (error) {
    const browserState = await page.evaluate(() => ({
      readyState: document.readyState,
      resultPublished: window.__PACKAGE_RESULT__ !== undefined,
      bodyText: document.body.textContent?.slice(0, 500) ?? '',
    }));
    throw new Error(
      `packed consumer result timeout: ${error instanceof Error ? error.message : String(error)}; ` +
      `browserState=${JSON.stringify(browserState)}; errors=${JSON.stringify(errors)}`,
    );
  }
  const esm = await page.evaluate(() => window.__PACKAGE_RESULT__);
  const failures = [];
  if (!esm.immutable) failures.push('packed ESM consumer mutated direct input');
  if (!esm.hierarchyImmutable) failures.push('packed ESM hierarchy transaction mutated direct input');
  if (esm.parsedEntities !== esm.loadedEntities || esm.loadedEntities < 3) failures.push('packed ESM entity counts disagree');
  if (!String(esm.capturePrefix).startsWith('data:image/png')) failures.push('packed ESM capture is not PNG data');
  if (!(esm.captureLength > 100)) failures.push('packed ESM capture is unexpectedly empty');
  if (esm.strategy !== 'mesh' || esm.backend !== 'webgl') failures.push('packed ESM did not use selected WebGL Mesh runtime');
  if (!(esm.renderObjects > 0)) failures.push('packed ESM produced no aggregate render objects');
  if (esm.canvasCountAfterDestroy !== 0 || !esm.destroyed) failures.push('packed ESM lifecycle leaked a canvas or live runtime');
  if (esm.transactionRevision !== 'core-v2-mutation-transaction/1') failures.push('packed ESM transaction revision export failed');
  if (esm.pointerRevision !== 'core-v2-pointer-gesture/1') failures.push('packed ESM pointer revision export failed');
  if (esm.hostInteractionRevision !== 'core-v2-host-interaction/1') failures.push('packed ESM host interaction revision export failed');
  if (esm.selectionTransformerRevision !== 'core-v2-selection-transformer/1') failures.push('packed ESM selection transformer revision export failed');
  if (
    JSON.stringify(esm.pointerPackage?.eventTypes) !== JSON.stringify(['up', 'click']) ||
    esm.pointerPackage?.clickTarget !== 'consumer-item' ||
    JSON.stringify(esm.pointerPackage?.boxTargets) !== JSON.stringify(['consumer-item']) ||
    JSON.stringify(esm.pointerPackage?.paintTargets) !== JSON.stringify(['consumer-item']) ||
    esm.pointerPackage?.destroyed !== true
  ) failures.push('packed ESM pointer/selection exports failed');
  if (
    esm.hostInteractionPackage?.authorityType !== 'function' ||
    JSON.stringify(esm.hostInteractionPackage?.bindingDeliveries) !==
      JSON.stringify(['consumer-item']) ||
    esm.hostInteractionPackage?.eventCount !== 1 ||
    esm.hostInteractionPackage?.hostPublicationCount !== 1 ||
    JSON.stringify(esm.hostInteractionPackage?.missingIds) !==
      JSON.stringify(['missing']) ||
    esm.hostInteractionPackage?.propagationTarget !==
      'component:consumer-item/label' ||
    JSON.stringify(esm.hostInteractionPackage?.propagationPhases) !==
      JSON.stringify([
        'capture:surface',
        'capture:consumer-item',
        'target:component:consumer-item/label',
        'bubble:consumer-item',
        'bubble:surface',
      ]) ||
    esm.hostInteractionPackage?.activeState !== 'select' ||
    esm.hostInteractionPackage?.liveResources?.bindings !== 0 ||
    esm.hostInteractionPackage?.liveResources?.subscriptions !== 0 ||
    esm.hostInteractionPackage?.liveResources?.selectionHosts !== 0 ||
    esm.hostInteractionPackage?.destroyed !== true ||
    esm.hostInteractionPackage?.destroyedOwnerCount !== 0
  ) failures.push('packed ESM host interaction exports failed');
  if (
    esm.selectionTransformerPackage?.authorityType !== 'function' ||
    JSON.stringify(esm.selectionTransformerPackage?.subsetIndicator) !==
      JSON.stringify({ selected: 1, transformable: 1, resizable: 1 }) ||
    esm.selectionTransformerPackage?.activeResizeHandles !== true ||
    esm.selectionTransformerPackage?.overlayCount !== 1 ||
    JSON.stringify(esm.selectionTransformerPackage?.visibleCorners) !==
      JSON.stringify(['nw', 'ne', 'sw', 'se']) ||
    esm.selectionTransformerPackage?.selectionRoute?.owner !== 'transformer' ||
    esm.selectionTransformerPackage?.selectionRoute?.deliveryCount !== 0 ||
    esm.selectionTransformerPackage?.transformRoute?.owner !== 'transformer' ||
    esm.selectionTransformerPackage?.transformRoute?.deliveryCount !== 1 ||
    esm.selectionTransformerPackage?.completed !== true ||
    esm.selectionTransformerPackage?.settledActiveGestureCount !== 0 ||
    esm.selectionTransformerPackage?.destroyed !== true ||
    esm.selectionTransformerPackage?.destroyedActiveGestureCount !== 0
  ) failures.push('packed ESM selection transformer exports failed');
  if (
    esm.transformerEditRevision !== 'core-v2-transformer-edit/1' ||
    esm.transformerEditPackage?.plannerType !== 'function' ||
    esm.transformerEditPackage?.snapType !== 'function' ||
    esm.transformerEditPackage?.planStatus !== 'planned' ||
    JSON.stringify(esm.transformerEditPackage?.plannedSize) !==
      JSON.stringify([50, 40]) ||
    esm.transformerEditPackage?.snapAppliedDegrees !== 0 ||
    esm.transformerEditPackage?.sessionActiveCount !== 1 ||
    esm.transformerEditPackage?.previewStatus !== 'previewed' ||
    esm.transformerEditPackage?.cancelStatus !== 'cancelled' ||
    esm.transformerEditPackage?.settledActiveCount !== 0 ||
    esm.transformerEditPackage?.settledOverlayCount !== 0 ||
    esm.transformerEditPackage?.settledCaptureCount !== 0
  ) failures.push('packed ESM transformer edit exports failed');
  if (esm.presentationRevision !== 'core-v2-presentation-policy/1') failures.push('packed ESM presentation revision export failed');
  if (esm.emptyBulkStatus !== 'unchanged' || esm.emptyBulkSceneRevision !== 1) failures.push('packed ESM empty bulk target-set semantics failed');
  if (esm.transactionStatus !== 'committed' || esm.transactionSceneRevision !== 2 || esm.transactionBarHeight !== 30) failures.push('packed ESM engine transaction failed');
  if (
    esm.presentation?.setChanged !== true ||
    esm.presentation.status !== 'active' ||
    esm.presentation.itemEmphasis !== 1 ||
    esm.presentation.clearChanged !== true ||
    esm.presentation.clearedStatus !== 'normal'
  ) failures.push('packed ESM presentation policy boundary failed');
  if (
    esm.liveOverlay?.status !== 'accepted' ||
    esm.liveOverlay.latestAcceptedRevision !== 2 ||
    esm.liveOverlay.latestPublishedRevision !== 2 ||
    esm.liveOverlay.pendingPublicationCount !== 0 ||
    esm.liveOverlay.historyUnchanged !== true
  ) failures.push('packed ESM live overlay boundary failed');
  if (
    esm.semanticRefresh?.dependencyChanged !== true ||
    esm.semanticRefresh.status !== 'committed' ||
    JSON.stringify(esm.semanticRefresh.recomputedTargets) !==
      JSON.stringify(['consumer-item/label']) ||
    esm.semanticRefresh.dataDiffCount !== 0 ||
    esm.semanticRefresh.revisionDelta !== 1 ||
    esm.semanticRefresh.representedSceneRevision !== 4
  ) failures.push('packed ESM semantic refresh boundary failed');
  if (
    esm.hierarchy?.moveStatus !== 'committed' ||
    esm.hierarchy?.groupStatus !== 'committed' ||
    esm.hierarchy?.ungroupStatus !== 'committed' ||
    esm.hierarchy?.unrecordedStatus !== 'committed' ||
    esm.hierarchy?.cycleStatus !== 'rejected' ||
    esm.hierarchy?.cycleCode !== 'CONFLICT' ||
    esm.hierarchy?.cycleRevisionDelta !== 0 ||
    esm.hierarchy?.rectParentId !== 'group-b' ||
    JSON.stringify(esm.hierarchy?.rectLocalPosition) !== JSON.stringify([-80, 40]) ||
    JSON.stringify(esm.hierarchy?.selectionIds) !== JSON.stringify(['rect-b']) ||
    esm.hierarchy?.historyDepth !== 3 ||
    esm.hierarchy?.relationRevisionLag !== 0
  ) failures.push('packed ESM hierarchy transaction contract failed');
  if (
    esm.interactionOwnership?.rootBindingCount !== 6 ||
    esm.interactionOwnership?.rootListenerCount !== 8 ||
    esm.interactionOwnership?.entityCallbackCount !== 0
  ) failures.push('packed ESM interaction ownership probe failed');
  if (
    esm.historyPackage?.companionBefore?.mode !== 'select' ||
    JSON.stringify(esm.historyPackage?.companionBefore?.selectionIds) !==
      JSON.stringify(['rect-b']) ||
    esm.historyPackage?.transactionStatus !== 'committed' ||
    esm.historyPackage?.transactionActionId !== 'packed-history' ||
    esm.historyPackage?.inspectedDepth !== 4 ||
    esm.historyPackage?.inspectedLastActionId !== 'packed-history' ||
    esm.historyPackage?.inspectedLastRecordCount !== 1 ||
    esm.historyPackage?.undoStatus !== 'committed' ||
    esm.historyPackage?.undoDirection !== 'undo' ||
    esm.historyPackage?.undoActionId !== 'packed-history' ||
    esm.historyPackage?.companionAfterUndo?.mode !== 'select' ||
    esm.historyPackage?.addedPresentAfterUndo !== false ||
    esm.historyPackage?.redoStatus !== 'committed' ||
    esm.historyPackage?.redoDirection !== 'redo' ||
    esm.historyPackage?.redoActionId !== 'packed-history' ||
    esm.historyPackage?.companionAfterRedo?.mode !== 'transform' ||
    esm.historyPackage?.addedTypeAfterRedo !== 'rect' ||
    esm.historyPackage?.invalidCapacityStatus !== 'rejected' ||
    esm.historyPackage?.invalidCapacityCode !== 'INVALID_VALUE' ||
    esm.historyPackage?.protectedShortcut?.handled !== false ||
    esm.historyPackage?.protectedShortcut?.preventDefault !== false ||
    esm.historyPackage?.clearChanged !== true ||
    esm.historyPackage?.clearReason !== 'host' ||
    esm.historyPackage?.clearedDepth !== 0
  ) failures.push('packed ESM history transaction contract failed');
  if (esm.engineDestroyResult !== true) failures.push('packed ESM raw Engine destroy did not own cleanup');
  if (
    esm.engineAfterDestroy?.lifecycle !== 'destroyed' ||
    esm.engineAfterDestroy.canvasCount !== 0 ||
    esm.engineAfterDestroy.subscriptions?.active !== 0 ||
    esm.engineAfterDestroy.subscriptions?.duplicates !== 0 ||
    esm.engineAfterDestroy.pendingWork !== 0 ||
    esm.engineAfterDestroy.historyDepth !== 0 ||
    esm.engineAfterDestroy.rootIds?.length !== 0 ||
    esm.engineAfterDestroy.datasetRef !== null ||
    esm.engineAfterDestroy.semanticHash !== null ||
    esm.engineAfterDestroy.renderer !== null ||
    esm.engineAfterDestroy.assets !== null
  ) failures.push('packed ESM raw Engine retained lifecycle resources after destroy');
  if (cjs.entities !== 1 || cjs.id !== 'cjs-rect') failures.push('packed CJS parser subpath failed');
  if (
    cjs.transactionRevision !== 'core-v2-mutation-transaction/1' ||
    cjs.pointerRevision !== 'core-v2-pointer-gesture/1' ||
    cjs.pointerAuthorityType !== 'function' ||
    cjs.hostInteractionRevision !== 'core-v2-host-interaction/1' ||
    cjs.hostInteractionAuthorityType !== 'function' ||
    cjs.selectionTransformerRevision !== 'core-v2-selection-transformer/1' ||
    cjs.selectionTransformerAuthorityType !== 'function' ||
    cjs.transformerEditRevision !== 'core-v2-transformer-edit/1' ||
    cjs.transformerEditPlannerType !== 'function' ||
    cjs.transformerSnapType !== 'function' ||
    cjs.transformerSessionType !== 'function' ||
    cjs.presentationRevision !== 'core-v2-presentation-policy/1' ||
    cjs.plannerType !== 'function' ||
    cjs.historyEngineType !== 'function' ||
    cjs.historyInspectionType !== 'function' ||
    cjs.historyCompanionType !== 'function' ||
    cjs.historyCapacityType !== 'function' ||
    cjs.historyShortcutType !== 'function' ||
    cjs.historyClearType !== 'function'
  ) failures.push('packed CJS transaction/presentation exports failed');
  if (errors.console.length || errors.page.length || errors.network.length) failures.push('packed browser consumer emitted errors');

  const evidence = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    package: '@conalog/patch-map/core-v2',
    pixi: '8.19.0',
    esm,
    cjs,
    errors,
    status: failures.length === 0 ? 'pass' : 'fail',
    failures,
  };
  await mkdir(RESULTS, { recursive: true });
  await writeFile(path.join(RESULTS, 'package-consumer.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  if (failures.length) throw new Error(failures.join('; '));
  process.stdout.write(`PASS: packed Core v2 ESM browser + CJS consumer, ${esm.loadedEntities} entities, ${esm.renderObjects} aggregate objects, lifecycle clean\n`);
} finally {
  await browser?.close();
  await server?.close();
  await rm(temporary, { recursive: true, force: true });
}
