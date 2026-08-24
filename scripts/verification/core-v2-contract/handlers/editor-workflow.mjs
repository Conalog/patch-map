import { clone, deepFreeze } from '../value-atoms.mjs';

export const EDITOR_WORKFLOW_HANDLER_REVISION =
  'core-v2-editor-workflow-handlers/1';

export const EDITOR_WORKFLOW_CASE_IDS = Object.freeze([
  'CSM-025',
  'CSM-026',
  'CSM-027',
  'CSM-033',
  'CSM-034',
]);

export const EDITOR_WORKFLOW_ACTION_TYPES = Object.freeze([
  'enter-grid-edit',
  'reveal-inactive-cells',
  'resize-grid',
  'set-grid-cell-active',
  'exit-grid-edit',
  'undo',
  'enter-relation-edit',
  'add-relation-link',
  'remove-relation-link',
  'exit-relation-edit',
  'open-text-editor',
  'replace-scene',
  'resolve-editor-target-by-id',
  'commit-text-edit',
  'select-targets',
  'request-delete-plan',
  'apply-host-cascade-confirmation',
  'delete-transaction',
  'run-editor-mutation-matrix',
  'undo-all',
  'redo-all',
  'probe-declared-failure',
]);

const CASE_ACTIONS = Object.freeze({
  'CSM-025': Object.freeze([
    'enter-grid-edit',
    'reveal-inactive-cells',
    'resize-grid',
    'set-grid-cell-active',
    'set-grid-cell-active',
    'exit-grid-edit',
    'undo',
    'probe-declared-failure',
  ]),
  'CSM-026': Object.freeze([
    'enter-relation-edit',
    'add-relation-link',
    'remove-relation-link',
    'add-relation-link',
    'exit-relation-edit',
    'undo',
    'probe-declared-failure',
  ]),
  'CSM-027': Object.freeze([
    'open-text-editor',
    'replace-scene',
    'resolve-editor-target-by-id',
    'commit-text-edit',
    'commit-text-edit',
    'probe-declared-failure',
  ]),
  'CSM-033': Object.freeze([
    'select-targets',
    'request-delete-plan',
    'apply-host-cascade-confirmation',
    'delete-transaction',
    'undo',
    'probe-declared-failure',
  ]),
  'CSM-034': Object.freeze([
    'run-editor-mutation-matrix',
    'undo-all',
    'redo-all',
    'probe-declared-failure',
  ]),
});

const ACTION_OPERAND_KEYS = Object.freeze({
  'enter-grid-edit': Object.freeze(['target']),
  'reveal-inactive-cells': Object.freeze(['target']),
  'resize-grid': Object.freeze([
    'actionId',
    'columns',
    'gapX',
    'gapY',
    'rows',
    'target',
  ]),
  'set-grid-cell-active': Object.freeze([
    'actionId',
    'active',
    'target',
  ]),
  'exit-grid-edit': Object.freeze(['target']),
  undo: Object.freeze([]),
  'enter-relation-edit': Object.freeze(['target']),
  'add-relation-link': Object.freeze([
    'actionId',
    'relationId',
    'source',
    'target',
  ]),
  'remove-relation-link': Object.freeze([
    'actionId',
    'relationId',
    'source',
    'target',
  ]),
  'exit-relation-edit': Object.freeze(['relationId']),
  'open-text-editor': Object.freeze(['hostOverlay', 'target']),
  'replace-scene': Object.freeze(['datasetRef', 'hostRevision']),
  'resolve-editor-target-by-id': Object.freeze(['target']),
  'commit-text-edit': null,
  'select-targets': Object.freeze(['mode', 'targets']),
  'request-delete-plan': Object.freeze(['targets']),
  'apply-host-cascade-confirmation': Object.freeze([
    'cascadeTargets',
    'confirmed',
  ]),
  'delete-transaction': Object.freeze(['actionId', 'targets']),
  'run-editor-mutation-matrix': Object.freeze([
    'mutationKinds',
    'oneActionEach',
  ]),
  'undo-all': Object.freeze(['count']),
  'redo-all': Object.freeze(['count']),
  'probe-declared-failure': Object.freeze([
    'afterActionIndex',
    'expectedRollback',
    'injection',
    'isolate',
    'journeyId',
  ]),
});

