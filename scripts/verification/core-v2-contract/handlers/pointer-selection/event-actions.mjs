import { clone } from '../../value-atoms.mjs';
import {
  arrayValue,
  assert,
  assertExactKeys,
  booleanValue,
  callSync,
  cloneRecord,
  countBy,
  countManyBy,
  currentStateEngine,
  dispatchPointer,
  dispatchProductClick,
  ensureBaseline,
  exactOperands,
  historyCorruptEntryCount,
  integerValue,
  nonNegativeInteger,
  numberArray,
  observeProduct,
  pointRecord,
  pointTuple,
  positiveFinite,
  recordValue,
  stringArray,
  stringValue,
} from './support.mjs';

export async function bindEventsAction(product, state, context, action) {
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
export async function bindingProbeSequenceAction(product, state, context, action) {
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

export async function dispatchPropagatingEventAction(product, state, context, action) {
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

export async function keyboardMatrixAction(product, state, context, action) {
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

export async function transformerHandlePropagationProbeAction(product, state, context, action) {
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

export async function stateStackAction(product, state, context, action) {
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

export async function dispatchStateOwnedInputAction(product, state, context, action) {
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

export async function destroyStateStackAction(product, state, context, action) {
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

export async function clickSuppressionMatrixAction(product, state, context, action) {
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

export async function subscribeEventsAction(product, state, context, action) {
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

export async function setSelectionAction(product, state, context, action) {
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
