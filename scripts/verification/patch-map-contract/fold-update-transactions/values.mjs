import { clone, createTypeSuffixValueAtoms } from '../value-atoms.mjs';

const {
  arrayValue,
  booleanValue,
} = createTypeSuffixValueAtoms(assert);

export { arrayValue, booleanValue, clone };

export function universalProduct(value, label) {
  const product = recordValue(value, label);
  assertExactKeys(
    product,
    [
      'dataset',
      'geometry',
      'history',
      'interactionOwnership',
      'relations',
      'resources',
      'sceneImages',
      'semantic',
      'snapshot',
    ],
    label,
  );
  const dataset = recordValue(product.dataset, `${label} dataset`);
  assertExactKeys(
    dataset,
    ['fingerprint', 'rootCount', 'rootIds', 'semanticHash'],
    `${label} dataset`,
  );
  assert(
    typeof dataset.fingerprint === 'string' && dataset.fingerprint.length > 0,
    `${label} dataset fingerprint`,
  );
  nullableString(dataset.semanticHash, `${label} dataset semantic hash`);
  stringArray(dataset.rootIds, `${label} dataset root IDs`);
  nonNegativeInteger(dataset.rootCount, `${label} dataset root count`);
  assert(isPlainObject(product.snapshot), `${label} snapshot`);
  assert(isPlainObject(product.semantic), `${label} semantic`);
  assert(product.geometry === null || isPlainObject(product.geometry), `${label} geometry`);
  assert(product.relations === null || isPlainObject(product.relations), `${label} relations`);
  assert(
    product.sceneImages === null || isPlainObject(product.sceneImages),
    `${label} scene images`,
  );
  assert(
    product.interactionOwnership === null || isPlainObject(product.interactionOwnership),
    `${label} interaction ownership`,
  );
  assert(isPlainObject(product.history), `${label} history`);
  assert(isPlainObject(product.resources), `${label} resources`);
  return product;
}

export function productAt(execution, index) {
  return universalProduct(actionActualAt(execution, index).product, `action ${index} product`);
}

export function productRecord(value, label) {
  return universalProduct(value, label);
}

export function actionActualAt(execution, index, type) {
  const result = execution.actionResults[index];
  assert(result !== undefined, `action ${index} exists`);
  if (type !== undefined) assert(result.type === type, `action ${index} requires ${type}`);
  return recordValue(recordValue(result.delta, `action ${index} delta`).actual, `action ${index} actual`);
}

export function inputEvidenceAt(execution, index) {
  const input = recordValue(actionActualAt(execution, index).input, `action ${index} input`);
  return inputEvidence(input, `action ${index} input`);
}

export function inputEvidence(input, label) {
  assertExactKeys(input, ['afterFingerprint', 'beforeFingerprint', 'unchanged'], label);
  assert(typeof input.beforeFingerprint === 'string', `${label} before fingerprint`);
  assert(typeof input.afterFingerprint === 'string', `${label} after fingerprint`);
  assert(typeof input.unchanged === 'boolean', `${label} unchanged`);
  assert(
    input.unchanged === (input.beforeFingerprint === input.afterFingerprint),
    `${label} fingerprint correlation`,
  );
  return input;
}

export function mutationDiagnostic(action, result, label) {
  const candidate = action.diagnostic ?? result.transactionDiagnostic ?? result.diagnostic;
  return recordValue(candidate, `${label} diagnostic`);
}

export function targetSetResult(result, label) {
  return {
    applied: mutationTargetIds(result.applied, `${label} applied`),
    missing: mutationTargetIds(result.missing, `${label} missing`),
  };
}

export function rootMutationTargetIds(value, label) {
  const roots = mutationTargets(value, label).map((target, index) => {
    if (typeof target === 'string') return target;
    const record = recordValue(target, `${label}[${index}]`);
    return record.kind === 'component'
      ? stringValue(record.ownerId, `${label}[${index}].ownerId`)
      : stringValue(record.id, `${label}[${index}].id`);
  });
  return [...new Set(roots)];
}

export function mutationTargetIds(value, label) {
  return mutationTargets(value, label).map((entry, index) => {
    if (typeof entry === 'string') return entry;
    const target = recordValue(entry, `${label}[${index}]`);
    return stringValue(target.id, `${label}[${index}].id`);
  });
}

export function mutationTargets(value, label) {
  return arrayValue(value, label);
}

