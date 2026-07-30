export const ASSET_FOLD_REVISION = 'patch-map-assets-fold/1';

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
  traceAction('registerAssets', { instanceId: 'A' }),
  traceAction('registerAssets', { instanceId: 'B' }),
  traceAction('initializeWithRequiredAssetFailure', {
    alias: 'required-fixture',
    source: 'fixture://required-init-failure.png',
    expectedCode: 'ASSET_LOAD_FAILED',
  }),
  traceAction('acquireAsset', { instanceId: 'A', alias: 'device' }),
  traceAction('acquireAsset', { instanceId: 'B', alias: 'device' }),
  traceAction('destroy', { instanceId: 'A' }),
  traceAction('destroy', { instanceId: 'B' }),
  traceAction('registerAlias', {
    alias: 'device',
    descriptor: { src: 'https://assets.example.test/other.png' },
  }),
]);

const CLEANUP_TRACE = Object.freeze([
  Object.freeze({
    type: 'destroy-case',
    operands: Object.freeze({ expectedResourceDelta: 0 }),
  }),
]);

/** Fold AST-001 action deltas into an actual-only semantic observation. */
export function foldAssetExecution(options) {
  const input = validateOptions(options);
  const plan = validateCasePlan(input.casePlan);
  const execution = validateExecution(input.execution, plan);
  const registerA = registrationObservation(actionActualAt(execution, 0, 'registerAssets'), 'register A');
  const registerB = registrationObservation(actionActualAt(execution, 1, 'registerAssets'), 'register B');
  const requiredFailure = requiredFailureObservation(
    actionActualAt(execution, 2, 'initializeWithRequiredAssetFailure'),
  );
  const acquireA = acquisitionObservation(actionActualAt(execution, 3, 'acquireAsset'), 'acquire A');
  const acquireB = acquisitionObservation(actionActualAt(execution, 4, 'acquireAsset'), 'acquire B');
  const destroyA = destroyObservation(actionActualAt(execution, 5, 'destroy'), 'destroy A');
  const destroyB = destroyObservation(actionActualAt(execution, 6, 'destroy'), 'destroy B');
  const aliasConflict = aliasConflictObservation(actionActualAt(execution, 7, 'registerAlias'));
  validateActionSequence(
    registerA,
    registerB,
    requiredFailure,
    acquireA,
    acquireB,
    destroyA,
    destroyB,
    aliasConflict,
  );

  const generation = finiteNumber(
    recordValue(registerA.snapshot.revisions, 'register A revisions').lifecycleGeneration,
    'lifecycle generation',
  );
  const sceneRevision = finiteNumber(
    recordValue(registerA.snapshot.revisions, 'register A revisions').sceneRevision,
    'scene revision',
  );
  const failureResources = recordValue(requiredFailure.snapshot.resources, 'required failure resources');
  const afterDestroy = resourceTotals(destroyB.probe.totals, 'after destroy totals');
  assert(numericLeafCount(afterDestroy, 'after destroy totals') > 0, 'after destroy proof is vacuous');

  const actual = {
    $schema: OBSERVATION_REVISION,
    case: projectCase(plan, execution),
    provenance: cloneRecord(input.provenance, 'provenance'),
    environment: cloneRecord(input.environment, 'environment'),
    revisions: {
      _availability: { registerA: 'available' },
      lifecycle: { generation },
    },
    scene: {
      _availability: { registerA: 'available' },
      revision: sceneRevision,
    },
    geometry: notExercised('asset-lifecycle-actions-do-not-observe-geometry'),
    text: {
      _availability: { productAssetProbe: 'available' },
      fonts: { weights: clone(registerB.probe.catalog.fontWeights) },
    },
    paint: {
      _availability: { productAssetProbe: 'available' },
      builtins: { aliases: clone(registerB.probe.catalog.imageAliases) },
    },
    interaction: notExercised('asset-lifecycle-actions-do-not-observe-interaction'),
    events: {
      _availability: { requiredFailureListener: 'available', eventJournal: 'available' },
      requiredFailure: { readyCount: requiredFailure.readyCount },
      journal: clone(execution.eventJournal),
    },
    history: notExercised('asset-lifecycle-actions-do-not-observe-history'),
    accessibility: notExercised('asset-lifecycle-actions-do-not-observe-accessibility'),
    outcome: {
      _availability: { actionResults: 'available', productErrors: 'available' },
      recorded: execution.status === 'completed'
        && execution.actionResults.every((result) => result.status === 'completed'),
      aliasConflict: { code: aliasConflict.error?.code ?? null },
      requiredFailure: {
        code: requiredFailure.error?.code ?? null,
        initState: requiredFailure.initState,
      },
      input: { descriptorUnchanged: aliasConflict.input.unchanged },
      actionResults: execution.actionResults.map(({ index, type, status }) => ({ index, type, status })),
    },
    resources: {
      _availability: {
        productAssetProbe: 'available',
        engineSnapshot: 'available',
        cleanup: 'available',
      },
      cache: {
        device: {
          resourceCount: acquireB.probe.selected.resourceCount,
          leaseCount: {
            afterA: destroyA.probe.selected.leaseCount,
            afterB: destroyB.probe.selected.leaseCount,
          },
        },
      },
      afterDestroy,
      assets: { pendingCount: aliasConflict.probe.totals.pendingCount },
      requiredFailure: {
        canvasCount: nonNegativeInteger(failureResources.canvasCount, 'required failure canvasCount'),
        pendingCount: requiredFailure.probe.totals.pendingCount,
        leaseCount: requiredFailure.probe.selected.leaseCount,
      },
      cleanup: clone(execution.cleanup),
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
  assertExactKeys(options, ['casePlan', 'environment', 'execution', 'provenance'], 'options');
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
  assert(casePlan.id === 'AST-001', 'case ID');
  assert(casePlan.caseType === 'capability', 'caseType');
  const fixture = recordValue(casePlan.fixture, 'fixture');
  const params = validateFixtureParams(recordValue(recordValue(fixture.setup, 'fixture setup').params, 'fixture params'));
  const routeParams = recordValue(casePlan.routeParams, 'routeParams');
  assert(typeof routeParams.size === 'string', 'route size');
  assertUint32(routeParams.seed, 'route seed');

  assert(Array.isArray(fixture.actionTrace), 'fixture actionTrace');
  assert(Array.isArray(casePlan.actionTrace), 'materialized actionTrace');
  assert(sameJson(fixture.actionTrace, casePlan.actionTrace), 'actionTrace drift');
  assert(fixture.actionTrace.length === CASE_TRACE.length, 'action count');
  fixture.actionTrace.forEach((action, index) => {
    const trace = CASE_TRACE[index];
    assertExactKeys(action, ['index', 'operands', 'type'], `action ${index}`);
    assert(action.index === index, `action ${index} index`);
    assert(action.type === trace.type, `action ${index} type`);
    assert(sameJson(action.operands, trace.operands), `action ${index} operands`);
  });
  assert(Array.isArray(fixture.captureCheckpoints) && fixture.captureCheckpoints.length === 0, 'capture checkpoints');
  assert(sameJson(fixture.cleanupTrace, CLEANUP_TRACE), 'cleanup trace drift');
  return { ...casePlan, fixture: { ...fixture, setup: { ...fixture.setup, params } } };
}

function validateFixtureParams(value) {
  assertExactKeys(value, ['aliases', 'instances', 'requiredAlias', 'requiredFailure'], 'fixture params');
  const aliases = uniqueStringArray(value.aliases, 'fixture aliases');
  const instances = uniqueStringArray(value.instances, 'fixture instances');
  assert(instances.length === 2, 'fixture instance count');
  const requiredFailure = recordValue(value.requiredFailure, 'fixture required failure');
  assertExactKeys(requiredFailure, ['alias', 'code', 'source'], 'fixture required failure');
  const requiredAlias = stringValue(value.requiredAlias, 'fixture required alias');
  const failure = {
    alias: stringValue(requiredFailure.alias, 'required failure alias'),
    code: stringValue(requiredFailure.code, 'required failure code'),
    source: stringValue(requiredFailure.source, 'required failure source'),
  };
  assert(failure.alias === requiredAlias, 'required alias parity');
  return { aliases, instances, requiredAlias, requiredFailure: failure };
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
    assert(result.index === index, `result ${index} index`);
    assert(result.type === trace.type, `result ${index} type`);
    assert(result.handlerId === `contract/${trace.type}`, `result ${index} handlerId`);
    assert(result.status === 'completed', `result ${index} status`);
    finiteNumber(result.startedAtMs, `result ${index} startedAtMs`);
    finiteNumber(result.completedAtMs, `result ${index} completedAtMs`);
    const delta = recordValue(result.delta, `result ${index} delta`);
    assert(delta.$schema === DELTA_REVISION, `result ${index} delta schema`);
    assert(delta.caseId === plan.id, `result ${index} delta caseId`);
    assert(delta.actionIndex === index, `result ${index} delta index`);
    assert(delta.actionType === trace.type, `result ${index} delta type`);
    recordValue(delta.actual, `result ${index} actual`);
    assert(delta.semanticProbe === null || isPlainObject(delta.semanticProbe), `result ${index} semanticProbe`);
  });
  assert(Array.isArray(execution.eventJournal), 'eventJournal');
  assert(Array.isArray(execution.eventJournalFailures) && execution.eventJournalFailures.length === 0, 'event journal failures');
  assert(Array.isArray(execution.captures) && execution.captures.length === 0, 'captures');
  assert(isPlainObject(execution.bindings) && Object.keys(execution.bindings).length === 0, 'bindings');
  assert(isPlainObject(execution.datasetObservations) && Object.keys(execution.datasetObservations).length === 0, 'datasets');
  assert(isPlainObject(execution.terminalSnapshot), 'terminalSnapshot');
  assert(execution.terminalSemanticProbe === null || isPlainObject(execution.terminalSemanticProbe), 'terminalSemanticProbe');
  validateCleanup(execution.cleanup, plan.fixture.cleanupTrace);
  return execution;
}

