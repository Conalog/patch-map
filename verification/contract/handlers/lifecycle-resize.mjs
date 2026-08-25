import { clone } from '../value-atoms.mjs';

export const LIFECYCLE_RESIZE_ACTION_TYPES = Object.freeze([
  'loadDataset',
  'set-view',
  'select',
  'resizeHost',
  'publishFrame',
  'hitTest',
  'convertScreenToWorld',
]);

const HANDLERS = Object.freeze({
  loadDataset: loadDatasetAction,
  'set-view': setViewAction,
  select: selectAction,
  resizeHost: resizeHostAction,
  publishFrame: publishFrameAction,
  hitTest: hitTestAction,
  convertScreenToWorld: convertScreenToWorldAction,
});

/**
 * Register the exact LIF-004 product action surface. The module is deliberately
 * import-free: the execution worker supplies the authoritative engine so the
 * same handlers run in Node, the focused Lab, and a packed browser consumer.
 */
export function createLifecycleResizeHandlerEntries() {
  return Object.freeze(LIFECYCLE_RESIZE_ACTION_TYPES.map((type) => Object.freeze([
    `contract/${type}`,
    withContext(HANDLERS[type]),
  ])));
}

function withContext(handler) {
  return async (context, action) => {
    validateContext(context);
    assert(context.caseId === 'LIF-004', `unsupported case ${String(context.caseId)}`);
    return handler(context, action);
  };
}

async function loadDatasetAction(context, action) {
  const operands = exactOperands(action, ['datasetRef', 'timeMs']);
  const datasetRef = stringValue(operands.datasetRef, 'loadDataset.datasetRef');
  const timeMs = finiteNumber(operands.timeMs, 'loadDataset.timeMs');
  const params = recordValue(context.fixtureParams, 'fixture params');
  const [width, height] = positivePair(params.initialHostCssPx, 'fixture initialHostCssPx');
  const pixelRatio = positiveNumber(params.devicePixelRatio, 'fixture devicePixelRatio');
  await advanceTo(context, timeMs);

  const engine = await context.ensureMainEngine();
  const before = snapshotEngine(engine);
  let initialized = null;
  if (before.lifecycle === 'new') {
    initialized = await call(engine, 'initialize', {
      instanceId: `${context.caseId.toLowerCase()}-engine`,
      width,
      height,
      pixelRatio,
      strategy: 'mesh',
      preference: 'webgl',
    });
  }
  const dataset = await context.resolveDataset(datasetRef);
  const beforeFingerprint = context.fingerprint(dataset);
  const loaded = await call(engine, 'loadDataset', dataset, { datasetRef });
  const afterFingerprint = context.fingerprint(dataset);
  const snapshot = snapshotEngine(engine);

  return {
    actual: {
      datasetRef,
      loadedAtMs: timeMs,
      initialized: clone(initialized),
      loaded: clone(loaded),
      input: {
        beforeFingerprint,
        afterFingerprint,
        unchanged: beforeFingerprint === afterFingerprint,
      },
      snapshot,
    },
    captureSource: snapshot,
  };
}

async function setViewAction(context, action) {
  const operands = exactOperands(action, ['centerWorld', 'scale']);
  const centerWorld = finitePair(operands.centerWorld, 'set-view.centerWorld');
  const scale = positiveNumber(operands.scale, 'set-view.scale');
  const engine = currentEngine(context, 'set-view');
  const viewport = await call(engine, 'setViewport', { centerWorld, scale });
  const snapshot = snapshotEngine(engine);
  return {
    actual: {
      requested: { centerWorld: clone(centerWorld), scale },
      viewport: clone(viewport),
      snapshot,
    },
    captureSource: snapshot,
  };
}

async function selectAction(context, action) {
  const operands = exactOperands(action, ['ids']);
  const ids = stringArray(operands.ids, 'select.ids');
  const engine = currentEngine(context, 'select');
  const selectedIds = await call(engine, 'select', ids);
  const snapshot = snapshotEngine(engine);
  return {
    actual: {
      requestedIds: clone(ids),
      selectedIds: clone(selectedIds),
      snapshot,
    },
    captureSource: snapshot,
  };
}

async function resizeHostAction(context, action) {
  const operands = exactOperands(action, [
    'devicePixelRatio',
    'heightCssPx',
    'timeMs',
    'widthCssPx',
  ]);
  const widthCssPx = positiveNumber(operands.widthCssPx, 'resizeHost.widthCssPx');
  const heightCssPx = positiveNumber(operands.heightCssPx, 'resizeHost.heightCssPx');
  const devicePixelRatio = positiveNumber(
    operands.devicePixelRatio,
    'resizeHost.devicePixelRatio',
  );
  const timeMs = finiteNumber(operands.timeMs, 'resizeHost.timeMs');
  await advanceTo(context, timeMs);
  const engine = currentEngine(context, 'resizeHost');
  const changed = await call(engine, 'resize', widthCssPx, heightCssPx, devicePixelRatio);
  assert(typeof changed === 'boolean', 'resize() must return a boolean');
  const snapshot = snapshotEngine(engine);
  return {
    actual: {
      requestedAtMs: timeMs,
      requested: { widthCssPx, heightCssPx, devicePixelRatio },
      changed,
      snapshot,
    },
    captureSource: snapshot,
  };
}

