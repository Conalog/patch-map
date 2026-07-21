export const LAYOUT_ORDER_HANDLER_REVISION = 'core-v2-layout-order-handlers/1';

export const LAYOUT_ORDER_CASE_IDS = Object.freeze(['LAY-002', 'LAY-003']);
export const LAYOUT_ORDER_EXTENSION_CASE_IDS = Object.freeze([]);
export const LAYOUT_ORDER_ACTION_TYPES = Object.freeze([
  'loadPlacementMatrix',
  'observeBounds',
  'observePlacementMatrix',
  'loadDataset',
  'patch',
  'undo',
  'redo',
]);

const PLACEMENTS = Object.freeze([
  'left',
  'left-top',
  'left-bottom',
  'top',
  'right',
  'right-top',
  'right-bottom',
  'bottom',
  'center',
  'none',
]);

const CASES = Object.freeze({
  'LAY-002': Object.freeze({
    itemId: 'item',
    // Independently authored by DEC-OQ-007-PLACEMENT-NONE, not inferred from
    // the answer-shaped LAY-002 placementMatrix fixture field.
    sceneOrigin: Object.freeze({ x: 10, y: 20 }),
    trace: Object.freeze([
      traceAction('loadPlacementMatrix', { itemId: 'item' }),
      traceAction('observeBounds', { ownerId: 'item' }),
      traceAction('observePlacementMatrix', { valueRef: 'placementMatrix' }),
    ]),
  }),
  'LAY-003': Object.freeze({
    datasetId: 'stacking',
    // Render-neutral presentation fields come from the approved stacking
    // fixture profile; order remains authored only by fixture sibling zIndex.
    specimen: deepFreeze({
      size: { width: 20, height: 20 },
      origin: { x: 0, y: 0 },
      fills: ['#111111ff', '#222222ff', '#333333ff', '#444444ff'],
    }),
    trace: Object.freeze([
      traceAction('loadDataset', { datasetId: 'stacking' }),
      traceAction('patch', {
        targetId: 'low',
        changes: { attrs: { zIndex: 6 } },
      }),
      traceAction('undo', { timeMs: 10 }),
      traceAction('redo', { timeMs: 20 }),
    ]),
  }),
});

/** Register the expected-blind layout/order Engine action surface. */
export function createLayoutOrderHandlerEntries(product) {
  const adapter = validateProductAdapter(product);
  const states = new WeakMap();
  const handlers = Object.freeze({
    loadPlacementMatrix: withState(adapter, states, loadPlacementMatrixAction),
    observeBounds: withState(adapter, states, observeBoundsAction),
    observePlacementMatrix: withState(adapter, states, observePlacementMatrixAction),
    loadDataset: withState(adapter, states, loadStackingDatasetAction),
    patch: withState(adapter, states, patchStackingAction),
    undo: withState(adapter, states, undoStackingAction),
    redo: withState(adapter, states, redoStackingAction),
  });
  return Object.freeze(LAYOUT_ORDER_ACTION_TYPES.map((type) => Object.freeze([
    `contract/${type}`,
    handlers[type],
  ])));
}

function withState(adapter, states, handler) {
  return async (contextValue, actionValue) => {
    const context = validateContext(contextValue);
    const definition = CASES[context.caseId];
    assert(definition !== undefined, `unsupported case ${String(context.caseId)}`);
    assert(Number.isInteger(context.actionIndex), 'context actionIndex');
    const canonical = definition.trace[context.actionIndex];
    assert(canonical !== undefined, `${context.caseId} action ${context.actionIndex}`);
    const action = recordValue(actionValue, 'action record');
    assertExactKeys(action, ['index', 'operands', 'type'], 'action record');
    assert(action.index === context.actionIndex, `${context.caseId} action index`);
    assert(action.type === canonical.type, `${context.caseId} action type`);
    assert(
      sameJson(action.operands, canonical.operands),
      `${context.caseId} action ${context.actionIndex} operands`,
    );
    validateFixtureParams(context.caseId, context.fixtureParams);
    validateRouteParams(context.routeParams);
    assert(!context.signal.aborted, 'action is aborted');

    let state = states.get(context.ensureMainEngine);
    if (state === undefined) {
      state = {
        caseId: context.caseId,
        engine: null,
        dataset: null,
        datasetFingerprint: null,
        authoredInput: null,
        authoredFingerprint: null,
        fixtureFingerprint: context.fingerprint(context.fixtureParams),
        stackingInitialProfile: null,
        stackingPatchedProfile: null,
        stackingCurrentProfile: null,
      };
      states.set(context.ensureMainEngine, state);
    }
    assert(state.caseId === context.caseId, 'execution state case identity');
    return handler(adapter, state, context, action, definition);
  };
}

