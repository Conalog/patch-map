import { clone, deepFreeze } from '../value-atoms.mjs';

export const ACCESSIBILITY_HANDLER_REVISION =
  'core-v2-accessibility-handlers/1';

export const ACCESSIBILITY_CASE_IDS = Object.freeze([
  'ACC-001',
  'ACC-002',
  'ACC-003',
]);

export const ACCESSIBILITY_ACTION_TYPES = Object.freeze([
  'read-logical-accessibility-tree',
  'focus-accessibility-target',
  'activate-accessibility-target',
  'run-pointer-action-trace',
  'run-host-control-action-trace',
  'compare-semantic-observations',
  'set-reduced-motion',
  'patch-component',
  'focus-and-select',
]);

const CASE_ACTIONS = Object.freeze({
  'ACC-001': Object.freeze([
    'read-logical-accessibility-tree',
    'focus-accessibility-target',
    'activate-accessibility-target',
  ]),
  'ACC-002': Object.freeze([
    'run-pointer-action-trace',
    'run-host-control-action-trace',
    'compare-semantic-observations',
  ]),
  'ACC-003': Object.freeze([
    'set-reduced-motion',
    'patch-component',
    'focus-and-select',
    'set-reduced-motion',
  ]),
});

export function createAccessibilityHandlerEntries(productValue) {
  const product = validateProduct(productValue);
  const states = new WeakMap();
  const implementations = Object.freeze({
    'read-logical-accessibility-tree': readLogicalAccessibilityTree,
    'focus-accessibility-target': focusAccessibilityTarget,
    'activate-accessibility-target': activateAccessibilityTarget,
    'run-pointer-action-trace': runPointerActionTrace,
    'run-host-control-action-trace': runHostControlActionTrace,
    'compare-semantic-observations': compareSemanticObservations,
    'set-reduced-motion': setReducedMotion,
    'patch-component': patchComponent,
    'focus-and-select': focusAndSelect,
  });
  return Object.freeze(ACCESSIBILITY_ACTION_TYPES.map((type) => Object.freeze([
    `contract/${type}`,
    withState(product, states, implementations[type]),
  ])));
}

function withState(product, states, implementation) {
  return async (contextValue, actionValue) => {
    const context = validateContext(contextValue);
    const action = validateAction(context, actionValue);
    let state = states.get(context.ensureSessionEngine);
    if (state === undefined) {
      state = {
        caseId: context.caseId,
        primaryEngine: null,
        primaryLoaded: false,
        pointerEngine: null,
        hostEngine: null,
        pointerObservation: null,
        hostObservation: null,
        comparison: null,
        presentationHeightAtFirstFrame: null,
      };
      states.set(context.ensureSessionEngine, state);
    }
    assert(state.caseId === context.caseId, 'state case identity');
    return implementation(product, state, context, action);
  };
}

async function readLogicalAccessibilityTree(product, state, context, action) {
  assert(context.caseId === 'ACC-001', 'logical tree case');
  const operands = exactOperands(action, ['root']);
  const root = stringValue(operands.root, 'accessibility root');
  assert(root === 'scene', 'accessibility root is scene');
  const engine = await ensurePrimaryEngine(state, context);
  const tree = callSync(engine, 'accessibilityTree', root);
  callSync(engine, 'publishFrame', frameTime(context.actionIndex, 1));
  const actual = {
    root,
    tree: clone(tree),
    product: observeProduct(product, engine),
  };
  return actionOutput(actual);
}

async function focusAccessibilityTarget(product, state, context, action) {
  assert(context.caseId === 'ACC-001', 'focus target case');
  const operands = exactOperands(action, ['target']);
  const target = stringValue(operands.target, 'focus target');
  const engine = await ensurePrimaryEngine(state, context);
  const accessibility = callSync(engine, 'focusAccessibilityTarget', target);
  callSync(engine, 'publishFrame', frameTime(context.actionIndex, 2));
  const actual = {
    target,
    accessibility: clone(accessibility),
    product: observeProduct(product, engine),
  };
  return actionOutput(actual);
}

async function activateAccessibilityTarget(product, state, context, action) {
  assert(context.caseId === 'ACC-001', 'activate target case');
  const operands = exactOperands(action, ['target', 'sources']);
  const target = stringValue(operands.target, 'activation target');
  const sources = stringArray(operands.sources, 'activation sources');
  const engine = await ensurePrimaryEngine(state, context);
  const activationId = `${context.caseId}:${target}:physical-activation-1`;
  const deliveries = sources.map((source) => clone(callSync(
    engine,
    'activateAccessibilityTarget',
    target,
    { source, activationId },
  )));
  callSync(engine, 'publishFrame', frameTime(context.actionIndex, 3));
  const actual = {
    target,
    sources,
    deliveries,
    product: observeProduct(product, engine),
  };
  return actionOutput(actual);
}

