import { clone } from '../value-atoms.mjs';

export const DATA_FOUNDATION_ACTION_TYPES = Object.freeze([
  'loadShorthandMatrix',
  'observeGeometry',
  'validate',
  'initializeInstances',
  'resolveColors',
  'resolveColorInputMatrix',
  'resolveColor',
  'loadGrid',
  'exerciseGridEdgeMatrix',
  'setGridCell',
]);

const PRODUCT_METHODS = Object.freeze([
  'createColorResolver',
  'constructPixiColor',
  'resolveComponentSize',
  'resolveContentBox',
  'materializeGrid',
  'setGridCell',
]);

/**
 * Register actual-only DAT-003/004/005 handlers.
 *
 * Product functions are injected so this browser-safe module does not import a
 * source-only TypeScript entry. Node automation can inject the packed Core v2
 * subpath while the Lab injects the same public source exports through Vite.
 */
export function createDataFoundationHandlerEntries(product) {
  const fixedProduct = product === undefined ? null : validateProduct(product);
  const states = new WeakMap();

  const handlers = Object.freeze({
    loadShorthandMatrix: withState(fixedProduct, states, loadShorthandMatrixAction),
    observeGeometry: withState(fixedProduct, states, observeGeometryAction),
    validate: withState(fixedProduct, states, validateAction),
    initializeInstances: withState(fixedProduct, states, initializeInstancesAction),
    resolveColors: withState(fixedProduct, states, resolveColorsAction),
    resolveColorInputMatrix: withState(fixedProduct, states, resolveColorInputMatrixAction),
    resolveColor: withState(fixedProduct, states, resolveColorAction),
    loadGrid: withState(fixedProduct, states, loadGridAction),
    exerciseGridEdgeMatrix: withState(fixedProduct, states, exerciseGridEdgeMatrixAction),
    setGridCell: withState(fixedProduct, states, setGridCellAction),
  });

  return Object.freeze(DATA_FOUNDATION_ACTION_TYPES.map((type) => Object.freeze([
    `contract/${type}`,
    handlers[type],
  ])));
}

function withState(fixedProduct, states, handler) {
  return (context, action) => {
    const product = fixedProduct ?? validateProduct(context.dataFoundationProduct);
    const key = executionKey(context);
    let state = states.get(key);
    if (state === undefined) {
      state = createCaseState(context.caseId);
      states.set(key, state);
    }
    assert(state.caseId === context.caseId, 'execution state crossed case identity');
    return handler(product, state, context, action);
  };
}

function createCaseState(caseId) {
  return {
    caseId: stringValue(caseId, 'context.caseId'),
    revision: 0,
    shorthandByOwner: new Map(),
    colorInstances: new Map(),
    grids: new Map(),
  };
}

function loadShorthandMatrixAction(product, state, context, action) {
  const operands = exactOperands(action, ['itemId']);
  const itemId = stringValue(operands.itemId, 'loadShorthandMatrix.itemId');
  const params = recordValue(context.fixtureParams, 'fixture params');
  const itemSize = numberPair(params.itemSize, 'fixture itemSize');
  const padding = recordValue(params.padding, 'fixture padding');
  const componentSizes = arrayValue(params.componentSizes, 'fixture componentSizes');
  const inputBefore = context.fingerprint({ itemSize, padding, componentSizes });
  const edges = expandSpacing(padding);
  const size = { width: itemSize[0], height: itemSize[1] };
  const contentBox = product.resolveContentBox(size, edges, `$.${itemId}`);
  const available = { width: contentBox[2], height: contentBox[3] };
  const components = {};
  const resolutions = [];

  for (const [index, componentSize] of componentSizes.entries()) {
    const id = dimensionFormId(componentSize, index);
    const resolved = product.resolveComponentSize(
      clone(componentSize),
      available,
      `$.${itemId}.components.${id}`,
    );
    assert(!Object.hasOwn(components, id), `duplicate dimension form ${id}`);
    components[id] = clone(resolved);
    resolutions.push({ id, input: clone(componentSize), resolved: clone(resolved) });
  }

  const record = deepFreeze({
    itemId,
    size: clone(size),
    padding: clone(edges),
    contentBox: clone(contentBox),
    available: clone(available),
    components: clone(components),
    resolutions: clone(resolutions),
  });
  state.shorthandByOwner.set(itemId, record);
  state.revision += 1;
  const inputAfter = context.fingerprint({
    itemSize: params.itemSize,
    padding: params.padding,
    componentSizes: params.componentSizes,
  });

  return {
    actual: {
      itemId,
      sceneRevision: state.revision,
      geometry: {
        contentBox: clone(contentBox),
        available: clone(available),
        finite: allNumbersFinite(record),
      },
      components: clone(components),
      resolutions: clone(resolutions),
      input: {
        beforeFingerprint: inputBefore,
        afterFingerprint: inputAfter,
        unchanged: inputBefore === inputAfter,
      },
    },
    captureSource: record,
  };
}