async function loadPlacementMatrixAction(adapter, state, context, action, definition) {
  const operands = exactOperands(action, ['itemId']);
  const itemId = stringValue(operands.itemId, 'loadPlacementMatrix.itemId');
  assert(itemId === definition.itemId, 'placement item identity');
  assert(state.engine === null && state.dataset === null, 'placement dataset loads once');

  const authoredInput = authoredPlacementInput(
    context.fixtureParams,
    itemId,
    definition.sceneOrigin,
  );
  const authoredFingerprint = context.fingerprint(authoredInput);
  const dataset = adapter.createPlacementDataset(authoredInput);
  assert(Array.isArray(dataset), 'createPlacementDataset() result');
  const datasetFingerprint = context.fingerprint(dataset);
  const engine = await ensureInitializedEngine(context);
  state.engine = engine;
  state.dataset = dataset;
  state.datasetFingerprint = datasetFingerprint;
  state.authoredInput = authoredInput;
  state.authoredFingerprint = authoredFingerprint;

  const loaded = await call(engine, 'loadDataset', dataset, {
    datasetRef: 'lay-002-placement-matrix',
  });
  await publish(engine, context);
  const product = observePlacementProduct(engine, adapter, state, context);
  const placement = projectPlacementEvidence(
    product.geometryProbe,
    itemId,
    authoredInput.placements,
  );
  return {
    actual: {
      caseId: context.caseId,
      itemId,
      loaded: clone(loaded),
      componentCount: placement.rows.length,
      input: inputEvidence(state, context),
      product,
    },
  };
}

function observeBoundsAction(adapter, state, context, action, definition) {
  const operands = exactOperands(action, ['ownerId']);
  const ownerId = stringValue(operands.ownerId, 'observeBounds.ownerId');
  assert(ownerId === definition.itemId, 'observed owner identity');
  const engine = currentEngine(state, 'observeBounds');
  const product = observePlacementProduct(engine, adapter, state, context);
  const placements = projectPlacementEvidence(
    product.geometryProbe,
    ownerId,
    state.authoredInput.placements,
  );
  return {
    actual: {
      ownerId,
      owner: placements.owner,
      placements,
      input: inputEvidence(state, context),
      product,
    },
  };
}

function observePlacementMatrixAction(adapter, state, context, action, definition) {
  const operands = exactOperands(action, ['valueRef']);
  const valueRef = stringValue(operands.valueRef, 'observePlacementMatrix.valueRef');
  assert(valueRef === 'placementMatrix', 'placement matrix valueRef');
  const engine = currentEngine(state, 'observePlacementMatrix');
  const product = observePlacementProduct(engine, adapter, state, context);
  const placements = projectPlacementEvidence(
    product.geometryProbe,
    definition.itemId,
    state.authoredInput.placements,
  );
  const repeatGeometry = callSync(engine, 'geometryProbe');
  const repeatPlacements = projectPlacementEvidence(
    requireGeometry(repeatGeometry, 'repeat geometryProbe() result'),
    definition.itemId,
    state.authoredInput.placements,
  );
  return {
    actual: {
      valueRef,
      placements,
      repeatPlacements,
      complete: placements.rows.length === state.authoredInput.placements.length,
      deterministic: sameJson(placements, repeatPlacements),
      input: inputEvidence(state, context),
      product,
    },
  };
}

async function loadStackingDatasetAction(adapter, state, context, action, definition) {
  const operands = exactOperands(action, ['datasetId']);
  const datasetId = stringValue(operands.datasetId, 'loadDataset.datasetId');
  assert(datasetId === definition.datasetId, 'stacking dataset identity');
  assert(state.engine === null && state.dataset === null, 'stacking dataset loads once');

  const authoredInput = authoredStackingInput(context.fixtureParams, definition.specimen);
  const authoredFingerprint = context.fingerprint(authoredInput);
  const dataset = adapter.createStackingDataset(authoredInput);
  assert(Array.isArray(dataset), 'createStackingDataset() result');
  const datasetFingerprint = context.fingerprint(dataset);
  const engine = await ensureInitializedEngine(context);
  state.engine = engine;
  state.dataset = dataset;
  state.datasetFingerprint = datasetFingerprint;
  state.authoredInput = authoredInput;
  state.authoredFingerprint = authoredFingerprint;
  state.stackingInitialProfile = stackingDatasetProfile(dataset, 'authored stacking dataset');
  state.stackingPatchedProfile = null;
  state.stackingCurrentProfile = state.stackingInitialProfile;

  const loaded = await call(engine, 'loadDataset', dataset, {
    datasetRef: 'lay-003-stacking',
  });
  const selectionId = authoredInput.siblings[0].id;
  callSync(engine, 'select', [selectionId]);
  await publish(engine, context);
  const product = observeStackingProduct(engine, adapter, state, context);
  return {
    actual: {
      caseId: context.caseId,
      datasetId,
      selectionId,
      loaded: clone(loaded),
      paint: projectPaintOrderEvidence(product.paintOrderProbe, 'initial paint order'),
      input: inputEvidence(state, context),
      product,
    },
  };
}

