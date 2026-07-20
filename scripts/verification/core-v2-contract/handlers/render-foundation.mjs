export const RENDER_FOUNDATION_ACTION_TYPES = Object.freeze([
  'loadDataset',
  'loadGrid',
  'patch',
  'reloadGrid',
  'setComponentVisibility',
  'snapshotGrid',
]);

export const RENDER_FOUNDATION_CASE_IDS = Object.freeze([
  'LAY-001',
  'REN-001',
  'REN-004',
  'REN-003',
  'REN-002',
]);

const CASE_TRACES = Object.freeze({
  'LAY-001': Object.freeze([
    action('loadDataset', { datasetId: 'content-box' }),
    action('patch', {
      targetId: 'item',
      changes: {
        size: { width: 120, height: 100 },
        padding: { top: 10, right: 20, bottom: 10, left: 20 },
      },
    }),
  ]),
  'REN-001': Object.freeze([
    action('loadDataset', { datasetId: 'nested-groups' }),
    action('patch', { targetId: 'outer', changes: { show: false } }),
    action('patch', { targetId: 'outer', changes: { show: true, locked: true } }),
  ]),
  'REN-004': Object.freeze([
    action('loadDataset', { datasetId: 'rect-specimen' }),
    action('patch', {
      targetId: 'rect',
      changes: {
        size: { width: 60, height: 20 },
        radius: 30,
        attrs: { x: -10, y: 5, angle: 90, zIndex: 4 },
      },
    }),
  ]),
  'REN-003': Object.freeze([
    action('loadDataset', { datasetId: 'item-components' }),
    action('setComponentVisibility', {
      ownerId: 'item',
      componentId: 'icon',
      show: false,
    }),
    action('setComponentVisibility', {
      ownerId: 'item',
      componentId: 'icon',
      show: true,
    }),
  ]),
  'REN-002': Object.freeze([
    action('loadGrid', { gridId: 'grid', inactiveCellStrategy: 'hide' }),
    action('snapshotGrid', { gridId: 'grid' }),
    action('reloadGrid', { gridId: 'grid', inactiveCellStrategy: 'destroy' }),
  ]),
});

const HANDLERS = Object.freeze({
  loadDataset: loadDatasetAction,
  loadGrid: loadGridAction,
  patch: patchAction,
  reloadGrid: reloadGridAction,
  setComponentVisibility: setComponentVisibilityAction,
  snapshotGrid: snapshotGridAction,
});

/**
 * Register the exact five-case render-foundation product action surface.
 *
 * This module deliberately has no imports. The executor injects the real
 * CoreV2Engine, approved datasets, clock, and immutable-input fingerprinting;
 * handlers consult only those public product seams and the selected fixture.
 */
export function createRenderFoundationHandlerEntries() {
  return Object.freeze(RENDER_FOUNDATION_ACTION_TYPES.map((type) => Object.freeze([
    `contract/${type}`,
    withContext(HANDLERS[type]),
  ])));
}

function withContext(handler) {
  return async (context, actionRecord) => {
    validateContext(context);
    const trace = CASE_TRACES[context.caseId];
    assert(trace !== undefined, `unsupported case ${String(context.caseId)}`);
    assert(Number.isInteger(context.actionIndex), 'context actionIndex');
    const expectedAction = trace[context.actionIndex];
    assert(expectedAction !== undefined, `${context.caseId} action ${context.actionIndex}`);
    assert(actionRecord.index === context.actionIndex, `${context.caseId} action index`);
    assert(actionRecord.type === expectedAction.type, `${context.caseId} action type`);
    assert(
      sameJson(actionRecord.operands, expectedAction.operands),
      `${context.caseId} ${actionRecord.type} operands`,
    );
    validateFixtureParams(context.caseId, context.fixtureParams);
    assert(!context.signal.aborted, 'action is aborted');
    return handler(context, actionRecord);
  };
}