function validateCleanup(value, cleanupTrace) {
  const cleanup = recordValue(value, 'cleanup');
  assert(cleanup.status === 'completed', 'cleanup status');
  assert(Array.isArray(cleanup.errors) && cleanup.errors.length === 0, 'cleanup errors');
  assert(sameJson(cleanup.declaredActions, ['destroy-case']), 'cleanup declared actions');
  assert(Array.isArray(cleanup.releases) && cleanup.releases.length === 3, 'cleanup release count');
  const expectedDelta = cleanupTrace[0].operands.expectedResourceDelta;
  cleanup.releases.forEach((release, index) => {
    const remaining = recordValue(recordValue(release, `release ${index}`).remainingResources, `release ${index} resources`);
    for (const field of ['canvasCount', 'pendingWork', 'subscriptions']) {
      assert(remaining[field] === expectedDelta, `release ${index} ${field}`);
    }
  });
}

function registrationObservation(value, label) {
  const actual = recordValue(value, label);
  return {
    instanceId: stringValue(actual.instanceId, `${label} instanceId`),
    snapshot: engineSnapshot(actual.snapshot, `${label} snapshot`),
    probe: assetProbe(actual.probe, `${label} probe`),
  };
}

function requiredFailureObservation(value) {
  const actual = recordValue(value, 'required failure');
  const request = recordValue(actual.request, 'required failure request');
  const initState = stringValue(actual.initState, 'required failure initState');
  assert(initState === 'rejected' || initState === 'resolved', 'required failure initState value');
  const error = nullableError(actual.error, 'required failure error');
  return {
    request: {
      alias: stringValue(request.alias, 'required failure request alias'),
      sourceFingerprint: stringValue(request.sourceFingerprint, 'required failure source fingerprint'),
    },
    initState,
    error,
    readyCount: nonNegativeInteger(actual.readyCount, 'required failure readyCount'),
    snapshot: engineSnapshot(actual.snapshot, 'required failure snapshot'),
    probe: assetProbe(actual.probe, 'required failure probe'),
    afterReleaseProbe: assetProbe(actual.afterReleaseProbe, 'required failure after release probe'),
  };
}

