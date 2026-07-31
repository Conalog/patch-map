import { clone } from './value-atoms.mjs';

export const RENDER_RELATIONS_FOLD_REVISION = 'core-v2-render-relations-fold/1';

const OBSERVATION_REVISION = 'core-v2-semantic-observation/1';
const EXECUTION_REVISION = 'core-v2-contract-case-execution/1';
const DELTA_REVISION = 'core-v2-semantic-observation-delta/1';
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

const CASE_TRACE = Object.freeze([
  traceAction('loadDataset', { datasetId: 'relations' }),
  traceAction('observeRelationPath', {
    relationId: 'links',
    hitPoints: [[39, 10], [60, 60]],
  }),
  traceAction('patch', {
    targetId: 'b',
    changes: { attrs: { x: 140, y: 60 } },
  }),
  traceAction('setVisibility', { targetId: 'b', show: false }),
  traceAction('setVisibility', { targetId: 'b', show: true }),
  traceAction('observeRelationContractMatrix', { valueRef: 'relationContractMatrix' }),
]);

const CLEANUP_TRACE = Object.freeze([
  Object.freeze({
    type: 'destroy-case',
    operands: Object.freeze({ expectedResourceDelta: 0 }),
  }),
]);

/** Fold REN-007 public Engine evidence into the canonical fourteen domains. */
export function foldRenderRelationsExecution(options) {
  const input = validateOptions(options);
  const plan = validateCasePlan(input.casePlan);
  const execution = validateExecution(input.execution, plan);
  const loaded = actionActualAt(execution, 0, 'loadDataset');
  const observed = relationPathObservation(
    actionActualAt(execution, 1, 'observeRelationPath'),
    'observed relation path',
  );
  const moved = endpointMutationObservation(
    actionActualAt(execution, 2, 'patch'),
    'moved relation endpoint',
  );
  const hidden = visibilityObservation(
    actionActualAt(execution, 3, 'setVisibility'),
    'hidden relation endpoint',
  );
  const shown = visibilityObservation(
    actionActualAt(execution, 4, 'setVisibility'),
    'shown relation endpoint',
  );
  const matrixAction = matrixActionObservation(
    actionActualAt(execution, 5, 'observeRelationContractMatrix'),
  );
  validateActionSequence(plan, loaded, observed, moved, hidden, shown, matrixAction);

  const terminalSnapshot = execution.terminalSnapshot;
  const terminalSemantic = execution.terminalSemanticProbe;
  const relationId = matrixAction.relationId;
  const sceneRelations = {
    segmentKeys: { initial: clone(observed.segmentKeys) },
    duplicatePairCount: observed.duplicatePairCount,
    hiddenB: { visibleSegments: clone(hidden.visibleSegmentKeys) },
    staleSegments: moved.staleSegmentCount + shown.staleSegmentCount,
  };
  assignOwned(sceneRelations, observed.direct.key, {
    startWorld: clone(observed.direct.startWorld),
    endWorld: { afterMove: clone(moved.direct.endWorld) },
  }, 'scene direct relation');
  assignOwned(sceneRelations, relationId, {
    segmentKeys: {
      initial: clone(matrixAction.matrix.initialSegmentKeys),
      final: clone(matrixAction.matrix.finalSegmentKeys),
    },
    visibleAfterGridHide: clone(matrixAction.matrix.visibleAfterGridHide),
    visibleAfterGridShow: clone(matrixAction.matrix.visibleAfterGridShow),
  }, 'scene matrix relation');

  const geometryRelations = {
    selfLink: clone(observed.selfLink),
    contractMatrix: clone(matrixAction.matrix),
  };
  assignOwned(geometryRelations, relationId, {
    sourceCenterAfterResizeWorld: clone(matrixAction.matrix.sourceCenterAfterResizeWorld),
  }, 'geometry matrix relation');

  const paintRelations = {};
  assignOwned(paintRelations, relationId, {
    style: clone(matrixAction.matrix.style),
  }, 'paint matrix relation');

  const interactionRelations = {
    selfLink: {
      hitProbe: clone(observed.hitProbe),
      missProbe: clone(observed.missProbe),
    },
  };
  assignOwned(interactionRelations, relationId, {
    sourceCenterScreen: clone(matrixAction.matrix.sourceCenterScreen),
    targetCenterScreen: clone(matrixAction.matrix.targetCenterScreen),
  }, 'interaction matrix relation');

  const outcomeRelations = {};
  assignOwned(outcomeRelations, relationId, {
    omittedMissingEndpointSegments: matrixAction.matrix.omittedMissingEndpointSegments,
  }, 'outcome matrix relation');

  const semanticScene = recordValue(terminalSemantic.scene, 'terminal semantic scene');
  const semanticCounts = recordValue(semanticScene.counts, 'terminal semantic scene counts');
  const semanticGeometry = recordValue(terminalSemantic.geometry, 'terminal semantic geometry');
  const semanticInteraction = recordValue(
    terminalSemantic.interaction,
    'terminal semantic interaction',
  );
  const rendering = recordValue(
    recordValue(terminalSnapshot.resources, 'terminal resources').rendering,
    'terminal rendering resources',
  );

  const actual = {
    $schema: OBSERVATION_REVISION,
    case: projectCase(plan, execution),
    provenance: cloneRecord(input.provenance, 'provenance'),
    environment: cloneRecord(input.environment, 'environment'),
    revisions: projectRevisions(terminalSnapshot),
    scene: {
      _availability: {
        terminalSnapshot: 'available',
        semanticProbe: 'available',
        relationProbe: 'available',
      },
      revision: finiteNumber(
        recordValue(terminalSnapshot.revisions, 'terminal revisions').sceneRevision,
        'scene revision',
      ),
      hierarchy: {
        nodeCount: nonNegativeInteger(semanticCounts.elements, 'scene hierarchy nodeCount'),
      },
      relations: sceneRelations,
    },
    geometry: {
      _availability: { semanticProbe: 'available', relationProbe: 'available' },
      finiteValueCount: nonNegativeInteger(
        semanticGeometry.finiteValueCount,
        'geometry finiteValueCount',
      ),
      relations: geometryRelations,
    },
    text: notExercised('relation-actions-do-not-observe-text'),
    paint: {
      _availability: { rendererDebug: 'available', relationProbe: 'available' },
      commandCount: nonNegativeInteger(rendering.commandCount, 'paint commandCount'),
      relations: paintRelations,
    },
    interaction: {
      _availability: {
        semanticProbe: 'available',
        relationHitTest: 'available',
        relationProbe: 'available',
      },
      activeGestureCount: nonNegativeInteger(
        semanticInteraction.activeGestureCount,
        'interaction activeGestureCount',
      ),
      relations: interactionRelations,
    },
    events: {
      _availability: { eventJournal: 'available' },
      journal: clone(execution.eventJournal),
    },
    history: projectHistory(terminalSemantic),
    accessibility: notExercised('relation-actions-do-not-observe-accessibility'),
    outcome: {
      _availability: {
        actionResults: 'available',
        relationProbe: 'available',
        determinism: 'available',
        inputImmutability: 'available',
      },
      relations: outcomeRelations,
      deterministic: matrixAction.deterministic,
      inputUnchanged: matrixAction.inputUnchanged,
      actionResults: execution.actionResults.map((result) => ({
        index: result.index,
        type: result.type,
        status: result.status,
      })),
    },
    resources: {
      _availability: { cleanup: 'available', terminalSnapshot: 'available' },
      cleanup: clone(execution.cleanup),
      terminal: clone(terminalSnapshot.resources),
    },
  };

  assert(
    DOMAIN_NAMES.every((domain) => isPlainObject(actual[domain])),
    'actual must contain all fourteen object domains',
  );
  validateJsonValue(actual, 'actual', new WeakSet());
  return deepFreeze({
    actual,
    fixtures: projectFixtures(plan),
    captures: projectCaptures(execution),
  });
}

