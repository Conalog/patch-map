import { clone, deepFreeze } from '../value-atoms.mjs';

export const DATA_CLOSURE_ACTION_TYPES = Object.freeze([
  'loadDataset',
  'select',
  'applyInvalidCases',
  'query',
  'loadFreshSessions',
  'validateDuplicateIdentityMatrix',
  'retainTarget',
  'remove',
  'add',
  'patchStaleTarget',
]);

const MISSING_VALUE = Object.freeze({ _availability: 'missing' });

/**
 * Register actual-only DAT-007/008 handlers.
 *
 * Engine capabilities are injected. This module never synthesizes mutations,
 * diagnostics, generated identities, or semantic hashes: unavailable product operations remain observable as
 * UNSUPPORTED_OPERATION instead of being adjusted to contract expectations.
 */
export function createDataClosureHandlerEntries() {
  const states = new WeakMap();
  const handlers = Object.freeze({
    loadDataset: withState(states, loadDatasetAction),
    select: withState(states, selectAction),
    applyInvalidCases: withState(states, applyInvalidCasesAction),
    query: withState(states, queryAction),
    loadFreshSessions: withState(states, loadFreshSessionsAction),
    validateDuplicateIdentityMatrix: withState(
      states,
      validateDuplicateIdentityMatrixAction,
    ),
    retainTarget: withState(states, retainTargetAction),
    remove: withState(states, removeAction),
    add: withState(states, addAction),
    patchStaleTarget: withState(states, patchStaleTargetAction),
  });

  return Object.freeze(DATA_CLOSURE_ACTION_TYPES.map((type) => Object.freeze([
    `contract/${type}`,
    handlers[type],
  ])));
}

function withState(states, handler) {
  return async (context, action) => {
    validateContext(context);
    const key = context.resolveDataset;
    let state = states.get(key);
    if (state === undefined) {
      state = createCaseState(context.caseId);
      states.set(key, state);
    }
    assert(state.caseId === context.caseId, 'execution state crossed case identity');
    assert(
      state.caseId === 'DAT-007' || state.caseId === 'DAT-008',
      `unsupported case ${String(state.caseId)}`,
    );
    return handler(state, context, action);
  };
}

function createCaseState(caseId) {
  return {
    caseId: stringValue(caseId, 'context.caseId'),
    engine: null,
    invalidCases: null,
    sessions: null,
    duplicates: null,
    retainedTarget: null,
    mutation: {
      remove: null,
      add: null,
      replacement: null,
      staleTarget: null,
    },
  };
}

async function loadDatasetAction(state, context, action) {
  if (state.caseId === 'DAT-007') return loadInteractiveDataset(state, context, action);
  throw new Error('PatchMap data-closure handler invalid: loadDataset is not used by DAT-008');
}

async function loadInteractiveDataset(state, context, action) {
  const operands = exactOperands(action, ['datasetRef', 'timeMs']);
  const datasetRef = stringValue(operands.datasetRef, 'loadDataset.datasetRef');
  const timeMs = finiteNumber(operands.timeMs, 'loadDataset.timeMs');
  await advanceTo(context, timeMs);
  const dataset = await context.resolveDataset(datasetRef);
  const beforeFingerprint = context.fingerprint(dataset);
  const engine = await ensureInitializedMainEngine(state, context);
  let result;
  if (typeof engine.submitDataset === 'function') {
    result = await engine.submitDataset({
      requestId: `${state.caseId.toLowerCase()}-initial`,
      datasetRef,
      input: Promise.resolve(dataset),
    });
    assert(result?.status === 'committed', 'initial submitDataset must commit');
  } else {
    result = await call(engine, 'loadDataset', dataset, { datasetRef });
  }
  const afterFingerprint = context.fingerprint(dataset);
  const snapshot = snapshotEngine(engine);
  return {
    actual: {
      datasetRef,
      loadedAtMs: timeMs,
      sceneRevision: sceneRevision(snapshot),
      result: clone(result),
      snapshot,
      input: {
        beforeFingerprint,
        afterFingerprint,
        unchanged: beforeFingerprint === afterFingerprint,
      },
    },
    captureSource: snapshotCapture(snapshot),
  };
}

async function selectAction(state, _context, action) {
  assert(state.caseId === 'DAT-007', 'select case');
  const operands = exactOperands(action, ['ids']);
  const ids = stringArray(operands.ids, 'select.ids');
  const engine = requireEngine(state, 'select');
  const selected = clone(await call(engine, 'select', ids));
  const snapshot = snapshotEngine(engine);
  return {
    actual: {
      sceneRevision: sceneRevision(snapshot),
      requestedIds: ids,
      selectedIds: selected,
      snapshot,
    },
    captureSource: snapshotCapture(snapshot),
  };
}