const WORKFLOW_ACTION_TYPES = new Set([
  'enter-grid-edit',
  'reveal-inactive-cells',
  'resize-grid',
  'set-grid-cell-active',
  'exit-grid-edit',
  'enter-relation-edit',
  'add-relation-link',
  'remove-relation-link',
  'exit-relation-edit',
  'open-text-editor',
  'resolve-editor-target-by-id',
  'commit-text-edit',
  'select-targets',
  'request-delete-plan',
  'apply-host-cascade-confirmation',
  'delete-transaction',
]);

export function createEditorWorkflowHandlerEntries(productValue) {
  const product = validateProduct(productValue);
  const states = new WeakMap();
  const handlers = {};

  for (const type of WORKFLOW_ACTION_TYPES) {
    handlers[type] = withState(product, states, workflowAction);
  }
  handlers['replace-scene'] = withState(product, states, replaceScene);
  handlers.undo = withState(product, states, undoAction);
  handlers['run-editor-mutation-matrix'] = withState(
    product,
    states,
    runEditorMutationMatrix,
  );
  handlers['undo-all'] = withState(product, states, undoAll);
  handlers['redo-all'] = withState(product, states, redoAll);
  handlers['probe-declared-failure'] = withState(
    product,
    states,
    probeDeclaredFailure,
  );

  return Object.freeze(EDITOR_WORKFLOW_ACTION_TYPES.map((type) =>
    Object.freeze([`contract/${type}`, handlers[type]])));
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
        loaded: false,
        input: null,
        inputFingerprint: null,
        baseline: null,
        steps: new Map(),
        unavailableUndo: null,
      };
      states.set(context.ensureMainEngine, state);
    }
    assert(state.caseId === context.caseId, 'state case identity');
    return handler(product, state, context, action);
  };
}

async function workflowAction(product, state, context, action) {
  const engine = await ensureEngine(product, state, context);
  const before = product.observe({
    caseId: context.caseId,
    engine,
  });
  const workflow = {
    type: action.type,
    ...clone(action.operands),
    ...(action.type === 'enter-grid-edit'
      ? {
          linkedCellIds: stringArray(
            recordValue(context.hostSupplies, 'grid host supplies').linkedCellIds,
            'linked grid cells',
          ),
        }
      : {}),
    ...(action.type === 'apply-host-cascade-confirmation'
      ? {
          registryLoading: booleanValue(
            recordValue(context.hostSupplies, 'delete host supplies').registryLoading,
            'delete registry loading',
          ),
        }
      : {}),
  };
  const result = product.workflow({
    caseId: context.caseId,
    engine,
    action: workflow,
  });
  publishIfChanged(product, context, engine, result.changed);
  const after = product.observe({
    caseId: context.caseId,
    engine,
  });
  const actual = deepFreeze({
    result,
    before,
    after,
  });
  state.steps.set(action.index, actual);
  return { actual };
}

async function replaceScene(product, state, context, action) {
  assert(context.caseId === 'CSM-027', 'replace scene case');
  const engine = await ensureEngine(product, state, context);
  const operands = action.operands;
  const datasetRef = stringValue(operands.datasetRef, 'replacement datasetRef');
  positiveInteger(operands.hostRevision, 'replacement host revision');
  const dataset = await context.resolveDataset(datasetRef);
  const beforeFingerprint = context.fingerprint(dataset);
  const before = product.observe({ caseId: context.caseId, engine });
  const result = product.loadDataset({
    caseId: context.caseId,
    engine,
    datasetRef,
    dataset,
  });
  product.publish({ caseId: context.caseId, engine, timeMs: context.clock.now() });
  const after = product.observe({ caseId: context.caseId, engine });
  const actual = deepFreeze({
    result,
    before,
    after,
    input: {
      beforeFingerprint,
      afterFingerprint: context.fingerprint(dataset),
    },
  });
  state.steps.set(action.index, actual);
  return { actual };
}

async function undoAction(product, state, context, action) {
  const engine = await ensureEngine(product, state, context);
  const before = product.observe({ caseId: context.caseId, engine });
  const result = product.history({
    caseId: context.caseId,
    engine,
    direction: 'undo',
  });
  publishIfChanged(product, context, engine, result.changed);
  const after = product.observe({ caseId: context.caseId, engine });
  const actual = deepFreeze({ result, before, after });
  state.steps.set(action.index, actual);
  return { actual };
}