async function patchStackingAction(adapter, state, context, action) {
  const operands = exactOperands(action, ['changes', 'targetId']);
  const targetId = stringValue(operands.targetId, 'patch.targetId');
  const changes = recordValue(operands.changes, 'patch.changes');
  const engine = currentEngine(state, 'patch');
  const mutation = callSync(engine, 'patch', { kind: 'element', id: targetId }, clone(changes));
  const mutationRecord = recordValue(mutation, 'patch() result');
  assert(mutationRecord.status === 'committed' && mutationRecord.changed === true, 'patch commit');
  state.stackingPatchedProfile = patchStackingProfile(
    state.stackingCurrentProfile,
    targetId,
    changes,
  );
  state.stackingCurrentProfile = state.stackingPatchedProfile;
  await publish(engine, context);
  const product = observeStackingProduct(engine, adapter, state, context);
  return {
    actual: {
      targetId,
      changes: clone(changes),
      mutation: clone(mutationRecord),
      paint: projectPaintOrderEvidence(product.paintOrderProbe, 'patched paint order'),
      input: inputEvidence(state, context),
      product,
    },
  };
}

async function undoStackingAction(adapter, state, context, action) {
  return transitionStackingAction('undo', adapter, state, context, action);
}

async function redoStackingAction(adapter, state, context, action) {
  return transitionStackingAction('redo', adapter, state, context, action);
}

async function transitionStackingAction(direction, adapter, state, context, action) {
  const operands = exactOperands(action, ['timeMs']);
  const timeMs = finiteNumber(operands.timeMs, `${direction}.timeMs`);
  assert(timeMs >= 0, `${direction}.timeMs non-negative`);
  const engine = currentEngine(state, direction);
  const transition = recordValue(callSync(engine, direction), `${direction}() result`);
  assert(
    transition.status === 'committed' && transition.changed === true,
    `${direction} commit`,
  );
  if (direction === 'undo') {
    assert(state.stackingInitialProfile !== null, 'undo stacking baseline');
    state.stackingCurrentProfile = state.stackingInitialProfile;
  } else {
    assert(state.stackingPatchedProfile !== null, 'redo stacking patch');
    state.stackingCurrentProfile = state.stackingPatchedProfile;
  }
  await publishAt(engine, context, timeMs);
  const product = observeStackingProduct(engine, adapter, state, context);
  return {
    actual: {
      direction,
      timeMs,
      transition: clone(transition),
      paint: projectPaintOrderEvidence(product.paintOrderProbe, `${direction} paint order`),
      input: inputEvidence(state, context),
      product,
    },
  };
}

