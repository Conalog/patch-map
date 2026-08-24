import { clone, deepFreeze } from './value-atoms.mjs';

export const DATA_FOUNDATION_FOLD_REVISION = 'core-v2-data-foundation-fold/1';

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
  'DAT-003': Object.freeze([
    'loadShorthandMatrix',
    'observeGeometry',
    'validate',
    'validate',
  ]),
  'DAT-004': Object.freeze([
    'initializeInstances',
    'resolveColors',
    'resolveColors',
    'resolveColorInputMatrix',
    'resolveColor',
  ]),
  'DAT-005': Object.freeze([
    'loadGrid',
    'exerciseGridEdgeMatrix',
    'setGridCell',
    'setGridCell',
  ]),
});

/**
 * Project executor and product facts for the three data-foundation cases.
 *
 * The fold intentionally has no imports, hashing, filesystem access, or verdict
 * vocabulary. It can therefore run unchanged in the focused browser Lab while
 * a separate post-run verifier owns all contract comparison.
 */
export function foldDataFoundationExecution(options) {
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
    scene: { _availability: { actionResults: 'available' } },
    geometry: { _availability: { actionResults: 'available' } },
    text: notExercised('data-foundation-actions-do-not-observe-text'),
    paint: { _availability: { actionResults: 'available' } },
    interaction: notExercised('data-foundation-actions-do-not-observe-interaction'),
    events: {
      _availability: {
        eventJournal: 'available',
        browserProbe: browserProbe ? 'available' : 'unavailable',
      },
      journal: clone(execution.eventJournal),
    },
    history: notExercised('data-foundation-actions-do-not-observe-history'),
    accessibility: notExercised('data-foundation-actions-do-not-observe-accessibility'),
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

  if (plan.id === 'DAT-003') projectShorthand(actual, execution);
  if (plan.id === 'DAT-004') projectColors(actual, execution);
  if (plan.id === 'DAT-005') projectGrid(actual, execution);
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
  assert(actionTypes !== undefined, `unsupported data-foundation case ${String(casePlan.id)}`);
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
  validateCaseOperands(casePlan.id, fixtureActions);

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

function validateCaseOperands(caseId, actions) {
  if (caseId === 'DAT-003') {
    assert(actions[0].operands.itemId === 'item-size-matrix', 'DAT-003 itemId');
    assert(actions[1].operands.ownerId === 'item-size-matrix', 'DAT-003 ownerId');
    assert(actions[2].operands.caseId === 'partial-size', 'DAT-003 partial-size action');
    assert(actions[3].operands.caseId === 'non-finite', 'DAT-003 non-finite action');
  }
  if (caseId === 'DAT-004') {
    assert(sameJson(actions[0].operands.ids, ['A', 'B']), 'DAT-004 instance IDs');
    assert(sameJson(actions[0].operands.themes, ['themeA', 'themeB']), 'DAT-004 theme refs');
    assert(actions[1].operands.instanceId === 'A', 'DAT-004 A action');
    assert(actions[2].operands.instanceId === 'B', 'DAT-004 B action');
    assert(actions[3].operands.valueRef === 'colorInputMatrix', 'DAT-004 input matrix action');
    assert(actions[4].operands.instanceId === 'A', 'DAT-004 invalid instance');
    assert(actions[4].operands.value === 'missing.path', 'DAT-004 invalid value');
    assert(actions[4].operands.path === '$[0].fill', 'DAT-004 invalid path');
  }
  if (caseId === 'DAT-005') {
    assert(actions[0].operands.gridId === 'grid', 'DAT-005 gridId');
    assert(actions[1].operands.valueRef === 'edgeMatrices', 'DAT-005 edge matrix');
    assertGridMutation(actions[2], 1, 'DAT-005 activation');
    assertGridMutation(actions[3], 0, 'DAT-005 deactivation');
  }
}

function assertGridMutation(action, value, label) {
  assert(action.operands.gridId === 'grid', `${label} gridId`);
  assert(action.operands.row === 0, `${label} row`);
  assert(action.operands.column === 1, `${label} column`);
  assert(action.operands.value === value, `${label} value`);
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
    assert(result.delta.semanticProbe === null, `execution action ${index} must not allocate an engine`);
  });

  assert(Array.isArray(execution.eventJournal), 'execution eventJournal');
  assert(Array.isArray(execution.eventJournalFailures), 'execution eventJournalFailures');
  assert(execution.eventJournalFailures.length === 0, 'execution event journal failures');
  assert(isPlainObject(execution.bindings), 'execution bindings');
  assert(Array.isArray(execution.captures), 'execution captures');
  assert(execution.terminalSnapshot === null, 'execution terminalSnapshot must be null');
  assert(execution.terminalSemanticProbe === null, 'execution terminalSemanticProbe must be null');
  assert(isPlainObject(execution.cleanup), 'execution cleanup');
  assert(execution.cleanup.status === 'completed', 'execution cleanup status');
  assert(Array.isArray(execution.cleanup.errors) && execution.cleanup.errors.length === 0, 'execution cleanup errors');
  assert(Array.isArray(execution.cleanup.releases), 'execution cleanup releases');
  if (Object.hasOwn(execution, 'datasetObservations')) {
    assert(isPlainObject(execution.datasetObservations), 'execution datasetObservations');
  }
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

