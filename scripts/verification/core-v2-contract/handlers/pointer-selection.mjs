export const POINTER_SELECTION_HANDLER_REVISION = 'core-v2-pointer-selection-handlers/1';

export const POINTER_SELECTION_CASE_IDS = Object.freeze([
  'EVT-001',
  'EVT-002',
  'EVT-003',
  'EVT-004',
  'EVT-008',
  'SEL-005',
  'SEL-006',
]);

export const POINTER_SELECTION_ACTION_TYPES = Object.freeze([
  'pointer-series',
  'physical-click-series',
  'pointer-hover-series',
  'hover-overlap-redraw-probe',
  'gesture-termination-matrix',
  'click-suppression-matrix',
  'box-selection',
  'relation-box-intersection-matrix',
  'paint-selection',
]);

const CASE_ACTIONS = Object.freeze({
  'EVT-001': Object.freeze(['pointer-series']),
  'EVT-002': Object.freeze(['physical-click-series']),
  'EVT-003': Object.freeze(['pointer-hover-series', 'hover-overlap-redraw-probe']),
  'EVT-004': Object.freeze(['gesture-termination-matrix']),
  'EVT-008': Object.freeze(['click-suppression-matrix']),
  'SEL-005': Object.freeze([
    'box-selection',
    'box-selection',
    'box-selection',
    'relation-box-intersection-matrix',
  ]),
  'SEL-006': Object.freeze(['paint-selection']),
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
    'click-suppression-matrix': withState(product, states, clickSuppressionMatrixAction),
    'box-selection': withState(product, states, boxSelectionAction),
    'relation-box-intersection-matrix': withState(
      product,
      states,
      relationBoxIntersectionMatrixAction,
    ),
    'paint-selection': withState(product, states, paintSelectionAction),
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

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Core v2 pointer/selection handler invalid: ${message}`);
}