async function applyInvalidCasesAction(state, context, action) {
  assert(state.caseId === 'DAT-007', 'applyInvalidCases case');
  const operands = exactOperands(action, ['strict', 'valueRef']);
  assert(operands.strict === true, 'applyInvalidCases.strict');
  const valueRef = stringValue(operands.valueRef, 'applyInvalidCases.valueRef');
  const params = recordValue(context.fixtureParams, 'fixture params');
  const descriptors = arrayValue(params[valueRef], `fixture ${valueRef}`);
  const engine = requireEngine(state, 'applyInvalidCases');
  const descriptorFingerprintBefore = context.fingerprint(descriptors);
  const authorityBefore = await engineAuthority(engine, context);
  const results = [];

  for (const rawDescriptor of descriptors) {
    const descriptor = recordValue(rawDescriptor, `${valueRef} entry`);
    const id = stringValue(descriptor.id, `${valueRef}.id`);
    const dataset = clone(arrayValue(descriptor.dataset, `${valueRef}.${id}.dataset`));
    const inputBefore = context.fingerprint(dataset);
    const before = await engineAuthority(engine, context);
    let applied = false;
    let result = null;
    let diagnostic = null;
    try {
      result = clone(await call(engine, 'loadDataset', dataset, { datasetRef: `${valueRef}:${id}` }));
      applied = true;
    } catch (error) {
      diagnostic = actualDiagnostic(error, 'loadDataset');
    }
    const after = await engineAuthority(engine, context);
    const inputAfter = context.fingerprint(dataset);
    const publicationCount = Math.max(0, after.sceneRevision - before.sceneRevision);
    results.push({
      id,
      applied,
      result,
      diagnostic,
      pathAware: typeof diagnostic?.datasetPath === 'string',
      publicationCount,
      authoritativeSceneUnchanged: before.fingerprint === after.fingerprint,
      inputUnchanged: inputBefore === inputAfter,
      before,
      after,
    });
  }

  const descriptorFingerprintAfter = context.fingerprint(params[valueRef]);
  const authorityAfter = await engineAuthority(engine, context);
  const actual = deepFreeze({
    valueRef,
    sceneRevision: authorityAfter.sceneRevision,
    count: results.length,
    pathAwareCount: results.filter(({ pathAware }) => pathAware).length,
    acceptedCount: results.filter(({ applied }) => applied).length,
    partialPublicationCount: results.reduce(
      (total, { publicationCount }) => total + publicationCount,
      0,
    ),
    results,
    authorityBefore,
    authorityAfter,
    descriptorInput: {
      beforeFingerprint: descriptorFingerprintBefore,
      afterFingerprint: descriptorFingerprintAfter,
      unchanged: descriptorFingerprintBefore === descriptorFingerprintAfter,
    },
  });
  state.invalidCases = actual;
  return { actual: clone(actual), captureSource: snapshotCapture(authorityAfter.snapshot) };
}

async function queryAction(state, _context, action) {
  assert(state.caseId === 'DAT-007', 'query case');
  const operands = exactOperands(action, ['id']);
  const id = stringValue(operands.id, 'query.id');
  const engine = requireEngine(state, 'query');
  const value = clone(await call(engine, 'query', { id }));
  const snapshot = snapshotEngine(engine);
  return {
    actual: { id, value, found: value !== null, sceneRevision: sceneRevision(snapshot), snapshot },
    captureSource: snapshotCapture(snapshot),
  };
}

