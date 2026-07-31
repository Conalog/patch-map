import { clone } from '../value-atoms.mjs';

export const UPDATE_TRANSACTIONS_HANDLER_REVISION =
  'core-v2-update-transactions-handlers/1';

export const UPDATE_TRANSACTIONS_CASE_IDS = Object.freeze([
  'ERR-001',
  'UPD-001',
  'UPD-002',
  'UPD-003',
  'UPD-004',
  'UPD-006',
  'UPD-007',
  'UPD-008',
  'UPD-009',
  'UPD-010',
  'UPD-011',
  'UPD-012',
  'UPD-013',
  'UPD-014',
  'CSM-005',
  'CSM-006',
  'CSM-007',
  'CSM-008',
  'CSM-014',
]);

export const UPDATE_TRANSACTIONS_ACTION_TYPES = Object.freeze([
  'load-dataset',
  'run-invalid-operation-matrix',
  'load-scene',
  'apply-merge',
  'redraw-scene',
  'probe-declared-failure',
  'apply-live-overlay',
  'await-frame',
  'submit-overlay-revision',
  'complete-overlay-revisions',
  'destroy-engine',
  'apply-presentation-overlay',
  'export-canonical-dataset',
  'apply-view-column',
  'remount-and-restore-column',
  'loadDataset',
  'setSelection',
  'moveAcrossParents',
  'group',
  'ungroup',
  'retainTarget',
  'replaceDataset',
  'resolveTarget',
  'patch',
  'freezePatch',
  'merge',
  'replace',
  'relativePatch',
  'resizeAroundOrigin',
  'bulkPatch',
  'generateSyntheticScene',
  'bulkOverlay',
  'publishFrame',
  'capture-observation',
  'reconcileComponents',
  'setComponentVisibility',
  'setVisibility',
  'remove',
  'startAsyncRevision',
  'completeAsyncRevision',
  'destroy',
  'setHighlightPolicy',
  'setLayerVisibility',
  'clearPresentationPolicy',
  'streamOverlay',
  'snapshot',
  'replaceExternalDependency',
  'refresh',
]);

const CASE_ACTIONS = Object.freeze({
  'ERR-001': Object.freeze([
    'load-dataset',
    'run-invalid-operation-matrix',
  ]),
  'UPD-001': Object.freeze([
    'loadDataset',
    'retainTarget',
    'replaceDataset',
    'resolveTarget',
    'patch',
  ]),
  'UPD-002': Object.freeze(['freezePatch', 'merge', 'merge']),
  'UPD-003': Object.freeze(['replace', 'replace', 'replace']),
  'UPD-004': Object.freeze(['patch', 'relativePatch', 'resizeAroundOrigin']),
  'UPD-006': Object.freeze(['bulkPatch', 'bulkPatch', 'bulkPatch', 'bulkPatch']),
  'UPD-007': Object.freeze([
    'generateSyntheticScene',
    'bulkOverlay',
    'publishFrame',
    'bulkOverlay',
  ]),
  'UPD-008': Object.freeze([
    'capture-observation',
    'reconcileComponents',
    'setComponentVisibility',
    'setComponentVisibility',
  ]),
  'UPD-009': Object.freeze([
    'loadDataset',
    'setSelection',
    'moveAcrossParents',
    'group',
    'ungroup',
    'moveAcrossParents',
    'moveAcrossParents',
  ]),
  'UPD-010': Object.freeze([
    'loadDataset',
    'patch',
    'setVisibility',
    'setVisibility',
    'remove',
  ]),
  'UPD-011': Object.freeze([
    'startAsyncRevision',
    'startAsyncRevision',
    'startAsyncRevision',
    'completeAsyncRevision',
    'completeAsyncRevision',
    'destroy',
    'completeAsyncRevision',
  ]),
  'UPD-012': Object.freeze([
    'setHighlightPolicy',
    'setLayerVisibility',
    'clearPresentationPolicy',
  ]),
  'UPD-013': Object.freeze(['streamOverlay', 'publishFrame']),
  'UPD-014': Object.freeze([
    'snapshot',
    'replaceExternalDependency',
    'refresh',
    'publishFrame',
  ]),
  'CSM-005': Object.freeze([
    'load-scene',
    'apply-merge',
    'redraw-scene',
    'apply-merge',
    'probe-declared-failure',
  ]),
  'CSM-006': Object.freeze([
    'load-scene',
    'apply-live-overlay',
    'await-frame',
    'probe-declared-failure',
  ]),
  'CSM-007': Object.freeze([
    'submit-overlay-revision',
    'submit-overlay-revision',
    'submit-overlay-revision',
    'complete-overlay-revisions',
    'destroy-engine',
    'probe-declared-failure',
  ]),
  'CSM-008': Object.freeze([
    'load-scene',
    'apply-presentation-overlay',
    'export-canonical-dataset',
    'probe-declared-failure',
  ]),
  'CSM-014': Object.freeze([
    'apply-view-column',
    'apply-view-column',
    'apply-view-column',
    'remount-and-restore-column',
    'probe-declared-failure',
  ]),
});

const BASELINE_PROFILE = 'mutation-transaction-matrix';

/** Shared browser-safe product handlers for update and consumer cases. */
export function createUpdateTransactionHandlerEntries(product) {
  const adapter = validateProductAdapter(product);
  const states = new WeakMap();
  const handlers = Object.freeze({
    'load-dataset': withState(adapter, states, loadContractDatasetAction),
    'run-invalid-operation-matrix': withState(
      adapter,
      states,
      runInvalidOperationMatrixAction,
    ),
    'load-scene': withState(adapter, states, loadJourneySceneAction),
    'apply-merge': withState(adapter, states, applyJourneyMergeAction),
    'redraw-scene': withState(adapter, states, redrawJourneySceneAction),
    'probe-declared-failure': withState(
      adapter,
      states,
      probeJourneyDeclaredFailureAction,
    ),
    'apply-live-overlay': withState(adapter, states, applyJourneyLiveOverlayAction),
    'await-frame': withState(adapter, states, awaitJourneyFrameAction),
    'submit-overlay-revision': withState(
      adapter,
      states,
      submitJourneyOverlayRevisionAction,
    ),
    'complete-overlay-revisions': withState(
      adapter,
      states,
      completeJourneyOverlayRevisionsAction,
    ),
    'destroy-engine': withState(adapter, states, destroyJourneyEngineAction),
    'apply-presentation-overlay': withState(
      adapter,
      states,
      applyJourneyPresentationOverlayAction,
    ),
    'export-canonical-dataset': withState(
      adapter,
      states,
      exportJourneyCanonicalDatasetAction,
    ),
    'apply-view-column': withState(
      adapter,
      states,
      applyViewColumnAction,
    ),
    'remount-and-restore-column': withState(
      adapter,
      states,
      remountAndRestoreColumnAction,
    ),
    loadDataset: withState(adapter, states, loadDatasetAction),
    setSelection: withState(adapter, states, setSelectionAction),
    moveAcrossParents: withState(adapter, states, moveAcrossParentsAction),
    group: withState(adapter, states, groupAction),
    ungroup: withState(adapter, states, ungroupAction),
    retainTarget: withState(adapter, states, retainTargetAction),
    replaceDataset: withState(adapter, states, replaceDatasetAction),
    resolveTarget: withState(adapter, states, resolveTargetAction),
    patch: withState(adapter, states, patchAction),
    freezePatch: withState(adapter, states, freezePatchAction),
    merge: withState(adapter, states, mergeAction),
    replace: withState(adapter, states, replaceAction),
    relativePatch: withState(adapter, states, relativePatchAction),
    resizeAroundOrigin: withState(adapter, states, resizeAroundOriginAction),
    bulkPatch: withState(adapter, states, bulkPatchAction),
    generateSyntheticScene: withState(adapter, states, generateSyntheticSceneAction),
    bulkOverlay: withState(adapter, states, bulkOverlayAction),
    publishFrame: withState(adapter, states, publishFrameAction),
    'capture-observation': withState(adapter, states, captureObservationAction),
    reconcileComponents: withState(adapter, states, reconcileComponentsAction),
    setComponentVisibility: withState(adapter, states, setComponentVisibilityAction),
    setVisibility: withState(adapter, states, setVisibilityAction),
    remove: withState(adapter, states, removeAction),
    startAsyncRevision: withState(adapter, states, startAsyncRevisionAction),
    completeAsyncRevision: withState(adapter, states, completeAsyncRevisionAction),
    destroy: withState(adapter, states, destroyAsyncRevisionAction),
    setHighlightPolicy: withState(adapter, states, setHighlightPolicyAction),
    setLayerVisibility: withState(adapter, states, setLayerVisibilityAction),
    clearPresentationPolicy: withState(adapter, states, clearPresentationPolicyAction),
    streamOverlay: withState(adapter, states, streamOverlayAction),
    snapshot: withState(adapter, states, snapshotAction),
    replaceExternalDependency: withState(adapter, states, replaceExternalDependencyAction),
    refresh: withState(adapter, states, refreshAction),
  });
  return Object.freeze(UPDATE_TRANSACTIONS_ACTION_TYPES.map((type) => Object.freeze([
    `contract/${type}`,
    handlers[type],
  ])));
}

function withState(adapter, states, handler) {
  return async (contextValue, actionValue) => {
    const context = validateContext(contextValue);
    const actions = CASE_ACTIONS[context.caseId];
    assert(actions !== undefined, `unsupported case ${String(context.caseId)}`);
    assert(Number.isInteger(context.actionIndex), 'context actionIndex');
    const requiredType = actions[context.actionIndex];
    assert(requiredType !== undefined, `${context.caseId} action index`);
    const action = recordValue(actionValue, 'action');
    assertExactKeys(action, ['index', 'operands', 'type'], 'action');
    assert(action.index === context.actionIndex, 'action index');
    assert(action.type === requiredType, `${context.caseId} action type`);
    validateRouteParams(context.routeParams);
    assert(!context.signal.aborted, 'action is aborted');

    let state = states.get(context.ensureMainEngine);
    if (state === undefined) {
      state = {
        caseId: context.caseId,
        engine: null,
        baselineLoaded: false,
        selectedGeometryTarget: false,
        datasets: new Map(),
        patches: new Map(),
        retainedTargets: new Map(),
        lastBulkEventRevision: null,
        asyncRequests: new Map(),
        asyncPublishedRevisions: [],
        asyncPublishedRequestIds: [],
        asyncTemporaryAllocated: 0,
        asyncTemporaryReleased: 0,
        asyncSupersededEventCount: 0,
        asyncPostDestroyEventCount: 0,
        asyncPostDestroyFrameCount: 0,
        asyncEventCount: 0,
        asyncFrameCount: 0,
        asyncDestroyed: false,
        asyncMonitorAttached: false,
        hostRevision: 0,
        journeyBaselineFingerprint: null,
        journeyOverlayChanges: null,
        pendingOverlayRevisions: new Map(),
        acceptedOverlayRevision: null,
        supersededOverlayRevisions: [],
        completedOverlayFacts: null,
        overlayDestroyed: false,
        overlayMonitorAttached: false,
        overlayEventCount: 0,
        overlayFrameCount: 0,
        overlayPostDestroyEventCount: 0,
        overlayPostDestroyFrameCount: 0,
        viewColumnTrace: [],
        viewColumnValues: new Map(),
        viewColumnSelected: null,
      };
      states.set(context.ensureMainEngine, state);
    }
    assert(state.caseId === context.caseId, 'execution state case identity');
    return handler(adapter, state, context, action);
  };
}

async function loadContractDatasetAction(adapter, state, context, action) {
  assert(context.caseId === 'ERR-001', 'load-dataset case');
  const operands = exactOperands(action, ['datasetRef', 'strict']);
  const datasetRef = stringValue(operands.datasetRef, 'load-dataset.datasetRef');
  const strict = booleanValue(operands.strict, 'load-dataset.strict');
  const engine = await ensureInitializedEngine(state, context);
  const dataset = await context.resolveDataset(datasetRef);
  const inputBefore = context.fingerprint(dataset);
  const before = observeProduct(adapter, context, engine);
  const result = callSync(engine, 'loadDataset', dataset, { datasetRef, strict });
  const inputAfter = context.fingerprint(dataset);
  state.datasets.set(datasetRef, { value: dataset, fingerprint: inputBefore });
  state.baselineLoaded = true;
  state.journeyBaselineFingerprint = inputBefore;
  const product = observeProduct(adapter, context, engine);
  return {
    actual: {
      datasetRef,
      strict,
      input: inputObservation(inputBefore, inputAfter),
      before,
      product,
      result: clone(result),
    },
    captureSource: {
      sceneSemanticHash: product.dataset.semanticHash,
    },
  };
}

async function runInvalidOperationMatrixAction(adapter, state, context, action) {
  assert(context.caseId === 'ERR-001', 'run-invalid-operation-matrix case');
  const operands = exactOperands(action, ['caseIds', 'strict']);
  const caseIds = stringArray(operands.caseIds, 'invalid operation case IDs');
  const strict = booleanValue(operands.strict, 'invalid operation strict');
  const params = recordValue(context.fixtureParams, 'ERR-001 fixture params');
  const invalidCases = arrayValue(params.invalidCases, 'ERR-001 invalid cases');
  const declarations = new Map(invalidCases.map((entryValue, index) => {
    const entry = recordValue(entryValue, `ERR-001 invalid case ${index}`);
    return [stringValue(entry.id, `ERR-001 invalid case ${index} id`), entry];
  }));
  assert(
    caseIds.every((id) => declarations.has(id)) && caseIds.length === declarations.size,
    'ERR-001 invalid case selection',
  );
  const engine = currentEngine(state, 'run-invalid-operation-matrix');
  const baseline = state.datasets.get(
    stringValue(params.datasetRef, 'ERR-001 baseline datasetRef'),
  );
  assert(baseline !== undefined, 'ERR-001 baseline dataset');
  const baselineInputBefore = context.fingerprint(baseline.value);
  const before = observeProduct(adapter, context, engine);
  const results = [];

  for (const id of caseIds) {
    const declaration = declarations.get(id);
    assert(declaration !== undefined, `ERR-001 invalid declaration ${id}`);
    results.push(runInvalidOperationCase(
      engine,
      context,
      declaration,
      strict,
      baseline.value,
    ));
  }

  const product = observeProduct(adapter, context, engine);
  return {
    actual: {
      caseIds,
      strict,
      input: fingerprintValue(context, action.operands),
      baselineInput: inputObservation(
        baselineInputBefore,
        context.fingerprint(baseline.value),
      ),
      before,
      product,
      results,
    },
  };
}

async function loadJourneySceneAction(adapter, state, context, action) {
  assert(
    context.caseId === 'CSM-005' ||
      context.caseId === 'CSM-006' ||
      context.caseId === 'CSM-008',
    'load-scene case',
  );
  const operands = exactOperands(action, ['datasetRef', 'hostRevision']);
  const datasetRef = stringValue(operands.datasetRef, 'load-scene.datasetRef');
  const hostRevision = positiveInteger(
    operands.hostRevision,
    'load-scene.hostRevision',
  );
  const engine = await ensureInitializedEngine(state, context);
  const dataset = await context.resolveDataset(datasetRef);
  const inputBefore = context.fingerprint(dataset);
  const before = observeProduct(adapter, context, engine);
  const result = callSync(engine, 'loadDataset', dataset, { datasetRef });
  const product = observeProduct(adapter, context, engine);
  state.datasets.set(datasetRef, { value: dataset, fingerprint: inputBefore });
  state.baselineLoaded = true;
  state.hostRevision = hostRevision;
  state.journeyBaselineFingerprint = product.dataset.fingerprint;
  return {
    actual: {
      datasetRef,
      hostRevision,
      input: inputObservation(inputBefore, context.fingerprint(dataset)),
      before,
      product,
      result: clone(result),
    },
    ...(context.caseId === 'CSM-008'
      ? { captureSource: { datasetHash: product.dataset.fingerprint } }
      : {}),
    host: {
      operation: 'load-scene',
      supplied: { datasetRef, hostRevision },
      returned: {
        sceneRevision: sceneRevision(product),
        semanticHash: product.dataset.semanticHash,
      },
    },
  };
}

function applyJourneyMergeAction(adapter, state, context, action) {
  assert(context.caseId === 'CSM-005', 'apply-merge case');
  const operands = exactOperands(action, ['actionId', 'changes', 'strict', 'target']);
  const actionId = stringValue(operands.actionId, 'apply-merge.actionId');
  const target = stringValue(operands.target, 'apply-merge.target');
  const strict = booleanValue(operands.strict, 'apply-merge.strict');
  const changes = recordValue(operands.changes, 'apply-merge.changes');
  const engine = currentEngine(state, 'apply-merge');
  const inputBefore = context.fingerprint(changes);
  const before = observeProduct(adapter, context, engine);
  const result = callSync(engine, 'transact', {
    strict,
    recordHistory: false,
    actionId,
    operations: [{
      op: 'merge',
      target: elementTarget(target),
      changes: patchChanges(changes),
    }],
  });
  const product = observeProduct(adapter, context, engine);
  const record = currentRecord(engine, elementTarget(target));
  const geometry = geometryEntityById(product.geometry, target);
  return {
    actual: {
      actionId,
      target,
      strict,
      input: inputObservation(inputBefore, context.fingerprint(changes)),
      before,
      product,
      result: clone(result),
      record,
      geometry: clone(geometry),
      unresolvedIntentCount: Number(record === null),
    },
    host: {
      operation: 'apply-merge',
      supplied: { actionId, target, strict, changes: clone(changes) },
      returned: {
        status: result.status,
        sceneRevision: sceneRevision(product),
        applied: mutationTargetIds(result.applied),
      },
    },
  };
}

async function redrawJourneySceneAction(adapter, state, context, action) {
  assert(context.caseId === 'CSM-005', 'redraw-scene case');
  const operands = exactOperands(action, ['datasetRef', 'hostRevision']);
  const datasetRef = stringValue(operands.datasetRef, 'redraw-scene.datasetRef');
  const hostRevision = positiveInteger(
    operands.hostRevision,
    'redraw-scene.hostRevision',
  );
  const engine = currentEngine(state, 'redraw-scene');
  const dataset = await context.resolveDataset(datasetRef);
  const inputBefore = context.fingerprint(dataset);
  const before = observeProduct(adapter, context, engine);
  const result = callSync(engine, 'loadDataset', dataset, { datasetRef });
  const product = observeProduct(adapter, context, engine);
  state.hostRevision = hostRevision;
  state.journeyBaselineFingerprint = product.dataset.fingerprint;
  return {
    actual: {
      datasetRef,
      hostRevision,
      input: inputObservation(inputBefore, context.fingerprint(dataset)),
      before,
      product,
      result: clone(result),
    },
    host: {
      operation: 'redraw-scene',
      supplied: { datasetRef, hostRevision },
      returned: { sceneRevision: sceneRevision(product) },
    },
  };
}

