export const PRESENTATION_DYNAMICS_HANDLER_REVISION =
  'core-v2-presentation-dynamics-handlers/1';

export const PRESENTATION_DYNAMICS_CASE_IDS = Object.freeze([
  'UPD-005',
  'REN-009',
  'ANI-001',
  'ANI-002',
]);

export const PRESENTATION_DYNAMICS_ACTION_TYPES = Object.freeze([
  'loadDataset',
  'patch',
  'readCurrentState',
  'publishFrame',
  'advanceClock',
  'runAnimationSchedule',
  'snapshotAt',
  'destroy',
]);

const CASE_ACTIONS = Object.freeze({
  'UPD-005': Object.freeze(['patch', 'readCurrentState', 'publishFrame']),
  'REN-009': Object.freeze(['loadDataset', 'patch', 'publishFrame', 'publishFrame']),
  'ANI-001': Object.freeze(['patch', 'advanceClock', 'patch', 'advanceClock', 'advanceClock']),
  'ANI-002': Object.freeze([
    'runAnimationSchedule',
    'snapshotAt',
    'runAnimationSchedule',
    'snapshotAt',
    'advanceClock',
    'destroy',
    'advanceClock',
  ]),
});

const INTERACTIVE_DATASET_REF = 'interactive-scene';

/** Shared browser-safe, actual-only product handlers for four clock/update cases. */
export function createPresentationDynamicsHandlerEntries(product) {
  const adapter = validateProductAdapter(product);
  const states = new WeakMap();
  const handlers = Object.freeze({
    loadDataset: withState(adapter, states, loadDatasetAction),
    patch: withState(adapter, states, patchAction),
    readCurrentState: withState(adapter, states, readCurrentStateAction),
    publishFrame: withState(adapter, states, publishFrameAction),
    advanceClock: withState(adapter, states, advanceClockAction),
    runAnimationSchedule: withState(adapter, states, runAnimationScheduleAction),
    snapshotAt: withState(adapter, states, snapshotAtAction),
    destroy: withState(adapter, states, destroyAction),
  });
  return Object.freeze(PRESENTATION_DYNAMICS_ACTION_TYPES.map((type) => Object.freeze([
    `contract/${type}`,
    handlers[type],
  ])));
}

function withState(adapter, states, handler) {
  return async (contextValue, actionValue) => {
    const context = validateContext(contextValue);
    const actions = CASE_ACTIONS[context.caseId];
    assert(actions !== undefined, `unsupported case ${String(context.caseId)}`);
    assert(Number.isInteger(context.actionIndex), 'context actionIndex');
    const requiredType = actions[context.actionIndex];
    assert(requiredType !== undefined, `${context.caseId} action index`);
    const action = recordValue(actionValue, 'action');
    assertExactKeys(action, ['index', 'operands', 'type'], 'action');
    assert(action.index === context.actionIndex, 'action index');
    assert(action.type === requiredType, `${context.caseId} action type`);
    validateFixtureParams(context.caseId, context.fixtureParams);
    validateRouteParams(context.routeParams);
    assert(!context.signal.aborted, 'action is aborted');

    let state = states.get(context.resolveDataset);
    if (state === undefined) {
      state = {
        caseId: context.caseId,
        engine: null,
        dataset: null,
        inputFingerprint: null,
        scheduleIndex: null,
        schedules: new Map(),
        destroyed: false,
      };
      states.set(context.resolveDataset, state);
    }
    assert(state.caseId === context.caseId, 'execution state case identity');
    return handler(adapter, state, context, action);
  };
}

async function loadDatasetAction(adapter, state, context, action) {
  assert(context.caseId === 'REN-009', 'loadDataset case');
  const operands = exactOperands(action, ['datasetRef', 'timeMs']);
  const datasetRef = stringValue(operands.datasetRef, 'loadDataset.datasetRef');
  const timeMs = finiteNumber(operands.timeMs, 'loadDataset.timeMs');
  assert(datasetRef === INTERACTIVE_DATASET_REF, 'loadDataset datasetRef');
  assert(timeMs === 0, 'loadDataset starts at zero');
  const engine = await ensureMainScene(state, context);
  return {
    actual: {
      datasetRef,
      timeMs,
      input: inputEvidence(state, context),
      product: observeEngine(engine, adapter, context.caseId),
    },
  };
}