async function runEditorMutationMatrix(product, state, context, action) {
  assert(context.caseId === 'CSM-034', 'mutation matrix case');
  const engine = await ensureEngine(product, state, context);
  const operands = action.operands;
  assert(operands.oneActionEach === true, 'matrix one action each');
  const mutationKinds = stringArray(operands.mutationKinds, 'matrix mutation kinds');
  const companion = clone(
    recordValue(context.hostSupplies, 'matrix host supplies').companionState,
  );
  const before = product.observe({ caseId: context.caseId, engine });
  const result = product.runMutationMatrix({
    caseId: context.caseId,
    engine,
    mutationKinds,
    oneActionEach: true,
    companion,
  });
  publishIfChanged(product, context, engine, result.changed);
  const after = product.observe({ caseId: context.caseId, engine });
  const actual = deepFreeze({ result, before, after, companion });
  state.steps.set(action.index, actual);
  return { actual };
}

async function undoAll(product, state, context, action) {
  assert(context.caseId === 'CSM-034', 'undo-all case');
  const engine = await ensureEngine(product, state, context);
  const count = positiveInteger(action.operands.count, 'undo count');
  const before = product.observe({ caseId: context.caseId, engine });
  const results = [];
  for (let index = 0; index < count; index += 1) {
    results.push(product.history({
      caseId: context.caseId,
      engine,
      direction: 'undo',
    }));
  }
  state.unavailableUndo = product.history({
    caseId: context.caseId,
    engine,
    direction: 'undo',
  });
  product.publish({ caseId: context.caseId, engine, timeMs: context.clock.now() });
  const after = product.observe({ caseId: context.caseId, engine });
  const actual = deepFreeze({
    count,
    results,
    unavailable: state.unavailableUndo,
    before,
    after,
  });
  state.steps.set(action.index, actual);
  return { actual };
}

async function redoAll(product, state, context, action) {
  assert(context.caseId === 'CSM-034', 'redo-all case');
  const engine = await ensureEngine(product, state, context);
  const count = positiveInteger(action.operands.count, 'redo count');
  const before = product.observe({ caseId: context.caseId, engine });
  const results = [];
  for (let index = 0; index < count; index += 1) {
    results.push(product.history({
      caseId: context.caseId,
      engine,
      direction: 'redo',
    }));
  }
  product.publish({ caseId: context.caseId, engine, timeMs: context.clock.now() });
  const after = product.observe({ caseId: context.caseId, engine });
  const actual = deepFreeze({ count, results, before, after });
  state.steps.set(action.index, actual);
  return { actual };
}

async function probeDeclaredFailure(product, state, context, action) {
  validateFailureProbe(context, action);
  switch (context.caseId) {
    case 'CSM-025':
      return probeGridFailure(product, state, context);
    case 'CSM-026':
      return probeRelationFailure(product, state, context);
    case 'CSM-027':
      return probeTextFailure(product, state, context);
    case 'CSM-033':
      return probeDeleteFailure(product, state, context);
    case 'CSM-034':
      return probeMatrixFailure(product, state, context);
    default:
      throw new Error(`Unsupported editor workflow failure case ${context.caseId}`);
  }
}

function probeGridFailure(product, state, context) {
  const rejected = step(state, 4, 'linked grid rejection');
  const before = recordValue(rejected.before, 'linked grid before');
  const after = recordValue(rejected.after, 'linked grid after');
  const result = recordValue(rejected.result, 'linked grid result');
  const final = observeState(product, state, context);
  const grid = datasetRecord(final.dataset, 'grid');
  const cells = arrayValue(grid.cells, 'final grid cells');
  const firstRow = arrayValue(cells[0], 'final grid row zero');
  return {
    actual: deepFreeze({
      rollback: {
        strictLinkedCellReject:
          result.status === 'rejected' && result.code === 'CONFLICT',
        linkedCellActive: firstRow[1] !== 0,
        transactionStateBeforeRejectedAction:
          context.fingerprint(before.dataset) === context.fingerprint(after.dataset)
            ? 'retained'
            : 'changed',
      },
      final,
      inputUnchanged: inputUnchanged(state, context),
    }),
  };
}

