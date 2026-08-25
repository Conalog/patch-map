import { clone } from '../value-atoms.mjs';

export const REPLACEMENT_RECOVERY_HANDLER_REVISION =
  'patch-map-replacement-recovery-handlers/1';

export const REPLACEMENT_RECOVERY_CASE_IDS = Object.freeze([
  'ERR-002',
  'ERR-005',
  'LIF-003',
  'CSM-002',
  'CSM-004',
  'CSM-037',
]);

export const REPLACEMENT_RECOVERY_ACTION_TYPES = Object.freeze([
  'load-dataset',
  'snapshot-observation',
  'query-target',
  'merge-target',
  'replace-scene',
  'submit-scene-revision',
  'complete-request',
  'loadDataset',
  'select',
  'seed-replacement-stale-state',
  'startAnimation',
  'replaceDataset',
  'load-scene',
  'select-targets',
  'query-stale-target',
  'probe-declared-failure',
  'submit-async-revision',
  'complete-async-revision',
  'apply-presentation-overlay',
  'fit-view',
]);

const CASE_ACTIONS = Object.freeze({
  'ERR-002': Object.freeze([
    'load-dataset',
    'snapshot-observation',
    'query-target',
    'merge-target',
    'replace-scene',
    'snapshot-observation',
    'merge-target',
    'snapshot-observation',
  ]),
  'ERR-005': Object.freeze([
    'submit-scene-revision',
    'submit-scene-revision',
    'complete-request',
    'complete-request',
  ]),
  'LIF-003': Object.freeze([
    'loadDataset',
    'select',
    'seed-replacement-stale-state',
    'startAnimation',
    'replaceDataset',
    'replaceDataset',
    'replaceDataset',
    'replaceDataset',
    'replaceDataset',
    'replaceDataset',
  ]),
  'CSM-002': Object.freeze([
    'load-scene',
    'select-targets',
    'replace-scene',
    'query-stale-target',
    'probe-declared-failure',
  ]),
  'CSM-004': Object.freeze([
    'load-scene',
    'submit-async-revision',
    'submit-async-revision',
    'complete-async-revision',
    'complete-async-revision',
    'probe-declared-failure',
  ]),
  'CSM-037': Object.freeze([
    'load-scene',
    'replace-scene',
    'apply-presentation-overlay',
    'fit-view',
    'probe-declared-failure',
  ]),
});

/** Shared expected-blind handlers for replacement, stale-target, and async recovery. */
export function createReplacementRecoveryHandlerEntries(productValue) {
  const product = validateProductAdapter(productValue);
  const states = new WeakMap();
  const implementations = Object.freeze({
    'load-dataset': loadDatasetAction,
    'snapshot-observation': snapshotObservationAction,
    'query-target': queryTargetAction,
    'merge-target': mergeTargetAction,
    'replace-scene': replaceSceneAction,
    'submit-scene-revision': submitSceneRevisionAction,
    'complete-request': completeRequestAction,
    loadDataset: lifecycleLoadDatasetAction,
    select: selectAction,
    'seed-replacement-stale-state': seedReplacementStateAction,
    startAnimation: startAnimationAction,
    replaceDataset: lifecycleReplaceDatasetAction,
    'load-scene': loadSceneAction,
    'select-targets': selectTargetsAction,
    'query-stale-target': queryStaleTargetAction,
    'probe-declared-failure': probeDeclaredFailureAction,
    'submit-async-revision': submitAsyncRevisionAction,
    'complete-async-revision': completeAsyncRevisionAction,
    'apply-presentation-overlay': applyPresentationOverlayAction,
    'fit-view': fitViewAction,
  });
  return Object.freeze(REPLACEMENT_RECOVERY_ACTION_TYPES.map((type) => Object.freeze([
    `contract/${type}`,
    withState(product, states, implementations[type]),
  ])));
}

function withState(product, states, implementation) {
  return async (contextValue, actionValue) => {
    const context = validateContext(contextValue);
    const expectedTypes = CASE_ACTIONS[context.caseId];
    assert(expectedTypes !== undefined, `unsupported case ${String(context.caseId)}`);
    const action = recordValue(actionValue, 'action');
    assertExactKeys(action, ['index', 'operands', 'type'], 'action');
    assert(action.index === context.actionIndex, 'action index');
    assert(action.type === expectedTypes[context.actionIndex], 'action type');
    assert(!context.signal.aborted, 'action is aborted');
    let state = states.get(context.resolveDataset);
    if (state === undefined) {
      state = createState(context.caseId);
      states.set(context.resolveDataset, state);
    }
    assert(state.caseId === context.caseId, 'execution state case identity');
    return implementation(product, state, context, action);
  };
}

