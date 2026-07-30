#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { chromium } from 'playwright';
import { createServer } from 'vite';

import {
  analyzePackedArtifact,
  auditPackedHostAdapter,
  comparePackedJourneys,
  createPackedProductAlias,
  preparePackedConsumerMatrix,
  readPackedBrowserResult,
  runPackedJourneyMatrix,
  verifyPackedConsumerTypes,
  verifyPackedProductionBuild,
} from './patch-map-package-matrix.mjs';

const execute = promisify(execFile);
const ROOT = process.cwd();
const RESULTS = path.resolve(
  process.env.PATCH_MAP_PACKAGE_ARTIFACT_DIR
    ?? path.join(ROOT, 'performance/core-v2/results'),
);
const temporary = await mkdtemp(path.join(tmpdir(), 'patch-map-package-'));
const consumer = path.join(temporary, 'consumer');
const reproduciblePackDirectory = path.join(temporary, 'reproducible-pack');
const errors = { console: [], page: [], network: [] };
let server;
let browser;

try {
  await mkdir(consumer, { recursive: true });
  await mkdir(reproduciblePackDirectory, { recursive: true });
  const packed = await execute('npm', ['pack', '--json', '--pack-destination', temporary], {
    cwd: ROOT,
    maxBuffer: 10 * 1024 * 1024,
  });
  const packResult = JSON.parse(packed.stdout);
  const packRecord = packResult[0];
  const filename = packRecord?.filename;
  if (typeof filename !== 'string') throw new Error('npm pack did not return a tarball filename');
  const tarball = path.join(temporary, filename);
  const packageArtifact = await analyzePackedArtifact({ packRecord, tarball });
  const secondPacked = await execute(
    'npm',
    ['pack', '--json', '--pack-destination', reproduciblePackDirectory],
    {
      cwd: ROOT,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  const secondPackRecord = JSON.parse(secondPacked.stdout)[0];
  const secondFilename = secondPackRecord?.filename;
  if (typeof secondFilename !== 'string') {
    throw new Error('second npm pack did not return a tarball filename');
  }
  const secondPackageArtifact = await analyzePackedArtifact({
    packRecord: secondPackRecord,
    tarball: path.join(reproduciblePackDirectory, secondFilename),
  });
  const hostAdapterAudit = await auditPackedHostAdapter(ROOT);
  const codeCommit = (
    await execute('git', ['rev-parse', 'HEAD'], {
      cwd: ROOT,
      maxBuffer: 1024 * 1024,
    })
  ).stdout.trim();
  const dependencyAudit = await auditDependencyLock(ROOT);
  const licenseInventory = await inventoryDependencyLicenses(ROOT);
  const supplyChain = createSupplyChainEvidence({
    codeCommit,
    first: packageArtifact,
    second: secondPackageArtifact,
    dependencyAudit,
    licenseInventory,
  });
  await writeFile(
    path.join(consumer, 'package.json'),
    `${JSON.stringify({
      name: 'patch-map-package-consumer',
      private: true,
      type: 'module',
      dependencies: {
        '@conalog/patch-map': `file:${tarball}`,
        'pixi.js': '8.19.0',
        'typescript': '5.9.3',
      },
    }, null, 2)}\n`,
  );
  await preparePackedConsumerMatrix({
    root: ROOT,
    consumer,
    packageDigest: packageArtifact.sha256,
    codeCommit,
  });
  await writeFile(path.join(consumer, 'index.html'), `<!doctype html>
<html><body><div id="host" style="width:640px;height:360px"></div><script type="module" src="/main.js"></script></body></html>\n`);
  await writeFile(path.join(consumer, 'main.js'), `
import {
  PATCH_MAP_AUTHORING_REVISION,
  PATCH_MAP_COMMAND_TARGET_REVISION,
  PATCH_MAP_EDITOR_MOUNT_REVISION,
  PATCH_MAP_HOST_INTERACTION_REVISION,
  PATCH_MAP_HOST_TOOLTIP_REVISION,
  PATCH_MAP_MIGRATION_BLOCKERS,
  PATCH_MAP_MIGRATION_COHORTS,
  PATCH_MAP_MIGRATION_REVISION,
  PATCH_MAP_MUTATION_TRANSACTION_REVISION,
  PATCH_MAP_PAGE_LIFECYCLE_REVISION,
  PATCH_MAP_POINTER_GESTURE_REVISION,
  PATCH_MAP_PRESENTATION_POLICY_REVISION,
  PATCH_MAP_SELECTION_TRANSFORMER_REVISION,
  PATCH_MAP_TRANSFORMER_EDIT_REVISION,
  PatchMap,
  PatchMapFrameLoop,
  PatchMapHostInteractionAuthority,
  PatchMapMigrationAuthority,
  PatchMapPageLifecycleAuthority,
  PatchMapPointerGestureAuthority,
  PatchMapTransformerGestureAuthority,
  createPatchMapRuntime,
  createPatchMapCommandTargetState,
  hitPatchMapBoxRegion,
  hitPatchMapPaintRegion,
  assertPatchMapSemanticRoundtrip,
  materializePatchMapCompatibilityDataset,
  parsePatchMapV010,
  planPatchMapAuthoringAction,
  planPatchMapTransformerEdit,
  preparePatchMapPersistenceExport,
  resolvePatchMapEditorMount,
  resolvePatchMapRotationSnap,
  validatePatchMapDatasetReferences,
} from '@conalog/patch-map';

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
const compatibility = materializePatchMapCompatibilityDataset(input);
const legacyCompatibility = materializePatchMapCompatibilityDataset({
  kind: 'generic-item',
  id: 'legacy-packed',
  x: 10,
  y: 20,
  width: 100,
  height: 80,
  label: 'Legacy Packed',
});
const migrationPersistence = preparePatchMapPersistenceExport(
  compatibility.canonicalDataset,
);
const migrationReload = materializePatchMapCompatibilityDataset(
  JSON.parse(migrationPersistence.serialized),
);
assertPatchMapSemanticRoundtrip(migrationPersistence, migrationReload);
let migrationNonserializable = null;
try {
  const invalidPersistence = structuredClone(input);
  invalidPersistence[0].attrs.bad = () => undefined;
  preparePatchMapPersistenceExport(invalidPersistence);
} catch (error) {
  migrationNonserializable = {
    code: error.code ?? null,
    path: error.datasetPath ?? null,
  };
}
const canaryAuthority = new PatchMapMigrationAuthority('core-v2');
canaryAuthority.mountSession('packed-canary', {
  authoritative: 'core-v2',
  shadow: 'comparison',
  shadowMode: 'read-only',
});
const authoritativeEffect = canaryAuthority.recordEffect(
  'authoritative',
  'persistence',
);
const shadowEffect = canaryAuthority.recordEffect('shadow', 'persistence');
const canaryCohort = canaryAuthority.evaluateCanary({
  cohortsPercent: PATCH_MAP_MIGRATION_COHORTS,
  guardedBlockers: PATCH_MAP_MIGRATION_BLOCKERS,
});
const canaryProbe = canaryAuthority.probe();
canaryAuthority.destroy();
const rollbackAuthority = new PatchMapMigrationAuthority('core-v2');
rollbackAuthority.mountSession('packed-rollback-current');
const rollbackPending = rollbackAuthority.requestRollback({
  from: 'core-v2',
  to: 'previous',
  effectiveAt: 'next-remount',
});
const rollbackRemounted = rollbackAuthority.remountSession(
  'packed-rollback-next',
);
rollbackAuthority.destroy();
const parsed = parsePatchMapV010(input);
const pointerAuthority = new PatchMapPointerGestureAuthority({
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
const pointerBox = hitPatchMapBoxRegion([
  {
    id: 'consumer-item',
    screenBounds: [10, 20, 80, 120],
    visible: true,
    interactive: true,
  },
], [], [0, 0], [100, 160]);
const pointerPaint = hitPatchMapPaintRegion([
  {
    id: 'consumer-item',
    screenBounds: [10, 20, 80, 120],
    visible: true,
    interactive: true,
  },
], [], [[[0, 30], [100, 30]]]);
pointerAuthority.destroy();
const core = await createPatchMapRuntime({ target: document.querySelector('#host'), width: 640, height: 360, strategy: 'mesh', preference: 'webgl', autoRender: false });
const loaded = core.load(input);
await core.prepare();
core.fit();
core.flush('consumer-first-frame');
const coreFrameLoop = core.createFrameLoop();
core.animateBarHeights({ durationMs: 32, seed: 1 });
coreFrameLoop.request(100);
await new Promise((resolve, reject) => {
  const deadline = performance.now() + 2_000;
  const poll = () => {
    if (
      core.activeAnimations === 0 &&
      !coreFrameLoop.debugSnapshot().pending
    ) {
      resolve();
    } else if (performance.now() >= deadline) {
      reject(new Error('packed PatchMap frame loop did not settle'));
    } else {
      requestAnimationFrame(poll);
    }
  };
  poll();
});
const frameLoopBeforeDestroy = coreFrameLoop.debugSnapshot();
const capture = await core.captureBase64();
const debugBeforeDestroy = core.debugSnapshot();
await core.destroy();
const engine = new PatchMap();
await engine.initialize({
  instanceId: 'packed-engine-transaction',
  target: document.querySelector('#host'),
  width: 640,
  height: 360,
  strategy: 'mesh',
  preference: 'webgl',
});
engine.loadDataset(input);
const mountAllowed = resolvePatchMapEditorMount(false);
const mountBlocked = resolvePatchMapEditorMount(true);
const tooltipPublications = [];
const tooltipSubscription = engine.bindTooltipHost(
  ({ reason, state }) => tooltipPublications.push({
    reason,
    targetId: state.targetId,
  }),
);
const tooltipHover = engine.hoverTooltipAtScreen({ x: 20, y: 30 }, [160, 80]);
const tooltipPin = engine.toggleTooltipPinAtScreen({ x: 20, y: 30 }, [160, 80]);
validatePatchMapDatasetReferences(engine.exportDataset());
const strictReferenceBefore = engine.snapshot();
let strictReferenceDiagnostic = null;
try {
  engine.loadDataset([
    ...structuredClone(input),
    {
      type: 'relations',
      id: 'consumer-links',
      links: [{ source: 'consumer-item', target: 'missing-consumer-target' }],
    },
  ], {
    datasetRef: 'packed-strict-dangling',
    strict: true,
  });
} catch (error) {
  strictReferenceDiagnostic = {
    code: error?.code ?? null,
    category: error?.category ?? null,
    datasetPath: error?.datasetPath ?? null,
  };
}
const strictReferenceAfter = engine.snapshot();
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
const componentAliasSelection = engine.applySelection({
  op: 'replace',
  ids: ['consumer-item/bar'],
  source: 'external',
});
const commandOpened = engine.snapshotCommandTargets('packed-command');
engine.applySelection({ op: 'clear', source: 'external' });
const commandPending = engine.applyCommandTargetStatus(commandOpened, 'pending');
if (commandPending.status !== 'applied') {
  throw new Error('packed command pending state was rejected');
}
const commandActive = engine.applyCommandTargetStatus(commandPending.state, 'active');
if (commandActive.status !== 'applied') {
  throw new Error('packed command active state was rejected');
}
const commandReleased = engine.applyCommandTargetStatus(commandActive.state, 'released');
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
const transformerEditPlan = planPatchMapTransformerEdit(engine.exportDataset(), {
  kind: 'resize',
  selectionIds: ['rect-b'],
  handle: 'se',
  deltaWorld: [10, 10],
});
const transformerSnap = resolvePatchMapRotationSnap(350, 7, true, 15);
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
await engine.publishFrame(44);
const engineExtraction = await (async () => {
  const requestedTuple = engine.snapshot().publishedTuple;
  const beforeCanvas = engine.canvasHandle();
  const extracted = await engine.extractPublishedScene({
    targetTuple: requestedTuple,
    cssSize: [640, 360],
    mime: 'image/png',
  });
  const afterCanvas = engine.canvasHandle();
  return {
    requestedTuple,
    capturedTuple: extracted.capturedTuple,
    cssSize: extracted.cssSize,
    backingSize: extracted.backingSize,
    mime: extracted.mime,
    dataUrlPrefix: extracted.dataUrl.slice(0, 22),
    dataUrlLength: extracted.dataUrl.length,
    canvasIdentity: extracted.canvasIdentity,
    sameCanvasObject: beforeCanvas.element === afterCanvas.element,
    authoritativeCanvasRetained: extracted.authoritativeCanvasRetained,
    temporaryImageCount: extracted.temporaryImageCount,
    renderTextureCount: extracted.renderTextureCount,
    pendingWorkAfter: engine.snapshot().pendingWork,
  };
})();
const authoringResult = engine.author({
  type: 'create-element',
  kind: 'rect',
  id: 'packed-author-rect',
  positionWorld: [320, 180],
  parentId: null,
  actionId: 'packed-author-create',
});
const authoredRecord = engine.resolveTarget({
  kind: 'element',
  id: 'packed-author-rect',
});
const interactionOwnership = engine.interactionOwnershipProbe();
const pageLifecycleAsset = engine.registerPageLifecycleWork({
  kind: 'asset',
  requestId: 'packed-page-asset',
});
const pageLifecycleExtraction = engine.registerPageLifecycleWork({
  kind: 'extraction',
  requestId: 'packed-page-extraction',
});
const pageLifecycleHidden = engine.setDocumentVisibility({
  state: 'hidden',
  timeMs: 100,
});
const pageLifecycleObsolete = engine.completePageLifecycleWork(pageLifecycleAsset);
const pageLifecycleRejected = engine.completePageLifecycleWork({
  ...pageLifecycleExtraction,
});
const pageLifecycleVisible = engine.setDocumentVisibility({
  state: 'visible',
  timeMs: 10_100,
});
engine.publishFrame(10_116.666667);
engine.publishFrame(10_133.333334);
const pageLifecycleAfterResume = engine.pageLifecycleProbe();
const engineDestroyResult = await engine.destroy();
const tooltipSubscriptionDisposeAfterDestroy = tooltipSubscription.dispose();
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
  frameLoopPackage: {
    exportType: typeof PatchMapFrameLoop,
    factoryType: typeof core.createFrameLoop,
    frameCount: frameLoopBeforeDestroy.frameCount,
    pendingBeforeDestroy: frameLoopBeforeDestroy.pending,
    destroyedAfterCore: coreFrameLoop.debugSnapshot().destroyed,
  },
  authoringRevision: PATCH_MAP_AUTHORING_REVISION,
  transactionRevision: PATCH_MAP_MUTATION_TRANSACTION_REVISION,
  commandTargetRevision: PATCH_MAP_COMMAND_TARGET_REVISION,
  editorMountRevision: PATCH_MAP_EDITOR_MOUNT_REVISION,
  hostInteractionRevision: PATCH_MAP_HOST_INTERACTION_REVISION,
  hostTooltipRevision: PATCH_MAP_HOST_TOOLTIP_REVISION,
  migrationRevision: PATCH_MAP_MIGRATION_REVISION,
  pointerRevision: PATCH_MAP_POINTER_GESTURE_REVISION,
  pageLifecycleRevision: PATCH_MAP_PAGE_LIFECYCLE_REVISION,
  presentationRevision: PATCH_MAP_PRESENTATION_POLICY_REVISION,
  selectionTransformerRevision: PATCH_MAP_SELECTION_TRANSFORMER_REVISION,
  transformerEditRevision: PATCH_MAP_TRANSFORMER_EDIT_REVISION,
  strictReferenceValidation: {
    validatorType: typeof validatePatchMapDatasetReferences,
    diagnostic: strictReferenceDiagnostic,
    sceneRevisionUnchanged:
      strictReferenceAfter.revisions.sceneRevision ===
        strictReferenceBefore.revisions.sceneRevision,
    semanticHashUnchanged:
      strictReferenceAfter.semanticHash === strictReferenceBefore.semanticHash,
    datasetRefUnchanged:
      strictReferenceAfter.datasetRef === strictReferenceBefore.datasetRef,
  },
  migrationPackage: {
    compatibilitySourceKind: compatibility.sourceKind,
    legacySourceKind: legacyCompatibility.sourceKind,
    legacyId: legacyCompatibility.canonicalDataset[0]?.id ?? null,
    roundtripSemanticHashEqual:
      migrationPersistence.semanticHash === migrationReload.semanticHash,
    exportRootKind: migrationPersistence.rootKind,
    nonserializable: migrationNonserializable,
    authoritativeEffectPublished: authoritativeEffect.published,
    shadowEffectPublished: shadowEffect.published,
    shadowEffectCount: canaryProbe.shadowEffectCount,
    activeCanvasesPerHostSlot: canaryProbe.activeCanvasesPerHostSlot,
    completedCohorts: canaryCohort.completedCohorts,
    rollbackActiveBeforeRemount: rollbackPending.activeEngine,
    rollbackDesiredBeforeRemount: rollbackPending.desiredEngine,
    rollbackActiveAfterRemount: rollbackRemounted.activeEngine,
    canaryDestroyed: canaryAuthority.probe().destroyed,
    rollbackDestroyed: rollbackAuthority.probe().destroyed,
  },
  authoringPackage: {
    plannerType: typeof planPatchMapAuthoringAction,
    engineMethodType: typeof PatchMap.prototype.author,
    status: authoringResult.status,
    createdId: authoringResult.facts?.createdId ?? null,
    recordId: authoredRecord?.value?.id ?? null,
  },
  pointerPackage: {
    eventTypes: pointerClick.events.map(({ type }) => type),
    clickTarget: pointerClick.events.at(-1)?.payload.target?.id ?? null,
    boxTargets: pointerBox.candidateIds,
    paintTargets: pointerPaint.candidateIds,
    destroyed: pointerAuthority.probe().destroyed,
  },
  pageLifecyclePackage: {
    authorityType: typeof PatchMapPageLifecycleAuthority,
    hiddenState: pageLifecycleHidden.probe.state,
    hiddenCancelledAssetCount:
      pageLifecycleHidden.transition.cancelledAssetCount,
    hiddenCancelledExtractionCount:
      pageLifecycleHidden.transition.cancelledExtractionCount,
    obsoleteStatus: pageLifecycleObsolete.status,
    rejectedStatus: pageLifecycleRejected.status,
    visibleState: pageLifecycleVisible.probe.state,
    resumeFramePendingBeforePublication:
      pageLifecycleVisible.probe.resumeFramePending,
    resumeFramePendingAfterPublication:
      pageLifecycleAfterResume.resumeFramePending,
    resumePublishedFrameCount:
      pageLifecycleAfterResume.resumePublishedFrameCount,
  },
  hostInteractionPackage: {
    authorityType: typeof PatchMapHostInteractionAuthority,
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
      tooltipHosts: hostInteractionBeforeDestroy.tooltipHostListeners,
    },
    destroyed: hostInteractionAfterDestroy.destroyed,
    destroyedOwnerCount: hostInteractionAfterDestroy.mode.activeOwnerCount,
    destroyedTooltipHosts: hostInteractionAfterDestroy.tooltipHostListeners,
  },
  editorMountPackage: {
    resolverType: typeof resolvePatchMapEditorMount,
    allowed: mountAllowed,
    blocked: mountBlocked,
  },
  hostTooltipPackage: {
    hoverTarget: tooltipHover.targetId,
    hoverAnchor: tooltipHover.anchorCss,
    pinned: tooltipPin.pinned,
    publicationReasons: tooltipPublications.map(({ reason }) => reason),
    finalTarget: hostInteractionAfterDestroy.tooltip.targetId,
    clearTrace: hostInteractionAfterDestroy.tooltip.clearTrace,
    disposeAfterDestroy: tooltipSubscriptionDisposeAfterDestroy,
  },
  commandTargetPackage: {
    factoryType: typeof createPatchMapCommandTargetState,
    componentAliasSelection: componentAliasSelection.current,
    openedTargets: commandOpened.targetIds,
    releasedStatus:
      commandReleased.status === 'applied' ? commandReleased.state.status : null,
    statusTrace:
      commandReleased.status === 'applied' ? commandReleased.state.statusTrace : [],
  },
  selectionTransformerPackage: {
    authorityType: typeof PatchMapTransformerGestureAuthority,
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
    plannerType: typeof planPatchMapTransformerEdit,
    snapType: typeof resolvePatchMapRotationSnap,
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
  engineExtraction,
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
  PATCH_MAP_AUTHORING_REVISION,
  PATCH_MAP_COMMAND_TARGET_REVISION,
  PATCH_MAP_EDITOR_MOUNT_REVISION,
  PATCH_MAP_HOST_INTERACTION_REVISION,
  PATCH_MAP_HOST_TOOLTIP_REVISION,
  PATCH_MAP_MIGRATION_REVISION,
  PATCH_MAP_MUTATION_TRANSACTION_REVISION,
  PATCH_MAP_PAGE_LIFECYCLE_REVISION,
  PATCH_MAP_POINTER_GESTURE_REVISION,
  PATCH_MAP_PRESENTATION_POLICY_REVISION,
  PATCH_MAP_SELECTION_TRANSFORMER_REVISION,
  PATCH_MAP_TRANSFORMER_EDIT_REVISION,
  PatchMapPointerGestureAuthority,
  PatchMap,
  PatchMapFrameLoop,
  PatchMapHostInteractionAuthority,
  PatchMapMigrationAuthority,
  PatchMapPageLifecycleAuthority,
  PatchMapTransformerGestureAuthority,
  createPatchMapCommandTargetState,
  parsePatchMapV010,
  materializePatchMapCompatibilityDataset,
  planPatchMapAuthoringAction,
  planPatchMapTransformerEdit,
  preparePatchMapPersistenceExport,
  planPatchMapMutationTransaction,
  resolvePatchMapEditorMount,
  resolvePatchMapRotationSnap,
  validatePatchMapDatasetReferences,
} = require('@conalog/patch-map');
const result = parsePatchMapV010([{ type: 'rect', id: 'cjs-rect', size: 10, fill: '#ff0000' }]);
process.stdout.write(JSON.stringify({
  entities: result.identity.counts.entities,
  id: result.document.entities[0].id,
  authoringRevision: PATCH_MAP_AUTHORING_REVISION,
  authoringPlannerType: typeof planPatchMapAuthoringAction,
  authoringEngineMethodType: typeof PatchMap.prototype.author,
  frameLoopType: typeof PatchMapFrameLoop,
  frameLoopFactoryType: typeof PatchMap.prototype.createFrameLoop,
  transactionRevision: PATCH_MAP_MUTATION_TRANSACTION_REVISION,
  commandTargetRevision: PATCH_MAP_COMMAND_TARGET_REVISION,
  commandTargetFactoryType: typeof createPatchMapCommandTargetState,
  commandTargetSnapshotType: typeof PatchMap.prototype.snapshotCommandTargets,
  commandTargetStatusType: typeof PatchMap.prototype.applyCommandTargetStatus,
  editorMountRevision: PATCH_MAP_EDITOR_MOUNT_REVISION,
  editorMountResolverType: typeof resolvePatchMapEditorMount,
  tooltipRevision: PATCH_MAP_HOST_TOOLTIP_REVISION,
  migrationRevision: PATCH_MAP_MIGRATION_REVISION,
  migrationAuthorityType: typeof PatchMapMigrationAuthority,
  migrationCompatibilityType: typeof materializePatchMapCompatibilityDataset,
  migrationPersistenceType: typeof preparePatchMapPersistenceExport,
  tooltipBindingType: typeof PatchMap.prototype.bindTooltipHost,
  tooltipHoverType: typeof PatchMap.prototype.hoverTooltipAtScreen,
  tooltipPinType: typeof PatchMap.prototype.toggleTooltipPinAtScreen,
  tooltipClearType: typeof PatchMap.prototype.clearHostTooltip,
  pointerRevision: PATCH_MAP_POINTER_GESTURE_REVISION,
  pageLifecycleRevision: PATCH_MAP_PAGE_LIFECYCLE_REVISION,
  pageLifecycleAuthorityType: typeof PatchMapPageLifecycleAuthority,
  pageLifecycleVisibilityType: typeof PatchMap.prototype.setDocumentVisibility,
  pageLifecycleProbeType: typeof PatchMap.prototype.pageLifecycleProbe,
  pointerAuthorityType: typeof PatchMapPointerGestureAuthority,
  hostInteractionRevision: PATCH_MAP_HOST_INTERACTION_REVISION,
  hostInteractionAuthorityType: typeof PatchMapHostInteractionAuthority,
  selectionTransformerRevision: PATCH_MAP_SELECTION_TRANSFORMER_REVISION,
  selectionTransformerAuthorityType: typeof PatchMapTransformerGestureAuthority,
  transformerEditRevision: PATCH_MAP_TRANSFORMER_EDIT_REVISION,
  transformerEditPlannerType: typeof planPatchMapTransformerEdit,
  transformerSnapType: typeof resolvePatchMapRotationSnap,
  transformerSessionType: typeof PatchMap.prototype.beginTransformerEdit,
  presentationRevision: PATCH_MAP_PRESENTATION_POLICY_REVISION,
  plannerType: typeof planPatchMapMutationTransaction,
  historyEngineType: typeof PatchMap,
  historyInspectionType: typeof PatchMap.prototype.historyInspection,
  historyCompanionType: typeof PatchMap.prototype.setHistoryCompanion,
  historyCapacityType: typeof PatchMap.prototype.setHistoryCapacity,
  historyShortcutType: typeof PatchMap.prototype.handleHistoryShortcut,
  historyClearType: typeof PatchMap.prototype.clearHistory,
  extractionType: typeof PatchMap.prototype.extractPublishedScene,
  strictReferenceValidatorType: typeof validatePatchMapDatasetReferences,
}));
`);

  await execute('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: consumer,
    maxBuffer: 20 * 1024 * 1024,
  });
  const types = await verifyPackedConsumerTypes(consumer);
  const productionAlias = createPackedProductAlias({ root: ROOT, consumer });
  const productionBuild = await verifyPackedProductionBuild({
    consumer,
    outputDirectory: path.join(consumer, '.package-build'),
    aliasPlugin: productionAlias.plugin,
  });
  const productionAliasProbe = productionAlias.probe();
  const cjs = JSON.parse((await execute('node', ['consumer.cjs'], { cwd: consumer })).stdout);
  const browserAlias = createPackedProductAlias({ root: ROOT, consumer });
  server = await createServer({
    root: consumer,
    configFile: false,
    logLevel: 'error',
    plugins: [browserAlias.plugin],
    server: {
      host: '127.0.0.1',
      port: 0,
      fs: {
        allow: [ROOT, consumer],
      },
    },
  });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  if (!baseUrl) throw new Error('package consumer Vite server has no URL');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  page.on('console', (message) => {
    if (message.type() === 'error') errors.console.push(message.text());
  });
  page.on('pageerror', (error) => {
    errors.page.push(error.stack || `${error.name}: ${error.message}`);
  });
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
  const examples = await readPackedBrowserResult(
    page,
    baseUrl,
    'examples.html',
    '__PATCH_MAP_PACKAGE_EXAMPLES__',
    60_000,
  );
  const packageMatrix = await readPackedBrowserResult(
    page,
    baseUrl,
    'matrix.html',
    '__PATCH_MAP_PACKAGE_MATRIX__',
    60_000,
  );
  let journeyBrowser;
  try {
    journeyBrowser = await runPackedJourneyMatrix(page, baseUrl);
  } catch (error) {
    const journeyState = await page.evaluate(() => ({
      readyState: document.readyState,
      bodyText: document.body.textContent?.slice(0, 500) ?? '',
      runnerPublished:
        window.__PATCH_MAP_PACKAGE_JOURNEY_RUNNER__ !== undefined,
    }));
    throw new Error(
      `packed journey harness failed: ${
        error instanceof Error ? error.message : String(error)
      }; state=${JSON.stringify(journeyState)}; errors=${JSON.stringify(errors)}`,
      { cause: error },
    );
  }
  const journeyMatrix = await comparePackedJourneys({
    root: ROOT,
    browserResult: journeyBrowser,
    packageDigest: packageArtifact.sha256,
  });
  const browserAliasProbe = browserAlias.probe();
  const failures = [];
  if (!esm.immutable) failures.push('packed ESM consumer mutated direct input');
  if (!esm.hierarchyImmutable) failures.push('packed ESM hierarchy transaction mutated direct input');
  if (esm.parsedEntities !== esm.loadedEntities || esm.loadedEntities < 3) failures.push('packed ESM entity counts disagree');
  if (!String(esm.capturePrefix).startsWith('data:image/png')) failures.push('packed ESM capture is not PNG data');
  if (!(esm.captureLength > 100)) failures.push('packed ESM capture is unexpectedly empty');
  if (esm.strategy !== 'mesh' || esm.backend !== 'webgl') failures.push('packed ESM did not use selected WebGL Mesh runtime');
  if (!(esm.renderObjects > 0)) failures.push('packed ESM produced no aggregate render objects');
  if (esm.canvasCountAfterDestroy !== 0 || !esm.destroyed) failures.push('packed ESM lifecycle leaked a canvas or live runtime');
  if (
    esm.frameLoopPackage?.exportType !== 'function' ||
    esm.frameLoopPackage?.factoryType !== 'function' ||
    !(esm.frameLoopPackage?.frameCount > 0) ||
    esm.frameLoopPackage?.pendingBeforeDestroy !== false ||
    esm.frameLoopPackage?.destroyedAfterCore !== true
  ) failures.push('packed ESM frame-loop export or lifecycle ownership failed');
  if (esm.transactionRevision !== 'core-v2-mutation-transaction/1') failures.push('packed ESM transaction revision export failed');
  if (
    esm.authoringRevision !== 'core-v2-authoring/1' ||
    esm.authoringPackage?.plannerType !== 'function' ||
    esm.authoringPackage?.engineMethodType !== 'function' ||
    esm.authoringPackage?.status !== 'committed' ||
    esm.authoringPackage?.createdId !== 'packed-author-rect' ||
    esm.authoringPackage?.recordId !== 'packed-author-rect'
  ) failures.push('packed ESM authoring boundary failed');
  if (esm.commandTargetRevision !== 'core-v2-command-target/1') failures.push('packed ESM command target revision export failed');
  if (esm.editorMountRevision !== 'core-v2-editor-mount/1') failures.push('packed ESM editor mount revision export failed');
  if (esm.pointerRevision !== 'core-v2-pointer-gesture/1') failures.push('packed ESM pointer revision export failed');
  if (esm.pageLifecycleRevision !== 'core-v2-page-lifecycle/1') failures.push('packed ESM page lifecycle revision export failed');
  if (esm.hostInteractionRevision !== 'core-v2-host-interaction/1') failures.push('packed ESM host interaction revision export failed');
  if (esm.hostTooltipRevision !== 'core-v2-host-tooltip/1') failures.push('packed ESM host tooltip revision export failed');
  if (
    esm.migrationRevision !== 'core-v2-migration/1' ||
    esm.migrationPackage?.compatibilitySourceKind !== 'canonical-array' ||
    esm.migrationPackage?.legacySourceKind !== 'legacy-generic-item' ||
    esm.migrationPackage?.legacyId !== 'legacy-packed' ||
    esm.migrationPackage?.roundtripSemanticHashEqual !== true ||
    esm.migrationPackage?.exportRootKind !== 'array' ||
    esm.migrationPackage?.nonserializable?.code !== 'NON_SERIALIZABLE_VALUE' ||
    esm.migrationPackage?.nonserializable?.path !== '$[0].attrs.bad' ||
    esm.migrationPackage?.authoritativeEffectPublished !== true ||
    esm.migrationPackage?.shadowEffectPublished !== false ||
    esm.migrationPackage?.shadowEffectCount !== 0 ||
    esm.migrationPackage?.activeCanvasesPerHostSlot !== 1 ||
    JSON.stringify(esm.migrationPackage?.completedCohorts) !==
      JSON.stringify([1, 10, 50, 100]) ||
    esm.migrationPackage?.rollbackActiveBeforeRemount !== 'core-v2' ||
    esm.migrationPackage?.rollbackDesiredBeforeRemount !== 'previous' ||
    esm.migrationPackage?.rollbackActiveAfterRemount !== 'previous' ||
    esm.migrationPackage?.canaryDestroyed !== true ||
    esm.migrationPackage?.rollbackDestroyed !== true
  ) failures.push('packed ESM migration boundary failed');
  if (esm.selectionTransformerRevision !== 'core-v2-selection-transformer/1') failures.push('packed ESM selection transformer revision export failed');
  if (
    esm.strictReferenceValidation?.validatorType !== 'function' ||
    esm.strictReferenceValidation?.diagnostic?.code !== 'MISSING_TARGET' ||
    esm.strictReferenceValidation?.diagnostic?.category !== 'MISSING_TARGET' ||
    esm.strictReferenceValidation?.diagnostic?.datasetPath !==
      '$[1].links[0].target' ||
    esm.strictReferenceValidation?.sceneRevisionUnchanged !== true ||
    esm.strictReferenceValidation?.semanticHashUnchanged !== true ||
    esm.strictReferenceValidation?.datasetRefUnchanged !== true
  ) failures.push('packed ESM strict reference validation failed');
  if (
    JSON.stringify(esm.pointerPackage?.eventTypes) !== JSON.stringify(['up', 'click']) ||
    esm.pointerPackage?.clickTarget !== 'consumer-item' ||
    JSON.stringify(esm.pointerPackage?.boxTargets) !== JSON.stringify(['consumer-item']) ||
    JSON.stringify(esm.pointerPackage?.paintTargets) !== JSON.stringify(['consumer-item']) ||
    esm.pointerPackage?.destroyed !== true
  ) failures.push('packed ESM pointer/selection exports failed');
  if (
    esm.pageLifecyclePackage?.authorityType !== 'function' ||
    esm.pageLifecyclePackage?.hiddenState !== 'hidden' ||
    esm.pageLifecyclePackage?.hiddenCancelledAssetCount !== 1 ||
    esm.pageLifecyclePackage?.hiddenCancelledExtractionCount !== 1 ||
    esm.pageLifecyclePackage?.obsoleteStatus !== 'obsolete' ||
    esm.pageLifecyclePackage?.rejectedStatus !== 'rejected' ||
    esm.pageLifecyclePackage?.visibleState !== 'visible' ||
    esm.pageLifecyclePackage?.resumeFramePendingBeforePublication !== true ||
    esm.pageLifecyclePackage?.resumeFramePendingAfterPublication !== false ||
    esm.pageLifecyclePackage?.resumePublishedFrameCount !== 1
  ) failures.push('packed ESM page lifecycle boundary failed');
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
    esm.hostInteractionPackage?.liveResources?.tooltipHosts !== 1 ||
    esm.hostInteractionPackage?.destroyed !== true ||
    esm.hostInteractionPackage?.destroyedOwnerCount !== 0 ||
    esm.hostInteractionPackage?.destroyedTooltipHosts !== 0
  ) failures.push('packed ESM host interaction exports failed');
  if (
    esm.editorMountPackage?.resolverType !== 'function' ||
    esm.editorMountPackage?.allowed?.status !== 'allowed' ||
    esm.editorMountPackage?.allowed?.createsEngine !== true ||
    esm.editorMountPackage?.allowed?.canvasBudget !== 1 ||
    esm.editorMountPackage?.blocked?.status !== 'blocked' ||
    esm.editorMountPackage?.blocked?.createsEngine !== false ||
    esm.editorMountPackage?.blocked?.canvasBudget !== 0
  ) failures.push('packed ESM editor mount preflight export failed');
  if (
    esm.hostTooltipPackage?.hoverTarget !== 'consumer-item' ||
    JSON.stringify(esm.hostTooltipPackage?.hoverAnchor) !== JSON.stringify([20, 30]) ||
    esm.hostTooltipPackage?.pinned !== true ||
    JSON.stringify(esm.hostTooltipPackage?.publicationReasons) !==
      JSON.stringify([
        'hover',
        'pin',
        'redraw',
        'drag',
        'drag',
        'redraw',
        'destroy',
      ]) ||
    esm.hostTooltipPackage?.finalTarget !== null ||
    JSON.stringify(esm.hostTooltipPackage?.clearTrace) !==
      JSON.stringify(['redraw', 'drag', 'drag', 'redraw', 'destroy']) ||
    esm.hostTooltipPackage?.disposeAfterDestroy !== 'disposed'
  ) failures.push(
    `packed ESM host tooltip lifecycle failed: ${JSON.stringify(esm.hostTooltipPackage)}`,
  );
  if (
    esm.commandTargetPackage?.factoryType !== 'function' ||
    JSON.stringify(esm.commandTargetPackage?.componentAliasSelection) !==
      JSON.stringify(['consumer-item/bar']) ||
    JSON.stringify(esm.commandTargetPackage?.openedTargets) !==
      JSON.stringify(['consumer-item/bar']) ||
    esm.commandTargetPackage?.releasedStatus !== 'released' ||
    JSON.stringify(esm.commandTargetPackage?.statusTrace) !==
      JSON.stringify(['pending', 'active', 'released'])
  ) failures.push('packed ESM command target and component alias exports failed');
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
    JSON.stringify(esm.engineExtraction?.capturedTuple) !==
      JSON.stringify(esm.engineExtraction?.requestedTuple) ||
    JSON.stringify(esm.engineExtraction?.cssSize) !== JSON.stringify([640, 360]) ||
    !Array.isArray(esm.engineExtraction?.backingSize) ||
    !esm.engineExtraction.backingSize.every((value) => Number.isFinite(value) && value > 0) ||
    esm.engineExtraction?.mime !== 'image/png' ||
    !String(esm.engineExtraction?.dataUrlPrefix).startsWith('data:image/png') ||
    !(esm.engineExtraction?.dataUrlLength > 100) ||
    esm.engineExtraction?.canvasIdentity !== 'initial-canvas' ||
    esm.engineExtraction?.sameCanvasObject !== true ||
    esm.engineExtraction?.authoritativeCanvasRetained !== true ||
    esm.engineExtraction?.temporaryImageCount !== 0 ||
    esm.engineExtraction?.renderTextureCount !== 0 ||
    esm.engineExtraction?.pendingWorkAfter !== 0
  ) failures.push('packed ESM exact published-scene extraction failed');
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
    cjs.authoringRevision !== 'core-v2-authoring/1' ||
    cjs.authoringPlannerType !== 'function' ||
    cjs.authoringEngineMethodType !== 'function' ||
    cjs.frameLoopType !== 'function' ||
    cjs.frameLoopFactoryType !== 'function' ||
    cjs.transactionRevision !== 'core-v2-mutation-transaction/1' ||
    cjs.commandTargetRevision !== 'core-v2-command-target/1' ||
    cjs.commandTargetFactoryType !== 'function' ||
    cjs.commandTargetSnapshotType !== 'function' ||
    cjs.commandTargetStatusType !== 'function' ||
    cjs.editorMountRevision !== 'core-v2-editor-mount/1' ||
    cjs.editorMountResolverType !== 'function' ||
    cjs.tooltipRevision !== 'core-v2-host-tooltip/1' ||
    cjs.migrationRevision !== 'core-v2-migration/1' ||
    cjs.migrationAuthorityType !== 'function' ||
    cjs.migrationCompatibilityType !== 'function' ||
    cjs.migrationPersistenceType !== 'function' ||
    cjs.tooltipBindingType !== 'function' ||
    cjs.tooltipHoverType !== 'function' ||
    cjs.tooltipPinType !== 'function' ||
    cjs.tooltipClearType !== 'function' ||
    cjs.pointerRevision !== 'core-v2-pointer-gesture/1' ||
    cjs.pointerAuthorityType !== 'function' ||
    cjs.pageLifecycleRevision !== 'core-v2-page-lifecycle/1' ||
    cjs.pageLifecycleAuthorityType !== 'function' ||
    cjs.pageLifecycleVisibilityType !== 'function' ||
    cjs.pageLifecycleProbeType !== 'function' ||
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
    cjs.historyClearType !== 'function' ||
    cjs.extractionType !== 'function' ||
    cjs.strictReferenceValidatorType !== 'function'
  ) failures.push('packed CJS transaction/presentation exports failed');
  if (
    packageArtifact.sourceMapCount !== 0 ||
    packageArtifact.restrictedEvidenceCount !== 0
  ) failures.push('packed artifact contains source maps or restricted evidence');
  if (!supplyChain.reproducible) {
    failures.push('packed artifact is not reproducible across two release builds');
  }
  if (supplyChain.packageInspection.prohibitedEntryCount !== 0) {
    failures.push('packed artifact contains prohibited supply-chain entries');
  }
  if (
    supplyChain.audit.knownVulnerabilityCount !== null
    && supplyChain.audit.knownVulnerabilityCount !== 0
  ) {
    failures.push('packed dependency audit found known vulnerabilities');
  }
  if (supplyChain.licenses.unapprovedLicenseCount !== 0) {
    failures.push('packed dependency inventory contains unapproved licenses');
  }
  if (supplyChain.sbom.packageDigest !== packageArtifact.sha256) {
    failures.push('packed SBOM is not bound to the package digest');
  }
  if (
    packageArtifact.missingDocs.length !== 0 ||
    packageArtifact.missingExamples.length !== 0
  ) failures.push('packed artifact is missing public PatchMap docs or examples');
  if (types.strict !== true || types.exitCode !== 0) {
    failures.push('packed strict TypeScript consumer failed');
  }
  if (
    productionBuild.productionBundler !== 'vite' ||
    productionBuild.sourceMap !== false ||
    productionAliasProbe.sourceImportResolutionCount === 0
  ) failures.push('packed production host harness did not bind source product imports to the tarball');
  if (
    JSON.stringify(examples.compiledExamples) !==
      JSON.stringify(['minimal', 'dashboard', 'editor', 'report']) ||
    JSON.stringify(examples.executedExamples) !==
      JSON.stringify(['minimal', 'dashboard', 'editor', 'report']) ||
    examples.results?.some((result) => result.status !== 'pass') ||
    examples.remainingCanvasCount !== 0
  ) failures.push('packed public PatchMap examples failed compile/run cleanup');
  if (
    packageMatrix.failure !== null ||
    packageMatrix.remainingCanvasCount !== 0
  ) failures.push(`packed adapter/multi-instance matrix failed: ${JSON.stringify(packageMatrix.failure)}`);
  if (
    JSON.stringify(packageMatrix.hostAdapter?.reachedCapabilities) !==
      JSON.stringify([
        'load',
        'lookup',
        'bulk-update',
        'selection',
        'transform',
        'history',
        'dispose',
        'snapshot',
        'extract',
        'destroy',
      ]) ||
    hostAdapterAudit.originalImportCount !== 0 ||
    hostAdapterAudit.restrictedImportCount !== 0 ||
    hostAdapterAudit.adapterReimplementedEngineBehaviorCount !== 0 ||
    packageMatrix.hostAdapter?.invalidNodeCount !== 0 ||
    packageMatrix.hostAdapter?.staleGestureCount !== 0 ||
    packageMatrix.hostAdapter?.corruptEntryCount !== 0 ||
    packageMatrix.hostAdapter?.leakDelta !== 0
  ) failures.push('packed redesigned host adapter capability/audit proof failed');
  if (
    packageMatrix.multipleInstances?.B?.semanticHash !==
      packageMatrix.multipleInstances?.baselineB?.sceneSemanticHash ||
    packageMatrix.multipleInstances?.B?.callbackCountFromA !== 0 ||
    packageMatrix.multipleInstances?.B?.assetLeaseCount !==
      packageMatrix.multipleInstances?.baselineB?.assetLeaseCount ||
    packageMatrix.multipleInstances?.B?.sharedLeaseCount !== 1 ||
    packageMatrix.multipleInstances?.sharedLeaseCountAfterRecreate !== 2 ||
    packageMatrix.multipleInstances?.hostSlots?.A?.canvasCount !== 1 ||
    packageMatrix.multipleInstances?.hostSlots?.B?.canvasCount !== 1 ||
    packageMatrix.multipleInstances?.unclassifiedErrorCount !== 0
  ) failures.push('packed multiple-instance isolation or shared asset lease proof failed');
  if (
    journeyBrowser.remainingCanvasCount !== 0 ||
    journeyMatrix.journeyCount !== 38 ||
    journeyMatrix.passedJourneyCount !== 38 ||
    journeyMatrix.failedJourneyCount !== 0 ||
    journeyMatrix.packageDigestAcrossJourneys !== packageArtifact.sha256 ||
    journeyMatrix.cleanupFailureCount !== 0
  ) failures.push('packed 38-journey production host matrix failed');
  if (errors.console.length || errors.page.length || errors.network.length) failures.push('packed browser consumer emitted errors');

  const evidence = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    package: '@conalog/patch-map',
    pixi: '8.19.0',
    provenance: {
      codeCommit,
      packedPackageSha256: packageArtifact.sha256,
      expectedEvidenceBound: true,
    },
    environment: {
      browserVersion: browser.version(),
      contractProfileBound: true,
      strictTypeScript: true,
      offlineInstall: true,
      productionBundler: productionBuild.productionBundler,
    },
    artifact: packageArtifact,
    supplyChain,
    dependencyAudit,
    licenseInventory,
    types,
    productionBuild,
    packageBoundary: {
      production: productionAliasProbe,
      browser: browserAliasProbe,
    },
    hostAdapterAudit,
    examples,
    packageMatrix,
    journeyMatrix,
    esm,
    cjs,
    errors,
    status: failures.length === 0 ? 'pass' : 'fail',
    failures,
  };
  await mkdir(RESULTS, { recursive: true });
  await writeFile(path.join(RESULTS, 'package-consumer.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  if (failures.length) throw new Error(failures.join('; '));
  process.stdout.write(
    `PASS: packed PatchMap ESM/CJS/types + ${journeyMatrix.passedJourneyCount} journeys, `
    + `${examples.executedExamples.length} examples, ${esm.renderObjects} aggregate objects, lifecycle clean\n`,
  );
} finally {
  await browser?.close();
  await server?.close();
  await rm(temporary, { recursive: true, force: true });
}

async function auditDependencyLock(root) {
  if (process.env.PATCH_MAP_SKIP_NETWORK_AUDIT === '1') {
    return Object.freeze({
      status: 'pending-external-network',
      auditLevel: 'low',
      exitCode: null,
      knownVulnerabilityCount: null,
      severityCounts: null,
    });
  }
  let stdout = '';
  let exitCode = 0;
  try {
    const result = await execute(
      'npm',
      ['audit', '--package-lock-only', '--json', '--audit-level=low'],
      {
        cwd: root,
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    stdout = result.stdout;
  } catch (error) {
    exitCode = Number.isSafeInteger(error?.code) ? error.code : 1;
    stdout = typeof error?.stdout === 'string'
      ? error.stdout
      : error?.stdout?.toString?.() ?? '';
  }
  if (stdout.length === 0) {
    throw new Error('npm audit produced no JSON result');
  }
  const parsed = JSON.parse(stdout);
  if (parsed.error !== undefined) {
    throw new Error(`npm audit failed: ${JSON.stringify(parsed.error)}`);
  }
  const vulnerabilities = parsed.metadata?.vulnerabilities ?? {};
  const severityCounts = Object.freeze({
    info: nonNegativeAuditCount(vulnerabilities.info),
    low: nonNegativeAuditCount(vulnerabilities.low),
    moderate: nonNegativeAuditCount(vulnerabilities.moderate),
    high: nonNegativeAuditCount(vulnerabilities.high),
    critical: nonNegativeAuditCount(vulnerabilities.critical),
  });
  const total = Number.isSafeInteger(vulnerabilities.total)
    ? vulnerabilities.total
    : Object.values(severityCounts).reduce((sum, count) => sum + count, 0);
  return Object.freeze({
    status: 'observed',
    auditLevel: 'low',
    exitCode,
    knownVulnerabilityCount: nonNegativeAuditCount(total),
    severityCounts,
  });
}

async function inventoryDependencyLicenses(root) {
  const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
  const rootRecord = lock.packages?.[''] ?? {};
  const directNames = new Set([
    ...Object.keys(rootRecord.dependencies ?? {}),
    ...Object.keys(rootRecord.devDependencies ?? {}),
    ...Object.keys(rootRecord.peerDependencies ?? {}),
  ]);
  const approvedLicenses = Object.freeze([
    'Apache-2.0',
    'BSD-2-Clause',
    'BSD-3-Clause',
    'BlueOak-1.0.0',
    'ISC',
    'MIT',
    'Python-2.0',
  ]);
  const approved = new Set(approvedLicenses);
  const packages = Object.entries(lock.packages ?? {})
    .filter(([lockPath]) => lockPath.length > 0)
    .map(([lockPath, record]) => {
      const name = packageNameFromLockPath(lockPath);
      return Object.freeze({
        name,
        version: typeof record?.version === 'string' ? record.version : 'unknown',
        license: typeof record?.license === 'string' ? record.license : 'UNKNOWN',
        direct: directNames.has(name),
      });
    })
    .sort((left, right) =>
      left.name.localeCompare(right.name) || left.version.localeCompare(right.version));
  const unapproved = packages.filter(({ license }) => !approved.has(license));
  const licenseCounts = {};
  for (const { license } of packages) {
    licenseCounts[license] = (licenseCounts[license] ?? 0) + 1;
  }
  return Object.freeze({
    approvedLicenses,
    packageCount: packages.length,
    unapprovedLicenseCount: unapproved.length,
    unapproved: Object.freeze(unapproved),
    licenseCounts: Object.freeze(licenseCounts),
    packages: Object.freeze(packages),
  });
}

function createSupplyChainEvidence({
  codeCommit,
  first,
  second,
  dependencyAudit,
  licenseInventory,
}) {
  const builds = Object.freeze([first, second].map((artifact, index) => Object.freeze({
    index,
    sha256: artifact.sha256,
    filename: artifact.filename,
    size: artifact.size,
    unpackedSize: artifact.unpackedSize,
    fileCount: artifact.fileCount,
  })));
  const reproducible =
    first.sha256 === second.sha256
    && first.size === second.size
    && first.unpackedSize === second.unpackedSize
    && first.fileCount === second.fileCount;
  const packageInspection = Object.freeze({
    prohibitedEntryCount: first.prohibitedEntryCount,
    prohibitedEntries: first.prohibitedEntries,
    sourceMapCount: first.sourceMapCount,
    restrictedEvidenceCount: first.restrictedEvidenceCount,
  });
  const audit = Object.freeze({
    status: dependencyAudit.status,
    auditLevel: dependencyAudit.auditLevel,
    knownVulnerabilityCount: dependencyAudit.knownVulnerabilityCount,
    severityCounts: dependencyAudit.severityCounts,
  });
  const licenses = Object.freeze({
    approvedLicenses: licenseInventory.approvedLicenses,
    packageCount: licenseInventory.packageCount,
    unapprovedLicenseCount: licenseInventory.unapprovedLicenseCount,
    licenseCounts: licenseInventory.licenseCounts,
  });
  const sbom = Object.freeze({
    format: 'core-v2-spdx-lite/1',
    packageDigest: first.sha256,
    packageCount: licenseInventory.packageCount,
    packages: licenseInventory.packages,
  });
  return Object.freeze({
    schemaVersion: 1,
    sourceRevision: codeCommit,
    builds,
    reproducible,
    packageInspection,
    audit,
    licenses,
    sbom,
    status: (
      reproducible
      && packageInspection.prohibitedEntryCount === 0
      && (audit.knownVulnerabilityCount === 0 || audit.knownVulnerabilityCount === null)
      && licenses.unapprovedLicenseCount === 0
      && sbom.packageDigest === first.sha256
    )
      ? audit.knownVulnerabilityCount === null
        ? 'pending-external-audit'
        : 'pass'
      : 'fail',
  });
}

function packageNameFromLockPath(lockPath) {
  const marker = 'node_modules/';
  const index = lockPath.lastIndexOf(marker);
  return index === -1 ? lockPath : lockPath.slice(index + marker.length);
}

function nonNegativeAuditCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