function projectPaintOrderEvidence(value, label) {
  const probe = recordValue(value, label);
  const plan = recordValue(probe.plan, `${label}.plan`);
  assert(Array.isArray(plan.renderOrder), `${label}.renderOrder`);
  assert(Array.isArray(plan.visibleEntries), `${label}.visibleEntries`);
  const renderOrder = plan.renderOrder.map((entry, index) => (
    stringValue(entry, `${label}.renderOrder[${index}]`)
  ));
  const visibleEntries = plan.visibleEntries.map((value, index) => {
    const entry = recordValue(value, `${label}.visibleEntries[${index}]`);
    return {
      publicId: stringValue(entry.publicId, `${label}.visibleEntries[${index}].publicId`),
      entityId: stringValue(entry.entityId, `${label}.visibleEntries[${index}].entityId`),
      kind: stringValue(entry.kind, `${label}.visibleEntries[${index}].kind`),
      lane: stringValue(entry.lane, `${label}.visibleEntries[${index}].lane`),
      zIndex: finiteNumber(entry.zIndex, `${label}.visibleEntries[${index}].zIndex`),
      authoredOrder: nonNegativeInteger(
        entry.authoredOrder,
        `${label}.visibleEntries[${index}].authoredOrder`,
      ),
      pass: nonNegativeInteger(entry.pass, `${label}.visibleEntries[${index}].pass`),
      phase: stringValue(entry.phase, `${label}.visibleEntries[${index}].phase`),
      paintIndex: nonNegativeInteger(
        entry.paintIndex,
        `${label}.visibleEntries[${index}].paintIndex`,
      ),
      visible: booleanValue(entry.visible, `${label}.visibleEntries[${index}].visible`),
    };
  });
  assert(
    sameJson(renderOrder, visibleEntries.map(({ publicId }) => publicId)),
    `${label}.visible render order correlation`,
  );
  assert(new Set(renderOrder).size === renderOrder.length, `${label}.render identities`);
  const overlays = recordValue(probe.overlays, `${label}.overlays`);
  assert(Array.isArray(overlays.order), `${label}.overlay order`);
  const history = recordValue(probe.history, `${label}.history`);
  return {
    sceneRevision: nonNegativeInteger(probe.sceneRevision, `${label}.sceneRevision`),
    rendererFrame: nonNegativeInteger(probe.rendererFrame, `${label}.rendererFrame`),
    publication: stringValue(probe.publication, `${label}.publication`),
    hierarchyNodeCount: nonNegativeInteger(
      probe.hierarchyNodeCount,
      `${label}.hierarchyNodeCount`,
    ),
    rendererCommandCount: nonNegativeInteger(
      probe.rendererCommandCount,
      `${label}.rendererCommandCount`,
    ),
    overlays: {
      order: overlays.order.map((entry, index) => (
        stringValue(entry, `${label}.overlay order ${index}`)
      )),
      selection: booleanValue(overlays.selection, `${label}.selection overlay`),
      transformer: booleanValue(overlays.transformer, `${label}.transformer overlay`),
      selectedEntityCount: nonNegativeInteger(
        overlays.selectedEntityCount,
        `${label}.selected entity count`,
      ),
      renderObjectCount: nonNegativeInteger(
        overlays.renderObjectCount,
        `${label}.overlay render object count`,
      ),
    },
    renderOrder,
    visibleEntries,
    history: clone(history),
    revisions: clone(recordValue(probe.revisions, `${label}.revisions`)),
    publishedTuple: clone(recordValue(probe.publishedTuple, `${label}.publishedTuple`)),
    frameRevision: nonNegativeInteger(probe.frameRevision, `${label}.frameRevision`),
  };
}

function projectPlacementEvidence(geometryValue, itemId, placements) {
  const geometry = requireGeometry(geometryValue, 'placement geometry');
  const itemEntities = geometry.entities.filter((entity) => (
    isRecord(entity) && (entity.id === itemId || entity.ownerItemId === itemId)
  ));
  assert(
    itemEntities.length === placements.length + 1,
    `${itemId} geometry must contain exactly one owner and every component`,
  );
  const owners = geometry.entities.filter((entity) => (
    isRecord(entity) && entity.id === itemId && entity.componentId === undefined
  ));
  assert(owners.length === 1, `${itemId} owner geometry must resolve exactly once`);
  const owner = projectOwner(owners[0], itemId);
  const rows = placements.map((placement) => {
    const matches = geometry.entities.filter((entity) => (
      isRecord(entity)
        && entity.ownerItemId === itemId
        && entity.componentId === placement
    ));
    assert(matches.length === 1, `${placement} component geometry must resolve exactly once`);
    return projectPlacementRow(matches[0], owner, placement);
  });
  return {
    revision: nullableFiniteNumber(geometry.revision, 'geometry revision'),
    revisionLag: nullableFiniteNumber(geometry.revisionLag, 'geometry revision lag'),
    owner,
    order: [...placements],
    rows,
  };
}

function projectOwner(value, itemId) {
  const entity = recordValue(value, 'owner geometry');
  assert(entity.id === itemId, 'owner geometry identity');
  return {
    id: itemId,
    kind: stringValue(entity.kind, 'owner geometry kind'),
    worldBounds: boundsValue(entity.worldBounds, 'owner world bounds'),
    screenBounds: boundsValue(entity.screenBounds, 'owner screen bounds'),
    visible: booleanValue(entity.visible, 'owner visibility'),
  };
}

function projectPlacementRow(value, owner, placement) {
  const entity = recordValue(value, `${placement} geometry`);
  const worldBounds = boundsValue(entity.worldBounds, `${placement} world bounds`);
  const ownerWorldBounds = owner.worldBounds;
  const localBounds = [
    normalizeNumber(worldBounds[0] - ownerWorldBounds[0], `${placement} local x`),
    normalizeNumber(worldBounds[1] - ownerWorldBounds[1], `${placement} local y`),
    worldBounds[2],
    worldBounds[3],
  ];
  return {
    placement,
    entityId: stringValue(entity.id, `${placement} entity ID`),
    componentType: stringValue(entity.componentType, `${placement} component type`),
    entityLocalBounds: boundsValue(entity.localBounds, `${placement} entity local bounds`),
    localBounds,
    worldBounds,
    center: [
      normalizeNumber(localBounds[0] + localBounds[2] / 2, `${placement} center x`),
      normalizeNumber(localBounds[1] + localBounds[3] / 2, `${placement} center y`),
    ],
    right: normalizeNumber(localBounds[0] + localBounds[2], `${placement} right`),
    top: localBounds[1],
    visible: booleanValue(entity.visible, `${placement} visibility`),
  };
}

