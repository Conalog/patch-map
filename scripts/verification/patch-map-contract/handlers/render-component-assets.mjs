import { clone, deepFreeze, createTypeSuffixValueAtoms } from '../value-atoms.mjs';

const { booleanValue } = createTypeSuffixValueAtoms(assert);

export const RENDER_COMPONENT_ASSETS_HANDLER_REVISION =
  'patch-map-render-component-assets-handlers/2';

export const RENDER_COMPONENT_ASSETS_CASE_IDS = Object.freeze(['REN-008', 'REN-010']);

export const RENDER_COMPONENT_ASSETS_ACTION_TYPES = Object.freeze([
  'loadDataset',
  'replaceComponentSource',
  'setComponentVisibility',
  'replaceSource',
  'patch',
]);

const CASES = Object.freeze({
  'REN-008': Object.freeze({
    datasetId: 'background',
    target: Object.freeze({ ownerId: 'item', componentId: 'bg' }),
    trace: Object.freeze([
      traceAction('loadDataset', { datasetId: 'background' }),
      traceAction('replaceComponentSource', {
        ownerId: 'item',
        componentId: 'bg',
        source: 'fixture-image',
        timeMs: 20,
      }),
      traceAction('setComponentVisibility', {
        ownerId: 'item',
        componentId: 'bg',
        show: false,
      }),
      traceAction('setComponentVisibility', {
        ownerId: 'item',
        componentId: 'bg',
        show: true,
      }),
    ]),
  }),
  'REN-010': Object.freeze({
    datasetId: 'icon',
    target: Object.freeze({ ownerId: 'item-a', componentId: 'icon' }),
    trace: Object.freeze([
      traceAction('loadDataset', { datasetId: 'icon' }),
      traceAction('replaceSource', {
        target: { ownerId: 'item-a', id: 'icon' },
        source: 'fixture-icon-2',
        timeMs: 20,
      }),
      traceAction('patch', {
        target: { ownerId: 'item-a', id: 'icon' },
        changes: { tint: '#00ff00ff' },
      }),
    ]),
  }),
});

/**
 * Browser-safe, expected-blind REN-008 / REN-010 product action handlers.
 *
 * The injected adapter owns only deterministic fixture registration/settlement
 * and sanitized resource observation. Geometry, identity, source, tint,
 * revisions, and renderer facts are read from the Engine's public probes.
 */
export function createRenderComponentAssetHandlerEntries(product) {
  const adapter = validateProductAdapter(product);
  const states = new WeakMap();
  const handlers = Object.freeze({
    loadDataset: withState(adapter, states, loadDatasetAction),
    replaceComponentSource: withState(adapter, states, replaceComponentSourceAction),
    setComponentVisibility: withState(adapter, states, setComponentVisibilityAction),
    replaceSource: withState(adapter, states, replaceSourceAction),
    patch: withState(adapter, states, patchAction),
  });
  return Object.freeze(RENDER_COMPONENT_ASSETS_ACTION_TYPES.map((type) => Object.freeze([
    `contract/${type}`,
    handlers[type],
  ])));
}

function withState(adapter, states, handler) {
  return async (context, actionRecord) => {
    validateContext(context);
    const definition = CASES[context.caseId];
    assert(definition !== undefined, `unsupported case ${String(context.caseId)}`);
    assert(Number.isInteger(context.actionIndex), 'context actionIndex');
    const canonical = definition.trace[context.actionIndex];
    assert(canonical !== undefined, `${context.caseId} action ${context.actionIndex}`);
    const action = recordValue(actionRecord, 'action record');
    assertExactKeys(action, ['index', 'operands', 'type'], 'action record');
    assert(action.index === context.actionIndex, `${context.caseId} action index`);
    assert(action.type === canonical.type, `${context.caseId} action type`);
    assert(
      sameJson(action.operands, canonical.operands),
      `${context.caseId} action ${context.actionIndex} operands`,
    );
    validateFixtureParams(context.caseId, context.fixtureParams);
    validateRouteParams(context.routeParams);
    assert(!context.signal.aborted, 'action is aborted');

    let state = states.get(context.resolveDataset);
    if (state === undefined) {
      state = {
        caseId: context.caseId,
        engine: null,
        datasetId: null,
        dataset: null,
        inputFingerprint: null,
      };
      states.set(context.resolveDataset, state);
    }
    assert(state.caseId === context.caseId, 'execution state case identity');
    return handler(adapter, state, context, action, definition);
  };
}

