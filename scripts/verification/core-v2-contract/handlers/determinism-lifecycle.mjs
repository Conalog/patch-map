export const DETERMINISM_LIFECYCLE_HANDLER_REVISION =
  'core-v2-determinism-lifecycle-handlers/1';

export const DETERMINISM_LIFECYCLE_CASE_IDS = Object.freeze([
  'DET-001',
  'DET-002',
  'DET-003',
  'ANI-003',
  'LIF-006',
]);

export const DETERMINISM_LIFECYCLE_ACTION_TYPES = Object.freeze([
  'hash-caller-input',
  'load-dataset',
  'mutate-caller-input',
  'snapshot-scene',
  'run-fresh-session',
  'compare-normalized-observation',
  'generate-seeded-scene',
  'advance-seeded-action',
  'regenerate-seeded-scene',
  'patch',
  'advanceClock',
  'undo',
  'redo',
  'replaceDataset',
  'destroy',
  'loadDataset',
  'startAnimation',
  'startPendingAssetLoad',
  'startViewportDeceleration',
  'beginPointerGesture',
  'startExtraction',
  'setDocumentVisibility',
  'publishFrame',
]);

const CASE_ACTIONS = Object.freeze({
  'DET-001': Object.freeze([
    'hash-caller-input',
    'load-dataset',
    'hash-caller-input',
    'mutate-caller-input',
    'hash-caller-input',
    'snapshot-scene',
  ]),
  'DET-002': Object.freeze([
    'run-fresh-session',
    'run-fresh-session',
    'compare-normalized-observation',
  ]),
  'DET-003': Object.freeze([
    'generate-seeded-scene',
    'advance-seeded-action',
    'regenerate-seeded-scene',
  ]),
  'ANI-003': Object.freeze([
    'patch',
    'advanceClock',
    'undo',
    'redo',
    'replaceDataset',
    'destroy',
    'advanceClock',
  ]),
  'LIF-006': Object.freeze([
    'loadDataset',
    'startAnimation',
    'startPendingAssetLoad',
    'startViewportDeceleration',
    'beginPointerGesture',
    'startExtraction',
    'setDocumentVisibility',
    'setDocumentVisibility',
    'publishFrame',
  ]),
});