async function loadDatasetAction(context, actionRecord) {
  const operands = exactOperands(actionRecord, ['datasetId']);
  const datasetId = stringValue(operands.datasetId, 'loadDataset.datasetId');
  const engine = await ensureInitializedEngine(context);
  const dataset = await context.resolveDataset(datasetId);
  const beforeFingerprint = context.fingerprint(dataset);
  const loaded = await call(engine, 'loadDataset', dataset, { datasetRef: datasetId });
  await publish(engine, context);
  const afterFingerprint = context.fingerprint(dataset);
  const product = observeProduct(engine);
  const actual = {
    datasetId,
    loaded: clone(loaded),
    input: {
      beforeFingerprint,
      afterFingerprint,
      unchanged: beforeFingerprint === afterFingerprint,
    },
    sceneRevision: sceneRevision(product),
    product,
  };

  if (context.caseId === 'REN-003') {
    const icon = findComponent(product.dataset, 'item', 'icon');
    return {
      actual,
      captureSource: { icon: { id: icon.id } },
    };
  }
  return { actual };
}

async function patchAction(context, actionRecord) {
  const operands = exactOperands(actionRecord, ['changes', 'targetId']);
  const targetId = stringValue(operands.targetId, 'patch.targetId');
  const changes = recordValue(operands.changes, 'patch.changes');
  const engine = currentEngine(context, 'patch');
  const before = observeProduct(engine);
  const mutation = await call(engine, 'patch', { kind: 'element', id: targetId }, changes);
  assert(isRecord(mutation), 'patch() result');
  assert(mutation.status === 'committed', `patch() must commit, received ${String(mutation.status)}`);
  await publish(engine, context);
  const after = observeProduct(engine);
  const actual = {
    target: { kind: 'element', id: targetId },
    changes: clone(changes),
    mutation: clone(mutation),
    before,
    after,
    sceneRevision: sceneRevision(after),
  };

  if (context.caseId === 'REN-004') {
    return {
      actual,
      captureSource: {
        worldBounds: rectWorldBounds(findElement(after.dataset, targetId)),
      },
    };
  }
  return { actual };
}

async function setComponentVisibilityAction(context, actionRecord) {
  const operands = exactOperands(actionRecord, ['componentId', 'ownerId', 'show']);
  const ownerId = stringValue(operands.ownerId, 'setComponentVisibility.ownerId');
  const componentId = stringValue(
    operands.componentId,
    'setComponentVisibility.componentId',
  );
  const show = booleanValue(operands.show, 'setComponentVisibility.show');
  const engine = currentEngine(context, 'setComponentVisibility');
  const before = observeProduct(engine);
  const mutation = await call(
    engine,
    'patch',
    { kind: 'component', ownerId, id: componentId },
    { show },
  );
  assert(isRecord(mutation), 'patch() result');
  assert(mutation.status === 'committed', `patch() must commit, received ${String(mutation.status)}`);
  await publish(engine, context);
  const after = observeProduct(engine);
  return {
    actual: {
      target: { kind: 'component', ownerId, id: componentId },
      show,
      mutation: clone(mutation),
      before,
      after,
      sceneRevision: sceneRevision(after),
    },
  };
}

async function loadGridAction(context, actionRecord) {
  const operands = exactOperands(actionRecord, ['gridId', 'inactiveCellStrategy']);
  const gridId = stringValue(operands.gridId, 'loadGrid.gridId');
  const strategy = gridStrategy(operands.inactiveCellStrategy, 'loadGrid.inactiveCellStrategy');
  const dataset = gridDataset(context.fixtureParams, gridId, strategy);
  const engine = await ensureInitializedEngine(context);
  const beforeFingerprint = context.fingerprint(dataset);
  const loaded = await call(engine, 'loadDataset', dataset, {
    datasetRef: `${gridId}:${strategy}`,
  });
  await publish(engine, context);
  const afterFingerprint = context.fingerprint(dataset);
  const product = observeProduct(engine);
  return {
    actual: {
      gridId,
      inactiveCellStrategy: strategy,
      loaded: clone(loaded),
      input: {
        beforeFingerprint,
        afterFingerprint,
        unchanged: beforeFingerprint === afterFingerprint,
      },
      sceneRevision: sceneRevision(product),
      product,
    },
  };
}

