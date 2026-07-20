export const LIFECYCLE_RESIZE_FOLD_REVISION = 'core-v2-lifecycle-resize-fold/1';

const OBSERVATION_REVISION = 'core-v2-semantic-observation/1';
const EXECUTION_REVISION = 'core-v2-contract-case-execution/1';
const DELTA_REVISION = 'core-v2-semantic-observation-delta/1';
const ACTION_TYPES = Object.freeze([
  'loadDataset',
  'set-view',
  'select',
  'resizeHost',
  'publishFrame',
  'hitTest',
  'convertScreenToWorld',
]);
const DOMAIN_NAMES = Object.freeze([
  'case',
  'provenance',
  'environment',
  'revisions',
  'scene',
  'geometry',
  'text',
  'paint',
  'interaction',
  'events',
  'history',
  'accessibility',
  'outcome',
  'resources',
]);

/**
 * Project LIF-004 product observations into the semantic envelope. No geometry,
 * backing-size, hit, or revision value is synthesized here; each comes from an
 * action result produced by the engine-facing handler.
 */
export function foldLifecycleResizeExecution(options) {
  const input = validateOptions(options);
  const plan = validateCasePlan(input.casePlan);
  const execution = validateExecution(input.execution, plan);
  const loaded = actionActual(execution, 0, 'loadDataset');
  const viewed = actionActual(execution, 1, 'set-view');
  const selected = actionActual(execution, 2, 'select');
  const resized = actionActual(execution, 3, 'resizeHost');
  const published = actionActual(execution, 4, 'publishFrame');
  const hit = actionActual(execution, 5, 'hitTest');
  const converted = actionActual(execution, 6, 'convertScreenToWorld');
  const snapshot = snapshotRecord(converted.snapshot, 'convert snapshot');
  const resources = recordValue(snapshot.resources, 'snapshot resources');
  const canvas = recordValue(resources.canvas, 'snapshot canvas');
  const viewport = recordValue(snapshot.viewport, 'snapshot viewport');
  const revisions = recordValue(snapshot.revisions, 'snapshot revisions');
  const geometry = projectGeometry(converted.geometry);
  const coordinateScreen = finitePair(converted.screen, 'converted screen');
  const coordinateWorld = finitePair(converted.world, 'converted world');
  const resizeHitIds = stringArray(hit.resizeHitIds, 'resize hit IDs');

  const actual = {
    $schema: OBSERVATION_REVISION,
    case: {
      id: plan.id,
      caseType: plan.caseType,
      rootTestId: plan.rootTestId,
      fixtureSha256: plan.fixtureSha256,
      executionStatus: execution.status,
    },
    provenance: cloneRecord(input.provenance, 'provenance'),
    environment: cloneRecord(input.environment, 'environment'),
    revisions: {
      _availability: {
        lifecycle: 'engine-snapshot',
        frame: 'engine-snapshot',
      },
      lifecycle: {
        generation: finiteNumber(
          revisions.lifecycleGeneration,
          'snapshot lifecycle generation',
        ),
      },
      frame: {
        revision: finiteNumber(snapshot.frameRevision, 'snapshot frame revision'),
      },
    },
    scene: {
      _availability: { authority: 'engine-snapshot' },
      revision: finiteNumber(revisions.sceneRevision, 'snapshot scene revision'),
      datasetRef: nullableString(snapshot.datasetRef, 'snapshot datasetRef'),
      semanticHash: nullableString(snapshot.semanticHash, 'snapshot semanticHash'),
      rootIds: stringArray(snapshot.rootIds, 'snapshot root IDs'),
    },
    geometry: {
      _availability: {
        coordinateProbe: 'screen-to-world-result',
        rendererGeometry: geometry.available ? 'product-probe' : 'unavailable',
      },
      coordinateProbe: {
        screen: coordinateScreen,
        world: coordinateWorld,
      },
      relation: { links: geometry.relations },
      selectionOverlay: geometry.selectionOverlay,
      entities: geometry.entities,
    },
    text: notExercised('lifecycle-resize-does-not-observe-text'),
    paint: notExercised('lifecycle-resize-does-not-observe-paint'),
    interaction: {
      _availability: {
        viewport: 'engine-snapshot',
        hitTest: 'action-result',
        selection: 'engine-snapshot',
      },
      viewport: {
        centerWorld: finitePair(viewport.centerWorld, 'viewport centerWorld'),
        scale: positiveNumber(viewport.scale, 'viewport scale'),
        screenBounds: finiteBounds(viewport.screenBounds, 'viewport screenBounds'),
      },
      resizeHitIds,
      hitResults: cloneArray(hit.results, 'hit results'),
      selectionIds: stringArray(snapshot.selectionIds, 'snapshot selection IDs'),
    },
    events: {
      _availability: { eventJournal: 'available' },
      journal: clone(execution.eventJournal),
    },
    history: {
      _availability: { engineSnapshot: 'available' },
      depth: nonNegativeNumber(snapshot.historyDepth, 'snapshot history depth'),
    },
    accessibility: notExercised('lifecycle-resize-does-not-observe-accessibility'),
    outcome: {
      _availability: { actionResults: 'available' },
      recorded: true,
      load: clone(loaded),
      view: clone(viewed),
      selection: clone(selected),
      resize: clone(resized),
      frame: clone(published),
      hitTest: clone(hit),
      coordinateConversion: clone(converted),
    },
    resources: {
      _availability: {
        canvas: 'engine-snapshot',
        cleanup: 'available',
      },
      canvas: {
        cssSize: finitePair(canvas.cssSize, 'canvas cssSize'),
        backingSize: finitePair(canvas.backingSize, 'canvas backingSize'),
      },
      dom: {
        canvasCount: nonNegativeInteger(resources.canvasCount, 'canvas count'),
      },
      renderer: cloneNullableRecord(resources.renderer, 'renderer resources'),
      cleanup: clone(execution.cleanup),
    },
  };

  validateJsonValue(actual, 'actual', new WeakSet());
  assert(
    DOMAIN_NAMES.every((domain) => isPlainObject(actual[domain])),
    'actual must contain all fourteen object domains',
  );
  return deepFreeze({
    actual,
    fixtures: cloneRecord(plan.fixture.setup.params, 'fixture params'),
    captures: projectCaptures(execution),
  });
}