async function patchAction(adapter, state, context, action) {
  assert(context.caseId !== 'ANI-002', 'patch case');
  const operands = recordValue(action.operands, 'patch operands');
  const acceptedKeys = context.caseId === 'UPD-005'
    ? ['changes', 'targetId', 'timeMs']
    : ['changes', 'target', 'timeMs'];
  assertExactKeys(operands, acceptedKeys, 'patch operands');
  const timeMs = finiteNumber(operands.timeMs, 'patch.timeMs');
  await advanceWorkerClock(context, timeMs);
  const engine = await ensureMainScene(state, context);
  const target = context.caseId === 'UPD-005'
    ? elementTarget(stringValue(operands.targetId, 'patch.targetId'))
    : componentTarget(recordValue(operands.target, 'patch.target'));
  validatePatchAgainstFixture(context.caseId, target, operands.changes, context.fixtureParams);
  const before = observeEngine(engine, adapter, context.caseId);
  let changeEvent = null;
  let eventOrder = 0;
  const unsubscribe = context.caseId === 'UPD-005'
    ? callSync(engine, 'on', 'change', (event) => {
        eventOrder += 1;
        const value = recordValue(event, 'change event');
        const eventTarget = recordValue(value.target, 'change event target');
        const revisions = recordValue(value.revisions, 'change event revisions');
        changeEvent = clone({
          orderIndex: eventOrder,
          targets: [stringValue(eventTarget.id, 'change event target id')],
          revision: finiteNumber(revisions.sceneRevision, 'change event scene revision'),
        });
      })
    : null;
  let mutation;
  try {
    mutation = await call(engine, 'patch', clone(target), clone(operands.changes));
  } finally {
    if (unsubscribe !== null) callFunction(unsubscribe, 'change unsubscribe');
  }
  const result = recordValue(mutation, 'patch result');
  assert(result.status === 'committed' && result.changed === true, 'patch must commit a change');
  if (context.caseId === 'UPD-005') assert(changeEvent !== null, 'patch emits change synchronously');
  const after = observeEngine(engine, adapter, context.caseId);
  return {
    actual: {
      timeMs,
      target: clone(target),
      changes: clone(operands.changes),
      mutation: clone(result),
      ...(changeEvent === null ? {} : { changeEvent }),
      returnState: context.caseId === 'UPD-005'
        ? exportedElement(engine, target.id)
        : clone(after.bar),
      input: inputEvidence(state, context),
      before,
      after,
    },
  };
}

async function readCurrentStateAction(adapter, state, context, action) {
  assert(context.caseId === 'UPD-005', 'readCurrentState case');
  const operands = exactOperands(action, ['timeMs']);
  const timeMs = finiteNumber(operands.timeMs, 'readCurrentState.timeMs');
  await advanceWorkerClock(context, timeMs);
  const engine = currentEngine(state, 'readCurrentState');
  const params = recordValue(context.fixtureParams, 'UPD-005 fixture params');
  const targetId = stringValue(params.targetId, 'UPD-005 targetId');
  return {
    actual: {
      timeMs,
      returnState: exportedElement(engine, targetId),
      input: inputEvidence(state, context),
      product: observeEngine(engine, adapter, context.caseId),
    },
  };
}

async function publishFrameAction(adapter, state, context, action) {
  assert(context.caseId === 'UPD-005' || context.caseId === 'REN-009', 'publishFrame case');
  const operands = exactOperands(action, ['timeMs']);
  const timeMs = finiteNumber(operands.timeMs, 'publishFrame.timeMs');
  await advanceWorkerClock(context, timeMs);
  const engine = currentEngine(state, 'publishFrame');
  const before = observeEngine(engine, adapter, context.caseId);
  await call(engine, 'publishFrame', timeMs);
  const after = observeEngine(engine, adapter, context.caseId);
  return {
    actual: {
      timeMs,
      before,
      after,
      ...(context.caseId === 'UPD-005'
        ? {
            returnState: exportedElement(
              engine,
              stringValue(
                recordValue(context.fixtureParams, 'UPD-005 fixture params').targetId,
                'UPD-005 targetId',
              ),
            ),
          }
        : {}),
      input: inputEvidence(state, context),
    },
  };
}