function projectShorthand(actual, execution) {
  const loaded = actionActualAt(execution, 0, 'loadShorthandMatrix');
  const observed = actionActualAt(execution, 1, 'observeGeometry');
  const partial = actionActualAt(execution, 2, 'validate');
  const nonFinite = actionActualAt(execution, 3, 'validate');
  assert(partial.caseId === 'partial-size', 'DAT-003 partial-size result');
  assert(nonFinite.caseId === 'non-finite', 'DAT-003 non-finite result');
  assert(sameJson(loaded.geometry?.contentBox, observed.contentBox), 'DAT-003 contentBox drift');
  assert(sameJson(loaded.components, observed.components), 'DAT-003 component drift');

  actual.scene.revision = deriveSceneRevision(execution);
  actual.scene.components = clone(observed.components);
  actual.geometry.contentBox = clone(observed.contentBox);
  actual.geometry.available = clone(observed.available);
  actual.geometry.equivalentForms = booleanValue(observed.equivalentForms, 'DAT-003 equivalentForms');
  actual.geometry.allFinite = booleanValue(observed.finite, 'DAT-003 finite');
  actual.outcome.validation = {
    'partial-size': projectValidation(partial, 'DAT-003 partial-size'),
    'non-finite': projectValidation(nonFinite, 'DAT-003 non-finite'),
  };
  actual.outcome.input = clone(loaded.input);
}

function projectValidation(value, label) {
  assert(value.accepted === false, `${label} accepted`);
  assert(isPlainObject(value.diagnostic), `${label} diagnostic`);
  return {
    accepted: false,
    ...clone(value.diagnostic),
    publicationCount: finiteNumber(value.publicationCount, `${label} publicationCount`),
    authoritativeSceneUnchanged: booleanValue(
      value.authoritativeSceneUnchanged,
      `${label} authoritativeSceneUnchanged`,
    ),
    beforeFingerprint: stringValue(value.beforeFingerprint, `${label} beforeFingerprint`),
    afterFingerprint: stringValue(value.afterFingerprint, `${label} afterFingerprint`),
  };
}

