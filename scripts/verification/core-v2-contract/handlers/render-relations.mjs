export const RENDER_RELATIONS_ACTION_TYPES = Object.freeze([
  'loadDataset',
  'observeRelationPath',
  'patch',
  'setVisibility',
  'observeRelationContractMatrix',
]);

export const RENDER_RELATIONS_CASE_IDS = Object.freeze(['REN-007']);

const CASE_TRACE = Object.freeze([
  action('loadDataset', { datasetId: 'relations' }),
  action('observeRelationPath', {
    relationId: 'links',
    hitPoints: [[39, 10], [60, 60]],
  }),
  action('patch', {
    targetId: 'b',
    changes: { attrs: { x: 140, y: 60 } },
  }),
  action('setVisibility', { targetId: 'b', show: false }),
  action('setVisibility', { targetId: 'b', show: true }),
  action('observeRelationContractMatrix', { valueRef: 'relationContractMatrix' }),
]);

const HANDLERS = Object.freeze({
  loadDataset: loadDatasetAction,
  observeRelationPath: observeRelationPathAction,
  patch: patchAction,
  setVisibility: setVisibilityAction,
  observeRelationContractMatrix: observeRelationContractMatrixAction,
});

const INPUT_BASELINES = new WeakMap();
const INITIAL_SIZE = Object.freeze({ width: 640, height: 480, pixelRatio: 1 });
const MATRIX_SIZE = Object.freeze({ width: 800, height: 600, pixelRatio: 1 });

/** Register REN-007's browser-safe, answer-independent public Engine actions. */
export function createRenderRelationsHandlerEntries() {
  return Object.freeze(RENDER_RELATIONS_ACTION_TYPES.map((type) => Object.freeze([
    `contract/${type}`,
    withContext(HANDLERS[type]),
  ])));
}

function withContext(handler) {
  return async (context, actionRecord) => {
    validateContext(context);
    assert(context.caseId === 'REN-007', `unsupported case ${String(context.caseId)}`);
    assert(Number.isInteger(context.actionIndex), 'context actionIndex');
    const trace = CASE_TRACE[context.actionIndex];
    assert(trace !== undefined, `REN-007 action ${context.actionIndex}`);
    assert(actionRecord.index === context.actionIndex, 'action index');
    assert(actionRecord.type === trace.type, `action ${context.actionIndex} type`);
    assert(sameJson(actionRecord.operands, trace.operands), `action ${context.actionIndex} operands`);
    validateFixtureParams(context.fixtureParams);
    assert(!context.signal.aborted, 'action is aborted');
    return handler(context, actionRecord);
  };
}

async function loadDatasetAction(context, actionRecord) {
  const operands = exactOperands(actionRecord, ['datasetId']);
  const datasetId = stringValue(operands.datasetId, 'loadDataset.datasetId');
  const fixtureBefore = context.fingerprint(context.fixtureParams);
  const dataset = buildInitialDataset(context.fixtureParams, CASE_TRACE[1].operands.relationId);
  const datasetBefore = context.fingerprint(dataset);
  const engine = await ensureInitializedEngine(context);
  const loaded = await call(engine, 'loadDataset', dataset, { datasetRef: datasetId });
  INPUT_BASELINES.set(engine, { dataset, datasetBefore, fixtureBefore });
  await publish(engine, context);
  const relations = requireRelationProbe(callSync(engine, 'relationProbe'), 'initial relation probe');
  return {
    actual: {
      datasetId,
      loaded: clone(loaded),
      relationProbe: projectRelationProbe(relations),
      input: inputFingerprints(context, dataset, datasetBefore, fixtureBefore),
      product: observeProduct(engine),
    },
  };
}

