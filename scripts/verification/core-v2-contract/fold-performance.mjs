import { cloneOptional as clone } from './value-atoms.mjs';

export const PERFORMANCE_FOLD_REVISION = 'core-v2-performance-fold/1';

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
  'PRF-001': Object.freeze(['run-performance-matrix']),
  'PRF-002': Object.freeze(['measure-load-phase-matrix']),
  'PRF-003': Object.freeze([
    'load-generated-scene',
    'animate-random-bars',
    'pan-and-zoom-during-animation',
  ]),
  'PRF-004': Object.freeze([
    'load-generated-scene',
    'render-random-text',
    'change-random-text',
  ]),
  'PRF-005': Object.freeze([
    'apply-bulk-transaction',
    'apply-trusted-overlay',
  ]),
  'PRF-006': Object.freeze(['run-continuous-interaction-trace']),
  'PRF-009': Object.freeze([
    'capture-before-optimization-fixture',
    'run-post-optimization-cases',
    'compare-normalized-semantics',
  ]),
});

/**
 * Fold independently measured evidence and public Engine observations only.
 * Approved normalized expected records and comparator code are intentionally
 * outside this module.
 */
export function foldPerformanceExecution(optionsValue) {
  const options = recordValue(optionsValue, 'fold options');
  const plan = validatePlan(options.casePlan);
  const execution = validateExecution(options.execution, plan);
  const finalIndex = execution.actionResults.length - 1;
  const final = actionActual(execution, finalIndex, CASE_ACTIONS[plan.id][finalIndex]);
  const actual = baseActual(
    plan,
    execution,
    final,
    recordValue(options.provenance, 'fold provenance'),
    recordValue(options.environment, 'fold environment'),
  );

  if (plan.id === 'PRF-001') projectMatrix(actual, final);
  else if (plan.id === 'PRF-002') projectLoadPhases(actual, final);
  else if (plan.id === 'PRF-003') projectBarAnimation(actual, final);
  else if (plan.id === 'PRF-004') projectTextUpdates(actual, final);
  else if (plan.id === 'PRF-005') projectBulkTransactions(actual, final);
  else if (plan.id === 'PRF-006') projectContinuousInteraction(actual, final);
  else projectSemanticParity(actual, final);

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

function baseActual(plan, execution, final, fallbackProvenance, fallbackEnvironment) {
  const binding = isRecord(final.evidenceBinding) ? final.evidenceBinding : null;
  const provenance = binding === null
    ? clone(fallbackProvenance)
    : clone(recordValue(binding.provenance, 'performance provenance'));
  const environment = binding === null
    ? clone(fallbackEnvironment)
    : clone(recordValue(binding.environment, 'performance environment'));
  const fixtureParams = recordValue(
    recordValue(plan.fixture, 'case fixture').setup.params,
    'fixture params',
  );

  provenance.fixtureSha256 = digestValue(plan.fixtureSha256, 'fixture digest');
  if (binding !== null) {
    const rawArtifact = recordValue(binding.rawArtifact, 'raw performance artifact');
    const rawDigest = digestValue(rawArtifact.sha256, 'raw performance artifact digest');
    provenance.expectedEvidenceBound =
      provenance.expectedEvidenceBound === true
      && digestValue(
        provenance.rawArtifactSha256,
        'provenance raw artifact digest',
      ) === rawDigest;
    const requestedProfile = stringValue(
      fixtureParams.environmentProfile,
      'fixture environment profile',
    );
    environment.contractProfileBound =
      environment.contractProfileBound === true
      && environment.cpuProfile === requestedProfile
      && recordValue(binding.protocol, 'performance protocol').backend === 'webgl2';
  }
  if (environment.runtimeResourceIds === undefined) {
    environment.runtimeResourceIds = [];
  }

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
    revisions: {},
    scene: {},
    geometry: {},
    text: {},
    paint: {},
    interaction: {},
    events: {},
    history: {},
    accessibility: {
      _availability: { exercised: false },
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
      leakDelta: cleanupLeakDelta(execution.cleanup),
      cleanupStatus: stringValue(
        recordValue(execution.cleanup, 'execution cleanup').status,
        'cleanup status',
      ),
    },
  };
}

function projectMatrix(actual, final) {
  const projection = recordValue(final.projection, 'PRF-001 projection');
  actual.outcome.workloadCount = nonNegativeInteger(
    projection.workloadCount,
    'matrix workload count',
  );
  actual.outcome.samplesPerWorkload = positiveInteger(
    projection.samplesPerWorkload,
    'matrix sample count',
  );
  actual.outcome.warmupsPerWorkload = nonNegativeInteger(
    projection.warmupsPerWorkload,
    'matrix warmup count',
  );
  actual.outcome.longTaskAtLeast100Ms = nonNegativeInteger(
    projection.longTaskAtLeast100Ms,
    'matrix long task count',
  );
  actual.outcome.frameGapP95Ms = nonNegativeNumber(
    projection.frameGapP95Ms,
    'matrix frame gap p95',
  );
  actual.outcome.actionToVisibleP95Ms = nonNegativeNumber(
    projection.actionToVisibleP95Ms,
    'matrix action-to-visible p95',
  );
  actual.outcome.rawTimingSamples = clone(
    arrayValue(projection.rawTimingSamples, 'matrix raw timing samples'),
  );
}

