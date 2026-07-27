export const INTERACTION_EDITOR_HANDLER_REVISION =
  'core-v2-interaction-editor-handlers/1';

export const INTERACTION_EDITOR_CASE_IDS = Object.freeze([
  'CSM-013',
  'CSM-018',
  'CSM-022',
  'CSM-023',
  'CSM-024',
]);

export const INTERACTION_EDITOR_ACTION_TYPES = Object.freeze([
  'hover-target',
  'secondary-click-target',
  'begin-drag',
  'replace-scene',
  'destroy-engine',
  'probe-declared-failure',
  'initialize-editor-engine',
  'load-scene',
  'enable-editor-policies',
  'attempt-blocked-plant-mount',
  'begin-move',
  'move-targets',
  'end-move',
  'nudge-targets',
  'run-resize-handle-matrix',
  'rotate-target',
  'cancel-transform',
  'undo',
  'redo',
  'run-pan-source-matrix',
  'zoom-view',
  'hit-test',
  'exit-temporary-navigation-policy',
]);

const CASE_ACTIONS = Object.freeze({
  'CSM-013': Object.freeze([
    'hover-target',
    'secondary-click-target',
    'begin-drag',
    'replace-scene',
    'destroy-engine',
    'probe-declared-failure',
  ]),
  'CSM-018': Object.freeze([
    'initialize-editor-engine',
    'load-scene',
    'enable-editor-policies',
    'attempt-blocked-plant-mount',
    'probe-declared-failure',
  ]),
  'CSM-022': Object.freeze([
    'begin-move',
    'move-targets',
    'end-move',
    'nudge-targets',
    'probe-declared-failure',
  ]),
  'CSM-023': Object.freeze([
    'run-resize-handle-matrix',
    'rotate-target',
    'cancel-transform',
    'undo',
    'redo',
    'probe-declared-failure',
  ]),
  'CSM-024': Object.freeze([
    'run-pan-source-matrix',
    'zoom-view',
    'hit-test',
    'exit-temporary-navigation-policy',
    'probe-declared-failure',
  ]),
});

