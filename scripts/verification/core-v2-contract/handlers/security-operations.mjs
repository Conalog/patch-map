import { deepFreeze } from '../value-atoms.mjs';

export const SECURITY_OPERATIONS_HANDLER_REVISION =
  'core-v2-security-operations-handlers/1';

export const SECURITY_OPERATIONS_CASE_IDS = Object.freeze([
  'SEC-002',
  'SEC-003',
  'SEC-004',
  'OPS-001',
  'OPS-002',
]);

export const SECURITY_OPERATIONS_ACTION_TYPES = Object.freeze([
  'run-extraction-preflight-matrix',
  'inject-sensitive-failure-fields',
  'capture-diagnostic-channels',
  'build-and-pack',
  'inspect-package-contents',
  'run-dependency-license-vulnerability-audit',
  'capture-runtime-diagnostics',
  'register-callbacks',
  'configure-callback',
  'emit-update',
  'dispose-callbacks',
]);

const CASE_ACTIONS = Object.freeze({
  'SEC-002': Object.freeze(['run-extraction-preflight-matrix']),
  'SEC-003': Object.freeze([
    'inject-sensitive-failure-fields',
    'capture-diagnostic-channels',
  ]),
  'SEC-004': Object.freeze([
    'build-and-pack',
    'inspect-package-contents',
    'run-dependency-license-vulnerability-audit',
  ]),
  'OPS-001': Object.freeze(['capture-runtime-diagnostics']),
  'OPS-002': Object.freeze([
    'register-callbacks',
    'configure-callback',
    'configure-callback',
    'emit-update',
    'dispose-callbacks',
  ]),
});

export function createSecurityOperationsHandlerEntries(productValue) {
  const product = validateProduct(productValue);
  const states = new WeakMap();
  const implementations = Object.freeze({
    'run-extraction-preflight-matrix': runExtractionPreflightMatrix,
    'inject-sensitive-failure-fields': injectSensitiveFailureFields,
    'capture-diagnostic-channels': captureDiagnosticChannels,
    'build-and-pack': buildAndPack,
    'inspect-package-contents': inspectPackageContents,
    'run-dependency-license-vulnerability-audit': runSupplyChainAudit,
    'capture-runtime-diagnostics': captureRuntimeDiagnostics,
    'register-callbacks': registerCallbacks,
    'configure-callback': configureCallback,
    'emit-update': emitUpdate,
    'dispose-callbacks': disposeCallbacks,
  });
  return Object.freeze(SECURITY_OPERATIONS_ACTION_TYPES.map((type) => Object.freeze([
    `contract/${type}`,
    withState(product, states, implementations[type]),
  ])));
}

function withState(product, states, implementation) {
  return async (contextValue, actionValue) => {
    const context = validateContext(contextValue);
    const action = recordValue(actionValue, 'action');
    const expected = CASE_ACTIONS[context.caseId];
    assert(expected !== undefined, `unsupported case ${String(context.caseId)}`);
    assertExactKeys(action, ['index', 'operands', 'type'], 'action');
    assert(action.index === context.actionIndex, 'action index');
    assert(action.type === expected[context.actionIndex], 'action type');
    assert(!context.signal.aborted, 'action is aborted');
    let state = states.get(context.resolveDataset);
    if (state === undefined) {
      state = createState(context.caseId);
      states.set(context.resolveDataset, state);
    }
    assert(state.caseId === context.caseId, 'state case identity');
    return implementation(product, state, context, action);
  };
}

function createState(caseId) {
  return {
    caseId,
    engine: null,
    packageEvidence: null,
    packageProjection: {},
    callbackBehaviors: new Map(),
    callbackSubscriptions: new Map(),
    callbackDeliveryOrder: [],
    callbackFailure: null,
    queuedAction: null,
    afterDisposeCount: 0,
  };
}