async function observeRelationPathAction(context, actionRecord) {
  const operands = exactOperands(actionRecord, ['relationId', 'hitPoints']);
  const relationId = stringValue(operands.relationId, 'observeRelationPath.relationId');
  const hitPoints = pointList(operands.hitPoints, 'observeRelationPath.hitPoints');
  assert(hitPoints.length === 2, 'observeRelationPath hit point count');
  const engine = currentEngine(context, 'observeRelationPath');
  const probe = projectRelationProbe(
    requireRelationProbe(callSync(engine, 'relationProbe'), 'relation path probe'),
  );
  const relations = probe.relations.filter((relation) => relation.relationId === relationId);
  assert(relations.length > 0, `${relationId} relation paths`);
  const selfLink = relations.find((relation) => relation.sourceId === relation.targetId);
  assert(selfLink !== undefined, `${relationId} self relation`);
  const direct = directRelation(relations, context.fixtureParams.nodes);
  const tolerance = relationHitTolerance(context.fixtureParams);
  const hitResults = hitPoints.map((point) => {
    const hit = callSync(
      engine,
      'relationHitTestScreen',
      { x: point[0], y: point[1] },
      { toleranceCssPx: tolerance },
    );
    assert(hit === null || isRecord(hit), 'relationHitTestScreen result');
    return hit === null ? null : clone(hit);
  });
  return {
    actual: {
      relationId,
      segmentKeys: relations.map(({ key }) => key),
      duplicatePairCount: duplicateKeyCount(relations),
      selfLink: {
        kind: selfLink.kind,
        worldPoints: selfLink.worldPoints,
        worldBounds: selfLink.worldBounds,
      },
      direct: {
        key: direct.key,
        startWorld: direct.worldEndpoints[0],
        endWorld: direct.worldEndpoints[1],
      },
      hitProbe: { point: hitPoints[0], target: hitResults[0]?.key ?? null, tolerance },
      missProbe: { point: hitPoints[1], target: hitResults[1]?.key ?? null },
      relationProbe: probe,
      product: observeProduct(engine),
    },
  };
}

async function patchAction(context, actionRecord) {
  const operands = exactOperands(actionRecord, ['targetId', 'changes']);
  const targetId = stringValue(operands.targetId, 'patch.targetId');
  const changes = cloneRecord(operands.changes, 'patch.changes');
  const engine = currentEngine(context, 'patch');
  const mutation = await committedPatch(engine, targetId, changes, 'endpoint patch');
  await publish(engine, context);
  const probe = projectRelationProbe(
    requireRelationProbe(callSync(engine, 'relationProbe'), 'endpoint patch relation probe'),
  );
  const relations = probe.relations.filter(({ relationId }) => relationId === CASE_TRACE[1].operands.relationId);
  const direct = directRelation(relations, context.fixtureParams.nodes);
  return {
    actual: {
      targetId,
      changes,
      mutation,
      direct: { key: direct.key, startWorld: direct.worldEndpoints[0], endWorld: direct.worldEndpoints[1] },
      staleSegmentCount: duplicateKeyCount(relations),
      relationProbe: probe,
      product: observeProduct(engine),
    },
  };
}

async function setVisibilityAction(context, actionRecord) {
  const operands = exactOperands(actionRecord, ['targetId', 'show']);
  const targetId = stringValue(operands.targetId, 'setVisibility.targetId');
  const show = booleanValue(operands.show, 'setVisibility.show');
  const engine = currentEngine(context, 'setVisibility');
  const mutation = await committedPatch(engine, targetId, { show }, 'visibility patch');
  await publish(engine, context);
  const probe = projectRelationProbe(
    requireRelationProbe(callSync(engine, 'relationProbe'), 'visibility relation probe'),
  );
  const relations = probe.relations.filter(({ relationId }) => relationId === CASE_TRACE[1].operands.relationId);
  return {
    actual: {
      targetId,
      show,
      mutation,
      visibleSegmentKeys: relations.filter(({ visible }) => visible).map(({ key }) => key),
      staleSegmentCount: duplicateKeyCount(relations),
      relationProbe: probe,
      product: observeProduct(engine),
    },
  };
}