function createState(caseId) {
  return {
    caseId,
    engine: null,
    datasetRefs: new Map(),
    snapshots: new Map(),
    requests: new Map(),
    requestResults: new Map(),
    committedRequestCount: 0,
    baselineSceneRevision: 0,
    releaseCount: 0,
    logicalBinding: null,
    logicalDeliveries: 0,
    hostRevision: 0,
    hiddenRelationIds: [],
    fitContributors: [],
    panelColors: {},
    tooltipTarget: null,
    mode: caseId === 'CSM-037' ? 'report' : 'select',
    invalidOperationsPublished: 0,
  };
}

async function loadDatasetAction(product, state, context, action) {
  assert(context.caseId === 'ERR-002', 'load-dataset case');
  const operands = exactOperands(action, ['datasetRef', 'strict']);
  assert(operands.strict === true, 'load-dataset strict mode');
  const loaded = await loadSceneReference(
    product,
    state,
    context,
    stringValue(operands.datasetRef, 'load-dataset datasetRef'),
    false,
  );
  return actionOutput('load-dataset', loaded, state);
}

function snapshotObservationAction(product, state, _context, action) {
  assert(state.caseId === 'ERR-002', 'snapshot-observation case');
  const operands = exactOperands(action, ['label']);
  const label = stringValue(operands.label, 'snapshot label');
  const engine = currentEngine(state, 'snapshot-observation');
  const observation = observeProduct(engine, product);
  state.snapshots.set(label, observation);
  return actionOutput('snapshot-observation', { label, product: observation }, state);
}

function queryTargetAction(product, state, _context, action) {
  assert(state.caseId === 'ERR-002', 'query-target case');
  const operands = exactOperands(action, ['target']);
  const target = elementTarget(recordValue(operands.target, 'query target'));
  const engine = currentEngine(state, 'query-target');
  const result = callSync(engine, 'query', { id: target.id });
  return actionOutput('query-target', {
    target,
    result: clone(result),
    product: observeProduct(engine, product),
  }, state);
}

function mergeTargetAction(product, state, _context, action) {
  assert(state.caseId === 'ERR-002', 'merge-target case');
  const operands = exactOperands(action, ['changes', 'strict', 'target']);
  assert(operands.strict === true, 'merge-target strict mode');
  const targetValue = recordValue(operands.target, 'merge target');
  const engine = currentEngine(state, 'merge-target');
  const before = snapshotEngine(engine);
  const result = Object.hasOwn(targetValue, 'sceneRevision')
    ? callSync(engine, 'patchResolved', forgedSnapshot(targetValue), clone(operands.changes))
    : callSync(engine, 'patch', elementTarget(targetValue), clone(operands.changes));
  const after = snapshotEngine(engine);
  state.invalidOperationsPublished += publicationDelta(before, after);
  return actionOutput('merge-target', {
    target: clone(targetValue),
    result: clone(result),
    before,
    after,
    product: observeProduct(engine, product),
  }, state);
}

async function replaceSceneAction(product, state, context, action) {
  assert(state.caseId === 'ERR-002' || state.caseId === 'CSM-002' || state.caseId === 'CSM-037',
    'replace-scene case');
  const operands = recordValue(action.operands, 'replace-scene operands');
  const keys = state.caseId === 'ERR-002'
    ? ['datasetRef']
    : ['datasetRef', 'hostRevision'];
  assertExactKeys(operands, keys, 'replace-scene operands');
  if (Object.hasOwn(operands, 'hostRevision')) {
    state.hostRevision = positiveInteger(operands.hostRevision, 'replace-scene hostRevision');
  }
  const loaded = await loadSceneReference(
    product,
    state,
    context,
    stringValue(operands.datasetRef, 'replace-scene datasetRef'),
    true,
  );
  return actionOutput('replace-scene', {
    ...loaded,
    hostRevision: state.hostRevision,
  }, state, {
    operation: 'replace-scene',
    returned: { hostRevision: state.hostRevision, product: loaded.product },
  });
}

