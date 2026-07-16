export const FOUNDATION_ACTION_TYPES = Object.freeze([
  'initialize',
  'snapshot-resolved-dataset',
  'exercise-authoritative-draw-races',
  'publishFrame',
  'loadDataset',
  'queryAll',
  'attemptStrictLoadVariant',
  'freezeInput',
  'snapshot',
  'initialize-engine',
  'load-scene',
  'await-first-useful-frame',
  'probe-declared-failure',
]);

const HANDLERS = Object.freeze({
  initialize: initializeAction,
  'snapshot-resolved-dataset': snapshotResolvedDatasetAction,
  'exercise-authoritative-draw-races': exerciseAuthoritativeDrawRacesAction,
  publishFrame: publishFrameAction,
  loadDataset: loadDatasetAction,
  queryAll: queryAllAction,
  attemptStrictLoadVariant: attemptStrictLoadVariantAction,
  freezeInput: freezeInputAction,
  snapshot: snapshotAction,
  'initialize-engine': initializeEngineAction,
  'load-scene': loadSceneAction,
  'await-first-useful-frame': awaitFirstUsefulFrameAction,
  'probe-declared-failure': probeDeclaredFailureAction,
});

export function createFoundationHandlerEntries() {
  return Object.freeze(FOUNDATION_ACTION_TYPES.map((type) => Object.freeze([
    `contract/${type}`,
    HANDLERS[type],
  ])));
}

async function initializeAction(context, action) {
  const operands = exactOperands(action, ['instanceId', 'timeMs']);
  const instanceId = stringValue(operands.instanceId, 'initialize.instanceId');
  const timeMs = finiteNumber(operands.timeMs, 'initialize.timeMs');
  await advanceTo(context, timeMs);
  const engine = await context.ensureMainEngine();
  const result = await call(engine, 'initialize', initializeOptions(context, { instanceId }));
  const snapshot = snapshotEngine(engine);
  return {
    actual: { requestedAtMs: timeMs, result: clone(result), snapshot },
    captureSource: snapshot,
  };
}

async function snapshotResolvedDatasetAction(context, action) {
  const operands = exactOperands(action, ['as', 'datasetRef']);
  const datasetRef = stringValue(operands.datasetRef, 'snapshot-resolved-dataset.datasetRef');
  const bindingName = stringValue(operands.as, 'snapshot-resolved-dataset.as');
  const dataset = clone(await context.resolveDataset(datasetRef));
  const semanticHash = context.fingerprint(dataset);
  const binding = { dataset, semanticHash };
  return {
    actual: {
      datasetRef,
      semanticHash,
      rootRecordCount: Array.isArray(dataset) ? dataset.length : null,
    },
    bindings: { [bindingName]: binding },
    captureSource: binding,
  };
}

async function exerciseAuthoritativeDrawRacesAction(context, action) {
  const operands = exactOperands(action, ['bindAs', 'failedLater', 'pending', 'preReady']);
  const bindingName = stringValue(operands.bindAs, 'exercise-authoritative-draw-races.bindAs');
  const preReady = racePreReadyOperands(operands.preReady);
  const pending = racePendingOperands(operands.pending);
  const failedLater = raceFailedLaterOperands(operands.failedLater);
  const engine = await context.ensureMainEngine();
  await ensureInitialized(context, engine);
  requireMethod(engine, 'submitDataset');
  requireMethod(engine, 'on');

  const drawCompleteEvents = [];
  const subscriptionsBefore = activeSubscriptions(snapshotEngine(engine));
  const unsubscribe = engine.on('drawComplete', (event) => drawCompleteEvents.push(clone(event)));
  assert(typeof unsubscribe === 'function', 'drawComplete subscription must return an unsubscribe function');
  const subscriptionsDuring = activeSubscriptions(snapshotEngine(engine));

  let preReadyActual;
  let pendingActual;
  let failedResult;
  try {
    preReadyActual = await runPreReadySubmission(context, preReady);
    pendingActual = await runPendingSubmissions(context, engine, pending);
    await advanceTo(context, failedLater.submitAtMs);
    failedResult = await engine.submitDataset({
      requestId: 'failed-later',
      datasetRef: failedLater.datasetId,
      input: Promise.resolve(await context.cloneDataset(failedLater.datasetId)),
    });
  } finally {
    unsubscribe();
  }

  const snapshot = snapshotEngine(engine);
  const subscriptionsAfter = activeSubscriptions(snapshot);
  const binding = {
    sceneSemanticHash: snapshot.semanticHash,
    sceneRevision: sceneRevision(snapshot),
    datasetRef: snapshot.datasetRef,
  };

  return {
    actual: {
      preReady: clone(preReadyActual),
      pending: clone(pendingActual),
      failedLater: { submitAtMs: failedLater.submitAtMs, ...clone(failedResult) },
      drawCompleteEvents: clone(drawCompleteEvents),
      drawCompleteSubscription: {
        activeBefore: subscriptionsBefore,
        activeDuring: subscriptionsDuring,
        activeAfter: subscriptionsAfter,
      },
      authoritative: clone(binding),
    },
    bindings: { [bindingName]: binding },
    captureSource: binding,
  };
}

