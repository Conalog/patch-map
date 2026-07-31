import { clone, deepFreeze, createTypeSuffixValueAtoms } from './value-atoms.mjs';

const {
  recordValue,
  arrayValue,
  stringValue,
  booleanValue,
  finiteNumber,
} = createTypeSuffixValueAtoms(assert);

export const AUTHORING_FOLD_REVISION = 'core-v2-authoring-fold/1';

const OBSERVATION_REVISION = 'core-v2-semantic-observation/1';
const EXECUTION_REVISION = 'core-v2-contract-case-execution/1';
const CASE_IDS = new Set([
  'CSM-019',
  'CSM-028',
  'CSM-029',
  'CSM-030',
  'CSM-031',
]);
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

/** Fold five expected-blind authoring executions into actual-only evidence. */
export function foldAuthoringExecution(optionsValue) {
  const options = validateOptions(optionsValue);
  const plan = validatePlan(options.casePlan);
  const execution = validateExecution(options.execution, plan);
  const snapshot = recordValue(execution.terminalSnapshot, 'terminal snapshot');
  const semantic = recordValue(execution.terminalSemanticProbe, 'terminal semantic');
  const semanticScene = recordValue(semantic.scene, 'semantic scene');
  const semanticGeometry = recordValue(semantic.geometry, 'semantic geometry');
  const semanticText = recordValue(semantic.text, 'semantic text');
  const semanticPaint = recordValue(semantic.paint, 'semantic paint');
  const semanticInteraction = recordValue(semantic.interaction, 'semantic interaction');
  const semanticHistory = recordValue(semantic.history, 'semantic history');
  const projected = projectCase(plan.id, execution);

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
      _availability: { publicProductProbes: 'available' },
      ...cloneRecord(snapshot.revisions, 'snapshot revisions'),
      frameRevision: finiteNumber(snapshot.frameRevision, 'frame revision'),
      valuesFinite: allFiniteNumbers(snapshot.revisions),
      ...projected.revisions,
    },
    scene: {
      _availability: { semanticProbe: 'available' },
      invalidNodeCount: invalidNodeCount(semanticScene),
      ...projected.scene,
    },
    geometry: {
      _availability: { semanticProbe: 'available' },
      nonFiniteCount: nonNegativeInteger(
        semanticGeometry.nonFiniteValueCount,
        'semantic non-finite count',
      ),
      ...projected.geometry,
    },
    text: {
      _availability: { semanticProbe: 'available' },
      unpairedSurrogates: nonNegativeInteger(
        semanticText.unpairedSurrogateCount,
        'semantic unpaired surrogate count',
      ),
      ...projected.text,
    },
    paint: {
      _availability: { semanticProbe: 'available' },
      unresolvedIntentCount: nonNegativeInteger(
        semanticPaint.unresolvedCount,
        'semantic unresolved paint count',
      ),
      ...projected.paint,
    },
    interaction: {
      _availability: { publicProductProbes: 'available' },
      staleGestureCount: nonNegativeInteger(
        semanticInteraction.activeGestureCount ?? 0,
        'semantic active gesture count',
      ),
      ...projected.interaction,
    },
    events: {
      _availability: { executorJournal: 'available' },
      unclassifiedCount: unclassifiedEventCount(execution),
      journal: clone(execution.eventJournal),
      ...projected.events,
    },
    history: {
      _availability: { semanticProbe: 'available' },
      corruptEntryCount: nonNegativeInteger(
        semanticHistory.corruptCount ?? 0,
        'history corrupt count',
      ),
      ...projected.history,
    },
    accessibility: notExercised(
      'authoring-accessibility-is-owned-by-the-accessibility-tranche',
    ),
    outcome: {
      _availability: { actualActionResults: 'available' },
      unclassifiedErrorCount: execution.actionResults.filter(
        ({ status }) => status !== 'completed',
      ).length,
      actionResults: execution.actionResults.map(({ index, type, status }) => ({
        index,
        type,
        status,
      })),
      ...projected.outcome,
    },
    resources: {
      _availability: { executorCleanup: 'available' },
      leakDelta: cleanupLeakDelta(execution.cleanup),
      cleanup: cloneRecord(execution.cleanup, 'execution cleanup'),
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
    captures: projectCaptures(execution),
  });
}