async function submitSceneRevisionAction(product, state, context, action) {
  assert(context.caseId === 'ERR-005', 'submit-scene-revision case');
  const operands = recordValue(action.operands, 'submit-scene-revision operands');
  const requestId = stringValue(operands.requestId, 'request ID');
  const generation = positiveInteger(operands.generation, 'request generation');
  if (state.engine === null) {
    await loadSceneReference(product, state, context, 'interactive-scene', false);
    state.baselineSceneRevision = sceneRevision(snapshotEngine(state.engine));
  }
  assert(!state.requests.has(requestId), `duplicate request ${requestId}`);
  const deferred = createDeferred();
  const engine = currentEngine(state, 'submit-scene-revision');
  const submission = call(engine, 'submitDataset', {
    requestId,
    sourceRevision: generation,
    ...(typeof operands.datasetRef === 'string' ? { datasetRef: operands.datasetRef } : {}),
    input: deferred.promise,
    release: () => {
      state.releaseCount += 1;
    },
  });
  state.requests.set(requestId, {
    deferred,
    promise: submission,
    datasetRef: typeof operands.datasetRef === 'string' ? operands.datasetRef : null,
    payload: typeof operands.payload === 'string' ? operands.payload : null,
    generation,
  });
  return actionOutput('submit-scene-revision', {
    requestId,
    generation,
    pendingWork: snapshotEngine(engine).pendingWork,
    product: observeProduct(engine, product),
  }, state);
}

async function completeRequestAction(product, state, context, action) {
  assert(context.caseId === 'ERR-005', 'complete-request case');
  const operands = exactOperands(action, ['outcome', 'requestId']);
  const requestId = stringValue(operands.requestId, 'complete request ID');
  const request = requiredRequest(state, requestId);
  if (request.payload === 'invalid') {
    request.deferred.resolve(await context.resolveDataset('malformed'));
  } else {
    request.deferred.resolve(await context.resolveDataset(
      request.datasetRef ?? 'interactive-scene',
    ));
  }
  const result = await request.promise;
  recordRequestResult(state, result);
  const engine = currentEngine(state, 'complete-request');
  if (result.status === 'committed') {
    callSync(engine, 'publishFrame', context.clock.now());
  }
  return actionOutput('complete-request', {
    requestId,
    declaredOutcome: stringValue(operands.outcome, 'declared outcome'),
    result: clone(result),
    requestCode: requestCode(result),
    partialRevisionCount: partialRevisionCount(state, engine),
    product: observeProduct(engine, product),
  }, state);
}

async function lifecycleLoadDatasetAction(product, state, context, action) {
  assert(context.caseId === 'LIF-003', 'loadDataset case');
  const operands = exactOperands(action, ['datasetRef', 'timeMs']);
  await advanceClock(context, finiteNumber(operands.timeMs, 'loadDataset timeMs'));
  const loaded = await loadSceneReference(
    product,
    state,
    context,
    stringValue(operands.datasetRef, 'loadDataset datasetRef'),
    false,
  );
  return actionOutput('loadDataset', loaded, state);
}

function selectAction(product, state, _context, action) {
  assert(state.caseId === 'LIF-003', 'select case');
  const operands = exactOperands(action, ['ids']);
  const ids = stringArray(operands.ids, 'select IDs');
  const engine = currentEngine(state, 'select');
  const selected = callSync(engine, 'select', ids);
  callSync(engine, 'setSelectionVisualPolicy', { selectionIds: ids });
  return actionOutput('select', {
    selected: clone(selected),
    product: observeProduct(engine, product),
  }, state);
}

function seedReplacementStateAction(product, state, _context, action) {
  assert(state.caseId === 'LIF-003', 'seed replacement state case');
  const operands = exactOperands(action, [
    'componentId',
    'eventName',
    'historyActionId',
    'overlayId',
    'targetId',
    'transformerSelection',
  ]);
  const engine = currentEngine(state, 'seed-replacement-stale-state');
  const targetId = stringValue(operands.targetId, 'seed target ID');
  const eventName = stringValue(operands.eventName, 'seed event name');
  const productEventName = eventName === 'pointertap' ? 'click' : eventName;
  const binding = callSync(engine, 'bindLogicalEvents', [{
    id: `replacement-binding:${targetId}`,
    event: productEventName,
    target: { kind: 'element', id: targetId },
  }], () => {
    state.logicalDeliveries += 1;
  });
  binding.enable();
  state.logicalBinding = binding;
  const transformerSelection = stringArray(
    operands.transformerSelection,
    'transformer selection',
  );
  callSync(engine, 'setSelectionVisualPolicy', { selectionIds: transformerSelection });
  const overlay = product.seedOverlay(stringValue(operands.overlayId, 'overlay ID'));
  return actionOutput('seed-replacement-stale-state', {
    targetId,
    componentId: stringValue(operands.componentId, 'component ID'),
    eventName,
    productEventName,
    historyActionId: stringValue(operands.historyActionId, 'history action ID'),
    binding: clone(binding.probe()),
    overlay: clone(overlay),
    product: observeProduct(engine, product),
  }, state);
}

