import { cloneOptional as clone, createTypeSuffixValueAtoms } from '../value-atoms.mjs';

const { recordValue } = createTypeSuffixValueAtoms(assert);

export const PIXIJS_INTEGRATION_HANDLER_REVISION =
  'core-v2-pixijs-integration-handlers/1';

export const PIXIJS_INTEGRATION_CASE_IDS = Object.freeze([
  'PIX-001',
  'PIX-002',
  'PIX-003',
  'PIX-005',
]);

export const PIXIJS_INTEGRATION_ACTION_TYPES = Object.freeze([
  'initialize-engine',
  'load-dataset',
  'inspect-pixijs-public-surface',
  'query-logical-target',
  'map-logical-target-to-render-owner',
  'run-supported-runtime-matrix',
  'attempt-unsupported-backend',
  'run-renderer-loss-matrix',
]);

const CASE_ACTIONS = Object.freeze({
  'PIX-001': Object.freeze([
    'initialize-engine',
    'load-dataset',
    'inspect-pixijs-public-surface',
  ]),
  'PIX-002': Object.freeze([
    'query-logical-target',
    'map-logical-target-to-render-owner',
  ]),
  'PIX-003': Object.freeze([
    'run-supported-runtime-matrix',
    'attempt-unsupported-backend',
  ]),
  'PIX-005': Object.freeze([
    'run-renderer-loss-matrix',
  ]),
});

/**
 * Expected-blind PixiJS integration actions. Every observation comes from the
 * public Engine/Pixi surface or from explicitly pending external matrix cells.
 */
export function createPixijsIntegrationHandlerEntries() {
  const states = new WeakMap();
  const implementations = Object.freeze({
    'initialize-engine': initializeEngineAction,
    'load-dataset': loadDatasetAction,
    'inspect-pixijs-public-surface': inspectPixijsPublicSurfaceAction,
    'query-logical-target': queryLogicalTargetAction,
    'map-logical-target-to-render-owner': mapLogicalTargetToRenderOwnerAction,
    'run-supported-runtime-matrix': runSupportedRuntimeMatrixAction,
    'attempt-unsupported-backend': attemptUnsupportedBackendAction,
    'run-renderer-loss-matrix': runRendererLossMatrixAction,
  });
  return Object.freeze(PIXIJS_INTEGRATION_ACTION_TYPES.map((type) => Object.freeze([
    `contract/${type}`,
    withState(states, implementations[type]),
  ])));
}

function withState(states, implementation) {
  return async (contextValue, actionValue) => {
    const context = validateContext(contextValue);
    const expectedTypes = CASE_ACTIONS[context.caseId];
    assert(expectedTypes !== undefined, `unsupported case ${String(context.caseId)}`);
    const action = recordValue(actionValue, 'action');
    assertExactKeys(action, ['index', 'operands', 'type'], 'action');
    assert(action.index === context.actionIndex, 'action index');
    assert(action.type === expectedTypes[context.actionIndex], 'action type');
    assert(!context.signal.aborted, 'action is aborted');
    let state = states.get(context.resolveDataset);
    if (state === undefined) {
      state = createState(context.caseId);
      states.set(context.resolveDataset, state);
    }
    assert(state.caseId === context.caseId, 'execution state case identity');
    return implementation(state, context, action);
  };
}

function createState(caseId) {
  return {
    caseId,
    engine: null,
    datasetRef: null,
    queriedTarget: null,
    renderOwner: null,
    publicSurface: null,
    runtimeMatrix: null,
    unsupported: null,
    rendererLossMatrix: null,
  };
}

async function initializeEngineAction(state, context, action) {
  assert(state.caseId === 'PIX-001', 'initialize-engine case');
  const operands = exactOperands(
    action,
    ['backend', 'devicePixelRatio', 'viewportCssPx'],
  );
  const viewport = positiveNumberPair(operands.viewportCssPx, 'viewportCssPx');
  const backend = stringValue(operands.backend, 'backend');
  assert(backend === 'webgl2', 'PIX-001 requires WebGL2');
  const engine = await context.ensureMainEngine();
  const initialized = await engine.initialize({
    instanceId: 'pix-001-public-surface',
    width: viewport[0],
    height: viewport[1],
    pixelRatio: positiveNumber(operands.devicePixelRatio, 'devicePixelRatio'),
    backend,
    devtools: context.fixtureParams.devtools === true,
    strategy: 'mesh',
  });
  state.engine = engine;
  return actionOutput(state, engine, {
    initialized: clone(initialized),
    requestedBackend: backend,
    viewportCssPx: viewport,
  });
}

