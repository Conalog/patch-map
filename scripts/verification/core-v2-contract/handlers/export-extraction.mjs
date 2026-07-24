export const EXPORT_EXTRACTION_HANDLER_REVISION =
  'core-v2-export-extraction-handlers/1';

export const EXPORT_EXTRACTION_CASE_IDS = Object.freeze([
  'DET-004',
  'PIX-004',
  'PRF-008',
  'CSM-035',
  'CSM-038',
]);

export const EXPORT_EXTRACTION_ACTION_TYPES = Object.freeze([
  'load-dataset',
  'apply-transaction',
  'export-canonical-dataset',
  'load-export-fresh-instance',
  'publish-revision-tuple',
  'extract-pixijs-scene',
  'restore-authoritative-canvas',
  'extract-published-tuple',
  'swap-image-and-restore-canvas',
  'apply-merge',
  'host-validate-and-upload',
  'load-scene',
  'extract-scene',
  'show-host-image',
  'restore-engine-canvas',
  'probe-declared-failure',
]);

const CASE_ACTIONS = Object.freeze({
  'DET-004': Object.freeze([
    'load-dataset',
    'apply-transaction',
    'export-canonical-dataset',
    'load-export-fresh-instance',
  ]),
  'PIX-004': Object.freeze([
    'publish-revision-tuple',
    'extract-pixijs-scene',
    'restore-authoritative-canvas',
  ]),
  'PRF-008': Object.freeze([
    'load-dataset',
    'extract-published-tuple',
    'swap-image-and-restore-canvas',
  ]),
  'CSM-035': Object.freeze([
    'apply-merge',
    'export-canonical-dataset',
    'host-validate-and-upload',
    'host-validate-and-upload',
    'probe-declared-failure',
  ]),
  'CSM-038': Object.freeze([
    'load-scene',
    'extract-scene',
    'show-host-image',
    'restore-engine-canvas',
    'probe-declared-failure',
  ]),
});

/** Shared expected-blind handlers for canonical export and Pixi scene extraction. */
export function createExportExtractionHandlerEntries(productValue) {
  const product = validateProductAdapter(productValue);
  const states = new WeakMap();
  const implementations = Object.freeze({
    'load-dataset': loadDatasetAction,
    'apply-transaction': applyTransactionAction,
    'export-canonical-dataset': exportCanonicalDatasetAction,
    'load-export-fresh-instance': loadExportFreshInstanceAction,
    'publish-revision-tuple': publishRevisionTupleAction,
    'extract-pixijs-scene': extractPixijsSceneAction,
    'restore-authoritative-canvas': restoreAuthoritativeCanvasAction,
    'extract-published-tuple': extractPublishedTupleAction,
    'swap-image-and-restore-canvas': swapImageAndRestoreCanvasAction,
    'apply-merge': applyMergeAction,
    'host-validate-and-upload': hostValidateAndUploadAction,
    'load-scene': loadSceneAction,
    'extract-scene': extractSceneAction,
    'show-host-image': showHostImageAction,
    'restore-engine-canvas': restoreEngineCanvasAction,
    'probe-declared-failure': probeDeclaredFailureAction,
  });
  return Object.freeze(EXPORT_EXTRACTION_ACTION_TYPES.map((type) => Object.freeze([
    `contract/${type}`,
    withState(product, states, implementations[type]),
  ])));
}

function withState(product, states, implementation) {
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
    return implementation(product, state, context, action);
  };
}

function createState(caseId) {
  return {
    caseId,
    engine: null,
    exportedDataset: null,
    exportValidation: null,
    exportFingerprint: null,
    preExportSemanticHash: null,
    roundtripSemanticHash: null,
    semanticMutationCount: 0,
    uploadAttempts: 0,
    retryMutationCount: 0,
    inputMutationCount: 0,
    hostRevision: 0,
    mode: caseId === 'CSM-038' ? 'report' : 'select',
    dirty: false,
    extraction: null,
    presentation: null,
    failureRollback: null,
  };
}

