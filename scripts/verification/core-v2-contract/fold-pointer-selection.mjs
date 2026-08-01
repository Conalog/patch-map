import { clone } from './value-atoms.mjs';
import { projectEventCaseDomains } from './fold-pointer-selection/event-projections.mjs';
import { projectSelectionCaseDomains } from './fold-pointer-selection/selection-projections.mjs';
import {
  actionProductSnapshot,
  assert,
  cloneArray,
  cloneRecord,
  finiteNumber,
  isRecord,
  nonNegativeInteger,
  recordValue,
  stringValue,
} from './fold-pointer-selection/support.mjs';
import {
  projectTransformerCaseDomains,
} from './fold-pointer-selection/transformer-projections.mjs';

export const POINTER_SELECTION_FOLD_REVISION = 'core-v2-pointer-selection-fold/1';

const OBSERVATION_REVISION = 'core-v2-semantic-observation/1';
const EXECUTION_REVISION = 'core-v2-contract-case-execution/1';
const CASE_IDS = Object.freeze([
  'EVT-001',
  'EVT-002',
  'EVT-003',
  'EVT-004',
  'EVT-005',
  'EVT-006',
  'EVT-007',
  'EVT-008',
  'EVT-009',
  'SEL-005',
  'SEL-006',
  'SEL-007',
  'SEL-008',
  'SEL-009',
  'TRN-001',
  'TRN-002',
  'TRN-003',
  'TRN-004',
  'TRN-005',
  'TRN-006',
  'TRN-007',
  'TRN-008',
  'TRN-009',
  'TRN-010',
  'CSM-011',
  'CSM-012',
  'CSM-015',
  'CSM-016',
  'CSM-020',
  'CSM-021',
]);
const CONSUMER_CASE_IDS = new Set([
  'CSM-011',
  'CSM-012',
  'CSM-015',
  'CSM-016',
  'CSM-020',
  'CSM-021',
]);
const CLASSIFIED_ENGINE_EVENTS = new Set([
  'ready',
  'sceneCommitted',
  'drawComplete',
  'frame',
  'diagnostic',
  'destroyed',
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
 * Fold shared pointer/selection executions without importing approved
 * expected observations or a comparator.
 */
export function foldPointerSelectionExecution(options) {
  const input = validateOptions(options);
  const plan = validatePlan(input.casePlan);
  const execution = validateExecution(input.execution, plan);
  const terminalSnapshot = recordValue(execution.terminalSnapshot, 'terminal snapshot');
  const terminalSemantic = recordValue(
    execution.terminalSemanticProbe,
    'terminal semantic probe',
  );
  const projected = projectCaseDomains(plan.id, execution);
  const actual = {
    $schema: OBSERVATION_REVISION,
    case: {
      id: plan.id,
      type: plan.caseType,
      route: plan.route,
      rootTestId: plan.rootTestId,
      executionStatus: execution.status,
    },
    provenance: cloneRecord(input.provenance, 'provenance'),
    environment: cloneRecord(input.environment, 'environment'),
    revisions: {
      _availability: { terminalSnapshot: 'available' },
      ...projectRevisions(terminalSnapshot),
      ...projected.revisions,
    },
    scene: {
      _availability: { terminalSemanticProbe: 'available' },
      invalidNodeCount: invalidNodeCount(terminalSemantic),
      ...projected.scene,
    },
    geometry: {
      _availability: { aggregateGeometry: 'available' },
      nonFiniteCount: semanticNonFiniteCount(terminalSemantic),
      ...projected.geometry,
    },
    text: notExercised('pointer-selection-does-not-observe-text-layout'),
    paint: notExercised('pointer-selection-does-not-observe-raster-pixels'),
    interaction: {
      _availability: { rootPointerAuthority: 'available' },
      ...projected.interaction,
    },
    events: {
      _availability: { semanticPointerEvents: 'available' },
      ...projected.events,
    },
    history: {
      _availability: { semanticHistory: 'available' },
      depth: semanticHistoryDepth(terminalSemantic),
      ...projected.history,
    },
    accessibility: notExercised('pointer-selection-accessibility-is-a-later-tranche'),
    outcome: {
      _availability: { actionResults: 'available' },
      unclassifiedErrorCount: unclassifiedErrorCount(execution),
      ...projected.outcome,
    },
    resources: {
      _availability: { cleanup: 'available', rootOwnership: 'available' },
      cleanup: clone(execution.cleanup),
      ...projected.resources,
    },
  };
  if (plan.caseType === 'consumer-journey') {
    projectConsumerInvariants(actual, execution, terminalSemantic);
  }
  assert(
    DOMAIN_NAMES.every((domain) => isRecord(actual[domain])),
    'actual must contain all fourteen object domains',
  );
  validateJson(actual, 'actual', new WeakSet());
  return deepFreeze({
    actual,
    fixtures: cloneRecord(plan.fixture.setup.params, 'fixture params'),
    captures: projectCaptures(execution),
  });
}

function projectCaseDomains(caseId, execution) {
  if (caseId.startsWith('EVT-')) {
    return projectEventCaseDomains(caseId, execution);
  }
  if (caseId.startsWith('SEL-') || caseId.startsWith('CSM-')) {
    return projectSelectionCaseDomains(caseId, execution);
  }
  if (caseId.startsWith('TRN-')) {
    return projectTransformerCaseDomains(caseId, execution);
  }
  throw new Error(`Core v2 pointer/selection fold invalid: unsupported case ${caseId}`);
}

function validateOptions(value) {
  const options = recordValue(value, 'options');
  assertExactKeys(
    options,
    ['casePlan', 'execution', 'provenance', 'environment'],
    'options',
  );
  return options;
}

function validatePlan(value) {
  const plan = recordValue(value, 'case plan');
  assert(CASE_IDS.includes(plan.id), 'case ID');
  const expectedCaseType = CONSUMER_CASE_IDS.has(plan.id)
    ? 'consumer-journey'
    : 'capability';
  assert(plan.caseType === expectedCaseType, 'case type');
  assert(isRecord(plan.fixture), 'case fixture');
  assert(isRecord(plan.fixture.setup), 'case fixture setup');
  assert(isRecord(plan.fixture.setup.params), 'case fixture params');
  assert(Array.isArray(plan.actionTrace), 'case action trace');
  assert(Array.isArray(plan.fixture.actionTrace), 'fixture action trace');
  assert(sameJson(plan.actionTrace, plan.fixture.actionTrace), 'action trace drift');
  return plan;
}

function validateExecution(value, plan) {
  const execution = recordValue(value, 'execution');
  assert(execution.$schema === EXECUTION_REVISION, 'execution revision');
  assert(execution.caseId === plan.id, 'execution case identity');
  assert(execution.caseType === plan.caseType, 'execution case type');
  assert(execution.status === 'completed', 'execution status');
  assert(execution.error === null, 'execution error');
  if (plan.caseType === 'consumer-journey') {
    const hostSeam = recordValue(
      execution.hostSeamDelta,
      `${plan.id} host seam delta`,
    );
    assert(hostSeam.caseId === plan.id, `${plan.id} host seam case ID`);
    assert(
      hostSeam.capabilityPassInherited === false,
      `${plan.id} host seam inheritance`,
    );
  } else {
    assert(execution.hostSeamDelta === null, 'capability host seam');
  }
  assert(Array.isArray(execution.actionResults), 'execution action results');
  assert(execution.actionResults.length === plan.actionTrace.length, 'action result count');
  execution.actionResults.forEach((resultValue, index) => {
    const result = recordValue(resultValue, `action result ${index}`);
    const action = recordValue(plan.actionTrace[index], `action ${index}`);
    assert(result.index === index, `action ${index} result index`);
    assert(result.type === action.type, `action ${index} result type`);
    assert(result.handlerId === `contract/${action.type}`, `action ${index} handler`);
    assert(result.status === 'completed', `action ${index} status`);
    assert(isRecord(result.delta), `action ${index} delta`);
    assert(isRecord(result.delta.actual), `action ${index} actual`);
  });
  assert(Array.isArray(execution.eventJournal), 'event journal');
  assert(Array.isArray(execution.eventJournalFailures), 'event failures');
  assert(execution.eventJournalFailures.length === 0, 'event journal failures');
  assert(Array.isArray(execution.captures), 'execution captures');
  assert(isRecord(execution.terminalSnapshot), 'terminal snapshot');
  assert(isRecord(execution.terminalSemanticProbe), 'terminal semantic probe');
  assert(isRecord(execution.cleanup), 'cleanup');
  assert(execution.cleanup.status === 'completed', 'cleanup status');
  return execution;
}

function projectConsumerInvariants(actual, execution, semantic) {
  const semanticText = recordValue(semantic.text, 'consumer semantic text');
  const semanticPaint = recordValue(semantic.paint, 'consumer semantic paint');
  const semanticInteraction = recordValue(
    semantic.interaction,
    'consumer semantic interaction',
  );
  const semanticHistory = recordValue(
    semantic.history,
    'consumer semantic history',
  );
  const revisionValues = execution.actionResults.map((result, index) => {
    const action = recordValue(
      result.delta.actual,
      `consumer action ${index} actual`,
    );
    const snapshot = actionProductSnapshot(action, `consumer action ${index}`);
    return recordValue(
      snapshot.revisions,
      `consumer action ${index} revisions`,
    );
  });

  actual.revisions.valuesFinite = allNumbersFinite(revisionValues);
  actual.text = {
    _availability: { semanticProbe: 'available' },
    unpairedSurrogates: nonNegativeInteger(
      semanticText.unpairedSurrogateCount,
      'consumer unpaired surrogate count',
    ),
    targets: {},
  };
  actual.paint = {
    _availability: { semanticProbe: 'available' },
    unresolvedIntentCount: nonNegativeInteger(
      semanticPaint.unresolvedCount,
      'consumer unresolved paint count',
    ),
    targets: {},
  };
  actual.interaction.staleGestureCount = nonNegativeInteger(
    semanticInteraction.activeGestureCount ?? 0,
    'consumer stale gesture count',
  );
  actual.events.unclassifiedCount = execution.eventJournal.filter((entryValue) => {
    const entry = recordValue(entryValue, 'consumer event journal entry');
    return !CLASSIFIED_ENGINE_EVENTS.has(
      stringValue(entry.event, 'consumer event journal type'),
    );
  }).length;
  actual.history.corruptEntryCount = semanticHistory.corruptCount === undefined
    ? 0
    : nonNegativeInteger(
      semanticHistory.corruptCount,
      'consumer corrupt history count',
    );
  actual.resources.leakDelta = cleanupLeakDelta(execution.cleanup);
}

function projectRevisions(snapshot) {
  const revisions = recordValue(snapshot.revisions, 'snapshot revisions');
  const values = [
    revisions.sceneRevision,
    revisions.viewRevision,
    revisions.interactionRevision,
    snapshot.frameRevision,
  ];
  return {
    scene: finiteNumber(revisions.sceneRevision, 'scene revision'),
    view: finiteNumber(revisions.viewRevision, 'view revision'),
    interaction: finiteNumber(revisions.interactionRevision, 'interaction revision'),
    frame: { revision: finiteNumber(snapshot.frameRevision, 'frame revision') },
    valuesFinite: values.every((entry) => typeof entry === 'number' && Number.isFinite(entry)),
  };
}

function invalidNodeCount(semantic) {
  const scene = recordValue(semantic.scene, 'semantic scene');
  const nodes = cloneArray(scene.nodes, 'semantic nodes');
  return nodes.filter((node) => !isRecord(node)).length;
}

function semanticNonFiniteCount(semantic) {
  const geometry = recordValue(semantic.geometry, 'semantic geometry');
  return nonNegativeInteger(geometry.nonFiniteValueCount, 'semantic non-finite count');
}

function semanticHistoryDepth(semantic) {
  const history = recordValue(semantic.history, 'semantic history');
  return nonNegativeInteger(history.depth ?? 0, 'semantic history depth');
}

function cleanupLeakDelta(value) {
  const cleanup = recordValue(value, 'execution cleanup');
  const releases = cloneArray(cleanup.releases, 'cleanup releases');
  let total = 0;
  for (const releaseValue of releases) {
    const release = recordValue(releaseValue, 'cleanup release');
    if (!isRecord(release.remainingResources)) continue;
    for (const field of ['canvasCount', 'subscriptions', 'pendingWork']) {
      const count = release.remainingResources[field];
      if (typeof count === 'number' && Number.isFinite(count)) {
        total += Math.abs(count);
      }
    }
  }
  if (isRecord(cleanup.productResources)) {
    const runtimeCounts = cleanup.productResources.runtimeCounts;
    if (isRecord(runtimeCounts)) {
      for (const count of Object.values(runtimeCounts)) {
        if (typeof count === 'number' && Number.isFinite(count)) {
          total += Math.abs(count);
        }
      }
    }
  }
  return total;
}

function allNumbersFinite(value, seen = new WeakSet()) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (value === null || typeof value !== 'object' || seen.has(value)) return true;
  seen.add(value);
  return Object.values(value).every((nested) =>
    allNumbersFinite(nested, seen));
}

function unclassifiedErrorCount(execution) {
  return Number(execution.error !== null) +
    execution.eventJournalFailures.length +
    execution.actionResults.filter(({ status }) => status !== 'completed').length;
}

function projectCaptures(execution) {
  const captures = {};
  for (const [index, value] of execution.captures.entries()) {
    const capture = recordValue(value, `capture ${index}`);
    const id = stringValue(capture.id, `capture ${index} ID`);
    assert(!Object.hasOwn(captures, id), `duplicate capture ${id}`);
    captures[id] = cloneRecord(capture.values, `capture ${id} values`);
  }
  return captures;
}

function notExercised(reason) {
  return { _availability: { status: 'not-exercised', reason } };
}

function assertExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  assert(
    sameJson(actual, wanted),
    `${label} keys ${JSON.stringify(actual)}`,
  );
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateJson(value, label, seen) {
  if (value === null) return;
  const type = typeof value;
  assert(type !== 'undefined', `${label} cannot contain undefined`);
  assert(type !== 'function' && type !== 'symbol' && type !== 'bigint', `${label} JSON type`);
  if (type === 'number') {
    assert(Number.isFinite(value), `${label} finite number`);
    return;
  }
  if (type !== 'object') return;
  assert(!seen.has(value), `${label} cycle`);
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateJson(entry, `${label}[${index}]`, seen));
  } else {
    for (const [key, entry] of Object.entries(value)) {
      validateJson(entry, `${label}.${key}`, seen);
    }
  }
  seen.delete(value);
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
