import { clone, deepFreeze, createOrderedExactKeyAssertion } from '../value-atoms.mjs';

const assertExactKeys = createOrderedExactKeyAssertion(assert);

export const RENDER_BOUNDS_ACTION_TYPES = Object.freeze([
  'loadBoundsMatrix',
  'queryBounds',
  'hitTest',
  'destroyTarget',
]);

export const RENDER_BOUNDS_CASE_IDS = Object.freeze(['LAY-005']);

const CASE_TRACE = Object.freeze([
  action('loadBoundsMatrix', { datasetId: 'bounds' }),
  action('queryBounds', {
    targets: [
      'rotated',
      'flipped',
      'overflow-text',
      'hidden',
      'transparent-interactive',
      'zero-size',
    ],
  }),
  action('hitTest', { points: [[10, 10], [210, 10]] }),
  action('destroyTarget', { id: 'rotated' }),
]);

const HANDLERS = Object.freeze({
  loadBoundsMatrix: loadBoundsMatrixAction,
  queryBounds: queryBoundsAction,
  hitTest: hitTestAction,
  destroyTarget: destroyTargetAction,
});

/** Register LAY-005's expected-blind public Engine action surface. */
export function createRenderBoundsHandlerEntries() {
  return Object.freeze(RENDER_BOUNDS_ACTION_TYPES.map((type) => Object.freeze([
    `contract/${type}`,
    withContext(HANDLERS[type]),
  ])));
}

function withContext(handler) {
  return async (context, actionRecord) => {
    validateContext(context);
    assert(context.caseId === 'LAY-005', `unsupported case ${String(context.caseId)}`);
    assert(Number.isInteger(context.actionIndex), 'context actionIndex');
    const expectedAction = CASE_TRACE[context.actionIndex];
    assert(expectedAction !== undefined, `LAY-005 action ${context.actionIndex}`);
    assert(actionRecord.index === context.actionIndex, 'action index');
    assert(actionRecord.type === expectedAction.type, `action ${context.actionIndex} type`);
    assert(
      sameJson(actionRecord.operands, expectedAction.operands),
      `action ${context.actionIndex} operands`,
    );
    validateFixtureParams(context.fixtureParams);
    assert(!context.signal.aborted, 'action is aborted');
    return handler(context, actionRecord);
  };
}

async function loadBoundsMatrixAction(context, actionRecord) {
  const operands = exactOperands(actionRecord, ['datasetId']);
  const datasetId = stringValue(operands.datasetId, 'loadBoundsMatrix.datasetId');
  const engine = await ensureInitializedEngine(context);
  const dataset = await context.resolveDataset(datasetId);
  const beforeFingerprint = context.fingerprint(dataset);
  const loaded = await call(engine, 'loadDataset', dataset, { datasetRef: datasetId });
  await publish(engine, context);
  const afterFingerprint = context.fingerprint(dataset);
  return {
    actual: {
      datasetId,
      loaded: clone(loaded),
      input: {
        beforeFingerprint,
        afterFingerprint,
        unchanged: beforeFingerprint === afterFingerprint,
      },
      product: observeProduct(engine),
    },
  };
}

function queryBoundsAction(context, actionRecord) {
  const operands = exactOperands(actionRecord, ['targets']);
  const targets = stringArray(operands.targets, 'queryBounds.targets');
  assert(new Set(targets).size === targets.length, 'queryBounds targets must be unique');
  const engine = currentEngine(context, 'queryBounds');
  const product = observeProduct(engine);
  const geometry = requireGeometry(product.geometry, 'queryBounds geometry');
  const bounds = {};
  for (const target of targets) {
    assert(!Object.hasOwn(bounds, target), `duplicate bounds target ${target}`);
    bounds[target] = projectGeometryEntity(geometry, target);
  }
  return {
    actual: {
      targets,
      bounds,
      geometryRevision: finiteNumber(geometry.revision, 'geometry revision'),
      revisionLag: finiteNumber(geometry.revisionLag, 'geometry revisionLag'),
      product,
    },
  };
}

