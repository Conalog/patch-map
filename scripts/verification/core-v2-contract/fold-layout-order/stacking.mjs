import {
  actionActualAt,
  assert,
  assertExactKeys,
  assertUint32,
  booleanValue,
  clone,
  cloneArray,
  cloneRecord,
  finiteNumber,
  isPlainObject,
  nonNegativeInteger,
  notExercised,
  projectCaptures,
  projectCase,
  projectRevisions,
  recordValue,
  sameJson,
  stringArray,
  stringValue,
  traceAction,
  validateInputEvidence,
  validateJsonValue,
  validateProductCleanup,
} from './values.mjs';

const STACKING_CASE_TRACE = Object.freeze([
  traceAction('loadDataset', { datasetId: 'stacking' }),
  traceAction('patch', {
    targetId: 'low',
    changes: { attrs: { zIndex: 6 } },
  }),
  traceAction('undo', { timeMs: 10 }),
  traceAction('redo', { timeMs: 20 }),
]);

/** Fold shared LAY-002/LAY-003 public Engine evidence into fourteen domains. */

export function projectStackingExecution(input, revisions) {
  const plan = validateStackingCasePlan(input.casePlan);
  const execution = validateStackingExecution(input.execution, plan, revisions);
  const loaded = actionActualAt(execution, 0, 'loadDataset');
  const patched = actionActualAt(execution, 1, 'patch');
  const undone = actionActualAt(execution, 2, 'undo');
  const redone = actionActualAt(execution, 3, 'redo');
  const actions = [loaded, patched, undone, redone];
  const paints = actions.map((action, index) => (
    stackingPaintEvidence(action.paint, `stacking action ${index} paint`)
  ));
  const products = actions.map((action, index) => (
    stackingProductEvidence(action.product, `stacking action ${index} product`)
  ));
  products.forEach((product, index) => {
    assert(
      sameJson(product.paint, paints[index]),
      `stacking action ${index} public paint correlation`,
    );
  });
  assert(loaded.caseId === plan.id, 'stacking load case ID');
  assert(loaded.datasetId === 'stacking', 'stacking dataset ID');
  const authored = authoredStackingProfile(plan.fixture.setup.params);
  assert(
    authored.siblings.some(({ id }) => id === loaded.selectionId),
    'stacking selection identity',
  );
  assert(patched.targetId === 'low', 'stacking patch target');
  assert(sameJson(patched.changes, { attrs: { zIndex: 6 } }), 'stacking patch changes');
  validateCommittedMutation(patched.mutation, 'stacking patch mutation');
  validateCommittedTransition(undone, 'undo', 10);
  validateCommittedTransition(redone, 'redo', 20);

  const initialExpected = calculateStackingOrder(authored.siblings, authored.overlays);
  const patchedSiblings = patchAuthoredSiblings(authored.siblings, 'low', 6);
  const patchedExpected = calculateStackingOrder(patchedSiblings, authored.overlays);
  const observedOrders = paints.map(({ renderOrder }) => renderOrder);
  const orderChecks = [
    sameJson(observedOrders[0], initialExpected),
    sameJson(observedOrders[1], patchedExpected),
    sameJson(observedOrders[2], initialExpected),
    sameJson(observedOrders[3], patchedExpected),
  ];
  const equalZOrder = observedEqualZOrder(paints[0]);
  const inputUnchanged = actions.every((action, index) => (
    booleanValue(
      recordValue(action.input, `stacking action ${index} input`).unchanged,
      `stacking action ${index} input unchanged`,
    )
  ));
  const finalPaint = paints[3];
  const finalHistory = recordValue(finalPaint.history, 'final paint history');
  const historyDepth = nonNegativeInteger(finalHistory.undoDepth, 'final history undo depth');
  assert(
    historyDepth === nonNegativeInteger(
      execution.terminalSnapshot.historyDepth,
      'terminal history depth',
    ),
    'terminal history correlation',
  );

  const actual = {
    $schema: revisions.observation,
    case: projectCase(plan, execution),
    provenance: cloneRecord(input.provenance, 'provenance'),
    environment: cloneRecord(input.environment, 'environment'),
    revisions: projectRevisions(execution.terminalSnapshot),
    scene: {
      _availability: {
        paintOrderProbe: 'available',
        stableHierarchyOrder: 'available',
      },
      revision: finiteNumber(
        recordValue(execution.terminalSnapshot.revisions, 'terminal revisions').sceneRevision,
        'terminal scene revision',
      ),
      rootIds: cloneArray(execution.terminalSnapshot.rootIds, 'terminal root IDs'),
      initial: { renderOrder: [...observedOrders[0]] },
      afterPatch: { renderOrder: [...observedOrders[1]] },
      afterUndo: { renderOrder: [...observedOrders[2]] },
      afterRedo: { renderOrder: [...observedOrders[3]] },
      hierarchy: {
        equalZOrder,
        nodeCount: finalPaint.hierarchyNodeCount,
      },
    },
    geometry: notExercised('stacking-actions-do-not-assert-geometry'),
    text: notExercised('stacking-actions-do-not-observe-text'),
    paint: {
      _availability: { paintOrderProbe: 'available' },
      commandCount: finalPaint.rendererCommandCount,
      publication: finalPaint.publication,
      overlays: clone(finalPaint.overlays),
    },
    interaction: {
      _availability: { aggregateOverlays: 'available' },
      selectionOverlayVisible: finalPaint.overlays.selection,
      transformerOverlayVisible: finalPaint.overlays.transformer,
    },
    events: {
      _availability: { eventJournal: 'available' },
      journal: cloneArray(execution.eventJournal, 'event journal'),
    },
    history: {
      _availability: { paintOrderProbe: 'available', terminalSnapshot: 'available' },
      depth: historyDepth,
      state: clone(finalHistory),
    },
    accessibility: notExercised('stacking-actions-do-not-observe-accessibility'),
    outcome: {
      _availability: {
        actionResults: 'available',
        independentOrderRelations: 'available',
      },
      layoutOrder: {
        inputUnchanged,
        allOrdersExact: orderChecks.every(Boolean),
        equalZStable: sameJson(equalZOrder, authoredEqualZOrder(authored.siblings)),
        overlaysStable: paints.every(({ overlays }) => (
          sameJson(overlays.order, authored.overlays)
            && overlays.selection
            && overlays.transformer
        )),
      },
      actionResults: execution.actionResults.map(({ index, type, status }) => ({
        index,
        type,
        status,
      })),
    },
    resources: {
      _availability: {
        cleanup: 'available',
        productRuntimeCleanup: 'available',
        terminalSnapshot: 'available',
      },
      cleanup: clone(execution.cleanup),
      terminal: cloneRecord(execution.terminalSnapshot.resources, 'terminal resources'),
    },
  };

  return {
    actual,
    fixtures: projectStackingFixtures(plan),
    captures: projectCaptures(plan, execution),
  };
}
function validateStackingCasePlan(casePlan) {
  validateJsonValue(casePlan, 'casePlan', new WeakSet());
  assert(casePlan.id === 'LAY-003', 'stacking case ID');
  assert(casePlan.caseType === 'capability', 'stacking caseType');
  assert(isPlainObject(casePlan.fixture), 'stacking fixture');
  assert(isPlainObject(casePlan.fixture.setup), 'stacking fixture setup');
  assert(isPlainObject(casePlan.fixture.setup.params), 'stacking fixture params');
  assert(isPlainObject(casePlan.routeParams), 'stacking routeParams');
  assert(typeof casePlan.routeParams.size === 'string', 'stacking route size');
  assertUint32(casePlan.routeParams.seed, 'stacking route seed');
  validateStackingFixtureParams(casePlan.fixture.setup.params);
  const fixtureActions = casePlan.fixture.actionTrace;
  assert(Array.isArray(fixtureActions), 'stacking fixture actionTrace');
  assert(Array.isArray(casePlan.actionTrace), 'stacking materialized actionTrace');
  assert(sameJson(fixtureActions, casePlan.actionTrace), 'stacking actionTrace drift');
  assert(fixtureActions.length === STACKING_CASE_TRACE.length, 'stacking action count');
  fixtureActions.forEach((action, index) => {
    const trace = STACKING_CASE_TRACE[index];
    assert(isPlainObject(action), `stacking action ${index}`);
    assertExactKeys(action, ['index', 'operands', 'type'], `stacking action ${index}`);
    assert(action.index === index, `stacking action ${index} index`);
    assert(action.type === trace.type, `stacking action ${index} type`);
    assert(sameJson(action.operands, trace.operands), `stacking action ${index} operands`);
  });
  const checkpoints = casePlan.fixture.captureCheckpoints;
  assert(
    Array.isArray(checkpoints) && checkpoints.length === 0,
    'stacking capture checkpoints',
  );
  const cleanupTrace = casePlan.fixture.cleanupTrace;
  assert(sameJson(cleanupTrace, [{
    type: 'destroy-case',
    operands: { expectedResourceDelta: 0 },
  }]), 'stacking cleanup trace drift');
  return { ...casePlan, actionTrace: fixtureActions, checkpoints, cleanupTrace };
}

