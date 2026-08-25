import { clone } from '../../value-atoms.mjs';
import {
  arrayValue,
  assert,
  assertExactKeys,
  booleanValue,
  callSync,
  centerOfElement,
  currentLogicalIds,
  currentStateEngine,
  dispatchPointer,
  ensureBaseline,
  exactOperands,
  finiteNumber,
  logicalElementValue,
  modifierRecord,
  nonNegativeInteger,
  numberArray,
  numberTuple,
  observeProduct,
  pointRecord,
  pointTuple,
  positiveFinite,
  positiveInteger,
  recordConsumerSelection,
  recordValue,
  removeSceneElement,
  replaceSceneElement,
  retainSceneElements,
  sameJson,
  stringArray,
  stringValue,
} from './support.mjs';

export async function boxSelectionAction(product, state, context, action) {
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
export async function relationBoxIntersectionMatrixAction(product, state, context, action) {
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

export async function paintSelectionAction(product, state, context, action) {
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

export async function selectionVisualMatrixAction(product, state, context, action) {
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

export async function selectionEligibilityMatrixAction(product, state, context, action) {
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

export async function selectRelationEndpointsAction(product, state, context, action) {
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

export async function replaceEndpointAction(product, state, context, action) {
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

export async function removeRelationEndpointAction(product, state, context, action) {
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


export async function canvasUserSelectAction(product, state, context, action) {
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

export async function setExternalSelectionAction(product, state, context, action) {
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

export async function replaceSelectionSceneAction(product, state, context, action) {
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

export async function remountSelectionAction(product, state, context, action) {
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

export async function singleSelectAction(product, state, context, action) {
  assert(
    context.caseId === 'CSM-011' || context.caseId === 'CSM-020',
    'single-select case',
  );
  const operands = exactOperands(action, ['target']);
  const engine = await ensureBaseline(state, context);
  const target = stringValue(operands.target, 'single-select target');
  const change = callSync(engine, 'applySelection', {
    op: 'replace',
    ids: [target],
    source: 'canvas',
  });
  recordConsumerSelection(state, change.current);
  const actual = {
    target,
    change: clone(change),
    selectionTrace: state.consumerSelectionTrace.map(clone),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

export async function toggleSelectAction(product, state, context, action) {
  assert(
    context.caseId === 'CSM-011' || context.caseId === 'CSM-020',
    'toggle-select case',
  );
  const operands = exactOperands(action, ['target', 'modifier']);
  const engine = await ensureBaseline(state, context);
  assert(
    stringValue(operands.modifier, 'toggle-select modifier') === 'Shift',
    'toggle-select Shift modifier',
  );
  const target = stringValue(operands.target, 'toggle-select target');
  const change = callSync(engine, 'applySelection', {
    op: 'toggle',
    ids: [target],
    source: 'canvas',
  });
  recordConsumerSelection(state, change.current);
  const actual = {
    target,
    change: clone(change),
    selectionTrace: state.consumerSelectionTrace.map(clone),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

export async function selectRelatedTargetsAction(product, state, context, action) {
  assert(context.caseId === 'CSM-011', 'select-related-targets case');
  const operands = exactOperands(action, ['target', 'relationId']);
  const engine = await ensureBaseline(state, context);
  const target = stringValue(operands.target, 'related selection target');
  const relationId = stringValue(operands.relationId, 'related selection relation ID');
  const current = callSync(engine, 'snapshot').selectionIds;
  assert(current.includes(target), 'related selection source is selected');
  const result = callSync(
    engine,
    'selectRelationEndpoints',
    [relationId],
    'add',
    'canvas',
  );
  recordConsumerSelection(state, result.change.current);
  const actual = {
    target,
    relationId,
    resolvedTargets: result.targets.map(({ selectionId }) => selectionId),
    change: clone(result.change),
    selectionTrace: state.consumerSelectionTrace.map(clone),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

export async function consumerBoxSelectAction(product, state, context, action) {
  assert(
    context.caseId === 'CSM-011' || context.caseId === 'CSM-020',
    'box-select case',
  );
  const expectedKeys = context.caseId === 'CSM-011'
    ? ['boxWorld', 'predicate']
    : ['boxWorld', 'excludeLocked'];
  const operands = exactOperands(action, expectedKeys);
  const engine = await ensureBaseline(state, context);
  const box = numberTuple(operands.boxWorld, 4, 'box-select world bounds');
  const lockedIds = context.caseId === 'CSM-020'
    ? stringArray(context.fixtureParams.lockedIds, 'box-select locked IDs')
    : [];
  if (context.caseId === 'CSM-011') {
    const predicate = recordValue(operands.predicate, 'box-select predicate');
    assertExactKeys(predicate, ['locked', 'visible'], 'box-select predicate');
    assert(predicate.locked === false && predicate.visible === true, 'box-select predicate values');
  } else {
    assert(
      booleanValue(operands.excludeLocked, 'box-select excludeLocked'),
      'box-select excludes locked targets',
    );
  }
  const result = callSync(
    engine,
    'selectBox',
    [box[0], box[1]],
    [box[0] + box[2], box[1] + box[3]],
    {
      mode: 'replace',
      lockedIds,
      predicate: (target) => target.value.show !== false,
    },
  );
  recordConsumerSelection(state, result.change?.current ?? []);
  const actual = {
    targets: result.targets.map(({ selectionId }) => selectionId),
    lockedIds: clone(result.lockedIds),
    duplicateCount: result.duplicateCount,
    change: clone(result.change),
    selectionTrace: state.consumerSelectionTrace.map(clone),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

export async function clearConsumerSelectionAction(product, state, context, action) {
  assert(
    ['CSM-011', 'CSM-016', 'CSM-020', 'CSM-021'].includes(context.caseId),
    'clear-selection case',
  );
  const operands = exactOperands(action, ['source']);
  const engine = await ensureBaseline(state, context);
  const source = stringValue(operands.source, 'clear-selection source');
  const change = callSync(engine, 'applySelection', {
    op: 'clear',
    source: source === 'host' ? 'external' : 'canvas',
  });
  if (context.caseId !== 'CSM-016') recordConsumerSelection(state, change.current);
  if (context.caseId === 'CSM-020') state.contextMenuTarget = null;
  const actual = {
    source,
    change: clone(change),
    selectionTrace: state.consumerSelectionTrace.map(clone),
    contextMenuTarget: state.contextMenuTarget,
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

export async function applyHostSelectionAction(product, state, context, action) {
  assert(context.caseId === 'CSM-012', 'apply-host-selection case');
  const operands = exactOperands(action, ['selectedIds', 'highlightedIds']);
  const engine = await ensureBaseline(state, context);
  state.currentHostSelection = stringArray(
    operands.selectedIds,
    'host selected IDs',
  );
  state.currentHighlights = currentLogicalIds(
    engine,
    stringArray(operands.highlightedIds, 'host highlighted IDs'),
  );
  const selection = callSync(
    engine,
    'setExternalSelection',
    state.currentHostSelection,
  );
  state.currentHostSelection = clone(selection.change.current);
  const presentation = callSync(engine, 'setPresentationPolicy', {
    highlightIds: state.currentHighlights,
  });
  const actual = {
    selectedTargets: clone(selection.change.current),
    highlightedTargets: clone(presentation.policy.highlightIds ?? []),
    missingIds: clone(selection.missingIds),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

export async function userSelectAction(product, state, context, action) {
  assert(context.caseId === 'CSM-012', 'user-select case');
  const operands = exactOperands(action, ['target', 'mode']);
  const engine = await ensureBaseline(state, context);
  if (state.selectionHostUnbind === null) {
    state.selectionHostUnbind = callSync(
      engine,
      'bindSelectionHost',
      (publication) => {
        const selectedIds = clone(publication.selectedIds);
        state.selectionCallbacks.push(selectedIds);
        state.currentHostSelection = selectedIds;
      },
    );
  }
  const mode = stringValue(operands.mode, 'user-select mode');
  assert(['replace', 'add', 'toggle'].includes(mode), 'user-select mode');
  const target = stringValue(operands.target, 'user-select target');
  const change = callSync(engine, 'applySelection', {
    op: mode,
    ids: [target],
    source: 'canvas',
  });
  const actual = {
    change: clone(change),
    selectionCallbacks: state.selectionCallbacks.map(clone),
    highlightedTargets: clone(
      callSync(engine, 'presentationPolicyProbe').highlightIds ?? [],
    ),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

export async function redrawConsumerSceneAction(product, state, context, action) {
  assert(context.caseId === 'CSM-012', 'redraw-scene consumer case');
  const operands = exactOperands(action, ['datasetRef', 'hostRevision']);
  const engine = await ensureBaseline(state, context);
  const datasetRef = stringValue(operands.datasetRef, 'redraw datasetRef');
  const hostRevision = positiveInteger(operands.hostRevision, 'redraw host revision');
  const dataset = await context.resolveDataset(datasetRef);
  callSync(engine, 'loadDataset', dataset, {
    datasetRef: `${datasetRef}:host:${hostRevision}`,
  });
  const selection = callSync(
    engine,
    'setExternalSelection',
    state.currentHostSelection,
  );
  const presentation = callSync(engine, 'setPresentationPolicy', {
    highlightIds: state.currentHighlights,
  });
  callSync(engine, 'publishFrame', context.actionIndex + 300);
  const actual = {
    selectedTargets: clone(selection.change.current),
    highlightedTargets: clone(presentation.policy.highlightIds ?? []),
    selectionCallbacks: state.selectionCallbacks.map(clone),
    hostRevision,
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

export async function consumerPointerDownAction(product, state, context, action) {
  assert(context.caseId === 'CSM-015', 'pointerdown consumer case');
  const operands = exactOperands(action, ['target', 'modifiers', 'keydownObserved']);
  const engine = await ensureBaseline(state, context);
  const target = stringValue(operands.target, 'pointerdown target');
  const modifiers = modifierRecord(operands.modifiers, 'pointerdown modifiers');
  assert(operands.keydownObserved === false, 'pointerdown missed keydown');
  state.pointerScreen = centerOfElement(engine, target);
  const result = dispatchPointer(engine, {
    type: 'down',
    pointerId: 1,
    pointerType: 'mouse',
    button: 0,
    buttons: 1,
    screen: state.pointerScreen,
    timeMs: 100,
    ...modifiers,
  }, 0);
  const down = result.events.find(({ type }) => type === 'down');
  state.pointerShift = down?.payload.modifiers.shift === true;
  state.temporaryModifiers = state.pointerShift ? ['Shift'] : [];
  const actual = {
    pointerShift: state.pointerShift,
    temporaryModifiers: clone(state.temporaryModifiers),
    keydownObserved: false,
    pointerGesture: clone(callSync(engine, 'pointerGestureProbe')),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

export async function consumerPointerCancelAction(product, state, context, action) {
  assert(context.caseId === 'CSM-015', 'pointercancel consumer case');
  const operands = exactOperands(action, ['pointerId']);
  const engine = await ensureBaseline(state, context);
  const pointerId = nonNegativeInteger(operands.pointerId, 'pointercancel pointerId');
  dispatchPointer(engine, {
    type: 'cancel',
    pointerId,
    pointerType: 'mouse',
    button: 0,
    buttons: 0,
    screen: state.pointerScreen,
    timeMs: 116,
    shiftKey: state.pointerShift,
  }, 1);
  const probe = callSync(engine, 'pointerGestureProbe');
  state.temporaryModifiers = probe.activePointerCount === 0 ? [] : state.temporaryModifiers;
  const actual = {
    temporaryModifiers: clone(state.temporaryModifiers),
    selectionIds: clone(callSync(engine, 'snapshot').selectionIds),
    pointerGesture: clone(probe),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

export async function dispatchHostShortcutAction(product, state, context, action) {
  assert(context.caseId === 'CSM-015', 'dispatch-host-shortcut case');
  const operands = exactOperands(action, ['targetType', 'key', 'modifiers']);
  const engine = await ensureBaseline(state, context);
  const targetType = stringValue(operands.targetType, 'host shortcut target type');
  const key = stringValue(operands.key, 'host shortcut key');
  modifierRecord(operands.modifiers, 'host shortcut modifiers');
  const coreIntercepted = callSync(engine, 'ownsKeyboardInput', targetType);
  state.hostShortcut = {
    targetType,
    key,
    coreIntercepted,
    browserDefaultPreserved: !coreIntercepted,
  };
  const actual = {
    hostShortcut: clone(state.hostShortcut),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

export async function selectConsumerTargetsAction(product, state, context, action) {
  assert(context.caseId === 'CSM-016', 'select-targets consumer case');
  const operands = exactOperands(action, ['targets', 'mode']);
  const engine = await ensureBaseline(state, context);
  const mode = stringValue(operands.mode, 'command selection mode');
  assert(['replace', 'add', 'toggle'].includes(mode), 'command selection mode');
  const change = callSync(engine, 'applySelection', {
    op: mode,
    ids: stringArray(operands.targets, 'command selection targets'),
    source: 'external',
  });
  const actual = {
    change: clone(change),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

export async function snapshotCommandTargetsAction(product, state, context, action) {
  assert(context.caseId === 'CSM-016', 'snapshot-command-targets case');
  const operands = exactOperands(action, ['commandId']);
  const engine = await ensureBaseline(state, context);
  state.commandState = callSync(
    engine,
    'snapshotCommandTargets',
    stringValue(operands.commandId, 'command ID'),
  );
  const actual = {
    commandState: clone(state.commandState),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

export async function applyCommandStatusAction(product, state, context, action) {
  assert(context.caseId === 'CSM-016', 'apply-command-status case');
  const operands = exactOperands(action, ['commandId', 'statuses']);
  const engine = await ensureBaseline(state, context);
  const commandId = stringValue(operands.commandId, 'command status ID');
  assert(state.commandState?.commandId === commandId, 'command status open state');
  for (const status of stringArray(operands.statuses, 'command statuses')) {
    const result = callSync(
      engine,
      'applyCommandTargetStatus',
      state.commandState,
      status,
    );
    assert(result.status === 'applied', `command status ${status}`);
    state.commandState = result.state;
    callSync(engine, 'setPresentationPolicy', {
      highlightIds: status === 'released' ? null : state.commandState.targetIds,
    });
  }
  const actual = {
    commandState: clone(state.commandState),
    selectionAfterStatus: clone(callSync(engine, 'snapshot').selectionIds),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

export async function drillDownAction(product, state, context, action) {
  assert(context.caseId === 'CSM-020', 'drill-down case');
  const operands = exactOperands(action, ['target', 'clickCount']);
  const engine = await ensureBaseline(state, context);
  const target = recordValue(operands.target, 'drill-down target');
  assertExactKeys(target, ['ownerId', 'id'], 'drill-down target');
  const targetId = `${stringValue(target.ownerId, 'drill-down owner')}/${
    stringValue(target.id, 'drill-down component')
  }`;
  const clickCount = positiveInteger(operands.clickCount, 'drill-down click count');
  const resolved = callSync(engine, 'resolveSelectionInteraction', targetId, {
    unit: 'closest-group',
    clickCount,
  });
  assert(resolved !== null && resolved.resolved.kind === 'component', 'drill-down component');
  const change = callSync(engine, 'applySelection', {
    op: 'replace',
    ids: [targetId],
    source: 'canvas',
  });
  recordConsumerSelection(state, change.current);
  const actual = {
    targetId,
    resolved: clone(resolved),
    change: clone(change),
    selectionTrace: state.consumerSelectionTrace.map(clone),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

export async function secondaryClickAction(product, state, context, action) {
  assert(context.caseId === 'CSM-020', 'secondary-click case');
  const operands = exactOperands(action, ['target']);
  const engine = await ensureBaseline(state, context);
  const target = stringValue(operands.target, 'secondary-click target');
  const screen = centerOfElement(engine, target);
  const rootOwned = callSync(engine, 'ownsContextMenu', pointRecord(screen));
  const resolved = callSync(engine, 'resolveSelectionInteraction', target, {
    unit: 'closest-group',
    clickCount: 1,
  });
  const owned = resolved !== null;
  const change = callSync(engine, 'applySelection', {
    op: 'replace',
    ids: owned ? [target] : [],
    source: 'canvas',
  });
  state.contextMenuTarget = owned ? target : null;
  recordConsumerSelection(state, change.current);
  const actual = {
    targetId: state.contextMenuTarget,
    owned,
    rootOwned,
    resolved: clone(resolved),
    change: clone(change),
    selectionTrace: state.consumerSelectionTrace.map(clone),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

export async function selectFromSidebarAction(product, state, context, action) {
  assert(context.caseId === 'CSM-021', 'select-from-sidebar case');
  const operands = exactOperands(action, ['target']);
  const engine = await ensureBaseline(state, context);
  const target = stringValue(operands.target, 'sidebar target');
  const change = callSync(engine, 'applySelection', {
    op: 'replace',
    ids: [target],
    source: 'external',
  });
  recordConsumerSelection(state, change.current);
  const actual = {
    change: clone(change),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

export async function rangeSelectFromSidebarAction(product, state, context, action) {
  assert(context.caseId === 'CSM-021', 'range-select-from-sidebar case');
  const operands = exactOperands(action, ['anchor', 'target', 'excludeLocked']);
  const engine = await ensureBaseline(state, context);
  assert(
    booleanValue(operands.excludeLocked, 'sidebar range excludeLocked'),
    'sidebar range excludes locked',
  );
  const order = stringArray(context.fixtureParams.sidebarOrder, 'sidebar order');
  const anchor = stringValue(operands.anchor, 'sidebar range anchor');
  const target = stringValue(operands.target, 'sidebar range target');
  const anchorIndex = order.indexOf(anchor);
  const targetIndex = order.indexOf(target);
  assert(anchorIndex >= 0 && targetIndex >= 0, 'sidebar range endpoints');
  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  const filtered = callSync(
    engine,
    'filterSelectionTargets',
    order.slice(start, end + 1),
    {
      lockedIds: stringArray(context.fixtureParams.lockedIds, 'sidebar locked IDs'),
    },
  );
  state.rangeSelection = filtered.map(({ selectionId }) => selectionId);
  const change = callSync(engine, 'applySelection', {
    op: 'replace',
    ids: state.rangeSelection,
    source: 'external',
  });
  recordConsumerSelection(state, change.current);
  const actual = {
    rangeSelection: clone(state.rangeSelection),
    change: clone(change),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

export async function renameTargetAction(product, state, context, action) {
  assert(context.caseId === 'CSM-021', 'rename-target case');
  const operands = exactOperands(action, ['target', 'label']);
  const engine = await ensureBaseline(state, context);
  const target = stringValue(operands.target, 'rename target');
  const label = stringValue(operands.label, 'rename label');
  const result = callSync(
    engine,
    'patch',
    { kind: 'element', id: target },
    { label },
  );
  assert(result.status === 'committed', 'rename target commit');
  const record = logicalElementValue(engine, target);
  state.renamedTarget = { id: target, label: record.label };
  const actual = {
    result: clone(result),
    renamedTarget: clone(state.renamedTarget),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

export async function revealTargetAction(product, state, context, action) {
  assert(context.caseId === 'CSM-021', 'reveal-target case');
  const operands = exactOperands(action, ['target']);
  const engine = await ensureBaseline(state, context);
  const target = stringValue(operands.target, 'reveal target');
  state.revealResult = callSync(engine, 'focusViewport', { targets: [target] });
  const actual = {
    target,
    result: clone(state.revealResult),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

export async function probeConsumerDeclaredFailureAction(product, state, context, action) {
  assert(context.caseId.startsWith('CSM-'), 'consumer declared failure case');
  const operands = exactOperands(
    action,
    ['journeyId', 'isolate', 'afterActionIndex', 'injection', 'expectedRollback'],
  );
  assert(
    stringValue(operands.journeyId, 'declared failure journey ID') === context.caseId,
    'declared failure journey identity',
  );
  assert(booleanValue(operands.isolate, 'declared failure isolation'), 'declared failure isolation');
  assert(
    nonNegativeInteger(
      operands.afterActionIndex,
      'declared failure afterActionIndex',
    ) === context.actionIndex - 1,
    'declared failure action boundary',
  );
  const injection = recordValue(operands.injection, 'declared failure injection');
  assertExactKeys(injection, ['id', 'diagnostic', 'mode'], 'declared failure injection');
  recordValue(operands.expectedRollback, 'declared failure rollback declaration');
  const engine = await ensureBaseline(state, context);
  const before = callSync(engine, 'snapshot');
  let rollback;
  let diagnosticCode = stringValue(
    injection.diagnostic,
    'declared failure diagnostic',
  );

  if (context.caseId === 'CSM-011') {
    const missing = callSync(engine, 'applySelection', {
      op: 'add',
      ids: ['missing-target'],
      source: 'external',
    });
    let predicateRejected = false;
    try {
      callSync(engine, 'selectBox', [0, 0], [220, 100], {
        mode: 'replace',
        predicate: () => {
          throw new Error('isolated invalid predicate');
        },
      });
    } catch {
      predicateRejected = true;
    }
    const after = callSync(engine, 'snapshot');
    rollback = {
      missingTargetIgnored: missing.changed === false,
      selectionRollbackOnInvalidPredicate:
        predicateRejected && sameJson(before.selectionIds, after.selectionIds),
      historyDepthDelta: after.historyDepth - before.historyDepth,
    };
  } else if (context.caseId === 'CSM-012') {
    const callbackCountBefore = state.selectionCallbacks.length;
    const priorSelection = clone(before.selectionIds);
    const result = callSync(
      engine,
      'setExternalSelection',
      [...priorSelection, 'missing-target'],
    );
    rollback = {
      unknownIdsDropped: result.missingIds.includes('missing-target'),
      callbackOnNoop: state.selectionCallbacks.length !== callbackCountBefore,
      priorValidSelectionRetainedOnInvalidInput: sameJson(
        result.change.current,
        priorSelection,
      ),
    };
  } else if (context.caseId === 'CSM-015') {
    const probe = callSync(engine, 'pointerGestureProbe');
    rollback = {
      clearTemporaryModifiers:
        state.temporaryModifiers.length === 0 && probe.activePointerCount === 0,
      selectionUnchangedOnCancel: sameJson(before.selectionIds, []),
      browserDefaultPreserved: state.hostShortcut?.browserDefaultPreserved === true,
    };
  } else if (context.caseId === 'CSM-016') {
    assert(state.commandState !== null, 'declared failure command state');
    const targetIds = clone(state.commandState.targetIds);
    const rejected = callSync(
      engine,
      'applyCommandTargetStatus',
      state.commandState,
      'active',
      'missing-target',
    );
    diagnosticCode = rejected.code;
    rollback = {
      missingCommandTargetReported: rejected.code === 'MISSING_TARGET',
      openCommandTargetIdsUnchanged: sameJson(
        rejected.state.targetIds,
        targetIds,
      ),
    };
  } else if (context.caseId === 'CSM-020') {
    const savedSelection = clone(before.selectionIds);
    callSync(engine, 'applySelection', {
      op: 'replace',
      ids: ['rect-b'],
      source: 'external',
    });
    const screen = centerOfElement(engine, 'rect-b');
    callSync(engine, 'ownsContextMenu', pointRecord(screen));
    const owned = callSync(
      engine,
      'resolveSelectionInteraction',
      'rect-b',
      { unit: 'closest-group', clickCount: 1 },
    ) !== null;
    let hostMenuFailureCaught = false;
    try {
      if (owned) throw new Error('isolated host menu failure');
    } catch {
      hostMenuFailureCaught = true;
    }
    const retained = clone(callSync(engine, 'snapshot').selectionIds);
    callSync(engine, 'applySelection', {
      op: 'replace',
      ids: savedSelection,
      source: 'external',
    });
    rollback = {
      lockedTargetExcluded: callSync(
        engine,
        'filterSelectionTargets',
        ['text-c'],
        { lockedIds: ['text-c'] },
      ).length === 0,
      blankClearsSelection: savedSelection.length === 0,
      hostMenuFailureKeepsSelection:
        hostMenuFailureCaught ? retained : [],
    };
  } else {
    assert(context.caseId === 'CSM-021', 'sidebar declared failure case');
    const savedSelection = clone(before.selectionIds);
    callSync(engine, 'applySelection', {
      op: 'replace',
      ids: state.rangeSelection,
      source: 'external',
    });
    const labelBefore = logicalElementValue(engine, 'rect-b').label;
    const result = callSync(
      engine,
      'patch',
      { kind: 'element', id: 'rect-b' },
      { label: 42 },
    );
    diagnosticCode = result.diagnostic?.code ?? 'UNCLASSIFIED';
    const selectionRollback = clone(callSync(engine, 'snapshot').selectionIds);
    const labelAfter = logicalElementValue(engine, 'rect-b').label;
    callSync(engine, 'applySelection', {
      op: 'replace',
      ids: savedSelection,
      source: 'external',
    });
    rollback = {
      invalidRenameCode: diagnosticCode,
      selectionRollback,
      lockedTargetUnchanged: labelAfter === labelBefore,
    };
  }

  const after = callSync(engine, 'snapshot');
  assert(
    sameJson(after.selectionIds, before.selectionIds),
    'declared failure preserves main selection',
  );
  const actual = {
    injectionId: stringValue(injection.id, 'declared failure injection ID'),
    diagnosticCode,
    rollback,
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}
