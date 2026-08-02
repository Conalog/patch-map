import { clone, deepFreeze, createTypeSuffixValueAtoms } from './value-atoms.mjs';

const {
  recordValue,
  arrayValue,
  stringValue,
  finiteNumber,
} = createTypeSuffixValueAtoms(assert);

export const LIFECYCLE_INTERRUPTION_FOLD_REVISION =
  'core-v2-lifecycle-interruption-fold/1';

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
const CASE_ACTIONS = Object.freeze({
  'ERR-004': Object.freeze([
    'begin-move-gesture',
    'move-pointer',
    'run-terminal-matrix',
  ]),
  'ERR-006': Object.freeze([
    'call-operation-state-matrix',
    'destroy-instance',
    'create-fresh-instance',
  ]),
  'PRF-007': Object.freeze([
    'run-lifecycle-cycles',
  ]),
  'CSM-017': Object.freeze([
    'mount-load-interact',
    'destroy-engine',
    'mount-load-interact',
    'probe-declared-failure',
  ]),
  'CSM-036': Object.freeze([
    'run-editor-lifecycle-cycles',
    'destroy-engine',
    'remount-editor',
    'probe-declared-failure',
  ]),
});
const JOURNAL_EVENTS = new Set([
  'ready',
  'sceneCommitted',
  'drawComplete',
  'frame',
  'diagnostic',
  'destroyed',
]);

/**
 * Pure expected-blind projection over action deltas and public product probes.
 * Approved expected evidence and comparison code are intentionally absent.
 */
export function foldLifecycleInterruptionExecution(optionsValue) {
  const options = exactRecord(
    optionsValue,
    ['casePlan', 'environment', 'execution', 'provenance'],
    'fold options',
  );
  const plan = validatePlan(options.casePlan);
  const execution = validateExecution(options.execution, plan);
  const last = actionActual(
    execution,
    CASE_ACTIONS[plan.id].length - 1,
    CASE_ACTIONS[plan.id].at(-1),
  );
  const product = productRecord(last.product, `${plan.id} final product`);
  const actual = baseActual(options, plan, execution, product);

  if (plan.id === 'ERR-004') {
    projectInterruptedGesture(actual, execution);
  } else if (plan.id === 'ERR-006') {
    projectDestroyedState(actual, execution);
  } else if (plan.id === 'PRF-007') {
    projectRetainedResources(actual, execution);
  } else if (plan.id === 'CSM-017') {
    projectDashboardCleanup(actual, execution);
  } else {
    projectEditorCleanup(actual, execution);
  }

  assert(
    DOMAIN_NAMES.every((domain) => isRecord(actual[domain])),
    'actual must contain fourteen object domains',
  );
  validateJson(actual, 'actual', new WeakSet());
  return deepFreeze({
    actual,
    fixtures: clone(recordValue(plan.fixture, 'case fixture').setup.params),
    captures: captureMap(execution),
  });
}

