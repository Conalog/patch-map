export const RENDER_FOUNDATION_FOLD_REVISION = 'core-v2-render-foundation-fold/1';

const OBSERVATION_REVISION = 'core-v2-semantic-observation/1';
const EXECUTION_REVISION = 'core-v2-contract-case-execution/1';
const DELTA_REVISION = 'core-v2-semantic-observation-delta/1';
const BROWSER_PROBE_REVISION = 'patch-map-browser-probe/1';

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

const CASES = Object.freeze({
  'LAY-001': Object.freeze([
    traceAction('loadDataset', { datasetId: 'content-box' }),
    traceAction('patch', {
      targetId: 'item',
      changes: {
        size: { width: 120, height: 100 },
        padding: { top: 10, right: 20, bottom: 10, left: 20 },
      },
    }),
  ]),
  'REN-001': Object.freeze([
    traceAction('loadDataset', { datasetId: 'nested-groups' }),
    traceAction('patch', { targetId: 'outer', changes: { show: false } }),
    traceAction('patch', { targetId: 'outer', changes: { show: true, locked: true } }),
  ]),
  'REN-004': Object.freeze([
    traceAction('loadDataset', { datasetId: 'rect-specimen' }),
    traceAction('patch', {
      targetId: 'rect',
      changes: {
        size: { width: 60, height: 20 },
        radius: 30,
        attrs: { x: -10, y: 5, angle: 90, zIndex: 4 },
      },
    }),
  ]),
  'REN-003': Object.freeze([
    traceAction('loadDataset', { datasetId: 'item-components' }),
    traceAction('setComponentVisibility', {
      ownerId: 'item',
      componentId: 'icon',
      show: false,
    }),
    traceAction('setComponentVisibility', {
      ownerId: 'item',
      componentId: 'icon',
      show: true,
    }),
  ]),
  'REN-002': Object.freeze([
    traceAction('loadGrid', { gridId: 'grid', inactiveCellStrategy: 'hide' }),
    traceAction('snapshotGrid', { gridId: 'grid' }),
    traceAction('reloadGrid', { gridId: 'grid', inactiveCellStrategy: 'destroy' }),
  ]),
});

/**
 * Fold the five render-foundation executions into the canonical fourteen-domain
 * observation. This module is import-free and expected-blind; every projected
 * value comes from the executable fixture, PatchMap public probes, executor
 * journal, cleanup proof, or an optional independent browser probe.
 */
export function foldRenderFoundationExecution(options) {
  const input = validateOptions(options);
  const plan = validateCasePlan(input.casePlan);
  const execution = validateExecution(input.execution, plan);
  const browserProbe = validateBrowserProbe(input.browserProbe, plan.id);
  const fixtures = projectFixtures(plan);
  const captures = projectCaptures(plan, execution);
  const terminalProduct = terminalProductObservation(execution);
  const terminalSemantic = execution.terminalSemanticProbe;
  const terminalSnapshot = execution.terminalSnapshot;

  const actual = {
    $schema: OBSERVATION_REVISION,
    case: projectCase(plan, execution),
    provenance: cloneRecord(input.provenance, 'provenance'),
    environment: cloneRecord(input.environment, 'environment'),
    revisions: projectRevisions(terminalSnapshot),
    scene: projectSceneFoundation(terminalSemantic, terminalSnapshot),
    geometry: projectGeometryFoundation(terminalSemantic, terminalProduct),
    text: projectTextFoundation(terminalSemantic),
    paint: projectPaintFoundation(terminalSemantic, terminalSnapshot),
    interaction: projectInteractionFoundation(terminalSemantic),
    events: {
      _availability: {
        eventJournal: 'available',
        browserProbe: browserProbe ? 'available' : 'unavailable',
      },
      journal: clone(execution.eventJournal),
    },
    history: projectHistoryFoundation(terminalSemantic),
    accessibility: notExercised('render-foundation-actions-do-not-observe-accessibility'),
    outcome: {
      _availability: { actionResults: 'available' },
      recorded: true,
      actionResults: clone(execution.actionResults),
    },
    resources: {
      _availability: {
        cleanup: 'available',
        terminalSnapshot: terminalSnapshot ? 'available' : 'unavailable',
        browserProbe: browserProbe ? 'available' : 'unavailable',
      },
      cleanup: clone(execution.cleanup),
      ...(terminalSnapshot?.resources ? { terminal: clone(terminalSnapshot.resources) } : {}),
    },
  };

  if (plan.id === 'LAY-001') projectLayoutContentBox(actual, execution);
  if (plan.id === 'REN-001') projectNestedGroups(actual, execution);
  if (plan.id === 'REN-002') projectGrid(actual, execution);
  if (plan.id === 'REN-003') projectItemComponents(actual, execution);
  if (plan.id === 'REN-004') projectRect(actual, execution);
  mergeBrowserProbe(actual, browserProbe);

  assert(
    DOMAIN_NAMES.every((domain) => isPlainObject(actual[domain])),
    'actual must contain all fourteen object domains',
  );
  validateJsonValue(actual, 'actual', new WeakSet());
  return deepFreeze({ actual, fixtures, captures });
}

