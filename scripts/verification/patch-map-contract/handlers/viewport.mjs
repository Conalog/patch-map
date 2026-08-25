import { clone, deepFreeze, createTypeSuffixValueAtoms } from '../value-atoms.mjs';

const {
  recordValue,
  arrayValue,
  booleanValue,
} = createTypeSuffixValueAtoms(assert);

export const VIEWPORT_HANDLER_REVISION = 'patch-map-viewport-handlers/1';

export const VIEWPORT_CASE_IDS = Object.freeze([
  'VIE-001',
  'VIE-002',
  'VIE-003',
  'VIE-004',
  'VIE-005',
  'VIE-006',
  'VIE-007',
  'VIE-008',
  'CSM-009',
  'CSM-010',
]);

export const VIEWPORT_ACTION_TYPES = Object.freeze([
  'view-gesture-series',
  'set-view',
  'settle-view',
  'serialize-view',
  'remount-and-restore',
  'restore-view',
  'focus-target-matrix',
  'focus-contributor-matrix',
  'fit-target-matrix',
  'fit-targets',
  'fit-contributor-matrix',
  'resize-after-fit',
  'world-rotation-series',
  'resize-surface',
  'world-flip-matrix',
  'view-dependent-feature-matrix',
  'surface-resize-matrix',
  'viewport-policy-lifecycle',
  'load-scene',
  'restore-or-fit-view',
  'pan-view',
  'zoom-view',
  'fit-view',
  'await-view-settle',
  'remount-and-restore-view',
  'probe-declared-failure',
]);

const CASE_ACTIONS = Object.freeze({
  'VIE-001': Object.freeze(['view-gesture-series']),
  'VIE-002': Object.freeze([
    'set-view',
    'settle-view',
    'serialize-view',
    'remount-and-restore',
    'restore-view',
  ]),
  'VIE-003': Object.freeze([
    'focus-target-matrix',
    'focus-contributor-matrix',
  ]),
  'VIE-004': Object.freeze([
    'fit-target-matrix',
    'fit-targets',
    'fit-contributor-matrix',
    'resize-after-fit',
  ]),
  'VIE-005': Object.freeze([
    'world-rotation-series',
    'resize-surface',
  ]),
  'VIE-006': Object.freeze([
    'world-flip-matrix',
    'view-dependent-feature-matrix',
  ]),
  'VIE-007': Object.freeze(['surface-resize-matrix']),
  'VIE-008': Object.freeze(['viewport-policy-lifecycle']),
  'CSM-009': Object.freeze([
    'load-scene',
    'restore-or-fit-view',
    'restore-or-fit-view',
    'probe-declared-failure',
  ]),
  'CSM-010': Object.freeze([
    'load-scene',
    'pan-view',
    'zoom-view',
    'fit-view',
    'await-view-settle',
    'remount-and-restore-view',
    'probe-declared-failure',
  ]),
});

const BASELINE_CASES = new Set([
  'VIE-001',
  'VIE-002',
  'VIE-003',
  'VIE-004',
  'VIE-005',
  'VIE-006',
  'VIE-007',
]);

/** Shared expected-blind product handlers for ten viewport contract cases. */
export function createViewportHandlerEntries(productValue) {
  const product = validateProductAdapter(productValue);
  const states = new WeakMap();
  const handlers = Object.freeze({
    'view-gesture-series': withState(product, states, viewGestureSeriesAction),
    'set-view': withState(product, states, setViewAction),
    'settle-view': withState(product, states, settleViewAction),
    'serialize-view': withState(product, states, serializeViewAction),
    'remount-and-restore': withState(product, states, remountAndRestoreAction),
    'restore-view': withState(product, states, restoreViewAction),
    'focus-target-matrix': withState(product, states, focusTargetMatrixAction),
    'focus-contributor-matrix': withState(product, states, focusContributorMatrixAction),
    'fit-target-matrix': withState(product, states, fitTargetMatrixAction),
    'fit-targets': withState(product, states, fitTargetsAction),
    'fit-contributor-matrix': withState(product, states, fitContributorMatrixAction),
    'resize-after-fit': withState(product, states, resizeAfterFitAction),
    'world-rotation-series': withState(product, states, worldRotationSeriesAction),
    'resize-surface': withState(product, states, resizeSurfaceAction),
    'world-flip-matrix': withState(product, states, worldFlipMatrixAction),
    'view-dependent-feature-matrix': withState(
      product,
      states,
      viewDependentFeatureMatrixAction,
    ),
    'surface-resize-matrix': withState(product, states, surfaceResizeMatrixAction),
    'viewport-policy-lifecycle': withState(product, states, viewportPolicyLifecycleAction),
    'load-scene': withState(product, states, loadSceneAction),
    'restore-or-fit-view': withState(product, states, restoreOrFitViewAction),
    'pan-view': withState(product, states, panViewAction),
    'zoom-view': withState(product, states, zoomViewAction),
    'fit-view': withState(product, states, fitViewAction),
    'await-view-settle': withState(product, states, awaitViewSettleAction),
    'remount-and-restore-view': withState(product, states, remountAndRestoreViewAction),
    'probe-declared-failure': withState(product, states, probeDeclaredFailureAction),
  });
  return Object.freeze(VIEWPORT_ACTION_TYPES.map((type) => Object.freeze([
    `contract/${type}`,
    handlers[type],
  ])));
}

function withState(product, states, handler) {
  return async (contextValue, actionValue) => {
    const context = validateContext(contextValue);
    const actions = CASE_ACTIONS[context.caseId];
    assert(actions !== undefined, `unsupported case ${String(context.caseId)}`);
    const expectedType = actions[context.actionIndex];
    assert(expectedType !== undefined, `${context.caseId} action index`);
    const action = recordValue(actionValue, 'action');
    assertExactKeys(action, ['index', 'operands', 'type'], 'action');
    assert(action.index === context.actionIndex, 'action index');
    assert(action.type === expectedType, `${context.caseId} action type`);
    assert(!context.signal.aborted, 'action is aborted');

    let state = states.get(context.ensureSessionEngine);
    if (state === undefined) {
      state = {
        caseId: context.caseId,
        engine: null,
        session: 1,
        baselineLoaded: false,
        dataset: null,
        datasetRef: null,
        savedView: null,
        settledView: null,
        fitContributors: [],
        lifecycleGeneration: 1,
        longTaskAtLeast100Ms: 0,
      };
      states.set(context.ensureSessionEngine, state);
    }
    assert(state.caseId === context.caseId, 'execution state case identity');
    return handler(product, state, context, action);
  };
}