async function advanceClockAction(adapter, state, context, action) {
  assert(context.caseId === 'ANI-001' || context.caseId === 'ANI-002', 'advanceClock case');
  const operands = exactOperands(action, ['timeMs']);
  const timeMs = finiteNumber(operands.timeMs, 'advanceClock.timeMs');
  await advanceWorkerClock(context, timeMs);

  if (state.destroyed) {
    assert(context.caseId === 'ANI-002', 'only ANI-002 advances after destroy');
    const engine = currentEngine(state, 'post-destroy advanceClock');
    const before = snapshotEngine(engine);
    const frameEvents = [];
    const unsubscribe = callSync(engine, 'on', 'frame', (eventValue) => {
      const event = recordValue(eventValue, 'post-destroy frame event');
      frameEvents.push(clone({
        frameRevision: nonNegativeInteger(
          event.frameRevision,
          'post-destroy frame event revision',
        ),
        publishedTuple: publicationTuple(
          event.publishedTuple,
          'post-destroy frame event publishedTuple',
        ),
      }));
    });
    let attemptedCall;
    try {
      await call(engine, 'publishFrame', timeMs);
      attemptedCall = { status: 'completed' };
    } catch (error) {
      attemptedCall = {
        status: 'rejected',
        error: engineErrorDiagnostic(error),
      };
    } finally {
      callFunction(unsubscribe, 'post-destroy frame unsubscribe');
    }
    const after = snapshotEngine(engine);
    const postDestroy = adapter.observePostDestroyAdvance({
      caseId: 'ANI-002',
      timeMs,
      before: publicationObservation(before, 'post-destroy before'),
      after: publicationObservation(after, 'post-destroy after'),
      frameEventCount: frameEvents.length,
      attemptedCall,
    });
    return {
      actual: {
        timeMs,
        before,
        after,
        frameEvents,
        postDestroy: clone(postDestroy),
        input: inputEvidence(state, context),
      },
    };
  }

  const engine = currentEngine(state, 'advanceClock');
  const before = observeEngine(engine, adapter, context.caseId);
  try {
    await call(engine, 'publishFrame', timeMs);
  } catch (error) {
    assert(context.caseId === 'ANI-002', 'only ANI-002 expects a backward-time refusal');
    const diagnostic = engineErrorDiagnostic(error);
    return {
      actual: {
        timeMs,
        backwardTime: diagnostic,
        before,
        after: observeEngine(engine, adapter, context.caseId),
        input: inputEvidence(state, context),
      },
    };
  }
  return {
    actual: {
      timeMs,
      before,
      after: observeEngine(engine, adapter, context.caseId),
      input: inputEvidence(state, context),
    },
  };
}

async function runAnimationScheduleAction(adapter, state, context, action) {
  assert(context.caseId === 'ANI-002', 'runAnimationSchedule case');
  const operands = exactOperands(action, ['scheduleIndex']);
  const scheduleIndex = nonNegativeInteger(
    operands.scheduleIndex,
    'runAnimationSchedule.scheduleIndex',
  );
  const params = recordValue(context.fixtureParams, 'ANI-002 fixture params');
  const schedules = numberMatrix(params.schedules, 'ANI-002 schedules');
  assert(scheduleIndex < schedules.length, 'schedule index range');
  assert(!state.schedules.has(scheduleIndex), 'schedule runs once');
  const engine = await createScheduleEngine(state, context, scheduleIndex);
  const schedule = schedules[scheduleIndex];
  const probeTimes = numberArray(params.probeTimesMs, 'ANI-002 probeTimesMs');
  const valuesByTime = new Map();
  for (const timeMs of schedule) {
    await call(engine, 'publishFrame', timeMs);
    if (probeTimes.includes(timeMs)) {
      valuesByTime.set(timeMs, presentationHeight(engine));
    }
  }
  const values = probeTimes.map((timeMs) => {
    assert(valuesByTime.has(timeMs), `schedule must publish probe time ${timeMs}`);
    return valuesByTime.get(timeMs);
  });
  const recorded = adapter.recordSchedule({ caseId: 'ANI-002', scheduleIndex, values });
  state.scheduleIndex = scheduleIndex;
  state.schedules.set(scheduleIndex, clone(recorded));
  return {
    actual: {
      scheduleIndex,
      schedule: clone(schedule),
      probeTimesMs: clone(probeTimes),
      values: clone(values),
      product: observeEngine(engine, adapter, context.caseId),
      input: inputEvidence(state, context),
    },
  };
}