async function loadDatasetAction(state, context, action) {
  assert(state.caseId === 'PIX-001', 'load-dataset case');
  const operands = exactOperands(action, ['datasetRef']);
  const engine = currentEngine(state, 'load-dataset');
  const loaded = await loadDatasetReference(
    state,
    context,
    engine,
    stringValue(operands.datasetRef, 'datasetRef'),
  );
  return actionOutput(state, engine, { loaded });
}

function inspectPixijsPublicSurfaceAction(state, _context, action) {
  assert(state.caseId === 'PIX-001', 'inspect public surface case');
  const operands = exactOperands(action, ['fields']);
  const fields = stringArray(operands.fields, 'public surface fields');
  assert(
    sameStringSet(fields, ['application', 'renderer', 'stage', 'canvas']),
    'PIX-001 public surface field set',
  );
  const engine = currentEngine(state, 'inspect-pixijs-public-surface');
  const probe = callSync(engine, 'pixiPublicSurfaceProbe');
  assert(probe !== null, 'PixiJS public surface probe');
  state.publicSurface = clone(probe);
  return actionOutput(state, engine, {
    fields,
    publicSurface: clone(probe),
  });
}

async function queryLogicalTargetAction(state, context, action) {
  assert(state.caseId === 'PIX-002', 'query target case');
  const operands = exactOperands(action, ['target']);
  const target = componentTarget(recordValue(operands.target, 'target'));
  const engine = await ensureLoadedMainEngine(state, context, 'PIX-002');
  const query = callSync(engine, 'queryScene', {
    where: { ownerId: target.ownerId, id: target.componentId },
  });
  assert(query.status === 'matched', 'PIX-002 query status');
  assert(Array.isArray(query.targets) && query.targets.length === 1, 'PIX-002 query count');
  const queried = recordValue(query.targets[0], 'queried target');
  const visual = recordValue(
    callSync(engine, 'componentVisualProbe', target),
    'queried component visual',
  );
  state.queriedTarget = {
    id: stringValue(queried.id, 'queried target ID'),
    ownerId: stringValue(queried.ownerId, 'queried target owner'),
    kind: stringValue(queried.type, 'queried target kind'),
    key: stringValue(queried.key, 'queried target key'),
    parentKey: nullableString(queried.parentKey, 'queried target parent key'),
    visible: recordValue(visual.geometry, 'queried geometry').visible === true,
  };
  return actionOutput(state, engine, {
    target: clone(state.queriedTarget),
    query: {
      status: query.status,
      sceneRevision: query.sceneRevision,
      lifecycleGeneration: query.lifecycleGeneration,
    },
  });
}

function mapLogicalTargetToRenderOwnerAction(state, _context, action) {
  assert(state.caseId === 'PIX-002', 'map render owner case');
  assert(state.queriedTarget !== null, 'PIX-002 requires queried target');
  const operands = exactOperands(action, ['target']);
  const target = componentTarget(recordValue(operands.target, 'target'));
  const engine = currentEngine(state, 'map-logical-target-to-render-owner');
  const owner = callSync(engine, 'aggregateRenderOwnerProbe', target);
  assert(owner !== null, 'aggregate render owner probe');
  state.renderOwner = clone(owner);
  return actionOutput(state, engine, {
    target: clone(state.queriedTarget),
    renderOwner: clone(owner),
  });
}

async function runSupportedRuntimeMatrixAction(state, context, action) {
  assert(state.caseId === 'PIX-003', 'supported runtime matrix case');
  const operands = exactOperands(
    action,
    ['backend', 'browsers', 'os', 'scenarioSubset'],
  );
  const backend = stringValue(operands.backend, 'runtime backend');
  assert(backend === 'webgl2', 'PIX-003 runtime backend');
  assert(
    stringValue(operands.scenarioSubset, 'scenario subset') === 'normative',
    'PIX-003 normative subset',
  );
  const osValues = stringArray(operands.os, 'runtime OS values');
  const browsers = stringArray(operands.browsers, 'runtime browsers');
  const engine = await ensureLoadedMainEngine(state, context, 'PIX-003');
  const proxySurface = callSync(engine, 'pixiPublicSurfaceProbe');
  assert(proxySurface?.backend === 'webgl2', 'local development proxy WebGL2');
  const pendingCells = osValues.flatMap((os) => browsers.map((browser) => ({
    os,
    browser,
    backend,
    status: 'pending-native-windows',
    semanticDiffCount: null,
  })));
  state.runtimeMatrix = {
    normativeSubset: 'normative',
    supportedCellCount: pendingCells.length,
    measuredCellCount: 0,
    pendingCellCount: pendingCells.length,
    supportedCellSemanticDiffCount: 0,
    pendingCells,
    developmentProxy: {
      runtime: 'Chromium headless development proxy',
      promotionEligible: false,
      backend: proxySurface.backend,
      rendererLibrary: proxySurface.rendererLibrary,
    },
  };
  return actionOutput(state, engine, {
    runtimeMatrix: clone(state.runtimeMatrix),
  });
}

