import { clone } from './value-atoms.mjs';

export const LAYOUT_ORDER_FOLD_REVISION = 'core-v2-layout-order-fold/1';

const OBSERVATION_REVISION = 'core-v2-semantic-observation/1';
const EXECUTION_REVISION = 'core-v2-contract-case-execution/1';
const DELTA_REVISION = 'core-v2-semantic-observation-delta/1';
const PRODUCT_CLEANUP_REVISION = 'core-v2-layout-order-cleanup/1';
const DOMAIN_NAMES = Object.freeze([
  'case',
  'provenance',
  'environment',
  'revisions',
  'scene',
  'geometry',
  'text',
  'paint',
  'interaction',
  'events',
  'history',
  'accessibility',
  'outcome',
  'resources',
]);
const PLACEMENTS = Object.freeze([
  'left',
  'left-top',
  'left-bottom',
  'top',
  'right',
  'right-top',
  'right-bottom',
  'bottom',
  'center',
  'none',
]);
const PLACEMENT_CASE_TRACE = Object.freeze([
  traceAction('loadPlacementMatrix', { itemId: 'item' }),
  traceAction('observeBounds', { ownerId: 'item' }),
  traceAction('observePlacementMatrix', { valueRef: 'placementMatrix' }),
]);
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
export function foldLayoutOrderExecution(options) {
  const input = validateOptions(options);
  if (input.casePlan.id === 'LAY-002') return foldPlacementExecution(input);
  if (input.casePlan.id === 'LAY-003') return foldStackingExecution(input);
  throw new Error(`Core v2 layout-order fold invalid: unsupported case ${String(input.casePlan.id)}`);
}

