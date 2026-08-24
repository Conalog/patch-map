import { clone } from '../../value-atoms.mjs';

async function ensureBaseline(state, context) {
  const engine = await ensureInitializedEngine(state, context);
  if (state.loadedDatasetRef !== null) return engine;
  const profileId = context.caseId.startsWith('EVT-')
    ? 'input-device-and-gesture-matrix'
    : context.caseId.startsWith('TRN-')
      ? 'transformer-gesture-matrix'
      : context.caseId.startsWith('CSM-')
        ? 'packed-host-seam'
        : 'selection-and-hit-matrix';
  const profiles = recordValue(context.fixtureProfiles, 'fixture profiles');
  const profile = recordValue(profiles[profileId], `${profileId} profile`);
  const datasetRef = stringValue(profile.datasetRef, `${profileId}.datasetRef`);
  const dataset = await context.resolveDataset(datasetRef);
  callSync(engine, 'loadDataset', dataset, { datasetRef });
  if (context.caseId.startsWith('TRN-') && state.transformerBaselineDataset === null) {
    state.transformerBaselineDataset = clone(dataset);
  }
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

async function reloadTransformerBaseline(engine, state, context, clockMs) {
  assert(state.transformerBaselineDataset !== null, 'transformer baseline dataset');
  callSync(engine, 'loadDataset', clone(state.transformerBaselineDataset), {
    datasetRef: `contract:${context.caseId}:transformer-baseline`,
  });
  callSync(engine, 'setWorldTransform', {
    rotationDegrees: 0,
    flipX: false,
    flipY: false,
  });
  callSync(engine, 'setViewport', { centerWorld: [400, 300], scale: 1 });
  callSync(engine, 'publishFrame', clockMs);
  state.loadedDatasetRef = 'transformer-gesture-matrix';
}

function applyResizeEntry(engine, entry, target, lockAspectRatio) {
  const result = callSync(engine, 'applyTransformerEdit', {
    kind: 'resize',
    selectionIds: [target],
    handle: stringValue(entry.handle, 'resize entry handle'),
    deltaWorld: pointTuple(entry.deltaWorld, 'resize entry delta'),
    lockAspectRatio,
  }, { recordHistory: false });
  assert(result.status === 'committed', 'resize entry commit');
  return result;
}

function transformPlanGeometry(planValue, id, channel = 'after') {
  const plan = recordValue(planValue, 'transform plan');
  const geometries = recordValue(plan[channel], `transform plan ${channel}`);
  return recordValue(geometries[id], `transform plan ${channel}.${id}`);
}

function transformPlanBounds(plan, channel, ids) {
  const geometries = ids.map((id) => transformPlanGeometry(plan, id, channel));
  const left = Math.min(...geometries.map(({ centerWorld, width }) =>
    centerWorld[0] - width / 2));
  const top = Math.min(...geometries.map(({ centerWorld, height }) =>
    centerWorld[1] - height / 2));
  const right = Math.max(...geometries.map(({ centerWorld, width }) =>
    centerWorld[0] + width / 2));
  const bottom = Math.max(...geometries.map(({ centerWorld, height }) =>
    centerWorld[1] + height / 2));
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function oppositeResizeAnchor(geometry, handle) {
  const x = handle.includes('w')
    ? geometry.x + geometry.width
    : handle.includes('e')
      ? geometry.x
      : geometry.x + geometry.width / 2;
  const y = handle.includes('n')
    ? geometry.y + geometry.height
    : handle.includes('s')
      ? geometry.y
      : geometry.y + geometry.height / 2;
  return [canonicalNumber(x), canonicalNumber(y)];
}

function elementRecordByIds(engine, ids) {
  const dataset = callSync(engine, 'exportDataset');
  return Object.fromEntries(ids.map((id) => [
    id,
    clone(requireDatasetElement(dataset, id)),
  ]));
}

function logicalElementValue(engine, id) {
  const query = callSync(engine, 'queryScene', { where: { id } });
  assert(
    query.status === 'matched' && query.targets.length === 1,
    `logical element ${id}`,
  );
  return clone(query.targets[0].value);
}

function elementGeometrySnapshot(engine, id) {
  const element = requireDatasetElement(callSync(engine, 'exportDataset'), id);
  const attrs = recordValue(element.attrs, `${id} attrs`);
  const size = recordValue(element.size, `${id} size`);
  return {
    x: finiteNumber(attrs.x ?? 0, `${id} x`),
    y: finiteNumber(attrs.y ?? 0, `${id} y`),
    width: finiteNumber(size.width, `${id} width`),
    height: finiteNumber(size.height, `${id} height`),
  };
}

function requireDatasetElement(dataset, id) {
  for (const value of arrayValue(dataset, 'transform dataset')) {
    const element = recordValue(value, 'transform dataset element');
    if (element.id === id) return element;
    if (Array.isArray(element.children)) {
      const nested = findDatasetElement(element.children, id);
      if (nested !== null) return nested;
    }
  }
  throw new Error(`Core v2 pointer/selection handler invalid: missing dataset element ${id}`);
}

function findDatasetElement(elements, id) {
  for (const value of arrayValue(elements, 'transform nested dataset')) {
    const element = recordValue(value, 'transform nested element');
    if (element.id === id) return element;
    if (Array.isArray(element.children)) {
      const nested = findDatasetElement(element.children, id);
      if (nested !== null) return nested;
    }
  }
  return null;
}

function transformHandleForKind(kind) {
  if (kind === 'move') return 'frame';
  if (kind === 'resize') return 'se';
  if (kind === 'rotate') return 'rotate';
  throw new Error(`Core v2 pointer/selection handler invalid: transform kind ${kind}`);
}

function transformPreviewRequest(kind, selectionIds, step) {
  if (kind === 'move') {
    return {
      kind,
      selectionIds,
      deltaWorld: [step * 2, step],
    };
  }
  if (kind === 'resize') {
    return {
      kind,
      selectionIds,
      handle: 'se',
      deltaWorld: [step * 2, step * 2],
    };
  }
  if (kind === 'rotate') {
    return {
      kind,
      selectionIds,
      deltaDegrees: step * 5,
    };
  }
  throw new Error(`Core v2 pointer/selection handler invalid: transform kind ${kind}`);
}

function keyNudgeDelta(key, distance) {
  if (key === 'ArrowLeft') return [-distance, 0];
  if (key === 'ArrowRight') return [distance, 0];
  if (key === 'ArrowUp') return [0, -distance];
  if (key === 'ArrowDown') return [0, distance];
  throw new Error(`Core v2 pointer/selection handler invalid: unsupported nudge key ${key}`);
}

function shortestDegrees(start, end) {
  const delta = ((end - start + 540) % 360) - 180;
  return Object.is(delta, -0) ? 0 : delta;
}

function percentile(values, quantile) {
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(ordered.length * quantile) - 1);
  return ordered[index];
}

function canonicalNumber(value) {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function currentStateEngine(state, operation) {
  assert(state.engine !== null, `${operation} active engine`);
  return state.engine;
}

async function ensureInitializedEngine(state, context) {
  const engine = state.engine ?? await context.ensureSessionEngine(state.sessionIndex);
  state.engine = engine;
  const snapshot = callSync(engine, 'snapshot');
  if (snapshot.lifecycle === 'new') {
    await call(engine, 'initialize', {
      instanceId: `contract-${context.caseId.toLowerCase()}-${state.sessionIndex}`,
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

function dispatchProductClick(engine, pointerId, button, screen, timeMs) {
  dispatchPointer(engine, {
    type: 'down',
    pointerId,
    pointerType: 'mouse',
    button,
    buttons: button === 2 ? 2 : 1,
    screen,
    timeMs,
  }, 0);
  return dispatchPointer(engine, {
    type: 'up',
    pointerId,
    pointerType: 'mouse',
    button,
    buttons: 0,
    screen,
    timeMs: timeMs + 16,
  }, 1);
}

function dispatchPointer(engine, eventValue, fallbackIndex) {
  const event = recordValue(eventValue, 'pointer input');
  const type = stringValue(event.type, 'pointer input type');
  const screen = event.screen === undefined
    ? [0, 0]
    : pointTuple(event.screen, 'pointer input screen');
  const snapshot = callSync(engine, 'snapshot');
  return callSync(engine, 'dispatchPointerInput', {
    type,
    pointerId: nonNegativeInteger(event.pointerId ?? 1, 'pointer input pointerId'),
    pointerType: stringValue(event.pointerType ?? 'mouse', 'pointer input pointerType'),
    button: integerValue(event.button ?? (type === 'move' ? -1 : 0), 'pointer input button'),
    buttons: nonNegativeInteger(
      event.buttons ?? (type === 'down' || type === 'move' ? 1 : 0),
      'pointer input buttons',
    ),
    screen,
    timeMs: finiteNumber(event.timeMs ?? fallbackIndex * 16, 'pointer input timeMs'),
    modifiers: {
      shift: event.shiftKey === true,
      ctrl: event.ctrlKey === true,
      alt: event.altKey === true,
      meta: event.metaKey === true,
    },
    viewRevision: finiteNumber(
      event.viewRevision ?? snapshot.revisions.viewRevision,
      'pointer input viewRevision',
    ),
  });
}

function observeProduct(product, context, engine) {
  return clone(product.resourceProbe({ caseId: context.caseId, engine }));
}

function exactOperands(action, keys) {
  const operands = recordValue(action.operands, `${action.type}.operands`);
  assertExactKeys(operands, keys, `${action.type}.operands`);
  return operands;
}

function clickType(count) {
  if (count === 1) return 'single';
  if (count === 2) return 'double';
  return 'multi-click';
}

function projectPointerPayload(value) {
  if (value === null) return null;
  const payload = recordValue(value, 'pointer payload');
  return {
    ...clone(payload),
    target: {
      id: payload.target === null
        ? null
        : stringValue(recordValue(payload.target, 'pointer target').id, 'pointer target ID'),
    },
  };
}

function pointRecord(point) {
  return { x: point[0], y: point[1] };
}

function recordConsumerSelection(state, ids) {
  state.consumerSelectionTrace.push(clone(ids));
}

function currentLogicalIds(engine, ids) {
  return ids.filter((id) => {
    const query = callSync(engine, 'queryScene', { where: { id } });
    return query.status === 'matched' && query.targets.length === 1;
  });
}

function centerOfElement(engine, id) {
  const geometry = elementGeometrySnapshot(engine, id);
  return [
    geometry.x + geometry.width / 2,
    geometry.y + geometry.height / 2,
  ];
}

function modifierRecord(value, label) {
  const modifiers = recordValue(value, label);
  const allowed = ['shift', 'ctrl', 'alt', 'meta'];
  assert(
    Object.keys(modifiers).every((key) => allowed.includes(key)),
    `${label} keys`,
  );
  return {
    shiftKey: modifiers.shift === true,
    ctrlKey: modifiers.ctrl === true,
    altKey: modifiers.alt === true,
    metaKey: modifiers.meta === true,
  };
}

function numberTuple(value, length, label) {
  const tuple = arrayValue(value, label);
  assert(tuple.length === length, `${label} length`);
  return tuple.map((entry, index) => finiteNumber(entry, `${label}[${index}]`));
}

function pointTuple(value, label) {
  const tuple = arrayValue(value, label);
  assert(tuple.length === 2, `${label} length`);
  return [
    finiteNumber(tuple[0], `${label}[0]`),
    finiteNumber(tuple[1], `${label}[1]`),
  ];
}

function numberArray(value, label) {
  return arrayValue(value, label).map((entry, index) =>
    positiveFinite(entry, `${label}[${index}]`));
}

function booleanValue(value, label) {
  assert(typeof value === 'boolean', `${label} must be boolean`);
  return value;
}

function stringArray(value, label) {
  return arrayValue(value, label).map((entry, index) =>
    stringValue(entry, `${label}[${index}]`));
}

function arrayValue(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  return value;
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

function positiveFinite(value, label) {
  const number = finiteNumber(value, label);
  assert(number > 0, `${label} must be positive`);
  return number;
}

function integerValue(value, label) {
  const number = finiteNumber(value, label);
  assert(Number.isInteger(number), `${label} must be integral`);
  return number;
}

function nonNegativeInteger(value, label) {
  const number = integerValue(value, label);
  assert(number >= 0, `${label} must be non-negative`);
  return number;
}

function positiveInteger(value, label) {
  const number = integerValue(value, label);
  assert(number > 0, `${label} must be positive`);
  return number;
}

function countBy(values, keyForValue) {
  const counts = {};
  for (const value of values) {
    const key = keyForValue(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function countManyBy(values, keysForValue) {
  const counts = {};
  for (const value of values) {
    for (const key of keysForValue(value)) {
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return counts;
}

function historyCorruptEntryCount(value) {
  const state = recordValue(value, 'history state');
  const depth = nonNegativeInteger(state.depth, 'history depth');
  const cursor = nonNegativeInteger(state.cursor, 'history cursor');
  const undoDepth = nonNegativeInteger(state.undoDepth, 'history undo depth');
  const redoDepth = nonNegativeInteger(state.redoDepth, 'history redo depth');
  return Number(
    cursor > depth ||
    undoDepth !== cursor ||
    redoDepth !== depth - cursor ||
    state.canUndo !== (!state.destroyed && cursor > 0) ||
    state.canRedo !== (!state.destroyed && cursor < depth),
  );
}

function retainSceneElements(elementsValue, retained, removed) {
  const elements = arrayValue(elementsValue, 'replace-scene dataset');
  const next = [];
  for (const elementValue of elements) {
    const element = recordValue(elementValue, 'replace-scene element');
    const id = stringValue(element.id, 'replace-scene element ID');
    if (removed.has(id)) continue;
    const hasChildren = Array.isArray(element.children);
    const children = hasChildren
      ? retainSceneElements(element.children, retained, removed)
      : [];
    if (retained.has(id) || children.length > 0) {
      next.push(hasChildren ? { ...clone(element), children } : clone(element));
    }
  }
  return next;
}

function replaceSceneElement(elementsValue, targetId, replace) {
  const elements = arrayValue(elementsValue, 'replace endpoint dataset');
  let replaced = false;
  const visit = (elementValue) => {
    const element = recordValue(elementValue, 'replace endpoint element');
    if (element.id === targetId) {
      assert(!replaced, 'replace endpoint unique target');
      replaced = true;
      return replace(element);
    }
    if (!Array.isArray(element.children)) return clone(element);
    return {
      ...clone(element),
      children: element.children.map(visit),
    };
  };
  const result = elements.map(visit);
  assert(replaced, 'replace endpoint target exists');
  return result;
}

function removeSceneElement(elementsValue, targetId) {
  const elements = arrayValue(elementsValue, 'remove endpoint dataset');
  let removed = false;
  const visit = (values) => values.flatMap((elementValue) => {
    const element = recordValue(elementValue, 'remove endpoint element');
    if (element.id === targetId) {
      removed = true;
      return [];
    }
    if (!Array.isArray(element.children)) return [clone(element)];
    return [{
      ...clone(element),
      children: visit(element.children),
    }];
  });
  const result = visit(elements);
  assert(removed, 'remove endpoint target exists');
  return result;
}

function logicalTargetValue(engine, id) {
  const query = callSync(engine, 'queryScene', { where: { id } });
  assert(query.status === 'matched' && query.targets.length === 1, `logical target ${id}`);
  return clone(query.targets[0].value);
}

function callSync(target, method, ...args) {
  assert(target !== null && typeof target === 'object', `${method} target`);
  assert(typeof target[method] === 'function', `${method} product method`);
  const result = target[method](...args);
  assert(!(result instanceof Promise), `${method} must be synchronous`);
  return result;
}

async function call(target, method, ...args) {
  assert(target !== null && typeof target === 'object', `${method} target`);
  assert(typeof target[method] === 'function', `${method} product method`);
  return target[method](...args);
}

function assertExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  assert(
    JSON.stringify(actual) === JSON.stringify(wanted),
    `${label} keys ${JSON.stringify(actual)}`,
  );
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cloneRecord(value, label) {
  return clone(recordValue(value, label));
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Core v2 pointer/selection handler invalid: ${message}`);
}

export {
  applyResizeEntry,
  arrayValue,
  assert,
  assertExactKeys,
  booleanValue,
  callSync,
  centerOfElement,
  clickType,
  cloneRecord,
  countBy,
  countManyBy,
  currentLogicalIds,
  currentStateEngine,
  dispatchPointer,
  dispatchProductClick,
  elementGeometrySnapshot,
  elementRecordByIds,
  ensureBaseline,
  exactOperands,
  finiteNumber,
  historyCorruptEntryCount,
  integerValue,
  isRecord,
  keyNudgeDelta,
  logicalElementValue,
  logicalTargetValue,
  modifierRecord,
  nonNegativeInteger,
  numberArray,
  numberTuple,
  observeProduct,
  oppositeResizeAnchor,
  percentile,
  pointRecord,
  pointTuple,
  positiveFinite,
  positiveInteger,
  projectPointerPayload,
  recordConsumerSelection,
  recordValue,
  reloadTransformerBaseline,
  removeSceneElement,
  replaceSceneElement,
  retainSceneElements,
  sameJson,
  shortestDegrees,
  stringArray,
  stringValue,
  transformHandleForKind,
  transformPlanBounds,
  transformPlanGeometry,
  transformPreviewRequest,
};
