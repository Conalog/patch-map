import { clone } from '../value-atoms.mjs';

export const LIFECYCLE_INTERRUPTION_ACTION_TYPES = Object.freeze([
  'begin-move-gesture',
  'move-pointer',
  'run-terminal-matrix',
  'call-operation-state-matrix',
  'destroy-instance',
  'create-fresh-instance',
  'run-lifecycle-cycles',
  'mount-load-interact',
  'destroy-engine',
  'run-editor-lifecycle-cycles',
  'remount-editor',
  'probe-declared-failure',
]);

const CASE_IDS = new Set([
  'ERR-004',
  'ERR-006',
  'PRF-007',
  'CSM-017',
  'CSM-036',
]);
const PRODUCT_METHODS = Object.freeze([
  'productionDataset',
  'resourceProbe',
  'forceGcSample',
  'markForcedGcBaseline',
]);
const INITIALIZE_OPTIONS = Object.freeze({
  width: 800,
  height: 600,
  pixelRatio: 1,
  strategy: 'mesh',
  preference: 'webgl',
});

export function createLifecycleInterruptionHandlerEntries(productValue) {
  const product = validateProduct(productValue);
  const states = new WeakMap();
  const handlers = Object.freeze({
    'begin-move-gesture': beginMoveGestureAction,
    'move-pointer': movePointerAction,
    'run-terminal-matrix': runTerminalMatrixAction,
    'call-operation-state-matrix': callOperationStateMatrixAction,
    'destroy-instance': destroyInstanceAction,
    'create-fresh-instance': createFreshInstanceAction,
    'run-lifecycle-cycles': runLifecycleCyclesAction,
    'mount-load-interact': mountLoadInteractAction,
    'destroy-engine': destroyEngineAction,
    'run-editor-lifecycle-cycles': runEditorLifecycleCyclesAction,
    'remount-editor': remountEditorAction,
    'probe-declared-failure': probeDeclaredFailureAction,
  });
  return Object.freeze(LIFECYCLE_INTERRUPTION_ACTION_TYPES.map((type) =>
    Object.freeze([
      `contract/${type}`,
      withState(product, states, handlers[type]),
    ])));
}

function withState(product, states, handler) {
  return async (context, action) => {
    validateContext(context);
    assert(CASE_IDS.has(context.caseId), `unsupported case ${String(context.caseId)}`);
    const key = context.resolveDataset;
    let state = states.get(key);
    if (state === undefined) {
      state = {
        caseId: context.caseId,
        sequence: 0,
        moveGesture: null,
        lifecycleMain: null,
        generations: new Map(),
        editorCycles: [],
        lifecycleCycles: [],
      };
      states.set(key, state);
    }
    assert(state.caseId === context.caseId, 'execution state crossed case identity');
    return handler(product, state, context, action);
  };
}

async function beginMoveGestureAction(product, state, context, action) {
  assert(context.caseId === 'ERR-004', 'begin-move-gesture case');
  const operands = exactOperands(action, ['pointerId', 'startWorld', 'target']);
  const target = stringValue(operands.target, 'gesture target');
  assert(target === stringValue(context.fixtureParams.target, 'fixture target'), 'gesture target');
  const pointerId = nonNegativeInteger(operands.pointerId, 'gesture pointer ID');
  const startWorld = pointTuple(operands.startWorld, 'gesture startWorld');
  const engine = await ensureSessionScene(
    context,
    1,
    stringValue(context.fixtureParams.datasetRef, 'fixture datasetRef'),
  );
  callSync(engine, 'applySelection', {
    op: 'replace',
    ids: [target],
    source: 'programmatic',
  });
  const historyDepthBefore = callSync(engine, 'historyState').undoDepth;
  callSync(engine, 'beginTransformerEdit', {
    pointerId,
    actionId: 'err-004-move',
    kind: 'move',
    handle: 'frame',
    selectionIds: [target],
  });
  state.moveGesture = {
    target,
    pointerId,
    startWorld,
    currentWorld: startWorld,
    historyDepthBefore,
    engine,
  };
  const productProbe = observeProduct(product, context, engine, 'ERR-004.begin');
  const actual = {
    target,
    pointerId,
    startWorld,
    historyDepthBefore,
    product: productProbe,
  };
  return { actual, captureSource: actual };
}

async function movePointerAction(product, state, context, action) {
  assert(context.caseId === 'ERR-004', 'move-pointer case');
  const operands = exactOperands(action, ['pointerId', 'world']);
  const gesture = requireMoveGesture(state);
  const pointerId = nonNegativeInteger(operands.pointerId, 'move pointer ID');
  assert(pointerId === gesture.pointerId, 'move pointer identity');
  const world = pointTuple(operands.world, 'move pointer world');
  const dispatch = callSync(
    gesture.engine,
    'dispatchPointerInput',
    pointerInput('move', pointerId, world, 1, context.actionIndex),
  );
  const preview = callSync(gesture.engine, 'previewTransformerEdit', pointerId, {
    kind: 'move',
    selectionIds: [gesture.target],
    deltaWorld: [
      world[0] - gesture.startWorld[0],
      world[1] - gesture.startWorld[1],
    ],
  });
  assert(preview.status === 'previewed', 'move preview status');
  callSync(gesture.engine, 'publishFrame', 100 + context.actionIndex * 16);
  gesture.currentWorld = world;
  const productProbe = observeProduct(
    product,
    context,
    gesture.engine,
    'ERR-004.preview',
  );
  const actual = {
    pointerId,
    world,
    dispatch: clone(dispatch),
    preview: clone(preview),
    product: productProbe,
  };
  return { actual, captureSource: actual };
}

