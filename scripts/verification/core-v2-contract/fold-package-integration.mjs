export const PACKAGE_INTEGRATION_FOLD_REVISION =
  'patch-map-package-integration-fold/1';

const OBSERVATION_REVISION = 'core-v2-semantic-observation/1';
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
  'PKG-001': Object.freeze([
    'build-package',
    'pack-package',
    'install-offline-consumer',
    'run-consumer-flow',
  ]),
  'PKG-002': Object.freeze([
    'run-redesigned-host-adapter',
  ]),
  'PKG-003': Object.freeze([
    'initialize-instances',
    'mutate-instance',
    'destroy-instance',
    'recreate-instance',
  ]),
  'PKG-004': Object.freeze([
    'install-packed-artifact',
    'run-host-journey-matrix',
  ]),
  'PKG-005': Object.freeze([
    'compile-public-examples',
    'run-public-examples',
    'validate-documentation-digest',
  ]),
});

/** Fold only packed actual proof, action results, captures, and cleanup facts. */
export function foldPackageIntegrationExecution(optionsValue) {
  const options = recordValue(optionsValue, 'fold options');
  const plan = validatePlan(options.casePlan);
  const execution = validateExecution(options.execution, plan);
  const finalIndex = execution.actionResults.length - 1;
  const final = actionActual(execution, finalIndex, CASE_ACTIONS[plan.id][finalIndex]);
  const binding = recordValue(final.evidenceBinding, 'packed evidence binding');
  const runtimeState = recordValue(final.runtimeState, 'package runtime state');
  const projection = recordValue(runtimeState.projection, 'package projection');
  const actual = baseActual(plan, execution, binding);

  if (plan.id === 'PKG-001') projectPackageConsumer(actual, projection);
  else if (plan.id === 'PKG-002') projectHostAdapter(actual, projection);
  else if (plan.id === 'PKG-003') projectMultipleInstances(actual, projection);
  else if (plan.id === 'PKG-004') projectJourneyMatrix(actual, projection);
  else projectDocumentation(actual, projection);

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

function baseActual(plan, execution, binding) {
  const provenance = clone(recordValue(binding.provenance, 'packed provenance'));
  const environment = clone(recordValue(binding.environment, 'packed environment'));
  const artifact = recordValue(binding.artifact, 'packed artifact');
  const packedDigest = digestValue(
    provenance.packedPackageSha256,
    'packed package digest',
  );
  const fixtureProfiles = recordValue(plan.fixtureProfiles, 'fixture profiles');
  provenance.fixtureSha256 = plan.fixtureSha256;
  provenance.packageName = stringValue(binding.packageName, 'package name');
  provenance.pixiVersion = stringValue(binding.pixiVersion, 'Pixi version');
  provenance.expectedEvidenceBound =
    provenance.expectedEvidenceBound === true
    && digestValue(artifact.sha256, 'artifact digest') === packedDigest;
  environment.contractProfileBound =
    environment.contractProfileBound === true
    && Object.hasOwn(fixtureProfiles, 'packed-consumer-matrix');
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
      packageEvidenceSchemaVersion: nonNegativeInteger(
        binding.schemaVersion,
        'package evidence schema version',
      ),
    },
    scene: {
      invalidNodeCount: 0,
      instances: {},
    },
    geometry: {},
    text: {},
    paint: {},
    interaction: {
      staleGestureCount: 0,
    },
    events: {
      unclassifiedCount: nonNegativeInteger(binding.errorCount, 'packed error count'),
      instances: {},
    },
    history: {
      corruptEntryCount: 0,
    },
    accessibility: {
      _availability: { exercised: false },
    },
    outcome: {
      recorded: true,
      packageEvidenceStatus: stringValue(binding.status, 'package evidence status'),
      actionResults: execution.actionResults.map(({ index, type, status }) => ({
        index,
        type,
        status,
      })),
    },
    resources: {
      leakDelta: cleanupLeakDelta(execution.cleanup),
      cleanupStatus: stringValue(
        recordValue(execution.cleanup, 'execution cleanup').status,
        'cleanup status',
      ),
    },
  };
}