function projectColors(actual, execution) {
  const initialized = actionActualAt(execution, 0, 'initializeInstances');
  const resolvedA = actionActualAt(execution, 1, 'resolveColors');
  const resolvedB = actionActualAt(execution, 2, 'resolveColors');
  const matrix = actionActualAt(execution, 3, 'resolveColorInputMatrix');
  const missing = actionActualAt(execution, 4, 'resolveColor');
  assert(initialized.isolatedResolvers === true, 'DAT-004 isolated resolvers');
  assert(resolvedA.instanceId === 'A', 'DAT-004 A result');
  assert(resolvedB.instanceId === 'B', 'DAT-004 B result');
  assert(matrix.valueRef === 'colorInputMatrix', 'DAT-004 matrix result');
  assert(missing.accepted === false, 'DAT-004 missing path acceptance');
  assert(isPlainObject(missing.diagnostic), 'DAT-004 missing path diagnostic');

  actual.scene.revision = deriveSceneRevision(execution);
  actual.scene.A = { colors: clone(resolvedA.colors), theme: clone(resolvedA.theme) };
  actual.scene.B = { colors: clone(resolvedB.colors), theme: clone(resolvedB.theme) };
  actual.scene.colorInputs = {};
  actual.paint.colorInputs = {};
  actual.outcome.colorInputs = {
    callerValuesUnchanged: booleanValue(
      matrix.callerValuesUnchanged,
      'DAT-004 callerValuesUnchanged',
    ),
  };

  assert(isPlainObject(matrix.results), 'DAT-004 matrix results');
  for (const [id, result] of Object.entries(matrix.results)) {
    assert(isPlainObject(result), `DAT-004 matrix result ${id}`);
    if (result.applied === true) {
      actual.paint.colorInputs[id] = clone(result);
      continue;
    }
    assert(result.applied === false, `DAT-004 matrix result ${id} applied`);
    assert(isPlainObject(result.diagnostic), `DAT-004 matrix result ${id} diagnostic`);
    actual.outcome.colorInputs[id] = {
      applied: false,
      ...clone(result.diagnostic),
      publicationCount: finiteNumber(
        result.publicationCount,
        `DAT-004 matrix result ${id} publicationCount`,
      ),
      callerValueUnchanged: booleanValue(
        result.callerValueUnchanged,
        `DAT-004 matrix result ${id} callerValueUnchanged`,
      ),
      rejectedBeforeLossyConstruction: booleanValue(
        result.rejectedBeforeLossyConstruction,
        `DAT-004 matrix result ${id} lossy construction`,
      ),
    };
    actual.scene.colorInputs[id] = {
      authoritativeSceneUnchanged: booleanValue(
        matrix.authoritativeSceneUnchanged,
        `DAT-004 matrix result ${id} authoritativeSceneUnchanged`,
      ),
    };
  }

  const validation = {};
  assignNested(validation, String(missing.value).split('.'), {
    accepted: false,
    ...clone(missing.diagnostic),
    publicationCount: finiteNumber(missing.publicationCount, 'DAT-004 missing publicationCount'),
    authoritativeSceneUnchanged: booleanValue(
      missing.authoritativeSceneUnchanged,
      'DAT-004 missing authoritativeSceneUnchanged',
    ),
  }, 'DAT-004 validation');
  actual.outcome.validation = validation;

  if (hasZeroRenderCommands(execution, matrix, missing)) {
    actual.paint.commandCount = 0;
    actual.paint._availability.commandCount = 'derived-from-zero-engine-and-publications';
  } else {
    actual.paint._availability.commandCount = 'unavailable';
  }
}

function hasZeroRenderCommands(execution, matrix, missing) {
  if (execution.terminalSnapshot !== null || execution.cleanup.releases.length !== 0) return false;
  if (execution.eventJournal.length !== 0) return false;
  if (missing.publicationCount !== 0) return false;
  if (!isPlainObject(matrix.results)) return false;
  return Object.values(matrix.results).every(
    (result) => isPlainObject(result) && result.publicationCount === 0,
  );
}