function validateOptions(options) {
  assert(isPlainObject(options), 'options must be a plain object');
  assertExactKeys(
    options,
    ['browserProbe', 'casePlan', 'environment', 'execution', 'provenance'],
    'options',
    { optional: ['browserProbe'] },
  );
  assert(isPlainObject(options.casePlan), 'casePlan must be a plain object');
  assert(isPlainObject(options.execution), 'execution must be a plain object');
  assert(isPlainObject(options.provenance), 'provenance must be a plain object');
  assert(isPlainObject(options.environment), 'environment must be a plain object');
  validateJsonValue(options.provenance, 'provenance', new WeakSet());
  validateJsonValue(options.environment, 'environment', new WeakSet());
  return options;
}

function validateCasePlan(casePlan) {
  validateJsonValue(casePlan, 'casePlan', new WeakSet());
  const trace = CASES[casePlan.id];
  assert(trace !== undefined, `unsupported render-foundation case ${String(casePlan.id)}`);
  assert(casePlan.caseType === 'capability', `${casePlan.id} caseType`);
  assert(isPlainObject(casePlan.fixture), `${casePlan.id} fixture`);
  assert(isPlainObject(casePlan.fixture.setup), `${casePlan.id} fixture setup`);
  assert(isPlainObject(casePlan.fixture.setup.params), `${casePlan.id} fixture setup params`);
  assert(isPlainObject(casePlan.routeParams), `${casePlan.id} routeParams`);
  assert(
    typeof casePlan.routeParams.size === 'string' && casePlan.routeParams.size.length > 0,
    `${casePlan.id} size`,
  );
  assertUint32(casePlan.routeParams.seed, `${casePlan.id} seed`);

  const fixtureActions = casePlan.fixture.actionTrace;
  assert(Array.isArray(fixtureActions), `${casePlan.id} fixture actionTrace`);
  assert(Array.isArray(casePlan.actionTrace), `${casePlan.id} materialized actionTrace`);
  assert(sameJson(fixtureActions, casePlan.actionTrace), `${casePlan.id} actionTrace drift`);
  assert(fixtureActions.length === trace.length, `${casePlan.id} action count`);
  fixtureActions.forEach((action, index) => {
    assert(isPlainObject(action), `${casePlan.id} action ${index}`);
    assertExactKeys(action, ['index', 'operands', 'type'], `${casePlan.id} action ${index}`);
    assert(action.index === index, `${casePlan.id} action ${index} index`);
    assert(action.type === trace[index].type, `${casePlan.id} action ${index} type`);
    assert(sameJson(action.operands, trace[index].operands), `${casePlan.id} action ${index} operands`);
  });

  const checkpoints = casePlan.fixture.captureCheckpoints ?? casePlan.captureCheckpoints ?? [];
  assert(Array.isArray(checkpoints), `${casePlan.id} captureCheckpoints`);
  const checkpointIds = new Set();
  checkpoints.forEach((checkpoint) => {
    assert(isPlainObject(checkpoint), `${casePlan.id} checkpoint`);
    assert(typeof checkpoint.id === 'string' && checkpoint.id.length > 0, `${casePlan.id} checkpoint id`);
    assert(!checkpointIds.has(checkpoint.id), `${casePlan.id} duplicate checkpoint ${checkpoint.id}`);
    checkpointIds.add(checkpoint.id);
    assert(checkpoint.phase === 'after-action', `${casePlan.id} checkpoint phase`);
    assertActionIndex(checkpoint.afterActionIndex, trace.length, `${casePlan.id} checkpoint index`);
    assert(Array.isArray(checkpoint.paths), `${casePlan.id} checkpoint paths`);
    checkpoint.paths.forEach((path) => {
      assert(typeof path === 'string' && path.length > 0, `${casePlan.id} checkpoint path`);
    });
  });
  validateCheckpoints(casePlan.id, checkpoints);
  return { ...casePlan, actionTrace: fixtureActions, checkpoints };
}

function validateCheckpoints(caseId, checkpoints) {
  if (caseId === 'REN-003') {
    assert(sameJson(checkpoints, [{
      id: 'initial',
      phase: 'after-action',
      afterActionIndex: 0,
      paths: ['icon/id'],
    }]), 'REN-003 checkpoints');
    return;
  }
  if (caseId === 'REN-004') {
    assert(sameJson(checkpoints, [{
      id: 'rect',
      phase: 'after-action',
      afterActionIndex: 1,
      paths: ['worldBounds'],
    }]), 'REN-004 checkpoints');
    return;
  }
  assert(checkpoints.length === 0, `${caseId} checkpoints must be empty`);
}

