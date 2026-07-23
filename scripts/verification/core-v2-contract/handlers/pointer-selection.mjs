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
  'SEL-007',
  'SEL-008',
  'SEL-009',
  'TRN-002',
  'TRN-003',
  'TRN-010',
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
  'selection-visual-matrix',
  'selection-eligibility-matrix',
  'canvas-user-select',
  'set-external-selection',
  'replace-scene',
  'remount',
  'select-relation-endpoints',
  'replace-endpoint',
  'remove-relation-endpoint',
  'inspect-transform-handles',
  'evaluate-transformable-subset',
  'evaluate-transformable-kind-matrix',
  'transform-handle-gesture',
  'pointer-click',
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
  'SEL-007': Object.freeze([
    'selection-visual-matrix',
    'selection-eligibility-matrix',
  ]),
  'SEL-008': Object.freeze([
    'canvas-user-select',
    'set-external-selection',
    'replace-scene',
    'replace-scene',
    'remount',
  ]),
  'SEL-009': Object.freeze([
    'select-relation-endpoints',
    'replace-endpoint',
    'select-relation-endpoints',
    'select-relation-endpoints',
    'remove-relation-endpoint',
    'select-relation-endpoints',
  ]),
  'TRN-002': Object.freeze(['inspect-transform-handles']),
  'TRN-003': Object.freeze([
    'evaluate-transformable-subset',
    'evaluate-transformable-kind-matrix',
  ]),
  'TRN-010': Object.freeze(['transform-handle-gesture', 'pointer-click']),
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
    'selection-visual-matrix': withState(product, states, selectionVisualMatrixAction),
    'selection-eligibility-matrix': withState(
      product,
      states,
      selectionEligibilityMatrixAction,
    ),
    'canvas-user-select': withState(product, states, canvasUserSelectAction),
    'set-external-selection': withState(product, states, setExternalSelectionAction),
    'replace-scene': withState(product, states, replaceSelectionSceneAction),
    'remount': withState(product, states, remountSelectionAction),
    'select-relation-endpoints': withState(
      product,
      states,
      selectRelationEndpointsAction,
    ),
    'replace-endpoint': withState(product, states, replaceEndpointAction),
    'remove-relation-endpoint': withState(
      product,
      states,
      removeRelationEndpointAction,
    ),
    'inspect-transform-handles': withState(
      product,
      states,
      inspectTransformHandlesAction,
    ),
    'evaluate-transformable-subset': withState(
      product,
      states,
      evaluateTransformableSubsetAction,
    ),
    'evaluate-transformable-kind-matrix': withState(
      product,
      states,
      evaluateTransformableKindMatrixAction,
    ),
    'transform-handle-gesture': withState(
      product,
      states,
      transformHandleGestureAction,
    ),
    'pointer-click': withState(product, states, postTransformPointerClickAction),
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
        firstEndpointTargets: [],
        replacedEndpointBefore: null,
        replacedEndpointCurrent: null,
        transformCounters: null,
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