function observeGeometryAction(_product, state, _context, action) {
  const operands = exactOperands(action, ['ownerId']);
  const ownerId = stringValue(operands.ownerId, 'observeGeometry.ownerId');
  const record = state.shorthandByOwner.get(ownerId);
  assert(record !== undefined, `shorthand owner ${ownerId} is not loaded`);
  const pctString = record.components['pct-string'];
  const pctObject = record.components['pct-object'];

  return {
    actual: {
      ownerId,
      sceneRevision: state.revision,
      contentBox: clone(record.contentBox),
      available: clone(record.available),
      components: clone(record.components),
      equivalentForms: sameJson(pctString, pctObject),
      finite: allNumbersFinite(record),
    },
    captureSource: record,
  };
}

function validateAction(product, state, context, action) {
  const operands = exactOperands(action, ['caseId', 'value']);
  const caseId = stringValue(operands.caseId, 'validate.caseId');
  const owner = onlyMapValue(state.shorthandByOwner, 'validate shorthand matrix');
  const before = context.fingerprint(shorthandAuthority(state));
  let accepted = false;
  let resolved = null;
  let diagnostic = null;

  try {
    resolved = clone(product.resolveComponentSize(
      clone(operands.value),
      owner.available,
      `$.validation.${caseId}`,
    ));
    accepted = true;
  } catch (error) {
    diagnostic = actualDiagnostic(error);
  }

  const after = context.fingerprint(shorthandAuthority(state));
  return {
    actual: {
      caseId,
      accepted,
      resolved,
      diagnostic,
      sceneRevision: state.revision,
      publicationCount: 0,
      authoritativeSceneUnchanged: before === after,
      beforeFingerprint: before,
      afterFingerprint: after,
    },
    captureSource: owner,
  };
}

function initializeInstancesAction(product, state, context, action) {
  const operands = exactOperands(action, ['ids', 'themes']);
  const ids = stringArray(operands.ids, 'initializeInstances.ids');
  const themeRefs = stringArray(operands.themes, 'initializeInstances.themes');
  assert(ids.length === themeRefs.length && ids.length > 0, 'instance and theme counts must match');
  assert(new Set(ids).size === ids.length, 'instance IDs must be unique');
  const params = recordValue(context.fixtureParams, 'fixture params');
  const staged = new Map();
  const actualInstances = [];

  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    const themeRef = themeRefs[index];
    const theme = recordValue(params[themeRef], `fixture ${themeRef}`);
    const beforeFingerprint = context.fingerprint(theme);
    const resolver = product.createColorResolver(clone(theme));
    assertColorResolver(resolver, id);
    const afterFingerprint = context.fingerprint(params[themeRef]);
    const entry = {
      id,
      themeRef,
      resolver,
      theme: deepFreeze(clone(theme)),
      beforeFingerprint,
    };
    staged.set(id, entry);
    actualInstances.push({
      id,
      themeRef,
      themeRevision: resolver.themeRevision,
      themeKeys: clone(resolver.themeKeys),
      input: {
        beforeFingerprint,
        afterFingerprint,
        unchanged: beforeFingerprint === afterFingerprint,
      },
    });
  }

  state.colorInstances = staged;
  state.revision += 1;
  return {
    actual: {
      sceneRevision: state.revision,
      instances: actualInstances,
      isolatedResolvers: new Set([...staged.values()].map(({ resolver }) => resolver)).size === ids.length,
    },
    captureSource: colorAuthority(state),
  };
}

