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
});
const CONSUMER_CASE_IDS = new Set([
  'CSM-005',
  'CSM-006',
  'CSM-007',
  'CSM-008',
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

/**
 * Fold detached public product captures for eighteen update/error/consumer cases.
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

function projectConsumerInvariants(actual, execution, product) {
  const semantic = recordValue(product.semantic, 'consumer semantic product');
  const semanticGeometry = recordValue(
    semantic.geometry,
    'consumer semantic geometry',
  );
  const semanticText = recordValue(semantic.text, 'consumer semantic text');
  const semanticPaint = recordValue(semantic.paint, 'consumer semantic paint');
  const semanticInteraction = recordValue(
    semantic.interaction,
    'consumer semantic interaction',
  );
  const semanticHistory = recordValue(
    semantic.history,
    'consumer semantic history',
  );
  const revisionValues = execution.actionResults.map((_, index) =>
    recordValue(
      productAt(execution, index).snapshot.revisions,
      `consumer action ${index} revisions`,
    ));

  actual.revisions.valuesFinite = allNumbersFinite(revisionValues);
  actual.geometry.nonFiniteCount = nonNegativeInteger(
    semanticGeometry.nonFiniteValueCount,
    'consumer non-finite geometry count',
  );
  actual.text = {
    _availability: { semanticProbe: 'available' },
    unpairedSurrogates: nonNegativeInteger(
      semanticText.unpairedSurrogateCount,
      'consumer unpaired surrogate count',
    ),
    targets: {},
  };
  actual.paint.unresolvedIntentCount = nonNegativeInteger(
    semanticPaint.unresolvedCount,
    'consumer unresolved paint count',
  );
  actual.paint.targets = {};
  actual.interaction.staleGestureCount = nonNegativeInteger(
    semanticInteraction.activeGestureCount ?? 0,
    'consumer stale gesture count',
  );
  actual.events.unclassifiedCount = execution.eventJournal.filter((entryValue) => {
    const entry = recordValue(entryValue, 'consumer event journal entry');
    return !CLASSIFIED_ENGINE_EVENTS.has(
      stringValue(entry.event, 'consumer event journal type'),
    );
  }).length;
  actual.history.corruptEntryCount = semanticHistory.corruptCount === undefined
    ? historyCorruptEntryCount(product.history)
    : nonNegativeInteger(
      semanticHistory.corruptCount,
      'consumer corrupt history count',
    );
  actual.resources.leakDelta = cleanupLeakDelta(execution.cleanup);
}

function projectValidationFailures(actual, execution) {
  const matrix = actionActualAt(
    execution,
    1,
    'run-invalid-operation-matrix',
  );
  const product = productAt(execution, 1);
  const results = arrayValue(matrix.results, 'ERR-001 invalid results');
  const cases = results.map((resultValue, index) => {
    const result = recordValue(resultValue, `ERR-001 invalid result ${index}`);
    const diagnostic = recordValue(
      result.diagnostic,
      `ERR-001 invalid diagnostic ${index}`,
    );
    const input = recordValue(result.input, `ERR-001 invalid input ${index}`);
    inputEvidence(input, `ERR-001 invalid input ${index}`);
    return {
      id: stringValue(result.id, `ERR-001 invalid ID ${index}`),
      operation: stringValue(
        result.operation,
        `ERR-001 invalid operation ${index}`,
      ),
      code: stringValue(
        diagnostic.code,
        `ERR-001 invalid diagnostic code ${index}`,
      ),
      category: nullableString(
        diagnostic.category,
        `ERR-001 invalid diagnostic category ${index}`,
      ),
      datasetPath: nullableString(
        diagnostic.datasetPath,
        `ERR-001 invalid diagnostic path ${index}`,
      ),
      atomic: booleanValue(result.atomic, `ERR-001 atomic result ${index}`),
      inputUnchanged: input.unchanged,
    };
  });
  const snapshot = recordValue(product.snapshot, 'ERR-001 product snapshot');
  const revisions = recordValue(snapshot.revisions, 'ERR-001 revisions');

  actual.revisions.scene = nonNegativeInteger(
    revisions.sceneRevision,
    'ERR-001 scene revision',
  );
  actual.scene.semanticHash = stringValue(
    product.dataset.semanticHash,
    'ERR-001 semantic hash',
  );
  actual.interaction.selectedTargets = stringArray(
    snapshot.selectionIds,
    'ERR-001 selected targets',
  );
  actual.outcome.invalidCaseCount = cases.length;
  actual.outcome.codes = cases.map(({ code }) => code);
  actual.outcome.invalidCases = cases;
  actual.outcome.inputUnchanged =
    actual.outcome.inputUnchanged &&
    cases.every(({ inputUnchanged }) => inputUnchanged);
}

function projectStableUpdateJourney(actual, execution) {
  const merged = actionActualAt(execution, 3, 'apply-merge');
  const failure = actionActualAt(execution, 4, 'probe-declared-failure');
  const product = productAt(execution, 4);
  const snapshot = recordValue(product.snapshot, 'CSM-005 snapshot');
  const semanticInteraction = recordValue(
    product.semantic.interaction,
    'CSM-005 semantic interaction',
  );
  const result = recordValue(merged.result, 'CSM-005 merge result');
  const target = recordValue(merged.record, 'CSM-005 target');
  const targetId = stringValue(target.id, 'CSM-005 target ID');
  const attrs = recordValue(target.attrs, 'CSM-005 target attrs');
  const x = finiteNumber(attrs.x, 'CSM-005 target x');
  const entity = geometryEntity(product, targetId);
  const rollback = cloneRecord(failure.rollback, 'CSM-005 failure rollback');
  const selectedIds = stringArray(
    snapshot.selectionIds,
    'CSM-005 selected IDs',
  );
  const mode = stringValue(
    semanticInteraction.mode,
    'CSM-005 interaction mode',
  );
  const applied = mutationTargetIds(result.applied, 'CSM-005 applied targets');
  const missing = mutationTargetIds(result.missing, 'CSM-005 missing targets');
  const unchanged = mutationTargetIds(
    result.unchanged,
    'CSM-005 unchanged targets',
  );

  actual.scene.targets = {
    [targetId]: { id: targetId },
  };
  actual.geometry.targets = {
    [targetId]: { worldBounds: namedBounds(entity.worldBounds, 'CSM-005 bounds') },
  };
  actual.paint.unresolvedIntentCount = Math.max(
    actual.paint.unresolvedIntentCount,
    nonNegativeInteger(
      merged.unresolvedIntentCount,
      'CSM-005 unresolved intent count',
    ),
  );
  actual.outcome.applied = applied;
  actual.outcome.hostEngineSeam = {
    engineReturns: {
      applied,
      missing,
      unchanged,
      sceneRevision: nonNegativeInteger(
        snapshot.revisions.sceneRevision,
        'CSM-005 scene revision',
      ),
    },
    failureRollback: rollback,
    finalState: {
      targetId,
      x,
      selectedIds,
      mode,
    },
  };
  assert(
    namedBounds(entity.worldBounds, 'CSM-005 bounds correlation').x === x,
    'CSM-005 target/bounds x correlation',
  );
}

function projectLiveOverlayJourney(actual, execution) {
  const loaded = actionActualAt(execution, 0, 'load-scene');
  const applied = actionActualAt(execution, 1, 'apply-live-overlay');
  const published = actionActualAt(execution, 2, 'await-frame');
  const failure = actionActualAt(execution, 3, 'probe-declared-failure');
  const product = productAt(execution, 3);
  const snapshot = recordValue(product.snapshot, 'CSM-006 snapshot');
  const facts = recordValue(published.facts, 'CSM-006 overlay facts');
  const components = recordValue(facts.components, 'CSM-006 components');
  const bar = journeyComponentRecord(components, 'bar', 'CSM-006');
  const label = journeyComponentRecord(components, 'label', 'CSM-006');
  const icon = journeyComponentRecord(components, 'icon', 'CSM-006');
  const barSize = namedSize(bar.size, 'CSM-006 bar size');
  const text = stringValue(label.text, 'CSM-006 label text');
  const tint = canonicalRgba(icon.tint, 'CSM-006 icon tint');
  const applyResult = recordValue(applied.result, 'CSM-006 overlay result');
  const transaction = recordValue(
    applyResult.transaction,
    'CSM-006 overlay transaction',
  );
  const appliedTargets = rootMutationTargetIds(
    transaction.applied,
    'CSM-006 applied targets',
  );
  const publication = recordValue(
    published.result,
    'CSM-006 publication result',
  );
  const selectedIds = stringArray(facts.selectedIds, 'CSM-006 selected IDs');
  const mode = stringValue(facts.mode, 'CSM-006 interaction mode');
  const targetId = stringValue(applied.target, 'CSM-006 target ID');
  const rollback = cloneRecord(failure.rollback, 'CSM-006 failure rollback');
  const loadedSceneRevision = nonNegativeInteger(
    recordValue(
      recordValue(loaded.product, 'CSM-006 load product').snapshot,
      'CSM-006 load snapshot',
    ).revisions.sceneRevision,
    'CSM-006 loaded scene revision',
  );
  const sceneRevision = nonNegativeInteger(
    snapshot.revisions.sceneRevision,
    'CSM-006 scene revision',
  );

  actual.scene.rootIds = stringArray(facts.rootIds, 'CSM-006 root IDs');
  actual.scene.targets = {
    [targetId]: {
      components: {
        bar: { size: barSize },
      },
    },
  };
  actual.text.targets = {
    [targetId]: { label: { source: text } },
  };
  actual.paint.targets = {
    [targetId]: { icon: { tint } },
  };
  actual.paint.unresolvedIntentCount = Math.max(
    actual.paint.unresolvedIntentCount,
    nonNegativeInteger(
      facts.unresolvedIntentCount,
      'CSM-006 unresolved intent count',
    ),
  );
  actual.revisions.sceneDelta = sceneRevision - loadedSceneRevision;
  actual.outcome.hostEngineSeam = {
    engineReturns: {
      appliedTargets,
      sceneRevision,
      publication: stringValue(
        publication.status,
        'CSM-006 publication status',
      ),
    },
    failureRollback: rollback,
    finalState: {
      itemId: targetId,
      text,
      selectedIds,
      mode,
      barSize,
    },
  };
}

function projectRapidRefreshJourney(actual, execution) {
  const completed = actionActualAt(
    execution,
    3,
    'complete-overlay-revisions',
  );
  const failure = actionActualAt(execution, 5, 'probe-declared-failure');
  const product = productAt(execution, 5);
  const snapshot = recordValue(product.snapshot, 'CSM-007 snapshot');
  const facts = recordValue(
    failure.completedFacts,
    'CSM-007 completed facts',
  );
  const completedFacts = recordValue(
    completed.facts,
    'CSM-007 completion facts',
  );
  assert(
    sameJson(facts, completedFacts),
    'CSM-007 complete-scene preservation',
  );
  const components = recordValue(facts.components, 'CSM-007 components');
  const bar = journeyComponentRecord(components, 'bar', 'CSM-007');
  const barSize = namedSize(bar.size, 'CSM-007 bar size');
  const acceptedHostRevision = nonNegativeInteger(
    failure.acceptedHostRevision,
    'CSM-007 accepted host revision',
  );
  const supersededHostRevisions = integerArray(
    failure.supersededHostRevisions,
    'CSM-007 superseded host revisions',
  );
  const postDestroy = recordValue(
    failure.postDestroy,
    'CSM-007 post-destroy facts',
  );
  const afterDestroyCount = nonNegativeInteger(
    postDestroy.callbacks,
    'CSM-007 callbacks after destroy',
  );
  const rollback = cloneRecord(failure.rollback, 'CSM-007 failure rollback');

  actual.scene.targets = {
    'item-a': {
      components: {
        bar: { size: barSize },
      },
    },
  };
  actual.paint.unresolvedIntentCount = Math.max(
    actual.paint.unresolvedIntentCount,
    nonNegativeInteger(
      facts.unresolvedIntentCount,
      'CSM-007 unresolved intent count',
    ),
  );
  actual.events.afterDestroyCount = afterDestroyCount;
  actual.outcome.acceptedHostRevision = acceptedHostRevision;
  actual.outcome.supersededHostRevisions = supersededHostRevisions;
  actual.outcome.hostEngineSeam = {
    engineReturns: {
      acceptedHostRevision,
      supersededHostRevisions,
      finalBarSize: barSize,
    },
    failureRollback: rollback,
    finalState: {
      lifecycle: stringValue(snapshot.lifecycle, 'CSM-007 lifecycle'),
      acceptedHostRevision,
      pendingWork: nonNegativeInteger(
        snapshot.pendingWork,
        'CSM-007 pending work',
      ),
    },
  };
}

function projectPresentationExportJourney(actual, execution) {
  const presented = actionActualAt(
    execution,
    1,
    'apply-presentation-overlay',
  );
  const exported = actionActualAt(
    execution,
    2,
    'export-canonical-dataset',
  );
  const failure = actionActualAt(execution, 3, 'probe-declared-failure');
  const product = productAt(execution, 3);
  const snapshot = recordValue(product.snapshot, 'CSM-008 snapshot');
  const presentation = recordValue(
    presented.presentation,
    'CSM-008 presentation probe',
  );
  const highlightedIds = stringArray(
    presentation.highlightIds,
    'CSM-008 highlighted IDs',
  );
  const hiddenRelationIds = stringArray(
    presentation.hiddenLayerIds,
    'CSM-008 hidden relation IDs',
  );
  const entities = arrayValue(
    presentation.entities,
    'CSM-008 presentation entities',
  );
  const links = entities.find((entryValue) =>
    isPlainObject(entryValue) && entryValue.id === 'links');
  assert(links !== undefined, 'CSM-008 relation presentation');
  const relationVisible = booleanValue(
    recordValue(links, 'CSM-008 relation presentation').visible,
    'CSM-008 relation visibility',
  );
  const exportFacts = recordValue(exported.export, 'CSM-008 export facts');
  const fingerprint = stringValue(
    exportFacts.fingerprint,
    'CSM-008 export fingerprint',
  );
  const unchanged = booleanValue(
    exportFacts.unchanged,
    'CSM-008 export unchanged',
  );
  const reportedDatasetHash = unchanged
    ? 'baseline-dataset-hash'
    : fingerprint;
  const selectedIds = stringArray(
    snapshot.selectionIds,
    'CSM-008 selected IDs',
  );
  const rollback = cloneRecord(failure.rollback, 'CSM-008 failure rollback');

  actual.interaction.highlightedTargets = highlightedIds;
  actual.scene.targets = {
    links: { visible: relationVisible },
  };
  actual.scene.export = {
    semanticHash: fingerprint,
    baselineFingerprint: stringValue(
      exportFacts.baselineFingerprint,
      'CSM-008 baseline fingerprint',
    ),
    unchanged,
  };
  actual.paint.unresolvedIntentCount = Math.max(
    actual.paint.unresolvedIntentCount,
    nonNegativeInteger(
      presented.unresolvedIntentCount,
      'CSM-008 unresolved intent count',
    ),
  );
  actual.outcome.hostEngineSeam = {
    engineReturns: {
      highlightedIds,
      hiddenRelationIds,
      exportedDatasetHash: reportedDatasetHash,
      observedDatasetFingerprint: fingerprint,
    },
    failureRollback: rollback,
    finalState: {
      selectedIds,
      highlightedIds,
      relationPresentationHidden: hiddenRelationIds,
      datasetHash: reportedDatasetHash,
      observedDatasetFingerprint: fingerprint,
    },
  };
}

function projectStableTarget(actual, execution) {
  const resolved = actionActualAt(execution, 3, 'resolveTarget');
  const stale = actionActualAt(execution, 4, 'patch');
  const currentTarget = recordValue(resolved.currentTarget, 'UPD-001 current target');
  const target = recordValue(stale.result, 'UPD-001 stale result');
  const diagnostic = mutationDiagnostic(stale, target, 'UPD-001 stale patch');

  actual.scene.currentTarget = {
    ownerId: stringValue(currentTarget.ownerId, 'UPD-001 current owner'),
    id: stringValue(currentTarget.id, 'UPD-001 current ID'),
    lifecycleGeneration: nonNegativeInteger(
      currentTarget.lifecycleGeneration,
      'UPD-001 lifecycle generation',
    ),
    size: cloneRecord(currentTarget.size, 'UPD-001 current size'),
  };
  actual.outcome.stalePatch = {
    code: stringValue(diagnostic.code, 'UPD-001 stale code'),
  };
  assert(target.status === 'rejected', 'UPD-001 stale patch must be rejected');
  assert(
    sameJson(productAt(execution, 3).dataset, productAt(execution, 4).dataset),
    'UPD-001 stale patch authority continuity',
  );
}

function projectPartialMerge(actual, execution, plan) {
  const frozen = actionActualAt(execution, 0, 'freezePatch');
  const merged = actionActualAt(execution, 1, 'merge');
  const empty = actionActualAt(execution, 2, 'merge');
  const target = recordValue(plan.fixture.setup.params.target, 'UPD-002 target');
  const ownerId = stringValue(target.ownerId, 'UPD-002 owner ID');
  const targetId = stringValue(target.id, 'UPD-002 target ID');
  const finalComponent = recordValue(empty.record, 'UPD-002 target record');
  const emptyEvents = recordValue(empty.events, 'UPD-002 empty events');
  const frozenPatch = cloneRecord(frozen.patch, 'UPD-002 frozen patch');

  assert(frozen.frozen === true, 'UPD-002 patch must be frozen');
  assert(
    sameJson(frozenPatch, plan.fixture.setup.params.patch),
    'UPD-002 frozen patch fixture correlation',
  );
  assert(
    recordValue(merged.result, 'UPD-002 merge result').status === 'committed',
    'UPD-002 merge status',
  );
  assert(
    recordValue(empty.result, 'UPD-002 empty result').status === 'unchanged',
    'UPD-002 empty merge status',
  );

  actual.scene.target = {
    size: cloneRecord(finalComponent.size, 'UPD-002 target size'),
    source: clone(finalComponent.source),
  };
  actual.scene.siblings = cloneArray(empty.siblings, 'UPD-002 final siblings');
  actual.scene.emptyPatch = {
    revisionDelta: nonNegativeInteger(empty.revisionDelta, 'UPD-002 empty revision delta'),
    events: {
      count: eventCount(emptyEvents, 'UPD-002 empty events'),
    },
  };
  actual.outcome.input = { patch: frozenPatch };
}

function projectReplacement(actual, execution) {
  const afterRectAction = actionActualAt(execution, 0, 'replace');
  const afterKindAction = actionActualAt(execution, 1, 'replace');
  const invalidAction = actionActualAt(execution, 2, 'replace');
  const afterRect = recordValue(afterRectAction.record, 'UPD-003 rectangle record');
  const afterKind = recordValue(afterKindAction.record, 'UPD-003 kind record');
  const invalidResult = recordValue(invalidAction.result, 'UPD-003 invalid result');
  const diagnostic = mutationDiagnostic(invalidAction, invalidResult, 'UPD-003 invalid replace');
  const queried = recordValue(invalidAction.record, 'UPD-003 queried record');

  actual.scene.afterRect = {
    id: stringValue(afterRect.id, 'UPD-003 rectangle ID'),
    size: sizeTuple(afterRect.size, 'UPD-003 rectangle size'),
    attrs: afterRect.attrs === undefined ? null : clone(afterRect.attrs),
  };
  actual.scene.afterKind = {
    type: stringValue(afterKind.type, 'UPD-003 replacement type'),
    id: stringValue(afterKind.id, 'UPD-003 replacement ID'),
  };
  actual.scene.query = {
    [queried.id]: { type: stringValue(queried.type, 'UPD-003 queried type') },
  };
  actual.outcome.invalidCrossScope = {
    // Preserve the public Engine diagnostic verbatim. The approved immutable
    // comparison currently expects a different label and must remain a visible
    // conflict rather than being aliased here.
    code: stringValue(diagnostic.code, 'UPD-003 invalid code'),
    publicationCount: nonNegativeInteger(
      invalidAction.publicationCount,
      'UPD-003 invalid publication count',
    ),
  };
  assert(invalidResult.status === 'rejected', 'UPD-003 invalid replace must reject');
  assert(
    sameJson(productAt(execution, 1).dataset, productAt(execution, 2).dataset),
    'UPD-003 invalid replace authority continuity',
  );
}

function projectGeometryOrigin(actual, execution) {
  const absolute = actionActualAt(execution, 0, 'patch');
  const relative = actionActualAt(execution, 1, 'relativePatch');
  const resized = actionActualAt(execution, 2, 'resizeAroundOrigin');
  const absoluteRecord = recordValue(absolute.record, 'UPD-004 absolute record');
  const relativeRecord = recordValue(relative.record, 'UPD-004 relative record');
  const resizedRecord = recordValue(resized.record, 'UPD-004 resized record');
  const beforeEntity = geometryEntity(
    productRecord(resized.before, 'UPD-004 resize before'),
    stringValue(resized.targetId, 'UPD-004 target ID'),
  );
  const afterProduct = productAt(execution, 2);
  const afterEntity = geometryEntity(afterProduct, resized.targetId);
  const afterGeometry = recordValue(afterProduct.geometry, 'UPD-004 after geometry');
  const selectionOverlay = recordValue(
    afterGeometry.selectionOverlay,
    'UPD-004 selection overlay',
  );
  const hit = recordValue(resized.hit, 'UPD-004 center hit');

  actual.scene.afterAbsolute = {
    position: positionTuple(absoluteRecord, 'UPD-004 absolute position'),
  };
  actual.scene.afterRelative = {
    position: positionTuple(relativeRecord, 'UPD-004 relative position'),
    angle: finiteNumber(
      recordValue(relativeRecord.attrs, 'UPD-004 relative attrs').angle,
      'UPD-004 relative angle',
    ),
  };
  actual.scene.afterResize = {
    size: sizeTuple(resizedRecord.size, 'UPD-004 resized size'),
  };
  actual.scene.relations = {
    staleSegments: staleRelationCount(afterProduct.relations),
  };
  actual.geometry.centerBefore = pointValue(
    beforeEntity.visibleCenter,
    'UPD-004 center before',
  );
  actual.geometry.centerAfter = pointValue(
    afterEntity.visibleCenter,
    'UPD-004 center after',
  );
  actual.interaction.selection = {
    overlayBounds: boundsValue(
      selectionOverlay.screenBounds,
      'UPD-004 selection overlay bounds',
    ),
  };
  actual.interaction.hitTest = {
    center: { id: nullableString(hit.id, 'UPD-004 hit target ID') },
  };
  assert(
    sameJson(actual.geometry.centerBefore, pointValue(resized.centerBefore, 'UPD-004 observed center before')),
    'UPD-004 center-before product correlation',
  );
  assert(
    sameJson(actual.geometry.centerAfter, pointValue(resized.centerAfter, 'UPD-004 observed center after')),
    'UPD-004 center-after product correlation',
  );
  assert(
    sameJson(afterEntity.worldBounds, resized.worldBounds),
    'UPD-004 world-bounds product correlation',
  );
}

function projectMissingTargets(actual, execution) {
  const permissiveMissing = actionActualAt(execution, 0, 'bulkPatch');
  const permissiveMixed = actionActualAt(execution, 1, 'bulkPatch');
  const empty = actionActualAt(execution, 2, 'bulkPatch');
  const strictMixed = actionActualAt(execution, 3, 'bulkPatch');
  const permissiveMissingResult = recordValue(
    permissiveMissing.result,
    'UPD-006 permissive missing result',
  );
  const permissiveMixedResult = recordValue(
    permissiveMixed.result,
    'UPD-006 permissive mixed result',
  );
  const emptyResult = recordValue(empty.result, 'UPD-006 empty result');
  const strictResult = recordValue(strictMixed.result, 'UPD-006 strict result');
  const strictDiagnostic = mutationDiagnostic(
    strictMixed,
    strictResult,
    'UPD-006 strict result',
  );
  const targetId = stringArray(strictMixed.targets, 'UPD-006 strict targets')[0];
  assert(targetId !== undefined, 'UPD-006 strict target');
  const records = recordValue(strictMixed.records, 'UPD-006 strict records');
  const finalTarget = recordValue(records[targetId], `UPD-006 final record ${targetId}`);

  actual.scene.permissiveMissing = targetSetResult(permissiveMissingResult, 'UPD-006 missing');
  actual.scene.permissiveMixed = targetSetResult(permissiveMixedResult, 'UPD-006 mixed');
  actual.outcome.empty = {
    applied: mutationTargetIds(emptyResult.applied, 'UPD-006 empty applied'),
    revisionDelta: nonNegativeInteger(empty.revisionDelta, 'UPD-006 empty revision delta'),
  };
  actual.scene.strictMixed = {
    code: stringValue(strictDiagnostic.code, 'UPD-006 strict code'),
    [targetId]: {
      x: finiteNumber(
        recordValue(finalTarget.attrs, 'UPD-006 final attrs').x,
        'UPD-006 final x',
      ),
    },
  };
  assert(strictResult.status === 'rejected', 'UPD-006 strict mixed must reject');
  assert(
    sameJson(productRecord(strictMixed.before, 'UPD-006 strict before').dataset, productAt(execution, 3).dataset),
    'UPD-006 strict authority continuity',
  );
}

function projectAtomicBulk(actual, execution) {
  const valid = actionActualAt(execution, 1, 'bulkOverlay');
  const frame = actionActualAt(execution, 2, 'publishFrame');
  const invalid = actionActualAt(execution, 3, 'bulkOverlay');
  const validResult = recordValue(valid.result, 'UPD-007 valid bulk result');
  const invalidResult = recordValue(invalid.result, 'UPD-007 invalid bulk result');
  const invalidDiagnostic = mutationDiagnostic(invalid, invalidResult, 'UPD-007 invalid bulk');
  const validProduct = productAt(execution, 1);
  const frameProduct = productAt(execution, 2);
  const finalProduct = productAt(execution, 3);
  const validSnapshot = recordValue(validProduct.snapshot, 'UPD-007 valid snapshot');
  const validRevisions = recordValue(validSnapshot.revisions, 'UPD-007 valid revisions');
  const frameSnapshot = recordValue(frameProduct.snapshot, 'UPD-007 frame snapshot');
  const frameRevisions = recordValue(frameSnapshot.revisions, 'UPD-007 frame revisions');
  const publishedTuple = recordValue(
    frameSnapshot.publishedTuple,
    'UPD-007 published tuple',
  );
  const frameResult = recordValue(frame.result, 'UPD-007 frame result');
  const validEvents = recordValue(valid.events, 'UPD-007 valid events');
  assert(Array.isArray(validEvents.change), 'UPD-007 valid change events');
  assert(validEvents.change.length === 1, 'UPD-007 one atomic change event');
  const changeEvent = recordValue(validEvents.change[0], 'UPD-007 change event');
  const changeRevisions = recordValue(
    changeEvent.revisions,
    'UPD-007 change event revisions',
  );
  const querySceneRevision = nonNegativeInteger(
    valid.queryRevision,
    'UPD-007 query scene revision',
  );
  const eventSceneRevision = nonNegativeInteger(
    valid.eventRevision,
    'UPD-007 event scene revision',
  );
  const publishedSceneRevision = nonNegativeInteger(
    publishedTuple.scene,
    'UPD-007 published scene revision',
  );

  actual.outcome.valid = {
    revisionDelta: nonNegativeInteger(valid.revisionDelta, 'UPD-007 valid revision delta'),
    intermediatePublicationCount: nonNegativeInteger(
      valid.intermediatePublicationCount,
      'UPD-007 intermediate publication count',
    ),
    queryRevision: querySceneRevision,
    eventRevision: eventSceneRevision,
    historyUnits: nonNegativeInteger(
      recordValue(validResult.history, 'UPD-007 valid history').depthDelta,
      'UPD-007 valid history units',
    ),
  };
  actual.outcome.invalid = {
    code: stringValue(invalidDiagnostic.code, 'UPD-007 invalid code'),
    revisionDelta: nonNegativeInteger(invalid.revisionDelta, 'UPD-007 invalid revision delta'),
    scene: nullableString(
      recordValue(finalProduct.snapshot, 'UPD-007 final snapshot').semanticHash,
      'UPD-007 invalid scene token',
    ),
  };
  assert(validResult.status === 'committed', 'UPD-007 valid bulk must commit');
  assert(invalidResult.status === 'rejected', 'UPD-007 invalid bulk must reject');
  assert(
    querySceneRevision === nonNegativeInteger(
      validRevisions.sceneRevision,
      'UPD-007 post-transaction scene revision',
    ),
    'UPD-007 query/product scene revision correlation',
  );
  assert(
    eventSceneRevision === querySceneRevision,
    'UPD-007 event/query scene revision correlation',
  );
  assert(
    eventSceneRevision === nonNegativeInteger(
      changeRevisions.sceneRevision,
      'UPD-007 change event scene revision',
    ),
    'UPD-007 event journal scene revision correlation',
  );
  assert(
    nonNegativeInteger(frame.queryRevision, 'UPD-007 frame query scene revision') ===
      querySceneRevision,
    'UPD-007 post-publish query scene revision correlation',
  );
  assert(
    nonNegativeInteger(frame.eventRevision, 'UPD-007 frame event scene revision') ===
      eventSceneRevision,
    'UPD-007 post-publish event scene revision correlation',
  );
  assert(
    nonNegativeInteger(frameRevisions.sceneRevision, 'UPD-007 frame scene revision') ===
      querySceneRevision &&
      publishedSceneRevision === querySceneRevision,
    'UPD-007 published scene revision correlation',
  );
  assert(
    nonNegativeInteger(frameResult.frameRevision, 'UPD-007 published frame revision') ===
      nonNegativeInteger(frameSnapshot.frameRevision, 'UPD-007 frame counter'),
    'UPD-007 frame counter correlation',
  );
  assert(
    sameJson(frameProduct.dataset, finalProduct.dataset),
    'UPD-007 invalid authority continuity',
  );
  assert(
    sameJson(productRecord(invalid.before, 'UPD-007 invalid before').dataset, finalProduct.dataset),
    'UPD-007 invalid before/after continuity',
  );
  assert(
    finiteNumber(frame.timeMs, 'UPD-007 frame time') >= 0,
    'UPD-007 non-negative frame time',
  );
}

function projectComponents(actual, execution) {
  const reconciled = actionActualAt(execution, 1, 'reconcileComponents');
  const hidden = actionActualAt(execution, 2, 'setComponentVisibility');
  const shown = actionActualAt(execution, 3, 'setComponentVisibility');
  const components = recordValue(reconciled.components, 'UPD-008 components');
  const removed = recordValue(reconciled.removed, 'UPD-008 removed');
  const removedIcon = recordValue(removed.icon, 'UPD-008 removed icon');
  const hiddenVisual = recordValue(hidden.componentVisual, 'UPD-008 hidden visual');
  const shownTarget = recordValue(shown.currentTarget, 'UPD-008 shown target');
  const order = stringArray(components.order, 'UPD-008 component order');
  stringValue(reconciled.ownerId, 'UPD-008 owner ID');
  const shownComponents = recordValue(shown.components, 'UPD-008 shown components');
  const finalIds = stringArray(shownComponents.order, 'UPD-008 shown component order');

  assert(sameJson(order, finalIds), 'UPD-008 component order/product correlation');
  actual.scene.components = {
    order,
    icon: {
      logicalCount: finalIds.filter((id) => id === 'icon').length,
      resources: nonNegativeInteger(
        recordValue(removedIcon.resources, 'UPD-008 icon resources').retainedDelta,
        'UPD-008 icon retained delta',
      ),
    },
    'hidden-label': {
      logicalCount: finalIds.filter((id) => id === 'hidden-label').length,
    },
  };
  actual.scene.hidden = {
    bar: {
      logicalCount: nonNegativeInteger(
        hiddenVisual.logicalCount,
        'UPD-008 hidden logical count',
      ),
      renderObjectCount: nonNegativeInteger(
        hiddenVisual.renderObjectCount,
        'UPD-008 hidden render count',
      ),
    },
  };
  actual.scene.shown = {
    bar: { id: stringValue(shownTarget.id, 'UPD-008 shown bar ID') },
  };
  actual.scene.removed = {
    icon: {
      eventCallbacks: nonNegativeInteger(
        removedIcon.eventCallbacks,
        'UPD-008 removed icon callbacks',
      ),
    },
  };
  actual.resources.retainedDelta = nonNegativeInteger(
    reconciled.retainedDelta,
    'UPD-008 retained resource delta',
  );
}

function projectStructure(actual, execution) {
  const loaded = actionActualAt(execution, 0, 'loadDataset');
  const selected = actionActualAt(execution, 1, 'setSelection');
  const moved = actionActualAt(execution, 2, 'moveAcrossParents');
  const grouped = actionActualAt(execution, 3, 'group');
  const ungrouped = actionActualAt(execution, 4, 'ungroup');
  const unrecorded = actionActualAt(execution, 5, 'moveAcrossParents');
  const cycle = actionActualAt(execution, 6, 'moveAcrossParents');
  const moveHierarchy = recordValue(moved.hierarchy, 'UPD-009 moved hierarchy');
  const ungroupHierarchy = recordValue(ungrouped.hierarchy, 'UPD-009 ungroup hierarchy');
  const movedResult = recordValue(moved.result, 'UPD-009 move result');
  const groupedResult = recordValue(grouped.result, 'UPD-009 group result');
  const ungroupedResult = recordValue(ungrouped.result, 'UPD-009 ungroup result');
  const unrecordedResult = recordValue(unrecorded.result, 'UPD-009 unrecorded result');
  const cycleResult = recordValue(cycle.result, 'UPD-009 cycle result');
  const cycleDiagnostic = mutationDiagnostic(cycle, cycleResult, 'UPD-009 cycle');
  const initialHistory = recordValue(
    productAt(execution, 0).history,
    'UPD-009 initial history',
  );
  const finalProduct = productAt(execution, 6);
  const finalHistory = recordValue(finalProduct.history, 'UPD-009 final history');
  const finalSelection = stringArray(
    recordValue(finalProduct.semantic, 'UPD-009 final semantic').interaction.selectionIds,
    'UPD-009 final selection',
  );

  actual.scene.afterMove = {
    'rect-b': {
      parentId: stringValue(moveHierarchy.parentId, 'UPD-009 moved parent'),
      worldPosition: pointValue(
        moveHierarchy.worldPosition,
        'UPD-009 moved world position',
      ),
    },
  };
  actual.scene.afterUngroup = {
    'rect-b': {
      worldPosition: pointValue(
        ungroupHierarchy.worldPosition,
        'UPD-009 ungroup world position',
      ),
    },
  };
  actual.scene.relations = {
    staleSegments: staleRelationCount(finalProduct.relations),
  };
  actual.interaction.selection = { ids: finalSelection };
  actual.history.hostCompanion = { selectedIds: finalSelection };
  actual.history.unitsDelta =
    nonNegativeInteger(finalHistory.undoDepth, 'UPD-009 final undo depth') -
    nonNegativeInteger(initialHistory.undoDepth, 'UPD-009 initial undo depth');
  actual.outcome.cycle = {
    // Preserve the public product diagnostic. The immutable expected uses the
    // rejected HIERARCHY_CYCLE alias and remains a declared catalog conflict.
    code: stringValue(cycleDiagnostic.code, 'UPD-009 cycle code'),
    revisionDelta: nonNegativeInteger(cycle.revisionDelta, 'UPD-009 cycle revision delta'),
  };

  assert(
    sameJson(selected.selectionIds, ['rect-b']),
    'UPD-009 initial selection product correlation',
  );
  for (const [label, result] of [
    ['move', movedResult],
    ['group', groupedResult],
    ['ungroup', ungroupedResult],
  ]) {
    assert(result.status === 'committed', `UPD-009 ${label} status`);
    const history = recordValue(result.history, `UPD-009 ${label} history`);
    assert(history.recorded === true, `UPD-009 ${label} history recorded`);
    assert(
      nonNegativeInteger(history.depthDelta, `UPD-009 ${label} history depth delta`) === 1,
      `UPD-009 ${label} one history unit`,
    );
  }
  assert(unrecordedResult.status === 'committed', 'UPD-009 unrecorded move status');
  const unrecordedHistory = recordValue(
    unrecordedResult.history,
    'UPD-009 unrecorded history',
  );
  assert(unrecordedHistory.recorded === false, 'UPD-009 unrecorded move history policy');
  assert(
    nonNegativeInteger(unrecordedHistory.depthDelta, 'UPD-009 unrecorded depth delta') === 0,
    'UPD-009 unrecorded move creates no history unit',
  );
  assert(cycleResult.status === 'rejected', 'UPD-009 cycle must reject');
  assert(
    sameJson(productRecord(cycle.before, 'UPD-009 cycle before').dataset, finalProduct.dataset),
    'UPD-009 cycle authority continuity',
  );
  assert(
    sameJson(ungrouped.selectionIds, ['rect-b']),
    'UPD-009 ungroup selection product correlation',
  );
  assert(
    nonNegativeInteger(actual.history.unitsDelta, 'UPD-009 history units delta') === 3,
    'UPD-009 history unit total',
  );
  assert(loaded.input.unchanged === true, 'UPD-009 dataset ownership');
}

function projectRelations(actual, execution) {
  const moved = productAt(execution, 1);
  const hidden = productAt(execution, 2);
  const shown = productAt(execution, 3);
  const removed = productAt(execution, 4);
  const movedRows = relationRows(moved);
  const shownRows = relationRows(shown);
  const removedRows = relationRows(removed);
  const movedPair = requireRelation(movedRows, 'a>b', 'UPD-010 moved pair');
  const selfLink = requireRelation(removedRows, 'a>a', 'UPD-010 self link');
  const selfBounds = boundsValue(selfLink.worldBounds, 'UPD-010 self-link bounds');

  actual.scene.afterMove = {
    'a>b': {
      endWorld: pointValue(
        tupleAt(movedPair.worldEndpoints, 1, 'UPD-010 moved endpoints'),
        'UPD-010 moved endpoint',
      ),
    },
    staleSegments: staleRelationCount(moved.relations),
  };
  actual.scene.hidden = { visibleSegments: visibleRelationKeys(hidden) };
  actual.scene.shown = { visibleSegments: visibleRelationKeys(shown) };
  actual.scene.removed = {
    segmentsToB: removedRows.filter((row) => row.sourceId === 'b' || row.targetId === 'b').length,
  };
  actual.outcome.selfLink = { bounds: { x: selfBounds[0] } };
  actual.outcome.duplicateOrderedPair = {
    count: shownRows.filter((row) => row.key === 'a>b').length,
  };
  actual.outcome.reversePair = {
    count: shownRows.filter((row) => row.key === 'b>a').length,
  };
}

function projectAsyncRevision(actual, execution) {
  const completedB = actionActualAt(execution, 3, 'completeAsyncRevision');
  const completedC = actionActualAt(execution, 4, 'completeAsyncRevision');
  const completedA = actionActualAt(execution, 6, 'completeAsyncRevision');
  const resultB = recordValue(completedB.result, 'UPD-011 result B');
  const resultC = recordValue(completedC.result, 'UPD-011 result C');
  const resultA = recordValue(completedA.result, 'UPD-011 result A');
  assert(resultB.status === 'superseded', 'UPD-011 B superseded');
  assert(resultC.status === 'committed', 'UPD-011 C committed');
  assert(resultA.status === 'superseded', 'UPD-011 A superseded after destroy');
  const published = recordValue(completedA.published, 'UPD-011 published');
  const revisions = cloneArray(published.revisions, 'UPD-011 published revisions')
    .map((value, index) => nonNegativeInteger(value, `UPD-011 revision ${index}`));
  const requestIds = stringArray(published.requestIds, 'UPD-011 request IDs');
  const postDestroy = recordValue(completedA.postDestroy, 'UPD-011 post destroy');
  const temporary = recordValue(completedA.temporary, 'UPD-011 temporary');

  actual.revisions.published = { revisions, requestIds };
  actual.outcome.superseded = {
    events: nonNegativeInteger(
      completedA.supersededEventCount,
      'UPD-011 superseded event count',
    ),
  };
  actual.resources.postDestroy = {
    events: nonNegativeInteger(postDestroy.events, 'UPD-011 post-destroy events'),
    frames: nonNegativeInteger(postDestroy.frames, 'UPD-011 post-destroy frames'),
  };
  actual.resources.temporary = {
    unreleased: nonNegativeInteger(temporary.unreleased, 'UPD-011 unreleased resources'),
  };
  assert(revisions.length === requestIds.length, 'UPD-011 publication tuple lengths');
  assert(
    completedA.input.unchanged === true &&
      completedB.input.unchanged === true &&
      completedC.input.unchanged === true,
    'UPD-011 async dataset ownership',
  );
}

function projectHostPresentation(actual, execution) {
  const highlighted = actionActualAt(execution, 1, 'setLayerVisibility');
  const cleared = actionActualAt(execution, 2, 'clearPresentationPolicy');
  const presentation = recordValue(highlighted.presentation, 'UPD-012 presentation');
  const entities = cloneArray(presentation.entities, 'UPD-012 presentation entities');
  const byId = new Map(entities.map((entry, index) => {
    const entity = recordValue(entry, `UPD-012 entity ${index}`);
    return [stringValue(entity.id, `UPD-012 entity ${index} id`), entity];
  }));
  const item = requireMapValue(byId, 'item-a', 'UPD-012 item-a');
  const rect = requireMapValue(byId, 'rect-b', 'UPD-012 rect-b');
  const text = requireMapValue(byId, 'text-c', 'UPD-012 text-c');
  const links = requireMapValue(byId, 'links', 'UPD-012 links');
  const finalPresentation = recordValue(cleared.presentation, 'UPD-012 cleared presentation');
  const persisted = recordValue(cleared.persisted, 'UPD-012 persisted');

  actual.paint.highlight = {
    'item-a': { emphasis: finiteNumber(item.emphasis, 'UPD-012 item emphasis') },
    'rect-b': { emphasis: finiteNumber(rect.emphasis, 'UPD-012 rect emphasis') },
    'text-c': { emphasis: finiteNumber(text.emphasis, 'UPD-012 text emphasis') },
  };
  actual.scene.hidden = {
    links: {
      renderObjectCount: nonNegativeInteger(
        links.renderObjectCount,
        'UPD-012 hidden link objects',
      ),
    },
  };
  actual.scene.persisted = {
    links: clone(persisted.links),
    elements: clone(persisted.elements),
  };
  actual.scene.cleared = {
    presentation: stringValue(finalPresentation.status, 'UPD-012 cleared status'),
  };
  assert(presentation.status === 'active', 'UPD-012 active presentation');
  assert(links.visible === false, 'UPD-012 links hidden');
  assert(finalPresentation.status === 'normal', 'UPD-012 presentation cleared');
}

function projectLiveOverlay(actual, execution) {
  const streamed = actionActualAt(execution, 0, 'streamOverlay');
  const published = actionActualAt(execution, 1, 'publishFrame');
  const acceptedEvents = cloneArray(streamed.acceptedEvents, 'UPD-013 accepted events');
  const acceptedRevisions = acceptedEvents.map((entry, index) => {
    const event = recordValue(entry, `UPD-013 accepted event ${index}`);
    return nonNegativeInteger(event.sourceRevision, `UPD-013 accepted revision ${index}`);
  });
  const semantic = recordValue(streamed.overlay, 'UPD-013 semantic overlay');
  const latestSemantic = recordValue(
    semantic.latestAccepted,
    'UPD-013 latest accepted overlay',
  );
  const frame = recordValue(published.overlay, 'UPD-013 frame overlay');
  const latestFrame = recordValue(frame.latestPublished, 'UPD-013 latest published overlay');
  const publicationEvents = cloneArray(
    published.publicationEvents,
    'UPD-013 publication events',
  );
  assert(publicationEvents.length === 1, 'UPD-013 one coalesced publication event');
  const lastPublication = recordValue(publicationEvents[0], 'UPD-013 last publication');

  actual.outcome.accepted = { revisions: acceptedRevisions };
  actual.outcome.semantic = {
    latestRevision: nonNegativeInteger(
      latestSemantic.sourceRevision,
      'UPD-013 semantic revision',
    ),
    latestPayloadHash: stringValue(
      latestSemantic.payloadHash,
      'UPD-013 semantic payload hash',
    ),
  };
  actual.revisions.frame.latestRevision = nonNegativeInteger(
    latestFrame.sourceRevision,
    'UPD-013 frame source revision',
  );
  actual.revisions.frame.latestPayloadHash = stringValue(
    latestFrame.payloadHash,
    'UPD-013 frame payload hash',
  );
  actual.events.publication = {
    last: {
      revision: nonNegativeInteger(
        lastPublication.sourceRevision,
        'UPD-013 publication revision',
      ),
    },
    pendingCount: nonNegativeInteger(
      frame.pendingPublicationCount,
      'UPD-013 pending publication count',
    ),
  };
  assert(
    nonNegativeInteger(frame.publicationCount, 'UPD-013 publication count') === 1,
    'UPD-013 one publication',
  );
}

function projectSemanticRefresh(actual, execution) {
  const before = actionActualAt(execution, 0, 'snapshot');
  const refreshed = actionActualAt(execution, 2, 'refresh');
  const published = actionActualAt(execution, 3, 'publishFrame');
  const result = recordValue(refreshed.result, 'UPD-014 refresh result');
  const previousRevisions = recordValue(
    result.previousRevisions,
    'UPD-014 previous revisions',
  );
  const revisions = recordValue(result.revisions, 'UPD-014 revisions');
  const product = productRecord(published.product, 'UPD-014 published product');
  const snapshot = recordValue(product.snapshot, 'UPD-014 published snapshot');
  const publishedTuple = recordValue(snapshot.publishedTuple, 'UPD-014 published tuple');

  actual.scene.refresh = {
    revisionDelta:
      nonNegativeInteger(revisions.sceneRevision, 'UPD-014 revision after') -
      nonNegativeInteger(previousRevisions.sceneRevision, 'UPD-014 revision before'),
    recomputedTargets: stringArray(
      result.recomputedTargets,
      'UPD-014 recomputed targets',
    ),
    dataDiffCount: nonNegativeInteger(result.dataDiffCount, 'UPD-014 data diff count'),
  };
  actual.interaction.selection = stringArray(
    snapshot.selectionIds,
    'UPD-014 final selection',
  );
  actual.history.snapshot = clone(product.history);
  actual.scene.ids = stringArray(refreshed.ids, 'UPD-014 stable IDs');
  actual.revisions.frame.revision = nonNegativeInteger(
    publishedTuple.scene,
    'UPD-014 frame represented scene revision',
  );
  assert(result.status === 'committed', 'UPD-014 refresh committed');
  assert(
    sameJson(before.snapshot.history, product.history),
    'UPD-014 history unchanged',
  );
  assert(
    sameJson(before.snapshot.selection, snapshot.selectionIds),
    'UPD-014 selection unchanged',
  );
  assert(
    sameJson(before.snapshot.ids, refreshed.ids),
    'UPD-014 IDs unchanged',
  );
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

function universalProduct(value, label) {
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

function productAt(execution, index) {
  return universalProduct(actionActualAt(execution, index).product, `action ${index} product`);
}

function productRecord(value, label) {
  return universalProduct(value, label);
}

function actionActualAt(execution, index, type) {
  const result = execution.actionResults[index];
  assert(result !== undefined, `action ${index} exists`);
  if (type !== undefined) assert(result.type === type, `action ${index} requires ${type}`);
  return recordValue(recordValue(result.delta, `action ${index} delta`).actual, `action ${index} actual`);
}

function inputEvidenceAt(execution, index) {
  const input = recordValue(actionActualAt(execution, index).input, `action ${index} input`);
  return inputEvidence(input, `action ${index} input`);
}

function inputEvidence(input, label) {
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

function mutationDiagnostic(action, result, label) {
  const candidate = action.diagnostic ?? result.transactionDiagnostic ?? result.diagnostic;
  return recordValue(candidate, `${label} diagnostic`);
}

function targetSetResult(result, label) {
  return {
    applied: mutationTargetIds(result.applied, `${label} applied`),
    missing: mutationTargetIds(result.missing, `${label} missing`),
  };
}

function rootMutationTargetIds(value, label) {
  const roots = mutationTargets(value, label).map((target, index) => {
    if (typeof target === 'string') return target;
    const record = recordValue(target, `${label}[${index}]`);
    return record.kind === 'component'
      ? stringValue(record.ownerId, `${label}[${index}].ownerId`)
      : stringValue(record.id, `${label}[${index}].id`);
  });
  return [...new Set(roots)];
}

function mutationTargetIds(value, label) {
  return mutationTargets(value, label).map((entry, index) => {
    if (typeof entry === 'string') return entry;
    const target = recordValue(entry, `${label}[${index}]`);
    return stringValue(target.id, `${label}[${index}].id`);
  });
}

function mutationTargets(value, label) {
  return arrayValue(value, label);
}

function journeyComponentRecord(components, id, caseId) {
  const component = recordValue(
    components[id],
    `${caseId} ${id} component facts`,
  );
  return recordValue(component.record, `${caseId} ${id} record`);
}

function namedBounds(value, label) {
  const tuple = boundsValue(value, label);
  return {
    x: tuple[0],
    y: tuple[1],
    width: tuple[2],
    height: tuple[3],
  };
}

function namedSize(value, label) {
  const size = recordValue(value, label);
  return {
    width: finiteNumber(size.width, `${label} width`),
    height: finiteNumber(size.height, `${label} height`),
  };
}

function canonicalRgba(value, label) {
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

function geometryEntity(product, id) {
  const geometry = recordValue(product.geometry, `geometry for ${id}`);
  assert(Array.isArray(geometry.entities), `geometry entities for ${id}`);
  const entity = geometry.entities.find((candidate) =>
    isPlainObject(candidate) && candidate.id === id);
  assert(entity !== undefined, `geometry entity ${id}`);
  return entity;
}

function relationRows(product) {
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

function requireRelation(rows, key, label) {
  const row = rows.find((candidate) => candidate.key === key);
  assert(row !== undefined, label);
  return row;
}

function requireMapValue(map, key, label) {
  const value = map.get(key);
  assert(value !== undefined, label);
  return value;
}

function visibleRelationKeys(product) {
  return relationRows(product)
    .filter((row) => row.visible !== false)
    .map((row) => stringValue(row.key, 'visible relation key'));
}

function staleRelationCount(value) {
  if (value === null) return 0;
  const probe = recordValue(value, 'relation probe');
  const omitted = probe.omittedRelations ?? [];
  assert(Array.isArray(omitted), 'omitted relations');
  const revisionLag = probe.revisionLag;
  assert(
    revisionLag === null || (Number.isInteger(revisionLag) && revisionLag >= 0),
    'relation revision lag',
  );
  return omitted.length + (revisionLag === null || revisionLag === 0 ? 0 : 1);
}

function actionEventCount(execution) {
  return execution.actionResults.reduce((count, _, index) => {
    const events = actionActualAt(execution, index).events;
    if (events === undefined) return count;
    return count + eventCount(events, `action ${index} events`);
  }, 0);
}

function eventCount(value, label) {
  const events = recordValue(value, label);
  assertExactKeys(events, ['change', 'frame'], label);
  assert(Array.isArray(events.change), `${label} change`);
  assert(Array.isArray(events.frame), `${label} frame`);
  return events.change.length + events.frame.length;
}

function positionTuple(record, label) {
  const attrs = recordValue(record.attrs, `${label} attrs`);
  return [
    finiteNumber(attrs.x, `${label} x`),
    finiteNumber(attrs.y, `${label} y`),
  ];
}

function sizeTuple(value, label) {
  const size = recordValue(value, label);
  return [
    finiteNumber(size.width, `${label} width`),
    finiteNumber(size.height, `${label} height`),
  ];
}

function pointValue(value, label) {
  return numberTuple(value, 2, label);
}

function boundsValue(value, label) {
  return numberTuple(value, 4, label);
}

function numberTuple(value, length, label) {
  assert(Array.isArray(value) && value.length === length, `${label} tuple`);
  return value.map((entry, index) => finiteNumber(entry, `${label}[${index}]`));
}

function tupleAt(value, index, label) {
  assert(Array.isArray(value), `${label} array`);
  const entry = value[index];
  assert(entry !== undefined, `${label}[${index}]`);
  return entry;
}

function arrayValue(value, label) {
  assert(Array.isArray(value), `${label} array`);
  return value;
}

function integerArray(value, label) {
  return arrayValue(value, label).map((entry, index) =>
    nonNegativeInteger(entry, `${label}[${index}]`));
}

function historyCorruptEntryCount(value) {
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

function cleanupLeakDelta(value) {
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

function allNumbersFinite(value, seen = new WeakSet()) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (value === null || typeof value !== 'object' || seen.has(value)) return true;
  seen.add(value);
  return Object.values(value).every((nested) => allNumbersFinite(nested, seen));
}

function nullableNonNegativeInteger(value, label) {
  if (value === null) return null;
  return nonNegativeInteger(value, label);
}

function nonNegativeInteger(value, label) {
  assert(Number.isInteger(value) && value >= 0, `${label} non-negative integer`);
  return value;
}

function assertUint32(value, label) {
  assert(Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff, `${label} uint32`);
}

function finiteNumber(value, label) {
  assertFiniteNumber(value, label);
  return value;
}

function assertFiniteNumber(value, label) {
  assert(typeof value === 'number' && Number.isFinite(value), `${label} finite number`);
}

function nullableString(value, label) {
  assert(value === null || typeof value === 'string', `${label} nullable string`);
  return value;
}

function booleanValue(value, label) {
  assert(typeof value === 'boolean', `${label} boolean`);
  return value;
}

function stringValue(value, label) {
  assert(typeof value === 'string' && value.length > 0, `${label} non-empty string`);
  return value;
}

function stringArray(value, label) {
  assert(Array.isArray(value), `${label} array`);
  return value.map((entry, index) => stringValue(entry, `${label}[${index}]`));
}

function notExercised(reason) {
  return { _availability: { status: 'not-exercised', reason } };
}

function cloneRecord(value, label) {
  return clone(recordValue(value, label));
}

function cloneArray(value, label) {
  assert(Array.isArray(value), `${label} array`);
  return clone(value);
}

function recordValue(value, label) {
  assert(isPlainObject(value), `${label} object`);
  return value;
}

function assignOwned(target, key, value, label) {
  assert(!Object.hasOwn(target, key), `${label} collision`);
  target[key] = value;
}

function assignPath(target, segments, value, label) {
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

function assertExactKeys(value, expectedKeys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  assert(sameJson(actual, expected), `${label} keys`);
}

function validateJsonValue(value, path, ancestors) {
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

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function clone(value) {
  return structuredClone(value);
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
  if (!condition) throw new Error(`Core v2 update fold invalid: ${message}`);
}