async function runExtractionPreflightMatrix(product, state, context, action) {
  assert(context.caseId === 'SEC-002', 'extraction case');
  const operands = exactOperands(action, ['cases', 'targetTuple']);
  const cases = stringArray(operands.cases, 'extraction cases');
  assertSameArray(cases, ['cors-safe', 'tainted', 'failed', 'replaced'], 'extraction cases');
  const targetTuple = revisionTuple(operands.targetTuple, 'target tuple');
  const engine = await ensureBaselineEngine(state, context, 'sec-002-extraction');
  const request = {
    targetTuple,
    cssSize: [800, 600],
    mime: 'image/png',
  };
  const before = product.observeEngine(engine);
  const corsSafe = await captureOutcome(engine, request);

  engine.setExtractionAssetReadability('contract-tainted-asset', 'tainted');
  const tainted = await captureOutcome(engine, request);
  engine.setExtractionAssetReadability('contract-tainted-asset', 'readable');
  engine.setExtractionAssetReadability('contract-failed-asset', 'readback-failed');
  const failed = await captureOutcome(engine, request);
  engine.clearExtractionAssetReadability();

  const replacedPromise = captureOutcome(engine, request);
  engine.panViewport([10, 0], 'programmatic');
  engine.publishFrame(context.clock.now());
  const replaced = await replacedPromise;
  const canvas = engine.canvasHandle();
  const after = product.observeEngine(engine);
  const snapshot = engine.snapshot();
  const temporaryExtractionResources =
    numberValue(corsSafe.temporaryImageCount ?? 0, 'safe temporary image count')
    + numberValue(corsSafe.renderTextureCount ?? 0, 'safe render texture count');

  return {
    actual: deepFreeze({
      cases,
      targetTuple,
      corsSafe,
      tainted,
      failed,
      replaced,
      liveCanvasUsableAfterFailure:
        canvas.identity === 'initial-canvas'
        && snapshot.resources.canvasCount === 1
        && snapshot.pendingWork === 0,
      temporaryExtractionResources,
      before,
      after,
    }),
    captureSource: {
      targetTuple,
      capturedTuple: corsSafe.capturedTuple ?? null,
    },
  };
}

function injectSensitiveFailureFields(product, _state, context, action) {
  assert(context.caseId === 'SEC-003', 'redaction injection case');
  const operands = exactOperands(action, ['fields', 'marker']);
  const marker = stringValue(operands.marker, 'redaction marker');
  const fields = stringArray(operands.fields, 'redaction fields');
  return {
    actual: product.injectSensitiveFailure({ marker, fields }),
  };
}

function captureDiagnosticChannels(product, _state, context, action) {
  assert(context.caseId === 'SEC-003', 'redaction capture case');
  const operands = exactOperands(action, ['channels']);
  const channels = stringArray(operands.channels, 'diagnostic channels');
  const captured = product.captureSensitiveChannels(channels);
  return {
    actual: deepFreeze({ channels, captured }),
    captureSource: captured,
  };
}

function buildAndPack(product, state, context, action) {
  assert(context.caseId === 'SEC-004', 'package build case');
  const operands = exactOperands(action, ['repeat', 'sourceRevision']);
  const repeat = positiveInteger(operands.repeat, 'build repeat');
  assert(stringValue(operands.sourceRevision, 'source revision') === 'provenance.codeCommit',
    'source revision binding');
  const evidence = product.readPackageSupplyChainEvidence();
  const supplyChain = recordValue(evidence.supplyChain, 'supply-chain evidence');
  const builds = arrayValue(supplyChain.builds, 'supply-chain builds').map((entry) =>
    clone(recordValue(entry, 'supply-chain build')));
  assert(builds.length === repeat, 'supply-chain build count');
  state.packageEvidence = evidence;
  state.packageProjection.builds = builds;
  return {
    actual: deepFreeze({
      repeat,
      sourceRevision: stringValue(
        recordValue(evidence.provenance, 'package provenance').codeCommit,
        'package code commit',
      ),
      builds,
      reproducible: supplyChain.reproducible === true,
    }),
  };
}

function inspectPackageContents(_product, state, context, action) {
  assert(context.caseId === 'SEC-004', 'package content case');
  const operands = exactOperands(action, ['prohibitedEntries']);
  const prohibitedEntries = stringArray(operands.prohibitedEntries, 'prohibited entries');
  const evidence = requirePackageEvidence(state);
  const supplyChain = recordValue(evidence.supplyChain, 'supply-chain evidence');
  const packageInspection = recordValue(
    supplyChain.packageInspection,
    'package inspection',
  );
  state.packageProjection.packageInspection = clone(packageInspection);
  return {
    actual: deepFreeze({
      prohibitedEntries,
      packageInspection: clone(packageInspection),
    }),
  };
}