async function runPointerActionTrace(product, state, context, action) {
  assert(context.caseId === 'ACC-002', 'pointer parity case');
  const operands = exactOperands(action, ['actions']);
  const actions = stringArray(operands.actions, 'pointer actions');
  assertSameArray(actions, ['select', 'pan', 'zoom', 'nudge'], 'pointer actions');
  const engine = await createBaselineEngine(context, 'accessibility-pointer');
  state.pointerEngine = engine;
  callSync(engine, 'select', ['rect-b']);
  callSync(engine, 'focusAccessibilityTarget', 'rect-b');
  callSync(engine, 'panViewport', [8, 4], 'programmatic');
  callSync(engine, 'zoomViewportAt', {
    factor: 1.1,
    anchorCss: [200, 150],
    source: 'programmatic',
  });
  const nudge = callSync(engine, 'applyTransformerEdit', {
    kind: 'move',
    selectionIds: ['rect-b'],
    deltaWorld: [2, 1],
  }, {
    actionId: 'accessibility-parity-nudge',
  });
  assert(nudge.status === 'committed', 'pointer nudge committed');
  callSync(engine, 'publishFrame', 20);
  state.pointerObservation = semanticObservation(engine);
  const productObservation = observeProduct(product, engine);
  const release = await context.releaseEngine(
    engine,
    'accessibility-pointer-observed',
  );
  state.pointerEngine = null;
  const actual = {
    actions,
    nudge: clone(nudge),
    observation: clone(state.pointerObservation),
    release: clone(release),
    product: productObservation,
  };
  return actionOutput(actual);
}

async function runHostControlActionTrace(product, state, context, action) {
  assert(context.caseId === 'ACC-002', 'host parity case');
  const operands = exactOperands(action, ['actions']);
  const actions = stringArray(operands.actions, 'host actions');
  assertSameArray(actions, [
    'navigate',
    'select',
    'focus',
    'pan',
    'zoom',
    'nudge',
    'undo',
    'redo',
    'snapshot',
    'complete',
  ], 'host actions');
  const engine = await createBaselineEngine(context, 'accessibility-host');
  state.hostEngine = engine;
  const navigation = callSync(engine, 'accessibilityTree', 'scene');
  callSync(engine, 'select', ['rect-b']);
  callSync(engine, 'focusAccessibilityTarget', 'rect-b');
  callSync(engine, 'panViewport', [8, 4], 'programmatic');
  callSync(engine, 'zoomViewportAt', {
    factor: 1.1,
    anchorCss: [200, 150],
    source: 'programmatic',
  });
  const nudge = callSync(engine, 'applyTransformerEdit', {
    kind: 'move',
    selectionIds: ['rect-b'],
    deltaWorld: [2, 1],
  }, {
    actionId: 'accessibility-parity-nudge',
  });
  assert(nudge.status === 'committed', 'host nudge committed');
  const undo = callSync(engine, 'undo');
  assert(undo.status === 'committed', 'host undo committed');
  callSync(engine, 'publishFrame', 21);
  const redo = callSync(engine, 'redo');
  assert(redo.status === 'committed', 'host redo committed');
  callSync(engine, 'publishFrame', 22);
  const snapshot = callSync(engine, 'snapshot');
  state.hostObservation = semanticObservation(engine);
  const actual = {
    actions,
    navigation: clone(navigation),
    nudge: clone(nudge),
    undo: clone(undo),
    redo: clone(redo),
    snapshot: clone(snapshot),
    observation: clone(state.hostObservation),
    product: observeProduct(product, engine),
  };
  return actionOutput(actual);
}

function compareSemanticObservations(product, state, context, action) {
  assert(context.caseId === 'ACC-002', 'semantic parity comparison case');
  const operands = exactOperands(action, ['domains']);
  const domains = stringArray(operands.domains, 'comparison domains');
  assertSameArray(
    domains,
    ['scene', 'interaction', 'history', 'outcome'],
    'comparison domains',
  );
  assert(state.pointerObservation !== null, 'pointer observation exists');
  assert(state.hostObservation !== null, 'host observation exists');
  const differences = [];
  for (const domain of domains) {
    collectDifferences(
      state.pointerObservation[domain],
      state.hostObservation[domain],
      `/${domain}`,
      differences,
    );
  }
  state.comparison = deepFreeze({
    domains,
    differences,
    pointerHostParityDiffCount: differences.length,
  });
  const actual = {
    ...clone(state.comparison),
    product: observeProduct(product, state.hostEngine),
  };
  return actionOutput(actual);
}