function observePlacementProduct(engine, adapter, state, context) {
  assert(state.datasetFingerprint !== null, 'loaded dataset fingerprint');
  assert(state.dataset !== null, 'loaded dataset');
  const snapshot = snapshotEngine(engine);
  const semanticProbe = callSync(engine, 'semanticProbe');
  const geometryProbe = requireGeometry(callSync(engine, 'geometryProbe'), 'geometryProbe() result');
  const exportedDataset = callSync(engine, 'exportDataset');
  const loadedProfile = placementDatasetProfile(state.dataset, 'loaded placement dataset');
  const exportedProfile = placementDatasetProfile(exportedDataset, 'exported placement dataset');
  const loadedProfileFingerprint = context.fingerprint(loadedProfile);
  const exportedProfileFingerprint = context.fingerprint(exportedProfile);
  const runtime = adapter.resourceProbe(Object.freeze({ caseId: context.caseId }));
  assert(isRecord(semanticProbe), 'semanticProbe() result');
  assert(Array.isArray(exportedDataset), 'exportDataset() result');
  assert(
    loadedProfileFingerprint === exportedProfileFingerprint,
    'exported dataset must preserve every authored placement field',
  );
  assert(isRecord(runtime), 'resourceProbe() result');
  validateJsonValue(runtime, 'resourceProbe', new WeakSet());
  return clone({
    snapshot,
    semanticProbe,
    geometryProbe,
    exportedDataset,
    datasetFidelity: {
      loadedProfileFingerprint,
      exportedProfileFingerprint,
      unchanged: true,
    },
    runtime,
  });
}

function observeStackingProduct(engine, adapter, state, context) {
  assert(state.datasetFingerprint !== null, 'loaded dataset fingerprint');
  assert(state.dataset !== null, 'loaded dataset');
  const snapshot = snapshotEngine(engine);
  const semanticProbe = callSync(engine, 'semanticProbe');
  const paintOrderProbe = callSync(engine, 'paintOrderProbe');
  const exportedDataset = callSync(engine, 'exportDataset');
  assert(state.stackingCurrentProfile !== null, 'current stacking profile');
  const exportedProfile = stackingDatasetProfile(exportedDataset, 'exported stacking dataset');
  const expectedProfileFingerprint = context.fingerprint(state.stackingCurrentProfile);
  const exportedProfileFingerprint = context.fingerprint(exportedProfile);
  const runtime = adapter.resourceProbe(Object.freeze({ caseId: context.caseId }));
  assert(isRecord(semanticProbe), 'semanticProbe() result');
  assert(isRecord(paintOrderProbe), 'paintOrderProbe() result');
  assert(Array.isArray(exportedDataset), 'exportDataset() result');
  assert(
    expectedProfileFingerprint === exportedProfileFingerprint,
    'exported dataset must preserve every authored stacking field',
  );
  assert(isRecord(runtime), 'resourceProbe() result');
  validateJsonValue(runtime, 'resourceProbe', new WeakSet());
  return clone({
    snapshot,
    semanticProbe,
    paintOrderProbe,
    exportedDataset,
    datasetFidelity: {
      expectedProfileFingerprint,
      exportedProfileFingerprint,
      unchanged: true,
    },
    runtime,
  });
}

function placementDatasetProfile(value, label) {
  assert(Array.isArray(value) && value.length === 1, `${label} root count`);
  const item = recordValue(value[0], `${label} item`);
  assert(item.type === 'item', `${label} item type`);
  assert(Array.isArray(item.components), `${label} components`);
  const attrs = recordValue(item.attrs, `${label} item attrs`);
  return {
    type: 'item',
    id: stringValue(item.id, `${label} item ID`),
    size: sizeValue(item.size, `${label} item size`),
    padding: edgeValue(item.padding, `${label} item padding`),
    contentOrientation: stringValue(
      item.contentOrientation,
      `${label} content orientation`,
    ),
    attrs: {
      x: finiteNumber(attrs.x, `${label} item x`),
      y: finiteNumber(attrs.y, `${label} item y`),
    },
    components: item.components.map((value, index) => {
      const component = recordValue(value, `${label} component ${index}`);
      const source = recordValue(component.source, `${label} component ${index} source`);
      assert(component.type === 'bar', `${label} component ${index} type`);
      assert(source.type === 'rect', `${label} component ${index} source type`);
      return {
        type: 'bar',
        id: stringValue(component.id, `${label} component ${index} ID`),
        source: {
          type: 'rect',
          fill: stringValue(source.fill, `${label} component ${index} fill`),
        },
        size: sizeValue(component.size, `${label} component ${index} size`),
        placement: stringValue(component.placement, `${label} component ${index} placement`),
        margin: edgeValue(component.margin, `${label} component ${index} margin`),
      };
    }),
  };
}