function projectGrid(actual, execution) {
  const loaded = actionActualAt(execution, 0, 'loadGrid');
  const edges = actionActualAt(execution, 1, 'exerciseGridEdgeMatrix');
  const activated = actionActualAt(execution, 2, 'setGridCell');
  const deactivated = actionActualAt(execution, 3, 'setGridCell');
  assert(isPlainObject(loaded.grid), 'DAT-005 loaded grid');
  assert(isPlainObject(loaded.grid.cells), 'DAT-005 loaded cells');
  assert(isPlainObject(edges.edge), 'DAT-005 edge matrix');
  assert(activated.cellId === 'grid.0.1', 'DAT-005 activated cell');
  assert(deactivated.cellId === 'grid.0.1', 'DAT-005 deactivated cell');
  assert(isPlainObject(activated.current), 'DAT-005 activated current');
  assert(isPlainObject(deactivated.current), 'DAT-005 deactivated current');

  const cells = {};
  for (const [id, cell] of Object.entries(loaded.grid.cells)) {
    assignNested(cells, gridCellSegments(id), clone(cell), `DAT-005 cell ${id}`);
  }
  const toggled = readNested(cells, ['grid', '0', '1'], 'DAT-005 toggled cell');
  assert(isPlainObject(toggled), 'DAT-005 toggled cell object');
  toggled.afterActivate = clone(activated.current);
  toggled.afterDeactivate = clone(deactivated.current);

  actual.scene.revision = deriveSceneRevision(execution);
  actual.scene.grid = {
    activeIds: {
      initial: clone(loaded.grid.activeIds),
      afterActivate: clone(activated.grid?.activeIds),
      afterDeactivate: clone(deactivated.grid?.activeIds),
    },
    cells,
    edge: clone(edges.edge),
    localBounds: clone(deactivated.grid?.localBounds),
  };
  actual.scene.hierarchy = {
    nodeCount: nonNegativeInteger(
      deactivated.grid?.hierarchyNodeCount,
      'DAT-005 hierarchy nodeCount',
    ),
  };
  actual.geometry.finiteValueCount = nonNegativeInteger(
    deactivated.grid?.finiteValueCount,
    'DAT-005 finiteValueCount',
  );
  actual.outcome.input = {
    gridTemplate: clone(loaded.input?.gridTemplate),
    unchanged: booleanValue(deactivated.input?.unchanged, 'DAT-005 input unchanged'),
  };
  actual.outcome.determinism = clone(loaded.determinism);
}

function deriveSceneRevision(execution) {
  const revisions = execution.actionResults.map((result, index) =>
    nonNegativeInteger(result.delta.actual.sceneRevision, `execution action ${index} sceneRevision`));
  for (let index = 1; index < revisions.length; index += 1) {
    assert(revisions[index] >= revisions[index - 1], `execution sceneRevision regressed at action ${index}`);
  }
  return revisions.at(-1);
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
    assignOwned(result, capture.id, clone(capture.values), `capture ${capture.id}`);
  }
  assert(seen.size === declared.size, 'execution must contain every declared capture');
  return result;
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

function gridCellSegments(id) {
  assert(typeof id === 'string' && id.length > 0, 'grid cell ID');
  const segments = id.split('.');
  assert(segments.length === 3 && segments.every((segment) => segment.length > 0), `grid cell ID ${id}`);
  return segments;
}

function assignNested(target, segments, value, label) {
  assert(Array.isArray(segments) && segments.length > 0, `${label} path`);
  let cursor = target;
  for (const [index, segment] of segments.entries()) {
    assert(typeof segment === 'string' && segment.length > 0, `${label} segment ${index}`);
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

function readNested(value, segments, label) {
  let cursor = value;
  for (const segment of segments) {
    assert(isPlainObject(cursor) && Object.hasOwn(cursor, segment), `${label} missing ${segment}`);
    cursor = cursor[segment];
  }
  return cursor;
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

function finiteNumber(value, label) {
  assertFiniteNumber(value, label);
  return value;
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
  if (!condition) throw new Error(`Core v2 data-foundation fold invalid: ${message}`);
}