function baseActual(options, plan, execution, product) {
  const snapshot = recordValue(product.snapshot, 'product snapshot');
  const semantic = recordValue(product.semantic, 'product semantic');
  const revisions = recordValue(snapshot.revisions, 'snapshot revisions');
  const resources = recordValue(snapshot.resources, 'snapshot resources');
  recordValue(product.hostInteraction, 'host interaction');
  const pointerGesture = recordValue(product.pointerGesture, 'pointer gesture');
  const transformerGesture = recordValue(
    product.transformerGesture,
    'transformer gesture',
  );
  const transformerEdit = recordValue(product.transformerEdit, 'transformer edit');
  const dataset = arrayValue(product.dataset, 'product dataset');
  const provenance = clone(recordValue(options.provenance, 'provenance'));
  const environment = clone(recordValue(options.environment, 'environment'));
  provenance.expectedEvidenceBound =
    provenance.fixtureSha256 === undefined
    || provenance.fixtureSha256 === plan.fixtureSha256;
  environment.contractProfileBound =
    environment.backend === 'webgl2'
    && Object.keys(recordValue(plan.fixtureProfiles, 'fixture profiles')).length > 0;
  if (environment.runtimeResourceIds === undefined) {
    environment.runtimeResourceIds = [];
  }
  const selectedIds = stringArray(snapshot.selectionIds, 'snapshot selection');
  const history = product.history === null
    ? null
    : recordValue(product.history, 'history inspection');
  return {
    $schema: OBSERVATION_REVISION,
    case: {
      id: plan.id,
      caseType: plan.caseType,
      rootTestId: plan.rootTestId,
      fixtureSha256: plan.fixtureSha256,
      executionStatus: execution.status,
    },
    provenance,
    environment,
    revisions: {
      lifecycleGeneration: finiteNumber(
        revisions.lifecycleGeneration,
        'product lifecycle generation',
      ),
      sceneRevision: finiteNumber(revisions.sceneRevision, 'scene revision'),
      valuesFinite: allNumbersFinite(revisions),
    },
    scene: {
      rootIds: stringArray(snapshot.rootIds, 'root IDs'),
      invalidNodeCount: countInvalidNodes(dataset),
    },
    geometry: {
      nonFiniteCount: countNonFinite(product.geometry),
    },
    text: {
      unpairedSurrogates: countUnpairedSurrogates(dataset),
    },
    paint: {
      unresolvedIntentCount: countUnresolvedIntents(product),
      activeAnimationCount: nonNegativeInteger(
        recordValue(semantic.interaction, 'semantic interaction')
          .activeAnimationCount ?? 0,
        'active animation count',
      ),
    },
    interaction: {
      selectedTargets: selectedIds,
      staleGestureCount:
        nonNegativeInteger(pointerGesture.staleGestureCount, 'pointer stale count')
        + nonNegativeInteger(
          transformerGesture.staleCompletionCount,
          'transformer stale count',
        )
        + nonNegativeInteger(
          transformerEdit.staleCompletionCount,
          'transformer edit stale count',
        ),
      activeGestureCount:
        nonNegativeInteger(pointerGesture.activeGestureCount, 'active pointer gestures')
        + nonNegativeInteger(
          transformerGesture.activeGestureCount,
          'active transformer gestures',
        ),
    },
    events: {
      unclassifiedCount: execution.eventJournal.filter((entryValue) => {
        const entry = recordValue(entryValue, 'event journal entry');
        return !JOURNAL_EVENTS.has(entry.event);
      }).length,
      callbacksFromPriorLifecycle: 0,
    },
    history: {
      depth: nonNegativeInteger(snapshot.historyDepth, 'history depth'),
      corruptEntryCount: historyCorruptCount(history),
    },
    accessibility: {
      _availability: {
        exercised: false,
        reason: 'lifecycle-interruption-tranche',
      },
    },
    outcome: {
      recorded: true,
      rawTimingSamples: [],
      actionResults: execution.actionResults.map(({ index, type, status }) => ({
        index,
        type,
        status,
      })),
    },
    resources: {
      canvasCount: nonNegativeInteger(resources.canvasCount, 'canvas count'),
      cleanup: clone(execution.cleanup),
    },
  };
}

