import { clone, deepFreeze, createTypeSuffixValueAtoms } from './value-atoms.mjs';

const { booleanValue } = createTypeSuffixValueAtoms(assert);

export const LIFECYCLE_DESTROY_FOLD_REVISION = 'core-v2-lifecycle-destroy-fold/1';

const OBSERVATION_REVISION = 'core-v2-semantic-observation/1';
const EXECUTION_REVISION = 'core-v2-contract-case-execution/1';
const DELTA_REVISION = 'core-v2-semantic-observation-delta/1';
const ACTION_TYPES = Object.freeze([
  'initialize',
  'loadDataset',
  'destroy',
  'destroy',
  'repeatLifecycle',
]);
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

/**
 * Pure actual-only LIF-005 projector. It intentionally has no imports,
 * filesystem access, hashing, or comparison vocabulary, allowing the same fold
 * to run in the focused browser Lab and independent automation.
 */
export function foldLifecycleDestroyExecution(options) {
  const input = validateOptions(options);
  const plan = validateCasePlan(input.casePlan);
  const execution = validateExecution(input.execution, plan);
  const initialized = actionActual(execution, 0, 'initialize');
  const loaded = actionActual(execution, 1, 'loadDataset');
  const firstDestroy = actionActual(execution, 2, 'destroy');
  const repeatedDestroy = actionActual(execution, 3, 'destroy');
  const repeated = actionActual(execution, 4, 'repeatLifecycle');
  const destroyed = projectDestroyedEvents(execution.eventJournal, repeated.cycles + 1);

  assert(firstDestroy.call === 1, 'first destroy call index');
  assert(repeatedDestroy.call === 2, 'repeated destroy call index');
  assert(repeated.cycles === plan.fixture.setup.params.cycles, 'repeat cycle count');
  assert(Array.isArray(repeated.cycleRecords), 'repeat cycle records');
  assert(repeated.cycleRecords.length === repeated.cycles, 'repeat cycle record count');
  assert(isPlainObject(firstDestroy.resources), 'first destroy resources');
  assert(isPlainObject(repeated.activeResources), 'active generation resources');
  assert(isPlainObject(repeated.releasedLeakBudget), 'released leak budget');
  assert(isPlainObject(repeated.retainedDelta), 'retained delta');
  assert(isPlainObject(repeated.afterCycles), 'afterCycles snapshot');

  const generation = finiteNumber(
    repeated.afterCycles.revisions?.lifecycleGeneration,
    'terminal lifecycle generation',
  );
  const historyDepth = nonNegativeNumber(
    repeated.afterCycles.historyDepth,
    'terminal history depth',
  );
  const canvasCount = nonNegativeNumber(
    repeated.activeResources.dom?.canvasCount,
    'active canvas count',
  );
  const callbackMultiplier = finiteNumber(
    repeated.callbackMultiplier,
    'callback multiplier',
  );

  const actual = {
    $schema: OBSERVATION_REVISION,
    case: {
      id: plan.id,
      caseType: plan.caseType,
      rootTestId: plan.rootTestId,
      fixtureSha256: plan.fixtureSha256,
      executionStatus: execution.status,
    },
    provenance: cloneRecord(input.provenance, 'provenance'),
    environment: cloneRecord(input.environment, 'environment'),
    revisions: {
      _availability: { lifecycle: 'action-result' },
      lifecycle: { generation },
    },
    scene: {
      _availability: { activeGeneration: 'action-result' },
      afterCycles: {
        dom: { canvasCount },
        callbackMultiplier,
        resources: clone(repeated.releasedLeakBudget),
      },
    },
    geometry: notExercised('lifecycle-destroy-does-not-observe-geometry'),
    text: notExercised('lifecycle-destroy-does-not-observe-text'),
    paint: notExercised('lifecycle-destroy-does-not-observe-paint'),
    interaction: notExercised('lifecycle-destroy-does-not-observe-interaction'),
    events: {
      _availability: { eventJournal: 'available' },
      destroyed,
      journal: clone(execution.eventJournal),
    },
    history: {
      _availability: { terminalSnapshot: 'available' },
      depth: historyDepth,
    },
    accessibility: notExercised('lifecycle-destroy-does-not-observe-accessibility'),
    outcome: {
      _availability: { actionResults: 'available' },
      recorded: true,
      initialized: clone(initialized),
      loaded: clone(loaded),
      destroy: {
        firstReturned: booleanValue(firstDestroy.returned, 'first destroy return'),
        repeatedReturned: booleanValue(repeatedDestroy.returned, 'repeated destroy return'),
        sameTerminalResources: sameJson(firstDestroy.resources, repeatedDestroy.resources),
      },
      cycles: {
        requested: repeated.cycles,
        completed: repeated.cycleRecords.length,
        callbackCount: nonNegativeNumber(repeated.callbackCount, 'callback count'),
        input: cloneRecord(repeated.input, 'repeat input'),
        records: clone(repeated.cycleRecords),
      },
    },
    resources: {
      _availability: {
        productInspector: 'available',
        cleanup: 'available',
      },
      afterDestroy: clone(firstDestroy.resources),
      retainedDelta: clone(repeated.retainedDelta),
      activeGeneration: clone(repeated.activeResources),
      cleanup: clone(execution.cleanup),
    },
  };

  validateJsonValue(actual, 'actual', new WeakSet());
  assert(
    DOMAIN_NAMES.every((domain) => isPlainObject(actual[domain])),
    'actual must contain all fourteen object domains',
  );
  return deepFreeze({
    actual,
    fixtures: projectFixtures(plan),
    captures: projectCaptures(execution),
  });
}

