export const HISTORY_FOLD_REVISION = 'core-v2-history-fold/1';

const OBSERVATION_REVISION = 'core-v2-semantic-observation/1';
const EXECUTION_REVISION = 'core-v2-contract-case-execution/1';
const CASE_IDS = Object.freeze([
  'HIS-001',
  'HIS-002',
  'HIS-003',
  'HIS-004',
  'HIS-005',
  'HIS-006',
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

/** Fold six expected-blind product executions into the canonical observation shape. */
export function foldHistoryExecution(options) {
  const input = validateOptions(options);
  const plan = validatePlan(input.casePlan);
  const execution = validateExecution(input.execution, plan);
  const terminalSnapshot = recordValue(execution.terminalSnapshot, 'terminal snapshot');
  const terminalSemantic = recordValue(
    execution.terminalSemanticProbe,
    'terminal semantic probe',
  );
  const projected = projectCaseDomains(plan.id, execution);
  const actual = {
    $schema: OBSERVATION_REVISION,
    case: {
      id: plan.id,
      type: plan.caseType,
      route: plan.route,
      rootTestId: plan.rootTestId,
      executionStatus: execution.status,
    },
    provenance: cloneRecord(input.provenance, 'provenance'),
    environment: cloneRecord(input.environment, 'environment'),
    revisions: {
      _availability: { terminalSnapshot: 'available' },
      ...projectRevisions(terminalSnapshot),
      ...projected.revisions,
    },
    scene: {
      _availability: { productDataset: 'available', terminalSemanticProbe: 'available' },
      invalidNodeCount: invalidNodeCount(terminalSemantic),
      ...projected.scene,
    },
    geometry: {
      _availability: { terminalSemanticProbe: 'available' },
      nonFiniteCount: semanticNonFiniteCount(terminalSemantic),
      ...projected.geometry,
    },
    text: notExercised('history-observes-text-only-through-semantic-snapshots'),
    paint: {
      _availability: { terminalSemanticProbe: 'available' },
      unresolvedIntentCount: semanticUnresolvedPaintCount(terminalSemantic),
      ...projected.paint,
    },
    interaction: {
      _availability: { publicHistoryCompanion: 'available' },
      ...projected.interaction,
    },
    events: {
      _availability: { productHistoryEvents: 'available' },
      journal: clone(execution.eventJournal),
      unclassifiedCount: unclassifiedErrorCount(execution),
      ...projected.events,
    },
    history: {
      _availability: { publicHistoryInspection: 'available' },
      ...projected.history,
    },
    accessibility: notExercised('history-accessibility-is-a-later-tranche'),
    outcome: {
      _availability: { actionResults: 'available' },
      unclassifiedErrorCount: unclassifiedErrorCount(execution),
      actionResults: execution.actionResults.map(({ index, type, status }) => ({
        index,
        type,
        status,
      })),
      ...projected.outcome,
    },
    resources: {
      _availability: { cleanup: 'available' },
      cleanup: cloneRecord(execution.cleanup, 'cleanup'),
      ...projected.resources,
    },
  };
  assert(
    DOMAIN_NAMES.every((domain) => isRecord(actual[domain])),
    'actual must contain all fourteen object domains',
  );
  validateJson(actual, 'actual', new WeakSet());
  return deepFreeze({
    actual,
    fixtures: cloneRecord(plan.fixture.setup.params, 'fixture params'),
    captures: projectCaptures(execution),
  });
}

function projectCaseDomains(caseId, execution) {
  switch (caseId) {
    case 'HIS-001': {
      const recorded = actionActual(execution, 0, 'history-recorded-transaction');
      const undo = actionActual(execution, 1, 'undo');
      const redo = actionActual(execution, 2, 'redo');
      const matrix = actionActual(execution, 3, 'history-domain-matrix');
      return domains({
        scene: {
          before: { unrelated: stringValue(recorded.unrelatedIdentity, 'HIS-001 unrelated') },
          afterCommit: cloneRecord(recorded.afterCommit, 'HIS-001 after commit'),
          afterUndo: {
            ...cloneRecord(undo.dataset, 'HIS-001 after undo'),
            unrelated: stringValue(undo.unrelatedIdentity, 'HIS-001 undo unrelated'),
          },
          afterRedo: cloneRecord(redo.dataset, 'HIS-001 after redo'),
        },
        interaction: {
          afterUndo: {
            selectedIds: stringArray(
              undo.interaction?.selectedIds,
              'HIS-001 undo selection',
            ),
            mode: stringValue(undo.interaction?.mode, 'HIS-001 undo mode'),
          },
        },
        history: {
          depth: historyDepth(recorded.history, 'HIS-001 history'),
          domainMatrix: {
            restoredCount: nonNegativeInteger(
              matrix.restoredCount,
              'HIS-001 restored count',
            ),
            semanticDiffCount: nonNegativeInteger(
              matrix.semanticDiffCount,
              'HIS-001 semantic diff count',
            ),
          },
        },
      });
    }
    case 'HIS-002': {
      const matrix = actionActual(execution, 0, 'history-capacity-matrix');
      return domains({
        history: {
          after52: cloneRecord(matrix.after52, 'HIS-002 after52'),
          afterBranch: cloneRecord(matrix.afterBranch, 'HIS-002 branch'),
          unavailable: cloneRecord(matrix.unavailable, 'HIS-002 unavailable'),
          capacityZero: cloneRecord(matrix.capacityZero, 'HIS-002 capacity zero'),
          beforeInvalidCapacity: cloneRecord(
            matrix.beforeInvalidCapacity,
            'HIS-002 before invalid',
          ),
          invalidCapacity: cloneRecord(
            matrix.invalidCapacity,
            'HIS-002 invalid capacity',
          ),
          capacityTransitions: cloneRecord(
            matrix.capacityTransitions,
            'HIS-002 capacity transitions',
          ),
        },
        outcome: {
          invalidCapacity: cloneRecord(
            matrix.invalidOutcome,
            'HIS-002 invalid outcome',
          ),
        },
      });
    }
    case 'HIS-003': {
      const grouped = actionActual(execution, 0, 'history-recorded-transactions');
      const final = actionActual(execution, 3, 'redo');
      return domains({
        scene: {
          final: cloneRecord(final.dataset, 'HIS-003 final dataset'),
        },
        history: {
          actionIds: stringArray(grouped.actionIds, 'HIS-003 action IDs'),
          depth: nonNegativeInteger(grouped.depth, 'HIS-003 depth'),
          firstGroup: cloneRecord(grouped.firstGroup, 'HIS-003 first group'),
        },
      });
    }
    case 'HIS-004': {
      const keyboard = actionActual(execution, 0, 'keyboard-history-matrix');
      const host = actionActual(execution, 1, 'host-history-control');
      return domains({
        interaction: {
          staleGestureCount: Math.max(
            nonNegativeInteger(keyboard.staleGestureCount, 'HIS-004 keyboard gestures'),
            nonNegativeInteger(host.staleGestureCount, 'HIS-004 host gestures'),
          ),
        },
        events: {
          canvasPreventDefaultByShortcut: booleanArray(
            keyboard.canvasPreventDefaultByShortcut,
            'HIS-004 canvas preventDefault',
          ),
          protectedPathPreventDefault: booleanArray(
            keyboard.protectedPathPreventDefault,
            'HIS-004 protected preventDefault',
          ),
        },
        history: {
          canvasActionCountByShortcut: numberArray(
            keyboard.canvasActionCountByShortcut,
            'HIS-004 canvas action counts',
          ),
          protectedPathActionCount: numberArray(
            keyboard.protectedPathActionCount,
            'HIS-004 protected action counts',
          ),
        },
        outcome: {
          shortcutAvailability: cloneRecord(
            keyboard.shortcutAvailability,
            'HIS-004 shortcut availability',
          ),
          hostButtonAvailability: cloneRecord(
            host.hostButtonAvailability,
            'HIS-004 host availability',
          ),
        },
      });
    }
    case 'HIS-005': {
      const undoFrame = actionActual(execution, 2, 'publish-frame');
      const redoFrame = actionActual(execution, 4, 'publish-frame');
      const clear = actionActual(execution, 5, 'clear-history');
      const replace = actionActual(execution, 6, 'replace-scene');
      const destroy = actionActual(execution, 7, 'destroy');
      return domains({
        interaction: {
          staleGestureCount: destroyedGestureCount(destroy),
        },
        events: {
          undo: { order: stringArray(undoFrame.order, 'HIS-005 undo order') },
          redo: { order: stringArray(redoFrame.order, 'HIS-005 redo order') },
          clear: { order: stringArray(clear.order, 'HIS-005 clear order') },
          destroy: { order: stringArray(destroy.order, 'HIS-005 destroy order') },
          destroyedCount: nonNegativeInteger(
            destroy.destroyedCount,
            'HIS-005 destroyed count',
          ),
        },
        history: {
          afterReplace: {
            depth: historyDepth(replace.history, 'HIS-005 replaced history'),
          },
        },
        resources: {
          leakDelta: destroyedResourceDelta(destroy),
        },
      });
    }
    case 'HIS-006': {
      const recorded = actionActual(execution, 0, 'compound-editor-transaction');
      const undo = actionActual(execution, 1, 'undo');
      const redo = actionActual(execution, 2, 'redo');
      const matrix = actionActual(execution, 3, 'compound-editor-domain-matrix');
      return domains({
        scene: {
          afterUndo: cloneRecord(undo.dataset, 'HIS-006 undo dataset'),
          afterRedo: cloneRecord(redo.dataset, 'HIS-006 redo dataset'),
        },
        interaction: {
          afterUndo: cloneRecord(undo.interaction, 'HIS-006 undo interaction'),
          afterRedo: cloneRecord(redo.interaction, 'HIS-006 redo interaction'),
        },
        history: {
          depth: historyDepth(recorded.history, 'HIS-006 history'),
          afterUndo: {
            hostCompanion: clone(undo.companion?.hostCompanion),
          },
          afterRedo: {
            hostCompanion: clone(redo.companion?.hostCompanion),
          },
          compoundDomainMatrix: {
            restoredCount: nonNegativeInteger(
              matrix.restoredCount,
              'HIS-006 restored count',
            ),
            hostCompanionDiffCount: nonNegativeInteger(
              matrix.hostCompanionDiffCount,
              'HIS-006 companion diff count',
            ),
          },
        },
      });
    }
    default:
      throw new Error(`Core v2 history fold invalid: unsupported case ${caseId}`);
  }
}

function domains(values) {
  return {
    revisions: values.revisions ?? {},
    scene: values.scene ?? {},
    geometry: values.geometry ?? {},
    paint: values.paint ?? {},
    interaction: values.interaction ?? {},
    events: values.events ?? {},
    history: values.history ?? {},
    outcome: values.outcome ?? {},
    resources: values.resources ?? {},
  };
}

function validateOptions(value) {
  const options = recordValue(value, 'options');
  assertExactKeys(
    options,
    ['casePlan', 'execution', 'provenance', 'environment'],
    'options',
  );
  return options;
}

function validatePlan(value) {
  const plan = recordValue(value, 'case plan');
  assert(CASE_IDS.includes(plan.id), 'case ID');
  assert(plan.caseType === 'capability', 'case type');
  assert(isRecord(plan.fixture), 'case fixture');
  assert(isRecord(plan.fixture.setup), 'case fixture setup');
  assert(isRecord(plan.fixture.setup.params), 'case fixture params');
  assert(Array.isArray(plan.actionTrace), 'case action trace');
  assert(Array.isArray(plan.fixture.actionTrace), 'fixture action trace');
  assert(sameJson(plan.actionTrace, plan.fixture.actionTrace), 'action trace drift');
  assert(Array.isArray(plan.captureCheckpoints), 'capture checkpoints');
  return plan;
}

function validateExecution(value, plan) {
  const execution = recordValue(value, 'execution');
  assert(execution.$schema === EXECUTION_REVISION, 'execution revision');
  assert(execution.caseId === plan.id, 'execution case identity');
  assert(execution.status === 'completed', 'execution status');
  assert(execution.error === null, 'execution error');
  assert(Array.isArray(execution.actionResults), 'execution action results');
  assert(execution.actionResults.length === plan.actionTrace.length, 'action result count');
  execution.actionResults.forEach((resultValue, index) => {
    const result = recordValue(resultValue, `action result ${index}`);
    const action = recordValue(plan.actionTrace[index], `action ${index}`);
    assert(result.index === index, `action ${index} result index`);
    assert(result.type === action.type, `action ${index} result type`);
    assert(result.handlerId === `contract/${action.type}`, `action ${index} handler`);
    assert(result.status === 'completed', `action ${index} status`);
    assert(isRecord(result.delta), `action ${index} delta`);
    assert(isRecord(result.delta.actual), `action ${index} actual`);
  });
  assert(Array.isArray(execution.eventJournal), 'event journal');
  assert(Array.isArray(execution.eventJournalFailures), 'event failures');
  assert(execution.eventJournalFailures.length === 0, 'event journal failures');
  assert(Array.isArray(execution.captures), 'execution captures');
  assert(isRecord(execution.terminalSnapshot), 'terminal snapshot');
  assert(isRecord(execution.terminalSemanticProbe), 'terminal semantic probe');
  assert(isRecord(execution.cleanup), 'cleanup');
  assert(execution.cleanup.status === 'completed', 'cleanup status');
  return execution;
}

function actionActual(execution, index, type) {
  const result = execution.actionResults[index];
  assert(result?.type === type, `action ${index} must be ${type}`);
  return recordValue(result.delta.actual, `action ${index} actual`);
}

function projectRevisions(snapshot) {
  const revisions = recordValue(snapshot.revisions, 'snapshot revisions');
  const values = [
    revisions.sceneRevision,
    revisions.viewRevision,
    revisions.interactionRevision,
    snapshot.frameRevision,
  ];
  return {
    scene: finiteNumber(revisions.sceneRevision, 'scene revision'),
    view: finiteNumber(revisions.viewRevision, 'view revision'),
    interaction: finiteNumber(revisions.interactionRevision, 'interaction revision'),
    frame: { revision: finiteNumber(snapshot.frameRevision, 'frame revision') },
    valuesFinite: values.every((entry) => typeof entry === 'number' && Number.isFinite(entry)),
  };
}

function invalidNodeCount(semantic) {
  const scene = recordValue(semantic.scene, 'semantic scene');
  return arrayValue(scene.nodes, 'semantic nodes').filter((node) => !isRecord(node)).length;
}

function semanticNonFiniteCount(semantic) {
  const geometry = recordValue(semantic.geometry, 'semantic geometry');
  return nonNegativeInteger(geometry.nonFiniteValueCount, 'semantic non-finite count');
}

function semanticUnresolvedPaintCount(semantic) {
  const paint = recordValue(semantic.paint, 'semantic paint');
  return nonNegativeInteger(paint.unresolvedCount, 'semantic unresolved paint count');
}

function historyDepth(value, label) {
  const history = recordValue(value, label);
  const state = recordValue(history.state, `${label} state`);
  return nonNegativeInteger(state.depth, `${label} depth`);
}

function destroyedGestureCount(destroy) {
  const product = recordValue(destroy.product, 'destroy product');
  const gesture = recordValue(product.transformerGesture, 'destroy transformer gesture');
  return gesture.active === true ? 1 : 0;
}

function destroyedResourceDelta(destroy) {
  const snapshot = recordValue(destroy.snapshot, 'destroy snapshot');
  const resources = recordValue(snapshot.resources, 'destroy resources');
  const subscriptions = recordValue(resources.subscriptions, 'destroy subscriptions');
  return nonNegativeInteger(resources.canvasCount, 'destroy canvas count') +
    nonNegativeInteger(subscriptions.active, 'destroy subscription count') +
    nonNegativeInteger(snapshot.pendingWork, 'destroy pending work');
}

function unclassifiedErrorCount(execution) {
  return Number(execution.error !== null) +
    execution.eventJournalFailures.length +
    execution.actionResults.filter(({ status }) => status !== 'completed').length;
}

function projectCaptures(execution) {
  const captures = {};
  for (const [index, value] of execution.captures.entries()) {
    const capture = recordValue(value, `capture ${index}`);
    const id = stringValue(capture.id, `capture ${index} ID`);
    assert(!Object.hasOwn(captures, id), `duplicate capture ${id}`);
    captures[id] = cloneRecord(capture.values, `capture ${id} values`);
  }
  return captures;
}

function notExercised(reason) {
  return { _availability: { status: 'not-exercised', reason } };
}

function validateJson(value, path, ancestors) {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) return;
  if (typeof value === 'number') {
    assert(Number.isFinite(value), `${path} finite number`);
    return;
  }
  assert(typeof value === 'object', `${path} JSON type`);
  assert(!ancestors.has(value), `${path} cycle`);
  ancestors.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateJson(entry, `${path}[${index}]`, ancestors));
  } else {
    for (const [key, entry] of Object.entries(value)) {
      validateJson(entry, `${path}.${key}`, ancestors);
    }
  }
  ancestors.delete(value);
}

function cloneRecord(value, label) {
  return clone(recordValue(value, label));
}

function arrayValue(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  return value;
}

function stringArray(value, label) {
  return arrayValue(value, label).map((entry, index) =>
    stringValue(entry, `${label}[${index}]`));
}

function booleanArray(value, label) {
  return arrayValue(value, label).map((entry, index) => {
    assert(typeof entry === 'boolean', `${label}[${index}] must be boolean`);
    return entry;
  });
}

function numberArray(value, label) {
  return arrayValue(value, label).map((entry, index) =>
    finiteNumber(entry, `${label}[${index}]`));
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
  return Object.is(value, -0) ? 0 : value;
}

function nonNegativeInteger(value, label) {
  assert(Number.isSafeInteger(value) && value >= 0, `${label} must be non-negative`);
  return value;
}

function assertExactKeys(record, keys, label) {
  assert(
    sameJson(Object.keys(record).sort(), [...keys].sort()),
    `${label} exact keys`,
  );
}

function clone(value) {
  return structuredClone(value);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function assert(condition, message) {
  if (!condition) throw new Error(`Core v2 history fold invalid: ${message}`);
}
