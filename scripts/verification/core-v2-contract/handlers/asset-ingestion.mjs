export const ASSET_INGESTION_HANDLER_REVISION =
  'patch-map-asset-ingestion-handlers/1';

export const ASSET_INGESTION_CASE_IDS = Object.freeze([
  'ERR-003',
  'AST-002',
  'AST-003',
  'SEC-001',
  'CSM-032',
]);

export const ASSET_INGESTION_ACTION_TYPES = Object.freeze([
  'load-dataset',
  'resolve-asset',
  'retry-asset',
  'freezeDescriptors',
  'loadDescriptors',
  'construct-cyclic-descriptor',
  'validate-asset-descriptor',
  'loadDataset',
  'startAssetRequest',
  'replaceSource',
  'completeAssetRequest',
  'destroy',
  'run-asset-ingestion-policy-matrix',
  'paste-external-text',
  'paste-images',
  'drop-images',
  'probe-declared-failure',
]);

const CASE_ACTIONS = Object.freeze({
  'ERR-003': Object.freeze([
    'load-dataset',
    'resolve-asset',
    'retry-asset',
  ]),
  'AST-002': Object.freeze([
    'freezeDescriptors',
    'loadDescriptors',
    'construct-cyclic-descriptor',
    'validate-asset-descriptor',
  ]),
  'AST-003': Object.freeze([
    'loadDataset',
    'startAssetRequest',
    'replaceSource',
    'completeAssetRequest',
    'destroy',
    'completeAssetRequest',
  ]),
  'SEC-001': Object.freeze([
    'run-asset-ingestion-policy-matrix',
  ]),
  'CSM-032': Object.freeze([
    'paste-external-text',
    'paste-images',
    'drop-images',
    'drop-images',
    'probe-declared-failure',
  ]),
});

export function createAssetIngestionHandlerEntries(productValue) {
  const product = validateProduct(productValue);
  const states = new WeakMap();
  const handlers = Object.freeze({
    'load-dataset': withState(product, states, loadFailureDataset),
    'resolve-asset': withState(product, states, resolveAssetFailure),
    'retry-asset': withState(product, states, retryAsset),
    freezeDescriptors: withState(product, states, freezeDescriptors),
    loadDescriptors: withState(product, states, loadDescriptors),
    'construct-cyclic-descriptor': withState(product, states, constructCyclicDescriptor),
    'validate-asset-descriptor': withState(product, states, validateAssetDescriptor),
    loadDataset: withState(product, states, loadRaceDataset),
    startAssetRequest: withState(product, states, startAssetRequest),
    replaceSource: withState(product, states, replaceSource),
    completeAssetRequest: withState(product, states, completeAssetRequest),
    destroy: withState(product, states, destroyRaceEngine),
    'run-asset-ingestion-policy-matrix': withState(
      product,
      states,
      runAssetIngestionPolicyMatrix,
    ),
    'paste-external-text': withState(product, states, pasteExternalText),
    'paste-images': withState(product, states, pasteImages),
    'drop-images': withState(product, states, dropImages),
    'probe-declared-failure': withState(product, states, probeDeclaredFailure),
  });
  return Object.freeze(ASSET_INGESTION_ACTION_TYPES.map((type) => Object.freeze([
    `contract/${type}`,
    handlers[type],
  ])));
}

function withState(product, states, handler) {
  return async (contextValue, actionValue) => {
    const context = validateContext(contextValue);
    const action = validateAction(context, actionValue);
    let state = states.get(context.ensureMainEngine);
    if (state === undefined) {
      state = {
        caseId: context.caseId,
        engine: null,
        releasedEngine: null,
        hostDatasetLoaded: false,
        descriptors: null,
        descriptorFingerprint: null,
        bindings: new Map(),
        hostCreatedImageIds: [],
        ignoredOutsideDropCount: 0,
      };
      states.set(context.ensureMainEngine, state);
    }
    assert(state.caseId === context.caseId, 'state case identity');
    return handler(product, state, context, action);
  };
}