function projectPackageConsumer(actual, projection) {
  const packageResult = recordValue(projection.package, 'package projection');
  actual.outcome.moduleTargetsPassed = stringArray(
    projection.moduleTargetsPassed,
    'passed module targets',
  );
  actual.outcome.consumerFlowPassed = projection.consumerFlowPassed === true;
  actual.outcome.package = {
    sha256: digestValue(packageResult.sha256, 'package digest'),
    filename: stringValue(packageResult.filename, 'package filename'),
    fileCount: nonNegativeInteger(packageResult.fileCount, 'package file count'),
    sourceMapCount: nonNegativeInteger(
      packageResult.sourceMapCount,
      'source map count',
    ),
    restrictedEvidenceCount: nonNegativeInteger(
      packageResult.restrictedEvidenceCount,
      'restricted evidence count',
    ),
  };
  actual.resources.afterDestroy = nonNegativeInteger(
    projection.afterDestroy,
    'consumer terminal resource count',
  );
}

function projectHostAdapter(actual, projection) {
  const adapter = recordValue(projection.hostAdapter, 'host adapter projection');
  actual.outcome.reachedCapabilities = stringArray(
    adapter.reachedCapabilities,
    'reached capabilities',
  );
  actual.outcome.originalImportCount = nonNegativeInteger(
    adapter.originalImportCount,
    'original import count',
  );
  actual.outcome.adapterReimplementedEngineBehaviorCount = nonNegativeInteger(
    adapter.adapterReimplementedEngineBehaviorCount,
    'adapter reimplementation count',
  );
  actual.scene.invalidNodeCount = nonNegativeInteger(
    adapter.invalidNodeCount,
    'invalid node count',
  );
  actual.interaction.staleGestureCount = nonNegativeInteger(
    adapter.staleGestureCount,
    'stale gesture count',
  );
  actual.history.corruptEntryCount = nonNegativeInteger(
    adapter.corruptEntryCount,
    'corrupt history entry count',
  );
  actual.resources.leakDelta = nonNegativeInteger(adapter.leakDelta, 'adapter leak delta');
}

function projectMultipleInstances(actual, projection) {
  const multiple = recordValue(
    projection.multipleInstances,
    'multiple instance projection',
  );
  const instanceB = recordValue(multiple.B, 'instance B');
  const hostSlots = recordValue(multiple.hostSlots, 'host slots');
  actual.scene.instances.B = {
    semanticHash: stringValue(instanceB.semanticHash, 'instance B semantic hash'),
  };
  actual.events.instances.B = {
    callbackCountFromA: nonNegativeInteger(
      instanceB.callbackCountFromA,
      'instance B callback count',
    ),
  };
  actual.resources.instances = {
    B: {
      assetLeaseCount: nonNegativeInteger(
        instanceB.assetLeaseCount,
        'instance B asset lease count',
      ),
    },
  };
  actual.resources.hostSlots = Object.fromEntries(
    Object.entries(hostSlots).map(([slot, value]) => [
      slot,
      {
        canvasCount: nonNegativeInteger(
          recordValue(value, `host slot ${slot}`).canvasCount,
          `host slot ${slot} canvas count`,
        ),
      },
    ]),
  );
  actual.outcome.unclassifiedErrorCount = nonNegativeInteger(
    multiple.unclassifiedErrorCount,
    'multiple instance error count',
  );
  actual.outcome.focusedLab = clone(recordValue(multiple.local, 'local multi-instance smoke'));
}

function projectJourneyMatrix(actual, projection) {
  const matrix = recordValue(projection.journeyMatrix, 'journey matrix projection');
  actual.outcome.journeyCount = nonNegativeInteger(matrix.journeyCount, 'journey count');
  actual.outcome.passedJourneyCount = nonNegativeInteger(
    matrix.passedJourneyCount,
    'passed journey count',
  );
  actual.outcome.packageDigestAcrossJourneys = digestValue(
    matrix.packageDigestAcrossJourneys,
    'journey package digest',
  );
  actual.outcome.adapterReimplementedEngineBehaviorCount = nonNegativeInteger(
    matrix.adapterReimplementedEngineBehaviorCount,
    'adapter reimplementation count',
  );
  actual.resources.cleanupFailureCount = nonNegativeInteger(
    matrix.cleanupFailureCount,
    'journey cleanup failure count',
  );
  actual.scene.invalidNodeCount = nonNegativeInteger(
    matrix.invalidNodeCount,
    'journey invalid node count',
  );
  actual.interaction.staleGestureCount = nonNegativeInteger(
    matrix.staleGestureCount,
    'journey stale gesture count',
  );
  actual.events.unclassifiedCount = nonNegativeInteger(
    matrix.unclassifiedCount,
    'journey unclassified count',
  );
  actual.history.corruptEntryCount = nonNegativeInteger(
    matrix.corruptEntryCount,
    'journey corrupt history count',
  );
}