function projectInterruptedGesture(actual, execution) {
  const matrix = actionActual(execution, 2, 'run-terminal-matrix');
  const rows = arrayValue(matrix.terminals, 'terminal rows');
  const commits = rowsForCategory(rows, 'commit');
  const reverts = rowsForCategory(rows, 'revert');
  const terminations = rowsForCategory(rows, 'terminate');
  actual.outcome.commit = {
    completionCount: sumRows(commits, 'completionCount'),
    historyDepthDeltaEach: commonRowValue(commits, 'historyDepthDelta'),
  };
  actual.outcome.revert = {
    cancelCountEach: commonRowValue(reverts, 'cancelCount'),
    historyDepthDeltaEach: commonRowValue(reverts, 'historyDepthDelta'),
  };
  actual.outcome.terminate = {
    callbacksAfterTermination: sumRows(
      terminations,
      'callbacksAfterTermination',
    ),
  };
  actual.resources.pointerCapture = maxNestedRow(
    rows,
    'resources',
    'pointerCapture',
  );
  actual.resources.gestureListeners = maxNestedRow(
    rows,
    'resources',
    'gestureListeners',
  );
  actual.resources.autoPan = maxNestedRow(rows, 'resources', 'autoPan');
  actual.geometry.nonFiniteCount = maxRowValue(rows, 'nonFiniteCount');
  actual.interaction.staleGestureCount = maxRowValue(rows, 'staleGestureCount');
  actual.history.corruptEntryCount = maxRowValue(rows, 'corruptEntryCount');
  actual.outcome.terminalMatrix = clone(rows);
}

function projectDestroyedState(actual, execution) {
  const matrix = actionActual(execution, 0, 'call-operation-state-matrix');
  const destroyed = actionActual(execution, 1, 'destroy-instance');
  const fresh = actionActual(execution, 2, 'create-fresh-instance');
  const destroyedProduct = productRecord(
    destroyed.product,
    'destroyed-state product',
  );
  const freshProduct = productRecord(fresh.product, 'fresh product');
  actual.revisions.lifecycleGeneration = positiveInteger(
    fresh.lifecycleGeneration,
    'fresh lifecycle generation',
  );
  actual.outcome.destroy = {
    results: stringArray(destroyed.results, 'destroy results'),
  };
  actual.outcome.afterDestroy = clone(
    recordValue(destroyed.afterDestroy, 'afterDestroy result'),
  );
  actual.outcome.operationStateMatrix = {
    operations: stringArray(matrix.operations, 'matrix operations'),
    lifecycleStates: stringArray(matrix.lifecycleStates, 'matrix lifecycle states'),
    rows: clone(arrayValue(matrix.rows, 'matrix rows')),
  };
  actual.resources.canvasCount = productCanvasCount(freshProduct);
  actual.resources.listenerDelta = retainedListenerCount(destroyedProduct);
  actual.resources.callbacksFromPriorLifecycle = nonNegativeInteger(
    fresh.callbacksFromPriorLifecycle,
    'fresh callbacks from prior lifecycle',
  );
  actual.events.callbacksFromPriorLifecycle =
    actual.resources.callbacksFromPriorLifecycle;
}

function projectRetainedResources(actual, execution) {
  const cycles = actionActual(execution, 0, 'run-lifecycle-cycles');
  const cleanup = recordValue(execution.cleanup, 'execution cleanup');
  const productResources = recordValue(
    cleanup.productResources,
    'cleanup product resources',
  );
  const forcedGc = exactRecord(
    productResources.forcedGc,
    ['baseline', 'final'],
    'post-destroy forced GC samples',
  );
  const cleanupObservation = clone(cleanup);
  delete recordValue(
    cleanupObservation.productResources,
    'cleanup observation product resources',
  ).forcedGc;
  actual.resources.cleanup = cleanupObservation;
  const deltas = exactRecord(
    cycles.resourceDeltas,
    ['canvas', 'listener', 'pendingWork', 'textureLease', 'ticker'],
    'lifecycle resource deltas',
  );
  actual.resources.canvasDelta = nonNegativeInteger(
    deltas.canvas,
    'canvas delta',
  );
  actual.resources.listenerDelta = nonNegativeInteger(
    deltas.listener,
    'listener delta',
  );
  actual.resources.tickerDelta = nonNegativeInteger(
    deltas.ticker,
    'ticker delta',
  );
  actual.resources.textureLeaseDelta = nonNegativeInteger(
    deltas.textureLease,
    'texture lease delta',
  );
  actual.resources.pendingWorkDelta = nonNegativeInteger(
    deltas.pendingWork,
    'pending work delta',
  );
  actual.resources.postDestroyForcedGcGrowthMiB =
    productResources.postDestroyForcedGcGrowthMiB === null
      ? null
      : nonNegativeNumber(
          productResources.postDestroyForcedGcGrowthMiB,
          'post-destroy forced GC growth',
        );
  const rows = arrayValue(cycles.rows, 'lifecycle cycle rows');
  actual.outcome.rawTimingSamples = [
    clone(recordValue(cycles.initialHeap, 'initial heap')),
    ...rows.map((rowValue) => clone(recordValue(
      recordValue(rowValue, 'lifecycle cycle row').heap,
      'cycle heap',
    ))),
    clone(recordValue(forcedGc.final, 'final heap')),
  ];
  actual.outcome.unclassifiedErrorCount = nonNegativeInteger(
    cycles.unclassifiedErrorCount,
    'lifecycle unclassified errors',
  );
  actual.outcome.cycles = {
    requested: positiveInteger(cycles.cycles, 'lifecycle cycles'),
    completed: rows.length,
    input: clone(recordValue(cycles.input, 'lifecycle input')),
  };
}

