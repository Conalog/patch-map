import {
  actionActualAt,
  assignOwned,
  assert,
  assertExactKeys,
  assertUint32,
  booleanValue,
  boundsValue,
  clone,
  cloneArray,
  cloneRecord,
  countFiniteNumbers,
  edgeValue,
  finiteNumber,
  isPlainObject,
  nonNegativeInteger,
  normalizeNumber,
  notExercised,
  nullableFiniteNumber,
  numberTuple,
  pointValue,
  projectCaptures,
  projectCase,
  projectRevisions,
  projectScene,
  recordValue,
  requireGeometry,
  sameJson,
  stringValue,
  traceAction,
  validateInputEvidence,
  validateJsonValue,
  validateProductCleanup,
} from './values.mjs';

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

export function projectPlacementExecution(input, revisions) {
  const plan = validatePlacementCasePlan(input.casePlan);
  const execution = validatePlacementExecution(input.execution, plan, revisions);
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
    $schema: revisions.observation,
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

  return {
    actual,
    fixtures: projectPlacementFixtures(plan),
    captures: projectCaptures(plan, execution),
  };
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

function validatePlacementExecution(execution, plan, revisions) {
  validateJsonValue(execution, 'execution', new WeakSet());
  assert(execution.$schema === revisions.execution, 'execution schema');
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
    assert(delta.$schema === revisions.delta, `action result ${index} delta schema`);
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
  validateProductCleanup(execution.cleanup.productResources, plan.id, revisions.productCleanup);
  return execution;
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

function placementList(value) {
  assert(Array.isArray(value), 'placement list');
  const placements = value.map((entry, index) => stringValue(entry, `placement ${index}`));
  assert(placements.every((placement) => PLACEMENTS.includes(placement)), 'supported placements');
  assert(new Set(placements).size === placements.length, 'unique placements');
  return placements;
}
