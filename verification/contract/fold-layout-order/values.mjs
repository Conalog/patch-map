import {
  clone,
  createOrderedExactKeyAssertion,
  deepFreeze,
} from '../value-atoms.mjs';

export const assertExactKeys = createOrderedExactKeyAssertion(assert);

export { clone };

export function validateProductCleanup(value, caseId, productCleanupRevision) {
  const cleanup = recordValue(value, 'product runtime cleanup');
  assert(cleanup.revision === productCleanupRevision, 'product cleanup revision');
  assert(cleanup.caseId === caseId, 'product cleanup case ID');
  const counts = recordValue(cleanup.runtimeCounts, 'product cleanup runtimeCounts');
  assert(
    ['activeSessionCount', 'retainedDatasetCount', 'rendererObjectCount', 'subscriptionCount', 'pendingWorkCount']
      .every((field) => nonNegativeInteger(counts[field], `product cleanup ${field}`) === 0),
    'product runtime cleanup drain',
  );
  recordValue(cleanup.stats, 'product cleanup stats');
  assert(Array.isArray(cleanup.journal), 'product cleanup journal');
}
export function validateInputEvidence(value, label) {
  const input = recordValue(value, label);
  assertExactKeys(
    input,
    [
      'authoredAfter',
      'authoredBefore',
      'datasetAfter',
      'datasetBefore',
      'fixtureAfter',
      'fixtureBefore',
      'unchanged',
    ],
    label,
  );
  const pairs = [
    ['fixtureBefore', 'fixtureAfter'],
    ['authoredBefore', 'authoredAfter'],
    ['datasetBefore', 'datasetAfter'],
  ];
  const normalized = {};
  for (const [beforeKey, afterKey] of pairs) {
    const before = stringValue(input[beforeKey], `${label}.${beforeKey}`);
    const after = stringValue(input[afterKey], `${label}.${afterKey}`);
    assert(before === after, `${label}.${beforeKey} correlation`);
    normalized[beforeKey] = before;
    normalized[afterKey] = after;
  }
  assert(booleanValue(input.unchanged, `${label}.unchanged`), `${label} unchanged`);
  normalized.unchanged = true;
  return normalized;
}

export function actionActualAt(execution, index, type) {
  const result = execution.actionResults[index];
  assert(result.type === type, `action ${index} type`);
  return recordValue(recordValue(result.delta, `action ${index} delta`).actual, `action ${index} actual`);
}

export function projectRevisions(snapshot) {
  const revisions = recordValue(snapshot.revisions, 'snapshot revisions');
  return {
    _availability: { terminalSnapshot: 'available' },
    lifecycle: finiteNumber(revisions.lifecycleGeneration, 'lifecycle revision'),
    scene: finiteNumber(revisions.sceneRevision, 'scene revision'),
    view: finiteNumber(revisions.viewRevision, 'view revision'),
    interaction: finiteNumber(revisions.interactionRevision, 'interaction revision'),
    frame: { revision: finiteNumber(snapshot.frameRevision, 'frame revision') },
    publishedTuple: cloneRecord(snapshot.publishedTuple, 'published tuple'),
  };
}

export function projectScene(snapshot) {
  return {
    _availability: { terminalSnapshot: 'available' },
    revision: finiteNumber(
      recordValue(snapshot.revisions, 'snapshot revisions').sceneRevision,
      'scene revision',
    ),
    rootIds: cloneArray(snapshot.rootIds, 'root IDs'),
  };
}

export function projectCase(plan, execution) {
  return {
    id: plan.id,
    caseType: plan.caseType,
    params: cloneRecord(plan.routeParams, 'route params'),
    ...(typeof plan.fixtureSha256 === 'string' ? { fixtureSha256: plan.fixtureSha256 } : {}),
    ...(typeof plan.rootTestId === 'string' ? { rootTestId: plan.rootTestId } : {}),
    executedActions: execution.actionResults.map((result) => ({
      index: result.index,
      type: result.type,
      status: result.status,
    })),
  };
}

export function projectCaptures(plan, execution) {
  assert(plan.checkpoints.length === 0, 'plan capture count');
  assert(execution.captures.length === 0, 'execution capture count');
  return {};
}