export function createDeterminismLifecycleHandlerEntries(productValue) {
  const product = validateProduct(productValue);
  const states = new WeakMap();
  const handlers = {
    'hash-caller-input': hashCallerInput,
    'load-dataset': loadCallerDataset,
    'mutate-caller-input': mutateCallerInput,
    'snapshot-scene': snapshotCallerScene,
    'run-fresh-session': runFreshSession,
    'compare-normalized-observation': compareNormalizedObservation,
    'generate-seeded-scene': generateSeededScene,
    'advance-seeded-action': advanceSeededAction,
    'regenerate-seeded-scene': regenerateSeededScene,
    patch: patchAnimationDestination,
    advanceClock,
    undo: undoAnimation,
    redo: redoAnimation,
    replaceDataset: replaceAnimationDataset,
    destroy: destroyAnimationEngine,
    loadDataset: loadLifecycleDataset,
    startAnimation,
    startPendingAssetLoad,
    startViewportDeceleration,
    beginPointerGesture,
    startExtraction,
    setDocumentVisibility,
    publishFrame: publishLifecycleFrame,
  };
  return Object.freeze(DETERMINISM_LIFECYCLE_ACTION_TYPES.map((type) =>
    Object.freeze([
      `contract/${type}`,
      withState(product, states, handlers[type]),
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
        baselineLoaded: false,
        callerInput: null,
        callerDatasetRef: null,
        inputHashes: new Map(),
        freshSessions: new Map(),
        seededHashes: new Map(),
        seededActionIndices: [],
        pageTokens: new Map(),
        frameRevisionAtDestroy: null,
      };
      states.set(context.ensureMainEngine, state);
    }
    assert(state.caseId === context.caseId, 'state case identity');
    return handler(product, state, context, action);
  };
}

async function hashCallerInput(_product, state, context, action) {
  assert(context.caseId === 'DET-001', 'hash caller case');
  const operands = exactOperands(action, ['algorithm', 'label']);
  assert(stringValue(operands.algorithm, 'hash algorithm') === 'sha256', 'hash algorithm');
  const label = stringValue(operands.label, 'hash label');
  await ensureCallerInput(state, context);
  const hash = context.fingerprint(state.callerInput);
  state.inputHashes.set(label, hash);
  return {
    actual: {
      label,
      algorithm: 'sha256',
      hash,
      hashes: Object.fromEntries(state.inputHashes),
    },
  };
}

async function loadCallerDataset(product, state, context, action) {
  assert(context.caseId === 'DET-001', 'load caller case');
  const operands = exactOperands(action, ['datasetRef']);
  const datasetRef = stringValue(operands.datasetRef, 'caller datasetRef');
  await ensureCallerInput(state, context, datasetRef);
  const engine = await ensureInitializedMain(state, context);
  const beforeFingerprint = context.fingerprint(state.callerInput);
  const result = callSync(engine, 'loadDataset', state.callerInput, { datasetRef });
  callSync(engine, 'publishFrame', context.clock.now());
  const afterFingerprint = context.fingerprint(state.callerInput);
  state.baselineLoaded = true;
  return {
    actual: {
      datasetRef,
      result: clone(result),
      input: inputObservation(beforeFingerprint, afterFingerprint),
      product: observe(product, context, engine),
    },
  };
}

async function mutateCallerInput(_product, state, context, action) {
  assert(context.caseId === 'DET-001', 'mutate caller case');
  const operands = exactOperands(action, ['path', 'value']);
  await ensureCallerInput(state, context);
  const path = pathArray(operands.path, 'caller mutation path');
  const beforeHash = context.fingerprint(state.callerInput);
  setAtPath(state.callerInput, path, clone(operands.value));
  const afterHash = context.fingerprint(state.callerInput);
  return {
    actual: {
      path: clone(path),
      value: clone(operands.value),
      beforeHash,
      afterHash,
      changed: beforeHash !== afterHash,
    },
  };
}

async function snapshotCallerScene(product, state, context, action) {
  assert(context.caseId === 'DET-001', 'snapshot caller case');
  const operands = exactOperands(action, ['revision']);
  const requestedRevision = positiveInteger(operands.revision, 'snapshot revision');
  const engine = currentEngine(state, 'snapshot-scene');
  const observed = observe(product, context, engine);
  return {
    actual: {
      requestedRevision,
      inputHashes: Object.fromEntries(state.inputHashes),
      product: observed,
    },
    captureSource: observed,
  };
}

async function runFreshSession(product, state, context, action) {
  assert(context.caseId === 'DET-002', 'fresh session case');
  const operands = exactOperands(action, ['datasetRef', 'seed', 'session']);
  const datasetRef = stringValue(operands.datasetRef, 'fresh datasetRef');
  const seed = uint32(operands.seed, 'fresh seed');
  const session = positiveInteger(operands.session, 'fresh session');
  assert(!state.freshSessions.has(session), 'fresh session uniqueness');
  const record = recordValue(
    await context.createEngine(`determinism:fresh:${session}`),
    'fresh engine record',
  );
  const engine = record.engine;
  let release = null;
  try {
    await initializeEngine(engine, `det-fresh-${session}`);
    const source = await context.resolveDataset(datasetRef);
    const dataset = clone(source);
    const inputBefore = context.fingerprint(dataset);
    const events = [];
    const unbinds = [
      bindEngineEvent(engine, 'sceneCommitted', events),
      bindEngineEvent(engine, 'frame', events),
      bindEngineEvent(engine, 'selectionChanged', events),
      bindEngineEvent(engine, 'diagnostic', events),
    ];
    try {
      callSync(engine, 'loadDataset', dataset, { datasetRef });
      callSync(engine, 'publishFrame', 0);
    } finally {
      for (const unbind of unbinds) unbind();
    }
    const inputAfter = context.fingerprint(dataset);
    const observed = observe(product, context, engine);
    const normalized = normalizeFreshProduct(observed, events, seed);
    const sessionResult = {
      session,
      seed,
      datasetRef,
      input: inputObservation(inputBefore, inputAfter),
      product: observed,
      normalized,
      normalizedDigest: context.fingerprint(normalized),
      publishedTupleOrder: Object.keys(recordValue(
        recordValue(observed.snapshot, 'fresh snapshot').publishedTuple,
        'fresh published tuple',
      )),
      events: clone(events),
    };
    state.freshSessions.set(session, sessionResult);
    return {
      actual: clone(sessionResult),
      captureSource: normalized,
    };
  } finally {
    release = await context.releaseEngine(engine, `fresh-session-${session}`);
    const stored = state.freshSessions.get(session);
    if (stored !== undefined) stored.release = clone(release);
  }
}

async function compareNormalizedObservation(_product, state, context, action) {
  assert(context.caseId === 'DET-002', 'compare fresh case');
  const operands = exactOperands(action, ['exclude', 'left', 'right']);
  const leftId = positiveInteger(operands.left, 'fresh compare left');
  const rightId = positiveInteger(operands.right, 'fresh compare right');
  const exclude = stringArray(operands.exclude, 'fresh compare exclude');
  const left = requiredMapValue(state.freshSessions, leftId, 'fresh left');
  const right = requiredMapValue(state.freshSessions, rightId, 'fresh right');
  const normalizedLeft = removePaths(clone(left.normalized), exclude);
  const normalizedRight = removePaths(clone(right.normalized), exclude);
  const differences = semanticDifferences(normalizedLeft, normalizedRight);
  return {
    actual: {
      left: leftId,
      right: rightId,
      exclude: clone(exclude),
      leftDigest: context.fingerprint(normalizedLeft),
      rightDigest: context.fingerprint(normalizedRight),
      semanticDiffCount: differences.length,
      differences,
      publishedTupleOrder: clone(left.publishedTupleOrder),
      sessions: clone([...state.freshSessions.values()]),
    },
  };
}

async function generateSeededScene(product, state, context, action) {
  assert(context.caseId === 'DET-003', 'generate seeded case');
  const operands = exactOperands(action, [
    'actionIndex',
    'generatorRef',
    'seed',
    'size',
  ]);
  const generatorRef = stringValue(operands.generatorRef, 'generatorRef');
  assert(generatorRef === 'synthetic-scene', 'generatorRef value');
  const seed = uint32(operands.seed, 'seed');
  const size = positiveInteger(operands.size, 'size');
  const actionIndex = nonNegativeInteger(operands.actionIndex, 'actionIndex');
  return loadSeededAction(product, state, context, {
    generatorRef,
    seed,
    size,
    actionIndex,
    regenerated: false,
  });
}

async function advanceSeededAction(product, state, context, action) {
  assert(context.caseId === 'DET-003', 'advance seeded case');
  const operands = exactOperands(action, ['actionIndices', 'seed']);
  const seed = uint32(operands.seed, 'advance seed');
  const actionIndices = numberArray(operands.actionIndices, 'actionIndices')
    .map((value) => nonNegativeInteger(value, 'action index'));
  const size = positiveInteger(
    recordValue(context.fixtureParams, 'DET-003 fixture params').size,
    'fixture size',
  );
  const results = [];
  for (const actionIndex of actionIndices) {
    results.push(await loadSeededAction(product, state, context, {
      generatorRef: 'synthetic-scene',
      seed,
      size,
      actionIndex,
      regenerated: false,
    }));
  }
  return {
    actual: {
      seed,
      actionIndices: clone(actionIndices),
      results: results.map(({ actual }) => clone(actual)),
      semanticHashes: Object.fromEntries(state.seededHashes),
    },
  };
}

async function regenerateSeededScene(product, state, context, action) {
  assert(context.caseId === 'DET-003', 'regenerate seeded case');
  const operands = exactOperands(action, [
    'actionIndex',
    'generatorRef',
    'seed',
    'size',
  ]);
  const result = await loadSeededAction(product, state, context, {
    generatorRef: stringValue(operands.generatorRef, 'regenerate generatorRef'),
    seed: uint32(operands.seed, 'regenerate seed'),
    size: positiveInteger(operands.size, 'regenerate size'),
    actionIndex: nonNegativeInteger(operands.actionIndex, 'regenerate actionIndex'),
    regenerated: true,
  });
  return {
    ...result,
    actual: {
      ...result.actual,
      actionIndices: clone(state.seededActionIndices),
      generatedSemanticHashes: Object.fromEntries(state.seededHashes),
    },
  };
}

async function loadSeededAction(product, state, context, input) {
  assert(input.generatorRef === 'synthetic-scene', 'seeded generator');
  const engine = await ensureInitializedMain(state, context);
  const dataset = product.createSeededScene({
    caseId: 'DET-003',
    size: input.size,
    seed: input.seed,
    actionIndex: input.actionIndex,
  });
  const beforeFingerprint = context.fingerprint(dataset);
  const datasetRef = `synthetic:${input.seed}:${input.size}:${input.actionIndex}`;
  const loaded = callSync(engine, 'loadDataset', dataset, { datasetRef });
  const frameTime = Math.max(context.clock.now(), input.actionIndex);
  callSync(engine, 'publishFrame', frameTime);
  const afterFingerprint = context.fingerprint(dataset);
  const observed = observe(product, context, engine);
  const semanticHash = nullableString(
    recordValue(observed.snapshot, 'seeded snapshot').semanticHash,
    'seeded semanticHash',
  );
  if (input.regenerated) {
    state.seededHashes.set(`regenerated:${input.actionIndex}`, semanticHash);
  } else {
    state.seededHashes.set(String(input.actionIndex), semanticHash);
    if (!state.seededActionIndices.includes(input.actionIndex)) {
      state.seededActionIndices.push(input.actionIndex);
    }
  }
  return {
    actual: {
      generatorRef: input.generatorRef,
      seed: input.seed,
      size: input.size,
      actionIndex: input.actionIndex,
      regenerated: input.regenerated,
      semanticHash,
      input: inputObservation(beforeFingerprint, afterFingerprint),
      loaded: clone(loaded),
      product: observed,
    },
    captureSource: observed,
  };
}

async function patchAnimationDestination(product, state, context, action) {
  assert(context.caseId === 'ANI-003', 'animation patch case');
  const operands = exactOperands(action, [
    'actionId',
    'changes',
    'recordHistory',
    'target',
    'timeMs',
  ]);
  assert(operands.recordHistory === true, 'animation patch history');
  await advanceTo(context, finiteNumber(operands.timeMs, 'animation patch time'));
  const engine = await ensureBaseline(state, context, 'interactive-scene');
  const target = ownerComponentTarget(operands.target, 'animation target');
  const actionId = stringValue(operands.actionId, 'animation actionId');
  const changes = exactRecord(
    operands.changes,
    ['size'],
    'animation patch changes',
  );
  const size = exactRecord(
    changes.size,
    ['height'],
    'animation patch size',
  );
  const before = observe(product, context, engine);
  const result = callSync(engine, 'transact', {
    strict: true,
    actionId,
    recordHistory: true,
    operations: [{
      op: 'merge',
      target,
      changes: [{
        path: ['size', 'height'],
        value: finiteNumber(size.height, 'animation patch height'),
      }],
    }],
  });
  assert(
    recordValue(result, 'animation patch result').status === 'committed',
    'animation patch must commit',
  );
  const after = observe(product, context, engine);
  return {
    actual: {
      actionId,
      target,
      before,
      result: clone(result),
      product: after,
    },
    captureSource: after,
  };
}

async function advanceClock(product, state, context, action) {
  assert(context.caseId === 'ANI-003', 'advance animation case');
  const operands = exactOperands(action, ['timeMs']);
  const timeMs = finiteNumber(operands.timeMs, 'advance time');
  await advanceTo(context, timeMs);
  const engine = currentEngine(state, 'advanceClock');
  const before = clone(callSync(engine, 'snapshot'));
  let outcome;
  try {
    callSync(engine, 'publishFrame', timeMs);
    outcome = { status: 'published', code: null };
  } catch (error) {
    outcome = { status: 'rejected', code: diagnosticCode(error) };
  }
  const after = clone(callSync(engine, 'snapshot'));
  return {
    actual: {
      timeMs,
      outcome,
      frameRevisionBefore: before.frameRevision,
      frameRevisionAfter: after.frameRevision,
      publicationDelta: after.frameRevision - before.frameRevision,
      product: observe(product, context, engine),
    },
  };
}

async function undoAnimation(product, state, context, action) {
  return animationHistoryAction(product, state, context, action, 'undo');
}

async function redoAnimation(product, state, context, action) {
  return animationHistoryAction(product, state, context, action, 'redo');
}

async function animationHistoryAction(product, state, context, action, direction) {
  assert(context.caseId === 'ANI-003', 'animation history case');
  const operands = exactOperands(action, ['timeMs']);
  const timeMs = finiteNumber(operands.timeMs, `${direction} time`);
  await advanceTo(context, timeMs);
  const engine = currentEngine(state, direction);
  const result = callSync(engine, direction);
  callSync(engine, 'publishFrame', timeMs);
  const observed = observe(product, context, engine);
  return {
    actual: { direction, timeMs, result: clone(result), product: observed },
    captureSource: observed,
  };
}

async function replaceAnimationDataset(product, state, context, action) {
  assert(context.caseId === 'ANI-003', 'animation replacement case');
  const operands = exactOperands(action, ['datasetRef', 'timeMs']);
  const timeMs = finiteNumber(operands.timeMs, 'replacement time');
  const datasetRef = stringValue(operands.datasetRef, 'replacement datasetRef');
  await advanceTo(context, timeMs);
  const engine = currentEngine(state, 'replaceDataset');
  const dataset = await context.resolveDataset(datasetRef);
  const beforeFingerprint = context.fingerprint(dataset);
  const result = callSync(engine, 'loadDataset', dataset, { datasetRef });
  callSync(engine, 'publishFrame', timeMs);
  const afterFingerprint = context.fingerprint(dataset);
  const observed = observe(product, context, engine);
  return {
    actual: {
      datasetRef,
      result: clone(result),
      input: inputObservation(beforeFingerprint, afterFingerprint),
      product: observed,
    },
    captureSource: observed,
  };
}

async function destroyAnimationEngine(product, state, context, action) {
  assert(context.caseId === 'ANI-003', 'animation destroy case');
  const operands = exactOperands(action, ['timeMs']);
  const timeMs = finiteNumber(operands.timeMs, 'destroy time');
  await advanceTo(context, timeMs);
  const engine = currentEngine(state, 'destroy');
  const before = observe(product, context, engine);
  const destroyed = await call(engine, 'destroy');
  const after = observe(product, context, engine);
  state.frameRevisionAtDestroy = recordValue(after.snapshot, 'destroy snapshot').frameRevision;
  return {
    actual: {
      timeMs,
      destroyed,
      before,
      product: after,
    },
    captureSource: after,
  };
}

async function loadLifecycleDataset(product, state, context, action) {
  assert(context.caseId === 'LIF-006', 'lifecycle load case');
  const operands = exactOperands(action, ['datasetRef', 'timeMs']);
  const timeMs = finiteNumber(operands.timeMs, 'lifecycle load time');
  const datasetRef = stringValue(operands.datasetRef, 'lifecycle datasetRef');
  await advanceTo(context, timeMs);
  const engine = await ensureInitializedMain(state, context);
  const dataset = await context.resolveDataset(datasetRef);
  const beforeFingerprint = context.fingerprint(dataset);
  const loaded = callSync(engine, 'loadDataset', dataset, { datasetRef });
  callSync(engine, 'publishFrame', timeMs);
  const afterFingerprint = context.fingerprint(dataset);
  state.baselineLoaded = true;
  const observed = observe(product, context, engine);
  return {
    actual: {
      datasetRef,
      loaded: clone(loaded),
      input: inputObservation(beforeFingerprint, afterFingerprint),
      product: observed,
    },
    captureSource: lifecycleCapture(observed),
  };
}

async function startAnimation(product, state, context, action) {
  assert(context.caseId === 'LIF-006', 'lifecycle animation case');
  const operands = exactOperands(action, [
    'componentId',
    'durationMs',
    'ownerId',
    'timeMs',
    'toHeight',
  ]);
  await advanceTo(context, finiteNumber(operands.timeMs, 'animation time'));
  const engine = currentEngine(state, 'startAnimation');
  const target = {
    kind: 'component',
    ownerId: stringValue(operands.ownerId, 'animation ownerId'),
    id: stringValue(operands.componentId, 'animation componentId'),
  };
  const result = callSync(engine, 'patch', target, {
    size: { height: finiteNumber(operands.toHeight, 'animation height') },
  });
  assert(
    nonNegativeNumber(operands.durationMs, 'animation duration') > 0,
    'animation duration must be positive',
  );
  assert(
    recordValue(result, 'lifecycle animation result').status === 'committed',
    'lifecycle animation must commit',
  );
  const observed = observe(product, context, engine);
  return {
    actual: { target, result: clone(result), product: observed },
    captureSource: lifecycleCapture(observed),
  };
}

async function startPendingAssetLoad(product, state, context, action) {
  assert(context.caseId === 'LIF-006', 'pending asset case');
  const operands = exactOperands(action, [
    'componentId',
    'ownerId',
    'requestId',
    'timeMs',
  ]);
  await advanceTo(context, finiteNumber(operands.timeMs, 'asset time'));
  const engine = currentEngine(state, 'startPendingAssetLoad');
  const requestId = stringValue(operands.requestId, 'asset requestId');
  const token = callSync(engine, 'registerPageLifecycleWork', {
    kind: 'asset',
    requestId,
  });
  state.pageTokens.set(`asset:${requestId}`, token);
  const observed = observe(product, context, engine);
  return {
    actual: {
      target: {
        ownerId: stringValue(operands.ownerId, 'asset ownerId'),
        componentId: stringValue(operands.componentId, 'asset componentId'),
      },
      requestId,
      token: clone(token),
      product: observed,
    },
    captureSource: lifecycleCapture(observed),
  };
}

async function startViewportDeceleration(product, state, context, action) {
  assert(context.caseId === 'LIF-006', 'deceleration case');
  const operands = exactOperands(action, ['timeMs', 'velocity']);
  await advanceTo(context, finiteNumber(operands.timeMs, 'deceleration time'));
  const velocity = finitePair(operands.velocity, 'deceleration velocity');
  const engine = currentEngine(state, 'startViewportDeceleration');
  const started = callSync(engine, 'startViewportDeceleration', velocity);
  const observed = observe(product, context, engine);
  return {
    actual: { velocity, started, product: observed },
    captureSource: lifecycleCapture(observed),
  };
}

async function beginPointerGesture(product, state, context, action) {
  assert(context.caseId === 'LIF-006', 'pointer gesture case');
  const operands = exactOperands(action, ['pointerId', 'targetId', 'timeMs']);
  const timeMs = finiteNumber(operands.timeMs, 'pointer time');
  await advanceTo(context, timeMs);
  const pointerId = positiveInteger(operands.pointerId, 'pointerId');
  const targetId = stringValue(operands.targetId, 'pointer targetId');
  const engine = currentEngine(state, 'beginPointerGesture');
  const point = targetScreenCenter(callSync(engine, 'geometryProbe'), targetId);
  const dispatch = callSync(engine, 'dispatchPointerInput', {
    type: 'down',
    pointerId,
    pointerType: 'mouse',
    button: 0,
    buttons: 1,
    screen: point,
    timeMs,
    modifiers: {
      shift: false,
      ctrl: false,
      alt: false,
      meta: false,
    },
  });
  callSync(engine, 'beginOwnedPointerGesture', 'move', pointerId);
  const observed = observe(product, context, engine);
  return {
    actual: { pointerId, targetId, point, dispatch: clone(dispatch), product: observed },
    captureSource: lifecycleCapture(observed),
  };
}

async function startExtraction(product, state, context, action) {
  assert(context.caseId === 'LIF-006', 'pending extraction case');
  const operands = exactOperands(action, ['requestId', 'timeMs']);
  await advanceTo(context, finiteNumber(operands.timeMs, 'extraction time'));
  const engine = currentEngine(state, 'startExtraction');
  const requestId = stringValue(operands.requestId, 'extraction requestId');
  const token = callSync(engine, 'registerPageLifecycleWork', {
    kind: 'extraction',
    requestId,
  });
  state.pageTokens.set(`extraction:${requestId}`, token);
  const observed = observe(product, context, engine);
  return {
    actual: { requestId, token: clone(token), product: observed },
    captureSource: lifecycleCapture(observed),
  };
}

async function setDocumentVisibility(product, state, context, action) {
  assert(context.caseId === 'LIF-006', 'visibility case');
  const operands = exactOperands(action, ['state', 'timeMs']);
  const timeMs = finiteNumber(operands.timeMs, 'visibility time');
  const visibility = stringValue(operands.state, 'visibility state');
  assert(visibility === 'hidden' || visibility === 'visible', 'visibility value');
  await advanceTo(context, timeMs);
  const engine = currentEngine(state, 'setDocumentVisibility');
  const result = callSync(engine, 'setDocumentVisibility', {
    state: visibility,
    timeMs,
  });
  const observed = observe(product, context, engine);
  return {
    actual: { state: visibility, timeMs, result: clone(result), product: observed },
    captureSource: lifecycleCapture(observed),
  };
}

async function publishLifecycleFrame(product, state, context, action) {
  assert(context.caseId === 'LIF-006', 'lifecycle frame case');
  const operands = exactOperands(action, ['timeMs']);
  const timeMs = finiteNumber(operands.timeMs, 'lifecycle frame time');
  await advanceTo(context, timeMs);
  const engine = currentEngine(state, 'publishFrame');
  const before = clone(callSync(engine, 'snapshot'));
  callSync(engine, 'publishFrame', timeMs);
  const after = clone(callSync(engine, 'snapshot'));
  const observed = observe(product, context, engine);
  return {
    actual: {
      timeMs,
      publicationDelta: after.frameRevision - before.frameRevision,
      product: observed,
    },
    captureSource: lifecycleCapture(observed),
  };
}

async function ensureCallerInput(state, context, requestedRef = null) {
  const params = recordValue(context.fixtureParams, 'DET-001 fixture params');
  const datasetRef = requestedRef ??
    stringValue(params.datasetRef, 'DET-001 fixture datasetRef');
  if (state.callerInput === null) {
    state.callerInput = clone(await context.resolveDataset(datasetRef));
    state.callerDatasetRef = datasetRef;
  }
  assert(state.callerDatasetRef === datasetRef, 'caller dataset identity');
}

async function ensureBaseline(state, context, datasetRef) {
  const engine = await ensureInitializedMain(state, context);
  if (state.baselineLoaded) return engine;
  const dataset = await context.resolveDataset(datasetRef);
  callSync(engine, 'loadDataset', dataset, { datasetRef });
  callSync(engine, 'publishFrame', context.clock.now());
  state.baselineLoaded = true;
  return engine;
}

async function ensureInitializedMain(state, context) {
  if (state.engine !== null) return state.engine;
  const engine = await context.ensureMainEngine();
  const snapshot = callSync(engine, 'snapshot');
  if (snapshot.lifecycle === 'new') {
    await initializeEngine(engine, `${context.caseId.toLowerCase()}-engine`);
  }
  state.engine = engine;
  return engine;
}

async function initializeEngine(engine, instanceId) {
  return call(engine, 'initialize', {
    instanceId,
    width: 800,
    height: 600,
    pixelRatio: 1,
    strategy: 'mesh',
    preference: 'webgl',
  });
}

function observe(product, context, engine) {
  return clone(product.observe({ caseId: context.caseId, engine }));
}

function lifecycleCapture(observed) {
  const page = recordValue(observed.pageLifecycle, 'page lifecycle probe');
  const bar = nullableRecord(observed.bar, 'bar probe');
  const barGeometry = bar === null
    ? null
    : nullableRecord(bar.geometry, 'bar geometry');
  const barSemantic = bar === null
    ? null
    : nullableRecord(bar.semantic, 'bar semantic');
  return {
    resources: {
      pendingAssetCount: page.pendingAssetCount,
      pendingExtractionCount: page.pendingExtractionCount,
    },
    scene: {
      activeAnimationCount: page.activeAnimationCount,
    },
    geometry: {
      targets: {
        'item-a': {
          components: {
            bar: {
              size: {
                height: barGeometry === null
                  ? componentSemanticHeight(barSemantic, 'bar semantic height')
                  : finiteBounds(barGeometry.localBounds, 'bar localBounds')[3],
              },
            },
          },
        },
      },
    },
    interaction: {
      decelerationActive: page.decelerationActive,
      activeGestureCount: page.activeGestureCount,
      pointerCaptureCount: page.pointerCaptureCount,
    },
    outcome: {
      resume: {
        publishedFrameCount: page.resumePublishedFrameCount,
      },
    },
  };
}

function componentSemanticHeight(semantic, label) {
  if (semantic === null) return null;
  const size = semantic.authoredSize;
  if (typeof size === 'number') return finiteNumber(size, label);
  const record = recordValue(size, `${label} authored size`);
  return finiteNumber(record.height, label);
}

function normalizeFreshProduct(observed, events, seed) {
  const snapshot = clone(recordValue(observed.snapshot, 'fresh snapshot'));
  delete snapshot.instanceId;
  delete snapshot.frameRevision;
  const resources = nullableRecord(snapshot.resources, 'fresh snapshot resources');
  const assets = resources === null
    ? null
    : nullableRecord(resources.assets, 'fresh snapshot assets');
  if (assets !== null) delete assets.instanceId;
  const geometry = observed.geometry === null ? null : clone(observed.geometry);
  if (geometry !== null) delete geometry.revision;
  return {
    seed,
    snapshot,
    semantic: clone(observed.semantic),
    geometry,
    history: clone(observed.history),
    companion: clone(observed.companion),
    pageLifecycle: normalizePageLifecycle(observed.pageLifecycle),
    pointer: clone(observed.pointer),
    viewportPolicy: clone(observed.viewportPolicy),
    dataset: clone(observed.dataset),
    events: events.map(({ type, value }) => ({
      type,
      value: normalizeFreshEvent(value),
    })),
  };
}

function normalizeFreshEvent(value) {
  const event = clone(value);
  if (isRecord(event)) delete event.instanceId;
  return event;
}

function normalizePageLifecycle(value) {
  const page = clone(recordValue(value, 'fresh page lifecycle'));
  delete page.clockMs;
  return page;
}

function bindEngineEvent(engine, type, events) {
  const unbind = callSync(engine, 'on', type, (value) => {
    events.push({ type, value: clone(value) });
  });
  assert(typeof unbind === 'function', `${type} unbind`);
  return unbind;
}

function removePaths(value, paths) {
  for (const path of paths) {
    const segments = path.split('.').filter(Boolean);
    let cursor = value;
    for (let index = 0; index < segments.length - 1; index += 1) {
      if (!isRecord(cursor)) break;
      cursor = cursor[segments[index]];
    }
    if (isRecord(cursor)) delete cursor[segments.at(-1)];
  }
  return value;
}

function semanticDifferences(left, right, path = '$', differences = []) {
  if (Object.is(left, right)) return differences;
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) differences.push(`${path}.length`);
    const length = Math.min(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      semanticDifferences(left[index], right[index], `${path}[${index}]`, differences);
    }
    return differences;
  }
  if (isRecord(left) && isRecord(right)) {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) {
      if (!Object.hasOwn(left, key) || !Object.hasOwn(right, key)) {
        differences.push(`${path}.${key}`);
      } else {
        semanticDifferences(left[key], right[key], `${path}.${key}`, differences);
      }
    }
    return differences;
  }
  differences.push(path);
  return differences;
}