function hitTestAction(context, actionRecord) {
  const operands = exactOperands(actionRecord, ['points']);
  const points = pointArray(operands.points, 'hitTest.points');
  const engine = currentEngine(context, 'hitTest');
  const probes = points.map(([x, y]) => {
    const targetId = callSync(engine, 'hitTest', { x, y });
    assert(targetId === null || typeof targetId === 'string', 'hitTest result');
    return { point: [x, y], targetId };
  });
  return {
    actual: {
      probes,
      product: observeProduct(engine),
    },
  };
}

async function destroyTargetAction(context, actionRecord) {
  const operands = exactOperands(actionRecord, ['id']);
  const id = stringValue(operands.id, 'destroyTarget.id');
  const engine = currentEngine(context, 'destroyTarget');
  const before = observeProduct(engine);
  const removal = await call(engine, 'destroyTarget', { kind: 'element', id });
  assert(isRecord(removal), 'destroyTarget() result');
  assert(
    removal.status === 'committed',
    `destroyTarget() must commit, received ${String(removal.status)}`,
  );
  assert(removal.changed === true, 'destroyTarget() must report a change');
  await publish(engine, context);
  const semanticMatch = callSync(engine, 'query', { id });
  assert(semanticMatch === null || isRecord(semanticMatch), 'query() result');
  const after = observeProduct(engine);
  const geometry = requireGeometry(after.geometry, 'destroyTarget geometry');
  return {
    actual: {
      id,
      removal: clone(removal),
      query: {
        semanticCount: semanticMatch === null ? 0 : 1,
        geometryCount: geometry.entities.filter((entity) => entity.id === id).length,
      },
      before,
      after,
    },
  };
}

async function ensureInitializedEngine(context) {
  const engine = await context.ensureMainEngine();
  const snapshot = snapshotEngine(engine);
  if (snapshot.lifecycle === 'new') {
    await call(engine, 'initialize', {
      instanceId: 'lay-005-bounds-engine',
      width: 800,
      height: 600,
      pixelRatio: 1,
      strategy: 'mesh',
      preference: 'webgl',
    });
  } else {
    assert(
      snapshot.lifecycle === 'ready-empty',
      `bounds load requires new or ready-empty engine, received ${String(snapshot.lifecycle)}`,
    );
  }
  return engine;
}

async function publish(engine, context) {
  assert(!context.signal.aborted, 'action is aborted');
  const timeMs = context.clock.now();
  finiteNumber(timeMs, 'clock.now()');
  await call(engine, 'publishFrame', timeMs);
  assert(!context.signal.aborted, 'action is aborted');
}

function observeProduct(engine) {
  const snapshot = snapshotEngine(engine);
  const semanticProbe = callSync(engine, 'semanticProbe');
  const geometry = callSync(engine, 'geometryProbe');
  const dataset = callSync(engine, 'exportDataset');
  assert(isRecord(semanticProbe), 'semanticProbe() must return an object');
  requireGeometry(geometry, 'geometryProbe() result');
  assert(Array.isArray(dataset), 'exportDataset() must return an array');
  return clone({ snapshot, semanticProbe, geometry, dataset });
}

function projectGeometryEntity(geometry, target) {
  const matches = geometry.entities.filter((entity) => entity.id === target);
  assert(matches.length === 1, `${target} must resolve to exactly one geometry entity`);
  const entity = matches[0];
  assert(isRecord(entity), `${target} geometry entity`);
  return {
    id: stringValue(entity.id, `${target}.id`),
    kind: stringValue(entity.kind, `${target}.kind`),
    localBounds: boundsValue(entity.localBounds, `${target}.localBounds`),
    worldBounds: boundsValue(entity.worldBounds, `${target}.worldBounds`),
    screenBounds: boundsValue(entity.screenBounds, `${target}.screenBounds`),
    visibleBounds: entity.visibleBounds === null
      ? null
      : boundsValue(entity.visibleBounds, `${target}.visibleBounds`),
    visible: booleanValue(entity.visible, `${target}.visible`),
    interactive: booleanValue(entity.interactive, `${target}.interactive`),
    scaleX: finiteNumber(entity.scaleX, `${target}.scaleX`),
    scaleY: finiteNumber(entity.scaleY, `${target}.scaleY`),
  };
}

