import {
  projectConsumerInvariants,
  projectLiveOverlayJourney,
  projectPresentationExportJourney,
  projectRapidRefreshJourney,
  projectStableUpdateJourney,
  projectViewColumnJourney,
} from './fold-update-transactions/journey-projections.mjs';
import {
  projectAtomicBulk,
  projectComponents,
  projectGeometryOrigin,
  projectMissingTargets,
  projectPartialMerge,
  projectReplacement,
  projectStableTarget,
  projectValidationFailures,
} from './fold-update-transactions/mutation-projections.mjs';
import {
  projectAsyncRevision,
  projectHostPresentation,
  projectLiveOverlay,
  projectRelations,
  projectSemanticRefresh,
  projectStructure,
} from './fold-update-transactions/structure-projections.mjs';
import {
  actionEventCount,
  assert,
  assertExactKeys,
  assertFiniteNumber,
  assertUint32,
  assignOwned,
  assignPath,
  clone,
  cloneRecord,
  inputEvidenceAt,
  isPlainObject,
  nonNegativeInteger,
  notExercised,
  nullableNonNegativeInteger,
  productAt,
  recordValue,
  sameJson,
  stringArray,
  stringValue,
  universalProduct,
  validateJsonValue,
} from './fold-update-transactions/values.mjs';
import { deepFreeze } from './value-atoms.mjs';

export const UPDATE_TRANSACTIONS_FOLD_REVISION =
  'core-v2-update-transactions-fold/1';