async function snapshotAtAction(adapter, state, context, action) {
  assert(context.caseId === 'ANI-002', 'snapshotAt case');
  const operands = exactOperands(action, ['timesMs']);
  const timesMs = numberArray(operands.timesMs, 'snapshotAt.timesMs');
  const params = recordValue(context.fixtureParams, 'ANI-002 fixture params');
  assert(sameJson(timesMs, numberArray(params.probeTimesMs, 'ANI-002 probeTimesMs')), 'probe times');
  assert(state.scheduleIndex !== null, 'snapshot requires a schedule');
  const schedule = state.schedules.get(state.scheduleIndex);
  assert(schedule !== undefined, 'snapshot schedule observation');
  const engine = currentEngine(state, 'snapshotAt');
  const values = numberArray(schedule.values, 'recorded schedule values');
  const product = observeEngine(engine, adapter, context.caseId);
  const interaction = recordValue(
    recordValue(product.semantic, 'schedule semantic probe').interaction,
    'schedule semantic interaction',
  );
  const actual = {
    scheduleIndex: state.scheduleIndex,
    timesMs: clone(timesMs),
    values: clone(values),
    at200: {
      activeAnimations: nonNegativeInteger(
        interaction.activeAnimationCount,
        'snapshot activeAnimationCount',
      ),
    },
    product,
    input: inputEvidence(state, context),
  };
  return { actual, captureSource: { values: clone(values) } };
}

async function destroyAction(adapter, state, context, action) {
  assert(context.caseId === 'ANI-002', 'destroy case');
  const operands = exactOperands(action, ['timeMs']);
  const timeMs = finiteNumber(operands.timeMs, 'destroy.timeMs');
  await advanceWorkerClock(context, timeMs);
  const engine = currentEngine(state, 'destroy');
  const before = snapshotEngine(engine);
  const release = await context.releaseEngine(engine, `action:destroy:${timeMs}`);
  const after = snapshotEngine(engine);
  const lifecycleGeneration = finiteNumber(
    recordValue(after.revisions, 'destroy revisions').lifecycleGeneration,
    'destroy lifecycle generation',
  );
  state.destroyed = true;
  const runtime = adapter.markDestroyed({ caseId: 'ANI-002', lifecycleGeneration });
  return {
    actual: {
      timeMs,
      before,
      release: clone(release),
      after,
      runtime: clone(runtime),
      input: inputEvidence(state, context),
    },
  };
}

async function ensureMainScene(state, context) {
  if (state.engine !== null) return state.engine;
  const engine = await context.ensureMainEngine();
  await initializeEngine(engine, `${context.caseId.toLowerCase()}-main`);
  const dataset = await context.resolveDataset(INTERACTIVE_DATASET_REF);
  const fingerprint = context.fingerprint(dataset);
  await call(engine, 'loadDataset', dataset, { datasetRef: INTERACTIVE_DATASET_REF });
  await call(engine, 'publishFrame', 0);
  state.engine = engine;
  state.dataset = dataset;
  state.inputFingerprint = fingerprint;
  return engine;
}

async function createScheduleEngine(state, context, scheduleIndex) {
  const session = scheduleIndex + 1;
  const engine = await context.ensureSessionEngine(session);
  await initializeEngine(engine, `${context.caseId.toLowerCase()}-schedule-${scheduleIndex}`);
  const dataset = await context.resolveDataset(INTERACTIVE_DATASET_REF);
  state.dataset ??= dataset;
  state.inputFingerprint ??= context.fingerprint(dataset);
  await call(engine, 'loadDataset', dataset, {
    datasetRef: `${INTERACTIVE_DATASET_REF}:schedule-${scheduleIndex}`,
  });
  await call(engine, 'publishFrame', 0);
  const params = recordValue(context.fixtureParams, 'ANI-002 fixture params');
  const target = componentTarget(recordValue(params.target, 'ANI-002 target'));
  const toHeight = finiteNumber(params.toHeight, 'ANI-002 toHeight');
  const mutation = await call(engine, 'patch', target, { size: { height: toHeight } });
  assert(recordValue(mutation, 'schedule patch').status === 'committed', 'schedule patch commit');
  state.engine = engine;
  state.destroyed = false;
  return engine;
}