function requireGeometry(value, label) {
  assert(isRecord(value), `${label} must be an object`);
  finiteNumber(value.revision, `${label}.revision`);
  finiteNumber(value.revisionLag, `${label}.revisionLag`);
  assert(Array.isArray(value.entities), `${label}.entities`);
  return value;
}

function snapshotEngine(engine) {
  const snapshot = callSync(engine, 'snapshot');
  assert(isRecord(snapshot), 'snapshot() must return an object');
  return snapshot;
}

function currentEngine(context, operation) {
  const engine = context.currentMainEngine();
  assert(engine !== null && engine !== undefined, `${operation} requires a main engine`);
  return engine;
}

function validateFixtureParams(value) {
  const params = recordValue(value, 'fixture params');
  assert(sameJson(params.targets, CASE_TRACE[1].operands.targets), 'fixture targets');
  assert(sameJson(params.coordinateSpaces, ['local', 'world', 'screen']), 'coordinate spaces');
}

function validateContext(context) {
  assert(isRecord(context), 'context');
  assert(typeof context.ensureMainEngine === 'function', 'context.ensureMainEngine');
  assert(typeof context.currentMainEngine === 'function', 'context.currentMainEngine');
  assert(typeof context.resolveDataset === 'function', 'context.resolveDataset');
  assert(typeof context.fingerprint === 'function', 'context.fingerprint');
  assert(isRecord(context.clock) && typeof context.clock.now === 'function', 'context.clock');
  assert(isRecord(context.signal) && typeof context.signal.aborted === 'boolean', 'context.signal');
}

function exactOperands(actionRecord, keys) {
  assert(isRecord(actionRecord), 'action record');
  const operands = recordValue(actionRecord.operands, `${actionRecord.type} operands`);
  assertExactKeys(operands, keys, `${actionRecord.type} operands`);
  return operands;
}

async function call(target, method, ...args) {
  assert(isRecord(target), `${method} target`);
  const callable = target[method];
  assert(typeof callable === 'function', `Engine must expose ${method}()`);
  return callable.apply(target, args);
}

function callSync(target, method, ...args) {
  assert(isRecord(target), `${method} target`);
  const callable = target[method];
  assert(typeof callable === 'function', `Engine must expose ${method}()`);
  return callable.apply(target, args);
}

function action(type, operands) {
  return Object.freeze({ type, operands: deepFreeze(operands) });
}

function pointArray(value, label) {
  assert(Array.isArray(value), label);
  return value.map((point, index) => {
    assert(Array.isArray(point) && point.length === 2, `${label}[${index}]`);
    return [
      finiteNumber(point[0], `${label}[${index}][0]`),
      finiteNumber(point[1], `${label}[${index}][1]`),
    ];
  });
}

function boundsValue(value, label) {
  assert(Array.isArray(value) && value.length === 4, label);
  return value.map((entry, index) => finiteNumber(entry, `${label}[${index}]`));
}

function stringArray(value, label) {
  assert(Array.isArray(value), label);
  return value.map((entry, index) => stringValue(entry, `${label}[${index}]`));
}

function recordValue(value, label) {
  assert(isRecord(value), `${label} must be an object`);
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

function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), label);
  return value;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}


function assert(condition, message) {
  if (!condition) throw new Error(`Core v2 render-bounds handler invalid: ${message}`);
}