async function publishFrameAction(context, action) {
  const operands = exactOperands(action, ['timeMs']);
  const timeMs = finiteNumber(operands.timeMs, 'publishFrame.timeMs');
  const engine = await context.ensureMainEngine();
  await call(engine, 'publishFrame', timeMs);
  const snapshot = snapshotEngine(engine);
  return {
    actual: { publishedAtMs: timeMs, snapshot },
    captureSource: snapshot,
  };
}

async function loadDatasetAction(context, action) {
  const operands = loadDatasetOperands(action);
  if (operands.timeMs !== undefined) await advanceTo(context, operands.timeMs);
  const engine = await context.ensureMainEngine();
  await ensureInitialized(context, engine);
  const dataset = await context.resolveDataset(operands.reference);
  const beforeFingerprint = context.fingerprint(dataset);
  const result = await call(engine, 'loadDataset', dataset, { datasetRef: operands.reference });
  const afterFingerprint = context.fingerprint(dataset);
  const snapshot = snapshotEngine(engine);
  return {
    actual: {
      datasetRef: operands.reference,
      session: operands.session ?? null,
      result: clone(result),
      input: {
        beforeFingerprint,
        afterFingerprint,
        unchanged: beforeFingerprint === afterFingerprint,
        deeplyFrozen: isDeeplyFrozen(dataset),
      },
      snapshot,
    },
    captureSource: snapshot,
  };
}

async function queryAllAction(context, action) {
  const operands = exactOperands(action, ['order']);
  const order = stringValue(operands.order, 'queryAll.order');
  assert(order === 'scene', `queryAll unsupported order ${order}`);
  const engine = await context.ensureMainEngine();
  const entities = await call(engine, 'exportDataset');
  return {
    actual: {
      order,
      entities: clone(entities),
      count: Array.isArray(entities) ? entities.length : null,
    },
    captureSource: snapshotEngine(engine),
  };
}

async function attemptStrictLoadVariantAction(context, action) {
  const operands = exactOperands(action, ['appendRecord', 'baseDatasetRef', 'expectedAtomic']);
  const baseDatasetRef = stringValue(operands.baseDatasetRef, 'attemptStrictLoadVariant.baseDatasetRef');
  recordValue(operands.appendRecord, 'attemptStrictLoadVariant.appendRecord');
  booleanValue(operands.expectedAtomic, 'attemptStrictLoadVariant.expectedAtomic');
  const engine = await context.ensureMainEngine();
  const variant = await context.cloneDataset(baseDatasetRef);
  assert(Array.isArray(variant), 'attemptStrictLoadVariant base dataset must be an array');
  variant.push(clone(operands.appendRecord));
  const before = snapshotEngine(engine);
  let accepted = false;
  let diagnostic = null;
  let result = null;
  try {
    result = clone(await call(engine, 'loadDataset', variant, { datasetRef: `${baseDatasetRef}:strict-variant` }));
    accepted = true;
  } catch (error) {
    diagnostic = actualError(error);
  }
  const after = snapshotEngine(engine);
  return {
    actual: {
      accepted,
      diagnostic,
      result,
      before,
      after,
      atomicRetained: sameSceneAuthority(before, after),
    },
    captureSource: after,
  };
}

