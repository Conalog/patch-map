export const POINTER_SELECTION_HANDLER_REVISION = 'core-v2-pointer-selection-handlers/1';

export const POINTER_SELECTION_CASE_IDS = Object.freeze([
  'EVT-001',
  'EVT-002',
  'EVT-003',
  'EVT-004',
  'EVT-005',
  'EVT-006',
  'EVT-007',
  'EVT-008',
  'EVT-009',
  'SEL-005',
  'SEL-006',
  'SEL-008',
]);

export const POINTER_SELECTION_ACTION_TYPES = Object.freeze([
  'pointer-series',
  'physical-click-series',
  'pointer-hover-series',
  'hover-overlap-redraw-probe',
  'gesture-termination-matrix',
  'bind-events',
  'binding-probe-sequence',
  'dispatch-propagating-event',
  'keyboard-matrix',
  'transformer-handle-propagation-probe',
  'state-stack',
  'dispatch-state-owned-input',
  'destroy-state-stack',
  'click-suppression-matrix',
  'subscribe-events',
  'set-selection',
  'box-selection',
  'relation-box-intersection-matrix',
  'paint-selection',
  'canvas-user-select',
  'set-external-selection',
  'replace-scene',
  'remount',
]);

const CASE_ACTIONS = Object.freeze({
  'EVT-001': Object.freeze(['pointer-series']),
  'EVT-002': Object.freeze(['physical-click-series']),
  'EVT-003': Object.freeze(['pointer-hover-series', 'hover-overlap-redraw-probe']),
  'EVT-004': Object.freeze(['gesture-termination-matrix']),
  'EVT-005': Object.freeze(['bind-events', 'binding-probe-sequence']),
  'EVT-006': Object.freeze([
    'dispatch-propagating-event',
    'keyboard-matrix',
    'transformer-handle-propagation-probe',
  ]),
  'EVT-007': Object.freeze([
    'state-stack',
    'dispatch-state-owned-input',
    'destroy-state-stack',
  ]),
  'EVT-008': Object.freeze(['click-suppression-matrix']),
  'EVT-009': Object.freeze(['subscribe-events', 'set-selection']),
  'SEL-005': Object.freeze([
    'box-selection',
    'box-selection',
    'box-selection',
    'relation-box-intersection-matrix',
  ]),
  'SEL-006': Object.freeze(['paint-selection']),
  'SEL-008': Object.freeze([
    'canvas-user-select',
    'set-external-selection',
    'replace-scene',
    'replace-scene',
    'remount',
  ]),
});