async function initializeEngine(engine, instanceId) {
  const before = snapshotEngine(engine);
  if (before.lifecycle !== 'new') return;
  await call(engine, 'initialize', {
    instanceId,
    width: 800,
    height: 600,
    pixelRatio: 1,
    strategy: 'mesh',
    preference: 'webgl',
  });
}

function observeEngine(engine, adapter, caseId) {
  const snapshot = snapshotEngine(engine);
  const semantic = callSync(engine, 'semanticProbe');
  const geometry = optionalCallSync(engine, 'geometryProbe');
  const bar = caseId === 'UPD-005'
    ? null
    : optionalCallSync(engine, 'barPresentationProbe', { ownerId: 'item-a', componentId: 'bar' });
  return clone({
    snapshot,
    semantic,
    geometry,
    bar,
    runtime: adapter.resourceProbe({ caseId }),
  });
}

function presentationHeight(engine) {
  const probe = optionalCallSync(
    engine,
    'barPresentationProbe',
    { ownerId: 'item-a', componentId: 'bar' },
  );
  const record = recordValue(probe, 'bar presentation probe');
  return finiteNumber(record.presentationHeight, 'bar presentation height');
}

function exportedElement(engine, targetId) {
  const dataset = callSync(engine, 'exportDataset');
  assert(Array.isArray(dataset), 'exportDataset() must return an array');
  const target = dataset.find((entry) => isRecord(entry) && entry.id === targetId);
  assert(target !== undefined, `exported target ${targetId}`);
  return clone(target);
}

function inputEvidence(state, context) {
  assert(state.dataset !== null && state.inputFingerprint !== null, 'input baseline');
  const afterFingerprint = context.fingerprint(state.dataset);
  return {
    beforeFingerprint: state.inputFingerprint,
    afterFingerprint,
    unchanged: state.inputFingerprint === afterFingerprint,
  };
}

function currentEngine(state, operation) {
  assert(state.engine !== null, `${operation} requires an engine`);
  return state.engine;
}

async function advanceWorkerClock(context, timeMs) {
  const current = finiteNumber(context.clock.now(), 'clock.now()');
  assert(timeMs >= current, `worker clock cannot move backwards from ${current} to ${timeMs}`);
  await context.clock.advanceTo(timeMs);
  assert(!context.signal.aborted, 'action is aborted');
}

function validatePatchAgainstFixture(caseId, target, changesValue, paramsValue) {
  const changes = recordValue(changesValue, 'patch changes');
  const params = recordValue(paramsValue, `${caseId} fixture params`);
  if (caseId === 'UPD-005') {
    assert(target.kind === 'element' && target.id === params.targetId, 'UPD-005 target');
    assertExactKeys(changes, ['attrs'], 'UPD-005 changes');
    const attrs = exactRecord(changes.attrs, ['x'], 'UPD-005 changes.attrs');
    assert(attrs.x === params.nextX, 'UPD-005 next x');
    return;
  }
  assert(target.kind === 'component', `${caseId} component target`);
  const fixtureTarget = recordValue(
    caseId === 'REN-009' ? recordValue(params.bar, 'REN-009 bar') : params.target,
    `${caseId} fixture target`,
  );
  assert(target.ownerId === fixtureTarget.ownerId && target.id === fixtureTarget.id, `${caseId} target`);
  assertExactKeys(changes, ['size'], `${caseId} changes`);
  const size = recordValue(changes.size, `${caseId} changes.size`);
  if (caseId === 'REN-009') {
    assertExactKeys(size, ['height', 'width'], 'REN-009 changes.size');
    assert(size.height === recordValue(params.bar, 'REN-009 bar').toHeight, 'REN-009 height');
    return;
  }
  assertExactKeys(size, ['height'], 'ANI-001 changes.size');
  const destination = Number(params.retarget?.atMs) === Number(params.timesMs?.[1]) && size.height === params.retarget?.toHeight
    ? params.retarget.toHeight
    : params.toHeight;
  assert(size.height === destination, 'ANI-001 height belongs to approved destinations');
}