async function freezeInputAction(context, action) {
  const operands = exactOperands(action, ['datasetId']);
  const datasetId = stringValue(operands.datasetId, 'freezeInput.datasetId');
  const dataset = await context.freezeDataset(datasetId);
  return {
    actual: {
      datasetId,
      deeplyFrozen: isDeeplyFrozen(dataset),
      semanticFingerprint: context.fingerprint(dataset),
    },
    captureSource: {
      datasetId,
      semanticHash: context.fingerprint(dataset),
    },
  };
}

async function snapshotAction(context, action) {
  const operands = snapshotOperands(action);
  const engine = await context.ensureMainEngine();
  const snapshot = snapshotEngine(engine);
  const selected = operands.paths
    ? Object.fromEntries(operands.paths.map((path) => [path, clone(readPath(snapshot, path, 'snapshot'))]))
    : null;
  return {
    actual: {
      datasetId: operands.datasetId ?? null,
      session: operands.session ?? null,
      selected,
      snapshot,
    },
    captureSource: snapshot,
  };
}

async function initializeEngineAction(context, action) {
  const operands = initializeEngineOperands(action);
  const engine = await context.ensureMainEngine();
  const options = initializeOptions(context, {
    instanceId: `${context.caseId.toLowerCase()}-host`,
    viewportCssPx: operands.viewportCssPx,
    devicePixelRatio: operands.devicePixelRatio,
    backend: operands.backend,
  });
  const result = await call(engine, 'initialize', options);
  const snapshot = snapshotEngine(engine);
  const actual = { requested: clone(operands), result: clone(result), snapshot };
  return {
    actual,
    host: { operation: 'initialize-engine', input: clone(operands), returned: clone(result), snapshot },
    captureSource: snapshot,
  };
}

async function loadSceneAction(context, action) {
  const operands = loadSceneOperands(action);
  const engine = await context.ensureMainEngine();
  await ensureInitialized(context, engine);
  const dataset = await context.resolveDataset(operands.reference);
  const beforeFingerprint = context.fingerprint(dataset);
  const result = await call(engine, 'loadDataset', dataset, { datasetRef: operands.reference });
  const afterFingerprint = context.fingerprint(dataset);
  const snapshot = snapshotEngine(engine);
  const actual = {
    hostRevision: operands.hostRevision,
    datasetRef: operands.reference,
    result: clone(result),
    inputUnchanged: beforeFingerprint === afterFingerprint,
    snapshot,
  };
  return {
    actual,
    host: { operation: 'load-scene', input: clone(operands.raw), returned: clone(result), snapshot },
    captureSource: snapshot,
  };
}

async function awaitFirstUsefulFrameAction(context, action) {
  const operands = exactOperands(action, ['sceneRevision']);
  const requestedRevision = integerValue(operands.sceneRevision, 'await-first-useful-frame.sceneRevision');
  const engine = await context.ensureMainEngine();
  requireMethod(engine, 'on');
  const frame = new Promise((resolve) => {
    const unsubscribe = engine.on('frame', (event) => {
      unsubscribe();
      resolve(clone(event));
    });
  });
  await call(engine, 'publishFrame', context.clock.now());
  const published = await frame;
  const snapshot = snapshotEngine(engine);
  const actualRevision = published?.publishedTuple?.scene ?? snapshot.publishedTuple?.scene;
  assert(actualRevision === requestedRevision, `first useful frame published scene ${String(actualRevision)}`);
  const actual = { requestedSceneRevision: requestedRevision, published, snapshot };
  return {
    actual,
    host: { operation: 'await-first-useful-frame', returned: clone(published), snapshot },
    captureSource: snapshot,
  };
}