async function attemptUnsupportedBackendAction(state, context, action) {
  assert(state.caseId === 'PIX-003', 'unsupported backend case');
  assert(state.runtimeMatrix !== null, 'PIX-003 supported matrix must run first');
  const operands = exactOperands(action, ['backend']);
  const backend = stringValue(operands.backend, 'unsupported backend');
  assert(backend === 'webgl1', 'PIX-003 unsupported backend fixture');
  const record = await context.createEngine('declared-failure:unsupported-backend');
  const engine = record.engine;
  const before = clone(callSync(engine, 'snapshot'));
  let diagnostic = null;
  try {
    await engine.initialize({
      instanceId: 'pix-003-webgl1-rejected',
      width: 800,
      height: 600,
      pixelRatio: 1,
      backend,
      strategy: 'mesh',
    });
  } catch (error) {
    diagnostic = errorDiagnostic(error);
  }
  const after = clone(callSync(engine, 'snapshot'));
  const release = await context.releaseEngine(engine, 'unsupported-backend-probe');
  const main = currentEngine(state, 'attempt-unsupported-backend');
  state.unsupported = {
    backend,
    code: diagnostic?.code ?? null,
    category: diagnostic?.category ?? null,
    cleanFailure:
      diagnostic?.code === 'UNSUPPORTED_RUNTIME'
      && before.resources.canvasCount === 0
      && after.resources.canvasCount === 0
      && after.lifecycle === 'new',
    before,
    after,
    release: clone(release),
  };
  return actionOutput(state, main, {
    runtimeMatrix: clone(state.runtimeMatrix),
    unsupported: clone(state.unsupported),
  });
}

async function runRendererLossMatrixAction(state, context, action) {
  assert(state.caseId === 'PIX-005', 'renderer loss matrix case');
  const operands = exactOperands(action, ['backend', 'outcomePolicy', 'states']);
  const backend = stringValue(operands.backend, 'renderer loss backend');
  assert(backend === 'webgl2', 'PIX-005 renderer loss backend');
  const lossStates = stringArray(operands.states, 'renderer loss states');
  const outcomePolicy = stringArray(operands.outcomePolicy, 'renderer loss policy');
  assert(
    sameStringSet(outcomePolicy, ['recovered-frame', 'RENDERER_LOST']),
    'PIX-005 outcome policy',
  );
  const datasetRef = stringValue(context.fixtureParams.datasetRef, 'PIX-005 datasetRef');
  const results = [];
  for (const lossState of lossStates) {
    results.push(await exerciseRendererLossState(
      context,
      datasetRef,
      backend,
      lossState,
      outcomePolicy,
    ));
  }
  const engine = await ensureLoadedMainEngine(state, context, 'PIX-005-observer');
  state.rendererLossMatrix = {
    backend,
    states: lossStates,
    outcomePolicy,
    results,
  };
  return actionOutput(state, engine, {
    rendererLossMatrix: clone(state.rendererLossMatrix),
  });
}

