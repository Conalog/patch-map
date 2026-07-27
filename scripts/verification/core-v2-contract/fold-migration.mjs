export const MIGRATION_FOLD_REVISION = 'core-v2-migration-fold/1';

const OBSERVATION_REVISION = 'core-v2-semantic-observation/1';
const EXECUTION_REVISION = 'core-v2-contract-case-execution/1';
const CASE_ACTIONS = Object.freeze({
  'MIG-001': Object.freeze([
    'load-canonical-and-legacy-corpus',
    'apply-representative-edits',
    'export-validate-reload',
    'attempt-nonserializable-save',
  ]),
  'MIG-002': Object.freeze([
    'mount-authoritative-and-shadow',
    'run-effect-trace',
    'evaluate-canary-cohorts',
  ]),
  'MIG-003': Object.freeze([
    'set-rollback-flag',
    'run-trigger-state-matrix',
    'remount-authoritative-engine',
  ]),
});
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
 * Expected-blind fold over public product probes and executor-owned facts.
 */
export function foldMigrationExecution(optionsValue) {
  const options = validateOptions(optionsValue);
  const plan = validatePlan(options.casePlan);
  const execution = validateExecution(options.execution, plan);
  const projected = projectCase(plan.id, execution);
  const provenance = clone(options.provenance);
  provenance.expectedEvidenceBound =
    provenance.fixtureSha256 === undefined ||
    provenance.fixtureSha256 === plan.fixtureSha256;
  const environment = clone(options.environment);
  environment.contractProfileBound =
    environment.backend === 'webgl2' &&
    Object.keys(recordValue(plan.fixtureProfiles, 'fixture profiles')).length > 0;

  const actual = {
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
      _availability: { publicProductProbes: 'available' },
      ...projected.revisions,
      valuesFinite: allNumbersFinite(projected.revisions),
    },
    scene: {
      _availability: { publicProductProbes: 'available' },
      ...projected.scene,
    },
    geometry: {
      _availability: { publicProductProbes: 'available' },
      ...projected.geometry,
    },
    text: {
      _availability: { publicProductProbes: 'available' },
      ...projected.text,
    },
    paint: {
      _availability: { publicProductProbes: 'available' },
      ...projected.paint,
    },
    interaction: {
      _availability: { publicProductProbes: 'available' },
      ...projected.interaction,
    },
    events: {
      _availability: { executorJournal: 'available' },
      totalCount: execution.eventJournal.length,
      unclassifiedCount: unclassifiedEventCount(execution.eventJournal),
      ...projected.events,
    },
    history: {
      _availability: { publicProductProbes: 'available' },
      ...projected.history,
    },
    accessibility: notExercised('migration-does-not-change-accessibility-semantics'),
    outcome: {
      _availability: { actualActionResults: 'available' },
      recorded: execution.actionResults.every(({ status }) => status === 'completed'),
      ...projected.outcome,
    },
    resources: {
      _availability: {
        executorCleanup: 'available',
        productCleanup: 'available',
      },
      leakDelta: cleanupLeakDelta(execution.cleanup),
      ...projected.resources,
    },
  };
  assert(
    DOMAIN_NAMES.every((domain) => isRecord(actual[domain])),
    'actual contains fourteen observation domains',
  );
  validateJson(actual, 'actual', new WeakSet());
  return deepFreeze({
    actual,
    fixtures: clone(plan.fixture.setup.params),
    captures: projectCaptures(plan, execution),
  });
}

function projectCase(caseId, execution) {
  if (caseId === 'MIG-001') return projectSchemaCutover(execution);
  if (caseId === 'MIG-002') return projectCanary(execution);
  if (caseId === 'MIG-003') return projectRollback(execution);
  throw new Error(`Unsupported Core v2 migration case ${String(caseId)}`);
}

