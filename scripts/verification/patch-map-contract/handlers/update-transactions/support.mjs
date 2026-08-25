import { clone } from '../../value-atoms.mjs';

const BASELINE_PROFILE = 'mutation-transaction-matrix';

export function isolatedFailureSnapshot(engine, context) {
  const snapshot = clone(callSync(engine, 'snapshot'));
  const destroyed =
    snapshot.lifecycle === 'destroying' || snapshot.lifecycle === 'destroyed';
  const dataset = destroyed ? [] : callSync(engine, 'exportDataset');
  const history = destroyed
    ? { undoDepth: snapshot.historyDepth, redoDepth: 0 }
    : callSync(engine, 'historyState');
  return deepFreeze({
    snapshot,
    fingerprint: context.fingerprint(dataset),
    historyDepth: nonNegativeInteger(
      history.undoDepth,
      'isolated failure history depth',
    ),
    selectionIds: clone(snapshot.selectionIds),
  });
}

export function sceneRevisionFromSnapshot(snapshotValue) {
  const snapshot = recordValue(snapshotValue, 'scene revision snapshot');
  const revisions = recordValue(snapshot.revisions, 'scene revision stamp');
  return nonNegativeInteger(revisions.sceneRevision, 'scene revision');
}

export function publicDiagnosticFromError(error) {
  const candidate = isRecord(error?.diagnostic) ? error.diagnostic : error;
  if (!isRecord(candidate)) {
    return deepFreeze({
      code: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
      category: null,
      operation: null,
      datasetPath: null,
    });
  }
  return deepFreeze({
    code: typeof candidate.code === 'string'
      ? candidate.code
      : error instanceof Error
        ? error.name
        : 'UNKNOWN_ERROR',
    category: typeof candidate.category === 'string' ? candidate.category : null,
    operation: typeof candidate.operation === 'string' ? candidate.operation : null,
    datasetPath:
      typeof candidate.datasetPath === 'string' ? candidate.datasetPath : null,
  });
}

export function publicDiagnosticFromResult(resultValue) {
  if (!isRecord(resultValue)) return null;
  const candidate = isRecord(resultValue.transactionDiagnostic)
    ? resultValue.transactionDiagnostic
    : isRecord(resultValue.diagnostic)
      ? resultValue.diagnostic
      : null;
  if (candidate === null) return null;
  return deepFreeze({
    code: typeof candidate.code === 'string' ? candidate.code : null,
    category: typeof candidate.category === 'string' ? candidate.category : null,
    operation: typeof candidate.operation === 'string' ? candidate.operation : null,
    datasetPath: typeof candidate.datasetPath === 'string'
      ? candidate.datasetPath
      : typeof candidate.path === 'string'
        ? candidate.path
        : null,
  });
}

export async function ensureBaseline(adapter, state, context) {
  const engine = await ensureInitializedEngine(state, context);
  if (!state.baselineLoaded) {
    const profiles = recordValue(context.fixtureProfiles, 'fixture profiles');
    const profile = profiles[BASELINE_PROFILE];
    const datasetRef = isRecord(profile)
      ? stringValue(profile.datasetRef, `${BASELINE_PROFILE}.datasetRef`)
      : 'all-kinds-scene';
    const dataset = await context.resolveDataset(datasetRef);
    const fingerprint = context.fingerprint(dataset);
    callSync(engine, 'loadDataset', dataset, { datasetRef });
    state.datasets.set(datasetRef, { value: dataset, fingerprint });
    state.baselineLoaded = true;
    if (context.caseId === 'UPD-008') {
      await settleUpdateResources(engine, context, true);
    }
  }
  return engine;
}

export async function ensureInitializedEngine(state, context) {
  const engine = state.engine ?? await context.ensureMainEngine();
  state.engine = engine;
  const snapshot = callSync(engine, 'snapshot');
  if (snapshot.lifecycle === 'new') {
    const instanceId = `contract-${context.caseId.toLowerCase()}`;
    if (context.caseId === 'UPD-008') callSync(engine, 'registerAssets', instanceId);
    await call(engine, 'initialize', {
      instanceId,
      width: 960,
      height: 540,
      pixelRatio: 1,
      strategy: 'mesh',
      preference: 'webgl',
      antialias: true,
      background: 0xf7f8fa,
      powerPreference: 'high-performance',
    });
  }
  return engine;
}


export function currentEngine(state, operation) {
  assert(state.engine !== null, `${operation} engine exists`);
  return state.engine;
}

export function observeProduct(adapter, context, engine) {
  const directSnapshot = clone(callSync(engine, 'snapshot'));
  const resources = clone(adapter.resourceProbe({ caseId: context.caseId, engine }));
  const resourceEngine = isRecord(resources.engine) ? resources.engine : null;
  const snapshot = isRecord(resourceEngine?.snapshot)
    ? clone(resourceEngine.snapshot)
    : directSnapshot;
  const semantic = isRecord(resourceEngine?.semantic)
    ? clone(resourceEngine.semantic)
    : clone(callSync(engine, 'semanticProbe'));
  const destroyed = snapshot.lifecycle === 'destroyed' || snapshot.lifecycle === 'destroying';
  const dataset = destroyed ? Object.freeze([]) : callSync(engine, 'exportDataset');
  const geometry = destroyed ? null : clone(callSync(engine, 'geometryProbe'));
  const relations = destroyed ? null : clone(callSync(engine, 'relationProbe'));
  const sceneImages = destroyed ? null : clone(callSync(engine, 'sceneImageProbe'));
  const interactionOwnership = destroyed
    ? null
    : resourceEngine !== null && Object.hasOwn(resourceEngine, 'interactionOwnership')
      ? clone(resourceEngine.interactionOwnership)
      : clone(callSync(engine, 'interactionOwnershipProbe'));
  const history = destroyed
    ? { undoDepth: snapshot.historyDepth, redoDepth: 0, capacity: 0 }
    : clone(callSync(engine, 'historyState'));
  const product = deepFreeze({
    snapshot,
    semantic,
    dataset: {
      fingerprint: context.fingerprint(dataset),
      semanticHash: snapshot.semanticHash,
      rootIds: clone(snapshot.rootIds),
      rootCount: dataset.length,
    },
    geometry,
    relations,
    sceneImages,
    interactionOwnership,
    history,
    resources,
  });
  if (context.caseId === 'UPD-008') validateUpdateProductProbe(product);
  return product;
}

export function observeChangeEvents(engine, operation) {
  const change = [];
  const frame = [];
  const removeChange = callSync(engine, 'on', 'change', (event) => change.push(clone(event)));
  const removeFrame = callSync(engine, 'on', 'frame', (event) => frame.push(clone(event)));
  try {
    return { result: operation(), events: { change, frame } };
  } finally {
    removeChange();
    removeFrame();
  }
}

