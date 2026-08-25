import { clone, deepFreeze } from '../value-atoms.mjs';

export const ASSET_ACTION_TYPES = Object.freeze([
  'registerAssets',
  'initializeWithRequiredAssetFailure',
  'acquireAsset',
  'destroy',
  'registerAlias',
]);

export const ASSET_CASE_IDS = Object.freeze(['AST-001']);

const CASE_TRACE = Object.freeze([
  action('registerAssets', { instanceId: 'A' }),
  action('registerAssets', { instanceId: 'B' }),
  action('initializeWithRequiredAssetFailure', {
    alias: 'required-fixture',
    source: 'fixture://required-init-failure.png',
    expectedCode: 'ASSET_LOAD_FAILED',
  }),
  action('acquireAsset', { instanceId: 'A', alias: 'device' }),
  action('acquireAsset', { instanceId: 'B', alias: 'device' }),
  action('destroy', { instanceId: 'A' }),
  action('destroy', { instanceId: 'B' }),
  action('registerAlias', {
    alias: 'device',
    descriptor: { src: 'https://assets.example.test/other.png' },
  }),
]);

const PRODUCT_METHODS = Object.freeze([
  'registerAssets',
  'initializeWithRequiredAssetFailure',
  'acquireAsset',
  'registerAlias',
  'inspectAssetState',
]);

/** Register AST-001's browser-safe, actual-only asset action surface. */
export function createAssetHandlerEntries(product) {
  const adapter = validateProduct(product);
  const states = new WeakMap();
  const handlers = Object.freeze({
    registerAssets: withState(adapter, states, registerAssetsAction),
    initializeWithRequiredAssetFailure: withState(
      adapter,
      states,
      initializeWithRequiredAssetFailureAction,
    ),
    acquireAsset: withState(adapter, states, acquireAssetAction),
    destroy: withState(adapter, states, destroyAction),
    registerAlias: withState(adapter, states, registerAliasAction),
  });

  return Object.freeze(ASSET_ACTION_TYPES.map((type) => Object.freeze([
    `contract/${type}`,
    handlers[type],
  ])));
}

function withState(product, states, handler) {
  return async (context, actionRecord) => {
    validateContext(context);
    assert(context.caseId === 'AST-001', `unsupported case ${String(context.caseId)}`);
    assert(Number.isInteger(context.actionIndex), 'context actionIndex');
    const trace = CASE_TRACE[context.actionIndex];
    assert(trace !== undefined, `AST-001 action ${context.actionIndex}`);
    assert(actionRecord.index === context.actionIndex, 'action index');
    assert(actionRecord.type === trace.type, `action ${context.actionIndex} type`);
    assert(sameJson(actionRecord.operands, trace.operands), `action ${context.actionIndex} operands`);
    const fixture = validateFixtureParams(context.fixtureParams);
    assert(!context.signal.aborted, 'action is aborted');

    let state = states.get(context.resolveDataset);
    if (state === undefined) {
      state = {
        caseId: context.caseId,
        instances: new Map(),
        requiredFailureEngine: null,
      };
      states.set(context.resolveDataset, state);
    }
    assert(state.caseId === context.caseId, 'execution state crossed case identity');
    return handler(product, state, context, actionRecord, fixture);
  };
}

async function registerAssetsAction(product, state, context, actionRecord, fixture) {
  const operands = exactOperands(actionRecord, ['instanceId']);
  const instanceId = stringValue(operands.instanceId, 'registerAssets.instanceId');
  assert(fixture.instances.includes(instanceId), `unknown instance ${instanceId}`);
  assert(!state.instances.has(instanceId), `duplicate instance ${instanceId}`);

  const engine = state.instances.size === 0
    ? await context.ensureMainEngine()
    : (await context.createEngine(`asset:${instanceId}`)).engine;
  const result = await product.registerAssets(engine, deepFreeze({
    instanceId,
    aliases: clone(fixture.aliases),
  }));
  const probe = await inspectAssetState(product, engine, 'device');
  const snapshot = snapshotEngine(engine);
  state.instances.set(instanceId, { engine, destroyed: false });
  return {
    actual: {
      instanceId,
      result: cloneJson(result, 'registerAssets result'),
      snapshot,
      probe,
    },
    captureSource: snapshot,
  };
}