function startAnimationAction(product, state, _context, action) {
  assert(state.caseId === 'LIF-003', 'startAnimation case');
  const operands = exactOperands(action, [
    'componentId',
    'durationMs',
    'ownerId',
    'toHeight',
  ]);
  const engine = currentEngine(state, 'startAnimation');
  const ownerId = stringValue(operands.ownerId, 'animation owner ID');
  const componentId = stringValue(operands.componentId, 'animation component ID');
  const mutation = callSync(engine, 'patch', {
    kind: 'component',
    ownerId,
    id: componentId,
  }, {
    size: { height: finiteNumber(operands.toHeight, 'animation height') },
  });
  assert(mutation.status === 'committed', 'animation mutation commits');
  const observed = observeProduct(engine, product);
  const transformerSelection = selectionVisualIds(observed.selectionVisual);
  const captureSource = {
    events: {
      bindingCount: state.logicalBinding === null
        ? 0
        : nonNegativeInteger(state.logicalBinding.probe().bindingCount, 'binding count'),
    },
    interaction: {
      selection: clone(observed.snapshot.selectionIds),
      transformerSelection,
    },
    history: { depth: observed.history.depth },
    resources: {
      unmanagedOverlayCount: observed.runtime.unmanagedOverlayCount,
    },
    paint: {
      animations: {
        activeCount: observed.semantic.interaction.activeAnimationCount ?? 0,
      },
    },
  };
  return {
    ...actionOutput('startAnimation', {
      ownerId,
      componentId,
      durationMs: finiteNumber(operands.durationMs, 'animation duration'),
      mutation: clone(mutation),
      product: observed,
    }, state),
    captureSource,
  };
}

async function lifecycleReplaceDatasetAction(product, state, context, action) {
  assert(context.caseId === 'LIF-003', 'replaceDataset case');
  const operands = exactOperands(action, ['datasetRef', 'timeMs']);
  const timeMs = finiteNumber(operands.timeMs, 'replaceDataset timeMs');
  await advanceClock(context, timeMs);
  const engine = currentEngine(state, 'replaceDataset');
  callSync(engine, 'publishFrame', timeMs);
  const loaded = await loadSceneReference(
    product,
    state,
    context,
    stringValue(operands.datasetRef, 'replaceDataset datasetRef'),
    true,
  );
  if (state.logicalBinding !== null && state.logicalBinding.probe().disposed) {
    state.logicalBinding.enable();
  }
  return actionOutput('replaceDataset', {
    timeMs,
    ...loaded,
    staleBinding: state.logicalBinding === null
      ? null
      : clone(state.logicalBinding.probe()),
    staleBindingsInvoked: state.logicalDeliveries,
  }, state);
}

async function loadSceneAction(product, state, context, action) {
  assert(context.caseId === 'CSM-002' || context.caseId === 'CSM-004' || context.caseId === 'CSM-037',
    'load-scene case');
  const operands = exactOperands(action, ['datasetRef', 'hostRevision']);
  state.hostRevision = positiveInteger(operands.hostRevision, 'load-scene hostRevision');
  const loaded = await loadSceneReference(
    product,
    state,
    context,
    stringValue(operands.datasetRef, 'load-scene datasetRef'),
    false,
  );
  state.baselineSceneRevision = sceneRevision(loaded.product.snapshot);
  return actionOutput('load-scene', {
    ...loaded,
    hostRevision: state.hostRevision,
  }, state, {
    operation: 'load-scene',
    returned: { hostRevision: state.hostRevision, product: loaded.product },
  });
}

function selectTargetsAction(product, state, _context, action) {
  assert(state.caseId === 'CSM-002', 'select-targets case');
  const operands = exactOperands(action, ['mode', 'targets']);
  assert(operands.mode === 'replace', 'selection mode');
  const targets = stringArray(operands.targets, 'selection targets');
  const engine = currentEngine(state, 'select-targets');
  const selected = callSync(engine, 'select', targets);
  return actionOutput('select-targets', {
    selected: clone(selected),
    product: observeProduct(engine, product),
  }, state, {
    operation: 'select-targets',
    returned: { selectedIds: clone(selected) },
  });
}

function queryStaleTargetAction(product, state, _context, action) {
  assert(state.caseId === 'CSM-002', 'query-stale-target case');
  const operands = exactOperands(action, ['target']);
  const target = recordValue(operands.target, 'stale target');
  const engine = currentEngine(state, 'query-stale-target');
  const result = callSync(engine, 'patchResolved', forgedSnapshot({
    kind: 'element',
    id: stringValue(target.id, 'stale target ID'),
    lifecycleGeneration: 1,
    sceneRevision: positiveInteger(target.sceneRevision, 'stale scene revision'),
  }), { show: false });
  return actionOutput('query-stale-target', {
    result: clone(result),
    staleTargetCode: result.diagnostic?.code ?? null,
    product: observeProduct(engine, product),
  }, state, {
    operation: 'query-stale-target',
    returned: { code: result.diagnostic?.code ?? null },
  });
}