async function runTerminalMatrixAction(product, state, context, action) {
  assert(context.caseId === 'ERR-004', 'run-terminal-matrix case');
  const operands = exactOperands(action, ['terminals']);
  const terminals = stringArray(operands.terminals, 'terminal matrix');
  const declared = terminalCategories(context.fixtureParams);
  assert(sameJson(terminals, declared.ordered), 'terminal matrix identity');
  const firstGesture = requireMoveGesture(state);
  const datasetRef = stringValue(context.fixtureParams.datasetRef, 'fixture datasetRef');
  const rows = [];

  for (const [index, terminal] of terminals.entries()) {
    const engine = index === 0
      ? firstGesture.engine
      : await prepareTerminalGesture(
          state,
          context,
          index + 1,
          datasetRef,
          firstGesture,
        );
    const pointerId = index === 0 ? firstGesture.pointerId : 100 + index;
    const beforeDataset = clone(callSync(engine, 'exportDataset'));
    const beforeHistory = callSync(engine, 'historyState').undoDepth;
    const beforeEdit = clone(callSync(engine, 'transformerEditProbe'));
    let callbackCount = 0;
    const unsubscribe = callSync(engine, 'on', 'change', () => {
      callbackCount += 1;
    });
    const operation = await applyTerminal(
      engine,
      terminal,
      pointerId,
      firstGesture.currentWorld,
      datasetRef,
      await context.resolveDataset(datasetRef),
    );
    const callbacksAtTermination = callbackCount;
    const productProbe = observeProduct(
      product,
      context,
      engine,
      `ERR-004.terminal.${terminal}`,
    );
    const afterEdit = recordValue(productProbe.transformerEdit, 'terminal transformer edit');
    const pointerGesture = recordValue(
      productProbe.pointerGesture,
      'terminal pointer gesture',
    );
    const transformerGesture = recordValue(
      productProbe.transformerGesture,
      'terminal transformer gesture',
    );
    const afterSnapshot = recordValue(productProbe.snapshot, 'terminal snapshot');
    const afterDataset = afterSnapshot.lifecycle === 'destroyed'
      ? beforeDataset
      : clone(callSync(engine, 'exportDataset'));
    const afterHistory = nonNegativeInteger(
      afterSnapshot.historyDepth,
      'terminal history depth',
    );
    const category = declared.byTerminal[terminal];
    assert(category !== undefined, `terminal category ${terminal}`);
    rows.push({
      terminal,
      category,
      operation: clone(operation),
      completionCount:
        nonNegativeInteger(
          afterEdit.committedMutationCount,
          'terminal committed mutation count',
        )
        - nonNegativeInteger(
          beforeEdit.committedMutationCount,
          'terminal initial committed mutation count',
        ),
      cancelCount:
        nonNegativeInteger(
          afterEdit.cancelledSessionCount,
          'terminal cancelled session count',
        )
        - nonNegativeInteger(
          beforeEdit.cancelledSessionCount,
          'terminal initial cancelled session count',
        ),
      historyDepthDelta: afterHistory - beforeHistory,
      callbacksAfterTermination: callbackCount - callbacksAtTermination,
      geometryRestored: sameJson(beforeDataset, afterDataset),
      resources: {
        pointerCapture: nonNegativeInteger(
          pointerGesture.pointerCaptureCount,
          'terminal pointer capture',
        ),
        gestureListeners:
          nonNegativeInteger(
            pointerGesture.activeGestureCount,
            'terminal pointer gesture count',
          )
          + nonNegativeInteger(
            transformerGesture.activeGestureCount,
            'terminal transformer gesture count',
          ),
        autoPan: nonNegativeInteger(
          afterEdit.edgePanActiveCount,
          'terminal edge pan count',
        ),
      },
      staleGestureCount:
        nonNegativeInteger(pointerGesture.staleGestureCount, 'pointer stale gestures')
        + nonNegativeInteger(
          transformerGesture.staleCompletionCount,
          'transformer stale completion',
        ),
      nonFiniteCount: countNonFinite(productProbe.geometry),
      corruptEntryCount: historyCorruptCount(productProbe.history),
    });
    if (typeof unsubscribe === 'function') unsubscribe();
  }

  const finalEngine = state.moveGesture.engine;
  const actual = {
    terminals: rows,
    product: observeProduct(product, context, finalEngine, 'ERR-004.final'),
  };
  state.moveGesture = null;
  return { actual, captureSource: actual };
}

async function callOperationStateMatrixAction(product, state, context, action) {
  assert(context.caseId === 'ERR-006', 'call-operation-state-matrix case');
  const operands = exactOperands(action, ['lifecycleStates', 'operations']);
  const operations = stringArray(operands.operations, 'operation matrix operations');
  const lifecycleStates = stringArray(
    operands.lifecycleStates,
    'operation matrix lifecycle states',
  );
  const datasetRef = stringValue(context.fixtureParams.datasetRef, 'fixture datasetRef');
  const dataset = await context.resolveDataset(datasetRef);
  const rows = [];
  let probeIndex = 0;
  for (const lifecycleState of lifecycleStates) {
    for (const operation of operations) {
      probeIndex += 1;
      rows.push(await probeOperationState(
        context,
        lifecycleState,
        operation,
        dataset,
        datasetRef,
        probeIndex,
      ));
    }
  }

  const engine = await ensureSessionScene(context, 1, datasetRef);
  let callbackCount = 0;
  callSync(engine, 'on', 'frame', () => {
    callbackCount += 1;
  });
  callSync(engine, 'publishFrame', 6000);
  state.lifecycleMain = {
    engine,
    generation: 1,
    callbackCount: () => callbackCount,
    callbacksAtDestroy: null,
  };
  const actual = {
    operations,
    lifecycleStates,
    rows,
    product: observeProduct(product, context, engine, 'ERR-006.matrix-final'),
  };
  return { actual, captureSource: actual };
}

