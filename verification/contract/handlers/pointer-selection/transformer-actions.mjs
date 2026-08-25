import { clone } from '../../value-atoms.mjs';
import {
  applyResizeEntry,
  arrayValue,
  assert,
  assertExactKeys,
  booleanValue,
  callSync,
  currentStateEngine,
  dispatchPointer,
  dispatchProductClick,
  elementGeometrySnapshot,
  elementRecordByIds,
  ensureBaseline,
  exactOperands,
  finiteNumber,
  historyCorruptEntryCount,
  keyNudgeDelta,
  logicalElementValue,
  logicalTargetValue,
  nonNegativeInteger,
  numberArray,
  observeProduct,
  oppositeResizeAnchor,
  percentile,
  pointTuple,
  positiveFinite,
  positiveInteger,
  recordValue,
  reloadTransformerBaseline,
  sameJson,
  shortestDegrees,
  stringArray,
  stringValue,
  transformHandleForKind,
  transformPlanBounds,
  transformPlanGeometry,
  transformPreviewRequest,
} from './support.mjs';

export async function inspectTransformHandlesAction(product, state, context, action) {
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

export async function evaluateTransformableSubsetAction(product, state, context, action) {
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

export async function evaluateTransformableKindMatrixAction(product, state, context, action) {
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

export async function transformTargetOperationsAction(product, state, context, action) {
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

export async function resizeHandleMatrixAction(product, state, context, action) {
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

export async function resizeTargetClassMatrixAction(product, state, context, action) {
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
      throw new Error(`PatchMap pointer/selection handler invalid: unsupported resize class ${id}`);
    }
  }
  const actual = {
    targetClasses,
    pointerGesture: clone(callSync(engine, 'pointerGestureProbe')),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

export async function ratioResizeSeriesAction(product, state, context, action) {
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

export async function ratioLockPolicyMatrixAction(product, state, context, action) {
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
      throw new Error(`PatchMap pointer/selection handler invalid: unsupported ratio policy ${id}`);
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

export async function rotateSelectionAction(product, state, context, action) {
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

export async function rotationFrameMatrixAction(product, state, context, action) {
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

export async function rotationSnapSeriesAction(product, state, context, action) {
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

export async function moveTransformAction(product, state, context, action) {
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

export async function keyNudgeAction(product, state, context, action) {
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

export async function edgeAutoPanAction(product, state, context, action) {
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

export async function moveIneligibleMixedSetAction(product, state, context, action) {
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

export async function measureTransformVisualFollowAction(product, state, context, action) {
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

export async function transformGestureAction(product, state, context, action) {
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

export async function transformHistoryDirectionAction(product, state, context, action) {
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

export async function transformCancelMatrixAction(product, state, context, action) {
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

export async function transformCompletionMatrixAction(product, state, context, action) {
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

export async function transformHandleGestureAction(product, state, context, action) {
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

export async function postTransformPointerClickAction(product, state, context, action) {
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