async function loadDatasetAction(product, state, context, action) {
  assert(state.caseId === 'DET-004' || state.caseId === 'PRF-008', 'load-dataset case');
  const operands = exactOperands(action, ['datasetRef']);
  const loaded = await loadDatasetReference(
    product,
    state,
    context,
    stringValue(operands.datasetRef, 'datasetRef'),
  );
  return actionOutput('load-dataset', loaded, state, product, state.engine);
}

function applyTransactionAction(product, state, context, action) {
  assert(state.caseId === 'DET-004', 'apply-transaction case');
  const operands = exactOperands(action, ['actionId', 'operations']);
  const operations = arrayValue(operands.operations, 'transaction operations').map(
    (value, index) => transactionOperation(value, index),
  );
  const engine = currentEngine(state, 'apply-transaction');
  const before = snapshotEngine(engine);
  const result = callSync(engine, 'transact', {
    actionId: stringValue(operands.actionId, 'transaction actionId'),
    strict: true,
    operations,
  });
  assert(result.status === 'committed', 'export transaction must commit');
  callSync(engine, 'publishFrame', context.clock.now());
  const after = snapshotEngine(engine);
  state.semanticMutationCount += Number(after.revisions.sceneRevision)
    - Number(before.revisions.sceneRevision);
  state.dirty = true;
  return actionOutput('apply-transaction', {
    result: clone(result),
    revisionDelta: Number(after.revisions.sceneRevision)
      - Number(before.revisions.sceneRevision),
  }, state, product, engine);
}

function exportCanonicalDatasetAction(product, state, context, action) {
  assert(state.caseId === 'DET-004' || state.caseId === 'CSM-035', 'export case');
  const operands = recordValue(action.operands, 'export operands');
  const expectedKeys = state.caseId === 'DET-004'
    ? ['includeGeneratedIds', 'root']
    : ['includeTransientState', 'root', 'saveAttemptId'];
  assertExactKeys(operands, expectedKeys, 'export operands');
  assert(operands.root === 'array', 'export array root');
  if (state.caseId === 'DET-004') {
    assert(operands.includeGeneratedIds === true, 'generated IDs included');
  } else {
    assert(operands.includeTransientState === false, 'transient state excluded');
    assert(
      stringValue(operands.saveAttemptId, 'save attempt ID') === 'save-1',
      'initial save attempt',
    );
  }
  const engine = currentEngine(state, 'export-canonical-dataset');
  state.preExportSemanticHash = snapshotEngine(engine).semanticHash;
  state.exportedDataset = clone(callSync(engine, 'exportDataset'));
  state.exportValidation = clone(product.validateCanonicalDataset(state.exportedDataset));
  state.exportFingerprint = context.fingerprint(state.exportedDataset);
  assert(state.exportValidation.rootKind === 'array', 'export root kind');
  assert(state.exportValidation.schemaValid === true, 'export schema validity');
  return actionOutput('export-canonical-dataset', {
    export: clone(state.exportValidation),
    fingerprint: state.exportFingerprint,
  }, state, product, engine);
}