function validateStackingFixtureParams(value) {
  const params = recordValue(value, 'stacking fixture params');
  assertExactKeys(params, ['overlays', 'siblings'], 'stacking fixture params');
  stackingSiblings(params.siblings, 'stacking fixture siblings');
  const overlays = stringArray(params.overlays, 'stacking fixture overlays');
  assert(
    overlays.length === 2 && overlays[0] === 'selection' && overlays[1] === 'transformer',
    'stacking fixture overlay order',
  );
}

function validateStackingExecution(execution, plan, revisions) {
  validateJsonValue(execution, 'stacking execution', new WeakSet());
  assert(execution.$schema === revisions.execution, 'stacking execution schema');
  assert(execution.caseId === plan.id, 'stacking execution case ID');
  assert(execution.caseType === plan.caseType, 'stacking execution caseType');
  assert(execution.status === 'completed', 'stacking execution status');
  assert(execution.error === null, 'stacking execution error');
  assert(execution.hostSeamDelta === null, 'stacking capability host seam');
  assert(Array.isArray(execution.actionResults), 'stacking actionResults');
  assert(
    execution.actionResults.length === STACKING_CASE_TRACE.length,
    'stacking action result count',
  );
  const inputEvidenceByAction = [];
  execution.actionResults.forEach((result, index) => {
    const trace = STACKING_CASE_TRACE[index];
    assert(isPlainObject(result), `stacking action result ${index}`);
    assert(result.index === index, `stacking action result ${index} index`);
    assert(result.type === trace.type, `stacking action result ${index} type`);
    assert(
      result.handlerId === `contract/${trace.type}`,
      `stacking action result ${index} handler`,
    );
    assert(result.status === 'completed', `stacking action result ${index} status`);
    const startedAtMs = finiteNumber(
      result.startedAtMs,
      `stacking action result ${index} startedAtMs`,
    );
    const completedAtMs = finiteNumber(
      result.completedAtMs,
      `stacking action result ${index} completedAtMs`,
    );
    assert(completedAtMs >= startedAtMs, `stacking action result ${index} timing`);
    const delta = recordValue(result.delta, `stacking action result ${index} delta`);
    assert(delta.$schema === revisions.delta, `stacking action result ${index} delta schema`);
    assert(delta.caseId === plan.id, `stacking action result ${index} delta case`);
    assert(delta.actionIndex === index, `stacking action result ${index} delta index`);
    assert(delta.actionType === trace.type, `stacking action result ${index} delta type`);
    const actual = recordValue(delta.actual, `stacking action result ${index} actual`);
    const semanticProbe = recordValue(
      delta.semanticProbe,
      `stacking action result ${index} semantic probe`,
    );
    inputEvidenceByAction.push(
      validateInputEvidence(actual.input, `stacking action result ${index} input`),
    );
    const product = stackingProductEvidence(
      actual.product,
      `stacking action result ${index} product`,
    );
    assert(
      sameJson(semanticProbe, product.semanticProbe),
      `stacking action result ${index} semantic correlation`,
    );
  });
  assert(
    inputEvidenceByAction.every((input) => sameJson(input, inputEvidenceByAction[0])),
    'stacking action input fingerprint correlation',
  );
  assert(
    Array.isArray(execution.captures) && execution.captures.length === 0,
    'stacking execution captures',
  );
  assert(Array.isArray(execution.eventJournal), 'stacking event journal');
  assert(
    Array.isArray(execution.eventJournalFailures) && execution.eventJournalFailures.length === 0,
    'stacking event journal failures',
  );
  assert(
    isPlainObject(execution.bindings) && Object.keys(execution.bindings).length === 0,
    'stacking bindings',
  );
  assert(
    isPlainObject(execution.datasetObservations)
      && Object.keys(execution.datasetObservations).length === 0,
    'stacking dataset observations',
  );
  assert(isPlainObject(execution.terminalSnapshot), 'stacking terminal snapshot');
  assert(execution.terminalSnapshot.lifecycle === 'scene-ready', 'stacking terminal lifecycle');
  const terminalSemanticProbe = recordValue(
    execution.terminalSemanticProbe,
    'stacking terminal semantic probe',
  );
  const finalActual = actionActualAt(execution, STACKING_CASE_TRACE.length - 1, 'redo');
  const finalProduct = stackingProductEvidence(finalActual.product, 'stacking final product');
  assert(
    sameJson(execution.terminalSnapshot, finalProduct.snapshot),
    'stacking terminal snapshot correlation',
  );
  assert(
    sameJson(terminalSemanticProbe, finalProduct.semanticProbe),
    'stacking terminal semantic correlation',
  );
  assert(isPlainObject(execution.cleanup), 'stacking cleanup');
  assert(execution.cleanup.status === 'completed', 'stacking cleanup status');
  assert(
    Array.isArray(execution.cleanup.errors) && execution.cleanup.errors.length === 0,
    'stacking cleanup errors',
  );
  assert(
    sameJson(execution.cleanup.declaredActions, ['destroy-case']),
    'stacking cleanup declared actions',
  );
  assert(
    Array.isArray(execution.cleanup.releases) && execution.cleanup.releases.length > 0,
    'stacking cleanup releases',
  );
  const resourceDelta = plan.cleanupTrace[0].operands.expectedResourceDelta;
  assert(execution.cleanup.releases.every((release, index) => {
    const remaining = recordValue(
      release.remainingResources,
      `stacking cleanup release ${index} resources`,
    );
    return ['canvasCount', 'subscriptions', 'pendingWork'].every((field) => (
      nonNegativeInteger(remaining[field], `stacking cleanup release ${index} ${field}`)
        === resourceDelta
    ));
  }), 'stacking cleanup resource delta');
  validateProductCleanup(execution.cleanup.productResources, plan.id, revisions.productCleanup);
  return execution;
}