async function exerciseRendererLossState(
  context,
  datasetRef,
  backend,
  lossState,
  outcomePolicy,
) {
  assert(
    [
      'idle',
      'load',
      'animation',
      'gesture',
      'extraction',
      'resize',
      'suspension',
      'destroy',
    ].includes(lossState),
    `unsupported renderer loss state ${lossState}`,
  );
  const record = await context.createEngine(`renderer-loss:${lossState}`);
  const engine = record.engine;
  await engine.initialize({
    instanceId: `pix-005-${lossState}`,
    width: 800,
    height: 600,
    pixelRatio: 1,
    backend,
    strategy: 'mesh',
  });
  const dataset = await context.resolveDataset(datasetRef);
  const datasetFingerprint = context.fingerprint(dataset);
  if (lossState !== 'idle') {
    callSync(engine, 'loadDataset', dataset, { datasetRef });
    if (lossState !== 'load') callSync(engine, 'publishFrame', context.clock.now());
  }
  await prepareLossBoundary(engine, lossState, context);
  const before = clone(callSync(engine, 'rendererLossProbe'));
  const snapshotBefore = clone(callSync(engine, 'snapshot'));
  const tupleBefore = clone(snapshotBefore.publishedTuple);
  let operation = null;
  let error = null;
  let forced = false;
  let released = false;
  let release = null;
  try {
    if (lossState === 'extraction') {
      const snapshot = callSync(engine, 'snapshot');
      forced = callSync(engine, 'forceRendererLoss');
      operation = clone(await engine.extractPublishedScene({
        targetTuple: snapshot.publishedTuple,
        cssSize: [800, 600],
        mime: 'image/png',
      }));
    } else {
      forced = callSync(engine, 'forceRendererLoss');
      if (lossState === 'destroy') {
        release = clone(await context.releaseEngine(engine, 'renderer-loss:destroy'));
        released = true;
      } else if (lossState !== 'suspension') {
        callSync(engine, 'publishFrame', context.clock.now());
      }
    }
  } catch (caught) {
    error = serializeError(caught);
  }
  const after = clone(callSync(engine, 'rendererLossProbe'));
  const snapshotAfter = clone(callSync(engine, 'snapshot'));
  const tupleAfter = clone(snapshotAfter.publishedTuple);
  const classification = classifyLossResult(before, after, error, forced);
  assert(outcomePolicy.includes(classification), `${lossState} loss classification`);
  if (!released) {
    release = clone(await context.releaseEngine(engine, `renderer-loss:${lossState}`));
  }
  const terminal = clone(callSync(engine, 'rendererLossProbe'));
  const snapshotTerminal = clone(callSync(engine, 'snapshot'));
  assert(context.fingerprint(dataset) === datasetFingerprint, `${lossState} dataset immutability`);
  return {
    state: lossState,
    classification,
    forced,
    before,
    after,
    terminal,
    tupleBefore,
    tupleAfter,
    stalePublication:
      classification === 'RENDERER_LOST' && !sameTuple(tupleBefore, tupleAfter),
    maxCanvasCount: Math.max(
      snapshotBefore.resources.canvasCount,
      snapshotAfter.resources.canvasCount,
      snapshotTerminal.resources.canvasCount,
    ),
    operation,
    error,
    release,
  };
}

async function prepareLossBoundary(engine, lossState, context) {
  if (lossState === 'animation') {
    const result = callSync(engine, 'transact', {
      strict: true,
      actionId: 'pix-005-loss-animation',
      operations: [{
        op: 'merge',
        target: { kind: 'component', ownerId: 'item-a', id: 'bar' },
        changes: [{ path: ['size', 'height'], value: 24 }],
      }],
    });
    assert(result.status === 'committed', 'animation boundary transaction');
  } else if (lossState === 'gesture') {
    callSync(engine, 'dispatchPointerInput', pointerInput('down', 1, 1, [760, 560]));
    callSync(engine, 'dispatchPointerInput', pointerInput('move', 2, 1, [730, 540]));
  } else if (lossState === 'resize') {
    callSync(engine, 'resize', 760, 520, 1);
  } else if (lossState === 'suspension') {
    callSync(engine, 'setDocumentVisibility', {
      state: 'hidden',
      timeMs: context.clock.now(),
    });
  }
}

function pointerInput(type, timeMs, buttons, screen) {
  return {
    type,
    pointerId: 71,
    pointerType: 'mouse',
    button: 0,
    buttons,
    screen,
    timeMs,
    modifiers: {
      shift: false,
      ctrl: false,
      alt: false,
      meta: false,
    },
  };
}

function classifyLossResult(before, after, error, forced) {
  if (error?.code === 'RENDERER_LOST' || after.state === 'lost') return 'RENDERER_LOST';
  if (forced && after.state === 'destroyed') return 'RENDERER_LOST';
  if (
    error === null
    && after.state === 'healthy'
    && after.recoveredFrameCount > before.recoveredFrameCount
  ) {
    return 'recovered-frame';
  }
  return 'unclassified';
}

async function ensureLoadedMainEngine(state, context, instanceSuffix) {
  const engine = await context.ensureMainEngine();
  const snapshot = callSync(engine, 'snapshot');
  if (snapshot.lifecycle === 'new') {
    await engine.initialize({
      instanceId: `pixijs-integration-${instanceSuffix.toLowerCase()}`,
      width: 800,
      height: 600,
      pixelRatio: 1,
      backend: 'webgl2',
      strategy: 'mesh',
      devtools: state.caseId === 'PIX-001',
    });
  }
  if (callSync(engine, 'snapshot').semanticHash === null) {
    const datasetRef = stringValue(
      context.fixtureParams.datasetRef,
      `${state.caseId} datasetRef`,
    );
    await loadDatasetReference(state, context, engine, datasetRef);
  }
  state.engine = engine;
  return engine;
}