function stackingDatasetProfile(value, label) {
  assert(Array.isArray(value) && value.length > 0, `${label} roots`);
  return value.map((value, index) => {
    const rect = recordValue(value, `${label} rect ${index}`);
    const attrs = recordValue(rect.attrs, `${label} rect ${index} attrs`);
    assert(rect.type === 'rect', `${label} rect ${index} type`);
    return {
      type: 'rect',
      id: stringValue(rect.id, `${label} rect ${index} ID`),
      size: sizeValue(rect.size, `${label} rect ${index} size`),
      fill: stringValue(rect.fill, `${label} rect ${index} fill`),
      attrs: {
        x: finiteNumber(attrs.x, `${label} rect ${index} x`),
        y: finiteNumber(attrs.y, `${label} rect ${index} y`),
        zIndex: finiteNumber(attrs.zIndex, `${label} rect ${index} zIndex`),
      },
    };
  });
}

function patchStackingProfile(profileValue, targetId, changesValue) {
  assert(Array.isArray(profileValue), 'stacking profile');
  const changes = recordValue(changesValue, 'stacking profile changes');
  assertExactKeys(changes, ['attrs'], 'stacking profile changes');
  const attrs = recordValue(changes.attrs, 'stacking profile attrs');
  assertExactKeys(attrs, ['zIndex'], 'stacking profile attrs');
  const zIndex = finiteNumber(attrs.zIndex, 'stacking profile zIndex');
  let matched = 0;
  const patched = profileValue.map((value, index) => {
    const row = recordValue(value, `stacking profile ${index}`);
    if (row.id !== targetId) return clone(row);
    matched += 1;
    return { ...clone(row), attrs: { ...clone(row.attrs), zIndex } };
  });
  assert(matched === 1, 'stacking profile patch target');
  return deepFreeze(patched);
}

function authoredPlacementInput(paramsValue, itemId, sceneOriginValue) {
  const params = recordValue(paramsValue, 'fixture params');
  const item = recordValue(params.item, 'fixture item');
  const sceneOrigin = recordValue(sceneOriginValue, 'placement scene origin');
  assertExactKeys(sceneOrigin, ['x', 'y'], 'placement scene origin');
  return deepFreeze({
    caseId: 'LAY-002',
    itemId,
    sceneOrigin: {
      x: finiteNumber(sceneOrigin.x, 'placement scene origin x'),
      y: finiteNumber(sceneOrigin.y, 'placement scene origin y'),
    },
    item: {
      size: numberTuple(item.size, 2, 'fixture item size', true),
      padding: edgeValue(item.padding, 'fixture item padding'),
    },
    componentSize: numberTuple(params.componentSize, 2, 'fixture component size', true),
    margin: edgeValue(params.margin, 'fixture margin'),
    placements: clone(placementList(params.placements)),
  });
}

function authoredStackingInput(paramsValue, specimenValue) {
  const params = recordValue(paramsValue, 'fixture params');
  const specimen = recordValue(specimenValue, 'stacking specimen');
  return deepFreeze({
    caseId: 'LAY-003',
    siblings: clone(stackingSiblings(params.siblings)),
    overlays: clone(stackingOverlays(params.overlays)),
    specimen: clone(specimen),
  });
}

function inputEvidence(state, context) {
  assert(state.dataset !== null, 'input dataset');
  assert(state.authoredInput !== null, 'authored input');
  const fixtureAfter = context.fingerprint(context.fixtureParams);
  const authoredAfter = context.fingerprint(state.authoredInput);
  const datasetAfter = context.fingerprint(state.dataset);
  return {
    fixtureBefore: state.fixtureFingerprint,
    fixtureAfter,
    authoredBefore: state.authoredFingerprint,
    authoredAfter,
    datasetBefore: state.datasetFingerprint,
    datasetAfter,
    unchanged: state.fixtureFingerprint === fixtureAfter
      && state.authoredFingerprint === authoredAfter
      && state.datasetFingerprint === datasetAfter,
  };
}

