export const POINTER_SELECTION_FOLD_REVISION = 'core-v2-pointer-selection-fold/1';

const OBSERVATION_REVISION = 'core-v2-semantic-observation/1';
const EXECUTION_REVISION = 'core-v2-contract-case-execution/1';
const CASE_IDS = Object.freeze([
  'EVT-001',
  'EVT-002',
  'EVT-003',
  'EVT-004',
  'EVT-008',
  'SEL-005',
  'SEL-006',
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
 * Fold seven shared pointer/selection executions without importing approved
 * expected observations or a comparator.
 */
export function foldPointerSelectionExecution(options) {
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
      _availability: { terminalSemanticProbe: 'available' },
      invalidNodeCount: invalidNodeCount(terminalSemantic),
      ...projected.scene,
    },
    geometry: {
      _availability: { aggregateGeometry: 'available' },
      nonFiniteCount: semanticNonFiniteCount(terminalSemantic),
      ...projected.geometry,
    },
    text: notExercised('pointer-selection-does-not-observe-text-layout'),
    paint: notExercised('pointer-selection-does-not-observe-raster-pixels'),
    interaction: {
      _availability: { rootPointerAuthority: 'available' },
      ...projected.interaction,
    },
    events: {
      _availability: { semanticPointerEvents: 'available' },
      ...projected.events,
    },
    history: {
      _availability: { semanticHistory: 'available' },
      depth: semanticHistoryDepth(terminalSemantic),
      ...projected.history,
    },
    accessibility: notExercised('pointer-selection-accessibility-is-a-later-tranche'),
    outcome: {
      _availability: { actionResults: 'available' },
      unclassifiedErrorCount: unclassifiedErrorCount(execution),
      ...projected.outcome,
    },
    resources: {
      _availability: { cleanup: 'available', rootOwnership: 'available' },
      cleanup: clone(execution.cleanup),
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
    case 'EVT-001': {
      const action = actionActual(execution, 0, 'pointer-series');
      return domains({
        interaction: {
          staleGestureCount: pointerProbe(action).staleGestureCount,
        },
        events: {
          traces: cloneRecord(action.traces, 'EVT-001 traces'),
        },
      });
    }
    case 'EVT-002': {
      const action = actionActual(execution, 0, 'physical-click-series');
      return domains({
        interaction: {
          staleGestureCount: pointerProbe(action).staleGestureCount,
        },
        events: {
          semanticCallbacks: cloneArray(action.semanticCallbacks, 'EVT-002 callbacks'),
          aliasDuplicateCount: nonNegativeInteger(
            action.aliasDuplicateCount,
            'EVT-002 alias duplicate count',
          ),
        },
      });
    }
    case 'EVT-003': {
      const hover = actionActual(execution, 0, 'pointer-hover-series');
      const redraw = actionActual(execution, 1, 'hover-overlap-redraw-probe');
      return domains({
        interaction: {
          hoverTrace: cloneArray(hover.hoverTrace, 'EVT-003 hover trace'),
          tooltipTarget: hover.tooltipTarget ?? null,
          cursor: stringValue(hover.cursor, 'EVT-003 cursor'),
          overlapRedrawTrace: cloneArray(
            redraw.overlapRedrawTrace,
            'EVT-003 overlap redraw trace',
          ),
        },
        events: {
          afterDestroyCount: nonNegativeInteger(
            hover.afterDestroyCount,
            'EVT-003 after destroy count',
          ),
        },
        resources: cloneRecord(hover.resources, 'EVT-003 resources'),
      });
    }
    case 'EVT-004': {
      const action = actionActual(execution, 0, 'gesture-termination-matrix');
      return domains({
        interaction: {
          staleGestureCount: pointerProbe(action).staleGestureCount,
        },
        events: {
          cancelMatrix: cloneArray(action.eventCancelMatrix, 'EVT-004 event matrix'),
        },
        history: {
          cancelMatrix: cloneArray(
            action.historyCancelMatrix,
            'EVT-004 history matrix',
          ),
        },
        outcome: {
          commitMatrix: cloneArray(action.commitMatrix, 'EVT-004 commit matrix'),
          cancelMatrix: cloneArray(action.cancelMatrix, 'EVT-004 cancel matrix'),
        },
        resources: {
          cancelMatrix: cloneArray(
            action.resourceCancelMatrix,
            'EVT-004 resource matrix',
          ),
        },
      });
    }
    case 'EVT-008': {
      const action = actionActual(execution, 0, 'click-suppression-matrix');
      return domains({
        interaction: {
          thresholdCssPxByZoom: cloneArray(
            action.thresholdCssPxByZoom,
            'EVT-008 thresholds',
          ),
          nativeContextMenuPrevented: cloneRecord(
            action.nativeContextMenuPrevented,
            'EVT-008 context ownership',
          ),
        },
        events: {
          clickCounts: cloneRecord(action.clickCounts, 'EVT-008 click counts'),
        },
      });
    }
    case 'SEL-005': {
      const completed = actionActual(execution, 0, 'box-selection');
      const cancelled = actionActual(execution, 1, 'box-selection');
      const leave = actionActual(execution, 2, 'box-selection');
      const relation = actionActual(
        execution,
        3,
        'relation-box-intersection-matrix',
      );
      return domains({
        geometry: {
          boxStrokeCssPxByZoomAndDpr: cloneArray(
            relation.strokeCssPxByZoomAndDpr,
            'SEL-005 box strokes',
          ),
        },
        interaction: {
          completed: {
            targets: cloneArray(completed.targets, 'SEL-005 completed targets'),
            duplicateCount: nonNegativeInteger(
              completed.duplicateCount,
              'SEL-005 duplicate count',
            ),
          },
          beforeCancelled: {
            targets: cloneArray(cancelled.beforeTargets, 'SEL-005 before cancelled'),
          },
          cancelled: {
            targets: cloneArray(cancelled.targets, 'SEL-005 cancelled targets'),
          },
          beforeLeave: {
            targets: cloneArray(leave.beforeTargets, 'SEL-005 before leave'),
          },
          leave: {
            targets: cloneArray(leave.targets, 'SEL-005 leave targets'),
          },
          relationIntersection: cloneRecord(
            relation.relationIntersection,
            'SEL-005 relation intersection',
          ),
        },
        events: {
          completed: {
            dragStartCount: nonNegativeInteger(
              completed.dragStartCount,
              'SEL-005 drag-start count',
            ),
          },
        },
        resources: {
          cancelled: cloneRecord(cancelled.resources, 'SEL-005 cancelled resources'),
        },
      });
    }
    case 'SEL-006': {
      const action = actionActual(execution, 0, 'paint-selection');
      return domains({
        geometry: {
          nonFiniteCount: nonNegativeInteger(
            action.nonFiniteCount,
            'SEL-006 non-finite count',
          ),
        },
        interaction: {
          targets: cloneArray(action.targets, 'SEL-006 targets'),
          duplicateCount: nonNegativeInteger(
            action.duplicateCount,
            'SEL-006 duplicate count',
          ),
          filteredTargets: cloneArray(
            action.filteredTargets,
            'SEL-006 filtered targets',
          ),
          lockedTargets: cloneArray(action.lockedTargets, 'SEL-006 locked targets'),
          relationPathIntersections: cloneArray(
            action.relationPathIntersections,
            'SEL-006 relation intersections',
          ),
        },
        events: {
          liveChangeCount: nonNegativeInteger(
            action.liveChangeCount,
            'SEL-006 live change count',
          ),
          dragEnd: cloneRecord(action.dragEnd, 'SEL-006 drag end'),
        },
      });
    }
    default:
      throw new Error(`Core v2 pointer/selection fold invalid: unsupported case ${caseId}`);
  }
}

function domains(values) {
  return {
    revisions: values.revisions ?? {},
    scene: values.scene ?? {},
    geometry: values.geometry ?? {},
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

function pointerProbe(action) {
  return recordValue(action.pointerGesture, 'pointer gesture probe');
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
  const nodes = cloneArray(scene.nodes, 'semantic nodes');
  return nodes.filter((node) => !isRecord(node)).length;
}

function semanticNonFiniteCount(semantic) {
  const geometry = recordValue(semantic.geometry, 'semantic geometry');
  return nonNegativeInteger(geometry.nonFiniteValueCount, 'semantic non-finite count');
}

function semanticHistoryDepth(semantic) {
  const history = recordValue(semantic.history, 'semantic history');
  return nonNegativeInteger(history.depth ?? 0, 'semantic history depth');
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

function cloneRecord(value, label) {
  return clone(recordValue(value, label));
}

function cloneArray(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  return clone(value);
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

function nonNegativeInteger(value, label) {
  const number = finiteNumber(value, label);
  assert(Number.isInteger(number) && number >= 0, `${label} must be a non-negative integer`);
  return number;
}

function assertExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  assert(
    sameJson(actual, wanted),
    `${label} keys ${JSON.stringify(actual)}`,
  );
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function clone(value) {
  return structuredClone(value);
}

function validateJson(value, label, seen) {
  if (value === null) return;
  const type = typeof value;
  assert(type !== 'undefined', `${label} cannot contain undefined`);
  assert(type !== 'function' && type !== 'symbol' && type !== 'bigint', `${label} JSON type`);
  if (type === 'number') {
    assert(Number.isFinite(value), `${label} finite number`);
    return;
  }
  if (type !== 'object') return;
  assert(!seen.has(value), `${label} cycle`);
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateJson(entry, `${label}[${index}]`, seen));
  } else {
    for (const [key, entry] of Object.entries(value)) {
      validateJson(entry, `${label}.${key}`, seen);
    }
  }
  seen.delete(value);
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Core v2 pointer/selection fold invalid: ${message}`);
}
