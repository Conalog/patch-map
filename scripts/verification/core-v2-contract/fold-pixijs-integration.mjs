export const PIXIJS_INTEGRATION_FOLD_REVISION =
  'core-v2-pixijs-integration-fold/1';

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
  'PIX-001': Object.freeze([
    'initialize-engine',
    'load-dataset',
    'inspect-pixijs-public-surface',
  ]),
  'PIX-002': Object.freeze([
    'query-logical-target',
    'map-logical-target-to-render-owner',
  ]),
  'PIX-003': Object.freeze([
    'run-supported-runtime-matrix',
    'attempt-unsupported-backend',
  ]),
  'PIX-005': Object.freeze([
    'run-renderer-loss-matrix',
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

/** Fold only actual action output, public probes, and executor cleanup facts. */
export function foldPixijsIntegrationExecution(optionsValue) {
  const options = recordValue(optionsValue, 'fold options');
  const plan = validatePlan(options.casePlan);
  const execution = validateExecution(options.execution, plan);
  const finalIndex = execution.actionResults.length - 1;
  const final = actionActual(
    execution,
    finalIndex,
    CASE_ACTIONS[plan.id][finalIndex],
  );
  const product = recordValue(final.product, 'final product');
  const runtimeState = recordValue(final.runtimeState, 'runtime state');
  const actual = baseActual(options, plan, execution, product);

  if (plan.id === 'PIX-001') {
    projectPublicSurface(actual, runtimeState, product);
  } else if (plan.id === 'PIX-002') {
    projectLogicalTarget(actual, runtimeState);
  } else if (plan.id === 'PIX-003') {
    projectRuntimeMatrix(actual, runtimeState);
  } else {
    projectRendererLoss(actual, runtimeState);
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
  const interaction = recordValue(semantic.interaction, 'semantic interaction');
  const dataset = arrayValue(product.dataset, 'product dataset');
  const history = recordValue(product.history, 'product history');
  const provenance = clone(recordValue(options.provenance, 'provenance'));
  const environment = clone(recordValue(options.environment, 'environment'));
  const fixtureProfiles = recordValue(plan.fixtureProfiles, 'fixture profiles');
  provenance.expectedEvidenceBound =
    provenance.fixtureSha256 === plan.fixtureSha256;
  environment.contractProfileBound =
    environment.backend === 'webgl2'
    && Object.hasOwn(fixtureProfiles, 'pixijs-public-integration-matrix');
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
    revisions: {
      lifecycleGeneration: finiteNumber(
        revisions.lifecycleGeneration,
        'lifecycle generation',
      ),
      sceneRevision: finiteNumber(revisions.sceneRevision, 'scene revision'),
      viewRevision: finiteNumber(revisions.viewRevision, 'view revision'),
      interactionRevision: finiteNumber(
        revisions.interactionRevision,
        'interaction revision',
      ),
      frameRevision: finiteNumber(snapshot.frameRevision, 'frame revision'),
      valuesFinite: allNumbersFinite({
        revisions,
        frameRevision: snapshot.frameRevision,
      }),
    },
    scene: {
      rootIds: stringArray(snapshot.rootIds, 'root IDs'),
      semanticHash: nullableString(snapshot.semanticHash, 'semantic hash'),
      invalidNodeCount: invalidNodeCount(dataset),
      targets: {},
      stage: {},
    },
    geometry: {
      nonFiniteCount: countNonFinite(dataset),
      targets: {},
    },
    text: {
      unpairedSurrogates: countUnpairedSurrogates(dataset),
    },
    paint: {
      unresolvedIntentCount: countUnresolvedIntent(dataset),
    },
    interaction: {
      selectedTargets: stringArray(snapshot.selectionIds, 'selection IDs'),
      staleGestureCount: nonNegativeInteger(
        interaction.activeGestureCount ?? 0,
        'active gesture count',
      ),
    },
    events: {
      unclassifiedCount: unclassifiedEventCount(execution),
      journalCount: execution.eventJournal.length,
    },
    history: {
      depth: historyDepth(history),
      corruptEntryCount: corruptHistoryEntryCount(history),
    },
    accessibility: {
      _availability: { exercised: false },
    },
    outcome: {
      recorded: true,
      actionResults: execution.actionResults.map(({ index, type, status }) => ({
        index,
        type,
        status,
      })),
    },
    resources: {
      canvasCount: nonNegativeInteger(resources.canvasCount, 'canvas count'),
      leakDelta: cleanupLeakDelta(execution.cleanup),
      cleanupStatus: stringValue(
        recordValue(execution.cleanup, 'cleanup').status,
        'cleanup status',
      ),
    },
  };
}

function projectPublicSurface(actual, runtimeState, product) {
  const surface = recordValue(
    runtimeState.publicSurface ?? product.pixi,
    'PIX-001 public surface',
  );
  const stage = recordValue(surface.stage, 'PIX-001 stage');
  actual.outcome.rendererLibrary = stringValue(
    surface.rendererLibrary,
    'renderer library',
  );
  actual.outcome.backend = stringValue(surface.backend, 'renderer backend');
  actual.outcome.rendererVersion = stringValue(
    surface.rendererVersion,
    'renderer version',
  );
  actual.outcome.manualRender = surface.manualRender === true;
  actual.scene.stage = {
    label: stringValue(stage.label, 'stage label'),
    discoverableByDevTools: stage.discoverableByDevTools === true,
    authoritative: stage.authoritative === true,
    worldAttached: stage.worldAttached === true,
    childCount: nonNegativeInteger(stage.childCount, 'stage child count'),
    aggregateLayers: clone(arrayValue(surface.aggregateLayers, 'aggregate layers')),
  };
  actual.resources.canvasCount = nonNegativeInteger(
    recordValue(surface, 'public surface').canvasCount
      ?? recordValue(product.snapshot, 'product snapshot').resources.canvasCount,
    'public canvas count',
  );
}

function projectLogicalTarget(actual, runtimeState) {
  const target = recordValue(runtimeState.queriedTarget, 'PIX-002 queried target');
  const owner = recordValue(runtimeState.renderOwner, 'PIX-002 render owner');
  const ownerId = stringValue(target.ownerId, 'target owner');
  const targetId = stringValue(target.id, 'target ID');
  const logicalTarget = recordValue(owner.logicalTarget, 'logical target');
  const worldBounds = finiteNumberArray(owner.worldBounds, 'target world bounds');
  actual.scene.targets[ownerId] = {
    [targetId]: {
      id: targetId,
      ownerId,
      kind: stringValue(target.kind, 'target kind'),
      parent: nullableString(target.parentKey, 'target parent'),
      visible: target.visible === true,
      rendererObjectCount: nonNegativeInteger(
        logicalTarget.rendererObjectCount,
        'logical renderer object count',
      ),
    },
  };
  actual.geometry.targets[ownerId] = {
    [targetId]: {
      worldBounds: worldBounds.reduce((sum, value) => sum + value, 0),
      worldBoundsTuple: worldBounds,
    },
  };
  actual.outcome.aggregateRenderOwnerId = stringValue(
    owner.aggregateRenderOwnerId,
    'aggregate render owner ID',
  );
  actual.outcome.rendererKind = nullableString(
    owner.rendererKind,
    'aggregate renderer kind',
  );
}

function projectRuntimeMatrix(actual, runtimeState) {
  const matrix = recordValue(runtimeState.runtimeMatrix, 'PIX-003 runtime matrix');
  const unsupported = recordValue(runtimeState.unsupported, 'PIX-003 unsupported result');
  actual.outcome.supportedCellSemanticDiffCount = nonNegativeInteger(
    matrix.supportedCellSemanticDiffCount,
    'supported semantic diff count',
  );
  actual.outcome.runtimeMatrix = {
    supportedCellCount: nonNegativeInteger(
      matrix.supportedCellCount,
      'supported cell count',
    ),
    measuredCellCount: nonNegativeInteger(
      matrix.measuredCellCount,
      'measured cell count',
    ),
    pendingCellCount: nonNegativeInteger(
      matrix.pendingCellCount,
      'pending cell count',
    ),
    pendingCells: clone(arrayValue(matrix.pendingCells, 'pending cells')),
    developmentProxy: clone(
      recordValue(matrix.developmentProxy, 'development proxy'),
    ),
  };
  actual.outcome.unsupported = {
    backend: stringValue(unsupported.backend, 'unsupported backend'),
    code: stringValue(unsupported.code, 'unsupported code'),
    category: stringValue(unsupported.category, 'unsupported category'),
    cleanFailure: unsupported.cleanFailure === true,
  };
}

function projectRendererLoss(actual, runtimeState) {
  const matrix = recordValue(
    runtimeState.rendererLossMatrix,
    'PIX-005 renderer loss matrix',
  );
  const results = arrayValue(matrix.results, 'renderer loss results').map(
    (value, index) => recordValue(value, `renderer loss result ${index}`),
  );
  const classified = results.filter(({ classification }) => (
    classification === 'recovered-frame' || classification === 'RENDERER_LOST'
  ));
  const unclassified = results.length - classified.length;
  actual.outcome.backend = stringValue(matrix.backend, 'loss backend');
  actual.outcome.classifiedResultCount = classified.length;
  actual.outcome.unclassifiedResultCount = unclassified;
  actual.outcome.results = results.map((result) => ({
    state: stringValue(result.state, 'loss state'),
    classification: stringValue(result.classification, 'loss classification'),
    forced: result.forced === true,
    tupleBefore: clone(recordValue(result.tupleBefore, 'tuple before')),
    tupleAfter: clone(recordValue(result.tupleAfter, 'tuple after')),
    terminal: clone(recordValue(result.terminal, 'terminal loss probe')),
  }));
  actual.events.unclassifiedCount += unclassified;
  actual.resources.duplicateCanvases = results.filter((result) => (
    nonNegativeInteger(result.maxCanvasCount, 'max canvas count') > 1
  )).length;
  actual.resources.listenerDelta = results.reduce((total, result) => (
    total + nonNegativeInteger(
      recordValue(result.terminal, 'terminal loss probe').listenerCount,
      'terminal listener count',
    )
  ), 0);
  actual.resources.stalePublications = results.filter(
    ({ stalePublication }) => stalePublication === true,
  ).length;
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
  const releases = Array.isArray(cleanup.releases) ? cleanup.releases : [];
  for (const releaseValue of releases) {
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

function unclassifiedEventCount(execution) {
  return execution.eventJournal.filter((entryValue) => {
    const entry = recordValue(entryValue, 'event journal entry');
    return typeof entry.event !== 'string' || !CLASSIFIED_ENGINE_EVENTS.has(entry.event);
  }).length;
}

function invalidNodeCount(dataset) {
  let count = 0;
  visitDataset(dataset, (record) => {
    if (typeof record.id !== 'string' || record.id.length === 0) count += 1;
    if (typeof record.type !== 'string' || record.type.length === 0) count += 1;
  });
  return count;
}

function countUnresolvedIntent(value) {
  let count = 0;
  visitValue(value, (nested) => {
    if (nested === 'unresolved' || nested === 'invalid-paint') count += 1;
  });
  return count;
}

function historyDepth(history) {
  if (Number.isSafeInteger(history.undoDepth)) return history.undoDepth;
  if (Number.isSafeInteger(history.depth)) return history.depth;
  return 0;
}

function corruptHistoryEntryCount(history) {
  return allNumbersFinite(history) ? 0 : 1;
}

function countNonFinite(value, seen = new WeakSet()) {
  let count = 0;
  visitValue(value, (nested) => {
    if (typeof nested === 'number' && !Number.isFinite(nested)) count += 1;
  }, seen);
  return count;
}

function allNumbersFinite(value, seen = new WeakSet()) {
  let valid = true;
  visitValue(value, (nested) => {
    if (typeof nested === 'number' && !Number.isFinite(nested)) valid = false;
  }, seen);
  return valid;
}

function countUnpairedSurrogates(value, seen = new WeakSet()) {
  let count = 0;
  visitValue(value, (nested) => {
    if (typeof nested !== 'string') return;
    for (let index = 0; index < nested.length; index += 1) {
      const code = nested.charCodeAt(index);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = nested.charCodeAt(index + 1);
        if (!(next >= 0xdc00 && next <= 0xdfff)) count += 1;
        else index += 1;
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        count += 1;
      }
    }
  }, seen);
  return count;
}

function visitDataset(value, visitor) {
  if (!Array.isArray(value)) return;
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    visitor(entry);
    if (Array.isArray(entry.children)) visitDataset(entry.children, visitor);
    if (Array.isArray(entry.components)) {
      for (const component of entry.components) {
        if (isRecord(component)) visitor(component);
      }
    }
  }
}

function visitValue(value, visitor, seen = new WeakSet()) {
  visitor(value);
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const nested of value) visitValue(nested, visitor, seen);
    return;
  }
  for (const nested of Object.values(value)) visitValue(nested, visitor, seen);
}

function finiteNumberArray(value, label) {
  const array = arrayValue(value, label);
  assert(array.length > 0, `${label} non-empty`);
  return array.map((entry, index) => finiteNumber(entry, `${label}[${index}]`));
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

function stringArray(value, label) {
  const array = arrayValue(value, label);
  assert(array.every((entry) => typeof entry === 'string'), label);
  return [...array];
}

function nullableString(value, label) {
  assert(value === null || typeof value === 'string', label);
  return value;
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, label);
  return value;
}

function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), label);
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
  if (!condition) throw new Error(`Invalid Core v2 PixiJS fold: ${message}`);
}