async function submitAsyncRevisionAction(product, state, context, action) {
  assert(context.caseId === 'CSM-004', 'submit-async-revision case');
  const operands = exactOperands(action, ['generation', 'requestId', 'result']);
  const requestId = stringValue(operands.requestId, 'async request ID');
  const generation = positiveInteger(operands.generation, 'async generation');
  const declaredResult = stringValue(operands.result, 'async declared result');
  const deferred = createDeferred();
  const engine = currentEngine(state, 'submit-async-revision');
  const promise = call(engine, 'submitDataset', {
    requestId,
    sourceRevision: generation,
    datasetRef: requestId === 'overlay-B'
      ? 'interactive-scene-revision-2'
      : 'interactive-scene',
    input: deferred.promise,
    release: () => {
      state.releaseCount += 1;
    },
  });
  state.requests.set(requestId, {
    deferred,
    promise,
    datasetRef: requestId === 'overlay-B'
      ? 'interactive-scene-revision-2'
      : 'interactive-scene',
    payload: declaredResult,
    generation,
  });
  state.hostRevision = Math.max(state.hostRevision, generation);
  return actionOutput('submit-async-revision', {
    requestId,
    generation,
    declaredResult,
    pendingWork: snapshotEngine(engine).pendingWork,
    product: observeProduct(engine, product),
  }, state, {
    operation: 'submit-async-revision',
    returned: { requestId, generation, pending: true },
  });
}

async function completeAsyncRevisionAction(product, state, context, action) {
  assert(context.caseId === 'CSM-004', 'complete-async-revision case');
  const operands = exactOperands(action, ['completionOrder', 'requestId']);
  const requestId = stringValue(operands.requestId, 'completion request ID');
  const completionOrder = positiveInteger(operands.completionOrder, 'completion order');
  const engine = currentEngine(state, 'complete-async-revision');
  const completed = {};
  if (completionOrder === 2) {
    requiredRequest(state, requestId);
  } else {
    const accepted = requiredRequest(state, requestId);
    accepted.deferred.resolve(await context.resolveDataset(accepted.datasetRef));
    const acceptedResult = await accepted.promise;
    recordRequestResult(state, acceptedResult);
    completed[requestId] = clone(acceptedResult);

    const superseded = requiredRequest(state, 'base-A');
    superseded.deferred.reject(new Error('ASSET_LOAD_FAILED'));
    const supersededResult = await superseded.promise;
    recordRequestResult(state, supersededResult);
    completed['base-A'] = clone(supersededResult);
    callSync(engine, 'publishFrame', context.clock.now());
  }
  return actionOutput('complete-async-revision', {
    requestId,
    completionOrder,
    completed,
    partialPublicationCount: partialRevisionCount(state, engine),
    product: observeProduct(engine, product),
  }, state, {
    operation: 'complete-async-revision',
    returned: { requestId, completionOrder, completed },
  });
}