export function journeyComponentRecord(components, id, caseId) {
  const component = recordValue(
    components[id],
    `${caseId} ${id} component facts`,
  );
  return recordValue(component.record, `${caseId} ${id} record`);
}

export function namedBounds(value, label) {
  const tuple = boundsValue(value, label);
  return {
    x: tuple[0],
    y: tuple[1],
    width: tuple[2],
    height: tuple[3],
  };
}

export function namedSize(value, label) {
  const size = recordValue(value, label);
  return {
    width: finiteNumber(size.width, `${label} width`),
    height: finiteNumber(size.height, `${label} height`),
  };
}

export function canonicalRgba(value, label) {
  const input = stringValue(value, label).toLowerCase();
  if (/^#[0-9a-f]{8}$/u.test(input)) return input;
  if (/^#[0-9a-f]{6}$/u.test(input)) return `${input}ff`;
  if (/^#[0-9a-f]{4}$/u.test(input)) {
    return `#${input.slice(1).split('').map((digit) => digit.repeat(2)).join('')}`;
  }
  if (/^#[0-9a-f]{3}$/u.test(input)) {
    return `#${input.slice(1).split('').map((digit) => digit.repeat(2)).join('')}ff`;
  }
  return input;
}

export function geometryEntity(product, id) {
  const geometry = recordValue(product.geometry, `geometry for ${id}`);
  assert(Array.isArray(geometry.entities), `geometry entities for ${id}`);
  const entity = geometry.entities.find((candidate) =>
    isPlainObject(candidate) && candidate.id === id);
  assert(entity !== undefined, `geometry entity ${id}`);
  return entity;
}

export function relationRows(product) {
  const probe = recordValue(product.relations, 'relation product probe');
  assert(Array.isArray(probe.relations), 'relation rows');
  return probe.relations.map((entry, index) => {
    const row = recordValue(entry, `relation row ${index}`);
    stringValue(row.sourceId, `relation row ${index} source`);
    stringValue(row.targetId, `relation row ${index} target`);
    stringValue(row.key, `relation row ${index} key`);
    return row;
  });
}

export function requireRelation(rows, key, label) {
  const row = rows.find((candidate) => candidate.key === key);
  assert(row !== undefined, label);
  return row;
}

export function requireMapValue(map, key, label) {
  const value = map.get(key);
  assert(value !== undefined, label);
  return value;
}

export function visibleRelationKeys(product) {
  return relationRows(product)
    .filter((row) => row.visible !== false)
    .map((row) => stringValue(row.key, 'visible relation key'));
}

export function staleRelationCount(value) {
  if (value === null) return 0;
  const probe = recordValue(value, 'relation probe');
  const omitted = probe.omittedRelations ?? [];
  assert(Array.isArray(omitted), 'omitted relations');
  const revisionLags = probe.revisionLags;
  const sceneLag = revisionLags === null
    ? null
    : recordValue(revisionLags, 'relation revision lags').scene;
  assert(
    sceneLag === null || (Number.isInteger(sceneLag) && sceneLag >= 0),
    'relation revision lag',
  );
  return omitted.length + (sceneLag === null || sceneLag === 0 ? 0 : 1);
}

export function actionEventCount(execution) {
  return execution.actionResults.reduce((count, _, index) => {
    const events = actionActualAt(execution, index).events;
    if (events === undefined) return count;
    return count + eventCount(events, `action ${index} events`);
  }, 0);
}

export function eventCount(value, label) {
  const events = recordValue(value, label);
  assertExactKeys(events, ['change', 'frame'], label);
  assert(Array.isArray(events.change), `${label} change`);
  assert(Array.isArray(events.frame), `${label} frame`);
  return events.change.length + events.frame.length;
}

export function positionTuple(record, label) {
  const attrs = recordValue(record.attrs, `${label} attrs`);
  return [
    finiteNumber(attrs.x, `${label} x`),
    finiteNumber(attrs.y, `${label} y`),
  ];
}

export function sizeTuple(value, label) {
  const size = recordValue(value, label);
  return [
    finiteNumber(size.width, `${label} width`),
    finiteNumber(size.height, `${label} height`),
  ];
}

export function pointValue(value, label) {
  return numberTuple(value, 2, label);
}

export function boundsValue(value, label) {
  return numberTuple(value, 4, label);
}

export function numberTuple(value, length, label) {
  assert(Array.isArray(value) && value.length === length, `${label} tuple`);
  return value.map((entry, index) => finiteNumber(entry, `${label}[${index}]`));
}

export function tupleAt(value, index, label) {
  assert(Array.isArray(value), `${label} array`);
  const entry = value[index];
  assert(entry !== undefined, `${label}[${index}]`);
  return entry;
}


export function integerArray(value, label) {
  return arrayValue(value, label).map((entry, index) =>
    nonNegativeInteger(entry, `${label}[${index}]`));
}

export function historyCorruptEntryCount(value) {
  const state = recordValue(value, 'history state');
  if (!allNumbersFinite(state)) return 1;
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

export function cleanupLeakDelta(value) {
  const cleanup = recordValue(value, 'execution cleanup');
  const releases = arrayValue(cleanup.releases, 'cleanup releases');
  let total = 0;
  for (const releaseValue of releases) {
    const release = recordValue(releaseValue, 'cleanup release');
    if (!isPlainObject(release.remainingResources)) continue;
    for (const field of ['canvasCount', 'subscriptions', 'pendingWork']) {
      const count = release.remainingResources[field];
      if (typeof count === 'number' && Number.isFinite(count)) {
        total += Math.abs(count);
      }
    }
  }
  if (isPlainObject(cleanup.productResources)) {
    const runtimeCounts = cleanup.productResources.runtimeCounts;
    if (isPlainObject(runtimeCounts)) {
      for (const count of Object.values(runtimeCounts)) {
        if (typeof count === 'number' && Number.isFinite(count)) {
          total += Math.abs(count);
        }
      }
    }
  }
  return total;
}

export function allNumbersFinite(value, seen = new WeakSet()) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (value === null || typeof value !== 'object' || seen.has(value)) return true;
  seen.add(value);
  return Object.values(value).every((nested) => allNumbersFinite(nested, seen));
}

export function nullableNonNegativeInteger(value, label) {
  if (value === null) return null;
  return nonNegativeInteger(value, label);
}

export function nonNegativeInteger(value, label) {
  assert(Number.isInteger(value) && value >= 0, `${label} non-negative integer`);
  return value;
}

export function assertUint32(value, label) {
  assert(Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff, `${label} uint32`);
}

export function finiteNumber(value, label) {
  assertFiniteNumber(value, label);
  return value;
}

export function assertFiniteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} finite number`);
}

export function nullableString(value, label) {
  assert(value === null || typeof value === 'string', `${label} nullable string`);
  return value;
}


export function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} non-empty string`);
  return value;
}

