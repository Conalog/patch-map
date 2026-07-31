import { clone } from './value-atoms.mjs';

export const RENDER_ORIENTATION_FOLD_REVISION = 'core-v2-render-orientation-fold/1';

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
  traceAction('loadOrientationMatrix', { itemId: 'item' }),
  traceAction('setWorldTransform', {
    rotationDegrees: 90,
    flipX: true,
    flipY: false,
  }),
  traceAction('setContentOrientation', { itemId: 'item', mode: 'upright' }),
  traceAction('observeOrientationMatrix', { valueRef: 'orientationMatrix' }),
]);

/** Fold LAY-004 public Engine evidence into the canonical fourteen domains. */
export function foldRenderOrientationExecution(options) {
  const input = validateOptions(options);
  const plan = validateCasePlan(input.casePlan);
  const execution = validateExecution(input.execution, plan);
  const transformed = actionActualAt(execution, 1, 'setWorldTransform');
  const oriented = actionActualAt(execution, 2, 'setContentOrientation');
  const observed = actionActualAt(execution, 3, 'observeOrientationMatrix');
  const matrix = orientationMatrix(observed.orientationMatrix, 'observed orientationMatrix');
  const repeated = orientationMatrix(
    observed.repeatOrientationMatrix,
    'observed repeatOrientationMatrix',
  );
  const authoredRows = authoredOrientationRows(plan.fixture.setup.params);
  const flipSweep = worldFlipSweep(
    observed.worldFlipSweep,
    plan.fixture.setup.params.worldFlips,
  );
  const inputUnchanged = booleanValue(
    recordValue(observed.input, 'orientation input').unchanged,
    'orientation input unchanged',
  );
  const descriptorsMatch = matrixDescriptorsMatch(matrix, authoredRows);
  const deterministic = booleanValue(observed.deterministic, 'orientation deterministic')
    && sameJson(matrix, repeated);
  const complete = booleanValue(observed.complete, 'orientation complete')
    && descriptorsMatch
    && matrix.length === authoredRows.length
    && inputUnchanged;

  const actual = {
    $schema: OBSERVATION_REVISION,
    case: projectCase(plan, execution),
    provenance: cloneRecord(input.provenance, 'provenance'),
    environment: cloneRecord(input.environment, 'environment'),
    revisions: projectRevisions(execution.terminalSnapshot),
    scene: projectScene(execution.terminalSnapshot),
    geometry: {
      _availability: { rendererOrientationProbe: 'available' },
      'follow-item': {
        screenAngle: {
          at90: normalizeNumber(
            recordValue(transformed.item, 'transformed item').screenAngle,
            'follow-item screen angle',
          ),
        },
      },
      finiteValueCount: countFiniteNumbers({
        transformed: transformed.item,
        oriented: oriented.item,
        matrix,
      }),
      orientationMatrix: matrix,
    },
    text: {
      _availability: { rendererOrientationProbe: 'available' },
      upright: {
        screenAngle: {
          at90: normalizeNumber(
            recordValue(oriented.item, 'oriented item').screenAngle,
            'upright screen angle',
          ),
        },
        visibleCenter: pointValue(
          recordValue(oriented.item, 'oriented item').visibleCenter,
          'upright visibleCenter',
        ),
      },
    },
    paint: notExercised('orientation-actions-do-not-observe-paint'),
    interaction: {
      _availability: {
        stableIdentity: 'available',
        terminalViewport: 'available',
      },
      modeChange: {
        identity: stringValue(
          recordValue(oriented.identity, 'mode change identity').after,
          'mode change after identity',
        ),
      },
      viewport: {
        scale: normalizeNumber(
          recordValue(execution.terminalSnapshot.viewport, 'terminal viewport').scale,
          'terminal viewport scale',
        ),
      },
    },
    events: {
      _availability: { eventJournal: 'available' },
      journal: clone(execution.eventJournal),
    },
    history: {
      _availability: { terminalSnapshot: 'available' },
      depth: nonNegativeInteger(
        execution.terminalSnapshot.historyDepth,
        'terminal history depth',
      ),
    },
    accessibility: notExercised('orientation-actions-do-not-observe-accessibility'),
    outcome: {
      _availability: {
        rendererOrientationProbe: 'available',
        actionResults: 'available',
      },
      matrix: {
        allAnglesFinite: everyOrientationValueFinite(matrix)
          && flipSweep.every(({ follow, upright }) => (
            everyOrientationValueFinite([follow, upright])
          )),
        allFlipCentersStable: allFlipCentersStable(matrix, authoredRows)
          && worldFlipSweepExact(flipSweep),
      },
      orientationMatrix: {
        allRowsExact: complete && deterministic,
      },
      actionResults: execution.actionResults.map((result) => ({
        index: result.index,
        type: result.type,
        status: result.status,
      })),
    },
    resources: {
      _availability: { cleanup: 'available', terminalSnapshot: 'available' },
      cleanup: clone(execution.cleanup),
      terminal: clone(execution.terminalSnapshot.resources),
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
    captures: projectCaptures(plan, execution),
  });
}