function validateExecution(execution, plan) {
  validateJsonValue(execution, 'execution', new WeakSet());
  assert(execution.$schema === EXECUTION_REVISION, 'execution schema');
  assert(execution.caseId === plan.id, 'execution caseId');
  assert(execution.caseType === plan.caseType, 'execution caseType');
  assert(execution.status === 'completed', 'execution status');
  assert(execution.error === null, 'execution error');
  assert(execution.hostSeamDelta === null, 'capability hostSeamDelta');
  assert(Array.isArray(execution.actionResults), 'execution actionResults');
  assert(execution.actionResults.length === plan.actionTrace.length, 'execution action count');

  execution.actionResults.forEach((result, index) => {
    const action = plan.actionTrace[index];
    assert(isPlainObject(result), `execution action ${index}`);
    assert(result.index === index, `execution action ${index} index`);
    assert(result.type === action.type, `execution action ${index} type`);
    assert(result.handlerId === `contract/${action.type}`, `execution action ${index} handlerId`);
    assert(result.status === 'completed', `execution action ${index} status`);
    assertFiniteNumber(result.startedAtMs, `execution action ${index} startedAtMs`);
    assertFiniteNumber(result.completedAtMs, `execution action ${index} completedAtMs`);
    assert(result.completedAtMs >= result.startedAtMs, `execution action ${index} timing`);
    assert(isPlainObject(result.delta), `execution action ${index} delta`);
    assert(result.delta.$schema === DELTA_REVISION, `execution action ${index} delta schema`);
    assert(result.delta.caseId === plan.id, `execution action ${index} delta caseId`);
    assert(result.delta.actionIndex === index, `execution action ${index} delta index`);
    assert(result.delta.actionType === action.type, `execution action ${index} delta type`);
    assert(isPlainObject(result.delta.actual), `execution action ${index} actual`);
    assert(isPlainObject(result.delta.semanticProbe), `execution action ${index} semanticProbe`);
    validateProductObservation(actionProduct(result.delta.actual), `execution action ${index} product`);
  });

  assert(Array.isArray(execution.eventJournal), 'execution eventJournal');
  assert(Array.isArray(execution.eventJournalFailures), 'execution eventJournalFailures');
  assert(execution.eventJournalFailures.length === 0, 'execution event journal failures');
  assert(isPlainObject(execution.bindings), 'execution bindings');
  assert(Array.isArray(execution.captures), 'execution captures');
  assert(isPlainObject(execution.terminalSnapshot), 'execution terminalSnapshot');
  assert(isPlainObject(execution.terminalSemanticProbe), 'execution terminalSemanticProbe');
  assert(isPlainObject(execution.cleanup), 'execution cleanup');
  assert(execution.cleanup.status === 'completed', 'execution cleanup status');
  assert(Array.isArray(execution.cleanup.errors) && execution.cleanup.errors.length === 0, 'execution cleanup errors');
  assert(Array.isArray(execution.cleanup.releases), 'execution cleanup releases');
  assert(isPlainObject(execution.datasetObservations), 'execution datasetObservations');
  return execution;
}

function validateProductObservation(product, label) {
  assert(isPlainObject(product), label);
  assert(isPlainObject(product.snapshot), `${label} snapshot`);
  assert(isPlainObject(product.semanticProbe), `${label} semanticProbe`);
  assert(product.geometry === null || isPlainObject(product.geometry), `${label} geometry`);
  assert(Array.isArray(product.dataset), `${label} dataset`);
}

function actionProduct(actual) {
  if (isPlainObject(actual.product)) return actual.product;
  if (isPlainObject(actual.after)) return actual.after;
  throw new Error('Core v2 render-foundation fold invalid: action lacks product observation');
}

function terminalProductObservation(execution) {
  return actionProduct(execution.actionResults.at(-1).delta.actual);
}

function validateBrowserProbe(probe, caseId) {
  if (probe === undefined) return null;
  assert(isPlainObject(probe), 'browserProbe must be an object');
  validateJsonValue(probe, 'browserProbe', new WeakSet());
  assertExactKeys(
    probe,
    ['$schema', 'caseId', 'events', 'geometry', 'interaction', 'paint', 'resources', 'text'],
    'browserProbe',
    { optional: ['events', 'geometry', 'interaction', 'paint', 'resources', 'text'] },
  );
  assert(probe.$schema === BROWSER_PROBE_REVISION, 'browserProbe schema');
  assert(probe.caseId === caseId, 'browserProbe caseId');
  for (const domain of ['events', 'geometry', 'interaction', 'paint', 'resources', 'text']) {
    if (probe[domain] !== undefined) assert(isPlainObject(probe[domain]), `browserProbe ${domain}`);
  }
  return probe;
}

function projectRevisions(snapshot) {
  const revisions = isPlainObject(snapshot?.revisions) ? snapshot.revisions : null;
  const result = {
    _availability: {
      terminalSnapshot: snapshot ? 'available' : 'unavailable',
    },
  };
  if (!revisions) return result;
  if (isFiniteNumber(revisions.sceneRevision)) result.scene = revisions.sceneRevision;
  if (isFiniteNumber(revisions.viewRevision)) result.view = revisions.viewRevision;
  if (isFiniteNumber(revisions.interactionRevision)) result.interaction = revisions.interactionRevision;
  if (isFiniteNumber(snapshot.frameRevision)) result.frame = { revision: snapshot.frameRevision };
  if (isPlainObject(snapshot.publishedTuple)) result.publishedTuple = clone(snapshot.publishedTuple);
  return result;
}