function runSupplyChainAudit(_product, state, context, action) {
  assert(context.caseId === 'SEC-004', 'package audit case');
  const operands = exactOperands(action, ['auditLevel', 'requireSbom']);
  const auditLevel = stringValue(operands.auditLevel, 'audit level');
  assert(typeof operands.requireSbom === 'boolean', 'requireSbom');
  const evidence = requirePackageEvidence(state);
  const supplyChain = recordValue(evidence.supplyChain, 'supply-chain evidence');
  const audit = recordValue(supplyChain.audit, 'dependency audit');
  const licenses = recordValue(supplyChain.licenses, 'license inventory');
  const sbom = recordValue(supplyChain.sbom, 'SBOM');
  state.packageProjection.audit = clone(audit);
  state.packageProjection.licenses = clone(licenses);
  state.packageProjection.sbom = clone(sbom);
  return {
    actual: deepFreeze({
      auditLevel,
      requireSbom: operands.requireSbom,
      audit: clone(audit),
      licenses: clone(licenses),
      sbom: clone(sbom),
    }),
    captureSource: sbom,
  };
}

async function captureRuntimeDiagnostics(_product, state, context, action) {
  assert(context.caseId === 'OPS-001', 'runtime diagnostics case');
  const operands = exactOperands(action, ['capacity', 'instances', 'lifecycleStates']);
  const capacity = positiveInteger(operands.capacity, 'diagnostic capacity');
  const instances = stringArray(operands.instances, 'diagnostic instances');
  const lifecycleStates = stringArray(operands.lifecycleStates, 'lifecycle states');
  const datasetRef = stringValue(context.fixtureParams.datasetRef, 'diagnostic datasetRef');
  const dataset = await context.resolveDataset(datasetRef);
  const recordsByInstance = {};
  const stateLabelsByInstance = {};
  const disabledCosts = [];
  const releases = {};

  for (const instanceId of instances) {
    const record = await context.createEngine(`operations-runtime:${instanceId}`);
    const engine = recordValue(record, `${instanceId} engine record`).engine;
    disabledCosts.push(measureDisabledDiagnosticsCost(engine));
    engine.setRuntimeDiagnosticsEnabled(true);
    engine.setOperationalTelemetryEnabled(true);
    const labels = [];
    const snapshots = [];

    labels.push('new');
    snapshots.push(engine.runtimeDiagnostics());
    await engine.initialize({
      instanceId,
      width: 800,
      height: 600,
      pixelRatio: 1,
      backend: 'webgl2',
      strategy: 'mesh',
    });
    labels.push('ready-empty');
    snapshots.push(engine.runtimeDiagnostics());
    engine.loadDataset(structuredClone(dataset), { datasetRef });
    engine.publishFrame(context.clock.now());
    labels.push('scene-ready');
    snapshots.push(engine.runtimeDiagnostics());
    engine.dispatchPointerInput(pointerInput(1, 'down', context.clock.now()));
    labels.push('gesture');
    snapshots.push(engine.runtimeDiagnostics());
    engine.interruptPointerGestures('pointer-cancel');
    engine.reportOperationalFailure({
      code: 'INVALID_VALUE',
      category: 'INVALID_INPUT',
      operation: 'diagnosticProbe',
      logicalId: 'rect-b',
      recoverable: true,
      details: { marker: 'fixture-sensitive-value' },
    });
    labels.push('error');
    snapshots.push(engine.runtimeDiagnostics());
    engine.forceRendererLoss();
    labels.push('renderer-loss');
    snapshots.push(engine.runtimeDiagnostics());
    releases[instanceId] = await context.releaseEngine(
      engine,
      `operations-runtime:${instanceId}`,
    );
    labels.push('destroyed');
    snapshots.push(engine.runtimeDiagnostics());

    const terminal = snapshots.at(-1);
    recordsByInstance[instanceId] = deepFreeze(clone(
      recordValue(terminal, `${instanceId} terminal diagnostics`).records,
    ));
    stateLabelsByInstance[instanceId] = labels;
  }

  const allRecords = Object.values(recordsByInstance).flat();
  return {
    actual: deepFreeze({
      capacity,
      instances,
      lifecycleStates,
      recordsByInstance,
      stateLabelsByInstance,
      releases,
      disabledCollectionCostMs: Math.max(...disabledCosts),
      recordsPerInstance: Math.max(
        ...Object.values(recordsByInstance).map((records) => records.length),
      ),
      crossInstanceRecordCount: crossInstanceRecordCount(recordsByInstance),
      mutableDiagnosticFieldCount: allRecords.filter((entry) => !deepFrozen(entry)).length,
      sensitiveMarkerCount: countMarker(allRecords, 'fixture-sensitive-value'),
    }),
    captureSource: { recordsByInstance, stateLabelsByInstance },
  };
}