function resolveColorsAction(_product, state, context, action) {
  const operands = exactOperands(action, ['instanceId']);
  const instanceId = stringValue(operands.instanceId, 'resolveColors.instanceId');
  const instance = requireColorInstance(state, instanceId);
  const params = recordValue(context.fixtureParams, 'fixture params');
  const colors = arrayValue(params.colors, 'fixture colors');
  const themeBefore = context.fingerprint(params[instance.themeRef]);
  const resolvedBySemanticKey = {};
  const resolutions = [];

  for (const [index, value] of colors.entries()) {
    const resolved = instance.resolver.resolve(clone(value), `$.colors[${index}]`);
    const key = colorSemanticKey(value);
    writeColorResult(resolvedBySemanticKey, key, resolved.rgba, resolved.source === 'theme');
    resolutions.push({
      index,
      key,
      input: clone(value),
      source: resolved.source,
      ...(resolved.themePath === undefined ? {} : { themePath: resolved.themePath }),
      rgba: resolved.rgba,
      normalizedRgba: clone(resolved.normalizedRgba),
      byteRgba: clone(resolved.byteRgba),
    });
  }

  const themeAfter = context.fingerprint(params[instance.themeRef]);
  return {
    actual: {
      instanceId,
      sceneRevision: state.revision,
      colors: resolvedBySemanticKey,
      resolutions,
      theme: clone(instance.theme),
      themeInput: {
        beforeFingerprint: themeBefore,
        afterFingerprint: themeAfter,
        unchanged: themeBefore === themeAfter && themeBefore === instance.beforeFingerprint,
      },
    },
    captureSource: colorAuthority(state),
  };
}

function resolveColorInputMatrixAction(product, state, context, action) {
  const operands = exactOperands(action, ['valueRef']);
  const valueRef = stringValue(operands.valueRef, 'resolveColorInputMatrix.valueRef');
  const params = recordValue(context.fixtureParams, 'fixture params');
  const matrix = arrayValue(params[valueRef], `fixture ${valueRef}`);
  const instance = firstMapValue(state.colorInstances, 'color instance');
  const descriptorsBefore = context.fingerprint(matrix);
  const authorityBefore = context.fingerprint(colorAuthority(state));
  const results = {};
  let allCallerValuesUnchanged = true;

  for (const rawDescriptor of matrix) {
    const descriptor = recordValue(rawDescriptor, `${valueRef} entry`);
    const id = stringValue(descriptor.id, `${valueRef}.id`);
    const constructed = constructColorInput(product, descriptor);
    const callerBefore = context.fingerprint(snapshotConstructedColor(constructed.value));
    let result;
    try {
      const resolved = instance.resolver.resolve(
        constructed.value,
        constructed.datasetPath,
      );
      result = {
        constructor: constructed.constructor,
        applied: true,
        rgba: resolved.rgba,
        normalizedRgba: clone(resolved.normalizedRgba),
        byteRgba: clone(resolved.byteRgba),
        source: resolved.source,
        publicationCount: 0,
      };
    } catch (error) {
      result = {
        constructor: constructed.constructor,
        applied: false,
        diagnostic: actualDiagnostic(error),
        publicationCount: 0,
        rejectedBeforeLossyConstruction: constructed.rejectedBeforeLossyConstruction,
      };
    }
    const callerAfter = context.fingerprint(snapshotConstructedColor(constructed.value));
    result.callerValueUnchanged = callerBefore === callerAfter;
    allCallerValuesUnchanged &&= result.callerValueUnchanged;
    assert(!Object.hasOwn(results, id), `duplicate color input ID ${id}`);
    results[id] = result;
  }

  const descriptorsAfter = context.fingerprint(params[valueRef]);
  const authorityAfter = context.fingerprint(colorAuthority(state));
  return {
    actual: {
      valueRef,
      sceneRevision: state.revision,
      results,
      callerValuesUnchanged: allCallerValuesUnchanged && descriptorsBefore === descriptorsAfter,
      descriptorInput: {
        beforeFingerprint: descriptorsBefore,
        afterFingerprint: descriptorsAfter,
        unchanged: descriptorsBefore === descriptorsAfter,
      },
      authoritativeSceneUnchanged: authorityBefore === authorityAfter,
      beforeFingerprint: authorityBefore,
      afterFingerprint: authorityAfter,
    },
    captureSource: colorAuthority(state),
  };
}