async function initializeWithRequiredAssetFailureAction(
  product,
  state,
  context,
  actionRecord,
  fixture,
) {
  const operands = exactOperands(actionRecord, ['alias', 'source', 'expectedCode']);
  const alias = stringValue(operands.alias, 'required failure alias');
  const source = stringValue(operands.source, 'required failure source');
  stringValue(operands.expectedCode, 'required failure declared code');
  assert(alias === fixture.requiredFailure.alias, 'required failure alias fixture drift');
  assert(source === fixture.requiredFailure.source, 'required failure source fixture drift');
  assert(state.requiredFailureEngine === null, 'required failure action is single-use');

  const record = await context.createEngine('asset:required-failure');
  const engine = record.engine;
  state.requiredFailureEngine = engine;
  let readyCount = 0;
  const unsubscribe = on(engine, 'ready', () => {
    readyCount += 1;
  });
  let result = null;
  let error = null;
  let initState = 'resolved';
  try {
    result = cloneJson(await product.initializeWithRequiredAssetFailure(engine, deepFreeze({
      alias,
      source,
      instanceId: 'required-failure',
    })), 'required failure result');
  } catch (caught) {
    initState = 'rejected';
    error = actualError(caught, context.fingerprint);
  } finally {
    unsubscribe();
  }

  const snapshot = snapshotEngine(engine);
  const probe = await inspectAssetState(product, engine, alias);
  const release = await context.releaseEngine(engine, 'asset-required-failure-isolation');
  const afterReleaseProbe = await inspectAssetState(product, engine, alias);
  return {
    actual: {
      request: {
        alias,
        sourceFingerprint: context.fingerprint({ source }),
      },
      initState,
      result,
      error,
      readyCount,
      snapshot,
      probe,
      release: clone(release),
      afterReleaseProbe,
    },
    captureSource: snapshot,
  };
}

async function acquireAssetAction(product, state, _context, actionRecord) {
  const operands = exactOperands(actionRecord, ['alias', 'instanceId']);
  const instanceId = stringValue(operands.instanceId, 'acquireAsset.instanceId');
  const alias = stringValue(operands.alias, 'acquireAsset.alias');
  const instance = instanceRecord(state, instanceId, 'acquireAsset');
  assert(!instance.destroyed, `instance ${instanceId} is destroyed`);
  const result = await product.acquireAsset(instance.engine, deepFreeze({ instanceId, alias }));
  const probe = await inspectAssetState(product, instance.engine, alias);
  return {
    actual: {
      instanceId,
      alias,
      result: cloneJson(result, 'acquireAsset result'),
      probe,
    },
  };
}

async function destroyAction(product, state, context, actionRecord) {
  const operands = exactOperands(actionRecord, ['instanceId']);
  const instanceId = stringValue(operands.instanceId, 'destroy.instanceId');
  const instance = instanceRecord(state, instanceId, 'destroy');
  assert(!instance.destroyed, `instance ${instanceId} already destroyed`);
  const release = await context.releaseEngine(instance.engine, `asset-instance-destroy:${instanceId}`);
  instance.destroyed = true;
  const probe = await inspectAssetState(product, instance.engine, 'device');
  return {
    actual: {
      instanceId,
      release: clone(release),
      probe,
    },
    captureSource: release.after,
  };
}

