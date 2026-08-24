import { clone } from '../../value-atoms.mjs';

import {
  ZERO_RESOURCE_RELEASE,
  isolatedFailureSnapshot,
  sceneRevisionFromSnapshot,
  publicDiagnosticFromError,
  publicDiagnosticFromResult,
  ensureBaseline,
  ensureInitializedEngine,
  currentEngine,
  observeProduct,
  observeChangeEvents,
  geometryActionFacts,
  mergeBaseline,
  currentRecord,
  hierarchyElementFacts,
  hierarchyChildCount,
  targetRecords,
  componentCollectionFacts,
  componentFact,
  requireComponentFact,
  componentReleaseExpectation,
  allComponentIds,
  relationFacts,
  resourceDelta,
  interactionOwnershipFacts,
  settleUpdateResources,
  sceneAuthority,
  sceneRevision,
  attachAsyncMonitor,
  resolveBaselineDataset,
  createDeferred,
  asyncTemporaryFacts,
  persistedDatasetParts,
  stableDatasetIds,
  liveOverlayOperations,
  refreshTargets,
  bulkOverlayOperations,
  syntheticTargetIds,
  patchChanges,
  resolvedTargetObservation,
  visibleCenter,
  recordBounds,
  recordCoordinate,
  geometryEntityById,
  selectGeometryTarget,
  readFixtureReference,
  projectDeclaredPaths,
  fixtureReference,
  componentTargetFromValue,
  elementTarget,
  componentTarget,
  inputObservation,
  fingerprintValue,
  callSync,
  call,
  exactOperands,
  assertExactKeys,
  stringArray,
  arrayValue,
  stringValue,
  booleanValue,
  finiteNumber,
  positiveInteger,
  nonNegativeInteger,
  recordValue,
  isRecord,
  isDeepFrozen,
  deepFreeze,
  assert,
} from './support.mjs';

export async function loadContractDatasetAction(adapter, state, context, action) {
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

export async function runInvalidOperationMatrixAction(adapter, state, context, action) {
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


export async function loadDatasetAction(adapter, state, context, action) {
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

export function setSelectionAction(adapter, state, context, action) {
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

export function moveAcrossParentsAction(adapter, state, context, action) {
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

export function groupAction(adapter, state, context, action) {
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

export function ungroupAction(adapter, state, context, action) {
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

export async function retainTargetAction(adapter, state, context, action) {
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

export async function replaceDatasetAction(adapter, state, context, action) {
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

export function resolveTargetAction(adapter, state, context, action) {
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

export async function patchAction(adapter, state, context, action) {
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

export async function freezePatchAction(adapter, state, context, action) {
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

export function mergeAction(adapter, state, context, action) {
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

export async function replaceAction(adapter, state, context, action) {
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

export async function relativePatchAction(adapter, state, context, action) {
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

export async function resizeAroundOriginAction(adapter, state, context, action) {
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

export async function bulkPatchAction(adapter, state, context, action) {
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

export async function generateSyntheticSceneAction(adapter, state, context, action) {
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

export function bulkOverlayAction(adapter, state, context, action) {
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

export async function publishFrameAction(adapter, state, context, action) {
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

export async function captureObservationAction(adapter, state, context, action) {
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

export async function reconcileComponentsAction(adapter, state, context, action) {
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

export async function setComponentVisibilityAction(adapter, state, context, action) {
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

export async function setVisibilityAction(adapter, state, context, action) {
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

export async function removeAction(adapter, state, context, action) {
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

export async function startAsyncRevisionAction(adapter, state, context, action) {
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

export async function completeAsyncRevisionAction(adapter, state, context, action) {
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

export async function destroyAsyncRevisionAction(adapter, state, context, action) {
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

export async function setHighlightPolicyAction(adapter, state, context, action) {
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

export async function setLayerVisibilityAction(adapter, state, context, action) {
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

export async function clearPresentationPolicyAction(adapter, state, context, action) {
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

export async function streamOverlayAction(adapter, state, context, action) {
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

export async function snapshotAction(adapter, state, context, action) {
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

export async function replaceExternalDependencyAction(adapter, state, context, action) {
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

export async function refreshAction(adapter, state, context, action) {
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