async function observeRelationContractMatrixAction(context, actionRecord) {
  const operands = exactOperands(actionRecord, ['valueRef']);
  const valueRef = stringValue(operands.valueRef, 'observeRelationContractMatrix.valueRef');
  const matrixFixture = recordValue(context.fixtureParams[valueRef], 'relation contract matrix fixture');
  const main = currentEngine(context, 'observeRelationContractMatrix');
  const mainDataset = cloneArray(matrixFixture.dataset, 'relation contract matrix dataset');
  const mainBefore = context.fingerprint(mainDataset);
  const contractMatrix = await executeContractMatrix(main, context, matrixFixture, mainDataset, 'main');
  const mainAfter = context.fingerprint(mainDataset);

  const repeatRecord = await context.createEngine('relation-contract-repeat');
  const repeat = recordValue(repeatRecord, 'repeat engine record').engine;
  assert(isRecord(repeat), 'repeat engine');
  await initializeEngine(repeat, 'ren-007-relation-repeat');
  const repeatDataset = cloneArray(matrixFixture.dataset, 'repeat relation contract matrix dataset');
  const repeatBefore = context.fingerprint(repeatDataset);
  const repeatContractMatrix = await executeContractMatrix(
    repeat,
    context,
    matrixFixture,
    repeatDataset,
    'repeat',
  );
  const repeatAfter = context.fingerprint(repeatDataset);

  const baseline = INPUT_BASELINES.get(main);
  assert(isRecord(baseline), 'relation input baseline');
  const fixtureAfterActions = context.fingerprint(context.fixtureParams);
  const initialDatasetAfterActions = context.fingerprint(baseline.dataset);
  const input = {
    fixtureBefore: baseline.fixtureBefore,
    fixtureAfterActions,
    initialDatasetBefore: baseline.datasetBefore,
    initialDatasetAfterActions,
    matrixDatasetBefore: mainBefore,
    matrixDatasetAfterActions: mainAfter,
    repeatDatasetBefore: repeatBefore,
    repeatDatasetAfterActions: repeatAfter,
    unchanged: baseline.fixtureBefore === fixtureAfterActions
      && baseline.datasetBefore === initialDatasetAfterActions
      && mainBefore === mainAfter
      && repeatBefore === repeatAfter,
  };
  INPUT_BASELINES.delete(main);
  return {
    actual: {
      valueRef,
      relationId: contractMatrix.relationId,
      contractMatrix: contractMatrix.observation,
      repeatContractMatrix: repeatContractMatrix.observation,
      operations: contractMatrix.operations,
      repeatOperations: repeatContractMatrix.operations,
      complete: contractMatrix.complete && repeatContractMatrix.complete,
      deterministic: sameJson(contractMatrix.observation, repeatContractMatrix.observation),
      input,
      product: observeProduct(main),
    },
  };
}

async function executeContractMatrix(engine, context, fixture, dataset, role) {
  const relationElement = relationElementFromDataset(dataset);
  const relationId = stringValue(relationElement.id, `${role} relation ID`);
  const loaded = await call(engine, 'loadDataset', dataset, {
    datasetRef: `ren-007-contract-matrix-${role}`,
  });
  await publish(engine, context);
  const initial = relationObservation(engine, relationId, `${role} initial`);
  assert(initial.relations.length > 0, `${role} initial relation paths`);
  const forward = initial.relations[0];
  assert(forward !== undefined, `${role} forward relation`);

  const resized = await call(
    engine,
    'resize',
    MATRIX_SIZE.width,
    MATRIX_SIZE.height,
    MATRIX_SIZE.pixelRatio,
  );
  assert(resized === true, `${role} matrix resize must change the surface`);
  const view = relationView(fixture.view);
  const world = {
    rotationDegrees: view.rotationDegrees,
    flipX: view.flipX,
    flipY: view.flipY,
  };
  const worldState = await call(engine, 'setWorldTransform', world);
  const centerWorld = centerWorldForPan(MATRIX_SIZE, view);
  const viewport = await call(engine, 'setViewport', { centerWorld, scale: view.scale });
  await publish(engine, context);
  const transformed = relationObservation(engine, relationId, `${role} transformed`);
  const transformedForward = relationByKey(transformed.relations, forward.key, `${role} transformed forward`);

  const endpointResize = endpointResizeValue(fixture.endpointResize);
  const resizeMutation = await committedPatch(
    engine,
    endpointResize.target,
    { size: endpointResize.size },
    `${role} endpoint resize`,
  );
  await publish(engine, context);
  const afterResize = relationObservation(engine, relationId, `${role} after endpoint resize`);
  const resizedForward = relationByKey(afterResize.relations, forward.key, `${role} resized forward`);

  const links = changedLinks(relationElement.links, fixture.linkSetChange);
  const linksMutation = await committedPatch(engine, relationId, { links }, `${role} links patch`);
  await publish(engine, context);
  const afterLinks = relationObservation(engine, relationId, `${role} after links patch`);

  const gridId = gridIdFromDataset(dataset);
  const hideMutation = await committedPatch(engine, gridId, { show: false }, `${role} grid hide`);
  await publish(engine, context);
  const hidden = relationObservation(engine, relationId, `${role} hidden grid`);
  const showMutation = await committedPatch(engine, gridId, { show: true }, `${role} grid show`);
  await publish(engine, context);
  const shown = relationObservation(engine, relationId, `${role} shown grid`);

  const observation = {
    initialSegmentKeys: initial.relations.map(({ key }) => key),
    sourceCenterWorld: forward.worldEndpoints[0],
    targetCenterWorld: forward.worldEndpoints[1],
    sourceCenterRelationsLocal: firstPoint(forward.localPoints, `${role} source local`),
    targetCenterRelationsLocal: lastPoint(forward.localPoints, `${role} target local`),
    sourceCenterScreen: transformedForward.screenEndpoints[0],
    targetCenterScreen: transformedForward.screenEndpoints[1],
    sourceCenterAfterResizeWorld: resizedForward.worldEndpoints[0],
    finalSegmentKeys: shown.relations.map(({ key }) => key),
    omittedMissingEndpointSegments: afterLinks.omittedRelations.length,
    visibleAfterGridHide: hidden.relations.filter(({ visible }) => visible).map(({ key }) => key),
    visibleAfterGridShow: shown.relations.filter(({ visible }) => visible).map(({ key }) => key),
    style: relationStyleObservation(forward),
  };
  return {
    relationId,
    observation,
    complete: initial.relations.length > 0
      && transformed.relations.length === initial.relations.length
      && afterResize.relations.length === initial.relations.length,
    operations: {
      loaded: clone(loaded),
      resized,
      worldState: clone(worldState),
      viewport: clone(viewport),
      centerWorld,
      resizeMutation,
      linksMutation,
      hideMutation,
      showMutation,
    },
  };
}