export function notExercised(reason) {
  return { _availability: { status: 'not-exercised', reason } };
}

export function countFiniteNumbers(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? 1 : 0;
  if (Array.isArray(value)) return value.reduce((total, entry) => total + countFiniteNumbers(entry), 0);
  if (isPlainObject(value)) {
    return Object.values(value).reduce((total, entry) => total + countFiniteNumbers(entry), 0);
  }
  return 0;
}

export function stringArray(value, label) {
  assert(Array.isArray(value), label);
  return value.map((entry, index) => stringValue(entry, `${label}[${index}]`));
}

export function edgeValue(value, label) {
  const edges = recordValue(value, label);
  assertExactKeys(edges, ['bottom', 'left', 'right', 'top'], label);
  return {
    top: finiteNumber(edges.top, `${label}.top`),
    right: finiteNumber(edges.right, `${label}.right`),
    bottom: finiteNumber(edges.bottom, `${label}.bottom`),
    left: finiteNumber(edges.left, `${label}.left`),
  };
}

export function pointValue(value, label) {
  return numberTuple(value, 2, label, false).map((entry, index) => (
    normalizeNumber(entry, `${label}[${index}]`)
  ));
}

export function boundsValue(value, label) {
  return numberTuple(value, 4, label, false).map((entry, index) => (
    normalizeNumber(entry, `${label}[${index}]`)
  ));
}

export function requireGeometry(value, label) {
  const geometry = recordValue(value, label);
  assert(Array.isArray(geometry.entities), `${label}.entities`);
  assert(Array.isArray(geometry.relations), `${label}.relations`);
  return geometry;
}

export function numberTuple(value, length, label, nonNegative) {
  assert(Array.isArray(value) && value.length === length, `${label} length`);
  return value.map((entry, index) => {
    const number = finiteNumber(entry, `${label}[${index}]`);
    assert(!nonNegative || number >= 0, `${label}[${index}] non-negative`);
    return number;
  });
}

export function nullableFiniteNumber(value, label) {
  return value === null || value === undefined ? null : finiteNumber(value, label);
}

export function normalizeNumber(value, label) {
  const numeric = finiteNumber(value, label);
  const rounded = Math.round(numeric * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function traceAction(type, operands) {
  return Object.freeze({ type, operands: deepFreeze(operands) });
}

export function assignOwned(target, key, value, label) {
  assert(!Object.hasOwn(target, key), `${label} duplicate key`);
  Object.defineProperty(target, key, {
    configurable: false,
    enumerable: true,
    writable: false,
    value,
  });
}

export function cloneRecord(value, label) {
  assert(isPlainObject(value), `${label} must be a plain object`);
  return clone(value);
}

export function cloneArray(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  return clone(value);
}

export function recordValue(value, label) {
  assert(isPlainObject(value), `${label} must be a plain object`);
  return value;
}

export function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, label);
  return value;
}

export function booleanValue(value, label) {
  assert(typeof value === 'boolean', label);
  return value;
}

export function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), label);
  return value;
}

export function nonNegativeInteger(value, label) {
  assert(Number.isInteger(value) && value >= 0, label);
  return value;
}

export function assertUint32(value, label) {
  assert(Number.isInteger(value) && value >= 0 && value <= 0xffffffff, label);
}

export function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function validateJsonValue(value, label, ancestors) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    assert(Number.isFinite(value), `${label} finite number`);
    assert(!Object.is(value, -0), `${label} negative zero`);
    return;
  }
  assert(typeof value === 'object', `${label} JSON value`);
  assert(!ancestors.has(value), `${label} acyclic`);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => validateJsonValue(entry, `${label}[${index}]`, ancestors));
    } else {
      assert(isPlainObject(value), `${label} plain object`);
      Object.entries(value).forEach(([key, entry]) => (
        validateJsonValue(entry, `${label}.${key}`, ancestors)
      ));
    }
  } finally {
    ancestors.delete(value);
  }
}


export function assert(condition, message) {
  if (!condition) throw new Error(`PatchMap layout-order fold invalid: ${message}`);
}