function validateOptions(options) {
  assert(isPlainObject(options), 'options must be a plain object');
  assertExactKeys(options, ['casePlan', 'environment', 'execution', 'provenance'], 'options');
  assert(isPlainObject(options.casePlan), 'casePlan must be a plain object');
  assert(isPlainObject(options.execution), 'execution must be a plain object');
  assert(isPlainObject(options.provenance), 'provenance must be a plain object');
  assert(isPlainObject(options.environment), 'environment must be a plain object');
  validateJsonValue(options.provenance, 'provenance', new WeakSet());
  validateJsonValue(options.environment, 'environment', new WeakSet());
  return options;
}

function validateCasePlan(casePlan) {
  validateJsonValue(casePlan, 'casePlan', new WeakSet());
  assert(casePlan.id === 'LIF-004', 'case ID');
  assert(casePlan.caseType === 'capability', 'caseType');
  assert(isPlainObject(casePlan.fixture), 'fixture');
  assert(isPlainObject(casePlan.fixture.setup), 'fixture setup');
  const params = recordValue(casePlan.fixture.setup.params, 'fixture params');
  positivePair(params.initialHostCssPx, 'fixture initialHostCssPx');
  const nextHost = positivePair(params.nextHostCssPx, 'fixture nextHostCssPx');
  const devicePixelRatio = positiveNumber(params.devicePixelRatio, 'fixture devicePixelRatio');
  const probeScreen = finitePair(params.probeScreen, 'fixture probeScreen');
  assert(isPlainObject(casePlan.routeParams), 'route params');
  assert(
    typeof casePlan.routeParams.size === 'string' && casePlan.routeParams.size.length > 0,
    'route size',
  );
  assertUint32(casePlan.routeParams.seed, 'route seed');
  assert(Array.isArray(casePlan.fixture.actionTrace), 'fixture actionTrace');
  assert(Array.isArray(casePlan.actionTrace), 'materialized actionTrace');
  assert(sameJson(casePlan.fixture.actionTrace, casePlan.actionTrace), 'materialized actionTrace drift');
  assert(casePlan.fixture.actionTrace.length === ACTION_TYPES.length, 'action count');

  casePlan.fixture.actionTrace.forEach((action, index) => {
    assert(isPlainObject(action), `action ${index}`);
    assertExactKeys(action, ['index', 'operands', 'type'], `action ${index}`);
    assert(action.index === index, `action ${index} index`);
    assert(action.type === ACTION_TYPES[index], `action ${index} type`);
    assert(isPlainObject(action.operands), `action ${index} operands`);
  });
  validateActionOperands(casePlan.fixture.actionTrace, {
    nextHost,
    devicePixelRatio,
    probeScreen,
  });
  return casePlan;
}

