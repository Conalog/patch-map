import { clone } from './value-atoms.mjs';

export const QUERY_SELECTION_FOLD_REVISION = 'patch-map-query-selection-fold/1';

const OBSERVATION_REVISION = 'patch-map-semantic-observation/1';
const EXECUTION_REVISION = 'patch-map-contract-case-execution/1';
const CASE_IDS = Object.freeze([
  'QRY-001',
  'QRY-002',
  'SEL-001',
  'SEL-002',
  'SEL-003',
  'SEL-004',
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

/** Fold six shared query/selection executions without reading approved expected data. */
export function foldQuerySelectionExecution(options) {
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
      _availability: { terminalSemanticProbe: 'available' },
      nonFiniteCount: semanticNonFiniteCount(terminalSemantic),
      ...projected.geometry,
    },
    text: notExercised('query-selection-does-not-observe-text-layout'),
    paint: notExercised('query-selection-does-not-observe-paint-pixels'),
    interaction: {
      _availability: { publicProductActions: 'available' },
      ...projected.interaction,
    },
    events: {
      _availability: { eventJournal: 'available', publicSelectionEvents: 'available' },
      journal: clone(execution.eventJournal),
      ...projected.events,
    },
    history: {
      _availability: { terminalSemanticProbe: 'available' },
      depth: semanticHistoryDepth(terminalSemantic),
    },
    accessibility: notExercised('query-selection-accessibility-is-a-later-tranche'),
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
      _availability: { cleanup: 'available', terminalSnapshot: 'available' },
      cleanup: clone(execution.cleanup),
      terminal: cloneRecord(terminalSnapshot.resources, 'terminal resources'),
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
    case 'QRY-001': {
      const queried = actionActual(execution, 1, 'query-scene');
      return domains({
        outcome: { queries: cloneRecord(queried.queries, 'QRY-001 queries') },
      });
    }
    case 'QRY-002': {
      const same = actionActual(execution, 1, 'reuse-query-result-matrix');
      const reuse = actionActual(execution, 3, 'reuse-query-result');
      const stale = actionActual(execution, 4, 'reuse-query-result-matrix');
      const resolved = actionActual(execution, 5, 'resolve-target');
      return domains({
        interaction: { staleGestureCount: terminalGestureCount(execution) },
        outcome: {
          oldResult: {
            sameRevisionTarget: clone(same.sameRevisionTarget),
          },
          reuse: {
            code: nullableString(reuse.code, 'QRY-002 reuse code'),
            appliedCount: nonNegativeInteger(reuse.appliedCount, 'QRY-002 applied count'),
          },
          resolve: {
            target: nullableString(resolved.target, 'QRY-002 resolved target'),
            sceneRevision: nonNegativeInteger(
              resolved.sceneRevision,
              'QRY-002 resolved revision',
            ),
          },
          sameRevision: {
            acceptedOperations: stringArray(
              same.acceptedOperations,
              'QRY-002 accepted operations',
            ),
          },
          staleRevision: {
            codes: stale.codes.map((code, index) =>
              nullableString(code, `QRY-002 stale code ${index}`)),
          },
        },
      });
    }
    case 'SEL-001': {
      const point = actionActual(execution, 0, 'point-hit-matrix');
      const relation = actionActual(execution, 1, 'overlap-and-relation-hit-matrix');
      return domains({
        interaction: {
          hitByView: cloneRecord(point.hitByView, 'SEL-001 hitByView'),
          worldPointByView: cloneArray(
            point.worldPointByView,
            'SEL-001 worldPointByView',
          ),
          emptyHit: point.emptyHit ?? null,
          relationToleranceCssPx: finiteNumber(
            relation.relationToleranceCssPx,
            'SEL-001 relation tolerance',
          ),
          overlap: cloneRecord(relation.overlap, 'SEL-001 overlap'),
          relation: cloneRecord(relation.relation, 'SEL-001 relation'),
        },
      });
    }
    case 'SEL-002': {
      const unit = actionActual(execution, 0, 'selection-unit-matrix');
      return domains({
        interaction: {
          resolved: cloneRecord(unit.resolved, 'SEL-002 resolved units'),
          multi: cloneRecord(unit.multi, 'SEL-002 multi'),
          deepModifier: cloneRecord(unit.deepModifier, 'SEL-002 deep modifier'),
        },
        events: cloneRecord(unit.events, 'SEL-002 events'),
      });
    }
    case 'SEL-003': {
      const eligibility = actionActual(execution, 0, 'selection-eligibility-matrix');
      return domains({
        interaction: {
          point: cloneRecord(eligibility.point, 'SEL-003 point'),
          box: cloneRecord(eligibility.box, 'SEL-003 box'),
          paint: cloneRecord(eligibility.paint, 'SEL-003 paint'),
          filterInput: cloneRecord(eligibility.filterInput, 'SEL-003 filter input'),
          overlay: cloneRecord(eligibility.overlay, 'SEL-003 overlay'),
        },
      });
    }
    case 'SEL-004': {
      const selection = actionActual(execution, 0, 'selection-set-operations');
      return domains({
        interaction: {
          snapshots: cloneArray(selection.snapshots, 'SEL-004 snapshots'),
        },
        events: {
          changes: cloneArray(selection.changes, 'SEL-004 changes'),
        },
        outcome: {
          externalMissingDeleted: booleanValue(
            selection.externalMissingDeleted,
            'SEL-004 external missing deleted',
          ),
        },
      });
    }
    default:
      throw new Error(`PatchMap query/selection fold invalid: unsupported case ${caseId}`);
  }
}

