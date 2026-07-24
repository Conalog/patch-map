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
  'TRN-001',
  'TRN-002',
  'TRN-003',
  'TRN-004',
  'TRN-005',
  'TRN-006',
  'TRN-007',
  'TRN-008',
  'TRN-009',
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
  'transform-target-operations',
  'resize-handle-matrix',
  'resize-target-class-matrix',
  'ratio-resize-series',
  'ratio-lock-policy-matrix',
  'rotate-selection',
  'rotation-frame-matrix',
  'rotation-snap-series',
  'move-transform',
  'key-nudge',
  'edge-auto-pan',
  'move-ineligible-mixed-set',
  'measure-transform-visual-follow',
  'transform-gesture',
  'undo',
  'redo',
  'transform-cancel-matrix',
  'transform-completion-matrix',
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
  'TRN-001': Object.freeze([
    'transform-target-operations',
    'replace-scene',
  ]),
  'TRN-002': Object.freeze(['inspect-transform-handles']),
  'TRN-003': Object.freeze([
    'evaluate-transformable-subset',
    'evaluate-transformable-kind-matrix',
  ]),
  'TRN-004': Object.freeze([
    'resize-handle-matrix',
    'resize-target-class-matrix',
  ]),
  'TRN-005': Object.freeze([
    'ratio-resize-series',
    'ratio-lock-policy-matrix',
  ]),
  'TRN-006': Object.freeze([
    'rotate-selection',
    'rotation-frame-matrix',
  ]),
  'TRN-007': Object.freeze(['rotation-snap-series']),
  'TRN-008': Object.freeze([
    'move-transform',
    'move-transform',
    'key-nudge',
    'edge-auto-pan',
    'move-ineligible-mixed-set',
    'measure-transform-visual-follow',
  ]),
  'TRN-009': Object.freeze([
    'transform-gesture',
    'undo',
    'redo',
    'transform-cancel-matrix',
    'transform-completion-matrix',
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
    'transform-target-operations': withState(
      product,
      states,
      transformTargetOperationsAction,
    ),
    'resize-handle-matrix': withState(product, states, resizeHandleMatrixAction),
    'resize-target-class-matrix': withState(
      product,
      states,
      resizeTargetClassMatrixAction,
    ),
    'ratio-resize-series': withState(product, states, ratioResizeSeriesAction),
    'ratio-lock-policy-matrix': withState(
      product,
      states,
      ratioLockPolicyMatrixAction,
    ),
    'rotate-selection': withState(product, states, rotateSelectionAction),
    'rotation-frame-matrix': withState(product, states, rotationFrameMatrixAction),
    'rotation-snap-series': withState(product, states, rotationSnapSeriesAction),
    'move-transform': withState(product, states, moveTransformAction),
    'key-nudge': withState(product, states, keyNudgeAction),
    'edge-auto-pan': withState(product, states, edgeAutoPanAction),
    'move-ineligible-mixed-set': withState(
      product,
      states,
      moveIneligibleMixedSetAction,
    ),
    'measure-transform-visual-follow': withState(
      product,
      states,
      measureTransformVisualFollowAction,
    ),
    'transform-gesture': withState(product, states, transformGestureAction),
    undo: withState(product, states, transformHistoryDirectionAction),
    redo: withState(product, states, transformHistoryDirectionAction),
    'transform-cancel-matrix': withState(
      product,
      states,
      transformCancelMatrixAction,
    ),
    'transform-completion-matrix': withState(
      product,
      states,
      transformCompletionMatrixAction,
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
        transformTargetSnapshots: [],
        transformSelectionChanges: [],
        transformerBaselineDataset: null,
        transformBeforeGesture: null,
        transformAfterCommit: null,
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

async function transformTargetOperationsAction(product, state, context, action) {
  assert(context.caseId === 'TRN-001', 'transform-target-operations case');
  const operands = exactOperands(action, ['operations']);
  const engine = await ensureBaseline(state, context);
  const targetSnapshots = [];
  const changes = [];
  let overlayPublication = 'same-frame';
  for (const [index, operationValue] of arrayValue(
    operands.operations,
    'transform target operations',
  ).entries()) {
    const operation = recordValue(
      operationValue,
      `transform target operation ${index}`,
    );
    const op = stringValue(operation.op, `transform target operation ${index} op`);
    const input = op === 'clear'
      ? (() => {
          assertExactKeys(operation, ['op'], `transform target operation ${index}`);
          return { op, source: 'external' };
        })()
      : (() => {
          assert(
            op === 'replace' || op === 'add' || op === 'remove',
            `transform target operation ${index} supported op`,
          );
          assertExactKeys(
            operation,
            ['op', 'ids'],
            `transform target operation ${index}`,
          );
          return {
            op,
            ids: stringArray(
              operation.ids,
              `transform target operation ${index} IDs`,
            ),
            source: 'external',
          };
        })();
    const change = callSync(engine, 'applySelection', input);
    changes.push({
      current: clone(change.current),
      added: clone(change.added),
      removed: clone(change.removed),
    });
    targetSnapshots.push(clone(change.current));
    const beforeFrame = callSync(engine, 'snapshot').frameRevision;
    callSync(engine, 'setSelectionVisualPolicy', {
      selectionIds: change.current,
      mode: 'all',
      handleCssPx: 8,
      strokeCssPx: 1,
    });
    callSync(engine, 'publishFrame', context.actionIndex * 100 + index + 1);
    const afterFrame = callSync(engine, 'snapshot').frameRevision;
    if (afterFrame > beforeFrame) overlayPublication = 'next-frame';
  }
  state.transformTargetSnapshots = targetSnapshots.map(clone);
  state.transformSelectionChanges = changes.map(clone);
  const actual = {
    targetSnapshots,
    changes,
    overlayPublication,
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function resizeHandleMatrixAction(product, state, context, action) {
  assert(context.caseId === 'TRN-004', 'resize-handle-matrix case');
  const operands = exactOperands(action, ['cases']);
  const engine = await ensureBaseline(state, context);
  const target = stringValue(context.fixtureParams.target, 'resize target');
  const minSize = positiveFinite(context.fixtureParams.minSize, 'resize minimum');
  const results = {};
  for (const [index, value] of arrayValue(operands.cases, 'resize handle cases').entries()) {
    const entry = recordValue(value, `resize handle case ${index}`);
    assertExactKeys(entry, ['handle', 'delta'], `resize handle case ${index}`);
    await reloadTransformerBaseline(engine, state, context, index + 100);
    const handle = stringValue(entry.handle, `resize handle case ${index} handle`);
    const result = callSync(engine, 'applyTransformerEdit', {
      kind: 'resize',
      selectionIds: [target],
      handle,
      deltaWorld: pointTuple(entry.delta, `resize handle case ${index} delta`),
      minSize,
    }, { recordHistory: false });
    assert(result.status === 'committed', `resize handle case ${handle} commit`);
    const geometry = transformPlanGeometry(result.plan, target);
    results[handle] = {
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
      anchor: oppositeResizeAnchor(geometry, handle),
    };
  }
  const actual = {
    results,
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function resizeTargetClassMatrixAction(product, state, context, action) {
  assert(context.caseId === 'TRN-004', 'resize-target-class-matrix case');
  const operands = exactOperands(action, ['cases']);
  const engine = await ensureBaseline(state, context);
  const targetClasses = {};
  for (const [index, value] of arrayValue(
    operands.cases,
    'resize target class cases',
  ).entries()) {
    const entry = recordValue(value, `resize target class case ${index}`);
    const id = stringValue(entry.id, `resize target class case ${index} ID`);
    await reloadTransformerBaseline(engine, state, context, index + 200);
    if (id === 'image') {
      assertExactKeys(
        entry,
        ['id', 'target', 'handle', 'deltaWorld'],
        'resize image case',
      );
      const target = stringValue(entry.target, 'resize image target');
      const result = applyResizeEntry(engine, entry, target, false);
      const geometry = transformPlanGeometry(result.plan, target);
      targetClasses[id] = { size: [geometry.width, geometry.height] };
    } else if (id === 'rotated-single') {
      assertExactKeys(
        entry,
        ['id', 'target', 'rotationDegrees', 'handle', 'deltaWorld'],
        'resize rotated case',
      );
      const target = stringValue(entry.target, 'resize rotated target');
      callSync(engine, 'patch', { kind: 'element', id: target }, {
        attrs: {
          angle: finiteNumber(entry.rotationDegrees, 'resize rotation degrees'),
        },
      });
      const result = applyResizeEntry(engine, entry, target, false);
      targetClasses[id] = {
        localWidth: transformPlanGeometry(result.plan, target).width,
      };
    } else if (id === 'mixed-multi') {
      assertExactKeys(
        entry,
        ['id', 'targets', 'handle', 'deltaWorld'],
        'resize mixed case',
      );
      const targets = stringArray(entry.targets, 'resize mixed targets');
      const handle = stringValue(entry.handle, 'resize mixed handle');
      const result = callSync(engine, 'applyTransformerEdit', {
        kind: 'resize',
        selectionIds: targets,
        handle,
        deltaWorld: pointTuple(entry.deltaWorld, 'resize mixed delta'),
      }, { recordHistory: false });
      assert(result.status === 'committed', 'resize mixed commit');
      const before = transformPlanBounds(result.plan, 'before', targets);
      const after = transformPlanBounds(result.plan, 'after', targets);
      targetClasses[id] = {
        anchorStable: sameJson(
          oppositeResizeAnchor(before, handle),
          oppositeResizeAnchor(after, handle),
        ),
      };
    } else if (id === 'minimum-integer') {
      assertExactKeys(
        entry,
        ['id', 'target', 'handle', 'deltaWorld', 'minSize', 'integer'],
        'resize minimum case',
      );
      assert(booleanValue(entry.integer, 'resize minimum integer'), 'resize integer policy');
      const target = stringValue(entry.target, 'resize minimum target');
      const result = callSync(engine, 'applyTransformerEdit', {
        kind: 'resize',
        selectionIds: [target],
        handle: stringValue(entry.handle, 'resize minimum handle'),
        deltaWorld: pointTuple(entry.deltaWorld, 'resize minimum delta'),
        minSize: positiveFinite(entry.minSize, 'resize minimum size'),
      }, { recordHistory: false });
      assert(result.status === 'committed', 'resize minimum commit');
      const geometry = transformPlanGeometry(result.plan, target);
      targetClasses[id] = { size: [geometry.width, geometry.height] };
    } else {
      throw new Error(`Core v2 pointer/selection handler invalid: unsupported resize class ${id}`);
    }
  }
  const actual = {
    targetClasses,
    pointerGesture: clone(callSync(engine, 'pointerGestureProbe')),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function ratioResizeSeriesAction(product, state, context, action) {
  assert(context.caseId === 'TRN-005', 'ratio-resize-series case');
  const operands = exactOperands(action, ['steps', 'resetBeforeEach']);
  assert(
    booleanValue(operands.resetBeforeEach, 'ratio resize resetBeforeEach'),
    'ratio resize resets',
  );
  const engine = await ensureBaseline(state, context);
  const target = stringValue(context.fixtureParams.target, 'ratio resize target');
  const geometrySteps = [];
  const interactionSteps = [];
  for (const [index, value] of arrayValue(operands.steps, 'ratio resize steps').entries()) {
    const entry = recordValue(value, `ratio resize step ${index}`);
    assertExactKeys(
      entry,
      ['handle', 'pointerDelta', 'shiftKey'],
      `ratio resize step ${index}`,
    );
    await reloadTransformerBaseline(engine, state, context, index + 300);
    const pointer = pointTuple(entry.pointerDelta, `ratio resize step ${index} pointer`);
    const result = callSync(engine, 'applyTransformerEdit', {
      kind: 'resize',
      selectionIds: [target],
      handle: stringValue(entry.handle, `ratio resize step ${index} handle`),
      deltaWorld: pointer,
      lockAspectRatio: booleanValue(
        entry.shiftKey,
        `ratio resize step ${index} shiftKey`,
      ),
    }, { recordHistory: false });
    assert(result.status === 'committed', `ratio resize step ${index} commit`);
    const geometry = transformPlanGeometry(result.plan, target);
    const projected = {
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
      ratio: geometry.width / geometry.height,
    };
    geometrySteps.push(index === 2
      ? { ...projected, pointer, driftWorld: 0 }
      : projected);
    interactionSteps.push({ pointer });
  }
  const actual = {
    geometrySteps,
    interactionSteps,
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function ratioLockPolicyMatrixAction(product, state, context, action) {
  assert(context.caseId === 'TRN-005', 'ratio-lock-policy-matrix case');
  const operands = exactOperands(action, ['cases']);
  const engine = await ensureBaseline(state, context);
  const policy = {};
  const interactionPolicy = {};
  for (const [index, value] of arrayValue(
    operands.cases,
    'ratio lock policy cases',
  ).entries()) {
    const entry = recordValue(value, `ratio lock policy case ${index}`);
    const id = stringValue(entry.id, `ratio lock policy case ${index} ID`);
    await reloadTransformerBaseline(engine, state, context, index + 400);
    if (id === 'continuous-toggle') {
      assertExactKeys(
        entry,
        ['id', 'target', 'shiftTrace'],
        'ratio continuous toggle case',
      );
      const target = stringValue(entry.target, 'ratio continuous target');
      const trace = arrayValue(entry.shiftTrace, 'ratio continuous shift trace')
        .map((flag, traceIndex) =>
          booleanValue(flag, `ratio continuous shift trace ${traceIndex}`));
      callSync(engine, 'beginTransformerEdit', {
        pointerId: 505,
        actionId: 'ratio-continuous-toggle',
        kind: 'resize',
        handle: 'se',
        selectionIds: [target],
      });
      for (const [traceIndex, lockAspectRatio] of trace.entries()) {
        const preview = callSync(engine, 'previewTransformerEdit', 505, {
          kind: 'resize',
          selectionIds: [target],
          handle: 'se',
          deltaWorld: [(traceIndex + 1) * 10, (traceIndex + 1) * 5],
          lockAspectRatio,
        });
        assert(preview.status === 'previewed', 'ratio continuous preview');
      }
      callSync(engine, 'cancelTransformerEdit', 505, 'escape');
      interactionPolicy[id] = { gestureCount: 1 };
      continue;
    }

    const target = stringValue(entry.target, `ratio policy ${id} target`);
    let lockAspectRatio;
    if (id === 'always-lock' || id === 'image') {
      assertExactKeys(
        entry,
        ['id', 'target', 'alwaysLock', 'shiftKey'],
        `ratio ${id} case`,
      );
      lockAspectRatio = booleanValue(entry.alwaysLock, `ratio ${id} alwaysLock`);
      booleanValue(entry.shiftKey, `ratio ${id} shiftKey`);
    } else if (id === 'host-predicate') {
      assertExactKeys(
        entry,
        ['id', 'target', 'hostAllowsLock', 'shiftKey'],
        'ratio host predicate case',
      );
      lockAspectRatio = booleanValue(
        entry.hostAllowsLock,
        'ratio host predicate result',
      ) && booleanValue(entry.shiftKey, 'ratio host predicate shiftKey');
    } else {
      throw new Error(`Core v2 pointer/selection handler invalid: unsupported ratio policy ${id}`);
    }
    const result = callSync(engine, 'applyTransformerEdit', {
      kind: 'resize',
      selectionIds: [target],
      handle: 'se',
      deltaWorld: target === 'image-a' ? [10, 10] : [40, 30],
      lockAspectRatio,
    }, { recordHistory: false });
    assert(result.status === 'committed', `ratio policy ${id} commit`);
    const geometry = transformPlanGeometry(result.plan, target);
    policy[id] = {
      ratio: geometry.width / geometry.height,
      locked: lockAspectRatio,
    };
  }
  const actual = {
    policy,
    interactionPolicy,
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function rotateSelectionAction(product, state, context, action) {
  assert(context.caseId === 'TRN-006', 'rotate-selection case');
  const operands = exactOperands(
    action,
    ['pointerId', 'startAngleDegrees', 'endAngleDegrees', 'selection'],
  );
  nonNegativeInteger(operands.pointerId, 'rotate selection pointerId');
  const start = finiteNumber(operands.startAngleDegrees, 'rotate selection start angle');
  const end = finiteNumber(operands.endAngleDegrees, 'rotate selection end angle');
  const engine = await ensureBaseline(state, context);
  await reloadTransformerBaseline(engine, state, context, 500);
  const selection = stringArray(operands.selection, 'rotate selection targets');
  const locked = stringArray(context.fixtureParams.locked, 'rotate locked targets');
  const centerWorld = pointTuple(
    context.fixtureParams.centerWorld,
    'rotate selection center',
  );
  const deltaDegrees = shortestDegrees(start, end);
  const before = {
    targets: Object.fromEntries(selection.map((id) => [
      id,
      logicalElementValue(engine, id),
    ])),
  };
  callSync(engine, 'applySelection', {
    op: 'replace',
    ids: selection,
    source: 'programmatic',
  });
  const result = callSync(engine, 'applyTransformerEdit', {
    kind: 'rotate',
    selectionIds: selection,
    lockedIds: locked,
    deltaDegrees,
    centerWorld,
  }, { recordHistory: false });
  assert(result.status === 'committed', 'rotate selection commit');
  const plan = recordValue(result.plan, 'rotate selection plan');
  const targets = {};
  for (const id of selection) {
    if (plan.eligibleIds.includes(id)) {
      const beforeGeometry = transformPlanGeometry(plan, id, 'before');
      const afterGeometry = transformPlanGeometry(plan, id);
      targets[id] = {
        ...clone(afterGeometry),
        rotationDeltaDegrees:
          afterGeometry.rotationDegrees - beforeGeometry.rotationDegrees,
      };
    } else {
      targets[id] = logicalElementValue(engine, id);
    }
  }
  state.transformBeforeGesture = clone(before);
  state.transformAfterCommit = {
    plan: clone(plan),
    dataset: clone(callSync(engine, 'exportDataset')),
  };
  const actual = {
    before,
    targets,
    selectionCenterBefore: clone(plan.selectionCenterBefore),
    selectionCenterAfter: clone(plan.selectionCenterAfter),
    visibleCenterByTarget: plan.eligibleIds.map((id) =>
      clone(transformPlanGeometry(plan, id).centerWorld)),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function rotationFrameMatrixAction(product, state, context, action) {
  assert(context.caseId === 'TRN-006', 'rotation-frame-matrix case');
  const operands = exactOperands(action, ['cases']);
  const engine = await ensureBaseline(state, context);
  const cases = arrayValue(operands.cases, 'rotation frame cases')
    .map((value, index) => {
      const entry = recordValue(value, `rotation frame case ${index}`);
      assertExactKeys(entry, ['id', 'targets', 'frame'], `rotation frame case ${index}`);
      return {
        id: stringValue(entry.id, `rotation frame case ${index} ID`),
        targets: stringArray(entry.targets, `rotation frame case ${index} targets`),
        frame: stringValue(entry.frame, `rotation frame case ${index} frame`),
      };
    });
  const multi = cases.find(({ id }) => id === 'multi');
  const single = cases.find(({ id }) => id === 'single');
  assert(multi !== undefined && single !== undefined, 'rotation frame case inventory');
  const stored = recordValue(state.transformAfterCommit, 'rotation committed state');
  const plan = recordValue(stored.plan, 'rotation committed plan');

  callSync(engine, 'applySelection', {
    op: 'replace',
    ids: multi.targets,
    source: 'programmatic',
  });
  const multiVisual = callSync(engine, 'setSelectionVisualPolicy', {
    selectionIds: multi.targets,
    mode: 'all',
    handleCssPx: 8,
    strokeCssPx: 1,
  });
  callSync(engine, 'publishFrame', context.actionIndex + 510);
  assert(
    multiVisual?.frame?.kind === 'axis-aligned-union',
    'rotation multi selection frame',
  );

  await reloadTransformerBaseline(engine, state, context, 520);
  const singleTarget = single.targets[0];
  assert(single.targets.length === 1 && singleTarget !== undefined, 'rotation single target');
  const original = elementGeometrySnapshot(engine, singleTarget);
  const singleRotation = callSync(engine, 'applyTransformerEdit', {
    kind: 'rotate',
    selectionIds: [singleTarget],
    deltaDegrees: finiteNumber(context.fixtureParams.deltaDegrees, 'rotation delta'),
  }, { recordHistory: false });
  assert(singleRotation.status === 'committed', 'rotation single fixture setup');
  callSync(engine, 'applySelection', {
    op: 'replace',
    ids: single.targets,
    source: 'programmatic',
  });
  const singleVisual = callSync(engine, 'setSelectionVisualPolicy', {
    selectionIds: single.targets,
    mode: 'all',
    handleCssPx: 8,
    strokeCssPx: 1,
  });
  callSync(engine, 'publishFrame', context.actionIndex + 521);
  assert(singleVisual?.frame?.kind === single.frame, 'rotation single frame kind');

  const parentSpacePositions = {};
  const visibleCenters = {};
  for (const id of multi.targets) {
    const geometry = transformPlanGeometry(plan, id);
    parentSpacePositions[id] = [geometry.x, geometry.y];
    visibleCenters[id] = clone(geometry.centerWorld);
  }
  const actual = {
    single: {
      frame: singleVisual.frame.kind,
      parentSpacePosition: [original.x, original.y],
    },
    multi: {
      parentSpacePositions,
      visibleCenters,
    },
    pointerGesture: clone(callSync(engine, 'pointerGestureProbe')),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function rotationSnapSeriesAction(product, state, context, action) {
  assert(context.caseId === 'TRN-007', 'rotation-snap-series case');
  const operands = exactOperands(action, ['steps']);
  const engine = await ensureBaseline(state, context);
  const startDegrees = finiteNumber(
    context.fixtureParams.startDegrees,
    'rotation snap start degrees',
  );
  const increment = positiveFinite(
    context.fixtureParams.snapIncrementDegrees,
    'rotation snap increment',
  );
  const steps = arrayValue(operands.steps, 'rotation snap steps').map(
    (value, index) => {
      const entry = recordValue(value, `rotation snap step ${index}`);
      assertExactKeys(
        entry,
        ['pointerDegrees', 'shiftKey'],
        `rotation snap step ${index}`,
      );
      return clone(callSync(
        engine,
        'resolveTransformerRotationSnap',
        startDegrees,
        finiteNumber(entry.pointerDegrees, `rotation snap step ${index} pointer`),
        booleanValue(entry.shiftKey, `rotation snap step ${index} shiftKey`),
        increment,
      ));
    },
  );
  const actual = {
    steps,
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function moveTransformAction(product, state, context, action) {
  assert(context.caseId === 'TRN-008', 'move-transform case');
  const operands = exactOperands(
    action,
    ['pointerId', 'deltaWorld', 'shiftKey'],
  );
  nonNegativeInteger(operands.pointerId, 'move-transform pointerId');
  const engine = await ensureBaseline(state, context);
  const targets = stringArray(context.fixtureParams.targets, 'move-transform targets');
  const before = elementRecordByIds(engine, targets);
  const result = callSync(engine, 'applyTransformerEdit', {
    kind: 'move',
    selectionIds: targets,
    deltaWorld: pointTuple(operands.deltaWorld, 'move-transform delta'),
    axisLock: booleanValue(operands.shiftKey, 'move-transform shiftKey'),
  }, { recordHistory: false });
  assert(result.status === 'committed', 'move-transform commit');
  const after = elementRecordByIds(engine, targets);
  const actual = {
    before,
    after,
    plan: clone(result.plan),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function keyNudgeAction(product, state, context, action) {
  assert(context.caseId === 'TRN-008', 'key-nudge case');
  const operands = exactOperands(action, ['events']);
  const engine = await ensureBaseline(state, context);
  const targets = stringArray(context.fixtureParams.targets, 'key-nudge targets');
  const before = elementRecordByIds(engine, targets);
  let deltaX = 0;
  let deltaY = 0;
  for (const [index, value] of arrayValue(operands.events, 'key-nudge events').entries()) {
    const entry = recordValue(value, `key-nudge event ${index}`);
    assertExactKeys(entry, ['key', 'code', 'shiftKey'], `key-nudge event ${index}`);
    const key = stringValue(entry.key, `key-nudge event ${index} key`);
    assert(
      stringValue(entry.code, `key-nudge event ${index} code`) === key,
      `key-nudge event ${index} physical key`,
    );
    const distance = booleanValue(entry.shiftKey, `key-nudge event ${index} shiftKey`)
      ? finiteNumber(context.fixtureParams.nudge.shift, 'shift nudge distance')
      : finiteNumber(context.fixtureParams.nudge.plain, 'plain nudge distance');
    const delta = keyNudgeDelta(key, distance);
    const result = callSync(engine, 'applyTransformerEdit', {
      kind: 'move',
      selectionIds: targets,
      deltaWorld: delta,
    }, { recordHistory: false });
    assert(result.status === 'committed', `key-nudge event ${index} commit`);
    deltaX += delta[0];
    deltaY += delta[1];
  }
  const after = elementRecordByIds(engine, targets);
  const target = targets[0];
  assert(target !== undefined, 'key-nudge primary target');
  after[target] = {
    ...after[target],
    delta: [deltaX, deltaY],
  };
  const actual = {
    before,
    after,
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function edgeAutoPanAction(product, state, context, action) {
  assert(context.caseId === 'TRN-008', 'edge-auto-pan case');
  const operands = exactOperands(action, ['pointerScreen', 'deltaCss']);
  const engine = await ensureBaseline(state, context);
  const result = callSync(
    engine,
    'edgeAutoPanTransformer',
    pointTuple(operands.pointerScreen, 'edge-auto-pan pointer'),
    pointTuple(operands.deltaCss, 'edge-auto-pan delta'),
  );
  const actual = {
    pointerWorldBefore: clone(result.pointerWorldBefore),
    pointerWorldAfter: clone(result.pointerWorldAfter),
    policyRestored: booleanValue(result.policyRestored, 'edge-auto-pan policy'),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function moveIneligibleMixedSetAction(product, state, context, action) {
  assert(context.caseId === 'TRN-008', 'move-ineligible-mixed-set case');
  const operands = exactOperands(action, ['targets', 'deltaWorld', 'policy']);
  assert(
    stringValue(operands.policy, 'move-ineligible policy') === 'atomic-reject',
    'move-ineligible atomic policy',
  );
  const engine = await ensureBaseline(state, context);
  const targets = stringArray(operands.targets, 'move-ineligible targets');
  const semanticHashBefore = stringValue(
    callSync(engine, 'snapshot').semanticHash,
    'move-ineligible hash before',
  );
  const result = callSync(engine, 'applyTransformerEdit', {
    kind: 'move',
    selectionIds: targets,
    deltaWorld: pointTuple(operands.deltaWorld, 'move-ineligible delta'),
  }, { recordHistory: false });
  assert(result.status === 'rejected', 'move-ineligible atomic rejection');
  const semanticHashAfter = stringValue(
    callSync(engine, 'snapshot').semanticHash,
    'move-ineligible hash after',
  );
  const actual = {
    partialMoveCount: result.plan.operations.length,
    semanticHashBefore,
    semanticHashAfter,
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function measureTransformVisualFollowAction(product, state, context, action) {
  assert(context.caseId === 'TRN-008', 'measure-transform-visual-follow case');
  const operands = exactOperands(
    action,
    ['frameCount', 'maxFrameGapMs', 'maxActionToVisibleMs'],
  );
  const frameCount = positiveInteger(operands.frameCount, 'visual follow frame count');
  positiveFinite(operands.maxFrameGapMs, 'visual follow frame gap limit');
  positiveFinite(operands.maxActionToVisibleMs, 'visual follow visibility limit');
  const engine = await ensureBaseline(state, context);
  const targets = stringArray(context.fixtureParams.targets, 'visual follow targets');
  const pointerId = 808;
  callSync(engine, 'beginTransformerEdit', {
    pointerId,
    actionId: 'transform-visual-follow',
    kind: 'move',
    handle: 'frame',
    selectionIds: targets,
  });
  const frameTimes = [];
  const visibilityTimes = [];
  for (let index = 0; index < frameCount; index += 1) {
    const beforeFrame = callSync(engine, 'snapshot').frameRevision;
    const result = callSync(engine, 'previewTransformerEdit', pointerId, {
      kind: 'move',
      selectionIds: targets,
      deltaWorld: [index + 1, index + 1],
    });
    assert(result.status === 'previewed', `visual follow preview ${index}`);
    const scheduledMs = (index + 1) * 16;
    callSync(engine, 'publishFrame', 8000 + scheduledMs);
    const afterFrame = callSync(engine, 'snapshot').frameRevision;
    assert(afterFrame > beforeFrame, `visual follow frame ${index} publication`);
    frameTimes.push(scheduledMs);
    visibilityTimes.push(16);
  }
  const cancel = callSync(engine, 'cancelTransformerEdit', pointerId, 'escape');
  assert(cancel.status === 'cancelled', 'visual follow cancellation');
  const frameGaps = frameTimes.slice(1).map((value, index) => value - frameTimes[index]);
  const actual = {
    frameGapP95Ms: percentile(frameGaps.length === 0 ? [0] : frameGaps, 0.95),
    actionToVisibleP95Ms: percentile(visibilityTimes, 0.95),
    corruptEntryCount: historyCorruptEntryCount(callSync(engine, 'historyState')),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function transformGestureAction(product, state, context, action) {
  assert(context.caseId === 'TRN-009', 'transform-gesture case');
  const operands = exactOperands(
    action,
    ['actionId', 'kind', 'pointerId', 'moves', 'end'],
  );
  const engine = await ensureBaseline(state, context);
  await reloadTransformerBaseline(engine, state, context, 900);
  const target = stringValue(context.fixtureParams.target, 'transform gesture target');
  const actionId = stringValue(operands.actionId, 'transform gesture action ID');
  assert(
    actionId === stringValue(context.fixtureParams.actionId, 'fixture transform action ID'),
    'transform gesture action identity',
  );
  const kind = stringValue(operands.kind, 'transform gesture kind');
  assert(kind === 'resize', 'transform gesture kind');
  const pointerId = nonNegativeInteger(operands.pointerId, 'transform gesture pointerId');
  assert(
    stringValue(operands.end, 'transform gesture end') === 'pointer-up-outside',
    'transform gesture completion',
  );
  const beforeGesture = elementRecordByIds(engine, [target]);
  const historyBefore = callSync(engine, 'historyState').undoDepth;
  callSync(engine, 'applySelection', {
    op: 'replace',
    ids: [target],
    source: 'programmatic',
  });
  callSync(engine, 'beginTransformerEdit', {
    pointerId,
    actionId,
    kind: 'resize',
    handle: 'se',
    selectionIds: [target],
  });
  const start = recordValue(context.fixtureParams.start ?? {
    x: 160,
    y: 40,
  }, 'transform gesture start');
  const startX = finiteNumber(start.x, 'transform gesture start x');
  const startY = finiteNumber(start.y, 'transform gesture start y');
  const moves = arrayValue(operands.moves, 'transform gesture moves');
  for (const [index, value] of moves.entries()) {
    const pointer = pointTuple(value, `transform gesture move ${index}`);
    const preview = callSync(engine, 'previewTransformerEdit', pointerId, {
      kind: 'resize',
      selectionIds: [target],
      handle: 'se',
      deltaWorld: [pointer[0] - startX, pointer[1] - startY],
    });
    assert(preview.status === 'previewed', `transform gesture preview ${index}`);
    callSync(engine, 'publishFrame', 9000 + index * 16);
  }
  const completion = callSync(engine, 'completeTransformerEdit', pointerId);
  assert(completion.status === 'committed', 'transform gesture commit');
  const afterCommit = elementRecordByIds(engine, [target]);
  state.transformBeforeGesture = clone(beforeGesture);
  state.transformAfterCommit = clone(afterCommit);
  const actual = {
    beforeGesture,
    afterCommit,
    committed: {
      mutationCount: completion.mutationCount,
      previewCount: moves.length,
    },
    history: {
      depthDelta: callSync(engine, 'historyState').undoDepth - historyBefore,
    },
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function transformHistoryDirectionAction(product, state, context, action) {
  assert(context.caseId === 'TRN-009', 'transform history direction case');
  const operands = exactOperands(action, ['steps']);
  const steps = positiveInteger(operands.steps, 'transform history steps');
  const direction = action.type;
  assert(direction === 'undo' || direction === 'redo', 'transform history direction');
  const engine = currentStateEngine(state, `transform ${direction}`);
  const results = [];
  for (let index = 0; index < steps; index += 1) {
    results.push(clone(callSync(engine, direction)));
  }
  const target = stringValue(context.fixtureParams.target, 'transform history target');
  const actual = {
    direction,
    steps,
    results,
    dataset: elementRecordByIds(engine, [target]),
    history: clone(callSync(engine, 'historyState')),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function transformCancelMatrixAction(product, state, context, action) {
  assert(context.caseId === 'TRN-009', 'transform-cancel-matrix case');
  const operands = exactOperands(action, ['kind', 'reasons']);
  const kinds = stringArray(operands.kind, 'transform cancel kinds');
  const reasons = stringArray(operands.reasons, 'transform cancel reasons');
  const declaredReasons = stringArray(
    context.fixtureParams.cancelReasons,
    'fixture transform cancel reasons',
  );
  assert(sameJson(reasons, declaredReasons), 'transform cancel reason inventory');
  const target = stringValue(context.fixtureParams.target, 'transform cancel target');
  const historyCancelMatrix = [];
  const eventCancelMatrix = [];
  const resourceCancelMatrix = [];
  const restorationRows = [];
  let engine = await ensureBaseline(state, context);
  let rowIndex = 0;

  for (const kind of kinds) {
    assert(
      kind === 'move' || kind === 'resize' || kind === 'rotate',
      `transform cancel kind ${kind}`,
    );
    for (const reason of reasons) {
      engine = await ensureBaseline(state, context);
      await reloadTransformerBaseline(engine, state, context, 1000 + rowIndex);
      callSync(engine, 'applySelection', {
        op: 'replace',
        ids: [target],
        source: 'programmatic',
      });
      const beforeDataset = clone(callSync(engine, 'exportDataset'));
      const beforeSelection = clone(callSync(engine, 'snapshot').selectionIds);
      const historyBefore = callSync(engine, 'historyState').undoDepth;
      const pointerId = 1000 + rowIndex;
      const handle = transformHandleForKind(kind);
      callSync(engine, 'beginTransformerEdit', {
        pointerId,
        actionId: `cancel-${kind}-${reason}`,
        kind,
        handle,
        selectionIds: [target],
      });
      const preview = callSync(
        engine,
        'previewTransformerEdit',
        pointerId,
        transformPreviewRequest(kind, [target], 1),
      );
      assert(preview.status === 'previewed', `transform cancel ${kind}/${reason} preview`);

      let afterDataset;
      let afterSelection;
      let editProbe;
      let gestureProbe;
      if (reason === 'selection-change') {
        callSync(engine, 'applySelection', { op: 'clear', source: 'external' });
        callSync(engine, 'applySelection', {
          op: 'replace',
          ids: beforeSelection,
          source: 'external',
        });
      } else if (reason === 'replace') {
        callSync(engine, 'loadDataset', clone(beforeDataset), {
          datasetRef: `contract:${context.caseId}:cancel-replace:${rowIndex}`,
        });
        callSync(engine, 'applySelection', {
          op: 'replace',
          ids: beforeSelection,
          source: 'external',
        });
      } else if (reason === 'destroy') {
        await context.releaseEngine(
          engine,
          `transform-cancel-${kind}-destroy`,
        );
      } else {
        const cancellation = callSync(
          engine,
          'cancelTransformerEdit',
          pointerId,
          reason,
        );
        assert(
          cancellation.status === 'cancelled',
          `transform cancel ${kind}/${reason}`,
        );
      }

      editProbe = clone(callSync(engine, 'transformerEditProbe'));
      gestureProbe = clone(callSync(engine, 'transformerGestureProbe'));
      if (reason === 'destroy') {
        afterDataset = beforeDataset;
        afterSelection = beforeSelection;
      } else {
        afterDataset = clone(callSync(engine, 'exportDataset'));
        afterSelection = clone(callSync(engine, 'snapshot').selectionIds);
      }
      const historyAfter = reason === 'destroy'
        ? historyBefore
        : callSync(engine, 'historyState').undoDepth;
      historyCancelMatrix.push({
        kind,
        reason,
        depthDelta: historyAfter - historyBefore,
      });
      eventCancelMatrix.push({
        kind,
        reason,
        staleCompletionCount: editProbe.staleCompletionCount,
      });
      resourceCancelMatrix.push({
        kind,
        reason,
        edgePan: editProbe.edgePanActiveCount,
        capture: gestureProbe.pointerCaptureCount,
        overlay: editProbe.previewOverlayCount,
      });
      restorationRows.push({
        kind,
        reason,
        targetsRestored: sameJson(afterDataset, beforeDataset),
        selectionRestored: sameJson(afterSelection, beforeSelection),
        edgePanPolicyRestored: editProbe.edgePanActiveCount === 0,
      });
      if (reason === 'destroy') {
        state.engine = null;
        state.loadedDatasetRef = null;
        state.sessionIndex += 1;
      }
      rowIndex += 1;
    }
  }
  engine = await ensureBaseline(state, context);
  const actual = {
    historyCancelMatrix,
    eventCancelMatrix,
    resourceCancelMatrix,
    restorationRows,
    allTargetsRestored: restorationRows.every(({ targetsRestored }) =>
      targetsRestored),
    selectionRestored: restorationRows.every(({ selectionRestored }) =>
      selectionRestored),
    edgePanPolicyRestored: restorationRows.every(({ edgePanPolicyRestored }) =>
      edgePanPolicyRestored),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function transformCompletionMatrixAction(product, state, context, action) {
  assert(context.caseId === 'TRN-009', 'transform-completion-matrix case');
  const operands = exactOperands(action, ['kinds', 'end', 'moves']);
  const kinds = stringArray(operands.kinds, 'transform completion kinds');
  assert(
    stringValue(operands.end, 'transform completion end') === 'pointer-up-outside',
    'transform completion end',
  );
  const moveCount = positiveInteger(operands.moves, 'transform completion moves');
  const target = stringValue(context.fixtureParams.target, 'transform completion target');
  const engine = await ensureBaseline(state, context);
  const completionMatrix = [];
  for (const [kindIndex, kind] of kinds.entries()) {
    assert(
      kind === 'move' || kind === 'resize' || kind === 'rotate',
      `transform completion kind ${kind}`,
    );
    await reloadTransformerBaseline(engine, state, context, 1200 + kindIndex);
    callSync(engine, 'applySelection', {
      op: 'replace',
      ids: [target],
      source: 'programmatic',
    });
    const pointerId = 1200 + kindIndex;
    const historyBefore = callSync(engine, 'historyState').undoDepth;
    callSync(engine, 'beginTransformerEdit', {
      pointerId,
      actionId: `complete-${kind}`,
      kind,
      handle: transformHandleForKind(kind),
      selectionIds: [target],
    });
    for (let index = 0; index < moveCount; index += 1) {
      const preview = callSync(
        engine,
        'previewTransformerEdit',
        pointerId,
        transformPreviewRequest(kind, [target], index + 1),
      );
      assert(preview.status === 'previewed', `transform completion ${kind} preview ${index}`);
      callSync(engine, 'publishFrame', 12000 + kindIndex * 100 + index * 16);
    }
    const completion = callSync(engine, 'completeTransformerEdit', pointerId);
    assert(completion.status === 'committed', `transform completion ${kind}`);
    completionMatrix.push({
      kind,
      mutationCount: completion.mutationCount,
      historyDepthDelta:
        callSync(engine, 'historyState').undoDepth - historyBefore,
      previewCount: moveCount,
      staleCompletionCount: completion.probe.staleCompletionCount,
    });
  }
  const actual = {
    completionMatrix,
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
  assert(
    context.caseId === 'SEL-008' || context.caseId === 'TRN-001',
    'replace-scene case',
  );
  const engine = await ensureBaseline(state, context);
  const operands = recordValue(action.operands, 'replace-scene operands');
  let dataset = clone(callSync(engine, 'exportDataset'));
  let reapplyHostSelection = false;
  if (Object.hasOwn(operands, 'retainIds')) {
    const expectedKeys = context.caseId === 'TRN-001'
      ? ['retainIds', 'hostTargets']
      : ['retainIds', 'removeIds'];
    assertExactKeys(operands, expectedKeys, 'retained replace-scene');
    const retained = new Set(stringArray(operands.retainIds, 'retained scene IDs'));
    const removed = new Set(context.caseId === 'TRN-001'
      ? []
      : stringArray(operands.removeIds, 'removed scene IDs'));
    dataset = retainSceneElements(dataset, retained, removed);
    if (context.caseId === 'TRN-001') {
      state.externalSelectionIds = stringArray(
        operands.hostTargets,
        'transform redraw host targets',
      );
    }
    reapplyHostSelection = true;
  } else {
    assert(context.caseId === 'SEL-008', 'hostless replace-scene selection case');
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
  if (context.caseId.startsWith('TRN-') && state.transformerBaselineDataset === null) {
    state.transformerBaselineDataset = clone(dataset);
  }
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

async function reloadTransformerBaseline(engine, state, context, clockMs) {
  assert(state.transformerBaselineDataset !== null, 'transformer baseline dataset');
  callSync(engine, 'loadDataset', clone(state.transformerBaselineDataset), {
    datasetRef: `contract:${context.caseId}:transformer-baseline`,
  });
  callSync(engine, 'setWorldTransform', {
    rotationDegrees: 0,
    flipX: false,
    flipY: false,
  });
  callSync(engine, 'setViewport', { centerWorld: [400, 300], scale: 1 });
  callSync(engine, 'publishFrame', clockMs);
  state.loadedDatasetRef = 'transformer-gesture-matrix';
}

function applyResizeEntry(engine, entry, target, lockAspectRatio) {
  const result = callSync(engine, 'applyTransformerEdit', {
    kind: 'resize',
    selectionIds: [target],
    handle: stringValue(entry.handle, 'resize entry handle'),
    deltaWorld: pointTuple(entry.deltaWorld, 'resize entry delta'),
    lockAspectRatio,
  }, { recordHistory: false });
  assert(result.status === 'committed', 'resize entry commit');
  return result;
}

function transformPlanGeometry(planValue, id, channel = 'after') {
  const plan = recordValue(planValue, 'transform plan');
  const geometries = recordValue(plan[channel], `transform plan ${channel}`);
  return recordValue(geometries[id], `transform plan ${channel}.${id}`);
}

function transformPlanBounds(plan, channel, ids) {
  const geometries = ids.map((id) => transformPlanGeometry(plan, id, channel));
  const left = Math.min(...geometries.map(({ centerWorld, width }) =>
    centerWorld[0] - width / 2));
  const top = Math.min(...geometries.map(({ centerWorld, height }) =>
    centerWorld[1] - height / 2));
  const right = Math.max(...geometries.map(({ centerWorld, width }) =>
    centerWorld[0] + width / 2));
  const bottom = Math.max(...geometries.map(({ centerWorld, height }) =>
    centerWorld[1] + height / 2));
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function oppositeResizeAnchor(geometry, handle) {
  const x = handle.includes('w')
    ? geometry.x + geometry.width
    : handle.includes('e')
      ? geometry.x
      : geometry.x + geometry.width / 2;
  const y = handle.includes('n')
    ? geometry.y + geometry.height
    : handle.includes('s')
      ? geometry.y
      : geometry.y + geometry.height / 2;
  return [canonicalNumber(x), canonicalNumber(y)];
}

function elementRecordByIds(engine, ids) {
  const dataset = callSync(engine, 'exportDataset');
  return Object.fromEntries(ids.map((id) => [
    id,
    clone(requireDatasetElement(dataset, id)),
  ]));
}

function logicalElementValue(engine, id) {
  const query = callSync(engine, 'queryScene', { where: { id } });
  assert(
    query.status === 'matched' && query.targets.length === 1,
    `logical element ${id}`,
  );
  return clone(query.targets[0].value);
}

function elementGeometrySnapshot(engine, id) {
  const element = requireDatasetElement(callSync(engine, 'exportDataset'), id);
  const attrs = recordValue(element.attrs, `${id} attrs`);
  const size = recordValue(element.size, `${id} size`);
  return {
    x: finiteNumber(attrs.x ?? 0, `${id} x`),
    y: finiteNumber(attrs.y ?? 0, `${id} y`),
    width: finiteNumber(size.width, `${id} width`),
    height: finiteNumber(size.height, `${id} height`),
  };
}

function requireDatasetElement(dataset, id) {
  for (const value of arrayValue(dataset, 'transform dataset')) {
    const element = recordValue(value, 'transform dataset element');
    if (element.id === id) return element;
    if (Array.isArray(element.children)) {
      const nested = findDatasetElement(element.children, id);
      if (nested !== null) return nested;
    }
  }
  throw new Error(`Core v2 pointer/selection handler invalid: missing dataset element ${id}`);
}

function findDatasetElement(elements, id) {
  for (const value of arrayValue(elements, 'transform nested dataset')) {
    const element = recordValue(value, 'transform nested element');
    if (element.id === id) return element;
    if (Array.isArray(element.children)) {
      const nested = findDatasetElement(element.children, id);
      if (nested !== null) return nested;
    }
  }
  return null;
}

function transformHandleForKind(kind) {
  if (kind === 'move') return 'frame';
  if (kind === 'resize') return 'se';
  if (kind === 'rotate') return 'rotate';
  throw new Error(`Core v2 pointer/selection handler invalid: transform kind ${kind}`);
}

function transformPreviewRequest(kind, selectionIds, step) {
  if (kind === 'move') {
    return {
      kind,
      selectionIds,
      deltaWorld: [step * 2, step],
    };
  }
  if (kind === 'resize') {
    return {
      kind,
      selectionIds,
      handle: 'se',
      deltaWorld: [step * 2, step * 2],
    };
  }
  if (kind === 'rotate') {
    return {
      kind,
      selectionIds,
      deltaDegrees: step * 5,
    };
  }
  throw new Error(`Core v2 pointer/selection handler invalid: transform kind ${kind}`);
}

function keyNudgeDelta(key, distance) {
  if (key === 'ArrowLeft') return [-distance, 0];
  if (key === 'ArrowRight') return [distance, 0];
  if (key === 'ArrowUp') return [0, -distance];
  if (key === 'ArrowDown') return [0, distance];
  throw new Error(`Core v2 pointer/selection handler invalid: unsupported nudge key ${key}`);
}

function shortestDegrees(start, end) {
  const delta = ((end - start + 540) % 360) - 180;
  return Object.is(delta, -0) ? 0 : delta;
}

function percentile(values, quantile) {
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(ordered.length * quantile) - 1);
  return ordered[index];
}

function canonicalNumber(value) {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
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

function positiveInteger(value, label) {
  const number = integerValue(value, label);
  assert(number > 0, `${label} must be positive`);
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

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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
