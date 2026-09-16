import 'package:conalog_patch_map/conalog_patch_map.dart';

// Analyzer-only declarations. JSON keys require the separately named runtime witnesses.
void _use(Object? value) {}
Future<void> enginePublicBindings(PatchMapController c) async {
  // api:api.PatchMapDataApi.replace
  _use(c.data.replace([], fit: false));
  // api:api.PatchMapDataApi.serialize
  _use(c.data.serialize(true));
  // api:api.PatchMapDataApi.snapshot
  _use(c.data.snapshot());
  // api:api.PatchMapTargetsApi.get
  _use(c.targets.get(const PatchMapTarget('absent')));
  // api:api.PatchMapTargetsApi.query
  _use(c.targets.query({'type': 'bar'}));
  // api:api.PatchMapHistoryApi.state
  _use(c.history.state);
  // api:api.PatchMapHistoryApi.onChange
  _use(
    c.history.onChange((state) {
      _use(state['cursor']);
    }),
  );
  // api:api.PatchMapHistoryApi.undo
  _use(c.history.undo());
  // api:api.PatchMapHistoryApi.redo
  _use(c.history.redo());
  // api:api.PatchMapHistoryApi.clear
  _use(c.history.clear());
  // api:api.PatchMapSelectionApi.ids
  _use(c.selection.ids);
  // api:api.PatchMapSelectionApi.set
  _use(c.selection.set(['item']));
  // api:api.PatchMapPresentationApi.set
  _use(
    c.presentation.set('dim', {
      'targets': [
        {'id': 'item', 'componentId': 'bar'},
      ],
      'matched': {'alphaMultiplier': .5},
    }),
  );
  // api:api.PatchMapPresentationApi.clear
  _use(c.presentation.clear('dim'));
  // api:api.PatchMapEditorApi.execute
  _use(c.editor.execute({'type': 'enter-relation-edit', 'target': 'rel'}));
  // api:api.PatchMapEditorApi.state
  _use(c.editor.state);
  // api:api.PatchMapViewportApi.panBy
  _use(c.viewport.panBy([12, 8]));
  // api:api.PatchMapViewportApi.zoomBy
  _use(c.viewport.zoomBy(1.5, [120, 80]));
  // api:api.PatchMapViewportApi.restore
  _use(
    c.viewport.restore({
      'centerWorld': [240, 260],
      'scale': 1,
    }),
  );
  // api:api.PatchMapViewportApi.resize
  _use(c.viewport.resize(480, 520, 1));
  // api:api.PatchMapViewportApi.state
  _use(c.viewport.state);
  // api:api.PatchMapViewportApi.snapshot
  _use(c.viewport.snapshot());
  // api:api.PatchMapViewportApi.fit
  _use(c.viewport.fit(targets: ['rect'], padding: 30));
  // api:api.PatchMapRotationApi.set
  _use(c.rotation.set(450));
  // api:api.PatchMapRotationApi.rotateBy
  _use(c.rotation.rotateBy(-90));
  // api:api.PatchMapRotationApi.reset
  _use(c.rotation.reset());
  // api:api.PatchMapRotationApi.value
  _use(c.rotation.value);
  // api:api.PatchMapRotationApi.animateTo
  _use(c.rotation.animateTo(720, durationMs: 0, normalizeOnComplete: true));
  // api:api.PatchMapTransformApi.moveBy
  _use(c.transform.moveBy(['rect'], [8, 12], actionId: 'move'));
  // api:api.PatchMapTransformApi.resizeBy
  _use(
    c.transform.resizeBy(
      ['rect'],
      handle: 'se',
      delta: [10, 5],
      actionId: 'resize',
    ),
  );
  // api:api.PatchMapTransformApi.rotateBy
  _use(c.transform.rotateBy(['rect'], 30, actionId: 'rotate'));
  // api:api.PatchMapTransformApi.beginSession
  _use(
    c.transform.beginSession(
      targets: ['rect'],
      kind: 'move',
      actionId: 'preview',
    ),
  );
  // api:api.PatchMapApi.update
  _use(
    c.update({
      'id': 'item',
      'bar': {'height': 48},
    }, actionId: 'authored-bar'),
  );
  // api:api.PatchMapInstance.update
  _use(
    c.update({
      'id': 'item',
      'bar': {'height': 48},
    }, actionId: 'authored-bar'),
  );
  // api:api.PatchMap.type.update
  _use(
    c.update({
      'id': 'item',
      'bar': {'height': 48},
    }, actionId: 'authored-bar'),
  );
  // api:api.PatchMapApi.updateBatch
  _use(
    c.updateBatch({
      'targets': ['grid.0.0', 'grid.0.1'],
      'bar': {
        'height': [12, 52],
      },
    }),
  );
  // api:api.PatchMapInstance.updateBatch
  _use(
    c.updateBatch({
      'targets': ['grid.0.0', 'grid.0.1'],
      'bar': {
        'height': [12, 52],
      },
    }),
  );
  // api:api.PatchMap.type.updateBatch
  _use(
    c.updateBatch({
      'targets': ['grid.0.0', 'grid.0.1'],
      'bar': {
        'height': [12, 52],
      },
    }),
  );
  // api:api.PatchMapApi.transaction
  _use(
    c.transaction([
      {'type': 'remove', 'id': 'item'},
    ]),
  );
  // api:api.PatchMapInstance.transaction
  _use(
    c.transaction([
      {'type': 'remove', 'id': 'item'},
    ]),
  );
  // api:api.PatchMap.type.transaction
  _use(
    c.transaction([
      {'type': 'remove', 'id': 'item'},
    ]),
  );
  // api:api.PatchMapDataApi
  _use(c.data);
  // api:api.PatchMapApi.data
  _use(c.data);
  // api:api.PatchMapInstance.data
  _use(c.data);
  // api:api.PatchMap.type.data
  _use(c.data);
  // api:api.PatchMapTargetsApi
  _use(c.targets);
  // api:api.PatchMapApi.targets
  _use(c.targets);
  // api:api.PatchMapInstance.targets
  _use(c.targets);
  // api:api.PatchMap.type.targets
  _use(c.targets);
  // api:api.PatchMapHistoryApi
  _use(c.history);
  // api:api.PatchMapApi.history
  _use(c.history);
  // api:api.PatchMapInstance.history
  _use(c.history);
  // api:api.PatchMap.type.history
  _use(c.history);
  // api:api.PatchMapSelectionApi
  _use(c.selection);
  // api:api.PatchMapApi.selection
  _use(c.selection);
  // api:api.PatchMapInstance.selection
  _use(c.selection);
  // api:api.PatchMap.type.selection
  _use(c.selection);
  // api:api.PatchMapPresentationApi
  _use(c.presentation);
  // api:api.PatchMapApi.presentation
  _use(c.presentation);
  // api:api.PatchMapInstance.presentation
  _use(c.presentation);
  // api:api.PatchMap.type.presentation
  _use(c.presentation);
  // api:api.PatchMapEditorApi
  _use(c.editor);
  // api:api.PatchMapApi.editor
  _use(c.editor);
  // api:api.PatchMapInstance.editor
  _use(c.editor);
  // api:api.PatchMap.type.editor
  _use(c.editor);
  // api:api.PatchMapViewportApi
  _use(c.viewport);
  // api:api.PatchMapApi.viewport
  _use(c.viewport);
  // api:api.PatchMapInstance.viewport
  _use(c.viewport);
  // api:api.PatchMap.type.viewport
  _use(c.viewport);
  // api:api.PatchMapRotationApi
  _use(c.rotation);
  // api:api.PatchMapApi.rotation
  _use(c.rotation);
  // api:api.PatchMapInstance.rotation
  _use(c.rotation);
  // api:api.PatchMap.type.rotation
  _use(c.rotation);
  // api:api.PatchMapTransformApi
  _use(c.transform);
  // api:api.PatchMapApi.transform
  _use(c.transform);
  // api:api.PatchMapInstance.transform
  _use(c.transform);
  // api:api.PatchMap.type.transform
  _use(c.transform);
  // api:api.PatchMapUpdateResult
  _use(
    c.update({
      'id': 'item',
      'bar': {'height': 48},
    }, actionId: 'authored-bar'),
  );
  // api:api.PatchMapUpdateResult.appliedCount
  _use(
    (c.update({
      'id': 'item',
      'bar': {'height': 48},
    }, actionId: 'authored-bar')).toJson()['appliedCount'],
  );
  // api:api.PatchMapUpdateResult.changed
  _use(
    (c.update({
      'id': 'item',
      'bar': {'height': 48},
    }, actionId: 'authored-bar')).toJson()['changed'],
  );
  // api:api.PatchMapUpdateResult.diagnostic
  _use(
    (c.update({
      'id': 'item',
      'bar': {'height': 48},
    }, actionId: 'authored-bar')).toJson()['diagnostic'],
  );
  // api:api.PatchMapUpdateResult.missing
  _use(
    (c.update({
      'id': 'item',
      'bar': {'height': 48},
    }, actionId: 'authored-bar')).toJson()['missing'],
  );
  // api:api.PatchMapUpdateResult.status
  _use(
    (c.update({
      'id': 'item',
      'bar': {'height': 48},
    }, actionId: 'authored-bar')).toJson()['status'],
  );
  // api:api.PatchMapDataReplaceResult
  _use(c.data.replace([], fit: false));
  // api:api.PatchMapDataReplaceResult.rootIds
  _use((c.data.replace([], fit: false)).toJson()['rootIds']);
  // api:api.PatchMapDataReplaceResult.sceneRevision
  _use((c.data.replace([], fit: false)).toJson()['sceneRevision']);
  // api:api.PatchMapDataReplaceResult.semanticHash
  _use((c.data.replace([], fit: false)).toJson()['semanticHash']);
  // api:api.PatchMapHistoryClearResult
  _use(c.history.clear());
  // api:api.PatchMapHistoryClearResult.changed
  _use((c.history.clear()).toJson()['changed']);
  // api:api.PatchMapHistoryClearResult.reason
  _use((c.history.clear()).toJson()['reason']);
  // api:api.PatchMapHistoryClearResult.history
  _use((c.history.clear()).toJson()['history']);
  // api:api.PatchMapHistoryResult
  _use(c.history.undo());
  // api:api.PatchMapHistoryResult.changed
  _use((c.history.undo()).toJson()['changed']);
  // api:api.PatchMapHistoryResult.direction
  _use((c.history.undo()).toJson()['direction']);
  // api:api.PatchMapHistoryResult.previousRevisions
  _use((c.history.undo()).toJson()['previousRevisions']);
  // api:api.PatchMapHistoryResult.revisions
  _use((c.history.undo()).toJson()['revisions']);
  // api:api.PatchMapHistoryResult.sceneRevision
  _use((c.history.undo()).toJson()['sceneRevision']);
  // api:api.PatchMapHistoryResult.semanticHash
  _use((c.history.undo()).toJson()['semanticHash']);
  // api:api.PatchMapHistoryResult.history
  _use((c.history.undo()).toJson()['history']);
  // api:api.PatchMapHistoryResult.companion
  _use((c.history.undo()).toJson()['companion']);
  // api:api.PatchMapHistoryResult.status
  _use((c.history.undo()).toJson()['status']);
  // api:api.PatchMapPresentationSetResult
  _use(
    c.presentation.set('dim', {
      'targets': [
        {'id': 'item', 'componentId': 'bar'},
      ],
      'matched': {'alphaMultiplier': .5},
    }),
  );
  // api:api.PatchMapPresentationSetResult.changed
  _use(
    (c.presentation.set('dim', {
      'targets': [
        {'id': 'item', 'componentId': 'bar'},
      ],
      'matched': {'alphaMultiplier': .5},
    })).toJson()['changed'],
  );
  // api:api.PatchMapPresentationSetResult.ignoredTargetCount
  _use(
    (c.presentation.set('dim', {
      'targets': [
        {'id': 'item', 'componentId': 'bar'},
      ],
      'matched': {'alphaMultiplier': .5},
    })).toJson()['ignoredTargetCount'],
  );
  // api:api.PatchMapPresentationSetResult.matchedCount
  _use(
    (c.presentation.set('dim', {
      'targets': [
        {'id': 'item', 'componentId': 'bar'},
      ],
      'matched': {'alphaMultiplier': .5},
    })).toJson()['matchedCount'],
  );
  // api:api.PatchMapPresentationSetResult.revision
  _use(
    (c.presentation.set('dim', {
      'targets': [
        {'id': 'item', 'componentId': 'bar'},
      ],
      'matched': {'alphaMultiplier': .5},
    })).toJson()['revision'],
  );
  // api:api.PatchMapPresentationSetResult.scopeCount
  _use(
    (c.presentation.set('dim', {
      'targets': [
        {'id': 'item', 'componentId': 'bar'},
      ],
      'matched': {'alphaMultiplier': .5},
    })).toJson()['scopeCount'],
  );
  // api:api.PatchMapPresentationSetResult.targetCount
  _use(
    (c.presentation.set('dim', {
      'targets': [
        {'id': 'item', 'componentId': 'bar'},
      ],
      'matched': {'alphaMultiplier': .5},
    })).toJson()['targetCount'],
  );
  // api:api.PatchMapPresentationSetResult.unmatchedCount
  _use(
    (c.presentation.set('dim', {
      'targets': [
        {'id': 'item', 'componentId': 'bar'},
      ],
      'matched': {'alphaMultiplier': .5},
    })).toJson()['unmatchedCount'],
  );
  // api:api.PatchMapEditorResult
  _use(c.editor.execute({'type': 'enter-relation-edit', 'target': 'rel'}));
  // api:api.PatchMapEditorResult.changed
  _use(
    (c.editor.execute({
      'type': 'enter-relation-edit',
      'target': 'rel',
    })).toJson()['changed'],
  );
  // api:api.PatchMapEditorResult.code
  _use(
    (c.editor.execute({
      'type': 'enter-relation-edit',
      'target': 'rel',
    })).toJson()['code'],
  );
  // api:api.PatchMapEditorResult.facts
  _use(
    (c.editor.execute({
      'type': 'enter-relation-edit',
      'target': 'rel',
    })).toJson()['facts'],
  );
  // api:api.PatchMapEditorResult.selectionIds
  _use(
    (c.editor.execute({
      'type': 'enter-relation-edit',
      'target': 'rel',
    })).toJson()['selectionIds'],
  );
  // api:api.PatchMapEditorResult.state
  _use(
    (c.editor.execute({
      'type': 'enter-relation-edit',
      'target': 'rel',
    })).toJson()['state'],
  );
  // api:api.PatchMapEditorResult.status
  _use(
    (c.editor.execute({
      'type': 'enter-relation-edit',
      'target': 'rel',
    })).toJson()['status'],
  );
  // api:api.PatchMapTransformResult
  _use(c.transform.moveBy(['rect'], [8, 12], actionId: 'move'));
  // api:api.PatchMapTransformResult.changed
  _use(
    (c.transform.moveBy(
      ['rect'],
      [8, 12],
      actionId: 'move',
    )).toJson()['changed'],
  );
  // api:api.PatchMapTransformResult.historyDepthDelta
  _use(
    (c.transform.moveBy(
      ['rect'],
      [8, 12],
      actionId: 'move',
    )).toJson()['historyDepthDelta'],
  );
  // api:api.PatchMapTransformResult.status
  _use(
    (c.transform.moveBy(
      ['rect'],
      [8, 12],
      actionId: 'move',
    )).toJson()['status'],
  );
  // api:api.PatchMapViewportChangeResult
  _use(c.viewport.panBy([12, 8]));
  // api:api.PatchMapViewportChangeResult.blocked
  _use((c.viewport.panBy([12, 8])).toJson()['blocked']);
  // api:api.PatchMapViewportChangeResult.changed
  _use((c.viewport.panBy([12, 8])).toJson()['changed']);
  // api:api.PatchMapViewportChangeResult.previous
  _use((c.viewport.panBy([12, 8])).toJson()['previous']);
  // api:api.PatchMapViewportChangeResult.previousRevisions
  _use((c.viewport.panBy([12, 8])).toJson()['previousRevisions']);
  // api:api.PatchMapViewportChangeResult.revisions
  _use((c.viewport.panBy([12, 8])).toJson()['revisions']);
  // api:api.PatchMapViewportChangeResult.source
  _use((c.viewport.panBy([12, 8])).toJson()['source']);
  // api:api.PatchMapViewportChangeResult.viewport
  _use((c.viewport.panBy([12, 8])).toJson()['viewport']);
  // api:api.PatchMapHistoryState
  _use(c.history.state);
  // api:api.PatchMapHistoryState.capacity
  _use(c.history.state['capacity']);
  // api:api.PatchMapHistoryState.depth
  _use(c.history.state['depth']);
  // api:api.PatchMapHistoryState.cursor
  _use(c.history.state['cursor']);
  // api:api.PatchMapHistoryState.undoDepth
  _use(c.history.state['undoDepth']);
  // api:api.PatchMapHistoryState.redoDepth
  _use(c.history.state['redoDepth']);
  // api:api.PatchMapHistoryState.canUndo
  _use(c.history.state['canUndo']);
  // api:api.PatchMapHistoryState.canRedo
  _use(c.history.state['canRedo']);
  // api:api.PatchMapHistoryState.destroyed
  _use(c.history.state['destroyed']);
  // api:api.PatchMapEditorState
  _use(c.editor.state);
  // api:api.PatchMapEditorState.activeTargetId
  _use(c.editor.state['activeTargetId']);
  // api:api.PatchMapEditorState.inactiveCellsVisible
  _use(c.editor.state['inactiveCellsVisible']);
  // api:api.PatchMapEditorState.mode
  _use(c.editor.state['mode']);
  // api:api.PatchMapEditorState.pendingDeleteCount
  _use(c.editor.state['pendingDeleteCount']);
  // api:api.PatchMapViewportState
  _use(c.viewport.state);
  // api:api.PatchMapViewportState.centerWorld
  _use(c.viewport.state['centerWorld']);
  // api:api.PatchMapViewportState.scale
  _use(c.viewport.state['scale']);
  // api:api.PatchMapViewportState.screenBounds
  _use(c.viewport.state['screenBounds']);
  // api:api.PatchMapViewportSnapshot
  _use(c.viewport.snapshot());
  // api:api.PatchMapViewportSnapshot.centerWorld
  _use(c.viewport.snapshot()['centerWorld']);
  // api:api.PatchMapViewportSnapshot.scale
  _use(c.viewport.snapshot()['scale']);
  // api:api.PatchMapRevisionStamp
  _use(c.viewport.panBy([1, 2]).toJson()['revisions']);
  // api:api.PatchMapRevisionStamp.interactionRevision
  _use(c.viewport.panBy([1, 2]).toJson()['revisions']['interactionRevision']);
  // api:api.PatchMapRevisionStamp.lifecycleGeneration
  _use(c.viewport.panBy([1, 2]).toJson()['revisions']['lifecycleGeneration']);
  // api:api.PatchMapRevisionStamp.sceneRevision
  _use(c.viewport.panBy([1, 2]).toJson()['revisions']['sceneRevision']);
  // api:api.PatchMapRevisionStamp.viewRevision
  _use(c.viewport.panBy([1, 2]).toJson()['revisions']['viewRevision']);
  // api:api.PatchMapTransformSession.preview
  _use(
    c.transform
        .beginSession(targets: ['rect'], kind: 'move', actionId: 'probe')
        .preview({
          'kind': 'move',
          'delta': [20, 0],
        }),
  );
  // api:api.PatchMapTransformSession.cancel
  _use(
    c.transform
        .beginSession(targets: ['rect'], kind: 'move', actionId: 'probe')
        .cancel(),
  );
  // api:api.PatchMapTransformSession.commit
  _use(
    c.transform
        .beginSession(targets: ['rect'], kind: 'move', actionId: 'probe')
        .commit(),
  );
  // api:api.PatchMapTransformSession.edgePan
  _use(
    c.transform
        .beginSession(targets: ['rect'], kind: 'move', actionId: 'probe')
        .edgePan([470, 200], [12, -5]),
  );
  // api:api.PatchMapTransformSession
  _use(
    c.transform.beginSession(
      targets: ['rect'],
      kind: 'move',
      actionId: 'probe',
    ),
  );
  // api:api.PatchMapTransformSessionPreviewResult
  _use(
    c.transform
        .beginSession(targets: ['rect'], kind: 'move', actionId: 'probe')
        .preview({
          'kind': 'move',
          'delta': [20, 0],
        }),
  );
  // api:api.PatchMapTransformSessionPreviewResult.changed
  _use(
    (c.transform
            .beginSession(targets: ['rect'], kind: 'move', actionId: 'probe')
            .preview({
              'kind': 'move',
              'delta': [20, 0],
            }))
        .toJson()['changed'],
  );
  // api:api.PatchMapTransformSessionPreviewResult.status
  _use(
    (c.transform
            .beginSession(targets: ['rect'], kind: 'move', actionId: 'probe')
            .preview({
              'kind': 'move',
              'delta': [20, 0],
            }))
        .toJson()['status'],
  );
  // api:api.PatchMapTransformSessionCancelResult
  _use(
    c.transform
        .beginSession(targets: ['rect'], kind: 'move', actionId: 'probe')
        .cancel(),
  );
  // api:api.PatchMapTransformSessionCancelResult.cancelled
  _use(
    (c.transform
            .beginSession(targets: ['rect'], kind: 'move', actionId: 'probe')
            .cancel())
        .toJson()['cancelled'],
  );
  // api:api.PatchMapTransformSessionCancelResult.historyDepthDelta
  _use(
    (c.transform
            .beginSession(targets: ['rect'], kind: 'move', actionId: 'probe')
            .cancel())
        .toJson()['historyDepthDelta'],
  );
  // api:api.PatchMapTransformSessionCancelResult.status
  _use(
    (c.transform
            .beginSession(targets: ['rect'], kind: 'move', actionId: 'probe')
            .cancel())
        .toJson()['status'],
  );
  // api:api.PatchMapTransformSessionCompletionResult
  _use(
    c.transform
        .beginSession(targets: ['rect'], kind: 'move', actionId: 'probe')
        .commit(),
  );
  // api:api.PatchMapTransformSessionCompletionResult.changed
  _use(
    (c.transform
            .beginSession(targets: ['rect'], kind: 'move', actionId: 'probe')
            .commit())
        .toJson()['changed'],
  );
  // api:api.PatchMapTransformSessionCompletionResult.historyDepthDelta
  _use(
    (c.transform
            .beginSession(targets: ['rect'], kind: 'move', actionId: 'probe')
            .commit())
        .toJson()['historyDepthDelta'],
  );
  // api:api.PatchMapTransformSessionCompletionResult.mutationCount
  _use(
    (c.transform
            .beginSession(targets: ['rect'], kind: 'move', actionId: 'probe')
            .commit())
        .toJson()['mutationCount'],
  );
  // api:api.PatchMapTransformSessionCompletionResult.status
  _use(
    (c.transform
            .beginSession(targets: ['rect'], kind: 'move', actionId: 'probe')
            .commit())
        .toJson()['status'],
  );
  // api:api.PatchMapRotationAnimation.finished
  _use(await c.rotation.animateTo(90, durationMs: 0).finished);
  // api:api.PatchMapRotationAnimation.cancel
  _use(c.rotation.animateTo(90, durationMs: 0).cancel());
  // api:api.PatchMapRotationAnimation
  _use(c.rotation.animateTo(90, durationMs: 0));
  // api:api.PatchMapRotationAnimationResult
  _use(await c.rotation.animateTo(90, durationMs: 0).finished);
  // api:api.PatchMapRotationAnimationResult.angle
  _use(
    (await c.rotation.animateTo(90, durationMs: 0).finished).toJson()['angle'],
  );
  // api:api.PatchMapRotationAnimationResult.status
  _use(
    (await c.rotation.animateTo(90, durationMs: 0).finished).toJson()['status'],
  );
  // api:api.PatchMapTargetSet
  _use(c.targets.query({'type': 'bar'}));
  // api:api.PatchMapTargetSet.count
  _use((c.targets.query({'type': 'bar'})).count);
  // api:api.PatchMapTargetSet.matches
  _use((c.targets.query({'type': 'bar'})).matches);
  // api:api.PatchMapTargetMatch
  _use(c.targets.query({'type': 'bar'}).matches.first);
  // api:api.PatchMapTargetMatch.componentId
  _use((c.targets.query({'type': 'bar'}).matches.first).componentId);
  // api:api.PatchMapTargetMatch.id
  _use((c.targets.query({'type': 'bar'}).matches.first).id);
  // api:api.PatchMapTargetMatch.kind
  _use((c.targets.query({'type': 'bar'}).matches.first).kind);
  // api:api.PatchMapTargetMatch.label
  _use((c.targets.query({'type': 'bar'}).matches.first).label);
  // api:api.PatchMapTargetMatch.type
  _use((c.targets.query({'type': 'bar'}).matches.first).type);
  // api:api.PatchMapTargetMatch.value
  _use((c.targets.query({'type': 'bar'}).matches.first).value);
  // api:api.PatchMapTarget
  _use(const PatchMapTarget('item', componentId: 'bar'));
  // api:api.PatchMapTarget.componentId
  _use((const PatchMapTarget('item', componentId: 'bar')).componentId);
  // api:api.PatchMapTarget.id
  _use((const PatchMapTarget('item', componentId: 'bar')).id);
  // api:api.PatchMapUpdate
  _use(
    c.update({
      'id': 'item',
      'bar': {'height': 48},
    }, actionId: 'authored-bar'),
  );
  // api:api.PatchMapUpdate.bar
  _use(
    c.update({
      'id': 'item',
      'bar': {'height': 48},
    }, actionId: 'authored-bar'),
  );
  // api:api.PatchMapUpdate.id
  _use(
    c.update({
      'id': 'item',
      'bar': {'height': 48},
    }, actionId: 'authored-bar'),
  );
  // api:api.PatchMapBarUpdate
  _use(
    c.update({
      'id': 'item',
      'bar': {'height': 48},
    }, actionId: 'authored-bar'),
  );
  // api:api.PatchMapBarUpdate.height
  _use(
    c.update({
      'id': 'item',
      'bar': {'height': 48},
    }, actionId: 'authored-bar'),
  );
  // api:api.PatchMapUpdateOptions
  _use(
    c.update({
      'id': 'item',
      'bar': {'height': 48},
    }, actionId: 'authored-bar'),
  );
  // api:api.PatchMapUpdateOptions.actionId
  _use(
    c.update({
      'id': 'item',
      'bar': {'height': 48},
    }, actionId: 'authored-bar'),
  );
  // api:api.PatchMapMutationOptions
  _use(
    c.update({
      'id': 'item',
      'bar': {'height': 48},
    }, actionId: 'authored-bar'),
  );
  // api:api.PatchMapMutationOptions.actionId
  _use(
    c.update({
      'id': 'item',
      'bar': {'height': 48},
    }, actionId: 'authored-bar'),
  );
  // api:api.PatchMapUpdateBatch
  _use(
    c.updateBatch({
      'targets': ['grid.0.0', 'grid.0.1'],
      'bar': {
        'height': [12, 52],
      },
    }),
  );
  // api:api.PatchMapUpdateBatch.bar
  _use(
    c.updateBatch({
      'targets': ['grid.0.0', 'grid.0.1'],
      'bar': {
        'height': [12, 52],
      },
    }),
  );
  // api:api.PatchMapUpdateBatch.targets
  _use(
    c.updateBatch({
      'targets': ['grid.0.0', 'grid.0.1'],
      'bar': {
        'height': [12, 52],
      },
    }),
  );
  // api:api.PatchMapBarUpdateColumns
  _use(
    c.updateBatch({
      'targets': ['grid.0.0', 'grid.0.1'],
      'bar': {
        'height': [12, 52],
      },
    }),
  );
  // api:api.PatchMapBarUpdateColumns.height
  _use(
    c.updateBatch({
      'targets': ['grid.0.0', 'grid.0.1'],
      'bar': {
        'height': [12, 52],
      },
    }),
  );
  // api:api.PatchMapUpdate.text
  _use(
    c.update({
      'id': 'text',
      'text': {'text': 'next'},
    }),
  );
  // api:api.PatchMapTextUpdate
  _use(
    c.update({
      'id': 'text',
      'text': {'text': 'next'},
    }),
  );
  // api:api.PatchMapTextUpdate.style
  _use(
    c.update({
      'id': 'text',
      'text': {'text': 'next'},
    }),
  );
  // api:api.PatchMapTextUpdate.text
  _use(
    c.update({
      'id': 'text',
      'text': {'text': 'next'},
    }),
  );
  // api:api.PatchMapTargetQuery
  _use(c.targets.query({'type': 'bar'}));
  // api:api.PatchMapTargetQuery.type
  _use(c.targets.query({'type': 'bar'}));
  // api:api.PatchMapTargetQuery.id
  _use(c.targets.query({'id': 'absent'}));
  // api:api.PatchMapPresentationLayer
  _use(
    c.presentation.set('dim', {
      'targets': [
        {'id': 'item', 'componentId': 'bar'},
      ],
      'matched': {'alphaMultiplier': .5},
    }),
  );
  // api:api.PatchMapPresentationLayer.matched
  _use(
    c.presentation.set('dim', {
      'targets': [
        {'id': 'item', 'componentId': 'bar'},
      ],
      'matched': {'alphaMultiplier': .5},
    }),
  );
  // api:api.PatchMapPresentationLayer.targets
  _use(
    c.presentation.set('dim', {
      'targets': [
        {'id': 'item', 'componentId': 'bar'},
      ],
      'matched': {'alphaMultiplier': .5},
    }),
  );
  // api:api.PatchMapPresentationPaint
  _use(
    c.presentation.set('dim', {
      'targets': [
        {'id': 'item', 'componentId': 'bar'},
      ],
      'matched': {'alphaMultiplier': .5},
    }),
  );
  // api:api.PatchMapPresentationPaint.alphaMultiplier
  _use(
    c.presentation.set('dim', {
      'targets': [
        {'id': 'item', 'componentId': 'bar'},
      ],
      'matched': {'alphaMultiplier': .5},
    }),
  );
  // api:api.PatchMapRotationAnimationOptions
  _use(c.rotation.animateTo(720, durationMs: 0, normalizeOnComplete: true));
  // api:api.PatchMapRotationAnimationOptions.durationMs
  _use(c.rotation.animateTo(720, durationMs: 0, normalizeOnComplete: true));
  // api:api.PatchMapRotationAnimationOptions.normalizeOnComplete
  _use(c.rotation.animateTo(720, durationMs: 0, normalizeOnComplete: true));
  // api:api.PatchMapTransformOptions
  _use(c.transform.moveBy(['rect'], [8, 12], actionId: 'move'));
  // api:api.PatchMapTransformOptions.actionId
  _use(c.transform.moveBy(['rect'], [8, 12], actionId: 'move'));
  // api:api.PatchMapResizeByOptions
  _use(
    c.transform.resizeBy(
      ['rect'],
      handle: 'se',
      delta: [10, 5],
      actionId: 'resize',
    ),
  );
  // api:api.PatchMapResizeByOptions.delta
  _use(
    c.transform.resizeBy(
      ['rect'],
      handle: 'se',
      delta: [10, 5],
      actionId: 'resize',
    ),
  );
  // api:api.PatchMapResizeByOptions.handle
  _use(
    c.transform.resizeBy(
      ['rect'],
      handle: 'se',
      delta: [10, 5],
      actionId: 'resize',
    ),
  );
  // api:api.PatchMapResizeByOptions.lockAspectRatio
  _use(
    c.transform.resizeBy(
      ['a'],
      handle: 'e',
      delta: [5, 0],
      lockAspectRatio: true,
    ),
  );
  // api:api.PatchMapTransformSessionInput
  _use(
    c.transform.beginSession(
      targets: ['rect'],
      kind: 'move',
      actionId: 'probe',
    ),
  );
  // api:api.PatchMapTransformSessionInput.actionId
  _use(
    c.transform.beginSession(
      targets: ['rect'],
      kind: 'move',
      actionId: 'probe',
    ),
  );
  // api:api.PatchMapTransformSessionInput.kind
  _use(
    c.transform.beginSession(
      targets: ['rect'],
      kind: 'move',
      actionId: 'probe',
    ),
  );
  // api:api.PatchMapTransformSessionInput.targets
  _use(
    c.transform.beginSession(
      targets: ['rect'],
      kind: 'move',
      actionId: 'probe',
    ),
  );
  // api:api.PatchMapTransformSessionPreview
  _use(
    c.transform
        .beginSession(targets: ['rect'], kind: 'move', actionId: 'probe')
        .preview({
          'kind': 'move',
          'delta': [20, 0],
        }),
  );
  // api:api.PatchMapTransformSessionPreview.kind
  _use(
    c.transform
        .beginSession(targets: ['rect'], kind: 'move', actionId: 'probe')
        .preview({
          'kind': 'move',
          'delta': [20, 0],
        }),
  );
  // api:api.PatchMapDataReplaceOptions
  _use(
    c.data.replace(
      [],
      fit: {
        'padding': 30,
        'targets': [
          {'id': 'rect'},
        ],
      },
    ),
  );
  // api:api.PatchMapDataReplaceOptions.fit
  _use(
    c.data.replace(
      [],
      fit: {
        'padding': 30,
        'targets': [
          {'id': 'rect'},
        ],
      },
    ),
  );
  // api:api.PatchMapFitOptions
  _use(
    c.viewport.fit(
      padding: 30,
      targets: [
        {'id': 'rect'},
      ],
    ),
  );
  // api:api.PatchMapFitOptions.padding
  _use(
    c.viewport.fit(
      padding: 30,
      targets: [
        {'id': 'rect'},
      ],
    ),
  );
  // api:api.PatchMapFitOptions.targets
  _use(
    c.viewport.fit(
      padding: 30,
      targets: [
        {'id': 'rect'},
      ],
    ),
  );
  // api:api.PatchMapEditorWorkflowAction
  _use(c.editor.execute({'type': 'enter-relation-edit', 'target': 'rel'}));
  // api:api.PatchMapEditorWorkflowAction.type
  _use(c.editor.execute({'type': 'enter-relation-edit', 'target': 'rel'}));
  // api:api.PatchMapTransactionOperation
  _use(
    c.transaction([
      {'type': 'remove', 'id': 'item'},
    ]),
  );
  // api:api.PatchMapTransactionOperation.type
  _use(
    c.transaction([
      {'type': 'remove', 'id': 'item'},
    ]),
  );
  // api:api.PatchMapUpdateStatus
  _use(
    c.update({
      'id': 'item',
      'bar': {'height': 48},
    }).status,
  );
  // api:api.PatchMapEditorWorkflowMode
  _use(c.editor.state['mode']);
  // api:api.PatchMapViewportChangeSource
  _use(c.viewport.panBy([1, 2])['source']);
  // api:api.PatchMapUpdateTargetsInput
  _use(
    c.updateBatch({
      'targets': ['grid.0.0'],
      'bar': {
        'height': [12],
      },
    }),
  );
  // api:api.PatchMapTargetsInput
  _use(c.transform.moveBy(['rect'], [8, 12]));
  // api:api.PatchMapPresentationTargetsInput
  _use(
    c.presentation.set('dim', {
      'targets': [
        {'id': 'item', 'componentId': 'bar'},
      ],
      'matched': {'alphaMultiplier': .5},
    }),
  );
  // api:api.PatchMapSelectionInput
  _use(c.selection.set(['b']));
  // api:api.PatchMapUpdateColumn
  _use(
    c.updateBatch({
      'targets': ['grid.0.0', 'grid.0.1'],
      'bar': {
        'height': [12, 52],
      },
    }),
  );
  // api:api.PatchMapOneOrMany
  _use(c.transform.moveBy(['rect'], [8, 12]));
  // api:api.PatchMapDiagnostic
  _use(
    c.updateBatch({
      'targets': ['item', 'item'],
      'bar': {
        'height': [10, 20],
      },
    }).toJson()['diagnostic'],
  );
  // api:api.PatchMapDiagnostic.appliedCount
  _use(
    c.updateBatch({
      'targets': ['item', 'item'],
      'bar': {
        'height': [10, 20],
      },
    }).toJson()['diagnostic']?['appliedCount'],
  );
  // api:api.PatchMapDiagnostic.category
  _use(
    c.updateBatch({
      'targets': ['item', 'item'],
      'bar': {
        'height': [10, 20],
      },
    }).toJson()['diagnostic']?['category'],
  );
  // api:api.PatchMapDiagnostic.code
  _use(
    c.updateBatch({
      'targets': ['item', 'item'],
      'bar': {
        'height': [10, 20],
      },
    }).toJson()['diagnostic']?['code'],
  );
  // api:api.PatchMapDiagnostic.datasetPath
  _use(
    c.updateBatch({
      'targets': ['item', 'item'],
      'bar': {
        'height': [10, 20],
      },
    }).toJson()['diagnostic']?['datasetPath'],
  );
  // api:api.PatchMapDiagnostic.lifecycleGeneration
  _use(
    c.updateBatch({
      'targets': ['item', 'item'],
      'bar': {
        'height': [10, 20],
      },
    }).toJson()['diagnostic']?['lifecycleGeneration'],
  );
  // api:api.PatchMapDiagnostic.missingCount
  _use(
    c.updateBatch({
      'targets': ['item', 'item'],
      'bar': {
        'height': [10, 20],
      },
    }).toJson()['diagnostic']?['missingCount'],
  );
  // api:api.PatchMapDiagnostic.operation
  _use(
    c.updateBatch({
      'targets': ['item', 'item'],
      'bar': {
        'height': [10, 20],
      },
    }).toJson()['diagnostic']?['operation'],
  );
  // api:api.PatchMapDiagnostic.recoverable
  _use(
    c.updateBatch({
      'targets': ['item', 'item'],
      'bar': {
        'height': [10, 20],
      },
    }).toJson()['diagnostic']?['recoverable'],
  );
  // api:api.PatchMapDiagnostic.retryable
  _use(
    c.updateBatch({
      'targets': ['item', 'item'],
      'bar': {
        'height': [10, 20],
      },
    }).toJson()['diagnostic']?['retryable'],
  );
  // api:api.PatchMapDiagnostic.revisionStamp
  _use(
    c.updateBatch({
      'targets': ['item', 'item'],
      'bar': {
        'height': [10, 20],
      },
    }).toJson()['diagnostic']?['revisionStamp'],
  );
  // api:api.PatchMapDiagnostic.sceneRevision
  _use(
    c.updateBatch({
      'targets': ['item', 'item'],
      'bar': {
        'height': [10, 20],
      },
    }).toJson()['diagnostic']?['sceneRevision'],
  );
  // api:api.PatchMapDiagnostic.unchangedCount
  _use(
    c.updateBatch({
      'targets': ['item', 'item'],
      'bar': {
        'height': [10, 20],
      },
    }).toJson()['diagnostic']?['unchangedCount'],
  );
  // api:api.PatchMapDiagnosticCategory
  _use(
    c.updateBatch({
      'targets': ['item', 'item'],
      'bar': {
        'height': [10, 20],
      },
    }).toJson()['diagnostic']?['category'],
  );
  // api:api.PatchMapUpdate.background
  _use(
    c.update(
      {
        "id": "a",
        "background": {
          "componentId": "background",
          "changes": {
            "show": true,
            "attrs": {"x": 1, "y": 2},
            "source": {
              "type": "rect",
              "fill": "#123456",
              "borderWidth": 2,
              "borderColor": "#112233",
              "radius": 3,
            },
            "tint": "#aabbcc",
          },
        },
      },
      actionId: "single-background",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapBackgroundUpdate
  _use(
    c.update(
      {
        "id": "a",
        "background": {
          "componentId": "background",
          "changes": {
            "show": true,
            "attrs": {"x": 1, "y": 2},
            "source": {
              "type": "rect",
              "fill": "#123456",
              "borderWidth": 2,
              "borderColor": "#112233",
              "radius": 3,
            },
            "tint": "#aabbcc",
          },
        },
      },
      actionId: "single-background",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapBackgroundUpdate.changes
  _use(
    c.update(
      {
        "id": "a",
        "background": {
          "componentId": "background",
          "changes": {
            "show": true,
            "attrs": {"x": 1, "y": 2},
            "source": {
              "type": "rect",
              "fill": "#123456",
              "borderWidth": 2,
              "borderColor": "#112233",
              "radius": 3,
            },
            "tint": "#aabbcc",
          },
        },
      },
      actionId: "single-background",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapBackgroundUpdate.componentId
  _use(
    c.update(
      {
        "id": "a",
        "background": {
          "componentId": "background",
          "changes": {
            "show": true,
            "attrs": {"x": 1, "y": 2},
            "source": {
              "type": "rect",
              "fill": "#123456",
              "borderWidth": 2,
              "borderColor": "#112233",
              "radius": 3,
            },
            "tint": "#aabbcc",
          },
        },
      },
      actionId: "single-background",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapUpdateBatch.background
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "background": {
          "componentId": "background",
          "changes": {
            "show": [true, true],
            "attrs": [
              {"x": 1, "y": 2},
              {"x": 1, "y": 2},
            ],
            "source": [
              {
                "type": "rect",
                "fill": "#123456",
                "borderWidth": 2,
                "borderColor": "#112233",
                "radius": 3,
              },
              {
                "type": "rect",
                "fill": "#123456",
                "borderWidth": 2,
                "borderColor": "#112233",
                "radius": 3,
              },
            ],
            "tint": ["#aabbcc", "#aabbcc"],
          },
        },
      },
      actionId: "columns-background",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapBackgroundUpdateColumns
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "background": {
          "componentId": "background",
          "changes": {
            "show": [true, true],
            "attrs": [
              {"x": 1, "y": 2},
              {"x": 1, "y": 2},
            ],
            "source": [
              {
                "type": "rect",
                "fill": "#123456",
                "borderWidth": 2,
                "borderColor": "#112233",
                "radius": 3,
              },
              {
                "type": "rect",
                "fill": "#123456",
                "borderWidth": 2,
                "borderColor": "#112233",
                "radius": 3,
              },
            ],
            "tint": ["#aabbcc", "#aabbcc"],
          },
        },
      },
      actionId: "columns-background",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapBackgroundUpdateColumns.changes
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "background": {
          "componentId": "background",
          "changes": {
            "show": [true, true],
            "attrs": [
              {"x": 1, "y": 2},
              {"x": 1, "y": 2},
            ],
            "source": [
              {
                "type": "rect",
                "fill": "#123456",
                "borderWidth": 2,
                "borderColor": "#112233",
                "radius": 3,
              },
              {
                "type": "rect",
                "fill": "#123456",
                "borderWidth": 2,
                "borderColor": "#112233",
                "radius": 3,
              },
            ],
            "tint": ["#aabbcc", "#aabbcc"],
          },
        },
      },
      actionId: "columns-background",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapBackgroundUpdateColumns.componentId
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "background": {
          "componentId": "background",
          "changes": {
            "show": [true, true],
            "attrs": [
              {"x": 1, "y": 2},
              {"x": 1, "y": 2},
            ],
            "source": [
              {
                "type": "rect",
                "fill": "#123456",
                "borderWidth": 2,
                "borderColor": "#112233",
                "radius": 3,
              },
              {
                "type": "rect",
                "fill": "#123456",
                "borderWidth": 2,
                "borderColor": "#112233",
                "radius": 3,
              },
            ],
            "tint": ["#aabbcc", "#aabbcc"],
          },
        },
      },
      actionId: "columns-background",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapBackgroundPresentationChanges
  _use(
    c.update(
      {
        "id": "a",
        "background": {
          "componentId": "background",
          "changes": {
            "show": true,
            "attrs": {"x": 1, "y": 2},
            "source": {
              "type": "rect",
              "fill": "#123456",
              "borderWidth": 2,
              "borderColor": "#112233",
              "radius": 3,
            },
            "tint": "#aabbcc",
          },
        },
      },
      actionId: "single-background",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapBackgroundPresentationChanges.attrs
  _use(
    c.update(
      {
        "id": "a",
        "background": {
          "componentId": "background",
          "changes": {
            "show": true,
            "attrs": {"x": 1, "y": 2},
            "source": {
              "type": "rect",
              "fill": "#123456",
              "borderWidth": 2,
              "borderColor": "#112233",
              "radius": 3,
            },
            "tint": "#aabbcc",
          },
        },
      },
      actionId: "single-background",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapBackgroundPresentationChanges.show
  _use(
    c.update(
      {
        "id": "a",
        "background": {
          "componentId": "background",
          "changes": {
            "show": true,
            "attrs": {"x": 1, "y": 2},
            "source": {
              "type": "rect",
              "fill": "#123456",
              "borderWidth": 2,
              "borderColor": "#112233",
              "radius": 3,
            },
            "tint": "#aabbcc",
          },
        },
      },
      actionId: "single-background",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapBackgroundPresentationChanges.source
  _use(
    c.update(
      {
        "id": "a",
        "background": {
          "componentId": "background",
          "changes": {
            "show": true,
            "attrs": {"x": 1, "y": 2},
            "source": {
              "type": "rect",
              "fill": "#123456",
              "borderWidth": 2,
              "borderColor": "#112233",
              "radius": 3,
            },
            "tint": "#aabbcc",
          },
        },
      },
      actionId: "single-background",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapBackgroundPresentationChanges.tint
  _use(
    c.update(
      {
        "id": "a",
        "background": {
          "componentId": "background",
          "changes": {
            "show": true,
            "attrs": {"x": 1, "y": 2},
            "source": {
              "type": "rect",
              "fill": "#123456",
              "borderWidth": 2,
              "borderColor": "#112233",
              "radius": 3,
            },
            "tint": "#aabbcc",
          },
        },
      },
      actionId: "single-background",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapBackgroundPresentationColumns
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "background": {
          "componentId": "background",
          "changes": {
            "show": [true, true],
            "attrs": [
              {"x": 1, "y": 2},
              {"x": 1, "y": 2},
            ],
            "source": [
              {
                "type": "rect",
                "fill": "#123456",
                "borderWidth": 2,
                "borderColor": "#112233",
                "radius": 3,
              },
              {
                "type": "rect",
                "fill": "#123456",
                "borderWidth": 2,
                "borderColor": "#112233",
                "radius": 3,
              },
            ],
            "tint": ["#aabbcc", "#aabbcc"],
          },
        },
      },
      actionId: "columns-background",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapBackgroundPresentationColumns.attrs
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "background": {
          "componentId": "background",
          "changes": {
            "show": [true, true],
            "attrs": [
              {"x": 1, "y": 2},
              {"x": 1, "y": 2},
            ],
            "source": [
              {
                "type": "rect",
                "fill": "#123456",
                "borderWidth": 2,
                "borderColor": "#112233",
                "radius": 3,
              },
              {
                "type": "rect",
                "fill": "#123456",
                "borderWidth": 2,
                "borderColor": "#112233",
                "radius": 3,
              },
            ],
            "tint": ["#aabbcc", "#aabbcc"],
          },
        },
      },
      actionId: "columns-background",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapBackgroundPresentationColumns.show
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "background": {
          "componentId": "background",
          "changes": {
            "show": [true, true],
            "attrs": [
              {"x": 1, "y": 2},
              {"x": 1, "y": 2},
            ],
            "source": [
              {
                "type": "rect",
                "fill": "#123456",
                "borderWidth": 2,
                "borderColor": "#112233",
                "radius": 3,
              },
              {
                "type": "rect",
                "fill": "#123456",
                "borderWidth": 2,
                "borderColor": "#112233",
                "radius": 3,
              },
            ],
            "tint": ["#aabbcc", "#aabbcc"],
          },
        },
      },
      actionId: "columns-background",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapBackgroundPresentationColumns.source
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "background": {
          "componentId": "background",
          "changes": {
            "show": [true, true],
            "attrs": [
              {"x": 1, "y": 2},
              {"x": 1, "y": 2},
            ],
            "source": [
              {
                "type": "rect",
                "fill": "#123456",
                "borderWidth": 2,
                "borderColor": "#112233",
                "radius": 3,
              },
              {
                "type": "rect",
                "fill": "#123456",
                "borderWidth": 2,
                "borderColor": "#112233",
                "radius": 3,
              },
            ],
            "tint": ["#aabbcc", "#aabbcc"],
          },
        },
      },
      actionId: "columns-background",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapBackgroundPresentationColumns.tint
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "background": {
          "componentId": "background",
          "changes": {
            "show": [true, true],
            "attrs": [
              {"x": 1, "y": 2},
              {"x": 1, "y": 2},
            ],
            "source": [
              {
                "type": "rect",
                "fill": "#123456",
                "borderWidth": 2,
                "borderColor": "#112233",
                "radius": 3,
              },
              {
                "type": "rect",
                "fill": "#123456",
                "borderWidth": 2,
                "borderColor": "#112233",
                "radius": 3,
              },
            ],
            "tint": ["#aabbcc", "#aabbcc"],
          },
        },
      },
      actionId: "columns-background",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapBarUpdate.changes
  _use(
    c.update(
      {
        "id": "a",
        "bar": {
          "componentId": "bar",
          "changes": {
            "show": true,
            "source": {"type": "rect", "fill": "#ff0000"},
            "tint": "#778899",
          },
          "height": 33,
        },
      },
      actionId: "single-bar",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapBarUpdate.componentId
  _use(
    c.update(
      {
        "id": "a",
        "bar": {
          "componentId": "bar",
          "changes": {
            "show": true,
            "source": {"type": "rect", "fill": "#ff0000"},
            "tint": "#778899",
          },
          "height": 33,
        },
      },
      actionId: "single-bar",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapBarUpdateColumns.changes
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "bar": {
          "componentId": "bar",
          "changes": {
            "show": [true, true],
            "source": [
              {"type": "rect", "fill": "#ff0000"},
              {"type": "rect", "fill": "#ff0000"},
            ],
            "tint": ["#778899", "#778899"],
          },
          "height": [44, 55],
        },
      },
      actionId: "columns-bar",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapBarUpdateColumns.componentId
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "bar": {
          "componentId": "bar",
          "changes": {
            "show": [true, true],
            "source": [
              {"type": "rect", "fill": "#ff0000"},
              {"type": "rect", "fill": "#ff0000"},
            ],
            "tint": ["#778899", "#778899"],
          },
          "height": [44, 55],
        },
      },
      actionId: "columns-bar",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapInstancePresentationChanges
  _use(
    c.update(
      {
        "id": "a",
        "bar": {
          "componentId": "bar",
          "changes": {
            "show": true,
            "source": {"type": "rect", "fill": "#ff0000"},
            "tint": "#778899",
          },
          "height": 33,
        },
      },
      actionId: "single-bar",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapInstancePresentationChanges.show
  _use(
    c.update(
      {
        "id": "a",
        "bar": {
          "componentId": "bar",
          "changes": {
            "show": true,
            "source": {"type": "rect", "fill": "#ff0000"},
            "tint": "#778899",
          },
          "height": 33,
        },
      },
      actionId: "single-bar",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapInstancePresentationChanges.source
  _use(
    c.update(
      {
        "id": "a",
        "bar": {
          "componentId": "bar",
          "changes": {
            "show": true,
            "source": {"type": "rect", "fill": "#ff0000"},
            "tint": "#778899",
          },
          "height": 33,
        },
      },
      actionId: "single-bar",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapInstancePresentationChanges.tint
  _use(
    c.update(
      {
        "id": "a",
        "bar": {
          "componentId": "bar",
          "changes": {
            "show": true,
            "source": {"type": "rect", "fill": "#ff0000"},
            "tint": "#778899",
          },
          "height": 33,
        },
      },
      actionId: "single-bar",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapUpdate.icon
  _use(
    c.update(
      {
        "id": "a",
        "icon": {
          "componentId": "icon",
          "changes": {
            "show": true,
            "source":
                "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
            "tint": "#dd8833",
          },
        },
      },
      actionId: "single-icon",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapIconUpdate
  _use(
    c.update(
      {
        "id": "a",
        "icon": {
          "componentId": "icon",
          "changes": {
            "show": true,
            "source":
                "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
            "tint": "#dd8833",
          },
        },
      },
      actionId: "single-icon",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapIconUpdate.changes
  _use(
    c.update(
      {
        "id": "a",
        "icon": {
          "componentId": "icon",
          "changes": {
            "show": true,
            "source":
                "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
            "tint": "#dd8833",
          },
        },
      },
      actionId: "single-icon",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapIconUpdate.componentId
  _use(
    c.update(
      {
        "id": "a",
        "icon": {
          "componentId": "icon",
          "changes": {
            "show": true,
            "source":
                "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
            "tint": "#dd8833",
          },
        },
      },
      actionId: "single-icon",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapUpdateBatch.icon
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "icon": {
          "componentId": "icon",
          "changes": {
            "show": [true, true],
            "source": [
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
            ],
            "tint": ["#dd8833", "#dd8833"],
          },
        },
      },
      actionId: "columns-icon",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapIconUpdateColumns
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "icon": {
          "componentId": "icon",
          "changes": {
            "show": [true, true],
            "source": [
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
            ],
            "tint": ["#dd8833", "#dd8833"],
          },
        },
      },
      actionId: "columns-icon",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapIconUpdateColumns.changes
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "icon": {
          "componentId": "icon",
          "changes": {
            "show": [true, true],
            "source": [
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
            ],
            "tint": ["#dd8833", "#dd8833"],
          },
        },
      },
      actionId: "columns-icon",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapIconUpdateColumns.componentId
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "icon": {
          "componentId": "icon",
          "changes": {
            "show": [true, true],
            "source": [
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
            ],
            "tint": ["#dd8833", "#dd8833"],
          },
        },
      },
      actionId: "columns-icon",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapTextUpdate.changes
  _use(
    c.update(
      {
        "id": "a",
        "text": {
          "componentId": "text",
          "changes": {
            "show": true,
            "attrs": {"x": 2, "y": 3},
            "margin": {"top": 2, "right": 3, "bottom": 4, "left": 5},
            "placement": "bottom",
            "split": 1,
            "tint": "#445566",
          },
          "text": "single",
          "style": {"fontSize": 13},
        },
      },
      actionId: "single-text",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapTextUpdate.componentId
  _use(
    c.update(
      {
        "id": "a",
        "text": {
          "componentId": "text",
          "changes": {
            "show": true,
            "attrs": {"x": 2, "y": 3},
            "margin": {"top": 2, "right": 3, "bottom": 4, "left": 5},
            "placement": "bottom",
            "split": 1,
            "tint": "#445566",
          },
          "text": "single",
          "style": {"fontSize": 13},
        },
      },
      actionId: "single-text",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapUpdateBatch.text
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "text": {
          "componentId": "text",
          "changes": {
            "show": [true, true],
            "attrs": [
              {"x": 2, "y": 3},
              {"x": 2, "y": 3},
            ],
            "margin": [
              {"top": 2, "right": 3, "bottom": 4, "left": 5},
              {"top": 2, "right": 3, "bottom": 4, "left": 5},
            ],
            "placement": ["bottom", "bottom"],
            "split": [1, 1],
            "tint": ["#445566", "#445566"],
          },
          "text": ["column-A", "column-B"],
          "style": [
            {"fontSize": 15},
            {"fontSize": 16},
          ],
        },
      },
      actionId: "columns-text",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapTextUpdateColumns
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "text": {
          "componentId": "text",
          "changes": {
            "show": [true, true],
            "attrs": [
              {"x": 2, "y": 3},
              {"x": 2, "y": 3},
            ],
            "margin": [
              {"top": 2, "right": 3, "bottom": 4, "left": 5},
              {"top": 2, "right": 3, "bottom": 4, "left": 5},
            ],
            "placement": ["bottom", "bottom"],
            "split": [1, 1],
            "tint": ["#445566", "#445566"],
          },
          "text": ["column-A", "column-B"],
          "style": [
            {"fontSize": 15},
            {"fontSize": 16},
          ],
        },
      },
      actionId: "columns-text",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapTextUpdateColumns.changes
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "text": {
          "componentId": "text",
          "changes": {
            "show": [true, true],
            "attrs": [
              {"x": 2, "y": 3},
              {"x": 2, "y": 3},
            ],
            "margin": [
              {"top": 2, "right": 3, "bottom": 4, "left": 5},
              {"top": 2, "right": 3, "bottom": 4, "left": 5},
            ],
            "placement": ["bottom", "bottom"],
            "split": [1, 1],
            "tint": ["#445566", "#445566"],
          },
          "text": ["column-A", "column-B"],
          "style": [
            {"fontSize": 15},
            {"fontSize": 16},
          ],
        },
      },
      actionId: "columns-text",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapTextUpdateColumns.componentId
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "text": {
          "componentId": "text",
          "changes": {
            "show": [true, true],
            "attrs": [
              {"x": 2, "y": 3},
              {"x": 2, "y": 3},
            ],
            "margin": [
              {"top": 2, "right": 3, "bottom": 4, "left": 5},
              {"top": 2, "right": 3, "bottom": 4, "left": 5},
            ],
            "placement": ["bottom", "bottom"],
            "split": [1, 1],
            "tint": ["#445566", "#445566"],
          },
          "text": ["column-A", "column-B"],
          "style": [
            {"fontSize": 15},
            {"fontSize": 16},
          ],
        },
      },
      actionId: "columns-text",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapTextUpdateColumns.style
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "text": {
          "componentId": "text",
          "changes": {
            "show": [true, true],
            "attrs": [
              {"x": 2, "y": 3},
              {"x": 2, "y": 3},
            ],
            "margin": [
              {"top": 2, "right": 3, "bottom": 4, "left": 5},
              {"top": 2, "right": 3, "bottom": 4, "left": 5},
            ],
            "placement": ["bottom", "bottom"],
            "split": [1, 1],
            "tint": ["#445566", "#445566"],
          },
          "text": ["column-A", "column-B"],
          "style": [
            {"fontSize": 15},
            {"fontSize": 16},
          ],
        },
      },
      actionId: "columns-text",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapTextUpdateColumns.text
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "text": {
          "componentId": "text",
          "changes": {
            "show": [true, true],
            "attrs": [
              {"x": 2, "y": 3},
              {"x": 2, "y": 3},
            ],
            "margin": [
              {"top": 2, "right": 3, "bottom": 4, "left": 5},
              {"top": 2, "right": 3, "bottom": 4, "left": 5},
            ],
            "placement": ["bottom", "bottom"],
            "split": [1, 1],
            "tint": ["#445566", "#445566"],
          },
          "text": ["column-A", "column-B"],
          "style": [
            {"fontSize": 15},
            {"fontSize": 16},
          ],
        },
      },
      actionId: "columns-text",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapTextPresentationChanges
  _use(
    c.update(
      {
        "id": "a",
        "text": {
          "componentId": "text",
          "changes": {
            "show": true,
            "attrs": {"x": 2, "y": 3},
            "margin": {"top": 2, "right": 3, "bottom": 4, "left": 5},
            "placement": "bottom",
            "split": 1,
            "tint": "#445566",
          },
          "text": "single",
          "style": {"fontSize": 13},
        },
      },
      actionId: "single-text",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapTextPresentationChanges.attrs
  _use(
    c.update(
      {
        "id": "a",
        "text": {
          "componentId": "text",
          "changes": {
            "show": true,
            "attrs": {"x": 2, "y": 3},
            "margin": {"top": 2, "right": 3, "bottom": 4, "left": 5},
            "placement": "bottom",
            "split": 1,
            "tint": "#445566",
          },
          "text": "single",
          "style": {"fontSize": 13},
        },
      },
      actionId: "single-text",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapTextPresentationChanges.margin
  _use(
    c.update(
      {
        "id": "a",
        "text": {
          "componentId": "text",
          "changes": {
            "show": true,
            "attrs": {"x": 2, "y": 3},
            "margin": {"top": 2, "right": 3, "bottom": 4, "left": 5},
            "placement": "bottom",
            "split": 1,
            "tint": "#445566",
          },
          "text": "single",
          "style": {"fontSize": 13},
        },
      },
      actionId: "single-text",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapTextPresentationChanges.placement
  _use(
    c.update(
      {
        "id": "a",
        "text": {
          "componentId": "text",
          "changes": {
            "show": true,
            "attrs": {"x": 2, "y": 3},
            "margin": {"top": 2, "right": 3, "bottom": 4, "left": 5},
            "placement": "bottom",
            "split": 1,
            "tint": "#445566",
          },
          "text": "single",
          "style": {"fontSize": 13},
        },
      },
      actionId: "single-text",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapTextPresentationChanges.show
  _use(
    c.update(
      {
        "id": "a",
        "text": {
          "componentId": "text",
          "changes": {
            "show": true,
            "attrs": {"x": 2, "y": 3},
            "margin": {"top": 2, "right": 3, "bottom": 4, "left": 5},
            "placement": "bottom",
            "split": 1,
            "tint": "#445566",
          },
          "text": "single",
          "style": {"fontSize": 13},
        },
      },
      actionId: "single-text",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapTextPresentationChanges.split
  _use(
    c.update(
      {
        "id": "a",
        "text": {
          "componentId": "text",
          "changes": {
            "show": true,
            "attrs": {"x": 2, "y": 3},
            "margin": {"top": 2, "right": 3, "bottom": 4, "left": 5},
            "placement": "bottom",
            "split": 1,
            "tint": "#445566",
          },
          "text": "single",
          "style": {"fontSize": 13},
        },
      },
      actionId: "single-text",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapTextPresentationChanges.tint
  _use(
    c.update(
      {
        "id": "a",
        "text": {
          "componentId": "text",
          "changes": {
            "show": true,
            "attrs": {"x": 2, "y": 3},
            "margin": {"top": 2, "right": 3, "bottom": 4, "left": 5},
            "placement": "bottom",
            "split": 1,
            "tint": "#445566",
          },
          "text": "single",
          "style": {"fontSize": 13},
        },
      },
      actionId: "single-text",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapTextPresentationColumns
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "text": {
          "componentId": "text",
          "changes": {
            "show": [true, true],
            "attrs": [
              {"x": 2, "y": 3},
              {"x": 2, "y": 3},
            ],
            "margin": [
              {"top": 2, "right": 3, "bottom": 4, "left": 5},
              {"top": 2, "right": 3, "bottom": 4, "left": 5},
            ],
            "placement": ["bottom", "bottom"],
            "split": [1, 1],
            "tint": ["#445566", "#445566"],
          },
          "text": ["column-A", "column-B"],
          "style": [
            {"fontSize": 15},
            {"fontSize": 16},
          ],
        },
      },
      actionId: "columns-text",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapTextPresentationColumns.attrs
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "text": {
          "componentId": "text",
          "changes": {
            "show": [true, true],
            "attrs": [
              {"x": 2, "y": 3},
              {"x": 2, "y": 3},
            ],
            "margin": [
              {"top": 2, "right": 3, "bottom": 4, "left": 5},
              {"top": 2, "right": 3, "bottom": 4, "left": 5},
            ],
            "placement": ["bottom", "bottom"],
            "split": [1, 1],
            "tint": ["#445566", "#445566"],
          },
          "text": ["column-A", "column-B"],
          "style": [
            {"fontSize": 15},
            {"fontSize": 16},
          ],
        },
      },
      actionId: "columns-text",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapTextPresentationColumns.margin
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "text": {
          "componentId": "text",
          "changes": {
            "show": [true, true],
            "attrs": [
              {"x": 2, "y": 3},
              {"x": 2, "y": 3},
            ],
            "margin": [
              {"top": 2, "right": 3, "bottom": 4, "left": 5},
              {"top": 2, "right": 3, "bottom": 4, "left": 5},
            ],
            "placement": ["bottom", "bottom"],
            "split": [1, 1],
            "tint": ["#445566", "#445566"],
          },
          "text": ["column-A", "column-B"],
          "style": [
            {"fontSize": 15},
            {"fontSize": 16},
          ],
        },
      },
      actionId: "columns-text",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapTextPresentationColumns.placement
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "text": {
          "componentId": "text",
          "changes": {
            "show": [true, true],
            "attrs": [
              {"x": 2, "y": 3},
              {"x": 2, "y": 3},
            ],
            "margin": [
              {"top": 2, "right": 3, "bottom": 4, "left": 5},
              {"top": 2, "right": 3, "bottom": 4, "left": 5},
            ],
            "placement": ["bottom", "bottom"],
            "split": [1, 1],
            "tint": ["#445566", "#445566"],
          },
          "text": ["column-A", "column-B"],
          "style": [
            {"fontSize": 15},
            {"fontSize": 16},
          ],
        },
      },
      actionId: "columns-text",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapTextPresentationColumns.show
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "text": {
          "componentId": "text",
          "changes": {
            "show": [true, true],
            "attrs": [
              {"x": 2, "y": 3},
              {"x": 2, "y": 3},
            ],
            "margin": [
              {"top": 2, "right": 3, "bottom": 4, "left": 5},
              {"top": 2, "right": 3, "bottom": 4, "left": 5},
            ],
            "placement": ["bottom", "bottom"],
            "split": [1, 1],
            "tint": ["#445566", "#445566"],
          },
          "text": ["column-A", "column-B"],
          "style": [
            {"fontSize": 15},
            {"fontSize": 16},
          ],
        },
      },
      actionId: "columns-text",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapTextPresentationColumns.split
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "text": {
          "componentId": "text",
          "changes": {
            "show": [true, true],
            "attrs": [
              {"x": 2, "y": 3},
              {"x": 2, "y": 3},
            ],
            "margin": [
              {"top": 2, "right": 3, "bottom": 4, "left": 5},
              {"top": 2, "right": 3, "bottom": 4, "left": 5},
            ],
            "placement": ["bottom", "bottom"],
            "split": [1, 1],
            "tint": ["#445566", "#445566"],
          },
          "text": ["column-A", "column-B"],
          "style": [
            {"fontSize": 15},
            {"fontSize": 16},
          ],
        },
      },
      actionId: "columns-text",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapTextPresentationColumns.tint
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "text": {
          "componentId": "text",
          "changes": {
            "show": [true, true],
            "attrs": [
              {"x": 2, "y": 3},
              {"x": 2, "y": 3},
            ],
            "margin": [
              {"top": 2, "right": 3, "bottom": 4, "left": 5},
              {"top": 2, "right": 3, "bottom": 4, "left": 5},
            ],
            "placement": ["bottom", "bottom"],
            "split": [1, 1],
            "tint": ["#445566", "#445566"],
          },
          "text": ["column-A", "column-B"],
          "style": [
            {"fontSize": 15},
            {"fontSize": 16},
          ],
        },
      },
      actionId: "columns-text",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapComponentUpdate
  _use(
    c.update(
      {
        "id": "a",
        "background": {
          "componentId": "background",
          "changes": {
            "show": true,
            "attrs": {"x": 1, "y": 2},
            "source": {
              "type": "rect",
              "fill": "#123456",
              "borderWidth": 2,
              "borderColor": "#112233",
              "radius": 3,
            },
            "tint": "#aabbcc",
          },
        },
      },
      actionId: "single-background",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapComponentUpdate.changes
  _use(
    c.update(
      {
        "id": "a",
        "background": {
          "componentId": "background",
          "changes": {
            "show": true,
            "attrs": {"x": 1, "y": 2},
            "source": {
              "type": "rect",
              "fill": "#123456",
              "borderWidth": 2,
              "borderColor": "#112233",
              "radius": 3,
            },
            "tint": "#aabbcc",
          },
        },
      },
      actionId: "single-background",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapComponentUpdate.componentId
  _use(
    c.update(
      {
        "id": "a",
        "background": {
          "componentId": "background",
          "changes": {
            "show": true,
            "attrs": {"x": 1, "y": 2},
            "source": {
              "type": "rect",
              "fill": "#123456",
              "borderWidth": 2,
              "borderColor": "#112233",
              "radius": 3,
            },
            "tint": "#aabbcc",
          },
        },
      },
      actionId: "single-background",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapComponentUpdateColumns
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "background": {
          "componentId": "background",
          "changes": {
            "show": [true, true],
            "attrs": [
              {"x": 1, "y": 2},
              {"x": 1, "y": 2},
            ],
            "source": [
              {
                "type": "rect",
                "fill": "#123456",
                "borderWidth": 2,
                "borderColor": "#112233",
                "radius": 3,
              },
              {
                "type": "rect",
                "fill": "#123456",
                "borderWidth": 2,
                "borderColor": "#112233",
                "radius": 3,
              },
            ],
            "tint": ["#aabbcc", "#aabbcc"],
          },
        },
      },
      actionId: "columns-background",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapComponentUpdateColumns.changes
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "background": {
          "componentId": "background",
          "changes": {
            "show": [true, true],
            "attrs": [
              {"x": 1, "y": 2},
              {"x": 1, "y": 2},
            ],
            "source": [
              {
                "type": "rect",
                "fill": "#123456",
                "borderWidth": 2,
                "borderColor": "#112233",
                "radius": 3,
              },
              {
                "type": "rect",
                "fill": "#123456",
                "borderWidth": 2,
                "borderColor": "#112233",
                "radius": 3,
              },
            ],
            "tint": ["#aabbcc", "#aabbcc"],
          },
        },
      },
      actionId: "columns-background",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapComponentUpdateColumns.componentId
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "background": {
          "componentId": "background",
          "changes": {
            "show": [true, true],
            "attrs": [
              {"x": 1, "y": 2},
              {"x": 1, "y": 2},
            ],
            "source": [
              {
                "type": "rect",
                "fill": "#123456",
                "borderWidth": 2,
                "borderColor": "#112233",
                "radius": 3,
              },
              {
                "type": "rect",
                "fill": "#123456",
                "borderWidth": 2,
                "borderColor": "#112233",
                "radius": 3,
              },
            ],
            "tint": ["#aabbcc", "#aabbcc"],
          },
        },
      },
      actionId: "columns-background",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapUpdate.changes
  _use(
    c.update({
      "id": "a",
      "changes": {
        "attrs": {"x": 12},
        "locked": false,
      },
    }, recordHistory: false),
  );
  // api:api.PatchMapUpdateBatch.changes
  _use(
    c.updateBatch({
      "targets": ["a", "b"],
      "changes": {
        "attrs": [
          {"x": 20},
          {"x": 140},
        ],
        "locked": [false, false],
      },
    }, recordHistory: false),
  );
  // api:api.PatchMapUpdateBatchOptions
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "background": {
          "componentId": "background",
          "changes": {
            "show": [true, true],
            "attrs": [
              {"x": 1, "y": 2},
              {"x": 1, "y": 2},
            ],
            "source": [
              {
                "type": "rect",
                "fill": "#123456",
                "borderWidth": 2,
                "borderColor": "#112233",
                "radius": 3,
              },
              {
                "type": "rect",
                "fill": "#123456",
                "borderWidth": 2,
                "borderColor": "#112233",
                "radius": 3,
              },
            ],
            "tint": ["#aabbcc", "#aabbcc"],
          },
        },
      },
      actionId: "columns-background",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapUpdateBatchOptions.actionId
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "background": {
          "componentId": "background",
          "changes": {
            "show": [true, true],
            "attrs": [
              {"x": 1, "y": 2},
              {"x": 1, "y": 2},
            ],
            "source": [
              {
                "type": "rect",
                "fill": "#123456",
                "borderWidth": 2,
                "borderColor": "#112233",
                "radius": 3,
              },
              {
                "type": "rect",
                "fill": "#123456",
                "borderWidth": 2,
                "borderColor": "#112233",
                "radius": 3,
              },
            ],
            "tint": ["#aabbcc", "#aabbcc"],
          },
        },
      },
      actionId: "columns-background",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapUpdateBatchOptions.animate
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "background": {
          "componentId": "background",
          "changes": {
            "show": [true, true],
            "attrs": [
              {"x": 1, "y": 2},
              {"x": 1, "y": 2},
            ],
            "source": [
              {
                "type": "rect",
                "fill": "#123456",
                "borderWidth": 2,
                "borderColor": "#112233",
                "radius": 3,
              },
              {
                "type": "rect",
                "fill": "#123456",
                "borderWidth": 2,
                "borderColor": "#112233",
                "radius": 3,
              },
            ],
            "tint": ["#aabbcc", "#aabbcc"],
          },
        },
      },
      actionId: "columns-background",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapUpdateBatchOptions.recordHistory
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "background": {
          "componentId": "background",
          "changes": {
            "show": [true, true],
            "attrs": [
              {"x": 1, "y": 2},
              {"x": 1, "y": 2},
            ],
            "source": [
              {
                "type": "rect",
                "fill": "#123456",
                "borderWidth": 2,
                "borderColor": "#112233",
                "radius": 3,
              },
              {
                "type": "rect",
                "fill": "#123456",
                "borderWidth": 2,
                "borderColor": "#112233",
                "radius": 3,
              },
            ],
            "tint": ["#aabbcc", "#aabbcc"],
          },
        },
      },
      actionId: "columns-background",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapUpdateOptions.animate
  _use(
    c.update(
      {
        "id": "a",
        "background": {
          "componentId": "background",
          "changes": {
            "show": true,
            "attrs": {"x": 1, "y": 2},
            "source": {
              "type": "rect",
              "fill": "#123456",
              "borderWidth": 2,
              "borderColor": "#112233",
              "radius": 3,
            },
            "tint": "#aabbcc",
          },
        },
      },
      actionId: "single-background",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapUpdateOptions.recordHistory
  _use(
    c.update(
      {
        "id": "a",
        "background": {
          "componentId": "background",
          "changes": {
            "show": true,
            "attrs": {"x": 1, "y": 2},
            "source": {
              "type": "rect",
              "fill": "#123456",
              "borderWidth": 2,
              "borderColor": "#112233",
              "radius": 3,
            },
            "tint": "#aabbcc",
          },
        },
      },
      actionId: "single-background",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapMutationOptions.recordHistory
  _use(
    c.update(
      {
        "id": "a",
        "background": {
          "componentId": "background",
          "changes": {
            "show": true,
            "attrs": {"x": 1, "y": 2},
            "source": {
              "type": "rect",
              "fill": "#123456",
              "borderWidth": 2,
              "borderColor": "#112233",
              "radius": 3,
            },
            "tint": "#aabbcc",
          },
        },
      },
      actionId: "single-background",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapTextPresentationChanges.text
  _use(
    c.update(
      {
        "id": "a",
        "text": {
          "componentId": "text",
          "changes": {
            "show": true,
            "attrs": {"x": 2, "y": 3},
            "margin": {"top": 2, "right": 3, "bottom": 4, "left": 5},
            "placement": "bottom",
            "split": 1,
            "tint": "#445566",
          },
          "text": "single",
          "style": {"fontSize": 13},
        },
      },
      actionId: "single-text",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapTextPresentationChanges.style
  _use(
    c.update(
      {
        "id": "a",
        "text": {
          "componentId": "text",
          "changes": {
            "show": true,
            "attrs": {"x": 2, "y": 3},
            "margin": {"top": 2, "right": 3, "bottom": 4, "left": 5},
            "placement": "bottom",
            "split": 1,
            "tint": "#445566",
          },
          "text": "single",
          "style": {"fontSize": 13},
        },
      },
      actionId: "single-text",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapTextPresentationColumns.text
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "text": {
          "componentId": "text",
          "changes": {
            "show": [true, true],
            "attrs": [
              {"x": 2, "y": 3},
              {"x": 2, "y": 3},
            ],
            "margin": [
              {"top": 2, "right": 3, "bottom": 4, "left": 5},
              {"top": 2, "right": 3, "bottom": 4, "left": 5},
            ],
            "placement": ["bottom", "bottom"],
            "split": [1, 1],
            "tint": ["#445566", "#445566"],
          },
          "text": ["column-A", "column-B"],
          "style": [
            {"fontSize": 15},
            {"fontSize": 16},
          ],
        },
      },
      actionId: "columns-text",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapTextPresentationColumns.style
  _use(
    c.updateBatch(
      {
        "targets": ["a", "b"],
        "text": {
          "componentId": "text",
          "changes": {
            "show": [true, true],
            "attrs": [
              {"x": 2, "y": 3},
              {"x": 2, "y": 3},
            ],
            "margin": [
              {"top": 2, "right": 3, "bottom": 4, "left": 5},
              {"top": 2, "right": 3, "bottom": 4, "left": 5},
            ],
            "placement": ["bottom", "bottom"],
            "split": [1, 1],
            "tint": ["#445566", "#445566"],
          },
          "text": ["column-A", "column-B"],
          "style": [
            {"fontSize": 15},
            {"fontSize": 16},
          ],
        },
      },
      actionId: "columns-text",
      recordHistory: false,
      animate: false,
    ),
  );
  // api:api.PatchMapUpdateRecord
  _use(
    c.update({
      "id": "a",
      "changes": {
        "attrs": {"x": 12},
        "locked": false,
      },
    }, recordHistory: false),
  );
  // api:api.PatchMapPresentationPatch
  _use(
    c.update({
      "id": "a",
      "changes": {
        "attrs": {"x": 12},
        "locked": false,
      },
    }, recordHistory: false),
  );
  // api:api.PatchMapTransactionOptions
  _use(
    c.transaction(
      [
        {
          "type": "update",
          "id": "a",
          "changes": {
            "attrs": {"x": 25},
          },
        },
      ],
      actionId: "companion",
      recordHistory: true,
      animate: false,
      companion: {"panel": "advanced"},
      selectedIds: ["a"],
      conflictPolicy: "reject",
    ),
  );
  // api:api.PatchMapTransactionOptions.actionId
  _use(
    c.transaction(
      [
        {
          "type": "update",
          "id": "a",
          "changes": {
            "attrs": {"x": 25},
          },
        },
      ],
      actionId: "companion",
      recordHistory: true,
      animate: false,
      companion: {"panel": "advanced"},
      selectedIds: ["a"],
      conflictPolicy: "reject",
    ),
  );
  // api:api.PatchMapTransactionOptions.animate
  _use(
    c.transaction(
      [
        {
          "type": "update",
          "id": "a",
          "changes": {
            "attrs": {"x": 25},
          },
        },
      ],
      actionId: "companion",
      recordHistory: true,
      animate: false,
      companion: {"panel": "advanced"},
      selectedIds: ["a"],
      conflictPolicy: "reject",
    ),
  );
  // api:api.PatchMapTransactionOptions.companion
  _use(
    c.transaction(
      [
        {
          "type": "update",
          "id": "a",
          "changes": {
            "attrs": {"x": 25},
          },
        },
      ],
      actionId: "companion",
      recordHistory: true,
      animate: false,
      companion: {"panel": "advanced"},
      selectedIds: ["a"],
      conflictPolicy: "reject",
    ),
  );
  // api:api.PatchMapTransactionOptions.conflictPolicy
  _use(
    c.transaction(
      [
        {
          "type": "update",
          "id": "a",
          "changes": {
            "attrs": {"x": 25},
          },
        },
      ],
      actionId: "companion",
      recordHistory: true,
      animate: false,
      companion: {"panel": "advanced"},
      selectedIds: ["a"],
      conflictPolicy: "reject",
    ),
  );
  // api:api.PatchMapTransactionOptions.recordHistory
  _use(
    c.transaction(
      [
        {
          "type": "update",
          "id": "a",
          "changes": {
            "attrs": {"x": 25},
          },
        },
      ],
      actionId: "companion",
      recordHistory: true,
      animate: false,
      companion: {"panel": "advanced"},
      selectedIds: ["a"],
      conflictPolicy: "reject",
    ),
  );
  // api:api.PatchMapTransactionOptions.selectedIds
  _use(
    c.transaction(
      [
        {
          "type": "update",
          "id": "a",
          "changes": {
            "attrs": {"x": 25},
          },
        },
      ],
      actionId: "companion",
      recordHistory: true,
      animate: false,
      companion: {"panel": "advanced"},
      selectedIds: ["a"],
      conflictPolicy: "reject",
    ),
  );
  // api:api.PatchMapDataReplaceOptions.datasetRef
  _use(
    await c.data.replaceAsync(
      [],
      fit: false,
      strict: true,
      datasetRef: 'binding-fixture',
    ),
  );
  // api:api.PatchMapDataReplaceOptions.strict
  _use(
    await c.data.replaceAsync(
      [],
      fit: false,
      strict: true,
      datasetRef: 'binding-fixture',
    ),
  );
  // api:api.PatchMapDataApi.replaceAsync
  _use(
    await c.data.replaceAsync(
      [],
      fit: false,
      strict: true,
      datasetRef: 'binding-fixture',
    ),
  );
  // api:api.PatchMapTargetQuery.componentId
  _use(
    c.targets.query({
      'scope': 'authored',
      'within': 'a',
      'componentId': 'bar',
      'type': 'bar',
    }),
  );
  // api:api.PatchMapTargetQuery.scope
  _use(
    c.targets.query({
      'scope': 'authored',
      'within': 'a',
      'componentId': 'bar',
      'type': 'bar',
    }),
  );
  // api:api.PatchMapTargetQuery.within
  _use(
    c.targets.query({
      'scope': 'authored',
      'within': 'a',
      'componentId': 'bar',
      'type': 'bar',
    }),
  );
  // api:api.PatchMapTargetScope
  _use(c.targets.query({'scope': 'authored'}));
  // api:api.PatchMapPresentationLayer.scope
  _use(
    c.presentation.set('dim', {
      'scope': c.targets.query({'scope': 'authored', 'type': 'bar'}),
      'targets': [
        {'id': 'a', 'componentId': 'bar'},
      ],
      'matched': {'alphaMultiplier': .4},
      'unmatched': {'alphaMultiplier': .8},
    }),
  );
  // api:api.PatchMapPresentationLayer.unmatched
  _use(
    c.presentation.set('dim', {
      'targets': [
        {'id': 'a'},
      ],
      'unmatched': {'alphaMultiplier': .8},
    }),
  );
  // api:api.PatchMapResizeByOptions.minSize
  _use(c.transform.resizeBy(['a'], handle: 'se', delta: [2, 3], minSize: 10));
  // api:api.PatchMapTransformOptions.recordHistory
  _use(
    c.transform.resizeBy(
      ['a'],
      handle: 'se',
      delta: [2, 3],
      recordHistory: false,
      actionId: 'resize',
    ),
  );
  // api:api.PatchMapTransformSessionInput.handle
  _use(
    c.transform.beginSession(
      targets: ['b'],
      kind: 'resize',
      handle: 'se',
      actionId: 'resize-session',
    ),
  );
  // api:api.PatchMapRotationAnimationOptions.path
  _use(c.rotation.animateTo(90, durationMs: 0, path: 'clockwise'));
  // api:api.PatchMapRotationPath
  _use(c.rotation.animateTo(90, path: 'clockwise', durationMs: 0));
  // api:api.PatchMapCaptureApi
  _use(await c.capture.png());
  // api:api.PatchMapCaptureApi.png
  _use(await c.capture.png());
  // api:api.PatchMapCaptureResult
  _use((await c.capture.png()));
  // api:api.PatchMapCaptureResult.dataUrl
  _use((await c.capture.png()).dataUrl);
  // api:api.PatchMapCaptureResult.mime
  _use((await c.capture.png()).mime);
  // api:api.PatchMapCaptureResult.size
  _use((await c.capture.png()).size);
  // api:api.PatchMap.type.destroy
  _use(await c.destroy());
  // api:api.PatchMapInstance.destroy
  _use(await c.destroy());
  // api:api.PatchMap.type.destroyed
  _use(c.destroyed);
  // api:api.PatchMapInstance.destroyed
  _use(c.destroyed);
  // api:api.PatchMapApi.capture
  _use(c.capture);
  // api:api.PatchMapInstance.capture
  _use(c.capture);
  // api:api.PatchMap.type.capture
  _use(c.capture);
  // api:api.PatchMap
  _use(await PatchMap.create(data: [], fit: false));
  // api:api.PatchMap.mount
  _use(await PatchMap.create(data: [], fit: false));
  // api:api.PatchMapStatic
  _use(await PatchMap.create(data: [], fit: false));
  // api:api.PatchMapStatic.mount
  _use(await PatchMap.create(data: [], fit: false));
  // api:api.PatchMap.type
  _use(c);
  // api:api.PatchMapApi
  _use(c);
  // api:api.PatchMapInstance
  _use(c);
  // api:api.PatchMapOptions.data
  _use(await PatchMap.create(data: []));
  // api:api.PatchMapOptions.width
  _use(await PatchMap.create(width: 480));
  // api:api.PatchMapOptions.height
  _use(await PatchMap.create(height: 520));
  // api:api.PatchMapOptions.pixelRatio
  _use(await PatchMap.create(pixelRatio: 1));
  // api:api.PatchMapOptions.fit
  _use(await PatchMap.create(fit: false));
  // api:api.PatchMapOptions.historyLimit
  _use(await PatchMap.create(historyLimit: 2));
  // api:api.PatchMapOptions.instanceId
  _use(await PatchMap.create(instanceId: 'binding'));
  // api:api.PatchMapOptions
  _use(await PatchMap.create(data: [], width: 480, height: 520, fit: false));
  // api:api.PatchMapError
  _use(
    PatchMapException.fromDiagnostic({
      'code': 'INVALID_INPUT',
      'operation': 'update',
      'recoverable': true,
    }),
  );
  // api:api.PatchMapError.prototype
  _use(
    PatchMapException.fromDiagnostic({
      'code': 'INVALID_INPUT',
      'operation': 'update',
      'recoverable': true,
    }),
  );
  // api:api.PatchMapError.type
  _use(
    PatchMapException.fromDiagnostic({
      'code': 'INVALID_INPUT',
      'operation': 'update',
      'recoverable': true,
    }),
  );
  // api:api.PatchMapError.type.code
  _use(
    (PatchMapException.fromDiagnostic({
      'code': 'INVALID_INPUT',
      'operation': 'update',
      'recoverable': true,
    })).code,
  );
  // api:api.PatchMapError.type.diagnostic
  _use(
    (PatchMapException.fromDiagnostic({
      'code': 'INVALID_INPUT',
      'operation': 'update',
      'recoverable': true,
    })).diagnostic,
  );
  // api:api.PatchMapError.type.hint
  _use(
    (PatchMapException.fromDiagnostic({
      'code': 'INVALID_INPUT',
      'operation': 'update',
      'recoverable': true,
    })).hint,
  );
  // api:api.PatchMapError.type.operation
  _use(
    (PatchMapException.fromDiagnostic({
      'code': 'INVALID_INPUT',
      'operation': 'update',
      'recoverable': true,
    })).operation,
  );
  // api:api.PatchMapError.type.recoverable
  _use(
    (PatchMapException.fromDiagnostic({
      'code': 'INVALID_INPUT',
      'operation': 'update',
      'recoverable': true,
    })).recoverable,
  );
  // api:api.PatchMapApi.assets
  _use(c.assets);
  // api:api.PatchMapInstance.assets
  _use(c.assets);
  // api:api.PatchMap.type.assets
  _use(c.assets);
  // api:api.PatchMapOptions.assets
  _use(
    await PatchMap.create(
      assets: [
        {
          'alias': 'image',
          'kind': 'image',
          'descriptor': {'src': 'https://example.invalid/image.png'},
        },
      ],
    ),
  );
  // api:api.PatchMapOptions.assetRuntime
  _use(await PatchMap.create(assetRuntime: PatchMapAssetRuntime()));
  // api:api.PatchMapOptions.assetPolicy
  _use(await PatchMap.create(assetPolicy: {'allowNetwork': false}));
  // api:api.PatchMapTheme
  _use(
    await PatchMap.create(
      theme: {
        'status': {'good': '#00ff00'},
      },
    ),
  );
  // api:api.PatchMapOptions.theme
  _use(
    await PatchMap.create(
      theme: {
        'status': {'good': '#00ff00'},
      },
    ),
  );
  // api:api.PatchMapDiagnostic.logicalId
  _use(
    PatchMapException.fromDiagnostic({
      'code': 'INVALID_INPUT',
      'operation': 'update',
      'recoverable': true,
      'logicalId': 'opaque-reference',
    }).diagnostic?['logicalId'],
  );
  // api:api.PatchMapDiagnostic.sanitizedAssetId
  _use(
    PatchMapException.fromDiagnostic({
      'code': 'INVALID_INPUT',
      'operation': 'update',
      'recoverable': true,
      'sanitizedAssetId': 'opaque-reference',
    }).diagnostic?['sanitizedAssetId'],
  );
  // api:api.PatchMapDiagnostic.sanitizedHash
  _use(
    PatchMapException.fromDiagnostic({
      'code': 'INVALID_INPUT',
      'operation': 'update',
      'recoverable': true,
      'sanitizedHash': 'opaque-reference',
    }).diagnostic?['sanitizedHash'],
  );
}
