import { clone, deepFreeze, createTypeSuffixValueAtoms } from '../value-atoms.mjs';

const {
  recordValue,
  arrayValue,
  stringValue,
  finiteNumber,
} = createTypeSuffixValueAtoms(assert);

export const AUTHORING_HANDLER_REVISION = 'patch-map-authoring-handlers/1';

export const AUTHORING_CASE_IDS = Object.freeze([
  'CSM-019',
  'CSM-028',
  'CSM-029',
  'CSM-030',
  'CSM-031',
]);

export const AUTHORING_ACTION_TYPES = Object.freeze([
  'create-element-matrix',
  'edit-position-angle',
  'align-targets',
  'distribute-targets',
  'apply-style-transaction',
  'move-hierarchy',
  'reorder-z',
  'group-targets',
  'duplicate-tree',
  'copy-paste-tree',
  'ungroup-target',
  'probe-declared-failure',
]);

const CASE_ACTIONS = Object.freeze({
  'CSM-019': Object.freeze([
    'create-element-matrix',
    'probe-declared-failure',
  ]),
  'CSM-028': Object.freeze([
    'edit-position-angle',
    'align-targets',
    'distribute-targets',
    'distribute-targets',
    'probe-declared-failure',
  ]),
  'CSM-029': Object.freeze([
    'apply-style-transaction',
    'apply-style-transaction',
    'probe-declared-failure',
  ]),
  'CSM-030': Object.freeze([
    'move-hierarchy',
    'reorder-z',
    'move-hierarchy',
    'probe-declared-failure',
  ]),
  'CSM-031': Object.freeze([
    'group-targets',
    'duplicate-tree',
    'copy-paste-tree',
    'ungroup-target',
    'probe-declared-failure',
  ]),
});

const ELEMENT_KINDS = new Set([
  'item',
  'rect',
  'image',
  'text',
  'group',
  'grid',
  'relations',
]);