function projectSceneFoundation(semantic, snapshot) {
  const scene = {
    _availability: {
      semanticProbe: semantic ? 'available' : 'unavailable',
      terminalSnapshot: snapshot ? 'available' : 'unavailable',
    },
  };
  if (isFiniteNumber(snapshot?.revisions?.sceneRevision)) scene.revision = snapshot.revisions.sceneRevision;
  if (isPlainObject(semantic?.scene?.counts)) {
    scene.hierarchy = {
      nodeCount: nonNegativeInteger(semantic.scene.counts.elements, 'scene hierarchy nodeCount'),
      edgeCount: nonNegativeInteger(semantic.scene.counts.hierarchyEdges, 'scene hierarchy edgeCount'),
      maxDepth: nonNegativeInteger(semantic.scene.counts.maxDepth, 'scene hierarchy maxDepth'),
    };
  }
  return scene;
}

function projectGeometryFoundation(semantic, product) {
  const result = {
    _availability: {
      semanticProbe: semantic ? 'available' : 'unavailable',
      geometryProbe: product.geometry ? 'available' : 'unavailable',
    },
  };
  if (isPlainObject(semantic?.geometry)) {
    result.finiteValueCount = nonNegativeInteger(
      semantic.geometry.finiteValueCount,
      'geometry finiteValueCount',
    );
    result.nonFiniteValueCount = nonNegativeInteger(
      semantic.geometry.nonFiniteValueCount,
      'geometry nonFiniteValueCount',
    );
    result.allFinite = booleanValue(semantic.geometry.allFinite, 'geometry allFinite');
  }
  return result;
}

function projectTextFoundation(semantic) {
  if (!isPlainObject(semantic?.text)) return notAvailable('semantic-text-probe-unavailable');
  return {
    _availability: { semanticProbe: 'available' },
    sourceCount: nonNegativeInteger(semantic.text.sourceCount, 'text sourceCount'),
    codeUnitCount: nonNegativeInteger(semantic.text.codeUnitCount, 'text codeUnitCount'),
    unpairedSurrogateCount: nonNegativeInteger(
      semantic.text.unpairedSurrogateCount,
      'text unpairedSurrogateCount',
    ),
  };
}

function projectPaintFoundation(semantic, snapshot) {
  if (!isPlainObject(semantic?.paint)) return notAvailable('semantic-paint-probe-unavailable');
  const rendering = isPlainObject(snapshot?.resources?.rendering)
    ? snapshot.resources.rendering
    : null;
  const result = {
    _availability: {
      semanticProbe: 'available',
      commandCount: 'unavailable:renderer-command-count-not-exposed',
    },
    intentCount: nonNegativeInteger(semantic.paint.intentCount, 'paint intentCount'),
    resolvedCount: nonNegativeInteger(semantic.paint.resolvedCount, 'paint resolvedCount'),
    unresolvedCount: nonNegativeInteger(semantic.paint.unresolvedCount, 'paint unresolvedCount'),
  };
  if (isFiniteNumber(rendering?.commandCount)) {
    result.commandCount = rendering.commandCount;
    result._availability.commandCount = 'available:terminal-rendering-snapshot';
  }
  if (isFiniteNumber(rendering?.visiblePrimitiveCount)) {
    result.visiblePrimitiveCount = rendering.visiblePrimitiveCount;
  }
  return result;
}

function projectInteractionFoundation(semantic) {
  const interaction = {
    _availability: {
      semanticProbe: semantic ? 'available' : 'unavailable',
      activeGestureCount: 'unavailable:engine-probe-does-not-expose-gesture-count',
    },
  };
  if (!isPlainObject(semantic?.interaction)) return interaction;
  if (Array.isArray(semantic.interaction.selectionIds)) {
    interaction.selectionIds = clone(semantic.interaction.selectionIds);
  }
  if (isFiniteNumber(semantic.interaction.activeAnimationCount)) {
    interaction.activeAnimationCount = semantic.interaction.activeAnimationCount;
  }
  if (isFiniteNumber(semantic.interaction.activeGestureCount)) {
    interaction.activeGestureCount = semantic.interaction.activeGestureCount;
    interaction._availability.activeGestureCount = 'available';
  }
  return interaction;
}

function projectHistoryFoundation(semantic) {
  if (!isPlainObject(semantic?.history)) return notAvailable('semantic-history-probe-unavailable');
  return {
    _availability: { semanticProbe: 'available' },
    ...(isFiniteNumber(semantic.history.depth) ? { depth: semantic.history.depth } : {}),
    ...(isFiniteNumber(semantic.history.corruptCount)
      ? { corruptCount: semantic.history.corruptCount }
      : {}),
  };
}