function probeRelationFailure(product, state, context) {
  const engine = requireStateEngine(state);
  const finalBeforeBranch = observeState(product, state, context);
  product.workflow({
    caseId: context.caseId,
    engine,
    action: { type: 'enter-relation-edit', target: 'links' },
  });
  const invalidBefore = observeState(product, state, context);
  const invalid = product.workflow({
    caseId: context.caseId,
    engine,
    action: {
      type: 'add-relation-link',
      relationId: 'links',
      source: 'item-a',
      target: 'missing-endpoint',
      actionId: 'relation-edit-invalid-endpoint',
    },
  });
  const invalidAfter = observeState(product, state, context);
  const removed = product.workflow({
    caseId: context.caseId,
    engine,
    action: {
      type: 'remove-relation-link',
      relationId: 'links',
      source: 'item-a',
      target: 'rect-b',
      actionId: 'relation-edit-empty-branch',
    },
  });
  publishIfChanged(product, context, engine, removed.changed);
  const exited = product.workflow({
    caseId: context.caseId,
    engine,
    action: { type: 'exit-relation-edit', relationId: 'links' },
  });
  publishIfChanged(product, context, engine, exited.changed);
  const empty = observeState(product, state, context);
  const restored = product.history({
    caseId: context.caseId,
    engine,
    direction: 'undo',
  });
  publishIfChanged(product, context, engine, restored.changed);
  const final = observeState(product, state, context);
  return {
    actual: deepFreeze({
      finalBeforeBranch,
      rollback: {
        invalidEndpointCode: invalid.code,
        emptyRelationRemovedOnExit:
          recordValue(exited.facts, 'relation exit facts').emptyRelationRemoved === true
          && findDatasetRecord(empty.dataset, 'links') === null,
        transactionAtomic:
          context.fingerprint(invalidBefore.dataset)
          === context.fingerprint(invalidAfter.dataset),
      },
      final,
      inputUnchanged: inputUnchanged(state, context),
    }),
  };
}

function probeTextFailure(product, state, context) {
  const engine = requireStateEngine(state);
  const main = recordValue(step(state, 4, 'text main').after, 'text main product');
  const source = stringValue(
    datasetRecord(main.dataset, 'text-c').text,
    'main text source',
  );

  product.workflow({
    caseId: context.caseId,
    engine,
    action: { type: 'open-text-editor', target: 'text-c', hostOverlay: true },
  });
  const cancelBefore = observeState(product, state, context);
  const cancelled = product.workflow({
    caseId: context.caseId,
    engine,
    action: { type: 'cancel-text-edit', target: 'text-c' },
  });
  const cancelAfter = observeState(product, state, context);

  product.workflow({
    caseId: context.caseId,
    engine,
    action: { type: 'open-text-editor', target: 'text-c', hostOverlay: true },
  });
  const emptied = product.workflow({
    caseId: context.caseId,
    engine,
    action: {
      type: 'commit-text-edit',
      target: 'text-c',
      text: '',
      actionId: 'text-edit-empty-branch',
    },
  });
  publishIfChanged(product, context, engine, emptied.changed);
  const emptyObservation = observeState(product, state, context);
  const restored = product.history({
    caseId: context.caseId,
    engine,
    direction: 'undo',
  });
  publishIfChanged(product, context, engine, restored.changed);

  product.workflow({
    caseId: context.caseId,
    engine,
    action: { type: 'open-text-editor', target: 'text-c', hostOverlay: true },
  });
  const withoutTarget = removeDatasetRecord(main.dataset, 'text-c');
  product.loadDataset({
    caseId: context.caseId,
    engine,
    datasetRef: 'interactive-scene-without-text-c',
    dataset: withoutTarget,
  });
  product.publish({ caseId: context.caseId, engine, timeMs: context.clock.now() });
  const missing = product.workflow({
    caseId: context.caseId,
    engine,
    action: { type: 'resolve-editor-target-by-id', target: 'text-c' },
  });

  product.loadDataset({
    caseId: context.caseId,
    engine,
    datasetRef: 'interactive-scene-restored-text-c',
    dataset: main.dataset,
  });
  product.publish({ caseId: context.caseId, engine, timeMs: context.clock.now() });
  product.workflow({
    caseId: context.caseId,
    engine,
    action: { type: 'resolve-editor-target-by-id', target: 'text-c' },
  });
  product.workflow({
    caseId: context.caseId,
    engine,
    action: { type: 'cancel-text-edit', target: 'text-c' },
  });
  const final = observeState(product, state, context);

  return {
    actual: deepFreeze({
      main,
      screenBoundsCss: textScreenBounds(main, 'text-c', source),
      rollback: {
        cancelRestoresOriginal:
          recordValue(cancelled.facts, 'cancel facts').restoredText === source
          && context.fingerprint(cancelBefore.dataset)
            === context.fingerprint(cancelAfter.dataset),
        emptyDeletesTarget:
          recordValue(emptied.facts, 'empty text facts').emptyDeleted === true
          && findDatasetRecord(emptyObservation.dataset, 'text-c') === null,
        missingAfterReplaceCode: missing.code,
      },
      final,
      inputUnchanged: inputUnchanged(state, context),
    }),
  };
}

