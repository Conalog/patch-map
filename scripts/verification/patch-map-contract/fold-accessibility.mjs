import { cloneOptional as clone, deepFreeze } from './value-atoms.mjs';

export const ACCESSIBILITY_FOLD_REVISION =
  'patch-map-accessibility-fold/1';

const OBSERVATION_REVISION = 'patch-map-semantic-observation/1';
const EXECUTION_REVISION = 'patch-map-contract-case-execution/1';
const CASE_IDS = new Set(['ACC-001', 'ACC-002', 'ACC-003']);
const CLASSIFIED_ENGINE_EVENTS = new Set([
  'ready',
  'sceneCommitted',
  'drawComplete',
  'frame',
  'diagnostic',
  'destroyed',
]);
const CASE_ACTIONS = Object.freeze({
  'ACC-001': Object.freeze([
    'read-logical-accessibility-tree',
    'focus-accessibility-target',
    'activate-accessibility-target',
  ]),
  'ACC-002': Object.freeze([
    'run-pointer-action-trace',
    'run-host-control-action-trace',
    'compare-semantic-observations',
  ]),
  'ACC-003': Object.freeze([
    'set-reduced-motion',
    'patch-component',
    'focus-and-select',
    'set-reduced-motion',
  ]),
});
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
 * Fold only public product probes and executor facts. Expected observations
 * and comparison values never enter this module.
 */
