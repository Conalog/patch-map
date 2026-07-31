import { clone } from '../value-atoms.mjs';

export const RENDER_ORIENTATION_ACTION_TYPES = Object.freeze([
  'loadOrientationMatrix',
  'setWorldTransform',
  'setContentOrientation',
  'observeOrientationMatrix',
]);

export const RENDER_ORIENTATION_CASE_IDS = Object.freeze(['LAY-004']);

const CASE_TRACE = Object.freeze([
  action('loadOrientationMatrix', { itemId: 'item' }),
  action('setWorldTransform', {
    rotationDegrees: 90,
    flipX: true,
    flipY: false,
  }),
  action('setContentOrientation', { itemId: 'item', mode: 'upright' }),
  action('observeOrientationMatrix', { valueRef: 'orientationMatrix' }),
]);

const HANDLERS = Object.freeze({
  loadOrientationMatrix: loadOrientationMatrixAction,
  setWorldTransform: setWorldTransformAction,
  setContentOrientation: setContentOrientationAction,
  observeOrientationMatrix: observeOrientationMatrixAction,
});
const INPUT_BASELINES = new WeakMap();

/** Register LAY-004's expected-blind public Engine action surface. */
export function createRenderOrientationHandlerEntries() {
  return Object.freeze(RENDER_ORIENTATION_ACTION_TYPES.map((type) => Object.freeze([
    `contract/${type}`,
    withContext(HANDLERS[type]),
  ])));
}

function withContext(handler) {
  return async (context, actionRecord) => {
    validateContext(context);
    assert(context.caseId === 'LAY-004', `unsupported case ${String(context.caseId)}`);
    assert(Number.isInteger(context.actionIndex), 'context actionIndex');
    const trace = CASE_TRACE[context.actionIndex];
    assert(trace !== undefined, `LAY-004 action ${context.actionIndex}`);
    assert(actionRecord.index === context.actionIndex, 'action index');
    assert(actionRecord.type === trace.type, `action ${context.actionIndex} type`);
    assert(sameJson(actionRecord.operands, trace.operands), `action ${context.actionIndex} operands`);
    validateFixtureParams(context.fixtureParams);
    assert(!context.signal.aborted, 'action is aborted');
    return handler(context, actionRecord);
  };
}

async function loadOrientationMatrixAction(context, actionRecord) {
  const operands = exactOperands(actionRecord, ['itemId']);
  const itemId = stringValue(operands.itemId, 'loadOrientationMatrix.itemId');
  const fixtureBefore = context.fingerprint(context.fixtureParams);
  const authoredRows = authoredOrientationRows(context.fixtureParams);
  const dataset = buildOrientationDataset(
    itemId,
    recordValue(context.fixtureParams.item, 'fixture item'),
    authoredRows,
    CASE_TRACE[1].operands,
  );
  const datasetBefore = context.fingerprint(dataset);
  const engine = await ensureInitializedEngine(context);
  const loaded = await call(engine, 'loadDataset', dataset, {
    datasetRef: 'lay-004-orientation-authored',
  });
  INPUT_BASELINES.set(engine, {
    dataset,
    datasetBefore,
    fixtureBefore,
  });
  await publish(engine, context);
  const item = queryItem(engine, itemId);
  const fixtureAfter = context.fingerprint(context.fixtureParams);
  const datasetAfter = context.fingerprint(dataset);
  return {
    actual: {
      item: { id: stringValue(item.id, 'loaded item identity') },
      rowCount: authoredRows.length,
      loaded: clone(loaded),
      input: {
        fixtureBefore,
        fixtureAfter,
        datasetBefore,
        datasetAfter,
        unchanged: fixtureBefore === fixtureAfter && datasetBefore === datasetAfter,
      },
      product: observeProduct(engine),
    },
    captureSource: { item: { id: stringValue(item.id, 'loaded item identity') } },
  };
}