function projectCase(caseId, execution) {
  switch (caseId) {
    case 'CSM-019':
      return projectCreateMatrix(execution);
    case 'CSM-028':
      return projectPositionDistribution(execution);
    case 'CSM-029':
      return projectStyle(execution);
    case 'CSM-030':
      return projectHierarchy(execution);
    case 'CSM-031':
      return projectDuplicate(execution);
    default:
      throw new Error(`Unsupported Core v2 authoring fold case ${String(caseId)}`);
  }
}

function projectCreateMatrix(execution) {
  const matrix = actionActual(execution, 0, 'create-element-matrix');
  const failure = actionActual(execution, 1, 'probe-declared-failure');
  const createdIds = stringArray(matrix.createdIds, 'created IDs');
  const after = productValue(matrix.after, 'create matrix after');
  const rollback = recordValue(failure.rollback, 'create rollback');
  const selectedIds = productSelection(after, 'create final selection');
  const depth = productHistoryDepth(after, 'create final history');
  const mode = productMode(after, 'create final mode');
  return domains({
    interaction: { selectedTargets: selectedIds },
    history: { depth },
    outcome: {
      createdIds,
      uniqueIdCount: new Set(createdIds).size,
      hostEngineSeam: {
        engineReturns: {
          createdIds,
          selectedIds,
          historyDepthDelta: nonNegativeInteger(
            matrix.historyDepthDelta,
            'create history delta',
          ),
        },
        failureRollback: {
          transactionAtomicPerElement: booleanValue(
            rollback.atomic,
            'create atomic rollback',
          ),
          duplicateIdCode: nullableString(
            rollback.code,
            'create duplicate code',
          ),
          failedCreateSelectionUnchanged: booleanValue(
            rollback.selectionUnchanged,
            'create selection rollback',
          ),
        },
        finalState: {
          mode,
          selectedIds,
          createdCount: createdIds.length,
          historyDepth: depth,
        },
      },
    },
  });
}

function projectPositionDistribution(execution) {
  const edit = actionActual(execution, 0, 'edit-position-angle');
  const first = actionActual(execution, 2, 'distribute-targets');
  const second = actionActual(execution, 3, 'distribute-targets');
  const failure = actionActual(execution, 4, 'probe-declared-failure');
  const finalProduct = productValue(failure.after, 'distribution final product');
  const firstDigest = resultFact(first.result, 'distributionDigest', 'first distribution');
  const secondDigest = resultFact(second.result, 'distributionDigest', 'second distribution');
  const rollback = recordValue(failure.rollback, 'distribution rollback');
  const record = datasetRecord(finalProduct, 'rect-b');
  const attrs = recordValue(record.attrs, 'rect-b attrs');
  const historyDelta =
    productHistoryDepth(finalProduct, 'distribution final history')
    - productHistoryDepth(edit.before, 'distribution initial history');
  const selectedIds = productSelection(finalProduct, 'distribution selection');
  const mode = productMode(finalProduct, 'distribution mode');
  const idempotent =
    recordValue(second.result, 'second distribution result').status === 'unchanged'
    && firstDigest === secondDigest;
  return domains({
    geometry: {
      targets: {
        'rect-b': {
          rotationDegrees: finiteNumber(
            attrs.angle ?? attrs.rotation ?? 0,
            'rect-b authored angle',
          ),
        },
      },
      distributionHash: [firstDigest, secondDigest],
    },
    history: { depthDelta: historyDelta },
    outcome: {
      hostEngineSeam: {
        engineReturns: {
          firstDistributionHash: firstDigest,
          secondDistributionHash: secondDigest,
          historyDepthDelta: historyDelta,
        },
        failureRollback: {
          fewerThanThreeDistributionCode: nullableString(
            rollback.code,
            'distribution failure code',
          ),
          strictAtomic: booleanValue(rollback.atomic, 'distribution atomicity'),
        },
        finalState: {
          selectedIds,
          mode,
          idempotent,
        },
      },
    },
  });
}