function relationObservation(engine, relationId, label) {
  const probe = projectRelationProbe(requireRelationProbe(callSync(engine, 'relationProbe'), `${label} probe`));
  return {
    relations: probe.relations.filter((relation) => relation.relationId === relationId),
    omittedRelations: probe.omittedRelations.filter((relation) => relation.relationId === relationId),
  };
}

async function ensureInitializedEngine(context) {
  const engine = await context.ensureMainEngine();
  const snapshot = snapshotEngine(engine);
  if (snapshot.lifecycle === 'new') {
    await initializeEngine(engine, 'ren-007-relations-engine');
  } else {
    assert(snapshot.lifecycle === 'ready-empty', `relation load lifecycle ${String(snapshot.lifecycle)}`);
  }
  return engine;
}

async function initializeEngine(engine, instanceId) {
  return call(engine, 'initialize', {
    instanceId,
    width: INITIAL_SIZE.width,
    height: INITIAL_SIZE.height,
    pixelRatio: INITIAL_SIZE.pixelRatio,
    strategy: 'mesh',
    preference: 'webgl',
  });
}

async function publish(engine, context) {
  assert(!context.signal.aborted, 'action is aborted');
  const timeMs = context.clock.now();
  finiteNumber(timeMs, 'clock.now()');
  await call(engine, 'publishFrame', timeMs);
  assert(!context.signal.aborted, 'action is aborted');
}

async function committedPatch(engine, targetId, changes, label) {
  const result = await call(engine, 'patch', { kind: 'element', id: targetId }, clone(changes));
  assert(isRecord(result), `${label} result`);
  assert(result.status === 'committed', `${label} must commit, received ${String(result.status)}`);
  assert(result.changed === true, `${label} must change`);
  return clone(result);
}

function observeProduct(engine) {
  const snapshot = snapshotEngine(engine);
  const semanticProbe = callSync(engine, 'semanticProbe');
  const relationProbe = callSync(engine, 'relationProbe');
  const dataset = callSync(engine, 'exportDataset');
  assert(isRecord(semanticProbe), 'semanticProbe() must return an object');
  requireRelationProbe(relationProbe, 'relationProbe() result');
  assert(Array.isArray(dataset), 'exportDataset() must return an array');
  return clone({ snapshot, semanticProbe, relationProbe, dataset });
}

function projectRelationProbe(value) {
  const probe = requireRelationProbe(value, 'relation probe');
  return {
    revision: nullableFiniteNumber(probe.revision, 'relation probe revision'),
    revisionLag: nullableFiniteNumber(probe.revisionLag, 'relation probe revisionLag'),
    relations: probe.relations.map(projectRelation),
    omittedRelations: probe.omittedRelations.map(projectOmittedRelation),
  };
}