function applyJourneyLiveOverlayAction(adapter, state, context, action) {
  assert(context.caseId === 'CSM-006', 'apply-live-overlay case');
  const operands = exactOperands(action, [
    'changes',
    'hostRevision',
    'rebuildScene',
    'target',
  ]);
  const hostRevision = positiveInteger(
    operands.hostRevision,
    'apply-live-overlay.hostRevision',
  );
  const target = stringValue(operands.target, 'apply-live-overlay.target');
  const rebuildScene = booleanValue(
    operands.rebuildScene,
    'apply-live-overlay.rebuildScene',
  );
  assert(rebuildScene === false, 'live overlay does not rebuild the scene');
  const changes = recordValue(operands.changes, 'apply-live-overlay.changes');
  const engine = currentEngine(state, 'apply-live-overlay');
  const inputBefore = context.fingerprint(changes);
  const before = observeProduct(adapter, context, engine);
  const result = callSync(engine, 'applyLiveOverlay', {
    sourceRevision: hostRevision,
    payloadHash: context.fingerprint(changes),
    transaction: {
      strict: true,
      recordHistory: false,
      actionId: `CSM-006:${hostRevision}`,
      operations: journeyLiveOverlayOperations(target, changes),
    },
  });
  const product = observeProduct(adapter, context, engine);
  const facts = journeyOverlayFacts(engine);
  state.hostRevision = hostRevision;
  state.journeyOverlayChanges = deepFreeze(clone(changes));
  return {
    actual: {
      hostRevision,
      target,
      rebuildScene,
      input: inputObservation(inputBefore, context.fingerprint(changes)),
      before,
      product,
      result: clone(result),
      overlay: clone(callSync(engine, 'liveOverlayProbe')),
      facts,
    },
    host: {
      operation: 'apply-live-overlay',
      supplied: { hostRevision, target, changes: clone(changes), rebuildScene },
      returned: {
        status: result.status,
        sceneRevision: sceneRevision(product),
      },
    },
  };
}

async function awaitJourneyFrameAction(adapter, state, context, action) {
  assert(context.caseId === 'CSM-006', 'await-frame case');
  const operands = exactOperands(action, ['sceneRevision']);
  const requestedSceneRevision = positiveInteger(
    operands.sceneRevision,
    'await-frame.sceneRevision',
  );
  const engine = currentEngine(state, 'await-frame');
  const before = observeProduct(adapter, context, engine);
  callSync(engine, 'publishFrame', context.clock.now());
  const product = observeProduct(adapter, context, engine);
  return {
    actual: {
      requestedSceneRevision,
      input: fingerprintValue(context, action.operands),
      before,
      product,
      result: {
        status: 'published',
        sceneRevision: sceneRevision(product),
        frameRevision: product.snapshot.frameRevision,
      },
      overlay: clone(callSync(engine, 'liveOverlayProbe')),
      facts: journeyOverlayFacts(engine),
    },
    host: {
      operation: 'await-frame',
      supplied: { requestedSceneRevision },
      returned: {
        sceneRevision: sceneRevision(product),
        frameRevision: product.snapshot.frameRevision,
      },
    },
  };
}

async function submitJourneyOverlayRevisionAction(adapter, state, context, action) {
  assert(context.caseId === 'CSM-007', 'submit-overlay-revision case');
  const operands = exactOperands(action, ['hostRevision', 'value']);
  const hostRevision = positiveInteger(
    operands.hostRevision,
    'submit-overlay-revision.hostRevision',
  );
  const value = recordValue(operands.value, 'submit-overlay-revision.value');
  const engine = await ensureJourneyBaseline(adapter, state, context);
  attachJourneyOverlayMonitor(state, engine);
  assert(!state.pendingOverlayRevisions.has(hostRevision), 'overlay revision identity');
  const detached = deepFreeze(clone(value));
  state.pendingOverlayRevisions.set(hostRevision, detached);
  const product = observeProduct(adapter, context, engine);
  return {
    actual: {
      hostRevision,
      input: fingerprintValue(context, action.operands),
      product,
      result: { status: 'submitted', hostRevision },
      pendingHostRevisions: [...state.pendingOverlayRevisions.keys()].sort((a, b) => a - b),
    },
    host: {
      operation: 'submit-overlay-revision',
      supplied: { hostRevision, value: clone(value) },
      returned: { status: 'submitted' },
    },
  };
}

function completeJourneyOverlayRevisionsAction(adapter, state, context, action) {
  assert(context.caseId === 'CSM-007', 'complete-overlay-revisions case');
  const operands = exactOperands(action, ['order']);
  const order = integerArray(operands.order, 'complete overlay order');
  const engine = currentEngine(state, 'complete-overlay-revisions');
  const before = observeProduct(adapter, context, engine);
  const results = [];
  let acceptedThisAction = false;
  for (const hostRevision of order) {
    const value = state.pendingOverlayRevisions.get(hostRevision);
    assert(value !== undefined, `pending overlay revision ${hostRevision}`);
    const result = callSync(engine, 'applyLiveOverlay', {
      sourceRevision: hostRevision,
      payloadHash: context.fingerprint(value),
      transaction: {
        strict: true,
        recordHistory: false,
        actionId: `CSM-007:${hostRevision}`,
        operations: journeyBarOverlayOperations(value),
      },
    });
    if (result.status === 'accepted') {
      state.acceptedOverlayRevision = hostRevision;
      acceptedThisAction = true;
    } else if (result.status === 'superseded') {
      state.supersededOverlayRevisions.push(hostRevision);
    }
    results.push({ hostRevision, result: clone(result) });
    state.pendingOverlayRevisions.delete(hostRevision);
  }
  if (acceptedThisAction) callSync(engine, 'publishFrame', context.clock.now());
  const product = observeProduct(adapter, context, engine);
  const facts = journeyOverlayFacts(engine);
  state.completedOverlayFacts = deepFreeze(clone(facts));
  return {
    actual: {
      order,
      input: fingerprintValue(context, action.operands),
      before,
      product,
      result: { status: 'completed', results },
      acceptedHostRevision: state.acceptedOverlayRevision,
      supersededHostRevisions: clone(state.supersededOverlayRevisions),
      pendingHostRevisions: [...state.pendingOverlayRevisions.keys()].sort((a, b) => a - b),
      overlay: clone(callSync(engine, 'liveOverlayProbe')),
      facts,
    },
    host: {
      operation: 'complete-overlay-revisions',
      supplied: { order },
      returned: {
        acceptedHostRevision: state.acceptedOverlayRevision,
        supersededHostRevisions: clone(state.supersededOverlayRevisions),
      },
    },
  };
}

async function destroyJourneyEngineAction(adapter, state, context, action) {
  assert(context.caseId === 'CSM-007', 'destroy-engine case');
  const operands = exactOperands(action, ['afterHostRevision']);
  const afterHostRevision = positiveInteger(
    operands.afterHostRevision,
    'destroy-engine.afterHostRevision',
  );
  const engine = currentEngine(state, 'destroy-engine');
  const before = observeProduct(adapter, context, engine);
  state.completedOverlayFacts ??= deepFreeze(clone(journeyOverlayFacts(engine)));
  state.overlayDestroyed = true;
  const returned = await call(engine, 'destroy');
  const product = observeProduct(adapter, context, engine);
  return {
    actual: {
      afterHostRevision,
      input: fingerprintValue(context, action.operands),
      before,
      product,
      result: { status: 'destroyed', returned },
      completedFacts: clone(state.completedOverlayFacts),
      postDestroy: journeyPostDestroyFacts(state),
    },
    host: {
      operation: 'destroy-engine',
      supplied: { afterHostRevision },
      returned: { lifecycle: product.snapshot.lifecycle, destroyed: returned },
    },
  };
}

function applyJourneyPresentationOverlayAction(adapter, state, context, action) {
  assert(context.caseId === 'CSM-008', 'apply-presentation-overlay case');
  const operands = exactOperands(action, [
    'hiddenRelationIds',
    'highlightIds',
    'persist',
  ]);
  const highlightIds = stringArray(
    operands.highlightIds,
    'apply-presentation-overlay.highlightIds',
  );
  const hiddenRelationIds = stringArray(
    operands.hiddenRelationIds,
    'apply-presentation-overlay.hiddenRelationIds',
  );
  const persist = booleanValue(
    operands.persist,
    'apply-presentation-overlay.persist',
  );
  assert(persist === false, 'presentation overlay must stay transient');
  const engine = currentEngine(state, 'apply-presentation-overlay');
  const before = observeProduct(adapter, context, engine);
  const persistedBefore = context.fingerprint(callSync(engine, 'exportDataset'));
  const result = callSync(engine, 'setPresentationPolicy', {
    highlightIds,
    hiddenLayerIds: hiddenRelationIds,
  });
  callSync(engine, 'publishFrame', context.clock.now());
  const presentation = clone(callSync(engine, 'presentationPolicyProbe'));
  const persistedAfter = context.fingerprint(callSync(engine, 'exportDataset'));
  const product = observeProduct(adapter, context, engine);
  const entityIds = new Set(arrayValue(
    presentation.entities,
    'presentation entities',
  ).map((entry, index) => stringValue(
    recordValue(entry, `presentation entity ${index}`).id,
    `presentation entity ${index} id`,
  )));
  const unresolvedIntentCount = [...highlightIds, ...hiddenRelationIds]
    .filter((id) => !entityIds.has(id)).length;
  return {
    actual: {
      highlightIds,
      hiddenRelationIds,
      persist,
      input: fingerprintValue(context, action.operands),
      before,
      product,
      result: clone(result),
      presentation,
      persisted: {
        beforeFingerprint: persistedBefore,
        afterFingerprint: persistedAfter,
        unchanged: persistedBefore === persistedAfter,
      },
      unresolvedIntentCount,
    },
    host: {
      operation: 'apply-presentation-overlay',
      supplied: { highlightIds, hiddenRelationIds, persist },
      returned: {
        status: presentation.status,
        highlightedIds: clone(presentation.highlightIds),
        hiddenRelationIds: clone(presentation.hiddenLayerIds),
      },
    },
  };
}

function exportJourneyCanonicalDatasetAction(adapter, state, context, action) {
  assert(context.caseId === 'CSM-008', 'export-canonical-dataset case');
  const operands = exactOperands(action, ['root']);
  const root = stringValue(operands.root, 'export-canonical-dataset.root');
  assert(root === 'array', 'canonical export root');
  const engine = currentEngine(state, 'export-canonical-dataset');
  const dataset = callSync(engine, 'exportDataset');
  const fingerprint = context.fingerprint(dataset);
  const product = observeProduct(adapter, context, engine);
  return {
    actual: {
      root,
      input: fingerprintValue(context, action.operands),
      product,
      result: {
        status: 'exported',
        root,
        fingerprint,
        rootCount: dataset.length,
      },
      export: {
        fingerprint,
        baselineFingerprint: state.journeyBaselineFingerprint,
        unchanged: fingerprint === state.journeyBaselineFingerprint,
      },
      presentation: clone(callSync(engine, 'presentationPolicyProbe')),
    },
    host: {
      operation: 'export-canonical-dataset',
      supplied: { root },
      returned: {
        rootCount: dataset.length,
        fingerprint,
        unchanged: fingerprint === state.journeyBaselineFingerprint,
      },
    },
  };
}

async function applyViewColumnAction(adapter, state, context, action) {
  assert(context.caseId === 'CSM-014', 'apply-view-column case');
  const operands = exactOperands(action, ['column', 'values']);
  const column = viewColumnName(context, operands.column);
  const values = viewColumnValues(operands.values);
  const engine = await ensureViewColumnSession(state, context, 1);
  const inputBefore = context.fingerprint(operands.values);
  const before = observeProduct(adapter, context, engine);
  const result = applyViewColumn(engine, context, column, values);
  callSync(engine, 'publishFrame', context.clock.now());
  state.viewColumnTrace.push(column);
  state.viewColumnValues.set(column, values);
  state.viewColumnSelected = column;
  const facts = journeyOverlayFacts(engine);
  const product = observeProduct(adapter, context, engine);
  return {
    actual: {
      column,
      input: inputObservation(
        inputBefore,
        context.fingerprint(operands.values),
      ),
      before,
      product,
      result: clone(result),
      facts,
      appliedColumnTrace: clone(state.viewColumnTrace),
    },
    host: {
      operation: 'apply-view-column',
      supplied: { column, values: clone(values) },
      returned: {
        status: result.status,
        selectedColumn: column,
        sceneRevision: sceneRevision(product),
      },
    },
  };
}

async function remountAndRestoreColumnAction(adapter, state, context, action) {
  assert(context.caseId === 'CSM-014', 'remount-and-restore-column case');
  const operands = exactOperands(action, ['selectedColumn']);
  const selectedColumn = viewColumnName(context, operands.selectedColumn);
  const values = state.viewColumnValues.get(selectedColumn);
  assert(values !== undefined, 'remounted column must have prior host values');
  const prior = currentEngine(state, 'remount-and-restore-column');
  const before = observeProduct(adapter, context, prior);
  const engine = await ensureViewColumnSession(state, context, 2);
  const result = applyViewColumn(engine, context, selectedColumn, values);
  callSync(engine, 'publishFrame', context.clock.now());
  state.viewColumnSelected = selectedColumn;
  const facts = journeyOverlayFacts(engine);
  const product = observeProduct(adapter, context, engine);
  return {
    actual: {
      selectedColumn,
      input: fingerprintValue(context, action.operands),
      before,
      product,
      result: clone(result),
      facts,
      appliedColumnTrace: clone(state.viewColumnTrace),
      remountedColumn: selectedColumn,
      priorLifecycle: before.snapshot.lifecycle,
      activeCanvasCount: product.snapshot.resources.canvasCount,
    },
    host: {
      operation: 'remount-and-restore-column',
      supplied: { selectedColumn },
      returned: {
        selectedColumn,
        sceneRevision: sceneRevision(product),
        canvasCount: product.snapshot.resources.canvasCount,
      },
    },
  };
}

async function probeJourneyDeclaredFailureAction(adapter, state, context, action) {
  assert(
    context.caseId === 'CSM-005' ||
      context.caseId === 'CSM-006' ||
      context.caseId === 'CSM-007' ||
      context.caseId === 'CSM-008' ||
      context.caseId === 'CSM-014',
    'probe-declared-failure case',
  );
  const operands = exactOperands(action, [
    'afterActionIndex',
    'expectedRollback',
    'injection',
    'isolate',
    'journeyId',
  ]);
  assert(
    booleanValue(operands.isolate, 'probe-declared-failure.isolate'),
    'declared failure isolation',
  );
  assert(
    nonNegativeInteger(
      operands.afterActionIndex,
      'probe-declared-failure.afterActionIndex',
    ) === context.actionIndex - 1,
    'declared failure action index',
  );
  assert(
    stringValue(operands.journeyId, 'probe-declared-failure.journeyId') ===
      context.caseId,
    'declared failure journey identity',
  );
  const injection = recordValue(
    operands.injection,
    'probe-declared-failure.injection',
  );
  // Immutable expectedRollback values are intentionally not consulted.
  recordValue(
    operands.expectedRollback,
    'probe-declared-failure.expectedRollback',
  );

  if (context.caseId === 'CSM-007') {
    const engine = currentEngine(state, 'probe-declared-failure');
    const before = journeyPostDestroyFacts(state);
    let diagnostic = null;
    try {
      callSync(engine, 'applyLiveOverlay', {
        sourceRevision: positiveInteger(
          state.acceptedOverlayRevision ?? 1,
          'destroyed overlay revision',
        ) + 1,
        payloadHash: 'post-destroy-probe',
        transaction: {
          strict: true,
          recordHistory: false,
          actionId: 'CSM-007:post-destroy',
          operations: journeyBarOverlayOperations({
            size: { width: 60, height: 99 },
          }),
        },
      });
    } catch (error) {
      diagnostic = publicDiagnosticFromError(error);
    }
    const after = journeyPostDestroyFacts(state);
    const product = observeProduct(adapter, context, engine);
    const rollback = {
      priorCompleteSceneAvailable: state.completedOverlayFacts !== null,
      latePublicationAfterDestroy:
        after.events + after.frames - before.events - before.frames,
      staleSuccessCallbacks: after.events - before.events,
    };
    return {
      actual: {
        input: fingerprintValue(context, action.operands),
        product,
        injection: clone(injection),
        diagnostic,
        rollback,
        completedFacts: clone(state.completedOverlayFacts),
        acceptedHostRevision: state.acceptedOverlayRevision,
        supersededHostRevisions: clone(state.supersededOverlayRevisions),
        pendingHostRevisions: [...state.pendingOverlayRevisions.keys()],
        postDestroy: after,
      },
      host: {
        operation: 'probe-declared-failure',
        supplied: { injection: clone(injection) },
        returned: clone(rollback),
      },
    };
  }

  const record = await context.createEngine(
    `declared-failure:${context.caseId}`,
  );
  const isolated = record.engine;
  let rollback;
  let failure;
  let release;
  try {
    await initializeIsolatedJourneyEngine(isolated, context.caseId);
    const datasetRef = journeyDatasetRef(context);
    const dataset = await context.resolveDataset(datasetRef);
    callSync(isolated, 'loadDataset', dataset, { datasetRef });

    if (context.caseId === 'CSM-005') {
      const before = isolatedFailureSnapshot(isolated, context);
      const result = callSync(isolated, 'transact', {
        strict: true,
        recordHistory: false,
        actionId: 'CSM-005:declared-failure',
        operations: [{
          op: 'merge',
          target: elementTarget('missing-target'),
          changes: [{ path: ['attrs', 'x'], value: 1 }],
        }],
      });
      const after = isolatedFailureSnapshot(isolated, context);
      const diagnostic = publicDiagnosticFromResult(result);
      rollback = {
        strictAtomic:
          sceneRevisionFromSnapshot(before.snapshot) ===
            sceneRevisionFromSnapshot(after.snapshot) &&
          before.fingerprint === after.fingerprint,
        targetMissingCode: diagnostic?.code ?? null,
        sceneUnchangedOnFailure: before.fingerprint === after.fingerprint,
      };
      failure = { result: clone(result), diagnostic, before, after };
    } else if (context.caseId === 'CSM-006') {
      const changes = state.journeyOverlayChanges ??
        recordValue(context.fixtureParams, 'CSM-006 fixture params').changes;
      const accepted = callSync(isolated, 'applyLiveOverlay', {
        sourceRevision: 1,
        payloadHash: context.fingerprint(changes),
        transaction: {
          strict: true,
          recordHistory: false,
          actionId: 'CSM-006:declared-valid',
          operations: journeyLiveOverlayOperations('item-a', changes),
        },
      });
      callSync(isolated, 'publishFrame', context.clock.now());
      const before = isolatedFailureSnapshot(isolated, context);
      const rejected = callSync(isolated, 'applyLiveOverlay', {
        sourceRevision: 2,
        payloadHash: 'declared-invalid-overlay',
        transaction: {
          strict: true,
          recordHistory: true,
          actionId: 'CSM-006:declared-invalid',
          operations: journeyLiveOverlayOperations('item-a', changes),
        },
      });
      const after = isolatedFailureSnapshot(isolated, context);
      const probe = callSync(isolated, 'liveOverlayProbe');
      const diagnostic = publicDiagnosticFromResult(rejected);
      rollback = {
        keepLastOverlayRevision: probe.latestAccepted?.sourceRevision ?? null,
        partialPublicationCount:
          after.snapshot.frameRevision - before.snapshot.frameRevision,
        strictInvalidCode: diagnostic?.code ?? null,
      };
      failure = {
        accepted: clone(accepted),
        rejected: clone(rejected),
        diagnostic,
        before,
        after,
      };
    } else if (context.caseId === 'CSM-008') {
      const params = recordValue(context.fixtureParams, 'CSM-008 fixture params');
      const highlightIds = stringArray(params.highlightIds, 'CSM-008 highlight IDs');
      const hiddenRelationIds = stringArray(
        params.hideRelationIds,
        'CSM-008 hidden relation IDs',
      );
      const persistedBefore = context.fingerprint(callSync(isolated, 'exportDataset'));
      callSync(isolated, 'setPresentationPolicy', {
        highlightIds,
        hiddenLayerIds: hiddenRelationIds,
      });
      const result = callSync(isolated, 'transact', {
        strict: true,
        recordHistory: false,
        actionId: 'CSM-008:declared-failure',
        operations: [{
          op: 'merge',
          target: elementTarget('missing-target'),
          changes: [{ path: ['attrs', 'x'], value: 1 }],
        }],
      });
      callSync(isolated, 'clearPresentationPolicy');
      callSync(isolated, 'publishFrame', context.clock.now());
      const presentation = callSync(isolated, 'presentationPolicyProbe');
      const persistedAfter = context.fingerprint(callSync(isolated, 'exportDataset'));
      rollback = {
        removeOverlayOnFailure: presentation.status === 'normal',
        persistedDataUnchanged: persistedBefore === persistedAfter,
      };
      failure = {
        result: clone(result),
        diagnostic: publicDiagnosticFromResult(result),
        presentation: clone(presentation),
      };
    } else {
      const selectedColumn = viewColumnName(
        context,
        state.viewColumnSelected,
      );
      const values = state.viewColumnValues.get(selectedColumn);
      assert(values !== undefined, 'CSM-014 selected column values');
      applyViewColumn(isolated, context, selectedColumn, values);
      callSync(isolated, 'publishFrame', context.clock.now());
      const before = isolatedFailureSnapshot(isolated, context);
      const beforeFacts = journeyOverlayFacts(isolated);
      let diagnostic = null;
      try {
        viewColumnName(context, '__invalid_column__');
      } catch (error) {
        diagnostic = publicDiagnosticFromError(error);
      }
      const after = isolatedFailureSnapshot(isolated, context);
      const afterFacts = journeyOverlayFacts(isolated);
      const beforeBar = beforeFacts.components.bar.record;
      const afterBar = afterFacts.components.bar.record;
      const beforeLabel = beforeFacts.components.label.record;
      const afterLabel = afterFacts.components.label.record;
      rollback = {
        invalidColumnRejected: diagnostic !== null,
        priorColumnRetained:
          context.fingerprint(beforeBar) === context.fingerprint(afterBar) &&
          context.fingerprint(beforeLabel) === context.fingerprint(afterLabel),
        sceneUnchangedOnFailure:
          before.fingerprint === after.fingerprint &&
          sceneRevisionFromSnapshot(before.snapshot) ===
            sceneRevisionFromSnapshot(after.snapshot),
      };
      failure = {
        diagnostic,
        before,
        after,
        beforeFacts,
        afterFacts,
      };
    }
  } finally {
    release = await context.releaseEngine(
      isolated,
      'declared-failure-isolation',
    );
  }

  const main = observeProduct(
    adapter,
    context,
    currentEngine(state, 'probe-declared-failure'),
  );
  return {
    actual: {
      input: fingerprintValue(context, action.operands),
      product: main,
      injection: clone(injection),
      failure,
      rollback,
      release: clone(release),
    },
    host: {
      operation: 'probe-declared-failure',
      supplied: { injection: clone(injection) },
      returned: clone(rollback),
    },
  };
}