function projectStyle(execution) {
  const valid = actionActual(execution, 0, 'apply-style-transaction');
  const invalid = actionActual(execution, 1, 'apply-style-transaction');
  const failure = actionActual(execution, 2, 'probe-declared-failure');
  const validAfter = productValue(valid.after, 'valid style product');
  const invalidAfter = productValue(invalid.after, 'invalid style product');
  const invalidResult = recordValue(invalid.result, 'invalid style result');
  const invalidDiagnostic = recordValue(
    invalidResult.diagnostic,
    'invalid style diagnostic',
  );
  const canonicalStyle = cloneRecord(invalid.canonicalStyle, 'canonical style');
  const rollback = recordValue(failure.rollback, 'style rollback');
  const validHash = productSemanticHash(validAfter, 'valid style hash');
  const afterInvalidHash = productSemanticHash(
    invalidAfter,
    'invalid style hash',
  );
  const selectedIds = productSelection(invalidAfter, 'style selection');
  const mode = productMode(invalidAfter, 'style mode');
  const invalidPath = stringArray(invalidDiagnostic.path, 'invalid style path');
  const invalidCode = nullableString(invalidResult.code, 'invalid style code');
  return domains({
    scene: {
      validStyleHash: validHash,
      targets: {
        'text-c': {
          semanticHashAfterInvalid: afterInvalidHash,
        },
      },
    },
    paint: {
      targets: {
        'text-c': {
          fill: stringValue(canonicalStyle.fill, 'canonical fill'),
          stroke: stringValue(canonicalStyle.stroke, 'canonical stroke'),
        },
      },
    },
    outcome: {
      invalid: { code: invalidCode },
      hostEngineSeam: {
        engineReturns: {
          applied: recordValue(valid.result, 'valid style result').status === 'committed'
            ? ['text-c']
            : [],
          invalidCode,
          invalidPath,
        },
        failureRollback: {
          invalidTransactionAtomic: booleanValue(
            rollback.atomic,
            'invalid style atomicity',
          ),
          validStyleRetained:
            booleanValue(
              rollback.semanticHashUnchanged,
              'valid style semantic rollback',
            )
            && validHash === afterInvalidHash,
          historyDepthDeltaOnFailure: nonNegativeInteger(
            rollback.historyDepthDelta,
            'invalid style history delta',
          ),
        },
        finalState: {
          selectedIds,
          mode,
          style: {
            alpha: finiteNumber(canonicalStyle.alpha, 'style alpha'),
            fill: stringValue(canonicalStyle.fill, 'style fill'),
            stroke: stringValue(canonicalStyle.stroke, 'style stroke'),
            strokeWidth: finiteNumber(
              canonicalStyle.strokeWidth,
              'style stroke width',
            ),
            fontSize: finiteNumber(canonicalStyle.fontSize, 'style font size'),
          },
        },
      },
    },
  });
}

function projectHierarchy(execution) {
  const move = actionActual(execution, 0, 'move-hierarchy');
  const reorder = actionActual(execution, 1, 'reorder-z');
  const cycle = actionActual(execution, 2, 'move-hierarchy');
  const failure = actionActual(execution, 3, 'probe-declared-failure');
  const finalProduct = productValue(failure.after, 'hierarchy final product');
  const rollback = recordValue(failure.rollback, 'hierarchy rollback');
  const finalParent = productParentId(finalProduct, 'rect-b');
  const orderedTargets = productRootIds(finalProduct, 'hierarchy root IDs');
  const orderedIds = resultStringArray(
    reorder.result,
    'orderedIds',
    'z-order facts',
  );
  const cycleResult = recordValue(cycle.result, 'cycle result');
  const moveResult = recordValue(move.result, 'hierarchy move result');
  const moveCommitted = moveResult.status === 'committed';
  const selectedIds = productSelection(finalProduct, 'hierarchy selection');
  const mode = productMode(finalProduct, 'hierarchy mode');
  return domains({
    scene: {
      targets: {
        'rect-b': { parentId: finalParent },
      },
      orderedTargets,
    },
    interaction: { selectedTargets: selectedIds },
    outcome: {
      cycle: {
        code: nullableString(cycleResult.code, 'cycle code'),
      },
      hostEngineSeam: {
        engineReturns: {
          movedTarget: moveCommitted
            ? nullableString(
                recordValue(moveResult.facts, 'move facts').movedTarget,
                'moved target',
              )
            : null,
          parentId: moveCommitted ? finalParent : null,
          orderedIds,
          cycleCode: nullableString(cycleResult.code, 'cycle seam code'),
        },
        failureRollback: {
          cycleTransactionAtomic: booleanValue(
            rollback.atomic,
            'cycle atomicity',
          ),
          selectionRestoredById: selectedIds,
          priorHierarchyRetainedOnFailure:
            rollback.parentBefore === rollback.parentAfter,
        },
        finalState: {
          selectedIds,
          mode,
          parentById: { 'rect-b': finalParent },
        },
      },
    },
  });
}