async function registerCallbacks(_product, state, context, action) {
  assert(context.caseId === 'OPS-002', 'callback registration case');
  const operands = exactOperands(action, ['ids', 'order']);
  const ids = stringArray(operands.ids, 'callback IDs');
  const order = stringArray(operands.order, 'callback order');
  assertSameArray(ids, order, 'callback registration order');
  const engine = await ensureBaselineEngine(state, context, 'ops-002-callbacks');
  engine.setOperationalTelemetryEnabled(true);
  for (const id of ids) {
    state.callbackBehaviors.set(id, { behavior: 'observe' });
    const subscription = engine.subscribeOperationalEvent(id, (event, control) => {
      if (event.type !== 'update') return;
      state.callbackDeliveryOrder.push(id);
      const configuration = state.callbackBehaviors.get(id);
      if (configuration?.behavior === 'throw') {
        throw new Error('fixture-sensitive-value');
      }
      if (configuration?.behavior === 'enqueue-engine-action') {
        control.enqueue('queued-action', () => {
          const result = applyConfiguredEngineAction(engine, configuration.action);
          state.callbackDeliveryOrder.push('queued-action');
          state.queuedAction = clone(result);
        });
      }
    });
    state.callbackSubscriptions.set(id, subscription);
  }
  return {
    actual: deepFreeze({
      ids,
      order,
      callbackRegistrations: engine.operationsProbe().callbackRegistrations,
    }),
  };
}

function configureCallback(_product, state, context, action) {
  assert(context.caseId === 'OPS-002', 'callback configuration case');
  const operands = exactOperands(action, ['behavior', 'id'], ['action']);
  const id = stringValue(operands.id, 'callback ID');
  const behavior = stringValue(operands.behavior, 'callback behavior');
  assert(state.callbackSubscriptions.has(id), `registered callback ${id}`);
  state.callbackBehaviors.set(id, {
    behavior,
    ...(operands.action === undefined ? {} : { action: clone(operands.action) }),
  });
  return {
    actual: deepFreeze({
      id,
      behavior,
      configured: true,
    }),
  };
}

function emitUpdate(_product, state, context, action) {
  assert(context.caseId === 'OPS-002', 'callback update case');
  const operands = exactOperands(action, ['changes', 'target']);
  const engine = requireEngine(state);
  const target = stringValue(operands.target, 'update target');
  const changes = recordValue(operands.changes, 'update changes');
  const transaction = engine.transact({
    strict: true,
    actionId: 'ops-002-update',
    operations: [{
      op: 'merge',
      target: { kind: 'element', id: target },
      changes: objectChanges(changes),
    }],
  });
  const dispatch = engine.emitOperationalEvent({
    type: 'update',
    operation: 'transact',
    revisionStamp: engine.snapshot().revisions,
    logicalId: target,
    counts: { applied: transaction.applied.length },
  });
  const operations = engine.operationsProbe();
  state.callbackFailure = operations.lastCallbackFailure;
  return {
    actual: deepFreeze({
      transaction: clone(transaction),
      dispatch: clone(dispatch),
      deliveryOrder: [...state.callbackDeliveryOrder],
      callbackFailure: clone(state.callbackFailure),
      queuedAction: clone(state.queuedAction),
      product: observeEngine(engine),
    }),
  };
}