function validateActionOperands(actions, params) {
  assertExactKeys(actions[0].operands, ['datasetRef', 'timeMs'], 'loadDataset operands');
  stringValue(actions[0].operands.datasetRef, 'loadDataset datasetRef');
  finiteNumber(actions[0].operands.timeMs, 'loadDataset timeMs');

  assertExactKeys(actions[1].operands, ['centerWorld', 'scale'], 'set-view operands');
  finitePair(actions[1].operands.centerWorld, 'set-view centerWorld');
  positiveNumber(actions[1].operands.scale, 'set-view scale');

  assertExactKeys(actions[2].operands, ['ids'], 'select operands');
  stringArray(actions[2].operands.ids, 'select ids');

  assertExactKeys(
    actions[3].operands,
    ['devicePixelRatio', 'heightCssPx', 'timeMs', 'widthCssPx'],
    'resizeHost operands',
  );
  const resizedHost = positivePair(
    [actions[3].operands.widthCssPx, actions[3].operands.heightCssPx],
    'resizeHost dimensions',
  );
  assert(sameJson(resizedHost, params.nextHost), 'resizeHost dimensions must use fixture nextHostCssPx');
  assert(
    positiveNumber(actions[3].operands.devicePixelRatio, 'resizeHost devicePixelRatio')
      === params.devicePixelRatio,
    'resizeHost devicePixelRatio must use fixture value',
  );
  finiteNumber(actions[3].operands.timeMs, 'resizeHost timeMs');

  assertExactKeys(actions[4].operands, ['timeMs'], 'publishFrame operands');
  finiteNumber(actions[4].operands.timeMs, 'publishFrame timeMs');
  assert(actions[4].operands.timeMs >= actions[3].operands.timeMs, 'frame precedes resize');

  assertExactKeys(actions[5].operands, ['points'], 'hitTest operands');
  const points = pointArray(actions[5].operands.points, 'hitTest points');
  assert(points.length > 0, 'hitTest points must not be empty');

  assertExactKeys(actions[6].operands, ['screen'], 'convertScreenToWorld operands');
  const screen = finitePair(actions[6].operands.screen, 'convertScreenToWorld screen');
  assert(sameJson(screen, params.probeScreen), 'coordinate probe must use fixture probeScreen');
}