async function loadDatasetAction(adapter, state, context, actionRecord, definition) {
  const operands = exactOperands(actionRecord, ['datasetId']);
  const datasetId = stringValue(operands.datasetId, 'loadDataset.datasetId');
  assert(datasetId === definition.datasetId, `${context.caseId} dataset identity`);
  assert(state.engine === null && state.dataset === null, `${context.caseId} dataset loads once`);

  const engine = await ensureInitializedEngine(context);
  state.engine = engine;
  state.datasetId = datasetId;
  const registration = await adapter.registerFixtureAssets(engine, Object.freeze({
    caseId: context.caseId,
  }));
  assert(isRecord(registration), 'fixture registration result');
  const dataset = await context.resolveDataset(datasetId);
  const beforeFingerprint = context.fingerprint(dataset);
  state.dataset = dataset;
  state.inputFingerprint = beforeFingerprint;
  const loaded = await call(engine, 'loadDataset', dataset, { datasetRef: datasetId });
  const settlement = await settleComponent(adapter, engine, context.caseId, definition.target);
  await publish(engine, context);
  const product = observeProduct(engine, adapter, context.caseId, definition.target);
  const actual = {
    caseId: context.caseId,
    datasetId,
    target: componentTarget(definition.target),
    registration: clone(registration),
    settlement: clone(settlement),
    loaded: clone(loaded),
    input: inputEvidence(state, context),
    product,
  };

  if (context.caseId === 'REN-008') {
    return {
      actual,
      captureSource: { id: componentIdentity(product, definition.target) },
    };
  }
  return { actual };
}

async function replaceComponentSourceAction(
  adapter,
  state,
  context,
  actionRecord,
  definition,
) {
  const operands = exactOperands(
    actionRecord,
    ['componentId', 'ownerId', 'source', 'timeMs'],
  );
  const ownerId = stringValue(operands.ownerId, 'replaceComponentSource.ownerId');
  const componentId = stringValue(
    operands.componentId,
    'replaceComponentSource.componentId',
  );
  const source = clone(operands.source);
  stringValue(source, 'replaceComponentSource.source');
  const timeMs = finiteNumber(operands.timeMs, 'replaceComponentSource.timeMs');
  const target = exactTarget({ ownerId, componentId }, definition.target, 'replaceComponentSource');
  await advanceClock(context, timeMs);
  const engine = currentEngine(state, 'replaceComponentSource');
  const before = observeProduct(engine, adapter, context.caseId, target);
  const mutation = await patchComponent(engine, target, { source });
  const settlement = await settleComponent(adapter, engine, context.caseId, target);
  await publish(engine, context);
  const after = observeProduct(engine, adapter, context.caseId, target);
  return {
    actual: {
      target: componentTarget(target),
      source,
      timeMs,
      mutation,
      settlement: clone(settlement),
      input: inputEvidence(state, context),
      before,
      after,
    },
  };
}

async function setComponentVisibilityAction(
  adapter,
  state,
  context,
  actionRecord,
  definition,
) {
  const operands = exactOperands(actionRecord, ['componentId', 'ownerId', 'show']);
  const ownerId = stringValue(operands.ownerId, 'setComponentVisibility.ownerId');
  const componentId = stringValue(
    operands.componentId,
    'setComponentVisibility.componentId',
  );
  const show = booleanValue(operands.show, 'setComponentVisibility.show');
  const target = exactTarget({ ownerId, componentId }, definition.target, 'setComponentVisibility');
  const engine = currentEngine(state, 'setComponentVisibility');
  const before = observeProduct(engine, adapter, context.caseId, target);
  const mutation = await patchComponent(engine, target, { show });
  const settlement = show
    ? await settleComponent(adapter, engine, context.caseId, target)
    : null;
  await publish(engine, context);
  const after = observeProduct(engine, adapter, context.caseId, target);
  return {
    actual: {
      target: componentTarget(target),
      show,
      mutation,
      ...(settlement === null ? {} : { settlement: clone(settlement) }),
      input: inputEvidence(state, context),
      before,
      after,
    },
  };
}