function probeDeleteFailure(product, state, context) {
  const engine = requireStateEngine(state);
  const main = recordValue(step(state, 4, 'delete main').after, 'delete main product');
  const before = observeState(product, state, context);
  product.workflow({
    caseId: context.caseId,
    engine,
    action: { type: 'request-delete-plan', targets: ['item-a'] },
  });
  product.workflow({
    caseId: context.caseId,
    engine,
    action: {
      type: 'apply-host-cascade-confirmation',
      confirmed: false,
      cascadeTargets: ['links'],
      registryLoading: false,
    },
  });
  const unconfirmed = product.workflow({
    caseId: context.caseId,
    engine,
    action: {
      type: 'delete-transaction',
      targets: ['item-a', 'links'],
      actionId: 'delete-unconfirmed-branch',
    },
  });
  const afterFalse = observeState(product, state, context);
  product.workflow({
    caseId: context.caseId,
    engine,
    action: { type: 'request-delete-plan', targets: ['item-a'] },
  });
  const loading = product.workflow({
    caseId: context.caseId,
    engine,
    action: {
      type: 'apply-host-cascade-confirmation',
      confirmed: true,
      cascadeTargets: ['links'],
      registryLoading: true,
    },
  });
  const afterLoading = observeState(product, state, context);
  product.workflow({
    caseId: context.caseId,
    engine,
    action: { type: 'select-targets', targets: ['item-a'], mode: 'replace' },
  });
  const final = observeState(product, state, context);
  const beforeFingerprint = context.fingerprint(before.dataset);
  return {
    actual: deepFreeze({
      main,
      rollback: {
        confirmationFalseAppliesNothing:
          unconfirmed.status === 'rejected'
          && context.fingerprint(afterFalse.dataset) === beforeFingerprint,
        registryLoadingBlocksDelete:
          loading.status === 'rejected'
          && loading.code === 'CONFLICT'
          && context.fingerprint(afterLoading.dataset) === beforeFingerprint,
        transactionAtomic:
          context.fingerprint(final.dataset) === beforeFingerprint,
      },
      final,
      inputUnchanged: inputUnchanged(state, context),
    }),
  };
}

function probeMatrixFailure(product, state, context) {
  const engine = requireStateEngine(state);
  const main = recordValue(step(state, 2, 'matrix redo').after, 'matrix main product');
  const beforeFailure = observeState(product, state, context);
  const failed = product.runMutationMatrix({
    caseId: context.caseId,
    engine,
    mutationKinds: ['create'],
    oneActionEach: true,
    companion: clone(
      recordValue(context.hostSupplies, 'matrix host supplies').companionState,
    ),
  });
  const afterFailure = observeState(product, state, context);
  const branchUndo = product.history({
    caseId: context.caseId,
    engine,
    direction: 'undo',
  });
  publishIfChanged(product, context, engine, branchUndo.changed);
  const currentText = stringValue(
    datasetRecord(observeState(product, state, context).dataset, 'text-c').text,
    'matrix branch text',
  );
  const branchAction = product.workflow({
    caseId: context.caseId,
    engine,
    action: {
      type: 'commit-text-edit',
      target: 'text-c',
      text: `${currentText} branch`,
      actionId: 'editor-matrix-redo-branch',
    },
  });
  publishIfChanged(product, context, engine, branchAction.changed);
  const branchRedo = product.history({
    caseId: context.caseId,
    engine,
    direction: 'redo',
  });

  product.loadDataset({
    caseId: context.caseId,
    engine,
    datasetRef: 'interactive-scene-matrix-restored',
    dataset: state.input,
  });
  product.publish({ caseId: context.caseId, engine, timeMs: context.clock.now() });
  const restoredMatrix = product.runMutationMatrix({
    caseId: context.caseId,
    engine,
    mutationKinds: stringArray(
      recordValue(context.hostSupplies, 'matrix host supplies').mutationKinds,
      'matrix restored kinds',
    ),
    oneActionEach: true,
    companion: clone(
      recordValue(context.hostSupplies, 'matrix host supplies').companionState,
    ),
  });
  publishIfChanged(product, context, engine, restoredMatrix.changed);
  const final = observeState(product, state, context);
  return {
    actual: deepFreeze({
      main,
      rollback: {
        failedActionHistoryDelta:
          historyDepth(afterFailure) - historyDepth(beforeFailure),
        unavailableActionNoop:
          recordValue(state.unavailableUndo, 'unavailable undo').status
            === 'unavailable',
        redoBranchDiscardedAfterNewAction:
          branchUndo.status === 'committed'
          && branchAction.status === 'committed'
          && branchRedo.status === 'unavailable',
      },
      final,
      inputUnchanged: inputUnchanged(state, context),
      failed,
    }),
  };
}

