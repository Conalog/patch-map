import {
  actionActualAt,
  arrayValue,
  assert,
  booleanValue,
  boundsValue,
  clone,
  cloneArray,
  cloneRecord,
  eventCount,
  finiteNumber,
  geometryEntity,
  inputEvidence,
  mutationDiagnostic,
  mutationTargetIds,
  nonNegativeInteger,
  nullableString,
  pointValue,
  positionTuple,
  productAt,
  productRecord,
  recordValue,
  sameJson,
  sizeTuple,
  staleRelationCount,
  stringArray,
  stringValue,
  targetSetResult,
} from './values.mjs';

export function projectValidationFailures(actual, execution) {
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

export function projectStableTarget(actual, execution) {
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

export function projectPartialMerge(actual, execution, plan) {
  const frozen = actionActualAt(execution, 0, 'freezePatch');
  const merged = actionActualAt(execution, 1, 'merge');
  const empty = actionActualAt(execution, 2, 'merge');
  const target = recordValue(plan.fixture.setup.params.target, 'UPD-002 target');
  stringValue(target.ownerId, 'UPD-002 owner ID');
  stringValue(target.id, 'UPD-002 target ID');
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

export function projectReplacement(actual, execution) {
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

export function projectGeometryOrigin(actual, execution) {
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

export function projectMissingTargets(actual, execution) {
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

export function projectAtomicBulk(actual, execution) {
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

export function projectComponents(actual, execution) {
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