async function publishFrameAction(context, action) {
  const operands = exactOperands(action, ['timeMs']);
  const timeMs = finiteNumber(operands.timeMs, 'publishFrame.timeMs');
  await advanceTo(context, timeMs);
  const engine = currentEngine(context, 'publishFrame');
  await call(engine, 'publishFrame', timeMs);
  const snapshot = snapshotEngine(engine);
  const geometry = geometryProbe(engine);
  return {
    actual: { publishedAtMs: timeMs, snapshot, geometry },
    captureSource: snapshot,
  };
}

async function hitTestAction(context, action) {
  const operands = exactOperands(action, ['points']);
  const points = pointArray(operands.points, 'hitTest.points');
  const engine = currentEngine(context, 'hitTest');
  const results = [];
  for (const point of points) {
    const id = await call(engine, 'hitTest', pairToPoint(point));
    assert(id === null || typeof id === 'string', 'hitTest() must return a string or null');
    results.push({ point: clone(point), id });
  }
  const snapshot = snapshotEngine(engine);
  return {
    actual: {
      points: clone(points),
      results,
      resizeHitIds: results.flatMap(({ id }) => (id === null ? [] : [id])),
      snapshot,
    },
    captureSource: snapshot,
  };
}

async function convertScreenToWorldAction(context, action) {
  const operands = exactOperands(action, ['screen']);
  const screen = finitePair(operands.screen, 'convertScreenToWorld.screen');
  const engine = currentEngine(context, 'convertScreenToWorld');
  const worldPoint = await call(engine, 'screenToWorld', pairToPoint(screen));
  const world = pointToPair(worldPoint, 'screenToWorld()');
  const geometry = geometryProbe(engine);
  const snapshot = snapshotEngine(engine);
  return {
    actual: { screen: clone(screen), world, geometry, snapshot },
    captureSource: snapshot,
  };
}

function geometryProbe(engine) {
  assert(typeof engine.geometryProbe === 'function', 'engine must expose geometryProbe()');
  const geometry = engine.geometryProbe();
  assert(geometry === null || isRecord(geometry), 'geometryProbe() must return an object or null');
  return clone(geometry);
}

function currentEngine(context, operation) {
  const engine = context.currentMainEngine();
  assert(engine !== null, `${operation} requires the main engine`);
  return engine;
}

async function advanceTo(context, timeMs) {
  assert(!context.signal.aborted, 'action is aborted');
  const current = context.clock.now();
  finiteNumber(current, 'clock.now()');
  assert(timeMs >= current, `clock cannot move backwards from ${current} to ${timeMs}`);
  await context.clock.advanceTo(timeMs);
  assert(!context.signal.aborted, 'action is aborted');
}

async function call(target, method, ...args) {
  assert(isRecord(target) && typeof target[method] === 'function', `engine must expose ${method}()`);
  return target[method](...args);
}

function snapshotEngine(engine) {
  assert(isRecord(engine) && typeof engine.snapshot === 'function', 'engine must expose snapshot()');
  return clone(engine.snapshot());
}

function validateContext(context) {
  assert(isRecord(context), 'handler context must be an object');
  for (const method of [
    'ensureMainEngine',
    'currentMainEngine',
    'resolveDataset',
    'fingerprint',
  ]) {
    assert(typeof context[method] === 'function', `context must expose ${method}()`);
  }
  assert(isRecord(context.clock), 'context must expose a clock');
  assert(isRecord(context.signal), 'context must expose an abort signal');
}

function exactOperands(action, keys) {
  assert(isRecord(action), 'action must be an object');
  return exactRecord(action.operands, keys, action.type);
}

function exactRecord(value, keys, label) {
  const record = recordValue(value, label);
  const actualKeys = Object.keys(record).sort();
  const acceptedKeys = [...keys].sort();
  assert(
    actualKeys.length === acceptedKeys.length
      && actualKeys.every((key, index) => key === acceptedKeys[index]),
    `${label} keys`,
  );
  return record;
}

function pointArray(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  return value.map((point, index) => finitePair(point, `${label}[${index}]`));
}

function finitePair(value, label) {
  assert(Array.isArray(value) && value.length === 2, `${label} must contain two values`);
  return [finiteNumber(value[0], `${label}[0]`), finiteNumber(value[1], `${label}[1]`)];
}

function positivePair(value, label) {
  assert(Array.isArray(value) && value.length === 2, `${label} must contain two values`);
  return [positiveNumber(value[0], `${label}[0]`), positiveNumber(value[1], `${label}[1]`)];
}

function stringArray(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  const strings = value.map((entry, index) => stringValue(entry, `${label}[${index}]`));
  assert(new Set(strings).size === strings.length, `${label} must not contain duplicates`);
  return strings;
}

function pointToPair(value, label) {
  const point = recordValue(value, label);
  return [finiteNumber(point.x, `${label}.x`), finiteNumber(point.y, `${label}.y`)];
}

function pairToPoint(value) {
  return { x: value[0], y: value[1] };
}

function recordValue(value, label) {
  assert(isRecord(value), `${label} must be an object`);
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

function positiveNumber(value, label) {
  const number = finiteNumber(value, label);
  assert(number > 0, `${label} must be positive`);
  return number;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`PatchMap lifecycle-resize handler invalid: ${message}`);
}