function targetScreenCenter(geometryValue, targetId) {
  const geometry = recordValue(geometryValue, 'gesture geometry');
  const entities = arrayValue(geometry.entities, 'gesture entities');
  const target = entities
    .map((entry) => recordValue(entry, 'gesture entity'))
    .find((entry) => entry.id === targetId);
  assert(target !== undefined, `gesture target ${targetId}`);
  const [x, y, width, height] = finiteBounds(target.screenBounds, 'gesture bounds');
  return [x + width / 2, y + height / 2];
}

function ownerComponentTarget(value, label) {
  const target = exactRecord(value, ['id', 'ownerId'], label);
  return {
    kind: 'component',
    ownerId: stringValue(target.ownerId, `${label}.ownerId`),
    id: stringValue(target.id, `${label}.id`),
  };
}

function setAtPath(root, path, value) {
  assert(path.length > 0, 'mutation path');
  let cursor = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    assert(
      (Array.isArray(cursor) && typeof segment === 'number') ||
        (isRecord(cursor) && typeof segment === 'string'),
      `mutation path segment ${index}`,
    );
    cursor = cursor[segment];
  }
  const terminal = path.at(-1);
  assert(
    (Array.isArray(cursor) && typeof terminal === 'number') ||
      (isRecord(cursor) && typeof terminal === 'string'),
    'mutation terminal path',
  );
  cursor[terminal] = value;
}

