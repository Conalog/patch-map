import { clone } from '../value-atoms.mjs';

export const QUERY_SELECTION_HANDLER_REVISION = 'core-v2-query-selection-handlers/1';

export const QUERY_SELECTION_CASE_IDS = Object.freeze([
  'QRY-001',
  'QRY-002',
  'SEL-001',
  'SEL-002',
  'SEL-003',
  'SEL-004',
]);

export const QUERY_SELECTION_ACTION_TYPES = Object.freeze([
  'load-dataset',
  'query-scene',
  'reuse-query-result-matrix',
  'replace-scene',
  'reuse-query-result',
  'resolve-target',
  'point-hit-matrix',
  'overlap-and-relation-hit-matrix',
  'selection-unit-matrix',
  'selection-eligibility-matrix',
  'selection-set-operations',
]);

const CASE_ACTIONS = Object.freeze({
  'QRY-001': Object.freeze(['load-dataset', 'query-scene']),
  'QRY-002': Object.freeze([
    'query-scene',
    'reuse-query-result-matrix',
    'replace-scene',
    'reuse-query-result',
    'reuse-query-result-matrix',
    'resolve-target',
  ]),
  'SEL-001': Object.freeze([
    'point-hit-matrix',
    'overlap-and-relation-hit-matrix',
  ]),
  'SEL-002': Object.freeze(['selection-unit-matrix']),
  'SEL-003': Object.freeze(['selection-eligibility-matrix']),
  'SEL-004': Object.freeze(['selection-set-operations']),
});

