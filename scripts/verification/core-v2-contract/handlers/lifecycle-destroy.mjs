import { clone, deepFreeze } from '../value-atoms.mjs';

export const LIFECYCLE_DESTROY_ACTION_TYPES = Object.freeze([
  'initialize',
  'loadDataset',
  'destroy',
  'repeatLifecycle',
]);

const PRODUCT_METHODS = Object.freeze(['inspectEngineResources']);

/**
 * Register the exact LIF-005 action surface.
 *
 * The engine itself is supplied by the execution worker. Resource inspection is
 * also injected so the same browser-safe handlers can consume real renderer,
 * scheduler, animation, and retained-reference counters in Node, the Lab, and a
 * packed browser without importing an implementation or verifier module here.
 */
export function createLifecycleDestroyHandlerEntries(product) {
  const inspectedProduct = validateProduct(product);
  const states = new WeakMap();
  const handlers = Object.freeze({
    initialize: withState(inspectedProduct, states, initializeAction),
    loadDataset: withState(inspectedProduct, states, loadDatasetAction),
    destroy: withState(inspectedProduct, states, destroyAction),
    repeatLifecycle: withState(inspectedProduct, states, repeatLifecycleAction),
  });

  return Object.freeze(LIFECYCLE_DESTROY_ACTION_TYPES.map((type) => Object.freeze([
    `contract/${type}`,
    handlers[type],
  ])));
}

function withState(product, states, handler) {
  return async (context, action) => {
    validateContext(context);
    const key = context.resolveDataset;
    let state = states.get(key);
    if (state === undefined) {
      state = {
        caseId: context.caseId,
        destroyObservations: [],
      };
      states.set(key, state);
    }
    assert(state.caseId === context.caseId, 'execution state crossed case identity');
    assert(context.caseId === 'LIF-005', `unsupported case ${String(context.caseId)}`);
    return handler(product, state, context, action);
  };
}

async function initializeAction(_product, _state, context, action) {
  const operands = exactOperands(action, ['instanceId', 'timeMs']);
  const instanceId = stringValue(operands.instanceId, 'initialize.instanceId');
  const timeMs = finiteNumber(operands.timeMs, 'initialize.timeMs');
  await advanceTo(context, timeMs);
  const engine = await context.ensureMainEngine();
  const result = await call(engine, 'initialize', initializeOptions(instanceId));
  const snapshot = snapshotEngine(engine);
  return {
    actual: { requestedAtMs: timeMs, result: clone(result), snapshot },
    captureSource: snapshot,
  };
}

async function loadDatasetAction(_product, _state, context, action) {
  const operands = exactOperands(action, ['datasetRef', 'timeMs']);
  const datasetRef = stringValue(operands.datasetRef, 'loadDataset.datasetRef');
  const timeMs = finiteNumber(operands.timeMs, 'loadDataset.timeMs');
  await advanceTo(context, timeMs);
  const engine = context.currentMainEngine();
  assert(engine !== null, 'loadDataset requires the initialized main engine');
  const dataset = await context.resolveDataset(datasetRef);
  const beforeFingerprint = context.fingerprint(dataset);
  const result = await call(engine, 'loadDataset', dataset, { datasetRef });
  const afterFingerprint = context.fingerprint(dataset);
  const snapshot = snapshotEngine(engine);
  return {
    actual: {
      datasetRef,
      loadedAtMs: timeMs,
      result: clone(result),
      snapshot,
      input: {
        beforeFingerprint,
        afterFingerprint,
        unchanged: beforeFingerprint === afterFingerprint,
      },
    },
    captureSource: snapshot,
  };
}

async function destroyAction(product, state, context, action) {
  const operands = exactOperands(action, ['timeMs']);
  const timeMs = finiteNumber(operands.timeMs, 'destroy.timeMs');
  await advanceTo(context, timeMs);
  const engine = context.currentMainEngine();
  assert(engine !== null, 'destroy requires the main engine');
  const before = snapshotEngine(engine);
  const returned = await call(engine, 'destroy');
  assert(typeof returned === 'boolean', 'destroy() must return a boolean');
  const after = snapshotEngine(engine);
  const resources = await inspectResources(product, engine, `destroy[${state.destroyObservations.length}]`);
  const observation = deepFreeze({
    call: state.destroyObservations.length + 1,
    requestedAtMs: timeMs,
    returned,
    before,
    after,
    resources,
  });
  state.destroyObservations.push(observation);
  return { actual: clone(observation), captureSource: after };
}