async function loadDatasetAction(adapter, state, context, action) {
  assert(
    context.caseId === 'UPD-001' ||
      context.caseId === 'UPD-009' ||
      context.caseId === 'UPD-010',
    'loadDataset case',
  );
  const operands = exactOperands(action, ['datasetRef']);
  const datasetRef = stringValue(operands.datasetRef, 'loadDataset.datasetRef');
  const engine = await ensureInitializedEngine(state, context);
  const dataset = await context.resolveDataset(datasetRef);
  const inputBefore = context.fingerprint(dataset);
  const before = observeProduct(adapter, context, engine);
  const result = callSync(engine, 'loadDataset', dataset, { datasetRef });
  const inputAfter = context.fingerprint(dataset);
  state.datasets.set(datasetRef, { value: dataset, fingerprint: inputBefore });
  state.baselineLoaded = true;
  const product = observeProduct(adapter, context, engine);
  return {
    actual: {
      datasetRef,
      input: inputObservation(inputBefore, inputAfter),
      before,
      product,
      result: clone(result),
      ...(context.caseId === 'UPD-010'
        ? { relationState: relationFacts(product.relations) }
        : {}),
    },
  };
}

function setSelectionAction(adapter, state, context, action) {
  assert(context.caseId === 'UPD-009', 'setSelection case');
  const operands = exactOperands(action, ['mode', 'targetIds']);
  const mode = stringValue(operands.mode, 'setSelection.mode');
  assert(mode === 'replace', 'setSelection mode');
  const targetIds = stringArray(operands.targetIds, 'setSelection.targetIds');
  const engine = currentEngine(state, 'setSelection');
  const before = observeProduct(adapter, context, engine);
  const selectedIds = callSync(engine, 'select', targetIds);
  const product = observeProduct(adapter, context, engine);
  return {
    actual: {
      mode,
      targetIds,
      input: fingerprintValue(context, action.operands),
      before,
      product,
      result: { status: 'selected', selectedIds: clone(selectedIds) },
      selectionIds: clone(selectedIds),
    },
  };
}

function moveAcrossParentsAction(adapter, state, context, action) {
  assert(context.caseId === 'UPD-009', 'moveAcrossParents case');
  const operands = recordValue(action.operands, 'moveAcrossParents operands');
  const acceptedKeys = ['targetId', 'toParentId'];
  for (const optional of [
    'actionId',
    'fromParentId',
    'preserveWorld',
    'recordHistory',
    'strict',
  ]) {
    if (Object.hasOwn(operands, optional)) acceptedKeys.push(optional);
  }
  assertExactKeys(operands, acceptedKeys, 'moveAcrossParents operands');
  if (Object.hasOwn(operands, 'preserveWorld')) {
    assert(operands.preserveWorld === true, 'moveAcrossParents preserveWorld');
  }
  const targetId = stringValue(operands.targetId, 'moveAcrossParents.targetId');
  const toParentId = stringValue(operands.toParentId, 'moveAcrossParents.toParentId');
  const fromParentId = Object.hasOwn(operands, 'fromParentId')
    ? stringValue(operands.fromParentId, 'moveAcrossParents.fromParentId')
    : undefined;
  const strict = Object.hasOwn(operands, 'strict')
    ? booleanValue(operands.strict, 'moveAcrossParents.strict')
    : true;
  const recordHistory = Object.hasOwn(operands, 'recordHistory')
    ? booleanValue(operands.recordHistory, 'moveAcrossParents.recordHistory')
    : undefined;
  const actionId = Object.hasOwn(operands, 'actionId')
    ? stringValue(operands.actionId, 'moveAcrossParents.actionId')
    : undefined;
  const engine = currentEngine(state, 'moveAcrossParents');
  const hierarchyBefore = hierarchyElementFacts(engine, targetId);
  if (fromParentId !== undefined) {
    assert(hierarchyBefore.parentId === fromParentId, 'moveAcrossParents source parent');
  }
  const before = observeProduct(adapter, context, engine);
  const observed = observeChangeEvents(engine, () => callSync(engine, 'transact', {
    strict,
    ...(actionId === undefined ? {} : { actionId }),
    ...(recordHistory === undefined ? {} : { recordHistory }),
    operations: [{
      op: 'move',
      target: elementTarget(targetId),
      parent: elementTarget(toParentId),
      index: hierarchyChildCount(engine, toParentId),
    }],
  }));
  if (observed.result.status === 'committed') {
    callSync(engine, 'publishFrame', context.clock.now());
  }
  const product = observeProduct(adapter, context, engine);
  const result = clone(observed.result);
  const hierarchy = result.status === 'committed'
    ? hierarchyElementFacts(engine, targetId)
    : hierarchyBefore;
  return {
    actual: {
      targetId,
      fromParentId: fromParentId ?? hierarchyBefore.parentId,
      toParentId,
      input: fingerprintValue(context, action.operands),
      before,
      product,
      result,
      diagnostic: clone(result.transactionDiagnostic ?? result.diagnostic ?? null),
      events: clone(observed.events),
      revisionDelta: sceneRevision(product) - sceneRevision(before),
      hierarchy,
      relationState: relationFacts(product.relations),
    },
  };
}

function groupAction(adapter, state, context, action) {
  assert(context.caseId === 'UPD-009', 'group case');
  const operands = exactOperands(action, [
    'actionId',
    'groupId',
    'preserveWorld',
    'targetIds',
  ]);
  assert(operands.preserveWorld === true, 'group preserveWorld');
  const targetIds = stringArray(operands.targetIds, 'group.targetIds');
  const groupId = stringValue(operands.groupId, 'group.groupId');
  const actionId = stringValue(operands.actionId, 'group.actionId');
  const engine = currentEngine(state, 'group');
  const before = observeProduct(adapter, context, engine);
  const observed = observeChangeEvents(engine, () => callSync(engine, 'transact', {
    strict: true,
    actionId,
    operations: [{
      op: 'group',
      targets: targetIds.map(elementTarget),
      value: { type: 'group', id: groupId },
    }],
  }));
  if (observed.result.status === 'committed') {
    callSync(engine, 'publishFrame', context.clock.now());
  }
  const product = observeProduct(adapter, context, engine);
  return {
    actual: {
      groupId,
      targetIds,
      input: fingerprintValue(context, action.operands),
      before,
      product,
      result: clone(observed.result),
      events: clone(observed.events),
      revisionDelta: sceneRevision(product) - sceneRevision(before),
      hierarchy: Object.fromEntries(targetIds.map((targetId) => [
        targetId,
        hierarchyElementFacts(engine, targetId),
      ])),
      selectionIds: clone(product.snapshot.selectionIds),
      relationState: relationFacts(product.relations),
    },
  };
}

function ungroupAction(adapter, state, context, action) {
  assert(context.caseId === 'UPD-009', 'ungroup case');
  const operands = exactOperands(action, ['actionId', 'groupId', 'preserveWorld']);
  assert(operands.preserveWorld === true, 'ungroup preserveWorld');
  const groupId = stringValue(operands.groupId, 'ungroup.groupId');
  const actionId = stringValue(operands.actionId, 'ungroup.actionId');
  const params = recordValue(context.fixtureParams, 'fixture params');
  const childId = stringValue(params.childId, 'fixture childId');
  const engine = currentEngine(state, 'ungroup');
  const before = observeProduct(adapter, context, engine);
  const observed = observeChangeEvents(engine, () => callSync(engine, 'transact', {
    strict: true,
    actionId,
    operations: [{
      op: 'ungroup',
      target: elementTarget(groupId),
      relationPolicy: 'reject',
    }],
  }));
  if (observed.result.status === 'committed') {
    callSync(engine, 'publishFrame', context.clock.now());
  }
  const product = observeProduct(adapter, context, engine);
  return {
    actual: {
      groupId,
      childId,
      input: fingerprintValue(context, action.operands),
      before,
      product,
      result: clone(observed.result),
      events: clone(observed.events),
      revisionDelta: sceneRevision(product) - sceneRevision(before),
      hierarchy: hierarchyElementFacts(engine, childId),
      selectionIds: clone(product.snapshot.selectionIds),
      relationState: relationFacts(product.relations),
    },
  };
}

async function retainTargetAction(adapter, state, context, action) {
  assert(context.caseId === 'UPD-001', 'retainTarget case');
  const operands = exactOperands(action, ['as', 'id', 'ownerId']);
  const bindingName = stringValue(operands.as, 'retainTarget.as');
  const target = componentTarget(
    stringValue(operands.ownerId, 'retainTarget.ownerId'),
    stringValue(operands.id, 'retainTarget.id'),
  );
  const engine = currentEngine(state, 'retainTarget');
  const snapshot = callSync(engine, 'resolveTarget', target);
  assert(snapshot !== null, 'retained target exists');
  state.retainedTargets.set(bindingName, snapshot);
  const observed = resolvedTargetObservation(snapshot);
  const input = fingerprintValue(context, action.operands);
  return {
    actual: {
      target: observed,
      input,
      product: observeProduct(adapter, context, engine),
    },
    bindings: { [bindingName]: { target: observed } },
    captureSource: { target: observed },
  };
}

async function replaceDatasetAction(adapter, state, context, action) {
  assert(context.caseId === 'UPD-001', 'replaceDataset case');
  const operands = exactOperands(action, ['datasetRef']);
  const datasetRef = stringValue(operands.datasetRef, 'replaceDataset.datasetRef');
  const engine = currentEngine(state, 'replaceDataset');
  const dataset = await context.resolveDataset(datasetRef);
  const inputBefore = context.fingerprint(dataset);
  const before = observeProduct(adapter, context, engine);
  const result = callSync(engine, 'loadDataset', dataset, { datasetRef });
  const inputAfter = context.fingerprint(dataset);
  state.datasets.set(datasetRef, { value: dataset, fingerprint: inputBefore });
  return {
    actual: {
      datasetRef,
      input: inputObservation(inputBefore, inputAfter),
      before,
      product: observeProduct(adapter, context, engine),
      result: clone(result),
    },
  };
}

function resolveTargetAction(adapter, state, context, action) {
  assert(context.caseId === 'UPD-001', 'resolveTarget case');
  const operands = exactOperands(action, ['id', 'ownerId']);
  const target = componentTarget(
    stringValue(operands.ownerId, 'resolveTarget.ownerId'),
    stringValue(operands.id, 'resolveTarget.id'),
  );
  const engine = currentEngine(state, 'resolveTarget');
  const snapshot = callSync(engine, 'resolveTarget', target);
  assert(snapshot !== null, 'resolved target exists');
  const currentTarget = resolvedTargetObservation(snapshot);
  return {
    actual: {
      currentTarget,
      input: fingerprintValue(context, action.operands),
      product: observeProduct(adapter, context, engine),
    },
    captureSource: { currentTarget },
  };
}

async function patchAction(adapter, state, context, action) {
  if (context.caseId === 'UPD-001') {
    const operands = exactOperands(action, [
      'allowStale',
      'changes',
      'expectedCode',
      'targetRef',
    ]);
    assert(operands.allowStale === true, 'stale patch is explicitly allowed');
    stringValue(operands.expectedCode, 'patch.expectedCode');
    const targetRef = stringValue(operands.targetRef, 'patch.targetRef');
    assert(context.getBinding(targetRef) !== undefined, 'stale target binding exists');
    const retained = state.retainedTargets.get(targetRef);
    assert(retained !== undefined, 'retained target authority exists');
    const engine = currentEngine(state, 'stale patch');
    const inputBefore = context.fingerprint(operands.changes);
    const before = observeProduct(adapter, context, engine);
    const result = callSync(engine, 'patchResolved', retained, clone(operands.changes));
    const inputAfter = context.fingerprint(operands.changes);
    const currentSnapshot = callSync(engine, 'resolveTarget', retained.target);
    return {
      actual: {
        targetRef,
        input: inputObservation(inputBefore, inputAfter),
        before,
        product: observeProduct(adapter, context, engine),
        result: clone(result),
        diagnostic: clone(result.diagnostic ?? null),
        currentTarget: currentSnapshot === null
          ? null
          : resolvedTargetObservation(currentSnapshot),
      },
    };
  }

  assert(context.caseId === 'UPD-004' || context.caseId === 'UPD-010', 'patch case');
  const operands = exactOperands(action, ['changes', 'targetId']);
  const targetId = stringValue(operands.targetId, 'patch.targetId');
  const engine = await ensureBaseline(adapter, state, context);
  if (context.caseId === 'UPD-004') selectGeometryTarget(state, engine, targetId);
  const inputBefore = context.fingerprint(operands.changes);
  const before = observeProduct(adapter, context, engine);
  const observed = observeChangeEvents(engine, () => callSync(
    engine,
    'patch',
    elementTarget(targetId),
    clone(operands.changes),
  ));
  const inputAfter = context.fingerprint(operands.changes);
  const product = observeProduct(adapter, context, engine);
  const record = currentRecord(engine, elementTarget(targetId));
  const geometryEntity = geometryEntityById(product.geometry, targetId);
  return {
    actual: {
      targetId,
      input: inputObservation(inputBefore, inputAfter),
      before,
      product,
      result: clone(observed.result),
      events: clone(observed.events),
      revisionDelta: sceneRevision(product) - sceneRevision(before),
      record,
      ...(context.caseId === 'UPD-004'
        ? geometryActionFacts(engine, targetId, product, geometryEntity)
        : { relationState: relationFacts(product.relations) }),
    },
  };
}

async function freezePatchAction(adapter, state, context, action) {
  assert(context.caseId === 'UPD-002', 'freezePatch case');
  const operands = exactOperands(action, ['patchId']);
  const patchId = stringValue(operands.patchId, 'freezePatch.patchId');
  assert(patchId === 'height', 'first frozen patch identity');
  const engine = await ensureBaseline(adapter, state, context);
  const params = recordValue(context.fixtureParams, 'fixture params');
  const target = componentTargetFromValue(params.target, 'fixture target');
  const sourcePatch = recordValue(params.patch, 'fixture patch');
  const sourceFingerprint = context.fingerprint(sourcePatch);
  const patch = deepFreeze(clone(sourcePatch));
  state.patches.set('height', patch);
  state.patches.set('empty', deepFreeze(clone(recordValue(params.emptyPatch, 'fixture emptyPatch'))));
  const baseline = mergeBaseline(engine, target);
  return {
    actual: {
      patchId,
      patch: clone(patch),
      frozen: isDeepFrozen(patch),
      input: inputObservation(sourceFingerprint, context.fingerprint(sourcePatch)),
      product: observeProduct(adapter, context, engine),
    },
    beforeCaptureSource: baseline,
    captureSource: baseline,
  };
}

function mergeAction(adapter, state, context, action) {
  assert(context.caseId === 'UPD-002', 'merge case');
  const operands = exactOperands(action, ['patchId', 'target']);
  const patchId = stringValue(operands.patchId, 'merge.patchId');
  const target = componentTargetFromValue(operands.target, 'merge.target');
  const patch = state.patches.get(patchId);
  assert(patch !== undefined, `frozen patch ${patchId}`);
  const engine = currentEngine(state, 'merge');
  const inputBefore = context.fingerprint(patch);
  const before = observeProduct(adapter, context, engine);
  const observed = observeChangeEvents(engine, () => callSync(engine, 'transact', {
    strict: true,
    actionId: `UPD-002:${action.index}:${patchId}`,
    operations: [{
      op: 'merge',
      target,
      changes: patchChanges(patch),
    }],
  }));
  const product = observeProduct(adapter, context, engine);
  const owner = currentRecord(engine, elementTarget(target.ownerId));
  const siblings = Array.isArray(owner?.components)
    ? clone(owner.components.filter((component) => component.id !== target.id))
    : [];
  return {
    actual: {
      patchId,
      target,
      input: inputObservation(inputBefore, context.fingerprint(patch)),
      before,
      product,
      result: clone(observed.result),
      events: clone(observed.events),
      revisionDelta: sceneRevision(product) - sceneRevision(before),
      record: currentRecord(engine, target),
      siblings,
    },
  };
}

async function replaceAction(adapter, state, context, action) {
  assert(context.caseId === 'UPD-003', 'replace case');
  const operands = recordValue(action.operands, 'replace operands');
  const acceptedKeys = Object.hasOwn(operands, 'valueRef')
    ? ['targetId', 'valueRef']
    : ['targetId', 'value'];
  assertExactKeys(operands, acceptedKeys, 'replace operands');
  const targetId = stringValue(operands.targetId, 'replace.targetId');
  const engine = await ensureBaseline(adapter, state, context);
  const params = recordValue(context.fixtureParams, 'fixture params');
  const value = Object.hasOwn(operands, 'valueRef')
    ? clone(params[stringValue(operands.valueRef, 'replace.valueRef')])
    : clone(operands.value);
  const inputBefore = context.fingerprint(value);
  const before = observeProduct(adapter, context, engine);
  const observed = observeChangeEvents(engine, () => callSync(engine, 'transact', {
    strict: true,
    actionId: `UPD-003:${action.index}`,
    operations: [{ op: 'replace', target: elementTarget(targetId), value }],
  }));
  const product = observeProduct(adapter, context, engine);
  const record = currentRecord(engine, elementTarget(targetId));
  const diagnostic = observed.result.transactionDiagnostic ?? observed.result.diagnostic ?? null;
  const output = {
    actual: {
      targetId,
      value: clone(value),
      input: inputObservation(inputBefore, context.fingerprint(value)),
      before,
      product,
      result: clone(observed.result),
      record,
      diagnostic: clone(diagnostic),
      publicationCount: observed.events.change.length,
    },
    captureSource: record === null ? { id: targetId } : { id: record.id },
  };
  return output;
}