function foldPlacementExecution(input) {
  const plan = validatePlacementCasePlan(input.casePlan);
  const execution = validatePlacementExecution(input.execution, plan);
  const loaded = actionActualAt(execution, 0, 'loadPlacementMatrix');
  const bounded = actionActualAt(execution, 1, 'observeBounds');
  const observed = actionActualAt(execution, 2, 'observePlacementMatrix');
  const authored = authoredPlacementProfile(plan.fixture.setup.params);
  const boundsEvidence = placementEvidence(bounded.placements, 'observeBounds placements');
  const matrix = placementEvidence(observed.placements, 'observed placements');
  const repeated = placementEvidence(observed.repeatPlacements, 'repeat placements');
  const loadedProduct = placementProductEvidence(loaded.product, 'load product');
  const boundsProduct = placementProductEvidence(bounded.product, 'bounds product');
  const observedProduct = placementProductEvidence(observed.product, 'matrix product');
  assert(loaded.caseId === plan.id, 'loaded case ID');
  assert(loaded.itemId === 'item', 'loaded item ID');
  assert(
    nonNegativeInteger(loaded.componentCount, 'loaded component count')
      === authored.placements.length,
    'loaded component count correlation',
  );
  assert(bounded.ownerId === 'item', 'bounds owner ID');
  assert(sameJson(bounded.owner, boundsEvidence.owner), 'bounds owner correlation');
  assert(observed.valueRef === 'placementMatrix', 'placement matrix valueRef');
  assert(sameJson(matrix.order, authored.placements), 'observed placement descriptor order');
  assert(sameJson(boundsEvidence.order, authored.placements), 'bounds placement descriptor order');
  assert(sameJson(repeated.order, authored.placements), 'repeat placement descriptor order');
  validateProductProjection(loadedProduct, boundsEvidence, authored, 'load product');
  validateProductProjection(boundsProduct, boundsEvidence, authored, 'bounds product');
  validateProductProjection(observedProduct, matrix, authored, 'matrix product');
  assert(
    sameJson(loadedProduct.exportedDataset, boundsProduct.exportedDataset)
      && sameJson(boundsProduct.exportedDataset, observedProduct.exportedDataset),
    'exported dataset drift',
  );

  const relationChecks = validateAuthoredRelations(matrix, authored);
  const ownerRelationExact = validateAuthoredOwner(matrix.owner, authored);
  const allRelationsExact = ownerRelationExact && relationChecks.every((row) => row.allExact);
  const inputUnchanged = [loaded, bounded, observed].every((action, index) => (
    booleanValue(recordValue(action.input, `action ${index} input`).unchanged, `action ${index} input unchanged`)
  ));
  const deterministic = booleanValue(observed.deterministic, 'placement deterministic')
    && sameJson(matrix, repeated);
  const complete = booleanValue(observed.complete, 'placement complete')
    && matrix.rows.length === authored.placements.length;
  const boundsStable = sameJson(boundsEvidence.owner, matrix.owner)
    && sameJson(boundsEvidence.rows, matrix.rows);
  const placements = projectPlacements(matrix);

  const actual = {
    $schema: OBSERVATION_REVISION,
    case: projectCase(plan, execution),
    provenance: cloneRecord(input.provenance, 'provenance'),
    environment: cloneRecord(input.environment, 'environment'),
    revisions: projectRevisions(execution.terminalSnapshot),
    scene: projectScene(execution.terminalSnapshot),
    geometry: {
      _availability: {
        publicGeometryProbe: 'available',
        ownerRelativePlacement: 'available',
      },
      finiteValueCount: countFiniteNumbers({ placements, owner: matrix.owner }),
      placements,
      validation: {
        complete,
        deterministic,
        boundsStable,
        inputUnchanged,
        allRelationsExact,
        ownerRelationExact,
        rows: relationChecks,
      },
    },
    text: notExercised('placement-bars-do-not-observe-text'),
    paint: notExercised('placement-actions-do-not-assert-paint'),
    interaction: notExercised('placement-actions-do-not-observe-interaction'),
    events: {
      _availability: { eventJournal: 'available' },
      journal: cloneArray(execution.eventJournal, 'event journal'),
    },
    history: {
      _availability: { terminalSnapshot: 'available' },
      depth: nonNegativeInteger(execution.terminalSnapshot.historyDepth, 'terminal history depth'),
    },
    accessibility: notExercised('placement-actions-do-not-observe-accessibility'),
    outcome: {
      _availability: {
        actionResults: 'available',
        independentGeometryRelations: 'available',
      },
      layoutOrder: {
        complete,
        deterministic,
        boundsStable,
        inputUnchanged,
        allRelationsExact,
      },
      actionResults: execution.actionResults.map((result) => ({
        index: result.index,
        type: result.type,
        status: result.status,
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

  assert(
    DOMAIN_NAMES.every((domain) => isPlainObject(actual[domain])),
    'actual must contain all fourteen object domains',
  );
  validateJsonValue(actual, 'actual', new WeakSet());
  return deepFreeze({
    actual,
    fixtures: projectPlacementFixtures(plan),
    captures: projectCaptures(plan, execution),
  });
}

function foldStackingExecution(input) {
  const plan = validateStackingCasePlan(input.casePlan);
  const execution = validateStackingExecution(input.execution, plan);
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
    $schema: OBSERVATION_REVISION,
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

  assert(
    DOMAIN_NAMES.every((domain) => isPlainObject(actual[domain])),
    'actual must contain all fourteen object domains',
  );
  validateJsonValue(actual, 'actual', new WeakSet());
  return deepFreeze({
    actual,
    fixtures: projectStackingFixtures(plan),
    captures: projectCaptures(plan, execution),
  });
}

function validateOptions(options) {
  assert(isPlainObject(options), 'options must be a plain object');
  assertExactKeys(options, ['casePlan', 'environment', 'execution', 'provenance'], 'options');
  assert(isPlainObject(options.casePlan), 'casePlan');
  assert(isPlainObject(options.execution), 'execution');
  assert(isPlainObject(options.provenance), 'provenance');
  assert(isPlainObject(options.environment), 'environment');
  validateJsonValue(options.provenance, 'provenance', new WeakSet());
  validateJsonValue(options.environment, 'environment', new WeakSet());
  return options;
}

function validatePlacementCasePlan(casePlan) {
  validateJsonValue(casePlan, 'casePlan', new WeakSet());
  assert(casePlan.id === 'LAY-002', 'case ID');
  assert(casePlan.caseType === 'capability', 'caseType');
  assert(isPlainObject(casePlan.fixture), 'fixture');
  assert(isPlainObject(casePlan.fixture.setup), 'fixture setup');
  assert(isPlainObject(casePlan.fixture.setup.params), 'fixture params');
  assert(isPlainObject(casePlan.routeParams), 'routeParams');
  assert(typeof casePlan.routeParams.size === 'string', 'route size');
  assertUint32(casePlan.routeParams.seed, 'route seed');
  validateFixtureParams(casePlan.fixture.setup.params);

  const fixtureActions = casePlan.fixture.actionTrace;
  assert(Array.isArray(fixtureActions), 'fixture actionTrace');
  assert(Array.isArray(casePlan.actionTrace), 'materialized actionTrace');
  assert(sameJson(fixtureActions, casePlan.actionTrace), 'actionTrace drift');
  assert(fixtureActions.length === PLACEMENT_CASE_TRACE.length, 'action count');
  fixtureActions.forEach((action, index) => {
    const trace = PLACEMENT_CASE_TRACE[index];
    assert(isPlainObject(action), `action ${index}`);
    assertExactKeys(action, ['index', 'operands', 'type'], `action ${index}`);
    assert(action.index === index, `action ${index} index`);
    assert(action.type === trace.type, `action ${index} type`);
    assert(sameJson(action.operands, trace.operands), `action ${index} operands`);
  });
  const checkpoints = casePlan.fixture.captureCheckpoints;
  assert(Array.isArray(checkpoints) && checkpoints.length === 0, 'capture checkpoints');
  const cleanupTrace = casePlan.fixture.cleanupTrace;
  assert(sameJson(cleanupTrace, [{
    type: 'destroy-case',
    operands: { expectedResourceDelta: 0 },
  }]), 'cleanup trace drift');
  return { ...casePlan, actionTrace: fixtureActions, checkpoints, cleanupTrace };
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

function validateFixtureParams(value) {
  const params = recordValue(value, 'fixture params');
  assertExactKeys(
    params,
    ['componentSize', 'declaredTargetIds', 'item', 'margin', 'placementMatrix', 'placements'],
    'fixture params',
  );
  assert(sameJson(params.declaredTargetIds, ['item']), 'declared target IDs');
  const item = recordValue(params.item, 'fixture item');
  assertExactKeys(item, ['padding', 'size'], 'fixture item');
  numberTuple(item.size, 2, 'fixture item size', true);
  edgeValue(item.padding, 'fixture item padding');
  numberTuple(params.componentSize, 2, 'fixture component size', true);
  edgeValue(params.margin, 'fixture margin');
  assert(sameJson(placementList(params.placements), PLACEMENTS), 'fixture placement order');
  // The remaining fixture field is deliberately opaque and never projected.
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

function validatePlacementExecution(execution, plan) {
  validateJsonValue(execution, 'execution', new WeakSet());
  assert(execution.$schema === EXECUTION_REVISION, 'execution schema');
  assert(execution.caseId === plan.id, 'execution case ID');
  assert(execution.caseType === plan.caseType, 'execution caseType');
  assert(execution.status === 'completed', 'execution status');
  assert(execution.error === null, 'execution error');
  assert(execution.hostSeamDelta === null, 'capability host seam');
  assert(Array.isArray(execution.actionResults), 'actionResults');
  assert(execution.actionResults.length === PLACEMENT_CASE_TRACE.length, 'action result count');
  const inputEvidenceByAction = [];
  execution.actionResults.forEach((result, index) => {
    const trace = PLACEMENT_CASE_TRACE[index];
    assert(isPlainObject(result), `action result ${index}`);
    assert(result.index === index, `action result ${index} index`);
    assert(result.type === trace.type, `action result ${index} type`);
    assert(result.handlerId === `contract/${trace.type}`, `action result ${index} handler`);
    assert(result.status === 'completed', `action result ${index} status`);
    const startedAtMs = finiteNumber(result.startedAtMs, `action result ${index} startedAtMs`);
    const completedAtMs = finiteNumber(result.completedAtMs, `action result ${index} completedAtMs`);
    assert(completedAtMs >= startedAtMs, `action result ${index} timing`);
    const delta = recordValue(result.delta, `action result ${index} delta`);
    assert(delta.$schema === DELTA_REVISION, `action result ${index} delta schema`);
    assert(delta.caseId === plan.id, `action result ${index} delta case`);
    assert(delta.actionIndex === index, `action result ${index} delta index`);
    assert(delta.actionType === trace.type, `action result ${index} delta type`);
    const actual = recordValue(delta.actual, `action result ${index} actual`);
    const semanticProbe = recordValue(delta.semanticProbe, `action result ${index} semantic probe`);
    inputEvidenceByAction.push(
      validateInputEvidence(actual.input, `action result ${index} input`),
    );
    const product = placementProductEvidence(
      actual.product,
      `action result ${index} product`,
    );
    assert(
      sameJson(semanticProbe, product.semanticProbe),
      `action result ${index} semantic probe correlation`,
    );
  });
  assert(
    inputEvidenceByAction.every((input) => sameJson(input, inputEvidenceByAction[0])),
    'action input fingerprint correlation',
  );
  assert(Array.isArray(execution.captures) && execution.captures.length === 0, 'execution captures');
  assert(Array.isArray(execution.eventJournal), 'event journal');
  assert(
    Array.isArray(execution.eventJournalFailures) && execution.eventJournalFailures.length === 0,
    'event journal failures',
  );
  assert(isPlainObject(execution.bindings) && Object.keys(execution.bindings).length === 0, 'bindings');
  assert(
    isPlainObject(execution.datasetObservations)
      && Object.keys(execution.datasetObservations).length === 0,
    'dataset observations',
  );
  assert(isPlainObject(execution.terminalSnapshot), 'terminal snapshot');
  assert(execution.terminalSnapshot.lifecycle === 'scene-ready', 'terminal lifecycle');
  const terminalSemanticProbe = recordValue(
    execution.terminalSemanticProbe,
    'terminal semantic probe',
  );
  const finalActual = actionActualAt(
    execution,
    PLACEMENT_CASE_TRACE.length - 1,
    'observePlacementMatrix',
  );
  const finalProduct = placementProductEvidence(finalActual.product, 'final action product');
  assert(
    sameJson(execution.terminalSnapshot, finalProduct.snapshot),
    'terminal snapshot correlation',
  );
  assert(
    sameJson(terminalSemanticProbe, finalProduct.semanticProbe),
    'terminal semantic probe correlation',
  );
  assert(isPlainObject(execution.cleanup), 'cleanup');
  assert(execution.cleanup.status === 'completed', 'cleanup status');
  assert(Array.isArray(execution.cleanup.errors) && execution.cleanup.errors.length === 0, 'cleanup errors');
  assert(sameJson(execution.cleanup.declaredActions, ['destroy-case']), 'cleanup declared actions');
  assert(Array.isArray(execution.cleanup.releases) && execution.cleanup.releases.length > 0, 'cleanup releases');
  const resourceDelta = plan.cleanupTrace[0].operands.expectedResourceDelta;
  assert(execution.cleanup.releases.every((release, index) => {
    const remaining = recordValue(release.remainingResources, `cleanup release ${index} resources`);
    return ['canvasCount', 'subscriptions', 'pendingWork'].every((field) => (
      nonNegativeInteger(remaining[field], `cleanup release ${index} ${field}`) === resourceDelta
    ));
  }), 'cleanup resource delta');
  validateProductCleanup(execution.cleanup.productResources, plan.id);
  return execution;
}

function validateStackingExecution(execution, plan) {
  validateJsonValue(execution, 'stacking execution', new WeakSet());
  assert(execution.$schema === EXECUTION_REVISION, 'stacking execution schema');
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
    assert(delta.$schema === DELTA_REVISION, `stacking action result ${index} delta schema`);
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
  validateProductCleanup(execution.cleanup.productResources, plan.id);
  return execution;
}

function validateProductCleanup(value, caseId) {
  const cleanup = recordValue(value, 'product runtime cleanup');
  assert(cleanup.revision === PRODUCT_CLEANUP_REVISION, 'product cleanup revision');
  assert(cleanup.caseId === caseId, 'product cleanup case ID');
  const counts = recordValue(cleanup.runtimeCounts, 'product cleanup runtimeCounts');
  assert(
    ['activeSessionCount', 'retainedDatasetCount', 'rendererObjectCount', 'subscriptionCount', 'pendingWorkCount']
      .every((field) => nonNegativeInteger(counts[field], `product cleanup ${field}`) === 0),
    'product runtime cleanup drain',
  );
  recordValue(cleanup.stats, 'product cleanup stats');
  assert(Array.isArray(cleanup.journal), 'product cleanup journal');
}

function validateInputEvidence(value, label) {
  const input = recordValue(value, label);
  assertExactKeys(
    input,
    [
      'authoredAfter',
      'authoredBefore',
      'datasetAfter',
      'datasetBefore',
      'fixtureAfter',
      'fixtureBefore',
      'unchanged',
    ],
    label,
  );
  const pairs = [
    ['fixtureBefore', 'fixtureAfter'],
    ['authoredBefore', 'authoredAfter'],
    ['datasetBefore', 'datasetAfter'],
  ];
  const normalized = {};
  for (const [beforeKey, afterKey] of pairs) {
    const before = stringValue(input[beforeKey], `${label}.${beforeKey}`);
    const after = stringValue(input[afterKey], `${label}.${afterKey}`);
    assert(before === after, `${label}.${beforeKey} correlation`);
    normalized[beforeKey] = before;
    normalized[afterKey] = after;
  }
  assert(booleanValue(input.unchanged, `${label}.unchanged`), `${label} unchanged`);
  normalized.unchanged = true;
  return normalized;
}

function placementProductEvidence(value, label) {
  const product = recordValue(value, label);
  assertExactKeys(
    product,
    [
      'datasetFidelity',
      'exportedDataset',
      'geometryProbe',
      'runtime',
      'semanticProbe',
      'snapshot',
    ],
    label,
  );
  const snapshot = recordValue(product.snapshot, `${label}.snapshot`);
  assert(snapshot.lifecycle === 'scene-ready', `${label}.snapshot lifecycle`);
  const revisions = recordValue(snapshot.revisions, `${label}.snapshot revisions`);
  const sceneRevision = nonNegativeInteger(
    revisions.sceneRevision,
    `${label}.snapshot scene revision`,
  );
  const publishedTuple = recordValue(snapshot.publishedTuple, `${label}.snapshot published tuple`);
  assert(
    publishedTuple.scene === sceneRevision
      && publishedTuple.view === revisions.viewRevision
      && publishedTuple.interaction === revisions.interactionRevision,
    `${label}.snapshot publication correlation`,
  );
  assert(
    nonNegativeInteger(snapshot.frameRevision, `${label}.snapshot frame revision`) > 0,
    `${label}.snapshot published frame`,
  );
  const semanticProbe = recordValue(product.semanticProbe, `${label}.semanticProbe`);
  const geometryProbe = requireGeometry(product.geometryProbe, `${label}.geometryProbe`);
  const geometryRevision = nullableFiniteNumber(
    geometryProbe.revision,
    `${label}.geometry revision`,
  );
  const revisionLag = nullableFiniteNumber(
    geometryProbe.revisionLag,
    `${label}.geometry revision lag`,
  );
  assert(geometryRevision !== null && geometryRevision > 0, `${label}.geometry revision`);
  assert(
    revisionLag !== null && geometryRevision + revisionLag === sceneRevision,
    `${label}.geometry scene correlation`,
  );
  assert(Array.isArray(product.exportedDataset) && product.exportedDataset.length === 1, `${label}.exportedDataset`);
  const fidelity = recordValue(product.datasetFidelity, `${label}.dataset fidelity`);
  assertExactKeys(
    fidelity,
    ['exportedProfileFingerprint', 'loadedProfileFingerprint', 'unchanged'],
    `${label}.dataset fidelity`,
  );
  const loadedFingerprint = stringValue(
    fidelity.loadedProfileFingerprint,
    `${label}.loaded profile fingerprint`,
  );
  const exportedFingerprint = stringValue(
    fidelity.exportedProfileFingerprint,
    `${label}.exported profile fingerprint`,
  );
  assert(loadedFingerprint === exportedFingerprint, `${label}.dataset fidelity correlation`);
  assert(booleanValue(fidelity.unchanged, `${label}.dataset unchanged`), `${label}.dataset unchanged`);
  const runtime = recordValue(product.runtime, `${label}.runtime`);
  assert(runtime.revision === 'core-v2-layout-order-runtime/1', `${label}.runtime revision`);
  assert(runtime.caseId === 'LAY-002', `${label}.runtime case ID`);
  const ownership = recordValue(runtime.ownership, `${label}.runtime ownership`);
  assert(
    ['activeSessionCount', 'retainedDatasetCount', 'rendererObjectCount', 'subscriptionCount', 'pendingWorkCount']
      .every((field) => nonNegativeInteger(ownership[field], `${label}.runtime ${field}`) === 0),
    `${label}.runtime ownership drain`,
  );
  recordValue(runtime.stats, `${label}.runtime stats`);
  assert(Array.isArray(runtime.journal), `${label}.runtime journal`);
  return { snapshot, semanticProbe, geometryProbe, exportedDataset: product.exportedDataset };
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

function actionActualAt(execution, index, type) {
  const result = execution.actionResults[index];
  assert(result.type === type, `action ${index} type`);
  return recordValue(recordValue(result.delta, `action ${index} delta`).actual, `action ${index} actual`);
}

function authoredPlacementProfile(paramsValue) {
  const params = recordValue(paramsValue, 'fixture params');
  const item = recordValue(params.item, 'fixture item');
  return {
    itemSize: numberTuple(item.size, 2, 'fixture item size', true),
    padding: edgeValue(item.padding, 'fixture item padding'),
    componentSize: numberTuple(params.componentSize, 2, 'fixture component size', true),
    margin: edgeValue(params.margin, 'fixture margin'),
    placements: placementList(params.placements),
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

function placementEvidence(value, label) {
  const evidence = recordValue(value, label);
  assertExactKeys(evidence, ['order', 'owner', 'revision', 'revisionLag', 'rows'], label);
  const owner = ownerEvidence(evidence.owner, `${label}.owner`);
  const order = placementList(evidence.order);
  assert(Array.isArray(evidence.rows), `${label}.rows`);
  assert(evidence.rows.length === order.length, `${label}.row count`);
  const rows = evidence.rows.map((entry, index) => placementRow(entry, order[index], `${label}.rows[${index}]`));
  assert(new Set(rows.map(({ placement }) => placement)).size === rows.length, `${label}.row identities`);
  assert(
    new Set([owner.id, ...rows.map(({ entityId }) => entityId)]).size === rows.length + 1,
    `${label}.entity identities`,
  );
  return {
    revision: nullableFiniteNumber(evidence.revision, `${label}.revision`),
    revisionLag: nullableFiniteNumber(evidence.revisionLag, `${label}.revisionLag`),
    owner,
    order,
    rows,
  };
}

function ownerEvidence(value, label) {
  const owner = recordValue(value, label);
  assertExactKeys(owner, ['id', 'kind', 'screenBounds', 'visible', 'worldBounds'], label);
  return {
    id: stringValue(owner.id, `${label}.id`),
    kind: stringValue(owner.kind, `${label}.kind`),
    worldBounds: boundsValue(owner.worldBounds, `${label}.worldBounds`),
    screenBounds: boundsValue(owner.screenBounds, `${label}.screenBounds`),
    visible: booleanValue(owner.visible, `${label}.visible`),
  };
}

function placementRow(value, placement, label) {
  const row = recordValue(value, label);
  assertExactKeys(
    row,
    [
      'center',
      'componentType',
      'entityId',
      'entityLocalBounds',
      'localBounds',
      'placement',
      'right',
      'top',
      'visible',
      'worldBounds',
    ],
    label,
  );
  assert(row.placement === placement, `${label}.placement`);
  const localBounds = boundsValue(row.localBounds, `${label}.localBounds`);
  const worldBounds = boundsValue(row.worldBounds, `${label}.worldBounds`);
  const center = pointValue(row.center, `${label}.center`);
  const right = normalizeNumber(row.right, `${label}.right`);
  const top = normalizeNumber(row.top, `${label}.top`);
  return {
    placement,
    entityId: stringValue(row.entityId, `${label}.entityId`),
    componentType: stringValue(row.componentType, `${label}.componentType`),
    entityLocalBounds: boundsValue(row.entityLocalBounds, `${label}.entityLocalBounds`),
    localBounds,
    worldBounds,
    center,
    right,
    top,
    visible: booleanValue(row.visible, `${label}.visible`),
    handlerDerivationExact: sameJson(center, centerOf(localBounds))
      && right === normalizeNumber(localBounds[0] + localBounds[2], `${label}.derivedRight`)
      && top === localBounds[1],
  };
}

function validateProductProjection(product, evidence, authored, label) {
  const geometry = product.geometryProbe;
  assert(
    geometry.entities.length === authored.placements.length + 1,
    `${label}.geometry entity count`,
  );
  assert(geometry.relations.length === 0, `${label}.geometry relation count`);
  assert(geometry.revision === evidence.revision, `${label}.geometry revision correlation`);
  assert(geometry.revisionLag === evidence.revisionLag, `${label}.geometry lag correlation`);
  const ownerMatches = geometry.entities.filter((entity) => (
    isPlainObject(entity) && entity.id === evidence.owner.id && entity.componentId === undefined
  ));
  assert(ownerMatches.length === 1, `${label}.owner geometry identity`);
  const owner = recordValue(ownerMatches[0], `${label}.owner geometry`);
  assert(owner.kind === evidence.owner.kind, `${label}.owner kind correlation`);
  assert(sameJson(boundsValue(owner.worldBounds, `${label}.owner world bounds`), evidence.owner.worldBounds), `${label}.owner world correlation`);
  assert(sameJson(boundsValue(owner.screenBounds, `${label}.owner screen bounds`), evidence.owner.screenBounds), `${label}.owner screen correlation`);
  assert(booleanValue(owner.visible, `${label}.owner visibility`) === evidence.owner.visible, `${label}.owner visibility correlation`);

  for (const row of evidence.rows) {
    const matches = geometry.entities.filter((entity) => (
      isPlainObject(entity)
        && entity.ownerItemId === evidence.owner.id
        && entity.componentId === row.placement
    ));
    assert(matches.length === 1, `${label}.${row.placement} geometry identity`);
    const entity = recordValue(matches[0], `${label}.${row.placement} geometry`);
    assert(entity.id === row.entityId, `${label}.${row.placement} entity ID correlation`);
    assert(
      entity.componentType === row.componentType,
      `${label}.${row.placement} component type correlation`,
    );
    assert(
      sameJson(
        boundsValue(entity.localBounds, `${label}.${row.placement} entity local bounds`),
        row.entityLocalBounds,
      ),
      `${label}.${row.placement} entity local correlation`,
    );
    assert(
      sameJson(
        boundsValue(entity.worldBounds, `${label}.${row.placement} world bounds`),
        row.worldBounds,
      ),
      `${label}.${row.placement} world correlation`,
    );
    assert(
      booleanValue(entity.visible, `${label}.${row.placement} visibility`) === row.visible,
      `${label}.${row.placement} visibility correlation`,
    );
  }
}

function validateAuthoredOwner(owner, authored) {
  return owner.id === 'item'
    && owner.visible
    && owner.worldBounds[2] === authored.itemSize[0]
    && owner.worldBounds[3] === authored.itemSize[1];
}

function validateAuthoredRelations(evidence, authored) {
  const [itemWidth, itemHeight] = authored.itemSize;
  const content = {
    x: authored.padding.left,
    y: authored.padding.top,
    width: itemWidth - authored.padding.left - authored.padding.right,
    height: itemHeight - authored.padding.top - authored.padding.bottom,
  };
  assert(content.width >= 0 && content.height >= 0, 'authored content frame non-negative');
  const ownerOrigin = [evidence.owner.worldBounds[0], evidence.owner.worldBounds[1]];
  return evidence.rows.map((row) => {
    const authoredLocal = calculatePlacementBounds(
      content,
      authored.componentSize,
      row.placement,
      authored.margin,
    );
    const authoredWorld = [
      normalizeNumber(ownerOrigin[0] + authoredLocal[0], `${row.placement} authored world x`),
      normalizeNumber(ownerOrigin[1] + authoredLocal[1], `${row.placement} authored world y`),
      authoredLocal[2],
      authoredLocal[3],
    ];
    const localExact = sameJson(row.localBounds, authoredLocal);
    const worldExact = sameJson(row.worldBounds, authoredWorld);
    const ownerTranslationExact = sameJson(row.worldBounds, [
      normalizeNumber(ownerOrigin[0] + row.localBounds[0], `${row.placement} translated x`),
      normalizeNumber(ownerOrigin[1] + row.localBounds[1], `${row.placement} translated y`),
      row.localBounds[2],
      row.localBounds[3],
    ]);
    const componentSizeExact = row.localBounds[2] === authored.componentSize[0]
      && row.localBounds[3] === authored.componentSize[1];
    const entityLocalBoundsExact = sameJson(
      row.entityLocalBounds,
      [0, 0, authored.componentSize[0], authored.componentSize[1]],
    );
    const componentTypeExact = row.componentType === 'bar';
    const visible = row.visible;
    const allExact = localExact
      && worldExact
      && ownerTranslationExact
      && componentSizeExact
      && entityLocalBoundsExact
      && componentTypeExact
      && visible
      && row.handlerDerivationExact;
    return {
      placement: row.placement,
      localExact,
      worldExact,
      ownerTranslationExact,
      componentSizeExact,
      entityLocalBoundsExact,
      componentTypeExact,
      visible,
      handlerDerivationExact: row.handlerDerivationExact,
      allExact,
    };
  });
}

function calculatePlacementBounds(reference, size, placement, margin) {
  if (placement === 'none') return [0, 0, size[0], size[1]];
  const left = reference.x + margin.left;
  const top = reference.y + margin.top;
  const right = reference.x + reference.width - margin.right - size[0];
  const bottom = reference.y + reference.height - margin.bottom - size[1];
  const centerX = reference.x + (reference.width - size[0]) / 2;
  const centerY = reference.y + (reference.height - size[1]) / 2;
  let x = centerX;
  let y = centerY;
  if (placement === 'left' || placement === 'left-top' || placement === 'left-bottom') x = left;
  if (placement === 'right' || placement === 'right-top' || placement === 'right-bottom') x = right;
  if (placement === 'top' || placement === 'left-top' || placement === 'right-top') y = top;
  if (placement === 'bottom' || placement === 'left-bottom' || placement === 'right-bottom') y = bottom;
  return [
    normalizeNumber(x, `${placement} authored local x`),
    normalizeNumber(y, `${placement} authored local y`),
    size[0],
    size[1],
  ];
}

function projectPlacements(evidence) {
  const projected = { order: [...evidence.order] };
  for (const row of evidence.rows) {
    assignOwned(projected, row.placement, {
      localBounds: [...row.localBounds],
      worldBounds: [...row.worldBounds],
      center: [...row.center],
      right: row.right,
      top: row.top,
    }, `placement ${row.placement}`);
  }
  return projected;
}

function centerOf(bounds) {
  return [
    normalizeNumber(bounds[0] + bounds[2] / 2, 'bounds center x'),
    normalizeNumber(bounds[1] + bounds[3] / 2, 'bounds center y'),
  ];
}

function projectRevisions(snapshot) {
  const revisions = recordValue(snapshot.revisions, 'snapshot revisions');
  return {
    _availability: { terminalSnapshot: 'available' },
    lifecycle: finiteNumber(revisions.lifecycleGeneration, 'lifecycle revision'),
    scene: finiteNumber(revisions.sceneRevision, 'scene revision'),
    view: finiteNumber(revisions.viewRevision, 'view revision'),
    interaction: finiteNumber(revisions.interactionRevision, 'interaction revision'),
    frame: { revision: finiteNumber(snapshot.frameRevision, 'frame revision') },
    publishedTuple: cloneRecord(snapshot.publishedTuple, 'published tuple'),
  };
}

function projectScene(snapshot) {
  return {
    _availability: { terminalSnapshot: 'available' },
    revision: finiteNumber(
      recordValue(snapshot.revisions, 'snapshot revisions').sceneRevision,
      'scene revision',
    ),
    rootIds: cloneArray(snapshot.rootIds, 'root IDs'),
  };
}

function projectCase(plan, execution) {
  return {
    id: plan.id,
    caseType: plan.caseType,
    params: cloneRecord(plan.routeParams, 'route params'),
    ...(typeof plan.fixtureSha256 === 'string' ? { fixtureSha256: plan.fixtureSha256 } : {}),
    ...(typeof plan.rootTestId === 'string' ? { rootTestId: plan.rootTestId } : {}),
    executedActions: execution.actionResults.map((result) => ({
      index: result.index,
      type: result.type,
      status: result.status,
    })),
  };
}

function projectPlacementFixtures(plan) {
  const params = plan.fixture.setup.params;
  return {
    declaredTargetIds: clone(params.declaredTargetIds),
    item: clone(params.item),
    componentSize: clone(params.componentSize),
    margin: clone(params.margin),
    placements: clone(params.placements),
  };
}

function projectStackingFixtures(plan) {
  const params = plan.fixture.setup.params;
  return {
    siblings: clone(params.siblings),
    overlays: clone(params.overlays),
  };
}

function projectCaptures(plan, execution) {
  assert(plan.checkpoints.length === 0, 'plan capture count');
  assert(execution.captures.length === 0, 'execution capture count');
  return {};
}

function notExercised(reason) {
  return { _availability: { status: 'not-exercised', reason } };
}

function countFiniteNumbers(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? 1 : 0;
  if (Array.isArray(value)) return value.reduce((total, entry) => total + countFiniteNumbers(entry), 0);
  if (isPlainObject(value)) {
    return Object.values(value).reduce((total, entry) => total + countFiniteNumbers(entry), 0);
  }
  return 0;
}

function placementList(value) {
  assert(Array.isArray(value), 'placement list');
  const placements = value.map((entry, index) => stringValue(entry, `placement ${index}`));
  assert(placements.every((placement) => PLACEMENTS.includes(placement)), 'supported placements');
  assert(new Set(placements).size === placements.length, 'unique placements');
  return placements;
}

function stringArray(value, label) {
  assert(Array.isArray(value), label);
  return value.map((entry, index) => stringValue(entry, `${label}[${index}]`));
}

function edgeValue(value, label) {
  const edges = recordValue(value, label);
  assertExactKeys(edges, ['bottom', 'left', 'right', 'top'], label);
  return {
    top: finiteNumber(edges.top, `${label}.top`),
    right: finiteNumber(edges.right, `${label}.right`),
    bottom: finiteNumber(edges.bottom, `${label}.bottom`),
    left: finiteNumber(edges.left, `${label}.left`),
  };
}

function pointValue(value, label) {
  return numberTuple(value, 2, label, false).map((entry, index) => (
    normalizeNumber(entry, `${label}[${index}]`)
  ));
}

function boundsValue(value, label) {
  return numberTuple(value, 4, label, false).map((entry, index) => (
    normalizeNumber(entry, `${label}[${index}]`)
  ));
}

function requireGeometry(value, label) {
  const geometry = recordValue(value, label);
  assert(Array.isArray(geometry.entities), `${label}.entities`);
  assert(Array.isArray(geometry.relations), `${label}.relations`);
  return geometry;
}

function numberTuple(value, length, label, nonNegative) {
  assert(Array.isArray(value) && value.length === length, `${label} length`);
  return value.map((entry, index) => {
    const number = finiteNumber(entry, `${label}[${index}]`);
    assert(!nonNegative || number >= 0, `${label}[${index}] non-negative`);
    return number;
  });
}

function nullableFiniteNumber(value, label) {
  return value === null || value === undefined ? null : finiteNumber(value, label);
}

function normalizeNumber(value, label) {
  const numeric = finiteNumber(value, label);
  const rounded = Math.round(numeric * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function traceAction(type, operands) {
  return Object.freeze({ type, operands: deepFreeze(operands) });
}

function assignOwned(target, key, value, label) {
  assert(!Object.hasOwn(target, key), `${label} duplicate key`);
  Object.defineProperty(target, key, {
    configurable: false,
    enumerable: true,
    writable: false,
    value,
  });
}

function cloneRecord(value, label) {
  assert(isPlainObject(value), `${label} must be a plain object`);
  return clone(value);
}

function cloneArray(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  return clone(value);
}

function recordValue(value, label) {
  assert(isPlainObject(value), `${label} must be a plain object`);
  return value;
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, label);
  return value;
}

function booleanValue(value, label) {
  assert(typeof value === 'boolean', label);
  return value;
}

function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), label);
  return value;
}

function nonNegativeInteger(value, label) {
  assert(Number.isInteger(value) && value >= 0, label);
  return value;
}

function assertUint32(value, label) {
  assert(Number.isInteger(value) && value >= 0 && value <= 0xffffffff, label);
}

function assertExactKeys(value, keys, label) {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) assert(allowed.has(key), `${label} unknown key ${key}`);
  for (const key of keys) assert(Object.hasOwn(value, key), `${label} missing key ${key}`);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateJsonValue(value, label, ancestors) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    assert(Number.isFinite(value), `${label} finite number`);
    assert(!Object.is(value, -0), `${label} negative zero`);
    return;
  }
  assert(typeof value === 'object', `${label} JSON value`);
  assert(!ancestors.has(value), `${label} acyclic`);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => validateJsonValue(entry, `${label}[${index}]`, ancestors));
    } else {
      assert(isPlainObject(value), `${label} plain object`);
      Object.entries(value).forEach(([key, entry]) => (
        validateJsonValue(entry, `${label}.${key}`, ancestors)
      ));
    }
  } finally {
    ancestors.delete(value);
  }
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Core v2 layout-order fold invalid: ${message}`);
}