async function ensureInitializedEngine(context) {
  const engine = await context.ensureMainEngine();
  const snapshot = snapshotEngine(engine);
  if (snapshot.lifecycle === 'new') {
    await call(engine, 'initialize', {
      instanceId: `${String(context.caseId).toLowerCase()}-layout-order-engine`,
      width: 800,
      height: 600,
      pixelRatio: 1,
      strategy: 'mesh',
      preference: 'webgl',
    });
  } else {
    assert(snapshot.lifecycle === 'ready-empty', 'initial engine lifecycle');
  }
  return engine;
}

async function publish(engine, context) {
  assert(!context.signal.aborted, 'action is aborted');
  const timeMs = finiteNumber(context.clock.now(), 'clock.now()');
  await call(engine, 'publishFrame', timeMs);
  assert(!context.signal.aborted, 'action is aborted');
}

async function publishAt(engine, context, timeMs) {
  const currentTimeMs = finiteNumber(context.clock.now(), 'clock.now()');
  assert(timeMs >= currentTimeMs, 'published time must be monotonic');
  await context.clock.advanceTo(timeMs);
  await publish(engine, context);
}

function currentEngine(state, operation) {
  assert(state.engine !== null, `${operation} requires the loaded main engine`);
  return state.engine;
}

function snapshotEngine(engine) {
  const snapshot = callSync(engine, 'snapshot');
  assert(isRecord(snapshot), 'snapshot() result');
  return snapshot;
}

function validateProductAdapter(value) {
  const adapter = recordValue(value, 'layout-order product adapter');
  assertExactKeys(
    adapter,
    ['createPlacementDataset', 'createStackingDataset', 'resourceProbe'],
    'layout-order product adapter',
  );
  assert(typeof adapter.createPlacementDataset === 'function', 'adapter createPlacementDataset');
  assert(typeof adapter.createStackingDataset === 'function', 'adapter createStackingDataset');
  assert(typeof adapter.resourceProbe === 'function', 'adapter resourceProbe');
  return adapter;
}

function validateContext(value) {
  const context = recordValue(value, 'context');
  assert(typeof context.ensureMainEngine === 'function', 'context.ensureMainEngine');
  assert(typeof context.currentMainEngine === 'function', 'context.currentMainEngine');
  assert(typeof context.fingerprint === 'function', 'context.fingerprint');
  assert(
    isRecord(context.clock)
      && typeof context.clock.now === 'function'
      && typeof context.clock.advanceTo === 'function',
    'context.clock',
  );
  assert(isRecord(context.signal) && typeof context.signal.aborted === 'boolean', 'context.signal');
  assert(isRecord(context.fixtureParams), 'context.fixtureParams');
  assert(isRecord(context.routeParams), 'context.routeParams');
  return context;
}

function validateFixtureParams(caseId, value) {
  if (caseId === 'LAY-003') {
    const params = recordValue(value, 'fixture params');
    assertExactKeys(params, ['overlays', 'siblings'], 'fixture params');
    stackingSiblings(params.siblings);
    stackingOverlays(params.overlays);
    return;
  }
  assert(caseId === 'LAY-002', 'fixture params case identity');
  const params = recordValue(value, 'fixture params');
  assertExactKeys(
    params,
    ['componentSize', 'declaredTargetIds', 'item', 'margin', 'placementMatrix', 'placements'],
    'fixture params',
  );
  assert(sameJson(params.declaredTargetIds, ['item']), 'declared target IDs');
  const item = recordValue(params.item, 'fixture item');
  assertExactKeys(item, ['padding', 'size'], 'fixture item');
  numberTuple(item.size, 2, 'fixture item size', true);
  edgeValue(item.padding, 'fixture item padding');
  numberTuple(params.componentSize, 2, 'fixture component size', true);
  edgeValue(params.margin, 'fixture margin');
  assert(sameJson(placementList(params.placements), PLACEMENTS), 'fixture placement order');
  // Presence is validated above. Its contents are intentionally opaque.
}

function stackingSiblings(value) {
  assert(Array.isArray(value) && value.length > 0, 'fixture stacking siblings');
  const siblings = value.map((value, index) => {
    const sibling = recordValue(value, `fixture stacking sibling ${index}`);
    assertExactKeys(sibling, ['id', 'zIndex'], `fixture stacking sibling ${index}`);
    return {
      id: stringValue(sibling.id, `fixture stacking sibling ${index}.id`),
      zIndex: finiteNumber(sibling.zIndex, `fixture stacking sibling ${index}.zIndex`),
    };
  });
  assert(new Set(siblings.map(({ id }) => id)).size === siblings.length, 'stacking sibling IDs');
  return siblings;
}