async function advanceTo(context, timeMs) {
  const current = finiteNumber(context.clock.now(), 'clock now');
  assert(timeMs >= current, `clock regression ${current} -> ${timeMs}`);
  await context.clock.advanceTo(timeMs);
}

function currentEngine(state, operation) {
  assert(state.engine !== null, `${operation} requires main engine`);
  return state.engine;
}

async function call(target, method, ...args) {
  assert(isRecord(target) && typeof target[method] === 'function', `${method}()`);
  return target[method](...args);
}

function callSync(target, method, ...args) {
  assert(isRecord(target) && typeof target[method] === 'function', `${method}()`);
  return target[method](...args);
}

function validateProduct(value) {
  const product = recordValue(value, 'determinism lifecycle product');
  assertExactKeys(product, ['createSeededScene', 'observe'], 'product');
  assert(typeof product.createSeededScene === 'function', 'product createSeededScene');
  assert(typeof product.observe === 'function', 'product observe');
  return product;
}

function validateContext(value) {
  const context = recordValue(value, 'handler context');
  for (const method of [
    'ensureMainEngine',
    'createEngine',
    'releaseEngine',
    'resolveDataset',
    'fingerprint',
  ]) {
    assert(typeof context[method] === 'function', `context ${method}()`);
  }
  assert(isRecord(context.clock), 'context clock');
  assert(typeof context.clock.now === 'function', 'context clock.now()');
  assert(typeof context.clock.advanceTo === 'function', 'context clock.advanceTo()');
  assert(
    DETERMINISM_LIFECYCLE_CASE_IDS.includes(context.caseId),
    'context case ID',
  );
  return context;
}