function resolveColorAction(_product, state, context, action) {
  const operands = exactOperands(action, ['instanceId', 'path', 'value']);
  const instanceId = stringValue(operands.instanceId, 'resolveColor.instanceId');
  const path = stringValue(operands.path, 'resolveColor.path');
  const instance = requireColorInstance(state, instanceId);
  const before = context.fingerprint(colorAuthority(state));
  let accepted = false;
  let resolved = null;
  let diagnostic = null;

  try {
    resolved = clone(instance.resolver.resolve(clone(operands.value), path));
    accepted = true;
  } catch (error) {
    diagnostic = actualDiagnostic(error);
  }

  const after = context.fingerprint(colorAuthority(state));
  return {
    actual: {
      instanceId,
      value: clone(operands.value),
      path,
      accepted,
      resolved,
      diagnostic,
      sceneRevision: state.revision,
      publicationCount: 0,
      authoritativeSceneUnchanged: before === after,
      beforeFingerprint: before,
      afterFingerprint: after,
    },
    captureSource: colorAuthority(state),
  };
}

function loadGridAction(product, state, context, action) {
  const operands = gridLoadOperands(action);
  const params = recordValue(context.fixtureParams, 'fixture params');
  const compact = recordValue(params.grid, 'fixture grid');
  assert(compact.id === operands.gridId, `fixture grid ${String(compact.id)} does not match ${operands.gridId}`);
  const inputBefore = context.fingerprint(compact);
  const source = expandGrid(compact, operands.inactiveCellStrategy);
  const layout = product.materializeGrid(source, '$.grid');
  const repeated = product.materializeGrid(clone(source), '$.grid');

  state.grids.set(operands.gridId, {
    compact: deepFreeze(clone(compact)),
    initialInputFingerprint: inputBefore,
    layout,
  });
  state.revision += 1;
  const inputAfter = context.fingerprint(params.grid);
  return {
    actual: {
      gridId: operands.gridId,
      sceneRevision: state.revision,
      grid: summarizeGrid(layout),
      input: {
        gridTemplate: clone(compact),
        beforeFingerprint: inputBefore,
        afterFingerprint: inputAfter,
        unchanged: inputBefore === inputAfter,
      },
      determinism: {
        repeatedFingerprint: context.fingerprint(summarizeGrid(repeated)),
        initialFingerprint: context.fingerprint(summarizeGrid(layout)),
        equal: sameJson(summarizeGrid(layout), summarizeGrid(repeated)),
      },
    },
    captureSource: summarizeGrid(layout),
  };
}

function exerciseGridEdgeMatrixAction(product, state, context, action) {
  const operands = exactOperands(action, ['valueRef']);
  const valueRef = stringValue(operands.valueRef, 'exerciseGridEdgeMatrix.valueRef');
  const params = recordValue(context.fixtureParams, 'fixture params');
  const matrices = recordValue(params[valueRef], `fixture ${valueRef}`);
  const grid = onlyMapValue(state.grids, 'loaded grid');
  const before = context.fingerprint(matrices);
  const edge = {};

  for (const [id, cells] of Object.entries(matrices)) {
    assert(Array.isArray(cells), `${valueRef}.${id} must be a matrix`);
    const layout = product.materializeGrid(
      { ...grid.layout.source, cells: clone(cells) },
      `$.${valueRef}.${id}`,
    );
    edge[id] = summarizeGridEdge(layout);
  }

  const after = context.fingerprint(params[valueRef]);
  return {
    actual: {
      valueRef,
      sceneRevision: state.revision,
      edge,
      input: {
        beforeFingerprint: before,
        afterFingerprint: after,
        unchanged: before === after,
      },
    },
    captureSource: edge,
  };
}

