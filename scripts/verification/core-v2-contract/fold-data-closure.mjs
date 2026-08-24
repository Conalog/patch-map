import { clone, deepFreeze } from './value-atoms.mjs';

export const DATA_CLOSURE_FOLD_REVISION = 'core-v2-data-closure-fold/1';

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
  'DAT-006': Object.freeze([
    'ingestLegacyRoot',
    'snapshot',
    'loadDataset',
    'snapshot',
    'ingestLegacyRoot',
  ]),
  'DAT-007': Object.freeze(['loadDataset', 'select', 'applyInvalidCases', 'query']),
  'DAT-008': Object.freeze([
    'loadFreshSessions',
    'validateDuplicateIdentityMatrix',
    'retainTarget',
    'remove',
    'add',
    'patchStaleTarget',
  ]),
});

/**
 * Fold independent executor deltas into the semantic observation envelope.
 *
 * This projection owns no expectation, comparator, hash, filesystem, or source
 * dependency. Product gaps and unsupported operations remain ordinary actual
 * values for a separate verifier to compare.
 */
export function foldDataClosureExecution(options) {
  const input = validateOptions(options);
  const plan = validateCasePlan(input.casePlan);
  const execution = validateExecution(input.execution, plan);
  const browserProbe = validateBrowserProbe(input.browserProbe, plan.id);
  const fixtures = projectFixtures(plan);
  const captures = projectCaptures(plan, execution);
  const sceneRevision = deriveSceneRevision(execution);

  const actual = {
    $schema: OBSERVATION_REVISION,
    case: projectCase(plan, execution),
    provenance: cloneRecord(input.provenance, 'provenance'),
    environment: cloneRecord(input.environment, 'environment'),
    revisions: {
      _availability: { actionResults: 'available' },
      scene: sceneRevision,
    },
    scene: { _availability: { actionResults: 'available' }, revision: sceneRevision },
    geometry: { _availability: { actionResults: 'available' } },
    text: notExercised('data-closure-actions-do-not-observe-text'),
    paint: notExercised('data-closure-actions-do-not-observe-paint'),
    interaction: { _availability: { actionResults: 'available' } },
    events: {
      _availability: {
        eventJournal: 'available',
        browserProbe: browserProbe ? 'available' : 'unavailable',
      },
      journal: clone(execution.eventJournal),
    },
    history: notExercised('data-closure-actions-do-not-observe-history'),
    accessibility: notExercised('data-closure-actions-do-not-observe-accessibility'),
    outcome: {
      _availability: { actionResults: 'available' },
      recorded: true,
      actionResults: clone(execution.actionResults),
    },
    resources: {
      _availability: {
        cleanup: 'available',
        browserProbe: browserProbe ? 'available' : 'unavailable',
      },
      cleanup: clone(execution.cleanup),
    },
  };

  if (plan.id === 'DAT-006') projectLegacy(actual, execution);
  if (plan.id === 'DAT-007') projectInvalidAtomicity(actual, execution);
  if (plan.id === 'DAT-008') projectIdentity(actual, execution);
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
  const actionTypes = CASES[casePlan.id];
  assert(actionTypes !== undefined, `unsupported data-closure case ${String(casePlan.id)}`);
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
  assert(sameJson(fixtureActions, casePlan.actionTrace), `${casePlan.id} materialized actionTrace drift`);
  assert(fixtureActions.length === actionTypes.length, `${casePlan.id} action count`);
  fixtureActions.forEach((action, index) => {
    assert(isPlainObject(action), `${casePlan.id} action ${index}`);
    assertExactKeys(action, ['index', 'operands', 'type'], `${casePlan.id} action ${index}`);
    assert(action.index === index, `${casePlan.id} action ${index} index`);
    assert(action.type === actionTypes[index], `${casePlan.id} action ${index} type`);
    assert(isPlainObject(action.operands), `${casePlan.id} action ${index} operands`);
  });

  const checkpoints = casePlan.fixture.captureCheckpoints ?? casePlan.captureCheckpoints ?? [];
  assert(Array.isArray(checkpoints), `${casePlan.id} captureCheckpoints`);
  const checkpointIds = new Set();
  for (const checkpoint of checkpoints) {
    assert(isPlainObject(checkpoint), `${casePlan.id} checkpoint`);
    assert(typeof checkpoint.id === 'string' && checkpoint.id.length > 0, `${casePlan.id} checkpoint id`);
    assert(!checkpointIds.has(checkpoint.id), `${casePlan.id} duplicate checkpoint ${checkpoint.id}`);
    checkpointIds.add(checkpoint.id);
    assert(checkpoint.phase === 'after-action', `${casePlan.id} checkpoint ${checkpoint.id} phase`);
    assertActionIndex(checkpoint.afterActionIndex, fixtureActions.length, `${casePlan.id} checkpoint action`);
    assert(Array.isArray(checkpoint.paths), `${casePlan.id} checkpoint ${checkpoint.id} paths`);
  }

  return { ...casePlan, actionTrace: fixtureActions, checkpoints };
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
  assert(execution.actionResults.length === plan.actionTrace.length, 'execution action result count');

  execution.actionResults.forEach((result, index) => {
    const action = plan.actionTrace[index];
    assert(isPlainObject(result), `execution action ${index}`);
    assert(result.index === index, `execution action ${index} index`);
    assert(result.type === action.type, `execution action ${index} type`);
    assert(result.handlerId === `contract/${action.type}`, `execution action ${index} handlerId`);
    assert(result.status === 'completed', `execution action ${index} status`);
    assertFiniteNumber(result.startedAtMs, `execution action ${index} startedAtMs`);
    assertFiniteNumber(result.completedAtMs, `execution action ${index} completedAtMs`);
    assert(result.completedAtMs >= result.startedAtMs, `execution action ${index} timing order`);
    assert(isPlainObject(result.delta), `execution action ${index} delta`);
    assert(result.delta.$schema === DELTA_REVISION, `execution action ${index} delta schema`);
    assert(result.delta.caseId === plan.id, `execution action ${index} delta caseId`);
    assert(result.delta.actionIndex === index, `execution action ${index} delta actionIndex`);
    assert(result.delta.actionType === action.type, `execution action ${index} delta actionType`);
    assert(isPlainObject(result.delta.actual), `execution action ${index} actual`);
    assert(Object.hasOwn(result.delta, 'semanticProbe'), `execution action ${index} semanticProbe`);
    assert(
      result.delta.semanticProbe === null || isPlainObject(result.delta.semanticProbe),
      `execution action ${index} semanticProbe`,
    );
  });

  assert(Array.isArray(execution.eventJournal), 'execution eventJournal');
  assert(Array.isArray(execution.eventJournalFailures), 'execution eventJournalFailures');
  assert(execution.eventJournalFailures.length === 0, 'execution event journal failures');
  assert(isPlainObject(execution.bindings), 'execution bindings');
  assert(Array.isArray(execution.captures), 'execution captures');
  assert(
    execution.terminalSnapshot === null || isPlainObject(execution.terminalSnapshot),
    'execution terminalSnapshot',
  );
  assert(
    execution.terminalSemanticProbe === null || isPlainObject(execution.terminalSemanticProbe),
    'execution terminalSemanticProbe',
  );
  assert(isPlainObject(execution.cleanup), 'execution cleanup');
  assert(execution.cleanup.status === 'completed', 'execution cleanup status');
  assert(Array.isArray(execution.cleanup.errors) && execution.cleanup.errors.length === 0, 'execution cleanup errors');
  assert(Array.isArray(execution.cleanup.releases), 'execution cleanup releases');
  return execution;
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

function projectLegacy(actual, execution) {
  const legacy = actionActualAt(execution, 0, 'ingestLegacyRoot');
  const legacySnapshot = actionActualAt(execution, 1, 'snapshot');
  const canonical = actionActualAt(execution, 2, 'loadDataset');
  const canonicalSnapshot = actionActualAt(execution, 3, 'snapshot');
  const malformed = actionActualAt(execution, 4, 'ingestLegacyRoot');
  assert(legacy.datasetId === 'legacy', 'DAT-006 legacy result');
  assert(canonical.datasetId === 'canonical', 'DAT-006 canonical result');
  assert(malformed.datasetId === 'malformed', 'DAT-006 malformed result');

  actual.scene.legacy = {
    input: clone(legacy.input),
    canonical: clone(legacy.canonical),
    semanticHash: legacy.semanticHash,
    accepted: booleanValue(legacy.accepted, 'DAT-006 legacy accepted'),
    diagnostic: clone(legacy.diagnostic),
    canonicalReference: clone(canonical.canonical),
    canonicalReferenceSemanticHash: canonical.semanticHash,
    snapshotSemanticHash: legacySnapshot.semanticHash,
    canonicalSnapshotSemanticHash: canonicalSnapshot.semanticHash,
  };
  actual.scene.hierarchy = {
    nodeCount: countNodes(canonical.canonical),
  };
  actual.geometry.finiteValueCount = countFiniteNumbers(canonical.canonical);
  actual.outcome.malformed = projectDiagnosticResult(malformed, 'DAT-006 malformed');
  actual.outcome.input = {
    legacyUnchanged: booleanValue(
      legacy.inputObservation?.unchanged,
      'DAT-006 legacy input unchanged',
    ),
    canonicalUnchanged: booleanValue(canonical.input?.unchanged, 'DAT-006 canonical input unchanged'),
  };
}

function projectInvalidAtomicity(actual, execution) {
  const loaded = actionActualAt(execution, 0, 'loadDataset');
  const selected = actionActualAt(execution, 1, 'select');
  const invalid = actionActualAt(execution, 2, 'applyInvalidCases');
  const queried = actionActualAt(execution, 3, 'query');
  assert(Array.isArray(invalid.results), 'DAT-007 invalid results');

  actual.scene.query = { 'rect-b': clone(queried.value) };
  actual.scene.view = clone(queried.snapshot?.viewport);
  actual.interaction.selection = { ids: clone(queried.snapshot?.selectionIds ?? []) };
  actual.interaction.activeGestureCount = 0;
  actual.events.drawComplete = {
    count: execution.eventJournal.filter(({ event }) => event === 'drawComplete').length,
  };
  actual.revisions.publication = {
    partialCount: nonNegativeInteger(
      invalid.partialPublicationCount,
      'DAT-007 partial publication count',
    ),
  };
  actual.outcome.invalidCases = {
    count: nonNegativeInteger(invalid.count, 'DAT-007 invalid case count'),
    pathAwareCount: nonNegativeInteger(
      invalid.pathAwareCount,
      'DAT-007 path-aware invalid count',
    ),
    acceptedCount: nonNegativeInteger(invalid.acceptedCount, 'DAT-007 accepted invalid count'),
    results: clone(invalid.results),
  };
  actual.outcome.initialLoad = clone(loaded.result);
  actual.outcome.selectionBeforeInvalidMatrix = clone(selected.selectedIds);
}

function projectIdentity(actual, execution) {
  const sessions = actionActualAt(execution, 0, 'loadFreshSessions');
  const duplicates = actionActualAt(execution, 1, 'validateDuplicateIdentityMatrix');
  const retained = actionActualAt(execution, 2, 'retainTarget');
  const removed = actionActualAt(execution, 3, 'remove');
  const added = actionActualAt(execution, 4, 'add');
  const stale = actionActualAt(execution, 5, 'patchStaleTarget');

  actual.scene.equalZOrder = clone(sessions.equalZOrder);
  actual.scene.replacement = clone(added.replacement);
  actual.scene.duplicates = {
    authoritativeSceneUnchanged: booleanValue(
      duplicates.authoritativeSceneUnchanged,
      'DAT-008 duplicate authority',
    ),
  };
  actual.scene.hierarchy = {
    nodeCount: Array.isArray(sessions.equalZOrder) ? sessions.equalZOrder.length : 0,
  };
  actual.interaction.activeGestureCount = 0;
  actual.outcome.sessions = {
    semanticHashes: clone(sessions.semanticHashes),
    generatedIdsStable: booleanValue(sessions.generatedIdsStable, 'DAT-008 generated IDs stable'),
    generatedIds: clone(sessions.generatedIds),
    rootOrders: clone(sessions.rootOrders),
  };
  actual.outcome.duplicates = {
    element: projectDuplicate(duplicates.element, 'DAT-008 element duplicate'),
    component: projectDuplicate(duplicates.component, 'DAT-008 component duplicate'),
  };
  actual.outcome.staleTarget = {
    ...clone(stale.diagnostic),
    applied: booleanValue(stale.applied, 'DAT-008 stale patch applied'),
    supported: booleanValue(stale.supported, 'DAT-008 stale patch supported'),
    staleByIdentity: booleanValue(stale.staleByIdentity, 'DAT-008 stale identity'),
  };
  actual.outcome.mutationSupport = {
    remove: clone(removed),
    add: clone(added),
    retained: clone(retained.target),
  };
}

function projectDuplicate(value, label) {
  assert(isPlainObject(value), label);
  return {
    applied: booleanValue(value.applied, `${label} applied`),
    code: value.code,
    path: value.path,
    publicationCount: nonNegativeInteger(value.publicationCount, `${label} publicationCount`),
    authoritativeSceneUnchanged: booleanValue(
      value.authoritativeSceneUnchanged,
      `${label} authority`,
    ),
  };
}

function projectDiagnosticResult(value, label) {
  assert(value.accepted === false, `${label} must be rejected`);
  assert(isPlainObject(value.diagnostic), `${label} diagnostic`);
  return {
    accepted: false,
    ...clone(value.diagnostic),
    inputUnchanged: booleanValue(value.inputObservation?.unchanged, `${label} input unchanged`),
  };
}

function deriveSceneRevision(execution) {
  const revisions = execution.actionResults.map((result, index) =>
    nonNegativeInteger(result.delta.actual.sceneRevision, `execution action ${index} sceneRevision`));
  for (let index = 1; index < revisions.length; index += 1) {
    assert(revisions[index] >= revisions[index - 1], `execution sceneRevision regressed at action ${index}`);
  }
  return revisions.at(-1) ?? 0;
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
    assert(capture.afterActionIndex === checkpoint.afterActionIndex, `capture ${capture.id} action index`);
    assert(isPlainObject(capture.values), `capture ${capture.id} values`);
    const projectedValues = {};
    for (const path of checkpoint.paths) {
      assert(typeof path === 'string' && path.length > 0, `capture ${capture.id} path`);
      assert(Object.hasOwn(capture.values, path), `capture ${capture.id} missing ${path}`);
      assignPath(projectedValues, path.split('/'), clone(capture.values[path]), `capture ${capture.id}`);
    }
    assignOwned(result, capture.id, projectedValues, `capture ${capture.id}`);
  }
  assert(seen.size === declared.size, 'execution must contain every declared capture');
  return result;
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

function countNodes(value) {
  if (!Array.isArray(value)) return 0;
  return value.reduce((count, entry) => {
    if (!isPlainObject(entry)) return count;
    return count + 1 + countNodes(entry.children);
  }, 0);
}

function countFiniteNumbers(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? 1 : 0;
  if (Array.isArray(value)) return value.reduce((count, entry) => count + countFiniteNumbers(entry), 0);
  if (isPlainObject(value)) {
    return Object.values(value).reduce((count, entry) => count + countFiniteNumbers(entry), 0);
  }
  return 0;
}

function notExercised(reason) {
  return { _availability: { status: 'not-exercised', reason } };
}

function assignOwned(target, key, value, source) {
  assert(!Object.hasOwn(target, key), `${source} collides at ${key}`);
  target[key] = value;
}

function cloneRecord(value, label) {
  assert(isPlainObject(value), `${label} must be a plain object`);
  return clone(value);
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

function nonNegativeInteger(value, label) {
  assert(Number.isSafeInteger(value) && value >= 0, label);
  return value;
}

function booleanValue(value, label) {
  assert(typeof value === 'boolean', label);
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

function escapePointer(value) {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}


function assert(condition, message) {
  if (!condition) throw new Error(`Core v2 data-closure fold invalid: ${message}`);
}