function validateAction(context, value) {
  const action = recordValue(value, 'handler action');
  const expected = CASE_ACTIONS[context.caseId];
  assert(Array.isArray(expected), 'case action registry');
  assert(action.type === expected[action.index], `action ${action.index} type`);
  return action;
}

function exactOperands(action, keys) {
  return exactRecord(action.operands, keys, `${action.type} operands`);
}

function exactRecord(value, keys, label) {
  const record = recordValue(value, label);
  assertExactKeys(record, keys, label);
  return record;
}

function assertExactKeys(value, keys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  assert(
    actual.length === expected.length &&
      actual.every((key, index) => key === expected[index]),
    `${label} keys`,
  );
}

function inputObservation(beforeFingerprint, afterFingerprint) {
  return {
    beforeFingerprint,
    afterFingerprint,
    unchanged: beforeFingerprint === afterFingerprint,
  };
}

function diagnosticCode(error) {
  if (isRecord(error) && isRecord(error.diagnostic) && typeof error.diagnostic.code === 'string') {
    return error.diagnostic.code;
  }
  return error instanceof Error ? error.name : 'UNKNOWN';
}

function requiredMapValue(map, key, label) {
  const value = map.get(key);
  assert(value !== undefined, label);
  return value;
}

function pathArray(value, label) {
  const path = arrayValue(value, label);
  return path.map((segment, index) => {
    assert(
      typeof segment === 'string' ||
        (Number.isSafeInteger(segment) && segment >= 0),
      `${label}[${index}]`,
    );
    return segment;
  });
}

