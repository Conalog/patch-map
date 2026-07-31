import { clone } from './value-atoms.mjs';

export const RENDER_BOUNDS_FOLD_REVISION = 'core-v2-render-bounds-fold/1';

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
  traceAction('loadBoundsMatrix', { datasetId: 'bounds' }),
  traceAction('queryBounds', {
    targets: [
      'rotated',
      'flipped',
      'overflow-text',
      'hidden',
      'transparent-interactive',
      'zero-size',
    ],
  }),
  traceAction('hitTest', { points: [[10, 10], [210, 10]] }),
  traceAction('destroyTarget', { id: 'rotated' }),
]);

/** Fold LAY-005 public Engine evidence into the canonical fourteen domains. */
export function foldRenderBoundsExecution(options) {
  const input = validateOptions(options);
  const plan = validateCasePlan(input.casePlan);
  const execution = validateExecution(input.execution, plan);
  const queried = actionActualAt(execution, 1, 'queryBounds');
  const hit = actionActualAt(execution, 2, 'hitTest');
  const destroyed = actionActualAt(execution, 3, 'destroyTarget');
  const terminalSnapshot = execution.terminalSnapshot;
  const terminalSemantic = execution.terminalSemanticProbe;

  const actual = {
    $schema: OBSERVATION_REVISION,
    case: projectCase(plan, execution),
    provenance: cloneRecord(input.provenance, 'provenance'),
    environment: cloneRecord(input.environment, 'environment'),
    revisions: projectRevisions(terminalSnapshot),
    scene: projectScene(terminalSnapshot, terminalSemantic, destroyed),
    geometry: projectGeometry(queried),
    text: projectText(terminalSemantic),
    paint: projectPaint(terminalSemantic),
    interaction: projectInteraction(terminalSemantic, hit),
    events: {
      _availability: { eventJournal: 'available' },
      journal: clone(execution.eventJournal),
    },
    history: projectHistory(terminalSemantic),
    accessibility: notExercised('bounds-actions-do-not-observe-accessibility'),
    outcome: {
      _availability: { actionResults: 'available' },
      recorded: true,
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
    fixtures: cloneRecord(plan.fixture.setup.params, 'fixtures'),
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
  assert(casePlan.id === 'LAY-005', 'case ID');
  assert(casePlan.caseType === 'capability', 'caseType');
  assert(isPlainObject(casePlan.fixture), 'fixture');
  assert(isPlainObject(casePlan.fixture.setup), 'fixture setup');
  assert(isPlainObject(casePlan.fixture.setup.params), 'fixture params');
  assert(isPlainObject(casePlan.routeParams), 'routeParams');
  assert(typeof casePlan.routeParams.size === 'string', 'route size');
  assertUint32(casePlan.routeParams.seed, 'route seed');
  const fixtureActions = casePlan.fixture.actionTrace;
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
    Array.isArray(casePlan.fixture.captureCheckpoints)
      && casePlan.fixture.captureCheckpoints.length === 0,
    'capture checkpoints',
  );
  return { ...casePlan, actionTrace: fixtureActions };
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
    assert(isPlainObject(result.delta), `result ${index} delta`);
    assert(result.delta.$schema === DELTA_REVISION, `result ${index} delta schema`);
    assert(result.delta.caseId === plan.id, `result ${index} delta caseId`);
    assert(result.delta.actionIndex === index, `result ${index} delta index`);
    assert(result.delta.actionType === trace.type, `result ${index} delta type`);
    assert(isPlainObject(result.delta.actual), `result ${index} actual`);
    assert(isPlainObject(result.delta.semanticProbe), `result ${index} semanticProbe`);
  });
  assert(Array.isArray(execution.eventJournal), 'eventJournal');
  assert(Array.isArray(execution.eventJournalFailures), 'eventJournalFailures');
  assert(execution.eventJournalFailures.length === 0, 'event journal failures');
  assert(Array.isArray(execution.captures) && execution.captures.length === 0, 'captures');
  assert(isPlainObject(execution.bindings) && Object.keys(execution.bindings).length === 0, 'bindings');
  assert(isPlainObject(execution.terminalSnapshot), 'terminalSnapshot');
  assert(isPlainObject(execution.terminalSemanticProbe), 'terminalSemanticProbe');
  assert(isPlainObject(execution.cleanup), 'cleanup');
  assert(execution.cleanup.status === 'completed', 'cleanup status');
  assert(Array.isArray(execution.cleanup.errors) && execution.cleanup.errors.length === 0, 'cleanup errors');
  return execution;
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

function projectScene(snapshot, semantic, destroyed) {
  const revisions = recordValue(snapshot.revisions, 'scene snapshot revisions');
  const query = recordValue(destroyed.query, 'destroy query');
  assert(destroyed.id === 'rotated', 'destroy target ID');
  return {
    _availability: {
      terminalSnapshot: 'available',
      semanticProbe: 'available',
      postRemovalQuery: 'available',
    },
    revision: finiteNumber(revisions.sceneRevision, 'scene revision'),
    rootIds: cloneArray(semantic.dataset?.rootIds, 'semantic root IDs'),
    destroyed: {
      rotated: {
        queryCount: nonNegativeInteger(query.semanticCount, 'destroy semantic query count'),
        renderQueryCount: nonNegativeInteger(query.geometryCount, 'destroy geometry query count'),
      },
    },
  };
}