function projectSchemaCutover(execution) {
  const reload = actionActual(
    execution,
    2,
    'export-validate-reload',
  );
  const rejected = actionActual(
    execution,
    3,
    'attempt-nonserializable-save',
  );
  const product = productRecord(rejected);
  const common = commonProductDomains(product);
  const diagnostic = recordValue(
    rejected.diagnostic,
    'nonserializable diagnostic',
  );
  return domains({
    ...common,
    outcome: {
      roundtripSemanticDiffCount: nonNegativeInteger(
        reload.roundtripSemanticDiffCount,
        'roundtrip semantic diff count',
      ),
      export: {
        rootKind: stringValue(reload.rootKind, 'export root kind'),
        semanticHash: stringValue(reload.semanticHash, 'export semantic hash'),
        serializedLength: nonNegativeInteger(
          reload.serializedLength,
          'serialized length',
        ),
      },
      nonserializable: {
        code: stringValue(diagnostic.code, 'nonserializable code'),
        path: diagnostic.path ?? null,
      },
      persistenceWritesAfterFailure: nonNegativeInteger(
        rejected.persistenceWritesAfterFailure,
        'persistence writes after failure',
      ),
      totalPersistenceWrites: nonNegativeInteger(
        rejected.totalPersistenceWrites,
        'total persistence writes',
      ),
    },
  });
}

function projectCanary(execution) {
  const effects = actionActual(execution, 1, 'run-effect-trace');
  const evaluated = actionActual(
    execution,
    2,
    'evaluate-canary-cohorts',
  );
  const migration = recordValue(evaluated.migration, 'canary migration probe');
  const cohort = recordValue(evaluated.cohort, 'canary cohort');
  const common = commonProductDomains(productRecord(evaluated));
  return domains({
    ...common,
    outcome: {
      authoritativeEffectCount: nonNegativeInteger(
        migration.authoritativeEffectCount,
        'authoritative effect count',
      ),
      shadowEffectCount: nonNegativeInteger(
        migration.shadowEffectCount,
        'shadow effect count',
      ),
      authoritativeEngineCountPerSession: nonNegativeInteger(
        migration.authoritativeEngineCountPerSession,
        'authoritative engines per session',
      ),
      suppressedShadowEffectCount: nonNegativeInteger(
        migration.suppressedShadowEffectCount,
        'suppressed shadow effects',
      ),
      effectTrace: {
        authoritative: clone(
          arrayValue(effects.authoritative, 'authoritative effect trace'),
        ),
        shadow: clone(arrayValue(effects.shadow, 'shadow effect trace')),
      },
      cohort: {
        completedCohorts: clone(
          arrayValue(cohort.completedCohorts, 'completed cohorts'),
        ),
        stoppedAtPercent: cohort.stoppedAtPercent ?? null,
        promotionAllowed: booleanValue(
          cohort.promotionAllowed,
          'promotion allowed',
        ),
      },
    },
    resources: {
      activeCanvasesPerHostSlot: nonNegativeInteger(
        migration.activeCanvasesPerHostSlot,
        'active canvases per host slot',
      ),
      shadowCanvasCount: nonNegativeInteger(
        migration.shadowCanvasCount,
        'shadow canvas count',
      ),
      activeLifecycleCount: nonNegativeInteger(
        migration.activeLifecycleCount,
        'active lifecycle count',
      ),
    },
  });
}

function projectRollback(execution) {
  const trigger = actionActual(
    execution,
    1,
    'run-trigger-state-matrix',
  );
  const remount = actionActual(
    execution,
    2,
    'remount-authoritative-engine',
  );
  const migration = recordValue(remount.migration, 'rollback migration probe');
  const common = commonProductDomains(productRecord(remount));
  return domains({
    ...common,
    interaction: {
      ...common.interaction,
      staleGestureCount: nonNegativeInteger(
        migration.staleGestureCount,
        'rollback stale gestures',
      ),
      triggerStates: clone(arrayValue(trigger.states, 'rollback states')),
    },
    outcome: {
      activeSessionHotSwapCount: nonNegativeInteger(
        migration.activeSessionHotSwapCount,
        'active session hot swaps',
      ),
      nextRemountEngine: stringValue(
        migration.activeEngine,
        'next remount engine',
      ),
      replayedGestureCount: nonNegativeInteger(
        migration.replayedGestureCount,
        'replayed gestures',
      ),
      persistence: clone(
        recordValue(remount.persistence, 'rollback persistence'),
      ),
    },
    resources: {
      activeLifecycleCount: nonNegativeInteger(
        migration.activeLifecycleCount,
        'active lifecycle count',
      ),
      canvasCount: nonNegativeInteger(
        migration.canvasCount,
        'rollback canvas count',
      ),
      retainedCallbackCount: nonNegativeInteger(
        migration.retainedCallbackCount,
        'retained migration callbacks',
      ),
    },
  });
}