async function setWorldTransformAction(context, actionRecord) {
  const operands = exactOperands(actionRecord, ['rotationDegrees', 'flipX', 'flipY']);
  const transform = {
    rotationDegrees: finiteNumber(operands.rotationDegrees, 'setWorldTransform.rotationDegrees'),
    flipX: booleanValue(operands.flipX, 'setWorldTransform.flipX'),
    flipY: booleanValue(operands.flipY, 'setWorldTransform.flipY'),
  };
  const engine = currentEngine(context, 'setWorldTransform');
  await call(engine, 'setWorldTransform', transform);
  await publish(engine, context);
  const itemId = fixtureItemId(context.fixtureParams);
  const geometry = requireGeometry(callSync(engine, 'geometryProbe'), 'setWorldTransform geometry');
  return {
    actual: {
      transform,
      item: projectCentralContent(geometry, itemId),
      product: observeProduct(engine),
    },
  };
}

async function setContentOrientationAction(context, actionRecord) {
  const operands = exactOperands(actionRecord, ['itemId', 'mode']);
  const itemId = stringValue(operands.itemId, 'setContentOrientation.itemId');
  const mode = orientationMode(operands.mode, 'setContentOrientation.mode');
  const engine = currentEngine(context, 'setContentOrientation');
  const before = queryItem(engine, itemId);
  const mutation = await call(engine, 'patch', { kind: 'element', id: itemId }, {
    contentOrientation: mode,
  });
  assert(isRecord(mutation), 'patch() result');
  assert(
    mutation.status === 'committed',
    `setContentOrientation patch must commit, received ${String(mutation.status)}`,
  );
  assert(mutation.changed === true, 'setContentOrientation patch must report a change');
  await publish(engine, context);
  const after = queryItem(engine, itemId);
  const geometry = requireGeometry(callSync(engine, 'geometryProbe'), 'setContentOrientation geometry');
  const item = projectCentralContent(geometry, itemId);
  assert(item.contentOrientation === mode, 'renderer content orientation must match committed mode');
  return {
    actual: {
      itemId,
      mode,
      mutation: clone(mutation),
      identity: {
        before: stringValue(before.id, 'mode change before identity'),
        after: stringValue(after.id, 'mode change after identity'),
      },
      item,
      product: observeProduct(engine),
    },
  };
}

async function observeOrientationMatrixAction(context, actionRecord) {
  const operands = exactOperands(actionRecord, ['valueRef']);
  const valueRef = stringValue(operands.valueRef, 'observeOrientationMatrix.valueRef');
  assert(valueRef === 'orientationMatrix', 'orientation matrix valueRef');
  const engine = currentEngine(context, 'observeOrientationMatrix');
  const authoredRows = authoredOrientationRows(context.fixtureParams);
  const firstGeometry = requireGeometry(callSync(engine, 'geometryProbe'), 'orientation geometry');
  const orientationMatrix = projectOrientationMatrix(firstGeometry, authoredRows);
  const worldFlipSweep = await observeWorldFlipSweep(engine, context, authoredRows);
  const repeatGeometry = requireGeometry(callSync(engine, 'geometryProbe'), 'repeat orientation geometry');
  const repeatOrientationMatrix = projectOrientationMatrix(repeatGeometry, authoredRows);
  const baseline = INPUT_BASELINES.get(engine);
  assert(isRecord(baseline), 'orientation input baseline');
  const fixtureAfterActions = context.fingerprint(context.fixtureParams);
  const datasetAfterActions = context.fingerprint(baseline.dataset);
  const input = {
    fixtureBefore: baseline.fixtureBefore,
    fixtureAfterActions,
    datasetBefore: baseline.datasetBefore,
    datasetAfterActions,
    unchanged: baseline.fixtureBefore === fixtureAfterActions
      && baseline.datasetBefore === datasetAfterActions,
  };
  INPUT_BASELINES.delete(engine);
  return {
    actual: {
      valueRef,
      orientationMatrix,
      repeatOrientationMatrix,
      complete: orientationMatrix.length === authoredRows.length,
      deterministic: sameJson(orientationMatrix, repeatOrientationMatrix),
      worldFlipSweep,
      input,
      product: observeProduct(engine),
    },
  };
}

