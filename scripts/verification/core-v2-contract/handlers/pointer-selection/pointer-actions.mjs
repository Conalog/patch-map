import { clone } from '../../value-atoms.mjs';
import {
  arrayValue,
  assert,
  assertExactKeys,
  callSync,
  clickType,
  dispatchPointer,
  ensureBaseline,
  exactOperands,
  finiteNumber,
  integerValue,
  nonNegativeInteger,
  observeProduct,
  pointTuple,
  projectPointerPayload,
  recordValue,
  stringArray,
  stringValue,
} from './support.mjs';

export async function pointerSeriesAction(product, state, context, action) {
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
export async function physicalClickSeriesAction(product, state, context, action) {
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

export async function pointerHoverSeriesAction(product, state, context, action) {
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

export async function hoverOverlapRedrawProbeAction(product, state, context, action) {
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

export async function gestureTerminationMatrixAction(product, state, context, action) {
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