export function geometryActionFacts(engine, targetId, product, geometryEntity) {
  const worldCenter = visibleCenter(
    geometryEntity,
    currentRecord(engine, elementTarget(targetId)),
  );
  const screenCenter = Array.isArray(geometryEntity?.screenBounds)
    ? boundsCenter(geometryEntity.screenBounds)
    : worldCenter;
  const hit = screenCenter === null
    ? null
    : callSync(engine, 'hitTest', { x: screenCenter[0], y: screenCenter[1] });
  return {
    currentTarget: currentRecord(engine, elementTarget(targetId)),
    geometryEntity: clone(geometryEntity),
    hit: { point: screenCenter, id: hit },
    selectionOverlay: clone(product.geometry?.selectionOverlay ?? null),
  };
}

function boundsCenter(bounds) {
  assert(
    Array.isArray(bounds) && bounds.length === 4 && bounds.every(Number.isFinite),
    'bounds center input',
  );
  return Object.freeze([
    bounds[0] + bounds[2] / 2,
    bounds[1] + bounds[3] / 2,
  ]);
}

export function mergeBaseline(engine, target) {
  const record = currentRecord(engine, target);
  assert(record !== null, 'merge baseline target exists');
  const owner = currentRecord(engine, elementTarget(target.ownerId));
  assert(owner !== null && Array.isArray(owner.components), 'merge baseline owner components');
  return deepFreeze({
    siblings: clone(owner.components.filter((component) => component.id !== target.id)),
    target: clone(record),
  });
}

export function currentRecord(engine, target) {
  const snapshot = callSync(engine, 'resolveTarget', target);
  return snapshot === null ? null : clone(snapshot.value);
}

export function hierarchyElementFacts(engine, id) {
  const dataset = callSync(engine, 'exportDataset');
  assert(Array.isArray(dataset), 'hierarchy dataset');
  const found = findHierarchyElement(dataset, id, null, identityAffine());
  assert(found !== null, `hierarchy element ${id}`);
  return deepFreeze({
    id,
    parentId: found.parentId,
    worldPosition: [cleanNumber(found.worldAffine[4]), cleanNumber(found.worldAffine[5])],
    record: clone(found.record),
  });
}

export function hierarchyChildCount(engine, parentId) {
  const dataset = callSync(engine, 'exportDataset');
  assert(Array.isArray(dataset), 'hierarchy dataset');
  const found = findHierarchyElement(dataset, parentId, null, identityAffine());
  assert(found !== null, `hierarchy parent ${parentId}`);
  assert(found.record.type === 'group', `hierarchy parent ${parentId} group`);
  assert(Array.isArray(found.record.children), `hierarchy parent ${parentId} children`);
  return found.record.children.length;
}

function findHierarchyElement(values, id, parentId, parentAffine) {
  for (const value of values) {
    if (!isRecord(value)) continue;
    const worldAffine = multiplyAffine(parentAffine, elementLocalAffine(value));
    if (value.id === id) return { record: value, parentId, worldAffine };
    if (value.type !== 'group' || !Array.isArray(value.children)) continue;
    const nested = findHierarchyElement(value.children, id, String(value.id), worldAffine);
    if (nested !== null) return nested;
  }
  return null;
}

function elementLocalAffine(record) {
  const attrs = isRecord(record.attrs) ? record.attrs : {};
  const x = numberOr(attrs.x, 0);
  const y = numberOr(attrs.y, 0);
  const angle = typeof attrs.angle === 'number' && Number.isFinite(attrs.angle)
    ? attrs.angle
    : typeof attrs.rotation === 'number' && Number.isFinite(attrs.rotation)
      ? attrs.rotation * 180 / Math.PI
      : 0;
  const scaleX = numberOr(attrs.scaleX, 1);
  const scaleY = numberOr(attrs.scaleY, 1);
  const radians = angle * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [
    cosine * scaleX,
    sine * scaleX,
    -sine * scaleY,
    cosine * scaleY,
    x,
    y,
  ];
}

function identityAffine() {
  return [1, 0, 0, 1, 0, 0];
}

function multiplyAffine(left, right) {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ];
}

function cleanNumber(value) {
  const normalized = Math.abs(value) <= 1e-10 ? 0 : value;
  return Number(normalized.toFixed(10));
}

