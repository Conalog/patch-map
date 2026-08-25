import {
  actionActualAt,
  assert,
  boundsValue,
  clone,
  cloneArray,
  finiteNumber,
  mutationDiagnostic,
  nonNegativeInteger,
  pointValue,
  productAt,
  productRecord,
  recordValue,
  relationRows,
  requireMapValue,
  requireRelation,
  sameJson,
  staleRelationCount,
  stringArray,
  stringValue,
  tupleAt,
  visibleRelationKeys,
} from './values.mjs';

export function projectStructure(actual, execution) {
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

export function projectRelations(actual, execution) {
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

export function projectAsyncRevision(actual, execution) {
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

export function projectHostPresentation(actual, execution) {
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

export function projectLiveOverlay(actual, execution) {
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

export function projectSemanticRefresh(actual, execution) {
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