function validateOptions(options) {
  assert(isPlainObject(options), 'options must be a plain object');
  assertExactKeys(options, ['casePlan', 'execution', 'provenance', 'environment'], 'options');
  assert(isPlainObject(options.casePlan), 'casePlan');
  assert(isPlainObject(options.execution), 'execution');
  assert(isPlainObject(options.provenance), 'provenance');
  assert(isPlainObject(options.environment), 'environment');
  validateJsonValue(options.provenance, 'provenance', new WeakSet());
  validateJsonValue(options.environment, 'environment', new WeakSet());
  return options;
}

function validateCasePlan(casePlan) {
  validateJsonValue(casePlan, 'casePlan', new WeakSet());
  assert(casePlan.id === 'REN-007', 'case ID');
  assert(casePlan.caseType === 'capability', 'caseType');
  const fixture = recordValue(casePlan.fixture, 'fixture');
  const setup = recordValue(fixture.setup, 'fixture setup');
  validateFixtureParams(recordValue(setup.params, 'fixture params'));
  const routeParams = recordValue(casePlan.routeParams, 'routeParams');
  assert(typeof routeParams.size === 'string', 'route size');
  assertUint32(routeParams.seed, 'route seed');

  const fixtureActions = fixture.actionTrace;
  assert(Array.isArray(fixtureActions), 'fixture actionTrace');
  assert(Array.isArray(casePlan.actionTrace), 'materialized actionTrace');
  assert(sameJson(fixtureActions, casePlan.actionTrace), 'actionTrace drift');
  assert(fixtureActions.length === CASE_TRACE.length, 'action count');
  fixtureActions.forEach((action, index) => {
    const trace = CASE_TRACE[index];
    assert(isPlainObject(action), `action ${index}`);
    assertExactKeys(action, ['index', 'type', 'operands'], `action ${index}`);
    assert(action.index === index, `action ${index} index`);
    assert(action.type === trace.type, `action ${index} type`);
    assert(sameJson(action.operands, trace.operands), `action ${index} operands`);
  });
  assert(
    Array.isArray(fixture.captureCheckpoints) && fixture.captureCheckpoints.length === 0,
    'capture checkpoints',
  );
  assert(sameJson(fixture.cleanupTrace, CLEANUP_TRACE), 'cleanup trace drift');
  return { ...casePlan, actionTrace: fixtureActions, cleanupTrace: fixture.cleanupTrace };
}