async function probeDeclaredFailureAction(product, state, context, action) {
  assert(
    context.caseId === 'CSM-002' || context.caseId === 'CSM-004' || context.caseId === 'CSM-037',
    'probe-declared-failure case',
  );
  const operands = exactOperands(action, [
    'afterActionIndex',
    'expectedRollback',
    'injection',
    'isolate',
    'journeyId',
  ]);
  assert(operands.isolate === true, 'declared failure isolation');
  assert(operands.afterActionIndex === context.actionIndex - 1, 'declared failure action index');
  assert(operands.journeyId === context.caseId, 'declared failure journey ID');
  recordValue(operands.injection, 'declared failure injection');
  // Immutable expectedRollback values are deliberately not consulted.
  recordValue(operands.expectedRollback, 'declared failure expected rollback');

  const record = await context.createEngine(`declared-failure:${context.caseId}`);
  const isolated = record.engine;
  let rollback;
  let failure;
  let release;
  try {
    await initializeEngine(isolated, `${context.caseId.toLowerCase()}-declared-failure`);
    const baselineRef = context.caseId === 'CSM-037'
      ? 'report-date-1'
      : 'interactive-scene';
    const baseline = await context.resolveDataset(baselineRef);
    callSync(isolated, 'loadDataset', baseline, { datasetRef: baselineRef });
    const before = snapshotEngine(isolated);
    const persistedBefore = clone(callSync(isolated, 'exportDataset'));
    let overlayStayedTransient = true;
    if (context.caseId === 'CSM-037') {
      const fillOverrides = Object.entries(state.panelColors).map(([id, color]) => ({
        id,
        packedColor: product.packColor(color).packedColor,
      }));
      callSync(isolated, 'setPresentationPolicy', {
        hiddenLayerIds: state.hiddenRelationIds,
        fillOverrides,
      });
      overlayStayedTransient =
        context.fingerprint(persistedBefore) ===
        context.fingerprint(callSync(isolated, 'exportDataset'));
    }
    const failureResult = await call(isolated, 'submitDataset', {
      requestId: `declared-failure:${context.caseId}`,
      datasetRef: 'malformed',
      input: Promise.resolve(await context.resolveDataset('malformed')),
    });
    const accepted = failureResult.status === 'committed';
    const diagnostic = accepted ? null : clone(failureResult.diagnostic);
    const after = snapshotEngine(isolated);
    failure = {
      accepted,
      diagnostic,
      before,
      after,
    };
    const partialPublicationCount = after.frameRevision - before.frameRevision;
    if (context.caseId === 'CSM-002') {
      rollback = {
        authoritativeSceneRevision: sceneRevision(after),
        ifReplacementInvalid:
          !accepted && diagnostic?.code === 'INVALID_VALUE'
          && before.semanticHash === after.semanticHash,
        partialPublicationCount,
      };
    } else if (context.caseId === 'CSM-004') {
      rollback = {
        keepSceneRevision: sceneRevision(after),
        partialPublicationCount,
        retryNeedsRemount: after.lifecycle !== 'scene-ready',
      };
    } else {
      rollback = {
        replacementFailureRetainsRevision: sceneRevision(after),
        presentationOverlayNotPersisted:
          overlayStayedTransient
          && context.fingerprint(persistedBefore)
            === context.fingerprint(callSync(isolated, 'exportDataset')),
      };
    }
  } finally {
    release = await context.releaseEngine(isolated, 'declared-failure-isolation');
  }
  const main = observeProduct(currentEngine(state, 'probe-declared-failure'), product);
  return actionOutput('probe-declared-failure', {
    rollback,
    failure,
    release: clone(release),
    product: main,
  }, state, {
    operation: 'probe-declared-failure',
    input: {
      journeyId: context.caseId,
      injection: clone(operands.injection),
    },
    returned: clone(rollback),
  });
}

function applyPresentationOverlayAction(product, state, _context, action) {
  assert(state.caseId === 'CSM-037', 'apply-presentation-overlay case');
  const operands = exactOperands(action, [
    'hiddenRelationIds',
    'panelColors',
    'persist',
  ]);
  assert(operands.persist === false, 'presentation overlay stays transient');
  const hiddenRelationIds = stringArray(
    operands.hiddenRelationIds,
    'hidden relation IDs',
  );
  const panelColors = stringRecord(operands.panelColors, 'panel colors');
  const fillOverrides = Object.entries(panelColors).map(([id, color]) => ({
    id,
    packedColor: product.packColor(color).packedColor,
  }));
  const engine = currentEngine(state, 'apply-presentation-overlay');
  const beforeDataset = clone(callSync(engine, 'exportDataset'));
  const result = callSync(engine, 'setPresentationPolicy', {
    hiddenLayerIds: hiddenRelationIds,
    fillOverrides,
  });
  state.hiddenRelationIds = hiddenRelationIds;
  state.panelColors = panelColors;
  const persisted = contextFreeFingerprint(beforeDataset) ===
    contextFreeFingerprint(callSync(engine, 'exportDataset'));
  return actionOutput('apply-presentation-overlay', {
    hiddenRelationIds,
    fillOverrides,
    persisted,
    result: clone(result),
    product: observeProduct(engine, product),
  }, state, {
    operation: 'apply-presentation-overlay',
    returned: { hiddenRelationIds, fillOverrides, persisted },
  });
}

function fitViewAction(product, state, context, action) {
  assert(state.caseId === 'CSM-037', 'fit-view case');
  const operands = exactOperands(action, ['excludeHiddenRelations', 'paddingCss']);
  assert(operands.excludeHiddenRelations === true, 'fit excludes hidden relations');
  const engine = currentEngine(state, 'fit-view');
  const semantic = callSync(engine, 'semanticProbe');
  const rootIds = stringArray(
    recordValue(semantic.dataset, 'semantic dataset').rootIds,
    'semantic root IDs',
  );
  const targets = rootIds.filter((id) => !state.hiddenRelationIds.includes(id));
  const fit = callSync(engine, 'fitViewport', {
    targets,
    paddingCssPx: finiteNumber(operands.paddingCss, 'fit padding'),
  });
  callSync(engine, 'publishFrame', context.clock.now());
  state.fitContributors = fit.contributors.map(({ id }) => id);
  return actionOutput('fit-view', {
    fit: clone(fit),
    fitContributorIds: clone(state.fitContributors),
    product: observeProduct(engine, product),
  }, state, {
    operation: 'fit-view',
    returned: { fitContributorIds: clone(state.fitContributors) },
  });
}