async function relativePatchAction(adapter, state, context, action) {
  assert(context.caseId === 'UPD-004', 'relativePatch case');
  const operands = exactOperands(action, ['changes', 'targetId']);
  const targetId = stringValue(operands.targetId, 'relativePatch.targetId');
  const engine = await ensureBaseline(adapter, state, context);
  selectGeometryTarget(state, engine, targetId);
  const inputBefore = context.fingerprint(operands.changes);
  const before = observeProduct(adapter, context, engine);
  const result = callSync(
    engine,
    'relativePatch',
    elementTarget(targetId),
    clone(operands.changes),
  );
  const product = observeProduct(adapter, context, engine);
  const geometryEntity = geometryEntityById(product.geometry, targetId);
  return {
    actual: {
      targetId,
      input: inputObservation(inputBefore, context.fingerprint(operands.changes)),
      before,
      product,
      result: clone(result),
      record: currentRecord(engine, elementTarget(targetId)),
      ...geometryActionFacts(engine, targetId, product, geometryEntity),
    },
  };
}

async function resizeAroundOriginAction(adapter, state, context, action) {
  assert(context.caseId === 'UPD-004', 'resizeAroundOrigin case');
  const operands = exactOperands(action, ['origin', 'size', 'targetId']);
  const targetId = stringValue(operands.targetId, 'resizeAroundOrigin.targetId');
  const origin = stringValue(operands.origin, 'resizeAroundOrigin.origin');
  assert(origin === 'visible-center', 'resize origin');
  const engine = await ensureBaseline(adapter, state, context);
  selectGeometryTarget(state, engine, targetId);
  const before = observeProduct(adapter, context, engine);
  const beforeEntity = geometryEntityById(before.geometry, targetId);
  const centerBefore = visibleCenter(beforeEntity, currentRecord(engine, elementTarget(targetId)));
  const inputBefore = context.fingerprint(operands.size);
  const result = callSync(engine, 'resizeAroundOrigin', elementTarget(targetId), {
    origin,
    size: clone(operands.size),
  });
  const product = observeProduct(adapter, context, engine);
  const geometryEntity = geometryEntityById(product.geometry, targetId);
  const record = currentRecord(engine, elementTarget(targetId));
  const centerAfter = visibleCenter(geometryEntity, record);
  const worldBounds = clone(geometryEntity?.worldBounds ?? recordBounds(record));
  return {
    actual: {
      targetId,
      input: inputObservation(inputBefore, context.fingerprint(operands.size)),
      before,
      product,
      result: clone(result),
      record,
      centerBefore,
      centerAfter,
      worldBounds,
      ...geometryActionFacts(engine, targetId, product, geometryEntity),
    },
    captureSource: { worldBounds },
  };
}

async function bulkPatchAction(adapter, state, context, action) {
  assert(context.caseId === 'UPD-006', 'bulkPatch case');
  const operands = exactOperands(action, ['mode', 'patch', 'targets']);
  const mode = stringValue(operands.mode, 'bulkPatch.mode');
  assert(mode === 'strict' || mode === 'permissive', 'bulkPatch mode');
  const targets = stringArray(operands.targets, 'bulkPatch.targets');
  const patch = recordValue(operands.patch, 'bulkPatch.patch');
  const engine = await ensureBaseline(adapter, state, context);
  const inputBefore = context.fingerprint({ patch, targets });
  const before = observeProduct(adapter, context, engine);
  const observed = observeChangeEvents(engine, () => callSync(engine, 'bulkPatch', {
    strict: mode === 'strict',
    actionId: `UPD-006:${action.index}:${mode}`,
    targets: targets.map(elementTarget),
    changes: patchChanges(patch),
  }));
  const product = observeProduct(adapter, context, engine);
  const result = clone(observed.result);
  const rect = currentRecord(engine, elementTarget('rect-b'));
  const captureSource = action.index === 2
    ? { strictMixed: { 'rect-b': { x: recordCoordinate(rect, 'x') } } }
    : undefined;
  return {
    actual: {
      mode,
      targets,
      input: inputObservation(inputBefore, context.fingerprint({ patch, targets })),
      before,
      product,
      result,
      events: clone(observed.events),
      revisionDelta: sceneRevision(product) - sceneRevision(before),
      records: targetRecords(engine, targets),
    },
    ...(captureSource === undefined ? {} : { captureSource }),
  };
}

async function generateSyntheticSceneAction(adapter, state, context, action) {
  assert(context.caseId === 'UPD-007', 'generateSyntheticScene case');
  const operands = exactOperands(action, ['seed', 'size']);
  const size = positiveInteger(operands.size, 'generateSyntheticScene.size');
  const seed = nonNegativeInteger(operands.seed, 'generateSyntheticScene.seed');
  const engine = await ensureInitializedEngine(state, context);
  const dataset = adapter.createSyntheticScene({ caseId: 'UPD-007', size, seed });
  assert(Array.isArray(dataset), 'createSyntheticScene result');
  const inputBefore = context.fingerprint(dataset);
  const before = observeProduct(adapter, context, engine);
  const datasetRef = `synthetic:${size}:${seed}`;
  const result = callSync(engine, 'loadDataset', dataset, { datasetRef });
  callSync(engine, 'publishFrame', context.clock.now());
  const inputAfter = context.fingerprint(dataset);
  state.datasets.set(datasetRef, { value: dataset, fingerprint: inputBefore });
  state.baselineLoaded = true;
  return {
    actual: {
      size,
      seed,
      datasetRef,
      input: inputObservation(inputBefore, inputAfter),
      before,
      product: observeProduct(adapter, context, engine),
      result: clone(result),
    },
  };
}

function bulkOverlayAction(adapter, state, context, action) {
  assert(context.caseId === 'UPD-007', 'bulkOverlay case');
  const operands = recordValue(action.operands, 'bulkOverlay operands');
  const targetIds = Object.hasOwn(operands, 'targetCount')
    ? syntheticTargetIds(positiveInteger(operands.targetCount, 'bulkOverlay.targetCount'))
    : stringArray(operands.targetIds, 'bulkOverlay.targetIds');
  const acceptedKeys = Object.hasOwn(operands, 'targetCount')
    ? ['actionId', 'fields', 'strict', 'targetCount']
    : ['actionId', 'strict', 'targetIds'];
  assertExactKeys(operands, acceptedKeys, 'bulkOverlay operands');
  assert(operands.strict === true, 'bulkOverlay strict mode');
  const actionId = stringValue(operands.actionId, 'bulkOverlay.actionId');
  const fields = Object.hasOwn(operands, 'fields')
    ? stringArray(operands.fields, 'bulkOverlay.fields')
    : [];
  const engine = currentEngine(state, 'bulkOverlay');
  const inputBefore = context.fingerprint(operands);
  const before = observeProduct(adapter, context, engine);
  const beforeScene = sceneAuthority(before);
  const observed = observeChangeEvents(engine, () => callSync(engine, 'transact', {
    strict: true,
    actionId,
    operations: bulkOverlayOperations(targetIds, fields, action.index),
  }));
  const product = observeProduct(adapter, context, engine);
  const eventRevision = observed.events.change[0]?.revisions?.sceneRevision ?? null;
  state.lastBulkEventRevision = eventRevision;
  return {
    actual: {
      actionId,
      targetIds,
      fields,
      input: inputObservation(inputBefore, context.fingerprint(operands)),
      before,
      product,
      result: clone(observed.result),
      events: clone(observed.events),
      revisionDelta: sceneRevision(product) - sceneRevision(before),
      intermediatePublicationCount: observed.events.frame.length,
      queryRevision: product.snapshot.revisions.sceneRevision,
      eventRevision,
      sceneBefore: beforeScene,
      sceneAfter: sceneAuthority(product),
      semanticHashUnchanged:
        before.snapshot.semanticHash === product.snapshot.semanticHash,
    },
  };
}

async function publishFrameAction(adapter, state, context, action) {
  assert(
    context.caseId === 'UPD-007' ||
      context.caseId === 'UPD-013' ||
      context.caseId === 'UPD-014',
    'publishFrame case',
  );
  const operands = exactOperands(action, ['timeMs']);
  const timeMs = finiteNumber(operands.timeMs, 'publishFrame.timeMs');
  await context.clock.advanceTo(timeMs);
  const engine = currentEngine(state, 'publishFrame');
  const before = observeProduct(adapter, context, engine);
  const overlayBefore = context.caseId === 'UPD-013'
    ? clone(callSync(engine, 'liveOverlayProbe'))
    : null;
  const publicationEvents = [];
  const removePublication = context.caseId === 'UPD-013'
    ? callSync(engine, 'on', 'overlayPublished', (event) => {
        publicationEvents.push(clone(event));
      })
    : () => undefined;
  try {
    callSync(engine, 'publishFrame', timeMs);
  } finally {
    removePublication();
  }
  const product = observeProduct(adapter, context, engine);
  const frameRevision = product.snapshot.frameRevision;
  const captureSource = {
    frameRevision,
    invalid: { scene: product.snapshot.semanticHash },
  };
  return {
    actual: {
      timeMs,
      input: fingerprintValue(context, action.operands),
      before,
      product,
      result: { status: 'published', frameRevision },
      queryRevision: product.snapshot.revisions.sceneRevision,
      eventRevision: context.caseId === 'UPD-007' ? state.lastBulkEventRevision : null,
      ...(context.caseId === 'UPD-013'
        ? {
            overlayBefore,
            overlay: clone(callSync(engine, 'liveOverlayProbe')),
            publicationEvents,
          }
        : {}),
    },
    captureSource,
  };
}

async function captureObservationAction(adapter, state, context, action) {
  assert(context.caseId === 'UPD-008', 'capture-observation case');
  const operands = exactOperands(action, ['as', 'paths', 'source']);
  const bindingName = stringValue(operands.as, 'capture-observation.as');
  const paths = stringArray(operands.paths, 'capture-observation.paths');
  assert(paths.length > 0, 'capture-observation paths');
  const source = componentTargetFromValue(operands.source, 'capture-observation.source');
  const engine = await ensureBaseline(adapter, state, context);
  await settleUpdateResources(engine, context, false);
  const record = currentRecord(engine, source);
  assert(record !== null, 'capture source exists');
  const binding = projectDeclaredPaths({ [record.id]: record }, paths);
  return {
    actual: {
      source,
      binding: clone(binding),
      input: fingerprintValue(context, action.operands),
      product: observeProduct(adapter, context, engine),
    },
    bindings: { [bindingName]: binding },
    captureSource: binding,
  };
}

async function reconcileComponentsAction(adapter, state, context, action) {
  assert(context.caseId === 'UPD-008', 'reconcileComponents case');
  const operands = exactOperands(action, ['components', 'matchMode', 'ownerId']);
  const ownerId = stringValue(operands.ownerId, 'reconcileComponents.ownerId');
  const matchMode = stringValue(operands.matchMode, 'reconcileComponents.matchMode');
  assert(matchMode === 'replace', 'component matchMode');
  const reference = fixtureReference(operands.components, 'reconcileComponents.components');
  const components = clone(readFixtureReference(context.fixtureParams, reference));
  assert(Array.isArray(components), 'component fixture is an array');
  const engine = await ensureBaseline(adapter, state, context);
  const before = observeProduct(adapter, context, engine);
  const beforeComponents = componentCollectionFacts(engine, ownerId, allComponentIds(context));
  const inputBefore = context.fingerprint(components);
  const observed = observeChangeEvents(engine, () => callSync(engine, 'transact', {
    strict: true,
    actionId: 'UPD-008:components',
    operations: [{
      op: 'reconcile-components',
      target: elementTarget(ownerId),
      matchMode,
      components,
    }],
  }));
  await settleUpdateResources(engine, context, true);
  const product = observeProduct(adapter, context, engine);
  const componentFacts = componentCollectionFacts(engine, ownerId, allComponentIds(context));
  const removedIds = beforeComponents.order.filter((id) => !componentFacts.order.includes(id));
  const releaseExpectation = componentReleaseExpectation(beforeComponents, removedIds);
  const resources = resourceDelta(
    before,
    product,
    releaseExpectation,
    beforeComponents.renderLanes,
    componentFacts.renderLanes,
  );
  const removed = Object.fromEntries(removedIds.map((id) => [id, {
    logicalCount: requireComponentFact(componentFacts, id).logicalCount,
    resources,
    eventCallbacks: interactionOwnershipFacts(product).entityCallbackCount,
  }]));
  return {
    actual: {
      ownerId,
      input: inputObservation(inputBefore, context.fingerprint(components)),
      before,
      product,
      result: clone(observed.result),
      events: clone(observed.events),
      components: componentFacts,
      removed,
      resources,
      retainedDelta: resources.retainedDelta,
    },
  };
}

async function setComponentVisibilityAction(adapter, state, context, action) {
  assert(context.caseId === 'UPD-008', 'setComponentVisibility case');
  const operands = exactOperands(action, ['componentId', 'ownerId', 'show']);
  const ownerId = stringValue(operands.ownerId, 'setComponentVisibility.ownerId');
  const componentId = stringValue(operands.componentId, 'setComponentVisibility.componentId');
  assert(typeof operands.show === 'boolean', 'setComponentVisibility.show');
  const engine = await ensureBaseline(adapter, state, context);
  const before = observeProduct(adapter, context, engine);
  const beforeComponent = componentFact(engine, ownerId, componentId);
  const result = callSync(engine, 'transact', {
    strict: true,
    actionId: `UPD-008:${action.index}:${String(operands.show)}`,
    operations: [{
      op: 'merge',
      target: componentTarget(ownerId, componentId),
      changes: [{ path: ['show'], value: operands.show }],
    }],
  });
  await settleUpdateResources(engine, context, true);
  const product = observeProduct(adapter, context, engine);
  const component = componentFact(engine, ownerId, componentId);
  return {
    actual: {
      target: componentTarget(ownerId, componentId),
      show: operands.show,
      input: fingerprintValue(context, action.operands),
      before,
      product,
      result: clone(result),
      record: currentRecord(engine, componentTarget(ownerId, componentId)),
      component,
      componentVisual: component,
      currentTarget: currentRecord(engine, componentTarget(ownerId, componentId)),
      components: componentCollectionFacts(engine, ownerId, allComponentIds(context)),
      resources: resourceDelta(
        before,
        product,
        ZERO_RESOURCE_RELEASE,
        beforeComponent.renderLanes,
        component.renderLanes,
      ),
    },
  };
}

async function setVisibilityAction(adapter, state, context, action) {
  assert(context.caseId === 'UPD-010', 'setVisibility case');
  const operands = exactOperands(action, ['show', 'targetId']);
  const targetId = stringValue(operands.targetId, 'setVisibility.targetId');
  assert(typeof operands.show === 'boolean', 'setVisibility.show');
  const engine = await ensureBaseline(adapter, state, context);
  const before = observeProduct(adapter, context, engine);
  const result = callSync(engine, 'transact', {
    strict: true,
    actionId: `UPD-010:${action.index}:${String(operands.show)}`,
    operations: [{
      op: 'merge',
      target: elementTarget(targetId),
      changes: [{ path: ['show'], value: operands.show }],
    }],
  });
  const product = observeProduct(adapter, context, engine);
  return {
    actual: {
      targetId,
      show: operands.show,
      input: fingerprintValue(context, action.operands),
      before,
      product,
      result: clone(result),
      record: currentRecord(engine, elementTarget(targetId)),
      relationState: relationFacts(product.relations),
    },
  };
}

async function removeAction(adapter, state, context, action) {
  assert(context.caseId === 'UPD-010', 'remove case');
  const operands = exactOperands(action, ['targetId']);
  const targetId = stringValue(operands.targetId, 'remove.targetId');
  const engine = await ensureBaseline(adapter, state, context);
  const before = observeProduct(adapter, context, engine);
  const result = callSync(engine, 'transact', {
    strict: true,
    actionId: `UPD-010:${action.index}:remove`,
    operations: [{ op: 'remove', target: elementTarget(targetId), cascade: 'subtree' }],
  });
  const product = observeProduct(adapter, context, engine);
  return {
    actual: {
      targetId,
      input: fingerprintValue(context, action.operands),
      before,
      product,
      result: clone(result),
      record: currentRecord(engine, elementTarget(targetId)),
      relationState: relationFacts(product.relations),
    },
  };
}

async function startAsyncRevisionAction(adapter, state, context, action) {
  assert(context.caseId === 'UPD-011', 'startAsyncRevision case');
  const operands = exactOperands(action, ['requestId', 'revision', 'timeMs']);
  const requestId = stringValue(operands.requestId, 'startAsyncRevision.requestId');
  const revision = positiveInteger(operands.revision, 'startAsyncRevision.revision');
  const timeMs = finiteNumber(operands.timeMs, 'startAsyncRevision.timeMs');
  assert(!state.asyncRequests.has(requestId), 'async request identity must be unique');
  await context.clock.advanceTo(timeMs);
  const engine = await ensureInitializedEngine(state, context);
  attachAsyncMonitor(state, engine);
  const source = await resolveBaselineDataset(context);
  const before = observeProduct(adapter, context, engine);
  const inputFingerprint = context.fingerprint(source.dataset);
  const deferred = createDeferred();
  let released = false;
  state.asyncTemporaryAllocated += 1;
  const resultPromise = callSync(engine, 'submitDataset', {
    requestId,
    sourceRevision: revision,
    datasetRef: source.datasetRef,
    input: deferred.promise,
    release(result) {
      assert(!released, `async request ${requestId} released once`);
      released = true;
      state.asyncTemporaryReleased += 1;
      assert(result.requestId === requestId, `async request ${requestId} release identity`);
    },
  });
  resultPromise.catch(() => undefined);
  state.asyncRequests.set(requestId, {
    requestId,
    revision,
    source,
    inputFingerprint,
    deferred,
    resultPromise,
  });
  return {
    actual: {
      requestId,
      revision,
      timeMs,
      input: fingerprintValue(context, action.operands),
      before,
      product: observeProduct(adapter, context, engine),
      result: { status: 'started', requestId, revision },
      temporary: asyncTemporaryFacts(state),
    },
  };
}

async function completeAsyncRevisionAction(adapter, state, context, action) {
  assert(context.caseId === 'UPD-011', 'completeAsyncRevision case');
  const operands = exactOperands(action, ['requestId', 'timeMs']);
  const requestId = stringValue(operands.requestId, 'completeAsyncRevision.requestId');
  const timeMs = finiteNumber(operands.timeMs, 'completeAsyncRevision.timeMs');
  const request = state.asyncRequests.get(requestId);
  assert(request !== undefined, `async request ${requestId} exists`);
  await context.clock.advanceTo(timeMs);
  const engine = currentEngine(state, 'completeAsyncRevision');
  const eventCountBefore = state.asyncEventCount;
  const frameCountBefore = state.asyncFrameCount;
  request.deferred.resolve(request.source.dataset);
  const result = await request.resultPromise;
  const eventDelta = state.asyncEventCount - eventCountBefore;
  const frameDelta = state.asyncFrameCount - frameCountBefore;
  if (result.status === 'superseded') {
    state.asyncSupersededEventCount += eventDelta + frameDelta;
  }
  state.asyncRequests.delete(requestId);
  const inputAfter = context.fingerprint(request.source.dataset);
  return {
    actual: {
      requestId,
      revision: request.revision,
      timeMs,
      input: inputObservation(request.inputFingerprint, inputAfter),
      product: observeProduct(adapter, context, engine),
      result: clone(result),
      publicationEventDelta: eventDelta,
      frameDelta,
      published: {
        revisions: clone(state.asyncPublishedRevisions),
        requestIds: clone(state.asyncPublishedRequestIds),
      },
      supersededEventCount: state.asyncSupersededEventCount,
      postDestroy: {
        events: state.asyncPostDestroyEventCount,
        frames: state.asyncPostDestroyFrameCount,
      },
      temporary: asyncTemporaryFacts(state),
    },
  };
}