function validateFixtureParams(params) {
  assert(Array.isArray(params.nodes) && params.nodes.length >= 2, 'fixture nodes');
  params.nodes.forEach((value, index) => {
    const node = recordValue(value, `fixture node ${index}`);
    stringValue(node.id, `fixture node ${index} id`);
    boundsValue(node.bounds, `fixture node ${index} bounds`);
  });
  assert(Array.isArray(params.links) && params.links.length > 0, 'fixture links');
  params.links.forEach((value, index) => stringPair(value, `fixture link ${index}`));
  const self = recordValue(params.selfLinkContract, 'self link contract');
  stringValue(self.relationId, 'self link relationId');
  stringPair(self.pair, 'self link pair');
  const hitTolerance = finiteNumber(self.hitTolerance, 'self link hitTolerance');
  assert(hitTolerance >= 0, 'self link hitTolerance non-negative');

  const matrix = recordValue(params.relationContractMatrix, 'relation contract matrix');
  assert(Array.isArray(matrix.dataset) && matrix.dataset.length > 0, 'relation matrix dataset');
  matrix.dataset.forEach((entry, index) => recordValue(entry, `relation matrix entry ${index}`));
  endpointResize(matrix.endpointResize);
  linkSetChange(matrix.linkSetChange);
  relationView(matrix.view);
}