function acquisitionObservation(value, label) {
  const actual = recordValue(value, label);
  return {
    instanceId: stringValue(actual.instanceId, `${label} instanceId`),
    alias: stringValue(actual.alias, `${label} alias`),
    probe: assetProbe(actual.probe, `${label} probe`),
  };
}

function destroyObservation(value, label) {
  const actual = recordValue(value, label);
  recordValue(actual.release, `${label} release`);
  return {
    instanceId: stringValue(actual.instanceId, `${label} instanceId`),
    probe: assetProbe(actual.probe, `${label} probe`),
  };
}

function aliasConflictObservation(value) {
  const actual = recordValue(value, 'alias conflict');
  const input = recordValue(actual.input, 'alias conflict input');
  stringValue(input.beforeFingerprint, 'alias input before fingerprint');
  stringValue(input.afterFingerprint, 'alias input after fingerprint');
  return {
    alias: stringValue(actual.alias, 'alias conflict alias'),
    settlement: stringValue(actual.settlement, 'alias conflict settlement'),
    error: nullableError(actual.error, 'alias conflict error'),
    input: { unchanged: booleanValue(input.unchanged, 'alias input unchanged') },
    probe: assetProbe(actual.probe, 'alias conflict probe'),
  };
}

function validateActionSequence(registerA, registerB, requiredFailure, acquireA, acquireB, destroyA, destroyB, aliasConflict) {
  assert(registerA.instanceId === 'A' && registerB.instanceId === 'B', 'registration instance order');
  assert(acquireA.instanceId === 'A' && acquireB.instanceId === 'B', 'acquire instance order');
  assert(acquireA.alias === 'device' && acquireB.alias === 'device', 'acquire alias');
  assert(destroyA.instanceId === 'A' && destroyB.instanceId === 'B', 'destroy instance order');
  assert(requiredFailure.request.alias === 'required-fixture', 'required failure alias');
  assert(aliasConflict.alias === 'device', 'conflict alias');
  assert(aliasConflict.input.unchanged, 'conflict descriptor changed');
  const cacheKeyA = stringValue(acquireA.probe.selected.cacheKey, 'acquire A cacheKey');
  const cacheKeyB = stringValue(acquireB.probe.selected.cacheKey, 'acquire B cacheKey');
  const resourceTokenA = stringValue(
    acquireA.probe.selected.resourceToken,
    'acquire A resourceToken',
  );
  const resourceTokenB = stringValue(
    acquireB.probe.selected.resourceToken,
    'acquire B resourceToken',
  );
  assert(cacheKeyA === cacheKeyB, 'shared cache key drift');
  assert(resourceTokenA === resourceTokenB, 'shared resource token drift');
}