function projectRelation(value, index) {
  const relation = recordValue(value, `relation ${index}`);
  const style = recordValue(relation.style, `relation ${index} style`);
  return {
    id: stringValue(relation.id, `relation ${index} id`),
    relationId: stringValue(relation.relationId, `relation ${index} relationId`),
    key: stringValue(relation.key, `relation ${index} key`),
    sourceId: stringValue(relation.sourceId, `relation ${index} sourceId`),
    targetId: stringValue(relation.targetId, `relation ${index} targetId`),
    kind: relationKind(relation.kind, `relation ${index} kind`),
    localPoints: pointList(relation.localPoints, `relation ${index} localPoints`),
    worldPoints: pointList(relation.worldPoints, `relation ${index} worldPoints`),
    screenPoints: pointList(relation.screenPoints, `relation ${index} screenPoints`),
    worldBounds: boundsValue(relation.worldBounds, `relation ${index} worldBounds`),
    screenBounds: boundsValue(relation.screenBounds, `relation ${index} screenBounds`),
    visible: booleanValue(relation.visible, `relation ${index} visible`),
    style: {
      color: stringValue(style.colorHex, `relation ${index} colorHex`),
      width: normalizeNumber(style.width, `relation ${index} width`),
      opacity: normalizeNumber(style.opacity, `relation ${index} opacity`),
      zIndex: normalizeNumber(style.zIndex, `relation ${index} zIndex`),
    },
    worldEndpoints: endpointPair(relation.worldEndpoints, `relation ${index} worldEndpoints`),
    screenEndpoints: endpointPair(relation.screenEndpoints, `relation ${index} screenEndpoints`),
  };
}

function projectOmittedRelation(value, index) {
  const relation = recordValue(value, `omitted relation ${index}`);
  const reason = stringValue(relation.reason, `omitted relation ${index} reason`);
  assert(
    reason === 'missing-source' || reason === 'missing-target' || reason === 'missing-source-and-target',
    `omitted relation ${index} reason`,
  );
  return {
    id: stringValue(relation.id, `omitted relation ${index} id`),
    relationId: stringValue(relation.relationId, `omitted relation ${index} relationId`),
    key: stringValue(relation.key, `omitted relation ${index} key`),
    sourceId: stringValue(relation.sourceId, `omitted relation ${index} sourceId`),
    targetId: stringValue(relation.targetId, `omitted relation ${index} targetId`),
    authoredIndex: nonNegativeInteger(relation.authoredIndex, `omitted relation ${index} authoredIndex`),
    reason,
  };
}

function buildInitialDataset(params, relationId) {
  assert(Array.isArray(params.nodes) && params.nodes.length >= 2, 'fixture nodes');
  assert(Array.isArray(params.links) && params.links.length > 0, 'fixture links');
  const nodes = params.nodes.map((value, index) => {
    const node = recordValue(value, `fixture node ${index}`);
    const bounds = boundsValue(node.bounds, `fixture node ${index} bounds`);
    return {
      type: 'rect',
      id: stringValue(node.id, `fixture node ${index} id`),
      size: { width: bounds[2], height: bounds[3] },
      fill: '#334155',
      attrs: { x: bounds[0], y: bounds[1] },
    };
  });
  const links = params.links.map((value, index) => {
    const pair = stringPair(value, `fixture link ${index}`);
    return { source: pair[0], target: pair[1] };
  });
  return [...nodes, { type: 'relations', id: relationId, links }];
}

function relationElementFromDataset(dataset) {
  const matches = dataset.filter((entry) => isRecord(entry) && entry.type === 'relations');
  assert(matches.length === 1, 'relation contract dataset relation element');
  const relation = matches[0];
  assert(Array.isArray(relation.links), 'relation contract dataset links');
  return relation;
}

function gridIdFromDataset(dataset) {
  const matches = dataset.filter((entry) => isRecord(entry) && entry.type === 'grid');
  assert(matches.length === 1, 'relation contract dataset grid element');
  return stringValue(matches[0].id, 'relation contract grid ID');
}

function directRelation(relations, nodes) {
  assert(Array.isArray(nodes) && nodes.length >= 2, 'fixture direct relation nodes');
  const sourceId = stringValue(recordValue(nodes[0], 'fixture source node').id, 'fixture source node ID');
  const targetId = stringValue(recordValue(nodes[1], 'fixture target node').id, 'fixture target node ID');
  const matches = relations.filter((relation) => relation.sourceId === sourceId && relation.targetId === targetId);
  assert(matches.length === 1, 'direct relation must resolve exactly once');
  return matches[0];
}