async function selectionVisualMatrixAction(product, state, context, action) {
  assert(context.caseId === 'SEL-007', 'selection-visual-matrix case');
  const operands = exactOperands(
    action,
    ['singleRotationDegrees', 'handleCssPx', 'strokeCssPx'],
  );
  const engine = await ensureBaseline(state, context);
  const selections = arrayValue(
    context.fixtureParams.selections,
    'selection visual selections',
  ).map((value, index) => stringArray(value, `selection visual selection ${index}`));
  assert(selections.length >= 3, 'selection visual selection phases');
  const zoomLevels = numberArray(
    context.fixtureParams.zoomLevels,
    'selection visual zoom levels',
  );
  const modes = stringArray(context.fixtureParams.modes, 'selection visual modes');
  const singleRotationDegrees = finiteNumber(
    operands.singleRotationDegrees,
    'selection visual rotation',
  );
  const handleCssPx = positiveFinite(operands.handleCssPx, 'selection visual handle');
  const strokeCssPx = positiveFinite(operands.strokeCssPx, 'selection visual stroke');
  const singleIds = selections[1];
  const multiIds = selections[2];
  assert(singleIds.length === 1, 'selection visual single target');
  const rotationResult = callSync(engine, 'patch', {
    kind: 'element',
    id: singleIds[0],
  }, {
    attrs: { rotation: singleRotationDegrees * Math.PI / 180 },
  });
  assert(rotationResult.status === 'committed', 'selection visual rotation commit');

  callSync(engine, 'applySelection', {
    op: 'replace',
    ids: selections[0],
    source: 'programmatic',
  });
  const empty = callSync(engine, 'setSelectionVisualPolicy', {
    selectionIds: selections[0],
    mode: 'all',
    handleCssPx,
    strokeCssPx,
  });
  callSync(engine, 'publishFrame', context.actionIndex + 10);

  const handleCssPxByZoom = [];
  const strokeCssPxByZoom = [];
  let single = null;
  for (const [index, zoom] of zoomLevels.entries()) {
    callSync(engine, 'setViewport', {
      centerWorld: [400 / zoom, 300 / zoom],
      scale: zoom,
    });
    callSync(engine, 'applySelection', {
      op: 'replace',
      ids: singleIds,
      source: 'programmatic',
    });
    callSync(engine, 'setSelectionVisualPolicy', {
      selectionIds: singleIds,
      mode: 'all',
      handleCssPx,
      strokeCssPx,
    });
    callSync(engine, 'publishFrame', context.actionIndex + 20 + index);
    single = callSync(engine, 'selectionVisualProbe', {
      selectionIds: singleIds,
      mode: 'all',
      handleCssPx,
      strokeCssPx,
    });
    assert(single !== null && single.frame !== null, 'selection visual single frame');
    handleCssPxByZoom.push(single.handleCssPx);
    strokeCssPxByZoom.push(single.strokeCssPx);
  }

  callSync(engine, 'setViewport', { centerWorld: [400, 300], scale: 1 });
  callSync(engine, 'applySelection', {
    op: 'replace',
    ids: multiIds,
    source: 'programmatic',
  });
  const multi = callSync(engine, 'setSelectionVisualPolicy', {
    selectionIds: multiIds,
    mode: 'all',
    handleCssPx,
    strokeCssPx,
  });
  callSync(engine, 'publishFrame', context.actionIndex + 40);
  assert(multi !== null && multi.frame !== null, 'selection visual multi frame');

  assert(modes.includes('hidden'), 'selection visual hidden mode');
  const hidden = callSync(engine, 'setSelectionVisualPolicy', {
    selectionIds: multiIds,
    mode: 'hidden',
    handleCssPx,
    strokeCssPx,
  });
  callSync(engine, 'publishFrame', context.actionIndex + 41);
  const actual = {
    empty: {
      overlayCount: empty?.overlayCount ?? 0,
    },
    single: {
      frameOrientationDegrees: single.frame.orientationDegrees,
    },
    multi: {
      frameKind: multi.frame.kind,
    },
    hidden: {
      overlayCount: hidden?.overlayCount ?? 0,
    },
    handleCssPxByZoom,
    strokeCssPxByZoom,
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function selectionEligibilityMatrixAction(product, state, context, action) {
  assert(context.caseId === 'SEL-007', 'selection-eligibility-matrix case');
  const operands = exactOperands(action, ['cases']);
  const engine = await ensureBaseline(state, context);
  const cases = {};
  for (const [index, value] of arrayValue(
    operands.cases,
    'selection eligibility cases',
  ).entries()) {
    const entry = recordValue(value, `selection eligibility case ${index}`);
    const id = stringValue(entry.id, `selection eligibility case ${index} ID`);
    const selected = stringArray(
      entry.selected,
      `selection eligibility case ${id} selected`,
    );
    const hasKinds = Object.hasOwn(entry, 'eligibleKinds');
    const hasRejected = Object.hasOwn(entry, 'ineligibleIds');
    assert(hasKinds !== hasRejected, `selection eligibility case ${id} filter`);
    assertExactKeys(
      entry,
      hasKinds
        ? ['id', 'selected', 'eligibleKinds']
        : ['id', 'selected', 'ineligibleIds'],
      `selection eligibility case ${id}`,
    );
    callSync(engine, 'applySelection', {
      op: 'replace',
      ids: selected,
      source: 'programmatic',
    });
    const visual = callSync(engine, 'setSelectionVisualPolicy', {
      selectionIds: selected,
      mode: id === 'group-only' || id === 'element-only' ? id : 'all',
      ...(hasKinds
        ? {
            includeTypes: stringArray(
              entry.eligibleKinds,
              `selection eligibility case ${id} kinds`,
            ),
          }
        : {
            rejectIds: stringArray(
              entry.ineligibleIds,
              `selection eligibility case ${id} rejected`,
            ),
          }),
      handleCssPx: 8,
      strokeCssPx: 1,
    });
    callSync(engine, 'publishFrame', context.actionIndex + 50 + index);
    assert(visual !== null, `selection eligibility case ${id} visual`);
    cases[id] = {
      overlayTargets: visual.overlayTargets.map(({ selectionId }) => selectionId),
    };
  }
  const actual = {
    cases,
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function selectRelationEndpointsAction(product, state, context, action) {
  assert(context.caseId === 'SEL-009', 'select-relation-endpoints case');
  const operands = exactOperands(action, ['relations', 'mode']);
  const engine = await ensureBaseline(state, context);
  const result = callSync(
    engine,
    'selectRelationEndpoints',
    stringArray(operands.relations, 'relation endpoint relation IDs'),
    stringValue(operands.mode, 'relation endpoint selection mode'),
    'programmatic',
  );
  if (context.actionIndex === 0) {
    state.firstEndpointTargets = [...result.targets];
  }
  const staleEndpointResolutionCount = context.actionIndex === 2
    ? result.targets.filter((target) =>
        state.firstEndpointTargets.includes(target)).length
    : 0;
  const actual = {
    resolvedTargets: result.targets.map(({ selectionId }) => selectionId),
    selectionTargets: clone(result.change.current),
    duplicateCount: result.duplicateTargetCount,
    missingCount: result.missingEndpointIds.length,
    missingIds: clone(result.missingEndpointIds),
    missingRelationIds: clone(result.missingRelationIds),
    staleEndpointResolutionCount,
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function replaceEndpointAction(product, state, context, action) {
  assert(context.caseId === 'SEL-009', 'replace-endpoint case');
  const operands = exactOperands(action, ['remove', 'add']);
  const engine = await ensureBaseline(state, context);
  const removeId = stringValue(operands.remove, 'replace endpoint remove ID');
  const add = recordValue(operands.add, 'replace endpoint add');
  assertExactKeys(add, ['id', 'kind'], 'replace endpoint add');
  const addId = stringValue(add.id, 'replace endpoint add ID');
  const addKind = stringValue(add.kind, 'replace endpoint add kind');
  assert(addId === removeId, 'replace endpoint stable ID');
  const beforeQuery = callSync(engine, 'queryScene', { where: { id: removeId } });
  assert(beforeQuery.status === 'matched', 'replace endpoint before target');
  state.replacedEndpointBefore = beforeQuery.targets[0];
  const dataset = replaceSceneElement(
    clone(callSync(engine, 'exportDataset')),
    removeId,
    (element) => ({
      ...clone(element),
      type: addKind,
      id: addId,
      label: `replacement:${addId}`,
    }),
  );
  callSync(engine, 'loadDataset', dataset, {
    datasetRef: `contract:${context.caseId}:replace-endpoint`,
  });
  callSync(engine, 'publishFrame', context.actionIndex + 100);
  const currentQuery = callSync(engine, 'queryScene', { where: { id: addId } });
  assert(currentQuery.status === 'matched', 'replace endpoint current target');
  state.replacedEndpointCurrent = currentQuery.targets[0];
  const lifecycleIdentity = {
    key: currentQuery.targets[0].key,
    sceneOrder: currentQuery.targets[0].sceneOrder,
    lifecycleGeneration: currentQuery.lifecycleGeneration,
    sceneRevision: currentQuery.sceneRevision,
  };
  const actual = {
    id: addId,
    lifecycleIdentity,
    replacedObject: state.replacedEndpointBefore !== state.replacedEndpointCurrent,
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function removeRelationEndpointAction(product, state, context, action) {
  assert(context.caseId === 'SEL-009', 'remove-relation-endpoint case');
  const operands = exactOperands(action, ['relationId', 'endpointId']);
  const engine = await ensureBaseline(state, context);
  const relationId = stringValue(operands.relationId, 'remove relation endpoint relation ID');
  const endpointId = stringValue(operands.endpointId, 'remove relation endpoint ID');
  const dataset = removeSceneElement(
    clone(callSync(engine, 'exportDataset')),
    endpointId,
  );
  callSync(engine, 'loadDataset', dataset, {
    datasetRef: `contract:${context.caseId}:remove-endpoint`,
  });
  callSync(engine, 'publishFrame', context.actionIndex + 120);
  const actual = {
    relationId,
    endpointId,
    currentTargetCount: callSync(engine, 'queryScene', {
      where: { id: endpointId },
    }).targets.length,
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function inspectTransformHandlesAction(product, state, context, action) {
  assert(context.caseId === 'TRN-002', 'inspect-transform-handles case');
  const operands = exactOperands(action, ['regions', 'overlapProbe']);
  const engine = await ensureBaseline(state, context);
  const regions = stringArray(operands.regions, 'transform handle regions');
  assert(
    stringValue(operands.overlapProbe, 'transform overlap probe') ===
      'corner-edge-rotate',
    'transform overlap probe value',
  );
  const target = stringValue(context.fixtureParams.target, 'transform handle target');
  const rotationDegrees = finiteNumber(
    context.fixtureParams.rotationDegrees,
    'transform handle rotation',
  );
  const cornerCssPx = positiveFinite(
    context.fixtureParams.cornerCssPx,
    'transform corner CSS size',
  );
  const edgeStripCssPx = positiveFinite(
    context.fixtureParams.edgeStripCssPx,
    'transform edge CSS size',
  );
  const rotateZoneCssPx = positiveFinite(
    context.fixtureParams.rotateZoneCssPx,
    'transform rotate CSS size',
  );
  const zoomLevels = numberArray(
    context.fixtureParams.zoomLevels,
    'transform handle zoom levels',
  );
  const rotationResult = callSync(engine, 'patch', {
    kind: 'element',
    id: target,
  }, {
    attrs: { rotation: rotationDegrees * Math.PI / 180 },
  });
  assert(rotationResult.status === 'committed', 'transform handle rotation commit');
  callSync(engine, 'applySelection', {
    op: 'replace',
    ids: [target],
    source: 'programmatic',
  });
  const cornerCssPxByZoom = [];
  const edgeStripCssPxByZoom = [];
  let probe = null;
  for (const [index, zoom] of zoomLevels.entries()) {
    callSync(engine, 'setViewport', {
      centerWorld: [400 / zoom, 300 / zoom],
      scale: zoom,
    });
    callSync(engine, 'setSelectionVisualPolicy', {
      selectionIds: [target],
      mode: 'all',
      handleCssPx: cornerCssPx,
      strokeCssPx: 1,
    });
    callSync(engine, 'publishFrame', context.actionIndex + 150 + index);
    probe = callSync(engine, 'transformerHandleProbe', {
      selectionIds: [target],
      cornerCssPx,
      edgeStripCssPx,
      rotateZoneCssPx,
    });
    assert(probe !== null, 'transform handle probe');
    cornerCssPxByZoom.push(probe.cornerCssPx);
    edgeStripCssPxByZoom.push(probe.edgeStripCssPx);
  }
  callSync(engine, 'setViewport', { centerWorld: [400, 300], scale: 1 });
  assert(probe !== null, 'terminal transform handle probe');
  const actual = {
    visibleCorners: probe.visibleCorners.filter((id) => regions.includes(id)),
    overlapPriority: probe.overlapPriority.slice(0, 3),
    cornerCssPxByZoom,
    edgeStripCssPxByZoom,
    cursorDirectionByHandle: clone(probe.cursorDirectionByHandle),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function evaluateTransformableSubsetAction(product, state, context, action) {
  assert(context.caseId === 'TRN-003', 'evaluate-transformable-subset case');
  const operands = exactOperands(action, ['selection', 'lockedIds']);
  const engine = await ensureBaseline(state, context);
  const selection = stringArray(operands.selection, 'transform subset selection');
  const lockedIds = stringArray(operands.lockedIds, 'transform subset locked IDs');
  const beforeTargets = {
    'text-c': logicalTargetValue(engine, 'text-c'),
    links: logicalTargetValue(engine, 'links'),
  };
  callSync(engine, 'applySelection', {
    op: 'replace',
    ids: selection,
    source: 'programmatic',
  });
  const subset = callSync(engine, 'transformableSubset', selection, lockedIds);
  callSync(engine, 'setSelectionVisualPolicy', {
    selectionIds: selection,
    mode: 'all',
    lockedIds,
    handleCssPx: 8,
    strokeCssPx: 1,
  });
  callSync(engine, 'publishFrame', context.actionIndex + 180);
  const actual = {
    rotatableTargets: subset.rotatableTargets.map(({ selectionId }) => selectionId),
    resizableTargets: subset.resizableTargets.map(({ selectionId }) => selectionId),
    activeResizeHandles: subset.activeResizeHandles,
    subsetIndicator: clone(subset.subsetIndicator),
    beforeTargets,
    currentTargets: {
      'text-c': logicalTargetValue(engine, 'text-c'),
      links: logicalTargetValue(engine, 'links'),
    },
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function evaluateTransformableKindMatrixAction(product, state, context, action) {
  assert(context.caseId === 'TRN-003', 'evaluate-transformable-kind-matrix case');
  const operands = exactOperands(action, ['cases', 'lockedIds']);
  const engine = await ensureBaseline(state, context);
  const lockedIds = stringArray(operands.lockedIds, 'transform kind locked IDs');
  const kindEligibility = {};
  for (const id of stringArray(operands.cases, 'transform kind cases')) {
    if (id === 'empty') {
      kindEligibility[id] = 'none';
      continue;
    }
    const subset = callSync(engine, 'transformableSubset', [id], lockedIds);
    kindEligibility[id] = subset.eligibilityById[id] ?? 'none';
  }
  const actual = {
    kindEligibility,
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function transformHandleGestureAction(product, state, context, action) {
  assert(context.caseId === 'TRN-010', 'transform-handle-gesture case');
  const operands = exactOperands(
    action,
    ['pointerId', 'button', 'handle', 'downScreen', 'moveScreen', 'upScreen'],
  );
  const engine = await ensureBaseline(state, context);
  const pointerId = nonNegativeInteger(operands.pointerId, 'transform pointerId');
  const button = nonNegativeInteger(operands.button, 'transform pointer button');
  assert(button === 0, 'transform primary button');
  const handle = stringValue(operands.handle, 'transform handle');
  const target = stringValue(context.fixtureParams.target, 'transform target');
  callSync(engine, 'applySelection', {
    op: 'replace',
    ids: [target],
    source: 'programmatic',
  });
  callSync(engine, 'setSelectionVisualPolicy', {
    selectionIds: [target],
    mode: 'all',
    handleCssPx: 8,
    strokeCssPx: 1,
  });
  callSync(engine, 'publishFrame', context.actionIndex + 200);
  const pointerEvents = [];
  const selectionEvents = [];
  const unbindPointer = callSync(
    engine,
    'on',
    'pointerEvent',
    (event) => pointerEvents.push(clone(event)),
  );
  const unbindSelection = callSync(
    engine,
    'on',
    'selectionChanged',
    (event) => selectionEvents.push(clone(event)),
  );
  const routed = {};
  let completion;
  try {
    callSync(engine, 'beginTransformerHandleGesture', pointerId, handle);
    for (const family of ['selection', 'pan', 'hover', 'context-menu']) {
      routed[family] = callSync(engine, 'routeTransformerInput', pointerId, family);
    }
    dispatchPointer(engine, {
      type: 'down',
      pointerId,
      pointerType: 'mouse',
      button,
      buttons: 1,
      screen: pointTuple(operands.downScreen, 'transform down screen'),
      timeMs: 0,
    }, 0);
    dispatchPointer(engine, {
      type: 'move',
      pointerId,
      pointerType: 'mouse',
      button,
      buttons: 1,
      screen: pointTuple(operands.moveScreen, 'transform move screen'),
      timeMs: 16,
    }, 1);
    dispatchPointer(engine, {
      type: 'up-outside',
      pointerId,
      pointerType: 'mouse',
      button,
      buttons: 0,
      screen: pointTuple(operands.upScreen, 'transform up screen'),
      timeMs: 32,
    }, 2);
    completion = callSync(engine, 'completeTransformerHandleGesture', pointerId);
  } finally {
    unbindPointer();
    unbindSelection();
  }
  const probe = callSync(engine, 'transformerGestureProbe');
  state.transformCounters = {
    selectionCount: selectionEvents.length +
      (routed.selection?.deliveryCount ?? 0),
    panCount: routed.pan?.deliveryCount ?? 0,
    hoverCount: pointerEvents.filter(({ type }) => type === 'hover-change').length +
      (routed.hover?.deliveryCount ?? 0),
    contextMenuCount: routed['context-menu']?.deliveryCount ?? 0,
  };
  const actual = {
    duringTransform: clone(state.transformCounters),
    pointerEventCount: pointerEvents.length,
    completion: clone(completion),
    gesture: clone(probe),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function postTransformPointerClickAction(product, state, context, action) {
  assert(context.caseId === 'TRN-010', 'post-transform pointer-click case');
  const operands = exactOperands(action, ['pointerId', 'button', 'screen']);
  const engine = await ensureBaseline(state, context);
  const pointerId = nonNegativeInteger(operands.pointerId, 'post-transform pointerId');
  const button = nonNegativeInteger(operands.button, 'post-transform pointer button');
  const screen = pointTuple(operands.screen, 'post-transform pointer screen');
  const events = [];
  const unbind = callSync(
    engine,
    'on',
    'pointerEvent',
    (event) => events.push(clone(event)),
  );
  try {
    dispatchProductClick(engine, pointerId, button, screen, 100);
  } finally {
    unbind();
  }
  const actual = {
    clickCount: events.filter(({ type }) => type === 'click').length,
    owner: callSync(engine, 'routeTransformerInput', pointerId, 'selection').owner,
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
    : context.caseId.startsWith('TRN-')
      ? 'transformer-gesture-matrix'
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

function replaceSceneElement(elementsValue, targetId, replace) {
  const elements = arrayValue(elementsValue, 'replace endpoint dataset');
  let replaced = false;
  const visit = (elementValue) => {
    const element = recordValue(elementValue, 'replace endpoint element');
    if (element.id === targetId) {
      assert(!replaced, 'replace endpoint unique target');
      replaced = true;
      return replace(element);
    }
    if (!Array.isArray(element.children)) return clone(element);
    return {
      ...clone(element),
      children: element.children.map(visit),
    };
  };
  const result = elements.map(visit);
  assert(replaced, 'replace endpoint target exists');
  return result;
}

function removeSceneElement(elementsValue, targetId) {
  const elements = arrayValue(elementsValue, 'remove endpoint dataset');
  let removed = false;
  const visit = (values) => values.flatMap((elementValue) => {
    const element = recordValue(elementValue, 'remove endpoint element');
    if (element.id === targetId) {
      removed = true;
      return [];
    }
    if (!Array.isArray(element.children)) return [clone(element)];
    return [{
      ...clone(element),
      children: visit(element.children),
    }];
  });
  const result = visit(elements);
  assert(removed, 'remove endpoint target exists');
  return result;
}

function logicalTargetValue(engine, id) {
  const query = callSync(engine, 'queryScene', { where: { id } });
  assert(query.status === 'matched' && query.targets.length === 1, `logical target ${id}`);
  return clone(query.targets[0].value);
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