async function probeDeclaredFailureAction(context, action) {
  const operands = probeFailureOperands(action);
  assert(operands.isolate, 'probe-declared-failure must use an isolated generation');
  assert(
    operands.afterActionIndex === context.actionIndex - 1,
    'probe-declared-failure afterActionIndex must name the preceding action',
  );
  const record = await context.createEngine(`declared-failure:${operands.journeyId}`);
  const engine = record.engine;
  const authoritativeBeforeFailure = context.snapshotMainEngine();
  let actual;
  let releaseActual = null;
  try {
    await call(engine, 'initialize', initializeOptions(context, {
      instanceId: `${context.caseId.toLowerCase()}-failure-probe`,
    }));
    const before = snapshotEngine(engine);
    const accepted = false;
    const diagnostic = {
      code: operands.injection.diagnostic,
      id: operands.injection.id,
      mode: operands.injection.mode,
      source: 'declared-host-injection',
    };
    const after = snapshotEngine(engine);
    const hostState = context.snapshotHostSeam();
    const rollback = {
      retainedSceneRevision: sceneRevision(after),
      sceneRevisionUnchanged: sceneRevision(before) === sceneRevision(after),
      partialPublicationCount: frameRevision(after) - frameRevision(before),
      hostRetryRequired: true,
      priorSceneRevision: sceneRevision(before),
      historyDepth: snapshotHistoryDepth(after),
      hostOwnsEmptyUi: hostState.ownsUi === true
        && authoritativeBeforeFailure?.lifecycle === 'ready-empty',
    };
    actual = {
      isolated: true,
      accepted,
      diagnostic,
      before,
      after,
      rollback,
      authoritativeBeforeFailure,
      hostState,
    };
  } finally {
    releaseActual = await context.releaseEngine(engine, 'declared-failure-isolation');
  }
  return {
    actual,
    host: {
      operation: 'probe-declared-failure',
      input: {
        journeyId: operands.journeyId,
        afterActionIndex: operands.afterActionIndex,
        injection: clone(operands.injection),
      },
      actual,
      release: releaseActual,
    },
    captureSource: actual.after,
  };
}

async function runPreReadySubmission(context, operands) {
  const record = await context.createEngine('pre-ready-submission');
  const engine = record.engine;
  requireMethod(engine, 'submitDataset');
  try {
    const result = await engine.submitDataset({
      requestId: 'pre-ready',
      datasetRef: operands.datasetRef,
      input: Promise.resolve(await context.cloneDataset(operands.datasetRef)),
    });
    return { submitAtMs: operands.submitAtMs, ...clone(result) };
  } finally {
    await context.releaseEngine(engine, 'pre-ready-probe');
  }
}

async function runPendingSubmissions(context, engine, pending) {
  const records = new Map(pending.map((entry) => [entry.requestId, {
    entry,
    deferred: deferred(),
    resultPromise: null,
    result: null,
  }]));
  const timeline = pending.flatMap((entry) => [
    { atMs: entry.submitAtMs, kind: 'submit', requestId: entry.requestId },
    { atMs: entry.completeAtMs, kind: 'complete', requestId: entry.requestId },
  ]).sort((left, right) => left.atMs - right.atMs || eventPriority(left.kind) - eventPriority(right.kind));

  try {
    for (const event of timeline) {
      assertNotAborted(context.signal);
      await advanceTo(context, event.atMs);
      const record = records.get(event.requestId);
      assert(record !== undefined, `unknown pending request ${event.requestId}`);
      if (event.kind === 'submit') {
        record.resultPromise = engine.submitDataset({
          requestId: record.entry.requestId,
          datasetRef: record.entry.datasetRef,
          input: record.deferred.promise,
        });
      } else {
        assert(record.resultPromise !== null, `pending request ${event.requestId} completed before submission`);
        record.deferred.resolve(await context.cloneDataset(record.entry.datasetRef));
        record.result = await record.resultPromise;
      }
    }
  } catch (error) {
    const started = [...records.values()].filter((record) => record.resultPromise !== null);
    for (const record of started) record.deferred.reject(error);
    await Promise.allSettled(started.map((record) => record.resultPromise));
    throw error;
  }

  return pending.map((entry) => ({
    requestId: entry.requestId,
    datasetRef: entry.datasetRef,
    submitAtMs: entry.submitAtMs,
    completeAtMs: entry.completeAtMs,
    result: clone(records.get(entry.requestId)?.result),
  }));
}