async function setReducedMotion(product, state, context, action) {
  assert(context.caseId === 'ACC-003', 'reduced motion case');
  const operands = exactOperands(action, ['enabled']);
  const enabled = booleanValue(operands.enabled, 'reduced motion enabled');
  const engine = await ensurePrimaryEngine(state, context);
  const result = callSync(engine, 'setReducedMotion', enabled);
  const actual = {
    enabled,
    result: clone(result),
    product: observeProduct(product, engine, { ownerId: 'item-a', componentId: 'bar' }),
  };
  return actionOutput(actual);
}

async function patchComponent(product, state, context, action) {
  assert(context.caseId === 'ACC-003', 'reduced motion patch case');
  const operands = exactOperands(action, ['target', 'changes', 'durationMs']);
  const target = recordValue(operands.target, 'component target');
  assertExactKeys(target, ['id', 'ownerId'], 'component target');
  const ownerId = stringValue(target.ownerId, 'component owner');
  const componentId = stringValue(target.id, 'component ID');
  const changes = recordValue(operands.changes, 'component changes');
  const durationMs = finiteNonNegative(operands.durationMs, 'component duration');
  const engine = await ensurePrimaryEngine(state, context);
  const result = callSync(engine, 'patch', {
    kind: 'component',
    ownerId,
    id: componentId,
  }, clone(changes));
  assert(result.status === 'committed', 'reduced motion patch committed');
  callSync(engine, 'publishFrame', frameTime(context.actionIndex, 4));
  const bar = callSync(engine, 'barPresentationProbe', {
    ownerId,
    componentId,
  });
  state.presentationHeightAtFirstFrame = finiteNumber(
    bar.presentationHeight,
    'first-frame presentation height',
  );
  const actual = {
    target: { ownerId, componentId },
    changes: clone(changes),
    durationMs,
    result: clone(result),
    presentationHeightAtFirstFrame: state.presentationHeightAtFirstFrame,
    product: observeProduct(product, engine, { ownerId, componentId }),
  };
  return actionOutput(actual);
}

async function focusAndSelect(product, state, context, action) {
  assert(context.caseId === 'ACC-003', 'focus and select case');
  const operands = exactOperands(action, ['target']);
  const target = stringValue(operands.target, 'focus and select target');
  const engine = await ensurePrimaryEngine(state, context);
  const accessibility = callSync(engine, 'focusAccessibilityTarget', target);
  const selectedTargets = callSync(engine, 'select', [target]);
  callSync(engine, 'publishFrame', frameTime(context.actionIndex, 5));
  const actual = {
    target,
    accessibility: clone(accessibility),
    selectedTargets: clone(selectedTargets),
    product: observeProduct(product, engine, { ownerId: 'item-a', componentId: 'bar' }),
  };
  return actionOutput(actual);
}

async function ensurePrimaryEngine(state, context) {
  if (state.primaryEngine === null) {
    state.primaryEngine = await context.ensureSessionEngine(1);
  }
  const engine = state.primaryEngine;
  await initializeEngine(engine, context, 'primary');
  if (!state.primaryLoaded) {
    await loadBaseline(engine, context);
    state.primaryLoaded = true;
  }
  return engine;
}

async function createBaselineEngine(context, suffix) {
  const record = recordValue(
    await context.createEngine(`accessibility:${suffix}`),
    `${suffix} engine record`,
  );
  const engine = recordValue(record.engine, `${suffix} engine`);
  await initializeEngine(engine, context, suffix);
  await loadBaseline(engine, context);
  return engine;
}

async function initializeEngine(engine, context, suffix) {
  const snapshot = callSync(engine, 'snapshot');
  if (snapshot.lifecycle !== 'new') return;
  await call(engine, 'initialize', {
    instanceId: `contract-${context.caseId.toLowerCase()}-${suffix}`,
    width: 800,
    height: 600,
    pixelRatio: 1,
    strategy: 'mesh',
    preference: 'webgl',
    backend: 'webgl2',
    powerPreference: 'high-performance',
    antialias: true,
    background: 0xf7f8fa,
    zoomLimits: [0.25, 4],
  });
}