function relationByKey(relations, key, label) {
  const matches = relations.filter((relation) => relation.key === key);
  assert(matches.length === 1, `${label} must resolve exactly once`);
  return matches[0];
}

function relationStyleObservation(relation) {
  return {
    color: relation.style.color,
    width: relation.style.width,
    opacity: relation.style.opacity,
    zIndex: relation.style.zIndex,
    visible: relation.visible,
  };
}

function relationHitTolerance(params) {
  const contract = recordValue(params.selfLinkContract, 'self link contract');
  const tolerance = finiteNumber(contract.hitTolerance, 'self link hit tolerance');
  assert(tolerance >= 0, 'self link hit tolerance non-negative');
  return tolerance;
}

function endpointResizeValue(value) {
  const resize = recordValue(value, 'endpointResize');
  const size = recordValue(resize.size, 'endpointResize.size');
  return {
    target: stringValue(resize.target, 'endpointResize.target'),
    size: {
      width: finiteNumber(size.width, 'endpointResize.size.width'),
      height: finiteNumber(size.height, 'endpointResize.size.height'),
    },
  };
}

function changedLinks(values, value) {
  assert(Array.isArray(values), 'relation links');
  const change = recordValue(value, 'linkSetChange');
  const remove = linkValue(change.remove, 'linkSetChange.remove');
  const addMissing = linkValue(change.addMissing, 'linkSetChange.addMissing');
  return [
    ...values.map((entry, index) => linkValue(entry, `relation link ${index}`))
      .filter((link) => link.source !== remove.source || link.target !== remove.target),
    addMissing,
  ];
}

function linkValue(value, label) {
  const link = recordValue(value, label);
  return {
    source: stringValue(link.source, `${label}.source`),
    target: stringValue(link.target, `${label}.target`),
  };
}

function relationView(value) {
  const view = recordValue(value, 'relation matrix view');
  return {
    rotationDegrees: finiteNumber(view.rotationDegrees, 'relation view rotationDegrees'),
    flipX: booleanValue(view.flipX, 'relation view flipX'),
    flipY: booleanValue(view.flipY, 'relation view flipY'),
    scale: finiteNumber(view.scale, 'relation view scale'),
    panCss: pointValue(view.panCss, 'relation view panCss'),
  };
}

function centerWorldForPan(size, view) {
  assert(view.scale > 0, 'relation view scale positive');
  const radians = view.rotationDegrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const flipX = view.flipX ? -1 : 1;
  const flipY = view.flipY ? -1 : 1;
  const basis = [cosine * flipX, sine * flipY, -sine * flipX, cosine * flipY];
  const determinant = basis[0] * basis[3] - basis[1] * basis[2];
  assert(Math.abs(determinant) > 1e-12, 'relation view basis invertible');
  const inverse = [basis[3] / determinant, -basis[1] / determinant,
    -basis[2] / determinant, basis[0] / determinant];
  const screenX = size.width / 2 - view.panCss[0];
  const screenY = size.height / 2 - view.panCss[1];
  return [
    normalizeNumber((inverse[0] * screenX + inverse[2] * screenY) / view.scale, 'viewport center x'),
    normalizeNumber((inverse[1] * screenX + inverse[3] * screenY) / view.scale, 'viewport center y'),
  ];
}

function validateFixtureParams(value) {
  const params = recordValue(value, 'fixture params');
  assert(Array.isArray(params.nodes) && params.nodes.length >= 2, 'fixture nodes');
  params.nodes.forEach((node, index) => {
    const record = recordValue(node, `fixture node ${index}`);
    stringValue(record.id, `fixture node ${index} id`);
    boundsValue(record.bounds, `fixture node ${index} bounds`);
  });
  assert(Array.isArray(params.links) && params.links.length > 0, 'fixture links');
  params.links.forEach((link, index) => stringPair(link, `fixture link ${index}`));
  const self = recordValue(params.selfLinkContract, 'selfLinkContract');
  stringValue(self.relationId, 'selfLinkContract.relationId');
  finiteNumber(self.hitTolerance, 'selfLinkContract.hitTolerance');
  const matrix = recordValue(params.relationContractMatrix, 'relationContractMatrix');
  cloneArray(matrix.dataset, 'relationContractMatrix.dataset');
  endpointResizeValue(matrix.endpointResize);
  changedLinks(relationElementFromDataset(matrix.dataset).links, matrix.linkSetChange);
  relationView(matrix.view);
}