async function ensureEngine(product, state, context) {
  if (state.engine !== null) return state.engine;
  const engine = await context.ensureMainEngine();
  const snapshot = callSync(engine, 'snapshot');
  if (snapshot.lifecycle === 'new') {
    await call(engine, 'initialize', {
      instanceId: `contract-${context.caseId.toLowerCase()}-editor-workflow`,
      width: 800,
      height: 600,
      pixelRatio: 1,
      strategy: 'mesh',
      preference: 'webgl',
      antialias: true,
      background: 0xf7f8fa,
    });
  } else {
    assert(snapshot.lifecycle === 'ready-empty', 'editor engine ready-empty');
  }

  const supplies = recordValue(context.hostSupplies, 'editor host supplies');
  const datasetRef = typeof supplies.datasetRef === 'string'
    ? supplies.datasetRef
    : 'consumer-editor-grid';
  const input = supplies.dataset === undefined
    ? await context.resolveDataset(datasetRef)
    : supplies.dataset;
  state.input = input;
  state.inputFingerprint = context.fingerprint(input);
  product.loadDataset({
    caseId: context.caseId,
    engine,
    datasetRef,
    dataset: input,
  });
  product.publish({ caseId: context.caseId, engine, timeMs: context.clock.now() });
  state.engine = engine;
  state.loaded = true;
  state.baseline = product.observe({ caseId: context.caseId, engine });
  return engine;
}

function publishIfChanged(product, context, engine, changed) {
  if (changed !== true) return;
  product.publish({
    caseId: context.caseId,
    engine,
    timeMs: context.clock.now(),
  });
}

function observeState(product, state, context) {
  return product.observe({
    caseId: context.caseId,
    engine: requireStateEngine(state),
  });
}

function inputUnchanged(state, context) {
  return state.inputFingerprint === context.fingerprint(state.input);
}

function textScreenBounds(product, id, source) {
  const geometry = recordValue(product.geometry, 'text geometry');
  const entities = arrayValue(geometry.entities, 'text geometry entities');
  const entity = entities
    .map((value, index) => recordValue(value, `text geometry entity ${index}`))
    .find((value) => value.id === id);
  assert(entity !== undefined, `text geometry entity ${id}`);
  const bounds = numberTuple(entity.screenBounds, 4, 'text screen bounds');
  const text = datasetRecord(product.dataset, id);
  const size = recordValue(text.size, 'text size');
  const lineCount = source.split(/\r\n|\r|\n/u).length;
  return {
    x: bounds[0],
    y: bounds[1],
    width: finiteNumber(size.width, 'text width'),
    height: finiteNumber(size.height, 'text height') * lineCount,
  };
}

function removeDatasetRecord(datasetValue, id) {
  const visit = (values) => arrayValue(values, 'dataset removal values')
    .filter((value) => !isRecord(value) || value.id !== id)
    .map((value) => {
      if (!isRecord(value) || !Array.isArray(value.children)) return clone(value);
      return {
        ...clone(value),
        children: visit(value.children),
      };
    });
  return deepFreeze(visit(datasetValue));
}

function datasetRecord(datasetValue, id) {
  const found = findDatasetRecord(datasetValue, id);
  assert(found !== null, `dataset record ${id}`);
  return found;
}