async function loadSceneReference(product, state, context, datasetRef, replacement) {
  const engine = await ensureEngine(state, context);
  const dataset = await context.resolveDataset(datasetRef);
  const beforeFingerprint = context.fingerprint(dataset);
  const result = callSync(engine, 'loadDataset', dataset, { datasetRef });
  callSync(engine, 'publishFrame', context.clock.now());
  const afterFingerprint = context.fingerprint(dataset);
  assert(beforeFingerprint === afterFingerprint, `${datasetRef} input mutation`);
  state.datasetRefs.set(datasetRef, { beforeFingerprint, afterFingerprint });
  const observed = observeProduct(engine, product);
  const runtime = replacement
    ? product.recordReplacement(observed)
    : product.beginScene(observed);
  return {
    datasetRef,
    result: clone(result),
    input: { beforeFingerprint, afterFingerprint, unchanged: true },
    product: { ...observed, runtime: clone(runtime) },
  };
}

async function ensureEngine(state, context) {
  if (state.engine !== null) return state.engine;
  const engine = await context.ensureMainEngine();
  await initializeEngine(engine, `${context.caseId.toLowerCase()}-main`);
  state.engine = engine;
  return engine;
}

async function initializeEngine(engine, instanceId) {
  const snapshot = snapshotEngine(engine);
  if (snapshot.lifecycle !== 'new') return;
  await call(engine, 'initialize', {
    instanceId,
    width: 800,
    height: 600,
    pixelRatio: 1,
    strategy: 'mesh',
    preference: 'webgl',
  });
}

function observeProduct(engine, product) {
  const snapshot = snapshotEngine(engine);
  const semantic = clone(callSync(engine, 'semanticProbe'));
  const hostInteraction = clone(callSync(engine, 'hostInteractionProbe'));
  const observation = {
    snapshot,
    semantic,
    geometry: optionalCallSync(engine, 'geometryProbe'),
    relations: optionalCallSync(engine, 'relationProbe'),
    presentation: optionalCallSync(engine, 'presentationPolicyProbe'),
    selectionVisual: optionalCallSync(engine, 'selectionVisualProbe'),
    history: clone(callSync(engine, 'historyState')),
    hostInteraction,
    viewport: optionalCallSync(engine, 'viewportProbe'),
    dataset: clone(callSync(engine, 'exportDataset')),
    bar: optionalCallSync(engine, 'componentVisualProbe', {
      ownerId: 'item-a',
      componentId: 'bar',
    }),
    reportText: optionalCallSync(engine, 'textProbe', {
      kind: 'element',
      id: 'text-c',
    }),
  };
  return {
    ...clone(observation),
    runtime: clone(product.resourceProbe()),
  };
}

function actionOutput(operation, actual, state, host = null) {
  return {
    actual: {
      operation,
      ...clone(actual),
      runtimeState: runtimeState(state),
    },
    ...(host === null ? {} : { host: clone(host) }),
  };
}

function runtimeState(state) {
  return {
    hostRevision: state.hostRevision,
    requestResults: Object.fromEntries([...state.requestResults].map(([id, result]) => [
      id,
      requestCode(result),
    ])),
    releaseCount: state.releaseCount,
    staleBindingsInvoked: state.logicalDeliveries,
    hiddenRelationIds: clone(state.hiddenRelationIds),
    fitContributors: clone(state.fitContributors),
    tooltipTarget: state.tooltipTarget,
    mode: state.mode,
    invalidOperationsPublished: state.invalidOperationsPublished,
  };
}

function recordRequestResult(state, result) {
  state.requestResults.set(result.requestId, clone(result));
  if (result.status === 'committed') state.committedRequestCount += 1;
}

function partialRevisionCount(state, engine) {
  return Math.max(
    0,
    sceneRevision(snapshotEngine(engine))
      - state.baselineSceneRevision
      - state.committedRequestCount,
  );
}

function requiredRequest(state, requestId) {
  const request = state.requests.get(requestId);
  assert(request !== undefined, `missing request ${requestId}`);
  return request;
}

function requestCode(result) {
  return result.status === 'committed'
    ? null
    : result.diagnostic?.code ?? null;
}

function forgedSnapshot(value) {
  return {
    target: elementTarget(value),
    lifecycleGeneration: positiveInteger(
      value.lifecycleGeneration ?? 1,
      'forged lifecycle generation',
    ),
    sceneRevision: positiveInteger(value.sceneRevision, 'forged scene revision'),
    value: {},
  };
}

