import {
  actionActualAt,
  allNumbersFinite,
  arrayValue,
  assert,
  booleanValue,
  canonicalRgba,
  cleanupLeakDelta,
  cloneRecord,
  finiteNumber,
  geometryEntity,
  historyCorruptEntryCount,
  integerArray,
  isPlainObject,
  journeyComponentRecord,
  mutationTargetIds,
  namedBounds,
  namedSize,
  nonNegativeInteger,
  productAt,
  recordValue,
  rootMutationTargetIds,
  sameJson,
  stringArray,
  stringValue,
} from './values.mjs';

const CLASSIFIED_ENGINE_EVENTS = new Set([
  'ready',
  'sceneCommitted',
  'drawComplete',
  'frame',
  'diagnostic',
  'destroyed',
]);

export function projectConsumerInvariants(actual, execution, product) {
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

export function projectStableUpdateJourney(actual, execution) {
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

export function projectLiveOverlayJourney(actual, execution) {
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

export function projectRapidRefreshJourney(actual, execution) {
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

export function projectPresentationExportJourney(actual, execution) {
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

export function projectViewColumnJourney(actual, execution) {
  const remounted = actionActualAt(
    execution,
    3,
    'remount-and-restore-column',
  );
  const failure = actionActualAt(
    execution,
    4,
    'probe-declared-failure',
  );
  const facts = recordValue(remounted.facts, 'CSM-014 remounted facts');
  const components = recordValue(facts.components, 'CSM-014 components');
  const bar = journeyComponentRecord(components, 'bar', 'CSM-014');
  const label = journeyComponentRecord(components, 'label', 'CSM-014');
  const barSize = namedSize(bar.size, 'CSM-014 bar size');
  const text = stringValue(label.text, 'CSM-014 label source');
  const selectedColumn = stringValue(
    remounted.remountedColumn,
    'CSM-014 remounted column',
  );
  const appliedColumnTrace = stringArray(
    remounted.appliedColumnTrace,
    'CSM-014 applied column trace',
  );
  const rollback = cloneRecord(
    failure.rollback,
    'CSM-014 failure rollback',
  );
  const mode = stringValue(facts.mode, 'CSM-014 interaction mode');
  const activeCanvasCount = nonNegativeInteger(
    remounted.activeCanvasCount,
    'CSM-014 active canvas count',
  );

  actual.scene.targets = {
    'item-a': {
      components: {
        bar: { size: barSize },
      },
    },
  };
  actual.text.targets = {
    'item-a': {
      label: { source: text },
    },
  };
  actual.paint.unresolvedIntentCount = Math.max(
    actual.paint.unresolvedIntentCount,
    nonNegativeInteger(
      facts.unresolvedIntentCount,
      'CSM-014 unresolved intent count',
    ),
  );
  actual.outcome.appliedColumnTrace = appliedColumnTrace;
  actual.outcome.remountedColumn = selectedColumn;
  actual.outcome.hostEngineSeam = {
    engineReturns: {
      appliedColumnTrace,
      remountedColumn: selectedColumn,
    },
    failureRollback: rollback,
    finalState: {
      selectedColumn,
      text,
      mode,
      barSize,
    },
  };
  assert(activeCanvasCount === 1, 'CSM-014 remount retains one authoritative canvas');
}
