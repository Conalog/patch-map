import { clone } from '../value-atoms.mjs';

export const HISTORY_HANDLER_REVISION = 'patch-map-history-handlers/1';

export const HISTORY_CASE_IDS = Object.freeze([
  'HIS-001',
  'HIS-002',
  'HIS-003',
  'HIS-004',
  'HIS-005',
  'HIS-006',
]);

export const HISTORY_ACTION_TYPES = Object.freeze([
  'history-recorded-transaction',
  'undo',
  'redo',
  'history-domain-matrix',
  'history-capacity-matrix',
  'history-recorded-transactions',
  'keyboard-history-matrix',
  'host-history-control',
  'publish-frame',
  'clear-history',
  'replace-scene',
  'destroy',
  'compound-editor-transaction',
  'compound-editor-domain-matrix',
]);

const CASE_ACTIONS = Object.freeze({
  'HIS-001': Object.freeze([
    'history-recorded-transaction',
    'undo',
    'redo',
    'history-domain-matrix',
  ]),
  'HIS-002': Object.freeze(['history-capacity-matrix']),
  'HIS-003': Object.freeze([
    'history-recorded-transactions',
    'undo',
    'undo',
    'redo',
  ]),
  'HIS-004': Object.freeze([
    'keyboard-history-matrix',
    'host-history-control',
  ]),
  'HIS-005': Object.freeze([
    'history-recorded-transaction',
    'undo',
    'publish-frame',
    'redo',
    'publish-frame',
    'clear-history',
    'replace-scene',
    'destroy',
  ]),
  'HIS-006': Object.freeze([
    'compound-editor-transaction',
    'undo',
    'redo',
    'compound-editor-domain-matrix',
  ]),
});

export function createHistoryHandlerEntries(productValue) {
  const product = validateProductAdapter(productValue);
  const states = new WeakMap();
  const handlers = Object.freeze({
    'history-recorded-transaction': withState(product, states, recordedTransactionAction),
    undo: withState(product, states, undoAction),
    redo: withState(product, states, redoAction),
    'history-domain-matrix': withState(product, states, historyDomainMatrixAction),
    'history-capacity-matrix': withState(product, states, historyCapacityMatrixAction),
    'history-recorded-transactions': withState(
      product,
      states,
      historyRecordedTransactionsAction,
    ),
    'keyboard-history-matrix': withState(product, states, keyboardHistoryMatrixAction),
    'host-history-control': withState(product, states, hostHistoryControlAction),
    'publish-frame': withState(product, states, publishFrameAction),
    'clear-history': withState(product, states, clearHistoryAction),
    'replace-scene': withState(product, states, replaceSceneAction),
    destroy: withState(product, states, destroyAction),
    'compound-editor-transaction': withState(
      product,
      states,
      compoundEditorTransactionAction,
    ),
    'compound-editor-domain-matrix': withState(
      product,
      states,
      compoundEditorDomainMatrixAction,
    ),
  });
  return Object.freeze(HISTORY_ACTION_TYPES.map((type) => Object.freeze([
    `contract/${type}`,
    handlers[type],
  ])));
}

function withState(product, states, handler) {
  return async (contextValue, actionValue) => {
    const context = validateContext(contextValue);
    const action = validateAction(context, actionValue);
    let state = states.get(context.ensureSessionEngine);
    if (state === undefined) {
      state = {
        caseId: context.caseId,
        engine: null,
        loadedDatasetRef: null,
        eventTokens: [],
        eventOrders: {},
        activeDirection: null,
        transitionStart: 0,
        destroyedCount: 0,
        eventUnsubscribers: [],
        historyEventsAttached: false,
      };
      states.set(context.ensureSessionEngine, state);
    }
    assert(state.caseId === context.caseId, 'history state case identity');
    return handler(product, state, context, action);
  };
}