async function loadFreshSessionsAction(state, context, action) {
  assert(state.caseId === 'DAT-008', 'loadFreshSessions case');
  const operands = exactOperands(action, ['count', 'datasetId']);
  const count = positiveInteger(operands.count, 'loadFreshSessions.count');
  const datasetId = stringValue(operands.datasetId, 'loadFreshSessions.datasetId');
  const dataset = await context.resolveDataset(datasetId);
  const inputBefore = context.fingerprint(dataset);
  const sessions = [];

  for (let session = 1; session <= count; session += 1) {
    const engine = await context.ensureSessionEngine(session);
    await ensureInitialized(engine, `${state.caseId.toLowerCase()}-session-${session}`);
    const result = await call(engine, 'loadDataset', dataset, { datasetRef: datasetId });
    const exported = clone(await call(engine, 'exportDataset'));
    const snapshot = snapshotEngine(engine);
    sessions.push({
      session,
      semanticHash: nullableString(result.semanticHash, `session ${session} semanticHash`),
      rootIds: clone(result.rootIds),
      exported,
      snapshot,
    });
    state.engine = engine;
  }

  const rootOrders = sessions.map(({ rootIds }) => rootIds);
  const firstOrder = rootOrders[0] ?? [];
  const inputAfter = context.fingerprint(dataset);
  const actual = deepFreeze({
    count,
    datasetId,
    sceneRevision: sceneRevision(sessions.at(-1)?.snapshot),
    semanticHashes: sessions.map(({ semanticHash }) => semanticHash),
    rootOrders,
    generatedIds: firstOrder.filter((id) => String(id).startsWith('@element:')),
    generatedIdsStable: rootOrders.every((order) => sameJson(order, firstOrder)),
    equalZOrder: clone(firstOrder),
    sessions,
    input: {
      beforeFingerprint: inputBefore,
      afterFingerprint: inputAfter,
      unchanged: inputBefore === inputAfter,
    },
  });
  state.sessions = actual;
  return { actual: clone(actual), captureSource: clone(actual) };
}

async function validateDuplicateIdentityMatrixAction(state, context, action) {
  assert(state.caseId === 'DAT-008', 'validateDuplicateIdentityMatrix case');
  const operands = exactOperands(action, ['strict', 'valueRef']);
  assert(operands.strict === true, 'validateDuplicateIdentityMatrix.strict');
  const valueRef = stringValue(operands.valueRef, 'validateDuplicateIdentityMatrix.valueRef');
  const params = recordValue(context.fixtureParams, 'fixture params');
  const matrix = recordValue(params[valueRef], `fixture ${valueRef}`);
  const engine = requireEngine(state, 'validateDuplicateIdentityMatrix');
  const authorityBefore = await engineAuthority(engine, context);
  const element = await attemptDataset(
    engine,
    context,
    matrix.duplicateElements,
    `${valueRef}:element`,
  );
  const component = await attemptDataset(
    engine,
    context,
    matrix.duplicateComponents,
    `${valueRef}:component`,
  );
  const authorityAfter = await engineAuthority(engine, context);
  const actual = deepFreeze({
    valueRef,
    sceneRevision: authorityAfter.sceneRevision,
    element,
    component,
    authoritativeSceneUnchanged: authorityBefore.fingerprint === authorityAfter.fingerprint,
    authorityBefore,
    authorityAfter,
  });
  state.duplicates = actual;
  return { actual: clone(actual), captureSource: clone(actual) };
}

async function retainTargetAction(state, _context, action) {
  assert(state.caseId === 'DAT-008', 'retainTarget case');
  const operands = exactOperands(action, ['id']);
  const id = stringValue(operands.id, 'retainTarget.id');
  const engine = requireEngine(state, 'retainTarget');
  const target = await call(engine, 'query', { id });
  assert(isRecord(target), `retainTarget ${id} must exist`);
  state.retainedTarget = { id, value: target };
  const snapshot = snapshotEngine(engine);
  return {
    actual: { id, target: clone(target), sceneRevision: sceneRevision(snapshot) },
    captureSource: { target: clone(target) },
  };
}

async function removeAction(state, _context, action) {
  assert(state.caseId === 'DAT-008', 'remove case');
  const operands = exactOperands(action, ['id']);
  const id = stringValue(operands.id, 'remove.id');
  const engine = requireEngine(state, 'remove');
  const before = snapshotEngine(engine);
  let supported = false;
  let applied = false;
  let result = null;
  let diagnostic = unsupportedDiagnostic('remove');
  if (typeof engine.remove === 'function') {
    supported = true;
    try {
      result = clone(await engine.remove({ id }));
      applied = true;
      diagnostic = null;
    } catch (error) {
      diagnostic = actualDiagnostic(error, 'remove');
    }
  }
  const after = snapshotEngine(engine);
  const actual = deepFreeze({
    id,
    supported,
    applied,
    result,
    diagnostic,
    sceneRevision: sceneRevision(after),
    authoritativeSceneUnchanged: sameJson(before, after),
    before,
    after,
  });
  state.mutation.remove = actual;
  return { actual: clone(actual), captureSource: snapshotCapture(after) };
}