async function loadFailureDataset(product, state, context, action) {
  assert(context.caseId === 'ERR-003', 'failure dataset case');
  const operands = exactOperands(action, ['datasetRef']);
  const datasetRef = stringValue(operands.datasetRef, 'failure datasetRef');
  const engine = await ensureEngine(state, context);
  const dataset = await context.resolveDataset(datasetRef);
  const loaded = product.loadDataset(engine, { datasetRef, dataset });
  const rect = datasetRecord(loaded.observation.dataset, 'rect-b');
  const rectBNormalizedDataHash = context.fingerprint(rect);
  const actual = deepFreeze({
    loaded,
    rectBNormalizedDataHash,
  });
  return {
    actual,
    captureSource: { rectBNormalizedDataHash },
  };
}

async function resolveAssetFailure(product, state, context, action) {
  assert(context.caseId === 'ERR-003', 'resolve failure case');
  const operands = exactOperands(action, ['attempt', 'outcome', 'target']);
  assert(operands.attempt === 1, 'failure attempt');
  assert(operands.outcome === 'ASSET_LOAD_FAILED', 'failure outcome');
  const engine = requireStateEngine(state);
  const result = await product.resolveAssetFailure(engine, {
    target: cloneComponentTarget(operands.target),
  });
  return {
    actual: deepFreeze({
      code: result.observation.sceneImages.diagnostics[0]?.code ?? operands.outcome,
      result,
    }),
  };
}

async function retryAsset(product, state, context, action) {
  assert(context.caseId === 'ERR-003', 'retry failure case');
  const operands = exactOperands(action, ['attempt', 'descriptor', 'target']);
  assert(operands.attempt === 2, 'retry attempt');
  const descriptor = recordValue(operands.descriptor, 'retry descriptor');
  assertExactKeys(descriptor, ['alias', 'revision'], 'retry descriptor');
  const result = await product.retryAsset(requireStateEngine(state), {
    target: cloneComponentTarget(operands.target),
    descriptor: clone(descriptor),
  });
  return {
    actual: deepFreeze({
      code: result.retry.status === 'started' ? null : 'INTERNAL_FAILURE',
      result,
    }),
  };
}

async function freezeDescriptors(product, state, context, action) {
  assert(context.caseId === 'AST-002', 'freeze descriptors case');
  const operands = exactOperands(action, ['ids']);
  await ensureEngine(state, context);
  const ids = stringArray(operands.ids, 'descriptor IDs');
  const descriptors = descriptorFixtures(context.fixtureParams, ids);
  const before = context.fingerprint(descriptors);
  const frozen = product.freezeDescriptors({ descriptors });
  state.descriptors = descriptors;
  state.descriptorFingerprint = before;
  return {
    actual: deepFreeze({
      ids,
      before,
      after: context.fingerprint(descriptors),
      frozen,
    }),
  };
}

async function loadDescriptors(product, state, context, action) {
  assert(context.caseId === 'AST-002', 'load descriptors case');
  const operands = exactOperands(action, ['ids']);
  const ids = stringArray(operands.ids, 'load descriptor IDs');
  const descriptors = requireDescriptors(state);
  assert(sameArray(ids, descriptors.map(({ id }) => id)), 'descriptor load IDs');
  const result = await product.loadDescriptors({ descriptors });
  return {
    actual: deepFreeze({
      result,
      inputFingerprint: context.fingerprint(descriptors),
    }),
    captureSource: result.entries,
  };
}

function constructCyclicDescriptor(_product, state, context, action) {
  assert(context.caseId === 'AST-002', 'construct cyclic case');
  const operands = exactOperands(action, ['bindAs', 'cyclePath', 'descriptor']);
  const binding = stringValue(operands.bindAs, 'cyclic binding');
  const cyclePath = stringArray(operands.cyclePath, 'cyclic path');
  assert(sameArray(cyclePath, ['data', 'self']), 'cyclic path');
  const source = recordValue(operands.descriptor, 'cyclic descriptor');
  const data = {};
  data.self = data;
  const descriptor = {
    src: stringValue(source.src, 'cyclic source'),
    data,
  };
  state.bindings.set(binding, descriptor);
  return {
    actual: deepFreeze({
      binding,
      cyclePath,
      source: descriptor.src,
      constructed: true,
    }),
    bindings: {
      [binding]: {
        kind: 'cyclic-asset-descriptor',
        source: descriptor.src,
      },
    },
  };
}