async function repeatLifecycleAction(product, state, context, action) {
  const operands = exactOperands(action, ['cycles', 'startTimeMs']);
  const cycles = positiveInteger(operands.cycles, 'repeatLifecycle.cycles');
  const startTimeMs = finiteNumber(operands.startTimeMs, 'repeatLifecycle.startTimeMs');
  const params = recordValue(context.fixtureParams, 'fixture params');
  const configuredCycles = positiveInteger(params.cycles, 'fixture cycles');
  const datasetRef = stringValue(params.datasetRef, 'fixture datasetRef');
  assert(cycles === configuredCycles, 'repeatLifecycle cycles must equal the fixture cycles');
  assert(state.destroyObservations.length === 2, 'repeatLifecycle requires both destroy probes');

  const dataset = await context.resolveDataset(datasetRef);
  const inputBeforeFingerprint = context.fingerprint(dataset);
  const cycleRecords = [];
  const releasedResourceSnapshots = [clone(state.destroyObservations[0].resources)];

  for (let index = 0; index < cycles; index += 1) {
    const cycle = index + 1;
    await advanceTo(context, startTimeMs + index);
    const engine = await context.ensureSessionEngine(cycle);
    let readyCallbackCount = 0;
    const unsubscribe = on(engine, 'ready', () => {
      readyCallbackCount += 1;
    });
    let initialized;
    let loaded;
    try {
      initialized = await call(
        engine,
        'initialize',
        initializeOptions(`lif-005-cycle-${cycle}`),
      );
      loaded = await call(engine, 'loadDataset', dataset, { datasetRef });
    } finally {
      unsubscribe();
    }

    const liveSnapshot = snapshotEngine(engine);
    const liveResources = await inspectResources(product, engine, `cycle[${cycle}].live`);
    const record = {
      cycle,
      requestedAtMs: startTimeMs + index,
      readyCallbackCount,
      initialized: clone(initialized),
      loaded: clone(loaded),
      liveSnapshot,
      liveResources,
      release: null,
      releasedResources: null,
    };

    if (cycle < cycles) {
      record.release = clone(await context.releaseEngine(engine, `lif-005-cycle-complete:${cycle}`));
      record.releasedResources = await inspectResources(product, engine, `cycle[${cycle}].released`);
      releasedResourceSnapshots.push(clone(record.releasedResources));
    }
    cycleRecords.push(record);
  }

  const terminalEngine = context.currentSessionEngine(cycles);
  const afterCycles = snapshotEngine(terminalEngine);
  const activeResources = await inspectResources(product, terminalEngine, 'afterCycles.active');
  const callbackCount = cycleRecords.reduce(
    (total, record) => total + record.readyCallbackCount,
    0,
  );
  const callbackMultiplier = callbackCount / cycles;
  const releasedLeakBudget = sumReleasedResources(releasedResourceSnapshots);
  const inputAfterFingerprint = context.fingerprint(dataset);

  const actual = {
    cycles,
    startTimeMs,
    datasetRef,
    callbackCount,
    callbackMultiplier,
    cycleRecords,
    afterCycles,
    activeResources,
    releasedLeakBudget,
    retainedDelta: clone(releasedLeakBudget.retained),
    input: {
      beforeFingerprint: inputBeforeFingerprint,
      afterFingerprint: inputAfterFingerprint,
      unchanged: inputBeforeFingerprint === inputAfterFingerprint,
    },
  };
  return { actual, captureSource: afterCycles };
}

function sumReleasedResources(resources) {
  assert(resources.length > 0, 'released resources must contain the main generation');
  const retained = {};
  const sum = {
    dom: { canvasCount: 0 },
    subscriptions: { count: 0 },
    tickerTasks: { count: 0 },
    animations: { count: 0 },
    history: { depth: 0 },
    retained,
  };
  for (const resource of resources) {
    sum.dom.canvasCount += resource.dom.canvasCount;
    sum.subscriptions.count += resource.subscriptions.count;
    sum.tickerTasks.count += resource.tickerTasks.count;
    sum.animations.count += resource.animations.count;
    sum.history.depth += resource.history.depth;
    addNumericTree(retained, resource.retained, 'retained');
  }
  return deepFreeze(sum);
}