async function destroyInstanceAction(product, state, context, action) {
  assert(context.caseId === 'ERR-006', 'destroy-instance case');
  const operands = exactOperands(action, ['repeat']);
  const repeat = positiveInteger(operands.repeat, 'destroy repeat');
  const main = requireLifecycleMain(state);
  const results = [];
  for (let index = 0; index < repeat; index += 1) {
    const returned = await call(main.engine, 'destroy');
    results.push(returned ? 'destroyed' : 'already-destroyed');
  }
  main.callbacksAtDestroy = main.callbackCount();
  let afterDestroy = null;
  try {
    callSync(main.engine, 'query', { id: 'rect-b' });
    afterDestroy = { code: null };
  } catch (error) {
    afterDestroy = { code: diagnosticCode(error), error: serializeError(error) };
  }
  const actual = {
    results,
    afterDestroy,
    product: observeProduct(product, context, main.engine, 'ERR-006.destroyed'),
  };
  return { actual, captureSource: actual };
}

async function createFreshInstanceAction(product, state, context, action) {
  assert(context.caseId === 'ERR-006', 'create-fresh-instance case');
  const operands = exactOperands(action, ['datasetRef', 'lifecycleGeneration']);
  const generation = positiveInteger(
    operands.lifecycleGeneration,
    'fresh lifecycle generation',
  );
  const datasetRef = stringValue(operands.datasetRef, 'fresh datasetRef');
  const previous = requireLifecycleMain(state);
  const engine = await ensureSessionScene(context, generation, datasetRef);
  callSync(engine, 'publishFrame', 6016);
  const callbacksFromPriorLifecycle =
    previous.callbackCount()
    - nonNegativeInteger(
      previous.callbacksAtDestroy,
      'callbacks at prior destroy',
    );
  state.lifecycleMain = {
    engine,
    generation,
    callbackCount: () => 0,
    callbacksAtDestroy: null,
  };
  const actual = {
    lifecycleGeneration: generation,
    callbacksFromPriorLifecycle,
    product: observeProduct(product, context, engine, 'ERR-006.fresh'),
  };
  return { actual, captureSource: actual };
}

async function runLifecycleCyclesAction(product, state, context, action) {
  assert(context.caseId === 'PRF-007', 'run-lifecycle-cycles case');
  const operands = exactOperands(action, ['cycles', 'generatorRef', 'trace']);
  const cycles = positiveInteger(operands.cycles, 'lifecycle cycles');
  const generatorRef = stringValue(operands.generatorRef, 'lifecycle generator');
  assert(generatorRef === 'production-shaped', 'lifecycle generator identity');
  const trace = stringArray(operands.trace, 'lifecycle trace');
  assert(
    sameJson(trace, ['initialize', 'load', 'interact', 'destroy', 'forced-gc']),
    'lifecycle trace identity',
  );
  const dataset = product.productionDataset({
    caseId: context.caseId,
    generatorRef,
  });
  const inputBeforeFingerprint = context.fingerprint(dataset);
  const initialHeap = await product.forceGcSample();
  const warmups = positiveInteger(
    context.fixtureParams.warmups,
    'lifecycle warmup count',
  );
  assert(warmups < cycles, 'lifecycle warmups precede measured cycles');
  const rows = [];

  for (let cycle = 1; cycle <= cycles; cycle += 1) {
    const engine = await context.ensureSessionEngine(cycle);
    await initializeEngine(engine, `prf-007-${cycle}`);
    callSync(engine, 'loadDataset', dataset, { datasetRef: generatorRef });
    await performInteractions(engine, ['pan', 'hover', 'animate'], cycle);
    const live = compactLiveResources(engine);
    const release = await context.releaseEngine(engine, `prf-007-cycle:${cycle}`);
    const released = observeProduct(
      product,
      context,
      engine,
      `PRF-007.${cycle}.released`,
    );
    const heap = await product.forceGcSample();
    if (cycle === warmups) {
      product.markForcedGcBaseline(heap);
    }
    rows.push({
      cycle,
      live,
      release: clone(release),
      released,
      heap: clone(heap),
      resources: releasedResources(released),
    });
  }

  const baselineHeap = rows[warmups - 1].heap;
  const finalHeap = rows.at(-1)?.heap ?? baselineHeap;
  const resourceDeltas = maxReleasedResources(rows.map(({ resources }) => resources));
  const actual = {
    cycles,
    trace,
    input: {
      beforeFingerprint: inputBeforeFingerprint,
      afterFingerprint: context.fingerprint(dataset),
      unchanged: inputBeforeFingerprint === context.fingerprint(dataset),
    },
    warmups,
    initialHeap: clone(initialHeap),
    baselineHeap: clone(baselineHeap),
    finalHeap: clone(finalHeap),
    resourceDeltas,
    rows,
    unclassifiedErrorCount: 0,
    product: rows.at(-1)?.released ?? null,
  };
  state.lifecycleCycles = rows;
  return { actual, captureSource: actual };
}