async function registerAliasAction(product, _state, context, actionRecord) {
  const operands = exactOperands(actionRecord, ['alias', 'descriptor']);
  const alias = stringValue(operands.alias, 'registerAlias.alias');
  const descriptor = cloneRecord(operands.descriptor, 'registerAlias.descriptor');
  const beforeFingerprint = context.fingerprint(descriptor);
  let result = null;
  let error = null;
  let settlement = 'resolved';
  try {
    result = cloneJson(
      await product.registerAlias(deepFreeze({ alias, descriptor })),
      'registerAlias result',
    );
  } catch (caught) {
    settlement = 'rejected';
    error = actualError(caught, context.fingerprint);
  }
  const afterFingerprint = context.fingerprint(descriptor);
  const probe = await inspectAssetState(product, null, alias);
  return {
    actual: {
      alias,
      settlement,
      result,
      error,
      input: {
        beforeFingerprint,
        afterFingerprint,
        unchanged: beforeFingerprint === afterFingerprint,
      },
      probe,
    },
  };
}

async function inspectAssetState(product, engine, alias) {
  const raw = await product.inspectAssetState(Object.freeze({ engine, alias }));
  const probe = cloneRecord(raw, 'asset probe');
  const catalog = exactRecord(probe.catalog, ['fontWeights', 'imageAliases'], 'asset probe catalog');
  const selected = exactRecord(probe.selected, [
    'alias',
    'cacheKey',
    'leaseCount',
    'pendingUserCount',
    'resourceCount',
    'resourceToken',
  ], 'asset probe selected');
  const totals = exactRecord(
    probe.totals,
    ['leaseCount', 'pendingCount', 'resourceCount'],
    'asset probe totals',
  );
  stringArray(catalog.imageAliases, 'asset probe image aliases');
  catalog.fontWeights.forEach((weight, index) => {
    nonNegativeInteger(weight, `asset probe font weight ${index}`);
  });
  assert(selected.alias === alias, 'asset probe selected alias');
  for (const field of ['resourceCount', 'leaseCount', 'pendingUserCount']) {
    nonNegativeInteger(selected[field], `asset probe selected ${field}`);
  }
  for (const field of ['cacheKey', 'resourceToken']) {
    assert(
      selected[field] === null || (typeof selected[field] === 'string' && selected[field].length > 0),
      `asset probe selected ${field}`,
    );
  }
  for (const field of ['resourceCount', 'leaseCount', 'pendingCount']) {
    nonNegativeInteger(totals[field], `asset probe totals ${field}`);
  }
  validateJsonValue(probe, 'asset probe', new WeakSet());
  return deepFreeze(probe);
}

function validateFixtureParams(value) {
  const fixture = exactRecord(
    value,
    ['aliases', 'instances', 'requiredAlias', 'requiredFailure'],
    'fixture params',
  );
  const aliases = stringArray(fixture.aliases, 'fixture aliases');
  assert(new Set(aliases).size === aliases.length, 'fixture aliases must be unique');
  const instances = stringArray(fixture.instances, 'fixture instances');
  assert(instances.length === 2 && new Set(instances).size === 2, 'fixture instances');
  const requiredAlias = stringValue(fixture.requiredAlias, 'fixture requiredAlias');
  const requiredFailure = exactRecord(
    fixture.requiredFailure,
    ['alias', 'code', 'source'],
    'fixture requiredFailure',
  );
  const failure = {
    alias: stringValue(requiredFailure.alias, 'fixture required failure alias'),
    code: stringValue(requiredFailure.code, 'fixture required failure code'),
    source: stringValue(requiredFailure.source, 'fixture required failure source'),
  };
  assert(failure.alias === requiredAlias, 'fixture required alias parity');
  return { aliases, instances, requiredAlias, requiredFailure: failure };
}

function validateContext(context) {
  assert(isRecord(context), 'handler context must be an object');
  for (const method of [
    'ensureMainEngine',
    'createEngine',
    'releaseEngine',
    'resolveDataset',
    'fingerprint',
  ]) {
    assert(typeof context[method] === 'function', `context must expose ${method}()`);
  }
  assert(
    context.signal !== null && typeof context.signal === 'object',
    'context must expose an abort signal',
  );
}