function stackingProductEvidence(value, label) {
  const product = recordValue(value, label);
  assertExactKeys(
    product,
    [
      'datasetFidelity',
      'exportedDataset',
      'paintOrderProbe',
      'runtime',
      'semanticProbe',
      'snapshot',
    ],
    label,
  );
  const snapshot = recordValue(product.snapshot, `${label}.snapshot`);
  assert(snapshot.lifecycle === 'scene-ready', `${label}.snapshot lifecycle`);
  const revisions = recordValue(snapshot.revisions, `${label}.snapshot revisions`);
  const publishedTuple = recordValue(snapshot.publishedTuple, `${label}.snapshot published tuple`);
  assert(
    publishedTuple.scene === revisions.sceneRevision
      && publishedTuple.view === revisions.viewRevision
      && publishedTuple.interaction === revisions.interactionRevision,
    `${label}.snapshot publication correlation`,
  );
  assert(
    nonNegativeInteger(snapshot.frameRevision, `${label}.snapshot frame revision`) > 0,
    `${label}.snapshot published frame`,
  );
  const semanticProbe = recordValue(product.semanticProbe, `${label}.semanticProbe`);
  const paint = projectStackingProductPaint(product.paintOrderProbe, `${label}.paintOrderProbe`);
  assert(paint.publication === 'current', `${label}.paint publication`);
  assert(
    sameJson(paint.revisions, revisions)
      && sameJson(paint.publishedTuple, publishedTuple)
      && paint.frameRevision === snapshot.frameRevision,
    `${label}.paint revision correlation`,
  );
  const history = recordValue(paint.history, `${label}.paint history`);
  assert(
    nonNegativeInteger(snapshot.historyDepth, `${label}.snapshot history depth`)
      === nonNegativeInteger(history.undoDepth, `${label}.paint undo depth`),
    `${label}.paint history correlation`,
  );
  assert(
    Array.isArray(product.exportedDataset) && product.exportedDataset.length > 0,
    `${label}.exportedDataset`,
  );
  const fidelity = recordValue(product.datasetFidelity, `${label}.dataset fidelity`);
  assertExactKeys(
    fidelity,
    ['expectedProfileFingerprint', 'exportedProfileFingerprint', 'unchanged'],
    `${label}.dataset fidelity`,
  );
  const expectedFingerprint = stringValue(
    fidelity.expectedProfileFingerprint,
    `${label}.expected profile fingerprint`,
  );
  const exportedFingerprint = stringValue(
    fidelity.exportedProfileFingerprint,
    `${label}.exported profile fingerprint`,
  );
  assert(expectedFingerprint === exportedFingerprint, `${label}.dataset fidelity correlation`);
  assert(
    booleanValue(fidelity.unchanged, `${label}.dataset unchanged`),
    `${label}.dataset unchanged`,
  );
  const runtime = recordValue(product.runtime, `${label}.runtime`);
  assert(runtime.revision === 'core-v2-layout-order-runtime/1', `${label}.runtime revision`);
  assert(runtime.caseId === 'LAY-003', `${label}.runtime case ID`);
  const ownership = recordValue(runtime.ownership, `${label}.runtime ownership`);
  assert(
    ['activeSessionCount', 'retainedDatasetCount', 'rendererObjectCount', 'subscriptionCount', 'pendingWorkCount']
      .every((field) => nonNegativeInteger(ownership[field], `${label}.runtime ${field}`) === 0),
    `${label}.runtime ownership drain`,
  );
  recordValue(runtime.stats, `${label}.runtime stats`);
  assert(Array.isArray(runtime.journal), `${label}.runtime journal`);
  return { snapshot, semanticProbe, paint, exportedDataset: product.exportedDataset };
}