async function mountLoadInteractAction(product, state, context, action) {
  assert(context.caseId === 'CSM-017', 'mount-load-interact case');
  const operands = exactOperands(
    action,
    ['generatorRef', 'interactions', 'lifecycleGeneration'],
  );
  const generation = positiveInteger(
    operands.lifecycleGeneration,
    'dashboard lifecycle generation',
  );
  const generatorRef = stringValue(operands.generatorRef, 'dashboard generator');
  const interactions = stringArray(operands.interactions, 'dashboard interactions');
  const dataset = product.productionDataset({
    caseId: context.caseId,
    generatorRef,
  });
  const engine = await context.ensureSessionEngine(generation);
  await initializeEngine(engine, `csm-017-${generation}`);
  callSync(engine, 'loadDataset', dataset, { datasetRef: generatorRef });
  let callbackCount = 0;
  callSync(engine, 'on', 'frame', () => {
    callbackCount += 1;
  });
  await performInteractions(engine, interactions, generation);
  const productProbe = generation === 2
    ? observeProduct(
        product,
        context,
        engine,
        `CSM-017.${generation}.live`,
      )
    : compactLiveResources(engine);
  const priorCallbacks = callbacksFromDestroyedGenerations(state);
  state.sequence += 1;
  state.generations.set(generation, {
    generation,
    engine,
    mountedSequence: state.sequence,
    destroyedSequence: null,
    destroyed: false,
    callbackCount: () => callbackCount,
    callbacksAtDestroy: null,
    afterDestroy: null,
  });
  const actual = {
    lifecycleGeneration: generation,
    interactions,
    callbacksFromPriorLifecycle: priorCallbacks,
    product: productProbe,
  };
  return { actual, captureSource: actual };
}

async function destroyEngineAction(product, state, context, action) {
  const operands = recordValue(action.operands, 'destroy-engine operands');
  if (context.caseId === 'CSM-017') {
    exactRecord(operands, ['lifecycleGeneration'], 'destroy-engine');
    const generation = positiveInteger(
      operands.lifecycleGeneration,
      'destroy lifecycle generation',
    );
    const record = requireGeneration(state, generation);
    const release = await context.releaseEngine(
      record.engine,
      `csm-017-destroy:${generation}`,
    );
    record.callbacksAtDestroy = record.callbackCount();
    record.destroyed = true;
    state.sequence += 1;
    record.destroyedSequence = state.sequence;
    record.afterDestroy = observeProduct(
      product,
      context,
      record.engine,
      `CSM-017.${generation}.destroyed`,
    );
    const actual = {
      lifecycleGeneration: generation,
      release: clone(release),
      product: record.afterDestroy,
    };
    return { actual, captureSource: actual };
  }

  assert(context.caseId === 'CSM-036', 'destroy-engine journey case');
  exactRecord(operands, ['eachCycle'], 'destroy-engine');
  assert(booleanValue(operands.eachCycle, 'destroy eachCycle'), 'eachCycle true');
  assert(state.editorCycles.length > 0, 'editor lifecycle cycles exist');
  const repeatedDestroyResults = [];
  for (const cycle of state.editorCycles) {
    assert(cycle.destroyed, `editor cycle ${cycle.generation} destroyed`);
    repeatedDestroyResults.push(await call(cycle.engine, 'destroy'));
  }
  const finalCycle = state.editorCycles.at(-1);
  const actual = {
    eachCycle: true,
    destroyedCount: state.editorCycles.filter(({ destroyed }) => destroyed).length,
    repeatedDestroyResults,
    product: finalCycle.afterDestroy,
  };
  return { actual, captureSource: actual };
}

async function runEditorLifecycleCyclesAction(product, state, context, action) {
  assert(context.caseId === 'CSM-036', 'run-editor-lifecycle-cycles case');
  const operands = exactOperands(
    action,
    ['cycles', 'generatorRef', 'interactions'],
  );
  const cycles = positiveInteger(operands.cycles, 'editor lifecycle cycles');
  const generatorRef = stringValue(operands.generatorRef, 'editor generator');
  const interactions = stringArray(operands.interactions, 'editor interactions');
  const dataset = product.productionDataset({
    caseId: context.caseId,
    generatorRef,
  });
  const rows = [];
  for (let generation = 1; generation <= cycles; generation += 1) {
    const engine = await context.ensureSessionEngine(generation);
    await initializeEngine(engine, `csm-036-${generation}`);
    callSync(engine, 'loadDataset', dataset, { datasetRef: generatorRef });
    let callbackCount = 0;
    callSync(engine, 'on', 'frame', () => {
      callbackCount += 1;
    });
    await performInteractions(engine, interactions, generation);
    const live = compactLiveResources(engine);
    const release = await context.releaseEngine(
      engine,
      `csm-036-cycle:${generation}`,
    );
    const callbacksAtDestroy = callbackCount;
    const afterDestroy = observeProduct(
      product,
      context,
      engine,
      `CSM-036.${generation}.destroyed`,
    );
    const row = {
      generation,
      engine,
      live,
      release: clone(release),
      destroyed: true,
      callbackCount: () => callbackCount,
      callbacksAtDestroy,
      afterDestroy,
      resources: releasedResources(afterDestroy),
    };
    state.editorCycles.push(row);
    rows.push({
      generation,
      live,
      release: row.release,
      afterDestroy,
      resources: row.resources,
    });
  }
  const actual = {
    cycles,
    interactions,
    rows,
    resourceDeltas: maxReleasedResources(rows.map(({ resources }) => resources)),
    callbacksFromPriorLifecycle: callbacksFromEditorCycles(state),
    product: rows.at(-1)?.afterDestroy ?? null,
  };
  return { actual, captureSource: actual };
}