export function stringArray(value, label) {
  assert(Array.isArray(value), `${label} array`);
  return value.map((entry, index) => stringValue(entry, `${label}[${index}]`));
}

export function notExercised(reason) {
  return { _availability: { status: 'not-exercised', reason } };
}

export function cloneRecord(value, label) {
  return clone(recordValue(value, label));
}

export function cloneArray(value, label) {
  assert(Array.isArray(value), `${label} array`);
  return clone(value);
}

export function recordValue(value, label) {
  assert(isPlainObject(value), `${label} object`);
  return value;
}

export function assignOwned(target, key, value, label) {
  assert(!Object.hasOwn(target, key), `${label} collision`);
  target[key] = value;
}

export function assignPath(target, segments, value, label) {
  let cursor = target;
  segments.forEach((segment, index) => {
    assert(segment.length > 0, `${label} path segment`);
    if (index === segments.length - 1) {
      assignOwned(cursor, segment, value, `${label}/${segment}`);
      return;
    }
    if (!Object.hasOwn(cursor, segment)) cursor[segment] = {};
    cursor = recordValue(cursor[segment], `${label}/${segment}`);
  });
}

export function assertExactKeys(value, expectedKeys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  assert(sameJson(actual, expected), `${label} keys`);
}

export function validateJsonValue(value, path, ancestors) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    assert(Number.isFinite(value) && !Object.is(value, -0), `${path} finite JSON number`);
    return;
  }
  assert(typeof value === 'object', `${path} JSON value`);
  assert(!ancestors.has(value), `${path} acyclic`);
  ancestors.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateJsonValue(entry, `${path}[${index}]`, ancestors));
  } else {
    assert(isPlainObject(value), `${path} plain object`);
    for (const [key, nested] of Object.entries(value)) {
      assert(key !== '__proto__' && key !== 'constructor' && key !== 'prototype', `${path} safe key`);
      validateJsonValue(nested, `${path}.${key}`, ancestors);
    }
  }
  ancestors.delete(value);
}


export function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function assert(condition, message) {
  if (!condition) throw new Error(`PatchMap update fold invalid: ${message}`);
}