async function replaceSourceAction(adapter, state, context, actionRecord, definition) {
  const operands = exactOperands(actionRecord, ['source', 'target', 'timeMs']);
  const target = normalizeActionTarget(operands.target, 'replaceSource.target');
  exactTarget(target, definition.target, 'replaceSource');
  const source = clone(operands.source);
  stringValue(source, 'replaceSource.source');
  const timeMs = finiteNumber(operands.timeMs, 'replaceSource.timeMs');
  await advanceClock(context, timeMs);
  const engine = currentEngine(state, 'replaceSource');
  const before = observeProduct(engine, adapter, context.caseId, target);
  const mutation = await patchComponent(engine, target, { source });
  const settlement = await settleComponent(adapter, engine, context.caseId, target);
  await publish(engine, context);
  const after = observeProduct(engine, adapter, context.caseId, target);
  return {
    actual: {
      target: componentTarget(target),
      source,
      timeMs,
      mutation,
      settlement: clone(settlement),
      input: inputEvidence(state, context),
      before,
      after,
    },
  };
}

async function patchAction(adapter, state, context, actionRecord, definition) {
  const operands = exactOperands(actionRecord, ['changes', 'target']);
  const target = normalizeActionTarget(operands.target, 'patch.target');
  exactTarget(target, definition.target, 'patch');
  const changes = clone(recordValue(operands.changes, 'patch.changes'));
  assertExactKeys(changes, ['tint'], 'patch.changes');
  stringValue(changes.tint, 'patch.changes.tint');
  const engine = currentEngine(state, 'patch');
  const before = observeProduct(engine, adapter, context.caseId, target);
  const mutation = await patchComponent(engine, target, changes);
  await publish(engine, context);
  const after = observeProduct(engine, adapter, context.caseId, target);
  return {
    actual: {
      target: componentTarget(target),
      changes,
      mutation,
      input: inputEvidence(state, context),
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
      instanceId: `${context.caseId.toLowerCase()}-component-assets-engine`,
      width: 800,
      height: 600,
      pixelRatio: 1,
      strategy: 'mesh',
      preference: 'webgl',
    });
  } else {
    assert(snapshot.lifecycle === 'ready-empty', 'initial engine lifecycle');
  }
  return engine;
}

async function patchComponent(engine, target, changes) {
  const detachedTarget = componentTarget(target);
  const detachedChanges = clone(changes);
  const mutation = await call(engine, 'patch', detachedTarget, detachedChanges);
  const result = recordValue(mutation, 'component patch result');
  assert(result.status === 'committed', 'component patch must commit');
  assert(result.changed === true, 'component patch must change product state');
  return clone(result);
}

async function settleComponent(adapter, engine, caseId, target) {
  const result = await adapter.settleComponentAsset(engine, Object.freeze({
    caseId,
    target: Object.freeze({ ...target }),
  }));
  assert(isRecord(result), 'component settlement result');
  return result;
}

function observeProduct(engine, adapter, caseId, target) {
  const snapshot = snapshotEngine(engine);
  const semanticProbe = callSync(engine, 'semanticProbe');
  const geometry = callSync(engine, 'geometryProbe');
  const imageProbe = callSync(engine, 'sceneImageProbe');
  const dataset = callSync(engine, 'exportDataset');
  const component = callSync(engine, 'componentVisualProbe', Object.freeze({ ...target }));
  const resources = adapter.resourceProbe(Object.freeze({ caseId }));
  assert(isRecord(semanticProbe), 'semanticProbe() result');
  assert(isRecord(geometry) && Array.isArray(geometry.entities), 'geometryProbe() result');
  assert(isRecord(imageProbe) && isRecord(imageProbe.images), 'sceneImageProbe() result');
  assert(Array.isArray(dataset), 'exportDataset() result');
  assert(isRecord(component), 'componentVisualProbe() result');
  assert(isRecord(resources), 'resourceProbe() result');
  assertComponentTarget(component.target, target, 'component probe target');
  const semantic = recordValue(component.semantic, 'component semantic probe');
  assert(semantic.ownerId === target.ownerId, 'component semantic owner');
  assert(semantic.componentId === target.componentId, 'component semantic ID');
  return clone({
    snapshot,
    semanticProbe,
    geometry,
    imageProbe,
    dataset,
    component,
    resources,
  });
}

function componentIdentity(product, target) {
  const component = recordValue(product.component, 'captured component');
  assertComponentTarget(component.target, target, 'captured component target');
  const semantic = recordValue(component.semantic, 'captured component semantic');
  return stringValue(semantic.componentId, 'captured component ID');
}

function inputEvidence(state, context) {
  assert(state.dataset !== null, 'input dataset');
  const beforeFingerprint = stringValue(state.inputFingerprint, 'input baseline fingerprint');
  const afterFingerprint = context.fingerprint(state.dataset);
  return {
    beforeFingerprint,
    afterFingerprint,
    unchanged: beforeFingerprint === afterFingerprint,
  };
}