function projectDuplicate(execution) {
  const group = actionActual(execution, 0, 'group-targets');
  const duplicate = actionActual(execution, 1, 'duplicate-tree');
  const paste = actionActual(execution, 2, 'copy-paste-tree');
  const ungroup = actionActual(execution, 3, 'ungroup-target');
  const failure = actionActual(execution, 4, 'probe-declared-failure');
  const finalProduct = productValue(failure.after, 'duplicate final product');
  const rollback = recordValue(failure.rollback, 'duplicate rollback');
  const groupId = resultFact(group.result, 'groupId', 'group result');
  const duplicateRootIds = [
    resultFact(duplicate.result, 'rootId', 'duplicate result'),
    resultFact(paste.result, 'rootId', 'paste result'),
  ];
  const allIds = datasetIds(
    recordValue(ungroup.after, 'ungroup product').dataset,
  );
  const uniqueIds = new Set(allIds).size === allIds.length;
  const internalReferencesRewritten = [duplicate, paste].every((actual) =>
    resultBooleanFact(
      actual.result,
      'internalReferencesRewritten',
      'duplicate internal references',
    ));
  const externalReferencesPreserved = [duplicate, paste].every((actual) =>
    resultBooleanFact(
      actual.result,
      'externalReferencesPreserved',
      'duplicate external references',
    ));
  const historyDelta =
    productHistoryDepth(finalProduct, 'duplicate final history')
    - productHistoryDepth(group.before, 'duplicate initial history');
  const selectedIds = productSelection(finalProduct, 'duplicate selection');
  const mode = productMode(finalProduct, 'duplicate mode');
  return domains({
    interaction: { selectedTargets: selectedIds },
    outcome: {
      duplicateRootIds,
      uniqueIds,
      internalReferencesRewritten,
      externalReferencesPreserved,
      hostEngineSeam: {
        engineReturns: {
          groupId,
          duplicateRootIds,
          uniqueIds,
          internalReferencesRewritten,
          externalReferencesPreserved,
          historyDepthDelta: historyDelta,
        },
        failureRollback: {
          duplicateIdCode: nullableString(
            rollback.code,
            'duplicate failure code',
          ),
          transactionAtomic: booleanValue(
            rollback.atomic,
            'duplicate atomicity',
          ),
          worldGeometryRetainedOnGroupFailure: booleanValue(
            rollback.geometryUnchanged,
            'duplicate geometry rollback',
          ),
        },
        finalState: {
          selectedIds,
          mode,
          historyDepthDelta: historyDelta,
        },
      },
    },
  });
}

function domains(value) {
  return {
    revisions: value.revisions ?? {},
    scene: value.scene ?? {},
    geometry: value.geometry ?? {},
    text: value.text ?? {},
    paint: value.paint ?? {},
    interaction: value.interaction ?? {},
    events: value.events ?? {},
    history: value.history ?? {},
    outcome: value.outcome ?? {},
    resources: value.resources ?? {},
  };
}