function projectLayoutContentBox(actual, execution) {
  const loaded = actionActualAt(execution, 0, 'loadDataset');
  const patched = actionActualAt(execution, 1, 'patch');
  const beforeItem = findElement(loaded.product.dataset, 'item');
  const afterItem = findElement(patched.after.dataset, 'item');
  assert(beforeItem.type === 'item' && afterItem.type === 'item', 'LAY-001 item type');
  const beforeContent = contentBox(beforeItem);
  const afterContent = contentBox(afterItem);
  const bar = findComponent(afterItem, 'bar');
  const icon = findComponent(afterItem, 'icon');
  const barSize = componentSize(bar.size, afterContent);
  const iconSize = componentSize(icon.size, afterContent);

  actual.scene.before = { contentBox: beforeContent };
  actual.scene.after = {
    contentBox: afterContent,
    bar: { size: barSize },
    icon: { size: iconSize },
  };
  const beforeRevision = revisionFromProduct(patched.before, 'LAY-001 before revision');
  const afterRevision = revisionFromProduct(patched.after, 'LAY-001 after revision');
  actual.revisions.publication = { revisionDelta: afterRevision - beforeRevision };
  const staleCount = dependentGeometryStaleCount(patched.after, {
    'item::bar:bar': barSize,
    'item::icon:icon': iconSize,
  });
  actual.geometry.dependentGeometry = staleCount === null
    ? {
        _availability: {
          staleCount: 'unavailable:renderer-geometry-probe-unavailable-or-incomplete',
        },
      }
    : { staleCount };
}

function projectNestedGroups(actual, execution) {
  const initial = actionProduct(actionActualAt(execution, 0, 'loadDataset'));
  const hidden = actionActualAt(execution, 1, 'patch').after;
  const locked = actionActualAt(execution, 2, 'patch').after;
  const worldPosition = elementWorldPosition(initial.dataset, 'rect-b');
  actual.scene.initial = { 'rect-b': { worldPosition } };
  actual.scene.hidden = {
    'rect-b': {
      ...(renderObjectCount(hidden, 'rect-b') === null
        ? {}
        : { renderObjectCount: renderObjectCount(hidden, 'rect-b') }),
      ...(hitCount(hidden, 'rect-b') === null ? {} : { hitCount: hitCount(hidden, 'rect-b') }),
    },
  };
  actual.scene.locked = {
    'rect-b': {
      ...(renderObjectCount(locked, 'rect-b') === null
        ? {}
        : { renderObjectCount: renderObjectCount(locked, 'rect-b') }),
      editable: !semanticNode(locked.semanticProbe, 'element', 'rect-b').locked,
    },
  };
  actual.scene.childOrder = locked.semanticProbe.scene.nodes.map((node) => node.target.id);
  actual.scene._availability.renderObjectCount = locked.geometry
    ? 'available'
    : 'unavailable:renderer-geometry-probe-unavailable';
  actual.scene._availability.hitCount = hidden.geometry
    ? 'available'
    : 'unavailable:renderer-geometry-probe-unavailable';
}

function projectGrid(actual, execution) {
  const hidden = actionProduct(actionActualAt(execution, 0, 'loadGrid'));
  const snapped = actionProduct(actionActualAt(execution, 1, 'snapshotGrid'));
  const destroyed = actionActualAt(execution, 2, 'reloadGrid').after;
  const hiddenGrid = findElement(hidden.dataset, 'grid');
  const snappedGrid = findElement(snapped.dataset, 'grid');
  const destroyedGrid = findElement(destroyed.dataset, 'grid');
  assert(hiddenGrid.type === 'grid', 'REN-002 hidden grid');
  assert(snappedGrid.type === 'grid', 'REN-002 snapped grid');
  assert(destroyedGrid.type === 'grid', 'REN-002 destroyed grid');
  const inactiveId = 'grid.0.1';
  const hiddenRenderCount = renderObjectCount(hidden, inactiveId);

  actual.scene.hide = {
    activeIds: activeGridIds(hiddenGrid),
    inactive: {
      grid: {
        0: {
          1: {
            logicalCount: logicalGridCellCount(hiddenGrid, 0, 1),
            ...(hiddenRenderCount === null ? {} : { renderObjectCount: hiddenRenderCount }),
          },
        },
      },
    },
  };
  actual.scene.cells = {
    grid: {
      0: {
        2: {
          position: gridCellPosition(snappedGrid, 0, 2),
          label: snappedGrid.cells[0][2],
        },
      },
    },
  };
  actual.resources.destroy = {
    inactive: {
      grid: {
        0: { 1: { logicalCount: logicalGridCellCount(destroyedGrid, 0, 1) } },
      },
    },
  };
  actual.scene._availability.gridRenderObjectCount = hidden.geometry
    ? 'available'
    : 'unavailable:renderer-geometry-probe-unavailable';
}