function projectDashboardCleanup(actual, execution) {
  const firstMount = actionActual(execution, 0, 'mount-load-interact');
  const firstDestroy = actionActual(execution, 1, 'destroy-engine');
  const secondMount = actionActual(execution, 2, 'mount-load-interact');
  const failure = actionActual(execution, 3, 'probe-declared-failure');
  const finalProduct = productRecord(secondMount.product, 'dashboard final product');
  const finalSnapshot = recordValue(finalProduct.snapshot, 'dashboard final snapshot');
  const rollback = exactRecord(
    failure.rollback,
    [
      'destroyGeneration1BeforeMount2',
      'staleAnimationCallbackCount',
      'staleGestureCompletionCount',
    ],
    'dashboard rollback',
  );
  const callbacksFromPriorLifecycle = nonNegativeInteger(
    secondMount.callbacksFromPriorLifecycle,
    'dashboard prior callbacks',
  );
  const generation = positiveInteger(
    secondMount.lifecycleGeneration,
    'dashboard lifecycle generation',
  );
  const selectedIds = stringArray(
    finalSnapshot.selectionIds,
    'dashboard final selection',
  );
  const activeGestures = productActiveGestureCount(finalProduct);
  actual.revisions.lifecycleGeneration = generation;
  actual.resources.canvasCount = productCanvasCount(finalProduct);
  actual.resources.listenerDelta = retainedListenerCount(
    productRecord(firstDestroy.product, 'dashboard destroyed product'),
  );
  actual.events.callbacksFromPriorLifecycle = callbacksFromPriorLifecycle;
  actual.outcome.hostEngineSeam = {
    engineReturns: {
      lifecycleGeneration: generation,
      canvasCount: productCanvasCount(finalProduct),
      callbacksFromGeneration1: callbacksFromPriorLifecycle,
    },
    failureRollback: clone(rollback),
    finalState: {
      lifecycleGeneration: generation,
      canvasCount: productCanvasCount(finalProduct),
      selectedIds,
      activeGestures,
    },
  };
  actual.outcome.generations = {
    first: positiveInteger(
      firstMount.lifecycleGeneration,
      'dashboard first generation',
    ),
    second: generation,
  };
}