function actionActual(execution, index, type) {
  const result = execution.actionResults[index];
  assert(isRecord(result), `action ${index} result`);
  assert(result.index === index, `action ${index} index`);
  assert(result.type === type, `action ${index} type`);
  assert(result.status === 'completed', `action ${index} completion`);
  const delta = recordValue(result.delta, `action ${index} delta`);
  return recordValue(delta.actual, `action ${index} actual`);
}

function productValue(value, label) {
  const product = recordValue(value, label);
  recordValue(product.snapshot, `${label} snapshot`);
  recordValue(product.semantic, `${label} semantic`);
  assert(Array.isArray(product.dataset), `${label} dataset`);
  return product;
}

function productSelection(product, label) {
  return stringArray(
    recordValue(product.snapshot, `${label} snapshot`).selectionIds,
    label,
  );
}

function productHistoryDepth(productValue, label) {
  const product = recordValue(productValue, label);
  return nonNegativeInteger(
    recordValue(product.snapshot, `${label} snapshot`).historyDepth,
    label,
  );
}

function productMode(product, label) {
  const semantic = recordValue(product.semantic, `${label} semantic`);
  const interaction = recordValue(semantic.interaction, `${label} interaction`);
  return stringValue(interaction.mode, label);
}

function productSemanticHash(product, label) {
  const snapshot = recordValue(product.snapshot, `${label} snapshot`);
  return stringValue(snapshot.semanticHash, label);
}

function productRootIds(product, label) {
  return stringArray(
    recordValue(product.snapshot, `${label} snapshot`).rootIds,
    label,
  );
}

function productParentId(product, targetId) {
  const semantic = recordValue(product.semantic, 'parent semantic');
  const scene = recordValue(semantic.scene, 'parent semantic scene');
  const nodes = arrayValue(scene.nodes, 'parent semantic nodes');
  const node = nodes.find((entry) =>
    isRecord(entry)
      && isRecord(entry.target)
      && entry.target.kind === 'element'
      && entry.target.id === targetId);
  assert(isRecord(node), `parent target ${targetId}`);
  if (node.parent === null) return null;
  const parent = recordValue(node.parent, `${targetId} parent`);
  return stringValue(parent.id, `${targetId} parent ID`);
}

function datasetRecord(product, id) {
  const dataset = arrayValue(product.dataset, 'product dataset');
  const found = findDatasetRecord(dataset, id);
  assert(found !== null, `dataset record ${id}`);
  return found;
}

function findDatasetRecord(records, id) {
  for (const entry of records) {
    if (!isRecord(entry)) continue;
    if (entry.id === id) return entry;
    if (Array.isArray(entry.children)) {
      const nested = findDatasetRecord(entry.children, id);
      if (nested !== null) return nested;
    }
  }
  return null;
}

function datasetIds(datasetValue) {
  const dataset = arrayValue(datasetValue, 'dataset IDs');
  return dataset.flatMap((entry) => {
    const record = recordValue(entry, 'dataset ID record');
    return [
      stringValue(record.id, 'dataset element ID'),
      ...(Array.isArray(record.children) ? datasetIds(record.children) : []),
    ];
  });
}

function resultFact(resultValue, key, label) {
  const result = recordValue(resultValue, label);
  const facts = recordValue(result.facts, `${label} facts`);
  return stringValue(facts[key], `${label} ${key}`);
}

function resultStringArray(resultValue, key, label) {
  const result = recordValue(resultValue, label);
  const facts = recordValue(result.facts, `${label} facts`);
  return stringArray(facts[key], `${label} ${key}`);
}

function resultBooleanFact(resultValue, key, label) {
  const result = recordValue(resultValue, label);
  const facts = recordValue(result.facts, `${label} facts`);
  return booleanValue(facts[key], `${label} ${key}`);
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
    const kind = target.kind;
    const id = target.id;
    const ownerId = target.ownerId;
    if (
      (kind !== 'element' && kind !== 'component')
      || typeof id !== 'string'
      || id.length === 0
      || (kind === 'component' && (typeof ownerId !== 'string' || ownerId.length === 0))
    ) {
      invalid += 1;
      continue;
    }
    const identity = kind === 'element'
      ? `element:${id}`
      : `component:${ownerId}:${id}`;
    if (identities.has(identity)) invalid += 1;
    identities.add(identity);
  }
  return invalid;
}