function validateAssetDescriptor(product, state, context, action) {
  assert(context.caseId === 'AST-002', 'validate cyclic case');
  const operands = exactOperands(action, ['binding', 'expectedCode']);
  const binding = stringValue(operands.binding, 'descriptor binding');
  stringValue(operands.expectedCode, 'declared expected code');
  const descriptor = state.bindings.get(binding);
  assert(descriptor !== undefined, 'cyclic descriptor binding exists');
  const validation = product.validateDescriptor({ descriptor });
  const descriptors = requireDescriptors(state);
  return {
    actual: deepFreeze({
      validation,
      input: {
        descriptors: clone(descriptors),
        beforeFingerprint: state.descriptorFingerprint,
        afterFingerprint: context.fingerprint(descriptors),
      },
    }),
  };
}

async function loadRaceDataset(product, state, context, action) {
  assert(context.caseId === 'AST-003', 'race dataset case');
  const operands = exactOperands(action, ['datasetId']);
  const datasetRef = stringValue(operands.datasetId, 'race dataset ID');
  const engine = await ensureEngine(state, context);
  const result = product.loadDataset(engine, {
    datasetRef,
    dataset: await context.resolveDataset(datasetRef),
  });
  return { actual: result };
}

async function startAssetRequest(product, state, context, action) {
  assert(context.caseId === 'AST-003', 'start race case');
  const operands = exactOperands(action, ['requestId', 'targetId', 'timeMs']);
  const requestId = stringValue(operands.requestId, 'race request ID');
  const result = await product.startAssetRequest(requireStateEngine(state), {
    requestId,
    targetId: stringValue(operands.targetId, 'race target ID'),
    timeMs: finiteNumber(operands.timeMs, 'race start time'),
    source: raceSource(context.fixtureParams, requestId),
  });
  return { actual: result };
}

async function replaceSource(product, state, context, action) {
  assert(context.caseId === 'AST-003', 'replace race case');
  const operands = exactOperands(action, ['requestId', 'targetId', 'timeMs']);
  const requestId = stringValue(operands.requestId, 'replacement request ID');
  const result = await product.replaceAssetSource(requireStateEngine(state), {
    requestId,
    targetId: stringValue(operands.targetId, 'replacement target ID'),
    timeMs: finiteNumber(operands.timeMs, 'replacement time'),
    source: raceSource(context.fixtureParams, requestId),
  });
  return { actual: result };
}

async function completeAssetRequest(product, state, context, action) {
  assert(context.caseId === 'AST-003', 'complete race case');
  const operands = exactOperands(action, ['requestId', 'timeMs']);
  const requestId = stringValue(operands.requestId, 'completion request ID');
  const result = await product.completeAssetRequest(
    state.engine,
    {
      requestId,
      timeMs: finiteNumber(operands.timeMs, 'completion time'),
    },
  );
  return { actual: result };
}

async function destroyRaceEngine(product, state, context, action) {
  assert(context.caseId === 'AST-003', 'destroy race case');
  const operands = exactOperands(action, ['timeMs']);
  finiteNumber(operands.timeMs, 'destroy time');
  const engine = requireStateEngine(state);
  const before = product.raceProbe(engine);
  const release = await context.releaseEngine(engine, 'asset-race-destroy');
  state.releasedEngine = engine;
  state.engine = null;
  const after = product.raceProbe(null);
  return {
    actual: deepFreeze({ before, release: clone(release), after }),
    captureSource: release.after,
  };
}