function setGridCellAction(product, state, context, action) {
  const operands = exactOperands(action, ['column', 'gridId', 'row', 'value']);
  const gridId = stringValue(operands.gridId, 'setGridCell.gridId');
  const row = safeIndex(operands.row, 'setGridCell.row');
  const column = safeIndex(operands.column, 'setGridCell.column');
  const value = gridCellValue(operands.value, 'setGridCell.value');
  const grid = state.grids.get(gridId);
  assert(grid !== undefined, `grid ${gridId} is not loaded`);
  const params = recordValue(context.fixtureParams, 'fixture params');
  const cellId = `${gridId}.${row}.${column}`;
  const previous = grid.layout.cellsById[cellId] ?? null;
  const templateBefore = context.fingerprint(params.grid);
  const next = product.setGridCell(grid.layout, row, column, value, '$.grid');
  const current = next.cellsById[cellId] ?? null;
  grid.layout = next;
  state.revision += 1;
  const templateAfter = context.fingerprint(params.grid);

  return {
    actual: {
      gridId,
      row,
      column,
      value,
      cellId,
      sceneRevision: state.revision,
      previous: clone(previous),
      current: clone(current),
      identityStable: previous === null || current === null || previous.id === current.id,
      grid: summarizeGrid(next),
      input: {
        beforeFingerprint: templateBefore,
        afterFingerprint: templateAfter,
        unchanged: templateBefore === templateAfter && templateBefore === grid.initialInputFingerprint,
      },
    },
    captureSource: summarizeGrid(next),
  };
}

function constructColorInput(product, descriptor) {
  const constructor = stringValue(descriptor.construct, 'color input construct');
  const datasetPath = typeof descriptor.datasetPath === 'string' ? descriptor.datasetPath : '$.fill';
  if (constructor === 'Uint8Array') {
    return {
      constructor,
      datasetPath,
      value: new Uint8Array(arrayValue(descriptor.values, `${constructor}.values`).map(decodeNumber)),
      rejectedBeforeLossyConstruction: false,
    };
  }
  if (constructor === 'Float32Array') {
    return {
      constructor,
      datasetPath,
      value: new Float32Array(arrayValue(descriptor.values, `${constructor}.values`).map(decodeNumber)),
      rejectedBeforeLossyConstruction: false,
    };
  }
  if (constructor === 'PixiJS.Color') {
    const source = decodeSpecialNumbers(recordValue(descriptor.value, `${constructor}.value`));
    const hasNonFinite = containsNonFinite(source);
    return {
      constructor,
      datasetPath,
      // Pixi normalizes non-finite channels during construction. Validate the
      // raw public ColorSource first so invalid intent cannot become valid state.
      value: hasNonFinite ? source : product.constructPixiColor(source),
      rejectedBeforeLossyConstruction: hasNonFinite,
    };
  }
  throw new Error(`Core v2 data-foundation handler invalid: unsupported color constructor ${constructor}`);
}

function summarizeGrid(layout) {
  const cells = {};
  for (const cell of layout.cells) cells[cell.id] = clone(cell);
  return {
    id: layout.id,
    inactiveCellStrategy: layout.inactiveCellStrategy,
    rowCount: layout.rowCount,
    columnCount: layout.columnCount,
    activeIds: clone(layout.activeIds),
    logicalIds: clone(layout.logicalIds),
    cells,
    localBounds: clone(layout.localBounds),
    identityCollisionCount: layout.identityCollisionCount,
    finiteValueCount: layout.finiteValueCount,
    hierarchyNodeCount: layout.cells.length + 1,
  };
}

function summarizeGridEdge(layout) {
  const activeCells = layout.activeIds.map((id) => {
    const cell = layout.cellsById[id];
    assert(cell !== undefined, `active grid cell ${id} is missing`);
    return cell;
  });
  return {
    activeIds: clone(layout.activeIds),
    positions: activeCells.map(({ localPosition }) => clone(localPosition)),
    ids: layout.cells.map(({ id }) => id),
    labels: layout.cells.map(({ label }) => label ?? null),
    localBounds: clone(layout.localBounds),
    identityCollisionCount: layout.identityCollisionCount,
    finiteValueCount: layout.finiteValueCount,
  };
}