function unclassifiedEventCount(execution) {
  return execution.eventJournal.filter(({ event }) =>
    typeof event !== 'string' || !CLASSIFIED_ENGINE_EVENTS.has(event)).length;
}

function cleanupLeakDelta(cleanupValue) {
  const cleanup = recordValue(cleanupValue, 'execution cleanup');
  let total = cleanup.status === 'completed' ? 0 : 1;
  const releases = Array.isArray(cleanup.releases) ? cleanup.releases : [];
  for (const release of releases) {
    if (!isRecord(release) || !isRecord(release.remainingResources)) {
      total += 1;
      continue;
    }
    total += resourceCount(release.remainingResources.canvasCount);
    total += resourceCount(release.remainingResources.subscriptions);
    total += resourceCount(release.remainingResources.pendingWork);
  }
  if (isRecord(cleanup.productResources)) {
    const counts = cleanup.productResources.runtimeCounts;
    if (isRecord(counts)) {
      total += Object.values(counts).reduce(
        (sum, value) => sum + resourceCount(value),
        0,
      );
    } else {
      total += 1;
    }
  }
  return total;
}

function resourceCount(value) {
  return Number.isInteger(value) && value >= 0 ? value : 1;
}

function allFiniteNumbers(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(allFiniteNumbers);
  if (isRecord(value)) return Object.values(value).every(allFiniteNumbers);
  return true;
}

function projectCaptures(execution) {
  const captures = {};
  for (const captureValue of execution.captures) {
    const capture = recordValue(captureValue, 'capture');
    captures[stringValue(capture.id, 'capture ID')] = clone(capture.values);
  }
  return captures;
}

function notExercised(reason) {
  return {
    _availability: {
      status: 'not-exercised',
      reason,
    },
  };
}

function validateOptions(value) {
  const options = recordValue(value, 'fold options');
  for (const key of ['casePlan', 'environment', 'execution', 'provenance']) {
    assert(Object.hasOwn(options, key), `fold option ${key}`);
  }
  return options;
}

function validatePlan(value) {
  const plan = recordValue(value, 'case plan');
  assert(typeof plan.id === 'string' && CASE_IDS.has(plan.id), 'authoring case ID');
  assert(plan.caseType === 'consumer-journey', 'authoring consumer journey');
  assert(typeof plan.route === 'string' && plan.route.length > 0, 'case route');
  assert(typeof plan.rootTestId === 'string' && plan.rootTestId.length > 0, 'root test ID');
  assert(isRecord(plan.fixture), 'case fixture');
  assert(isRecord(plan.fixture.setup), 'fixture setup');
  assert(isRecord(plan.fixture.setup.params), 'fixture params');
  assert(!Object.hasOwn(plan, 'expected'), 'fold plan excludes expected evidence');
  return plan;
}

function validateExecution(value, plan) {
  const execution = recordValue(value, 'execution');
  assert(execution.$schema === EXECUTION_REVISION, 'execution revision');
  assert(execution.caseId === plan.id, 'execution case identity');
  assert(execution.status === 'completed', 'execution completion');
  assert(Array.isArray(execution.actionResults), 'execution action results');
  assert(Array.isArray(execution.eventJournal), 'execution event journal');
  assert(Array.isArray(execution.captures), 'execution captures');
  assert(isRecord(execution.cleanup), 'execution cleanup');
  return execution;
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

function cloneRecord(value, label) {
  return clone(recordValue(value, label));
}

function stringArray(value, label) {
  return arrayValue(value, label).map((entry, index) =>
    stringValue(entry, `${label}[${index}]`));
}

function nullableString(value, label) {
  if (value === null) return null;
  return stringValue(value, label);
}




function nonNegativeInteger(value, label) {
  assert(Number.isInteger(value) && value >= 0, `${label} non-negative integer`);
  return value;
}



function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Invalid Core v2 authoring fold: ${message}`);
}