function inputFingerprints(context, dataset, datasetBefore, fixtureBefore) {
  const fixtureAfter = context.fingerprint(context.fixtureParams);
  const datasetAfter = context.fingerprint(dataset);
  return {
    fixtureBefore,
    fixtureAfter,
    datasetBefore,
    datasetAfter,
    unchanged: fixtureBefore === fixtureAfter && datasetBefore === datasetAfter,
  };
}

function requireRelationProbe(value, label) {
  const probe = recordValue(value, label);
  assert(Array.isArray(probe.relations), `${label}.relations`);
  assert(Array.isArray(probe.omittedRelations), `${label}.omittedRelations`);
  return probe;
}

function snapshotEngine(engine) {
  const snapshot = callSync(engine, 'snapshot');
  assert(isRecord(snapshot), 'snapshot() must return an object');
  return snapshot;
}

function currentEngine(context, operation) {
  const engine = context.currentMainEngine();
  assert(engine !== null && engine !== undefined, `${operation} requires a main engine`);
  return engine;
}

function validateContext(context) {
  assert(isRecord(context), 'context');
  for (const method of ['ensureMainEngine', 'currentMainEngine', 'createEngine', 'fingerprint']) {
    assert(typeof context[method] === 'function', `context.${method}`);
  }
  assert(isRecord(context.clock) && typeof context.clock.now === 'function', 'context.clock');
  assert(isRecord(context.signal) && typeof context.signal.aborted === 'boolean', 'context.signal');
}

function exactOperands(actionRecord, keys) {
  assert(isRecord(actionRecord), 'action record');
  const operands = recordValue(actionRecord.operands, `${actionRecord.type} operands`);
  assertExactKeys(operands, keys, `${actionRecord.type} operands`);
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

function action(type, operands) {
  return Object.freeze({ type, operands: deepFreeze(operands) });
}

function duplicateKeyCount(relations) {
  const keys = relations.map(({ key }) => key);
  return keys.length - new Set(keys).size;
}

function firstPoint(points, label) {
  assert(Array.isArray(points) && points.length > 0, label);
  return pointValue(points[0], label);
}

function lastPoint(points, label) {
  assert(Array.isArray(points) && points.length > 0, label);
  return pointValue(points[points.length - 1], label);
}

function endpointPair(value, label) {
  assert(Array.isArray(value) && value.length === 2, label);
  return [pointValue(value[0], `${label}[0]`), pointValue(value[1], `${label}[1]`)];
}

function pointList(value, label) {
  assert(Array.isArray(value), label);
  return value.map((point, index) => pointValue(point, `${label}[${index}]`));
}

function pointValue(value, label) {
  assert(Array.isArray(value) && value.length === 2, label);
  return value.map((entry, index) => normalizeNumber(entry, `${label}[${index}]`));
}

function boundsValue(value, label) {
  assert(Array.isArray(value) && value.length === 4, label);
  return value.map((entry, index) => normalizeNumber(entry, `${label}[${index}]`));
}

function stringPair(value, label) {
  assert(Array.isArray(value) && value.length === 2, label);
  return [stringValue(value[0], `${label}[0]`), stringValue(value[1], `${label}[1]`)];
}

function relationKind(value, label) {
  const kind = stringValue(value, label);
  assert(kind === 'segment' || kind === 'polyline', label);
  return kind;
}

function cloneRecord(value, label) {
  return clone(recordValue(value, label));
}

function cloneArray(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  return clone(value);
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

function nonNegativeInteger(value, label) {
  assert(Number.isSafeInteger(value) && value >= 0, label);
  return value;
}

function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), label);
  return value;
}

function nullableFiniteNumber(value, label) {
  if (value === null) return null;
  return normalizeNumber(value, label);
}

function normalizeNumber(value, label) {
  const numeric = finiteNumber(value, label);
  const rounded = Math.round(numeric * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function assertExactKeys(value, keys, label) {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) assert(allowed.has(key), `${label} unknown key ${key}`);
  for (const key of keys) assert(Object.hasOwn(value, key), `${label} missing key ${key}`);
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

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Core v2 render-relations handler invalid: ${message}`);
}
