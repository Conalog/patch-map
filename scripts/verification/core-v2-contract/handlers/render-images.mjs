import { clone, deepFreeze } from '../value-atoms.mjs';

export const RENDER_IMAGES_HANDLER_REVISION = 'core-v2-render-images-handlers/1';

const CASE_TRACE = Object.freeze([
  traceAction('loadDataset', { datasetId: 'image-specimens' }),
  traceAction('resolveAsset', {
    targetId: 'descriptor',
    requestId: 'old',
    completeAtMs: 100,
  }),
  traceAction('replaceSource', {
    targetId: 'descriptor',
    source: 'fixture-image',
    timeMs: 20,
  }),
  traceAction('completeAsset', { requestId: 'old', timeMs: 100 }),
]);

const ACTION_TYPES = Object.freeze(CASE_TRACE.map(({ type }) => type));

/** Browser-safe, expected-blind REN-005 action handlers. */
export function createRenderImageHandlerEntries(product) {
  const adapter = validateProduct(product);
  const states = new WeakMap();
  const handlers = Object.freeze({
    loadDataset: withState(adapter, states, loadDatasetAction),
    resolveAsset: withState(adapter, states, resolveAssetAction),
    replaceSource: withState(adapter, states, replaceSourceAction),
    completeAsset: withState(adapter, states, completeAssetAction),
  });
  return Object.freeze(ACTION_TYPES.map((type) => Object.freeze([
    `contract/${type}`,
    handlers[type],
  ])));
}

function withState(adapter, states, handler) {
  return async (context, actionRecord) => {
    validateContext(context);
    assert(context.caseId === 'REN-005', `unsupported case ${String(context.caseId)}`);
    assert(Number.isInteger(context.actionIndex), 'context actionIndex');
    const trace = CASE_TRACE[context.actionIndex];
    assert(trace !== undefined, `REN-005 action ${context.actionIndex}`);
    assert(actionRecord.index === context.actionIndex, 'action index');
    assert(actionRecord.type === trace.type, `action ${context.actionIndex} type`);
    assert(sameJson(actionRecord.operands, trace.operands), `action ${context.actionIndex} operands`);
    const fixture = validateFixtureParams(context.fixtureParams);
    assert(!context.signal.aborted, 'action is aborted');

    let state = states.get(context.resolveDataset);
    if (state === undefined) {
      state = {
        engine: null,
        datasetId: null,
        inputFingerprint: null,
        requests: new Set(),
      };
      states.set(context.resolveDataset, state);
    }
    return handler(adapter, state, context, actionRecord, fixture);
  };
}

async function loadDatasetAction(adapter, state, context, actionRecord) {
  const operands = exactOperands(actionRecord, ['datasetId']);
  const datasetId = stringValue(operands.datasetId, 'loadDataset.datasetId');
  assert(datasetId === 'image-specimens', 'REN-005 dataset identity');
  assert(state.engine === null, 'REN-005 dataset loads once per execution');
  const engine = await ensureInitializedEngine(context);
  state.engine = engine;
  state.datasetId = datasetId;
  const registration = await adapter.registerFixtureAssets(engine);
  const dataset = await context.resolveDataset(datasetId);
  const beforeFingerprint = context.fingerprint(dataset);
  state.inputFingerprint = beforeFingerprint;
  const loaded = await call(engine, 'loadDataset', dataset, { datasetRef: datasetId });
  await adapter.settleImmediateAssets();
  await publish(engine, context);
  const afterFingerprint = context.fingerprint(dataset);
  const product = observeProduct(engine, adapter);
  return {
    actual: {
      datasetId,
      registration: clone(registration),
      loaded: clone(loaded),
      input: {
        beforeFingerprint,
        afterFingerprint,
        unchanged: beforeFingerprint === afterFingerprint,
      },
      product,
    },
  };
}

async function resolveAssetAction(adapter, state, context, actionRecord) {
  const operands = exactOperands(actionRecord, ['targetId', 'requestId', 'completeAtMs']);
  const targetId = stringValue(operands.targetId, 'resolveAsset.targetId');
  const requestId = stringValue(operands.requestId, 'resolveAsset.requestId');
  const completeAtMs = finiteNumber(operands.completeAtMs, 'resolveAsset.completeAtMs');
  assert(!state.requests.has(requestId), `duplicate controlled request ${requestId}`);
  const engine = currentEngine(state, 'resolveAsset');
  const request = await adapter.bindControlledRequest({ targetId, requestId, completeAtMs });
  state.requests.add(requestId);
  return {
    actual: {
      targetId,
      requestId,
      completeAtMs,
      request: clone(request),
      product: observeProduct(engine, adapter),
    },
  };
}