export function createAuthoringHandlerEntries(productValue) {
  const product = validateProductAdapter(productValue);
  const states = new WeakMap();
  const handlers = Object.freeze({
    'create-element-matrix': withState(product, states, createElementMatrixAction),
    'edit-position-angle': withState(product, states, editPositionAngleAction),
    'align-targets': withState(product, states, alignTargetsAction),
    'distribute-targets': withState(product, states, distributeTargetsAction),
    'apply-style-transaction': withState(
      product,
      states,
      applyStyleTransactionAction,
    ),
    'move-hierarchy': withState(product, states, moveHierarchyAction),
    'reorder-z': withState(product, states, reorderZAction),
    'group-targets': withState(product, states, groupTargetsAction),
    'duplicate-tree': withState(product, states, duplicateTreeAction),
    'copy-paste-tree': withState(product, states, copyPasteTreeAction),
    'ungroup-target': withState(product, states, ungroupTargetAction),
    'probe-declared-failure': withState(
      product,
      states,
      probeDeclaredFailureAction,
    ),
  });
  return Object.freeze(AUTHORING_ACTION_TYPES.map((type) => Object.freeze([
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
        baseline: null,
        baselineInput: null,
        invalidAttempt: null,
        hierarchyMove: null,
        duplicateFacts: [],
      };
      states.set(context.ensureMainEngine, state);
    }
    assert(state.caseId === context.caseId, 'state case identity');
    return handler(product, state, context, action);
  };
}

async function createElementMatrixAction(product, state, context, action) {
  assert(context.caseId === 'CSM-019', 'create matrix case');
  const operands = exactOperands(action, [
    'idPolicy',
    'kinds',
    'parent',
    'positionWorld',
  ]);
  const kinds = stringArray(operands.kinds, 'create kinds');
  assert(kinds.every((kind) => ELEMENT_KINDS.has(kind)), 'create kinds are supported');
  assert(new Set(kinds).size === kinds.length, 'create kinds are unique');
  assert(operands.parent === null, 'create matrix root parent');
  const positionWorld = pointTuple(operands.positionWorld, 'create position');
  const idPolicy = recordValue(operands.idPolicy, 'create ID policy');
  assertExactKeys(idPolicy, ['prefix', 'uniqueDescendants'], 'create ID policy');
  const prefix = stringValue(idPolicy.prefix, 'create ID prefix');
  assert(idPolicy.uniqueDescendants === true, 'create unique descendants');
  const engine = await ensureBaseline(product, state, context);
  const before = product.observe({ caseId: context.caseId, engine });
  const inputBefore = context.fingerprint(action.operands);
  const results = [];
  const createdIds = [];

  for (const kind of kinds) {
    const id = `${prefix}-${kind}`;
    const result = product.author({
      caseId: context.caseId,
      engine,
      action: {
        type: 'create-element',
        kind,
        id,
        positionWorld,
        parentId: null,
        actionId: `create-matrix:${kind}`,
      },
    });
    if (result.status === 'committed') {
      callSync(engine, 'publishFrame', context.clock.now());
      createdIds.push(id);
    }
    results.push(result);
  }

  const after = product.observe({ caseId: context.caseId, engine });
  const actual = deepFreeze({
    input: inputObservation(inputBefore, context.fingerprint(action.operands)),
    createdIds,
    results,
    before,
    after,
    historyDepthDelta: historyDepth(after) - historyDepth(before),
  });
  return actionOutput(context, action, actual, {
    status: results.every(({ status }) => status === 'committed')
      ? 'committed'
      : 'partial',
    createdIds,
  });
}

async function editPositionAngleAction(product, state, context, action) {
  assert(context.caseId === 'CSM-028', 'position edit case');
  const operands = exactOperands(action, [
    'actionId',
    'angleDegrees',
    'target',
    'x',
    'y',
  ]);
  return executeOne(product, state, context, action, {
    type: 'edit-position-angle',
    target: stringValue(operands.target, 'position target'),
    x: finiteNumber(operands.x, 'position x'),
    y: finiteNumber(operands.y, 'position y'),
    angleDegrees: finiteNumber(operands.angleDegrees, 'position angle'),
    actionId: stringValue(operands.actionId, 'position action ID'),
  });
}

async function alignTargetsAction(product, state, context, action) {
  assert(context.caseId === 'CSM-028', 'align case');
  const operands = exactOperands(action, ['actionId', 'axis', 'targets']);
  return executeOne(product, state, context, action, {
    type: 'align-targets',
    targets: stringArray(operands.targets, 'align targets'),
    axis: stringValue(operands.axis, 'align axis'),
    actionId: stringValue(operands.actionId, 'align action ID'),
  });
}

async function distributeTargetsAction(product, state, context, action) {
  assert(context.caseId === 'CSM-028', 'distribution case');
  const operands = exactOperands(action, [
    'actionId',
    'axis',
    'basis',
    'targets',
  ]);
  assert(operands.basis === 'bounds', 'distribution basis');
  return executeOne(product, state, context, action, {
    type: 'distribute-targets',
    targets: stringArray(operands.targets, 'distribution targets'),
    axis: stringValue(operands.axis, 'distribution axis'),
    basis: 'bounds',
    actionId: stringValue(operands.actionId, 'distribution action ID'),
  });
}

async function applyStyleTransactionAction(product, state, context, action) {
  assert(context.caseId === 'CSM-029', 'style transaction case');
  const operands = exactOperands(action, [
    'actionId',
    'changes',
    'strict',
    'target',
  ]);
  assert(operands.strict === true, 'style transaction strictness');
  const changes = recordValue(operands.changes, 'style changes');
  const output = await executeOne(product, state, context, action, {
    type: 'apply-style',
    target: stringValue(operands.target, 'style target'),
    changes: clone(changes),
    strict: true,
    actionId: stringValue(operands.actionId, 'style action ID'),
  });
  const result = output.actual.result;
  if (result.status === 'rejected') state.invalidAttempt = output.actual;

  const target = currentRecord(
    output.actual.after.dataset,
    stringValue(operands.target, 'style target'),
  );
  const style = recordValue(target.style, 'authored text style');
  const canonicalStyle = {
    ...clone(style),
    ...(style.fill === undefined
      ? {}
      : {
          fill: product.resolveColor({
            value: style.fill,
            path: '$.style.fill',
          }),
        }),
    ...(style.stroke === undefined
      ? {}
      : {
          stroke: product.resolveColor({
            value: style.stroke,
            path: '$.style.stroke',
          }),
        }),
  };
  const actual = deepFreeze({
    ...output.actual,
    canonicalStyle,
  });
  return actionOutput(context, action, actual, {
    status: result.status,
    code: result.code,
  });
}

async function moveHierarchyAction(product, state, context, action) {
  assert(context.caseId === 'CSM-030', 'hierarchy move case');
  const operands = exactOperands(action, [
    'actionId',
    'index',
    'parent',
    'target',
  ]);
  const parent = nullableString(operands.parent, 'hierarchy parent');
  const output = await executeOne(product, state, context, action, {
    type: 'move-hierarchy',
    target: stringValue(operands.target, 'hierarchy target'),
    parentId: parent,
    index: nonNegativeInteger(operands.index, 'hierarchy index'),
    actionId: stringValue(operands.actionId, 'hierarchy action ID'),
  });
  if (action.index === 0) state.hierarchyMove = output.actual;
  if (output.actual.result.status === 'rejected') {
    state.invalidAttempt = output.actual;
  }
  return output;
}

async function reorderZAction(product, state, context, action) {
  assert(context.caseId === 'CSM-030', 'z-order case');
  const operands = exactOperands(action, [
    'actionId',
    'placement',
    'preserveRelativeOrder',
    'targets',
  ]);
  assert(operands.preserveRelativeOrder === true, 'z-order relative order');
  return executeOne(product, state, context, action, {
    type: 'reorder-z',
    targets: stringArray(operands.targets, 'z-order targets'),
    placement: stringValue(operands.placement, 'z-order placement'),
    preserveRelativeOrder: true,
    actionId: stringValue(operands.actionId, 'z-order action ID'),
  });
}

async function groupTargetsAction(product, state, context, action) {
  assert(context.caseId === 'CSM-031', 'group case');
  const operands = exactOperands(action, ['actionId', 'groupId', 'targets']);
  return executeOne(product, state, context, action, {
    type: 'group-targets',
    targets: stringArray(operands.targets, 'group targets'),
    groupId: stringValue(operands.groupId, 'group ID'),
    actionId: stringValue(operands.actionId, 'group action ID'),
  });
}

async function duplicateTreeAction(product, state, context, action) {
  assert(context.caseId === 'CSM-031', 'duplicate case');
  const operands = exactOperands(action, [
    'actionId',
    'offsetWorld',
    'preserveExternalReferences',
    'rewriteInternalReferences',
    'rootId',
    'target',
  ]);
  assert(operands.rewriteInternalReferences === true, 'duplicate internal references');
  assert(operands.preserveExternalReferences === true, 'duplicate external references');
  const output = await executeOne(product, state, context, action, {
    type: 'duplicate-tree',
    target: stringValue(operands.target, 'duplicate target'),
    rootId: stringValue(operands.rootId, 'duplicate root ID'),
    offsetWorld: pointTuple(operands.offsetWorld, 'duplicate offset'),
    rewriteInternalReferences: true,
    preserveExternalReferences: true,
    actionId: stringValue(operands.actionId, 'duplicate action ID'),
  });
  state.duplicateFacts.push(clone(output.actual.result.facts));
  return output;
}

async function copyPasteTreeAction(product, state, context, action) {
  assert(context.caseId === 'CSM-031', 'copy/paste case');
  const operands = exactOperands(action, [
    'actionId',
    'offsetWorld',
    'rootId',
    'target',
  ]);
  const output = await executeOne(product, state, context, action, {
    type: 'copy-paste-tree',
    target: stringValue(operands.target, 'copy/paste target'),
    rootId: stringValue(operands.rootId, 'copy/paste root ID'),
    offsetWorld: pointTuple(operands.offsetWorld, 'copy/paste offset'),
    rewriteInternalReferences: true,
    preserveExternalReferences: true,
    actionId: stringValue(operands.actionId, 'copy/paste action ID'),
  });
  state.duplicateFacts.push(clone(output.actual.result.facts));
  return output;
}

async function ungroupTargetAction(product, state, context, action) {
  assert(context.caseId === 'CSM-031', 'ungroup case');
  const operands = exactOperands(action, ['actionId', 'target']);
  return executeOne(product, state, context, action, {
    type: 'ungroup-target',
    target: stringValue(operands.target, 'ungroup target'),
    actionId: stringValue(operands.actionId, 'ungroup action ID'),
  });
}

async function probeDeclaredFailureAction(product, state, context, action) {
  const operands = exactOperands(action, [
    'afterActionIndex',
    'expectedRollback',
    'injection',
    'isolate',
    'journeyId',
  ]);
  assert(operands.journeyId === context.caseId, 'failure journey identity');
  assert(operands.isolate === true, 'failure isolation');
  assert(
    operands.afterActionIndex === context.actionIndex - 1,
    'failure action boundary',
  );
  recordValue(operands.expectedRollback, 'declared rollback metadata');
  const injection = recordValue(operands.injection, 'declared failure injection');
  const engine = currentEngine(state, 'declared failure');
  let attempt;

  switch (context.caseId) {
    case 'CSM-019':
      attempt = await executeAuthoring(product, context, engine, {
        type: 'create-element',
        kind: 'rect',
        id: 'created-item',
        positionWorld: [400, 300],
        parentId: null,
        actionId: 'failure:duplicate-create',
      });
      break;
    case 'CSM-028': {
      const targets = stringArray(
        context.fixtureParams.targets,
        'distribution fixture targets',
      );
      attempt = await executeAuthoring(product, context, engine, {
        type: 'distribute-targets',
        targets: targets.slice(0, 2),
        axis: 'horizontal',
        basis: 'bounds',
        actionId: 'failure:fewer-than-three',
      });
      break;
    }
    case 'CSM-029':
      attempt = requireAttempt(state.invalidAttempt, 'invalid style attempt');
      break;
    case 'CSM-030':
      attempt = requireAttempt(state.invalidAttempt, 'cycle attempt');
      break;
    case 'CSM-031':
      attempt = await executeAuthoring(product, context, engine, {
        type: 'duplicate-tree',
        target: 'g-copy',
        rootId: 'g-paste',
        offsetWorld: [0, 0],
        rewriteInternalReferences: true,
        preserveExternalReferences: true,
        actionId: 'failure:duplicate-root',
      });
      break;
    default:
      throw new Error(`Unsupported authoring failure case ${String(context.caseId)}`);
  }

  const rollback = rollbackFacts(attempt, context);
  const actual = deepFreeze({
    injection: clone(injection),
    result: clone(attempt.result),
    before: clone(attempt.before),
    after: clone(attempt.after),
    rollback,
    hierarchyMove: state.hierarchyMove === null
      ? null
      : clone(state.hierarchyMove),
    duplicateFacts: clone(state.duplicateFacts),
  });
  return actionOutput(context, action, actual, {
    status: attempt.result.status,
    code: attempt.result.code,
    rollback,
  });
}

async function executeOne(product, state, context, action, productAction) {
  const engine = await ensureBaseline(product, state, context);
  const actual = await executeAuthoring(
    product,
    context,
    engine,
    productAction,
    action.operands,
  );
  return actionOutput(context, action, actual, {
    status: actual.result.status,
    code: actual.result.code,
  });
}

async function executeAuthoring(
  product,
  context,
  engine,
  productAction,
  sourceInput = productAction,
) {
  const before = product.observe({ caseId: context.caseId, engine });
  const inputBefore = context.fingerprint(sourceInput);
  const result = product.author({
    caseId: context.caseId,
    engine,
    action: productAction,
  });
  if (result.status === 'committed') {
    callSync(engine, 'publishFrame', context.clock.now());
  }
  const after = product.observe({ caseId: context.caseId, engine });
  return deepFreeze({
    input: inputObservation(inputBefore, context.fingerprint(sourceInput)),
    productAction: clone(productAction),
    result,
    before,
    after,
    historyDepthDelta: historyDepth(after) - historyDepth(before),
  });
}

async function ensureBaseline(product, state, context) {
  if (state.engine !== null) return state.engine;
  const engine = await context.ensureMainEngine();
  const snapshot = callSync(engine, 'snapshot');
  if (snapshot.lifecycle === 'new') {
    await call(engine, 'initialize', {
      instanceId: `contract-${context.caseId.toLowerCase()}`,
      width: 800,
      height: 600,
      pixelRatio: 1,
      strategy: 'mesh',
      preference: 'webgl',
      antialias: true,
      background: 0xf7f8fa,
    });
  }

  const source = await baselineDataset(context);
  const sourceBefore = context.fingerprint(source);
  const load = callSync(engine, 'loadDataset', source, {
    datasetRef: context.caseId === 'CSM-019'
      ? 'authoring-empty'
      : context.caseId === 'CSM-031'
        ? 'host-supplied-authoring'
        : stringValue(context.hostSupplies.datasetRef, 'host datasetRef'),
  });
  const sourceAfter = context.fingerprint(source);
  const selectedIds = baselineSelection(context);
  if (selectedIds.length > 0) {
    callSync(engine, 'applySelection', {
      op: 'replace',
      ids: selectedIds,
      source: 'programmatic',
    });
  }
  callSync(engine, 'setViewport', { centerWorld: [400, 300], scale: 1 });
  callSync(engine, 'publishFrame', context.clock.now());
  state.engine = engine;
  state.baselineInput = inputObservation(sourceBefore, sourceAfter);
  state.baseline = product.observe({ caseId: context.caseId, engine });
  state.baselineLoad = clone(load);
  return engine;
}

async function baselineDataset(context) {
  if (context.caseId === 'CSM-019') return [];
  if (context.caseId === 'CSM-031') {
    const dataset = context.hostSupplies.dataset;
    assert(Array.isArray(dataset), 'CSM-031 host dataset');
    return clone(dataset);
  }
  const datasetRef = stringValue(context.hostSupplies.datasetRef, 'host datasetRef');
  return context.resolveDataset(datasetRef);
}

function baselineSelection(context) {
  if (Array.isArray(context.hostSupplies.selectionIds)) {
    return stringArray(context.hostSupplies.selectionIds, 'host selection');
  }
  const companion = context.hostSupplies.companionState;
  if (isRecord(companion) && Array.isArray(companion.selectedIds)) {
    return stringArray(companion.selectedIds, 'host companion selection');
  }
  return [];
}

function rollbackFacts(attempt, context) {
  const before = recordValue(attempt.before, 'rollback before');
  const after = recordValue(attempt.after, 'rollback after');
  const beforeSnapshot = recordValue(before.snapshot, 'rollback before snapshot');
  const afterSnapshot = recordValue(after.snapshot, 'rollback after snapshot');
  const sameAuthoritative = sameAuthoritativeState(before, after, context);
  return deepFreeze({
    atomic: sameAuthoritative,
    code: nullableString(attempt.result.code, 'rollback diagnostic code'),
    selectionUnchanged: sameStrings(
      stringArray(beforeSnapshot.selectionIds, 'rollback before selection'),
      stringArray(afterSnapshot.selectionIds, 'rollback after selection'),
    ),
    semanticHashUnchanged:
      beforeSnapshot.semanticHash === afterSnapshot.semanticHash,
    historyDepthDelta:
      historyDepth(after) - historyDepth(before),
    geometryUnchanged:
      context.fingerprint(before.geometry) === context.fingerprint(after.geometry),
    parentBefore: parentId(before, 'rect-b'),
    parentAfter: parentId(after, 'rect-b'),
  });
}

function sameAuthoritativeState(before, after, context) {
  const beforeSnapshot = recordValue(before.snapshot, 'before snapshot');
  const afterSnapshot = recordValue(after.snapshot, 'after snapshot');
  const beforeRevisions = recordValue(beforeSnapshot.revisions, 'before revisions');
  const afterRevisions = recordValue(afterSnapshot.revisions, 'after revisions');
  return beforeSnapshot.semanticHash === afterSnapshot.semanticHash
    && beforeRevisions.sceneRevision === afterRevisions.sceneRevision
    && historyDepth(before) === historyDepth(after)
    && sameStrings(
      stringArray(beforeSnapshot.selectionIds, 'before selection'),
      stringArray(afterSnapshot.selectionIds, 'after selection'),
    )
    && context.fingerprint(before.dataset) === context.fingerprint(after.dataset);
}

function parentId(product, targetId) {
  const semantic = recordValue(product.semantic, 'product semantic');
  const scene = recordValue(semantic.scene, 'semantic scene');
  const nodes = arrayValue(scene.nodes, 'semantic nodes');
  const node = nodes.find((entry) =>
    isRecord(entry)
      && isRecord(entry.target)
      && entry.target.kind === 'element'
      && entry.target.id === targetId);
  if (!isRecord(node)) return null;
  return isRecord(node.parent) && typeof node.parent.id === 'string'
    ? node.parent.id
    : null;
}

function historyDepth(product) {
  const snapshot = recordValue(product.snapshot, 'product snapshot');
  return nonNegativeInteger(snapshot.historyDepth, 'history depth');
}

function currentRecord(datasetValue, id) {
  const dataset = arrayValue(datasetValue, 'product dataset');
  const match = findRecord(dataset, id);
  assert(match !== null, `current record ${id}`);
  return match;
}

function findRecord(records, id) {
  for (const value of records) {
    if (!isRecord(value)) continue;
    if (value.id === id) return value;
    if (Array.isArray(value.children)) {
      const nested = findRecord(value.children, id);
      if (nested !== null) return nested;
    }
  }
  return null;
}

function actionOutput(context, action, actual, host) {
  return deepFreeze({
    actual,
    host: {
      actionIndex: context.actionIndex,
      actionType: action.type,
      ...clone(host),
    },
  });
}

function requireAttempt(value, label) {
  assert(isRecord(value), label);
  assert(isRecord(value.result), `${label} result`);
  assert(isRecord(value.before), `${label} before`);
  assert(isRecord(value.after), `${label} after`);
  return value;
}

function validateProductAdapter(productValue) {
  const product = recordValue(productValue, 'product adapter');
  assertExactKeys(product, ['author', 'observe', 'resolveColor'], 'product adapter');
  for (const method of ['author', 'observe', 'resolveColor']) {
    assert(typeof product[method] === 'function', `product adapter ${method}()`);
  }
  return product;
}

function validateContext(contextValue) {
  const context = recordValue(contextValue, 'handler context');
  assert(AUTHORING_CASE_IDS.includes(context.caseId), 'supported authoring case');
  for (const method of [
    'ensureMainEngine',
    'resolveDataset',
    'fingerprint',
  ]) {
    assert(typeof context[method] === 'function', `handler context ${method}()`);
  }
  assert(isRecord(context.fixtureParams), 'handler fixture params');
  assert(isRecord(context.fixtureProfiles), 'handler fixture profiles');
  assert(isRecord(context.hostSupplies), 'handler host supplies');
  assert(isRecord(context.clock), 'handler clock');
  assert(typeof context.clock.now === 'function', 'handler clock.now()');
  return context;
}

function validateAction(context, actionValue) {
  const action = recordValue(actionValue, 'contract action');
  const expected = CASE_ACTIONS[context.caseId];
  assert(Array.isArray(expected), 'case action trace');
  assert(expected[context.actionIndex] === action.type, 'case action identity');
  assert(action.index === context.actionIndex, 'case action index');
  assert(isRecord(action.operands), 'case action operands');
  return action;
}

function exactOperands(action, keys) {
  const operands = recordValue(action.operands, `${action.type} operands`);
  assertExactKeys(operands, keys, `${action.type} operands`);
  return operands;
}

function inputObservation(beforeFingerprint, afterFingerprint) {
  return deepFreeze({
    beforeFingerprint,
    afterFingerprint,
    unchanged: beforeFingerprint === afterFingerprint,
  });
}

function pointTuple(value, label) {
  const values = arrayValue(value, label);
  assert(values.length === 2, `${label} length`);
  return [
    finiteNumber(values[0], `${label}[0]`),
    finiteNumber(values[1], `${label}[1]`),
  ];
}

function stringArray(value, label) {
  return arrayValue(value, label).map((entry, index) =>
    stringValue(entry, `${label}[${index}]`));
}

function sameStrings(left, right) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function nullableString(value, label) {
  if (value === null) return null;
  return stringValue(value, label);
}



function nonNegativeInteger(value, label) {
  assert(Number.isInteger(value) && value >= 0, `${label} non-negative integer`);
  return value;
}



function currentEngine(state, operation) {
  assert(state.engine !== null, `${operation} Engine exists`);
  return state.engine;
}

function callSync(target, method, ...args) {
  const fn = target?.[method];
  assert(typeof fn === 'function', `product method ${method}()`);
  return fn.apply(target, args);
}

async function call(target, method, ...args) {
  return callSync(target, method, ...args);
}

function assertExactKeys(value, keys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  assert(
    actual.length === expected.length
      && actual.every((key, index) => key === expected[index]),
    `${label} keys`,
  );
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Invalid PatchMap authoring handler: ${message}`);
}