function validateExecution(execution, plan) {
  validateJsonValue(execution, 'execution', new WeakSet());
  assert(execution.$schema === EXECUTION_REVISION, 'execution schema');
  assert(execution.caseId === plan.id, 'execution caseId');
  assert(execution.caseType === plan.caseType, 'execution caseType');
  assert(execution.status === 'completed', 'execution status');
  assert(execution.error === null, 'execution error');
  assert(execution.hostSeamDelta === null, 'capability host seam');
  assert(Array.isArray(execution.actionResults), 'action results');
  assert(execution.actionResults.length === ACTION_TYPES.length, 'action result count');

  execution.actionResults.forEach((result, index) => {
    assert(isPlainObject(result), `action result ${index}`);
    assert(result.index === index, `action result ${index} index`);
    assert(result.type === ACTION_TYPES[index], `action result ${index} type`);
    assert(result.handlerId === `contract/${ACTION_TYPES[index]}`, `action result ${index} handler`);
    assert(result.status === 'completed', `action result ${index} status`);
    finiteNumber(result.startedAtMs, `action result ${index} start`);
    finiteNumber(result.completedAtMs, `action result ${index} completion`);
    assert(result.completedAtMs >= result.startedAtMs, `action result ${index} timing`);
    assert(isPlainObject(result.delta), `action result ${index} delta`);
    assert(result.delta.$schema === DELTA_REVISION, `action result ${index} delta schema`);
    assert(result.delta.caseId === plan.id, `action result ${index} delta caseId`);
    assert(result.delta.actionIndex === index, `action result ${index} delta index`);
    assert(result.delta.actionType === ACTION_TYPES[index], `action result ${index} delta type`);
    assert(isPlainObject(result.delta.actual), `action result ${index} actual`);
    assert(Object.hasOwn(result.delta, 'semanticProbe'), `action result ${index} semantic probe`);
  });

  assert(Array.isArray(execution.eventJournal), 'event journal');
  assert(Array.isArray(execution.eventJournalFailures), 'event journal failures');
  assert(execution.eventJournalFailures.length === 0, 'event journal failure count');
  assert(isPlainObject(execution.bindings), 'bindings');
  assert(Array.isArray(execution.captures), 'captures');
  assert(isPlainObject(execution.terminalSnapshot), 'terminal snapshot');
  assert(isPlainObject(execution.terminalSemanticProbe), 'terminal semantic probe');
  assert(isPlainObject(execution.cleanup), 'cleanup');
  assert(execution.cleanup.status === 'completed', 'cleanup status');
  assert(Array.isArray(execution.cleanup.errors) && execution.cleanup.errors.length === 0, 'cleanup errors');
  return execution;
}

function projectGeometry(value) {
  if (value === null) {
    return { available: false, entities: [], relations: [], selectionOverlay: null };
  }
  const geometry = recordValue(value, 'geometry probe');
  const entities = cloneArray(geometry.entities, 'geometry entities');
  const relations = cloneArray(geometry.relations, 'geometry relations');
  entities.forEach((entry, index) => {
    const entity = recordValue(entry, `geometry entity ${index}`);
    stringValue(entity.id, `geometry entity ${index} id`);
    finiteBounds(entity.worldBounds, `geometry entity ${index} worldBounds`);
    finiteBounds(entity.screenBounds, `geometry entity ${index} screenBounds`);
  });
  relations.forEach((entry, index) => {
    const relation = recordValue(entry, `geometry relation ${index}`);
    stringValue(relation.id, `geometry relation ${index} id`);
    endpointPair(relation.worldEndpoints, `geometry relation ${index} worldEndpoints`);
    endpointPair(relation.screenEndpoints, `geometry relation ${index} screenEndpoints`);
  });
  const selectionOverlay = geometry.selectionOverlay === null
    ? null
    : cloneRecord(geometry.selectionOverlay, 'geometry selectionOverlay');
  if (selectionOverlay !== null) {
    finiteBounds(selectionOverlay.screenBounds, 'geometry selectionOverlay screenBounds');
  }
  return { available: true, entities, relations, selectionOverlay };
}

function projectCaptures(execution) {
  const captures = cloneRecord(execution.bindings, 'bindings');
  const names = new Set(Object.keys(captures));
  for (const [index, capture] of execution.captures.entries()) {
    assert(isPlainObject(capture), `capture ${index}`);
    assert(typeof capture.id === 'string' && capture.id.length > 0, `capture ${index} id`);
    assert(!names.has(capture.id), `capture ${capture.id} collides or is duplicated`);
    names.add(capture.id);
    assert(isPlainObject(capture.values), `capture ${capture.id} values`);
    captures[capture.id] = clone(capture.values);
  }
  return captures;
}