async function replaceSourceAction(adapter, state, context, actionRecord) {
  const operands = exactOperands(actionRecord, ['targetId', 'source', 'timeMs']);
  const targetId = stringValue(operands.targetId, 'replaceSource.targetId');
  const source = stringValue(operands.source, 'replaceSource.source');
  const timeMs = finiteNumber(operands.timeMs, 'replaceSource.timeMs');
  await advanceClock(context, timeMs);
  const engine = currentEngine(state, 'replaceSource');
  const before = observeProduct(engine, adapter);
  const mutation = await call(engine, 'patch', { kind: 'element', id: targetId }, { source });
  assert(isRecord(mutation) && mutation.status === 'committed', 'replaceSource patch must commit');
  await adapter.settleImmediateAssets();
  await publish(engine, context);
  const after = observeProduct(engine, adapter);
  return {
    actual: {
      targetId,
      source,
      timeMs,
      mutation: clone(mutation),
      before,
      after,
    },
  };
}

async function completeAssetAction(adapter, state, context, actionRecord) {
  const operands = exactOperands(actionRecord, ['requestId', 'timeMs']);
  const requestId = stringValue(operands.requestId, 'completeAsset.requestId');
  const timeMs = finiteNumber(operands.timeMs, 'completeAsset.timeMs');
  assert(state.requests.has(requestId), `unknown controlled request ${requestId}`);
  await advanceClock(context, timeMs);
  const engine = currentEngine(state, 'completeAsset');
  const completion = await adapter.completeControlledRequest({ requestId, timeMs });
  await adapter.settleImmediateAssets();
  await publish(engine, context);
  const product = observeProduct(engine, adapter);
  const descriptor = geometryEntity(product.geometry, 'descriptor');
  return {
    actual: {
      requestId,
      timeMs,
      completion: clone(completion),
      product,
    },
    captureSource: {
      descriptor: { worldBounds: clone(descriptor.worldBounds) },
    },
  };
}

async function ensureInitializedEngine(context) {
  const engine = await context.ensureMainEngine();
  const snapshot = snapshotEngine(engine);
  if (snapshot.lifecycle === 'new') {
    await call(engine, 'initialize', {
      instanceId: 'ren-005-images-engine',
      width: 800,
      height: 600,
      pixelRatio: 1,
      strategy: 'mesh',
      preference: 'webgl',
    });
  } else {
    assert(snapshot.lifecycle === 'ready-empty', 'REN-005 requires a new or empty engine');
  }
  return engine;
}

function observeProduct(engine, adapter) {
  const snapshot = snapshotEngine(engine);
  const semanticProbe = callSync(engine, 'semanticProbe');
  const geometry = callSync(engine, 'geometryProbe');
  const imageProbe = callSync(engine, 'sceneImageProbe');
  const dataset = callSync(engine, 'exportDataset');
  assert(isRecord(semanticProbe), 'semanticProbe() result');
  assert(isRecord(geometry) && Array.isArray(geometry.entities), 'geometryProbe() result');
  assert(isRecord(imageProbe) && isRecord(imageProbe.images), 'sceneImageProbe() result');
  assert(Array.isArray(dataset), 'exportDataset() result');

  const hidden = geometryEntity(geometry, 'hidden-image');
  const failed = geometryEntity(geometry, 'failed-image');
  const hiddenPoint = boundsCenter(hidden.worldBounds, 'hidden-image worldBounds');
  const failedPoint = boundsCenter(failed.worldBounds, 'failed-image worldBounds');
  const hiddenHit = callSync(engine, 'hitTest', pointRecord(hiddenPoint));
  const failedHit = callSync(engine, 'hitTest', pointRecord(failedPoint));
  assert(hiddenHit === null || typeof hiddenHit === 'string', 'hidden hit result');
  assert(failedHit === null || typeof failedHit === 'string', 'failed hit result');
  return clone({
    snapshot,
    semanticProbe,
    geometry,
    imageProbe,
    dataset,
    hits: {
      hidden: { point: hiddenPoint, target: hiddenHit },
      failed: { point: failedPoint, target: failedHit },
    },
    requests: adapter.requestProbe(),
  });
}