const OBSERVATION_REVISION = 'core-v2-semantic-observation/1';
const EXECUTION_REVISION = 'core-v2-contract-case-execution/1';
const DELTA_REVISION = 'core-v2-semantic-observation-delta/1';
const CASE_ACTIONS = Object.freeze({
  'ERR-001': Object.freeze([
    'load-dataset',
    'run-invalid-operation-matrix',
  ]),
  'UPD-001': Object.freeze([
    'loadDataset',
    'retainTarget',
    'replaceDataset',
    'resolveTarget',
    'patch',
  ]),
  'UPD-002': Object.freeze(['freezePatch', 'merge', 'merge']),
  'UPD-003': Object.freeze(['replace', 'replace', 'replace']),
  'UPD-004': Object.freeze(['patch', 'relativePatch', 'resizeAroundOrigin']),
  'UPD-006': Object.freeze(['bulkPatch', 'bulkPatch', 'bulkPatch', 'bulkPatch']),
  'UPD-007': Object.freeze([
    'generateSyntheticScene',
    'bulkOverlay',
    'publishFrame',
    'bulkOverlay',
  ]),
  'UPD-008': Object.freeze([
    'capture-observation',
    'reconcileComponents',
    'setComponentVisibility',
    'setComponentVisibility',
  ]),
  'UPD-009': Object.freeze([
    'loadDataset',
    'setSelection',
    'moveAcrossParents',
    'group',
    'ungroup',
    'moveAcrossParents',
    'moveAcrossParents',
  ]),
  'UPD-010': Object.freeze([
    'loadDataset',
    'patch',
    'setVisibility',
    'setVisibility',
    'remove',
  ]),
  'UPD-011': Object.freeze([
    'startAsyncRevision',
    'startAsyncRevision',
    'startAsyncRevision',
    'completeAsyncRevision',
    'completeAsyncRevision',
    'destroy',
    'completeAsyncRevision',
  ]),
  'UPD-012': Object.freeze([
    'setHighlightPolicy',
    'setLayerVisibility',
    'clearPresentationPolicy',
  ]),
  'UPD-013': Object.freeze(['streamOverlay', 'publishFrame']),
  'UPD-014': Object.freeze([
    'snapshot',
    'replaceExternalDependency',
    'refresh',
    'publishFrame',
  ]),
  'CSM-005': Object.freeze([
    'load-scene',
    'apply-merge',
    'redraw-scene',
    'apply-merge',
    'probe-declared-failure',
  ]),
  'CSM-006': Object.freeze([
    'load-scene',
    'apply-live-overlay',
    'await-frame',
    'probe-declared-failure',
  ]),
  'CSM-007': Object.freeze([
    'submit-overlay-revision',
    'submit-overlay-revision',
    'submit-overlay-revision',
    'complete-overlay-revisions',
    'destroy-engine',
    'probe-declared-failure',
  ]),
  'CSM-008': Object.freeze([
    'load-scene',
    'apply-presentation-overlay',
    'export-canonical-dataset',
    'probe-declared-failure',
  ]),
  'CSM-014': Object.freeze([
    'apply-view-column',
    'apply-view-column',
    'apply-view-column',
    'remount-and-restore-column',
    'probe-declared-failure',
  ]),
});
const CONSUMER_CASE_IDS = new Set([
  'CSM-005',
  'CSM-006',
  'CSM-007',
  'CSM-008',
  'CSM-014',
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
 * Fold detached public product captures for update/error/consumer cases.
 * This module is intentionally import-free and has no access to comparison
 * evidence. Every asserted fact is derived from execution output, a declared
 * capture, or an explicitly exposed fixture-reference namespace.
 */
export function foldUpdateTransactionExecution(optionsValue) {
  const options = validateOptions(optionsValue);
  const plan = validateCasePlan(options.casePlan);
  const execution = validateExecution(options.execution, plan);
  const captures = projectCaptures(plan, execution);
  const finalProduct = productAt(execution, plan.actionTypes.length - 1);
  validateTerminalCorrelation(execution, finalProduct);

  const actual = baseActual(options, plan, execution, finalProduct);
  if (CONSUMER_CASE_IDS.has(plan.id)) {
    const invariantProduct = plan.id === 'CSM-007'
      ? productAt(execution, 3)
      : finalProduct;
    projectConsumerInvariants(actual, execution, invariantProduct);
  }
  switch (plan.id) {
    case 'ERR-001':
      projectValidationFailures(actual, execution);
      break;
    case 'UPD-001':
      projectStableTarget(actual, execution);
      break;
    case 'UPD-002':
      projectPartialMerge(actual, execution, plan);
      break;
    case 'UPD-003':
      projectReplacement(actual, execution);
      break;
    case 'UPD-004':
      projectGeometryOrigin(actual, execution);
      break;
    case 'UPD-006':
      projectMissingTargets(actual, execution);
      break;
    case 'UPD-007':
      projectAtomicBulk(actual, execution);
      break;
    case 'UPD-008':
      projectComponents(actual, execution);
      break;
    case 'UPD-009':
      projectStructure(actual, execution);
      break;
    case 'UPD-010':
      projectRelations(actual, execution);
      break;
    case 'UPD-011':
      projectAsyncRevision(actual, execution);
      break;
    case 'UPD-012':
      projectHostPresentation(actual, execution);
      break;
    case 'UPD-013':
      projectLiveOverlay(actual, execution);
      break;
    case 'UPD-014':
      projectSemanticRefresh(actual, execution);
      break;
    case 'CSM-005':
      projectStableUpdateJourney(actual, execution);
      break;
    case 'CSM-006':
      projectLiveOverlayJourney(actual, execution);
      break;
    case 'CSM-007':
      projectRapidRefreshJourney(actual, execution);
      break;
    case 'CSM-008':
      projectPresentationExportJourney(actual, execution);
      break;
    case 'CSM-014':
      projectViewColumnJourney(actual, execution);
      break;
    default:
      throw new Error(`Core v2 update fold invalid: unsupported case ${String(plan.id)}`);
  }

  assert(
    DOMAIN_NAMES.every((domain) => isPlainObject(actual[domain])),
    'actual must contain all fourteen object domains',
  );
  validateJsonValue(actual, 'actual', new WeakSet());
  return deepFreeze({
    actual,
    fixtures: cloneRecord(plan.fixture.setup.params, `${plan.id} fixture params`),
    captures,
  });
}

function baseActual(options, plan, execution, product) {
  const snapshot = product.snapshot;
  const semantic = product.semantic;
  const revisions = recordValue(snapshot.revisions, 'terminal product revisions');
  const semanticScene = recordValue(semantic.scene, 'terminal semantic scene');
  const counts = recordValue(semanticScene.counts, 'terminal semantic counts');
  const semanticGeometry = recordValue(semantic.geometry, 'terminal semantic geometry');
  const semanticInteraction = recordValue(
    semantic.interaction,
    'terminal semantic interaction',
  );
  const rendering = recordValue(snapshot.resources, 'terminal snapshot resources').rendering;
  const sceneRevision = nonNegativeInteger(revisions.sceneRevision, 'terminal scene revision');

  return {
    $schema: OBSERVATION_REVISION,
    case: {
      id: plan.id,
      caseType: plan.caseType,
      rootTestId: plan.rootTestId,
      fixtureSha256: plan.fixtureSha256,
      executionStatus: execution.status,
    },
    provenance: cloneRecord(options.provenance, 'provenance'),
    environment: cloneRecord(options.environment, 'environment'),
    revisions: {
      _availability: { lifecycle: 'public-engine-snapshot', frame: 'public-engine-snapshot' },
      lifecycle: {
        generation: nonNegativeInteger(
          revisions.lifecycleGeneration,
          'terminal lifecycle generation',
        ),
      },
      scene: { revision: sceneRevision },
      frame: {
        revision: nonNegativeInteger(snapshot.frameRevision, 'terminal frame revision'),
      },
    },
    scene: {
      _availability: {
        authority: 'public-exported-dataset',
        hierarchy: 'public-semantic-probe',
      },
      revision: sceneRevision,
      rootIds: stringArray(snapshot.rootIds, 'terminal root IDs'),
      hierarchy: {
        nodeCount:
          nonNegativeInteger(counts.elements, 'terminal element count') +
          nonNegativeInteger(counts.components, 'terminal component count'),
      },
    },
    geometry: {
      _availability: { semanticProbe: 'available', rendererProbe: 'available' },
      finiteValueCount: nonNegativeInteger(
        semanticGeometry.finiteValueCount,
        'terminal finite geometry count',
      ),
    },
    text: notExercised('update-transaction-fold-does-not-assert-text'),
    paint: {
      _availability: { aggregateRenderer: 'public-engine-snapshot' },
      commandCount: nullableNonNegativeInteger(
        recordValue(rendering, 'terminal rendering resources').commandCount,
        'terminal render command count',
      ),
    },
    interaction: {
      _availability: {
        semanticProbe: 'available',
        ownershipProbe: product.interactionOwnership === null ? 'unavailable' : 'available',
      },
      activeGestureCount: nonNegativeInteger(
        semanticInteraction.activeGestureCount ?? 0,
        'terminal active gesture count',
      ),
      selectionIds: stringArray(semanticInteraction.selectionIds, 'terminal selection IDs'),
    },
    events: {
      _availability: { eventJournal: 'available', actionEvents: 'available' },
      totalCount: execution.eventJournal.length + actionEventCount(execution),
      journal: clone(execution.eventJournal),
    },
    history: {
      _availability: { publicHistory: 'available' },
      depth: nonNegativeInteger(snapshot.historyDepth, 'terminal history depth'),
      state: clone(product.history),
    },
    accessibility: notExercised('update-transaction-fold-does-not-assert-accessibility'),
    outcome: {
      _availability: { actionResults: 'available', inputOwnership: 'fingerprint-observed' },
      recorded: true,
      inputUnchanged: execution.actionResults.every((_, index) =>
        inputEvidenceAt(execution, index).unchanged),
      actionResults: execution.actionResults.map(({ index, type, status }) => ({
        index,
        type,
        status,
      })),
    },
    resources: {
      _availability: { cleanup: 'available', publicRuntimeProbe: 'available' },
      cleanup: clone(execution.cleanup),
      terminal: clone(product.resources),
    },
  };
}




function validateOptions(options) {
  assert(isPlainObject(options), 'options must be a plain object');
  assertExactKeys(options, ['casePlan', 'environment', 'execution', 'provenance'], 'options');
  assert(isPlainObject(options.casePlan), 'casePlan');
  assert(isPlainObject(options.execution), 'execution');
  assert(isPlainObject(options.provenance), 'provenance');
  assert(isPlainObject(options.environment), 'environment');
  validateJsonValue(options.provenance, 'provenance', new WeakSet());
  validateJsonValue(options.environment, 'environment', new WeakSet());
  return options;
}

function validateCasePlan(casePlan) {
  validateJsonValue(casePlan, 'casePlan', new WeakSet());
  const actionTypes = CASE_ACTIONS[casePlan.id];
  assert(actionTypes !== undefined, `unsupported case ${String(casePlan.id)}`);
  const expectedCaseType = CONSUMER_CASE_IDS.has(casePlan.id)
    ? 'consumer-journey'
    : 'capability';
  assert(casePlan.caseType === expectedCaseType, `${casePlan.id} caseType`);
  assert(typeof casePlan.rootTestId === 'string' && casePlan.rootTestId.length > 0, 'rootTestId');
  assert(typeof casePlan.fixtureSha256 === 'string' && casePlan.fixtureSha256.length > 0, 'fixtureSha256');
  assert(isPlainObject(casePlan.fixture), `${casePlan.id} fixture`);
  assert(isPlainObject(casePlan.fixture.setup), `${casePlan.id} fixture setup`);
  assert(isPlainObject(casePlan.fixture.setup.params), `${casePlan.id} fixture params`);
  assert(isPlainObject(casePlan.routeParams), `${casePlan.id} route params`);
  assert(typeof casePlan.routeParams.size === 'string', `${casePlan.id} route size`);
  assertUint32(casePlan.routeParams.seed, `${casePlan.id} route seed`);

  const actions = casePlan.fixture.actionTrace;
  assert(Array.isArray(actions), `${casePlan.id} action trace`);
  assert(actions.length === actionTypes.length, `${casePlan.id} action count`);
  actions.forEach((action, index) => {
    assert(isPlainObject(action), `${casePlan.id} action ${index}`);
    assertExactKeys(action, ['index', 'operands', 'type'], `${casePlan.id} action ${index}`);
    assert(action.index === index, `${casePlan.id} action ${index} index`);
    assert(action.type === actionTypes[index], `${casePlan.id} action ${index} type`);
    assert(isPlainObject(action.operands), `${casePlan.id} action ${index} operands`);
  });
  assert(
    sameJson(casePlan.actionTrace, actions),
    `${casePlan.id} materialized action trace drift`,
  );

  const checkpoints = casePlan.fixture.captureCheckpoints ?? [];
  assert(Array.isArray(checkpoints), `${casePlan.id} capture checkpoints`);
  const ids = new Set();
  for (const checkpoint of checkpoints) {
    assert(isPlainObject(checkpoint), `${casePlan.id} checkpoint`);
    assert(typeof checkpoint.id === 'string' && checkpoint.id.length > 0, 'checkpoint ID');
    assert(!ids.has(checkpoint.id), `${casePlan.id} duplicate checkpoint ${checkpoint.id}`);
    ids.add(checkpoint.id);
    assert(
      checkpoint.phase === 'before-actions' || checkpoint.phase === 'after-action',
      `${casePlan.id} checkpoint phase`,
    );
    assert(Number.isInteger(checkpoint.afterActionIndex), `${casePlan.id} checkpoint index`);
    assert(Array.isArray(checkpoint.paths) && checkpoint.paths.length > 0, 'checkpoint paths');
    checkpoint.paths.forEach((path) => stringValue(path, 'checkpoint path'));
  }
  return { ...casePlan, actionTypes, checkpoints };
}

function validateExecution(execution, plan) {
  validateJsonValue(execution, 'execution', new WeakSet());
  assert(execution.$schema === EXECUTION_REVISION, 'execution schema');
  assert(execution.caseId === plan.id, 'execution case ID');
  assert(execution.caseType === plan.caseType, 'execution caseType');
  assert(execution.status === 'completed', 'execution status');
  assert(execution.error === null, 'execution error');
  if (plan.caseType === 'consumer-journey') {
    const hostSeam = recordValue(
      execution.hostSeamDelta,
      `${plan.id} host seam delta`,
    );
    assert(hostSeam.caseId === plan.id, `${plan.id} host seam case ID`);
    assert(
      hostSeam.capabilityPassInherited === false,
      `${plan.id} host seam inheritance`,
    );
  } else {
    assert(execution.hostSeamDelta === null, 'capability host seam');
  }
  assert(Array.isArray(execution.actionResults), 'execution action results');
  assert(execution.actionResults.length === plan.actionTypes.length, 'execution action count');
  execution.actionResults.forEach((result, index) => {
    const actionType = plan.actionTypes[index];
    assert(isPlainObject(result), `execution action ${index}`);
    assert(result.index === index, `execution action ${index} index`);
    assert(result.type === actionType, `execution action ${index} type`);
    assert(result.handlerId === `contract/${actionType}`, `execution action ${index} handler`);
    assert(result.status === 'completed', `execution action ${index} status`);
    assertFiniteNumber(result.startedAtMs, `execution action ${index} start`);
    assertFiniteNumber(result.completedAtMs, `execution action ${index} completion`);
    assert(result.completedAtMs >= result.startedAtMs, `execution action ${index} timing`);
    const delta = recordValue(result.delta, `execution action ${index} delta`);
    assert(delta.$schema === DELTA_REVISION, `execution action ${index} delta schema`);
    assert(delta.caseId === plan.id, `execution action ${index} delta case`);
    assert(delta.actionIndex === index, `execution action ${index} delta index`);
    assert(delta.actionType === actionType, `execution action ${index} delta type`);
    assert(isPlainObject(delta.actual), `execution action ${index} actual`);
    universalProduct(delta.actual.product, `execution action ${index} product`);
    inputEvidenceAt(execution, index);
  });
  assert(Array.isArray(execution.eventJournal), 'execution event journal');
  assert(Array.isArray(execution.eventJournalFailures), 'execution journal failures');
  assert(execution.eventJournalFailures.length === 0, 'execution journal failures empty');
  assert(isPlainObject(execution.bindings), 'execution bindings');
  assert(Array.isArray(execution.captures), 'execution captures');
  assert(isPlainObject(execution.terminalSnapshot), 'terminal snapshot');
  assert(isPlainObject(execution.terminalSemanticProbe), 'terminal semantic probe');
  assert(isPlainObject(execution.cleanup), 'execution cleanup');
  assert(execution.cleanup.status === 'completed', 'execution cleanup status');
  assert(Array.isArray(execution.cleanup.errors), 'execution cleanup errors');
  assert(execution.cleanup.errors.length === 0, 'execution cleanup errors empty');
  return execution;
}

function validateTerminalCorrelation(execution, finalProduct) {
  assert(
    sameJson(finalProduct.snapshot, execution.terminalSnapshot),
    'final product/terminal snapshot correlation',
  );
  assert(
    sameJson(finalProduct.semantic, execution.terminalSemanticProbe),
    'final product/terminal semantic correlation',
  );
}


function projectCaptures(plan, execution) {
  const projected = {};
  for (const [name, value] of Object.entries(execution.bindings)) {
    assert(name.length > 0, 'binding name');
    assignOwned(projected, name, clone(value), `binding ${name}`);
  }

  const declared = new Map(plan.checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]));
  const seen = new Set();
  for (const captureValue of execution.captures) {
    const capture = recordValue(captureValue, 'execution capture');
    const id = stringValue(capture.id, 'capture ID');
    assert(!seen.has(id), `duplicate capture ${id}`);
    seen.add(id);
    const checkpoint = declared.get(id);
    assert(checkpoint !== undefined, `undeclared capture ${id}`);
    assert(capture.phase === checkpoint.phase, `capture ${id} phase`);
    assert(capture.afterActionIndex === checkpoint.afterActionIndex, `capture ${id} action index`);
    const values = recordValue(capture.values, `capture ${id} values`);
    const nested = {};
    for (const path of checkpoint.paths) {
      assert(Object.hasOwn(values, path), `capture ${id} missing ${path}`);
      assignPath(nested, path.split('/'), clone(values[path]), `capture ${id}`);
    }
    assignOwned(projected, id, nested, `capture ${id}`);
  }
  assert(seen.size === declared.size, 'execution must contain every declared capture');
  return projected;
}