function projectStackingProductPaint(value, label) {
  const probe = recordValue(value, label);
  const plan = recordValue(probe.plan, `${label}.plan`);
  assert(Array.isArray(plan.visibleEntries), `${label}.visibleEntries`);
  return stackingPaintEvidence({
    sceneRevision: probe.sceneRevision,
    rendererFrame: probe.rendererFrame,
    publication: probe.publication,
    hierarchyNodeCount: probe.hierarchyNodeCount,
    rendererCommandCount: probe.rendererCommandCount,
    overlays: probe.overlays,
    renderOrder: plan.renderOrder,
    visibleEntries: plan.visibleEntries.map((value, index) => {
      const entry = recordValue(value, `${label}.visibleEntries[${index}]`);
      return {
        publicId: entry.publicId,
        entityId: entry.entityId,
        kind: entry.kind,
        lane: entry.lane,
        zIndex: entry.zIndex,
        authoredOrder: entry.authoredOrder,
        pass: entry.pass,
        phase: entry.phase,
        paintIndex: entry.paintIndex,
        visible: entry.visible,
      };
    }),
    history: probe.history,
    revisions: probe.revisions,
    publishedTuple: probe.publishedTuple,
    frameRevision: probe.frameRevision,
  }, label);
}

function stackingPaintEvidence(value, label) {
  const paint = recordValue(value, label);
  assertExactKeys(
    paint,
    [
      'frameRevision',
      'hierarchyNodeCount',
      'history',
      'overlays',
      'publication',
      'publishedTuple',
      'renderOrder',
      'rendererCommandCount',
      'rendererFrame',
      'revisions',
      'sceneRevision',
      'visibleEntries',
    ],
    label,
  );
  const renderOrder = stringArray(paint.renderOrder, `${label}.renderOrder`);
  assert(Array.isArray(paint.visibleEntries), `${label}.visibleEntries`);
  const visibleEntries = paint.visibleEntries.map((value, index) => {
    const entry = recordValue(value, `${label}.visibleEntries[${index}]`);
    assertExactKeys(
      entry,
      [
        'authoredOrder',
        'entityId',
        'kind',
        'lane',
        'paintIndex',
        'pass',
        'phase',
        'publicId',
        'visible',
        'zIndex',
      ],
      `${label}.visibleEntries[${index}]`,
    );
    return {
      publicId: stringValue(entry.publicId, `${label}.visibleEntries[${index}].publicId`),
      entityId: stringValue(entry.entityId, `${label}.visibleEntries[${index}].entityId`),
      kind: stringValue(entry.kind, `${label}.visibleEntries[${index}].kind`),
      lane: stringValue(entry.lane, `${label}.visibleEntries[${index}].lane`),
      zIndex: finiteNumber(entry.zIndex, `${label}.visibleEntries[${index}].zIndex`),
      authoredOrder: nonNegativeInteger(
        entry.authoredOrder,
        `${label}.visibleEntries[${index}].authoredOrder`,
      ),
      pass: nonNegativeInteger(entry.pass, `${label}.visibleEntries[${index}].pass`),
      phase: stringValue(entry.phase, `${label}.visibleEntries[${index}].phase`),
      paintIndex: nonNegativeInteger(
        entry.paintIndex,
        `${label}.visibleEntries[${index}].paintIndex`,
      ),
      visible: booleanValue(entry.visible, `${label}.visibleEntries[${index}].visible`),
    };
  });
  assert(
    sameJson(renderOrder, visibleEntries.map(({ publicId }) => publicId)),
    `${label}.visible order correlation`,
  );
  assert(new Set(renderOrder).size === renderOrder.length, `${label}.render identities`);
  const overlaysValue = recordValue(paint.overlays, `${label}.overlays`);
  assertExactKeys(
    overlaysValue,
    ['order', 'renderObjectCount', 'selectedEntityCount', 'selection', 'transformer'],
    `${label}.overlays`,
  );
  const overlays = {
    order: stringArray(overlaysValue.order, `${label}.overlay order`),
    selection: booleanValue(overlaysValue.selection, `${label}.selection overlay`),
    transformer: booleanValue(overlaysValue.transformer, `${label}.transformer overlay`),
    selectedEntityCount: nonNegativeInteger(
      overlaysValue.selectedEntityCount,
      `${label}.selected entity count`,
    ),
    renderObjectCount: nonNegativeInteger(
      overlaysValue.renderObjectCount,
      `${label}.overlay render object count`,
    ),
  };
  const revisions = cloneRecord(paint.revisions, `${label}.revisions`);
  const publishedTuple = cloneRecord(paint.publishedTuple, `${label}.publishedTuple`);
  const sceneRevision = nonNegativeInteger(paint.sceneRevision, `${label}.sceneRevision`);
  const frameRevision = nonNegativeInteger(paint.frameRevision, `${label}.frameRevision`);
  assert(sceneRevision > 0, `${label}.product scene revision`);
  assert(
    publishedTuple.scene === revisions.sceneRevision
      && publishedTuple.view === revisions.viewRevision
      && publishedTuple.interaction === revisions.interactionRevision,
    `${label}.revision correlation`,
  );
  assert(frameRevision > 0, `${label}.published frame`);
  return {
    sceneRevision,
    rendererFrame: nonNegativeInteger(paint.rendererFrame, `${label}.rendererFrame`),
    publication: stringValue(paint.publication, `${label}.publication`),
    hierarchyNodeCount: nonNegativeInteger(
      paint.hierarchyNodeCount,
      `${label}.hierarchyNodeCount`,
    ),
    rendererCommandCount: nonNegativeInteger(
      paint.rendererCommandCount,
      `${label}.rendererCommandCount`,
    ),
    overlays,
    renderOrder,
    visibleEntries,
    history: cloneRecord(paint.history, `${label}.history`),
    revisions,
    publishedTuple,
    frameRevision,
  };
}