async function loadExportFreshInstanceAction(product, state, context, action) {
  assert(state.caseId === 'DET-004', 'load-export-fresh-instance case');
  const operands = exactOperands(action, ['lifecycleGeneration']);
  const generation = positiveInteger(
    operands.lifecycleGeneration,
    'fresh lifecycle generation',
  );
  assert(generation === 2, 'fresh lifecycle generation 2');
  assert(Array.isArray(state.exportedDataset), 'fresh load requires export');
  const previous = currentEngine(state, 'load-export-fresh-instance');
  const release = await context.releaseEngine(
    previous,
    'deterministic-export-fresh-instance-handoff',
  );
  state.engine = null;
  const engine = await context.ensureSessionEngine(generation);
  await initializeEngine(engine, `${state.caseId.toLowerCase()}-session-${generation}`);
  const beforeFingerprint = context.fingerprint(state.exportedDataset);
  const result = callSync(engine, 'loadDataset', state.exportedDataset, {
    datasetRef: 'canonical-export',
  });
  callSync(engine, 'publishFrame', context.clock.now());
  assert(
    context.fingerprint(state.exportedDataset) === beforeFingerprint,
    'fresh load must not mutate export',
  );
  state.engine = engine;
  state.roundtripSemanticHash = snapshotEngine(engine).semanticHash;
  return actionOutput('load-export-fresh-instance', {
    lifecycleGeneration: generation,
    priorInstanceRelease: clone(release),
    load: clone(result),
    semanticHash: state.roundtripSemanticHash,
    sameSemanticHash:
      state.roundtripSemanticHash !== null
      && state.roundtripSemanticHash === state.preExportSemanticHash,
  }, state, product, engine);
}

async function publishRevisionTupleAction(product, state, context, action) {
  assert(state.caseId === 'PIX-004', 'publish-revision-tuple case');
  const operands = exactOperands(action, ['interaction', 'scene', 'view']);
  const targetTuple = tupleValue(operands, 'published tuple');
  const datasetRef = stringValue(context.fixtureParams.datasetRef, 'PIX-004 datasetRef');
  await loadDatasetReference(product, state, context, datasetRef);
  const engine = currentEngine(state, 'publish-revision-tuple');
  const patch = callSync(engine, 'patch', elementTarget('rect-b'), {
    attrs: { x: 180 },
  });
  assert(patch.status === 'committed', 'PIX-004 scene revision commit');
  callSync(engine, 'setViewport', {
    centerWorld: [200, 150],
    scale: 1.25,
  });
  callSync(engine, 'select', ['rect-b']);
  callSync(engine, 'publishFrame', context.clock.now());
  const snapshot = snapshotEngine(engine);
  assert(sameTuple(snapshot.publishedTuple, targetTuple), 'published tuple target');
  return actionOutput('publish-revision-tuple', {
    targetTuple,
    publishedTuple: clone(snapshot.publishedTuple),
  }, state, product, engine);
}

async function extractPixijsSceneAction(product, state, _context, action) {
  assert(state.caseId === 'PIX-004', 'extract-pixijs-scene case');
  const request = extractionOperands(action, false);
  const engine = currentEngine(state, 'extract-pixijs-scene');
  state.extraction = clone(await product.extract({
    caseId: state.caseId,
    engine,
    request,
    repeats: 1,
  }));
  return actionOutput('extract-pixijs-scene', {
    extraction: clone(state.extraction),
  }, state, product, engine);
}

async function restoreAuthoritativeCanvasAction(product, state, _context, action) {
  assert(state.caseId === 'PIX-004', 'restore-authoritative-canvas case');
  const operands = exactOperands(action, ['expectedCanvasIdentity']);
  const engine = currentEngine(state, 'restore-authoritative-canvas');
  const restored = await product.restore({
    caseId: state.caseId,
    engine,
    expectedIdentity: stringValue(
      operands.expectedCanvasIdentity,
      'expected canvas identity',
    ),
  });
  return actionOutput('restore-authoritative-canvas', {
    restored,
  }, state, product, engine);
}

async function extractPublishedTupleAction(product, state, _context, action) {
  assert(state.caseId === 'PRF-008', 'extract-published-tuple case');
  const { repeats, request } = repeatedExtractionOperands(action);
  const engine = currentEngine(state, 'extract-published-tuple');
  state.extraction = clone(await product.extract({
    caseId: state.caseId,
    engine,
    request,
    repeats,
  }));
  return actionOutput('extract-published-tuple', {
    extraction: clone(state.extraction),
  }, state, product, engine);
}