async function destroyAsyncRevisionAction(adapter, state, context, action) {
  assert(context.caseId === 'UPD-011', 'destroy async case');
  const operands = exactOperands(action, ['timeMs']);
  const timeMs = finiteNumber(operands.timeMs, 'destroy.timeMs');
  await context.clock.advanceTo(timeMs);
  const engine = currentEngine(state, 'destroy');
  const before = observeProduct(adapter, context, engine);
  const returned = await call(engine, 'destroy');
  state.asyncDestroyed = true;
  return {
    actual: {
      timeMs,
      input: fingerprintValue(context, action.operands),
      before,
      product: observeProduct(adapter, context, engine),
      result: { status: 'destroyed', returned },
      temporary: asyncTemporaryFacts(state),
    },
  };
}

async function setHighlightPolicyAction(adapter, state, context, action) {
  assert(context.caseId === 'UPD-012', 'setHighlightPolicy case');
  const operands = exactOperands(action, ['deEmphasisAlpha', 'ids']);
  const ids = stringArray(operands.ids, 'setHighlightPolicy.ids');
  const deEmphasisAlpha = finiteNumber(
    operands.deEmphasisAlpha,
    'setHighlightPolicy.deEmphasisAlpha',
  );
  assert(deEmphasisAlpha >= 0 && deEmphasisAlpha <= 1, 'de-emphasis alpha range');
  const engine = await ensureBaseline(adapter, state, context);
  const persisted = persistedDatasetParts(callSync(engine, 'exportDataset'));
  const before = observeProduct(adapter, context, engine);
  const result = callSync(engine, 'setPresentationPolicy', {
    highlightIds: ids,
    deEmphasisAlpha,
  });
  return {
    actual: {
      ids,
      deEmphasisAlpha,
      input: fingerprintValue(context, action.operands),
      before,
      product: observeProduct(adapter, context, engine),
      result: clone(result),
      presentation: clone(callSync(engine, 'presentationPolicyProbe')),
    },
    beforeCaptureSource: { persisted },
  };
}

async function setLayerVisibilityAction(adapter, state, context, action) {
  assert(context.caseId === 'UPD-012', 'setLayerVisibility case');
  const operands = exactOperands(action, ['id', 'show']);
  const id = stringValue(operands.id, 'setLayerVisibility.id');
  const show = booleanValue(operands.show, 'setLayerVisibility.show');
  const engine = await ensureBaseline(adapter, state, context);
  const before = observeProduct(adapter, context, engine);
  const current = callSync(engine, 'presentationPolicyProbe');
  const hiddenLayerIds = new Set(current.hiddenLayerIds);
  if (show) hiddenLayerIds.delete(id);
  else hiddenLayerIds.add(id);
  const result = callSync(engine, 'setPresentationPolicy', {
    highlightIds: current.highlightIds,
    deEmphasisAlpha: current.deEmphasisAlpha,
    hiddenLayerIds: [...hiddenLayerIds].sort(),
  });
  callSync(engine, 'publishFrame', context.clock.now());
  return {
    actual: {
      id,
      show,
      input: fingerprintValue(context, action.operands),
      before,
      product: observeProduct(adapter, context, engine),
      result: clone(result),
      presentation: clone(callSync(engine, 'presentationPolicyProbe')),
    },
  };
}

async function clearPresentationPolicyAction(adapter, state, context, action) {
  assert(context.caseId === 'UPD-012', 'clearPresentationPolicy case');
  exactOperands(action, []);
  const engine = await ensureBaseline(adapter, state, context);
  const before = observeProduct(adapter, context, engine);
  const result = callSync(engine, 'clearPresentationPolicy');
  callSync(engine, 'publishFrame', context.clock.now());
  const persisted = persistedDatasetParts(callSync(engine, 'exportDataset'));
  return {
    actual: {
      input: fingerprintValue(context, action.operands),
      before,
      product: observeProduct(adapter, context, engine),
      result: clone(result),
      presentation: clone(callSync(engine, 'presentationPolicyProbe')),
      persisted,
    },
  };
}

async function streamOverlayAction(adapter, state, context, action) {
  assert(context.caseId === 'UPD-013', 'streamOverlay case');
  const operands = exactOperands(action, ['count', 'revisionStart', 'seed', 'stepMs']);
  const revisionStart = positiveInteger(operands.revisionStart, 'streamOverlay.revisionStart');
  const count = positiveInteger(operands.count, 'streamOverlay.count');
  const stepMs = finiteNumber(operands.stepMs, 'streamOverlay.stepMs');
  const seed = nonNegativeInteger(operands.seed, 'streamOverlay.seed');
  assert(stepMs > 0, 'streamOverlay step');
  const params = recordValue(context.fixtureParams, 'streamOverlay fixture params');
  const startMs = finiteNumber(params.startMs, 'streamOverlay fixture startMs');
  const fields = stringArray(params.fields, 'streamOverlay fixture fields');
  assert(
    fields.join(',') === 'text,bar,tint,icon,show,size,padding',
    'streamOverlay declared field profile',
  );
  const engine = await ensureBaseline(adapter, state, context);
  const before = observeProduct(adapter, context, engine);
  const acceptedEvents = [];
  const removeAccepted = callSync(engine, 'on', 'overlayAccepted', (event) => {
    acceptedEvents.push(clone(event));
  });
  const results = [];
  try {
    for (let offset = 0; offset < count; offset += 1) {
      const sourceRevision = revisionStart + offset;
      await context.clock.advanceTo(startMs + stepMs * offset);
      const result = callSync(engine, 'applyLiveOverlay', {
        sourceRevision,
        payloadHash: `overlay-${seed}-${sourceRevision}`,
        transaction: {
          strict: true,
          recordHistory: false,
          actionId: `UPD-013:${sourceRevision}`,
          operations: liveOverlayOperations(sourceRevision, seed),
        },
      });
      assert(result.status === 'accepted', `overlay revision ${sourceRevision} accepted`);
      results.push(clone(result));
    }
  } finally {
    removeAccepted();
  }
  const overlay = callSync(engine, 'liveOverlayProbe');
  return {
    actual: {
      revisionStart,
      count,
      stepMs,
      seed,
      input: fingerprintValue(context, action.operands),
      before,
      product: observeProduct(adapter, context, engine),
      result: { status: 'streamed', count },
      results,
      acceptedEvents,
      overlay: clone(overlay),
    },
  };
}

async function snapshotAction(adapter, state, context, action) {
  assert(context.caseId === 'UPD-014', 'snapshot case');
  const operands = exactOperands(action, ['paths']);
  const paths = stringArray(operands.paths, 'snapshot.paths');
  const engine = await ensureBaseline(adapter, state, context);
  const product = observeProduct(adapter, context, engine);
  const snapshot = {
    scene: clone(product.dataset),
    selection: clone(product.snapshot.selectionIds),
    history: clone(product.history),
    ids: stableDatasetIds(callSync(engine, 'exportDataset')),
  };
  return {
    actual: {
      paths,
      input: fingerprintValue(context, action.operands),
      product,
      result: { status: 'snapshotted' },
      snapshot: clone(snapshot),
    },
    captureSource: snapshot,
  };
}

async function replaceExternalDependencyAction(adapter, state, context, action) {
  assert(context.caseId === 'UPD-014', 'replaceExternalDependency case');
  const operands = exactOperands(action, ['dependencyId', 'revision']);
  const dependencyId = stringValue(
    operands.dependencyId,
    'replaceExternalDependency.dependencyId',
  );
  const revision = stringValue(operands.revision, 'replaceExternalDependency.revision');
  const engine = await ensureBaseline(adapter, state, context);
  const before = observeProduct(adapter, context, engine);
  const result = callSync(engine, 'replaceExternalDependency', dependencyId, revision);
  return {
    actual: {
      dependencyId,
      revision,
      input: fingerprintValue(context, action.operands),
      before,
      product: observeProduct(adapter, context, engine),
      result: clone(result),
      dependencies: clone(callSync(engine, 'externalDependencyProbe')),
    },
  };
}

async function refreshAction(adapter, state, context, action) {
  assert(context.caseId === 'UPD-014', 'refresh case');
  const operands = exactOperands(action, ['recordHistory', 'targets']);
  const recordHistory = booleanValue(operands.recordHistory, 'refresh.recordHistory');
  const targets = refreshTargets(operands.targets);
  const engine = await ensureBaseline(adapter, state, context);
  const before = observeProduct(adapter, context, engine);
  const events = [];
  const remove = callSync(engine, 'on', 'semanticRefreshed', (event) => {
    events.push(clone(event));
  });
  let result;
  try {
    result = callSync(engine, 'refreshSemantic', {
      targets,
      recordHistory,
      strict: true,
    });
  } finally {
    remove();
  }
  return {
    actual: {
      targets: clone(targets),
      recordHistory,
      input: fingerprintValue(context, action.operands),
      before,
      product: observeProduct(adapter, context, engine),
      result: clone(result),
      refreshEvents: events,
      ids: stableDatasetIds(callSync(engine, 'exportDataset')),
    },
    captureSource: {
      revision: result.revisions.sceneRevision,
    },
  };
}

function runInvalidOperationCase(
  engine,
  context,
  declarationValue,
  strict,
  baselineDataset,
) {
  const declaration = recordValue(declarationValue, 'invalid operation declaration');
  const id = stringValue(declaration.id, 'invalid operation ID');
  const operation = stringValue(declaration.operation, `invalid operation ${id} type`);
  const before = isolatedFailureSnapshot(engine, context);
  let input;
  let inputBeforeFingerprint = null;
  let result = null;
  let diagnostic = null;

  try {
    if (operation === 'load' && Object.hasOwn(declaration, 'value')) {
      input = clone(declaration.value);
      inputBeforeFingerprint = context.fingerprint(input);
      result = callSync(engine, 'loadDataset', input, {
        datasetRef: `invalid:${id}`,
        strict,
      });
    } else if (operation === 'load' && Object.hasOwn(declaration, 'ids')) {
      const ids = stringArray(declaration.ids, `invalid operation ${id} IDs`);
      input = ids.map((elementId) => ({
        type: 'rect',
        id: elementId,
        size: { width: 10, height: 10 },
      }));
      inputBeforeFingerprint = context.fingerprint(input);
      result = callSync(engine, 'loadDataset', input, {
        datasetRef: `invalid:${id}`,
        strict,
      });
    } else if (operation === 'load') {
      const source = stringValue(
        declaration.source,
        `invalid operation ${id} source`,
      );
      const target = stringValue(
        declaration.target,
        `invalid operation ${id} target`,
      );
      input = clone(baselineDataset);
      const relation = input.find((entry) => entry?.type === 'relations');
      assert(isRecord(relation), `invalid operation ${id} relation fixture`);
      relation.links = [{ source, target }];
      inputBeforeFingerprint = context.fingerprint(input);
      result = callSync(engine, 'loadDataset', input, {
        datasetRef: `invalid:${id}`,
        strict,
      });
    } else if (operation === 'merge') {
      const target = stringValue(
        declaration.target,
        `invalid operation ${id} target`,
      );
      const path = arrayValue(
        declaration.path,
        `invalid operation ${id} path`,
      ).map((segment, index) => stringValue(
        segment,
        `invalid operation ${id} path[${index}]`,
      ));
      input = {
        strict,
        recordHistory: false,
        actionId: `ERR-001:${id}`,
        operations: [{
          op: 'merge',
          target: elementTarget(target),
          changes: [{ path, value: clone(declaration.value) }],
        }],
      };
      inputBeforeFingerprint = context.fingerprint(input);
      result = callSync(engine, 'transact', input);
    } else if (operation === 'transaction') {
      const target = stringValue(
        declaration.target,
        `invalid operation ${id} target`,
      );
      const paths = arrayValue(
        declaration.paths,
        `invalid operation ${id} paths`,
      ).map((pathValue, pathIndex) => arrayValue(
        pathValue,
        `invalid operation ${id} path ${pathIndex}`,
      ).map((segment, segmentIndex) => stringValue(
        segment,
        `invalid operation ${id} path ${pathIndex}[${segmentIndex}]`,
      )));
      input = {
        strict,
        recordHistory: false,
        actionId: `ERR-001:${id}`,
        operations: [{
          op: 'merge',
          target: elementTarget(target),
          changes: paths.map((path, index) => ({
            path,
            value: index === 0 ? { x: 1 } : 2,
          })),
        }],
      };
      inputBeforeFingerprint = context.fingerprint(input);
      result = callSync(engine, 'transact', input);
    } else {
      throw new Error(`Unsupported invalid operation ${operation}`);
    }
    diagnostic = publicDiagnosticFromResult(result);
  } catch (error) {
    diagnostic = publicDiagnosticFromError(error);
  }

  assert(input !== undefined, `invalid operation ${id} input`);
  assert(inputBeforeFingerprint !== null, `invalid operation ${id} input baseline`);
  const after = isolatedFailureSnapshot(engine, context);
  return deepFreeze({
    id,
    operation,
    input: inputObservation(
      inputBeforeFingerprint,
      context.fingerprint(input),
    ),
    result: result === null ? null : clone(result),
    diagnostic,
    before,
    after,
    atomic:
      sceneRevisionFromSnapshot(before.snapshot) ===
        sceneRevisionFromSnapshot(after.snapshot) &&
      before.fingerprint === after.fingerprint &&
      before.historyDepth === after.historyDepth &&
      JSON.stringify(before.selectionIds) === JSON.stringify(after.selectionIds),
  });
}

function journeyLiveOverlayOperations(target, changesValue) {
  const changes = recordValue(changesValue, 'journey live overlay changes');
  assertExactKeys(changes, ['components', 'element'], 'journey live overlay changes');
  const element = recordValue(changes.element, 'journey live overlay element');
  assertExactKeys(element, ['padding', 'show', 'size'], 'journey live overlay element');
  const elementSize = recordValue(element.size, 'journey live overlay element size');
  assertExactKeys(elementSize, ['height', 'width'], 'journey live overlay element size');
  const components = recordValue(
    changes.components,
    'journey live overlay components',
  );
  assertExactKeys(
    components,
    ['bar', 'icon', 'label'],
    'journey live overlay components',
  );
  const bar = recordValue(components.bar, 'journey live overlay bar');
  assertExactKeys(bar, ['size'], 'journey live overlay bar');
  const barSize = recordValue(bar.size, 'journey live overlay bar size');
  assertExactKeys(barSize, ['height', 'width'], 'journey live overlay bar size');
  const label = recordValue(components.label, 'journey live overlay label');
  assertExactKeys(label, ['text'], 'journey live overlay label');
  const icon = recordValue(components.icon, 'journey live overlay icon');
  assertExactKeys(icon, ['source', 'tint'], 'journey live overlay icon');
  return [
    {
      op: 'merge',
      target: elementTarget(target),
      changes: [
        { path: ['show'], value: booleanValue(element.show, 'overlay element show') },
        {
          path: ['size', 'width'],
          value: finiteNumber(elementSize.width, 'overlay element width'),
        },
        {
          path: ['size', 'height'],
          value: finiteNumber(elementSize.height, 'overlay element height'),
        },
        {
          path: ['padding'],
          value: finiteNumber(element.padding, 'overlay element padding'),
        },
      ],
    },
    {
      op: 'merge',
      target: componentTarget(target, 'bar'),
      changes: [
        {
          path: ['size', 'width'],
          value: finiteNumber(barSize.width, 'overlay bar width'),
        },
        {
          path: ['size', 'height'],
          value: finiteNumber(barSize.height, 'overlay bar height'),
        },
      ],
    },
    {
      op: 'merge',
      target: componentTarget(target, 'label'),
      changes: [{
        path: ['text'],
        value: stringValue(label.text, 'overlay label text'),
      }],
    },
    {
      op: 'merge',
      target: componentTarget(target, 'icon'),
      changes: [
        {
          path: ['source'],
          value: stringValue(icon.source, 'overlay icon source'),
        },
        {
          path: ['tint'],
          value: stringValue(icon.tint, 'overlay icon tint'),
        },
      ],
    },
  ];
}

function journeyBarOverlayOperations(value) {
  const record = recordValue(value, 'journey bar overlay value');
  assertExactKeys(record, ['size'], 'journey bar overlay value');
  const size = recordValue(record.size, 'journey bar overlay size');
  assertExactKeys(size, ['height', 'width'], 'journey bar overlay size');
  return [{
    op: 'merge',
    target: componentTarget('item-a', 'bar'),
    changes: [
      {
        path: ['size', 'width'],
        value: finiteNumber(size.width, 'journey bar width'),
      },
      {
        path: ['size', 'height'],
        value: finiteNumber(size.height, 'journey bar height'),
      },
    ],
  }];
}

function journeyOverlayFacts(engine) {
  const item = currentRecord(engine, elementTarget('item-a'));
  const bar = currentRecord(engine, componentTarget('item-a', 'bar'));
  const label = currentRecord(engine, componentTarget('item-a', 'label'));
  const icon = currentRecord(engine, componentTarget('item-a', 'icon'));
  const barVisual = callSync(engine, 'componentVisualProbe', {
    ownerId: 'item-a',
    componentId: 'bar',
  });
  const labelVisual = callSync(engine, 'componentVisualProbe', {
    ownerId: 'item-a',
    componentId: 'label',
  });
  const iconVisual = callSync(engine, 'componentVisualProbe', {
    ownerId: 'item-a',
    componentId: 'icon',
  });
  const snapshot = callSync(engine, 'snapshot');
  const interaction = callSync(engine, 'interactionModeProbe');
  const unresolvedIntentCount = [
    item,
    bar,
    label,
    icon,
    barVisual?.semantic,
    labelVisual?.semantic,
    iconVisual?.semantic,
  ].filter((entry) => entry === null || entry === undefined).length;
  return deepFreeze({
    rootIds: clone(snapshot.rootIds),
    item,
    components: {
      bar: { record: bar, visual: clone(barVisual) },
      label: { record: label, visual: clone(labelVisual) },
      icon: { record: icon, visual: clone(iconVisual) },
    },
    selectedIds: clone(snapshot.selectionIds),
    mode: stringValue(interaction.activeState, 'journey interaction mode'),
    unresolvedIntentCount,
  });
}

async function ensureJourneyBaseline(adapter, state, context) {
  const engine = await ensureInitializedEngine(state, context);
  if (state.baselineLoaded) return engine;
  const datasetRef = journeyDatasetRef(context);
  const dataset = await context.resolveDataset(datasetRef);
  const fingerprint = context.fingerprint(dataset);
  callSync(engine, 'loadDataset', dataset, { datasetRef });
  const product = observeProduct(adapter, context, engine);
  state.datasets.set(datasetRef, { value: dataset, fingerprint });
  state.baselineLoaded = true;
  state.journeyBaselineFingerprint = product.dataset.fingerprint;
  return engine;
}