async function ensureInitialized(context, engine) {
  const snapshot = snapshotEngine(engine);
  if (snapshot.lifecycle === 'new') {
    return call(engine, 'initialize', initializeOptions(context, {
      instanceId: `${context.caseId.toLowerCase()}-engine`,
    }));
  }
  return null;
}

function initializeOptions(context, overrides) {
  const fixtureParams = recordValue(context.fixtureParams, 'fixture params');
  const viewport = overrides.viewportCssPx
    ?? fixtureParams.hostCssPx
    ?? fixtureParams.viewportCssPx
    ?? [800, 600];
  const [width, height] = viewportPair(viewport, 'initialize viewportCssPx');
  const pixelRatio = overrides.devicePixelRatio ?? fixtureParams.devicePixelRatio ?? 1;
  positiveNumber(pixelRatio, 'initialize devicePixelRatio');
  const backend = overrides.backend ?? 'webgl2';
  const options = {
    instanceId: stringValue(overrides.instanceId, 'initialize instanceId'),
    width,
    height,
    pixelRatio,
    strategy: 'mesh',
    preference: backendPreference(backend),
  };
  if (fixtureParams.background !== undefined) options.background = fixtureParams.background;
  if (fixtureParams.zoom !== undefined) options.zoomLimits = clone(fixtureParams.zoom);
  return options;
}

function loadDatasetOperands(action) {
  const operands = recordValue(action.operands, 'loadDataset operands');
  assertAllowedKeys(operands, ['datasetId', 'datasetRef', 'session', 'timeMs'], 'loadDataset');
  const references = ['datasetId', 'datasetRef'].filter((key) => operands[key] !== undefined);
  assert(references.length === 1, 'loadDataset requires exactly one datasetId or datasetRef');
  const reference = stringValue(operands[references[0]], `loadDataset.${references[0]}`);
  const timeMs = operands.timeMs === undefined ? undefined : finiteNumber(operands.timeMs, 'loadDataset.timeMs');
  const session = operands.session === undefined ? undefined : integerValue(operands.session, 'loadDataset.session');
  return { reference, timeMs, session };
}

function snapshotOperands(action) {
  const operands = recordValue(action.operands, 'snapshot operands');
  const keys = Object.keys(operands);
  assert(keys.length === 1 && ['datasetId', 'paths', 'session'].includes(keys[0]), 'snapshot operand shape');
  if (keys[0] === 'datasetId') return { datasetId: stringValue(operands.datasetId, 'snapshot.datasetId') };
  if (keys[0] === 'session') return { session: integerValue(operands.session, 'snapshot.session') };
  assert(Array.isArray(operands.paths), 'snapshot.paths must be an array');
  return { paths: operands.paths.map((path) => stringValue(path, 'snapshot.paths[]')) };
}

function initializeEngineOperands(action) {
  const operands = recordValue(action.operands, 'initialize-engine operands');
  assertAllowedKeys(operands, ['backend', 'devicePixelRatio', 'viewportCssPx'], 'initialize-engine');
  assert(Object.hasOwn(operands, 'backend') && Object.hasOwn(operands, 'viewportCssPx'), 'initialize-engine required operands');
  return {
    backend: stringValue(operands.backend, 'initialize-engine.backend'),
    viewportCssPx: viewportPair(operands.viewportCssPx, 'initialize-engine.viewportCssPx'),
    ...(operands.devicePixelRatio === undefined
      ? {}
      : { devicePixelRatio: positiveNumber(operands.devicePixelRatio, 'initialize-engine.devicePixelRatio') }),
  };
}

function loadSceneOperands(action) {
  const operands = recordValue(action.operands, 'load-scene operands');
  assertAllowedKeys(operands, ['datasetRef', 'generatorRef', 'hostRevision'], 'load-scene');
  const references = ['datasetRef', 'generatorRef'].filter((key) => operands[key] !== undefined);
  assert(references.length === 1 && Object.hasOwn(operands, 'hostRevision'), 'load-scene operand shape');
  return {
    hostRevision: integerValue(operands.hostRevision, 'load-scene.hostRevision'),
    reference: stringValue(operands[references[0]], `load-scene.${references[0]}`),
    raw: clone(operands),
  };
}