async function swapImageAndRestoreCanvasAction(product, state, _context, action) {
  assert(state.caseId === 'PRF-008', 'swap-image-and-restore-canvas case');
  const operands = exactOperands(action, ['repeats']);
  const engine = currentEngine(state, 'swap-image-and-restore-canvas');
  state.presentation = clone(await product.present({
    caseId: state.caseId,
    engine,
    repeats: positiveInteger(operands.repeats, 'presentation repeats'),
    mode: 'swap-each',
  }));
  const restored = await product.restore({
    caseId: state.caseId,
    engine,
    expectedIdentity: 'initial-canvas',
  });
  return actionOutput('swap-image-and-restore-canvas', {
    presentation: clone(state.presentation),
    restored,
  }, state, product, engine);
}

async function applyMergeAction(product, state, context, action) {
  assert(state.caseId === 'CSM-035', 'apply-merge case');
  const operands = exactOperands(action, ['actionId', 'changes', 'target']);
  if (state.engine === null) {
    await loadDatasetReference(
      product,
      state,
      context,
      stringValue(context.fixtureParams.datasetRef, 'CSM-035 datasetRef'),
    );
  }
  const engine = currentEngine(state, 'apply-merge');
  const before = snapshotEngine(engine);
  const result = callSync(
    engine,
    'patch',
    elementTarget(stringValue(operands.target, 'merge target')),
    clone(operands.changes),
  );
  assert(result.status === 'committed', 'save mutation must commit');
  callSync(engine, 'publishFrame', context.clock.now());
  const after = snapshotEngine(engine);
  state.semanticMutationCount += Number(after.revisions.sceneRevision)
    - Number(before.revisions.sceneRevision);
  state.dirty = true;
  return actionOutput('apply-merge', {
    actionId: stringValue(operands.actionId, 'merge action ID'),
    result: clone(result),
  }, state, product, engine);
}

function hostValidateAndUploadAction(product, state, _context, action) {
  assert(state.caseId === 'CSM-035', 'host-validate-and-upload case');
  const operands = exactOperands(action, ['retry', 'saveAttemptId']);
  assert(typeof operands.retry === 'boolean', 'upload retry flag');
  assert(Array.isArray(state.exportedDataset), 'upload requires canonical export');
  const engine = currentEngine(state, 'host-validate-and-upload');
  const before = snapshotEngine(engine);
  const beforeExport = state.exportFingerprint;
  const validation = product.validateCanonicalDataset(state.exportedDataset);
  assert(validation.schemaValid === true, 'host validator accepts canonical export');
  state.uploadAttempts += 1;
  const after = snapshotEngine(engine);
  const mutationDelta = Number(after.revisions.sceneRevision)
    - Number(before.revisions.sceneRevision);
  if (operands.retry === true) state.retryMutationCount += mutationDelta;
  state.dirty = false;
  assert(state.exportFingerprint === beforeExport, 'upload retains prior export');
  return actionOutput('host-validate-and-upload', {
    saveAttemptId: stringValue(operands.saveAttemptId, 'save attempt ID'),
    retry: operands.retry,
    validation: clone(validation),
    sceneMutationDelta: mutationDelta,
    uploadAttempt: state.uploadAttempts,
  }, state, product, engine, {
    operation: 'host-validate-and-upload',
    returned: {
      saveAttemptId: operands.saveAttemptId,
      retry: operands.retry,
      accepted: true,
    },
  });
}

async function loadSceneAction(product, state, context, action) {
  assert(state.caseId === 'CSM-038', 'load-scene case');
  const operands = exactOperands(action, ['datasetRef', 'hostRevision']);
  state.hostRevision = positiveInteger(operands.hostRevision, 'host revision');
  const loaded = await loadDatasetReference(
    product,
    state,
    context,
    stringValue(operands.datasetRef, 'datasetRef'),
  );
  return actionOutput('load-scene', {
    ...loaded,
    hostRevision: state.hostRevision,
  }, state, product, state.engine, {
    operation: 'load-scene',
    returned: { hostRevision: state.hostRevision },
  });
}