function projectDocumentation(actual, projection) {
  actual.outcome.compiledExamples = stringArray(
    projection.compiledExamples,
    'compiled examples',
  );
  actual.outcome.executedExamples = stringArray(
    projection.executedExamples,
    'executed examples',
  );
  actual.outcome.documentationDigest = digestValue(
    projection.documentationDigest,
    'documentation digest',
  );
  actual.outcome.declarationRuntimeDriftCount = nonNegativeInteger(
    projection.declarationRuntimeDriftCount,
    'declaration runtime drift count',
  );
}

function validatePlan(value) {
  const plan = recordValue(value, 'case plan');
  const actions = CASE_ACTIONS[plan.id];
  assert(actions !== undefined, `unsupported case ${String(plan.id)}`);
  assert(Array.isArray(plan.actionTrace), 'plan action trace');
  assert(
    plan.actionTrace.length === actions.length
    && plan.actionTrace.every((action, index) => (
      recordValue(action, `plan action ${index}`).type === actions[index]
    )),
    `${plan.id} exact action trace`,
  );
  return plan;
}

function validateExecution(value, plan) {
  const execution = recordValue(value, 'execution');
  assert(execution.caseId === plan.id, 'execution case identity');
  assert(execution.status === 'completed', 'execution completion');
  assert(Array.isArray(execution.actionResults), 'action results');
  assert(execution.actionResults.length === CASE_ACTIONS[plan.id].length, 'action count');
  assert(Array.isArray(execution.eventJournal), 'event journal');
  assert(recordValue(execution.cleanup, 'execution cleanup').status === 'completed', 'cleanup');
  return execution;
}

function actionActual(execution, index, type) {
  const result = recordValue(execution.actionResults[index], `action ${index}`);
  assert(result.index === index, `action ${index} index`);
  assert(result.type === type, `action ${index} type`);
  assert(result.status === 'completed', `action ${index} completion`);
  return recordValue(
    recordValue(result.delta, `action ${index} delta`).actual,
    `action ${index} actual`,
  );
}

function captureMap(execution) {
  const captures = {};
  for (const capture of arrayValue(execution.captures, 'execution captures')) {
    const record = recordValue(capture, 'capture');
    captures[stringValue(record.id, 'capture ID')] = clone(record.values);
  }
  return captures;
}

function cleanupLeakDelta(value) {
  const cleanup = recordValue(value, 'execution cleanup');
  let total = cleanup.status === 'completed' ? 0 : 1;
  for (const releaseValue of arrayValue(cleanup.releases ?? [], 'cleanup releases')) {
    const release = recordValue(releaseValue, 'cleanup release');
    const remaining = recordValue(release.remainingResources, 'remaining resources');
    total += resourceCount(remaining.canvasCount);
    total += resourceCount(remaining.subscriptions);
    total += resourceCount(remaining.pendingWork);
  }
  return total;
}

function resourceCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 1;
}

function validateJson(value, path, ancestors) {
  if (value === null) return;
  const kind = typeof value;
  assert(
    kind === 'string' || kind === 'number' || kind === 'boolean' || kind === 'object',
    `${path} JSON value`,
  );
  if (kind !== 'object') return;
  assert(!ancestors.has(value), `${path} cyclic value`);
  ancestors.add(value);
  if (Array.isArray(value)) {
    value.forEach((nested, index) => validateJson(nested, `${path}[${index}]`, ancestors));
  } else {
    for (const [key, nested] of Object.entries(value)) {
      validateJson(nested, `${path}.${key}`, ancestors);
    }
  }
  ancestors.delete(value);
}

function digestValue(value, label) {
  assert(typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value), label);
  return value;
}

function stringArray(value, label) {
  const array = arrayValue(value, label);
  return array.map((entry, index) => stringValue(entry, `${label}[${index}]`));
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, label);
  return value;
}

function nonNegativeInteger(value, label) {
  assert(Number.isSafeInteger(value) && value >= 0, label);
  return value;
}

function arrayValue(value, label) {
  assert(Array.isArray(value), label);
  return value;
}

function recordValue(value, label) {
  assert(isRecord(value), label);
  return value;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Invalid Core v2 package fold: ${message}`);
}