function projectItemComponents(actual, execution) {
  const initial = actionProduct(actionActualAt(execution, 0, 'loadDataset'));
  const hidden = actionActualAt(execution, 1, 'setComponentVisibility').after;
  const shown = actionActualAt(execution, 2, 'setComponentVisibility').after;
  const item = findElement(initial.dataset, 'item');
  assert(item.type === 'item', 'REN-003 item type');
  const iconEntityId = 'item::icon:icon';
  const background = findComponent(item, 'background');
  const hitBounds = entityBounds(shown, 'item') ?? semanticItemBounds(item);
  const hiddenRenderCount = renderObjectCount(hidden, iconEntityId);
  const shownIcon = semanticNode(shown.semanticProbe, 'component', 'icon', 'item');

  actual.scene.item = {
    background: { bounds: semanticItemBounds(item) },
    contentBox: contentBox(item),
    componentOrder: item.components.map((component) => component.type),
    hitBounds,
  };
  actual.scene.hidden = {
    icon: {
      logicalCount: background && semanticNode(hidden.semanticProbe, 'component', 'icon', 'item') ? 1 : 0,
      ...(hiddenRenderCount === null ? {} : { renderObjectCount: hiddenRenderCount }),
    },
  };
  actual.scene.shown = { icon: { id: shownIcon.target.id } };
  actual.scene._availability.componentRenderObjectCount = hidden.geometry
    ? 'available'
    : 'unavailable:renderer-geometry-probe-unavailable';
  actual.scene._availability.itemHitBounds = entityBounds(shown, 'item')
    ? 'available:renderer-geometry-probe'
    : 'available:semantic-export-derived';
  actual.resources.retainedDelta = resourceDelta(initial.snapshot, shown.snapshot);
}

function projectRect(actual, execution) {
  const patched = actionActualAt(execution, 1, 'patch');
  const product = patched.after;
  const rect = findElement(product.dataset, 'rect');
  assert(rect.type === 'rect', 'REN-004 rect type');
  const rendererBounds = entityBounds(product, 'rect');
  const bounds = rendererBounds ? boundsObject(rendererBounds) : rectWorldBounds(rect);
  actual.scene.rect = {
    data: {
      size: [rect.size.width, rect.size.height],
      radius: clone(rect.radius),
    },
    worldBounds: bounds,
    hitBounds: clone(bounds),
    paint: { fill: clone(rect.fill) },
    attrs: { zIndex: rect.attrs?.zIndex ?? 0 },
  };
  actual.scene._availability.rectWorldBounds = rendererBounds
    ? 'available:renderer-geometry-probe'
    : 'available:semantic-export-derived';
}

function projectFixtures(plan) {
  return cloneRecord(plan.fixture.setup.params, `${plan.id} fixtures`);
}

function projectCaptures(plan, execution) {
  const result = {};
  for (const [name, value] of Object.entries(execution.bindings)) {
    assert(name.length > 0, 'binding name must not be empty');
    assignOwned(result, name, clone(value), `binding ${name}`);
  }
  const declared = new Map(plan.checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]));
  const seen = new Set();
  for (const capture of execution.captures) {
    assert(isPlainObject(capture), 'capture must be an object');
    assert(typeof capture.id === 'string' && capture.id.length > 0, 'capture id');
    assert(!seen.has(capture.id), `duplicate capture ${capture.id}`);
    seen.add(capture.id);
    const checkpoint = declared.get(capture.id);
    assert(checkpoint !== undefined, `undeclared capture ${capture.id}`);
    assert(capture.phase === checkpoint.phase, `capture ${capture.id} phase`);
    assert(capture.afterActionIndex === checkpoint.afterActionIndex, `capture ${capture.id} index`);
    assert(isPlainObject(capture.values), `capture ${capture.id} values`);
    const projected = {};
    for (const path of checkpoint.paths) {
      assert(Object.hasOwn(capture.values, path), `capture ${capture.id} missing ${path}`);
      assignPath(projected, path.split('/'), clone(capture.values[path]), `capture ${capture.id}`);
    }
    assignOwned(result, capture.id, projected, `capture ${capture.id}`);
  }
  assert(seen.size === declared.size, 'execution must contain every declared capture');
  return result;
}

function projectCase(plan, execution) {
  return {
    id: plan.id,
    caseType: plan.caseType,
    params: clone(plan.routeParams),
    ...(typeof plan.fixtureSha256 === 'string' ? { fixtureSha256: plan.fixtureSha256 } : {}),
    ...(typeof plan.rootTestId === 'string' ? { rootTestId: plan.rootTestId } : {}),
    executedActions: execution.actionResults.map((result) => ({
      index: result.index,
      type: result.type,
      status: result.status,
    })),
  };
}

function mergeBrowserProbe(actual, probe) {
  if (!probe) return;
  for (const domain of ['events', 'geometry', 'interaction', 'paint', 'resources', 'text']) {
    if (!probe[domain]) continue;
    for (const [key, value] of Object.entries(probe[domain])) {
      assignOwned(actual[domain], key, clone(value), `browser ${domain} ${key}`);
    }
  }
}

function actionActualAt(execution, index, type) {
  const result = execution.actionResults[index];
  assert(result?.type === type, `action ${index} must be ${type}`);
  return result.delta.actual;
}

function revisionFromProduct(product, label) {
  return finiteNumber(product.snapshot?.revisions?.sceneRevision, label);
}

function findElement(elements, id) {
  for (const element of elements) {
    if (element.id === id) return element;
    if (element.type === 'group') {
      const nested = findElementOrNull(element.children, id);
      if (nested) return nested;
    }
  }
  throw new Error(`Core v2 render-foundation fold invalid: missing element ${id}`);
}

function findElementOrNull(elements, id) {
  for (const element of elements) {
    if (element.id === id) return element;
    if (element.type === 'group') {
      const nested = findElementOrNull(element.children, id);
      if (nested) return nested;
    }
  }
  return null;
}