function projectEditorCleanup(actual, execution) {
  const cycles = actionActual(execution, 0, 'run-editor-lifecycle-cycles');
  const remount = actionActual(execution, 2, 'remount-editor');
  const failure = actionActual(execution, 3, 'probe-declared-failure');
  const finalProduct = productRecord(remount.product, 'editor final product');
  const finalSnapshot = recordValue(finalProduct.snapshot, 'editor final snapshot');
  const host = recordValue(finalProduct.hostInteraction, 'editor host interaction');
  const mode = recordValue(host.mode, 'editor interaction mode');
  const rollback = exactRecord(
    failure.rollback,
    [
      'engineDestroyOnConfirmedLeave',
      'hostMayBlockNavigation',
      'staleGestureCompletionCount',
    ],
    'editor rollback',
  );
  const deltas = exactRecord(
    cycles.resourceDeltas,
    ['canvas', 'listener', 'pendingWork', 'textureLease', 'ticker'],
    'editor resource deltas',
  );
  const callbacksFromPriorLifecycle = nonNegativeInteger(
    remount.callbacksFromPriorLifecycle,
    'editor prior callbacks',
  );
  const generation = positiveInteger(
    remount.lifecycleGeneration,
    'editor lifecycle generation',
  );
  const selectedIds = stringArray(
    finalSnapshot.selectionIds,
    'editor final selection',
  );
  actual.revisions.lifecycleGeneration = generation;
  actual.revisions.valuesFinite =
    actual.revisions.valuesFinite && allNumbersFinite(cycles.rows);
  actual.resources.canvasDelta = nonNegativeInteger(
    deltas.canvas,
    'editor canvas delta',
  );
  actual.resources.listenerDelta = nonNegativeInteger(
    deltas.listener,
    'editor listener delta',
  );
  actual.resources.textureLeaseDelta = nonNegativeInteger(
    deltas.textureLease,
    'editor texture lease delta',
  );
  actual.events.callbacksFromPriorLifecycle = callbacksFromPriorLifecycle;
  actual.outcome.hostEngineSeam = {
    engineReturns: {
      lifecycleGeneration: generation,
      activeCanvasCount: productCanvasCount(finalProduct),
      callbacksFromPriorLifecycle,
    },
    failureRollback: clone(rollback),
    finalState: {
      lifecycleGeneration: generation,
      selectedIds,
      mode: stringValue(mode.activeState, 'editor active mode'),
      canvasCount: productCanvasCount(finalProduct),
    },
  };
}

function validatePlan(value) {
  const plan = recordValue(value, 'case plan');
  assert(CASE_ACTIONS[plan.id] !== undefined, 'supported case plan');
  assert(Array.isArray(plan.actionTrace), 'case action trace');
  assert(
    sameArray(
      plan.actionTrace.map((action) => recordValue(action, 'plan action').type),
      CASE_ACTIONS[plan.id],
    ),
    'case action trace identity',
  );
  return plan;
}

function validateExecution(value, plan) {
  const execution = recordValue(value, 'execution');
  assert(execution.$schema === EXECUTION_REVISION, 'execution schema');
  assert(execution.status === 'completed', 'execution completed');
  assert(execution.caseId === plan.id, 'execution case identity');
  assert(Array.isArray(execution.actionResults), 'execution action results');
  assert(
    execution.actionResults.length === CASE_ACTIONS[plan.id].length,
    'action result count',
  );
  execution.actionResults.forEach((resultValue, index) => {
    const result = recordValue(resultValue, `action ${index}`);
    assert(result.index === index, `action ${index} index`);
    assert(result.type === CASE_ACTIONS[plan.id][index], `action ${index} type`);
    assert(
      result.handlerId === `contract/${result.type}`,
      `action ${index} handler identity`,
    );
    assert(result.status === 'completed', `action ${index} status`);
    const delta = recordValue(result.delta, `action ${index} delta`);
    assert(delta.$schema === DELTA_REVISION, `action ${index} delta schema`);
    assert(delta.caseId === plan.id, `action ${index} delta case`);
    assert(delta.actionIndex === index, `action ${index} delta index`);
    recordValue(delta.actual, `action ${index} actual`);
  });
  assert(Array.isArray(execution.eventJournal), 'execution event journal');
  assert(Array.isArray(execution.captures), 'execution captures');
  const cleanup = recordValue(execution.cleanup, 'execution cleanup');
  assert(cleanup.status === 'completed', 'execution cleanup status');
  assert(Array.isArray(cleanup.errors) && cleanup.errors.length === 0, 'cleanup errors');
  const productResources = recordValue(
    cleanup.productResources,
    'cleanup product resources',
  );
  const runtimeCounts = recordValue(
    productResources.runtimeCounts,
    'cleanup runtime counts',
  );
  assert(
    Object.values(runtimeCounts).every((count) => count === 0),
    'runtime ownership released',
  );
  return execution;
}