function validateOptions(options) {
  assert(isPlainObject(options), 'options must be a plain object');
  assertExactKeys(options, ['casePlan', 'execution', 'provenance', 'environment'], 'options');
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
  assert(casePlan.id === 'LAY-004', 'case ID');
  assert(casePlan.caseType === 'capability', 'caseType');
  assert(isPlainObject(casePlan.fixture), 'fixture');
  assert(isPlainObject(casePlan.fixture.setup), 'fixture setup');
  assert(isPlainObject(casePlan.fixture.setup.params), 'fixture params');
  assert(isPlainObject(casePlan.routeParams), 'routeParams');
  assert(typeof casePlan.routeParams.size === 'string', 'route size');
  assertUint32(casePlan.routeParams.seed, 'route seed');
  validateFixtureParams(casePlan.fixture.setup.params);

  const fixtureActions = casePlan.fixture.actionTrace;
  assert(Array.isArray(fixtureActions), 'fixture actionTrace');
  assert(Array.isArray(casePlan.actionTrace), 'materialized actionTrace');
  assert(sameJson(fixtureActions, casePlan.actionTrace), 'actionTrace drift');
  assert(fixtureActions.length === CASE_TRACE.length, 'action count');
  fixtureActions.forEach((action, index) => {
    const trace = CASE_TRACE[index];
    assert(isPlainObject(action), `action ${index}`);
    assertExactKeys(action, ['index', 'type', 'operands'], `action ${index}`);
    assert(action.index === index, `action ${index} index`);
    assert(action.type === trace.type, `action ${index} type`);
    assert(sameJson(action.operands, trace.operands), `action ${index} operands`);
  });
  const checkpoints = casePlan.fixture.captureCheckpoints;
  assert(Array.isArray(checkpoints), 'capture checkpoints');
  assert(sameJson(checkpoints, [{
    id: 'before',
    phase: 'after-action',
    afterActionIndex: 0,
    paths: ['item/id'],
  }]), 'capture checkpoint drift');
  const cleanupTrace = casePlan.fixture.cleanupTrace;
  assert(sameJson(cleanupTrace, [{
    type: 'destroy-case',
    operands: { expectedResourceDelta: 0 },
  }]), 'cleanup trace drift');
  return { ...casePlan, actionTrace: fixtureActions, checkpoints, cleanupTrace };
}

function validateFixtureParams(value) {
  const params = recordValue(value, 'fixture params');
  assert(sameJson(params.declaredTargetIds, ['item']), 'declared target IDs');
  const item = recordValue(params.item, 'fixture item');
  assert(item.id === 'item', 'fixture item ID');
  pointValue(item.center, 'fixture item center');
  assert(Array.isArray(item.angles), 'fixture item angles');
  item.angles.forEach((angle, index) => finiteNumber(angle, `fixture item angle ${index}`));
  assert(sameJson(params.modes, ['follow-item', 'upright']), 'fixture modes');
  assert(sameJson(params.worldFlips, ['none', 'x', 'y', 'xy']), 'fixture world flips');
  const rows = authoredOrientationRows(params);
  assert(rows.length > 0, 'orientation rows');
  assert(new Set(rows.map(({ id }) => id)).size === rows.length, 'orientation row IDs unique');
}