function findComponent(item, id) {
  const component = item.components.find((candidate) => candidate.id === id);
  assert(component !== undefined, `missing component ${item.id}:${id}`);
  return component;
}

function semanticNode(probe, kind, id, ownerId) {
  assert(Array.isArray(probe?.scene?.nodes), 'semantic nodes');
  const node = probe.scene.nodes.find((candidate) => (
    candidate.target?.kind === kind
      && candidate.target?.id === id
      && (kind !== 'component' || candidate.target?.ownerId === ownerId)
  ));
  assert(node !== undefined, `missing semantic node ${kind}:${ownerId ?? ''}:${id}`);
  return node;
}

function contentBox(item) {
  const size = item.size;
  const padding = item.padding;
  return [
    cleanNumber(padding.left),
    cleanNumber(padding.top),
    cleanNumber(Math.max(0, size.width - padding.left - padding.right)),
    cleanNumber(Math.max(0, size.height - padding.top - padding.bottom)),
  ];
}

function componentSize(size, box) {
  if (isPlainObject(size) && Object.hasOwn(size, 'width')) {
    return [
      resolveDimension(size.width, box[2]),
      resolveDimension(size.height, box[3]),
    ];
  }
  const reference = Math.min(box[2], box[3]);
  const length = resolveDimension(size, reference);
  return [length, length];
}

function resolveDimension(value, reference) {
  if (typeof value === 'number') return cleanNumber(value);
  if (typeof value === 'string' && /^\d+(?:\.\d+)?%$/u.test(value)) {
    return cleanNumber(Number.parseFloat(value) * reference / 100);
  }
  if (isPlainObject(value) && value.unit === '%') {
    return cleanNumber(value.value * reference / 100);
  }
  if (isPlainObject(value) && value.unit === 'px') return cleanNumber(value.value);
  throw new Error('Core v2 render-foundation fold invalid: unsupported projected dimension');
}

function dependentGeometryStaleCount(product, expectedSizes) {
  if (!isPlainObject(product.geometry) || !Array.isArray(product.geometry.entities)) return null;
  let stale = 0;
  for (const [id, expectedSize] of Object.entries(expectedSizes)) {
    const entity = product.geometry.entities.find((candidate) => candidate.id === id);
    if (!entity || !Array.isArray(entity.worldBounds) || entity.worldBounds.length !== 4) return null;
    if (!near(entity.worldBounds[2], expectedSize[0]) || !near(entity.worldBounds[3], expectedSize[1])) {
      stale += 1;
    }
  }
  return stale;
}

function elementWorldPosition(elements, id, parentX = 0, parentY = 0) {
  for (const element of elements) {
    const x = parentX + finiteOr(element.attrs?.x, 0, `${element.id}.attrs.x`);
    const y = parentY + finiteOr(element.attrs?.y, 0, `${element.id}.attrs.y`);
    if (element.id === id) return [cleanNumber(x), cleanNumber(y)];
    if (element.type === 'group') {
      const nested = elementWorldPositionOrNull(element.children, id, x, y);
      if (nested) return nested;
    }
  }
  throw new Error(`Core v2 render-foundation fold invalid: missing world position ${id}`);
}

function elementWorldPositionOrNull(elements, id, parentX, parentY) {
  for (const element of elements) {
    const x = parentX + finiteOr(element.attrs?.x, 0, `${element.id}.attrs.x`);
    const y = parentY + finiteOr(element.attrs?.y, 0, `${element.id}.attrs.y`);
    if (element.id === id) return [cleanNumber(x), cleanNumber(y)];
    if (element.type === 'group') {
      const nested = elementWorldPositionOrNull(element.children, id, x, y);
      if (nested) return nested;
    }
  }
  return null;
}

function renderObjectCount(product, id) {
  if (!isPlainObject(product.geometry) || !Array.isArray(product.geometry.entities)) return null;
  return product.geometry.entities.filter((entity) => entity.id === id && entity.visible === true).length;
}

function hitCount(product, id) {
  if (!isPlainObject(product.geometry) || !Array.isArray(product.geometry.entities)) return null;
  return product.geometry.entities.filter(
    (entity) => entity.id === id && entity.visible === true && entity.interactive === true,
  ).length;
}

function entityBounds(product, id) {
  if (!isPlainObject(product.geometry) || !Array.isArray(product.geometry.entities)) return null;
  const entity = product.geometry.entities.find((candidate) => candidate.id === id);
  if (!entity || !Array.isArray(entity.worldBounds) || entity.worldBounds.length !== 4) return null;
  return entity.worldBounds.map((value, index) => cleanNumber(finiteNumber(value, `${id} bounds ${index}`)));
}

function activeGridIds(grid) {
  const result = [];
  grid.cells.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      if (cell !== 0) result.push(`${grid.id}.${rowIndex}.${columnIndex}`);
    });
  });
  return result;
}

function logicalGridCellCount(grid, row, column) {
  const value = grid.cells[row]?.[column];
  assert(value !== undefined, `grid cell ${row}:${column}`);
  return value === 0 && grid.inactiveCellStrategy === 'destroy' ? 0 : 1;
}