function stringArray(value, label) {
  return arrayValue(value, label).map((entry, index) =>
    stringValue(entry, `${label}[${index}]`));
}

function numberArray(value, label) {
  return arrayValue(value, label).map((entry, index) =>
    finiteNumber(entry, `${label}[${index}]`));
}

function finitePair(value, label) {
  const values = arrayValue(value, label);
  assert(values.length === 2, `${label} length`);
  return [
    finiteNumber(values[0], `${label}[0]`),
    finiteNumber(values[1], `${label}[1]`),
  ];
}

function finiteBounds(value, label) {
  const values = arrayValue(value, label);
  assert(values.length === 4, `${label} length`);
  return values.map((entry, index) => finiteNumber(entry, `${label}[${index}]`));
}

function arrayValue(value, label) {
  assert(Array.isArray(value), `${label} array`);
  return value;
}

function recordValue(value, label) {
  assert(isRecord(value), `${label} object`);
  return value;
}

function nullableRecord(value, label) {
  return value === null ? null : recordValue(value, label);
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} string`);
  return value;
}

function nullableString(value, label) {
  assert(value === null || typeof value === 'string', `${label} nullable string`);
  return value;
}

function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} finite`);
  return value;
}

function nonNegativeNumber(value, label) {
  const number = finiteNumber(value, label);
  assert(number >= 0, `${label} non-negative`);
  return number;
}

function positiveInteger(value, label) {
  assert(Number.isSafeInteger(value) && value > 0, `${label} positive integer`);
  return value;
}

function nonNegativeInteger(value, label) {
  assert(Number.isSafeInteger(value) && value >= 0, `${label} non-negative integer`);
  return value;
}

function uint32(value, label) {
  const number = nonNegativeInteger(value, label);
  assert(number <= 0xffff_ffff, `${label} uint32`);
  return number;
}

function clone(value) {
  return structuredClone(value);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Core v2 determinism lifecycle handler invalid: ${message}`);
  }
}
