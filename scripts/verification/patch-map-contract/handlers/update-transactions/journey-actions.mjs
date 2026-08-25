import { clone } from '../../value-atoms.mjs';

import {
  isolatedFailureSnapshot,
  sceneRevisionFromSnapshot,
  publicDiagnosticFromError,
  publicDiagnosticFromResult,
  ensureInitializedEngine,
  currentEngine,
  observeProduct,
  currentRecord,
  sceneRevision,
  patchChanges,
  geometryEntityById,
  elementTarget,
  componentTarget,
  inputObservation,
  fingerprintValue,
  callSync,
  call,
  exactOperands,
  assertExactKeys,
  stringArray,
  integerArray,
  arrayValue,
  mutationTargetIds,
  stringValue,
  booleanValue,
  finiteNumber,
  positiveInteger,
  nonNegativeInteger,
  recordValue,
  deepFreeze,
  assert,
} from './support.mjs';

export async function loadJourneySceneAction(adapter, state, context, action) {
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

export function applyJourneyMergeAction(adapter, state, context, action) {
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

export async function redrawJourneySceneAction(adapter, state, context, action) {
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

export function applyJourneyLiveOverlayAction(adapter, state, context, action) {
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

export async function awaitJourneyFrameAction(adapter, state, context, action) {
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

export async function submitJourneyOverlayRevisionAction(adapter, state, context, action) {
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

export function completeJourneyOverlayRevisionsAction(adapter, state, context, action) {
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

export async function destroyJourneyEngineAction(adapter, state, context, action) {
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

export function applyJourneyPresentationOverlayAction(adapter, state, context, action) {
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

export function exportJourneyCanonicalDatasetAction(adapter, state, context, action) {
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

export async function applyViewColumnAction(adapter, state, context, action) {
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

export async function remountAndRestoreColumnAction(adapter, state, context, action) {
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

export async function probeJourneyDeclaredFailureAction(adapter, state, context, action) {
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