async function addAction(state, _context, action) {
  assert(state.caseId === 'DAT-008', 'add case');
  const operands = exactOperands(action, ['record']);
  const record = clone(recordValue(operands.record, 'add.record'));
  const id = stringValue(record.id, 'add.record.id');
  const engine = requireEngine(state, 'add');
  const before = snapshotEngine(engine);
  let supported = false;
  let applied = false;
  let result = null;
  let diagnostic = unsupportedDiagnostic('add');
  if (typeof engine.add === 'function') {
    supported = true;
    try {
      result = clone(await engine.add(record));
      applied = true;
      diagnostic = null;
    } catch (error) {
      diagnostic = actualDiagnostic(error, 'add');
    }
  }
  const current = clone(await call(engine, 'query', { id }));
  const replacement = replacementProjection(current);
  const after = snapshotEngine(engine);
  const actual = deepFreeze({
    id,
    supported,
    applied,
    result,
    diagnostic,
    replacement,
    sceneRevision: sceneRevision(after),
    authoritativeSceneUnchanged: sameJson(before, after),
    before,
    after,
  });
  state.mutation.add = actual;
  state.mutation.replacement = replacement;
  return { actual: clone(actual), captureSource: { replacement: clone(replacement) } };
}

async function patchStaleTargetAction(state, _context, action) {
  assert(state.caseId === 'DAT-008', 'patchStaleTarget case');
  const operands = exactOperands(action, ['path', 'value']);
  const path = stringArray(operands.path, 'patchStaleTarget.path');
  const value = clone(operands.value);
  const engine = requireEngine(state, 'patchStaleTarget');
  assert(state.retainedTarget !== null, 'patchStaleTarget requires retained target');
  const current = await call(engine, 'query', { id: state.retainedTarget.id });
  const staleByIdentity = current !== null && current !== state.retainedTarget.value;
  let supported = false;
  let applied = false;
  let result = null;
  let diagnostic = unsupportedDiagnostic('patchStaleTarget');
  if (typeof engine.patchTarget === 'function') {
    supported = true;
    try {
      result = clone(await engine.patchTarget(state.retainedTarget.value, path, value));
      applied = true;
      diagnostic = null;
    } catch (error) {
      diagnostic = actualDiagnostic(error, 'patchStaleTarget');
    }
  }
  const replacement = replacementProjection(clone(current));
  const snapshot = snapshotEngine(engine);
  const actual = deepFreeze({
    path,
    value,
    supported,
    applied,
    result,
    diagnostic,
    staleByIdentity,
    replacement,
    sceneRevision: sceneRevision(snapshot),
  });
  state.mutation.staleTarget = actual;
  state.mutation.replacement = replacement;
  return { actual: clone(actual), captureSource: { replacement: clone(replacement) } };
}

async function attemptDataset(engine, context, value, datasetRef) {
  const dataset = clone(arrayValue(value, datasetRef));
  const inputBefore = context.fingerprint(dataset);
  const before = await engineAuthority(engine, context);
  let applied = false;
  let result = null;
  let diagnostic = null;
  try {
    result = clone(await call(engine, 'loadDataset', dataset, { datasetRef }));
    applied = true;
  } catch (error) {
    diagnostic = actualDiagnostic(error, 'loadDataset');
  }
  const after = await engineAuthority(engine, context);
  const inputAfter = context.fingerprint(dataset);
  return deepFreeze({
    applied,
    result,
    diagnostic,
    code: diagnostic?.code ?? null,
    path: diagnostic?.datasetPath ?? null,
    publicationCount: Math.max(0, after.sceneRevision - before.sceneRevision),
    authoritativeSceneUnchanged: before.fingerprint === after.fingerprint,
    inputUnchanged: inputBefore === inputAfter,
  });
}

async function ensureInitializedMainEngine(state, context) {
  const engine = await context.ensureMainEngine();
  await ensureInitialized(engine, `${state.caseId.toLowerCase()}-main`);
  state.engine = engine;
  return engine;
}

async function ensureInitialized(engine, instanceId) {
  const before = snapshotEngine(engine);
  if (before.lifecycle === 'new') {
    await call(engine, 'initialize', {
      instanceId,
      width: 800,
      height: 600,
      pixelRatio: 1,
      strategy: 'mesh',
      preference: 'webgl',
    });
  }
}

function requireEngine(state, operation) {
  assert(isRecord(state.engine), `${operation} requires an initialized engine`);
  return state.engine;
}

async function engineAuthority(engine, context) {
  const snapshot = snapshotEngine(engine);
  const exported = clone(await call(engine, 'exportDataset'));
  return deepFreeze({
    sceneRevision: sceneRevision(snapshot),
    snapshot,
    exported,
    fingerprint: context.fingerprint({ snapshot, exported }),
  });
}