function expandGrid(compact, strategyOverride) {
  const itemSize = numberPair(compact.itemSize, 'grid.itemSize');
  const gap = numberPair(compact.gap, 'grid.gap');
  const padding = finiteNumber(compact.padding, 'grid.padding');
  const strategy = strategyOverride ?? compact.inactiveCellStrategy;
  const orientation = compact.orientation ?? 'upright';
  assert(strategy === 'hide' || strategy === 'destroy', 'grid inactiveCellStrategy');
  assert(
    orientation === 'upright' || orientation === 'follow-item',
    'grid item content orientation',
  );
  assert(Array.isArray(compact.cells), 'grid.cells must be a matrix');
  return {
    type: 'grid',
    id: stringValue(compact.id, 'grid.id'),
    show: true,
    locked: false,
    cells: clone(compact.cells),
    item: {
      size: { width: itemSize[0], height: itemSize[1] },
      components: [],
      padding: { top: padding, right: padding, bottom: padding, left: padding },
      contentOrientation: orientation,
    },
    inactiveCellStrategy: strategy,
    gap: { x: gap[0], y: gap[1] },
  };
}

function gridLoadOperands(action) {
  const operands = recordValue(action.operands, `${action.type} operands`);
  const keys = Object.keys(operands).sort();
  const valid = sameStrings(keys, ['gridId']) || sameStrings(keys, ['gridId', 'inactiveCellStrategy']);
  assert(valid, `${action.type} operand keys`);
  return {
    gridId: stringValue(operands.gridId, 'loadGrid.gridId'),
    ...(operands.inactiveCellStrategy === undefined
      ? {}
      : { inactiveCellStrategy: stringValue(operands.inactiveCellStrategy, 'loadGrid.inactiveCellStrategy') }),
  };
}

function expandSpacing(value) {
  const x = optionalFinite(value.x, 0, 'padding.x');
  const y = optionalFinite(value.y, 0, 'padding.y');
  return {
    top: optionalFinite(value.top, y, 'padding.top'),
    right: optionalFinite(value.right, x, 'padding.right'),
    bottom: optionalFinite(value.bottom, y, 'padding.bottom'),
    left: optionalFinite(value.left, x, 'padding.left'),
  };
}

function dimensionFormId(value, index) {
  if (typeof value === 'number') return 'numeric';
  if (typeof value === 'string' && value.startsWith('calc(')) return 'calc';
  if (typeof value === 'string' && value.endsWith('%')) return 'pct-string';
  if (isRecord(value) && value.unit === '%') return 'pct-object';
  return `form-${index}`;
}

function colorSemanticKey(value) {
  if (Array.isArray(value)) return 'array';
  return String(value);
}

function writeColorResult(target, key, rgba, nestedThemePath) {
  if (!nestedThemePath) {
    target[key] = rgba;
    return;
  }
  const segments = key.split('.');
  let cursor = target;
  for (const [index, segment] of segments.entries()) {
    if (index === segments.length - 1) {
      cursor[segment] = rgba;
      return;
    }
    cursor[segment] ??= {};
    assert(isRecord(cursor[segment]), `theme result path collision at ${segment}`);
    cursor = cursor[segment];
  }
}

function shorthandAuthority(state) {
  return {
    revision: state.revision,
    owners: Object.fromEntries([...state.shorthandByOwner].map(([id, record]) => [id, clone(record)])),
  };
}

function colorAuthority(state) {
  return {
    revision: state.revision,
    instances: Object.fromEntries([...state.colorInstances].map(([id, entry]) => [id, {
      themeRef: entry.themeRef,
      theme: clone(entry.theme),
      themeRevision: entry.resolver.themeRevision,
      themeKeys: clone(entry.resolver.themeKeys),
    }])),
  };
}

function actualDiagnostic(error) {
  const inputPath = typeof error?.inputPath === 'string' ? error.inputPath : undefined;
  const datasetPath = typeof error?.datasetPath === 'string' ? error.datasetPath : inputPath;
  return {
    name: error instanceof Error ? error.name : typeof error,
    code: typeof error?.code === 'string' ? error.code : 'UNKNOWN_FAILURE',
    ...(typeof error?.category === 'string' ? { category: error.category } : {}),
    ...(datasetPath === undefined ? {} : { path: datasetPath, datasetPath }),
    ...(inputPath === undefined ? {} : { inputPath }),
    ...(typeof error?.appliedCount === 'number' ? { appliedCount: error.appliedCount } : {}),
    message: error instanceof Error ? error.message : String(error),
  };
}

function snapshotConstructedColor(value) {
  if (ArrayBuffer.isView(value)) {
    return {
      constructor: value.constructor.name,
      values: Array.from(value, encodeSpecialNumber),
    };
  }
  if (isRecord(value) && typeof value.toHexa === 'function') {
    return { constructor: 'PixiJS.Color', rgba: value.toHexa() };
  }
  return encodeSpecialNumbers(value);
}