function authoredStackingProfile(paramsValue) {
  const params = recordValue(paramsValue, 'stacking fixture params');
  return {
    siblings: stackingSiblings(params.siblings, 'stacking authored siblings'),
    overlays: stringArray(params.overlays, 'stacking authored overlays'),
  };
}

function stackingSiblings(value, label) {
  assert(Array.isArray(value) && value.length > 0, label);
  const siblings = value.map((value, index) => {
    const sibling = recordValue(value, `${label}[${index}]`);
    assertExactKeys(sibling, ['id', 'zIndex'], `${label}[${index}]`);
    return {
      id: stringValue(sibling.id, `${label}[${index}].id`),
      zIndex: finiteNumber(sibling.zIndex, `${label}[${index}].zIndex`),
      authoredOrder: index,
    };
  });
  assert(new Set(siblings.map(({ id }) => id)).size === siblings.length, `${label} IDs`);
  return siblings;
}

function calculateStackingOrder(siblings, overlays) {
  return [
    ...siblings
      .map((sibling) => ({ ...sibling }))
      .sort((left, right) => left.zIndex - right.zIndex || left.authoredOrder - right.authoredOrder)
      .map(({ id }) => id),
    ...overlays,
  ];
}

function patchAuthoredSiblings(siblings, targetId, zIndex) {
  let matched = 0;
  const patched = siblings.map((sibling) => {
    if (sibling.id !== targetId) return { ...sibling };
    matched += 1;
    return { ...sibling, zIndex };
  });
  assert(matched === 1, 'authored stacking patch target');
  return patched;
}