function validateFixtureParams(caseId, value) {
  const params = recordValue(value, `${caseId} fixture params`);
  if (caseId === 'UPD-005') {
    assertExactKeys(params, ['frameTimesMs', 'initialX', 'nextX', 'targetId'], 'UPD-005 params');
    stringValue(params.targetId, 'UPD-005 targetId');
    finiteNumber(params.initialX, 'UPD-005 initialX');
    finiteNumber(params.nextX, 'UPD-005 nextX');
    numberArray(params.frameTimesMs, 'UPD-005 frameTimesMs');
    return;
  }
  if (caseId === 'REN-009') {
    assertExactKeys(params, ['bar', 'timesMs'], 'REN-009 params');
    validateBarProfile(recordValue(params.bar, 'REN-009 bar'));
    numberArray(params.timesMs, 'REN-009 timesMs');
    return;
  }
  if (caseId === 'ANI-001') {
    assertExactKeys(
      params,
      ['durationMs', 'easing', 'fromHeight', 'retarget', 'target', 'timesMs', 'toHeight', 'track'],
      'ANI-001 params',
    );
    componentTarget(recordValue(params.target, 'ANI-001 target'));
    finiteNumber(params.fromHeight, 'ANI-001 fromHeight');
    finiteNumber(params.toHeight, 'ANI-001 toHeight');
    finiteNumber(params.durationMs, 'ANI-001 durationMs');
    stringValue(params.easing, 'ANI-001 easing');
    numberArray(params.track, 'ANI-001 track');
    numberArray(params.timesMs, 'ANI-001 timesMs');
    const retarget = exactRecord(params.retarget, ['atMs', 'toHeight'], 'ANI-001 retarget');
    finiteNumber(retarget.atMs, 'ANI-001 retarget.atMs');
    finiteNumber(retarget.toHeight, 'ANI-001 retarget.toHeight');
    return;
  }
  assert(caseId === 'ANI-002', 'fixture case identity');
  assertExactKeys(
    params,
    ['durationMs', 'fromHeight', 'probeTimesMs', 'schedules', 'target', 'toHeight'],
    'ANI-002 params',
  );
  componentTarget(recordValue(params.target, 'ANI-002 target'));
  finiteNumber(params.fromHeight, 'ANI-002 fromHeight');
  finiteNumber(params.toHeight, 'ANI-002 toHeight');
  finiteNumber(params.durationMs, 'ANI-002 durationMs');
  numberMatrix(params.schedules, 'ANI-002 schedules');
  numberArray(params.probeTimesMs, 'ANI-002 probeTimesMs');
}

function validateBarProfile(bar) {
  assertExactKeys(
    bar,
    ['durationMs', 'easing', 'fromHeight', 'id', 'ownerId', 'toHeight'],
    'REN-009 bar',
  );
  stringValue(bar.ownerId, 'REN-009 ownerId');
  stringValue(bar.id, 'REN-009 id');
  finiteNumber(bar.fromHeight, 'REN-009 fromHeight');
  finiteNumber(bar.toHeight, 'REN-009 toHeight');
  finiteNumber(bar.durationMs, 'REN-009 durationMs');
  stringValue(bar.easing, 'REN-009 easing');
}

function validateRouteParams(value) {
  const route = exactRecord(value, ['seed', 'size'], 'route params');
  stringValue(route.size, 'route size');
  const seed = nonNegativeInteger(route.seed, 'route seed');
  assert(seed <= 0xffff_ffff, 'route seed uint32');
}

function validateContext(value) {
  const context = recordValue(value, 'handler context');
  for (const method of [
    'ensureMainEngine',
    'ensureSessionEngine',
    'releaseEngine',
    'resolveDataset',
    'fingerprint',
  ]) {
    assert(typeof context[method] === 'function', `context must expose ${method}()`);
  }
  assert(isRecord(context.clock), 'context clock');
  assert(typeof context.clock.now === 'function', 'context clock.now()');
  assert(typeof context.clock.advanceTo === 'function', 'context clock.advanceTo()');
  assert(isRecord(context.signal), 'context signal');
  return context;
}