function actionActual(execution, index, type) {
  const result = recordValue(execution.actionResults[index], `action ${index}`);
  assert(result.type === type, `action ${index} expected ${type}`);
  return recordValue(
    recordValue(result.delta, `action ${index} delta`).actual,
    `action ${index} actual`,
  );
}

function rowsForCategory(rows, category) {
  const selected = rows.filter((rowValue) => (
    recordValue(rowValue, 'terminal row').category === category
  ));
  assert(selected.length > 0, `terminal ${category} rows`);
  return selected;
}

function commonRowValue(rows, key) {
  const values = rows.map((rowValue) => finiteNumber(
    recordValue(rowValue, 'row')[key],
    `row ${key}`,
  ));
  return values.every((value) => value === values[0]) ? values[0] : null;
}

function sumRows(rows, key) {
  return rows.reduce(
    (total, rowValue) => total + nonNegativeInteger(
      recordValue(rowValue, 'row')[key],
      `row ${key}`,
    ),
    0,
  );
}

function maxRowValue(rows, key) {
  return Math.max(...rows.map((rowValue) => nonNegativeInteger(
    recordValue(rowValue, 'row')[key],
    `row ${key}`,
  )));
}

function maxNestedRow(rows, parent, key) {
  return Math.max(...rows.map((rowValue) => nonNegativeInteger(
    recordValue(recordValue(rowValue, 'row')[parent], `row ${parent}`)[key],
    `row ${parent}.${key}`,
  )));
}

function productCanvasCount(product) {
  const snapshot = recordValue(product.snapshot, 'product snapshot');
  const resources = recordValue(snapshot.resources, 'product resources');
  return nonNegativeInteger(resources.canvasCount, 'product canvas count');
}

function retainedListenerCount(product) {
  const snapshot = recordValue(product.snapshot, 'released snapshot');
  const resources = recordValue(snapshot.resources, 'released resources');
  const subscriptions = recordValue(
    resources.subscriptions,
    'released subscriptions',
  );
  const host = recordValue(product.hostInteraction, 'released host interaction');
  return (
    nonNegativeInteger(subscriptions.active, 'released active subscriptions')
    + nonNegativeInteger(host.bindingListeners, 'released binding listeners')
    + nonNegativeInteger(host.eventSubscriptions, 'released event subscriptions')
    + nonNegativeInteger(
      host.selectionHostListeners,
      'released selection host listeners',
    )
  );
}

function productActiveGestureCount(product) {
  const pointer = recordValue(product.pointerGesture, 'product pointer gesture');
  const transformer = recordValue(
    product.transformerGesture,
    'product transformer gesture',
  );
  return (
    nonNegativeInteger(pointer.activeGestureCount, 'active pointer gesture count')
    + nonNegativeInteger(
      transformer.activeGestureCount,
      'active transformer gesture count',
    )
  );
}

function productRecord(value, label) {
  return recordValue(value, label);
}

function countInvalidNodes(dataset) {
  let count = 0;
  const visit = (values) => {
    for (const value of values) {
      if (!isRecord(value)) {
        count += 1;
        continue;
      }
      if (typeof value.id !== 'string' || value.id.length === 0) count += 1;
      if (Array.isArray(value.children)) visit(value.children);
    }
  };
  visit(dataset);
  return count;
}