function domains(values) {
  return {
    revisions: values.revisions ?? {},
    scene: values.scene ?? {},
    geometry: values.geometry ?? {},
    interaction: values.interaction ?? {},
    events: values.events ?? {},
    outcome: values.outcome ?? {},
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
  assert(isRecord(execution.bindings), 'execution bindings');
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

function terminalGestureCount(execution) {
  const semantic = recordValue(execution.terminalSemanticProbe, 'terminal semantic');
  const interaction = recordValue(semantic.interaction, 'terminal interaction');
  return nonNegativeInteger(
    interaction.activeGestureCount ?? 0,
    'terminal active gesture count',
  );
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

function stringArray(value, label) {
  assert(Array.isArray(value), `${label} must be an array`);
  return value.map((entry, index) => stringValue(entry, `${label}[${index}]`));
}

function recordValue(value, label) {
  assert(isRecord(value), `${label} must be a record`);
  return value;
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} must be a string`);
  return value;
}

function nullableString(value, label) {
  if (value === null) return null;
  return stringValue(value, label);
}

function finiteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} must be finite`);
  return Object.is(value, -0) ? 0 : value;
}

function nonNegativeInteger(value, label) {
  assert(Number.isSafeInteger(value) && value >= 0, `${label} must be a non-negative integer`);
  return value;
}

function booleanValue(value, label) {
  assert(typeof value === 'boolean', `${label} must be a boolean`);
  return value;
}

function assertExactKeys(record, keys, label) {
  assert(sameJson(Object.keys(record).sort(), [...keys].sort()), `${label} exact keys`);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateJson(value, path, ancestors) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    assert(Number.isFinite(value), `${path} finite number`);
    return;
  }
  assert(typeof value === 'object', `${path} JSON value`);
  assert(!ancestors.has(value), `${path} cycle`);
  assert(Array.isArray(value) || isRecord(value), `${path} plain JSON container`);
  ancestors.add(value);
  for (const [key, child] of Object.entries(value)) {
    validateJson(child, `${path}/${key}`, ancestors);
  }
  ancestors.delete(value);
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assert(condition, message) {
  if (!condition) throw new Error(`PatchMap query/selection fold invalid: ${message}`);
}
