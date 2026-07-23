export const UPDATE_TRANSACTIONS_HANDLER_REVISION =
  'core-v2-update-transactions-handlers/1';

export const UPDATE_TRANSACTIONS_CASE_IDS = Object.freeze([
  'UPD-001',
  'UPD-002',
  'UPD-003',
  'UPD-004',
  'UPD-006',
  'UPD-007',
  'UPD-008',
  'UPD-010',
]);

export const UPDATE_TRANSACTIONS_ACTION_TYPES = Object.freeze([
  'loadDataset',
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
]);

const CASE_ACTIONS = Object.freeze({
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
  'UPD-010': Object.freeze([
    'loadDataset',
    'patch',
    'setVisibility',
    'setVisibility',
    'remove',
  ]),
});

const BASELINE_PROFILE = 'mutation-transaction-matrix';

/** Shared browser-safe product handlers for eight update transaction cases. */
export function createUpdateTransactionHandlerEntries(product) {
  const adapter = validateProductAdapter(product);
  const states = new WeakMap();
  const handlers = Object.freeze({
    loadDataset: withState(adapter, states, loadDatasetAction),
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
      };
      states.set(context.ensureMainEngine, state);
    }
    assert(state.caseId === context.caseId, 'execution state case identity');
    return handler(adapter, state, context, action);
  };
}

async function loadDatasetAction(adapter, state, context, action) {
  assert(context.caseId === 'UPD-001' || context.caseId === 'UPD-010', 'loadDataset case');
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
  assert(context.caseId === 'UPD-007', 'publishFrame case');
  const operands = exactOperands(action, ['timeMs']);
  const timeMs = finiteNumber(operands.timeMs, 'publishFrame.timeMs');
  await context.clock.advanceTo(timeMs);
  const engine = currentEngine(state, 'publishFrame');
  const before = observeProduct(adapter, context, engine);
  callSync(engine, 'publishFrame', timeMs);
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
      eventRevision: state.lastBulkEventRevision,
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

function currentEngine(state, operation) {
  assert(state.engine !== null, `${operation} engine exists`);
  return state.engine;
}

function observeProduct(adapter, context, engine) {
  const resources = clone(adapter.resourceProbe({ caseId: context.caseId, engine }));
  const resourceEngine = isRecord(resources.engine) ? resources.engine : null;
  const snapshot = isRecord(resourceEngine?.snapshot)
    ? clone(resourceEngine.snapshot)
    : clone(callSync(engine, 'snapshot'));
  const dataset = callSync(engine, 'exportDataset');
  const semantic = isRecord(resourceEngine?.semantic)
    ? clone(resourceEngine.semantic)
    : clone(callSync(engine, 'semanticProbe'));
  const geometry = clone(callSync(engine, 'geometryProbe'));
  const relations = clone(callSync(engine, 'relationProbe'));
  const sceneImages = clone(callSync(engine, 'sceneImageProbe'));
  const interactionOwnership = resourceEngine !== null &&
    Object.hasOwn(resourceEngine, 'interactionOwnership')
    ? clone(resourceEngine.interactionOwnership)
    : clone(callSync(engine, 'interactionOwnershipProbe'));
  const history = clone(callSync(engine, 'historyState'));
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

function clone(value) {
  return structuredClone(value);
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