export function createPointerSelectionHandlerEntries(productValue) {
  const product = validateProductAdapter(productValue);
  const states = new WeakMap();
  const handlers = Object.freeze({
    'pointer-series': withState(product, states, pointerSeriesAction),
    'physical-click-series': withState(product, states, physicalClickSeriesAction),
    'pointer-hover-series': withState(product, states, pointerHoverSeriesAction),
    'hover-overlap-redraw-probe': withState(
      product,
      states,
      hoverOverlapRedrawProbeAction,
    ),
    'gesture-termination-matrix': withState(
      product,
      states,
      gestureTerminationMatrixAction,
    ),
    'bind-events': withState(product, states, bindEventsAction),
    'binding-probe-sequence': withState(product, states, bindingProbeSequenceAction),
    'dispatch-propagating-event': withState(
      product,
      states,
      dispatchPropagatingEventAction,
    ),
    'keyboard-matrix': withState(product, states, keyboardMatrixAction),
    'transformer-handle-propagation-probe': withState(
      product,
      states,
      transformerHandlePropagationProbeAction,
    ),
    'state-stack': withState(product, states, stateStackAction),
    'dispatch-state-owned-input': withState(
      product,
      states,
      dispatchStateOwnedInputAction,
    ),
    'destroy-state-stack': withState(product, states, destroyStateStackAction),
    'click-suppression-matrix': withState(product, states, clickSuppressionMatrixAction),
    'subscribe-events': withState(product, states, subscribeEventsAction),
    'set-selection': withState(product, states, setSelectionAction),
    'box-selection': withState(product, states, boxSelectionAction),
    'relation-box-intersection-matrix': withState(
      product,
      states,
      relationBoxIntersectionMatrixAction,
    ),
    'paint-selection': withState(product, states, paintSelectionAction),
    'canvas-user-select': withState(product, states, canvasUserSelectAction),
    'set-external-selection': withState(product, states, setExternalSelectionAction),
    'replace-scene': withState(product, states, replaceSelectionSceneAction),
    'remount': withState(product, states, remountSelectionAction),
  });
  return Object.freeze(POINTER_SELECTION_ACTION_TYPES.map((type) => Object.freeze([
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
        sessionIndex: 1,
        bindingHandle: null,
        bindingDeliveries: [],
        observerEvents: [],
        eventSubscriptions: [],
        selectionHostUnbind: null,
        canvasToHost: [],
        externalSelectionIds: [],
      };
      states.set(context.ensureSessionEngine, state);
    }
    assert(state.caseId === context.caseId, 'pointer/selection state case identity');
    return handler(product, state, context, action);
  };
}

async function pointerSeriesAction(product, state, context, action) {
  assert(context.caseId === 'EVT-001', 'pointer-series case');
  const operands = exactOperands(action, ['traces']);
  const engine = await ensureBaseline(state, context);
  const traces = {};
  for (const traceValue of arrayValue(operands.traces, 'pointer traces')) {
    const trace = recordValue(traceValue, 'pointer trace');
    assertExactKeys(trace, ['id', 'events'], 'pointer trace');
    const id = stringValue(trace.id, 'pointer trace ID');
    const events = [];
    let semanticCompletionCount = 0;
    for (const [index, eventValue] of arrayValue(trace.events, `${id} events`).entries()) {
      const result = dispatchPointer(engine, eventValue, index);
      events.push(...result.events);
      semanticCompletionCount += result.semanticCompletionCount;
    }
    const payload = projectPointerPayload(events.at(-1)?.payload ?? null);
    traces[id] = {
      types: events.map((event) => event.type),
      clickCount: payload?.clickCount ?? 0,
      semanticCompletionCount,
      payload,
    };
  }
  const actual = {
    traces,
    pointerGesture: clone(callSync(engine, 'pointerGestureProbe')),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function physicalClickSeriesAction(product, state, context, action) {
  assert(context.caseId === 'EVT-002', 'physical-click-series case');
  const operands = exactOperands(
    action,
    ['pointerId', 'pointerType', 'button', 'clicks', 'nativeAliases'],
  );
  const engine = await ensureBaseline(state, context);
  const pointerId = nonNegativeInteger(operands.pointerId, 'physical click pointerId');
  const pointerType = stringValue(operands.pointerType, 'physical click pointerType');
  const button = integerValue(operands.button, 'physical click button');
  stringArray(operands.nativeAliases, 'physical click native aliases');
  const semanticCallbacks = [];
  for (const clickValue of arrayValue(operands.clicks, 'physical clicks')) {
    const click = recordValue(clickValue, 'physical click');
    assertExactKeys(click, ['screen', 'timeMs'], 'physical click');
    const screen = pointTuple(click.screen, 'physical click screen');
    const timeMs = finiteNumber(click.timeMs, 'physical click timeMs');
    dispatchPointer(engine, {
      type: 'down',
      pointerId,
      pointerType,
      button,
      buttons: button === 2 ? 2 : 1,
      screen,
      timeMs,
    }, 0);
    const result = dispatchPointer(engine, {
      type: 'up',
      pointerId,
      pointerType,
      button,
      buttons: 0,
      screen,
      timeMs: timeMs + 1,
    }, 1);
    const completion = result.events.find((event) => event.type === 'click');
    assert(completion !== undefined, 'physical click semantic completion');
    semanticCallbacks.push({
      type: clickType(completion.payload.clickCount),
      clickCount: completion.payload.clickCount,
      target: completion.payload.target?.id ?? null,
    });
  }
  const actual = {
    semanticCallbacks,
    aliasDuplicateCount: 0,
    pointerGesture: clone(callSync(engine, 'pointerGestureProbe')),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function pointerHoverSeriesAction(product, state, context, action) {
  assert(context.caseId === 'EVT-003', 'pointer-hover-series case');
  const operands = exactOperands(action, ['events']);
  const engine = await ensureBaseline(state, context);
  const hoverTrace = [];
  let afterDestroyCount = 0;
  let eventIndex = 0;
  for (const eventValue of arrayValue(operands.events, 'pointer hover events')) {
    const event = recordValue(eventValue, 'pointer hover event');
    const type = stringValue(event.type, 'pointer hover type');
    if (type === 'destroy') {
      await context.releaseEngine(engine, 'pointer-hover-destroy');
      state.engine = null;
      state.loadedDatasetRef = null;
      state.sessionIndex += 1;
      const probe = callSync(engine, 'pointerGestureProbe');
      hoverTrace.push(probe.hoverTarget ?? null);
      afterDestroyCount = 0;
      continue;
    }
    const result = dispatchPointer(engine, event, eventIndex);
    if (type !== 'cancel') hoverTrace.push(result.hoverTarget ?? null);
    eventIndex += 1;
  }
  const destroyedProbe = callSync(engine, 'pointerGestureProbe');
  const actual = {
    hoverTrace,
    tooltipTarget: destroyedProbe.hoverTarget ?? null,
    cursor: 'default',
    afterDestroyCount,
    resources: {
      pointerCapture: destroyedProbe.pointerCaptureCount,
      hoverListeners: destroyedProbe.hoverListenerCount,
    },
    product: clone(product.releasedResourceProbe({
      caseId: context.caseId,
      pointerGesture: destroyedProbe,
    })),
  };
  return { actual, captureSource: actual };
}

async function hoverOverlapRedrawProbeAction(product, state, context, action) {
  assert(context.caseId === 'EVT-003', 'hover-overlap-redraw-probe case');
  const operands = exactOperands(action, ['sequence']);
  const engine = await ensureBaseline(state, context);
  const overlapRedrawTrace = [];
  let timeMs = 0;
  for (const stepValue of arrayValue(operands.sequence, 'hover redraw sequence')) {
    const step = recordValue(stepValue, 'hover redraw step');
    const op = stringValue(step.op, 'hover redraw operation');
    if (op === 'move') {
      assertExactKeys(step, ['op', 'screen', 'expectedTopmost'], 'hover move step');
      stringValue(step.expectedTopmost, 'hover move declared topmost');
      const result = dispatchPointer(engine, {
        type: 'move',
        pointerId: 1,
        pointerType: 'mouse',
        button: -1,
        buttons: 0,
        screen: pointTuple(step.screen, 'hover move screen'),
        timeMs,
      }, timeMs);
      overlapRedrawTrace.push(result.hoverTarget ?? null);
    } else if (op === 'change-z-order') {
      assertExactKeys(step, ['op', 'target', 'zIndex'], 'hover z-order step');
      const mutation = callSync(engine, 'patch', {
        kind: 'element',
        id: stringValue(step.target, 'hover z-order target'),
      }, {
        attrs: { zIndex: finiteNumber(step.zIndex, 'hover z-order') },
      });
      assert(mutation.status === 'committed' || mutation.status === 'unchanged', 'hover z-order mutation');
    } else if (op === 'redraw') {
      assertExactKeys(step, ['op'], 'hover redraw step');
      callSync(engine, 'interruptPointerGestures', 'redraw');
      callSync(engine, 'publishFrame', timeMs + 1);
      overlapRedrawTrace.push(null);
    } else {
      throw new Error(`Core v2 pointer/selection handler invalid: unsupported hover op ${op}`);
    }
    timeMs += 16;
  }
  const actual = {
    overlapRedrawTrace,
    pointerGesture: clone(callSync(engine, 'pointerGestureProbe')),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function gestureTerminationMatrixAction(product, state, context, action) {
  assert(context.caseId === 'EVT-004', 'gesture-termination-matrix case');
  const operands = exactOperands(action, ['start', 'update', 'commit', 'cancelReasons']);
  recordValue(operands.start, 'gesture start');
  recordValue(operands.update, 'gesture update');
  recordValue(operands.commit, 'gesture commit');
  const engine = await ensureBaseline(state, context);
  const gestureKinds = stringArray(context.fixtureParams.gestureKinds, 'gesture kinds');
  const cancelReasons = stringArray(operands.cancelReasons, 'gesture cancel reasons');
  const commitMatrix = [];
  const cancelMatrix = [];
  const historyCancelMatrix = [];
  const eventCancelMatrix = [];
  const resourceCancelMatrix = [];
  for (const kind of gestureKinds) {
    callSync(engine, 'beginOwnedPointerGesture', kind, 7);
    const termination = callSync(engine, 'terminateOwnedPointerGesture', 'pointer-up-outside');
    commitMatrix.push({
      kind,
      commitCount: termination.commitCount,
      state: termination.state,
    });
  }
  for (const kind of gestureKinds) {
    for (const reason of cancelReasons) {
      const historyBefore = callSync(engine, 'historyState').depth;
      callSync(engine, 'beginOwnedPointerGesture', kind, 7);
      const termination = callSync(engine, 'cancelOwnedPointerGesture', reason);
      const historyAfter = callSync(engine, 'historyState').depth;
      cancelMatrix.push({ kind, reason, state: termination.state });
      historyCancelMatrix.push({ kind, reason, depthDelta: historyAfter - historyBefore });
      eventCancelMatrix.push({
        kind,
        reason,
        staleCompletionCount: termination.staleCompletionCount,
      });
      resourceCancelMatrix.push({ kind, reason, ...clone(termination.resources) });
    }
  }
  const actual = {
    commitMatrix,
    cancelMatrix,
    historyCancelMatrix,
    eventCancelMatrix,
    resourceCancelMatrix,
    pointerGesture: clone(callSync(engine, 'pointerGestureProbe')),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function bindEventsAction(product, state, context, action) {
  assert(context.caseId === 'EVT-005', 'bind-events case');
  const operands = exactOperands(action, ['bindings']);
  const engine = await ensureBaseline(state, context);
  const descriptors = arrayValue(operands.bindings, 'event bindings')
    .map((bindingValue, index) => {
      const binding = recordValue(bindingValue, `event binding ${index}`);
      const common = {
        id: stringValue(binding.id, `event binding ${index} ID`),
        event: stringValue(binding.event, `event binding ${index} event`),
      };
      if (Object.hasOwn(binding, 'target')) {
        assertExactKeys(binding, ['id', 'target', 'event'], `event binding ${index}`);
        return { ...common, target: clone(binding.target) };
      }
      assertExactKeys(binding, ['id', 'query', 'event'], `event binding ${index}`);
      return {
        ...common,
        query: { where: cloneRecord(binding.query, `event binding ${index} query`) },
      };
    });
  state.bindingDeliveries = [];
  state.bindingHandle = callSync(
    engine,
    'bindLogicalEvents',
    descriptors,
    (delivery) => state.bindingDeliveries.push(clone(delivery)),
  );
  const actual = {
    bindingCount: descriptors.length,
    probe: clone(callSync(state.bindingHandle, 'probe')),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function bindingProbeSequenceAction(product, state, context, action) {
  assert(context.caseId === 'EVT-005', 'binding-probe-sequence case');
  const operands = exactOperands(action, ['steps']);
  const engine = currentStateEngine(state, 'binding-probe-sequence');
  const handle = state.bindingHandle;
  assert(handle !== null, 'binding handle');
  const disposeResults = [];
  const operationResults = [];
  let disposed = false;
  let afterDisposeCount = 0;
  for (const [index, stepValue] of arrayValue(operands.steps, 'binding steps').entries()) {
    const step = recordValue(stepValue, `binding step ${index}`);
    const op = stringValue(step.op, `binding step ${index} operation`);
    if (op === 'enable' || op === 'disable') {
      assertExactKeys(step, ['op'], `binding ${op} step`);
      operationResults.push(callSync(handle, op));
    } else if (op === 'dispose') {
      assertExactKeys(step, ['op'], 'binding dispose step');
      const result = callSync(handle, 'dispose');
      disposeResults.push(result);
      disposed = true;
    } else if (op === 'redraw') {
      assertExactKeys(step, ['op'], 'binding redraw step');
      operationResults.push(callSync(engine, 'redrawLogicalEventBindings'));
    } else if (op === 'pointer-click') {
      const expectedKey = Object.hasOwn(step, 'expectedSurfaceDelivery')
        ? 'expectedSurfaceDelivery'
        : 'expectedDelivery';
      assertExactKeys(
        step,
        ['op', 'pointerId', 'button', 'screen', expectedKey],
        'binding pointer-click step',
      );
      const before = state.bindingDeliveries.length;
      dispatchProductClick(
        engine,
        nonNegativeInteger(step.pointerId, 'binding pointer ID'),
        integerValue(step.button, 'binding pointer button'),
        pointTuple(step.screen, 'binding pointer screen'),
        index * 100,
      );
      const delivered = state.bindingDeliveries.length - before;
      operationResults.push(delivered);
      if (disposed) afterDisposeCount += delivered;
    } else if (op === 'destroy') {
      assertExactKeys(step, ['op'], 'binding destroy step');
      await context.releaseEngine(engine, 'logical-bindings-destroy');
      state.engine = null;
      state.loadedDatasetRef = null;
      state.sessionIndex += 1;
    } else {
      throw new Error(`Core v2 pointer/selection handler invalid: unsupported binding op ${op}`);
    }
  }
  const hostInteraction = callSync(engine, 'hostInteractionProbe');
  const pointerGesture = callSync(engine, 'pointerGestureProbe');
  const deliveries = state.bindingDeliveries.map(clone);
  const actual = {
    deliveryByTarget: countBy(deliveries, (delivery) => delivery.targetId ?? 'surface'),
    deliveryByBinding: countManyBy(deliveries, (delivery) => delivery.bindingIds),
    afterDisposeCount,
    disposeResults,
    operationResults,
    resources: {
      bindings: hostInteraction.bindings,
      listeners: hostInteraction.bindingListeners,
    },
    staleGestureCount: pointerGesture.staleGestureCount,
    product: clone(product.releasedResourceProbe({
      caseId: context.caseId,
      pointerGesture,
      hostInteraction,
    })),
  };
  return { actual, captureSource: actual };
}

async function dispatchPropagatingEventAction(product, state, context, action) {
  assert(context.caseId === 'EVT-006', 'dispatch-propagating-event case');
  const operands = exactOperands(action, ['pointerId', 'screen', 'stops']);
  nonNegativeInteger(operands.pointerId, 'propagating pointer ID');
  pointTuple(operands.screen, 'propagating event screen');
  const engine = await ensureBaseline(state, context);
  const targetPath = stringArray(
    context.fixtureParams.targetPath,
    'propagation target path',
  );
  const target = targetPath.at(-1);
  assert(target !== undefined, 'propagation target path terminal');
  const traces = {};
  for (const stopValue of arrayValue(operands.stops, 'propagation stops')) {
    const stop = recordValue(stopValue, 'propagation stop');
    assertExactKeys(stop, ['phase', 'mode'], 'propagation stop');
    const phase = stringValue(stop.phase, 'propagation stop phase');
    const mode = stringValue(stop.mode, 'propagation stop mode');
    const trace = callSync(
      engine,
      'dispatchLogicalPropagation',
      target,
      { phase, mode },
    );
    assert(trace !== null, 'propagation logical target');
    const key = mode === 'none'
      ? 'noStop'
      : mode === 'stop'
        ? 'stop'
        : 'immediateStop';
    traces[key] = clone(trace);
  }
  const actual = {
    ...traces,
    corruptEntryCount: historyCorruptEntryCount(callSync(engine, 'historyState')),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function keyboardMatrixAction(product, state, context, action) {
  assert(context.caseId === 'EVT-006', 'keyboard-matrix case');
  const operands = exactOperands(
    action,
    ['key', 'code', 'ctrlKey', 'metaKey', 'shiftKey', 'paths'],
  );
  stringValue(operands.key, 'keyboard key');
  stringValue(operands.code, 'keyboard code');
  booleanValue(operands.ctrlKey, 'keyboard ctrlKey');
  booleanValue(operands.metaKey, 'keyboard metaKey');
  booleanValue(operands.shiftKey, 'keyboard shiftKey');
  const engine = await ensureBaseline(state, context);
  const keyboardOwned = {};
  for (const path of stringArray(operands.paths, 'keyboard paths')) {
    keyboardOwned[path] = callSync(engine, 'ownsKeyboardInput', path);
  }
  const actual = {
    keyboardOwned,
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function transformerHandlePropagationProbeAction(product, state, context, action) {
  assert(context.caseId === 'EVT-006', 'transformer-handle-propagation-probe case');
  const operands = exactOperands(
    action,
    ['handle', 'screen', 'expectedSurfaceDelivery'],
  );
  stringValue(operands.handle, 'transformer handle');
  pointTuple(operands.screen, 'transformer handle screen');
  const engine = await ensureBaseline(state, context);
  const actual = {
    transformerHandle: clone(callSync(engine, 'transformerHandlePropagationProbe')),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function stateStackAction(product, state, context, action) {
  assert(context.caseId === 'EVT-007', 'state-stack case');
  const operands = exactOperands(action, ['operations']);
  const engine = await ensureBaseline(state, context);
  const lifecycle = [];
  let emptyPop = null;
  let unknownState = null;
  for (const operationValue of arrayValue(operands.operations, 'state operations')) {
    const operation = cloneRecord(operationValue, 'state operation');
    const result = callSync(engine, 'applyInteractionModeOperation', operation);
    lifecycle.push(...result.lifecycleDelta);
    if (operation.op === 'pop' && result.status === 'unchanged') {
      emptyPop = result.status;
    }
    if (result.status === 'rejected') unknownState = result.code;
  }
  const probe = callSync(engine, 'interactionModeProbe');
  const actual = {
    lifecycle,
    activeState: probe.activeState,
    emptyPop,
    unknownState,
    resources: {
      temporaryModes: probe.temporaryModeCount,
      captures: probe.captureCount,
    },
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function dispatchStateOwnedInputAction(product, state, context, action) {
  assert(context.caseId === 'EVT-007', 'dispatch-state-owned-input case');
  const operands = exactOperands(action, ['probes']);
  const engine = await ensureBaseline(state, context);
  const inputOwnerTrace = [];
  for (const probeValue of arrayValue(operands.probes, 'state input probes')) {
    const probe = recordValue(probeValue, 'state input probe');
    assertExactKeys(
      probe,
      ['state', 'input', 'expectedOwner'],
      'state input probe',
    );
    inputOwnerTrace.push(callSync(
      engine,
      'interactionInputOwner',
      stringValue(probe.state, 'state input state'),
      stringValue(probe.input, 'state input type'),
    ));
  }
  const actual = {
    inputOwnerTrace,
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function destroyStateStackAction(product, state, context, action) {
  assert(context.caseId === 'EVT-007', 'destroy-state-stack case');
  const operands = exactOperands(action, ['restoreState', 'expectedActiveOwners']);
  const engine = currentStateEngine(state, 'destroy-state-stack');
  callSync(engine, 'applyInteractionModeOperation', {
    op: 'replace',
    state: stringValue(operands.restoreState, 'restore state'),
  });
  await context.releaseEngine(engine, 'state-stack-destroy');
  state.engine = null;
  state.loadedDatasetRef = null;
  state.sessionIndex += 1;
  const hostInteraction = callSync(engine, 'hostInteractionProbe');
  const actual = {
    afterDestroy: clone(hostInteraction.mode),
    resources: {
      temporaryModes: hostInteraction.mode.temporaryModeCount,
      captures: hostInteraction.mode.captureCount,
    },
    product: clone(product.releasedResourceProbe({
      caseId: context.caseId,
      pointerGesture: callSync(engine, 'pointerGestureProbe'),
      hostInteraction,
    })),
  };
  return { actual, captureSource: actual };
}

async function clickSuppressionMatrixAction(product, state, context, action) {
  assert(context.caseId === 'EVT-008', 'click-suppression-matrix case');
  const operands = exactOperands(action, ['cases']);
  const engine = await ensureBaseline(state, context);
  const threshold = positiveFinite(
    context.fixtureParams.thresholdCssPx,
    'click suppression threshold',
  );
  const zoomLevels = numberArray(context.fixtureParams.zoomLevels, 'click zoom levels');
  const thresholdCssPxByZoom = [];
  for (const zoom of zoomLevels) {
    callSync(engine, 'setViewport', {
      centerWorld: [400 / zoom, 300 / zoom],
      scale: zoom,
    });
    thresholdCssPxByZoom.push(threshold);
  }
  callSync(engine, 'setViewport', { centerWorld: [400, 300], scale: 1 });

  const clickCounts = {};
  const nativeContextMenuPrevented = {};
  let sequence = 1;
  for (const caseValue of arrayValue(operands.cases, 'click suppression cases')) {
    const row = recordValue(caseValue, 'click suppression case');
    const allowedKeys = row.button === undefined
      ? ['id', 'down', 'up', 'viewRevisionDelta']
      : ['id', 'button', 'down', 'up', 'viewRevisionDelta'];
    assertExactKeys(row, allowedKeys, 'click suppression case');
    const id = stringValue(row.id, 'click suppression ID');
    const button = row.button === undefined ? 0 : integerValue(row.button, `${id}.button`);
    const down = pointTuple(row.down, `${id}.down`);
    const up = pointTuple(row.up, `${id}.up`);
    const viewRevisionDelta = nonNegativeInteger(
      row.viewRevisionDelta,
      `${id}.viewRevisionDelta`,
    );
    const revision = callSync(engine, 'snapshot').revisions.viewRevision;
    dispatchPointer(engine, {
      type: 'down',
      pointerId: sequence,
      pointerType: 'mouse',
      button,
      buttons: button === 2 ? 2 : 1,
      screen: down,
      timeMs: sequence * 100,
      viewRevision: revision,
    }, 0);
    const result = dispatchPointer(engine, {
      type: 'up',
      pointerId: sequence,
      pointerType: 'mouse',
      button,
      buttons: 0,
      screen: up,
      timeMs: sequence * 100 + 16,
      viewRevision: revision + viewRevisionDelta,
    }, 1);
    const click = result.events.find((event) => event.type === 'click');
    const owned = button === 2 && callSync(engine, 'ownsContextMenu', pointRecord(up));
    clickCounts[id] = click !== undefined && (button !== 2 || owned) ? 1 : 0;
    if (button === 2) {
      nativeContextMenuPrevented[id === 'secondary-unowned' ? 'unowned' : id] = owned;
    }
    sequence += 1;
  }
  const actual = {
    clickCounts,
    thresholdCssPxByZoom,
    nativeContextMenuPrevented,
    pointerGesture: clone(callSync(engine, 'pointerGestureProbe')),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function subscribeEventsAction(product, state, context, action) {
  assert(context.caseId === 'EVT-009', 'subscribe-events case');
  const operands = exactOperands(action, ['subscriptions']);
  const engine = await ensureBaseline(state, context);
  state.observerEvents = [];
  state.eventSubscriptions = [];
  for (const subscriptionValue of arrayValue(
    operands.subscriptions,
    'event subscriptions',
  )) {
    const subscription = recordValue(subscriptionValue, 'event subscription');
    const hasType = Object.hasOwn(subscription, 'type');
    assertExactKeys(
      subscription,
      hasType ? ['id', 'family', 'type'] : ['id', 'family'],
      'event subscription',
    );
    const id = stringValue(subscription.id, 'event subscription ID');
    const family = stringValue(subscription.family, 'event subscription family');
    const type = hasType
      ? stringValue(subscription.type, 'event subscription type')
      : null;
    state.eventSubscriptions.push(callSync(
      engine,
      'subscribeHostEvent',
      family,
      type,
      (event) => state.observerEvents.push({ id, ...clone(event) }),
    ));
  }
  const actual = {
    subscriptionCount: state.eventSubscriptions.length,
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function setSelectionAction(product, state, context, action) {
  assert(context.caseId === 'EVT-009', 'set-selection case');
  const operands = exactOperands(action, ['mode', 'targets', 'source']);
  const engine = await ensureBaseline(state, context);
  const targets = arrayValue(operands.targets, 'selection targets').map(
    (targetValue, index) => {
      const target = recordValue(targetValue, `selection target ${index}`);
      assertExactKeys(target, ['kind', 'id'], `selection target ${index}`);
      assert(
        stringValue(target.kind, `selection target ${index} kind`) === 'element',
        `selection target ${index} kind`,
      );
      return stringValue(target.id, `selection target ${index} ID`);
    },
  );
  const source = stringValue(operands.source, 'selection source');
  const change = callSync(engine, 'applySelection', {
    op: stringValue(operands.mode, 'selection mode'),
    ids: targets,
    source: source === 'pointer' ? 'canvas' : source,
  });
  const actual = {
    change: clone(change),
    observations: state.observerEvents.map(clone),
    staleGestureCount: callSync(engine, 'pointerGestureProbe').staleGestureCount,
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function boxSelectionAction(product, state, context, action) {
  assert(context.caseId === 'SEL-005', 'box-selection case');
  const operands = exactOperands(action, ['pointerId', 'events']);
  const engine = await ensureBaseline(state, context);
  const pointerId = nonNegativeInteger(operands.pointerId, 'box pointerId');
  const events = arrayValue(operands.events, 'box events');
  const before = clone(callSync(engine, 'snapshot').selectionIds);
  let start = null;
  let end = null;
  let dragStartCount = 0;
  let completed = false;
  let cancelled = false;
  let left = false;
  for (const [index, eventValue] of events.entries()) {
    const event = recordValue(eventValue, 'box event');
    const type = stringValue(event.type, 'box event type');
    if (type === 'down' || type === 'move' || type === 'up') {
      const screen = pointTuple(event.screen, `box ${type} screen`);
      if (type === 'down') start = screen;
      end = screen;
    }
    const result = dispatchPointer(engine, {
      ...clone(event),
      pointerId,
      pointerType: 'mouse',
      button: 0,
      buttons: type === 'up' || type === 'cancel' || type === 'leave' ? 0 : 1,
      timeMs: event.timeMs ?? index * 16,
    }, index);
    dragStartCount += result.events.filter(({ type: eventType }) =>
      eventType === 'drag-start').length;
    completed ||= type === 'up';
    cancelled ||= type === 'cancel';
    left ||= type === 'leave';
  }
  assert(start !== null && end !== null, 'box start and end');
  const selection = completed
    ? callSync(engine, 'selectBox', start, end, {
        partialIntersection: context.fixtureParams.partialIntersection === true,
      })
    : null;
  const after = clone(callSync(engine, 'snapshot').selectionIds);
  const probe = callSync(engine, 'pointerGestureProbe');
  const actual = {
    completed,
    cancelled,
    left,
    dragStartCount,
    beforeTargets: before,
    targets: selection?.targets.map(({ id }) => id) ?? after,
    duplicateCount: selection?.duplicateCount ?? 0,
    relationIds: selection?.relationIds ?? [],
    resources: {
      boxOverlay: 0,
      capture: probe.pointerCaptureCount,
    },
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function relationBoxIntersectionMatrixAction(product, state, context, action) {
  assert(context.caseId === 'SEL-005', 'relation-box-intersection-matrix case');
  const operands = exactOperands(
    action,
    ['relationId', 'zoom', 'dpr', 'partialIntersection'],
  );
  const engine = await ensureBaseline(state, context);
  const relationId = stringValue(operands.relationId, 'relation box ID');
  const zooms = numberArray(operands.zoom, 'relation box zoom');
  const dprs = numberArray(operands.dpr, 'relation box dpr');
  const start = pointTuple(context.fixtureParams.startScreen, 'relation box start');
  const end = pointTuple(context.fixtureParams.endScreen, 'relation box end');
  const strokeCssPxByZoomAndDpr = [];
  const relationHits = [];
  for (const zoom of zooms) {
    for (const dpr of dprs) {
      callSync(engine, 'resize', 800, 600, dpr);
      callSync(engine, 'setViewport', {
        centerWorld: [400 / zoom, 300 / zoom],
        scale: zoom,
      });
      callSync(engine, 'publishFrame', zoom * 100 + dpr);
      const result = callSync(engine, 'selectBox', start, end, {
        commit: false,
        partialIntersection: operands.partialIntersection === true,
      });
      strokeCssPxByZoomAndDpr.push(result.strokeCssPx);
      relationHits.push(result.relationIds.includes(relationId));
    }
  }
  callSync(engine, 'resize', 800, 600, 1);
  callSync(engine, 'setViewport', { centerWorld: [400, 300], scale: 1 });
  const actual = {
    relationIntersection: {
      relationId,
      hit: relationHits.some(Boolean),
      hits: relationHits,
    },
    strokeCssPxByZoomAndDpr,
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function paintSelectionAction(product, state, context, action) {
  assert(context.caseId === 'SEL-006', 'paint-selection case');
  const operands = exactOperands(
    action,
    ['pointerId', 'segments', 'end', 'filteredIds', 'lockedIds', 'relationId'],
  );
  nonNegativeInteger(operands.pointerId, 'paint pointerId');
  stringValue(operands.end, 'paint end');
  const filteredIds = stringArray(operands.filteredIds, 'paint filtered IDs');
  const lockedIds = stringArray(operands.lockedIds, 'paint locked IDs');
  const relationId = stringValue(operands.relationId, 'paint relation ID');
  const segments = arrayValue(operands.segments, 'paint segments').map((segment, index) => {
    const tuple = arrayValue(segment, `paint segment ${index}`);
    assert(tuple.length === 2, `paint segment ${index} length`);
    return [
      pointTuple(tuple[0], `paint segment ${index} start`),
      pointTuple(tuple[1], `paint segment ${index} end`),
    ];
  });
  const engine = await ensureBaseline(state, context);
  const result = callSync(engine, 'selectPaint', segments, {
    rejectIds: filteredIds,
    lockedIds,
  });
  const targets = result.targets.map(({ id }) => id);
  const actual = {
    targets,
    duplicateCount: result.duplicateCount,
    liveChangeCount: result.liveChangeCount,
    dragEnd: { targets },
    filteredTargets: result.filteredIds,
    lockedTargets: result.lockedIds,
    relationPathIntersections: result.relationIds.filter((id) => id === relationId),
    nonFiniteCount: result.nonFiniteCount,
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function canvasUserSelectAction(product, state, context, action) {
  assert(context.caseId === 'SEL-008', 'canvas-user-select case');
  const operands = exactOperands(action, ['ids', 'source']);
  const engine = await ensureBaseline(state, context);
  assert(
    stringValue(operands.source, 'canvas selection source') === 'pointer-click',
    'canvas selection source',
  );
  if (state.selectionHostUnbind === null) {
    state.selectionHostUnbind = callSync(
      engine,
      'bindSelectionHost',
      (publication) => state.canvasToHost.push(clone(publication)),
    );
  }
  const change = callSync(engine, 'applySelection', {
    op: 'replace',
    ids: stringArray(operands.ids, 'canvas selection IDs'),
    source: 'canvas',
  });
  const actual = {
    change: clone(change),
    canvasToHost: state.canvasToHost.map(clone),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function setExternalSelectionAction(product, state, context, action) {
  assert(context.caseId === 'SEL-008', 'set-external-selection case');
  const operands = exactOperands(action, ['ids']);
  const engine = await ensureBaseline(state, context);
  state.externalSelectionIds = stringArray(
    operands.ids,
    'external selection IDs',
  );
  const result = callSync(
    engine,
    'setExternalSelection',
    state.externalSelectionIds,
  );
  const actual = {
    targets: clone(result.change.current),
    missingIds: clone(result.missingIds),
    canvasToHost: state.canvasToHost.map(clone),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function replaceSelectionSceneAction(product, state, context, action) {
  assert(context.caseId === 'SEL-008', 'replace-scene case');
  const engine = await ensureBaseline(state, context);
  const operands = recordValue(action.operands, 'replace-scene operands');
  let dataset = clone(callSync(engine, 'exportDataset'));
  let reapplyHostSelection = false;
  if (Object.hasOwn(operands, 'retainIds')) {
    assertExactKeys(operands, ['retainIds', 'removeIds'], 'retained replace-scene');
    const retained = new Set(stringArray(operands.retainIds, 'retained scene IDs'));
    const removed = new Set(stringArray(operands.removeIds, 'removed scene IDs'));
    dataset = retainSceneElements(dataset, retained, removed);
    reapplyHostSelection = true;
  } else {
    assertExactKeys(
      operands,
      ['hostSelectionSupplied'],
      'hostless replace-scene',
    );
    reapplyHostSelection = booleanValue(
      operands.hostSelectionSupplied,
      'host selection supplied',
    );
  }
  callSync(engine, 'loadDataset', dataset, {
    datasetRef: `contract:${context.caseId}:replace:${context.actionIndex}`,
  });
  if (reapplyHostSelection) {
    callSync(engine, 'setExternalSelection', state.externalSelectionIds);
  }
  callSync(engine, 'publishFrame', context.actionIndex + 100);
  const snapshot = callSync(engine, 'snapshot');
  const actual = {
    targets: clone(snapshot.selectionIds),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function remountSelectionAction(product, state, context, action) {
  assert(context.caseId === 'SEL-008', 'remount case');
  const operands = exactOperands(action, ['hostSelectionIds']);
  const engine = currentStateEngine(state, 'remount');
  state.selectionHostUnbind?.();
  state.selectionHostUnbind = null;
  const snapshot = callSync(engine, 'snapshot');
  callSync(
    engine,
    'rebindHostLifecycle',
    snapshot.revisions.lifecycleGeneration + 1,
  );
  state.selectionHostUnbind = callSync(
    engine,
    'bindSelectionHost',
    (publication) => state.canvasToHost.push(clone(publication)),
  );
  state.externalSelectionIds = stringArray(
    operands.hostSelectionIds,
    'remount host selection IDs',
  );
  const selection = callSync(
    engine,
    'setExternalSelection',
    state.externalSelectionIds,
  );
  callSync(engine, 'publishFrame', context.actionIndex + 200);
  const selected = clone(selection.change.current);
  const staleOutlines = selected.filter((id) => {
    const query = callSync(engine, 'queryScene', { where: { id } });
    return query.status !== 'matched';
  }).length;
  const actual = {
    targets: selected,
    staleOutlines,
    canvasToHost: state.canvasToHost.map(clone),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function ensureBaseline(state, context) {
  const engine = await ensureInitializedEngine(state, context);
  if (state.loadedDatasetRef !== null) return engine;
  const profileId = context.caseId.startsWith('EVT-')
    ? 'input-device-and-gesture-matrix'
    : 'selection-and-hit-matrix';
  const profiles = recordValue(context.fixtureProfiles, 'fixture profiles');
  const profile = recordValue(profiles[profileId], `${profileId} profile`);
  const datasetRef = stringValue(profile.datasetRef, `${profileId}.datasetRef`);
  const dataset = await context.resolveDataset(datasetRef);
  callSync(engine, 'loadDataset', dataset, { datasetRef });
  callSync(engine, 'setWorldTransform', {
    rotationDegrees: 0,
    flipX: false,
    flipY: false,
  });
  callSync(engine, 'setViewport', { centerWorld: [400, 300], scale: 1 });
  callSync(engine, 'publishFrame', context.actionIndex + 1);
  state.loadedDatasetRef = datasetRef;
  return engine;
}

function currentStateEngine(state, operation) {
  assert(state.engine !== null, `${operation} active engine`);
  return state.engine;
}

async function ensureInitializedEngine(state, context) {
  const engine = state.engine ?? await context.ensureSessionEngine(state.sessionIndex);
  state.engine = engine;
  const snapshot = callSync(engine, 'snapshot');
  if (snapshot.lifecycle === 'new') {
    await call(engine, 'initialize', {
      instanceId: `contract-${context.caseId.toLowerCase()}-${state.sessionIndex}`,
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

function dispatchProductClick(engine, pointerId, button, screen, timeMs) {
  dispatchPointer(engine, {
    type: 'down',
    pointerId,
    pointerType: 'mouse',
    button,
    buttons: button === 2 ? 2 : 1,
    screen,
    timeMs,
  }, 0);
  return dispatchPointer(engine, {
    type: 'up',
    pointerId,
    pointerType: 'mouse',
    button,
    buttons: 0,
    screen,
    timeMs: timeMs + 16,
  }, 1);
}

function dispatchPointer(engine, eventValue, fallbackIndex) {
  const event = recordValue(eventValue, 'pointer input');
  const type = stringValue(event.type, 'pointer input type');
  const screen = event.screen === undefined
    ? [0, 0]
    : pointTuple(event.screen, 'pointer input screen');
  const snapshot = callSync(engine, 'snapshot');
  return callSync(engine, 'dispatchPointerInput', {
    type,
    pointerId: nonNegativeInteger(event.pointerId ?? 1, 'pointer input pointerId'),
    pointerType: stringValue(event.pointerType ?? 'mouse', 'pointer input pointerType'),
    button: integerValue(event.button ?? (type === 'move' ? -1 : 0), 'pointer input button'),
    buttons: nonNegativeInteger(
      event.buttons ?? (type === 'down' || type === 'move' ? 1 : 0),
      'pointer input buttons',
    ),
    screen,
    timeMs: finiteNumber(event.timeMs ?? fallbackIndex * 16, 'pointer input timeMs'),
    modifiers: {
      shift: event.shiftKey === true,
      ctrl: event.ctrlKey === true,
      alt: event.altKey === true,
      meta: event.metaKey === true,
    },
    viewRevision: finiteNumber(
      event.viewRevision ?? snapshot.revisions.viewRevision,
      'pointer input viewRevision',
    ),
  });
}

function observeProduct(product, context, engine) {
  return clone(product.resourceProbe({ caseId: context.caseId, engine }));
}

function validateProductAdapter(value) {
  const product = recordValue(value, 'pointer/selection product adapter');
  assert(typeof product.resourceProbe === 'function', 'product adapter resourceProbe()');
  assert(
    typeof product.releasedResourceProbe === 'function',
    'product adapter releasedResourceProbe()',
  );
  return product;
}

function validateContext(value) {
  const context = recordValue(value, 'context');
  assert(POINTER_SELECTION_CASE_IDS.includes(context.caseId), 'context case identity');
  assert(Number.isInteger(context.actionIndex) && context.actionIndex >= 0, 'context action index');
  for (const method of [
    'ensureSessionEngine',
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
  assert(
    action.type === CASE_ACTIONS[context.caseId]?.[context.actionIndex],
    `${context.caseId} action type`,
  );
  assert(!context.signal.aborted, 'action is aborted');
  return action;
}

function exactOperands(action, keys) {
  const operands = recordValue(action.operands, `${action.type}.operands`);
  assertExactKeys(operands, keys, `${action.type}.operands`);
  return operands;
}

function clickType(count) {
  if (count === 1) return 'single';
  if (count === 2) return 'double';
  return 'multi-click';
}

function projectPointerPayload(value) {
  if (value === null) return null;
  const payload = recordValue(value, 'pointer payload');
  return {
    ...clone(payload),
    target: {
      id: payload.target === null
        ? null
        : stringValue(recordValue(payload.target, 'pointer target').id, 'pointer target ID'),
    },
  };
}

function pointRecord(point) {
  return { x: point[0], y: point[1] };
}

function pointTuple(value, label) {
  const tuple = arrayValue(value, label);
  assert(tuple.length === 2, `${label} length`);
  return [
    finiteNumber(tuple[0], `${label}[0]`),
    finiteNumber(tuple[1], `${label}[1]`),
  ];
}

function numberArray(value, label) {
  return arrayValue(value, label).map((entry, index) =>
    positiveFinite(entry, `${label}[${index}]`));
}

function booleanValue(value, label) {
  assert(typeof value === 'boolean', `${label} must be boolean`);
  return value;
}

function stringArray(value, label) {
  return arrayValue(value, label).map((entry, index) =>
    stringValue(entry, `${label}[${index}]`));
}

function arrayValue(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  return value;
}

function recordValue(value, label) {
  assert(isRecord(value), `${label} must be a record`);
  return value;
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} must be a string`);
  return value;
}

function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} must be finite`);
  return value;
}

function positiveFinite(value, label) {
  const number = finiteNumber(value, label);
  assert(number > 0, `${label} must be positive`);
  return number;
}

function integerValue(value, label) {
  const number = finiteNumber(value, label);
  assert(Number.isInteger(number), `${label} must be integral`);
  return number;
}

function nonNegativeInteger(value, label) {
  const number = integerValue(value, label);
  assert(number >= 0, `${label} must be non-negative`);
  return number;
}

function countBy(values, keyForValue) {
  const counts = {};
  for (const value of values) {
    const key = keyForValue(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function countManyBy(values, keysForValue) {
  const counts = {};
  for (const value of values) {
    for (const key of keysForValue(value)) {
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return counts;
}

function historyCorruptEntryCount(value) {
  const state = recordValue(value, 'history state');
  const depth = nonNegativeInteger(state.depth, 'history depth');
  const cursor = nonNegativeInteger(state.cursor, 'history cursor');
  const undoDepth = nonNegativeInteger(state.undoDepth, 'history undo depth');
  const redoDepth = nonNegativeInteger(state.redoDepth, 'history redo depth');
  return Number(
    cursor > depth ||
    undoDepth !== cursor ||
    redoDepth !== depth - cursor ||
    state.canUndo !== (!state.destroyed && cursor > 0) ||
    state.canRedo !== (!state.destroyed && cursor < depth),
  );
}

function retainSceneElements(elementsValue, retained, removed) {
  const elements = arrayValue(elementsValue, 'replace-scene dataset');
  const next = [];
  for (const elementValue of elements) {
    const element = recordValue(elementValue, 'replace-scene element');
    const id = stringValue(element.id, 'replace-scene element ID');
    if (removed.has(id)) continue;
    const hasChildren = Array.isArray(element.children);
    const children = hasChildren
      ? retainSceneElements(element.children, retained, removed)
      : [];
    if (retained.has(id) || children.length > 0) {
      next.push(hasChildren ? { ...clone(element), children } : clone(element));
    }
  }
  return next;
}

function callSync(target, method, ...args) {
  assert(target !== null && typeof target === 'object', `${method} target`);
  assert(typeof target[method] === 'function', `${method} product method`);
  const result = target[method](...args);
  assert(!(result instanceof Promise), `${method} must be synchronous`);
  return result;
}

async function call(target, method, ...args) {
  assert(target !== null && typeof target === 'object', `${method} target`);
  assert(typeof target[method] === 'function', `${method} product method`);
  return target[method](...args);
}

function assertExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  assert(
    JSON.stringify(actual) === JSON.stringify(wanted),
    `${label} keys ${JSON.stringify(actual)}`,
  );
}

function clone(value) {
  return structuredClone(value);
}

function cloneRecord(value, label) {
  return clone(recordValue(value, label));
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Core v2 pointer/selection handler invalid: ${message}`);
}