function validateOptions(options) {
  assert(isPlainObject(options), 'options must be a plain object');
  assertExactKeys(options, ['casePlan', 'environment', 'execution', 'provenance'], 'options');
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
  assert(casePlan.id === 'LIF-005', 'case ID');
  assert(casePlan.caseType === 'capability', 'caseType');
  assert(isPlainObject(casePlan.fixture), 'fixture');
  assert(isPlainObject(casePlan.fixture.setup), 'fixture setup');
  assert(isPlainObject(casePlan.fixture.setup.params), 'fixture params');
  assert(casePlan.fixture.setup.params.datasetRef === 'interactive-scene', 'fixture datasetRef');
  assert(casePlan.fixture.setup.params.cycles === 10, 'fixture cycles');
  assert(isPlainObject(casePlan.routeParams), 'route params');
  assert(typeof casePlan.routeParams.size === 'string' && casePlan.routeParams.size.length > 0, 'route size');
  assertUint32(casePlan.routeParams.seed, 'route seed');
  assert(Array.isArray(casePlan.fixture.actionTrace), 'fixture actionTrace');
  assert(Array.isArray(casePlan.actionTrace), 'materialized actionTrace');
  assert(sameJson(casePlan.fixture.actionTrace, casePlan.actionTrace), 'materialized actionTrace drift');
  assert(casePlan.fixture.actionTrace.length === ACTION_TYPES.length, 'action count');

  casePlan.fixture.actionTrace.forEach((action, index) => {
    assert(isPlainObject(action), `action ${index}`);
    assertExactKeys(action, ['index', 'operands', 'type'], `action ${index}`);
    assert(action.index === index, `action ${index} index`);
    assert(action.type === ACTION_TYPES[index], `action ${index} type`);
    assert(isPlainObject(action.operands), `action ${index} operands`);
  });
  validateOperands(casePlan.fixture.actionTrace);
  return casePlan;
}

function validateOperands(actions) {
  assertExactKeys(actions[0].operands, ['instanceId', 'timeMs'], 'initialize operands');
  assert(actions[0].operands.instanceId === 'map-1', 'initialize instanceId');
  assert(actions[0].operands.timeMs === 0, 'initialize timeMs');
  assertExactKeys(actions[1].operands, ['datasetRef', 'timeMs'], 'loadDataset operands');
  assert(actions[1].operands.datasetRef === 'interactive-scene', 'loadDataset datasetRef');
  assert(actions[1].operands.timeMs === 1, 'loadDataset timeMs');
  assertExactKeys(actions[2].operands, ['timeMs'], 'first destroy operands');
  assert(actions[2].operands.timeMs === 2, 'first destroy timeMs');
  assertExactKeys(actions[3].operands, ['timeMs'], 'second destroy operands');
  assert(actions[3].operands.timeMs === 3, 'second destroy timeMs');
  assertExactKeys(actions[4].operands, ['cycles', 'startTimeMs'], 'repeatLifecycle operands');
  assert(actions[4].operands.cycles === 10, 'repeatLifecycle cycles');
  assert(actions[4].operands.startTimeMs === 10, 'repeatLifecycle startTimeMs');
}

function validateExecution(execution, plan) {
  validateJsonValue(execution, 'execution', new WeakSet());
  assert(execution.$schema === EXECUTION_REVISION, 'execution schema');
  assert(execution.caseId === plan.id, 'execution caseId');
  assert(execution.caseType === plan.caseType, 'execution caseType');
  assert(execution.status === 'completed', 'execution status');
  assert(execution.error === null, 'execution error');
  assert(execution.hostSeamDelta === null, 'capability host seam');
  assert(Array.isArray(execution.actionResults), 'action results');
  assert(execution.actionResults.length === ACTION_TYPES.length, 'action result count');

  execution.actionResults.forEach((result, index) => {
    assert(isPlainObject(result), `action result ${index}`);
    assert(result.index === index, `action result ${index} index`);
    assert(result.type === ACTION_TYPES[index], `action result ${index} type`);
    assert(result.handlerId === `contract/${ACTION_TYPES[index]}`, `action result ${index} handler`);
    assert(result.status === 'completed', `action result ${index} status`);
    finiteNumber(result.startedAtMs, `action result ${index} start`);
    finiteNumber(result.completedAtMs, `action result ${index} completion`);
    assert(result.completedAtMs >= result.startedAtMs, `action result ${index} timing`);
    assert(isPlainObject(result.delta), `action result ${index} delta`);
    assert(result.delta.$schema === DELTA_REVISION, `action result ${index} delta schema`);
    assert(result.delta.caseId === plan.id, `action result ${index} delta caseId`);
    assert(result.delta.actionIndex === index, `action result ${index} delta index`);
    assert(result.delta.actionType === ACTION_TYPES[index], `action result ${index} delta type`);
    assert(isPlainObject(result.delta.actual), `action result ${index} actual`);
    assert(Object.hasOwn(result.delta, 'semanticProbe'), `action result ${index} semantic probe`);
  });

  assert(Array.isArray(execution.eventJournal), 'event journal');
  assert(Array.isArray(execution.eventJournalFailures), 'event journal failures');
  assert(execution.eventJournalFailures.length === 0, 'event journal failure count');
  assert(isPlainObject(execution.bindings), 'bindings');
  assert(Array.isArray(execution.captures), 'captures');
  assert(isPlainObject(execution.terminalSnapshot), 'terminal snapshot');
  assert(isPlainObject(execution.terminalSemanticProbe), 'terminal semantic probe');
  assert(isPlainObject(execution.cleanup), 'cleanup');
  assert(execution.cleanup.status === 'completed', 'cleanup status');
  assert(Array.isArray(execution.cleanup.errors) && execution.cleanup.errors.length === 0, 'cleanup errors');
  return execution;
}