async function loadBaseline(engine, context) {
  const datasetRef = stringValue(
    context.fixtureParams.datasetRef,
    'accessibility datasetRef',
  );
  const dataset = await context.resolveDataset(datasetRef);
  callSync(engine, 'loadDataset', dataset, { datasetRef });
  callSync(engine, 'publishFrame', 0);
  callSync(engine, 'accessibilityTree', 'scene');
  callSync(engine, 'publishFrame', 1);
}

function semanticObservation(engine) {
  const snapshot = callSync(engine, 'snapshot');
  const history = callSync(engine, 'historyState');
  return deepFreeze({
    scene: clone(callSync(engine, 'exportDataset')),
    interaction: {
      selectedTargets: clone(snapshot.selectionIds),
      viewport: clone(callSync(engine, 'viewportProbe')),
    },
    history: {
      depth: history.depth,
      cursor: history.cursor,
      undoDepth: history.undoDepth,
      redoDepth: history.redoDepth,
    },
    outcome: {
      completed: true,
    },
  });
}

function observeProduct(product, engine, barTarget) {
  assert(engine !== null, 'observed engine exists');
  return clone(product.observeEngine(engine, barTarget));
}

function actionOutput(actual) {
  return {
    actual: deepFreeze(actual),
    captureSource: deepFreeze(clone(actual)),
  };
}

function collectDifferences(left, right, path, differences) {
  if (sameJson(left, right)) return;
  if (!isRecord(left) || !isRecord(right)) {
    differences.push(path);
    return;
  }
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  for (const key of keys) {
    collectDifferences(left[key], right[key], `${path}/${key}`, differences);
  }
}

function validateProduct(value) {
  const product = recordValue(value, 'accessibility product adapter');
  assert(typeof product.observeEngine === 'function', 'product observeEngine()');
  return product;
}

function validateContext(value) {
  const context = recordValue(value, 'handler context');
  assert(ACCESSIBILITY_CASE_IDS.includes(context.caseId), 'handler case ID');
  assert(typeof context.ensureSessionEngine === 'function', 'ensureSessionEngine()');
  assert(typeof context.createEngine === 'function', 'createEngine()');
  assert(typeof context.releaseEngine === 'function', 'releaseEngine()');
  assert(typeof context.resolveDataset === 'function', 'resolveDataset()');
  assert(isRecord(context.fixtureParams), 'fixture params');
  return context;
}

function validateAction(context, value) {
  const action = recordValue(value, 'action');
  assert(action.index === context.actionIndex, 'action index');
  assert(
    CASE_ACTIONS[context.caseId]?.[action.index] === action.type,
    `${context.caseId} action sequence`,
  );
  assert(isRecord(action.operands), 'action operands');
  return action;
}

function exactOperands(action, keys) {
  const operands = recordValue(action.operands, `${action.type}.operands`);
  assertExactKeys(operands, keys, `${action.type}.operands`);
  return operands;
}

function assertExactKeys(value, keys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  assert(sameJson(actual, expected), `${label} exact keys`);
}

async function call(target, method, ...args) {
  assert(isRecord(target), `${method} target`);
  assert(typeof target[method] === 'function', `${method}()`);
  return target[method](...args);
}

function callSync(target, method, ...args) {
  assert(isRecord(target), `${method} target`);
  assert(typeof target[method] === 'function', `${method}()`);
  const result = target[method](...args);
  assert(
    result === null ||
      typeof result !== 'object' ||
      typeof result.then !== 'function',
    `${method}() must be synchronous`,
  );
  return result;
}

function recordValue(value, label) {
  assert(isRecord(value), `${label} record`);
  return value;
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} string`);
  return value;
}

function stringArray(value, label) {
  assert(
    Array.isArray(value) &&
      value.every((entry) => typeof entry === 'string'),
    `${label} string array`,
  );
  return [...value];
}

function booleanValue(value, label) {
  assert(typeof value === 'boolean', `${label} boolean`);
  return value;
}

function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} finite`);
  return value;
}

function finiteNonNegative(value, label) {
  const number = finiteNumber(value, label);
  assert(number >= 0, `${label} non-negative`);
  return number;
}

function assertSameArray(actual, expected, label) {
  assert(sameJson(actual, expected), `${label} exact order`);
}

function frameTime(actionIndex, offset) {
  return 2 + actionIndex * 10 + offset;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Core v2 accessibility handler invalid: ${message}`);
  }
}