async function runAssetIngestionPolicyMatrix(product, state, context, action) {
  assert(context.caseId === 'SEC-001', 'security matrix case');
  const operands = exactOperands(action, ['caseIds']);
  const engine = await ensureEngine(state, context);
  const datasetRef = stringValue(context.fixtureParams.datasetRef, 'security datasetRef');
  product.loadDataset(engine, {
    datasetRef,
    dataset: await context.resolveDataset(datasetRef),
  });
  const before = product.observe(engine);
  const unrelatedSemanticHash = context.fingerprint(before.dataset);
  const matrix = product.runSecurityMatrix({
    caseIds: stringArray(operands.caseIds, 'security case IDs'),
    policy: clone(recordValue(context.fixtureParams.assetPolicy, 'asset policy')),
  });
  const after = product.observe(engine);
  const afterHash = context.fingerprint(after.dataset);
  return {
    actual: deepFreeze({
      matrix,
      before,
      after,
      unrelatedSemanticHash,
      afterHash,
    }),
    beforeCaptureSource: { unrelatedSemanticHash },
  };
}

async function pasteExternalText(product, state, context, action) {
  assert(context.caseId === 'CSM-032', 'paste text case');
  const operands = exactOperands(action, ['activeEditor', 'targetWorld', 'text']);
  const engine = await ensureEngine(state, context);
  if (!state.hostDatasetLoaded) {
    product.loadDataset(engine, {
      datasetRef: 'host-clipboard-empty',
      dataset: [],
    });
    state.hostDatasetLoaded = true;
  }
  const result = product.ingestHostAsset(engine, {
    timeMs: context.clock.now(),
    payload: {
      kind: 'text',
      idPrefix: hostIdPrefix(context.hostSupplies),
      text: stringValue(operands.text, 'pasted text'),
      targetWorld: pointTuple(operands.targetWorld, 'paste text target'),
      activeEditor: booleanValue(operands.activeEditor, 'active editor'),
    },
  });
  return { actual: result };
}

function pasteImages(product, state, context, action) {
  assert(context.caseId === 'CSM-032', 'paste images case');
  const operands = exactOperands(action, ['files', 'targetWorld']);
  return ingestImages(product, state, context, action, {
    source: 'paste',
    files: stringArray(operands.files, 'paste files'),
    targetWorld: pointTuple(operands.targetWorld, 'paste image target'),
    insideCanvas: true,
  });
}

function dropImages(product, state, context, action) {
  assert(context.caseId === 'CSM-032', 'drop images case');
  const operands = exactOperands(action, ['files', 'insideCanvas', 'targetWorld']);
  return ingestImages(product, state, context, action, {
    source: 'drop',
    files: stringArray(operands.files, 'drop files'),
    targetWorld: pointTuple(operands.targetWorld, 'drop image target'),
    insideCanvas: booleanValue(operands.insideCanvas, 'insideCanvas'),
  });
}

function ingestImages(product, state, context, _action, options) {
  const engine = requireStateEngine(state);
  const files = hostFiles(context.fixtureParams, options.files);
  const result = product.ingestHostAsset(engine, {
    timeMs: context.clock.now(),
    payload: {
      kind: 'images',
      idPrefix: hostIdPrefix(context.hostSupplies),
      source: options.source,
      files,
      targetWorld: options.targetWorld,
      insideCanvas: options.insideCanvas,
    },
  });
  state.hostCreatedImageIds.push(...result.result.createdImageIds);
  state.ignoredOutsideDropCount = result.result.probe.ignoredOutsideDropCount;
  return { actual: result };
}