export function createInteractionEditorHandlerEntries(productValue) {
  const product = validateProductAdapter(productValue);
  const states = new WeakMap();
  const handlers = Object.freeze({
    'hover-target': withState(product, states, hoverTargetAction),
    'secondary-click-target': withState(product, states, secondaryClickTargetAction),
    'begin-drag': withState(product, states, beginDragAction),
    'replace-scene': withState(product, states, replaceSceneAction),
    'destroy-engine': withState(product, states, destroyEngineAction),
    'probe-declared-failure': withState(product, states, probeDeclaredFailureAction),
    'initialize-editor-engine': withState(product, states, initializeEditorEngineAction),
    'load-scene': withState(product, states, loadSceneAction),
    'enable-editor-policies': withState(product, states, enableEditorPoliciesAction),
    'attempt-blocked-plant-mount': withState(
      product,
      states,
      attemptBlockedPlantMountAction,
    ),
    'begin-move': withState(product, states, beginMoveAction),
    'move-targets': withState(product, states, moveTargetsAction),
    'end-move': withState(product, states, endMoveAction),
    'nudge-targets': withState(product, states, nudgeTargetsAction),
    'run-resize-handle-matrix': withState(
      product,
      states,
      runResizeHandleMatrixAction,
    ),
    'rotate-target': withState(product, states, rotateTargetAction),
    'cancel-transform': withState(product, states, cancelTransformAction),
    undo: withState(product, states, undoAction),
    redo: withState(product, states, redoAction),
    'run-pan-source-matrix': withState(product, states, runPanSourceMatrixAction),
    'zoom-view': withState(product, states, zoomViewAction),
    'hit-test': withState(product, states, hitTestAction),
    'exit-temporary-navigation-policy': withState(
      product,
      states,
      exitTemporaryNavigationPolicyAction,
    ),
  });
  return Object.freeze(INTERACTION_EDITOR_ACTION_TYPES.map((type) => Object.freeze([
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
        session: 1,
        engine: null,
        loadedDatasetRef: null,
        destroyed: false,
        tooltip: {
          hover: null,
          pinned: null,
          afterDestroy: null,
          destroyHost: null,
        },
        move: {
          pointerId: 2201,
          actionId: null,
          targets: [],
          preview: null,
          completion: null,
          nudge: null,
        },
        transform: {
          resizeRows: [],
          rotation: null,
          cancellation: null,
          undo: null,
          redo: null,
        },
        editor: {
          initialMount: null,
          blockedMount: null,
          inactiveCellVisibleCount: null,
          inactiveCellPixels: null,
        },
        navigation: {
          policyBefore: null,
          rows: [],
          clickSelectionSuppressed: false,
          hitTarget: null,
          zoom: null,
          exited: null,
        },
      };
      states.set(context.ensureSessionEngine, state);
    }
    assert(state.caseId === context.caseId, 'state case identity');
    return handler(product, state, context, action);
  };
}

async function hoverTargetAction(product, state, context, action) {
  assert(context.caseId === 'CSM-013', 'hover target case');
  const operands = exactOperands(action, ['target', 'screen']);
  const engine = await ensureBaseline(state, context);
  if (product.tooltipHostProbe().activeSubscriptionCount === 0) {
    product.attachTooltipHost({ caseId: context.caseId, engine });
  }
  const screen = pointTuple(operands.screen, 'hover screen');
  const tooltip = callSync(engine, 'hoverTooltipAtScreen', point(screen), [160, 80]);
  state.tooltip.hover = clone(tooltip);
  const actual = {
    requestedTarget: stringValue(operands.target, 'hover target'),
    targetId: tooltip.targetId,
    anchorCss: clone(tooltip.anchorCss),
    boundsCss: clone(tooltip.boundsCss),
    host: product.tooltipHostProbe(),
    product: observeProduct(product, context, engine),
  };
  return actionOutput(context, action, actual);
}

async function secondaryClickTargetAction(product, state, context, action) {
  assert(context.caseId === 'CSM-013', 'secondary click case');
  const operands = exactOperands(action, ['target', 'screen']);
  const engine = await ensureBaseline(state, context);
  const screen = pointTuple(operands.screen, 'secondary click screen');
  const tooltip = callSync(
    engine,
    'toggleTooltipPinAtScreen',
    point(screen),
    [160, 80],
  );
  state.tooltip.pinned = clone(tooltip);
  const actual = {
    requestedTarget: stringValue(operands.target, 'secondary click target'),
    targetId: tooltip.targetId,
    pinned: tooltip.pinned,
    host: product.tooltipHostProbe(),
    product: observeProduct(product, context, engine),
  };
  return actionOutput(context, action, actual);
}

async function beginDragAction(product, state, context, action) {
  assert(context.caseId === 'CSM-013', 'begin drag case');
  const operands = exactOperands(action, ['target']);
  const engine = await ensureBaseline(state, context);
  callSync(engine, 'beginOwnedPointerGesture', 'move', 1301);
  const actual = {
    target: stringValue(operands.target, 'drag target'),
    pointerGesture: clone(callSync(engine, 'pointerGestureProbe')),
    tooltip: clone(callSync(engine, 'hostTooltipProbe')),
    host: product.tooltipHostProbe(),
    product: observeProduct(product, context, engine),
  };
  return actionOutput(context, action, actual);
}

async function replaceSceneAction(product, state, context, action) {
  assert(context.caseId === 'CSM-013', 'replace scene case');
  const operands = exactOperands(action, ['datasetRef', 'hostRevision']);
  const engine = await ensureBaseline(state, context);
  callSync(engine, 'interruptPointerGestures', 'replace');
  const datasetRef = stringValue(operands.datasetRef, 'replace datasetRef');
  const dataset = await context.resolveDataset(datasetRef);
  const result = callSync(engine, 'loadDataset', dataset, { datasetRef });
  callSync(engine, 'publishFrame', context.actionIndex + 1);
  state.loadedDatasetRef = datasetRef;
  const actual = {
    hostRevision: nonNegativeInteger(operands.hostRevision, 'replace host revision'),
    load: clone(result),
    pointerGesture: clone(callSync(engine, 'pointerGestureProbe')),
    tooltip: clone(callSync(engine, 'hostTooltipProbe')),
    host: product.tooltipHostProbe(),
    product: observeProduct(product, context, engine),
  };
  return actionOutput(context, action, actual);
}

async function destroyEngineAction(product, state, context, action) {
  assert(context.caseId === 'CSM-013', 'destroy engine case');
  exactOperands(action, []);
  const engine = currentEngine(state, 'destroy');
  const release = await context.releaseEngine(engine, 'consumer-tooltip-destroy');
  state.destroyed = true;
  state.tooltip.afterDestroy = clone(callSync(engine, 'hostTooltipProbe'));
  const destroyHost = product.releaseTooltipHost();
  state.tooltip.destroyHost = clone(destroyHost);
  const actual = {
    release: clone(release),
    tooltip: clone(state.tooltip.afterDestroy),
    pointerGesture: clone(callSync(engine, 'pointerGestureProbe')),
    hostInteraction: clone(callSync(engine, 'hostInteractionProbe')),
    host: clone(destroyHost),
    product: observeProduct(product, context, engine),
  };
  return actionOutput(context, action, actual);
}

async function initializeEditorEngineAction(product, state, context, action) {
  assert(context.caseId === 'CSM-018', 'initialize editor case');
  const operands = exactOperands(action, ['blockedPlant', 'mode']);
  const blockedPlant = booleanValue(operands.blockedPlant, 'editor blocked plant');
  const decision = product.resolveEditorMount(blockedPlant);
  state.editor.initialMount = clone(decision);
  let engine = null;
  if (decision.createsEngine) {
    engine = await ensureInitializedEngine(state, context);
    callSync(engine, 'applyInteractionModeOperation', {
      op: 'replace',
      state: stringValue(operands.mode, 'editor mode'),
    });
  }
  const actual = {
    decision: clone(decision),
    canvasCount: engine === null ? 0 : callSync(engine, 'snapshot').resources.canvasCount,
    product: engine === null ? null : observeProduct(product, context, engine),
  };
  return actionOutput(context, action, actual);
}

async function loadSceneAction(product, state, context, action) {
  assert(context.caseId === 'CSM-018', 'load scene case');
  const operands = exactOperands(action, ['generatorRef', 'hostRevision']);
  const engine = await ensureInitializedEngine(state, context);
  const generatorRef = stringValue(operands.generatorRef, 'generatorRef');
  const dataset = product.productionDataset({
    caseId: context.caseId,
    generatorRef,
  });
  const result = callSync(engine, 'loadDataset', dataset, {
    datasetRef: generatorRef,
  });
  callSync(engine, 'setViewport', { centerWorld: [400, 300], scale: 1 });
  callSync(engine, 'publishFrame', context.actionIndex + 1);
  state.loadedDatasetRef = generatorRef;
  const actual = {
    hostRevision: nonNegativeInteger(operands.hostRevision, 'load host revision'),
    generatorRef,
    load: clone(result),
    product: observeProduct(product, context, engine),
  };
  return actionOutput(context, action, actual);
}

async function enableEditorPoliciesAction(product, state, context, action) {
  assert(context.caseId === 'CSM-018', 'editor policies case');
  const operands = exactOperands(
    action,
    ['edgePan', 'transformer', 'inactiveCellsHidden'],
  );
  const engine = await ensureInitializedEngine(state, context);
  const edgePan = booleanValue(operands.edgePan, 'edge pan policy');
  const transformer = booleanValue(operands.transformer, 'transformer policy');
  const inactiveCellsHidden = booleanValue(
    operands.inactiveCellsHidden,
    'inactive cell policy',
  );
  const policy = edgePan
    ? callSync(engine, 'configureViewportPolicy', { op: 'start', policy: 'edge-pan' })
    : callSync(engine, 'viewportPolicyProbe');
  const selectionVisual = transformer
    ? callSync(engine, 'setSelectionVisualPolicy', { mode: 'all' })
    : null;
  const dataset = callSync(engine, 'exportDataset');
  const inactiveIds = inactiveGridCellIds(dataset);
  const geometry = callSync(engine, 'geometryProbe');
  const visible = geometry.entities.filter((entity) =>
    inactiveIds.has(entity.id) && entity.visible === true);
  state.editor.inactiveCellVisibleCount = visible.length;
  state.editor.inactiveCellPixels = visible.reduce((total, entity) => {
    const bounds = entity.screenBounds;
    return total + Math.max(0, bounds[2]) * Math.max(0, bounds[3]);
  }, 0);
  const actual = {
    policies: { edgePan, transformer, inactiveCellsHidden },
    viewportPolicy: clone(policy),
    selectionVisual: clone(selectionVisual),
    inactiveCellCount: inactiveIds.size,
    inactiveCellVisibleCount: state.editor.inactiveCellVisibleCount,
    inactiveCellPixels: state.editor.inactiveCellPixels,
    product: observeProduct(product, context, engine),
  };
  return actionOutput(context, action, actual);
}

async function attemptBlockedPlantMountAction(product, state, context, action) {
  assert(context.caseId === 'CSM-018', 'blocked mount case');
  const operands = exactOperands(action, ['blockedPlant']);
  const engine = currentEngine(state, 'blocked mount');
  const before = callSync(engine, 'snapshot').resources.canvasCount;
  const decision = product.resolveEditorMount(
    booleanValue(operands.blockedPlant, 'blocked mount flag'),
  );
  const after = callSync(engine, 'snapshot').resources.canvasCount;
  state.editor.blockedMount = clone(decision);
  const actual = {
    decision: clone(decision),
    activeCanvasCount: after,
    blockedPlantCanvasCount: decision.canvasBudget,
    canvasDelta: after - before,
    product: observeProduct(product, context, engine),
  };
  return actionOutput(context, action, actual);
}

async function beginMoveAction(product, state, context, action) {
  assert(context.caseId === 'CSM-022', 'begin move case');
  const operands = exactOperands(action, ['targets', 'startWorld', 'actionId']);
  const engine = await ensureBaseline(state, context);
  const targets = stringArray(operands.targets, 'move targets');
  const actionId = stringValue(operands.actionId, 'move action ID');
  callSync(engine, 'applySelection', {
    op: 'replace',
    ids: targets,
    source: 'programmatic',
  });
  callSync(engine, 'beginTransformerEdit', {
    pointerId: state.move.pointerId,
    actionId,
    kind: 'move',
    handle: 'frame',
    selectionIds: targets,
  });
  state.move.targets = targets;
  state.move.actionId = actionId;
  const actual = {
    targets: clone(targets),
    startWorld: pointTuple(operands.startWorld, 'move start world'),
    actionId,
    transformer: clone(callSync(engine, 'transformerEditProbe')),
    product: observeProduct(product, context, engine),
  };
  return actionOutput(context, action, actual);
}

async function moveTargetsAction(product, state, context, action) {
  assert(context.caseId === 'CSM-022', 'move targets case');
  const operands = exactOperands(
    action,
    ['deltaWorld', 'integerRounding', 'axisLock', 'edgeAutoPan'],
  );
  const engine = currentEngine(state, 'move targets');
  const deltaWorld = pointTuple(operands.deltaWorld, 'move delta');
  assert(booleanValue(operands.integerRounding, 'move integer rounding'), 'integer move');
  assert(operands.axisLock === null, 'move axis lock is null');
  const preview = callSync(engine, 'previewTransformerEdit', state.move.pointerId, {
    kind: 'move',
    selectionIds: state.move.targets,
    deltaWorld,
  });
  const edgePan = booleanValue(operands.edgeAutoPan, 'move edge auto pan')
    ? callSync(engine, 'edgeAutoPanTransformer', [799, 300], [20, 0])
    : null;
  state.move.preview = clone(preview);
  const actual = {
    deltaWorld,
    preview: clone(preview),
    integerDeltaWorld: clone(preview.plan?.after?.[state.move.targets[0]] === undefined
      ? deltaWorld
      : deltaWorld.map((value) => Math.round(value))),
    edgePan: clone(edgePan),
    product: observeProduct(product, context, engine),
  };
  return actionOutput(context, action, actual);
}

async function endMoveAction(product, state, context, action) {
  assert(context.caseId === 'CSM-022', 'end move case');
  const operands = exactOperands(action, ['terminal', 'actionId']);
  const engine = currentEngine(state, 'end move');
  assert(
    stringValue(operands.actionId, 'end move action ID') === state.move.actionId,
    'end move action identity',
  );
  assert(stringValue(operands.terminal, 'end move terminal') === 'pointerup', 'move terminal');
  const completion = callSync(engine, 'completeTransformerEdit', state.move.pointerId);
  state.move.completion = clone(completion);
  const actual = {
    completion: clone(completion),
    history: clone(callSync(engine, 'historyState')),
    geometry: geometryByIds(callSync(engine, 'exportDataset'), state.move.targets),
    product: observeProduct(product, context, engine),
  };
  return actionOutput(context, action, actual);
}

async function nudgeTargetsAction(product, state, context, action) {
  assert(context.caseId === 'CSM-022', 'nudge targets case');
  const operands = exactOperands(action, ['targets', 'deltaWorld', 'actionId']);
  const engine = currentEngine(state, 'nudge targets');
  const targets = stringArray(operands.targets, 'nudge targets');
  const result = callSync(engine, 'applyTransformerEdit', {
    kind: 'move',
    selectionIds: targets,
    deltaWorld: pointTuple(operands.deltaWorld, 'nudge delta'),
  }, {
    actionId: stringValue(operands.actionId, 'nudge action ID'),
  });
  state.move.nudge = clone(result);
  const actual = {
    result: clone(result),
    geometry: geometryByIds(callSync(engine, 'exportDataset'), targets),
    history: clone(callSync(engine, 'historyState')),
    selectedIds: clone(callSync(engine, 'snapshot').selectionIds),
    product: observeProduct(product, context, engine),
  };
  return actionOutput(context, action, actual);
}

async function runResizeHandleMatrixAction(product, state, context, action) {
  assert(context.caseId === 'CSM-023', 'resize matrix case');
  const operands = exactOperands(
    action,
    ['target', 'handles', 'deltaWorld', 'ratioModifier'],
  );
  const engine = await ensureBaseline(state, context);
  const target = stringValue(operands.target, 'resize target');
  const handles = stringArray(operands.handles, 'resize handles');
  const deltaWorld = pointTuple(operands.deltaWorld, 'resize delta');
  assert(stringValue(operands.ratioModifier, 'ratio modifier') === 'Shift', 'ratio modifier');
  callSync(engine, 'applySelection', {
    op: 'replace',
    ids: [target],
    source: 'programmatic',
  });
  callSync(engine, 'applyInteractionModeOperation', {
    op: 'replace',
    state: 'transform',
  });
  const rows = handles.map((handle, index) => {
    const result = callSync(engine, 'applyTransformerEdit', {
      kind: 'resize',
      selectionIds: [target],
      handle,
      deltaWorld,
      lockAspectRatio: true,
    }, {
      actionId: `resize-${index + 1}-${handle}`,
    });
    return {
      handle,
      status: result.status,
      changed: result.changed,
      historyDepthDelta: result.historyDepthDelta,
    };
  });
  state.transform.resizeRows = clone(rows);
  const actual = {
    rows,
    handleCasesPassed: rows.filter(({ status }) => status === 'committed').length,
    history: clone(callSync(engine, 'historyState')),
    geometry: geometryByIds(callSync(engine, 'exportDataset'), [target]),
    product: observeProduct(product, context, engine),
  };
  return actionOutput(context, action, actual);
}

async function rotateTargetAction(product, state, context, action) {
  assert(context.caseId === 'CSM-023', 'rotate target case');
  const operands = exactOperands(action, ['target', 'degrees', 'snapDegrees', 'actionId']);
  const engine = currentEngine(state, 'rotate target');
  const target = stringValue(operands.target, 'rotate target');
  const degrees = finiteNumber(operands.degrees, 'rotate degrees');
  const snapDegrees = finiteNumber(operands.snapDegrees, 'rotate snap');
  const snap = callSync(
    engine,
    'resolveTransformerRotationSnap',
    0,
    degrees,
    true,
    snapDegrees,
  );
  const result = callSync(engine, 'applyTransformerEdit', {
    kind: 'rotate',
    selectionIds: [target],
    deltaDegrees: snap.appliedDegrees,
  }, {
    actionId: stringValue(operands.actionId, 'rotate action ID'),
  });
  const geometry = geometryByIds(callSync(engine, 'exportDataset'), [target]);
  state.transform.rotation = {
    snap: clone(snap),
    result: clone(result),
    geometry: clone(geometry),
  };
  const actual = {
    snap: clone(snap),
    result: clone(result),
    geometry,
    history: clone(callSync(engine, 'historyState')),
    product: observeProduct(product, context, engine),
  };
  return actionOutput(context, action, actual);
}

async function cancelTransformAction(product, state, context, action) {
  assert(context.caseId === 'CSM-023', 'cancel transform case');
  const operands = exactOperands(action, ['target', 'terminal']);
  const engine = currentEngine(state, 'cancel transform');
  const target = stringValue(operands.target, 'cancel target');
  const terminal = stringValue(operands.terminal, 'cancel terminal');
  const beforeDataset = clone(callSync(engine, 'exportDataset'));
  const beforeHistory = callSync(engine, 'historyState').depth;
  callSync(engine, 'beginTransformerEdit', {
    pointerId: 2301,
    actionId: 'cancel-transform',
    kind: 'move',
    handle: 'frame',
    selectionIds: [target],
  });
  callSync(engine, 'previewTransformerEdit', 2301, {
    kind: 'move',
    selectionIds: [target],
    deltaWorld: [7, 3],
  });
  const result = callSync(engine, 'cancelTransformerEdit', 2301, terminal);
  const afterDataset = callSync(engine, 'exportDataset');
  const afterHistory = callSync(engine, 'historyState').depth;
  state.transform.cancellation = {
    result: clone(result),
    restored: sameJson(beforeDataset, afterDataset),
    historyDelta: afterHistory - beforeHistory,
  };
  const actual = {
    ...clone(state.transform.cancellation),
    overlayCount: callSync(engine, 'transformerEditProbe').previewOverlayCount,
    product: observeProduct(product, context, engine),
  };
  return actionOutput(context, action, actual);
}

async function undoAction(product, state, context, action) {
  assert(context.caseId === 'CSM-023', 'undo case');
  exactOperands(action, []);
  const engine = currentEngine(state, 'undo');
  const result = callSync(engine, 'undo');
  state.transform.undo = clone(result);
  const actual = {
    result: clone(result),
    history: clone(callSync(engine, 'historyState')),
    product: observeProduct(product, context, engine),
  };
  return actionOutput(context, action, actual);
}

async function redoAction(product, state, context, action) {
  assert(context.caseId === 'CSM-023', 'redo case');
  exactOperands(action, []);
  const engine = currentEngine(state, 'redo');
  const result = callSync(engine, 'redo');
  state.transform.redo = clone(result);
  const actual = {
    result: clone(result),
    history: clone(callSync(engine, 'historyState')),
    geometry: geometryByIds(callSync(engine, 'exportDataset'), ['rect-b']),
    product: observeProduct(product, context, engine),
  };
  return actionOutput(context, action, actual);
}

async function runPanSourceMatrixAction(product, state, context, action) {
  assert(context.caseId === 'CSM-024', 'pan source matrix case');
  const operands = exactOperands(action, ['sources', 'deltaCss']);
  const engine = await ensureBaseline(state, context);
  const sources = stringArray(operands.sources, 'pan sources');
  const deltaCss = pointTuple(operands.deltaCss, 'pan delta');
  callSync(engine, 'applySelection', {
    op: 'clear',
    source: 'programmatic',
  });
  state.navigation.policyBefore = clone(callSync(engine, 'viewportPolicyProbe'));
  callSync(engine, 'configureViewportPolicy', { op: 'temporary', policy: 'pan' });
  const rows = [];
  let clickSelectionSuppressed = true;
  for (const [index, source] of sources.entries()) {
    if (source === 'middle') {
      callSync(engine, 'applyInteractionModeOperation', {
        op: 'temporary',
        state: 'pan',
        modifier: 'Middle',
      });
    } else if (source === 'Space') {
      callSync(engine, 'applyInteractionModeOperation', {
        op: 'temporary',
        state: 'pan',
        modifier: 'Space',
      });
    } else {
      assert(source === 'move-tool', 'pan source');
      callSync(engine, 'applyInteractionModeOperation', { op: 'replace', state: 'pan' });
    }
    const result = callSync(
      engine,
      'panViewport',
      deltaCss,
      source === 'middle' ? 'middle-pointer' : 'pointer',
    );
    const click = dispatchTargetClick(engine, 2400 + index);
    const selectedIds = callSync(engine, 'snapshot').selectionIds;
    const suppressed = click.targetId !== null && selectedIds.length === 0;
    clickSelectionSuppressed &&= suppressed;
    rows.push({
      source,
      changed: result.changed,
      blocked: result.blocked,
      viewRevision: result.revisions.viewRevision,
      clickTarget: click.targetId,
      clickSelectionSuppressed: suppressed,
    });
    if (source === 'middle' || source === 'Space') {
      callSync(engine, 'applyInteractionModeOperation', {
        op: 'release-temporary',
        modifier: source === 'middle' ? 'Middle' : 'Space',
      });
    }
  }
  state.navigation.rows = clone(rows);
  state.navigation.clickSelectionSuppressed = clickSelectionSuppressed;
  const actual = {
    rows,
    panCasesPassed: rows.filter(({ changed, blocked }) => changed && !blocked).length,
    clickSelectionSuppressed,
    viewport: clone(callSync(engine, 'viewportProbe')),
    mode: clone(callSync(engine, 'interactionModeProbe')),
    product: observeProduct(product, context, engine),
  };
  return actionOutput(context, action, actual);
}

async function zoomViewAction(product, state, context, action) {
  assert(context.caseId === 'CSM-024', 'zoom view case');
  const operands = exactOperands(action, ['source', 'factor', 'anchorCss']);
  const engine = currentEngine(state, 'zoom view');
  const result = callSync(engine, 'zoomViewportAt', {
    source: stringValue(operands.source, 'zoom source'),
    factor: finiteNumber(operands.factor, 'zoom factor'),
    anchorCss: pointTuple(operands.anchorCss, 'zoom anchor'),
  });
  state.navigation.zoom = clone(result);
  const actual = {
    result: clone(result),
    viewport: clone(callSync(engine, 'viewportProbe')),
    product: observeProduct(product, context, engine),
  };
  return actionOutput(context, action, actual);
}

async function hitTestAction(product, state, context, action) {
  assert(context.caseId === 'CSM-024', 'hit test case');
  const operands = exactOperands(action, ['screen', 'expectedTarget']);
  const engine = currentEngine(state, 'hit test');
  const screen = pointTuple(operands.screen, 'hit screen');
  const hit = callSync(engine, 'selectionHitTestScreen', point(screen));
  state.navigation.hitTarget = hit.target?.selectionId ?? null;
  const actual = {
    screen,
    declaredTarget: stringValue(operands.expectedTarget, 'declared hit target'),
    targetId: state.navigation.hitTarget,
    candidates: clone(hit.candidates.map(({ selectionId }) => selectionId)),
    worldPoint: clone(hit.worldPoint),
    product: observeProduct(product, context, engine),
  };
  return actionOutput(context, action, actual);
}

async function exitTemporaryNavigationPolicyAction(product, state, context, action) {
  assert(context.caseId === 'CSM-024', 'exit navigation case');
  exactOperands(action, []);
  const engine = currentEngine(state, 'exit navigation');
  const policy = callSync(engine, 'configureViewportPolicy', {
    op: 'restore-temporary',
  });
  callSync(engine, 'applyInteractionModeOperation', { op: 'replace', state: 'select' });
  const mode = callSync(engine, 'interactionModeProbe');
  state.navigation.exited = {
    policy: clone(policy),
    mode: clone(mode),
  };
  const actual = {
    policy: clone(policy),
    mode: clone(mode),
    selectionIds: clone(callSync(engine, 'snapshot').selectionIds),
    pointerGesture: clone(callSync(engine, 'pointerGestureProbe')),
    product: observeProduct(product, context, engine),
  };
  return actionOutput(context, action, actual);
}

async function probeDeclaredFailureAction(product, state, context, action) {
  const operands = exactOperands(
    action,
    ['journeyId', 'isolate', 'afterActionIndex', 'injection', 'expectedRollback'],
  );
  assert(
    stringValue(operands.journeyId, 'failure journey ID') === context.caseId,
    'failure journey identity',
  );
  assert(booleanValue(operands.isolate, 'failure isolation'), 'failure isolation');
  assert(
    nonNegativeInteger(operands.afterActionIndex, 'failure boundary')
      === context.actionIndex - 1,
    'failure action boundary',
  );
  const injection = recordValue(operands.injection, 'failure injection');
  recordValue(operands.expectedRollback, 'failure rollback declaration');
  const engine = currentEngine(state, 'declared failure');
  let rollback;

  if (context.caseId === 'CSM-013') {
    rollback = {
      clearOn: clone(state.tooltip.afterDestroy?.clearTrace ?? []),
      hostDomRemoved: product.tooltipHostProbe().hostDomRemoved === true,
      staleCallbackCount: product.tooltipHostProbe().staleCallbackCount,
    };
  } else if (context.caseId === 'CSM-018') {
    const blocked = product.resolveEditorMount(true);
    rollback = {
      blockedPlantCreatesEngine: blocked.createsEngine,
      loadFailureCanvasCount: blocked.canvasBudget,
    };
  } else if (context.caseId === 'CSM-022') {
    const before = clone(callSync(engine, 'exportDataset'));
    const historyBefore = callSync(engine, 'historyState').depth;
    const result = callSync(engine, 'applyTransformerEdit', {
      kind: 'move',
      selectionIds: [...state.move.targets, 'links'],
      deltaWorld: [3, 1],
    }, {
      actionId: 'mixed-non-movable',
    });
    const after = callSync(engine, 'exportDataset');
    const historyAfter = callSync(engine, 'historyState').depth;
    rollback = {
      mixedNonMovablePolicy:
        result.status === 'rejected' && sameJson(before, after) ? 'reject-all' : 'partial',
      conflictCode: result.plan?.code ?? result.status,
      startGeometryRestored:
        sameJson(before, after) && historyBefore === historyAfter,
    };
  } else if (context.caseId === 'CSM-023') {
    const before = clone(callSync(engine, 'exportDataset'));
    const historyBefore = callSync(engine, 'historyState').depth;
    callSync(engine, 'beginTransformerEdit', {
      pointerId: 2302,
      actionId: 'declared-cancel',
      kind: 'move',
      handle: 'frame',
      selectionIds: ['rect-b'],
    });
    callSync(engine, 'previewTransformerEdit', 2302, {
      kind: 'move',
      selectionIds: ['rect-b'],
      deltaWorld: [11, 4],
    });
    callSync(engine, 'cancelTransformerEdit', 2302, 'escape');
    const after = callSync(engine, 'exportDataset');
    rollback = {
      interruptionRestoresStart: sameJson(before, after),
      historyDeltaOnCancel: callSync(engine, 'historyState').depth - historyBefore,
      overlayCleanup: callSync(engine, 'transformerEditProbe').previewOverlayCount === 0,
    };
  } else {
    assert(context.caseId === 'CSM-024', 'failure case identity');
    const policy = callSync(engine, 'viewportPolicyProbe');
    rollback = {
      temporaryPolicyRestored:
        policy.temporary === false
        && sameJson(policy.policies, state.navigation.policyBefore.policies)
        && sameJson(
          policy.enabledPolicies,
          state.navigation.policyBefore.enabledPolicies,
        ),
      clickSelectionSuppressedDuringPan: state.navigation.clickSelectionSuppressed,
    };
  }

  const actual = {
    injectionId: stringValue(injection.id, 'failure injection ID'),
    declaredDiagnostic: stringValue(injection.diagnostic, 'failure diagnostic'),
    rollback,
    product: observeProduct(product, context, engine),
  };
  return actionOutput(context, action, actual);
}

async function ensureBaseline(state, context) {
  const engine = await ensureInitializedEngine(state, context);
  if (state.loadedDatasetRef !== null) return engine;
  const profiles = recordValue(context.fixtureProfiles, 'fixture profiles');
  const profile = recordValue(profiles['packed-host-seam'], 'packed-host-seam profile');
  const datasetRef = stringValue(profile.datasetRef, 'packed host datasetRef');
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
  if (state.destroyed) throw new Error('interaction/editor engine has been destroyed');
  const engine = state.engine ?? await context.ensureSessionEngine(state.session);
  state.engine = engine;
  const snapshot = callSync(engine, 'snapshot');
  if (snapshot.lifecycle === 'new') {
    const viewport = Array.isArray(context.fixtureParams.viewportCssPx)
      ? pointTuple(context.fixtureParams.viewportCssPx, 'fixture viewport')
      : [800, 600];
    await call(engine, 'initialize', {
      instanceId: `contract-${context.caseId.toLowerCase()}-${state.session}`,
      width: viewport[0],
      height: viewport[1],
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

function currentEngine(state, operation) {
  assert(state.engine !== null, `${operation} engine exists`);
  return state.engine;
}

function observeProduct(product, context, engine) {
  return clone(product.resourceProbe({ caseId: context.caseId, engine }));
}

function dispatchTargetClick(engine, pointerId) {
  const geometry = callSync(engine, 'geometryProbe');
  const target = geometry.entities.find((entity) => entity.id === 'rect-b');
  const bounds = target?.screenBounds ?? [0, 0, 0, 0];
  const screen = [
    bounds[0] + bounds[2] / 2,
    bounds[1] + bounds[3] / 2,
  ];
  const base = {
    pointerId,
    pointerType: 'mouse',
    button: 0,
    screen,
    modifiers: {
      shift: false,
      ctrl: false,
      alt: false,
      meta: false,
    },
  };
  callSync(engine, 'dispatchPointerInput', {
    ...base,
    type: 'down',
    buttons: 1,
    timeMs: pointerId * 10,
  });
  const up = callSync(engine, 'dispatchPointerInput', {
    ...base,
    type: 'up',
    buttons: 0,
    timeMs: pointerId * 10 + 16,
  });
  const click = up.events.find((event) => event.type === 'click');
  return {
    screen,
    targetId: click?.payload?.target?.id ?? null,
  };
}

function inactiveGridCellIds(dataset) {
  const ids = new Set();
  const visit = (elements) => {
    for (const element of elements) {
      if (element.type === 'group') visit(element.children);
      if (element.type !== 'grid') continue;
      element.cells.forEach((row, rowIndex) => {
        row.forEach((cell, columnIndex) => {
          if (cell === 0) ids.add(`${element.id}.${rowIndex}.${columnIndex}`);
        });
      });
    }
  };
  visit(dataset);
  return ids;
}

function geometryByIds(dataset, ids) {
  return Object.fromEntries(ids.map((id) => [id, elementGeometry(findElement(dataset, id), id)]));
}

function findElement(elements, id) {
  for (const element of elements) {
    if (element.id === id) return element;
    if (element.type === 'group') {
      const nested = findElement(element.children, id);
      if (nested !== null) return nested;
    }
  }
  return null;
}

function elementGeometry(element, id) {
  assert(isRecord(element), `geometry element ${id}`);
  const attrs = isRecord(element.attrs) ? element.attrs : {};
  const size = isRecord(element.size) ? element.size : {};
  return {
    worldBounds: {
      x: finiteNumber(attrs.x ?? 0, `${id} x`),
      y: finiteNumber(attrs.y ?? 0, `${id} y`),
      width: finiteNumber(size.width ?? 0, `${id} width`),
      height: finiteNumber(size.height ?? 0, `${id} height`),
    },
    rotationDegrees: finiteNumber(
      attrs.angle ?? attrs.rotation ?? 0,
      `${id} rotation`,
    ),
  };
}

function actionOutput(context, action, actual) {
  return {
    actual: deepFreeze(actual),
    captureSource: deepFreeze(clone(actual)),
    host: deepFreeze({
      caseId: context.caseId,
      actionIndex: action.index,
      actionType: action.type,
      actual: clone(actual),
    }),
  };
}

function validateProductAdapter(value) {
  const product = recordValue(value, 'product adapter');
  for (const method of [
    'productionDataset',
    'resolveEditorMount',
    'attachTooltipHost',
    'releaseTooltipHost',
    'tooltipHostProbe',
    'resourceProbe',
  ]) {
    assert(typeof product[method] === 'function', `product adapter ${method}()`);
  }
  return product;
}

function validateContext(value) {
  const context = recordValue(value, 'handler context');
  assert(INTERACTION_EDITOR_CASE_IDS.includes(context.caseId), 'handler case ID');
  assert(typeof context.ensureSessionEngine === 'function', 'ensureSessionEngine()');
  assert(typeof context.releaseEngine === 'function', 'releaseEngine()');
  assert(typeof context.resolveDataset === 'function', 'resolveDataset()');
  assert(isRecord(context.fixtureParams), 'fixture params');
  assert(isRecord(context.fixtureProfiles), 'fixture profiles');
  return context;
}

function validateAction(context, value) {
  const action = recordValue(value, 'action');
  assert(action.index === context.actionIndex, 'action index');
  assert(
    CASE_ACTIONS[context.caseId]?.[action.index] === action.type,
    `${context.caseId} action sequence`,
  );
  assert(isRecord(action.operands), 'action operands');
  return action;
}

function exactOperands(action, keys) {
  const operands = recordValue(action.operands, `${action.type}.operands`);
  assertExactKeys(operands, keys, `${action.type}.operands`);
  return operands;
}

function assertExactKeys(value, keys, label) {
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  assert(sameJson(actual, expected), `${label} exact keys`);
}

async function call(target, method, ...args) {
  assert(isRecord(target), `${method} target`);
  assert(typeof target[method] === 'function', `${method}()`);
  return target[method](...args);
}

function callSync(target, method, ...args) {
  const result = callMethod(target, method, args);
  assert(
    result === null || typeof result !== 'object' || typeof result.then !== 'function',
    `${method}() must be synchronous`,
  );
  return result;
}

function callMethod(target, method, args) {
  assert(isRecord(target), `${method} target`);
  assert(typeof target[method] === 'function', `${method}()`);
  return target[method](...args);
}

function pointTuple(value, label) {
  assert(Array.isArray(value) && value.length === 2, `${label} pair`);
  return value.map((entry, index) => finiteNumber(entry, `${label}[${index}]`));
}

function point(value) {
  return { x: value[0], y: value[1] };
}

function stringArray(value, label) {
  assert(Array.isArray(value), `${label} array`);
  return value.map((entry, index) => stringValue(entry, `${label}[${index}]`));
}

function recordValue(value, label) {
  assert(isRecord(value), `${label} record`);
  return value;
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} string`);
  return value;
}

function booleanValue(value, label) {
  assert(typeof value === 'boolean', `${label} boolean`);
  return value;
}

function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} finite`);
  return value;
}

function nonNegativeInteger(value, label) {
  assert(Number.isSafeInteger(value) && value >= 0, `${label} non-negative integer`);
  return value;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function clone(value) {
  return structuredClone(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Core v2 interaction/editor handler invalid: ${message}`);
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}