function validateProductAdapter(value) {
  const adapter = recordValue(value, 'product adapter');
  assertExactKeys(
    adapter,
    ['markDestroyed', 'observePostDestroyAdvance', 'recordSchedule', 'resourceProbe'],
    'product adapter',
  );
  for (const method of Object.keys(adapter)) {
    assert(typeof adapter[method] === 'function', `product adapter ${method}()`);
  }
  return adapter;
}

function componentTarget(value) {
  assertExactKeys(value, ['id', 'ownerId'], 'component target');
  return {
    kind: 'component',
    ownerId: stringValue(value.ownerId, 'component target ownerId'),
    id: stringValue(value.id, 'component target id'),
  };
}

function elementTarget(id) {
  return { kind: 'element', id };
}

function engineErrorDiagnostic(error) {
  const value = recordValue(error, 'engine error');
  const diagnostic = recordValue(value.diagnostic, 'engine error diagnostic');
  return clone({
    code: stringValue(diagnostic.code, 'diagnostic code'),
    category: stringValue(diagnostic.category, 'diagnostic category'),
    operation: stringValue(diagnostic.operation, 'diagnostic operation'),
    recoverable: Boolean(diagnostic.recoverable),
    retryable: Boolean(diagnostic.retryable),
  });
}

function snapshotEngine(engine) {
  return clone(callSync(engine, 'snapshot'));
}

function publicationObservation(snapshotValue, label) {
  const snapshot = recordValue(snapshotValue, label);
  return {
    lifecycle: stringValue(snapshot.lifecycle, `${label} lifecycle`),
    frameRevision: nonNegativeInteger(snapshot.frameRevision, `${label} frameRevision`),
    publishedTuple: publicationTuple(snapshot.publishedTuple, `${label} publishedTuple`),
  };
}

function publicationTuple(value, label) {
  const tuple = recordValue(value, label);
  assertExactKeys(tuple, ['interaction', 'scene', 'view'], label);
  return {
    scene: nonNegativeInteger(tuple.scene, `${label} scene`),
    view: nonNegativeInteger(tuple.view, `${label} view`),
    interaction: nonNegativeInteger(tuple.interaction, `${label} interaction`),
  };
}

function callSync(target, method, ...args) {
  assert(isRecord(target) && typeof target[method] === 'function', `engine must expose ${method}()`);
  return target[method](...args);
}

function callFunction(value, label) {
  assert(typeof value === 'function', `${label} must be a function`);
  return value();
}

function optionalCallSync(target, method, ...args) {
  if (!isRecord(target) || typeof target[method] !== 'function') return null;
  return target[method](...args);
}

async function call(target, method, ...args) {
  return callSync(target, method, ...args);
}

function exactOperands(action, keys) {
  return exactRecord(action.operands, keys, `${String(action.type)} operands`);
}

function exactRecord(value, keys, label) {
  const record = recordValue(value, label);
  assertExactKeys(record, keys, label);
  return record;
}

function assertExactKeys(record, keys, label) {
  const actual = Object.keys(record).sort();
  const required = [...keys].sort();
  assert(
    actual.length === required.length && actual.every((key, index) => key === required[index]),
    `${label} keys`,
  );
}

function numberMatrix(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  return value.map((row, index) => numberArray(row, `${label}[${index}]`));
}

function numberArray(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  return value.map((entry, index) => finiteNumber(entry, `${label}[${index}]`));
}

function recordValue(value, label) {
  assert(isRecord(value), `${label} must be an object`);
  return value;
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} must be a non-empty string`);
  return value;
}

function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} must be finite`);
  return Object.is(value, -0) ? 0 : value;
}

function nonNegativeInteger(value, label) {
  assert(Number.isSafeInteger(value) && value >= 0, `${label} must be a non-negative integer`);
  return value;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function clone(value) {
  return structuredClone(value);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Core v2 presentation dynamics handler invalid: ${message}`);
}