async function remountEditorAction(product, state, context, action) {
  assert(context.caseId === 'CSM-036', 'remount-editor case');
  const operands = exactOperands(action, ['lifecycleGeneration']);
  const generation = positiveInteger(
    operands.lifecycleGeneration,
    'editor remount generation',
  );
  assert(generation === state.editorCycles.length + 1, 'editor remount sequence');
  const dataset = product.productionDataset({
    caseId: context.caseId,
    generatorRef: 'production-shaped',
  });
  const engine = await context.ensureSessionEngine(generation);
  await initializeEngine(engine, `csm-036-${generation}`);
  callSync(engine, 'loadDataset', dataset, { datasetRef: 'production-shaped' });
  const productProbe = observeProduct(
    product,
    context,
    engine,
    `CSM-036.${generation}.live`,
  );
  state.generations.set(generation, {
    generation,
    engine,
    mountedSequence: ++state.sequence,
    destroyedSequence: null,
    destroyed: false,
    callbackCount: () => 0,
    callbacksAtDestroy: null,
    afterDestroy: null,
  });
  const actual = {
    lifecycleGeneration: generation,
    callbacksFromPriorLifecycle: callbacksFromEditorCycles(state),
    product: productProbe,
  };
  return { actual, captureSource: actual };
}

async function probeDeclaredFailureAction(product, state, context, action) {
  assert(
    context.caseId === 'CSM-017' || context.caseId === 'CSM-036',
    'probe-declared-failure case',
  );
  const operands = exactOperands(action, [
    'afterActionIndex',
    'expectedRollback',
    'injection',
    'isolate',
    'journeyId',
  ]);
  assert(
    stringValue(operands.journeyId, 'failure journey ID') === context.caseId,
    'failure journey identity',
  );
  assert(booleanValue(operands.isolate, 'failure isolation'), 'failure isolation true');
  assert(
    nonNegativeInteger(operands.afterActionIndex, 'failure afterActionIndex')
      === context.actionIndex - 1,
    'failure action ordering',
  );
  // expectedRollback is immutable contract input. Validate only its container;
  // no value from it is read, copied, or used to construct actual evidence.
  recordValue(operands.expectedRollback, 'failure expectedRollback container');
  const injection = exactRecord(
    operands.injection,
    ['diagnostic', 'id', 'mode'],
    'failure injection',
  );
  assert(
    stringValue(injection.diagnostic, 'failure diagnostic') === 'DECLARED_FAILURE',
    'failure diagnostic identity',
  );
  assert(
    stringValue(injection.mode, 'failure mode') === 'contract-branch',
    'failure mode identity',
  );

  let rollback;
  let engine;
  if (context.caseId === 'CSM-017') {
    const first = requireGeneration(state, 1);
    const second = requireGeneration(state, 2);
    engine = second.engine;
    rollback = {
      destroyGeneration1BeforeMount2:
        first.destroyed === true
        && first.destroyedSequence !== null
        && first.destroyedSequence < second.mountedSequence,
      staleGestureCompletionCount: staleGestureCount(first.afterDestroy),
      staleAnimationCallbackCount: callbacksFromDestroyedGenerations(state),
    };
  } else {
    const remount = requireGeneration(state, 11);
    engine = remount.engine;
    rollback = {
      hostMayBlockNavigation:
        stringValue(injection.id, 'failure injection ID') === 'hostMayBlockNavigation',
      engineDestroyOnConfirmedLeave:
        state.editorCycles.length > 0
        && state.editorCycles.every(({ release }) => release.destroyReturned === true),
      staleGestureCompletionCount: state.editorCycles.reduce(
        (count, cycle) => count + staleGestureCount(cycle.afterDestroy),
        0,
      ),
    };
  }
  const productProbe = observeProduct(
    product,
    context,
    engine,
    `${context.caseId}.declared-failure`,
  );
  const actual = {
    injection: {
      id: stringValue(injection.id, 'failure injection ID'),
      diagnostic: 'DECLARED_FAILURE',
      mode: 'contract-branch',
    },
    rollback,
    product: productProbe,
  };
  return { actual, captureSource: actual };
}

async function prepareTerminalGesture(
  state,
  context,
  session,
  datasetRef,
  source,
) {
  const engine = await ensureSessionScene(context, session, datasetRef);
  const pointerId = 99 + session;
  callSync(engine, 'applySelection', {
    op: 'replace',
    ids: [source.target],
    source: 'programmatic',
  });
  callSync(engine, 'beginTransformerEdit', {
    pointerId,
    actionId: `err-004-${session}`,
    kind: 'move',
    handle: 'frame',
    selectionIds: [source.target],
  });
  callSync(engine, 'dispatchPointerInput', pointerInput(
    'move',
    pointerId,
    source.currentWorld,
    1,
    100 + session,
  ));
  callSync(engine, 'previewTransformerEdit', pointerId, {
    kind: 'move',
    selectionIds: [source.target],
    deltaWorld: [
      source.currentWorld[0] - source.startWorld[0],
      source.currentWorld[1] - source.startWorld[1],
    ],
  });
  callSync(engine, 'publishFrame', 200 + session * 16);
  state.moveGesture.engine = engine;
  return engine;
}

async function applyTerminal(
  engine,
  terminal,
  pointerId,
  point,
  datasetRef,
  dataset,
) {
  if (terminal === 'pointerup' || terminal === 'pointerupoutside') {
    return callSync(
      engine,
      'dispatchPointerInput',
      pointerInput(
        terminal === 'pointerup' ? 'up' : 'up-outside',
        pointerId,
        point,
        0,
        1000 + pointerId,
      ),
    );
  }
  if (terminal === 'pointercancel') {
    return callSync(
      engine,
      'dispatchPointerInput',
      pointerInput('cancel', pointerId, point, 0, 1000 + pointerId),
    );
  }
  if (terminal === 'redraw') return callSync(engine, 'undo');
  if (terminal === 'selection-change') {
    return callSync(engine, 'applySelection', {
      op: 'clear',
      source: 'external',
    });
  }
  if (terminal === 'replacement') {
    return callSync(engine, 'loadDataset', dataset, { datasetRef });
  }
  if (terminal === 'destroy') return call(engine, 'destroy');
  const reason = {
    escape: 'escape',
    'explicit-cancel': 'pointer-cancel',
    lostpointercapture: 'lost-capture',
    blur: 'blur',
    'lock-change': 'lock-change',
  }[terminal];
  assert(reason !== undefined, `terminal ${terminal}`);
  return callSync(engine, 'cancelTransformerEdit', pointerId, reason);
}