function attachJourneyOverlayMonitor(state, engine) {
  if (state.overlayMonitorAttached) return;
  state.overlayMonitorAttached = true;
  for (const event of ['overlayAccepted', 'overlayPublished']) {
    callSync(engine, 'on', event, () => {
      state.overlayEventCount += 1;
      if (state.overlayDestroyed) state.overlayPostDestroyEventCount += 1;
    });
  }
  callSync(engine, 'on', 'frame', () => {
    state.overlayFrameCount += 1;
    if (state.overlayDestroyed) state.overlayPostDestroyFrameCount += 1;
  });
}

function journeyPostDestroyFacts(state) {
  return deepFreeze({
    events: state.overlayPostDestroyEventCount,
    frames: state.overlayPostDestroyFrameCount,
    callbacks:
      state.overlayPostDestroyEventCount + state.overlayPostDestroyFrameCount,
  });
}

function journeyDatasetRef(context) {
  const params = recordValue(context.fixtureParams, 'journey fixture params');
  return stringValue(params.datasetRef, 'journey datasetRef');
}

async function initializeIsolatedJourneyEngine(engine, caseId) {
  const snapshot = callSync(engine, 'snapshot');
  if (snapshot.lifecycle !== 'new') return;
  await call(engine, 'initialize', {
    instanceId: `contract-${caseId.toLowerCase()}-isolated`,
    width: 960,
    height: 540,
    pixelRatio: 1,
    strategy: 'mesh',
    preference: 'webgl',
    antialias: true,
    background: 0xf7f8fa,
    powerPreference: 'high-performance',
  });
}

function isolatedFailureSnapshot(engine, context) {
  const snapshot = clone(callSync(engine, 'snapshot'));
  const destroyed =
    snapshot.lifecycle === 'destroying' || snapshot.lifecycle === 'destroyed';
  const dataset = destroyed ? [] : callSync(engine, 'exportDataset');
  const history = destroyed
    ? { undoDepth: snapshot.historyDepth, redoDepth: 0 }
    : callSync(engine, 'historyState');
  return deepFreeze({
    snapshot,
    fingerprint: context.fingerprint(dataset),
    historyDepth: nonNegativeInteger(
      history.undoDepth,
      'isolated failure history depth',
    ),
    selectionIds: clone(snapshot.selectionIds),
  });
}

function sceneRevisionFromSnapshot(snapshotValue) {
  const snapshot = recordValue(snapshotValue, 'scene revision snapshot');
  const revisions = recordValue(snapshot.revisions, 'scene revision stamp');
  return nonNegativeInteger(revisions.sceneRevision, 'scene revision');
}

function publicDiagnosticFromError(error) {
  const candidate = isRecord(error?.diagnostic) ? error.diagnostic : error;
  if (!isRecord(candidate)) {
    return deepFreeze({
      code: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
      category: null,
      operation: null,
      datasetPath: null,
    });
  }
  return deepFreeze({
    code: typeof candidate.code === 'string'
      ? candidate.code
      : error instanceof Error
        ? error.name
        : 'UNKNOWN_ERROR',
    category: typeof candidate.category === 'string' ? candidate.category : null,
    operation: typeof candidate.operation === 'string' ? candidate.operation : null,
    datasetPath:
      typeof candidate.datasetPath === 'string' ? candidate.datasetPath : null,
  });
}

function publicDiagnosticFromResult(resultValue) {
  if (!isRecord(resultValue)) return null;
  const candidate = isRecord(resultValue.transactionDiagnostic)
    ? resultValue.transactionDiagnostic
    : isRecord(resultValue.diagnostic)
      ? resultValue.diagnostic
      : null;
  if (candidate === null) return null;
  return deepFreeze({
    code: typeof candidate.code === 'string' ? candidate.code : null,
    category: typeof candidate.category === 'string' ? candidate.category : null,
    operation: typeof candidate.operation === 'string' ? candidate.operation : null,
    datasetPath: typeof candidate.datasetPath === 'string'
      ? candidate.datasetPath
      : typeof candidate.path === 'string'
        ? candidate.path
        : null,
  });
}

async function ensureBaseline(adapter, state, context) {
  const engine = await ensureInitializedEngine(state, context);
  if (!state.baselineLoaded) {
    const profiles = recordValue(context.fixtureProfiles, 'fixture profiles');
    const profile = profiles[BASELINE_PROFILE];
    const datasetRef = isRecord(profile)
      ? stringValue(profile.datasetRef, `${BASELINE_PROFILE}.datasetRef`)
      : 'all-kinds-scene';
    const dataset = await context.resolveDataset(datasetRef);
    const fingerprint = context.fingerprint(dataset);
    callSync(engine, 'loadDataset', dataset, { datasetRef });
    state.datasets.set(datasetRef, { value: dataset, fingerprint });
    state.baselineLoaded = true;
    if (context.caseId === 'UPD-008') {
      await settleUpdateResources(engine, context, true);
    }
  }
  return engine;
}

async function ensureInitializedEngine(state, context) {
  const engine = state.engine ?? await context.ensureMainEngine();
  state.engine = engine;
  const snapshot = callSync(engine, 'snapshot');
  if (snapshot.lifecycle === 'new') {
    const instanceId = `contract-${context.caseId.toLowerCase()}`;
    if (context.caseId === 'UPD-008') callSync(engine, 'registerAssets', instanceId);
    await call(engine, 'initialize', {
      instanceId,
      width: 960,
      height: 540,
      pixelRatio: 1,
      strategy: 'mesh',
      preference: 'webgl',
      antialias: true,
      background: 0xf7f8fa,
      powerPreference: 'high-performance',
    });
  }
  return engine;
}

async function ensureViewColumnSession(state, context, session) {
  assert(context.caseId === 'CSM-014', 'view column session case');
  const engine = await context.ensureSessionEngine(session);
  state.engine = engine;
  const snapshot = callSync(engine, 'snapshot');
  if (snapshot.lifecycle === 'new') {
    await initializeIsolatedJourneyEngine(
      engine,
      `${context.caseId}-session-${session}`,
    );
    const datasetRef = journeyDatasetRef(context);
    const dataset = await context.resolveDataset(datasetRef);
    const fingerprint = context.fingerprint(dataset);
    callSync(engine, 'loadDataset', dataset, { datasetRef });
    callSync(engine, 'applyInteractionModeOperation', {
      op: 'replace',
      state: 'select',
    });
    state.datasets.set(datasetRef, { value: dataset, fingerprint });
    state.baselineLoaded = true;
    state.journeyBaselineFingerprint = fingerprint;
  }
  return engine;
}

function applyViewColumn(engine, context, column, values) {
  const transaction = {
    strict: true,
    recordHistory: false,
    actionId: `CSM-014:${column}`,
    operations: [
      {
        op: 'merge',
        target: componentTarget('item-a', 'bar'),
        changes: [
          { path: ['show'], value: values.show },
          { path: ['tint'], value: values.tint },
          { path: ['size', 'width'], value: values.barSize.width },
          { path: ['size', 'height'], value: values.barSize.height },
        ],
      },
      {
        op: 'merge',
        target: componentTarget('item-a', 'label'),
        changes: [
          { path: ['show'], value: values.show },
          { path: ['tint'], value: values.tint },
          { path: ['text'], value: values.text },
        ],
      },
    ],
  };
  const before = context.fingerprint(transaction);
  const result = callSync(engine, 'transact', transaction);
  assert(
    before === context.fingerprint(transaction),
    'view column transaction input remains immutable',
  );
  assert(result.status === 'committed', `view column ${column} transaction committed`);
  return result;
}

function viewColumnName(context, value) {
  const column = stringValue(value, 'view column');
  const params = recordValue(context.fixtureParams, 'CSM-014 fixture params');
  const columns = stringArray(params.columns, 'CSM-014 columns');
  assert(columns.includes(column), `unsupported view column ${column}`);
  return column;
}

function viewColumnValues(value) {
  const values = recordValue(value, 'view column values');
  assertExactKeys(values, ['barSize', 'show', 'text', 'tint'], 'view column values');
  const barSize = recordValue(values.barSize, 'view column bar size');
  assertExactKeys(barSize, ['height', 'width'], 'view column bar size');
  return deepFreeze({
    text: stringValue(values.text, 'view column text'),
    tint: stringValue(values.tint, 'view column tint'),
    show: booleanValue(values.show, 'view column show'),
    barSize: {
      width: finiteNumber(barSize.width, 'view column bar width'),
      height: finiteNumber(barSize.height, 'view column bar height'),
    },
  });
}

function currentEngine(state, operation) {
  assert(state.engine !== null, `${operation} engine exists`);
  return state.engine;
}

function observeProduct(adapter, context, engine) {
  const directSnapshot = clone(callSync(engine, 'snapshot'));
  const resources = clone(adapter.resourceProbe({ caseId: context.caseId, engine }));
  const resourceEngine = isRecord(resources.engine) ? resources.engine : null;
  const snapshot = isRecord(resourceEngine?.snapshot)
    ? clone(resourceEngine.snapshot)
    : directSnapshot;
  const semantic = isRecord(resourceEngine?.semantic)
    ? clone(resourceEngine.semantic)
    : clone(callSync(engine, 'semanticProbe'));
  const destroyed = snapshot.lifecycle === 'destroyed' || snapshot.lifecycle === 'destroying';
  const dataset = destroyed ? Object.freeze([]) : callSync(engine, 'exportDataset');
  const geometry = destroyed ? null : clone(callSync(engine, 'geometryProbe'));
  const relations = destroyed ? null : clone(callSync(engine, 'relationProbe'));
  const sceneImages = destroyed ? null : clone(callSync(engine, 'sceneImageProbe'));
  const interactionOwnership = destroyed
    ? null
    : resourceEngine !== null && Object.hasOwn(resourceEngine, 'interactionOwnership')
      ? clone(resourceEngine.interactionOwnership)
      : clone(callSync(engine, 'interactionOwnershipProbe'));
  const history = destroyed
    ? { undoDepth: snapshot.historyDepth, redoDepth: 0, capacity: 0 }
    : clone(callSync(engine, 'historyState'));
  const product = deepFreeze({
    snapshot,
    semantic,
    dataset: {
      fingerprint: context.fingerprint(dataset),
      semanticHash: snapshot.semanticHash,
      rootIds: clone(snapshot.rootIds),
      rootCount: dataset.length,
    },
    geometry,
    relations,
    sceneImages,
    interactionOwnership,
    history,
    resources,
  });
  if (context.caseId === 'UPD-008') validateUpdateProductProbe(product);
  return product;
}

function observeChangeEvents(engine, operation) {
  const change = [];
  const frame = [];
  const removeChange = callSync(engine, 'on', 'change', (event) => change.push(clone(event)));
  const removeFrame = callSync(engine, 'on', 'frame', (event) => frame.push(clone(event)));
  try {
    return { result: operation(), events: { change, frame } };
  } finally {
    removeChange();
    removeFrame();
  }
}

function geometryActionFacts(engine, targetId, product, geometryEntity) {
  const worldCenter = visibleCenter(
    geometryEntity,
    currentRecord(engine, elementTarget(targetId)),
  );
  const screenCenter = Array.isArray(geometryEntity?.screenBounds)
    ? boundsCenter(geometryEntity.screenBounds)
    : worldCenter;
  const hit = screenCenter === null
    ? null
    : callSync(engine, 'hitTest', { x: screenCenter[0], y: screenCenter[1] });
  return {
    currentTarget: currentRecord(engine, elementTarget(targetId)),
    geometryEntity: clone(geometryEntity),
    hit: { point: screenCenter, id: hit },
    selectionOverlay: clone(product.geometry?.selectionOverlay ?? null),
  };
}

function boundsCenter(bounds) {
  assert(
    Array.isArray(bounds) && bounds.length === 4 && bounds.every(Number.isFinite),
    'bounds center input',
  );
  return Object.freeze([
    bounds[0] + bounds[2] / 2,
    bounds[1] + bounds[3] / 2,
  ]);
}

function mergeBaseline(engine, target) {
  const record = currentRecord(engine, target);
  assert(record !== null, 'merge baseline target exists');
  const owner = currentRecord(engine, elementTarget(target.ownerId));
  assert(owner !== null && Array.isArray(owner.components), 'merge baseline owner components');
  return deepFreeze({
    siblings: clone(owner.components.filter((component) => component.id !== target.id)),
    target: clone(record),
  });
}

function currentRecord(engine, target) {
  const snapshot = callSync(engine, 'resolveTarget', target);
  return snapshot === null ? null : clone(snapshot.value);
}

function hierarchyElementFacts(engine, id) {
  const dataset = callSync(engine, 'exportDataset');
  assert(Array.isArray(dataset), 'hierarchy dataset');
  const found = findHierarchyElement(dataset, id, null, identityAffine());
  assert(found !== null, `hierarchy element ${id}`);
  return deepFreeze({
    id,
    parentId: found.parentId,
    worldPosition: [cleanNumber(found.worldAffine[4]), cleanNumber(found.worldAffine[5])],
    record: clone(found.record),
  });
}

function hierarchyChildCount(engine, parentId) {
  const dataset = callSync(engine, 'exportDataset');
  assert(Array.isArray(dataset), 'hierarchy dataset');
  const found = findHierarchyElement(dataset, parentId, null, identityAffine());
  assert(found !== null, `hierarchy parent ${parentId}`);
  assert(found.record.type === 'group', `hierarchy parent ${parentId} group`);
  assert(Array.isArray(found.record.children), `hierarchy parent ${parentId} children`);
  return found.record.children.length;
}

function findHierarchyElement(values, id, parentId, parentAffine) {
  for (const value of values) {
    if (!isRecord(value)) continue;
    const worldAffine = multiplyAffine(parentAffine, elementLocalAffine(value));
    if (value.id === id) return { record: value, parentId, worldAffine };
    if (value.type !== 'group' || !Array.isArray(value.children)) continue;
    const nested = findHierarchyElement(value.children, id, String(value.id), worldAffine);
    if (nested !== null) return nested;
  }
  return null;
}

function elementLocalAffine(record) {
  const attrs = isRecord(record.attrs) ? record.attrs : {};
  const x = numberOr(attrs.x, 0);
  const y = numberOr(attrs.y, 0);
  const angle = typeof attrs.angle === 'number' && Number.isFinite(attrs.angle)
    ? attrs.angle
    : typeof attrs.rotation === 'number' && Number.isFinite(attrs.rotation)
      ? attrs.rotation * 180 / Math.PI
      : 0;
  const scaleX = numberOr(attrs.scaleX, 1);
  const scaleY = numberOr(attrs.scaleY, 1);
  const radians = angle * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [
    cosine * scaleX,
    sine * scaleX,
    -sine * scaleY,
    cosine * scaleY,
    x,
    y,
  ];
}

function identityAffine() {
  return [1, 0, 0, 1, 0, 0];
}

function multiplyAffine(left, right) {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ];
}

function cleanNumber(value) {
  const normalized = Math.abs(value) <= 1e-10 ? 0 : value;
  return Number(normalized.toFixed(10));
}