function validateExecution(execution, plan) {
  validateJsonValue(execution, 'execution', new WeakSet());
  assert(execution.$schema === EXECUTION_REVISION, 'execution schema');
  assert(execution.caseId === plan.id, 'execution caseId');
  assert(execution.caseType === plan.caseType, 'execution caseType');
  assert(execution.status === 'completed', 'execution status');
  assert(execution.error === null, 'execution error');
  assert(execution.hostSeamDelta === null, 'capability host seam');
  assert(Array.isArray(execution.actionResults), 'actionResults');
  assert(execution.actionResults.length === CASE_TRACE.length, 'execution action count');
  execution.actionResults.forEach((result, index) => {
    const trace = CASE_TRACE[index];
    assert(isPlainObject(result), `result ${index}`);
    assert(result.index === index, `result ${index} index`);
    assert(result.type === trace.type, `result ${index} type`);
    assert(result.handlerId === `contract/${trace.type}`, `result ${index} handlerId`);
    assert(result.status === 'completed', `result ${index} status`);
    assertFiniteNumber(result.startedAtMs, `result ${index} startedAtMs`);
    assertFiniteNumber(result.completedAtMs, `result ${index} completedAtMs`);
    assert(result.completedAtMs >= result.startedAtMs, `result ${index} timing`);
    const delta = recordValue(result.delta, `result ${index} delta`);
    assert(delta.$schema === DELTA_REVISION, `result ${index} delta schema`);
    assert(delta.caseId === plan.id, `result ${index} delta caseId`);
    assert(delta.actionIndex === index, `result ${index} delta index`);
    assert(delta.actionType === trace.type, `result ${index} delta type`);
    assert(isPlainObject(delta.actual), `result ${index} actual`);
    assert(isPlainObject(delta.semanticProbe), `result ${index} semanticProbe`);
  });
  assert(Array.isArray(execution.eventJournal), 'eventJournal');
  assert(Array.isArray(execution.eventJournalFailures), 'eventJournalFailures');
  assert(execution.eventJournalFailures.length === 0, 'event journal failures');
  assert(Array.isArray(execution.captures) && execution.captures.length === 0, 'captures');
  assert(isPlainObject(execution.bindings), 'bindings');
  assert(Object.keys(execution.bindings).length === 0, 'unexpected bindings');
  assert(isPlainObject(execution.datasetObservations), 'datasetObservations');
  assert(Object.keys(execution.datasetObservations).length === 0, 'unexpected datasets');
  assert(isPlainObject(execution.terminalSnapshot), 'terminalSnapshot');
  assert(isPlainObject(execution.terminalSemanticProbe), 'terminalSemanticProbe');
  validateCleanup(execution.cleanup, plan.cleanupTrace);
  return execution;
}

function validateCleanup(value, cleanupTrace) {
  const cleanup = recordValue(value, 'cleanup');
  assert(cleanup.status === 'completed', 'cleanup status');
  assert(Array.isArray(cleanup.errors) && cleanup.errors.length === 0, 'cleanup errors');
  assert(sameJson(cleanup.declaredActions, ['destroy-case']), 'cleanup declared actions');
  assert(Array.isArray(cleanup.releases), 'cleanup releases');
  assert(cleanup.releases.length >= 2, 'cleanup release count');
  const resourceDelta = cleanupTrace[0].operands.expectedResourceDelta;
  cleanup.releases.forEach((release, index) => {
    const remaining = recordValue(
      recordValue(release, `cleanup release ${index}`).remainingResources,
      `cleanup release ${index} resources`,
    );
    for (const field of ['canvasCount', 'subscriptions', 'pendingWork']) {
      assert(
        nonNegativeInteger(remaining[field], `cleanup release ${index} ${field}`) === resourceDelta,
        `cleanup release ${index} ${field} resource delta`,
      );
    }
  });
}