function authoredOrientationRows(params) {
  assert(Array.isArray(params.orientationMatrix), 'fixture orientationMatrix');
  return params.orientationMatrix.map((entry, index) => {
    const row = recordValue(entry, `fixture orientation row ${index}`);
    const scale = pointValue(row.scale, `fixture orientation row ${index} scale`);
    const mode = stringValue(row.mode, `fixture orientation row ${index} mode`);
    assert(mode === 'follow-item' || mode === 'upright', `fixture orientation row ${index} mode`);
    return {
      id: stringValue(row.id, `fixture orientation row ${index} id`),
      kind: stringValue(row.kind, `fixture orientation row ${index} kind`),
      mode,
      groupAngle: finiteNumber(row.groupAngle, `fixture orientation row ${index} groupAngle`),
      itemAngle: finiteNumber(row.itemAngle, `fixture orientation row ${index} itemAngle`),
      worldAngle: finiteNumber(row.worldAngle, `fixture orientation row ${index} worldAngle`),
      scale,
    };
  });
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
    assert(isPlainObject(result), `result ${index}`);
    assert(result.index === index, `result ${index} index`);
    assert(result.type === trace.type, `result ${index} type`);
    assert(result.handlerId === `contract/${trace.type}`, `result ${index} handlerId`);
    assert(result.status === 'completed', `result ${index} status`);
    assertFiniteNumber(result.startedAtMs, `result ${index} startedAtMs`);
    assertFiniteNumber(result.completedAtMs, `result ${index} completedAtMs`);
    assert(result.completedAtMs >= result.startedAtMs, `result ${index} timing`);
    assert(isPlainObject(result.delta), `result ${index} delta`);
    assert(result.delta.$schema === DELTA_REVISION, `result ${index} delta schema`);
    assert(result.delta.caseId === plan.id, `result ${index} delta caseId`);
    assert(result.delta.actionIndex === index, `result ${index} delta index`);
    assert(result.delta.actionType === trace.type, `result ${index} delta type`);
    assert(isPlainObject(result.delta.actual), `result ${index} actual`);
    assert(isPlainObject(result.delta.semanticProbe), `result ${index} semanticProbe`);
  });
  assert(Array.isArray(execution.eventJournal), 'eventJournal');
  assert(Array.isArray(execution.eventJournalFailures), 'eventJournalFailures');
  assert(execution.eventJournalFailures.length === 0, 'event journal failures');
  assert(Array.isArray(execution.captures), 'captures');
  assert(isPlainObject(execution.bindings), 'bindings');
  assert(Object.keys(execution.bindings).length === 0, 'unexpected bindings');
  assert(isPlainObject(execution.terminalSnapshot), 'terminalSnapshot');
  assert(isPlainObject(execution.terminalSemanticProbe), 'terminalSemanticProbe');
  assert(isPlainObject(execution.cleanup), 'cleanup');
  assert(execution.cleanup.status === 'completed', 'cleanup status');
  assert(Array.isArray(execution.cleanup.errors) && execution.cleanup.errors.length === 0, 'cleanup errors');
  assert(sameJson(execution.cleanup.declaredActions, ['destroy-case']), 'cleanup declared actions');
  assert(Array.isArray(execution.cleanup.releases), 'cleanup releases');
  assert(execution.cleanup.releases.length > 0, 'cleanup release count');
  const expectedResourceDelta = plan.cleanupTrace[0].operands.expectedResourceDelta;
  assert(execution.cleanup.releases.every((release, index) => {
    const remaining = recordValue(release.remainingResources, `cleanup release ${index} resources`);
    return ['canvasCount', 'subscriptions', 'pendingWork'].every((field) => (
      nonNegativeInteger(remaining[field], `cleanup release ${index} ${field}`)
        === expectedResourceDelta
    ));
  }), 'cleanup resource delta');
  return execution;
}

function projectRevisions(snapshot) {
  const revisions = recordValue(snapshot.revisions, 'snapshot revisions');
  return {
    _availability: { terminalSnapshot: 'available' },
    scene: finiteNumber(revisions.sceneRevision, 'scene revision'),
    view: finiteNumber(revisions.viewRevision, 'view revision'),
    interaction: finiteNumber(revisions.interactionRevision, 'interaction revision'),
    frame: { revision: finiteNumber(snapshot.frameRevision, 'frame revision') },
    publishedTuple: cloneRecord(snapshot.publishedTuple, 'published tuple'),
  };
}

function projectScene(snapshot) {
  return {
    _availability: { terminalSnapshot: 'available' },
    revision: finiteNumber(
      recordValue(snapshot.revisions, 'snapshot revisions').sceneRevision,
      'scene revision',
    ),
    rootIds: cloneArray(snapshot.rootIds, 'root IDs'),
  };
}