function numberOr(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function targetRecords(engine, ids) {
  return Object.fromEntries(ids.map((id) => [id, currentRecord(engine, elementTarget(id))]));
}

function componentCollectionFacts(engine, ownerId, ids) {
  const owner = currentRecord(engine, elementTarget(ownerId));
  assert(owner !== null && Array.isArray(owner.components), 'component collection owner');
  const order = owner.components.map((component) => component.id);
  const byId = Object.fromEntries(ids.map((id) => [id, componentFact(engine, ownerId, id)]));
  return deepFreeze({
    order,
    byId,
    renderLanes: consistentComponentRenderLanes(byId),
  });
}

function componentFact(engine, ownerId, componentId) {
  const record = currentRecord(engine, componentTarget(ownerId, componentId));
  const visual = callSync(engine, 'componentVisualProbe', { ownerId, componentId });
  if (record === null && visual === null) {
    return deepFreeze({
      id: componentId,
      logicalCount: 0,
      show: null,
      renderObjectCount: 0,
      logicalIdentity: null,
      orphanedRenderer: false,
      visual: null,
    });
  }
  const facts = componentVisualFacts(visual, `component ${ownerId}/${componentId}`);
  return deepFreeze({
    id: componentId,
    logicalCount: record === null ? 0 : 1,
    show: record === null ? null : booleanValue(record.show, `component ${componentId}.show`),
    renderObjectCount: facts.renderObjectCount,
    logicalIdentity: facts.logicalIdentity,
    orphanedRenderer: record === null,
    rendererPaint: facts.rendererPaint,
    renderLanes: facts.renderLanes,
    visual: clone(visual),
  });
}

function componentVisualFacts(value, label) {
  const visual = recordValue(value, `${label} visual probe`);
  const availability = recordValue(visual.availability, `${label} availability`);
  assert(availability.surface === true, `${label} surface availability`);
  assert(availability.renderLanes === true, `${label} render lanes availability`);
  const publication = recordValue(visual.publication, `${label} publication`);
  assert(publication.rendererFacts === 'current', `${label} renderer publication must be current`);
  const geometry = recordValue(visual.geometry, `${label} geometry`);
  const visible = booleanValue(geometry.visible, `${label} geometry visibility`);
  const logicalIdentity = stringValue(visual.logicalIdentity, `${label} logicalIdentity`);
  const entityId = stringValue(visual.entityId, `${label} entityId`);
  const lanes = validateRenderLaneSnapshot(visual.renderLanes, `${label} render lanes`);
  if (!visible) {
    const rendererPaint = availability.rendererPaint === true
      ? recordValue(visual.rendererPaint, `${label} hidden renderer paint`)
      : null;
    if (rendererPaint === null) {
      assert(availability.rendererPaint === false, `${label} hidden renderer paint availability`);
      assert(visual.rendererPaint === null, `${label} hidden renderer paint absence`);
    } else {
      assert(rendererPaint.entityId === entityId, `${label} hidden renderer entity identity`);
      assert(
        nonNegativeInteger(rendererPaint.renderObjectCount, `${label} hidden renderObjectCount`) === 0,
        `${label} hidden renderer object absence (${String(rendererPaint.renderObjectCount)})`,
      );
      assert(
        nonNegativeInteger(rendererPaint.primitiveCount, `${label} hidden primitiveCount`) === 0,
        `${label} hidden primitive absence (${String(rendererPaint.primitiveCount)})`,
      );
      const laneRole = stringValue(rendererPaint.lane, `${label} hidden renderer lane`);
      assert(isRecord(lanes[laneRole]), `${label} hidden renderer lane exists`);
    }
    if (visual.sceneImage !== null) {
      validateSceneImageRecord(visual.sceneImage, `${label} scene image`);
    }
    return deepFreeze({
      logicalIdentity,
      renderObjectCount: 0,
      rendererPaint: rendererPaint === null ? null : clone(rendererPaint),
      renderLanes: lanes,
    });
  }
  assert(availability.rendererPaint === true, `${label} visible renderer paint availability`);
  const rendererPaint = recordValue(visual.rendererPaint, `${label} renderer paint`);
  const renderObjectCount = nonNegativeInteger(
    rendererPaint.renderObjectCount,
    `${label} renderObjectCount`,
  );
  const primitiveCount = nonNegativeInteger(
    rendererPaint.primitiveCount,
    `${label} primitiveCount`,
  );
  assert(rendererPaint.entityId === entityId, `${label} renderer entity identity`);
  const laneRole = stringValue(rendererPaint.lane, `${label} renderer lane`);
  const lane = lanes[laneRole];
  assert(isRecord(lane), `${label} renderer lane exists`);
  assert(
    renderObjectCount <= lane.renderObjectCount,
    `${label} render object count exceeds aggregate lane`,
  );
  assert(
    primitiveCount <= lane.visiblePrimitiveCount,
    `${label} primitive count exceeds aggregate lane`,
  );
  if (visual.sceneImage !== null) validateSceneImageRecord(visual.sceneImage, `${label} scene image`);
  return deepFreeze({
    logicalIdentity,
    renderObjectCount,
    rendererPaint: clone(rendererPaint),
    renderLanes: lanes,
  });
}

function consistentComponentRenderLanes(byId) {
  let baseline = null;
  for (const [id, factsValue] of Object.entries(byId)) {
    const facts = recordValue(factsValue, `component facts ${id}`);
    if (facts.visual === null) continue;
    const lanes = validateRenderLaneSnapshot(
      facts.renderLanes,
      `component ${id} aggregate render lanes`,
    );
    if (baseline === null) baseline = lanes;
    else assert(
      JSON.stringify(lanes) === JSON.stringify(baseline),
      `component ${id} aggregate render lanes disagree`,
    );
  }
  assert(baseline !== null, 'component collection aggregate render lanes exist');
  return baseline;
}

function requireComponentFact(collection, id) {
  const facts = collection.byId[id];
  assert(isRecord(facts), `component facts ${id}`);
  return facts;
}

function componentReleaseExpectation(beforeComponents, removedIds) {
  let targetCount = 0;
  let activeTargetCount = 0;
  let bindingCount = 0;
  let leaseCount = 0;
  let acquisitionCount = 0;
  let rendererObjectCount = 0;
  let consumerCount = 0;
  let assetLaneRendererObjectCount = 0;
  const bindingKeys = new Set();
  const removedIdSet = new Set(removedIds);
  const survivingActiveBindingKeys = new Set();
  for (const [id, componentValue] of Object.entries(beforeComponents.byId)) {
    if (removedIdSet.has(id)) continue;
    const component = recordValue(componentValue, `surviving component ${id}`);
    if (component.visual === null) continue;
    const visual = recordValue(component.visual, `surviving component ${id} visual`);
    if (visual.sceneImage === null) continue;
    const image = validateSceneImageRecord(
      visual.sceneImage,
      `surviving component ${id} image`,
    );
    if (image.active === true) {
      survivingActiveBindingKeys.add(
        stringValue(image.bindingKey, `surviving component ${id} bindingKey`),
      );
    }
  }
  for (const id of removedIds) {
    const component = requireComponentFact(beforeComponents, id);
    const visual = recordValue(component.visual, `removed component ${id} visual`);
    const renderRole = stringValue(visual.renderRole, `removed component ${id} renderRole`);
    const assetRole = renderRole === 'background-asset' || renderRole === 'content-asset';
    if (!assetRole) {
      assert(visual.sceneImage === null, `removed non-asset component ${id} scene image`);
      continue;
    }
    assert(visual.sceneImage !== null, `removed asset component ${id} scene image baseline`);
    const image = validateSceneImageRecord(visual.sceneImage, `removed component ${id} image`);
    assert(image.active === true, `removed asset component ${id} was active`);
    assert(image.state === 'resolved', `removed asset component ${id} was resolved`);
    assert(image.attachmentState === 'current', `removed asset component ${id} attachment current`);
    const publication = recordValue(
      image.publication,
      `removed asset component ${id} image publication`,
    );
    assert(
      publication.rendererFacts === 'current',
      `removed asset component ${id} image publication current`,
    );
    const componentRendererObjects = nonNegativeInteger(
      component.renderObjectCount,
      `removed component ${id} renderObjectCount`,
    );
    assert(componentRendererObjects > 0, `removed asset component ${id} renderer baseline`);
    const imageRendererObjects = nonNegativeInteger(
      image.renderObjectCount,
      `removed component ${id} image renderObjectCount`,
    );
    assert(imageRendererObjects > 0, `removed asset component ${id} image renderer baseline`);
    assert(
      componentRendererObjects === imageRendererObjects,
      `removed asset component ${id} renderer count correlation`,
    );
    rendererObjectCount += imageRendererObjects;
    assetLaneRendererObjectCount += imageRendererObjects;
    targetCount += 1;
    activeTargetCount += 1;
    const bindingKey = stringValue(image.bindingKey, `removed component ${id} bindingKey`);
    if (!bindingKeys.has(bindingKey) && !survivingActiveBindingKeys.has(bindingKey)) {
      bindingKeys.add(bindingKey);
      bindingCount += 1;
      leaseCount += 1;
      acquisitionCount += 1;
    }
    const imageConsumers = nonNegativeInteger(
      image.bindingConsumerCount,
      `removed component ${id} bindingConsumerCount`,
    );
    assert(imageConsumers > 0, `removed asset component ${id} consumer baseline`);
    consumerCount += 1;
  }
  return deepFreeze({
    targetCount,
    activeTargetCount,
    bindingCount,
    leaseCount,
    acquisitionCount,
    rendererObjectCount,
    consumerCount,
    assetLaneRendererObjectCount,
  });
}

function allComponentIds(context) {
  const params = recordValue(context.fixtureParams, 'fixture params');
  const initial = stringArray(params.initialOrder, 'fixture initialOrder');
  const next = stringArray(params.nextOrder, 'fixture nextOrder');
  return [...new Set([...initial, ...next])];
}

function relationFacts(probe) {
  const relations = Array.isArray(probe?.relations) ? probe.relations : [];
  const segments = relations.map((relation) => ({
    id: relation.id,
    relationId: relation.relationId ?? relation.id,
    key: relation.key ?? `${relation.sourceId}>${relation.targetId}`,
    sourceId: relation.sourceId,
    targetId: relation.targetId,
    visible: relation.visible ?? true,
    startWorld: clone(relation.worldEndpoints?.[0] ?? null),
    endWorld: clone(relation.worldEndpoints?.[1] ?? null),
    bounds: clone(relation.worldBounds ?? null),
  }));
  const counts = {};
  for (const segment of segments) counts[segment.key] = (counts[segment.key] ?? 0) + 1;
  return deepFreeze({
    revision: probe?.revision ?? null,
    revisionLag: probe?.revisionLag ?? null,
    segments,
    visibleSegments: segments.filter(({ visible }) => visible).map(({ key }) => key),
    counts,
    omitted: clone(probe?.omittedRelations ?? []),
  });
}

function resourceDelta(
  before,
  after,
  releaseExpectation = ZERO_RESOURCE_RELEASE,
  beforeRenderLanes = null,
  afterRenderLanes = null,
) {
  const beforeCounts = publicResourceCounts(before, beforeRenderLanes);
  const afterCounts = publicResourceCounts(after, afterRenderLanes);
  assertReleaseWithinBefore(beforeCounts, releaseExpectation);
  assert(
    beforeCounts.subscriptionCount === afterCounts.subscriptionCount,
    'UPD-008 subscription count must remain unchanged',
  );
  const violations = deepFreeze({
    canvasGrowth: positiveRemainder(afterCounts.canvasCount, beforeCounts.canvasCount),
    subscriptionGrowth: positiveRemainder(
      afterCounts.subscriptionCount,
      beforeCounts.subscriptionCount,
    ),
    subscriptionDuplicates: afterCounts.subscriptionDuplicateCount,
    rootBindingGrowth: positiveRemainder(
      afterCounts.rootBindingCount,
      beforeCounts.rootBindingCount,
    ),
    entityCallbacks: afterCounts.entityCallbackCount,
    pendingWork: afterCounts.pendingWork,
    retainedImageTargets: retainedAfterRelease(
      beforeCounts.targetCount,
      afterCounts.targetCount,
      releaseExpectation.targetCount,
    ),
    retainedActiveImageTargets: retainedAfterRelease(
      beforeCounts.activeTargetCount,
      afterCounts.activeTargetCount,
      releaseExpectation.activeTargetCount,
    ),
    retainedBindings: retainedAfterRelease(
      beforeCounts.bindingCount,
      afterCounts.bindingCount,
      releaseExpectation.bindingCount,
    ),
    retainedLeases: retainedAfterRelease(
      beforeCounts.leaseCount,
      afterCounts.leaseCount,
      releaseExpectation.leaseCount,
    ),
    retainedAcquisitions: retainedAfterRelease(
      beforeCounts.assetAcquisitionCount,
      afterCounts.assetAcquisitionCount,
      releaseExpectation.acquisitionCount,
    ),
    retainedRendererObjects: retainedAfterRelease(
      beforeCounts.rendererObjectCount,
      afterCounts.rendererObjectCount,
      releaseExpectation.rendererObjectCount,
    ),
    retainedConsumers: retainedAfterRelease(
      beforeCounts.consumerCount,
      afterCounts.consumerCount,
      releaseExpectation.consumerCount,
    ),
    retainedAssetLaneObjects: retainedAfterRelease(
      beforeCounts.assetLaneRendererObjectCount,
      afterCounts.assetLaneRendererObjectCount,
      releaseExpectation.assetLaneRendererObjectCount,
    ),
    pendingBindings: afterCounts.pendingBindingCount,
    pendingSettlements: afterCounts.pendingSettlementCount,
    pendingReleases: afterCounts.pendingReleaseCount,
    assetPending: afterCounts.assetPendingCount,
    assetCleanupPending: afterCounts.assetCleanupPendingCount,
  });
  return deepFreeze({
    before: beforeCounts,
    after: afterCounts,
    expectedRelease: clone(releaseExpectation),
    violations,
    retainedDelta: Object.values(violations).reduce((sum, value) => sum + value, 0),
  });
}

function publicResourceCounts(product, renderLanesValue = null) {
  const snapshot = recordValue(product.snapshot, 'UPD-008 snapshot');
  const resources = recordValue(snapshot.resources, 'UPD-008 snapshot resources');
  const rendering = recordValue(resources.rendering, 'UPD-008 rendering resources');
  const assets = recordValue(resources.assets, 'UPD-008 asset resources');
  const subscriptions = recordValue(resources.subscriptions, 'UPD-008 subscriptions');
  const sceneImages = sceneImageProbeFacts(product.sceneImages);
  const interaction = interactionOwnershipFacts(product);
  assert(assets.destroyed === false, 'UPD-008 asset session must be alive');
  stringValue(assets.instanceId, 'UPD-008 asset instanceId');
  const leaseCount = nonNegativeInteger(assets.leaseCount, 'UPD-008 asset leaseCount');
  const assetPendingCount = nonNegativeInteger(
    assets.pendingCount,
    'UPD-008 asset pendingCount',
  );
  const assetAcquisitionCount = nonNegativeInteger(
    assets.acquisitionCount,
    'UPD-008 asset acquisitionCount',
  );
  assert(
    assetAcquisitionCount === leaseCount + assetPendingCount,
    'UPD-008 asset acquisitionCount must equal leases plus pending acquisitions',
  );
  assert(assetPendingCount === 0, 'UPD-008 asset acquisition must be settled');
  assert(
    leaseCount === sceneImages.resolvedBindingCount,
    'UPD-008 resolved image bindings must equal asset session leases',
  );
  assert(
    assetAcquisitionCount === sceneImages.resolvedBindingCount,
    'UPD-008 resolved image bindings must equal asset session acquisitions',
  );
  const assetCleanupPendingCount = nonNegativeInteger(
    assets.cleanupPendingCount,
    'UPD-008 asset cleanupPendingCount',
  );
  assert(assetCleanupPendingCount === 0, 'UPD-008 asset cleanup must be finalized');
  const subscriptionCount = nonNegativeInteger(
    subscriptions.active,
    'UPD-008 subscriptionCount',
  );
  const subscriptionDuplicateCount = nonNegativeInteger(
    subscriptions.duplicates,
    'UPD-008 subscription duplicate count',
  );
  assert(subscriptionDuplicateCount === 0, 'UPD-008 duplicate subscriptions');
  assert(interaction.rootBindingCount === 6, 'UPD-008 root binding count must remain six');
  assert(interaction.entityCallbackCount === 0, 'UPD-008 entity callbacks must remain zero');
  const pendingWork = nonNegativeInteger(snapshot.pendingWork, 'UPD-008 pendingWork');
  assert(pendingWork === 0, 'UPD-008 product work must be settled');
  assert(sceneImages.pendingBindingCount === 0, 'UPD-008 image bindings must be settled');
  assert(sceneImages.pendingSettlementCount === 0, 'UPD-008 image settlements must finish');
  assert(sceneImages.pendingReleaseCount === 0, 'UPD-008 image releases must finish');
  const renderCommandCount = nonNegativeInteger(
    rendering.commandCount,
    'UPD-008 renderCommandCount',
  );
  const visiblePrimitiveCount = nonNegativeInteger(
    rendering.visiblePrimitiveCount,
    'UPD-008 visiblePrimitiveCount',
  );
  let assetLaneRendererObjectCount = sceneImages.rendererObjectCount;
  if (renderLanesValue !== null) {
    const renderLanes = validateRenderLaneSnapshot(
      renderLanesValue,
      'UPD-008 aggregate render lanes',
    );
    const laneRenderObjectCount = RENDER_LANE_ROLES.reduce(
      (sum, role) => sum + renderLanes[role].renderObjectCount,
      0,
    );
    assert(
      laneRenderObjectCount === renderCommandCount,
      'UPD-008 aggregate lanes must equal global renderer object count',
    );
    assetLaneRendererObjectCount =
      renderLanes['background-assets'].renderObjectCount +
      renderLanes['content-assets'].renderObjectCount;
    assert(
      assetLaneRendererObjectCount === sceneImages.rendererObjectCount,
      'UPD-008 asset render lanes must equal scene image renderer objects',
    );
  }
  return deepFreeze({
    canvasCount: nonNegativeInteger(resources.canvasCount, 'UPD-008 canvasCount'),
    renderCommandCount,
    visiblePrimitiveCount,
    subscriptionCount,
    subscriptionDuplicateCount,
    pendingWork,
    leaseCount,
    assetPendingCount,
    assetAcquisitionCount,
    assetCleanupPendingCount,
    assetLaneRendererObjectCount,
    ...interaction,
    ...sceneImages,
  });
}

function validateUpdateProductProbe(product) {
  publicResourceCounts(product);
}

function interactionOwnershipFacts(product) {
  const interaction = recordValue(
    product.interactionOwnership,
    'UPD-008 interaction ownership',
  );
  return deepFreeze({
    rootBindingCount: nonNegativeInteger(
      interaction.rootBindingCount,
      'UPD-008 root binding count',
    ),
    entityCallbackCount: nonNegativeInteger(
      interaction.entityCallbackCount,
      'UPD-008 entity callback count',
    ),
  });
}

function sceneImageProbeFacts(value) {
  const probe = recordValue(value, 'UPD-008 scene image probe');
  const images = recordValue(probe.images, 'UPD-008 scene images');
  const targetCount = nonNegativeInteger(probe.targetCount, 'UPD-008 scene image targetCount');
  const activeTargetCount = nonNegativeInteger(
    probe.activeTargetCount,
    'UPD-008 scene image activeTargetCount',
  );
  let rendererObjectCount = 0;
  const consumersByBinding = new Map();
  const targetsByBinding = new Map();
  const activeBindingKeys = new Set();
  const resolvedBindingKeys = new Set();
  const stateByBinding = new Map();
  let observedActiveTargetCount = 0;
  for (const [entityId, image] of Object.entries(images)) {
    const facts = validateSceneImageRecord(image, `UPD-008 scene image ${entityId}`);
    const imageRenderObjectCount = nonNegativeInteger(
      facts.renderObjectCount,
      `UPD-008 scene image ${entityId} renderObjectCount`,
    );
    const imageConsumerCount = nonNegativeInteger(
      facts.bindingConsumerCount,
      `UPD-008 scene image ${entityId} bindingConsumerCount`,
    );
    rendererObjectCount += imageRenderObjectCount;
    if (facts.active === true) {
      observedActiveTargetCount += 1;
      const bindingKey = stringValue(
        facts.bindingKey,
        `UPD-008 scene image ${entityId} bindingKey`,
      );
      activeBindingKeys.add(bindingKey);
      targetsByBinding.set(bindingKey, (targetsByBinding.get(bindingKey) ?? 0) + 1);
      assert(
        facts.attachmentState === 'current',
        `UPD-008 scene image ${entityId} current attachment`,
      );
      const publication = recordValue(
        facts.publication,
        `UPD-008 scene image ${entityId} publication`,
      );
      assert(
        publication.rendererFacts === 'current',
        `UPD-008 scene image ${entityId} renderer publication current`,
      );
      assert(imageRenderObjectCount > 0, `UPD-008 scene image ${entityId} renderer object`);
      assert(imageConsumerCount > 0, `UPD-008 scene image ${entityId} binding consumer`);
      const state = stringValue(facts.state, `UPD-008 scene image ${entityId} state`);
      assert(
        state === 'resolved' || state === 'failed',
        `UPD-008 scene image ${entityId} must be settled`,
      );
      const previousState = stateByBinding.get(bindingKey);
      assert(
        previousState === undefined || previousState === state,
        `UPD-008 binding ${bindingKey} state consistency`,
      );
      stateByBinding.set(bindingKey, state);
      const placeholderCount = nonNegativeInteger(
        facts.placeholderCount,
        `UPD-008 scene image ${entityId} placeholderCount`,
      );
      const role = stringValue(facts.role, `UPD-008 scene image ${entityId} role`);
      if (state === 'resolved') {
        resolvedBindingKeys.add(bindingKey);
        assert(role === 'image', `UPD-008 resolved image ${entityId} render role`);
        assert(placeholderCount === 0, `UPD-008 resolved image ${entityId} placeholder`);
      } else {
        assert(role === 'asset-placeholder', `UPD-008 failed image ${entityId} placeholder role`);
        assert(
          placeholderCount === imageRenderObjectCount,
          `UPD-008 failed image ${entityId} placeholder count`,
        );
      }
      const previousConsumers = consumersByBinding.get(bindingKey);
      assert(
        previousConsumers === undefined || previousConsumers === imageConsumerCount,
        `UPD-008 binding ${bindingKey} consumer count consistency`,
      );
      consumersByBinding.set(bindingKey, imageConsumerCount);
    } else {
      assert(imageRenderObjectCount === 0, `UPD-008 inactive image ${entityId} renderer object`);
      assert(imageConsumerCount === 0, `UPD-008 inactive image ${entityId} binding consumer`);
      assert(
        nonNegativeInteger(
          facts.placeholderCount,
          `UPD-008 inactive image ${entityId} placeholderCount`,
        ) === 0,
        `UPD-008 inactive image ${entityId} placeholder`,
      );
    }
  }
  assert(targetCount === Object.keys(images).length, 'UPD-008 scene image target count mismatch');
  assert(
    activeTargetCount === observedActiveTargetCount,
    'UPD-008 scene image active target count mismatch',
  );
  const bindingCount = nonNegativeInteger(probe.bindingCount, 'UPD-008 bindingCount');
  assert(
    bindingCount === activeBindingKeys.size,
    'UPD-008 scene image binding count mismatch',
  );
  for (const [bindingKey, activeConsumers] of targetsByBinding) {
    assert(
      consumersByBinding.get(bindingKey) === activeConsumers,
      `UPD-008 binding ${bindingKey} active consumer mismatch`,
    );
  }
  return deepFreeze({
    targetCount,
    activeTargetCount,
    bindingCount,
    resolvedBindingCount: resolvedBindingKeys.size,
    pendingBindingCount: nonNegativeInteger(
      probe.pendingBindingCount,
      'UPD-008 pendingBindingCount',
    ),
    pendingSettlementCount: nonNegativeInteger(
      probe.pendingSettlementCount,
      'UPD-008 pendingSettlementCount',
    ),
    pendingReleaseCount: nonNegativeInteger(
      probe.pendingReleaseCount,
      'UPD-008 pendingReleaseCount',
    ),
    rendererObjectCount,
    consumerCount: [...consumersByBinding.values()].reduce((sum, count) => sum + count, 0),
  });
}

function validateSceneImageRecord(value, label) {
  const image = recordValue(value, label);
  assert(typeof image.active === 'boolean', `${label} active`);
  stringValue(image.bindingKey, `${label} bindingKey`);
  stringValue(image.state, `${label} state`);
  stringValue(image.attachmentState, `${label} attachmentState`);
  nonNegativeInteger(image.renderObjectCount, `${label} renderObjectCount`);
  nonNegativeInteger(image.bindingConsumerCount, `${label} bindingConsumerCount`);
  return image;
}

const ZERO_RESOURCE_RELEASE = Object.freeze({
  targetCount: 0,
  activeTargetCount: 0,
  bindingCount: 0,
  leaseCount: 0,
  acquisitionCount: 0,
  rendererObjectCount: 0,
  consumerCount: 0,
  assetLaneRendererObjectCount: 0,
});

const RENDER_LANE_ROLES = Object.freeze([
  'background-geometry',
  'background-assets',
  'ordinary-geometry',
  'relations-dynamic',
  'content-assets',
  'text',
  'interaction-overlay',
]);

function validateRenderLaneSnapshot(value, label) {
  const lanes = recordValue(value, label);
  assertExactKeys(lanes, RENDER_LANE_ROLES, label);
  const normalized = {};
  for (const role of RENDER_LANE_ROLES) {
    const lane = recordValue(lanes[role], `${label} ${role}`);
    assert(lane.role === role, `${label} ${role} role`);
    const labelValue = stringValue(lane.label, `${label} ${role} label`);
    normalized[role] = {
      role,
      label: labelValue,
      renderObjectCount: nonNegativeInteger(
        lane.renderObjectCount,
        `${label} ${role} renderObjectCount`,
      ),
      visiblePrimitiveCount: nonNegativeInteger(
        lane.visiblePrimitiveCount,
        `${label} ${role} visiblePrimitiveCount`,
      ),
    };
  }
  return deepFreeze(normalized);
}

function assertReleaseWithinBefore(before, release) {
  for (const [releaseKey, beforeKey] of [
    ['targetCount', 'targetCount'],
    ['activeTargetCount', 'activeTargetCount'],
    ['bindingCount', 'bindingCount'],
    ['leaseCount', 'leaseCount'],
    ['acquisitionCount', 'assetAcquisitionCount'],
    ['rendererObjectCount', 'rendererObjectCount'],
    ['consumerCount', 'consumerCount'],
    ['assetLaneRendererObjectCount', 'assetLaneRendererObjectCount'],
  ]) {
    const expected = nonNegativeInteger(
      release[releaseKey],
      `UPD-008 expected release ${releaseKey}`,
    );
    assert(
      expected <= before[beforeKey],
      `UPD-008 expected release ${releaseKey} exceeds before count`,
    );
  }
}

function retainedAfterRelease(before, after, released) {
  const allowedAfter = Math.max(0, before - released);
  return Math.max(0, after - allowedAfter);
}

function positiveRemainder(after, before) {
  return Math.max(0, after - before);
}

async function settleUpdateResources(engine, context, publishFrame) {
  if (context.caseId !== 'UPD-008') return;
  await call(engine, 'settleSceneImages');
  if (publishFrame) {
    callSync(engine, 'publishFrame', context.clock.now());
    await call(engine, 'settleSceneImages');
  }
}

function sceneAuthority(product) {
  return deepFreeze({
    fingerprint: product.dataset.fingerprint,
    semanticHash: product.dataset.semanticHash,
    sceneRevision: sceneRevision(product),
  });
}

function sceneRevision(product) {
  return nonNegativeInteger(product.snapshot.revisions.sceneRevision, 'scene revision');
}

function attachAsyncMonitor(state, engine) {
  if (state.asyncMonitorAttached) return;
  state.asyncMonitorAttached = true;
  callSync(engine, 'on', 'sceneCommitted', () => {
    state.asyncEventCount += 1;
    if (state.asyncDestroyed) state.asyncPostDestroyEventCount += 1;
  });
  callSync(engine, 'on', 'drawComplete', (event) => {
    state.asyncEventCount += 1;
    if (state.asyncDestroyed) {
      state.asyncPostDestroyEventCount += 1;
      return;
    }
    state.asyncPublishedRevisions.push(
      positiveInteger(event.sourceRevision, 'drawComplete source revision'),
    );
    state.asyncPublishedRequestIds.push(
      stringValue(event.requestId, 'drawComplete request ID'),
    );
  });
  callSync(engine, 'on', 'frame', () => {
    state.asyncFrameCount += 1;
    if (state.asyncDestroyed) state.asyncPostDestroyFrameCount += 1;
  });
}

async function resolveBaselineDataset(context) {
  const profiles = recordValue(context.fixtureProfiles, 'fixture profiles');
  const profile = profiles[BASELINE_PROFILE];
  const datasetRef = isRecord(profile)
    ? stringValue(profile.datasetRef, `${BASELINE_PROFILE}.datasetRef`)
    : 'all-kinds-scene';
  return {
    datasetRef,
    dataset: await context.resolveDataset(datasetRef),
  };
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function asyncTemporaryFacts(state) {
  return {
    allocated: state.asyncTemporaryAllocated,
    released: state.asyncTemporaryReleased,
    unreleased: Math.max(
      0,
      state.asyncTemporaryAllocated - state.asyncTemporaryReleased,
    ),
  };
}

function persistedDatasetParts(datasetValue) {
  assert(Array.isArray(datasetValue), 'persisted dataset array');
  const elements = [];
  const links = [];
  for (const record of datasetValue) {
    if (record?.type === 'relations') links.push(clone(record));
    else elements.push(clone(record));
  }
  return deepFreeze({ elements, links });
}

function stableDatasetIds(datasetValue) {
  assert(Array.isArray(datasetValue), 'stable ID dataset array');
  const ids = [];
  const visit = (elements) => {
    for (const element of elements) {
      const record = recordValue(element, 'stable ID element');
      const id = stringValue(record.id, 'stable ID element identity');
      ids.push(id);
      if (record.type === 'item') {
        appendComponentIds(ids, id, record.components);
      } else if (record.type === 'grid') {
        const item = recordValue(record.item, 'stable ID grid item');
        appendComponentIds(ids, id, item.components);
      } else if (record.type === 'group') {
        assert(Array.isArray(record.children), 'stable ID group children');
        visit(record.children);
      }
    }
  };
  visit(datasetValue);
  return Object.freeze(ids.sort());
}

function appendComponentIds(ids, ownerId, componentsValue) {
  assert(Array.isArray(componentsValue), 'stable ID components');
  for (const component of componentsValue) {
    const record = recordValue(component, 'stable ID component');
    ids.push(`${ownerId}/${stringValue(record.id, 'stable component ID')}`);
  }
}

function liveOverlayOperations(sourceRevision, seed) {
  const variant = (sourceRevision + seed) >>> 0;
  return [
    {
      op: 'merge',
      target: elementTarget('item-a'),
      changes: [
        { path: ['size', 'width'], value: 100 + sourceRevision },
        { path: ['size', 'height'], value: 80 + sourceRevision % 7 },
        { path: ['padding'], value: 2 + sourceRevision % 5 },
      ],
    },
    {
      op: 'merge',
      target: elementTarget('rect-b'),
      changes: [{ path: ['show'], value: sourceRevision % 2 === 1 }],
    },
    {
      op: 'merge',
      target: componentTarget('item-a', 'bar'),
      changes: [
        { path: ['size', 'height'], value: 8 + sourceRevision % 31 },
        {
          path: ['tint'],
          value: variant % 2 === 0 ? '#22aa66ff' : '#ee8844ff',
        },
      ],
    },
    {
      op: 'merge',
      target: componentTarget('item-a', 'label'),
      changes: [
        { path: ['text'], value: `Overlay ${seed}:${sourceRevision}` },
        {
          path: ['tint'],
          value: variant % 2 === 0 ? '#113355ff' : '#552211ff',
        },
      ],
    },
    {
      op: 'merge',
      target: componentTarget('item-a', 'icon'),
      changes: [
        { path: ['source'], value: variant % 2 === 0 ? 'warning' : 'wifi' },
        {
          path: ['tint'],
          value: variant % 2 === 0 ? '#ef4444ff' : '#2563ebff',
        },
      ],
    },
  ];
}

function refreshTargets(value) {
  assert(Array.isArray(value), 'refresh targets array');
  return value.map((entry, index) => {
    if (typeof entry === 'string') return elementTarget(stringValue(entry, `refresh target ${index}`));
    const record = recordValue(entry, `refresh target ${index}`);
    assertExactKeys(record, ['id', 'ownerId'], `refresh target ${index}`);
    return componentTarget(
      stringValue(record.ownerId, `refresh target ${index} ownerId`),
      stringValue(record.id, `refresh target ${index} id`),
    );
  });
}

function bulkOverlayOperations(targetIds, fields, actionIndex) {
  if (fields.length === 0) {
    return targetIds.map((id) => ({
      op: 'merge',
      target: elementTarget(id),
      changes: [{ path: ['show'], value: true }],
    }));
  }
  const allowed = new Set(['bar', 'text', 'tint', 'show', 'size', 'padding']);
  assert(fields.every((field) => allowed.has(field)), 'bulkOverlay fields');
  const operations = [];
  targetIds.forEach((id, index) => {
    const elementChanges = [];
    if (fields.includes('show')) elementChanges.push({ path: ['show'], value: index % 9 !== 0 });
    if (fields.includes('size')) {
      elementChanges.push({ path: ['size', 'width'], value: 90 + index % 17 });
      elementChanges.push({ path: ['size', 'height'], value: 56 + index % 13 });
    }
    if (fields.includes('padding')) {
      elementChanges.push({ path: ['padding'], value: 2 + index % 5 });
    }
    if (elementChanges.length > 0) {
      operations.push({ op: 'merge', target: elementTarget(id), changes: elementChanges });
    }
    const barChanges = [];
    if (fields.includes('bar')) {
      barChanges.push({ path: ['size', 'height'], value: 4 + (index * 7 + actionIndex) % 44 });
    }
    if (fields.includes('tint')) {
      barChanges.push({ path: ['tint'], value: index % 2 === 0 ? '#22aa66' : '#ee8844' });
    }
    if (barChanges.length > 0) {
      operations.push({
        op: 'merge',
        target: componentTarget(id, 'bar'),
        changes: barChanges,
      });
    }
    const textChanges = [];
    if (fields.includes('text')) {
      textChanges.push({ path: ['text'], value: `Node ${index}:${actionIndex}` });
    }
    if (fields.includes('tint')) {
      textChanges.push({ path: ['tint'], value: index % 2 === 0 ? '#113355' : '#552211' });
    }
    if (textChanges.length > 0) {
      operations.push({
        op: 'merge',
        target: componentTarget(id, 'label'),
        changes: textChanges,
      });
    }
  });
  return operations;
}

function syntheticTargetIds(count) {
  return Object.freeze(Array.from({ length: count }, (_, index) => `node-${index}`));
}

function patchChanges(patch) {
  const changes = [];
  appendPatchChanges(changes, [], patch);
  return changes;
}

function appendPatchChanges(changes, path, value) {
  if (isRecord(value) && Object.keys(value).length > 0) {
    for (const key of Object.keys(value).sort()) {
      appendPatchChanges(changes, [...path, key], value[key]);
    }
    return;
  }
  if (path.length > 0) changes.push({ path, value: clone(value) });
}

function resolvedTargetObservation(snapshotValue) {
  const snapshot = recordValue(snapshotValue, 'resolved target snapshot');
  const target = recordValue(snapshot.target, 'resolved target');
  const value = recordValue(snapshot.value, 'resolved target value');
  return deepFreeze({
    ...clone(value),
    ...(target.kind === 'component' ? { ownerId: target.ownerId } : {}),
    lifecycleGeneration: positiveInteger(
      snapshot.lifecycleGeneration,
      'resolved target lifecycleGeneration',
    ),
    sceneRevision: nonNegativeInteger(snapshot.sceneRevision, 'resolved target sceneRevision'),
  });
}

function visibleCenter(entity, record) {
  if (Array.isArray(entity?.visibleCenter) && entity.visibleCenter.length === 2) {
    return clone(entity.visibleCenter);
  }
  if (!record) return null;
  const x = recordCoordinate(record, 'x');
  const y = recordCoordinate(record, 'y');
  const width = finiteNumber(record.size?.width, 'record width');
  const height = finiteNumber(record.size?.height, 'record height');
  const angle = typeof record.attrs?.angle === 'number' ? record.attrs.angle : 0;
  const radians = angle * Math.PI / 180;
  return Object.freeze([
    x + width / 2 * Math.cos(radians) - height / 2 * Math.sin(radians),
    y + width / 2 * Math.sin(radians) + height / 2 * Math.cos(radians),
  ]);
}

function recordBounds(record) {
  if (!record) return null;
  return [
    recordCoordinate(record, 'x'),
    recordCoordinate(record, 'y'),
    finiteNumber(record.size?.width, 'record width'),
    finiteNumber(record.size?.height, 'record height'),
  ];
}

function recordCoordinate(record, key) {
  return finiteNumber(record?.attrs?.[key], `record ${key}`);
}

function geometryEntityById(geometry, id) {
  return Array.isArray(geometry?.entities)
    ? geometry.entities.find((entity) => entity.id === id) ?? null
    : null;
}

function selectGeometryTarget(state, engine, targetId) {
  if (state.selectedGeometryTarget) return;
  callSync(engine, 'select', [targetId]);
  state.selectedGeometryTarget = true;
}

function readFixtureReference(params, reference) {
  const prefix = '/fixtures/';
  assert(reference.startsWith(prefix), 'fixture reference prefix');
  const key = reference.slice(prefix.length);
  assert(key.length > 0 && !key.includes('/'), 'fixture reference key');
  assert(Object.hasOwn(params, key), `fixture reference ${key}`);
  return params[key];
}

function projectDeclaredPaths(source, paths) {
  const projected = {};
  for (const path of paths) {
    const segments = declaredPathSegments(path);
    let cursor = source;
    for (const segment of segments) {
      assert(isRecord(cursor) || Array.isArray(cursor), `capture path ${path}`);
      assert(Object.hasOwn(cursor, segment), `capture path ${path}`);
      cursor = cursor[segment];
    }
    writeProjectedPath(projected, segments, clone(cursor));
  }
  return deepFreeze(projected);
}

function declaredPathSegments(path) {
  const separator = path.includes('/') ? '/' : '.';
  const segments = path.split(separator);
  assert(
    segments.length > 0 && segments.every((segment) => (
      segment.length > 0 &&
      segment !== '__proto__' &&
      segment !== 'prototype' &&
      segment !== 'constructor'
    )),
    `capture path ${path}`,
  );
  return segments;
}

function writeProjectedPath(target, segments, value) {
  let cursor = target;
  segments.forEach((segment, index) => {
    const terminal = index === segments.length - 1;
    if (terminal) {
      assert(!Object.hasOwn(cursor, segment), `duplicate capture path ${segments.join('/')}`);
      cursor[segment] = value;
      return;
    }
    if (!Object.hasOwn(cursor, segment)) cursor[segment] = {};
    cursor = recordValue(cursor[segment], `capture projection ${segments.join('/')}`);
  });
}

function fixtureReference(value, label) {
  const record = recordValue(value, label);
  assertExactKeys(record, ['$ref'], label);
  return stringValue(record.$ref, `${label}.$ref`);
}

function componentTargetFromValue(value, label) {
  const record = recordValue(value, label);
  assertExactKeys(record, ['id', 'ownerId'], label);
  return componentTarget(
    stringValue(record.ownerId, `${label}.ownerId`),
    stringValue(record.id, `${label}.id`),
  );
}

function elementTarget(id) {
  return Object.freeze({ kind: 'element', id });
}

function componentTarget(ownerId, id) {
  return Object.freeze({ kind: 'component', ownerId, id });
}

function inputObservation(beforeFingerprint, afterFingerprint) {
  return deepFreeze({
    beforeFingerprint,
    afterFingerprint,
    unchanged: beforeFingerprint === afterFingerprint,
  });
}

function fingerprintValue(context, value) {
  const beforeFingerprint = context.fingerprint(value);
  return inputObservation(beforeFingerprint, context.fingerprint(value));
}

function validateProductAdapter(product) {
  const adapter = recordValue(product, 'product adapter');
  assertExactKeys(adapter, ['createSyntheticScene', 'resourceProbe'], 'product adapter');
  for (const method of ['createSyntheticScene', 'resourceProbe']) {
    assert(typeof adapter[method] === 'function', `product adapter ${method}()`);
  }
  return adapter;
}

function validateContext(contextValue) {
  const context = recordValue(contextValue, 'handler context');
  for (const method of [
    'ensureMainEngine',
    'ensureSessionEngine',
    'createEngine',
    'releaseEngine',
    'resolveDataset',
    'fingerprint',
    'getBinding',
  ]) {
    assert(typeof context[method] === 'function', `context ${method}()`);
  }
  assert(isRecord(context.fixtureParams), 'context fixtureParams');
  assert(isRecord(context.fixtureProfiles), 'context fixtureProfiles');
  assert(isRecord(context.routeParams), 'context routeParams');
  assert(isRecord(context.clock), 'context clock');
  assert(typeof context.clock.advanceTo === 'function', 'context clock.advanceTo()');
  assert(isRecord(context.signal), 'context signal');
  return context;
}

function validateRouteParams(value) {
  const route = recordValue(value, 'route params');
  if (Object.hasOwn(route, 'seed')) nonNegativeInteger(route.seed, 'route seed');
  if (Object.hasOwn(route, 'size')) stringValue(route.size, 'route size');
}

function callSync(target, method, ...args) {
  const fn = target?.[method];
  assert(typeof fn === 'function', `product method ${method}()`);
  return fn.apply(target, args);
}

async function call(target, method, ...args) {
  return callSync(target, method, ...args);
}

function exactOperands(action, keys) {
  const operands = recordValue(action.operands, `${action.type} operands`);
  assertExactKeys(operands, keys, `${action.type} operands`);
  return operands;
}

function assertExactKeys(value, keys, label) {
  const actual = Object.keys(value).sort();
  const required = [...keys].sort();
  assert(
    actual.length === required.length && actual.every((key, index) => key === required[index]),
    `${label} keys`,
  );
}

function stringArray(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  return value.map((entry, index) => stringValue(entry, `${label}[${index}]`));
}

function integerArray(value, label) {
  return arrayValue(value, label).map((entry, index) =>
    positiveInteger(entry, `${label}[${index}]`));
}

function arrayValue(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  return value;
}

function mutationTargetIds(value) {
  return arrayValue(value, 'mutation targets').map((entry, index) => {
    if (typeof entry === 'string') return entry;
    const target = recordValue(entry, `mutation target ${index}`);
    return stringValue(target.id, `mutation target ${index} id`);
  });
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} must be a string`);
  return value;
}

function booleanValue(value, label) {
  assert(typeof value === 'boolean', `${label} must be boolean`);
  return value;
}

function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} must be finite`);
  return Object.is(value, -0) ? 0 : value;
}

function positiveInteger(value, label) {
  assert(Number.isSafeInteger(value) && value > 0, `${label} must be positive`);
  return value;
}

function nonNegativeInteger(value, label) {
  assert(Number.isSafeInteger(value) && value >= 0, `${label} must be non-negative`);
  return value;
}

function recordValue(value, label) {
  assert(isRecord(value), `${label} must be an object`);
  return value;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isDeepFrozen(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return true;
  if (seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Reflect.ownKeys(value).every((key) => isDeepFrozen(value[key], seen));
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Invalid Core v2 update transaction handler: ${message}`);
}