function validateActionSequence(plan, loaded, observed, moved, hidden, shown, matrixAction) {
  const params = plan.fixture.setup.params;
  const loadInput = recordValue(loaded.input, 'load input');
  assert(loadInput.unchanged === true, 'initial input unchanged');
  assert(loaded.datasetId === CASE_TRACE[0].operands.datasetId, 'loaded datasetId');
  assert(observed.relationId === CASE_TRACE[1].operands.relationId, 'observed relationId');
  assert(moved.targetId === CASE_TRACE[2].operands.targetId, 'moved targetId');
  assert(sameJson(moved.changes, CASE_TRACE[2].operands.changes), 'moved changes');
  assert(hidden.targetId === CASE_TRACE[3].operands.targetId && hidden.show === false, 'hidden state');
  assert(shown.targetId === CASE_TRACE[4].operands.targetId && shown.show === true, 'shown state');
  const self = recordValue(params.selfLinkContract, 'self link contract');
  const pair = stringPair(self.pair, 'self link pair');
  assert(observed.selfLink.kind.length > 0, 'self link kind');
  assert(observed.hitProbe.tolerance === self.hitTolerance, 'self link tolerance source');
  assert(observed.direct.key !== `${pair[0]}>${pair[1]}`, 'direct relation differs from self relation');
  assert(matrixAction.valueRef === CASE_TRACE[5].operands.valueRef, 'matrix valueRef');
}

function relationPathObservation(value, label) {
  const actual = recordValue(value, label);
  const relationId = stringValue(actual.relationId, `${label} relationId`);
  const segmentKeys = uniqueStringArray(actual.segmentKeys, `${label} segmentKeys`);
  const selfLink = recordValue(actual.selfLink, `${label} selfLink`);
  const direct = relationEndpointObservation(actual.direct, `${label} direct`);
  const hitProbe = relationHitObservation(actual.hitProbe, `${label} hitProbe`, true);
  const missProbe = relationHitObservation(actual.missProbe, `${label} missProbe`, false);
  return {
    relationId,
    segmentKeys,
    duplicatePairCount: nonNegativeInteger(
      actual.duplicatePairCount,
      `${label} duplicatePairCount`,
    ),
    selfLink: {
      kind: stringValue(selfLink.kind, `${label} selfLink kind`),
      worldPoints: pointList(selfLink.worldPoints, `${label} selfLink worldPoints`),
      worldBounds: boundsValue(selfLink.worldBounds, `${label} selfLink worldBounds`),
    },
    direct,
    hitProbe,
    missProbe,
  };
}

function endpointMutationObservation(value, label) {
  const actual = recordValue(value, label);
  validateCommittedMutation(actual.mutation, `${label} mutation`);
  return {
    targetId: stringValue(actual.targetId, `${label} targetId`),
    changes: cloneRecord(actual.changes, `${label} changes`),
    direct: relationEndpointObservation(actual.direct, `${label} direct`),
    staleSegmentCount: nonNegativeInteger(
      actual.staleSegmentCount,
      `${label} staleSegmentCount`,
    ),
  };
}

function visibilityObservation(value, label) {
  const actual = recordValue(value, label);
  validateCommittedMutation(actual.mutation, `${label} mutation`);
  return {
    targetId: stringValue(actual.targetId, `${label} targetId`),
    show: booleanValue(actual.show, `${label} show`),
    visibleSegmentKeys: uniqueStringArray(
      actual.visibleSegmentKeys,
      `${label} visibleSegmentKeys`,
    ),
    staleSegmentCount: nonNegativeInteger(
      actual.staleSegmentCount,
      `${label} staleSegmentCount`,
    ),
  };
}