function observedEqualZOrder(paint) {
  const sceneEntries = paint.visibleEntries.filter(({ phase }) => phase === 'scene');
  const counts = new Map();
  for (const entry of sceneEntries) counts.set(entry.zIndex, (counts.get(entry.zIndex) ?? 0) + 1);
  return sceneEntries
    .filter(({ zIndex }) => counts.get(zIndex) > 1)
    .map(({ publicId }) => publicId);
}

function authoredEqualZOrder(siblings) {
  const counts = new Map();
  for (const sibling of siblings) {
    counts.set(sibling.zIndex, (counts.get(sibling.zIndex) ?? 0) + 1);
  }
  return siblings
    .filter(({ zIndex }) => counts.get(zIndex) > 1)
    .map(({ id }) => id);
}

function validateCommittedMutation(value, label) {
  const mutation = recordValue(value, label);
  assert(mutation.status === 'committed', `${label} status`);
  assert(booleanValue(mutation.changed, `${label} changed`), `${label} changed`);
}

function validateCommittedTransition(action, direction, timeMs) {
  assert(action.direction === direction, `${direction} direction`);
  assert(action.timeMs === timeMs, `${direction} time`);
  const transition = recordValue(action.transition, `${direction} transition`);
  assert(transition.status === 'committed', `${direction} transition status`);
  assert(transition.direction === direction, `${direction} transition direction`);
  assert(
    booleanValue(transition.changed, `${direction} transition changed`),
    `${direction} transition changed`,
  );
}

function projectStackingFixtures(plan) {
  const params = plan.fixture.setup.params;
  return {
    siblings: clone(params.siblings),
    overlays: clone(params.overlays),
  };
}