function probeDeclaredFailure(product, state, context, action) {
  assert(context.caseId === 'CSM-032', 'clipboard declared failure case');
  const operands = exactOperands(action, [
    'afterActionIndex',
    'expectedRollback',
    'injection',
    'isolate',
    'journeyId',
  ]);
  assert(operands.journeyId === 'CSM-032', 'clipboard journey ID');
  assert(operands.isolate === true, 'clipboard failure isolation');
  assert(operands.afterActionIndex === 3, 'clipboard failure action index');
  const injection = recordValue(operands.injection, 'clipboard failure injection');
  const rollback = recordValue(operands.expectedRollback, 'clipboard rollback');
  const engine = requireStateEngine(state);
  const result = product.ingestHostAsset(engine, {
    timeMs: context.clock.now(),
    payload: {
      kind: 'failure',
      code: stringValue(injection.diagnostic, 'clipboard failure code'),
      compressionFailureTargetScoped: booleanValue(
        rollback.compressionFailureTargetScoped,
        'compression target scope',
      ),
      activeEditorClipboardNotStolen: booleanValue(
        rollback.activeEditorClipboardNotStolen,
        'active editor ownership',
      ),
      outsideDropNotStolen: booleanValue(
        rollback.outsideDropNotStolen,
        'outside drop ownership',
      ),
    },
  });
  return {
    actual: deepFreeze({
      result,
      rollback: clone(rollback),
      final: product.observe(engine),
      createdImageIds: [...state.hostCreatedImageIds],
      ignoredOutsideDropCount: state.ignoredOutsideDropCount,
    }),
  };
}

async function ensureEngine(state, context) {
  if (state.engine !== null) return state.engine;
  const engine = await context.ensureMainEngine();
  const snapshot = callSync(engine, 'snapshot');
  if (snapshot.lifecycle === 'new') {
    await call(engine, 'initialize', {
      instanceId: `contract-${context.caseId.toLowerCase()}-asset-ingestion`,
      width: 800,
      height: 600,
      pixelRatio: 1,
      strategy: 'mesh',
      preference: 'webgl',
      antialias: true,
      background: 0xf7f8fa,
    });
  } else {
    assert(snapshot.lifecycle === 'ready-empty', 'asset engine ready-empty');
  }
  state.engine = engine;
  return state.engine;
}

function requireStateEngine(state) {
  assert(state.engine !== null, 'state engine exists');
  return state.engine;
}

function descriptorFixtures(params, ids) {
  const descriptors = params.descriptors;
  assert(Array.isArray(descriptors), 'fixture descriptors');
  const byId = new Map(descriptors.map((descriptor) => {
    const record = recordValue(descriptor, 'fixture descriptor');
    return [stringValue(record.id, 'fixture descriptor ID'), record];
  }));
  return deepFreeze(ids.map((id) => {
    const descriptor = byId.get(id);
    assert(descriptor !== undefined, `fixture descriptor ${id}`);
    return clone(descriptor);
  }));
}

function requireDescriptors(state) {
  assert(Array.isArray(state.descriptors), 'descriptor state exists');
  return state.descriptors;
}

function raceSource(params, requestId) {
  assert(Array.isArray(params.requests), 'race fixture requests');
  const request = params.requests
    .map((value) => recordValue(value, 'race fixture request'))
    .find(({ id }) => id === requestId);
  assert(request !== undefined, `race source ${requestId}`);
  return stringValue(request.source, `race source ${requestId}`);
}

function hostFiles(params, names) {
  assert(Array.isArray(params.imageFiles), 'host image files');
  const byName = new Map(params.imageFiles.map((value) => {
    const file = recordValue(value, 'host image file');
    return [stringValue(file.name, 'host image file name'), file];
  }));
  return deepFreeze(names.map((name) => {
    const file = byName.get(name);
    assert(file !== undefined, `host image file ${name}`);
    return {
      name,
      mime: stringValue(file.mime, `host image mime ${name}`),
      bytes: nonNegativeInteger(file.bytes, `host image bytes ${name}`),
      source: `https://assets.example.test/host/${encodeURIComponent(name)}`,
    };
  }));
}

function hostIdPrefix(hostSupplies) {
  const supplies = recordValue(hostSupplies, 'clipboard host supplies');
  return stringValue(supplies.idAllocatorPrefix, 'clipboard ID prefix');
}