async function recordedTransactionAction(product, state, context, action) {
  const engine = await ensureBaseline(state, context);
  const operands = recordValue(action.operands, 'history-recorded-transaction.operands');
  const actionId = stringValue(operands.actionId, 'history action ID');
  let operations;
  if (Object.hasOwn(operands, 'operations')) {
    assertExactKeys(operands, ['actionId', 'operations'], 'history-recorded-transaction.operands');
    operations = cloneArray(operands.operations, 'history operations');
  } else {
    assertExactKeys(
      operands,
      ['actionId', 'target', 'path', 'value'],
      'history-recorded-transaction.operands',
    );
    operations = [{
      op: 'merge',
      target: { kind: 'element', id: stringValue(operands.target, 'history target') },
      changes: [{
        path: cloneArray(operands.path, 'history path'),
        value: clone(operands.value),
      }],
    }];
  }
  const targetId = historyTargetId(operations);
  const before = datasetById(callSync(engine, 'exportDataset'));
  const unrelatedIdentity = firstUnrelatedIdentity(before, targetId);
  const transaction = callSync(engine, 'transact', {
    strict: true,
    actionId,
    operations,
  });
  assert(transaction.status === 'committed', 'recorded transaction commits');
  const actual = {
    actionId,
    before,
    afterCommit: datasetById(callSync(engine, 'exportDataset')),
    unrelatedIdentity,
    transaction: clone(transaction),
    history: projectHistory(engine),
    companion: clone(callSync(engine, 'historyCompanionState')),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function undoAction(product, state, context, action) {
  return historyDirectionAction(product, state, context, action, 'undo');
}

async function redoAction(product, state, context, action) {
  return historyDirectionAction(product, state, context, action, 'redo');
}

async function historyDirectionAction(product, state, context, action, direction) {
  const operands = exactOperands(action, ['steps']);
  const steps = positiveInteger(operands.steps, `${direction}.steps`);
  const engine = await ensureBaseline(state, context);
  if (context.caseId === 'HIS-005') {
    state.activeDirection = direction;
    state.transitionStart = state.eventTokens.length;
  }
  const eventStart = state.eventTokens.length;
  const results = [];
  for (let index = 0; index < steps; index += 1) {
    results.push(clone(callSync(engine, direction)));
  }
  const dataset = datasetById(callSync(engine, 'exportDataset'));
  const companion = clone(callSync(engine, 'historyCompanionState'));
  const actual = {
    direction,
    steps,
    results,
    dataset,
    companion,
    interaction: {
      selectedIds: clone(companion.selectionIds),
      mode: companion.mode,
    },
    unrelatedIdentity: firstUnrelatedIdentity(
      dataset,
      stringValue(context.fixtureParams.target ?? 'rect-b', 'history target'),
    ),
    eventCount: state.eventTokens.length - eventStart,
    history: projectHistory(engine),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function historyDomainMatrixAction(product, state, context, action) {
  assert(context.caseId === 'HIS-001', 'history domain matrix case');
  const operands = exactOperands(action, ['domains', 'undoRedoEach']);
  assert(operands.undoRedoEach === true, 'history domain matrix undoRedoEach');
  const domains = stringArray(operands.domains, 'history domains');
  const engine = await ensureBaseline(state, context);
  const result = await exerciseDomainMatrix(
    engine,
    state,
    context,
    domains,
    false,
  );
  const actual = {
    ...result,
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function historyCapacityMatrixAction(product, state, context, action) {
  assert(context.caseId === 'HIS-002', 'history capacity matrix case');
  const operands = exactOperands(
    action,
    ['recordActionIds', 'sequence', 'capacityChanges'],
  );
  const actionIds = stringArray(operands.recordActionIds, 'history record IDs');
  const sequence = stringArray(operands.sequence, 'history sequence');
  const capacityChanges = numberArray(operands.capacityChanges, 'capacity changes');
  assert(capacityChanges.length === 4, 'capacity change count');
  const engine = await ensureBaseline(state, context);

  recordActionIds(engine, actionIds);
  const after52Inspection = callSync(engine, 'historyInspection');
  const after52Retained = after52Inspection.commands.map(({ id }) => id);
  const after52 = {
    depth: after52Inspection.state.depth,
    retainedActionIds: clone(after52Retained),
    evictedActionIds: actionIds.filter((id) => !after52Retained.includes(id)),
  };

  const decrease = callSync(engine, 'setHistoryCapacity', capacityChanges[0]);
  assert(decrease.status === 'committed', 'capacity decrease commits');
  const increase = callSync(engine, 'setHistoryCapacity', capacityChanges[1]);
  assert(increase.status === 'committed', 'capacity increase commits');
  const disable = callSync(engine, 'setHistoryCapacity', capacityChanges[2]);
  assert(disable.status === 'committed', 'capacity disable commits');
  const beforeInvalid = projectHistory(engine);
  const invalid = callSync(engine, 'setHistoryCapacity', capacityChanges[3]);
  const afterInvalid = projectHistory(engine);

  await reloadBaseline(engine, state, context);
  callSync(engine, 'setHistoryCapacity', 50);
  recordActionIds(engine, actionIds);
  let afterBranch = null;
  let unavailableEventCount = 0;
  for (const operation of sequence) {
    if (operation === 'undo' || operation === 'redo') {
      callSync(engine, operation);
      continue;
    }
    if (operation === 'record:new-branch') {
      const transaction = historyValueTransaction(engine, 'new-branch', 10_000);
      assert(transaction.status === 'committed', 'new history branch commits');
      afterBranch = {
        redoAvailable: callSync(engine, 'historyState').canRedo,
        actionIds: callSync(engine, 'historyInspection').commands.map(({ id }) => id),
      };
      continue;
    }
    if (operation === 'undo-until-empty') {
      while (callSync(engine, 'historyState').canUndo) callSync(engine, 'undo');
      const events = [];
      const release = callSync(engine, 'on', 'historyUndone', (event) => events.push(event));
      callSync(engine, 'undo');
      release();
      unavailableEventCount += events.length;
      continue;
    }
    assert(operation === 'redo-until-empty', 'history sequence operation');
    while (callSync(engine, 'historyState').canRedo) callSync(engine, 'redo');
    const events = [];
    const release = callSync(engine, 'on', 'historyRedone', (event) => events.push(event));
    callSync(engine, 'redo');
    release();
    unavailableEventCount += events.length;
  }
  assert(afterBranch !== null, 'history branch observation');

  const actual = {
    after52,
    afterBranch,
    unavailable: { eventCount: unavailableEventCount },
    capacityZero: { depth: disable.change.state.depth },
    beforeInvalidCapacity: { stack: beforeInvalid },
    invalidCapacity: { stack: afterInvalid },
    capacityTransitions: {
      decreaseTo2: {
        retained: clone(decrease.change.retainedActionIds),
        evictedCount:
          after52.evictedActionIds.length + decrease.change.evictedActionIds.length,
      },
      increaseTo51: {
        retained: clone(increase.change.retainedActionIds),
        evictedCount: increase.change.evictedActionIds.length,
      },
      disableAt0: {
        retained: clone(disable.change.retainedActionIds),
        depth: disable.change.state.depth,
      },
      invalidMinus1: {
        code: invalid.code,
        changed: invalid.changed,
      },
    },
    invalidOutcome: { code: invalid.code },
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function historyRecordedTransactionsAction(product, state, context, action) {
  assert(context.caseId === 'HIS-003', 'history grouped transaction case');
  const operands = exactOperands(action, ['transactions']);
  const transactions = arrayValue(operands.transactions, 'history transactions');
  const engine = await ensureBaseline(state, context);
  for (const [index, value] of transactions.entries()) {
    const transaction = recordValue(value, `history transaction ${index}`);
    const allowed = transaction.actionId === null
      ? ['actionId', 'value', 'recordHistory']
      : ['actionId', 'value'];
    assertExactKeys(transaction, allowed, `history transaction ${index}`);
    const actionId = transaction.actionId === null
      ? null
      : stringValue(transaction.actionId, `history transaction ${index} actionId`);
    const result = callSync(engine, 'transact', {
      strict: true,
      ...(actionId === null ? {} : { actionId }),
      ...(transaction.recordHistory === false ? { recordHistory: false } : {}),
      operations: [{
        op: 'merge',
        target: { kind: 'element', id: 'rect-b' },
        changes: [{
          path: ['attrs', 'x'],
          value: finiteNumber(transaction.value, `history transaction ${index} value`),
        }],
      }],
    });
    assert(result.status === 'committed', `history transaction ${index} commits`);
  }
  const inspection = callSync(engine, 'historyInspection');
  const firstGroup = inspection.commands[0];
  assert(firstGroup !== undefined, 'history first group');
  const redoOperationOrder = firstGroup.records.map(({ after }) =>
    elementAttr(after.dataset, 'rect-b', 'x'));
  const actual = {
    actionIds: inspection.commands.map(({ id }) => id),
    depth: inspection.state.depth,
    firstGroup: {
      undoOperationOrder: [...redoOperationOrder].reverse(),
      redoOperationOrder,
    },
    dataset: datasetById(callSync(engine, 'exportDataset')),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function keyboardHistoryMatrixAction(product, state, context, action) {
  assert(context.caseId === 'HIS-004', 'keyboard history matrix case');
  const operands = exactOperands(action, ['shortcuts', 'paths']);
  const shortcuts = arrayValue(operands.shortcuts, 'history shortcuts');
  const paths = stringArray(operands.paths, 'history paths');
  const engine = await ensureBaseline(state, context);
  const canvasActionCountByShortcut = [];
  const canvasPreventDefaultByShortcut = [];
  const protectedPathActionCount = [];
  const protectedPathPreventDefault = [];
  for (const [shortcutIndex, value] of shortcuts.entries()) {
    const shortcut = historyShortcut(value, `history shortcut ${shortcutIndex}`);
    for (const path of paths) {
      await prepareShortcut(engine, state, context, shortcut.action, shortcutIndex);
      const result = callSync(engine, 'handleHistoryShortcut', {
        key: shortcut.key,
        code: shortcut.code,
        ctrlKey: shortcut.ctrlKey,
        metaKey: shortcut.metaKey,
        shiftKey: shortcut.shiftKey,
        pathKind: path,
      });
      const actionCount = result.result?.status === 'committed' ? 1 : 0;
      if (path === 'canvas') {
        canvasActionCountByShortcut.push(actionCount);
        canvasPreventDefaultByShortcut.push(result.preventDefault);
      } else {
        protectedPathActionCount.push(actionCount);
        protectedPathPreventDefault.push(result.preventDefault);
      }
    }
  }
  const actual = {
    canvasActionCountByShortcut,
    canvasPreventDefaultByShortcut,
    protectedPathActionCount,
    protectedPathPreventDefault,
    shortcutAvailability: historyControlAvailability(engine),
    staleGestureCount: activeGestureCount(engine),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function hostHistoryControlAction(product, state, context, action) {
  assert(context.caseId === 'HIS-004', 'host history control case');
  const operands = exactOperands(action, ['actions']);
  const actions = stringArray(operands.actions, 'host history actions');
  const engine = await ensureBaseline(state, context);
  const results = [];
  for (const [index, direction] of actions.entries()) {
    assert(direction === 'undo' || direction === 'redo', 'host history direction');
    await prepareShortcut(engine, state, context, direction, index + 100);
    results.push(clone(callSync(engine, direction)));
  }
  const actual = {
    actions,
    actionCount: results.filter(({ status }) => status === 'committed').length,
    hostButtonAvailability: historyControlAvailability(engine),
    results,
    staleGestureCount: activeGestureCount(engine),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function publishFrameAction(product, state, context, action) {
  assert(context.caseId === 'HIS-005', 'history publish frame case');
  const operands = exactOperands(action, ['clockMs']);
  const clockMs = finiteNumber(operands.clockMs, 'publish frame clock');
  const engine = await ensureBaseline(state, context);
  callSync(engine, 'publishFrame', clockMs);
  const direction = state.activeDirection;
  assert(direction === 'undo' || direction === 'redo', 'history frame direction');
  const order = state.eventTokens.slice(state.transitionStart);
  state.eventOrders[direction] = clone(order);
  state.activeDirection = null;
  const actual = {
    clockMs,
    direction,
    order,
    snapshot: clone(callSync(engine, 'snapshot')),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function clearHistoryAction(product, state, context, action) {
  assert(context.caseId === 'HIS-005', 'clear history case');
  exactOperands(action, []);
  const engine = await ensureBaseline(state, context);
  const start = state.eventTokens.length;
  const result = callSync(engine, 'clearHistory');
  const actual = {
    result: clone(result),
    order: clone(state.eventTokens.slice(start)),
    history: projectHistory(engine),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function replaceSceneAction(product, state, context, action) {
  assert(context.caseId === 'HIS-005', 'history replace scene case');
  const operands = exactOperands(action, ['datasetRef']);
  const datasetRef = stringValue(operands.datasetRef, 'replacement dataset ref');
  const engine = await ensureBaseline(state, context);
  const dataset = await context.resolveDataset(datasetRef);
  callSync(engine, 'loadDataset', dataset, { datasetRef });
  state.loadedDatasetRef = datasetRef;
  const actual = {
    datasetRef,
    history: projectHistory(engine),
    snapshot: clone(callSync(engine, 'snapshot')),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function destroyAction(product, state, context, action) {
  assert(context.caseId === 'HIS-005', 'history destroy case');
  exactOperands(action, []);
  const engine = await ensureBaseline(state, context);
  const start = state.eventTokens.length;
  const destroyed = await call(engine, 'destroy');
  for (const release of state.eventUnsubscribers.splice(0)) release();
  const actual = {
    destroyed,
    order: clone(state.eventTokens.slice(start)),
    destroyedCount: state.destroyedCount,
    snapshot: clone(callSync(engine, 'snapshot')),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function compoundEditorTransactionAction(product, state, context, action) {
  assert(context.caseId === 'HIS-006', 'compound editor transaction case');
  const operands = exactOperands(
    action,
    ['actionId', 'engineOperations', 'hostCompanion'],
  );
  const engine = await ensureBaseline(state, context);
  const hostCompanion = recordValue(operands.hostCompanion, 'compound host companion');
  assertExactKeys(hostCompanion, ['before', 'after'], 'compound host companion');
  const beforeCompanion = cloneRecord(hostCompanion.before, 'compound host before');
  const afterCompanion = cloneRecord(hostCompanion.after, 'compound host after');
  callSync(engine, 'setHistoryCompanion', beforeCompanion);
  const before = datasetById(callSync(engine, 'exportDataset'));
  const transaction = callSync(engine, 'transact', {
    strict: true,
    actionId: stringValue(operands.actionId, 'compound action ID'),
    operations: cloneArray(operands.engineOperations, 'compound engine operations'),
    history: afterCompanion,
  });
  assert(transaction.status === 'committed', 'compound transaction commits');
  const actual = {
    before,
    afterCommit: datasetById(callSync(engine, 'exportDataset')),
    transaction: clone(transaction),
    history: projectHistory(engine),
    companion: clone(callSync(engine, 'historyCompanionState')),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function compoundEditorDomainMatrixAction(product, state, context, action) {
  assert(context.caseId === 'HIS-006', 'compound editor domain matrix case');
  const operands = exactOperands(
    action,
    ['domains', 'hostCompanion', 'undoRedoEach'],
  );
  assert(operands.undoRedoEach === true, 'compound domain matrix undoRedoEach');
  stringArray(operands.hostCompanion, 'compound companion domains');
  const domains = stringArray(operands.domains, 'compound history domains');
  const engine = await ensureBaseline(state, context);
  const result = await exerciseDomainMatrix(
    engine,
    state,
    context,
    domains,
    true,
  );
  const actual = {
    ...result,
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function exerciseDomainMatrix(
  engine,
  state,
  context,
  domains,
  compound,
) {
  let restoredCount = 0;
  let semanticDiffCount = 0;
  let hostCompanionDiffCount = 0;
  const rows = [];
  for (const [index, domain] of domains.entries()) {
    const clockBase = 1_000 + index * 4;
    await reloadDomainMatrixBaseline(engine, state, context, clockBase);
    const baseHost = {
      selectedIds: ['rect-b'],
      mode: 'select',
      ...(compound ? { dirty: false, domain } : {}),
    };
    callSync(engine, 'setHistoryCompanion', baseHost);
    const before = clone(callSync(engine, 'exportDataset'));
    const operation = matrixOperation(domain, index, before);
    const afterHost = compound
      ? {
          selectedIds: ['rect-b'],
          mode: 'transform',
          dirty: true,
          domain,
        }
      : undefined;
    const transaction = callSync(engine, 'transact', {
      strict: true,
      actionId: `${compound ? 'compound' : 'history'}-matrix:${domain}`,
      operations: [operation],
      ...(afterHost === undefined ? {} : { history: afterHost }),
    });
    const committed = transaction.status === 'committed';
    if (committed) callSync(engine, 'publishFrame', clockBase + 1);
    const after = committed ? clone(callSync(engine, 'exportDataset')) : null;
    const undo = committed ? callSync(engine, 'undo') : null;
    if (undo?.status === 'committed') {
      callSync(engine, 'publishFrame', clockBase + 2);
    }
    const undoDataset = clone(callSync(engine, 'exportDataset'));
    const undoCompanion = clone(callSync(engine, 'historyCompanionState'));
    const redo = committed ? callSync(engine, 'redo') : null;
    if (redo?.status === 'committed') {
      callSync(engine, 'publishFrame', clockBase + 3);
    }
    const redoDataset = clone(callSync(engine, 'exportDataset'));
    const redoCompanion = clone(callSync(engine, 'historyCompanionState'));
    const semanticRestored = committed &&
      undo?.status === 'committed' &&
      redo?.status === 'committed' &&
      sameJson(undoDataset, before) &&
      sameJson(redoDataset, after);
    const hostRestored = !compound || (
      sameJson(undoCompanion.hostCompanion, baseHost) &&
      sameJson(redoCompanion.hostCompanion, afterHost) &&
      undoCompanion.mode === baseHost.mode &&
      redoCompanion.mode === afterHost.mode
    );
    if (semanticRestored && hostRestored) restoredCount += 1;
    if (!semanticRestored) semanticDiffCount += 1;
    if (!hostRestored) hostCompanionDiffCount += 1;
    rows.push({
      domain,
      operation: clone(operation),
      committed,
      semanticRestored,
      hostRestored,
    });
  }
  return {
    restoredCount,
    semanticDiffCount,
    hostCompanionDiffCount,
    rows,
  };
}

function matrixOperation(domain, index, dataset) {
  switch (domain) {
    case 'geometry':
      return merge('rect-b', ['attrs', 'x'], 170 + index);
    case 'text':
      return merge('text-c', ['text'], `Bravo history ${index}`);
    case 'color':
      return merge('rect-b', ['fill'], index % 2 === 0 ? '#ff8801' : '#ff8802');
    case 'asset':
      return componentMerge('item-a', 'icon', ['source'], 'active');
    case 'style':
      return merge('text-c', ['style', 'fontSize'], 17 + index);
    case 'placement':
      return componentMerge('item-a', 'label', ['placement'], 'right-bottom');
    case 'relation':
      return merge('links', ['style', 'width'], 3 + index);
    case 'components':
      return componentMerge('item-a', 'bar', ['size', 'height'], 11 + index);
    case 'hierarchy':
      return {
        op: 'move',
        target: { kind: 'element', id: 'rect-b' },
        parent: { kind: 'element', id: 'group-b' },
        index: 0,
      };
    case 'grid':
      return merge('grid-a', ['cells', 0, 0], `History ${index}`);
    case 'metadata':
      return merge('rect-b', ['attrs', 'metadata'], {
        historyRevision: index + 1,
      });
    case 'create':
      return addElement(
        { kind: 'element', id: 'group-b' },
        0,
        {
          type: 'rect',
          id: `history-created-${index}`,
          size: { width: 24, height: 18 },
          fill: '#336699',
          attrs: { x: 8, y: 10 },
        },
      );
    case 'group':
      return {
        op: 'group',
        targets: [
          { kind: 'element', id: 'item-a' },
          { kind: 'element', id: 'rect-b' },
        ],
        value: { type: 'group', id: `history-group-${index}` },
      };
    case 'ungroup':
      return {
        op: 'ungroup',
        target: { kind: 'element', id: 'group-a' },
        relationPolicy: 'reject',
      };
    case 'reorder':
      return {
        op: 'move',
        target: { kind: 'element', id: 'image-a' },
        parent: null,
        index: 0,
      };
    case 'duplicate': {
      const source = findDatasetElement(dataset, 'zone-a');
      assert(source !== null, 'history duplicate source');
      return addElement(
        null,
        1,
        { ...source, id: `zone-a-copy-${index}` },
      );
    }
    case 'delete':
      return {
        op: 'remove',
        target: { kind: 'element', id: 'zone-a' },
        cascade: 'subtree',
      };
    default:
      throw new Error(`PatchMap history handler invalid: unsupported domain ${domain}`);
  }
}

function addElement(parent, index, value) {
  return {
    op: 'add',
    parent,
    collection: 'children',
    index,
    value,
  };
}

function merge(id, path, value) {
  return {
    op: 'merge',
    target: { kind: 'element', id },
    changes: [{ path, value }],
  };
}

function componentMerge(ownerId, id, path, value) {
  return {
    op: 'merge',
    target: { kind: 'component', ownerId, id },
    changes: [{ path, value }],
  };
}

async function ensureBaseline(state, context) {
  const engine = await ensureInitializedEngine(state, context);
  if (state.loadedDatasetRef === null) {
    await reloadBaseline(engine, state, context);
  }
  if (context.caseId === 'HIS-005' && !state.historyEventsAttached) {
    attachHistoryEvents(state, engine);
  }
  return engine;
}

async function ensureInitializedEngine(state, context) {
  const engine = state.engine ?? await context.ensureSessionEngine(1);
  state.engine = engine;
  const snapshot = callSync(engine, 'snapshot');
  if (snapshot.lifecycle === 'new') {
    await call(engine, 'initialize', {
      instanceId: `contract-${context.caseId.toLowerCase()}-1`,
      width: 800,
      height: 600,
      pixelRatio: 1,
      strategy: 'mesh',
      preference: 'webgl',
      powerPreference: 'high-performance',
      antialias: true,
      background: 0xf7f8fa,
      zoomLimits: [0.25, 4],
    });
  }
  return engine;
}

async function reloadBaseline(engine, state, context) {
  const profile = historyProfile(context);
  const datasetRef = stringValue(profile.datasetRef, 'history profile datasetRef');
  const dataset = await context.resolveDataset(datasetRef);
  callSync(engine, 'loadDataset', dataset, { datasetRef });
  callSync(engine, 'publishFrame', context.actionIndex + 1);
  if (isRecord(profile.hostCompanion)) {
    callSync(engine, 'setHistoryCompanion', clone(profile.hostCompanion));
  }
  state.loadedDatasetRef = datasetRef;
}

async function reloadDomainMatrixBaseline(engine, state, context, clockMs) {
  const datasetRef = 'all-kinds-scene';
  const dataset = await context.resolveDataset(datasetRef);
  callSync(engine, 'loadDataset', dataset, { datasetRef });
  callSync(engine, 'publishFrame', clockMs);
  state.loadedDatasetRef = datasetRef;
}

function historyProfile(context) {
  const profiles = recordValue(context.fixtureProfiles, 'fixture profiles');
  return recordValue(
    profiles['history-and-companion-state'],
    'history-and-companion-state profile',
  );
}

function attachHistoryEvents(state, engine) {
  const subscribe = (event, listener) => {
    state.eventUnsubscribers.push(callSync(engine, 'on', event, listener));
  };
  subscribe('semanticRestored', () => state.eventTokens.push('semantic-restore'));
  subscribe('selectionReconciled', () => state.eventTokens.push('selection-reconcile'));
  subscribe('historyUndone', ({ publication }) =>
    state.eventTokens.push(`history-undone:${publication}`));
  subscribe('historyRedone', ({ publication }) =>
    state.eventTokens.push(`history-redone:${publication}`));
  subscribe('frame', () => state.eventTokens.push('frame:published'));
  subscribe('historyVisible', ({ publication }) =>
    state.eventTokens.push(`history-visible:${publication}`));
  subscribe('historyCleared', ({ reason, history }) => {
    if (reason === 'host' && history.depth === 0) state.eventTokens.push('stack-clear');
    state.eventTokens.push('history-cleared');
  });
  subscribe('destroyed', () => {
    state.destroyedCount += 1;
    state.eventTokens.push('destroyed');
  });
  state.historyEventsAttached = true;
}

function recordActionIds(engine, actionIds) {
  actionIds.forEach((actionId, index) => {
    const result = historyValueTransaction(engine, actionId, 161 + index);
    assert(result.status === 'committed', `history action ${actionId} commits`);
  });
}

function historyValueTransaction(engine, actionId, value) {
  return callSync(engine, 'transact', {
    strict: true,
    actionId,
    operations: [{
      op: 'merge',
      target: { kind: 'element', id: 'rect-b' },
      changes: [{ path: ['attrs', 'x'], value }],
    }],
  });
}

async function prepareShortcut(engine, state, context, direction, index) {
  await reloadBaseline(engine, state, context);
  const transaction = historyValueTransaction(engine, `shortcut-${index}`, 300 + index);
  assert(transaction.status === 'committed', 'shortcut seed transaction');
  if (direction === 'redo') {
    const undo = callSync(engine, 'undo');
    assert(undo.status === 'committed', 'shortcut redo seed undo');
  }
}

function historyShortcut(value, label) {
  const shortcut = recordValue(value, label);
  assertExactKeys(
    shortcut,
    ['key', 'code', 'ctrlKey', 'metaKey', 'shiftKey', 'action'],
    label,
  );
  const action = stringValue(shortcut.action, `${label}.action`);
  assert(action === 'undo' || action === 'redo', `${label} action`);
  return {
    key: stringValue(shortcut.key, `${label}.key`),
    code: stringValue(shortcut.code, `${label}.code`),
    ctrlKey: booleanValue(shortcut.ctrlKey, `${label}.ctrlKey`),
    metaKey: booleanValue(shortcut.metaKey, `${label}.metaKey`),
    shiftKey: booleanValue(shortcut.shiftKey, `${label}.shiftKey`),
    action,
  };
}

function historyControlAvailability(engine) {
  return {
    undo: typeof engine.undo === 'function',
    redo: typeof engine.redo === 'function',
    clear: typeof engine.clearHistory === 'function',
  };
}

function activeGestureCount(engine) {
  const probe = callSync(engine, 'transformerGestureProbe');
  return probe.active ? 1 : 0;
}

function projectHistory(engine) {
  const inspection = callSync(engine, 'historyInspection');
  return {
    state: clone(inspection.state),
    actionIds: inspection.commands.map(({ id }) => id),
    recordCounts: inspection.commands.map(({ recordCount }) => recordCount),
  };
}

function datasetById(datasetValue) {
  const dataset = arrayValue(datasetValue, 'product dataset');
  return Object.fromEntries(dataset.map((entry, index) => {
    const record = cloneRecord(entry, `product dataset ${index}`);
    return [stringValue(record.id, `product dataset ${index} ID`), record];
  }));
}

function firstUnrelatedIdentity(dataset, targetId) {
  const id = Object.keys(dataset).find((candidate) => candidate !== targetId);
  assert(id !== undefined, 'unrelated logical identity');
  return `element:${id}`;
}

function historyTargetId(operations) {
  const first = recordValue(operations[0], 'history first operation');
  const target = recordValue(first.target, 'history operation target');
  return target.kind === 'component'
    ? stringValue(target.ownerId, 'history component owner')
    : stringValue(target.id, 'history element target');
}

function elementAttr(dataset, id, key) {
  const element = arrayValue(dataset, 'history record dataset').find((entry) =>
    isRecord(entry) && entry.id === id);
  assert(element !== undefined, `history record element ${id}`);
  const attrs = recordValue(element.attrs, `history record ${id} attrs`);
  return finiteNumber(attrs[key], `history record ${id} attrs.${key}`);
}

function findDatasetElement(dataset, id) {
  for (const value of arrayValue(dataset, 'history matrix dataset')) {
    const element = recordValue(value, 'history matrix element');
    if (element.id === id) return clone(element);
    if (Array.isArray(element.children)) {
      const nested = findDatasetElement(element.children, id);
      if (nested !== null) return nested;
    }
  }
  return null;
}

function observeProduct(product, context, engine) {
  return clone(product.resourceProbe({ caseId: context.caseId, engine }));
}

function validateProductAdapter(value) {
  const product = recordValue(value, 'history product adapter');
  assert(typeof product.resourceProbe === 'function', 'history product resourceProbe()');
  return product;
}

function validateContext(value) {
  const context = recordValue(value, 'context');
  assert(HISTORY_CASE_IDS.includes(context.caseId), 'context case identity');
  assert(Number.isInteger(context.actionIndex) && context.actionIndex >= 0, 'context action index');
  for (const method of [
    'ensureSessionEngine',
    'fingerprint',
    'releaseEngine',
    'resolveDataset',
  ]) {
    assert(typeof context[method] === 'function', `context ${method}()`);
  }
  assert(isRecord(context.fixtureParams), 'context fixtureParams');
  assert(isRecord(context.fixtureProfiles), 'context fixtureProfiles');
  assert(context.signal !== null && typeof context.signal === 'object', 'context signal');
  return context;
}

function validateAction(context, value) {
  const action = recordValue(value, 'action');
  assertExactKeys(action, ['index', 'operands', 'type'], 'action');
  assert(action.index === context.actionIndex, 'action index');
  const expected = CASE_ACTIONS[context.caseId]?.[context.actionIndex];
  assert(action.type === expected, `${context.caseId} action type`);
  assert(!context.signal.aborted, 'action is aborted');
  return action;
}

function exactOperands(action, keys) {
  const operands = recordValue(action.operands, `${action.type}.operands`);
  assertExactKeys(operands, keys, `${action.type}.operands`);
  return operands;
}

function assertExactKeys(record, keys, label) {
  assert(
    sameJson(Object.keys(record).sort(), [...keys].sort()),
    `${label} exact keys`,
  );
}

function cloneRecord(value, label) {
  return clone(recordValue(value, label));
}

function cloneArray(value, label) {
  return clone(arrayValue(value, label));
}

function recordValue(value, label) {
  assert(isRecord(value), `${label} must be a record`);
  return value;
}

function arrayValue(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  return value;
}

function stringArray(value, label) {
  return arrayValue(value, label).map((entry, index) =>
    stringValue(entry, `${label}[${index}]`));
}

function numberArray(value, label) {
  return arrayValue(value, label).map((entry, index) =>
    finiteNumber(entry, `${label}[${index}]`));
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} must be a string`);
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

function booleanValue(value, label) {
  assert(typeof value === 'boolean', `${label} must be a boolean`);
  return value;
}

function call(target, method, ...args) {
  const operation = target?.[method];
  assert(typeof operation === 'function', `product ${method}()`);
  return operation.apply(target, args);
}

function callSync(target, method, ...args) {
  const result = call(target, method, ...args);
  assert(!(result instanceof Promise), `product ${method}() must be synchronous`);
  return result;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assert(condition, message) {
  if (!condition) throw new Error(`PatchMap history handler invalid: ${message}`);
}