function projectGeometry(queried) {
  assert(Array.isArray(queried.targets), 'query targets');
  const bounds = recordValue(queried.bounds, 'query bounds');
  const geometry = {
    _availability: { publicGeometryProbe: 'available' },
    bounds: {
      revision: finiteNumber(queried.geometryRevision, 'geometry revision'),
      revisionLag: finiteNumber(queried.revisionLag, 'geometry revision lag'),
    },
  };
  for (const target of queried.targets) {
    assert(typeof target === 'string' && target.length > 0, 'query target');
    assert(!Object.hasOwn(geometry, target), `duplicate geometry target ${target}`);
    geometry[target] = normalizeGeometryEntity(recordValue(bounds[target], `${target} bounds`));
  }
  return geometry;
}

function normalizeGeometryEntity(entity) {
  return {
    id: stringValue(entity.id, 'geometry entity ID'),
    kind: stringValue(entity.kind, 'geometry entity kind'),
    localBounds: normalizeBounds(entity.localBounds, 'localBounds'),
    worldBounds: normalizeBounds(entity.worldBounds, 'worldBounds'),
    screenBounds: normalizeBounds(entity.screenBounds, 'screenBounds'),
    visibleBounds: entity.visibleBounds === null
      ? null
      : normalizeBounds(entity.visibleBounds, 'visibleBounds'),
    visible: booleanValue(entity.visible, 'visible'),
    interactive: booleanValue(entity.interactive, 'interactive'),
    scaleX: normalizeNumber(entity.scaleX, 'scaleX'),
    scaleY: normalizeNumber(entity.scaleY, 'scaleY'),
  };
}

function projectInteraction(semantic, hit) {
  assert(Array.isArray(hit.probes), 'hit probes');
  const interaction = recordValue(semantic.interaction, 'semantic interaction');
  return {
    _availability: {
      semanticProbe: 'available',
      publicHitTest: 'available',
    },
    'transparent-interactive': {
      hitCount: hit.probes.filter((probe) => (
        isPlainObject(probe) && probe.targetId === 'transparent-interactive'
      )).length,
    },
    activeGestureCount: nonNegativeInteger(
      interaction.activeGestureCount,
      'activeGestureCount',
    ),
    selectionIds: cloneArray(interaction.selectionIds, 'selectionIds'),
    activeAnimationCount: nonNegativeInteger(
      interaction.activeAnimationCount,
      'activeAnimationCount',
    ),
  };
}

function projectText(semantic) {
  const text = recordValue(semantic.text, 'semantic text');
  return {
    _availability: { semanticProbe: 'available' },
    sourceCount: nonNegativeInteger(text.sourceCount, 'text sourceCount'),
    codeUnitCount: nonNegativeInteger(text.codeUnitCount, 'text codeUnitCount'),
    unpairedSurrogateCount: nonNegativeInteger(
      text.unpairedSurrogateCount,
      'text unpaired surrogate count',
    ),
  };
}

function projectPaint(semantic) {
  const paint = recordValue(semantic.paint, 'semantic paint');
  return {
    _availability: { semanticProbe: 'available' },
    intentCount: nonNegativeInteger(paint.intentCount, 'paint intent count'),
    resolvedCount: nonNegativeInteger(paint.resolvedCount, 'paint resolved count'),
    unresolvedCount: nonNegativeInteger(paint.unresolvedCount, 'paint unresolved count'),
  };
}

function projectHistory(semantic) {
  const history = recordValue(semantic.history, 'semantic history');
  return {
    _availability: { semanticProbe: 'available' },
    ...(isNonNegativeInteger(history.depth)
      ? { depth: history.depth }
      : {}),
    ...(isNonNegativeInteger(history.corruptCount)
      ? { corruptCount: history.corruptCount }
      : {}),
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

function projectCaptures(execution) {
  assert(Object.keys(execution.bindings).length === 0, 'unexpected bindings');
  assert(execution.captures.length === 0, 'unexpected captures');
  return {};
}

function actionActualAt(execution, index, type) {
  const result = execution.actionResults[index];
  assert(result?.type === type, `action ${index} must be ${type}`);
  return result.delta.actual;
}

function normalizeBounds(value, label) {
  assert(Array.isArray(value) && value.length === 4, label);
  return value.map((entry, index) => normalizeNumber(entry, `${label}[${index}]`));
}

function normalizeNumber(value, label) {
  const numeric = finiteNumber(value, label);
  const rounded = Math.round(numeric * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
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

function isNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function finiteNumber(value, label) {
  assertFiniteNumber(value, label);
  return value;
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
  if (!condition) throw new Error(`Core v2 render-bounds fold invalid: ${message}`);
}