function engineSnapshot(value, label) {
  const snapshot = cloneRecord(value, label);
  const revisions = recordValue(snapshot.revisions, `${label} revisions`);
  finiteNumber(revisions.lifecycleGeneration, `${label} lifecycleGeneration`);
  finiteNumber(revisions.sceneRevision, `${label} sceneRevision`);
  const resources = recordValue(snapshot.resources, `${label} resources`);
  nonNegativeInteger(resources.canvasCount, `${label} canvasCount`);
  return snapshot;
}

function assetProbe(value, label) {
  const probe = cloneRecord(value, label);
  assertExactKeys(probe, ['catalog', 'selected', 'totals'], label);
  const catalog = recordValue(probe.catalog, `${label} catalog`);
  assertExactKeys(catalog, ['fontWeights', 'imageAliases'], `${label} catalog`);
  uniqueStringArray(catalog.imageAliases, `${label} imageAliases`);
  assert(Array.isArray(catalog.fontWeights), `${label} fontWeights`);
  catalog.fontWeights.forEach((weight, index) => nonNegativeInteger(weight, `${label} fontWeights[${index}]`));
  const selected = recordValue(probe.selected, `${label} selected`);
  assertExactKeys(selected, ['alias', 'cacheKey', 'leaseCount', 'pendingUserCount', 'resourceCount', 'resourceToken'], `${label} selected`);
  assert(selected.alias === null || typeof selected.alias === 'string', `${label} selected alias`);
  for (const field of ['leaseCount', 'pendingUserCount', 'resourceCount']) {
    nonNegativeInteger(selected[field], `${label} selected ${field}`);
  }
  for (const field of ['cacheKey', 'resourceToken']) {
    assert(selected[field] === null || typeof selected[field] === 'string', `${label} selected ${field}`);
  }
  resourceTotals(probe.totals, `${label} totals`);
  return probe;
}