function decodeSpecialNumbers(value) {
  if (Array.isArray(value)) return value.map(decodeSpecialNumbers);
  if (!isRecord(value)) return decodeNumber(value);
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, decodeSpecialNumbers(nested)]));
}

function encodeSpecialNumbers(value) {
  if (Array.isArray(value)) return value.map(encodeSpecialNumbers);
  if (!isRecord(value)) return encodeSpecialNumber(value);
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, encodeSpecialNumbers(nested)]));
}

function decodeNumber(value) {
  if (value === 'NaN') return Number.NaN;
  if (value === 'Infinity') return Number.POSITIVE_INFINITY;
  if (value === '-Infinity') return Number.NEGATIVE_INFINITY;
  return value;
}

function encodeSpecialNumber(value) {
  if (typeof value !== 'number' || Number.isFinite(value)) return value;
  if (Number.isNaN(value)) return 'NaN';
  return value > 0 ? 'Infinity' : '-Infinity';
}

function containsNonFinite(value) {
  if (typeof value === 'number') return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some(containsNonFinite);
  if (isRecord(value)) return Object.values(value).some(containsNonFinite);
  return false;
}

function executionKey(context) {
  assert(typeof context.resolveDataset === 'function', 'context.resolveDataset must identify execution');
  assert(typeof context.fingerprint === 'function', 'context.fingerprint must be available');
  return context.resolveDataset;
}

function validateProduct(product) {
  assert(isRecord(product), 'data-foundation product adapter must be an object');
  for (const method of PRODUCT_METHODS) {
    assert(typeof product[method] === 'function', `product adapter must expose ${method}()`);
  }
  return product;
}

function assertColorResolver(resolver, id) {
  assert(isRecord(resolver), `color resolver ${id} must be an object`);
  assert(typeof resolver.resolve === 'function', `color resolver ${id} must expose resolve()`);
  assert(Number.isFinite(resolver.themeRevision), `color resolver ${id} themeRevision`);
  assert(Array.isArray(resolver.themeKeys), `color resolver ${id} themeKeys`);
}

function requireColorInstance(state, id) {
  const instance = state.colorInstances.get(id);
  assert(instance !== undefined, `color instance ${id} is not initialized`);
  return instance;
}

function onlyMapValue(map, label) {
  assert(map.size === 1, `${label} requires exactly one entry`);
  return firstMapValue(map, label);
}

function firstMapValue(map, label) {
  const first = map.values().next();
  assert(!first.done, `${label} is unavailable`);
  return first.value;
}

function exactOperands(action, keys) {
  const operands = recordValue(action.operands, `${action.type} operands`);
  assert(sameStrings(Object.keys(operands).sort(), [...keys].sort()), `${action.type} operand keys`);
  return operands;
}

function sameStrings(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function stringArray(value, label) {
  const entries = arrayValue(value, label);
  return entries.map((entry, index) => stringValue(entry, `${label}[${index}]`));
}

function numberPair(value, label) {
  const entries = arrayValue(value, label);
  assert(entries.length === 2, `${label} must contain exactly two numbers`);
  return [finiteNumber(entries[0], `${label}[0]`), finiteNumber(entries[1], `${label}[1]`)];
}

function optionalFinite(value, fallback, label) {
  return value === undefined ? fallback : finiteNumber(value, label);
}

function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} must be finite`);
  return value;
}

function safeIndex(value, label) {
  assert(Number.isSafeInteger(value) && value >= 0, `${label} must be a non-negative safe integer`);
  return value;
}

function gridCellValue(value, label) {
  assert(value === 0 || value === 1 || typeof value === 'string', `${label} must be 0, 1, or a string`);
  return value;
}

function recordValue(value, label) {
  assert(isRecord(value), `${label} must be an object`);
  return value;
}

function arrayValue(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  return value;
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} must be a non-empty string`);
  return value;
}

function allNumbersFinite(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(allNumbersFinite);
  if (isRecord(value)) return Object.values(value).every(allNumbersFinite);
  return true;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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
  if (!condition) throw new Error(`Core v2 data-foundation handler invalid: ${message}`);
}