function countUnresolvedIntents(product) {
  const semantic = recordValue(product.semantic, 'product semantic');
  return countKeyedStatus(semantic, /unresolved|unsupported/iu);
}

function countKeyedStatus(value, pattern, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return 0;
  seen.add(value);
  let count = 0;
  for (const [key, nested] of Object.entries(value)) {
    if (
      pattern.test(key)
      && ((typeof nested === 'number' && nested > 0) || nested === true)
    ) {
      count += typeof nested === 'number' ? nested : 1;
    } else {
      count += countKeyedStatus(nested, pattern, seen);
    }
  }
  return count;
}

function countNonFinite(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? 0 : 1;
  if (typeof value !== 'object' || seen.has(value)) return 0;
  seen.add(value);
  return Object.values(value).reduce(
    (count, nested) => count + countNonFinite(nested, seen),
    0,
  );
}

function countUnpairedSurrogates(value, seen = new WeakSet()) {
  if (typeof value === 'string') {
    let count = 0;
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = value.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) index += 1;
        else count += 1;
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        count += 1;
      }
    }
    return count;
  }
  if (value === null || typeof value !== 'object' || seen.has(value)) return 0;
  seen.add(value);
  return Object.values(value).reduce(
    (count, nested) => count + countUnpairedSurrogates(nested, seen),
    0,
  );
}

function historyCorruptCount(history) {
  if (history === null) return 0;
  if (Array.isArray(history.corruptEntries)) return history.corruptEntries.length;
  if (typeof history.corruptEntryCount === 'number') {
    return nonNegativeInteger(history.corruptEntryCount, 'history corrupt entries');
  }
  return 0;
}

function allNumbersFinite(value, seen = new WeakSet()) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (value === null || typeof value !== 'object' || seen.has(value)) return true;
  seen.add(value);
  return Object.values(value).every((nested) => allNumbersFinite(nested, seen));
}

function captureMap(execution) {
  return Object.fromEntries(execution.captures.map((entryValue) => {
    const entry = recordValue(entryValue, 'capture');
    return [
      stringValue(entry.id, 'capture ID'),
      clone(recordValue(entry.values, 'capture values')),
    ];
  }));
}

function exactRecord(value, keys, label) {
  const record = recordValue(value, label);
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  assert(
    actual.length === expected.length
      && actual.every((key, index) => key === expected[index]),
    `${label} keys`,
  );
  return record;
}



function stringArray(value, label) {
  assert(
    Array.isArray(value)
      && value.every((entry) => typeof entry === 'string'),
    `${label} string array`,
  );
  return [...value];
}


function positiveInteger(value, label) {
  assert(Number.isSafeInteger(value) && value > 0, `${label} positive integer`);
  return value;
}

function nonNegativeInteger(value, label) {
  assert(
    Number.isSafeInteger(value) && value >= 0,
    `${label} non-negative integer`,
  );
  return value;
}

function nonNegativeNumber(value, label) {
  const number = finiteNumber(value, label);
  assert(number >= 0, `${label} non-negative`);
  return number;
}


function sameArray(left, right) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function validateJson(value, path, ancestors) {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) return;
  if (typeof value === 'number') {
    assert(Number.isFinite(value), `${path} finite number`);
    assert(!Object.is(value, -0), `${path} not negative zero`);
    return;
  }
  assert(typeof value === 'object', `${path} JSON value`);
  assert(!ancestors.has(value), `${path} no cycle`);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      value.forEach((nested, index) =>
        validateJson(nested, `${path}[${index}]`, ancestors));
      return;
    }
    assert(isRecord(value), `${path} object`);
    for (const [key, nested] of Object.entries(value)) {
      validateJson(nested, `${path}.${key}`, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}


function assert(condition, message) {
  if (!condition) {
    throw new Error(`Core v2 lifecycle/interruption fold invalid: ${message}`);
  }
}