function stackingOverlays(value) {
  assert(Array.isArray(value), 'fixture stacking overlays');
  const overlays = value.map((entry, index) => (
    stringValue(entry, `fixture stacking overlay ${index}`)
  ));
  assert(
    overlays.length === 2 && overlays[0] === 'selection' && overlays[1] === 'transformer',
    'stacking overlay order',
  );
  return overlays;
}

function validateRouteParams(value) {
  const route = recordValue(value, 'route params');
  assert(typeof route.size === 'string' && route.size.length > 0, 'route size');
  assert(Number.isInteger(route.seed) && route.seed >= 0 && route.seed <= 0xffffffff, 'route seed');
}

function placementList(value) {
  assert(Array.isArray(value), 'fixture placements');
  const placements = value.map((entry, index) => stringValue(entry, `fixture placement ${index}`));
  assert(placements.every((placement) => PLACEMENTS.includes(placement)), 'supported placement');
  assert(new Set(placements).size === placements.length, 'unique placements');
  return placements;
}

function edgeValue(value, label) {
  const edges = recordValue(value, label);
  assertExactKeys(edges, ['bottom', 'left', 'right', 'top'], label);
  return {
    top: finiteNumber(edges.top, `${label}.top`),
    right: finiteNumber(edges.right, `${label}.right`),
    bottom: finiteNumber(edges.bottom, `${label}.bottom`),
    left: finiteNumber(edges.left, `${label}.left`),
  };
}

function numberTuple(value, length, label, nonNegative) {
  assert(Array.isArray(value) && value.length === length, `${label} length`);
  return value.map((entry, index) => {
    const number = finiteNumber(entry, `${label}[${index}]`);
    assert(!nonNegative || number >= 0, `${label}[${index}] non-negative`);
    return number;
  });
}

function sizeValue(value, label) {
  const size = recordValue(value, label);
  assertExactKeys(size, ['height', 'width'], label);
  return {
    width: finiteNumber(size.width, `${label}.width`),
    height: finiteNumber(size.height, `${label}.height`),
  };
}

function boundsValue(value, label) {
  return numberTuple(value, 4, label, false).map((entry, index) => (
    normalizeNumber(entry, `${label}[${index}]`)
  ));
}

function requireGeometry(value, label) {
  const geometry = recordValue(value, label);
  assert(Array.isArray(geometry.entities), `${label}.entities`);
  assert(Array.isArray(geometry.relations), `${label}.relations`);
  return geometry;
}

function nullableFiniteNumber(value, label) {
  return value === null || value === undefined ? null : finiteNumber(value, label);
}

function exactOperands(action, keys) {
  const operands = recordValue(action.operands, `${action.type} operands`);
  assertExactKeys(operands, keys, `${action.type} operands`);
  return operands;
}

async function call(target, method, ...args) {
  assert(isRecord(target), `${method} target`);
  const callable = target[method];
  assert(typeof callable === 'function', `Engine must expose ${method}()`);
  return callable.apply(target, args);
}

function callSync(target, method, ...args) {
  assert(isRecord(target), `${method} target`);
  const callable = target[method];
  assert(typeof callable === 'function', `Engine must expose ${method}()`);
  return callable.apply(target, args);
}

function traceAction(type, operands) {
  return Object.freeze({ type, operands: deepFreeze(operands) });
}

function assertExactKeys(value, keys, label) {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) assert(allowed.has(key), `${label} unknown key ${key}`);
  for (const key of keys) assert(Object.hasOwn(value, key), `${label} missing key ${key}`);
}

function recordValue(value, label) {
  assert(isRecord(value), `${label} must be an object`);
  return value;
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, label);
  return value;
}

function booleanValue(value, label) {
  assert(typeof value === 'boolean', label);
  return value;
}

function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), label);
  return value;
}

function nonNegativeInteger(value, label) {
  assert(Number.isInteger(value) && value >= 0, label);
  return value;
}

function normalizeNumber(value, label) {
  const numeric = finiteNumber(value, label);
  const rounded = Math.round(numeric * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function clone(value) {
  return structuredClone(value);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateJsonValue(value, label, ancestors) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    assert(Number.isFinite(value), `${label} finite number`);
    return;
  }
  assert(typeof value === 'object', `${label} JSON value`);
  assert(!ancestors.has(value), `${label} acyclic`);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => validateJsonValue(entry, `${label}[${index}]`, ancestors));
    } else {
      Object.entries(value).forEach(([key, entry]) => (
        validateJsonValue(entry, `${label}.${key}`, ancestors)
      ));
    }
  } finally {
    ancestors.delete(value);
  }
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Core v2 layout-order handler invalid: ${message}`);
}