function validateProduct(product) {
  assert(isRecord(product), 'asset product adapter must be an object');
  for (const method of PRODUCT_METHODS) {
    assert(typeof product[method] === 'function', `product adapter must expose ${method}()`);
  }
  return product;
}

function instanceRecord(state, instanceId, label) {
  const instance = state.instances.get(instanceId);
  assert(instance !== undefined, `${label} unknown instance ${instanceId}`);
  return instance;
}

function snapshotEngine(engine) {
  assert(isObjectLike(engine) && typeof engine.snapshot === 'function', 'engine must expose snapshot()');
  return cloneRecord(engine.snapshot(), 'engine snapshot');
}

function on(engine, event, listener) {
  assert(isObjectLike(engine) && typeof engine.on === 'function', 'engine must expose on()');
  const unsubscribe = engine.on(event, listener);
  assert(typeof unsubscribe === 'function', `${event} subscription must return unsubscribe()`);
  return unsubscribe;
}

function actualError(error, fingerprint) {
  const diagnostic = isRecord(error?.diagnostic) ? error.diagnostic : null;
  const safe = {
    name: safeErrorName(error instanceof Error ? error.name : null),
    code: safeDiagnosticToken(
      diagnostic?.code ?? error?.code,
      'UNKNOWN_FAILURE',
    ),
    category: safeDiagnosticToken(
      diagnostic?.category ?? error?.category,
      null,
    ),
    retryable: typeof (diagnostic?.retryable ?? error?.retryable) === 'boolean'
      ? (diagnostic?.retryable ?? error?.retryable)
      : null,
    operation: safeOperation(diagnostic?.operation ?? error?.operation),
  };
  return {
    ...safe,
    message: 'PatchMap asset operation failed',
    fingerprint: stringValue(fingerprint(safe), 'asset error fingerprint'),
  };
}

function safeErrorName(value) {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9]{0,63}$/u.test(value)
    ? value
    : 'UnknownError';
}

function safeDiagnosticToken(value, fallback) {
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/u.test(value)
    ? value
    : fallback;
}

function safeOperation(value) {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(value)
    ? value
    : null;
}

function exactOperands(actionRecord, keys) {
  assert(isRecord(actionRecord), 'action must be an object');
  return exactRecord(actionRecord.operands, keys, actionRecord.type);
}

function action(type, operands) {
  return Object.freeze({ type, operands: deepFreeze(operands) });
}

function exactRecord(value, keys, label) {
  const record = cloneRecord(value, label);
  const actualKeys = Object.keys(record).sort();
  const expectedKeys = [...keys].sort();
  assert(
    actualKeys.length === expectedKeys.length
      && actualKeys.every((key, index) => key === expectedKeys[index]),
    `${label} keys`,
  );
  return record;
}

function cloneRecord(value, label) {
  assert(isRecord(value), `${label} must be an object`);
  return clone(value);
}

function cloneJson(value, label) {
  assert(value !== undefined, `${label} must not be undefined`);
  const cloned = clone(value);
  validateJsonValue(cloned, label, new WeakSet());
  return cloned;
}

function stringArray(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  return value.map((entry, index) => stringValue(entry, `${label}[${index}]`));
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, label);
  return value;
}

function nonNegativeInteger(value, label) {
  assert(Number.isSafeInteger(value) && value >= 0, label);
  return value;
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
  assert(Array.isArray(value) || isRecord(value), `${path} contains a non-plain object`);
  ancestors.add(value);
  for (const [key, nested] of Object.entries(value)) {
    validateJsonValue(nested, `${path}/${key}`, ancestors);
  }
  ancestors.delete(value);
}

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isObjectLike(value) {
  return value !== null && (typeof value === 'object' || typeof value === 'function');
}


function assert(condition, message) {
  if (!condition) throw new Error(`PatchMap asset handler invalid: ${message}`);
}