function projectCase(plan, execution) {
  return {
    id: plan.id,
    caseType: plan.caseType,
    params: cloneRecord(plan.routeParams, 'route params'),
    ...(typeof plan.fixtureSha256 === 'string' ? { fixtureSha256: plan.fixtureSha256 } : {}),
    ...(typeof plan.rootTestId === 'string' ? { rootTestId: plan.rootTestId } : {}),
    executedActions: execution.actionResults.map((result) => ({
      index: result.index,
      type: result.type,
      status: result.status,
    })),
  };
}

function projectFixtures(plan) {
  const params = plan.fixture.setup.params;
  return {
    declaredTargetIds: clone(params.declaredTargetIds),
    item: clone(params.item),
    modes: clone(params.modes),
    worldFlips: clone(params.worldFlips),
    orientationMatrix: authoredOrientationRows(params),
  };
}

function projectCaptures(plan, execution) {
  assert(execution.captures.length === plan.checkpoints.length, 'capture count');
  const projected = {};
  execution.captures.forEach((capture, index) => {
    const checkpoint = plan.checkpoints[index];
    assert(isPlainObject(capture), `capture ${index}`);
    assert(capture.id === checkpoint.id, `capture ${index} ID`);
    assert(capture.phase === checkpoint.phase, `capture ${index} phase`);
    assert(capture.afterActionIndex === checkpoint.afterActionIndex, `capture ${index} action index`);
    const values = recordValue(capture.values, `capture ${index} values`);
    assertExactKeys(values, checkpoint.paths, `capture ${index} values`);
    const nested = {};
    checkpoint.paths.forEach((path) => {
      assignPath(nested, path.split('/'), clone(values[path]), `capture ${capture.id}`);
    });
    assignOwned(projected, capture.id, nested, `capture ${capture.id}`);
  });
  return projected;
}

function matrixDescriptorsMatch(matrix, authoredRows) {
  if (matrix.length !== authoredRows.length) return false;
  return matrix.every((row, index) => {
    const authored = authoredRows[index];
    return row.id === authored.id && row.kind === authored.kind && row.mode === authored.mode;
  });
}

function everyOrientationValueFinite(matrix) {
  return matrix.every((row) => (
    row.screenBasis.every(Number.isFinite) && row.visibleCenter.every(Number.isFinite)
  ));
}

function allFlipCentersStable(matrix, authoredRows) {
  if (matrix.length === 0) return false;
  const baseline = matrix[0].visibleCenter;
  return authoredRows.every((row, index) => {
    if (row.scale[0] >= 0 && row.scale[1] >= 0) return true;
    return sameJson(matrix[index]?.visibleCenter, baseline);
  });
}

function worldFlipSweep(value, declaredModes) {
  assert(Array.isArray(value), 'world flip sweep');
  assert(Array.isArray(declaredModes), 'declared world flip modes');
  assert(value.length === declaredModes.length, 'world flip sweep count');
  return value.map((entry, index) => {
    const row = recordValue(entry, `world flip sweep ${index}`);
    assertExactKeys(row, ['mode', 'transform', 'state', 'follow', 'upright'], `world flip sweep ${index}`);
    const mode = stringValue(row.mode, `world flip sweep ${index} mode`);
    assert(mode === declaredModes[index], `world flip sweep ${index} order`);
    const expectedTransform = worldTransformForMode(mode);
    assert(sameJson(row.transform, expectedTransform), `world flip sweep ${index} transform`);
    assert(sameJson(row.state, expectedTransform), `world flip sweep ${index} state`);
    return {
      mode,
      follow: orientationSweepEntity(row.follow, `world flip sweep ${index} follow`),
      upright: orientationSweepEntity(row.upright, `world flip sweep ${index} upright`),
    };
  });
}

function orientationSweepEntity(value, label) {
  const entity = recordValue(value, label);
  return {
    screenBasis: basisValue(entity.screenBasis, `${label}.screenBasis`),
    visibleCenter: pointValue(entity.visibleCenter, `${label}.visibleCenter`),
  };
}

function worldFlipSweepExact(sweep) {
  const baseline = sweep.find(({ mode }) => mode === 'none');
  if (baseline === undefined) return false;
  return sweep.every(({ mode, follow, upright }) => {
    const expectedFollow = multiplyBasis(scaleBasisForMode(mode), baseline.follow.screenBasis);
    return sameJson(follow.visibleCenter, baseline.follow.visibleCenter)
      && sameJson(upright.visibleCenter, baseline.upright.visibleCenter)
      && basisNear(follow.screenBasis, expectedFollow)
      && isReadableBasis(upright.screenBasis);
  });
}