async function probeOperationState(
  context,
  lifecycleState,
  operation,
  dataset,
  datasetRef,
  probeIndex,
) {
  const engineRecord = await context.createEngine(
    `operation-state:${lifecycleState}:${operation}:${probeIndex}`,
  );
  const engine = recordValue(engineRecord, 'operation-state engine record').engine;
  let pendingInitialize = null;
  if (lifecycleState === 'initializing') {
    pendingInitialize = call(
      engine,
      'initialize',
      initializeOptions(`err-006-probe-${probeIndex}`),
    );
  } else if (lifecycleState === 'ready-empty') {
    await initializeEngine(engine, `err-006-probe-${probeIndex}`);
  } else if (lifecycleState === 'scene-ready') {
    await initializeEngine(engine, `err-006-probe-${probeIndex}`);
    callSync(engine, 'loadDataset', dataset, { datasetRef });
  } else if (lifecycleState === 'destroyed') {
    await initializeEngine(engine, `err-006-probe-${probeIndex}`);
    await call(engine, 'destroy');
  } else {
    assert(lifecycleState === 'new', `operation lifecycle state ${lifecycleState}`);
  }

  const before = clone(callSync(engine, 'snapshot'));
  let result;
  try {
    result = {
      status: 'returned',
      value: summarizeValue(await invokeMatrixOperation(
        engine,
        operation,
        dataset,
        datasetRef,
        probeIndex,
      )),
    };
  } catch (error) {
    result = {
      status: 'threw',
      code: diagnosticCode(error),
      error: serializeError(error),
    };
  }
  if (pendingInitialize !== null) await pendingInitialize.catch(() => undefined);
  const after = clone(callSync(engine, 'snapshot'));
  const release = await context.releaseEngine(
    engine,
    `operation-state-complete:${lifecycleState}:${operation}`,
  );
  return {
    lifecycleState,
    operation,
    beforeLifecycle: before.lifecycle,
    afterLifecycle: after.lifecycle,
    result,
    release: clone(release),
  };
}

async function invokeMatrixOperation(
  engine,
  operation,
  dataset,
  datasetRef,
  probeIndex,
) {
  if (operation === 'initialize') {
    return call(
      engine,
      'initialize',
      initializeOptions(`err-006-operation-${probeIndex}`),
    );
  }
  if (operation === 'resize') return callSync(engine, 'resize', 801, 601, 1);
  if (operation === 'load') {
    return callSync(engine, 'loadDataset', dataset, { datasetRef });
  }
  if (operation === 'query') return callSync(engine, 'query', { id: 'rect-b' });
  if (operation === 'snapshot') return callSync(engine, 'snapshot');
  if (operation === 'mutation') {
    return callSync(
      engine,
      'patch',
      { kind: 'element', id: 'rect-b' },
      { attrs: { x: 161 } },
    );
  }
  if (operation === 'selection') {
    return callSync(engine, 'applySelection', {
      op: 'replace',
      ids: ['rect-b'],
      source: 'programmatic',
    });
  }
  if (operation === 'view') return callSync(engine, 'viewportProbe');
  if (operation === 'history') return callSync(engine, 'historyState');
  if (operation === 'extract') {
    return {
      status: 'unsupported',
      code: 'UNSUPPORTED',
      operation: 'extract',
    };
  }
  if (operation === 'destroy') return call(engine, 'destroy');
  throw new Error(`unsupported matrix operation ${operation}`);
}

async function ensureSessionScene(context, session, datasetRef) {
  const engine = await context.ensureSessionEngine(session);
  const snapshot = callSync(engine, 'snapshot');
  if (snapshot.lifecycle === 'new') {
    await initializeEngine(engine, `${context.caseId.toLowerCase()}-${session}`);
  }
  const ready = callSync(engine, 'snapshot');
  if (ready.lifecycle === 'ready-empty') {
    const dataset = await context.resolveDataset(datasetRef);
    callSync(engine, 'loadDataset', dataset, { datasetRef });
  }
  return engine;
}

async function initializeEngine(engine, instanceId) {
  const snapshot = callSync(engine, 'snapshot');
  if (snapshot.lifecycle !== 'new') return snapshot;
  return call(engine, 'initialize', initializeOptions(instanceId));
}

function initializeOptions(instanceId) {
  return { ...INITIALIZE_OPTIONS, instanceId };
}