function commonProductDomains(product) {
  const snapshot = recordValue(product.snapshot, 'migration snapshot');
  const semantic = recordValue(product.semantic, 'migration semantic probe');
  const semanticScene = recordValue(semantic.scene, 'migration semantic scene');
  const semanticGeometry = recordValue(
    semantic.geometry,
    'migration semantic geometry',
  );
  const semanticText = recordValue(semantic.text, 'migration semantic text');
  const semanticPaint = recordValue(semantic.paint, 'migration semantic paint');
  const pointer = recordValue(
    product.pointerGesture,
    'migration pointer gesture',
  );
  const semanticHistory = recordValue(
    semantic.history,
    'migration semantic history',
  );
  const dataset = arrayValue(product.dataset, 'migration product dataset');
  return domains({
    revisions: clone(recordValue(snapshot.revisions, 'migration revisions')),
    scene: {
      invalidNodeCount: invalidDatasetNodeCount(dataset),
      nodeCount: arrayValue(semanticScene.nodes, 'semantic scene nodes').length,
    },
    geometry: {
      nonFiniteCount: nonNegativeInteger(
        semanticGeometry.nonFiniteValueCount,
        'semantic non-finite geometry',
      ),
    },
    text: {
      unpairedSurrogates: nonNegativeInteger(
        semanticText.unpairedSurrogateCount,
        'unpaired surrogate count',
      ),
    },
    paint: {
      unresolvedIntentCount: nonNegativeInteger(
        semanticPaint.unresolvedCount,
        'unresolved paint intent count',
      ),
    },
    interaction: {
      staleGestureCount: nonNegativeInteger(
        pointer.staleGestureCount,
        'stale gesture count',
      ),
      selectedTargets: clone(snapshot.selectionIds),
    },
    history: {
      corruptEntryCount: nonNegativeInteger(
        semanticHistory.corruptCount ?? 0,
        'history corrupt entry count',
      ),
    },
  });
}

function domains(partial) {
  return {
    revisions: partial.revisions ?? {},
    scene: partial.scene ?? {},
    geometry: partial.geometry ?? {},
    text: partial.text ?? {},
    paint: partial.paint ?? {},
    interaction: partial.interaction ?? {},
    events: partial.events ?? {},
    history: partial.history ?? {},
    outcome: partial.outcome ?? {},
    resources: partial.resources ?? {},
  };
}

function productRecord(action) {
  return recordValue(action.product, 'migration action product');
}

function actionActual(execution, index, type) {
  const result = execution.actionResults[index];
  assert(result !== undefined, `action result ${index}`);
  assert(result.index === index, `action result index ${index}`);
  assert(result.type === type, `action result type ${index}`);
  assert(result.status === 'completed', `action result status ${index}`);
  return recordValue(
    recordValue(result.delta, `action ${index} delta`).actual,
    `action ${index} actual`,
  );
}

function cleanupLeakDelta(cleanup) {
  let total = cleanup.status === 'completed' ? 0 : 1;
  total += arrayValue(cleanup.errors, 'cleanup errors').length;
  for (const releaseValue of arrayValue(cleanup.releases, 'cleanup releases')) {
    const release = recordValue(releaseValue, 'cleanup release');
    const remaining = recordValue(
      release.remainingResources,
      'remaining resources',
    );
    for (const field of ['canvasCount', 'subscriptions', 'pendingWork']) {
      total += nonNegativeInteger(remaining[field], `remaining ${field}`);
    }
  }
  return total;
}

function invalidDatasetNodeCount(dataset) {
  let invalid = 0;
  const visit = (value) => {
    if (
      !isRecord(value) ||
      typeof value.id !== 'string' ||
      value.id.length === 0 ||
      typeof value.type !== 'string'
    ) {
      invalid += 1;
      return;
    }
    if (Array.isArray(value.children)) value.children.forEach(visit);
  };
  dataset.forEach(visit);
  return invalid;
}

function unclassifiedEventCount(events) {
  return events.reduce((count, eventValue) => {
    const event = recordValue(eventValue, 'engine event');
    return count + Number(
      typeof event.event !== 'string' ||
      !CLASSIFIED_ENGINE_EVENTS.has(event.event),
    );
  }, 0);
}