async function observeWorldFlipSweep(engine, context, authoredRows) {
  const followRow = authoredRows.find((row) => row.mode === 'follow-item');
  assert(followRow !== undefined, 'orientation sweep follow row');
  const itemId = fixtureItemId(context.fixtureParams);
  const modes = context.fixtureParams.worldFlips;
  assert(Array.isArray(modes), 'fixture world flips');
  const observations = [];
  for (const mode of modes) {
    const transform = worldTransformForMode(mode);
    const state = await call(engine, 'setWorldTransform', transform);
    await publish(engine, context);
    const geometry = requireGeometry(callSync(engine, 'geometryProbe'), `world flip ${mode} geometry`);
    const matrix = projectOrientationMatrix(geometry, authoredRows);
    const follow = matrix.find((row) => row.id === followRow.id);
    assert(follow !== undefined, `world flip ${mode} follow row`);
    observations.push({
      mode,
      transform,
      state: clone(state),
      follow,
      upright: projectCentralContent(geometry, itemId),
    });
  }
  const canonical = CASE_TRACE[1].operands;
  await call(engine, 'setWorldTransform', canonical);
  await publish(engine, context);
  return observations;
}

function worldTransformForMode(mode) {
  assert(mode === 'none' || mode === 'x' || mode === 'y' || mode === 'xy', 'world flip mode');
  return {
    rotationDegrees: CASE_TRACE[1].operands.rotationDegrees,
    flipX: mode === 'x' || mode === 'xy',
    flipY: mode === 'y' || mode === 'xy',
  };
}