function publicationDelta(before, after) {
  return Number(
    before.frameRevision !== after.frameRevision
    || before.revisions.sceneRevision !== after.revisions.sceneRevision
    || before.revisions.viewRevision !== after.revisions.viewRevision
    || before.revisions.interactionRevision !== after.revisions.interactionRevision,
  );
}

function selectionVisualIds(value) {
  if (!isRecord(value) || !Array.isArray(value.overlayTargets)) return [];
  return value.overlayTargets.map((target, index) => stringValue(
    recordValue(target, `selection overlay ${index}`).selectionId,
    `selection overlay ${index} ID`,
  ));
}

function sceneRevision(snapshot) {
  return nonNegativeInteger(
    recordValue(snapshot.revisions, 'snapshot revisions').sceneRevision,
    'scene revision',
  );
}

async function advanceClock(context, timeMs) {
  const current = finiteNumber(context.clock.now(), 'clock now');
  assert(timeMs >= current, `clock cannot move backwards from ${current} to ${timeMs}`);
  await context.clock.advanceTo(timeMs);
  assert(!context.signal.aborted, 'action is aborted');
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolveValue, rejectValue) => {
    resolve = resolveValue;
    reject = rejectValue;
  });
  return { promise, resolve, reject };
}

function validateContext(value) {
  const context = recordValue(value, 'handler context');
  for (const method of [
    'createEngine',
    'ensureMainEngine',
    'fingerprint',
    'releaseEngine',
    'resolveDataset',
  ]) {
    assert(typeof context[method] === 'function', `context ${method}()`);
  }
  assert(isRecord(context.clock), 'context clock');
  assert(typeof context.clock.now === 'function', 'context clock.now()');
  assert(typeof context.clock.advanceTo === 'function', 'context clock.advanceTo()');
  assert(isRecord(context.signal), 'context signal');
  return context;
}

function validateProductAdapter(value) {
  const product = recordValue(value, 'product adapter');
  assertExactKeys(
    product,
    ['beginScene', 'packColor', 'recordReplacement', 'resourceProbe', 'seedOverlay'],
    'product adapter',
  );
  for (const method of Object.keys(product)) {
    assert(typeof product[method] === 'function', `product adapter ${method}()`);
  }
  return product;
}

function exactOperands(action, keys) {
  const operands = recordValue(action.operands, `${action.type} operands`);
  assertExactKeys(operands, keys, `${action.type} operands`);
  return operands;
}

function elementTarget(value) {
  const target = recordValue(value, 'element target');
  const allowed = ['id', 'kind', 'lifecycleGeneration', 'sceneRevision'];
  assert(Object.keys(target).every((key) => allowed.includes(key)), 'element target keys');
  if (Object.hasOwn(target, 'kind')) assert(target.kind === 'element', 'element target kind');
  return {
    kind: 'element',
    id: stringValue(target.id, 'element target ID'),
  };
}

function snapshotEngine(engine) {
  return clone(callSync(engine, 'snapshot'));
}

function currentEngine(state, operation) {
  assert(state.engine !== null, `${operation} requires an engine`);
  return state.engine;
}

function optionalCallSync(target, method, ...args) {
  if (typeof target?.[method] !== 'function') return null;
  try {
    return clone(target[method](...args));
  } catch {
    return null;
  }
}

function callSync(target, method, ...args) {
  assert(target !== null && typeof target === 'object', `${method} target`);
  assert(typeof target[method] === 'function', `${method}()`);
  return target[method](...args);
}

async function call(target, method, ...args) {
  return await callSync(target, method, ...args);
}

function stringRecord(value, label) {
  const record = recordValue(value, label);
  return Object.fromEntries(Object.entries(record).map(([key, entry]) => [
    stringValue(key, `${label} key`),
    stringValue(entry, `${label}.${key}`),
  ]));
}

function stringArray(value, label) {
  assert(Array.isArray(value), label);
  return value.map((entry, index) => stringValue(entry, `${label}[${index}]`));
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, label);
  return value;
}

function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), label);
  return Object.is(value, -0) ? 0 : value;
}

function positiveInteger(value, label) {
  assert(Number.isSafeInteger(value) && value > 0, label);
  return value;
}

function nonNegativeInteger(value, label) {
  assert(Number.isSafeInteger(value) && value >= 0, label);
  return value;
}

function recordValue(value, label) {
  assert(isRecord(value), label);
  return value;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  assert(
    actual.length === wanted.length && actual.every((key, index) => key === wanted[index]),
    `${label} keys`,
  );
}

function contextFreeFingerprint(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]),
  );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Invalid PatchMap replacement/recovery handler: ${message}`);
  }
}