async function snapshotGridAction(context, actionRecord) {
  const operands = exactOperands(actionRecord, ['gridId']);
  const gridId = stringValue(operands.gridId, 'snapshotGrid.gridId');
  const engine = currentEngine(context, 'snapshotGrid');
  const product = observeProduct(engine);
  const grid = findElement(product.dataset, gridId);
  assert(grid.type === 'grid', `${gridId} must be a grid`);
  return {
    actual: {
      gridId,
      inactiveCellStrategy: grid.inactiveCellStrategy,
      sceneRevision: sceneRevision(product),
      product,
    },
  };
}

async function reloadGridAction(context, actionRecord) {
  const operands = exactOperands(actionRecord, ['gridId', 'inactiveCellStrategy']);
  const gridId = stringValue(operands.gridId, 'reloadGrid.gridId');
  const strategy = gridStrategy(
    operands.inactiveCellStrategy,
    'reloadGrid.inactiveCellStrategy',
  );
  const engine = currentEngine(context, 'reloadGrid');
  const before = observeProduct(engine);
  const dataset = gridDataset(context.fixtureParams, gridId, strategy);
  const beforeFingerprint = context.fingerprint(dataset);
  const loaded = await call(engine, 'loadDataset', dataset, {
    datasetRef: `${gridId}:${strategy}`,
  });
  await publish(engine, context);
  const afterFingerprint = context.fingerprint(dataset);
  const after = observeProduct(engine);
  return {
    actual: {
      gridId,
      inactiveCellStrategy: strategy,
      loaded: clone(loaded),
      input: {
        beforeFingerprint,
        afterFingerprint,
        unchanged: beforeFingerprint === afterFingerprint,
      },
      before,
      after,
      sceneRevision: sceneRevision(after),
    },
  };
}

async function ensureInitializedEngine(context) {
  const engine = await context.ensureMainEngine();
  const snapshot = snapshotEngine(engine);
  if (snapshot.lifecycle === 'new') {
    await call(engine, 'initialize', {
      instanceId: `${context.caseId.toLowerCase()}-engine`,
      width: 800,
      height: 600,
      pixelRatio: 1,
      strategy: 'mesh',
      preference: 'webgl',
    });
  } else {
    assert(
      snapshot.lifecycle === 'ready-empty',
      `initial load requires a new or ready-empty engine, received ${String(snapshot.lifecycle)}`,
    );
  }
  return engine;
}

async function publish(engine, context) {
  assert(!context.signal.aborted, 'action is aborted');
  const timeMs = context.clock.now();
  finiteNumber(timeMs, 'clock.now()');
  await call(engine, 'publishFrame', timeMs);
  assert(!context.signal.aborted, 'action is aborted');
}

function observeProduct(engine) {
  const snapshot = snapshotEngine(engine);
  const semanticProbe = callSync(engine, 'semanticProbe');
  const geometry = callSync(engine, 'geometryProbe');
  const dataset = callSync(engine, 'exportDataset');
  assert(isRecord(semanticProbe), 'semanticProbe() must return an object');
  assert(geometry === null || isRecord(geometry), 'geometryProbe() must return an object or null');
  assert(Array.isArray(dataset), 'exportDataset() must return an array');
  return clone({ snapshot, semanticProbe, geometry, dataset });
}

function gridDataset(fixtureParams, gridId, inactiveCellStrategy) {
  const params = recordValue(fixtureParams, 'fixture params');
  const grid = recordValue(params.grid, 'fixture grid');
  assert(grid.id === gridId, 'fixture grid ID');
  const [width, height] = positivePair(grid.itemSize, 'fixture grid itemSize');
  const [gapX, gapY] = nonNegativePair(grid.gap, 'fixture grid gap');
  assert(Array.isArray(grid.cells), 'fixture grid cells');
  const cells = grid.cells.map((row, rowIndex) => {
    assert(Array.isArray(row), `fixture grid row ${rowIndex}`);
    return row.map((cell, columnIndex) => {
      assert(
        cell === 0 || cell === 1 || typeof cell === 'string',
        `fixture grid cell ${rowIndex}:${columnIndex}`,
      );
      return cell;
    });
  });
  assert(grid.orientation === 'upright', 'fixture grid orientation');
  return [{
    type: 'grid',
    id: gridId,
    cells,
    inactiveCellStrategy,
    gap: { x: gapX, y: gapY },
    item: {
      size: { width, height },
      padding: finiteNumber(grid.padding, 'fixture grid padding'),
      contentOrientation: grid.orientation,
      components: [],
    },
  }];
}