async function ensureInitializedEngine(context) {
  const engine = await context.ensureMainEngine();
  const snapshot = snapshotEngine(engine);
  if (snapshot.lifecycle === 'new') {
    await call(engine, 'initialize', {
      instanceId: 'lay-004-orientation-engine',
      width: 800,
      height: 600,
      pixelRatio: 1,
      strategy: 'mesh',
      preference: 'webgl',
    });
  } else {
    assert(
      snapshot.lifecycle === 'ready-empty',
      `orientation load requires new or ready-empty engine, received ${String(snapshot.lifecycle)}`,
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
  requireGeometry(geometry, 'geometryProbe() result');
  assert(Array.isArray(dataset), 'exportDataset() must return an array');
  return clone({ snapshot, semanticProbe, geometry, dataset });
}

function projectCentralContent(geometry, itemId) {
  const matches = geometry.entities.filter((entity) => (
    isRecord(entity)
      && entity.ownerItemId === itemId
      && entity.componentType === 'text'
      && entity.componentId === 'central-content'
  ));
  assert(matches.length === 1, `${itemId} central content must resolve exactly once`);
  return projectOrientationEntity(matches[0], 'central content');
}

function projectOrientationMatrix(geometry, authoredRows) {
  return authoredRows.map((row) => {
    const ownerItemId = orientationOwnerId(row.id);
    const matches = geometry.entities.filter((entity) => (
      isRecord(entity)
        && entity.ownerItemId === ownerItemId
        && entity.componentId === row.id
    ));
    assert(matches.length === 1, `${row.id} renderer orientation row must resolve exactly once`);
    const entity = projectOrientationEntity(matches[0], `orientation row ${row.id}`);
    assert(entity.componentType === row.kind, `${row.id} renderer component type`);
    return {
      id: stringValue(entity.componentId, `${row.id} component identity`),
      kind: stringValue(entity.componentType, `${row.id} component type`),
      mode: orientationMode(entity.contentOrientation, `${row.id} content orientation`),
      screenBasis: entity.screenBasis,
      visibleCenter: entity.visibleCenter,
    };
  });
}

function projectOrientationEntity(value, label) {
  const entity = recordValue(value, label);
  return {
    id: stringValue(entity.id, `${label}.id`),
    ownerItemId: stringValue(entity.ownerItemId, `${label}.ownerItemId`),
    componentId: stringValue(entity.componentId, `${label}.componentId`),
    componentType: stringValue(entity.componentType, `${label}.componentType`),
    contentOrientation: orientationMode(
      entity.contentOrientation,
      `${label}.contentOrientation`,
    ),
    screenAngle: normalizeNumber(entity.screenAngle, `${label}.screenAngle`),
    screenBasis: basisValue(entity.screenBasis, `${label}.screenBasis`),
    visibleCenter: pointValue(entity.visibleCenter, `${label}.visibleCenter`),
  };
}

function requireGeometry(value, label) {
  assert(isRecord(value), `${label} must be an object`);
  assert(Array.isArray(value.entities), `${label}.entities`);
  return value;
}

function queryItem(engine, itemId) {
  const item = callSync(engine, 'query', { id: itemId });
  assert(isRecord(item), `Engine query must resolve item ${itemId}`);
  assert(item.id === itemId, `Engine query identity ${itemId}`);
  return item;
}

function buildOrientationDataset(itemId, itemFixture, rows, worldTransform) {
  const center = pointValue(itemFixture.center, 'fixture item center');
  const centralSize = Object.freeze({ width: 20, height: 20 });
  const central = {
    type: 'item',
    id: itemId,
    size: centralSize,
    attrs: {
      x: center[0] - centralSize.width / 2,
      y: center[1] - centralSize.height / 2,
    },
    contentOrientation: 'follow-item',
    components: [componentForRow({ id: 'central-content', kind: 'text' }, centralSize)],
  };
  return [
    central,
    ...rows.map((row) => orientationRowElement(row, center, centralSize, worldTransform)),
  ];
}

function orientationRowElement(row, center, size, worldTransform) {
  const global = multiplyBasis(
    scaleBasis(worldTransform.flipX ? -1 : 1, worldTransform.flipY ? -1 : 1),
    rotationBasis(worldTransform.rotationDegrees),
  );
  const compensation = multiplyBasis(invertBasis(global), rotationBasis(row.worldAngle));
  const frame = decomposeBasis(compensation);
  const localBasis = multiplyBasis(
    compensation,
    multiplyBasis(
      rotationBasis(row.groupAngle),
      multiplyBasis(rotationBasis(row.itemAngle), scaleBasis(row.scale[0], row.scale[1])),
    ),
  );
  const halfWidth = size.width / 2;
  const halfHeight = size.height / 2;
  const x = center[0] - localBasis[0] * halfWidth - localBasis[2] * halfHeight;
  const y = center[1] - localBasis[1] * halfWidth - localBasis[3] * halfHeight;
  return {
    type: 'group',
    id: `orientation-frame:${row.id}`,
    attrs: {
      x: normalizeNumber(x, `${row.id} frame x`),
      y: normalizeNumber(y, `${row.id} frame y`),
      angle: frame.angle,
      scaleX: frame.scaleX,
      scaleY: frame.scaleY,
    },
    children: [{
      type: 'group',
      id: `orientation-group:${row.id}`,
      attrs: { angle: row.groupAngle },
      children: [{
        type: 'item',
        id: orientationOwnerId(row.id),
        size,
        attrs: {
          angle: row.itemAngle,
          scaleX: row.scale[0],
          scaleY: row.scale[1],
        },
        contentOrientation: row.mode,
        components: [componentForRow(row, size)],
      }],
    }],
  };
}

function componentForRow(row, size) {
  const common = { id: row.id, placement: 'center' };
  if (row.kind === 'text') {
    return {
      type: 'text',
      ...common,
      text: row.id,
      style: { fontSize: 12, wordWrapWidth: size.width },
    };
  }
  if (row.kind === 'icon') {
    return {
      type: 'icon',
      ...common,
      source: 'orientation-icon',
      size,
    };
  }
  assert(row.kind === 'bar', `${row.id} component kind`);
  return {
    type: 'bar',
    ...common,
    source: { type: 'rect', fill: '#4F46E5' },
    size,
  };
}

function authoredOrientationRows(params) {
  assert(Array.isArray(params.orientationMatrix), 'fixture orientationMatrix');
  return params.orientationMatrix.map((entry, index) => {
    const row = recordValue(entry, `fixture orientation row ${index}`);
    const kind = stringValue(row.kind, `fixture orientation row ${index} kind`);
    assert(kind === 'text' || kind === 'icon' || kind === 'bar', `fixture orientation row ${index} kind`);
    const scale = pointValue(row.scale, `fixture orientation row ${index} scale`);
    assert(scale[0] !== 0 && scale[1] !== 0, `fixture orientation row ${index} nonzero scale`);
    return {
      id: stringValue(row.id, `fixture orientation row ${index} id`),
      kind,
      mode: orientationMode(row.mode, `fixture orientation row ${index} mode`),
      groupAngle: finiteNumber(row.groupAngle, `fixture orientation row ${index} groupAngle`),
      itemAngle: finiteNumber(row.itemAngle, `fixture orientation row ${index} itemAngle`),
      worldAngle: finiteNumber(row.worldAngle, `fixture orientation row ${index} worldAngle`),
      scale,
    };
  });
}

function fixtureItemId(params) {
  return stringValue(recordValue(params.item, 'fixture item').id, 'fixture item ID');
}

function validateFixtureParams(value) {
  const params = recordValue(value, 'fixture params');
  assert(sameJson(params.declaredTargetIds, ['item']), 'declared target IDs');
  const item = recordValue(params.item, 'fixture item');
  assert(item.id === 'item', 'fixture item ID');
  pointValue(item.center, 'fixture item center');
  assert(Array.isArray(item.angles), 'fixture item angles');
  item.angles.forEach((angle, index) => finiteNumber(angle, `fixture item angle ${index}`));
  assert(sameJson(params.modes, ['follow-item', 'upright']), 'fixture modes');
  assert(sameJson(params.worldFlips, ['none', 'x', 'y', 'xy']), 'fixture world flips');
  const rows = authoredOrientationRows(params);
  assert(rows.length > 0, 'orientation rows');
  assert(new Set(rows.map(({ id }) => id)).size === rows.length, 'orientation row IDs unique');
}

function orientationOwnerId(rowId) {
  return `orientation-item:${rowId}`;
}

function rotationBasis(degrees) {
  const radians = finiteNumber(degrees, 'rotation degrees') * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [cos, sin, -sin, cos];
}

function scaleBasis(scaleX, scaleY) {
  return [
    finiteNumber(scaleX, 'scaleX'),
    0,
    0,
    finiteNumber(scaleY, 'scaleY'),
  ];
}

function multiplyBasis(left, right) {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
  ];
}

function invertBasis(value) {
  const determinant = value[0] * value[3] - value[1] * value[2];
  assert(Number.isFinite(determinant) && Math.abs(determinant) > 1e-12, 'invertible basis');
  return [
    value[3] / determinant,
    -value[1] / determinant,
    -value[2] / determinant,
    value[0] / determinant,
  ];
}

function decomposeBasis(value) {
  const scaleX = Math.hypot(value[0], value[1]);
  assert(scaleX > 1e-12, 'decomposable basis');
  const determinant = value[0] * value[3] - value[1] * value[2];
  return {
    angle: normalizeNumber(Math.atan2(value[1], value[0]) * 180 / Math.PI, 'basis angle'),
    scaleX: normalizeNumber(scaleX, 'basis scaleX'),
    scaleY: normalizeNumber(determinant / scaleX, 'basis scaleY'),
  };
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
  assert(typeof context.ensureMainEngine === 'function', 'context.ensureMainEngine');
  assert(typeof context.currentMainEngine === 'function', 'context.currentMainEngine');
  assert(typeof context.fingerprint === 'function', 'context.fingerprint');
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

function basisValue(value, label) {
  assert(Array.isArray(value) && value.length === 4, label);
  return value.map((entry, index) => normalizeNumber(entry, `${label}[${index}]`));
}

function pointValue(value, label) {
  assert(Array.isArray(value) && value.length === 2, label);
  return value.map((entry, index) => normalizeNumber(entry, `${label}[${index}]`));
}

function orientationMode(value, label) {
  const mode = stringValue(value, label);
  assert(mode === 'follow-item' || mode === 'upright', label);
  return mode;
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
  if (!condition) throw new Error(`Core v2 render-orientation handler invalid: ${message}`);
}