function isReadableBasis(basis) {
  const determinant = basis[0] * basis[3] - basis[1] * basis[2];
  if (!(determinant > 0)) return false;
  if (basis[0] > 1e-5) return true;
  if (basis[0] < -1e-5) return false;
  return basis[1] < 0;
}

function worldTransformForMode(mode) {
  assert(mode === 'none' || mode === 'x' || mode === 'y' || mode === 'xy', 'world flip mode');
  return {
    rotationDegrees: CASE_TRACE[1].operands.rotationDegrees,
    flipX: mode === 'x' || mode === 'xy',
    flipY: mode === 'y' || mode === 'xy',
  };
}

function scaleBasisForMode(mode) {
  return [mode === 'x' || mode === 'xy' ? -1 : 1, 0, 0, mode === 'y' || mode === 'xy' ? -1 : 1];
}

function multiplyBasis(left, right) {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
  ];
}

function basisNear(actual, expected) {
  return actual.length === expected.length
    && actual.every((value, index) => Math.abs(value - expected[index]) <= 1e-5);
}

function orientationMatrix(value, label) {
  assert(Array.isArray(value), label);
  return value.map((entry, index) => {
    const row = recordValue(entry, `${label}[${index}]`);
    assertExactKeys(row, ['id', 'kind', 'mode', 'screenBasis', 'visibleCenter'], `${label}[${index}]`);
    const mode = stringValue(row.mode, `${label}[${index}].mode`);
    assert(mode === 'follow-item' || mode === 'upright', `${label}[${index}].mode`);
    return {
      id: stringValue(row.id, `${label}[${index}].id`),
      kind: stringValue(row.kind, `${label}[${index}].kind`),
      mode,
      screenBasis: basisValue(row.screenBasis, `${label}[${index}].screenBasis`),
      visibleCenter: pointValue(row.visibleCenter, `${label}[${index}].visibleCenter`),
    };
  });
}

function actionActualAt(execution, index, type) {
  const result = execution.actionResults[index];
  assert(result?.type === type, `action ${index} must be ${type}`);
  return result.delta.actual;
}

function basisValue(value, label) {
  assert(Array.isArray(value) && value.length === 4, label);
  return value.map((entry, index) => normalizeNumber(entry, `${label}[${index}]`));
}

function pointValue(value, label) {
  assert(Array.isArray(value) && value.length === 2, label);
  return value.map((entry, index) => normalizeNumber(entry, `${label}[${index}]`));
}

function countFiniteNumbers(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? 1 : 0;
  if (Array.isArray(value)) return value.reduce((sum, entry) => sum + countFiniteNumbers(entry), 0);
  if (!isPlainObject(value)) return 0;
  return Object.values(value).reduce((sum, entry) => sum + countFiniteNumbers(entry), 0);
}

function normalizeNumber(value, label) {
  const numeric = finiteNumber(value, label);
  const rounded = Math.round(numeric * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function traceAction(type, operands) {
  return Object.freeze({ type, operands: deepFreeze(operands) });
}

function notExercised(reason) {
  return { _availability: { status: 'not-exercised', reason } };
}

function cloneRecord(value, label) {
  assert(isPlainObject(value), `${label} must be a plain object`);
  return clone(value);
}

function cloneArray(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
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
  assertFiniteNumber(value, label);
  return value;
}

function assertFiniteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), label);
}

function assertUint32(value, label) {
  assert(Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff, label);
}

function assertExactKeys(value, keys, label) {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) assert(allowed.has(key), `${label} unknown key ${key}`);
  for (const key of keys) assert(Object.hasOwn(value, key), `${label} missing key ${key}`);
}

function assignOwned(target, key, value, label) {
  assert(!Object.hasOwn(target, key), `${label} duplicate key ${key}`);
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

function assignPath(target, segments, value, label) {
  let cursor = target;
  segments.forEach((segment, index) => {
    assert(segment.length > 0, `${label} empty path segment`);
    if (index === segments.length - 1) {
      assignOwned(cursor, segment, value, label);
      return;
    }
    if (!Object.hasOwn(cursor, segment)) assignOwned(cursor, segment, {}, label);
    cursor = recordValue(cursor[segment], `${label} path ${segment}`);
  });
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function escapePointer(value) {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Core v2 render-orientation fold invalid: ${message}`);
}