export function foldAccessibilityExecution(optionsValue) {
  const options = validateOptions(optionsValue);
  const plan = validatePlan(options.casePlan);
  const execution = validateExecution(options.execution, plan);
  const projected = projectCase(plan, execution);
  const provenance = clone(options.provenance);
  const environment = clone(options.environment);
  provenance.expectedEvidenceBound =
    provenance.fixtureSha256 === undefined ||
    provenance.fixtureSha256 === plan.fixtureSha256;
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
    text: notExercised('accessibility-does-not-change-text-raster-contract'),
    paint: notExercised('accessibility-does-not-change-paint-contract'),
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
    accessibility: {
      _availability: {
        logicalAuthority: 'available',
        pixiShadowDom: 'available',
      },
      ...projected.accessibility,
    },
    outcome: {
      _availability: { actualActionResults: 'available' },
      recorded: execution.actionResults.every(({ status }) => status === 'completed'),
      unclassifiedErrorCount: unclassifiedErrorCount(execution),
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

function projectCase(plan, execution) {
  switch (plan.id) {
    case 'ACC-001':
      return projectLogicalAccessibility(execution);
    case 'ACC-002':
      return projectControlParity(execution);
    case 'ACC-003':
      return projectReducedMotion(execution);
    default:
      throw new Error(`Unsupported PatchMap accessibility case ${String(plan.id)}`);
  }
}

function projectLogicalAccessibility(execution) {
  const treeAction = actionActual(
    execution,
    0,
    'read-logical-accessibility-tree',
  );
  const activation = actionActual(
    execution,
    2,
    'activate-accessibility-target',
  );
  const product = productRecord(activation);
  const accessibility = recordValue(
    product.accessibility,
    'logical accessibility probe',
  );
  const geometry = recordValue(product.geometry, 'accessibility geometry');
  const pointer = recordValue(
    product.pointerGesture,
    'accessibility pointer gesture',
  );
  const snapshot = recordValue(product.snapshot, 'accessibility snapshot');
  return domains({
    revisions: clone(recordValue(snapshot.revisions, 'snapshot revisions')),
    scene: {
      invalidNodeCount: invalidDatasetNodeCount(product.dataset),
    },
    geometry: {
      nonFiniteCount:
        nonNegativeInteger(
          accessibility.nonFiniteBoundsCount,
          'non-finite accessibility bounds',
        ) + nonFiniteGeometryCount(geometry),
    },
    interaction: {
      selectedTargets: clone(snapshot.selectionIds),
      staleGestureCount: nonNegativeInteger(
        pointer.staleGestureCount,
        'stale gesture count',
      ),
    },
    accessibility: {
      orderedIds: stringArray(
        accessibility.orderedIds,
        'accessibility ordered IDs',
      ),
      targets: clone(recordValue(accessibility.targets, 'accessibility targets')),
      duplicateActivationCount: nonNegativeInteger(
        accessibility.duplicateActivationCount,
        'duplicate activation count',
      ),
      hiddenFocusableCount: nonNegativeInteger(
        accessibility.hiddenFocusableCount,
        'hidden focusable count',
      ),
      invalidNodeCount: nonNegativeInteger(
        accessibility.invalidNodeCount,
        'invalid accessibility node count',
      ),
      surface: clone(accessibility.surface),
      initialTree: clone(treeAction.tree),
    },
  });
}

function projectControlParity(execution) {
  const hostAction = actionActual(
    execution,
    1,
    'run-host-control-action-trace',
  );
  const comparison = actionActual(
    execution,
    2,
    'compare-semantic-observations',
  );
  const product = productRecord(comparison);
  const snapshot = recordValue(product.snapshot, 'host snapshot');
  const history = recordValue(product.history, 'host history');
  const accessibility = recordValue(
    product.accessibility,
    'host accessibility',
  );
  return domains({
    revisions: clone(recordValue(snapshot.revisions, 'host revisions')),
    scene: {
      invalidNodeCount: invalidDatasetNodeCount(product.dataset),
    },
    geometry: {
      nonFiniteCount: nonFiniteGeometryCount(
        recordValue(product.geometry, 'host geometry'),
      ),
    },
    interaction: {
      selectedTargets: stringArray(
        snapshot.selectionIds,
        'host selected targets',
      ),
    },
    history: {
      depth: nonNegativeInteger(history.depth, 'host history depth'),
      cursor: nonNegativeInteger(history.cursor, 'host history cursor'),
    },
    accessibility: {
      invalidNodeCount: nonNegativeInteger(
        accessibility.invalidNodeCount,
        'host invalid accessibility nodes',
      ),
      focusedId: accessibility.focusedId ?? null,
      surface: clone(accessibility.surface),
    },
    outcome: {
      pointerHostParityDiffCount: nonNegativeInteger(
        comparison.pointerHostParityDiffCount,
        'pointer/host parity differences',
      ),
      comparedDomains: stringArray(
        comparison.domains,
        'pointer/host compared domains',
      ),
      hostTraceCompleted: recordValue(
        hostAction.observation,
        'host observation',
      ).outcome?.completed === true,
    },
  });
}

function projectReducedMotion(execution) {
  const patched = actionActual(execution, 1, 'patch-component');
  const focused = actionActual(execution, 2, 'focus-and-select');
  const finalMotion = actionActual(execution, 3, 'set-reduced-motion');
  const product = productRecord(finalMotion);
  const bar = recordValue(product.bar, 'reduced-motion bar probe');
  const semantic = recordValue(product.semantic, 'reduced-motion semantic');
  const interaction = recordValue(
    semantic.interaction,
    'reduced-motion semantic interaction',
  );
  const snapshot = recordValue(product.snapshot, 'reduced-motion snapshot');
  const accessibility = recordValue(
    product.accessibility,
    'reduced-motion accessibility',
  );
  const inspection = recordValue(
    product.historyInspection,
    'reduced-motion history inspection',
  );
  const ownerId = stringValue(
    recordValue(patched.target, 'patched target').ownerId,
    'patched owner ID',
  );
  const componentId = stringValue(
    recordValue(patched.target, 'patched target').componentId,
    'patched component ID',
  );
  return domains({
    revisions: clone(recordValue(snapshot.revisions, 'reduced-motion revisions')),
    scene: {
      targets: {
        [ownerId]: {
          [componentId]: {
            size: {
              height: finiteNumber(
                bar.semanticHeight,
                'semantic bar height',
              ),
            },
          },
        },
      },
      invalidNodeCount: invalidDatasetNodeCount(product.dataset),
    },
    geometry: {
      targets: {
        [ownerId]: {
          [componentId]: {
            presentationHeightAtFirstFrame: finiteNumber(
              patched.presentationHeightAtFirstFrame,
              'first-frame presentation height',
            ),
          },
        },
      },
      nonFiniteCount: nonFiniteGeometryCount(
        recordValue(product.geometry, 'reduced-motion geometry'),
      ),
    },
    interaction: {
      selectedTargets: stringArray(
        snapshot.selectionIds,
        'reduced-motion selection',
      ),
    },
    history: {
      depth: nonNegativeInteger(
        recordValue(product.history, 'reduced-motion history').depth,
        'reduced-motion history depth',
      ),
      corruptEntryCount: corruptHistoryEntryCount(inspection),
    },
    accessibility: {
      targets: clone(recordValue(accessibility.targets, 'accessibility targets')),
      invalidNodeCount: nonNegativeInteger(
        accessibility.invalidNodeCount,
        'invalid accessibility nodes',
      ),
      focusAndSelect: clone(focused.selectedTargets),
      surface: clone(accessibility.surface),
    },
    resources: {
      activeAnimations: nonNegativeInteger(
        interaction.activeAnimationCount,
        'active animations',
      ),
    },
  });
}

function domains(partial) {
  return {
    revisions: partial.revisions ?? {},
    scene: partial.scene ?? {},
    geometry: partial.geometry ?? {},
    interaction: partial.interaction ?? {},
    events: partial.events ?? {},
    history: partial.history ?? {},
    accessibility: partial.accessibility ?? {},
    outcome: partial.outcome ?? {},
    resources: partial.resources ?? {},
  };
}

function productRecord(action) {
  return recordValue(action.product, 'action product');
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

function invalidDatasetNodeCount(value) {
  const dataset = arrayValue(value, 'product dataset');
  let invalid = 0;
  const visit = (node) => {
    if (
      !isRecord(node) ||
      typeof node.id !== 'string' ||
      node.id.length === 0 ||
      typeof node.type !== 'string'
    ) {
      invalid += 1;
      return;
    }
    if (Array.isArray(node.children)) node.children.forEach(visit);
  };
  dataset.forEach(visit);
  return invalid;
}

function nonFiniteGeometryCount(value) {
  const geometry = recordValue(value, 'geometry probe');
  const entities = arrayValue(geometry.entities, 'geometry entities');
  let count = 0;
  for (const entityValue of entities) {
    const entity = recordValue(entityValue, 'geometry entity');
    const bounds = arrayValue(entity.screenBounds, 'entity screen bounds');
    count += bounds.filter((entry) =>
      typeof entry !== 'number' || !Number.isFinite(entry)).length;
  }
  return count;
}

function corruptHistoryEntryCount(inspection) {
  const commands = arrayValue(inspection.commands, 'history commands');
  let corrupt = 0;
  for (const commandValue of commands) {
    if (!isRecord(commandValue)) {
      corrupt += 1;
      continue;
    }
    const records = commandValue.records;
    if (
      typeof commandValue.id !== 'string' ||
      commandValue.id.length === 0 ||
      !Array.isArray(records) ||
      records.length !== commandValue.recordCount ||
      !isRecord(commandValue.before) ||
      !isRecord(commandValue.after)
    ) {
      corrupt += 1;
    }
  }
  return corrupt;
}

function unclassifiedEventCount(journal) {
  return journal.filter((entryValue) => {
    if (!isRecord(entryValue)) return true;
    return !CLASSIFIED_ENGINE_EVENTS.has(entryValue.event);
  }).length;
}

function unclassifiedErrorCount(execution) {
  const failedActions = execution.actionResults.filter(({ status }) =>
    status !== 'completed').length;
  return failedActions
    + arrayValue(execution.eventJournalFailures, 'event journal failures').length
    + arrayValue(
    execution.cleanup.errors,
    'cleanup errors',
  ).filter((error) => !isRecord(error) && typeof error !== 'string').length;
}

function projectCaptures(plan, execution) {
  assert(plan.captureCheckpoints.length === 0, 'plan has no capture checkpoints');
  assert(execution.captures.length === 0, 'execution has no captures');
  return {};
}

function validateOptions(value) {
  const options = recordValue(value, 'options');
  assertExactKeys(
    options,
    ['casePlan', 'environment', 'execution', 'provenance'],
    'options',
  );
  assert(isRecord(options.provenance), 'provenance');
  assert(isRecord(options.environment), 'environment');
  return options;
}

function validatePlan(value) {
  const plan = recordValue(value, 'case plan');
  assert(CASE_IDS.has(plan.id), `case ${String(plan.id)}`);
  const actions = CASE_ACTIONS[plan.id];
  assert(Array.isArray(plan.actionTrace), 'plan action trace');
  assert(
    plan.actionTrace.length === actions.length &&
      plan.actionTrace.every((action, index) => action.type === actions[index]),
    `${plan.id} action trace`,
  );
  assert(isRecord(plan.fixture), 'plan fixture');
  assert(isRecord(plan.fixture.setup), 'plan setup');
  assert(isRecord(plan.fixture.setup.params), 'plan params');
  assert(Array.isArray(plan.captureCheckpoints), 'plan captures');
  return plan;
}

function validateExecution(value, plan) {
  const execution = recordValue(value, 'execution');
  assert(execution.$schema === EXECUTION_REVISION, 'execution schema');
  assert(execution.caseId === plan.id, 'execution case');
  assert(execution.status === 'completed', 'execution status');
  assert(Array.isArray(execution.actionResults), 'execution action results');
  assert(
    execution.actionResults.length === plan.actionTrace.length,
    'action result count',
  );
  assert(Array.isArray(execution.eventJournal), 'event journal');
  assert(Array.isArray(execution.eventJournalFailures), 'event journal failures');
  assert(isRecord(execution.cleanup), 'execution cleanup');
  assert(Array.isArray(execution.captures), 'execution captures');
  validateProductCleanup(execution.cleanup, plan.id);
  return execution;
}

function validateProductCleanup(cleanup, caseId) {
  const product = recordValue(cleanup.productResources, 'product cleanup');
  assertExactKeys(
    product,
    [
      'caseId',
      'retainedLogicalNodeCount',
      'retainedProductCallbackCount',
      'revision',
    ],
    'product cleanup',
  );
  assert(
    product.revision === 'patch-map-accessibility-cleanup/1',
    'product cleanup revision',
  );
  assert(product.caseId === caseId, 'product cleanup case');
  assert(
    nonNegativeInteger(
      product.retainedLogicalNodeCount,
      'retained logical nodes',
    ) === 0,
    'retained logical nodes are zero',
  );
  assert(
    nonNegativeInteger(
      product.retainedProductCallbackCount,
      'retained product callbacks',
    ) === 0,
    'retained product callbacks are zero',
  );
}

function notExercised(reason) {
  return {
    _availability: {
      publicProductProbes: 'not-exercised',
      reason,
    },
  };
}

function assertExactKeys(value, required, label) {
  const keys = Object.keys(value).sort();
  const expected = [...required].sort();
  assert(
    keys.length === expected.length &&
      keys.every((key, index) => key === expected[index]),
    `${label} exact keys`,
  );
}

function recordValue(value, label) {
  assert(isRecord(value), label);
  return value;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function arrayValue(value, label) {
  assert(Array.isArray(value), label);
  return value;
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, label);
  return value;
}

function stringArray(value, label) {
  return arrayValue(value, label).map((entry, index) =>
    stringValue(entry, `${label}[${index}]`));
}

function nonNegativeInteger(value, label) {
  assert(Number.isSafeInteger(value) && value >= 0, label);
  return value;
}

function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), label);
  return value;
}

function allNumbersFinite(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(allNumbersFinite);
  if (!isRecord(value)) return true;
  return Object.values(value).every(allNumbersFinite);
}

function validateJson(value, label, seen) {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) return;
  if (typeof value === 'number') {
    assert(Number.isFinite(value), `${label} finite number`);
    return;
  }
  assert(typeof value === 'object', `${label} JSON value`);
  assert(!seen.has(value), `${label} acyclic`);
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      validateJson(entry, `${label}[${index}]`, seen));
  } else {
    Object.entries(value).forEach(([key, entry]) =>
      validateJson(entry, `${label}.${key}`, seen));
  }
  seen.delete(value);
}


function assert(condition, message) {
  if (!condition) {
    throw new Error(`Invalid PatchMap accessibility fold: ${message}`);
  }
}