function nullableError(value, label) {
  if (value === null) return null;
  const error = recordValue(value, label);
  return {
    code: stringValue(error.code, `${label} code`),
    name: stringValue(error.name, `${label} name`),
    message: stringValue(error.message, `${label} message`),
  };
}

function resourceTotals(value, label) {
  const totals = recordValue(value, label);
  assertExactKeys(totals, ['leaseCount', 'pendingCount', 'resourceCount'], label);
  return {
    resourceCount: nonNegativeInteger(totals.resourceCount, `${label} resourceCount`),
    leaseCount: nonNegativeInteger(totals.leaseCount, `${label} leaseCount`),
    pendingCount: nonNegativeInteger(totals.pendingCount, `${label} pendingCount`),
  };
}

function projectCase(plan, execution) {
  return {
    id: plan.id,
    caseType: plan.caseType,
    params: cloneRecord(plan.routeParams, 'route params'),
    ...(typeof plan.fixtureSha256 === 'string' ? { fixtureSha256: plan.fixtureSha256 } : {}),
    ...(typeof plan.rootTestId === 'string' ? { rootTestId: plan.rootTestId } : {}),
    executedActions: execution.actionResults.map(({ index, type, status }) => ({ index, type, status })),
  };
}

function projectFixtures(plan) {
  return cloneRecord(plan.fixture.setup.params, 'fixture params');
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

function numericLeafCount(value, label) {
  const record = recordValue(value, label);
  let count = 0;
  for (const [key, nested] of Object.entries(record)) {
    if (typeof nested === 'number') {
      nonNegativeInteger(nested, `${label}.${key}`);
      count += 1;
    } else {
      count += numericLeafCount(nested, `${label}.${key}`);
    }
  }
  return count;
}

function traceAction(type, operands) {
  return Object.freeze({ type, operands: deepFreeze(operands) });
}

function notExercised(reason) {
  return { _availability: { status: 'not-exercised', reason } };
}

function uniqueStringArray(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  const values = value.map((entry, index) => stringValue(entry, `${label}[${index}]`));
  assert(new Set(values).size === values.length, `${label} duplicate value`);
  return values;
}

function cloneRecord(value, label) {
  assert(isPlainObject(value), `${label} must be a plain object`);
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
  assert(typeof value === 'number' && Number.isFinite(value), label);
  return value;
}

function assertUint32(value, label) {
  assert(Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff, label);
}

function assertExactKeys(value, keys, label) {
  const record = recordValue(value, label);
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  assert(
    actual.length === expected.length && actual.every((key, index) => key === expected[index]),
    `${label} keys`,
  );
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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
  ancestors.add(value);
  for (const [key, nested] of Object.entries(value)) {
    validateJsonValue(nested, `${path}/${key}`, ancestors);
  }
  ancestors.delete(value);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Core v2 asset fold invalid: ${message}`);
}