function actionActual(execution, index, type) {
  const result = execution.actionResults[index];
  assert(result.type === type, `action ${index} expected ${type}`);
  return result.delta.actual;
}

function snapshotRecord(value, label) {
  const snapshot = recordValue(value, label);
  assert(typeof snapshot.lifecycle === 'string' && snapshot.lifecycle.length > 0, `${label} lifecycle`);
  return snapshot;
}

function cloneNullableRecord(value, label) {
  if (value === null) return null;
  return cloneRecord(value, label);
}

function cloneRecord(value, label) {
  assert(isPlainObject(value), `${label} must be a plain object`);
  return clone(value);
}

function cloneArray(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  return clone(value);
}

function notExercised(reason) {
  return { _availability: { status: 'not-exercised', reason } };
}

function endpointPair(value, label) {
  assert(Array.isArray(value) && value.length === 2, `${label} must contain two points`);
  return value.map((point, index) => finitePair(point, `${label}[${index}]`));
}

function pointArray(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  return value.map((point, index) => finitePair(point, `${label}[${index}]`));
}

function finitePair(value, label) {
  assert(Array.isArray(value) && value.length === 2, `${label} must contain two values`);
  return value.map((entry, index) => finiteNumber(entry, `${label}[${index}]`));
}

function positivePair(value, label) {
  assert(Array.isArray(value) && value.length === 2, `${label} must contain two values`);
  return value.map((entry, index) => positiveNumber(entry, `${label}[${index}]`));
}

function finiteBounds(value, label) {
  assert(Array.isArray(value) && value.length === 4, `${label} must contain four values`);
  return value.map((entry, index) => finiteNumber(entry, `${label}[${index}]`));
}

function stringArray(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  return value.map((entry, index) => stringValue(entry, `${label}[${index}]`));
}

function recordValue(value, label) {
  assert(isPlainObject(value), `${label} must be a plain object`);
  return value;
}

function nullableString(value, label) {
  assert(value === null || typeof value === 'string', `${label} must be a string or null`);
  return value;
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} must be a non-empty string`);
  return value;
}

function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} must be finite`);
  return value;
}

function positiveNumber(value, label) {
  const number = finiteNumber(value, label);
  assert(number > 0, `${label} must be positive`);
  return number;
}

function nonNegativeNumber(value, label) {
  const number = finiteNumber(value, label);
  assert(number >= 0, `${label} must be non-negative`);
  return number;
}

function nonNegativeInteger(value, label) {
  assert(Number.isInteger(value) && value >= 0, `${label} must be a non-negative integer`);
  return value;
}

function assertUint32(value, label) {
  assert(Number.isInteger(value) && value >= 0 && value <= 0xffffffff, `${label} must be uint32`);
}

function assertExactKeys(value, keys, label) {
  const record = recordValue(value, label);
  const actualKeys = Object.keys(record).sort();
  const acceptedKeys = [...keys].sort();
  assert(
    actualKeys.length === acceptedKeys.length
      && actualKeys.every((key, index) => key === acceptedKeys[index]),
    `${label} keys`,
  );
}

function validateJsonValue(value, path, ancestors) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    assert(Number.isFinite(value), `${path} number must be finite`);
    assert(!Object.is(value, -0), `${path} must not be negative zero`);
    return;
  }
  assert(typeof value === 'object', `${path} must be JSON-safe`);
  assert(!ancestors.has(value), `${path} must not contain a cycle`);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      assert(Object.getPrototypeOf(value) === Array.prototype, `${path} array prototype`);
      assert(Object.keys(value).length === value.length, `${path} sparse array`);
      value.forEach((nested, index) => validateJsonValue(nested, `${path}[${index}]`, ancestors));
      return;
    }
    assert(isPlainObject(value), `${path} object prototype`);
    for (const [key, nested] of Object.entries(value)) {
      assert(typeof key === 'string', `${path} key type`);
      validateJsonValue(nested, `${path}.${key}`, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
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

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assert(condition, message) {
  if (!condition) throw new Error(`Core v2 lifecycle-resize fold invalid: ${message}`);
}