function validateFixtureParams(caseId, fixtureParams) {
  const params = recordValue(fixtureParams, `${caseId} fixture params`);
  if (caseId === 'LAY-001') {
    assert(sameJson(params.item?.size, [100, 80]), 'LAY-001 item size');
    assert(sameJson(params.item?.padding, { x: 10, y: 5, top: 7 }), 'LAY-001 padding');
    assert(sameJson(params.components, [
      { id: 'bar', size: ['50%', '25%'] },
      { id: 'icon', size: ['25%', '50%'] },
    ]), 'LAY-001 components');
    return;
  }
  if (caseId === 'REN-001') {
    assert(sameJson(params.groups, [
      { id: 'outer', x: 10, y: 20, show: true, locked: false },
      { id: 'inner', x: 5, y: 7, show: true, locked: false },
    ]), 'REN-001 groups');
    assert(sameJson(params.child, { id: 'rect-b', x: 2, y: 3, size: [40, 30] }), 'REN-001 child');
    return;
  }
  if (caseId === 'REN-002') {
    assert(sameJson(params.declaredTargetIds, ['grid']), 'REN-002 declared target IDs');
    assert(sameJson(params.grid, {
      id: 'grid',
      cells: [[1, 0, 'named']],
      itemSize: [20, 10],
      gap: [2, 3],
      padding: 2,
      orientation: 'upright',
    }), 'REN-002 grid');
    return;
  }
  if (caseId === 'REN-003') {
    assert(sameJson(params.item, {
      id: 'item',
      size: [100, 80],
      padding: 10,
      components: ['background', 'bar', 'icon', 'text'],
      hiddenId: 'icon',
    }), 'REN-003 item');
    return;
  }
  if (caseId === 'REN-004') {
    assert(sameJson(params.rect, {
      id: 'rect',
      size: [40, 30],
      fill: '#ff000080',
      stroke: { color: '#000000ff', width: 2 },
      radius: [4, 6, 8, 10],
      attrs: { x: -20, y: 15, angle: 45, zIndex: 3 },
    }), 'REN-004 rect');
  }
}

function findElement(elements, id) {
  for (const element of elements) {
    if (element.id === id) return element;
    if (element.type === 'group') {
      const nested = findElementOrNull(element.children, id);
      if (nested) return nested;
    }
  }
  throw new Error(`Core v2 render-foundation handler invalid: missing element ${id}`);
}

function findElementOrNull(elements, id) {
  for (const element of elements) {
    if (element.id === id) return element;
    if (element.type === 'group') {
      const nested = findElementOrNull(element.children, id);
      if (nested) return nested;
    }
  }
  return null;
}

function findComponent(elements, ownerId, componentId) {
  const owner = findElement(elements, ownerId);
  const components = owner.type === 'item'
    ? owner.components
    : owner.type === 'grid'
      ? owner.item.components
      : null;
  assert(Array.isArray(components), `${ownerId} must own components`);
  const component = components.find((candidate) => candidate.id === componentId);
  assert(component !== undefined, `missing component ${ownerId}:${componentId}`);
  return component;
}