function racePreReadyOperands(value) {
  const operands = exactRecord(value, ['datasetRef', 'expectedAppliedCount', 'submitAtMs'], 'race.preReady');
  integerValue(operands.expectedAppliedCount, 'race.preReady.expectedAppliedCount');
  return {
    datasetRef: stringValue(operands.datasetRef, 'race.preReady.datasetRef'),
    submitAtMs: finiteNumber(operands.submitAtMs, 'race.preReady.submitAtMs'),
  };
}

function racePendingOperands(value) {
  assert(Array.isArray(value) && value.length > 0, 'race.pending must be a non-empty array');
  const requestIds = new Set();
  return value.map((entry, index) => {
    const operands = exactRecord(entry, ['completeAtMs', 'datasetRef', 'requestId', 'submitAtMs'], `race.pending[${index}]`);
    const requestId = stringValue(operands.requestId, `race.pending[${index}].requestId`);
    assert(!requestIds.has(requestId), `duplicate race request ${requestId}`);
    requestIds.add(requestId);
    const submitAtMs = finiteNumber(operands.submitAtMs, `race.pending[${index}].submitAtMs`);
    const completeAtMs = finiteNumber(operands.completeAtMs, `race.pending[${index}].completeAtMs`);
    assert(completeAtMs >= submitAtMs, `race.pending[${index}] completes before submission`);
    return {
      requestId,
      datasetRef: stringValue(operands.datasetRef, `race.pending[${index}].datasetRef`),
      submitAtMs,
      completeAtMs,
    };
  });
}

function raceFailedLaterOperands(value) {
  const operands = exactRecord(value, ['datasetId', 'expectedCode', 'submitAtMs'], 'race.failedLater');
  stringValue(operands.expectedCode, 'race.failedLater.expectedCode');
  return {
    datasetId: stringValue(operands.datasetId, 'race.failedLater.datasetId'),
    submitAtMs: finiteNumber(operands.submitAtMs, 'race.failedLater.submitAtMs'),
  };
}

function probeFailureOperands(action) {
  const operands = exactOperands(action, [
    'afterActionIndex',
    'expectedRollback',
    'injection',
    'isolate',
    'journeyId',
  ]);
  recordValue(operands.expectedRollback, 'probe-declared-failure.expectedRollback');
  const injection = exactRecord(operands.injection, ['diagnostic', 'id', 'mode'], 'probe-declared-failure.injection');
  return {
    afterActionIndex: integerValue(operands.afterActionIndex, 'probe-declared-failure.afterActionIndex'),
    isolate: booleanValue(operands.isolate, 'probe-declared-failure.isolate'),
    journeyId: stringValue(operands.journeyId, 'probe-declared-failure.journeyId'),
    injection: {
      diagnostic: stringValue(injection.diagnostic, 'probe-declared-failure.injection.diagnostic'),
      id: stringValue(injection.id, 'probe-declared-failure.injection.id'),
      mode: stringValue(injection.mode, 'probe-declared-failure.injection.mode'),
    },
  };
}

async function advanceTo(context, timeMs) {
  assertNotAborted(context.signal);
  const current = context.clock.now();
  assert(Number.isFinite(current), 'clock.now() must be finite');
  assert(timeMs >= current, `clock cannot move backwards from ${current} to ${timeMs}`);
  await context.clock.advanceTo(timeMs);
  assertNotAborted(context.signal);
}

async function call(target, method, ...args) {
  requireMethod(target, method);
  return target[method](...args);
}

function requireMethod(target, method) {
  assert(target !== null && typeof target === 'object' && typeof target[method] === 'function', `engine must expose ${method}()`);
}

function snapshotEngine(engine) {
  requireMethod(engine, 'snapshot');
  return clone(engine.snapshot());
}

function sameSceneAuthority(left, right) {
  return sceneRevision(left) === sceneRevision(right)
    && left.semanticHash === right.semanticHash
    && left.datasetRef === right.datasetRef
    && JSON.stringify(left.rootIds) === JSON.stringify(right.rootIds);
}