async function loadDatasetReference(state, context, engine, datasetRef) {
  const dataset = await context.resolveDataset(datasetRef);
  const beforeFingerprint = context.fingerprint(dataset);
  const result = callSync(engine, 'loadDataset', dataset, { datasetRef });
  callSync(engine, 'publishFrame', context.clock.now());
  assert(
    context.fingerprint(dataset) === beforeFingerprint,
    `${datasetRef} input immutability`,
  );
  state.datasetRef = datasetRef;
  return {
    result: clone(result),
    semanticHash: callSync(engine, 'snapshot').semanticHash,
    inputFingerprint: beforeFingerprint,
  };
}

function actionOutput(state, engine, actual) {
  return deepFreeze({
    actual: {
      ...clone(actual),
      product: productProbe(engine),
      runtimeState: runtimeState(state),
    },
  });
}

function productProbe(engine) {
  return {
    snapshot: clone(callSync(engine, 'snapshot')),
    semantic: clone(callSync(engine, 'semanticProbe')),
    dataset: clone(callSync(engine, 'exportDataset')),
    history: clone(callSync(engine, 'historyInspection')),
    pixi: clone(callSync(engine, 'pixiPublicSurfaceProbe')),
    rendererLoss: clone(callSync(engine, 'rendererLossProbe')),
  };
}

function runtimeState(state) {
  return {
    caseId: state.caseId,
    datasetRef: state.datasetRef,
    queriedTarget: clone(state.queriedTarget),
    renderOwner: clone(state.renderOwner),
    publicSurface: clone(state.publicSurface),
    runtimeMatrix: clone(state.runtimeMatrix),
    unsupported: clone(state.unsupported),
    rendererLossMatrix: clone(state.rendererLossMatrix),
  };
}

function currentEngine(state, operation) {
  assert(state.engine !== null, `${operation} requires an engine`);
  return state.engine;
}

function componentTarget(value) {
  assertExactKeys(value, ['id', 'ownerId'], 'component target');
  return {
    ownerId: stringValue(value.ownerId, 'component owner ID'),
    componentId: stringValue(value.id, 'component ID'),
  };
}

function validateContext(value) {
  const context = recordValue(value, 'handler context');
  for (const name of [
    'ensureMainEngine',
    'createEngine',
    'releaseEngine',
    'resolveDataset',
    'fingerprint',
  ]) {
    assert(typeof context[name] === 'function', `context ${name}`);
  }
  assert(typeof context.caseId === 'string', 'context case ID');
  assert(Number.isInteger(context.actionIndex), 'context action index');
  assert(isRecord(context.fixtureParams), 'context fixture params');
  assert(isRecord(context.signal), 'context signal');
  assert(isRecord(context.clock) && typeof context.clock.now === 'function', 'context clock');
  return context;
}

function exactOperands(action, keys) {
  const operands = recordValue(action.operands, `${action.type} operands`);
  assertExactKeys(operands, keys, `${action.type} operands`);
  return operands;
}

function callSync(target, method, ...args) {
  assert(isRecord(target) && typeof target[method] === 'function', `product ${method}()`);
  return target[method](...args);
}

function errorDiagnostic(error) {
  if (!isRecord(error)) return null;
  return isRecord(error.diagnostic) ? clone(error.diagnostic) : null;
}

function serializeError(error) {
  const diagnostic = errorDiagnostic(error);
  return {
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
    code: diagnostic?.code ?? (isRecord(error) && typeof error.code === 'string'
      ? error.code
      : null),
    category: diagnostic?.category ?? null,
    operation: diagnostic?.operation ?? null,
  };
}

function sameTuple(left, right) {
  return left.scene === right.scene
    && left.view === right.view
    && left.interaction === right.interaction;
}

function sameStringSet(left, right) {
  return left.length === right.length
    && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function positiveNumberPair(value, label) {
  assert(Array.isArray(value) && value.length === 2, `${label} pair`);
  return value.map((entry, index) => positiveNumber(entry, `${label}[${index}]`));
}

function positiveNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value) && value > 0, label);
  return value;
}

function stringArray(value, label) {
  assert(Array.isArray(value), `${label} array`);
  return value.map((entry, index) => stringValue(entry, `${label}[${index}]`));
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, label);
  return value;
}

function nullableString(value, label) {
  assert(value === null || typeof value === 'string', label);
  return value;
}

function assertExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  assert(
    actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]),
    `${label} keys`,
  );
}


function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Core v2 PixiJS handler invalid: ${message}`);
}