function rectWorldBounds(rect) {
  assert(rect.type === 'rect', `${String(rect.id)} must be a rect`);
  const attrs = isRecord(rect.attrs) ? rect.attrs : {};
  const x = finiteOr(attrs.x, 0, `${rect.id}.attrs.x`);
  const y = finiteOr(attrs.y, 0, `${rect.id}.attrs.y`);
  const angle = finiteOr(attrs.angle ?? attrs.rotation, 0, `${rect.id}.attrs.angle`);
  const radians = angle * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const corners = [
    [0, 0],
    [rect.size.width, 0],
    [0, rect.size.height],
    [rect.size.width, rect.size.height],
  ].map(([localX, localY]) => [
    x + localX * cosine - localY * sine,
    y + localX * sine + localY * cosine,
  ]);
  const xs = corners.map(([cornerX]) => cornerX);
  const ys = corners.map(([, cornerY]) => cornerY);
  const left = cleanNumber(Math.min(...xs));
  const top = cleanNumber(Math.min(...ys));
  const right = cleanNumber(Math.max(...xs));
  const bottom = cleanNumber(Math.max(...ys));
  return {
    x: left,
    y: top,
    width: cleanNumber(right - left),
    height: cleanNumber(bottom - top),
  };
}

function cleanNumber(value) {
  const integer = Math.round(value);
  if (Math.abs(value - integer) < 1e-9) return integer === 0 ? 0 : integer;
  const rounded = Math.round(value * 1e9) / 1e9;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function sceneRevision(product) {
  return finiteNumber(product.snapshot?.revisions?.sceneRevision, 'snapshot sceneRevision');
}

function currentEngine(context, operation) {
  const engine = context.currentMainEngine();
  assert(engine !== null, `${operation} requires the main engine`);
  return engine;
}

async function call(target, method, ...args) {
  assert(isRecord(target) && typeof target[method] === 'function', `engine must expose ${method}()`);
  return target[method](...args);
}

function callSync(target, method, ...args) {
  assert(isRecord(target) && typeof target[method] === 'function', `engine must expose ${method}()`);
  return target[method](...args);
}

function snapshotEngine(engine) {
  return clone(callSync(engine, 'snapshot'));
}

function validateContext(context) {
  assert(isRecord(context), 'handler context must be an object');
  assert(RENDER_FOUNDATION_CASE_IDS.includes(context.caseId), `unsupported case ${String(context.caseId)}`);
  for (const method of [
    'ensureMainEngine',
    'currentMainEngine',
    'resolveDataset',
    'fingerprint',
  ]) {
    assert(typeof context[method] === 'function', `context must expose ${method}()`);
  }
  assert(isRecord(context.clock) && typeof context.clock.now === 'function', 'context clock');
  assert(isRecord(context.signal), 'context abort signal');
}

function action(type, operands) {
  return Object.freeze({ type, operands: deepFreeze(operands) });
}

function exactOperands(actionRecord, keys) {
  assert(isRecord(actionRecord), 'action must be an object');
  return exactRecord(actionRecord.operands, keys, actionRecord.type);
}

function exactRecord(value, keys, label) {
  const record = recordValue(value, label);
  const actualKeys = Object.keys(record).sort();
  const acceptedKeys = [...keys].sort();
  assert(
    actualKeys.length === acceptedKeys.length
      && actualKeys.every((key, index) => key === acceptedKeys[index]),
    `${label} keys`,
  );
  return record;
}

function gridStrategy(value, label) {
  assert(value === 'hide' || value === 'destroy', label);
  return value;
}

function positivePair(value, label) {
  assert(Array.isArray(value) && value.length === 2, label);
  return value.map((entry, index) => positiveNumber(entry, `${label}[${index}]`));
}

function nonNegativePair(value, label) {
  assert(Array.isArray(value) && value.length === 2, label);
  return value.map((entry, index) => nonNegativeNumber(entry, `${label}[${index}]`));
}

function finiteOr(value, fallback, label) {
  return value === undefined ? fallback : finiteNumber(value, label);
}

function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), label);
  return value;
}

function positiveNumber(value, label) {
  const number = finiteNumber(value, label);
  assert(number > 0, label);
  return number;
}

function nonNegativeNumber(value, label) {
  const number = finiteNumber(value, label);
  assert(number >= 0, label);
  return number;
}

function booleanValue(value, label) {
  assert(typeof value === 'boolean', label);
  return value;
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, label);
  return value;
}

function recordValue(value, label) {
  assert(isRecord(value), `${label} must be an object`);
  return value;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Core v2 render-foundation handler invalid: ${message}`);
}