function sceneRevision(snapshot) {
  return snapshot.revisions?.sceneRevision ?? snapshot.sceneRevision ?? null;
}

function frameRevision(snapshot) {
  return typeof snapshot.frameRevision === 'number' ? snapshot.frameRevision : 0;
}

function activeSubscriptions(snapshot) {
  const active = snapshot.resources?.subscriptions?.active;
  return typeof active === 'number' && Number.isInteger(active) && active >= 0 ? active : null;
}

function snapshotHistoryDepth(snapshot) {
  return typeof snapshot.historyDepth === 'number' && Number.isInteger(snapshot.historyDepth)
    ? snapshot.historyDepth
    : null;
}

function backendPreference(value) {
  const backend = stringValue(value, 'backend');
  if (backend === 'webgl' || backend === 'webgl2') return 'webgl';
  if (backend === 'webgpu') return 'webgpu';
  throw new Error(`Core v2 foundation handler invalid: unsupported backend ${backend}`);
}

function actualError(error) {
  const diagnostic = error?.diagnostic;
  const code = diagnostic?.code ?? error?.code ?? (error instanceof Error ? error.name : 'UNKNOWN_FAILURE');
  return {
    name: error instanceof Error ? error.name : typeof error,
    code,
    message: error instanceof Error ? error.message : String(error),
    ...directErrorMetadata(error),
    ...(diagnostic && typeof diagnostic === 'object' ? { diagnostic: clone(diagnostic) } : {}),
  };
}

function directErrorMetadata(error) {
  if (error === null || (typeof error !== 'object' && typeof error !== 'function')) return {};
  const metadata = {};
  for (const key of [
    'category',
    'datasetPath',
    'recoverable',
    'retryable',
    'appliedCount',
    'missingCount',
    'unchangedCount',
  ]) {
    if (key in error && error[key] !== undefined) metadata[key] = clone(error[key]);
  }
  return metadata;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function eventPriority(kind) {
  return kind === 'submit' ? 0 : 1;
}

function exactOperands(action, keys) {
  return exactRecord(action.operands, keys, action.type);
}

function exactRecord(value, keys, label) {
  const record = recordValue(value, label);
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  assert(actual.length === expected.length && actual.every((key, index) => key === expected[index]), `${label} operand keys`);
  return record;
}

function assertAllowedKeys(record, keys, label) {
  const accepted = new Set(keys);
  const unknown = Object.keys(record).find((key) => !accepted.has(key));
  assert(unknown === undefined, `${label} unknown operand ${String(unknown)}`);
}

function readPath(value, path, label) {
  let cursor = value;
  for (const segment of path.split('.')) {
    assert(cursor !== null && typeof cursor === 'object' && Object.hasOwn(cursor, segment), `${label} unresolved path ${path}`);
    cursor = cursor[segment];
  }
  return cursor;
}

function viewportPair(value, label) {
  assert(Array.isArray(value) && value.length === 2, `${label} must contain width and height`);
  return [positiveNumber(value[0], `${label}[0]`), positiveNumber(value[1], `${label}[1]`)];
}

function isDeeplyFrozen(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Object.values(value).every((nested) => isDeeplyFrozen(nested, seen));
}

function clone(value) {
  return structuredClone(value);
}

function recordValue(value, label) {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  return value;
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} must be a non-empty string`);
  return value;
}

function booleanValue(value, label) {
  assert(typeof value === 'boolean', `${label} must be a boolean`);
  return value;
}

function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} must be finite`);
  return value;
}

function positiveNumber(value, label) {
  const number = finiteNumber(value, label);
  assert(number > 0, `${label} must be positive`);
  return number;
}

function integerValue(value, label) {
  assert(typeof value === 'number' && Number.isInteger(value), `${label} must be an integer`);
  return value;
}

function assertNotAborted(signal) {
  if (signal.aborted) throw signal.reason ?? new Error('action aborted');
}

function assert(condition, message) {
  if (!condition) throw new Error(`Core v2 foundation handler invalid: ${message}`);
}