function snapshotCapture(snapshot) {
  return {
    view: clone(snapshot.viewport),
    semanticHash: snapshot.semanticHash ?? null,
    snapshot: clone(snapshot),
  };
}

function replacementProjection(value) {
  if (!isRecord(value)) {
    return { id: null, attrs: { x: MISSING_VALUE }, _availability: 'missing-target' };
  }
  const attrs = isRecord(value.attrs) ? clone(value.attrs) : {};
  if (!Object.hasOwn(attrs, 'x')) attrs.x = clone(MISSING_VALUE);
  return {
    ...clone(value),
    id: typeof value.id === 'string' ? value.id : null,
    attrs,
  };
}

function unsupportedDiagnostic(operation) {
  return {
    name: 'PatchMapUnsupportedOperation',
    code: 'UNSUPPORTED_OPERATION',
    category: 'UNSUPPORTED_RUNTIME',
    operation,
    message: `${operation} is not exposed by the PatchMap engine seam`,
  };
}

function actualDiagnostic(error, operation) {
  const source = isRecord(error?.diagnostic) ? error.diagnostic : error;
  const inputPath = typeof source?.inputPath === 'string' ? source.inputPath : undefined;
  const datasetPath = typeof source?.datasetPath === 'string' ? source.datasetPath : inputPath;
  return {
    name: error instanceof Error ? error.name : typeof error,
    code: typeof source?.code === 'string' ? source.code : 'UNKNOWN_FAILURE',
    ...(typeof source?.category === 'string' ? { category: source.category } : {}),
    operation: typeof source?.operation === 'string' ? source.operation : operation,
    ...(datasetPath === undefined ? {} : { path: datasetPath, datasetPath }),
    ...(typeof source?.appliedCount === 'number' ? { appliedCount: source.appliedCount } : {}),
    ...(typeof source?.missingCount === 'number' ? { missingCount: source.missingCount } : {}),
    ...(typeof source?.unchangedCount === 'number' ? { unchangedCount: source.unchangedCount } : {}),
    message: error instanceof Error ? error.message : String(error),
  };
}

async function advanceTo(context, timeMs) {
  const current = finiteNumber(context.clock.now(), 'clock.now()');
  assert(timeMs >= current, `clock cannot move backwards from ${current} to ${timeMs}`);
  await context.clock.advanceTo(timeMs);
}

async function call(target, method, ...args) {
  assert(isRecord(target), `${method} target must be an object`);
  assert(typeof target[method] === 'function', `engine must expose ${method}()`);
  return target[method](...args);
}

function snapshotEngine(engine) {
  assert(isRecord(engine) && typeof engine.snapshot === 'function', 'engine must expose snapshot()');
  return clone(engine.snapshot());
}

function sceneRevision(snapshot) {
  if (snapshot === undefined) return 0;
  const revisions = recordValue(snapshot.revisions, 'snapshot.revisions');
  return nonNegativeInteger(revisions.sceneRevision, 'snapshot sceneRevision');
}

function validateContext(context) {
  assert(isRecord(context), 'handler context must be an object');
  for (const method of [
    'ensureMainEngine',
    'ensureSessionEngine',
    'resolveDataset',
    'fingerprint',
  ]) {
    assert(typeof context[method] === 'function', `context must expose ${method}()`);
  }
  assert(isRecord(context.clock), 'context must expose a clock');
}

function exactOperands(action, keys) {
  const operands = recordValue(action.operands, `${action.type} operands`);
  assert(sameStrings(Object.keys(operands).sort(), [...keys].sort()), `${action.type} operand keys`);
  return operands;
}

function stringArray(value, label) {
  return arrayValue(value, label).map((entry, index) => stringValue(entry, `${label}[${index}]`));
}

function arrayValue(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  return value;
}

function recordValue(value, label) {
  assert(isRecord(value), `${label} must be an object`);
  return value;
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} must be a non-empty string`);
  return value;
}

function nullableString(value, label) {
  assert(value === null || (typeof value === 'string' && value.length > 0), `${label} string or null`);
  return value;
}

function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} must be finite`);
  return value;
}

function positiveInteger(value, label) {
  assert(Number.isSafeInteger(value) && value > 0, `${label} must be a positive integer`);
  return value;
}

function nonNegativeInteger(value, label) {
  assert(Number.isSafeInteger(value) && value >= 0, `${label} must be a non-negative integer`);
  return value;
}

function sameStrings(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}


function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`PatchMap data-closure handler invalid: ${message}`);
}