function datasetRecord(dataset, id) {
  assert(Array.isArray(dataset), 'observed dataset');
  const record = dataset.find((candidate) =>
    isRecord(candidate) && candidate.id === id);
  assert(record !== undefined, `dataset record ${id}`);
  return record;
}

function cloneComponentTarget(value) {
  const target = recordValue(value, 'component target');
  assertExactKeys(target, ['id', 'ownerId'], 'component target');
  return {
    ownerId: stringValue(target.ownerId, 'component target owner'),
    id: stringValue(target.id, 'component target ID'),
  };
}

async function call(target, method, ...args) {
  const fn = target?.[method];
  assert(typeof fn === 'function', `engine ${method}()`);
  return await fn.apply(target, args);
}

function callSync(target, method, ...args) {
  const fn = target?.[method];
  assert(typeof fn === 'function', `engine ${method}()`);
  return fn.apply(target, args);
}

function validateProduct(value) {
  assert(isRecord(value), 'product adapter');
  for (const method of [
    'loadDataset',
    'resolveAssetFailure',
    'retryAsset',
    'freezeDescriptors',
    'loadDescriptors',
    'validateDescriptor',
    'startAssetRequest',
    'replaceAssetSource',
    'completeAssetRequest',
    'raceProbe',
    'runSecurityMatrix',
    'ingestHostAsset',
    'observe',
  ]) {
    assert(typeof value[method] === 'function', `product ${method}()`);
  }
  return value;
}

function validateContext(value) {
  assert(isRecord(value), 'handler context');
  assert(ASSET_INGESTION_CASE_IDS.includes(value.caseId), 'supported case');
  assert(Number.isInteger(value.actionIndex), 'context actionIndex');
  assert(typeof value.ensureMainEngine === 'function', 'ensureMainEngine()');
  assert(typeof value.releaseEngine === 'function', 'releaseEngine()');
  assert(typeof value.resolveDataset === 'function', 'resolveDataset()');
  assert(typeof value.fingerprint === 'function', 'fingerprint()');
  assert(isRecord(value.clock) && typeof value.clock.now === 'function', 'clock');
  assert(isRecord(value.signal), 'signal');
  assert(isRecord(value.fixtureParams), 'fixture params');
  assert(isRecord(value.hostSupplies), 'host supplies');
  return value;
}

function validateAction(context, value) {
  assert(isRecord(value), 'action record');
  assert(value.index === context.actionIndex, 'action index');
  const actions = CASE_ACTIONS[context.caseId];
  assert(actions !== undefined, 'case action list');
  assert(actions[context.actionIndex] === value.type, 'action type');
  assert(isRecord(value.operands), 'action operands');
  assert(!context.signal.aborted, 'action signal');
  return value;
}

function exactOperands(action, keys) {
  const operands = recordValue(action.operands, `${action.type} operands`);
  assertExactKeys(operands, keys, `${action.type} operands`);
  return operands;
}

function recordValue(value, label) {
  assert(isRecord(value), label);
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

function booleanValue(value, label) {
  assert(typeof value === 'boolean', label);
  return value;
}

function stringArray(value, label) {
  assert(Array.isArray(value), label);
  return value.map((entry, index) => stringValue(entry, `${label} ${index}`));
}

function pointTuple(value, label) {
  assert(
    Array.isArray(value) &&
      value.length === 2 &&
      value.every((entry) => typeof entry === 'number' && Number.isFinite(entry)),
    label,
  );
  return [value[0], value[1]];
}

function assertExactKeys(value, keys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  assert(sameArray(actual, expected), `${label} keys`);
}

function sameArray(left, right) {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function clone(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) throw new Error('Core v2 asset ingestion handler cannot clone cycles');
  seen.set(value, true);
  if (Array.isArray(value)) return value.map((entry) => clone(entry, seen));
  const result = {};
  for (const [key, nested] of Object.entries(value)) result[key] = clone(nested, seen);
  seen.delete(value);
  return result;
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Core v2 asset ingestion handler: ${message}`);
}