function matrixActionObservation(value) {
  const actual = recordValue(value, 'matrix action');
  const matrix = relationMatrix(actual.contractMatrix, 'matrix observation');
  const repeat = relationMatrix(actual.repeatContractMatrix, 'repeat matrix observation');
  const input = recordValue(actual.input, 'matrix input');
  const inputFields = [
    'fixtureBefore',
    'fixtureAfterActions',
    'initialDatasetBefore',
    'initialDatasetAfterActions',
    'matrixDatasetBefore',
    'matrixDatasetAfterActions',
    'repeatDatasetBefore',
    'repeatDatasetAfterActions',
  ];
  inputFields.forEach((field) => stringValue(input[field], `matrix input ${field}`));
  const complete = booleanValue(actual.complete, 'matrix complete');
  const deterministic = booleanValue(actual.deterministic, 'matrix deterministic');
  const inputUnchanged = booleanValue(input.unchanged, 'matrix input unchanged');
  assert(complete, 'matrix incomplete');
  assert(deterministic && sameJson(matrix, repeat), 'matrix repeat drift');
  assert(inputUnchanged, 'matrix input changed');
  return {
    valueRef: stringValue(actual.valueRef, 'matrix valueRef'),
    relationId: stringValue(actual.relationId, 'matrix relationId'),
    matrix,
    repeat,
    complete,
    deterministic,
    inputUnchanged,
  };
}

function relationMatrix(value, label) {
  const matrix = recordValue(value, label);
  assertExactKeys(matrix, [
    'initialSegmentKeys',
    'sourceCenterWorld',
    'targetCenterWorld',
    'sourceCenterRelationsLocal',
    'targetCenterRelationsLocal',
    'sourceCenterScreen',
    'targetCenterScreen',
    'sourceCenterAfterResizeWorld',
    'finalSegmentKeys',
    'omittedMissingEndpointSegments',
    'visibleAfterGridHide',
    'visibleAfterGridShow',
    'style',
  ], label);
  const style = recordValue(matrix.style, `${label} style`);
  assertExactKeys(style, ['color', 'width', 'opacity', 'zIndex', 'visible'], `${label} style`);
  return {
    initialSegmentKeys: uniqueStringArray(matrix.initialSegmentKeys, `${label} initialSegmentKeys`),
    sourceCenterWorld: pointValue(matrix.sourceCenterWorld, `${label} sourceCenterWorld`),
    targetCenterWorld: pointValue(matrix.targetCenterWorld, `${label} targetCenterWorld`),
    sourceCenterRelationsLocal: pointValue(
      matrix.sourceCenterRelationsLocal,
      `${label} sourceCenterRelationsLocal`,
    ),
    targetCenterRelationsLocal: pointValue(
      matrix.targetCenterRelationsLocal,
      `${label} targetCenterRelationsLocal`,
    ),
    sourceCenterScreen: pointValue(matrix.sourceCenterScreen, `${label} sourceCenterScreen`),
    targetCenterScreen: pointValue(matrix.targetCenterScreen, `${label} targetCenterScreen`),
    sourceCenterAfterResizeWorld: pointValue(
      matrix.sourceCenterAfterResizeWorld,
      `${label} sourceCenterAfterResizeWorld`,
    ),
    finalSegmentKeys: uniqueStringArray(matrix.finalSegmentKeys, `${label} finalSegmentKeys`),
    omittedMissingEndpointSegments: nonNegativeInteger(
      matrix.omittedMissingEndpointSegments,
      `${label} omittedMissingEndpointSegments`,
    ),
    visibleAfterGridHide: uniqueStringArray(
      matrix.visibleAfterGridHide,
      `${label} visibleAfterGridHide`,
    ),
    visibleAfterGridShow: uniqueStringArray(
      matrix.visibleAfterGridShow,
      `${label} visibleAfterGridShow`,
    ),
    style: {
      color: stringValue(style.color, `${label} style color`),
      width: finiteNumber(style.width, `${label} style width`),
      opacity: finiteNumber(style.opacity, `${label} style opacity`),
      zIndex: finiteNumber(style.zIndex, `${label} style zIndex`),
      visible: booleanValue(style.visible, `${label} style visible`),
    },
  };
}

