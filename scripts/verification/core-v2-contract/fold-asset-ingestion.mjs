import { deepFreeze } from './value-atoms.mjs';

export const ASSET_INGESTION_FOLD_REVISION =
  'patch-map-asset-ingestion-fold/1';

const OBSERVATION_REVISION = 'core-v2-semantic-observation/1';
const EXECUTION_REVISION = 'core-v2-contract-case-execution/1';
const CASE_IDS = new Set([
  'ERR-003',
  'AST-002',
  'AST-003',
  'SEC-001',
  'CSM-032',
]);
const CASE_ACTIONS = Object.freeze({
  'ERR-003': Object.freeze([
    'load-dataset',
    'resolve-asset',
    'retry-asset',
  ]),
  'AST-002': Object.freeze([
    'freezeDescriptors',
    'loadDescriptors',
    'construct-cyclic-descriptor',
    'validate-asset-descriptor',
  ]),
  'AST-003': Object.freeze([
    'loadDataset',
    'startAssetRequest',
    'replaceSource',
    'completeAssetRequest',
    'destroy',
    'completeAssetRequest',
  ]),
  'SEC-001': Object.freeze([
    'run-asset-ingestion-policy-matrix',
  ]),
  'CSM-032': Object.freeze([
    'paste-external-text',
    'paste-images',
    'drop-images',
    'drop-images',
    'probe-declared-failure',
  ]),
});
const CLASSIFIED_ENGINE_EVENTS = new Set([
  'ready',
  'sceneCommitted',
  'drawComplete',
  'frame',
  'diagnostic',
  'destroyed',
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
 * Fold public product deltas for the five asset-ingestion cases.
 *
 * This module deliberately receives no normalized expected catalog. It
 * projects only handler deltas, executor lifecycle facts, and immutable setup
 * fixtures; the independent comparator remains the sole expected reader.
 */
export function foldAssetIngestionExecution(optionsValue) {
  const options = validateOptions(optionsValue);
  const plan = validatePlan(options.casePlan);
  const execution = validateExecution(options.execution, plan);
  const projected = projectCase(plan, execution);
  const terminal = terminalProductObservation(execution);
  const semantic = terminal === null
    ? null
    : recordValue(terminal.semantic, 'terminal semantic');
  const snapshot = terminal === null
    ? null
    : recordValue(terminal.snapshot, 'terminal snapshot');

  const actual = {
    $schema: OBSERVATION_REVISION,
    case: {
      id: plan.id,
      type: plan.caseType,
      route: plan.route,
      rootTestId: plan.rootTestId,
      executionStatus: execution.status,
    },
    provenance: cloneRecord(options.provenance, 'provenance'),
    environment: cloneRecord(options.environment, 'environment'),
    revisions: {
      _availability: {
        publicProductProbes: snapshot === null ? 'not-applicable' : 'available',
      },
      ...(snapshot === null
        ? {}
        : {
            valuesFinite: allFiniteNumbers(snapshot.revisions)
              && allFiniteNumbers(snapshot.frameRevision),
          }),
      ...projected.revisions,
    },
    scene: {
      _availability: {
        semanticProbe: semantic === null ? 'not-applicable' : 'available',
      },
      ...(semantic === null
        ? {}
        : {
            invalidNodeCount: invalidNodeCount(
              recordValue(semantic.scene, 'semantic scene'),
            ),
          }),
      ...projected.scene,
    },
    geometry: {
      _availability: {
        semanticProbe: semantic === null ? 'not-applicable' : 'available',
      },
      ...(semantic === null
        ? {}
        : {
            nonFiniteCount: nonNegativeInteger(
              recordValue(semantic.geometry, 'semantic geometry').nonFiniteValueCount,
              'semantic non-finite count',
            ),
          }),
      ...projected.geometry,
    },
    text: {
      _availability: {
        semanticProbe: semantic === null ? 'not-applicable' : 'available',
      },
      ...projected.text,
    },
    paint: {
      _availability: {
        semanticProbe: semantic === null ? 'not-applicable' : 'available',
      },
      ...(semantic === null
        ? {}
        : {
            unresolvedIntentCount: nonNegativeInteger(
              recordValue(semantic.paint, 'semantic paint').unresolvedCount,
              'unresolved paint count',
            ),
          }),
      ...projected.paint,
    },
    interaction: {
      _availability: {
        semanticProbe: semantic === null ? 'not-applicable' : 'available',
      },
      ...(semantic === null
        ? {}
        : {
            staleGestureCount: nonNegativeInteger(
              recordValue(semantic.interaction, 'semantic interaction')
                .activeGestureCount ?? 0,
              'active gesture count',
            ),
          }),
      ...projected.interaction,
    },
    events: {
      _availability: { executorJournal: 'available' },
      totalCount: execution.eventJournal.length,
      unclassifiedCount: unclassifiedEventCount(execution),
      ...projected.events,
    },
    history: {
      _availability: {
        semanticProbe: semantic === null ? 'not-applicable' : 'available',
      },
      ...(semantic === null
        ? {}
        : {
            corruptEntryCount: nonNegativeInteger(
              recordValue(semantic.history, 'semantic history').corruptCount ?? 0,
              'history corrupt count',
            ),
          }),
      ...projected.history,
    },
    accessibility: notExercised(
      'asset-ingestion-accessibility-is-owned-by-the-accessibility-tranche',
    ),
    outcome: {
      _availability: { actualActionResults: 'available' },
      recorded: execution.actionResults.every(({ status }) => status === 'completed'),
      ...projected.outcome,
    },
    resources: {
      _availability: {
        executorCleanup: 'available',
        productCleanup: 'available',
      },
      leakDelta: cleanupLeakDelta(execution.cleanup),
      ...projected.resources,
    },
  };

  assert(
    DOMAIN_NAMES.every((domain) => isRecord(actual[domain])),
    'actual contains fourteen domains',
  );
  validateJson(actual, 'actual', new WeakSet());
  return deepFreeze({
    actual,
    fixtures: cloneRecord(plan.fixture.setup.params, 'fixture params'),
    captures: projectCaptures(plan, execution),
  });
}

function projectCase(plan, execution) {
  switch (plan.id) {
    case 'ERR-003':
      return projectAssetRecovery(execution);
    case 'AST-002':
      return projectDescriptorIdentity(execution);
    case 'AST-003':
      return projectStaleCompletion(execution);
    case 'SEC-001':
      return projectSecurityPolicy(execution);
    case 'CSM-032':
      return projectHostClipboard(execution);
    default:
      throw new Error(`Unsupported Core v2 asset-ingestion fold case ${String(plan.id)}`);
  }
}

function projectAssetRecovery(execution) {
  const loaded = actionActual(execution, 0, 'load-dataset');
  const failed = actionActual(execution, 1, 'resolve-asset');
  const retried = actionActual(execution, 2, 'retry-asset');
  const retryResult = recordValue(retried.result, 'retry result');
  const visual = recordValue(retryResult.visual, 'retry visual');
  const geometry = recordValue(visual.geometry, 'retry geometry');
  const terminal = recordValue(retryResult.observation, 'retry observation');
  const snapshot = recordValue(terminal.snapshot, 'retry snapshot');
  const cleanup = productCleanup(execution);

  return domains({
    scene: {
      targets: {
        'item-a': {
          visible: booleanValue(geometry.visible, 'retry target visibility'),
        },
        'rect-b': {
          normalizedDataHash: stringValue(
            loaded.rectBNormalizedDataHash,
            'rect-b normalized hash',
          ),
        },
      },
    },
    outcome: {
      attempts: [
        { code: nullableString(failed.code, 'failure code') },
        { code: nullableString(retried.code, 'retry code') },
      ],
    },
    resources: {
      pendingWork: nonNegativeInteger(snapshot.pendingWork, 'retry pending work'),
      temporaryTextures: productRuntimeLeakCount(cleanup),
    },
  });
}

function projectDescriptorIdentity(execution) {
  const frozen = actionActual(execution, 0, 'freezeDescriptors');
  const loaded = actionActual(execution, 1, 'loadDescriptors');
  const validation = actionActual(execution, 3, 'validate-asset-descriptor');
  const result = recordValue(loaded.result, 'descriptor load result');
  const entries = recordValue(result.entries, 'descriptor entries');
  const a = descriptorEntry(entries, 'a');
  const equivalent = descriptorEntry(entries, 'a-equivalent');
  const b = descriptorEntry(entries, 'b');
  const input = recordValue(validation.input, 'descriptor validation input');
  const validationResult = recordValue(validation.validation, 'descriptor validation');
  assert(frozen.before === frozen.after, 'frozen descriptor input remains unchanged');
  assert(
    input.beforeFingerprint === input.afterFingerprint,
    'descriptor validation input remains unchanged',
  );
  assert(a.key === equivalent.key, 'equivalent descriptor key');
  assert(a.resource === equivalent.resource, 'equivalent descriptor resource');

  return domains({
    outcome: {
      input: {
        descriptors: clone(input.descriptors),
      },
      validation: {
        cyclic: {
          // The product emits the approved closed-registry code INVALID_VALUE.
          // The independent comparator truthfully records the immutable
          // INVALID_ASSET_DESCRIPTOR expectation as a known conflict.
          code: nullableString(validationResult.code, 'cyclic validation code'),
        },
      },
      recorded: execution.status === 'completed',
    },
    resources: {
      cache: {
        a: clone(a),
        'a-equivalent': clone(equivalent),
        b: clone(b),
        aAndBKeysDistinct: a.key !== b.key,
        distinctResourceCount: nonNegativeInteger(
          result.distinctResourceCount,
          'distinct resource count',
        ),
      },
      assets: {
        pendingCount: nonNegativeInteger(
          recordValue(result.runtime, 'descriptor runtime').pendingCount,
          'descriptor pending count',
        ),
      },
      retainedDelta: cleanupLeakDelta(execution.cleanup),
    },
  });
}

function projectStaleCompletion(execution) {
  const completeB = actionActual(execution, 3, 'completeAssetRequest');
  const destroyed = actionActual(execution, 4, 'destroy');
  const lateA = actionActual(execution, 5, 'completeAssetRequest');
  const before = recordValue(destroyed.before, 'race before destroy');
  const beforeEngine = recordValue(before.engine, 'race before engine');
  const beforeImages = recordValue(
    recordValue(beforeEngine.sceneImages, 'before scene images').images,
    'before images',
  );
  const image = recordValue(beforeImages.image, 'before image');
  const completionEngine = recordValue(completeB.engine, 'B completion engine');
  const snapshot = recordValue(completionEngine.snapshot, 'B completion snapshot');
  const revisions = recordValue(snapshot.revisions, 'B completion revisions');
  const cleanup = productCleanup(execution);
  const backend = recordValue(cleanup.backend, 'asset backend cleanup');
  const records = arrayValue(backend.records, 'asset backend records');
  const requestA = backendLeakForSource(records, 'fixture://a.png');
  const requestB = backendLeakForSource(records, 'fixture://b.png');
  const lateEnginePublished = lateA.engine !== null;

  return domains({
    revisions: {
      lifecycle: {
        generation: finiteNumber(
          revisions.lifecycleGeneration,
          'lifecycle generation',
        ),
      },
      frame: {
        revision: finiteNumber(snapshot.frameRevision, 'frame revision'),
      },
    },
    resources: {
      beforeDestroy: {
        image: {
          source: stringValue(image.authoredSource, 'before image source'),
        },
      },
      afterDestroy: {
        staleAttachments: Number(lateEnginePublished),
        falseSuccessEvents: Number(lateEnginePublished),
        frames: Number(lateEnginePublished),
      },
      requestA,
      requestB,
      assets: {
        pendingCount: nonNegativeInteger(
          recordValue(cleanup.assetRuntime, 'asset runtime cleanup').pendingCount,
          'asset pending count',
        ),
      },
    },
  });
}

function projectSecurityPolicy(execution) {
  const result = actionActual(
    execution,
    0,
    'run-asset-ingestion-policy-matrix',
  );
  const matrix = recordValue(result.matrix, 'security matrix');
  assert(
    result.unrelatedSemanticHash === result.afterHash,
    'security matrix leaves unrelated scene unchanged',
  );
  return domains({
    scene: {
      unrelatedSemanticHash: stringValue(
        result.afterHash,
        'security unrelated semantic hash',
      ),
    },
    outcome: {
      allowed: cloneRecord(matrix.allowed, 'security allowed result'),
      rejected: cloneRecord(matrix.rejected, 'security rejected result'),
    },
    resources: {
      leakDelta: cleanupLeakDelta(execution.cleanup),
    },
  });
}

function projectHostClipboard(execution) {
  actionActual(execution, 0, 'paste-external-text');
  const finalAction = actionActual(execution, 4, 'probe-declared-failure');
  const final = recordValue(finalAction.final, 'clipboard final observation');
  const failedProduct = recordValue(finalAction.result, 'clipboard failure product');
  const failed = recordValue(failedProduct.result, 'clipboard failure result');
  const rollback = recordValue(finalAction.rollback, 'clipboard rollback');
  const dataset = arrayValue(final.dataset, 'clipboard final dataset');
  const textElement = findDatasetRecordByType(dataset, 'text');
  const textId = stringValue(textElement.id, 'created text ID');
  const selectionIds = stringArray(final.selectionIds, 'clipboard selection IDs');
  const createdImageIds = stringArray(
    finalAction.createdImageIds,
    'clipboard created image IDs',
  );
  const ignoredOutsideDropCount = nonNegativeInteger(
    finalAction.ignoredOutsideDropCount,
    'ignored outside drop count',
  );
  const probe = recordValue(failed.probe, 'clipboard failure probe');
  const mode = stringValue(final.mode, 'clipboard final mode');
  const sourceText = stringValue(textElement.text, 'clipboard source text');

  return domains({
    text: {
      targets: {
        [textId]: { source: sourceText },
      },
    },
    outcome: {
      createdImageIds,
      ignoredOutsideDropCount,
      hostEngineSeam: {
        engineReturns: {
          createdTextId: textId,
          createdImageIds,
          ignoredOutsideDropCount,
        },
        failureRollback: clone(rollback),
        finalState: {
          selectedIds: selectionIds,
          mode,
          sourceText,
        },
      },
    },
    resources: {
      failedAssetTemporaryResources: nonNegativeInteger(
        probe.failedAssetTemporaryResources,
        'failed asset temporary resources',
      ),
    },
  });
}

function domains(overrides) {
  return {
    revisions: {},
    scene: {},
    geometry: {},
    text: {},
    paint: {},
    interaction: {},
    events: {},
    history: {},
    outcome: {},
    resources: {},
    ...overrides,
  };
}

function terminalProductObservation(execution) {
  for (let index = execution.actionResults.length - 1; index >= 0; index -= 1) {
    const actual = recordValue(
      recordValue(execution.actionResults[index].delta, `action ${index} delta`).actual,
      `action ${index} actual`,
    );
    for (const candidate of [
      actual.final,
      actual.observation,
      isRecord(actual.result) ? actual.result.observation : null,
      isRecord(actual.engine) ? actual.engine : null,
    ]) {
      if (
        isRecord(candidate)
        && isRecord(candidate.snapshot)
        && isRecord(candidate.semantic)
      ) {
        return candidate;
      }
    }
  }
  return null;
}

function validateOptions(value) {
  const options = recordValue(value, 'fold options');
  for (const key of ['casePlan', 'environment', 'execution', 'provenance']) {
    assert(Object.hasOwn(options, key), `fold option ${key}`);
  }
  assert(!Object.hasOwn(options, 'expected'), 'fold excludes expected evidence');
  return options;
}

function validatePlan(value) {
  const plan = recordValue(value, 'case plan');
  assert(typeof plan.id === 'string' && CASE_IDS.has(plan.id), 'asset-ingestion case ID');
  assert(
    plan.caseType === 'capability' || plan.caseType === 'consumer-journey',
    'case type',
  );
  assert(typeof plan.route === 'string' && plan.route.length > 0, 'case route');
  assert(typeof plan.rootTestId === 'string' && plan.rootTestId.length > 0, 'root test ID');
  const fixture = recordValue(plan.fixture, 'case fixture');
  const setup = recordValue(fixture.setup, 'fixture setup');
  recordValue(setup.params, 'fixture params');
  assert(Array.isArray(plan.actionTrace), 'plan action trace');
  assert(Array.isArray(fixture.actionTrace), 'fixture action trace');
  assert(sameJson(plan.actionTrace, fixture.actionTrace), 'materialized action trace');
  const expectedTypes = CASE_ACTIONS[plan.id];
  assert(plan.actionTrace.length === expectedTypes.length, 'action count');
  plan.actionTrace.forEach((actionValue, index) => {
    const action = recordValue(actionValue, `action ${index}`);
    assert(action.index === index, `action ${index} index`);
    assert(action.type === expectedTypes[index], `action ${index} type`);
    recordValue(action.operands, `action ${index} operands`);
  });
  return plan;
}

function validateExecution(value, plan) {
  const execution = recordValue(value, 'execution');
  assert(execution.$schema === EXECUTION_REVISION, 'execution revision');
  assert(execution.caseId === plan.id, 'execution case identity');
  assert(execution.caseType === plan.caseType, 'execution case type');
  assert(execution.status === 'completed' && execution.error === null, 'execution completion');
  assert(Array.isArray(execution.actionResults), 'execution action results');
  assert(execution.actionResults.length === CASE_ACTIONS[plan.id].length, 'result count');
  execution.actionResults.forEach((resultValue, index) => {
    const result = recordValue(resultValue, `result ${index}`);
    assert(result.index === index, `result ${index} index`);
    assert(result.type === CASE_ACTIONS[plan.id][index], `result ${index} type`);
    assert(result.handlerId === `contract/${result.type}`, `result ${index} handler`);
    assert(result.status === 'completed', `result ${index} status`);
    const delta = recordValue(result.delta, `result ${index} delta`);
    assert(delta.caseId === plan.id, `result ${index} delta case`);
    assert(delta.actionIndex === index, `result ${index} delta index`);
    recordValue(delta.actual, `result ${index} actual`);
  });
  assert(Array.isArray(execution.eventJournal), 'execution event journal');
  assert(
    Array.isArray(execution.eventJournalFailures)
      && execution.eventJournalFailures.length === 0,
    'execution event journal failures',
  );
  assert(Array.isArray(execution.captures), 'execution captures');
  const cleanup = recordValue(execution.cleanup, 'execution cleanup');
  assert(cleanup.status === 'completed', 'cleanup completed');
  assert(Array.isArray(cleanup.errors) && cleanup.errors.length === 0, 'cleanup errors');
  productCleanup(execution);
  return execution;
}

function actionActual(execution, index, type) {
  const result = recordValue(execution.actionResults[index], `action ${index}`);
  assert(result.type === type, `action ${index} type`);
  return recordValue(
    recordValue(result.delta, `action ${index} delta`).actual,
    `action ${index} actual`,
  );
}

function productCleanup(execution) {
  return recordValue(
    recordValue(execution.cleanup, 'execution cleanup').productResources,
    'product cleanup',
  );
}

function descriptorEntry(entries, id) {
  const entry = recordValue(entries[id], `descriptor ${id}`);
  return {
    key: stringValue(entry.key, `${id} key`),
    resource: stringValue(entry.resource, `${id} resource`),
  };
}

function backendLeakForSource(records, source) {
  const matching = records
    .map((value, index) => recordValue(value, `backend record ${index}`))
    .filter((record) => record.source === source);
  assert(matching.length === 1, `${source} backend record`);
  return Number(matching[0].state !== 'unloaded');
}

function productRuntimeLeakCount(cleanup) {
  const runtime = recordValue(cleanup.assetRuntime, 'asset runtime cleanup');
  return [
    'resourceCount',
    'pendingCount',
    'leaseCount',
    'cleanupPendingCount',
  ].reduce(
    (total, key) => total + nonNegativeInteger(runtime[key], `asset runtime ${key}`),
    0,
  );
}

function cleanupLeakDelta(value) {
  const cleanup = recordValue(value, 'cleanup');
  let total = cleanup.status === 'completed' ? 0 : 1;
  for (const releaseValue of arrayValue(cleanup.releases, 'cleanup releases')) {
    const release = recordValue(releaseValue, 'cleanup release');
    const remaining = recordValue(release.remainingResources, 'remaining resources');
    for (const key of ['canvasCount', 'subscriptions', 'pendingWork']) {
      total += nonNegativeInteger(remaining[key], `remaining ${key}`);
    }
  }
  total += productRuntimeLeakCount(recordValue(cleanup.productResources, 'product cleanup'));
  const backend = recordValue(
    recordValue(cleanup.productResources, 'product cleanup').backend,
    'backend cleanup',
  );
  total += nonNegativeInteger(backend.pendingCount, 'backend pending count');
  return total;
}

function invalidNodeCount(scene) {
  const nodes = arrayValue(scene.nodes, 'semantic nodes');
  const identities = new Set();
  let invalid = 0;
  for (const nodeValue of nodes) {
    if (!isRecord(nodeValue) || !isRecord(nodeValue.target)) {
      invalid += 1;
      continue;
    }
    const target = nodeValue.target;
    if (
      (target.kind !== 'element' && target.kind !== 'component')
      || typeof target.id !== 'string'
      || target.id.length === 0
      || (
        target.kind === 'component'
        && (typeof target.ownerId !== 'string' || target.ownerId.length === 0)
      )
    ) {
      invalid += 1;
      continue;
    }
    const identity = target.kind === 'element'
      ? `element:${target.id}`
      : `component:${target.ownerId}:${target.id}`;
    if (identities.has(identity)) invalid += 1;
    identities.add(identity);
  }
  return invalid;
}

function unclassifiedEventCount(execution) {
  return execution.eventJournal.filter(({ event }) =>
    typeof event !== 'string' || !CLASSIFIED_ENGINE_EVENTS.has(event)).length;
}

function findDatasetRecordByType(dataset, type) {
  let found = null;
  const visit = (entries) => {
    for (const entryValue of entries) {
      if (!isRecord(entryValue)) continue;
      if (entryValue.type === type && found === null) found = entryValue;
      if (Array.isArray(entryValue.children)) visit(entryValue.children);
      if (Array.isArray(entryValue.elements)) visit(entryValue.elements);
      if (Array.isArray(entryValue.items)) visit(entryValue.items);
    }
  };
  visit(dataset);
  assert(found !== null, `dataset ${type} record`);
  return found;
}

function projectCaptures(plan, execution) {
  const declared = new Map(
    arrayValue(plan.fixture.captureCheckpoints, 'fixture capture checkpoints')
      .map((checkpointValue) => {
        const checkpoint = recordValue(checkpointValue, 'fixture capture checkpoint');
        return [stringValue(checkpoint.id, 'fixture capture ID'), checkpoint];
      }),
  );
  const captures = {};
  for (const captureValue of execution.captures) {
    const capture = recordValue(captureValue, 'capture');
    const id = stringValue(capture.id, 'capture ID');
    const checkpoint = declared.get(id);
    assert(checkpoint !== undefined, `declared capture ${id}`);
    const values = recordValue(capture.values, 'capture values');
    const projected = {};
    for (const path of arrayValue(checkpoint.paths, `${id} capture paths`)) {
      const normalized = stringValue(path, `${id} capture path`);
      assert(Object.hasOwn(values, normalized), `${id} capture value ${normalized}`);
      assignPath(projected, normalized.split('/'), clone(values[normalized]), id);
    }
    captures[id] = projected;
  }
  assert(Object.keys(captures).length === declared.size, 'all captures projected');
  return captures;
}

function assignPath(target, segments, value, label) {
  let cursor = target;
  segments.forEach((segment, index) => {
    assert(segment.length > 0, `${label} non-empty capture path`);
    if (index === segments.length - 1) {
      assert(!Object.hasOwn(cursor, segment), `${label} capture collision ${segment}`);
      cursor[segment] = value;
      return;
    }
    if (!Object.hasOwn(cursor, segment)) cursor[segment] = {};
    cursor = recordValue(cursor[segment], `${label} capture segment ${segment}`);
  });
}

function notExercised(reason) {
  return {
    _availability: {
      status: 'not-exercised',
      reason,
    },
  };
}

function allFiniteNumbers(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(allFiniteNumbers);
  if (isRecord(value)) return Object.values(value).every(allFiniteNumbers);
  return true;
}

function validateJson(value, label, seen) {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) return;
  if (typeof value === 'number') {
    assert(Number.isFinite(value), `${label} finite number`);
    return;
  }
  assert(typeof value === 'object', `${label} JSON value`);
  assert(!seen.has(value), `${label} acyclic`);
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateJson(entry, `${label}[${index}]`, seen));
  } else {
    Object.entries(value).forEach(([key, entry]) => {
      assert(entry !== undefined, `${label}.${key} defined`);
      validateJson(entry, `${label}.${key}`, seen);
    });
  }
  seen.delete(value);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cloneRecord(value, label) {
  return clone(recordValue(value, label));
}

function clone(value) {
  return structuredClone(value);
}

function nullableString(value, label) {
  if (value === null) return null;
  return stringValue(value, label);
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} string`);
  return value;
}

function booleanValue(value, label) {
  assert(typeof value === 'boolean', `${label} boolean`);
  return value;
}

function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} finite`);
  return value;
}

function nonNegativeInteger(value, label) {
  assert(Number.isInteger(value) && value >= 0, `${label} non-negative integer`);
  return value;
}

function stringArray(value, label) {
  return arrayValue(value, label).map((entry, index) =>
    stringValue(entry, `${label}[${index}]`));
}

function arrayValue(value, label) {
  assert(Array.isArray(value), `${label} array`);
  return value;
}

function recordValue(value, label) {
  assert(isRecord(value), `${label} object`);
  return value;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Invalid Core v2 asset-ingestion fold: ${message}`);
  }
}