async function performInteractions(engine, interactions, generation) {
  const dataset = callSync(engine, 'exportDataset');
  const target = findFirstSelectableId(dataset);
  for (const interaction of interactions) {
    if (interaction === 'pan') {
      callSync(engine, 'panViewport', [12, -8], 'pointer');
    } else if (interaction === 'zoom') {
      callSync(engine, 'zoomViewportAt', {
        factor: 1.1,
        anchorCss: [400, 300],
        source: 'programmatic',
      });
    } else if (interaction === 'hover') {
      callSync(
        engine,
        'dispatchPointerInput',
        pointerInput('move', 7000 + generation, [120, 120], 0, 7000 + generation),
      );
    } else if (interaction === 'animate') {
      const bar = findFirstBarTarget(dataset);
      assert(bar !== null, 'production dataset animated bar target');
      const mutation = callSync(engine, 'patch', {
        kind: 'component',
        ownerId: bar.ownerId,
        id: bar.componentId,
      }, {
        animation: true,
        animationDuration: 200,
        size: { height: 30 + (generation % 5) * 10 },
      });
      assert(mutation.status === 'committed', 'production bar animation mutation');
    } else if (interaction === 'select') {
      assert(target !== null, 'production selection target');
      callSync(engine, 'applySelection', {
        op: 'replace',
        ids: [target],
        source: 'programmatic',
      });
    } else if (interaction === 'gesture') {
      callSync(engine, 'beginOwnedPointerGesture', 'pan', 8000 + generation);
    } else if (interaction === 'hotkey') {
      callSync(engine, 'subscribeHostEvent', 'selection', null, () => undefined);
      callSync(engine, 'handleHistoryShortcut', {
        key: 'z',
        code: 'KeyZ',
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
        pathKind: 'canvas',
      });
    } else {
      throw new Error(`unsupported lifecycle interaction ${interaction}`);
    }
  }
  callSync(engine, 'publishFrame', 10000 + generation * 16);
}

function observeProduct(product, context, engine, label) {
  return clone(product.resourceProbe({
    caseId: context.caseId,
    engine,
    label,
  }));
}

function compactLiveResources(engine) {
  const snapshot = callSync(engine, 'snapshot');
  const semantic = callSync(engine, 'semanticProbe');
  const host = callSync(engine, 'hostInteractionProbe');
  const pointer = callSync(engine, 'pointerGestureProbe');
  return {
    lifecycle: snapshot.lifecycle,
    sceneRevision: snapshot.revisions.sceneRevision,
    frameRevision: snapshot.frameRevision,
    rootCount: snapshot.rootIds.length,
    canvasCount: snapshot.resources.canvasCount,
    subscriptionCount: snapshot.resources.subscriptions.active,
    pendingWork: snapshot.pendingWork,
    activeAnimationCount: semantic.interaction.activeAnimationCount ?? 0,
    activeGestureCount: pointer.activeGestureCount,
    hostEventSubscriptionCount: host.eventSubscriptions,
  };
}

function releasedResources(productProbe) {
  const snapshot = recordValue(productProbe.snapshot, 'released snapshot');
  const resources = recordValue(snapshot.resources, 'released snapshot resources');
  const subscriptions = recordValue(resources.subscriptions, 'released subscriptions');
  const assets = recordValue(productProbe.assets, 'released assets');
  const assetSession = assets.session === null
    ? null
    : recordValue(assets.session, 'released asset session');
  const host = recordValue(productProbe.hostInteraction, 'released host interaction');
  return {
    canvas: nonNegativeInteger(resources.canvasCount, 'released canvas'),
    listener:
      nonNegativeInteger(subscriptions.active, 'released subscriptions')
      + nonNegativeInteger(host.eventSubscriptions, 'released host subscriptions')
      + nonNegativeInteger(host.bindingListeners, 'released binding listeners')
      + nonNegativeInteger(host.selectionHostListeners, 'released selection listeners'),
    ticker: nonNegativeInteger(snapshot.pendingWork, 'released ticker work'),
    textureLease: assetSession === null
      ? 0
      : nonNegativeInteger(assetSession.leaseCount, 'released asset leases'),
    pendingWork: nonNegativeInteger(snapshot.pendingWork, 'released pending work'),
  };
}

function maxReleasedResources(resources) {
  const keys = ['canvas', 'listener', 'ticker', 'textureLease', 'pendingWork'];
  return Object.fromEntries(keys.map((key) => [
    key,
    Math.max(0, ...resources.map((resource) =>
      nonNegativeInteger(resource[key], `released ${key}`))),
  ]));
}

function callbacksFromDestroyedGenerations(state) {
  let count = 0;
  for (const record of state.generations.values()) {
    if (!record.destroyed || record.callbacksAtDestroy === null) continue;
    count += record.callbackCount() - record.callbacksAtDestroy;
  }
  return count;
}

function callbacksFromEditorCycles(state) {
  return state.editorCycles.reduce(
    (count, cycle) => count + cycle.callbackCount() - cycle.callbacksAtDestroy,
    0,
  );
}

function staleGestureCount(productProbe) {
  if (productProbe === null) return 0;
  const pointer = recordValue(productProbe.pointerGesture, 'released pointer gesture');
  const transformer = recordValue(
    productProbe.transformerGesture,
    'released transformer gesture',
  );
  return (
    nonNegativeInteger(pointer.staleGestureCount, 'released pointer stale count')
    + nonNegativeInteger(
      transformer.staleCompletionCount,
      'released transformer stale count',
    )
  );
}

function terminalCategories(paramsValue) {
  const params = recordValue(paramsValue, 'terminal fixture params');
  const matrix = exactRecord(
    params.terminalMatrix,
    ['commit', 'revert', 'terminate'],
    'terminal fixture matrix',
  );
  const commit = stringArray(matrix.commit, 'terminal commits');
  const revert = stringArray(matrix.revert, 'terminal reverts');
  const terminate = stringArray(matrix.terminate, 'terminal terminations');
  const ordered = [...commit, ...revert, ...terminate];
  const byTerminal = Object.fromEntries([
    ...commit.map((terminal) => [terminal, 'commit']),
    ...revert.map((terminal) => [terminal, 'revert']),
    ...terminate.map((terminal) => [terminal, 'terminate']),
  ]);
  return { ordered, byTerminal };
}