function relationEndpointObservation(value, label) {
  const relation = recordValue(value, label);
  return {
    key: stringValue(relation.key, `${label} key`),
    startWorld: pointValue(relation.startWorld, `${label} startWorld`),
    endWorld: pointValue(relation.endWorld, `${label} endWorld`),
  };
}

function relationHitObservation(value, label, withTolerance) {
  const probe = recordValue(value, label);
  const keys = withTolerance ? ['point', 'target', 'tolerance'] : ['point', 'target'];
  assertExactKeys(probe, keys, label);
  const target = probe.target;
  assert(target === null || (typeof target === 'string' && target.length > 0), `${label} target`);
  return {
    point: pointValue(probe.point, `${label} point`),
    target,
    ...(withTolerance
      ? { tolerance: finiteNumber(probe.tolerance, `${label} tolerance`) }
      : {}),
  };
}

function validateCommittedMutation(value, label) {
  const mutation = recordValue(value, label);
  assert(mutation.status === 'committed', `${label} status`);
  assert(mutation.changed === true, `${label} changed`);
}

function projectRevisions(snapshot) {
  const revisions = recordValue(snapshot.revisions, 'snapshot revisions');
  return {
    _availability: { terminalSnapshot: 'available' },
    scene: finiteNumber(revisions.sceneRevision, 'scene revision'),
    view: finiteNumber(revisions.viewRevision, 'view revision'),
    interaction: finiteNumber(revisions.interactionRevision, 'interaction revision'),
    frame: { revision: finiteNumber(snapshot.frameRevision, 'frame revision') },
    publishedTuple: cloneRecord(snapshot.publishedTuple, 'published tuple'),
  };
}