function disposeCallbacks(_product, state, context, action) {
  assert(context.caseId === 'OPS-002', 'callback disposal case');
  const operands = exactOperands(action, ['ids', 'repeat']);
  const ids = stringArray(operands.ids, 'disposed callback IDs');
  const repeat = positiveInteger(operands.repeat, 'dispose repeat');
  const results = [];
  for (let iteration = 0; iteration < repeat; iteration += 1) {
    for (const id of ids) {
      const subscription = state.callbackSubscriptions.get(id);
      assert(subscription !== undefined, `callback subscription ${id}`);
      results.push({ id, iteration, changed: subscription.dispose() });
    }
  }
  const engine = requireEngine(state);
  const afterDispose = engine.emitOperationalEvent({
    type: 'post-dispose',
    operation: 'probe',
    revisionStamp: engine.snapshot().revisions,
  });
  state.afterDisposeCount = afterDispose.deliveredCount;
  return {
    actual: deepFreeze({
      ids,
      repeat,
      results,
      afterDisposeCount: state.afterDisposeCount,
      deliveryOrder: [...state.callbackDeliveryOrder],
      callbackFailure: clone(state.callbackFailure),
      callbackRegistrations: engine.operationsProbe().callbackRegistrations,
      product: observeEngine(engine),
    }),
    captureSource: {
      deliveryOrder: [...state.callbackDeliveryOrder],
      afterDisposeCount: state.afterDisposeCount,
    },
  };
}

async function ensureBaselineEngine(state, context, instanceId) {
  const engine = state.engine ?? await context.ensureMainEngine();
  state.engine = engine;
  const snapshot = engine.snapshot();
  if (snapshot.lifecycle === 'new') {
    await engine.initialize({
      instanceId,
      width: 800,
      height: 600,
      pixelRatio: 1,
      backend: 'webgl2',
      strategy: 'mesh',
    });
  }
  if (engine.snapshot().revisions.sceneRevision === 0) {
    const datasetRef = stringValue(context.fixtureParams.datasetRef, 'datasetRef');
    const dataset = await context.resolveDataset(datasetRef);
    const before = context.fingerprint(dataset);
    engine.loadDataset(structuredClone(dataset), { datasetRef });
    engine.publishFrame(context.clock.now());
    assert(before === context.fingerprint(dataset), 'dataset input immutability');
  }
  return engine;
}

async function captureOutcome(engine, request) {
  try {
    const result = await engine.extractPublishedScene(request);
    return deepFreeze({
      code: null,
      capturedTuple: clone(result.capturedTuple),
      cssSize: clone(result.cssSize),
      backingSize: clone(result.backingSize),
      mime: result.mime,
      dataUrlPrefix: result.dataUrl.slice(0, 22),
      authoritativeCanvasRetained: result.authoritativeCanvasRetained,
      temporaryImageCount: result.temporaryImageCount,
      renderTextureCount: result.renderTextureCount,
    });
  } catch (error) {
    const diagnostic = recordValue(error?.diagnostic, 'extraction diagnostic');
    return deepFreeze({
      code: stringValue(diagnostic.code, 'extraction code'),
      category: stringValue(diagnostic.category, 'extraction category'),
      operation: stringValue(diagnostic.operation, 'extraction operation'),
      capturedTuple: null,
      temporaryImageCount: 0,
      renderTextureCount: 0,
    });
  }
}

function applyConfiguredEngineAction(engine, actionValue) {
  const action = recordValue(actionValue, 'queued engine action');
  assertExactKeys(action, ['changes', 'target', 'type'], 'queued engine action');
  assert(stringValue(action.type, 'queued action type') === 'merge', 'queued merge action');
  const target = stringValue(action.target, 'queued action target');
  const changes = recordValue(action.changes, 'queued action changes');
  return engine.transact({
    strict: true,
    actionId: 'ops-002-queued-action',
    operations: [{
      op: 'merge',
      target: { kind: 'element', id: target },
      changes: objectChanges(changes),
    }],
  });
}

function objectChanges(value, prefix = []) {
  return Object.entries(value).flatMap(([key, nested]) => {
    const path = [...prefix, key];
    return nested !== null && typeof nested === 'object' && !Array.isArray(nested)
      ? objectChanges(nested, path)
      : [{ path, value: clone(nested) }];
  });
}

function observeEngine(engine) {
  return deepFreeze({
    snapshot: clone(engine.snapshot()),
    semantic: clone(engine.semanticProbe()),
    operations: clone(engine.operationsProbe()),
  });
}