function projectDestroyedEvents(journal, generationCount) {
  positiveInteger(generationCount, 'destroyed event generation count');
  const generations = new Map(
    Array.from({ length: generationCount }, (_, index) => [index + 1, 0]),
  );
  for (const [index, entry] of journal.entries()) {
    assert(isPlainObject(entry), `journal ${index}`);
    const generation = positiveInteger(entry.generation, `journal ${index} generation`);
    assert(generation <= generationCount, `journal ${index} generation exceeds lifecycle count`);
    const current = generations.get(generation);
    assert(current !== undefined, `journal ${index} generation is unknown`);
    generations.set(generation, current + Number(entry.event === 'destroyed'));
  }
  const countsByGeneration = Object.fromEntries(
    [...generations].sort(([left], [right]) => left - right).map(([generation, count]) => [generation, count]),
  );
  const counts = Object.values(countsByGeneration);
  return {
    ...(journal.length > 0
      ? { perGeneration: counts.every((count) => count === counts[0]) ? counts[0] : null }
      : {}),
    generationCount: counts.length,
    countsByGeneration,
  };
}

function projectFixtures(plan) {
  return clone(plan.fixture.setup.params);
}

function projectCaptures(execution) {
  const captures = cloneRecord(execution.bindings, 'bindings');
  const names = new Set(Object.keys(captures));
  for (const [index, capture] of execution.captures.entries()) {
    assert(isPlainObject(capture), `capture ${index}`);
    assert(typeof capture.id === 'string' && capture.id.length > 0, `capture ${index} id`);
    assert(!names.has(capture.id), `capture ${capture.id} collides or is duplicated`);
    names.add(capture.id);
    assert(isPlainObject(capture.values), `capture ${capture.id} values`);
    captures[capture.id] = clone(capture.values);
  }
  return captures;
}

function actionActual(execution, index, type) {
  const result = execution.actionResults[index];
  assert(result.type === type, `action ${index} expected ${type}`);
  return result.delta.actual;
}

function notExercised(reason) {
  return { _availability: { status: 'not-exercised', reason } };
}

function cloneRecord(value, label) {
  assert(isPlainObject(value), `${label} must be a plain object`);
  return clone(value);
}

function validateJsonValue(value, path, ancestors) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    assert(Number.isFinite(value), `${path} number must be finite`);
    assert(!Object.is(value, -0), `${path} must not be negative zero`);
    return;
  }
  assert(typeof value === 'object', `${path} must be JSON-safe`);
  assert(!ancestors.has(value), `${path} must not contain a cycle`);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      assert(Object.getPrototypeOf(value) === Array.prototype, `${path} array prototype`);
      assert(Object.keys(value).length === value.length, `${path} sparse array`);
      value.forEach((nested, index) => validateJsonValue(nested, `${path}[${index}]`, ancestors));
      return;
    }
    assert(isPlainObject(value), `${path} must be a plain object`);
    for (const [key, nested] of Object.entries(value)) {
      validateJsonValue(nested, `${path}.${key}`, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}

function assertExactKeys(record, keys, label) {
  const actual = Object.keys(record).sort();
  const wanted = [...keys].sort();
  assert(
    actual.length === wanted.length && actual.every((key, index) => key === wanted[index]),
    `${label} keys`,
  );
}

function assertUint32(value, label) {
  assert(Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff, `${label} uint32`);
}

function positiveInteger(value, label) {
  assert(Number.isInteger(value) && value > 0, `${label} positive integer`);
  return value;
}

function nonNegativeNumber(value, label) {
  const number = finiteNumber(value, label);
  assert(number >= 0, `${label} non-negative`);
  return number;
}

function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} finite number`);
  return value;
}


function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}


function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assert(condition, message) {
  if (!condition) throw new Error(`Core v2 lifecycle-destroy fold invalid: ${message}`);
}