function findDatasetRecord(datasetValue, id) {
  for (const value of arrayValue(datasetValue, 'dataset records')) {
    if (!isRecord(value)) continue;
    if (value.id === id) return value;
    if (Array.isArray(value.children)) {
      const nested = findDatasetRecord(value.children, id);
      if (nested !== null) return nested;
    }
  }
  return null;
}

function historyDepth(product) {
  return nonNegativeInteger(
    recordValue(product.snapshot, 'product snapshot').historyDepth,
    'history depth',
  );
}

function step(state, index, label) {
  const value = state.steps.get(index);
  assert(isRecord(value), `${label} step ${index}`);
  return value;
}

function requireStateEngine(state) {
  assert(state.engine !== null && state.loaded === true, 'state engine exists');
  return state.engine;
}

function validateProduct(value) {
  const product = recordValue(value, 'editor workflow product');
  for (const method of [
    'loadDataset',
    'workflow',
    'runMutationMatrix',
    'history',
    'publish',
    'observe',
  ]) {
    assert(typeof product[method] === 'function', `product ${method}()`);
  }
  return product;
}

function validateContext(value) {
  const context = recordValue(value, 'editor workflow context');
  assert(EDITOR_WORKFLOW_CASE_IDS.includes(context.caseId), 'editor workflow case');
  for (const method of [
    'ensureMainEngine',
    'resolveDataset',
    'fingerprint',
  ]) {
    assert(typeof context[method] === 'function', `context ${method}()`);
  }
  const clock = recordValue(context.clock, 'editor workflow clock');
  assert(typeof clock.now === 'function', 'context clock.now()');
  recordValue(context.fixtureParams, 'editor fixture params');
  recordValue(context.hostSupplies, 'editor host supplies');
  return context;
}

function validateAction(context, value) {
  const action = recordValue(value, 'editor workflow action');
  const types = CASE_ACTIONS[context.caseId];
  assert(Array.isArray(types), 'editor case action sequence');
  assert(Number.isInteger(action.index), 'editor action index');
  assert(action.type === types[action.index], 'editor action sequence');
  const operands = recordValue(action.operands, 'editor action operands');
  let keys = ACTION_OPERAND_KEYS[action.type];
  if (action.type === 'commit-text-edit') {
    keys = Object.hasOwn(operands, 'preserveStyle')
      ? ['actionId', 'preserveStyle', 'target', 'text']
      : ['actionId', 'target', 'text'];
  }
  assert(Array.isArray(keys), `editor action keys ${String(action.type)}`);
  assertExactKeys(operands, keys, `${action.type} operands`);
  return action;
}

function validateFailureProbe(context, action) {
  const operands = action.operands;
  assert(operands.journeyId === context.caseId, 'failure journey identity');
  assert(operands.isolate === true, 'failure branch isolation');
  assert(
    operands.afterActionIndex === action.index - 1,
    'failure branch action index',
  );
  const injection = recordValue(operands.injection, 'failure injection');
  assert(typeof injection.id === 'string' && injection.id.length > 0, 'failure ID');
  assert(
    typeof injection.diagnostic === 'string' && injection.diagnostic.length > 0,
    'failure diagnostic',
  );
  recordValue(operands.expectedRollback, 'declared rollback shape');
}

async function call(target, method, ...args) {
  const fn = target?.[method];
  assert(typeof fn === 'function', `engine ${method}()`);
  return fn.apply(target, args);
}

function callSync(target, method, ...args) {
  const fn = target?.[method];
  assert(typeof fn === 'function', `engine ${method}()`);
  return fn.apply(target, args);
}

function recordValue(value, label) {
  assert(isRecord(value), label);
  return value;
}

function arrayValue(value, label) {
  assert(Array.isArray(value), label);
  return value;
}

function stringArray(value, label) {
  const values = arrayValue(value, label);
  assert(
    values.every((entry) => typeof entry === 'string' && entry.length > 0),
    label,
  );
  return values;
}

function numberTuple(value, length, label) {
  const values = arrayValue(value, label);
  assert(
    values.length === length
      && values.every((entry) => typeof entry === 'number' && Number.isFinite(entry)),
    label,
  );
  return values;
}

function stringValue(value, label) {
  assert(typeof value === 'string', label);
  return value;
}

function booleanValue(value, label) {
  assert(typeof value === 'boolean', label);
  return value;
}

function finiteNumber(value, label) {
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
  if (!condition) throw new Error(`Invalid Core v2 editor workflow handler: ${message}`);
}