function pointerInput(pointerId, type, timeMs) {
  return {
    type,
    pointerId,
    pointerType: 'mouse',
    button: 0,
    buttons: type === 'down' ? 1 : 0,
    screen: [180, 50],
    timeMs,
    modifiers: { shift: false, ctrl: false, alt: false, meta: false },
    viewRevision: 0,
  };
}

function requirePackageEvidence(state) {
  return recordValue(state.packageEvidence, 'package evidence');
}

function requireEngine(state) {
  assert(state.engine !== null, 'engine exists');
  return state.engine;
}

function crossInstanceRecordCount(recordsByInstance) {
  let count = 0;
  for (const [owner, records] of Object.entries(recordsByInstance)) {
    for (const record of records) {
      if (record.instanceId !== null && record.instanceId !== owner) count += 1;
    }
  }
  return count;
}

function deepFrozen(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every((nested) => deepFrozen(nested, seen));
}

function countMarker(value, marker) {
  return JSON.stringify(value).split(marker).length - 1;
}

function revisionTuple(value, label) {
  const record = recordValue(value, label);
  assertExactKeys(record, ['interaction', 'scene', 'view'], label);
  return {
    scene: nonNegativeInteger(record.scene, `${label}.scene`),
    view: nonNegativeInteger(record.view, `${label}.view`),
    interaction: nonNegativeInteger(record.interaction, `${label}.interaction`),
  };
}

function exactOperands(action, required, optional = []) {
  const operands = recordValue(action.operands, `${action.type} operands`);
  assertExactKeys(operands, required, `${action.type} operands`, optional);
  return operands;
}

function validateProduct(value) {
  const product = recordValue(value, 'product');
  for (const method of [
    'captureSensitiveChannels',
    'injectSensitiveFailure',
    'observeEngine',
    'readPackageSupplyChainEvidence',
  ]) {
    assert(typeof product[method] === 'function', `product.${method}()`);
  }
  return product;
}

function validateContext(value) {
  const context = recordValue(value, 'handler context');
  for (const method of [
    'createEngine',
    'ensureMainEngine',
    'fingerprint',
    'releaseEngine',
    'resolveDataset',
  ]) {
    assert(typeof context[method] === 'function', `context.${method}()`);
  }
  assert(typeof context.caseId === 'string', 'context caseId');
  assert(Number.isSafeInteger(context.actionIndex), 'context actionIndex');
  assert(recordValue(context.fixtureParams, 'fixture params'), 'fixture params');
  assert(recordValue(context.clock, 'clock'), 'clock');
  assert(typeof context.clock.now === 'function', 'clock.now()');
  assert(recordValue(context.signal, 'signal'), 'signal');
  return context;
}

function assertExactKeys(value, required, label, optional = []) {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value).sort();
  assert(required.every((key) => Object.hasOwn(value, key)), `${label} required keys`);
  assert(keys.every((key) => allowed.has(key)), `${label} exact keys`);
}

function assertSameArray(actual, expected, label) {
  assert(
    actual.length === expected.length
      && actual.every((entry, index) => entry === expected[index]),
    label,
  );
}

function recordValue(value, label) {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), label);
  return value;
}

function arrayValue(value, label) {
  assert(Array.isArray(value), label);
  return value;
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, label);
  return value;
}

function stringArray(value, label) {
  return arrayValue(value, label).map((entry, index) =>
    stringValue(entry, `${label}[${index}]`));
}

function numberValue(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), label);
  return value;
}

function positiveInteger(value, label) {
  assert(Number.isSafeInteger(value) && value > 0, label);
  return value;
}

function nonNegativeInteger(value, label) {
  assert(Number.isSafeInteger(value) && value >= 0, label);
  return value;
}

function clone(value) {
  return value === null || value === undefined ? value : structuredClone(value);
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function measureDisabledDiagnosticsCost(engine) {
  const sampleCount = 1_000;
  const started = now();
  for (let index = 0; index < sampleCount; index += 1) {
    engine.runtimeDiagnostics();
  }
  return Math.ceil(Math.max(0, now() - started) / sampleCount);
}


function assert(condition, message) {
  if (!condition) throw new Error(`Invalid Core v2 security/operations handler: ${message}`);
}