function numberOr(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function targetRecords(engine, ids) {
  return Object.fromEntries(ids.map((id) => [id, currentRecord(engine, elementTarget(id))]));
}

export function componentCollectionFacts(engine, ownerId, ids) {
  const owner = currentRecord(engine, elementTarget(ownerId));
  assert(owner !== null && Array.isArray(owner.components), 'component collection owner');
  const order = owner.components.map((component) => component.id);
  const byId = Object.fromEntries(ids.map((id) => [id, componentFact(engine, ownerId, id)]));
  return deepFreeze({
    order,
    byId,
    renderLanes: consistentComponentRenderLanes(byId),
  });
}

export function componentFact(engine, ownerId, componentId) {
  const record = currentRecord(engine, componentTarget(ownerId, componentId));
  const visual = callSync(engine, 'componentVisualProbe', { ownerId, componentId });
  if (record === null && visual === null) {
    return deepFreeze({
      id: componentId,
      logicalCount: 0,
      show: null,
      renderObjectCount: 0,
      logicalIdentity: null,
      orphanedRenderer: false,
      visual: null,
    });
  }
  const facts = componentVisualFacts(visual, `component ${ownerId}/${componentId}`);
  return deepFreeze({
    id: componentId,
    logicalCount: record === null ? 0 : 1,
    show: record === null ? null : booleanValue(record.show, `component ${componentId}.show`),
    renderObjectCount: facts.renderObjectCount,
    logicalIdentity: facts.logicalIdentity,
    orphanedRenderer: record === null,
    rendererPaint: facts.rendererPaint,
    renderLanes: facts.renderLanes,
    visual: clone(visual),
  });
}

function componentVisualFacts(value, label) {
  const visual = recordValue(value, `${label} visual probe`);
  const availability = recordValue(visual.availability, `${label} availability`);
  assert(availability.surface === true, `${label} surface availability`);
  assert(availability.renderLanes === true, `${label} render lanes availability`);
  const publication = recordValue(visual.publication, `${label} publication`);
  assert(publication.rendererFacts === 'current', `${label} renderer publication must be current`);
  const geometry = recordValue(visual.geometry, `${label} geometry`);
  const visible = booleanValue(geometry.visible, `${label} geometry visibility`);
  const logicalIdentity = stringValue(visual.logicalIdentity, `${label} logicalIdentity`);
  const entityId = stringValue(visual.entityId, `${label} entityId`);
  const lanes = validateRenderLaneSnapshot(visual.renderLanes, `${label} render lanes`);
  if (!visible) {
    const rendererPaint = availability.rendererPaint === true
      ? recordValue(visual.rendererPaint, `${label} hidden renderer paint`)
      : null;
    if (rendererPaint === null) {
      assert(availability.rendererPaint === false, `${label} hidden renderer paint availability`);
      assert(visual.rendererPaint === null, `${label} hidden renderer paint absence`);
    } else {
      assert(rendererPaint.entityId === entityId, `${label} hidden renderer entity identity`);
      assert(
        nonNegativeInteger(rendererPaint.renderObjectCount, `${label} hidden renderObjectCount`) === 0,
        `${label} hidden renderer object absence (${String(rendererPaint.renderObjectCount)})`,
      );
      assert(
        nonNegativeInteger(rendererPaint.primitiveCount, `${label} hidden primitiveCount`) === 0,
        `${label} hidden primitive absence (${String(rendererPaint.primitiveCount)})`,
      );
      const laneRole = stringValue(rendererPaint.lane, `${label} hidden renderer lane`);
      assert(isRecord(lanes[laneRole]), `${label} hidden renderer lane exists`);
    }
    if (visual.sceneImage !== null) {
      validateSceneImageRecord(visual.sceneImage, `${label} scene image`);
    }
    return deepFreeze({
      logicalIdentity,
      renderObjectCount: 0,
      rendererPaint: rendererPaint === null ? null : clone(rendererPaint),
      renderLanes: lanes,
    });
  }
  assert(availability.rendererPaint === true, `${label} visible renderer paint availability`);
  const rendererPaint = recordValue(visual.rendererPaint, `${label} renderer paint`);
  const renderObjectCount = nonNegativeInteger(
    rendererPaint.renderObjectCount,
    `${label} renderObjectCount`,
  );
  const primitiveCount = nonNegativeInteger(
    rendererPaint.primitiveCount,
    `${label} primitiveCount`,
  );
  assert(rendererPaint.entityId === entityId, `${label} renderer entity identity`);
  const laneRole = stringValue(rendererPaint.lane, `${label} renderer lane`);
  const lane = lanes[laneRole];
  assert(isRecord(lane), `${label} renderer lane exists`);
  assert(
    renderObjectCount <= lane.renderObjectCount,
    `${label} render object count exceeds aggregate lane`,
  );
  assert(
    primitiveCount <= lane.visiblePrimitiveCount,
    `${label} primitive count exceeds aggregate lane`,
  );
  if (visual.sceneImage !== null) validateSceneImageRecord(visual.sceneImage, `${label} scene image`);
  return deepFreeze({
    logicalIdentity,
    renderObjectCount,
    rendererPaint: clone(rendererPaint),
    renderLanes: lanes,
  });
}

function consistentComponentRenderLanes(byId) {
  let baseline = null;
  for (const [id, factsValue] of Object.entries(byId)) {
    const facts = recordValue(factsValue, `component facts ${id}`);
    if (facts.visual === null) continue;
    const lanes = validateRenderLaneSnapshot(
      facts.renderLanes,
      `component ${id} aggregate render lanes`,
    );
    if (baseline === null) baseline = lanes;
    else assert(
      JSON.stringify(lanes) === JSON.stringify(baseline),
      `component ${id} aggregate render lanes disagree`,
    );
  }
  assert(baseline !== null, 'component collection aggregate render lanes exist');
  return baseline;
}

export function requireComponentFact(collection, id) {
  const facts = collection.byId[id];
  assert(isRecord(facts), `component facts ${id}`);
  return facts;
}

export function componentReleaseExpectation(beforeComponents, removedIds) {
  let targetCount = 0;
  let activeTargetCount = 0;
  let bindingCount = 0;
  let leaseCount = 0;
  let acquisitionCount = 0;
  let rendererObjectCount = 0;
  let consumerCount = 0;
  let assetLaneRendererObjectCount = 0;
  const bindingKeys = new Set();
  const removedIdSet = new Set(removedIds);
  const survivingActiveBindingKeys = new Set();
  for (const [id, componentValue] of Object.entries(beforeComponents.byId)) {
    if (removedIdSet.has(id)) continue;
    const component = recordValue(componentValue, `surviving component ${id}`);
    if (component.visual === null) continue;
    const visual = recordValue(component.visual, `surviving component ${id} visual`);
    if (visual.sceneImage === null) continue;
    const image = validateSceneImageRecord(
      visual.sceneImage,
      `surviving component ${id} image`,
    );
    if (image.active === true) {
      survivingActiveBindingKeys.add(
        stringValue(image.bindingKey, `surviving component ${id} bindingKey`),
      );
    }
  }
  for (const id of removedIds) {
    const component = requireComponentFact(beforeComponents, id);
    const visual = recordValue(component.visual, `removed component ${id} visual`);
    const renderRole = stringValue(visual.renderRole, `removed component ${id} renderRole`);
    const assetRole = renderRole === 'background-asset' || renderRole === 'content-asset';
    if (!assetRole) {
      assert(visual.sceneImage === null, `removed non-asset component ${id} scene image`);
      continue;
    }
    assert(visual.sceneImage !== null, `removed asset component ${id} scene image baseline`);
    const image = validateSceneImageRecord(visual.sceneImage, `removed component ${id} image`);
    assert(image.active === true, `removed asset component ${id} was active`);
    assert(image.state === 'resolved', `removed asset component ${id} was resolved`);
    assert(image.attachmentState === 'current', `removed asset component ${id} attachment current`);
    const publication = recordValue(
      image.publication,
      `removed asset component ${id} image publication`,
    );
    assert(
      publication.rendererFacts === 'current',
      `removed asset component ${id} image publication current`,
    );
    const componentRendererObjects = nonNegativeInteger(
      component.renderObjectCount,
      `removed component ${id} renderObjectCount`,
    );
    assert(componentRendererObjects > 0, `removed asset component ${id} renderer baseline`);
    const imageRendererObjects = nonNegativeInteger(
      image.renderObjectCount,
      `removed component ${id} image renderObjectCount`,
    );
    assert(imageRendererObjects > 0, `removed asset component ${id} image renderer baseline`);
    assert(
      componentRendererObjects === imageRendererObjects,
      `removed asset component ${id} renderer count correlation`,
    );
    rendererObjectCount += imageRendererObjects;
    assetLaneRendererObjectCount += imageRendererObjects;
    targetCount += 1;
    activeTargetCount += 1;
    const bindingKey = stringValue(image.bindingKey, `removed component ${id} bindingKey`);
    if (!bindingKeys.has(bindingKey) && !survivingActiveBindingKeys.has(bindingKey)) {
      bindingKeys.add(bindingKey);
      bindingCount += 1;
      leaseCount += 1;
      acquisitionCount += 1;
    }
    const imageConsumers = nonNegativeInteger(
      image.bindingConsumerCount,
      `removed component ${id} bindingConsumerCount`,
    );
    assert(imageConsumers > 0, `removed asset component ${id} consumer baseline`);
    consumerCount += 1;
  }
  return deepFreeze({
    targetCount,
    activeTargetCount,
    bindingCount,
    leaseCount,
    acquisitionCount,
    rendererObjectCount,
    consumerCount,
    assetLaneRendererObjectCount,
  });
}

export function allComponentIds(context) {
  const params = recordValue(context.fixtureParams, 'fixture params');
  const initial = stringArray(params.initialOrder, 'fixture initialOrder');
  const next = stringArray(params.nextOrder, 'fixture nextOrder');
  return [...new Set([...initial, ...next])];
}

export function relationFacts(probe) {
  const relations = Array.isArray(probe?.relations) ? probe.relations : [];
  const segments = relations.map((relation) => ({
    id: relation.id,
    relationId: relation.relationId ?? relation.id,
    key: relation.key ?? `${relation.sourceId}>${relation.targetId}`,
    sourceId: relation.sourceId,
    targetId: relation.targetId,
    visible: relation.visible ?? true,
    startWorld: clone(relation.worldEndpoints?.[0] ?? null),
    endWorld: clone(relation.worldEndpoints?.[1] ?? null),
    bounds: clone(relation.worldBounds ?? null),
  }));
  const counts = {};
  for (const segment of segments) counts[segment.key] = (counts[segment.key] ?? 0) + 1;
  return deepFreeze({
    revision: probe?.revision ?? null,
    revisionLags: clone(probe?.revisionLags ?? null),
    segments,
    visibleSegments: segments.filter(({ visible }) => visible).map(({ key }) => key),
    counts,
    omitted: clone(probe?.omittedRelations ?? []),
  });
}

export function resourceDelta(
  before,
  after,
  releaseExpectation = ZERO_RESOURCE_RELEASE,
  beforeRenderLanes = null,
  afterRenderLanes = null,
) {
  const beforeCounts = publicResourceCounts(before, beforeRenderLanes);
  const afterCounts = publicResourceCounts(after, afterRenderLanes);
  assertReleaseWithinBefore(beforeCounts, releaseExpectation);
  assert(
    beforeCounts.subscriptionCount === afterCounts.subscriptionCount,
    'UPD-008 subscription count must remain unchanged',
  );
  const violations = deepFreeze({
    canvasGrowth: positiveRemainder(afterCounts.canvasCount, beforeCounts.canvasCount),
    subscriptionGrowth: positiveRemainder(
      afterCounts.subscriptionCount,
      beforeCounts.subscriptionCount,
    ),
    subscriptionDuplicates: afterCounts.subscriptionDuplicateCount,
    rootBindingGrowth: positiveRemainder(
      afterCounts.rootBindingCount,
      beforeCounts.rootBindingCount,
    ),
    entityCallbacks: afterCounts.entityCallbackCount,
    pendingWork: afterCounts.pendingWork,
    retainedImageTargets: retainedAfterRelease(
      beforeCounts.targetCount,
      afterCounts.targetCount,
      releaseExpectation.targetCount,
    ),
    retainedActiveImageTargets: retainedAfterRelease(
      beforeCounts.activeTargetCount,
      afterCounts.activeTargetCount,
      releaseExpectation.activeTargetCount,
    ),
    retainedBindings: retainedAfterRelease(
      beforeCounts.bindingCount,
      afterCounts.bindingCount,
      releaseExpectation.bindingCount,
    ),
    retainedLeases: retainedAfterRelease(
      beforeCounts.leaseCount,
      afterCounts.leaseCount,
      releaseExpectation.leaseCount,
    ),
    retainedAcquisitions: retainedAfterRelease(
      beforeCounts.assetAcquisitionCount,
      afterCounts.assetAcquisitionCount,
      releaseExpectation.acquisitionCount,
    ),
    retainedRendererObjects: retainedAfterRelease(
      beforeCounts.rendererObjectCount,
      afterCounts.rendererObjectCount,
      releaseExpectation.rendererObjectCount,
    ),
    retainedConsumers: retainedAfterRelease(
      beforeCounts.consumerCount,
      afterCounts.consumerCount,
      releaseExpectation.consumerCount,
    ),
    retainedAssetLaneObjects: retainedAfterRelease(
      beforeCounts.assetLaneRendererObjectCount,
      afterCounts.assetLaneRendererObjectCount,
      releaseExpectation.assetLaneRendererObjectCount,
    ),
    pendingBindings: afterCounts.pendingBindingCount,
    pendingSettlements: afterCounts.pendingSettlementCount,
    pendingReleases: afterCounts.pendingReleaseCount,
    assetPending: afterCounts.assetPendingCount,
    assetCleanupPending: afterCounts.assetCleanupPendingCount,
  });
  return deepFreeze({
    before: beforeCounts,
    after: afterCounts,
    expectedRelease: clone(releaseExpectation),
    violations,
    retainedDelta: Object.values(violations).reduce((sum, value) => sum + value, 0),
  });
}

function publicResourceCounts(product, renderLanesValue = null) {
  const snapshot = recordValue(product.snapshot, 'UPD-008 snapshot');
  const resources = recordValue(snapshot.resources, 'UPD-008 snapshot resources');
  const rendering = recordValue(resources.rendering, 'UPD-008 rendering resources');
  const assets = recordValue(resources.assets, 'UPD-008 asset resources');
  const subscriptions = recordValue(resources.subscriptions, 'UPD-008 subscriptions');
  const sceneImages = sceneImageProbeFacts(product.sceneImages);
  const interaction = interactionOwnershipFacts(product);
  assert(assets.destroyed === false, 'UPD-008 asset session must be alive');
  stringValue(assets.instanceId, 'UPD-008 asset instanceId');
  const leaseCount = nonNegativeInteger(assets.leaseCount, 'UPD-008 asset leaseCount');
  const assetPendingCount = nonNegativeInteger(
    assets.pendingCount,
    'UPD-008 asset pendingCount',
  );
  const assetAcquisitionCount = nonNegativeInteger(
    assets.acquisitionCount,
    'UPD-008 asset acquisitionCount',
  );
  assert(
    assetAcquisitionCount === leaseCount + assetPendingCount,
    'UPD-008 asset acquisitionCount must equal leases plus pending acquisitions',
  );
  assert(assetPendingCount === 0, 'UPD-008 asset acquisition must be settled');
  assert(
    leaseCount === sceneImages.resolvedBindingCount,
    'UPD-008 resolved image bindings must equal asset session leases',
  );
  assert(
    assetAcquisitionCount === sceneImages.resolvedBindingCount,
    'UPD-008 resolved image bindings must equal asset session acquisitions',
  );
  const assetCleanupPendingCount = nonNegativeInteger(
    assets.cleanupPendingCount,
    'UPD-008 asset cleanupPendingCount',
  );
  assert(assetCleanupPendingCount === 0, 'UPD-008 asset cleanup must be finalized');
  const subscriptionCount = nonNegativeInteger(
    subscriptions.active,
    'UPD-008 subscriptionCount',
  );
  const subscriptionDuplicateCount = nonNegativeInteger(
    subscriptions.duplicates,
    'UPD-008 subscription duplicate count',
  );
  assert(subscriptionDuplicateCount === 0, 'UPD-008 duplicate subscriptions');
  assert(interaction.rootBindingCount === 6, 'UPD-008 root binding count must remain six');
  assert(interaction.entityCallbackCount === 0, 'UPD-008 entity callbacks must remain zero');
  const pendingWork = nonNegativeInteger(snapshot.pendingWork, 'UPD-008 pendingWork');
  assert(pendingWork === 0, 'UPD-008 product work must be settled');
  assert(sceneImages.pendingBindingCount === 0, 'UPD-008 image bindings must be settled');
  assert(sceneImages.pendingSettlementCount === 0, 'UPD-008 image settlements must finish');
  assert(sceneImages.pendingReleaseCount === 0, 'UPD-008 image releases must finish');
  const renderCommandCount = nonNegativeInteger(
    rendering.commandCount,
    'UPD-008 renderCommandCount',
  );
  const visiblePrimitiveCount = nonNegativeInteger(
    rendering.visiblePrimitiveCount,
    'UPD-008 visiblePrimitiveCount',
  );
  let assetLaneRendererObjectCount = sceneImages.rendererObjectCount;
  if (renderLanesValue !== null) {
    const renderLanes = validateRenderLaneSnapshot(
      renderLanesValue,
      'UPD-008 aggregate render lanes',
    );
    const laneRenderObjectCount = RENDER_LANE_ROLES.reduce(
      (sum, role) => sum + renderLanes[role].renderObjectCount,
      0,
    );
    assert(
      laneRenderObjectCount === renderCommandCount,
      'UPD-008 aggregate lanes must equal global renderer object count',
    );
    assetLaneRendererObjectCount =
      renderLanes['background-assets'].renderObjectCount +
      renderLanes['content-assets'].renderObjectCount;
    assert(
      assetLaneRendererObjectCount === sceneImages.rendererObjectCount,
      'UPD-008 asset render lanes must equal scene image renderer objects',
    );
  }
  return deepFreeze({
    canvasCount: nonNegativeInteger(resources.canvasCount, 'UPD-008 canvasCount'),
    renderCommandCount,
    visiblePrimitiveCount,
    subscriptionCount,
    subscriptionDuplicateCount,
    pendingWork,
    leaseCount,
    assetPendingCount,
    assetAcquisitionCount,
    assetCleanupPendingCount,
    assetLaneRendererObjectCount,
    ...interaction,
    ...sceneImages,
  });
}

function validateUpdateProductProbe(product) {
  publicResourceCounts(product);
}

export function interactionOwnershipFacts(product) {
  const interaction = recordValue(
    product.interactionOwnership,
    'UPD-008 interaction ownership',
  );
  return deepFreeze({
    rootBindingCount: nonNegativeInteger(
      interaction.rootBindingCount,
      'UPD-008 root binding count',
    ),
    entityCallbackCount: nonNegativeInteger(
      interaction.entityCallbackCount,
      'UPD-008 entity callback count',
    ),
  });
}

function sceneImageProbeFacts(value) {
  const probe = recordValue(value, 'UPD-008 scene image probe');
  const images = recordValue(probe.images, 'UPD-008 scene images');
  const targetCount = nonNegativeInteger(probe.targetCount, 'UPD-008 scene image targetCount');
  const activeTargetCount = nonNegativeInteger(
    probe.activeTargetCount,
    'UPD-008 scene image activeTargetCount',
  );
  let rendererObjectCount = 0;
  const consumersByBinding = new Map();
  const targetsByBinding = new Map();
  const activeBindingKeys = new Set();
  const resolvedBindingKeys = new Set();
  const stateByBinding = new Map();
  let observedActiveTargetCount = 0;
  for (const [entityId, image] of Object.entries(images)) {
    const facts = validateSceneImageRecord(image, `UPD-008 scene image ${entityId}`);
    const imageRenderObjectCount = nonNegativeInteger(
      facts.renderObjectCount,
      `UPD-008 scene image ${entityId} renderObjectCount`,
    );
    const imageConsumerCount = nonNegativeInteger(
      facts.bindingConsumerCount,
      `UPD-008 scene image ${entityId} bindingConsumerCount`,
    );
    rendererObjectCount += imageRenderObjectCount;
    if (facts.active === true) {
      observedActiveTargetCount += 1;
      const bindingKey = stringValue(
        facts.bindingKey,
        `UPD-008 scene image ${entityId} bindingKey`,
      );
      activeBindingKeys.add(bindingKey);
      targetsByBinding.set(bindingKey, (targetsByBinding.get(bindingKey) ?? 0) + 1);
      assert(
        facts.attachmentState === 'current',
        `UPD-008 scene image ${entityId} current attachment`,
      );
      const publication = recordValue(
        facts.publication,
        `UPD-008 scene image ${entityId} publication`,
      );
      assert(
        publication.rendererFacts === 'current',
        `UPD-008 scene image ${entityId} renderer publication current`,
      );
      assert(imageRenderObjectCount > 0, `UPD-008 scene image ${entityId} renderer object`);
      assert(imageConsumerCount > 0, `UPD-008 scene image ${entityId} binding consumer`);
      const state = stringValue(facts.state, `UPD-008 scene image ${entityId} state`);
      assert(
        state === 'resolved' || state === 'failed',
        `UPD-008 scene image ${entityId} must be settled`,
      );
      const previousState = stateByBinding.get(bindingKey);
      assert(
        previousState === undefined || previousState === state,
        `UPD-008 binding ${bindingKey} state consistency`,
      );
      stateByBinding.set(bindingKey, state);
      const placeholderCount = nonNegativeInteger(
        facts.placeholderCount,
        `UPD-008 scene image ${entityId} placeholderCount`,
      );
      const role = stringValue(facts.role, `UPD-008 scene image ${entityId} role`);
      if (state === 'resolved') {
        resolvedBindingKeys.add(bindingKey);
        assert(role === 'image', `UPD-008 resolved image ${entityId} render role`);
        assert(placeholderCount === 0, `UPD-008 resolved image ${entityId} placeholder`);
      } else {
        assert(role === 'asset-placeholder', `UPD-008 failed image ${entityId} placeholder role`);
        assert(
          placeholderCount === imageRenderObjectCount,
          `UPD-008 failed image ${entityId} placeholder count`,
        );
      }
      const previousConsumers = consumersByBinding.get(bindingKey);
      assert(
        previousConsumers === undefined || previousConsumers === imageConsumerCount,
        `UPD-008 binding ${bindingKey} consumer count consistency`,
      );
      consumersByBinding.set(bindingKey, imageConsumerCount);
    } else {
      assert(imageRenderObjectCount === 0, `UPD-008 inactive image ${entityId} renderer object`);
      assert(imageConsumerCount === 0, `UPD-008 inactive image ${entityId} binding consumer`);
      assert(
        nonNegativeInteger(
          facts.placeholderCount,
          `UPD-008 inactive image ${entityId} placeholderCount`,
        ) === 0,
        `UPD-008 inactive image ${entityId} placeholder`,
      );
    }
  }
  assert(targetCount === Object.keys(images).length, 'UPD-008 scene image target count mismatch');
  assert(
    activeTargetCount === observedActiveTargetCount,
    'UPD-008 scene image active target count mismatch',
  );
  const bindingCount = nonNegativeInteger(probe.bindingCount, 'UPD-008 bindingCount');
  assert(
    bindingCount === activeBindingKeys.size,
    'UPD-008 scene image binding count mismatch',
  );
  for (const [bindingKey, activeConsumers] of targetsByBinding) {
    assert(
      consumersByBinding.get(bindingKey) === activeConsumers,
      `UPD-008 binding ${bindingKey} active consumer mismatch`,
    );
  }
  return deepFreeze({
    targetCount,
    activeTargetCount,
    bindingCount,
    resolvedBindingCount: resolvedBindingKeys.size,
    pendingBindingCount: nonNegativeInteger(
      probe.pendingBindingCount,
      'UPD-008 pendingBindingCount',
    ),
    pendingSettlementCount: nonNegativeInteger(
      probe.pendingSettlementCount,
      'UPD-008 pendingSettlementCount',
    ),
    pendingReleaseCount: nonNegativeInteger(
      probe.pendingReleaseCount,
      'UPD-008 pendingReleaseCount',
    ),
    rendererObjectCount,
    consumerCount: [...consumersByBinding.values()].reduce((sum, count) => sum + count, 0),
  });
}

function validateSceneImageRecord(value, label) {
  const image = recordValue(value, label);
  assert(typeof image.active === 'boolean', `${label} active`);
  stringValue(image.bindingKey, `${label} bindingKey`);
  stringValue(image.state, `${label} state`);
  stringValue(image.attachmentState, `${label} attachmentState`);
  nonNegativeInteger(image.renderObjectCount, `${label} renderObjectCount`);
  nonNegativeInteger(image.bindingConsumerCount, `${label} bindingConsumerCount`);
  return image;
}

export const ZERO_RESOURCE_RELEASE = Object.freeze({
  targetCount: 0,
  activeTargetCount: 0,
  bindingCount: 0,
  leaseCount: 0,
  acquisitionCount: 0,
  rendererObjectCount: 0,
  consumerCount: 0,
  assetLaneRendererObjectCount: 0,
});

const RENDER_LANE_ROLES = Object.freeze([
  'background-geometry',
  'background-assets',
  'ordinary-geometry',
  'relations-dynamic',
  'content-assets',
  'text',
  'interaction-overlay',
]);

function validateRenderLaneSnapshot(value, label) {
  const lanes = recordValue(value, label);
  assertExactKeys(lanes, RENDER_LANE_ROLES, label);
  const normalized = {};
  for (const role of RENDER_LANE_ROLES) {
    const lane = recordValue(lanes[role], `${label} ${role}`);
    assert(lane.role === role, `${label} ${role} role`);
    const labelValue = stringValue(lane.label, `${label} ${role} label`);
    normalized[role] = {
      role,
      label: labelValue,
      renderObjectCount: nonNegativeInteger(
        lane.renderObjectCount,
        `${label} ${role} renderObjectCount`,
      ),
      visiblePrimitiveCount: nonNegativeInteger(
        lane.visiblePrimitiveCount,
        `${label} ${role} visiblePrimitiveCount`,
      ),
    };
  }
  return deepFreeze(normalized);
}

function assertReleaseWithinBefore(before, release) {
  for (const [releaseKey, beforeKey] of [
    ['targetCount', 'targetCount'],
    ['activeTargetCount', 'activeTargetCount'],
    ['bindingCount', 'bindingCount'],
    ['leaseCount', 'leaseCount'],
    ['acquisitionCount', 'assetAcquisitionCount'],
    ['rendererObjectCount', 'rendererObjectCount'],
    ['consumerCount', 'consumerCount'],
    ['assetLaneRendererObjectCount', 'assetLaneRendererObjectCount'],
  ]) {
    const expected = nonNegativeInteger(
      release[releaseKey],
      `UPD-008 expected release ${releaseKey}`,
    );
    assert(
      expected <= before[beforeKey],
      `UPD-008 expected release ${releaseKey} exceeds before count`,
    );
  }
}

function retainedAfterRelease(before, after, released) {
  const allowedAfter = Math.max(0, before - released);
  return Math.max(0, after - allowedAfter);
}

function positiveRemainder(after, before) {
  return Math.max(0, after - before);
}

export async function settleUpdateResources(engine, context, publishFrame) {
  if (context.caseId !== 'UPD-008') return;
  await call(engine, 'settleSceneImages');
  if (publishFrame) {
    callSync(engine, 'publishFrame', context.clock.now());
    await call(engine, 'settleSceneImages');
  }
}

export function sceneAuthority(product) {
  return deepFreeze({
    fingerprint: product.dataset.fingerprint,
    semanticHash: product.dataset.semanticHash,
    sceneRevision: sceneRevision(product),
  });
}

export function sceneRevision(product) {
  return nonNegativeInteger(product.snapshot.revisions.sceneRevision, 'scene revision');
}

export function attachAsyncMonitor(state, engine) {
  if (state.asyncMonitorAttached) return;
  state.asyncMonitorAttached = true;
  callSync(engine, 'on', 'sceneCommitted', () => {
    state.asyncEventCount += 1;
    if (state.asyncDestroyed) state.asyncPostDestroyEventCount += 1;
  });
  callSync(engine, 'on', 'drawComplete', (event) => {
    state.asyncEventCount += 1;
    if (state.asyncDestroyed) {
      state.asyncPostDestroyEventCount += 1;
      return;
    }
    state.asyncPublishedRevisions.push(
      positiveInteger(event.sourceRevision, 'drawComplete source revision'),
    );
    state.asyncPublishedRequestIds.push(
      stringValue(event.requestId, 'drawComplete request ID'),
    );
  });
  callSync(engine, 'on', 'frame', () => {
    state.asyncFrameCount += 1;
    if (state.asyncDestroyed) state.asyncPostDestroyFrameCount += 1;
  });
}

export async function resolveBaselineDataset(context) {
  const profiles = recordValue(context.fixtureProfiles, 'fixture profiles');
  const profile = profiles[BASELINE_PROFILE];
  const datasetRef = isRecord(profile)
    ? stringValue(profile.datasetRef, `${BASELINE_PROFILE}.datasetRef`)
    : 'all-kinds-scene';
  return {
    datasetRef,
    dataset: await context.resolveDataset(datasetRef),
  };
}

export function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

export function asyncTemporaryFacts(state) {
  return {
    allocated: state.asyncTemporaryAllocated,
    released: state.asyncTemporaryReleased,
    unreleased: Math.max(
      0,
      state.asyncTemporaryAllocated - state.asyncTemporaryReleased,
    ),
  };
}

export function persistedDatasetParts(datasetValue) {
  assert(Array.isArray(datasetValue), 'persisted dataset array');
  const elements = [];
  const links = [];
  for (const record of datasetValue) {
    if (record?.type === 'relations') links.push(clone(record));
    else elements.push(clone(record));
  }
  return deepFreeze({ elements, links });
}

export function stableDatasetIds(datasetValue) {
  assert(Array.isArray(datasetValue), 'stable ID dataset array');
  const ids = [];
  const visit = (elements) => {
    for (const element of elements) {
      const record = recordValue(element, 'stable ID element');
      const id = stringValue(record.id, 'stable ID element identity');
      ids.push(id);
      if (record.type === 'item') {
        appendComponentIds(ids, id, record.components);
      } else if (record.type === 'grid') {
        const item = recordValue(record.item, 'stable ID grid item');
        appendComponentIds(ids, id, item.components);
      } else if (record.type === 'group') {
        assert(Array.isArray(record.children), 'stable ID group children');
        visit(record.children);
      }
    }
  };
  visit(datasetValue);
  return Object.freeze(ids.sort());
}

function appendComponentIds(ids, ownerId, componentsValue) {
  assert(Array.isArray(componentsValue), 'stable ID components');
  for (const component of componentsValue) {
    const record = recordValue(component, 'stable ID component');
    ids.push(`${ownerId}/${stringValue(record.id, 'stable component ID')}`);
  }
}

export function liveOverlayOperations(sourceRevision, seed) {
  const variant = (sourceRevision + seed) >>> 0;
  return [
    {
      op: 'merge',
      target: elementTarget('item-a'),
      changes: [
        { path: ['size', 'width'], value: 100 + sourceRevision },
        { path: ['size', 'height'], value: 80 + sourceRevision % 7 },
        { path: ['padding'], value: 2 + sourceRevision % 5 },
      ],
    },
    {
      op: 'merge',
      target: elementTarget('rect-b'),
      changes: [{ path: ['show'], value: sourceRevision % 2 === 1 }],
    },
    {
      op: 'merge',
      target: componentTarget('item-a', 'bar'),
      changes: [
        { path: ['size', 'height'], value: 8 + sourceRevision % 31 },
        {
          path: ['tint'],
          value: variant % 2 === 0 ? '#22aa66ff' : '#ee8844ff',
        },
      ],
    },
    {
      op: 'merge',
      target: componentTarget('item-a', 'label'),
      changes: [
        { path: ['text'], value: `Overlay ${seed}:${sourceRevision}` },
        {
          path: ['tint'],
          value: variant % 2 === 0 ? '#113355ff' : '#552211ff',
        },
      ],
    },
    {
      op: 'merge',
      target: componentTarget('item-a', 'icon'),
      changes: [
        { path: ['source'], value: variant % 2 === 0 ? 'warning' : 'wifi' },
        {
          path: ['tint'],
          value: variant % 2 === 0 ? '#ef4444ff' : '#2563ebff',
        },
      ],
    },
  ];
}

export function refreshTargets(value) {
  assert(Array.isArray(value), 'refresh targets array');
  return value.map((entry, index) => {
    if (typeof entry === 'string') return elementTarget(stringValue(entry, `refresh target ${index}`));
    const record = recordValue(entry, `refresh target ${index}`);
    assertExactKeys(record, ['id', 'ownerId'], `refresh target ${index}`);
    return componentTarget(
      stringValue(record.ownerId, `refresh target ${index} ownerId`),
      stringValue(record.id, `refresh target ${index} id`),
    );
  });
}

export function bulkOverlayOperations(targetIds, fields, actionIndex) {
  if (fields.length === 0) {
    return targetIds.map((id) => ({
      op: 'merge',
      target: elementTarget(id),
      changes: [{ path: ['show'], value: true }],
    }));
  }
  const allowed = new Set(['bar', 'text', 'tint', 'show', 'size', 'padding']);
  assert(fields.every((field) => allowed.has(field)), 'bulkOverlay fields');
  const operations = [];
  targetIds.forEach((id, index) => {
    const elementChanges = [];
    if (fields.includes('show')) elementChanges.push({ path: ['show'], value: index % 9 !== 0 });
    if (fields.includes('size')) {
      elementChanges.push({ path: ['size', 'width'], value: 90 + index % 17 });
      elementChanges.push({ path: ['size', 'height'], value: 56 + index % 13 });
    }
    if (fields.includes('padding')) {
      elementChanges.push({ path: ['padding'], value: 2 + index % 5 });
    }
    if (elementChanges.length > 0) {
      operations.push({ op: 'merge', target: elementTarget(id), changes: elementChanges });
    }
    const barChanges = [];
    if (fields.includes('bar')) {
      barChanges.push({ path: ['size', 'height'], value: 4 + (index * 7 + actionIndex) % 44 });
    }
    if (fields.includes('tint')) {
      barChanges.push({ path: ['tint'], value: index % 2 === 0 ? '#22aa66' : '#ee8844' });
    }
    if (barChanges.length > 0) {
      operations.push({
        op: 'merge',
        target: componentTarget(id, 'bar'),
        changes: barChanges,
      });
    }
    const textChanges = [];
    if (fields.includes('text')) {
      textChanges.push({ path: ['text'], value: `Node ${index}:${actionIndex}` });
    }
    if (fields.includes('tint')) {
      textChanges.push({ path: ['tint'], value: index % 2 === 0 ? '#113355' : '#552211' });
    }
    if (textChanges.length > 0) {
      operations.push({
        op: 'merge',
        target: componentTarget(id, 'label'),
        changes: textChanges,
      });
    }
  });
  return operations;
}

export function syntheticTargetIds(count) {
  return Object.freeze(Array.from({ length: count }, (_, index) => `node-${index}`));
}

export function patchChanges(patch) {
  const changes = [];
  appendPatchChanges(changes, [], patch);
  return changes;
}

function appendPatchChanges(changes, path, value) {
  if (isRecord(value) && Object.keys(value).length > 0) {
    for (const key of Object.keys(value).sort()) {
      appendPatchChanges(changes, [...path, key], value[key]);
    }
    return;
  }
  if (path.length > 0) changes.push({ path, value: clone(value) });
}

export function resolvedTargetObservation(snapshotValue) {
  const snapshot = recordValue(snapshotValue, 'resolved target snapshot');
  const target = recordValue(snapshot.target, 'resolved target');
  const value = recordValue(snapshot.value, 'resolved target value');
  return deepFreeze({
    ...clone(value),
    ...(target.kind === 'component' ? { ownerId: target.ownerId } : {}),
    lifecycleGeneration: positiveInteger(
      snapshot.lifecycleGeneration,
      'resolved target lifecycleGeneration',
    ),
    sceneRevision: nonNegativeInteger(snapshot.sceneRevision, 'resolved target sceneRevision'),
  });
}

export function visibleCenter(entity, record) {
  if (Array.isArray(entity?.visibleCenter) && entity.visibleCenter.length === 2) {
    return clone(entity.visibleCenter);
  }
  if (!record) return null;
  const x = recordCoordinate(record, 'x');
  const y = recordCoordinate(record, 'y');
  const width = finiteNumber(record.size?.width, 'record width');
  const height = finiteNumber(record.size?.height, 'record height');
  const angle = typeof record.attrs?.angle === 'number' ? record.attrs.angle : 0;
  const radians = angle * Math.PI / 180;
  return Object.freeze([
    x + width / 2 * Math.cos(radians) - height / 2 * Math.sin(radians),
    y + width / 2 * Math.sin(radians) + height / 2 * Math.cos(radians),
  ]);
}

export function recordBounds(record) {
  if (!record) return null;
  return [
    recordCoordinate(record, 'x'),
    recordCoordinate(record, 'y'),
    finiteNumber(record.size?.width, 'record width'),
    finiteNumber(record.size?.height, 'record height'),
  ];
}

export function recordCoordinate(record, key) {
  return finiteNumber(record?.attrs?.[key], `record ${key}`);
}

export function geometryEntityById(geometry, id) {
  return Array.isArray(geometry?.entities)
    ? geometry.entities.find((entity) => entity.id === id) ?? null
    : null;
}

export function selectGeometryTarget(state, engine, targetId) {
  if (state.selectedGeometryTarget) return;
  callSync(engine, 'select', [targetId]);
  state.selectedGeometryTarget = true;
}

export function readFixtureReference(params, reference) {
  const prefix = '/fixtures/';
  assert(reference.startsWith(prefix), 'fixture reference prefix');
  const key = reference.slice(prefix.length);
  assert(key.length > 0 && !key.includes('/'), 'fixture reference key');
  assert(Object.hasOwn(params, key), `fixture reference ${key}`);
  return params[key];
}

export function projectDeclaredPaths(source, paths) {
  const projected = {};
  for (const path of paths) {
    const segments = declaredPathSegments(path);
    let cursor = source;
    for (const segment of segments) {
      assert(isRecord(cursor) || Array.isArray(cursor), `capture path ${path}`);
      assert(Object.hasOwn(cursor, segment), `capture path ${path}`);
      cursor = cursor[segment];
    }
    writeProjectedPath(projected, segments, clone(cursor));
  }
  return deepFreeze(projected);
}

function declaredPathSegments(path) {
  const separator = path.includes('/') ? '/' : '.';
  const segments = path.split(separator);
  assert(
    segments.length > 0 && segments.every((segment) => (
      segment.length > 0 &&
      segment !== '__proto__' &&
      segment !== 'prototype' &&
      segment !== 'constructor'
    )),
    `capture path ${path}`,
  );
  return segments;
}

function writeProjectedPath(target, segments, value) {
  let cursor = target;
  segments.forEach((segment, index) => {
    const terminal = index === segments.length - 1;
    if (terminal) {
      assert(!Object.hasOwn(cursor, segment), `duplicate capture path ${segments.join('/')}`);
      cursor[segment] = value;
      return;
    }
    if (!Object.hasOwn(cursor, segment)) cursor[segment] = {};
    cursor = recordValue(cursor[segment], `capture projection ${segments.join('/')}`);
  });
}

export function fixtureReference(value, label) {
  const record = recordValue(value, label);
  assertExactKeys(record, ['$ref'], label);
  return stringValue(record.$ref, `${label}.$ref`);
}

export function componentTargetFromValue(value, label) {
  const record = recordValue(value, label);
  assertExactKeys(record, ['id', 'ownerId'], label);
  return componentTarget(
    stringValue(record.ownerId, `${label}.ownerId`),
    stringValue(record.id, `${label}.id`),
  );
}

export function elementTarget(id) {
  return Object.freeze({ kind: 'element', id });
}

export function componentTarget(ownerId, id) {
  return Object.freeze({ kind: 'component', ownerId, id });
}

export function inputObservation(beforeFingerprint, afterFingerprint) {
  return deepFreeze({
    beforeFingerprint,
    afterFingerprint,
    unchanged: beforeFingerprint === afterFingerprint,
  });
}

export function fingerprintValue(context, value) {
  const beforeFingerprint = context.fingerprint(value);
  return inputObservation(beforeFingerprint, context.fingerprint(value));
}

export function validateProductAdapter(product) {
  const adapter = recordValue(product, 'product adapter');
  assertExactKeys(adapter, ['createSyntheticScene', 'resourceProbe'], 'product adapter');
  for (const method of ['createSyntheticScene', 'resourceProbe']) {
    assert(typeof adapter[method] === 'function', `product adapter ${method}()`);
  }
  return adapter;
}

export function validateContext(contextValue) {
  const context = recordValue(contextValue, 'handler context');
  for (const method of [
    'ensureMainEngine',
    'ensureSessionEngine',
    'createEngine',
    'releaseEngine',
    'resolveDataset',
    'fingerprint',
    'getBinding',
  ]) {
    assert(typeof context[method] === 'function', `context ${method}()`);
  }
  assert(isRecord(context.fixtureParams), 'context fixtureParams');
  assert(isRecord(context.fixtureProfiles), 'context fixtureProfiles');
  assert(isRecord(context.routeParams), 'context routeParams');
  assert(isRecord(context.clock), 'context clock');
  assert(typeof context.clock.advanceTo === 'function', 'context clock.advanceTo()');
  assert(isRecord(context.signal), 'context signal');
  return context;
}

export function validateRouteParams(value) {
  const route = recordValue(value, 'route params');
  if (Object.hasOwn(route, 'seed')) nonNegativeInteger(route.seed, 'route seed');
  if (Object.hasOwn(route, 'size')) stringValue(route.size, 'route size');
}

export function callSync(target, method, ...args) {
  const fn = target?.[method];
  assert(typeof fn === 'function', `product method ${method}()`);
  return fn.apply(target, args);
}

export async function call(target, method, ...args) {
  return callSync(target, method, ...args);
}

export function exactOperands(action, keys) {
  const operands = recordValue(action.operands, `${action.type} operands`);
  assertExactKeys(operands, keys, `${action.type} operands`);
  return operands;
}

export function assertExactKeys(value, keys, label) {
  const actual = Object.keys(value).sort();
  const required = [...keys].sort();
  assert(
    actual.length === required.length && actual.every((key, index) => key === required[index]),
    `${label} keys`,
  );
}

export function stringArray(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  return value.map((entry, index) => stringValue(entry, `${label}[${index}]`));
}

export function integerArray(value, label) {
  return arrayValue(value, label).map((entry, index) =>
    positiveInteger(entry, `${label}[${index}]`));
}

export function arrayValue(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  return value;
}

export function mutationTargetIds(value) {
  return arrayValue(value, 'mutation targets').map((entry, index) => {
    if (typeof entry === 'string') return entry;
    const target = recordValue(entry, `mutation target ${index}`);
    return stringValue(target.id, `mutation target ${index} id`);
  });
}

export function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} must be a string`);
  return value;
}

export function booleanValue(value, label) {
  assert(typeof value === 'boolean', `${label} must be boolean`);
  return value;
}

export function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} must be finite`);
  return Object.is(value, -0) ? 0 : value;
}

export function positiveInteger(value, label) {
  assert(Number.isSafeInteger(value) && value > 0, `${label} must be positive`);
  return value;
}

export function nonNegativeInteger(value, label) {
  assert(Number.isSafeInteger(value) && value >= 0, `${label} must be non-negative`);
  return value;
}

export function recordValue(value, label) {
  assert(isRecord(value), `${label} must be an object`);
  return value;
}

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isDeepFrozen(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return true;
  if (seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Reflect.ownKeys(value).every((key) => isDeepFrozen(value[key], seen));
}

export function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

export function assert(condition, message) {
  if (!condition) throw new Error(`Invalid PatchMap update transaction handler: ${message}`);
}