async function extractSceneAction(product, state, _context, action) {
  assert(state.caseId === 'CSM-038', 'extract-scene case');
  const { repeats, request } = repeatedExtractionOperands(action);
  const engine = currentEngine(state, 'extract-scene');
  state.extraction = clone(await product.extract({
    caseId: state.caseId,
    engine,
    request,
    repeats,
  }));
  return actionOutput('extract-scene', {
    extraction: clone(state.extraction),
  }, state, product, engine);
}

async function showHostImageAction(product, state, _context, action) {
  assert(state.caseId === 'CSM-038', 'show-host-image case');
  const operands = exactOperands(action, ['repeats']);
  const engine = currentEngine(state, 'show-host-image');
  state.presentation = clone(await product.present({
    caseId: state.caseId,
    engine,
    repeats: positiveInteger(operands.repeats, 'host image repeats'),
    mode: 'show-sequence',
  }));
  return actionOutput('show-host-image', {
    presentation: clone(state.presentation),
  }, state, product, engine, {
    operation: 'show-host-image',
    returned: { shownCount: state.presentation.shownCount },
  });
}

async function restoreEngineCanvasAction(product, state, _context, action) {
  assert(state.caseId === 'CSM-038', 'restore-engine-canvas case');
  const operands = exactOperands(action, ['expectedIdentity', 'repeats']);
  assert(
    positiveInteger(operands.repeats, 'restore repeats') === 10,
    'restore repeat trace',
  );
  const engine = currentEngine(state, 'restore-engine-canvas');
  const restored = await product.restore({
    caseId: state.caseId,
    engine,
    expectedIdentity: stringValue(operands.expectedIdentity, 'restore identity'),
  });
  return actionOutput('restore-engine-canvas', {
    restored,
  }, state, product, engine, {
    operation: 'restore-engine-canvas',
    returned: clone(restored),
  });
}

async function probeDeclaredFailureAction(product, state, _context, action) {
  assert(state.caseId === 'CSM-035' || state.caseId === 'CSM-038', 'declared failure case');
  const operands = exactOperands(action, [
    'afterActionIndex',
    'expectedRollback',
    'injection',
    'isolate',
    'journeyId',
  ]);
  assert(operands.journeyId === state.caseId, 'declared failure journey identity');
  assert(operands.isolate === true, 'declared failure isolation');
  assert(
    operands.afterActionIndex === 3,
    'declared failure follows the fourth successful action',
  );
  const injection = recordValue(operands.injection, 'failure injection');
  assertExactKeys(injection, ['diagnostic', 'id', 'mode'], 'failure injection');
  assert(injection.diagnostic === 'DECLARED_FAILURE', 'declared diagnostic');
  assert(injection.mode === 'contract-branch', 'declared failure mode');
  const rollbackShape = recordValue(operands.expectedRollback, 'rollback shape');
  const engine = currentEngine(state, 'probe-declared-failure');
  if (state.caseId === 'CSM-035') {
    assert(injection.id === 'invalidExportBlocksUpload', 'save failure injection');
    assertExactKeys(rollbackShape, [
      'invalidExportBlocksUpload',
      'priorExportRetainedOnUploadFailure',
      'retryMutationCount',
    ], 'save rollback shape');
    assert(Array.isArray(state.exportedDataset), 'save failure requires prior export');
    const probe = product.probeInvalidExport(state.exportedDataset);
    state.failureRollback = {
      invalidExportBlocksUpload: probe.invalidExportBlocksUpload,
      retryMutationCount: state.retryMutationCount,
      priorExportRetainedOnUploadFailure: probe.priorExportRetainedOnUploadFailure,
    };
  } else {
    assert(injection.id === 'onFailureKeepCanvasVisible', 'report failure injection');
    assertExactKeys(rollbackShape, [
      'blankReportAccepted',
      'onFailureKeepCanvasVisible',
      'retryDoesNotDuplicateResources',
    ], 'report rollback shape');
    state.failureRollback = clone(await product.probeHostImageFailure(engine));
  }
  return actionOutput('probe-declared-failure', {
    diagnostic: 'DECLARED_FAILURE',
    injectionId: injection.id,
    rollback: clone(state.failureRollback),
  }, state, product, engine, {
    operation: 'probe-declared-failure',
    returned: {
      diagnostic: 'DECLARED_FAILURE',
      rollback: clone(state.failureRollback),
    },
  });
}