export function createQuerySelectionHandlerEntries(productValue) {
  const product = validateProductAdapter(productValue);
  const states = new WeakMap();
  const handlers = Object.freeze({
    'load-dataset': withState(product, states, loadDatasetAction),
    'query-scene': withState(product, states, querySceneAction),
    'reuse-query-result-matrix': withState(product, states, reuseQueryResultMatrixAction),
    'replace-scene': withState(product, states, replaceSceneAction),
    'reuse-query-result': withState(product, states, reuseQueryResultAction),
    'resolve-target': withState(product, states, resolveTargetAction),
    'point-hit-matrix': withState(product, states, pointHitMatrixAction),
    'overlap-and-relation-hit-matrix': withState(
      product,
      states,
      overlapAndRelationHitMatrixAction,
    ),
    'selection-unit-matrix': withState(product, states, selectionUnitMatrixAction),
    'selection-eligibility-matrix': withState(
      product,
      states,
      selectionEligibilityMatrixAction,
    ),
    'selection-set-operations': withState(product, states, selectionSetOperationsAction),
  });
  return Object.freeze(QUERY_SELECTION_ACTION_TYPES.map((type) => Object.freeze([
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
        bindings: new Map(),
      };
      states.set(context.ensureSessionEngine, state);
    }
    assert(state.caseId === context.caseId, 'query/selection state case identity');
    return handler(product, state, context, action);
  };
}

async function loadDatasetAction(product, state, context, action) {
  assert(context.caseId === 'QRY-001', 'load-dataset query case');
  const operands = exactOperands(action, ['datasetRef']);
  const datasetRef = stringValue(operands.datasetRef, 'load-dataset.datasetRef');
  const engine = await ensureInitializedEngine(state, context);
  await loadDataset(engine, state, context, datasetRef);
  const actual = {
    datasetRef,
    snapshot: clone(callSync(engine, 'snapshot')),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function querySceneAction(product, state, context, action) {
  const engine = await ensureBaseline(state, context);
  const operands = recordValue(action.operands, 'query-scene.operands');
  if (Object.hasOwn(operands, 'queryIds')) {
    assertExactKeys(operands, ['queryIds'], 'query-scene.operands');
    const queryIds = stringArray(operands.queryIds, 'query-scene.queryIds');
    const definitions = indexById(
      arrayValue(context.fixtureParams.queries, 'query fixture queries'),
      'query fixture queries',
    );
    const queries = {};
    for (const queryId of queryIds) {
      const definition = requireMap(definitions, queryId, 'query definition');
      const result = callSync(engine, 'queryScene', productQuery(definition));
      queries[queryId] = projectQueryResult(result);
    }
    const actual = {
      queries,
      product: observeProduct(product, context, engine),
    };
    return { actual, captureSource: actual };
  }

  assertExactKeys(operands, ['where', 'bindAs'], 'query-scene.operands');
  const where = cloneRecord(operands.where, 'query-scene.where');
  const bindAs = stringValue(operands.bindAs, 'query-scene.bindAs');
  const result = callSync(engine, 'queryScene', { where });
  state.bindings.set(bindAs, result);
  const projected = projectQueryResult(result);
  const rectBIdentity = result.targets?.[0]?.identity ?? null;
  const actual = {
    bindAs,
    result: projected,
    rectBIdentity: clone(rectBIdentity),
    product: observeProduct(product, context, engine),
  };
  return {
    actual,
    bindings: {
      [bindAs]: {
        targets: clone(projected.targets),
        semanticHash: stringValue(
          callSync(engine, 'snapshot').semanticHash,
          'query-scene semantic hash',
        ),
      },
    },
    captureSource: { rectBIdentity: clone(rectBIdentity) },
  };
}

async function reuseQueryResultMatrixAction(product, state, context, action) {
  assert(context.caseId === 'QRY-002', 'reuse matrix query case');
  const operands = recordValue(action.operands, 'reuse-query-result-matrix.operands');
  const allowedKeys = operands.phase === 'same-revision'
    ? ['binding', 'operations', 'phase']
    : ['binding', 'operations', 'phase', 'allowStale', 'expectedCode'];
  assertExactKeys(operands, allowedKeys, 'reuse-query-result-matrix.operands');
  const binding = stringValue(operands.binding, 'reuse matrix binding');
  const operations = stringArray(operands.operations, 'reuse matrix operations');
  const phase = stringValue(operands.phase, 'reuse matrix phase');
  const engine = await ensureBaseline(state, context);
  const result = requireMap(state.bindings, binding, 'query result binding');
  const uses = operations.map((operation) =>
    callSync(engine, 'reuseQueryResult', result, operation));
  const actual = {
    phase,
    acceptedOperations: uses
      .filter(({ status }) => status === 'accepted')
      .map(({ operation }) => operation),
    codes: uses.map(({ code }) => code),
    appliedCounts: uses.map(({ appliedCount }) => appliedCount),
    sameRevisionTarget: clone(uses[0]?.targets?.[0]?.identity ?? null),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function replaceSceneAction(product, state, context, action) {
  assert(context.caseId === 'QRY-002', 'replace-scene query case');
  const operands = exactOperands(action, ['datasetRef', 'sceneRevision']);
  const datasetRef = stringValue(operands.datasetRef, 'replace-scene.datasetRef');
  const expectedSceneRevision = nonNegativeInteger(
    operands.sceneRevision,
    'replace-scene.sceneRevision',
  );
  const engine = await ensureInitializedEngine(state, context);
  await loadDataset(engine, state, context, datasetRef);
  const snapshot = callSync(engine, 'snapshot');
  assert(
    snapshot.revisions.sceneRevision === expectedSceneRevision,
    'replace-scene revision',
  );
  const actual = {
    datasetRef,
    sceneRevision: snapshot.revisions.sceneRevision,
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function reuseQueryResultAction(product, state, context, action) {
  assert(context.caseId === 'QRY-002', 'reuse query case');
  const operands = exactOperands(
    action,
    ['binding', 'operation', 'allowStale', 'expectedCode'],
  );
  const binding = stringValue(operands.binding, 'reuse query binding');
  const operation = stringValue(operands.operation, 'reuse query operation');
  const engine = await ensureBaseline(state, context);
  const result = requireMap(state.bindings, binding, 'query result binding');
  const reuse = callSync(engine, 'reuseQueryResult', result, operation);
  const actual = {
    code: reuse.code,
    appliedCount: reuse.appliedCount,
    status: reuse.status,
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function resolveTargetAction(product, state, context, action) {
  assert(context.caseId === 'QRY-002', 'resolve target query case');
  const operands = exactOperands(action, ['target']);
  const target = cloneRecord(operands.target, 'resolve-target.target');
  const engine = await ensureBaseline(state, context);
  const resolved = callSync(engine, 'resolveTarget', target);
  const actual = {
    target: resolved === null ? null : targetKey(resolved.target),
    sceneRevision: resolved?.sceneRevision ?? null,
    identity: resolved === null ? null : {
      target: targetKey(resolved.target),
      lifecycleGeneration: resolved.lifecycleGeneration,
      sceneRevision: resolved.sceneRevision,
    },
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function pointHitMatrixAction(product, state, context, action) {
  assert(context.caseId === 'SEL-001', 'point hit selection case');
  const operands = exactOperands(action, ['viewIds', 'emptyScreen']);
  const viewIds = stringArray(operands.viewIds, 'point-hit-matrix.viewIds');
  const views = indexById(
    arrayValue(context.fixtureParams.views, 'SEL-001 views'),
    'SEL-001 views',
  );
  const engine = await ensureBaseline(state, context);
  const hitByView = {};
  const worldPointByView = [];
  for (const viewId of viewIds) {
    const view = requireMap(views, viewId, 'view');
    const matrix = matrixTuple(view.matrix, `${viewId}.matrix`);
    const screen = pointTuple(view.screen, `${viewId}.screen`);
    applyViewMatrix(engine, matrix, 1);
    const hit = callSync(engine, 'selectionHitTestScreen', pointRecord(screen));
    hitByView[viewId] = hit.target?.id ?? null;
    worldPointByView.push(pointFromRecord(hit.worldPoint, `${viewId}.worldPoint`));
  }
  applyViewMatrix(engine, [1, 0, 0, 1, 0, 0], 1);
  const empty = callSync(
    engine,
    'selectionHitTestScreen',
    pointRecord(pointTuple(operands.emptyScreen, 'point-hit-matrix.emptyScreen')),
  );
  const actual = {
    hitByView,
    worldPointByView,
    emptyHit: empty.target?.id ?? null,
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function overlapAndRelationHitMatrixAction(product, state, context, action) {
  assert(context.caseId === 'SEL-001', 'overlap relation selection case');
  const operands = exactOperands(action, ['overlap', 'relation']);
  const overlap = recordValue(operands.overlap, 'selection overlap');
  assertExactKeys(
    overlap,
    ['screen', 'orderedCandidates', 'expected'],
    'selection overlap',
  );
  const relation = recordValue(operands.relation, 'selection relation');
  assertExactKeys(
    relation,
    ['relationId', 'dpr', 'zoom', 'offsetsCssPx'],
    'selection relation',
  );
  const engine = await ensureBaseline(state, context);
  applyViewMatrix(engine, [1, 0, 0, 1, 0, 0], 1);
  const overlapHit = callSync(
    engine,
    'selectionHitTestScreen',
    pointRecord(pointTuple(overlap.screen, 'selection overlap screen')),
    { candidateIds: stringArray(overlap.orderedCandidates, 'selection overlap candidates') },
  );
  const dprs = numberArray(relation.dpr, 'selection relation dpr');
  const zooms = numberArray(relation.zoom, 'selection relation zoom');
  const offsets = numberArray(relation.offsetsCssPx, 'selection relation offsets');
  const relationId = stringValue(relation.relationId, 'selection relation ID');
  const hitMatrix = [];
  for (const dpr of dprs) {
    for (const zoom of zooms) {
      applyViewMatrix(engine, [zoom, 0, 0, zoom, 0, 0], dpr);
      const geometry = callSync(engine, 'relationProbe');
      const path = selectRelationPath(geometry, relationId);
      const [from, to] = relationSegment(path);
      const normal = segmentNormal(from, to);
      const midpoint = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
      for (const offsetCssPx of offsets) {
        const point = {
          x: midpoint[0] + normal[0] * offsetCssPx,
          y: midpoint[1] + normal[1] * offsetCssPx,
        };
        const hit = callSync(engine, 'relationHitTestScreen', point, {
          toleranceCssPx: finiteNumber(
            context.fixtureParams.relationToleranceCssPx,
            'relation tolerance',
          ),
        });
        hitMatrix.push({ dpr, zoom, offsetCssPx, hit: hit !== null });
      }
    }
  }
  applyViewMatrix(engine, [1, 0, 0, 1, 0, 0], 1);
  const actual = {
    overlap: {
      candidateOrder: overlapHit.candidates.map(({ id }) => id),
      target: overlapHit.target?.id ?? null,
    },
    relation: {
      hitByOffsetCssPx: hitMatrix.slice(0, offsets.length).map(({ hit }) => hit),
      hitMatrix,
    },
    relationToleranceCssPx: finiteNumber(
      context.fixtureParams.relationToleranceCssPx,
      'relation tolerance',
    ),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function selectionUnitMatrixAction(product, state, context, action) {
  assert(context.caseId === 'SEL-002', 'selection unit case');
  const operands = exactOperands(action, ['click', 'double', 'multi', 'modifier']);
  const engine = await ensureBaseline(state, context);
  const target = stringValue(context.fixtureParams.deepTarget, 'selection deep target');
  const units = stringArray(context.fixtureParams.units, 'selection units');
  const resolved = {};
  for (const unit of units) {
    const result = callSync(engine, 'resolveSelectionInteraction', target, {
      unit,
      clickCount: 1,
    });
    assert(result !== null, `selection unit ${unit} result`);
    resolved[unit] = result.resolved.key;
  }
  const doubleInput = recordValue(operands.double, 'selection double');
  const multiInput = recordValue(operands.multi, 'selection multi');
  const double = callSync(engine, 'resolveSelectionInteraction', target, {
    unit: 'highest-group',
    clickCount: nonNegativeInteger(doubleInput.clickCount, 'double clickCount'),
  });
  const multi = callSync(engine, 'resolveSelectionInteraction', target, {
    unit: 'highest-group',
    clickCount: nonNegativeInteger(multiInput.clickCount, 'multi clickCount'),
  });
  const fallback = callSync(engine, 'resolveSelectionInteraction', target, {
    unit: 'grid-cell',
    clickCount: 1,
  });
  const deep = callSync(engine, 'resolveSelectionInteraction', target, {
    unit: 'highest-group',
    clickCount: 1,
    deepSelect: true,
  });
  assert(double !== null && multi !== null && fallback !== null && deep !== null, 'unit matrix');
  const actual = {
    resolved: {
      ...resolved,
      'missing-ancestor-fallback': fallback.resolved.key,
    },
    events: {
      double: { type: double.clickType, clickCount: double.clickCount },
      multi: { type: multi.clickType, clickCount: multi.clickCount },
    },
    multi: { engineDrillDelta: multi.engineDrillDelta },
    deepModifier: { result: deep.resolved.key },
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function selectionEligibilityMatrixAction(product, state, context, action) {
  assert(context.caseId === 'SEL-003', 'selection eligibility case');
  const operands = exactOperands(
    action,
    ['methods', 'predicate', 'lockedIds', 'overlayHitMode'],
  );
  const methods = stringArray(operands.methods, 'selection eligibility methods');
  assert(sameJson(methods, ['point', 'box', 'paint']), 'selection eligibility methods');
  const predicate = recordValue(operands.predicate, 'selection predicate');
  assertExactKeys(predicate, ['rejectIds'], 'selection predicate');
  const rejectIds = stringArray(predicate.rejectIds, 'selection predicate rejectIds');
  const lockedIds = stringArray(operands.lockedIds, 'selection lockedIds');
  const engine = await ensureBaseline(state, context);
  const lockedTarget = stringValue(context.fixtureParams.lockedTarget, 'locked target');
  const ancestorLockedTarget = stringValue(
    context.fixtureParams.ancestorLockedTarget,
    'ancestor locked target',
  );
  const predicateReject = stringValue(
    context.fixtureParams.predicateReject,
    'predicate reject target',
  );
  const point = callSync(engine, 'filterSelectionTargets', [lockedTarget], { lockedIds });
  const box = callSync(
    engine,
    'filterSelectionTargets',
    [ancestorLockedTarget],
    { lockedIds },
  );
  const paint = callSync(engine, 'filterSelectionTargets', [predicateReject], {
    rejectIds,
    predicate: (target) => !rejectIds.includes(target.id) && !rejectIds.includes(target.key),
  });
  const filterInputs = callSync(engine, 'filterSelectionTargets', [
    lockedTarget,
    ancestorLockedTarget,
    predicateReject,
  ]);
  const overlayHit = callSync(
    engine,
    'selectionHitTestScreen',
    pointRecord(pointTuple(context.fixtureParams.overlayPoint, 'overlay point')),
  );
  const actual = {
    point: { targets: point.map(({ key }) => key) },
    box: { targets: box.map(({ key }) => key) },
    paint: { targets: paint.map(({ key }) => key) },
    filterInput: {
      rendererObjectCount: filterInputs.reduce(
        (count, target) => count + target.rendererObjectCount,
        0,
      ),
    },
    overlay: {
      mode: stringValue(operands.overlayHitMode, 'overlay mode'),
      underlyingTarget: overlayHit.target?.key ?? null,
      blocksUnderlying: overlayHit.target === null,
    },
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function selectionSetOperationsAction(product, state, context, action) {
  assert(context.caseId === 'SEL-004', 'selection set operation case');
  const operands = exactOperands(action, ['operations']);
  const operations = arrayValue(operands.operations, 'selection operations');
  const engine = await ensureBaseline(state, context);
  const changes = [];
  const release = callSync(engine, 'on', 'selectionChanged', (change) => {
    changes.push(clone(change));
  });
  const snapshots = [];
  try {
    for (const operationValue of operations) {
      const operation = cloneRecord(operationValue, 'selection operation');
      const result = callSync(engine, 'applySelection', {
        ...operation,
        source: operation.op === 'clear' ? 'external' : 'canvas',
      });
      snapshots.push(clone(result.current));
    }
  } finally {
    release();
  }
  const missing = stringValue(context.fixtureParams.missing, 'selection missing ID');
  const actual = {
    snapshots,
    changes: changes.map(({ current, added, removed }) => ({ current, added, removed })),
    externalMissingDeleted: changes.some(({ removed }) => removed.includes(missing)),
    product: observeProduct(product, context, engine),
  };
  return { actual, captureSource: actual };
}

async function ensureBaseline(state, context) {
  const engine = await ensureInitializedEngine(state, context);
  if (state.loadedDatasetRef !== null) return engine;
  const profileId = context.caseId.startsWith('QRY-')
    ? 'owner-qualified-scene-query'
    : 'selection-and-hit-matrix';
  const profiles = recordValue(context.fixtureProfiles, 'fixture profiles');
  const profile = recordValue(profiles[profileId], `${profileId} profile`);
  const datasetRef = stringValue(profile.datasetRef, `${profileId}.datasetRef`);
  await loadDataset(engine, state, context, datasetRef);
  return engine;
}

async function ensureInitializedEngine(state, context) {
  const engine = state.engine ?? await context.ensureSessionEngine(1);
  state.engine = engine;
  const snapshot = callSync(engine, 'snapshot');
  if (snapshot.lifecycle === 'new') {
    await call(engine, 'initialize', {
      instanceId: `contract-${context.caseId.toLowerCase()}-1`,
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

async function loadDataset(engine, state, context, datasetRef) {
  const dataset = await context.resolveDataset(datasetRef);
  callSync(engine, 'loadDataset', dataset, { datasetRef });
  callSync(engine, 'publishFrame', context.actionIndex + 1);
  state.loadedDatasetRef = datasetRef;
}

function productQuery(definition) {
  const query = {};
  if (definition.root !== undefined) query.root = clone(definition.root);
  if (definition.recursive !== undefined) query.recursive = definition.recursive;
  if (definition.where !== undefined) query.where = cloneRecord(definition.where, 'query where');
  if (definition.predicate !== undefined) {
    const predicate = cloneRecord(definition.predicate, 'query predicate');
    assert(
      Object.keys(predicate).length === 1,
      'query predicate has one approved operation',
    );
    if (Object.hasOwn(predicate, 'labelStartsWith')) {
      const prefix = stringValue(predicate.labelStartsWith, 'query label prefix');
      query.predicate = (target) => target.label?.startsWith(prefix) ?? false;
    } else if (Object.hasOwn(predicate, 'sizeHeightGte')) {
      const minimum = finiteNumber(predicate.sizeHeightGte, 'query height minimum');
      query.predicate = (target) => valueHeight(target.value) >= minimum;
    } else {
      throw new Error('Core v2 query/selection handler invalid: unsupported query predicate');
    }
  }
  return query;
}

function projectQueryResult(result) {
  const targets = arrayValue(result.targets, 'query result targets');
  return {
    status: stringValue(result.status, 'query result status'),
    code: result.code === null ? null : stringValue(result.code, 'query result code'),
    targets: targets.map((target) => stringValue(target.key, 'query target key')),
    rendererObjects: targets.reduce(
      (count, target) => count + nonNegativeInteger(
        target.rendererObjectCount,
        'query renderer object count',
      ),
      0,
    ),
    lifecycleGeneration: nonNegativeInteger(
      result.lifecycleGeneration,
      'query lifecycle generation',
    ),
    sceneRevision: nonNegativeInteger(result.sceneRevision, 'query scene revision'),
  };
}

function applyViewMatrix(engine, matrix, dpr) {
  const [a, b, c, d, tx, ty] = matrixTuple(matrix, 'view matrix');
  const determinant = a * d - b * c;
  const scale = Math.hypot(a, b);
  assert(scale > 0 && Number.isFinite(scale), 'view matrix scale');
  assert(Math.abs(Math.hypot(c, d) - scale) <= 1e-8, 'view matrix uniform scale');
  const flipX = determinant < 0;
  const rotationDegrees = (flipX ? Math.atan2(b, -a) : Math.atan2(b, a)) * 180 / Math.PI;
  callSync(engine, 'resize', 800, 600, dpr);
  callSync(engine, 'setWorldTransform', {
    rotationDegrees,
    flipX,
    flipY: false,
  });
  const deltaX = 400 - tx;
  const deltaY = 300 - ty;
  const inverseDeterminant = 1 / determinant;
  const centerWorld = [
    (d * deltaX - c * deltaY) * inverseDeterminant,
    (-b * deltaX + a * deltaY) * inverseDeterminant,
  ];
  callSync(engine, 'setViewport', { centerWorld, scale });
}

function selectRelationPath(geometry, relationId) {
  const probe = recordValue(geometry, 'relation probe');
  const relations = arrayValue(probe.relations, 'relation probe paths');
  const path = relations.find((candidate) =>
    candidate.relationId === relationId &&
    candidate.sourceId !== candidate.targetId &&
    candidate.visible !== false);
  assert(path !== undefined, `visible relation ${relationId}`);
  return recordValue(path, 'selected relation path');
}

function relationSegment(path) {
  if (Array.isArray(path.screenPoints) && path.screenPoints.length >= 2) {
    return [
      pointTuple(path.screenPoints[0], 'relation segment start'),
      pointTuple(path.screenPoints[1], 'relation segment end'),
    ];
  }
  const endpoints = arrayValue(path.screenEndpoints, 'relation screen endpoints');
  assert(endpoints.length === 2, 'relation endpoint count');
  return [
    pointTuple(endpoints[0], 'relation endpoint start'),
    pointTuple(endpoints[1], 'relation endpoint end'),
  ];
}

function segmentNormal(from, to) {
  const deltaX = to[0] - from[0];
  const deltaY = to[1] - from[1];
  const length = Math.hypot(deltaX, deltaY);
  assert(length > 0, 'relation segment length');
  return [-deltaY / length, deltaX / length];
}

function observeProduct(product, context, engine) {
  return clone(product.resourceProbe({ caseId: context.caseId, engine }));
}

function validateProductAdapter(value) {
  const product = recordValue(value, 'query/selection product adapter');
  assert(typeof product.resourceProbe === 'function', 'product adapter resourceProbe()');
  return product;
}

function validateContext(value) {
  const context = recordValue(value, 'context');
  assert(QUERY_SELECTION_CASE_IDS.includes(context.caseId), 'context case identity');
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
  assert(context.signal !== null && typeof context.signal === 'object', 'context signal');
  return context;
}

function validateAction(context, value) {
  const action = recordValue(value, 'action');
  assertExactKeys(action, ['index', 'operands', 'type'], 'action');
  assert(action.index === context.actionIndex, 'action index');
  const expected = CASE_ACTIONS[context.caseId]?.[context.actionIndex];
  assert(action.type === expected, `${context.caseId} action type`);
  assert(!context.signal.aborted, 'action is aborted');
  return action;
}

function exactOperands(action, keys) {
  const operands = recordValue(action.operands, `${action.type}.operands`);
  assertExactKeys(operands, keys, `${action.type}.operands`);
  return operands;
}

function indexById(values, label) {
  const result = new Map();
  values.forEach((value, index) => {
    const record = recordValue(value, `${label}[${index}]`);
    const id = stringValue(record.id, `${label}[${index}].id`);
    assert(!result.has(id), `${label} duplicate ${id}`);
    result.set(id, record);
  });
  return result;
}

function requireMap(map, key, label) {
  const value = map.get(key);
  assert(value !== undefined, `${label} ${key}`);
  return value;
}

function targetKey(target) {
  const record = recordValue(target, 'logical target');
  if (record.kind === 'element') return `element:${stringValue(record.id, 'element ID')}`;
  assert(record.kind === 'component', 'component target kind');
  return `component:${stringValue(record.ownerId, 'component owner')}/${stringValue(record.id, 'component ID')}`;
}

function valueHeight(value) {
  const record = recordValue(value, 'query target value');
  if (typeof record.size === 'number') return record.size;
  if (!isRecord(record.size)) return 0;
  return typeof record.size.height === 'number' ? record.size.height : 0;
}

function matrixTuple(value, label) {
  const values = numberArray(value, label);
  assert(values.length === 6, `${label} length`);
  return values;
}

function pointTuple(value, label) {
  const values = numberArray(value, label);
  assert(values.length === 2, `${label} length`);
  return values;
}

function pointRecord(point) {
  return { x: point[0], y: point[1] };
}

function pointFromRecord(value, label) {
  const record = recordValue(value, label);
  return [
    snapScalar(finiteNumber(record.x, `${label}.x`)),
    snapScalar(finiteNumber(record.y, `${label}.y`)),
  ];
}

function snapScalar(value) {
  const integer = Math.round(value);
  const snapped = Math.abs(value - integer) <= 1e-9 ? integer : value;
  return Object.is(snapped, -0) ? 0 : snapped;
}

function numberArray(value, label) {
  return arrayValue(value, label).map((entry, index) =>
    finiteNumber(entry, `${label}[${index}]`));
}

function stringArray(value, label) {
  return arrayValue(value, label).map((entry, index) =>
    stringValue(entry, `${label}[${index}]`));
}

function arrayValue(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  return value;
}

function cloneRecord(value, label) {
  return clone(recordValue(value, label));
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

function nonNegativeInteger(value, label) {
  assert(Number.isSafeInteger(value) && value >= 0, `${label} must be a non-negative integer`);
  return value;
}

function call(target, method, ...args) {
  const operation = target?.[method];
  assert(typeof operation === 'function', `product ${method}()`);
  return operation.apply(target, args);
}

function callSync(target, method, ...args) {
  const result = call(target, method, ...args);
  assert(!(result instanceof Promise), `product ${method}() must be synchronous`);
  return result;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertExactKeys(record, keys, label) {
  assert(
    sameJson(Object.keys(record).sort(), [...keys].sort()),
    `${label} exact keys`,
  );
}

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assert(condition, message) {
  if (!condition) throw new Error(`Core v2 query/selection handler invalid: ${message}`);
}