function projectCaptures(plan, execution) {
  const captures = {};
  for (const [name, value] of Object.entries(execution.bindings)) {
    captures[name] = clone(value);
  }
  for (const capture of execution.captures) {
    const record = recordValue(capture, 'migration capture');
    const id = stringValue(record.id, 'migration capture ID');
    captures[id] = clone(record.values);
  }
  return captures;
}

function validateOptions(value) {
  const options = recordValue(value, 'migration fold options');
  for (const field of ['casePlan', 'execution', 'provenance', 'environment']) {
    assert(isRecord(options[field]), `options ${field}`);
  }
  return options;
}

function validatePlan(value) {
  const plan = recordValue(value, 'migration case plan');
  const actions = CASE_ACTIONS[plan.id];
  assert(actions !== undefined, 'supported migration case');
  assert(plan.caseType === 'capability', 'migration case type');
  assert(isRecord(plan.fixture), 'migration fixture');
  assert(isRecord(plan.fixture.setup), 'migration setup');
  assert(isRecord(plan.fixture.setup.params), 'migration params');
  assert(Array.isArray(plan.actionTrace), 'migration action trace');
  assert(plan.actionTrace.length === actions.length, 'migration action count');
  plan.actionTrace.forEach((actionValue, index) => {
    const action = recordValue(actionValue, `migration action ${index}`);
    assert(action.index === index, `migration action ${index} index`);
    assert(action.type === actions[index], `migration action ${index} type`);
  });
  assert(isRecord(plan.fixtureProfiles), 'migration fixture profiles');
  return plan;
}

function validateExecution(value, plan) {
  const execution = recordValue(value, 'migration execution');
  assert(execution.$schema === EXECUTION_REVISION, 'execution schema');
  assert(execution.caseId === plan.id, 'execution case');
  assert(execution.status === 'completed', 'execution status');
  assert(Array.isArray(execution.actionResults), 'execution action results');
  assert(
    execution.actionResults.length === plan.actionTrace.length,
    'execution action result count',
  );
  assert(Array.isArray(execution.eventJournal), 'execution journal');
  assert(Array.isArray(execution.eventJournalFailures), 'journal failures');
  assert(execution.eventJournalFailures.length === 0, 'journal has no failures');
  assert(isRecord(execution.bindings), 'execution bindings');
  assert(Array.isArray(execution.captures), 'execution captures');
  assert(isRecord(execution.cleanup), 'execution cleanup');
  validateProductCleanup(execution.cleanup, plan.id);
  return execution;
}

function validateProductCleanup(cleanup, caseId) {
  const product = recordValue(cleanup.productResources, 'product cleanup');
  assert(
    product.revision === 'core-v2-migration-cleanup/1',
    'migration cleanup revision',
  );
  assert(product.caseId === caseId, 'migration cleanup case');
  for (const field of [
    'retainedAuthorityCount',
    'retainedSessionCount',
    'retainedCallbackCount',
  ]) {
    assert(
      nonNegativeInteger(product[field], `cleanup ${field}`) === 0,
      `${field} is zero`,
    );
  }
}

function notExercised(reason) {
  return {
    _availability: {
      publicProductProbes: 'not-exercised',
      reason,
    },
  };
}

function allNumbersFinite(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(allNumbersFinite);
  if (isRecord(value)) return Object.values(value).every(allNumbersFinite);
  return true;
}

function validateJson(value, path, ancestors) {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return;
  }
  if (typeof value === 'number') {
    assert(Number.isFinite(value), `${path} finite number`);
    return;
  }
  assert(typeof value === 'object', `${path} JSON type`);
  assert(!ancestors.has(value), `${path} cycle`);
  assert(Array.isArray(value) || isRecord(value), `${path} plain JSON object`);
  ancestors.add(value);
  for (const [key, nested] of Object.entries(value)) {
    validateJson(nested, `${path}/${key}`, ancestors);
  }
  ancestors.delete(value);
}

function nonNegativeInteger(value, label) {
  assert(Number.isSafeInteger(value) && value >= 0, label);
  return value;
}

function booleanValue(value, label) {
  assert(typeof value === 'boolean', label);
  return value;
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, label);
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
  return structuredClone(value);
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Invalid Core v2 migration fold: ${message}`);
}