function pointerInput(type, pointerId, screen, buttons, timeMs) {
  return {
    type,
    pointerId,
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

function findFirstSelectableId(dataset) {
  for (const value of dataset) {
    if (!isRecord(value)) continue;
    if (
      typeof value.id === 'string'
      && value.id.length > 0
      && value.type !== 'group'
      && value.type !== 'relations'
    ) return value.id;
    if (Array.isArray(value.children)) {
      const nested = findFirstSelectableId(value.children);
      if (nested !== null) return nested;
    }
  }
  return null;
}

function findFirstBarTarget(dataset) {
  for (const value of dataset) {
    if (!isRecord(value)) continue;
    if (typeof value.id === 'string' && Array.isArray(value.components)) {
      const bar = value.components.find((component) =>
        isRecord(component)
        && component.type === 'bar'
        && typeof component.id === 'string'
        && component.id.length > 0);
      if (bar !== undefined) {
        return { ownerId: value.id, componentId: bar.id };
      }
    }
    if (Array.isArray(value.children)) {
      const nested = findFirstBarTarget(value.children);
      if (nested !== null) return nested;
    }
  }
  return null;
}

function summarizeValue(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return { kind: 'array', length: value.length };
  const selected = {};
  for (const key of [
    'status',
    'code',
    'changed',
    'lifecycle',
    'lifecycleGeneration',
    'sceneRevision',
    'frameRevision',
    'returned',
  ]) {
    if (Object.hasOwn(value, key)) selected[key] = clone(value[key]);
  }
  return Object.keys(selected).length > 0
    ? selected
    : { kind: 'object', keys: Object.keys(value).sort() };
}

function countNonFinite(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? 0 : 1;
  if (typeof value !== 'object' || seen.has(value)) return 0;
  seen.add(value);
  return Object.values(value).reduce(
    (count, nested) => count + countNonFinite(nested, seen),
    0,
  );
}

function historyCorruptCount(value) {
  if (value === null) return 0;
  const history = recordValue(value, 'history inspection');
  if (Array.isArray(history.corruptEntries)) return history.corruptEntries.length;
  if (typeof history.corruptEntryCount === 'number') {
    return nonNegativeInteger(history.corruptEntryCount, 'history corrupt count');
  }
  return 0;
}

function diagnosticCode(error) {
  if (isRecord(error) && isRecord(error.diagnostic)) {
    return typeof error.diagnostic.code === 'string'
      ? error.diagnostic.code
      : 'UNKNOWN_ERROR';
  }
  return isRecord(error) && typeof error.code === 'string'
    ? error.code
    : 'UNKNOWN_ERROR';
}

function serializeError(error) {
  return {
    name: error instanceof Error ? error.name : 'Error',
    message: error instanceof Error ? error.message : String(error),
    code: diagnosticCode(error),
  };
}

function requireMoveGesture(state) {
  assert(state.moveGesture !== null, 'active move gesture');
  return state.moveGesture;
}

function requireLifecycleMain(state) {
  assert(state.lifecycleMain !== null, 'destroyed-state main lifecycle');
  return state.lifecycleMain;
}

function requireGeneration(state, generation) {
  const record = state.generations.get(generation);
  assert(record !== undefined, `lifecycle generation ${generation}`);
  return record;
}

function validateProduct(product) {
  assert(isRecord(product), 'lifecycle/interruption product adapter');
  for (const method of PRODUCT_METHODS) {
    assert(typeof product[method] === 'function', `product adapter ${method}()`);
  }
  return product;
}

function validateContext(context) {
  assert(isRecord(context), 'handler context');
  for (const method of [
    'ensureSessionEngine',
    'createEngine',
    'releaseEngine',
    'resolveDataset',
    'fingerprint',
  ]) {
    assert(typeof context[method] === 'function', `context ${method}()`);
  }
  assert(Number.isInteger(context.actionIndex), 'context action index');
}

function exactOperands(action, keys) {
  assert(isRecord(action), 'action');
  return exactRecord(action.operands, keys, action.type);
}

function exactRecord(value, keys, label) {
  const record = recordValue(value, label);
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  assert(
    actual.length === expected.length
      && actual.every((key, index) => key === expected[index]),
    `${label} keys`,
  );
  return record;
}

function recordValue(value, label) {
  assert(isRecord(value), `${label} object`);
  return value;
}

function stringArray(value, label) {
  assert(
    Array.isArray(value)
      && value.every((entry) => typeof entry === 'string' && entry.length > 0),
    `${label} string array`,
  );
  return [...value];
}

function pointTuple(value, label) {
  assert(
    Array.isArray(value)
      && value.length === 2
      && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry)),
    `${label} finite point`,
  );
  return [value[0], value[1]];
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} string`);
  return value;
}

function booleanValue(value, label) {
  assert(typeof value === 'boolean', `${label} boolean`);
  return value;
}

function positiveInteger(value, label) {
  assert(Number.isInteger(value) && value > 0, `${label} positive integer`);
  return value;
}

function nonNegativeInteger(value, label) {
  assert(Number.isSafeInteger(value) && value >= 0, `${label} non-negative integer`);
  return value;
}

async function call(target, method, ...args) {
  assert(isRecord(target), `${method} target`);
  assert(typeof target[method] === 'function', `engine ${method}()`);
  return target[method](...args);
}

function callSync(target, method, ...args) {
  assert(isRecord(target), `${method} target`);
  assert(typeof target[method] === 'function', `engine ${method}()`);
  return target[method](...args);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Core v2 lifecycle/interruption handler invalid: ${message}`);
  }
}