function geometryEntity(geometry, id) {
  const matches = geometry.entities.filter((entity) => isRecord(entity) && entity.id === id);
  assert(matches.length === 1, `${id} geometry identity`);
  const entity = matches[0];
  boundsValue(entity.worldBounds, `${id}.worldBounds`);
  return entity;
}

function boundsCenter(value, label) {
  const [x, y, width, height] = boundsValue(value, label);
  return [x + width / 2, y + height / 2];
}

function pointRecord(point) {
  return { x: point[0], y: point[1] };
}

async function publish(engine, context) {
  assert(!context.signal.aborted, 'action is aborted');
  await call(engine, 'publishFrame', context.clock.now());
  assert(!context.signal.aborted, 'action is aborted');
}

async function advanceClock(context, timeMs) {
  assert(typeof context.clock.advanceTo === 'function', 'manual clock advanceTo');
  await context.clock.advanceTo(timeMs);
  assert(context.clock.now() === timeMs, 'manual clock milestone');
}

function currentEngine(state, operation) {
  assert(state.engine !== null, `${operation} requires the loaded main engine`);
  return state.engine;
}

function validateProduct(product) {
  assert(isRecord(product), 'render image product adapter');
  for (const method of [
    'registerFixtureAssets',
    'settleImmediateAssets',
    'bindControlledRequest',
    'completeControlledRequest',
    'requestProbe',
  ]) {
    assert(typeof product[method] === 'function', `product.${method}`);
  }
  return product;
}

function validateFixtureParams(value) {
  const params = recordValue(value, 'fixture params');
  assertExactKeys(params, ['images'], 'fixture params');
  assert(Array.isArray(params.images) && params.images.length === 7, 'fixture image count');
  const ids = params.images.map((value, index) => {
    const image = recordValue(value, `fixture image ${index}`);
    return stringValue(image.id, `fixture image ${index} id`);
  });
  assert(new Set(ids).size === ids.length, 'fixture image IDs');
  for (const id of ['alias', 'url', 'descriptor', 'data-uri', 'transformed', 'hidden-image', 'failed-image']) {
    assert(ids.includes(id), `fixture image ${id}`);
  }
  return { ids };
}

function validateContext(context) {
  assert(isRecord(context), 'context');
  assert(typeof context.ensureMainEngine === 'function', 'context.ensureMainEngine');
  assert(typeof context.resolveDataset === 'function', 'context.resolveDataset');
  assert(typeof context.fingerprint === 'function', 'context.fingerprint');
  assert(isRecord(context.clock) && typeof context.clock.now === 'function', 'context.clock');
  assert(isRecord(context.signal) && typeof context.signal.aborted === 'boolean', 'context.signal');
}

function snapshotEngine(engine) {
  const snapshot = callSync(engine, 'snapshot');
  assert(isRecord(snapshot), 'snapshot() result');
  return snapshot;
}

async function call(target, method, ...args) {
  assert(isRecord(target), `${method} target`);
  const callable = target[method];
  assert(typeof callable === 'function', `${method}() must exist`);
  return callable.apply(target, args);
}

function callSync(target, method, ...args) {
  assert(isRecord(target), `${method} target`);
  const callable = target[method];
  assert(typeof callable === 'function', `${method}() must exist`);
  const result = callable.apply(target, args);
  assert(!(result instanceof Promise), `${method}() must be synchronous`);
  return result;
}

function exactOperands(actionRecord, keys) {
  const operands = recordValue(actionRecord.operands, `${actionRecord.type} operands`);
  assertExactKeys(operands, keys, `${actionRecord.type} operands`);
  return operands;
}

function traceAction(type, operands) {
  return Object.freeze({ type, operands: deepFreeze(operands) });
}

function recordValue(value, label) {
  assert(isRecord(value), `${label} must be an object`);
  return value;
}

function boundsValue(value, label) {
  assert(Array.isArray(value) && value.length === 4, `${label} bounds`);
  value.forEach((entry, index) => finiteNumber(entry, `${label}[${index}]`));
  return value;
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} must be a non-empty string`);
  return value;
}

function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} must be finite`);
  return value;
}

function assertExactKeys(value, keys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  assert(sameJson(actual, expected), `${label} keys`);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}


function assert(condition, message) {
  if (!condition) throw new Error(`Core v2 REN-005 handler invalid: ${message}`);
}