async function loadDatasetReference(product, state, context, datasetRef) {
  const engine = await ensureEngine(state, context);
  const dataset = await context.resolveDataset(datasetRef);
  const beforeFingerprint = context.fingerprint(dataset);
  const result = callSync(engine, 'loadDataset', dataset, { datasetRef });
  callSync(engine, 'publishFrame', context.clock.now());
  const afterFingerprint = context.fingerprint(dataset);
  if (beforeFingerprint !== afterFingerprint) state.inputMutationCount += 1;
  assert(beforeFingerprint === afterFingerprint, 'input dataset immutability');
  return {
    datasetRef,
    result: clone(result),
    inputFingerprint: beforeFingerprint,
    product: product.observeEngine(engine),
  };
}

async function ensureEngine(state, context) {
  if (state.engine !== null) return state.engine;
  const engine = await context.ensureMainEngine();
  await initializeEngine(engine, `${state.caseId.toLowerCase()}-main`);
  state.engine = engine;
  return engine;
}

async function initializeEngine(engine, instanceId) {
  const snapshot = snapshotEngine(engine);
  if (snapshot.lifecycle === 'ready') return;
  assert(snapshot.lifecycle === 'new', 'engine initialize lifecycle');
  await call(engine, 'initialize', {
    instanceId,
    width: 800,
    height: 600,
    pixelRatio: 1,
    strategy: 'mesh',
  });
}

function actionOutput(operation, actual, state, product, engine, host = null) {
  const productObservation = engine === null
    ? null
    : product.observeEngine(engine);
  return {
    actual: {
      operation,
      ...clone(actual),
      product: productObservation,
      runtimeState: runtimeState(state),
    },
    ...(host === null ? {} : { host }),
  };
}

function runtimeState(state) {
  return {
    caseId: state.caseId,
    export: clone(state.exportValidation),
    exportFingerprint: state.exportFingerprint,
    preExportSemanticHash: state.preExportSemanticHash,
    roundtripSemanticHash: state.roundtripSemanticHash,
    semanticMutationCount: state.semanticMutationCount,
    uploadAttempts: state.uploadAttempts,
    retryMutationCount: state.retryMutationCount,
    inputMutationCount: state.inputMutationCount,
    hostRevision: state.hostRevision,
    mode: state.mode,
    dirty: state.dirty,
    extraction: clone(state.extraction),
    presentation: clone(state.presentation),
    failureRollback: clone(state.failureRollback),
  };
}

function extractionOperands(action, includesRepeats) {
  const keys = includesRepeats
    ? ['cssSize', 'mime', 'repeats', 'targetTuple']
    : ['cssSize', 'mime', 'targetTuple'];
  const operands = exactOperands(action, keys);
  assert(operands.mime === 'image/png', 'PNG extraction mime');
  return {
    targetTuple: tupleValue(operands.targetTuple, 'extraction target tuple'),
    cssSize: sizeValue(operands.cssSize, 'extraction CSS size'),
    mime: 'image/png',
  };
}

function repeatedExtractionOperands(action) {
  const operands = recordValue(action.operands, 'repeated extraction operands');
  return {
    repeats: positiveInteger(operands.repeats, 'extraction repeats'),
    request: extractionOperands(action, true),
  };
}

function transactionOperation(value, index) {
  const operation = recordValue(value, `transaction operation ${index}`);
  assertExactKeys(operation, ['changes', 'target', 'type'], `transaction operation ${index}`);
  assert(operation.type === 'merge', `transaction operation ${index} type`);
  return {
    op: 'merge',
    target: targetValue(operation.target),
    changes: flattenChanges(operation.changes),
  };
}