function projectHistory(semantic) {
  const history = recordValue(semantic.history, 'terminal semantic history');
  return {
    _availability: { semanticProbe: 'available' },
    depth: nonNegativeInteger(history.depth, 'history depth'),
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

function projectFixtures(plan) {
  const params = plan.fixture.setup.params;
  const self = recordValue(params.selfLinkContract, 'self link contract');
  const matrix = recordValue(params.relationContractMatrix, 'relation contract matrix');
  return {
    nodes: cloneArray(params.nodes, 'fixture nodes'),
    links: cloneArray(params.links, 'fixture links'),
    selfLinkContract: {
      relationId: stringValue(self.relationId, 'self link relationId'),
      pair: stringPair(self.pair, 'self link pair'),
      hitTolerance: finiteNumber(self.hitTolerance, 'self link hitTolerance'),
    },
    relationContractMatrix: {
      dataset: cloneArray(matrix.dataset, 'relation matrix dataset'),
      endpointResize: endpointResize(matrix.endpointResize),
      linkSetChange: linkSetChange(matrix.linkSetChange),
      view: relationView(matrix.view),
    },
  };
}

function projectCaptures(execution) {
  assert(Object.keys(execution.bindings).length === 0, 'unexpected bindings');
  assert(execution.captures.length === 0, 'unexpected captures');
  return {};
}

function endpointResize(value) {
  const resize = recordValue(value, 'endpoint resize');
  const size = recordValue(resize.size, 'endpoint resize size');
  return {
    target: stringValue(resize.target, 'endpoint resize target'),
    size: {
      width: finiteNumber(size.width, 'endpoint resize width'),
      height: finiteNumber(size.height, 'endpoint resize height'),
    },
  };
}

function linkSetChange(value) {
  const change = recordValue(value, 'link set change');
  return {
    remove: linkValue(change.remove, 'link set remove'),
    addMissing: linkValue(change.addMissing, 'link set add missing'),
  };
}

function linkValue(value, label) {
  const link = recordValue(value, label);
  return {
    source: stringValue(link.source, `${label} source`),
    target: stringValue(link.target, `${label} target`),
  };
}

function relationView(value) {
  const view = recordValue(value, 'relation view');
  return {
    rotationDegrees: finiteNumber(view.rotationDegrees, 'relation view rotationDegrees'),
    flipX: booleanValue(view.flipX, 'relation view flipX'),
    flipY: booleanValue(view.flipY, 'relation view flipY'),
    scale: finiteNumber(view.scale, 'relation view scale'),
    panCss: pointValue(view.panCss, 'relation view panCss'),
  };
}

function actionActualAt(execution, index, type) {
  const result = execution.actionResults[index];
  assert(result?.type === type, `action ${index} must be ${type}`);
  return result.delta.actual;
}

function assignOwned(target, key, value, label) {
  assert(typeof key === 'string' && key.length > 0, `${label} key`);
  assert(!Object.hasOwn(target, key), `${label} key collision ${key}`);
  target[key] = value;
}

function uniqueStringArray(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  const values = value.map((entry, index) => stringValue(entry, `${label}[${index}]`));
  assert(new Set(values).size === values.length, `${label} duplicate value`);
  return values;
}

function pointList(value, label) {
  assert(Array.isArray(value) && value.length > 1, label);
  return value.map((point, index) => pointValue(point, `${label}[${index}]`));
}

function pointValue(value, label) {
  assert(Array.isArray(value) && value.length === 2, label);
  return value.map((entry, index) => normalizeNumber(entry, `${label}[${index}]`));
}

function boundsValue(value, label) {
  assert(Array.isArray(value) && value.length === 4, label);
  return value.map((entry, index) => normalizeNumber(entry, `${label}[${index}]`));
}

function stringPair(value, label) {
  assert(Array.isArray(value) && value.length === 2, label);
  return [stringValue(value[0], `${label}[0]`), stringValue(value[1], `${label}[1]`)];
}

function traceAction(type, operands) {
  return Object.freeze({ type, operands: deepFreeze(operands) });
}

function notExercised(reason) {
  return { _availability: { status: 'not-exercised', reason } };
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
  assert(isPlainObject(value), `${label} must be an object`);
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

function nonNegativeInteger(value, label) {
  assert(Number.isSafeInteger(value) && value >= 0, label);
  return value;
}

function finiteNumber(value, label) {
  assertFiniteNumber(value, label);
  return value;
}

function normalizeNumber(value, label) {
  const numeric = finiteNumber(value, label);
  const rounded = Math.round(numeric * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function assertFiniteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), label);
}

function assertUint32(value, label) {
  assert(Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff, label);
}

function assertExactKeys(value, keys, label) {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) assert(allowed.has(key), `${label} unknown key ${key}`);
  for (const key of keys) assert(Object.hasOwn(value, key), `${label} missing key ${key}`);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateJsonValue(value, path, ancestors) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    assert(Number.isFinite(value), `${path} finite number`);
    assert(!Object.is(value, -0), `${path} negative zero`);
    return;
  }
  assert(typeof value === 'object', `${path} contains non-JSON ${typeof value}`);
  assert(!ancestors.has(value), `${path} contains a cycle`);
  assert(Array.isArray(value) || isPlainObject(value), `${path} contains a non-plain object`);
  assert(Object.getOwnPropertySymbols(value).length === 0, `${path} contains symbol keys`);
  if (Array.isArray(value)) {
    const keys = Object.keys(value);
    assert(keys.length === value.length, `${path} sparse or named array`);
    assert(keys.every((key, index) => key === String(index)), `${path} dense array keys`);
  }
  ancestors.add(value);
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    assert(descriptor?.get === undefined && descriptor?.set === undefined, `${path} accessor ${key}`);
    assert(descriptor?.enumerable === true, `${path} non-enumerable ${key}`);
    validateJsonValue(descriptor.value, `${path}/${escapePointer(key)}`, ancestors);
  }
  ancestors.delete(value);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function escapePointer(value) {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Core v2 render-relations fold invalid: ${message}`);
}