async function viewGestureSeriesAction(product, state, context, action) {
  assert(context.caseId === 'VIE-001', 'view gesture case');
  const operands = exactOperands(action, ['gestures']);
  const gestures = arrayValue(operands.gestures, 'view-gesture-series.gestures');
  const engine = await ensureBaseline(state, context);
  const setup = recordValue(context.fixtureParams, 'VIE-001 fixture params');
  const initialView = recordValue(setup.initialView, 'VIE-001 initial view');
  const initialCenter = [
    finiteNumber(initialView.x, 'VIE-001 initial x'),
    finiteNumber(initialView.y, 'VIE-001 initial y'),
  ];
  callSync(engine, 'setViewport', {
    centerWorld: initialCenter,
    scale: finiteNumber(initialView.scale, 'VIE-001 initial scale'),
  });

  const observed = {};
  for (const gestureValue of gestures) {
    const gesture = recordValue(gestureValue, 'VIE-001 gesture');
    switch (gesture.type) {
      case 'pan': {
        const from = pointTuple(gesture.from, 'VIE-001 pan from');
        const to = pointTuple(gesture.to, 'VIE-001 pan to');
        const result = callSync(engine, 'panViewport', [
          to[0] - from[0],
          to[1] - from[1],
        ], gesture.button === 1 ? 'middle-pointer' : 'pointer');
        observed.pan = { result: clone(result), from, to };
        break;
      }
      case 'wheel-zoom': {
        const anchor = pointTuple(gesture.anchorCss, 'VIE-001 wheel anchor');
        const deltaY = finiteNumber(gesture.deltaY, 'VIE-001 wheel deltaY');
        const before = callSync(engine, 'screenToWorld', pointRecord(anchor));
        const result = callSync(engine, 'zoomViewportAt', {
          factor: Math.exp(-deltaY * 0.001),
          anchorCss: anchor,
          source: gesture.ctrlKey ? 'modifier-wheel' : 'wheel',
        });
        const after = callSync(engine, 'screenToWorld', pointRecord(anchor));
        observed.zoom = {
          worldUnderCursorBefore: pointFromRecord(before, 'VIE-001 wheel before'),
          worldUnderCursorAfter: pointFromRecord(after, 'VIE-001 wheel after'),
          result: clone(result),
        };
        break;
      }
      case 'pinch': {
        const center = pointTuple(gesture.centerCss, 'VIE-001 pinch center');
        const before = callSync(engine, 'screenToWorld', pointRecord(center));
        const result = callSync(engine, 'zoomViewportAt', {
          factor: positiveFinite(gesture.scaleFactor, 'VIE-001 pinch factor'),
          anchorCss: center,
          source: 'pinch',
        });
        const after = callSync(engine, 'screenToWorld', pointRecord(center));
        observed.pinch = {
          worldUnderCenterBefore: pointFromRecord(before, 'VIE-001 pinch before'),
          worldUnderCenterAfter: pointFromRecord(after, 'VIE-001 pinch after'),
          result: clone(result),
        };
        break;
      }
      case 'decelerate': {
        const velocity = pointTuple(
          gesture.velocityCssPxPerMs,
          'VIE-001 deceleration velocity',
        );
        const advances = numberArray(gesture.advanceMs, 'VIE-001 deceleration advances');
        const started = callSync(engine, 'startViewportDeceleration', velocity);
        let previous = 0;
        const frames = advances.map((timeMs) => {
          assert(timeMs >= previous, 'VIE-001 deceleration times are ordered');
          const deltaMs = timeMs - previous;
          previous = timeMs;
          return clone(callSync(engine, 'advanceViewportMotion', deltaMs));
        });
        observed.deceleration = { started, frames };
        break;
      }
      default:
        throw new Error(`PatchMap viewport handler invalid: unknown gesture ${String(gesture.type)}`);
    }
  }
  const settled = callSync(engine, 'settleViewport');
  const geometry = requireGeometry(engine);
  const rect = requireGeometryEntity(geometry, 'rect-b');
  const hitPoint = boundsCenter(rect.screenBounds, 'VIE-001 rect screen bounds');
  const transformedHit = callSync(engine, 'hitTest', pointRecord(hitPoint));
  const actual = {
    ...observed,
    settled: clone(settled),
    viewport: clone(callSync(engine, 'viewportProbe')),
    transformedHit: { point: hitPoint, target: transformedHit },
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function setViewAction(product, state, context, action) {
  assert(context.caseId === 'VIE-002', 'set view case');
  const operands = exactOperands(action, ['centerWorld', 'scale']);
  const engine = await ensureBaseline(state, context);
  const before = callSync(engine, 'viewportProbe');
  const viewport = callSync(engine, 'setViewport', {
    centerWorld: pointTuple(operands.centerWorld, 'set-view.centerWorld'),
    scale: positiveFinite(operands.scale, 'set-view.scale'),
  });
  const actual = {
    before: clone(before),
    viewport: clone(viewport),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function settleViewAction(product, state, context, action) {
  assert(context.caseId === 'VIE-002', 'settle view case');
  const operands = exactOperands(action, ['advanceMs']);
  numberArray(operands.advanceMs, 'settle-view.advanceMs');
  const engine = await ensureBaseline(state, context);
  const settled = callSync(engine, 'settleViewport');
  state.settledView = clone(settled.viewport);
  const actual = {
    settled: clone(settled),
    persistence: clone(callSync(engine, 'viewportPersistenceProbe')),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function serializeViewAction(product, state, context, action) {
  assert(context.caseId === 'VIE-002', 'serialize view case');
  const operands = exactOperands(action, ['fields']);
  const fields = stringArray(operands.fields, 'serialize-view.fields');
  assert(
    sameJson(fields, ['centerWorld', 'scale']),
    'serialize-view supported fields',
  );
  const engine = await ensureBaseline(state, context);
  const serialized = callSync(engine, 'serializeViewport');
  const second = callSync(engine, 'serializeViewport');
  assert(sameJson(serialized, second), 'equivalent serialization identity');
  state.savedView = clone(serialized);
  const actual = {
    serialized: clone(serialized),
    repeated: clone(second),
    persistence: clone(callSync(engine, 'viewportPersistenceProbe')),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function remountAndRestoreAction(product, state, context, action) {
  assert(context.caseId === 'VIE-002', 'remount and restore case');
  const operands = exactOperands(action, ['centerWorld', 'scale']);
  const expectedInput = {
    centerWorld: pointTuple(operands.centerWorld, 'remount-and-restore.centerWorld'),
    scale: positiveFinite(operands.scale, 'remount-and-restore.scale'),
  };
  const saved = state.savedView ?? expectedInput;
  const release = await remountEngine(state, context, true);
  const engine = currentEngine(state, 'remount-and-restore');
  const restored = callSync(engine, 'restoreViewport', saved);
  const actual = {
    release,
    restored: clone(restored),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function restoreViewAction(product, state, context, action) {
  assert(context.caseId === 'VIE-002', 'invalid restore case');
  const operands = exactOperands(action, ['centerWorld', 'scale']);
  const engine = currentEngine(state, 'restore-view');
  const before = callSync(engine, 'viewportProbe');
  const restored = callSync(engine, 'restoreViewport', {
    centerWorld: nullablePointTuple(operands.centerWorld, 'restore-view.centerWorld'),
    scale: finiteOrNull(operands.scale, 'restore-view.scale'),
  });
  const actual = {
    before: clone(before),
    restored: clone(restored),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function focusTargetMatrixAction(product, state, context, action) {
  assert(context.caseId === 'VIE-003', 'focus matrix case');
  const operands = exactOperands(action, ['caseIds', 'filter']);
  const caseIds = stringArray(operands.caseIds, 'focus-target-matrix.caseIds');
  const filter = recordValue(operands.filter, 'focus-target-matrix.filter');
  const rejectIds = stringArray(filter.rejectIds, 'focus-target-matrix.filter.rejectIds');
  const setup = recordValue(context.fixtureParams, 'VIE-003 fixture params');
  const cases = indexNamedRecords(setup.cases, 'VIE-003 cases');
  const scale = positiveFinite(setup.scale, 'VIE-003 scale');
  const engine = await ensureBaseline(state, context);
  callSync(engine, 'setViewport', { centerWorld: [0, 0], scale });

  const results = {};
  for (const caseId of caseIds) {
    const input = requireMap(cases, caseId, `VIE-003 case ${caseId}`);
    const targets = nullableStringArray(input.targets, `VIE-003 ${caseId} targets`);
    const before = clone(callSync(engine, 'viewportProbe'));
    const result = callSync(engine, 'focusViewport', { targets, rejectIds });
    const geometry = requireGeometry(engine);
    const visibleBoundsCenterCss = result.contributors.length === 0
      ? null
      : result.contributors.length === 1
        ? boundsCenter(
            requireGeometryEntity(geometry, result.contributors[0].id).screenBounds,
            `VIE-003 ${caseId} screen bounds`,
          )
        : contributorsScreenCenter(geometry, result.contributors);
    results[caseId] = {
      before,
      result: clone(result),
      visibleBoundsCenterCss,
      after: clone(callSync(engine, 'viewportProbe')),
    };
  }
  const actual = {
    results,
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function focusContributorMatrixAction(product, state, context, action) {
  assert(context.caseId === 'VIE-003', 'focus contributors case');
  const operands = exactOperands(action, ['cases']);
  const engine = await ensureBaseline(state, context);
  const results = runContributorMatrix(engine, operands.cases, 'focus');
  const actual = {
    results,
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function fitTargetMatrixAction(product, state, context, action) {
  assert(context.caseId === 'VIE-004', 'fit matrix case');
  const operands = exactOperands(action, ['caseIds', 'flipX', 'rotationDegrees']);
  const caseIds = stringArray(operands.caseIds, 'fit-target-matrix.caseIds');
  const setup = recordValue(context.fixtureParams, 'VIE-004 fixture params');
  const paddingCases = indexNamedRecords(setup.paddingCases, 'VIE-004 padding cases');
  const targets = stringArray(setup.targets, 'VIE-004 targets');
  const engine = await ensureBaseline(state, context);
  callSync(engine, 'setWorldTransform', {
    rotationDegrees: finiteNumber(
      operands.rotationDegrees,
      'fit-target-matrix.rotationDegrees',
    ),
    flipX: booleanValue(operands.flipX, 'fit-target-matrix.flipX'),
    flipY: false,
  });
  const results = {};
  for (const caseId of caseIds) {
    const paddingCase = requireMap(
      paddingCases,
      caseId,
      `VIE-004 padding case ${caseId}`,
    );
    const padding = pointTuple(
      paddingCase.paddingCssPx,
      `VIE-004 ${caseId} padding`,
    );
    const result = callSync(engine, 'fitViewport', {
      targets,
      paddingCssPx: padding,
    });
    const geometry = requireGeometry(engine);
    results[caseId] = {
      result: clone(result),
      contentCss: screenUnionForIds(geometry, targets),
    };
  }
  const actual = {
    results,
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function fitTargetsAction(product, state, context, action) {
  assert(context.caseId === 'VIE-004', 'invalid fit case');
  const operands = exactOperands(action, ['paddingCssPx', 'targets']);
  const engine = await ensureBaseline(state, context);
  const before = clone(callSync(engine, 'viewportProbe'));
  let accepted = true;
  let error = null;
  try {
    callSync(engine, 'fitViewport', {
      targets: stringArray(operands.targets, 'fit-targets.targets'),
      paddingCssPx: pointTuple(operands.paddingCssPx, 'fit-targets.paddingCssPx'),
    });
  } catch (caught) {
    accepted = false;
    error = actualError(caught);
  }
  const after = clone(callSync(engine, 'viewportProbe'));
  const actual = {
    accepted,
    error,
    before,
    after,
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function fitContributorMatrixAction(product, state, context, action) {
  assert(context.caseId === 'VIE-004', 'fit contributors case');
  const operands = exactOperands(action, ['cases']);
  const engine = await ensureBaseline(state, context);
  const results = runContributorMatrix(engine, operands.cases, 'fit');
  const actual = {
    results,
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function resizeAfterFitAction(product, state, context, action) {
  assert(context.caseId === 'VIE-004', 'resize after fit case');
  const operands = exactOperands(action, ['preserveTargets', 'viewportCssPx']);
  const viewportCssPx = pointTuple(
    operands.viewportCssPx,
    'resize-after-fit.viewportCssPx',
  );
  const targets = stringArray(
    operands.preserveTargets,
    'resize-after-fit.preserveTargets',
  );
  const engine = await ensureBaseline(state, context);
  const fit = callSync(engine, 'fitViewport', {
    targets,
    paddingCssPx: 16,
  });
  const changed = callSync(engine, 'resize', viewportCssPx[0], viewportCssPx[1], 1);
  const geometry = requireGeometry(engine);
  const contentCss = screenUnionForIds(geometry, targets);
  const targetsVisible = boundsInsideViewport(contentCss, viewportCssPx);
  const actual = {
    changed,
    fit: clone(fit),
    viewportCssPx,
    contentCss,
    targetsVisible,
    viewport: clone(callSync(engine, 'viewportProbe')),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function worldRotationSeriesAction(product, state, context, action) {
  assert(context.caseId === 'VIE-005', 'world rotation case');
  const operands = exactOperands(action, ['operations']);
  const operations = arrayValue(
    operands.operations,
    'world-rotation-series.operations',
  );
  const setup = recordValue(context.fixtureParams, 'VIE-005 fixture params');
  const centerWorld = pointTuple(setup.centerWorld, 'VIE-005 centerWorld');
  const engine = await ensureBaseline(state, context);
  callSync(engine, 'setViewport', { centerWorld, scale: 1 });

  let world = clone(callSync(engine, 'viewportTransformProbe').world);
  const steps = [];
  let beforeInvalid = null;
  let invalid = null;
  for (const [index, operationValue] of operations.entries()) {
    const operation = recordValue(operationValue, `VIE-005 operation ${index}`);
    assertExactKeys(operation, ['degrees', 'op'], `VIE-005 operation ${index}`);
    const op = stringValue(operation.op, `VIE-005 operation ${index} op`);
    const beforeView = clone(callSync(engine, 'viewportProbe'));
    const beforeWorld = clone(world);
    let accepted = true;
    let error = null;
    try {
      let rotationDegrees;
      if (op === 'reset') {
        finiteNumber(operation.degrees, `VIE-005 operation ${index} degrees`);
        rotationDegrees = 0;
      } else if (op === 'set') {
        rotationDegrees = operation.degrees;
      } else {
        const degrees = finiteNumber(
          operation.degrees,
          `VIE-005 operation ${index} degrees`,
        );
        assert(op === 'add', `VIE-005 operation ${index} supported op`);
        rotationDegrees = beforeWorld.rotationDegrees + degrees;
      }
      world = clone(callSync(engine, 'setWorldTransform', {
        rotationDegrees,
        flipX: beforeWorld.flipX,
        flipY: beforeWorld.flipY,
      }));
    } catch (caught) {
      accepted = false;
      error = actualError(caught);
      world = clone(callSync(engine, 'viewportTransformProbe').world);
      beforeInvalid = { view: beforeView, world: beforeWorld };
      invalid = {
        accepted,
        error,
        view: clone(callSync(engine, 'viewportProbe')),
        world: clone(world),
      };
    }
    steps.push({
      index,
      op,
      accepted,
      error,
      world: clone(world),
      viewport: clone(callSync(engine, 'viewportProbe')),
    });
  }
  assert(beforeInvalid !== null && invalid !== null, 'VIE-005 invalid rotation observed');
  const actual = {
    steps,
    beforeInvalid,
    invalid,
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function resizeSurfaceAction(product, state, context, action) {
  assert(context.caseId === 'VIE-005', 'rotation resize case');
  const operands = exactOperands(action, ['devicePixelRatio', 'viewportCssPx']);
  const viewportCssPx = pointTuple(
    operands.viewportCssPx,
    'resize-surface.viewportCssPx',
  );
  const devicePixelRatio = positiveFinite(
    operands.devicePixelRatio,
    'resize-surface.devicePixelRatio',
  );
  const engine = await ensureBaseline(state, context);
  const before = clone(callSync(engine, 'viewportTransformProbe'));
  const changed = callSync(
    engine,
    'resize',
    viewportCssPx[0],
    viewportCssPx[1],
    devicePixelRatio,
  );
  callSync(engine, 'publishFrame');
  const after = clone(callSync(engine, 'viewportTransformProbe'));
  const geometry = requireGeometry(engine);
  const rect = requireGeometryEntity(geometry, 'rect-b');
  const hitPoint = boundsCenter(rect.screenBounds, 'VIE-005 rect screen bounds');
  const transformedHit = callSync(engine, 'hitTest', pointRecord(hitPoint));
  const actual = {
    changed,
    before,
    after,
    transformedHit: { point: hitPoint, target: transformedHit },
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function worldFlipMatrixAction(product, state, context, action) {
  assert(context.caseId === 'VIE-006', 'world flip case');
  const operands = exactOperands(action, ['cases']);
  const caseIds = stringArray(operands.cases, 'world-flip-matrix.cases');
  const setup = recordValue(context.fixtureParams, 'VIE-006 fixture params');
  const centerWorld = pointTuple(setup.centerWorld, 'VIE-006 centerWorld');
  const cases = arrayValue(setup.cases, 'VIE-006 cases');
  assert(caseIds.length === cases.length, 'VIE-006 case count');
  const engine = await ensureBaseline(state, context);
  callSync(engine, 'setViewport', { centerWorld, scale: 1 });

  const results = [];
  for (const [index, caseId] of caseIds.entries()) {
    const input = recordValue(cases[index], `VIE-006 ${caseId}`);
    assertExactKeys(
      input,
      ['flipX', 'flipY', 'rotationDegrees'],
      `VIE-006 ${caseId}`,
    );
    const world = callSync(engine, 'setWorldTransform', {
      rotationDegrees: finiteNumber(
        input.rotationDegrees,
        `VIE-006 ${caseId} rotationDegrees`,
      ),
      flipX: booleanValue(input.flipX, `VIE-006 ${caseId} flipX`),
      flipY: booleanValue(input.flipY, `VIE-006 ${caseId} flipY`),
    });
    const geometry = requireGeometry(engine);
    const rect = requireGeometryEntity(geometry, 'rect-b');
    const hitPoint = boundsCenter(rect.screenBounds, `VIE-006 ${caseId} rect bounds`);
    results.push({
      id: caseId,
      world: clone(world),
      viewport: clone(callSync(engine, 'viewportProbe')),
      hit: callSync(engine, 'hitTest', pointRecord(hitPoint)),
    });
  }
  const geometry = requireGeometry(engine);
  const relation = geometry.relations.find((candidate) =>
    candidate.sourceId === 'item-a' && candidate.targetId === 'rect-b');
  assert(relation !== undefined, 'VIE-006 item-a to rect-b relation');
  const text = geometry.entities.find((candidate) =>
    candidate.kind === 'text' &&
    candidate.visible === true &&
    candidate.contentOrientation === 'upright');
  assert(text !== undefined, 'VIE-006 upright text geometry');
  const actual = {
    results,
    final: clone(callSync(engine, 'viewportTransformProbe').world),
    relation: {
      sourceTargetOrder: [relation.sourceId, relation.targetId],
    },
    text: {
      id: text.id,
      contentOrientation: text.contentOrientation ?? null,
      screenBasis: text.screenBasis ?? null,
      upright: text.contentOrientation === 'upright' &&
        (text.screenBasis === undefined || basisNearIdentity(text.screenBasis)),
    },
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function viewDependentFeatureMatrixAction(product, state, context, action) {
  assert(context.caseId === 'VIE-006', 'world flip dependent features case');
  const operands = exactOperands(action, ['cases', 'features']);
  const caseIds = stringArray(
    operands.cases,
    'view-dependent-feature-matrix.cases',
  );
  const features = stringArray(
    operands.features,
    'view-dependent-feature-matrix.features',
  );
  assert(
    sameJson(features, ['focus', 'fit', 'transformer']),
    'VIE-006 supported feature order',
  );
  const setup = recordValue(context.fixtureParams, 'VIE-006 fixture params');
  const cases = arrayValue(setup.cases, 'VIE-006 cases');
  assert(caseIds.length === cases.length, 'VIE-006 dependent case count');
  const engine = await ensureBaseline(state, context);
  const viewportCssPx = fixtureViewportSize(context.fixtureParams);
  const results = [];

  for (const [index, caseId] of caseIds.entries()) {
    const input = recordValue(cases[index], `VIE-006 ${caseId}`);
    callSync(engine, 'setWorldTransform', {
      rotationDegrees: finiteNumber(
        input.rotationDegrees,
        `VIE-006 ${caseId} rotationDegrees`,
      ),
      flipX: booleanValue(input.flipX, `VIE-006 ${caseId} flipX`),
      flipY: booleanValue(input.flipY, `VIE-006 ${caseId} flipY`),
    });

    const focus = callSync(engine, 'focusViewport', { targets: ['rect-b'] });
    let geometry = requireGeometry(engine);
    const focusedRect = requireGeometryEntity(geometry, 'rect-b');
    const focusCorrect = pointNear(
      boundsCenter(focusedRect.screenBounds, `VIE-006 ${caseId} focus bounds`),
      [viewportCssPx[0] / 2, viewportCssPx[1] / 2],
    );

    const fit = callSync(engine, 'fitViewport', {
      targets: ['item-a', 'rect-b'],
      paddingCssPx: 16,
    });
    geometry = requireGeometry(engine);
    const fitBounds = screenUnionForIds(geometry, ['item-a', 'rect-b']);
    const fitCorrect = fit.status === 'applied' &&
      boundsInsideViewport(fitBounds, viewportCssPx);

    callSync(engine, 'select', ['rect-b']);
    const visual = callSync(engine, 'selectionVisualProbe');
    geometry = requireGeometry(engine);
    const transformerRect = requireGeometryEntity(geometry, 'rect-b');
    const transformerCorrect = visual !== null &&
      visual.frame !== null &&
      visual.frame.kind === 'oriented' &&
      pointNear(
        boundsCenter(
          visual.frame.screenBounds,
          `VIE-006 ${caseId} transformer frame`,
        ),
        boundsCenter(
          transformerRect.screenBounds,
          `VIE-006 ${caseId} transformer target`,
        ),
      );
    results.push({
      id: caseId,
      focus: { correct: focusCorrect, result: clone(focus) },
      fit: { correct: fitCorrect, result: clone(fit), bounds: fitBounds },
      transformer: {
        correct: transformerCorrect,
        visual: visual === null ? null : clone(visual),
      },
    });
  }

  const actual = {
    results,
    final: clone(callSync(engine, 'viewportTransformProbe').world),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function surfaceResizeMatrixAction(product, state, context, action) {
  assert(context.caseId === 'VIE-007', 'surface resize matrix case');
  const operands = exactOperands(action, ['phases', 'sizes']);
  const phases = stringArray(operands.phases, 'surface-resize-matrix.phases');
  const sizes = arrayValue(operands.sizes, 'surface-resize-matrix.sizes')
    .map((sizeValue, index) => {
      const size = recordValue(sizeValue, `surface-resize-matrix.sizes[${index}]`);
      assertExactKeys(size, ['css', 'dpr'], `surface-resize-matrix.sizes[${index}]`);
      return Object.freeze({
        css: pointTuple(size.css, `surface-resize-matrix.sizes[${index}].css`),
        dpr: positiveFinite(size.dpr, `surface-resize-matrix.sizes[${index}].dpr`),
      });
    });
  assert(
    sameJson(phases, ['idle', 'animation', 'pan', 'transform', 'capture']),
    'VIE-007 supported phase order',
  );
  const engine = await ensureBaseline(state, context);
  const initialProbe = clone(callSync(engine, 'viewportTransformProbe'));
  const rows = [];

  for (const [phaseIndex, phase] of phases.entries()) {
    let activePointerId = null;
    if (phase === 'animation') {
      const patch = callSync(
        engine,
        'patch',
        { kind: 'component', ownerId: 'item-a', id: 'bar' },
        { size: { height: 20 } },
      );
      assert(
        patch.status === 'committed' || patch.status === 'unchanged',
        'VIE-007 animation phase patch',
      );
    } else if (phase === 'pan') {
      activePointerId = 7_000 + phaseIndex;
      callSync(engine, 'beginOwnedPointerGesture', 'pan', activePointerId);
    } else if (phase === 'transform') {
      activePointerId = 7_000 + phaseIndex;
      callSync(engine, 'beginTransformerEdit', {
        pointerId: activePointerId,
        actionId: 'VIE-007-resize-transform',
        kind: 'move',
        handle: 'frame',
        selectionIds: ['rect-b'],
      });
      const preview = callSync(engine, 'previewTransformerEdit', activePointerId, {
        kind: 'move',
        selectionIds: ['rect-b'],
        deltaWorld: [2, 1],
      });
      assert(
        preview.status === 'previewed' || preview.status === 'unchanged',
        'VIE-007 transform phase preview',
      );
    }

    try {
      for (const [sizeIndex, size] of sizes.entries()) {
        const before = clone(callSync(engine, 'viewportTransformProbe'));
        const beforeRevisions = clone(callSync(engine, 'snapshot').revisions);
        const changed = callSync(
          engine,
          'resize',
          size.css[0],
          size.css[1],
          size.dpr,
        );
        callSync(engine, 'publishFrame');
        const after = clone(callSync(engine, 'viewportTransformProbe'));
        const afterRevisions = clone(callSync(engine, 'snapshot').revisions);
        rows.push({
          phase,
          phaseIndex,
          sizeIndex,
          css: size.css,
          dpr: size.dpr,
          changed,
          centerPolicyApplicationCount:
            after.resizePolicyApplicationCount -
            before.resizePolicyApplicationCount,
          viewRevisionDelta:
            afterRevisions.viewRevision - beforeRevisions.viewRevision,
          pointerTransformRevision: after.pointerTransformRevision,
          centerWorld: clone(callSync(engine, 'viewportProbe').centerWorld),
          frameRevision: callSync(engine, 'snapshot').frameRevision,
          visiblePrimitiveCount:
            callSync(engine, 'snapshot').resources.rendering.visiblePrimitiveCount,
        });
      }
    } finally {
      if (phase === 'pan' && activePointerId !== null) {
        callSync(engine, 'terminateOwnedPointerGesture', 'pointer-up-outside');
      } else if (phase === 'transform' && activePointerId !== null) {
        callSync(engine, 'cancelTransformerEdit', activePointerId, 'redraw');
      }
    }
  }

  const finalProbe = clone(callSync(engine, 'viewportTransformProbe'));
  const finalSnapshot = clone(callSync(engine, 'snapshot'));
  const actual = {
    rows,
    changedResizeRows: rows.filter(({ changed }) => changed),
    centerPolicyApplicationCountByResize: rows
      .filter(({ changed }) => changed)
      .map(({ centerPolicyApplicationCount }) => centerPolicyApplicationCount),
    pointerTransformRevision: finalProbe.pointerTransformRevision,
    blackFrameCount: finalProbe.blackFrameCount - initialProbe.blackFrameCount,
    final: {
      canvasCount: finalProbe.surface.canvasCount,
      cssSize: finalProbe.surface.cssSize,
      backingSize: finalProbe.surface.backingSize,
      frameRevision: finalSnapshot.frameRevision,
      visiblePrimitiveCount:
        finalSnapshot.resources.rendering.visiblePrimitiveCount,
    },
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function viewportPolicyLifecycleAction(product, state, context, action) {
  assert(context.caseId === 'VIE-008', 'viewport policy case');
  const operands = exactOperands(action, ['operations']);
  const operations = arrayValue(
    operands.operations,
    'viewport-policy-lifecycle.operations',
  );
  let engine = await ensureInitializedEngine(state, context);
  const disabled = {};
  const removed = {};
  let afterDoubleStart = null;
  let beforeTemporary = null;
  let afterTemporary = null;
  let destroyed = null;
  let oldLifecycleAfterDestroy = 0;
  let release = null;

  for (const operationValue of operations) {
    const operation = recordValue(operationValue, 'viewport policy operation');
    const op = stringValue(operation.op, 'viewport policy operation op');
    if (op === 'probe-disabled' || op === 'probe-removed') {
      const policy = stringValue(operation.policy, `${op}.policy`);
      const delta = probeDisabledViewportPolicy(engine, policy, operation.input);
      if (op === 'probe-disabled') disabled[policy] = delta;
      else removed[policy] = delta;
      continue;
    }
    if (op === 'destroy') {
      let observed = 0;
      const unsubscribe = callSync(engine, 'on', 'viewChanged', () => {
        observed += 1;
      });
      release = await context.releaseEngine(engine, 'viewport-policy-destroy');
      destroyed = clone(callSync(engine, 'viewportPolicyProbe'));
      try {
        callSync(engine, 'panViewport', [1, 1], 'pointer');
      } catch {
        // A destroyed Engine must refuse new input without emitting old callbacks.
      }
      oldLifecycleAfterDestroy = observed;
      unsubscribe();
      state.engine = null;
      continue;
    }
    if (op === 'remount') {
      state.session += 1;
      state.lifecycleGeneration += 1;
      engine = await ensureInitializedEngine(state, context);
      continue;
    }
    if (op === 'restore-temporary') {
      afterTemporary = clone(callSync(engine, 'configureViewportPolicy', { op }));
      continue;
    }
    if (op === 'cancel-all' || op === 'redraw') {
      callSync(engine, 'configureViewportPolicy', { op });
      continue;
    }
    const policy = stringValue(operation.policy, `viewport policy ${op}`);
    if (op === 'temporary') {
      beforeTemporary = clone(callSync(engine, 'viewportPolicyProbe'));
      callSync(engine, 'configureViewportPolicy', { op, policy });
      continue;
    }
    assert(
      op === 'add' || op === 'start' || op === 'stop' || op === 'remove',
      `unsupported viewport policy operation ${op}`,
    );
    const probe = callSync(engine, 'configureViewportPolicy', { op, policy });
    if (op === 'start' && policy === 'pan') afterDoubleStart = clone(probe);
  }

  assert(destroyed !== null, 'viewport policy destroy observed');
  assert(afterDoubleStart !== null, 'viewport policy double start observed');
  assert(beforeTemporary !== null && afterTemporary !== null, 'temporary policy observed');
  const actual = {
    disabled,
    removed,
    afterDoubleStart,
    beforeTemporary,
    afterTemporary,
    destroyed,
    oldLifecycleAfterDestroy,
    release,
    remounted: clone(callSync(engine, 'viewportPolicyProbe')),
    lifecycleGeneration: state.lifecycleGeneration,
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function loadSceneAction(product, state, context, action) {
  assert(context.caseId === 'CSM-009' || context.caseId === 'CSM-010', 'load scene journey');
  const operands = recordValue(action.operands, 'load-scene operands');
  assertAllowedKeys(
    operands,
    ['datasetRef', 'generatorRef', 'hostRevision'],
    'load-scene operands',
  );
  const hostRevision = positiveInteger(operands.hostRevision, 'load-scene.hostRevision');
  let dataset;
  let datasetRef;
  if (operands.datasetRef !== undefined) {
    datasetRef = stringValue(operands.datasetRef, 'load-scene.datasetRef');
    dataset = await context.resolveDataset(datasetRef);
  } else {
    const generatorRef = stringValue(
      operands.generatorRef,
      'load-scene.generatorRef',
    );
    dataset = product.productionDataset({
      caseId: context.caseId,
      generatorRef,
    });
    datasetRef = generatorRef;
  }
  const beforeFingerprint = context.fingerprint(dataset);
  // Engine construction belongs to focused-route setup; the immutable journey
  // begins at load-scene and measures the host-visible dataset operation.
  const engine = await ensureInitializedEngine(state, context);
  const result = await measureProductOperation(
    product,
    context,
    action,
    () => context.caseId === 'CSM-010'
      ? loadJourneyDataset(product, engine, dataset, { datasetRef })
      : callSync(engine, 'loadDataset', dataset, { datasetRef }),
    'load-scene:load',
  );
  const afterFingerprint = context.fingerprint(dataset);
  state.dataset = dataset;
  state.datasetRef = datasetRef;
  state.baselineLoaded = true;
  const actual = {
    hostRevision,
    datasetRef,
    result: clone(result),
    input: {
      beforeFingerprint,
      afterFingerprint,
      unchanged: beforeFingerprint === afterFingerprint,
    },
    product: observeProduct(product, context, engine),
  };
  return {
    actual,
    host: {
      operation: 'load-scene',
      input: { datasetRef, hostRevision },
      returned: clone(result),
    },
    captureSource: actual,
  };
}

async function restoreOrFitViewAction(product, state, context, action) {
  assert(context.caseId === 'CSM-009', 'restore or fit journey');
  const operands = recordValue(action.operands, 'restore-or-fit-view operands');
  assertAllowedKeys(
    operands,
    ['excludeKinds', 'fallback', 'savedViewId'],
    'restore-or-fit-view operands',
  );
  assert(operands.fallback === 'auto-fit', 'restore-or-fit fallback policy');
  if (operands.excludeKinds !== undefined) {
    stringArray(operands.excludeKinds, 'restore-or-fit excludeKinds');
  }
  const setup = recordValue(context.fixtureParams, 'CSM-009 fixture params');
  const savedViews = indexNamedRecords(setup.savedViews, 'CSM-009 saved views');
  const savedViewId = stringValue(operands.savedViewId, 'restore-or-fit.savedViewId');
  const saved = requireMap(savedViews, savedViewId, `CSM-009 saved view ${savedViewId}`);
  const engine = currentEngine(state, 'restore-or-fit-view');
  const before = clone(callSync(engine, 'viewportProbe'));
  const result = callSync(engine, 'restoreViewport', {
    centerWorld: nullablePointTuple(saved.centerWorld, `CSM-009 ${savedViewId} center`),
    scale: finiteOrNull(saved.scale, `CSM-009 ${savedViewId} scale`),
  });
  const contributors = result.fit?.contributors?.map(({ id }) => id) ?? [];
  if (result.status === 'fallback:auto-fit') state.fitContributors = contributors;
  const actual = {
    savedViewId,
    before,
    result: clone(result),
    contributors,
    product: observeProduct(product, context, engine),
  };
  return {
    actual,
    host: {
      operation: 'restore-or-fit-view',
      input: { savedViewId, fallback: 'auto-fit' },
      returned: clone(result),
    },
    captureSource: actual,
  };
}

async function panViewAction(product, state, context, action) {
  assert(context.caseId === 'CSM-010', 'pan journey');
  const operands = exactOperands(action, ['deltaCss', 'source']);
  const engine = currentEngine(state, 'pan-view');
  const result = await measureProductOperation(
    product,
    context,
    action,
    () => callSync(
      engine,
      'panViewport',
      pointTuple(operands.deltaCss, 'pan-view.deltaCss'),
      stringValue(operands.source, 'pan-view.source'),
    ),
  );
  const actual = {
    result: clone(result),
    product: observeProduct(product, context, engine),
  };
  return {
    actual,
    host: { operation: 'pan-view', returned: clone(result) },
    captureSource: actual,
  };
}

async function zoomViewAction(product, state, context, action) {
  assert(context.caseId === 'CSM-010', 'zoom journey');
  const operands = exactOperands(action, ['anchorCss', 'factor', 'source']);
  const engine = currentEngine(state, 'zoom-view');
  const result = await measureProductOperation(product, context, action, () =>
    callSync(engine, 'zoomViewportAt', {
      factor: positiveFinite(operands.factor, 'zoom-view.factor'),
      anchorCss: pointTuple(operands.anchorCss, 'zoom-view.anchorCss'),
      source: stringValue(operands.source, 'zoom-view.source'),
    }));
  const actual = {
    result: clone(result),
    product: observeProduct(product, context, engine),
  };
  return {
    actual,
    host: { operation: 'zoom-view', returned: clone(result) },
    captureSource: actual,
  };
}

async function fitViewAction(product, state, context, action) {
  assert(context.caseId === 'CSM-010', 'fit journey');
  const operands = exactOperands(action, ['paddingCss']);
  const engine = currentEngine(state, 'fit-view');
  const result = await measureProductOperation(product, context, action, () =>
    callSync(engine, 'fitViewport', {
      paddingCssPx: nonNegativeFinite(operands.paddingCss, 'fit-view.paddingCss'),
    }));
  state.fitContributors = result.contributors.map(({ id }) => id);
  const actual = {
    result: clone(result),
    product: observeProduct(product, context, engine),
  };
  return {
    actual,
    host: { operation: 'fit-view', returned: clone(result) },
    captureSource: actual,
  };
}

async function awaitViewSettleAction(product, state, context, action) {
  assert(context.caseId === 'CSM-010', 'settle journey');
  const operands = exactOperands(action, ['persistOnce']);
  assert(booleanValue(operands.persistOnce, 'await-view-settle.persistOnce'), 'persist once');
  const engine = currentEngine(state, 'await-view-settle');
  const measured = await measureProductOperation(product, context, action, () => {
    const settled = callSync(engine, 'settleViewport');
    const saved = callSync(engine, 'serializeViewport');
    const persistence = callSync(engine, 'viewportPersistenceProbe');
    return { persistence, saved, settled };
  });
  const { persistence, saved, settled } = measured;
  state.savedView = clone(saved);
  state.settledView = clone(settled.viewport);
  const actual = {
    settled: clone(settled),
    saved: clone(saved),
    persistence: clone(persistence),
    longTasks: clone(product.longTaskProbe()),
    product: observeProduct(product, context, engine),
  };
  return {
    actual,
    host: {
      operation: 'await-view-settle',
      returned: { settled: clone(settled), persistence: clone(persistence) },
    },
    captureSource: actual,
  };
}

async function remountAndRestoreViewAction(product, state, context, action) {
  assert(context.caseId === 'CSM-010', 'remount journey');
  const operands = exactOperands(action, ['lifecycleGeneration']);
  const requestedGeneration = positiveInteger(
    operands.lifecycleGeneration,
    'remount-and-restore-view.lifecycleGeneration',
  );
  assert(requestedGeneration === state.lifecycleGeneration + 1, 'next lifecycle generation');
  assert(state.savedView !== null, 'settled view exists before remount');
  const engine = currentEngine(state, 'remount-and-restore-view');
  const rebind = await measureProductOperation(
    product,
    context,
    action,
    () => callSync(engine, 'rebindHostLifecycle', requestedGeneration),
    'remount-and-restore-view:rebind-host',
  );
  const restored = await measureProductOperation(
    product,
    context,
    action,
    () => callSync(engine, 'restoreViewport', state.savedView),
    'remount-and-restore-view:restore',
  );
  const canvasCount = callSync(engine, 'snapshot').resources.canvasCount;
  state.lifecycleGeneration = requestedGeneration;
  const restoredView = clone(restored.viewport);
  const actual = {
    lifecycleGeneration: state.lifecycleGeneration,
    rebind: clone(rebind),
    restored: clone(restored),
    restoredView,
    sameAsSettled: sameJson(restoredView, state.settledView),
    canvasCount,
    product: observeProduct(product, context, engine),
  };
  return {
    actual,
    host: {
      operation: 'remount-and-restore-view',
      returned: {
        lifecycleGeneration: state.lifecycleGeneration,
        restored: clone(restored),
      },
    },
    captureSource: actual,
  };
}

async function probeDeclaredFailureAction(product, state, context, action) {
  assert(context.caseId === 'CSM-009' || context.caseId === 'CSM-010', 'declared failure journey');
  const operands = exactOperands(action, [
    'afterActionIndex',
    'expectedRollback',
    'injection',
    'isolate',
    'journeyId',
  ]);
  assert(booleanValue(operands.isolate, 'probe-declared-failure.isolate'), 'failure is isolated');
  assert(
    positiveOrZeroInteger(
      operands.afterActionIndex,
      'probe-declared-failure.afterActionIndex',
    ) === context.actionIndex - 1,
    'failure names preceding action',
  );
  assert(
    stringValue(operands.journeyId, 'probe-declared-failure.journeyId') === context.caseId,
    'failure journey identity',
  );
  recordValue(operands.injection, 'probe-declared-failure.injection');
  // expectedRollback is part of the immutable action language, but it is not
  // consulted. The rollback below is measured from the public product state.
  recordValue(operands.expectedRollback, 'probe-declared-failure.expectedRollback');
  const engine = currentEngine(state, 'probe-declared-failure');
  const beforeSnapshot = clone(callSync(engine, 'snapshot'));
  const beforeView = clone(callSync(engine, 'viewportProbe'));
  const beforePersistence = clone(callSync(engine, 'viewportPersistenceProbe'));
  let rollback;
  if (context.caseId === 'CSM-009') {
    let accepted = true;
    let diagnostic = null;
    try {
      callSync(engine, 'setViewport', {
        centerWorld: [Number.NaN, 80],
        scale: -1,
      });
    } catch (error) {
      accepted = false;
      diagnostic = actualError(error);
    }
    const afterSnapshot = clone(callSync(engine, 'snapshot'));
    const afterView = clone(callSync(engine, 'viewportProbe'));
    rollback = {
      accepted,
      diagnostic,
      invalidViewNeverPublished: !accepted && sameJson(beforeView, afterView),
      sceneUnchanged: sameSceneAuthority(beforeSnapshot, afterSnapshot),
    };
  } else {
    rollback = await measureProductOperation(product, context, action, () => {
      const fallback = callSync(engine, 'restoreViewport', {
        centerWorld: [null, 80],
        scale: -1,
      }, { paddingCssPx: 24 });
      const afterSnapshot = clone(callSync(engine, 'snapshot'));
      const afterPersistence = clone(callSync(engine, 'viewportPersistenceProbe'));
      return {
        invalidSavedViewFallback:
          fallback.status === 'fallback:auto-fit' ? 'fit' : fallback.status,
        duplicatePersistenceWrites:
          afterPersistence.persistenceWriteCount - beforePersistence.persistenceWriteCount,
        sceneUnchanged: sameSceneAuthority(beforeSnapshot, afterSnapshot),
        fallback: clone(fallback),
      };
    });
  }
  const longTasks = clone(product.longTaskProbe());
  state.longTaskAtLeast100Ms = nonNegativeInteger(
    longTasks.atLeast100MsCount,
    'long task count',
  );
  const actual = {
    rollback,
    beforeSnapshot,
    beforeView,
    longTasks,
    product: observeProduct(product, context, engine),
  };
  return {
    actual,
    host: {
      operation: 'probe-declared-failure',
      input: {
        journeyId: context.caseId,
        injection: clone(operands.injection),
      },
      returned: clone(rollback),
    },
    captureSource: actual,
  };
}

function runContributorMatrix(engine, casesValue, operation) {
  const cases = arrayValue(casesValue, `${operation} contributor cases`);
  const results = {};
  for (const caseValue of cases) {
    const input = recordValue(caseValue, `${operation} contributor case`);
    const id = stringValue(input.id, `${operation} contributor id`);
    const targets = stringArray(input.targets, `${operation} contributor targets`);
    const options = {
      targets,
      ...(input.rejectIds === undefined
        ? {}
        : { rejectIds: stringArray(input.rejectIds, `${operation} contributor rejectIds`) }),
      ...(input.endpointsAvailable === undefined
        ? {}
        : {
            relationEndpointsAvailable: booleanValue(
              input.endpointsAvailable,
              `${operation} contributor endpointsAvailable`,
            ),
          }),
    };
    // The immutable action also carries an `expected` documentation field. It
    // is intentionally ignored; only public Engine contributors are observed.
    if (input.expected !== undefined) {
      stringArray(input.expected, `${operation} contributor documented expected`);
    }
    const result = operation === 'focus'
      ? callSync(engine, 'focusViewport', options)
      : callSync(engine, 'fitViewport', { ...options, paddingCssPx: 16 });
    results[id] = {
      contributors: result.contributors.map(({ id: contributorId }) => contributorId),
      result: clone(result),
    };
  }
  return results;
}

function probeDisabledViewportPolicy(engine, policy, inputValue) {
  const input = recordValue(inputValue, `disabled ${policy} input`);
  const before = callSync(engine, 'viewportProbe');
  if (policy === 'pan') {
    const result = callSync(
      engine,
      'panViewport',
      pointTuple(input.deltaCss, 'disabled pan delta'),
      'pointer',
    );
    const after = callSync(engine, 'viewportProbe');
    return {
      delta: pointDistance(before.centerWorld, after.centerWorld),
      result: clone(result),
    };
  }
  if (policy === 'wheel') {
    const result = callSync(engine, 'zoomViewportAt', {
      factor: Math.exp(-finiteNumber(input.deltaY, 'disabled wheel deltaY') * 0.001),
      anchorCss: pointTuple(input.screen, 'disabled wheel screen'),
      source: 'wheel',
    });
    const after = callSync(engine, 'viewportProbe');
    return { delta: after.scale - before.scale, result: clone(result) };
  }
  if (policy === 'pinch') {
    const result = callSync(engine, 'zoomViewportAt', {
      factor: 1 + finiteNumber(input.scaleDelta, 'disabled pinch scaleDelta'),
      anchorCss: pointTuple(input.center, 'disabled pinch center'),
      source: 'pinch',
    });
    const after = callSync(engine, 'viewportProbe');
    return { delta: after.scale - before.scale, result: clone(result) };
  }
  if (policy === 'deceleration') {
    const started = callSync(engine, 'startViewportDeceleration', [0.5, -0.25]);
    const result = callSync(
      engine,
      'advanceViewportMotion',
      nonNegativeFinite(input.milliseconds, 'disabled deceleration milliseconds'),
    );
    const after = callSync(engine, 'viewportProbe');
    return {
      delta: pointDistance(before.centerWorld, after.centerWorld),
      started,
      result: clone(result),
    };
  }
  throw new Error(`PatchMap viewport handler invalid: cannot probe policy ${policy}`);
}

async function ensureBaseline(state, context) {
  const engine = await ensureInitializedEngine(state, context);
  if (BASELINE_CASES.has(context.caseId) && !state.baselineLoaded) {
    const profiles = recordValue(context.fixtureProfiles, 'fixture profiles');
    const profile = recordValue(
      profiles['viewport-transform-matrix'],
      'viewport-transform-matrix profile',
    );
    const datasetRef = stringValue(
      profile.datasetRef,
      'viewport-transform-matrix.datasetRef',
    );
    const dataset = await context.resolveDataset(datasetRef);
    callSync(engine, 'loadDataset', dataset, { datasetRef });
    state.dataset = dataset;
    state.datasetRef = datasetRef;
    state.baselineLoaded = true;
  }
  return engine;
}

async function ensureInitializedEngine(state, context) {
  const engine = state.engine ?? await context.ensureSessionEngine(state.session);
  state.engine = engine;
  const snapshot = callSync(engine, 'snapshot');
  if (snapshot.lifecycle === 'new') {
    const viewportCssPx = fixtureViewportSize(context.fixtureParams);
    await call(engine, 'initialize', {
      instanceId: `contract-${context.caseId.toLowerCase()}-${state.session}`,
      width: viewportCssPx[0],
      height: viewportCssPx[1],
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

async function remountEngine(state, context, reloadDataset) {
  const previous = currentEngine(state, 'remount');
  const release = await context.releaseEngine(previous, `viewport-remount:${state.session + 1}`);
  state.engine = null;
  state.session += 1;
  const engine = await ensureInitializedEngine(state, context);
  if (reloadDataset && state.dataset !== null) {
    callSync(engine, 'loadDataset', state.dataset, {
      datasetRef: state.datasetRef ?? `viewport-session-${state.session}`,
    });
  }
  return clone(release);
}

function currentEngine(state, operation) {
  assert(state.engine !== null, `${operation} engine exists`);
  return state.engine;
}

function observeProduct(product, context, engine) {
  const resources = product.resourceProbe({ caseId: context.caseId, engine });
  const resourceRecord = recordValue(resources, 'viewport product resource probe');
  const productEngine = recordValue(resourceRecord.engine, 'viewport product engine');
  const semantic = recordValue(productEngine.semantic, 'viewport product semantic');
  const geometry = productEngine.geometry;
  const semanticGeometry = recordValue(semantic.geometry, 'viewport semantic geometry');
  return deepFreeze({
    snapshot: clone(recordValue(productEngine.snapshot, 'viewport product snapshot')),
    semantic: clone(semantic),
    geometry: geometry === null ? null : clone(recordValue(geometry, 'viewport product geometry')),
    interactionOwnership:
      productEngine.interactionOwnership === null
        ? null
        : clone(recordValue(
            productEngine.interactionOwnership,
            'viewport interaction ownership',
          )),
    viewport: productEngine.viewport === null ? null : clone(productEngine.viewport),
    viewportTransform:
      productEngine.viewportTransform === null
        ? null
        : clone(productEngine.viewportTransform),
    persistence:
      productEngine.persistence === null ? null : clone(productEngine.persistence),
    policy: clone(recordValue(productEngine.policy, 'viewport policy probe')),
    quality: {
      nonFiniteCount: nonNegativeInteger(
        semanticGeometry.nonFiniteValueCount,
        'semantic non-finite geometry count',
      ),
      textUnpairedSurrogates: nonNegativeInteger(
        recordValue(semantic.text, 'viewport semantic text').unpairedSurrogateCount,
        'semantic unpaired surrogate count',
      ),
      unresolvedPaintIntents: nonNegativeInteger(
        recordValue(semantic.paint, 'viewport semantic paint').unresolvedCount,
        'semantic unresolved paint count',
      ),
    },
    runtime: clone(recordValue(resourceRecord.runtime, 'viewport runtime resources')),
  });
}

function requireGeometry(engine) {
  const geometry = callSync(engine, 'geometryProbe');
  assert(isRecord(geometry), 'geometry probe is available');
  assert(Array.isArray(geometry.entities), 'geometry entities');
  return geometry;
}

function requireGeometryEntity(geometry, id) {
  const entity = geometry.entities.find((candidate) =>
    isRecord(candidate) && candidate.id === id);
  assert(entity !== undefined, `geometry entity ${id}`);
  return entity;
}

function contributorsScreenCenter(geometry, contributors) {
  const ids = contributors.map(({ id }) => id);
  return boundsCenter(screenUnionForIds(geometry, ids), 'contributor screen union');
}

function screenUnionForIds(geometry, ids) {
  const bounds = ids.map((id) => {
    const entity = requireGeometryEntity(geometry, id);
    return boundsTuple(entity.screenBounds, `screen bounds ${id}`);
  });
  assert(bounds.length > 0, 'screen union requires bounds');
  const left = Math.min(...bounds.map((value) => value[0]));
  const top = Math.min(...bounds.map((value) => value[1]));
  const right = Math.max(...bounds.map((value) => value[0] + value[2]));
  const bottom = Math.max(...bounds.map((value) => value[1] + value[3]));
  return Object.freeze([left, top, right - left, bottom - top]);
}

function boundsInsideViewport(bounds, viewport) {
  const epsilon = 0.000_001;
  return bounds[0] >= -epsilon
    && bounds[1] >= -epsilon
    && bounds[0] + bounds[2] <= viewport[0] + epsilon
    && bounds[1] + bounds[3] <= viewport[1] + epsilon;
}

function boundsCenter(value, label) {
  const bounds = boundsTuple(value, label);
  return Object.freeze([
    bounds[0] + bounds[2] / 2,
    bounds[1] + bounds[3] / 2,
  ]);
}

function fixtureViewportSize(paramsValue) {
  const params = recordValue(paramsValue, 'fixture params');
  return params.viewportCssPx === undefined
    ? Object.freeze([800, 600])
    : pointTuple(params.viewportCssPx, 'fixture viewportCssPx');
}

function sameSceneAuthority(before, after) {
  return before.semanticHash === after.semanticHash
    && before.datasetRef === after.datasetRef
    && before.revisions.sceneRevision === after.revisions.sceneRevision;
}

function measureProductOperation(
  product,
  context,
  action,
  operation,
  actionType = action.type,
) {
  return product.measureProductTask({
    caseId: context.caseId,
    actionIndex: context.actionIndex,
    actionType,
  }, operation);
}

function loadJourneyDataset(product, engine, dataset, options) {
  const longTasks = recordValue(product.longTaskProbe(), 'journey long task probe');
  return longTasks.supported === true
    ? call(engine, 'loadDatasetAsync', dataset, options)
    : callSync(engine, 'loadDataset', dataset, options);
}

function validateProductAdapter(value) {
  const product = recordValue(value, 'product adapter');
  for (const method of [
    'longTaskProbe',
    'measureProductTask',
    'productionDataset',
    'resourceProbe',
  ]) {
    assert(typeof product[method] === 'function', `product adapter ${method}()`);
  }
  return product;
}

function validateContext(value) {
  const context = recordValue(value, 'context');
  assert(VIEWPORT_CASE_IDS.includes(context.caseId), 'context case identity');
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
  assert(isRecord(context.routeParams), 'context routeParams');
  assert(
    context.signal !== null && typeof context.signal === 'object',
    'context signal',
  );
  return context;
}

function exactOperands(action, keys) {
  const operands = recordValue(action.operands, `${action.type} operands`);
  assertExactKeys(operands, keys, `${action.type} operands`);
  return operands;
}

function indexNamedRecords(value, label) {
  const values = arrayValue(value, label);
  const result = new Map();
  for (const [index, entryValue] of values.entries()) {
    const entry = recordValue(entryValue, `${label}[${index}]`);
    const id = stringValue(entry.id, `${label}[${index}].id`);
    assert(!result.has(id), `${label} duplicate ${id}`);
    result.set(id, entry);
  }
  return result;
}

function requireMap(map, key, label) {
  const value = map.get(key);
  assert(value !== undefined, label);
  return value;
}

function nullableStringArray(value, label) {
  if (value === null) return null;
  return stringArray(value, label);
}

function stringArray(value, label) {
  return arrayValue(value, label).map((entry, index) =>
    stringValue(entry, `${label}[${index}]`));
}

function numberArray(value, label) {
  return arrayValue(value, label).map((entry, index) =>
    finiteNumber(entry, `${label}[${index}]`));
}

function pointTuple(value, label) {
  const tuple = arrayValue(value, label);
  assert(tuple.length === 2, `${label} length`);
  return Object.freeze([
    finiteNumber(tuple[0], `${label}[0]`),
    finiteNumber(tuple[1], `${label}[1]`),
  ]);
}

function nullablePointTuple(value, label) {
  const tuple = arrayValue(value, label);
  assert(tuple.length === 2, `${label} length`);
  return Object.freeze([
    finiteOrNull(tuple[0], `${label}[0]`),
    finiteOrNull(tuple[1], `${label}[1]`),
  ]);
}

function boundsTuple(value, label) {
  const tuple = arrayValue(value, label);
  assert(tuple.length === 4, `${label} length`);
  return Object.freeze(tuple.map((entry, index) =>
    finiteNumber(entry, `${label}[${index}]`)));
}

function pointFromRecord(value, label) {
  const point = recordValue(value, label);
  return Object.freeze([
    finiteNumber(point.x, `${label}.x`),
    finiteNumber(point.y, `${label}.y`),
  ]);
}

function pointRecord(value) {
  return Object.freeze({ x: value[0], y: value[1] });
}

function pointDistance(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}

function pointNear(left, right, epsilon = 0.000_001) {
  return pointDistance(left, right) <= epsilon;
}

function basisNearIdentity(value, epsilon = 0.000_001) {
  const basis = arrayValue(value, 'screen basis');
  return basis.length === 4 &&
    basis.every((entry, index) =>
      typeof entry === 'number' &&
      Number.isFinite(entry) &&
      Math.abs(entry - [1, 0, 0, 1][index]) <= epsilon);
}

function finiteOrNull(value, label) {
  if (value === null) return null;
  return finiteNumber(value, label);
}

function positiveFinite(value, label) {
  const number = finiteNumber(value, label);
  assert(number > 0, `${label} positive`);
  return number;
}

function nonNegativeFinite(value, label) {
  const number = finiteNumber(value, label);
  assert(number >= 0, `${label} non-negative`);
  return number;
}

function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} finite number`);
  return value;
}

function positiveInteger(value, label) {
  assert(Number.isInteger(value) && value > 0, `${label} positive integer`);
  return value;
}

function positiveOrZeroInteger(value, label) {
  assert(Number.isInteger(value) && value >= 0, `${label} non-negative integer`);
  return value;
}

function nonNegativeInteger(value, label) {
  assert(Number.isInteger(value) && value >= 0, `${label} non-negative integer`);
  return value;
}


function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} non-empty string`);
  return value;
}



function assertExactKeys(value, keys, label) {
  assertAllowedKeys(value, keys, label);
  for (const key of keys) assert(Object.hasOwn(value, key), `${label} missing ${key}`);
}

function assertAllowedKeys(value, keys, label) {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    assert(allowed.has(key), `${label} unknown ${key}`);
  }
}

function callSync(target, method, ...args) {
  assert(target !== null && typeof target === 'object', `${method} target`);
  const fn = target[method];
  assert(typeof fn === 'function', `${method}()`);
  const result = fn.apply(target, args);
  assert(
    result === null || typeof result !== 'object' || typeof result.then !== 'function',
    `${method}() must be synchronous`,
  );
  return result;
}

async function call(target, method, ...args) {
  assert(target !== null && typeof target === 'object', `${method} target`);
  const fn = target[method];
  assert(typeof fn === 'function', `${method}()`);
  return fn.apply(target, args);
}

function actualError(error) {
  return {
    name: error instanceof Error ? error.name : 'Error',
    message: error instanceof Error ? error.message : String(error),
  };
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
  if (!condition) throw new Error(`PatchMap viewport handler invalid: ${message}`);
}