async function publish(engine, context) {
  assert(!context.signal.aborted, 'action is aborted');
  const timeMs = finiteNumber(context.clock.now(), 'clock.now()');
  await call(engine, 'publishFrame', timeMs);
  await call(engine, 'settleSceneImages');
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

function validateProductAdapter(product) {
  const adapter = recordValue(product, 'component asset product adapter');
  for (const method of ['registerFixtureAssets', 'settleComponentAsset', 'resourceProbe']) {
    assert(typeof adapter[method] === 'function', `product.${method}`);
  }
  return adapter;
}

function validateContext(context) {
  const value = recordValue(context, 'context');
  for (const method of ['ensureMainEngine', 'resolveDataset', 'fingerprint']) {
    assert(typeof value[method] === 'function', `context.${method}`);
  }
  assert(isRecord(value.clock) && typeof value.clock.now === 'function', 'context.clock');
  assert(isRecord(value.signal) && typeof value.signal.aborted === 'boolean', 'context.signal');
}

function validateRouteParams(value) {
  const params = recordValue(value, 'route params');
  assertExactKeys(params, ['seed', 'size'], 'route params');
  stringValue(params.size, 'route size');
  assert(
    Number.isInteger(params.seed) && params.seed >= 0 && params.seed <= 0xffff_ffff,
    'route seed',
  );
}

function validateFixtureParams(caseId, value) {
  const params = recordValue(value, `${caseId} fixture params`);
  if (caseId === 'REN-008') {
    assertExactKeys(params, ['item', 'replacementSource'], 'REN-008 fixture params');
    assert(sameJson(params, {
      item: {
        id: 'item',
        size: [100, 80],
        padding: 10,
        background: {
          id: 'bg',
          source: {
            type: 'rect',
            fill: '#ff0000',
            borderWidth: 2,
            radius: 8,
          },
        },
      },
      replacementSource: 'fixture-image',
    }), 'REN-008 fixture identity');
    return;
  }
  assert(caseId === 'REN-010', `unsupported fixture case ${String(caseId)}`);
  assertExactKeys(params, ['contentBox', 'icon'], 'REN-010 fixture params');
  assert(sameJson(params, {
    icon: {
      ownerId: 'item-a',
      id: 'icon',
      source: 'fixture-icon',
      size: ['50%', '25%'],
      placement: 'right-top',
      margin: { top: 2, right: 3 },
    },
    contentBox: [10, 10, 80, 60],
  }), 'REN-010 fixture identity');
}

function normalizeActionTarget(value, label) {
  const target = recordValue(value, label);
  assertExactKeys(target, ['id', 'ownerId'], label);
  return {
    ownerId: stringValue(target.ownerId, `${label}.ownerId`),
    componentId: stringValue(target.id, `${label}.id`),
  };
}

function exactTarget(target, canonical, label) {
  assert(target.ownerId === canonical.ownerId, `${label} owner`);
  assert(target.componentId === canonical.componentId, `${label} component`);
  return target;
}

function componentTarget(target) {
  return {
    kind: 'component',
    ownerId: target.ownerId,
    id: target.componentId,
  };
}

function assertComponentTarget(value, target, label) {
  const candidate = recordValue(value, label);
  assert(candidate.ownerId === target.ownerId, `${label} ownerId`);
  assert(candidate.componentId === target.componentId, `${label} componentId`);
}

function snapshotEngine(engine) {
  const snapshot = callSync(engine, 'snapshot');
  return clone(recordValue(snapshot, 'snapshot() result'));
}

async function call(target, method, ...args) {
  const receiver = recordValue(target, `${method} target`);
  const callable = receiver[method];
  assert(typeof callable === 'function', `${method}() must exist`);
  return callable.apply(receiver, args);
}

function callSync(target, method, ...args) {
  const receiver = recordValue(target, `${method} target`);
  const callable = receiver[method];
  assert(typeof callable === 'function', `${method}() must exist`);
  const result = callable.apply(receiver, args);
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

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} non-empty string`);
  return value;
}

function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} finite number`);
  return value;
}


function assertExactKeys(value, keys, label) {
  const record = recordValue(value, label);
  const actual = Object.keys(record).sort();
  const accepted = [...keys].sort();
  assert(sameJson(actual, accepted), `${label} keys`);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}


function assert(condition, message) {
  if (!condition) {
    throw new Error(`PatchMap render-component-assets handler invalid: ${message}`);
  }
}