function gridCellPosition(grid, row, column) {
  return [
    cleanNumber(column * (grid.item.size.width + grid.gap.x)),
    cleanNumber(row * (grid.item.size.height + grid.gap.y)),
  ];
}

function semanticItemBounds(item) {
  return [
    cleanNumber(finiteOr(item.attrs?.x, 0, `${item.id}.attrs.x`)),
    cleanNumber(finiteOr(item.attrs?.y, 0, `${item.id}.attrs.y`)),
    cleanNumber(item.size.width),
    cleanNumber(item.size.height),
  ];
}

function resourceDelta(before, after) {
  const beforeSubscriptions = finiteNumber(
    before.resources?.subscriptions?.active,
    'resources before subscriptions',
  );
  const afterSubscriptions = finiteNumber(
    after.resources?.subscriptions?.active,
    'resources after subscriptions',
  );
  return {
    canvasCount: finiteNumber(after.resources?.canvasCount, 'resources after canvas')
      - finiteNumber(before.resources?.canvasCount, 'resources before canvas'),
    subscriptions: afterSubscriptions - beforeSubscriptions,
    pendingWork: finiteNumber(after.pendingWork, 'resources after pendingWork')
      - finiteNumber(before.pendingWork, 'resources before pendingWork'),
  };
}

function boundsObject(bounds) {
  return { x: bounds[0], y: bounds[1], width: bounds[2], height: bounds[3] };
}

function rectWorldBounds(rect) {
  const x = finiteOr(rect.attrs?.x, 0, `${rect.id}.attrs.x`);
  const y = finiteOr(rect.attrs?.y, 0, `${rect.id}.attrs.y`);
  const angle = finiteOr(rect.attrs?.angle ?? rect.attrs?.rotation, 0, `${rect.id}.attrs.angle`);
  const radians = angle * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const corners = [
    [0, 0],
    [rect.size.width, 0],
    [0, rect.size.height],
    [rect.size.width, rect.size.height],
  ].map(([localX, localY]) => [
    x + localX * cosine - localY * sine,
    y + localX * sine + localY * cosine,
  ]);
  const xs = corners.map(([cornerX]) => cornerX);
  const ys = corners.map(([, cornerY]) => cornerY);
  const left = cleanNumber(Math.min(...xs));
  const top = cleanNumber(Math.min(...ys));
  const right = cleanNumber(Math.max(...xs));
  const bottom = cleanNumber(Math.max(...ys));
  return {
    x: left,
    y: top,
    width: cleanNumber(right - left),
    height: cleanNumber(bottom - top),
  };
}

function cleanNumber(value) {
  const integer = Math.round(value);
  if (Math.abs(value - integer) < 1e-9) return integer === 0 ? 0 : integer;
  const rounded = Math.round(value * 1e9) / 1e9;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function near(left, right) {
  return Math.abs(left - right) <= 1e-7;
}

function assignPath(target, segments, value, label) {
  let cursor = target;
  for (const [index, segment] of segments.entries()) {
    assert(segment.length > 0, `${label} empty path segment`);
    if (index === segments.length - 1) {
      assert(!Object.hasOwn(cursor, segment), `${label} collision at ${segment}`);
      cursor[segment] = value;
      return;
    }
    if (!Object.hasOwn(cursor, segment)) cursor[segment] = {};
    assert(isPlainObject(cursor[segment]), `${label} path collision at ${segment}`);
    cursor = cursor[segment];
  }
}

function traceAction(type, operands) {
  return Object.freeze({ type, operands: deepFreeze(operands) });
}

function notExercised(reason) {
  return { _availability: { status: 'not-exercised', reason } };
}

function notAvailable(reason) {
  return { _availability: { status: 'unavailable', reason } };
}

function assignOwned(target, key, value, source) {
  assert(!Object.hasOwn(target, key), `${source} collides at ${key}`);
  target[key] = value;
}

function cloneRecord(value, label) {
  assert(isPlainObject(value), `${label} must be a plain object`);
  return clone(value);
}

function clone(value) {
  return structuredClone(value);
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

function assertExactKeys(value, allowed, label, options = {}) {
  const optional = new Set(options.optional ?? []);
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) assert(allowedSet.has(key), `${label} unknown key ${key}`);
  for (const key of allowed) {
    if (!optional.has(key)) assert(Object.hasOwn(value, key), `${label} missing key ${key}`);
  }
}

function assertActionIndex(value, length, label) {
  assert(Number.isSafeInteger(value) && value >= 0 && value < length, label);
}

function assertUint32(value, label) {
  assert(Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff, label);
}

function assertFiniteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), label);
}

function finiteNumber(value, label) {
  assertFiniteNumber(value, label);
  return value;
}

function finiteOr(value, fallback, label) {
  return value === undefined ? fallback : finiteNumber(value, label);
}

function nonNegativeInteger(value, label) {
  assert(Number.isSafeInteger(value) && value >= 0, label);
  return value;
}

function booleanValue(value, label) {
  assert(typeof value === 'boolean', label);
  return value;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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
  if (!condition) throw new Error(`Core v2 render-foundation fold invalid: ${message}`);
}