function projectLoadPhases(actual, final) {
  const projection = recordValue(final.projection, 'PRF-002 projection');
  const firstFrame = recordValue(
    projection.firstUsefulFrame,
    'first useful frame projection',
  );
  actual.outcome.workloadsMeasured = clone(
    arrayValue(projection.workloadsMeasured, 'measured workloads'),
  );
  actual.outcome.samplesPerWorkload = positiveInteger(
    projection.samplesPerWorkload,
    'load sample count',
  );
  actual.outcome.phaseCountPerWorkload = positiveInteger(
    projection.phaseCountPerWorkload,
    'load phase count',
  );
  actual.outcome.allPhaseValuesFinite = booleanValue(
    projection.allPhaseValuesFinite,
    'finite load phases',
  );
  actual.outcome.firstUsefulFrame = {
    maxP95Ms: nonNegativeNumber(firstFrame.maxP95Ms, 'first useful frame max p95'),
  };
  actual.outcome.longTaskAtLeast100Ms = nonNegativeInteger(
    projection.longTaskAtLeast100Ms,
    'load long task count',
  );
  actual.outcome.rawTimingSamples = clone(
    arrayValue(projection.rawTimingSamples, 'load raw timing samples'),
  );
  actual.scene.firstUsefulFrame = {
    semanticHash: digestValue(firstFrame.semanticHash, 'first useful frame semantic hash'),
  };
  actual.revisions.valuesFinite = booleanValue(
    projection.valuesFinite,
    'load revision values finite',
  );
}

function projectBarAnimation(actual, final) {
  const projection = recordValue(final.projection, 'PRF-003 evidence projection');
  const local = recordValue(final.local, 'PRF-003 product observation');
  const product = productProjection(local, 'PRF-003');
  projectVisibleTiming(actual, projection);
  actual.scene.barDestinationsExact = booleanValue(
    local.barDestinationsExact,
    'bar destinations exact',
  );
  actual.resources.activeAnimationsAfterSettle = nonNegativeInteger(
    local.activeAnimationsAfterSettle,
    'active animations after settle',
  );
  actual.revisions.valuesFinite = booleanValue(
    recordValue(product.revisions, 'bar revisions').valuesFinite,
    'bar revision values finite',
  );
  actual.geometry.nonFiniteCount = nonNegativeInteger(
    local.nonFiniteCount,
    'bar non-finite count',
  );
  actual.interaction.staleGestureCount = nonNegativeInteger(
    local.staleGestureCount,
    'bar stale gesture count',
  );
}

function projectTextUpdates(actual, final) {
  const projection = recordValue(final.projection, 'PRF-004 evidence projection');
  const local = recordValue(final.local, 'PRF-004 product observation');
  const product = productProjection(local, 'PRF-004');
  projectVisibleTiming(actual, projection);
  actual.text.staleLayoutCountAfterFrame = nonNegativeInteger(
    local.staleLayoutCountAfterFrame,
    'text stale layout count',
  );
  actual.text.normalizedLinesExact = booleanValue(
    local.normalizedLinesExact,
    'text normalized lines exact',
  );
  actual.revisions.valuesFinite = booleanValue(
    recordValue(product.revisions, 'text revisions').valuesFinite,
    'text revision values finite',
  );
  actual.geometry.nonFiniteCount = nonNegativeInteger(
    local.nonFiniteCount,
    'text non-finite count',
  );
  actual.paint.unresolvedIntentCount = nonNegativeInteger(
    local.unresolvedIntentCount,
    'text unresolved paint intent count',
  );
}

function projectBulkTransactions(actual, final) {
  const projection = recordValue(final.projection, 'PRF-005 evidence projection');
  const local = recordValue(final.local, 'PRF-005 product observation');
  const runtimeState = recordValue(final.runtimeState, 'PRF-005 runtime state');
  const actionJournal = arrayValue(runtimeState.localActions, 'PRF-005 action journal');
  const deltas = actionJournal
    .filter((entry) => {
      const record = recordValue(entry, 'PRF-005 action journal entry');
      return record.type === 'apply-bulk-transaction'
        || record.type === 'apply-trusted-overlay';
    })
    .map((entry) => nonNegativeInteger(
      recordValue(recordValue(entry, 'bulk journal entry').local, 'bulk local')
        .sceneRevisionDelta,
      'bulk scene revision delta',
    ));
  assert(deltas.length === 2, 'two bulk transaction revision deltas');
  actual.revisions.sceneDeltaPerTransaction =
    deltas.every((value) => value === deltas[0]) ? deltas[0] : -1;
  projectVisibleTiming(actual, projection);
  actual.outcome.complexityExponentMax = nonNegativeNumber(
    projection.complexityExponentMax,
    'bulk complexity exponent',
  );
  actual.scene.invalidNodeCount = nonNegativeInteger(
    local.invalidNodeCount,
    'bulk invalid node count',
  );
}