function flattenChanges(value, path = []) {
  const record = recordValue(value, 'transaction merge changes');
  return Object.entries(record).flatMap(([key, nested]) => {
    const nextPath = [...path, key];
    if (
      nested !== null
      && typeof nested === 'object'
      && !Array.isArray(nested)
    ) {
      return flattenChanges(nested, nextPath);
    }
    return [{ path: nextPath, value: clone(nested) }];
  });
}

function targetValue(value) {
  if (typeof value === 'string') return elementTarget(value);
  const target = recordValue(value, 'component target');
  assertExactKeys(target, ['id', 'ownerId'], 'component target');
  return {
    kind: 'component',
    ownerId: stringValue(target.ownerId, 'component owner ID'),
    id: stringValue(target.id, 'component ID'),
  };
}

function elementTarget(id) {
  return { kind: 'element', id: stringValue(id, 'element ID') };
}

function tupleValue(value, label) {
  const tuple = recordValue(value, label);
  assertExactKeys(tuple, ['interaction', 'scene', 'view'], label);
  return {
    scene: nonNegativeInteger(tuple.scene, `${label}.scene`),
    view: nonNegativeInteger(tuple.view, `${label}.view`),
    interaction: nonNegativeInteger(tuple.interaction, `${label}.interaction`),
  };
}

function sizeValue(value, label) {
  const size = arrayValue(value, label);
  assert(size.length === 2, `${label} length`);
  return [
    positiveFinite(size[0], `${label}[0]`),
    positiveFinite(size[1], `${label}[1]`),
  ];
}

function sameTuple(leftValue, rightValue) {
  const left = tupleValue(leftValue, 'left tuple');
  const right = tupleValue(rightValue, 'right tuple');
  return left.scene === right.scene
    && left.view === right.view
    && left.interaction === right.interaction;
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
    assert(typeof context[method] === 'function', `context.${method}`);
  }
  assert(recordValue(context.fixtureParams, 'fixture params'), 'fixture params');
  assert(recordValue(context.clock, 'clock'), 'clock');
  assert(typeof context.clock.now === 'function', 'clock.now');
  assert(context.signal instanceof AbortSignal, 'context signal');
  return context;
}

function validateProductAdapter(value) {
  const product = recordValue(value, 'product adapter');
  for (const method of [
    'observeEngine',
    'validateCanonicalDataset',
    'extract',
    'present',
    'restore',
    'probeInvalidExport',
    'probeHostImageFailure',
    'resourceProbe',
  ]) {
    assert(typeof product[method] === 'function', `product.${method}`);
  }
  return product;
}

function exactOperands(action, keys) {
  const operands = recordValue(action.operands, `${action.type} operands`);
  assertExactKeys(operands, keys, `${action.type} operands`);
  return operands;
}

function snapshotEngine(engine) {
  return clone(callSync(engine, 'snapshot'));
}

function currentEngine(state, operation) {
  assert(state.engine !== null, `${operation} requires an engine`);
  return state.engine;
}

function callSync(target, method, ...args) {
  assert(target !== null && typeof target === 'object', `${method} target`);
  assert(typeof target[method] === 'function', `${method} method`);
  return target[method](...args);
}

async function call(target, method, ...args) {
  return callSync(target, method, ...args);
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, label);
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

function positiveFinite(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value) && value > 0, label);
  return value;
}

function arrayValue(value, label) {
  assert(Array.isArray(value), label);
  return value;
}

function recordValue(value, label) {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), label);
  return value;
}

function assertExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  assert(
    actual.length === sortedExpected.length
      && actual.every((key, index) => key === sortedExpected[index]),
    `${label} exact keys`,
  );
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Invalid Core v2 export/extraction handler: ${message}`);
}