function addNumericTree(target, source, label) {
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'number') {
      nonNegativeNumber(value, `${label}.${key}`);
      target[key] = (target[key] ?? 0) + value;
      continue;
    }
    assert(isRecord(value), `${label}.${key} must be a number or record`);
    target[key] ??= {};
    assert(isRecord(target[key]), `${label}.${key} collides with a number`);
    addNumericTree(target[key], value, `${label}.${key}`);
  }
}

async function inspectResources(product, engine, label) {
  const raw = await product.inspectEngineResources(engine, Object.freeze({ label }));
  const resource = clone(recordValue(raw, `${label} resource inspection`));
  exactRecord(resource, ['animations', 'dom', 'history', 'retained', 'subscriptions', 'tickerTasks'], label);
  exactCount(resource.dom, 'canvasCount', `${label}.dom`);
  exactCount(resource.subscriptions, 'count', `${label}.subscriptions`);
  exactCount(resource.tickerTasks, 'count', `${label}.tickerTasks`);
  exactCount(resource.animations, 'count', `${label}.animations`);
  exactCount(resource.history, 'depth', `${label}.history`);
  assert(
    validateNumericTree(resource.retained, `${label}.retained`) > 0,
    `${label}.retained must expose at least one numeric counter`,
  );
  return deepFreeze(resource);
}

function exactCount(value, key, label) {
  const record = exactRecord(value, [key], label);
  nonNegativeNumber(record[key], `${label}.${key}`);
}

function validateNumericTree(value, label) {
  const record = recordValue(value, label);
  let leafCount = 0;
  for (const [key, nested] of Object.entries(record)) {
    if (typeof nested === 'number') {
      nonNegativeNumber(nested, `${label}.${key}`);
      leafCount += 1;
    } else {
      leafCount += validateNumericTree(nested, `${label}.${key}`);
    }
  }
  return leafCount;
}

function initializeOptions(instanceId) {
  return {
    instanceId,
    width: 800,
    height: 600,
    pixelRatio: 1,
    strategy: 'mesh',
    preference: 'webgl',
  };
}

async function advanceTo(context, timeMs) {
  assert(!context.signal.aborted, 'action is aborted');
  const current = context.clock.now();
  finiteNumber(current, 'clock.now()');
  assert(timeMs >= current, `clock cannot move backwards from ${current} to ${timeMs}`);
  await context.clock.advanceTo(timeMs);
  assert(!context.signal.aborted, 'action is aborted');
}

function on(engine, event, listener) {
  assert(isRecord(engine), 'engine must be an object');
  assert(typeof engine.on === 'function', 'engine must expose on()');
  const unsubscribe = engine.on(event, listener);
  assert(typeof unsubscribe === 'function', `${event} subscription must return unsubscribe()`);
  return unsubscribe;
}

async function call(target, method, ...args) {
  assert(isRecord(target), 'engine must be an object');
  assert(typeof target[method] === 'function', `engine must expose ${method}()`);
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
    'ensureSessionEngine',
    'currentSessionEngine',
    'releaseEngine',
    'resolveDataset',
    'fingerprint',
  ]) {
    assert(typeof context[method] === 'function', `context must expose ${method}()`);
  }
  assert(isRecord(context.clock), 'context must expose a clock');
  assert(isRecord(context.signal), 'context must expose an abort signal');
}

function validateProduct(product) {
  assert(isRecord(product), 'lifecycle product adapter must be an object');
  for (const method of PRODUCT_METHODS) {
    assert(typeof product[method] === 'function', `product adapter must expose ${method}()`);
  }
  return product;
}

function exactOperands(action, keys) {
  assert(isRecord(action), 'action must be an object');
  return exactRecord(action.operands, keys, action.type);
}

function exactRecord(value, keys, label) {
  const record = recordValue(value, label);
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  assert(
    actual.length === expected.length && actual.every((key, index) => key === expected[index]),
    `${label} keys`,
  );
  return record;
}

function recordValue(value, label) {
  assert(isRecord(value), `${label} must be an object`);
  return value;
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} must be a non-empty string`);
  return value;
}

function positiveInteger(value, label) {
  assert(Number.isInteger(value) && value > 0, `${label} must be a positive integer`);
  return value;
}

function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} must be finite`);
  return value;
}

function nonNegativeNumber(value, label) {
  finiteNumber(value, label);
  assert(value >= 0, `${label} must be non-negative`);
  return value;
}


function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Core v2 lifecycle-destroy handler invalid: ${message}`);
}