function projectContinuousInteraction(actual, final) {
  const projection = recordValue(final.projection, 'PRF-006 evidence projection');
  const local = recordValue(final.local, 'PRF-006 product observation');
  actual.outcome.longTaskAtLeast100Ms = nonNegativeInteger(
    projection.longTaskAtLeast100Ms,
    'interaction long task count',
  );
  actual.outcome.inputToVisibleP95Ms = nonNegativeNumber(
    projection.inputToVisibleP95Ms,
    'interaction input-to-visible p95',
  );
  actual.outcome.frameGapP95Ms = nonNegativeNumber(
    projection.frameGapP95Ms,
    'interaction frame gap p95',
  );
  actual.outcome.rawTimingSamples = clone(
    arrayValue(projection.rawTimingSamples, 'interaction raw timing samples'),
  );
  actual.interaction.transformedHitMismatchCount = nonNegativeInteger(
    local.transformedHitMismatchCount,
    'transformed hit mismatch count',
  );
  actual.geometry.nonFiniteCount = nonNegativeInteger(
    local.nonFiniteCount,
    'interaction non-finite count',
  );
}

function projectSemanticParity(actual, final) {
  const terminal = recordValue(final.terminalProjection, 'terminal semantic projection');
  actual.outcome.semanticDiffCount = nonNegativeInteger(
    final.semanticDiffCount,
    'semantic diff count',
  );
  actual.outcome.expectedEvidenceDigest = digestValue(
    final.expectedEvidenceDigest,
    'expected evidence digest',
  );
  actual.provenance.expectedEvidenceDigestBefore = digestValue(
    final.expectedEvidenceDigestBefore,
    'expected evidence digest before',
  );
  actual.scene.invalidNodeCount = nonNegativeInteger(
    recordValue(terminal.scene, 'terminal scene').invalidNodeCount,
    'terminal invalid node count',
  );
  actual.geometry.nonFiniteCount = nonNegativeInteger(
    recordValue(terminal.geometry, 'terminal geometry').nonFiniteCount,
    'terminal non-finite count',
  );
  actual.text.unpairedSurrogates = nonNegativeInteger(
    recordValue(terminal.text, 'terminal text').unpairedSurrogates,
    'terminal unpaired surrogate count',
  );
  actual.paint.unresolvedIntentCount = nonNegativeInteger(
    recordValue(terminal.paint, 'terminal paint').unresolvedIntentCount,
    'terminal unresolved intent count',
  );
  actual.interaction.staleGestureCount = nonNegativeInteger(
    recordValue(terminal.interaction, 'terminal interaction').staleGestureCount,
    'terminal stale gesture count',
  );
  actual.events.unclassifiedCount = nonNegativeInteger(
    recordValue(terminal.events, 'terminal events').unclassifiedCount,
    'terminal unclassified event count',
  );
  actual.history.corruptEntryCount = nonNegativeInteger(
    recordValue(terminal.history, 'terminal history').corruptEntryCount,
    'terminal corrupt history count',
  );
}

function projectVisibleTiming(actual, projection) {
  actual.outcome.longTaskAtLeast100Ms = nonNegativeInteger(
    projection.longTaskAtLeast100Ms,
    'visible action long task count',
  );
  actual.outcome.actionToVisibleP95Ms = nonNegativeNumber(
    projection.actionToVisibleP95Ms,
    'visible action p95',
  );
  if (projection.frameGapP95Ms !== undefined) {
    actual.outcome.frameGapP95Ms = nonNegativeNumber(
      projection.frameGapP95Ms,
      'visible frame gap p95',
    );
  }
  actual.outcome.rawTimingSamples = clone(
    arrayValue(projection.rawTimingSamples, 'visible raw timing samples'),
  );
}

function productProjection(local, caseId) {
  return recordValue(
    recordValue(local.product, `${caseId} product`).projection,
    `${caseId} semantic projection`,
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
  if (cleanup.productResources !== undefined) {
    const productResources = recordValue(cleanup.productResources, 'product resources');
    const ownership = recordValue(productResources.ownership, 'product resource ownership');
    for (const value of Object.values(ownership)) total += resourceCount(value);
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

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, label);
  return value;
}

function booleanValue(value, label) {
  assert(typeof value === 'boolean', label);
  return value;
}

function nonNegativeNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value) && value >= 0, label);
  return value;
}

function nonNegativeInteger(value, label) {
  assert(Number.isSafeInteger(value) && value >= 0, label);
  return value;
}

function positiveInteger(value, label) {
  const integer = nonNegativeInteger(value, label);
  assert(integer > 0, label);
  return integer;
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

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Invalid Core v2 performance fold: ${message}`);
}
