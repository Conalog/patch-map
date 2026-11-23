import 'dart:ui';

import 'package:flutter/foundation.dart' show internal;
import 'package:flutter/painting.dart' show EdgeInsets;

import '../api/result.dart';
import '../api/camera.dart';
import '../api/edit_history.dart';
import '../api/object_geometry.dart';
import '../api/presentation.dart';
import '../api/events.dart';
import '../api/selection_alignment.dart';
import '../api/target.dart';
import '../api/update.dart';

/// One reusable command facade. The attached widget owns every resource; this
/// controller never queues commands or retains a renderer while disconnected.
final class PatchMapController {
  PatchMapBinding? _binding;
  bool get isAttached => _binding != null;
  PatchMapPhase get phase => _binding?.phase ?? PatchMapPhase.empty;

  /// Latest applied state, or null while detached, empty, preparing or failed.
  /// An inactive ready widget still exposes its retained camera.
  PatchMapCameraState? get camera => _binding?.camera;
  Future<PatchMapResult> draw(Object? data) =>
      _binding?.draw(data) ?? _detached();
  Future<PatchMapResult> updateValues(Iterable<PatchMapUpdate> updates) =>
      _binding?.update(updates) ?? _detached();

  /// Append authored root objects to the current diagram as one editor action.
  /// Success follows submission. The camera and existing effective data remain.
  Future<PatchMapResult> addObjects(
    List<Map<String, Object?>> objects, {
    bool selectAdded = true,
  }) => _binding?.addObjects(objects, selectAdded: selectAdded) ?? _detached();

  /// Replace a relation's links and/or merge its top-level metadata keys.
  /// The change is one undoable edit and completes after submission.
  Future<PatchMapResult> updateRelation(
    String id, {
    List<Map<String, Object?>>? links,
    Map<String, Object?>? metadata,
  }) =>
      _binding?.editRelation(id, links: links, metadata: metadata) ??
      _detached();

  /// Publish the last of a series of complete link lists in one transaction
  /// during an open relation edit. Each changed list is a local undo step.
  Future<PatchMapResult> updateRelationLinkSteps(
    String id,
    List<List<Map<String, Object?>>> steps,
  ) => _binding?.editRelation(id, linkSteps: steps) ?? _detached();

  /// Display transient links for an unlocked relation in the next map frame.
  /// This leaves the committed record, hit geometry, and history intact.
  PatchMapResult previewRelationLinks(
    String id,
    List<Map<String, Object?>> links,
  ) => _binding?.previewRelationLinks(id, links) ?? _denial();

  /// Restore the committed relation drawing.
  void clearRelationLinkPreview() => _binding?.clearRelationLinkPreview();

  /// Remove a root or nested relation as one undoable edit.
  /// A matching last link edit can be merged so undo restores a linked relation.
  Future<PatchMapResult> removeRelation(
    String id, {
    bool mergeEmptyLinkEdit = false,
  }) =>
      _binding?.editRelation(
        id,
        remove: true,
        mergeEmptyLinkEdit: mergeEmptyLinkEdit,
      ) ??
      _detached();

  /// Append a draft relation and open the same local link history as an edit.
  /// Requires enabled edit history. The draft is part of the live diagram
  /// after submission. Only finishing a nonempty draft records an addition.
  Future<PatchMapResult> beginRelationCreation(Map<String, Object?> relation) =>
      _binding?.beginRelationCreation(relation) ?? _detached();

  /// Discard an open draft after submission and restore its original selection.
  Future<PatchMapResult> cancelRelationCreation(String id) =>
      _binding?.finishRelationEdit(
        id,
        removeIfEmpty: true,
        cancelCreation: true,
      ) ??
      _detached();

  /// Open a local undo/redo history for live link edits to this relation.
  /// Requires an enabled editor history and an editable relation.
  PatchMapResult beginRelationEdit(String id) =>
      _binding?.beginRelationEdit(id) ?? _denial();

  /// Finish the local link edit as one editor action and restore the previous
  /// selection. Unchanged links leave both global history branches intact.
  /// When enabled, removing an empty relation is part of the same action.
  /// A new draft is selected and added as one action, or discarded if empty.
  Future<PatchMapResult> finishRelationEdit(
    String id, {
    bool removeIfEmpty = false,
  }) =>
      _binding?.finishRelationEdit(id, removeIfEmpty: removeIfEmpty) ??
      _detached();

  /// Replace one captured alpha layer. Acceptance is synchronous; the next
  /// ordinary frame displays it. Authored/live values and selection stay intact.
  PatchMapPresentationResult setPresentation(
    String key,
    PatchMapPresentationLayer layer,
  ) => _binding?.setPresentation(key, layer) ?? _presentationDenial();
  PatchMapPresentationResult clearPresentation(String key) =>
      _binding?.clearPresentation(key) ?? _presentationDenial();
  Map<String, Object?>? getValue(PatchMapTarget target) =>
      _binding?.value(target);

  /// Authored root IDs in document order from the current publication.
  List<String> get rootIds => _binding?.rootIds ?? const [];

  /// Latest published object geometry, independent of the camera transform.
  /// Returns null for unknown IDs or a detached/empty/preparing/failed map.
  /// Inactive maps expose the last publication, not queued value changes.
  /// Grid cells use their concrete IDs; components are not separate objects.
  /// Reading does not schedule a frame or wait for submission/animation.
  PatchMapObjectGeometry? getGeometry(String id) => _binding?.geometry(id);

  /// Visible, unlocked relations that directly reference the given endpoint
  /// in the published diagram. Use the concrete ID for a grid cell.
  List<PatchMapObject> getSelectableRelationsFor(String endpointId) =>
      _binding?.selectableRelationsFor(endpointId) ?? const [];

  PatchMapResult fit({
    Iterable<String>? targets,
    EdgeInsets padding = EdgeInsets.zero,
  }) => _binding?.fit(targets, padding) ?? _denial();
  PatchMapResult focus(
    Iterable<String> targets, {
    EdgeInsets padding = EdgeInsets.zero,
  }) => _binding?.focus(targets, padding) ?? _denial();
  PatchMapResult setCamera({Offset? center, double? scale, double? rotation}) =>
      _binding?.setCamera(center, scale, rotation) ?? _denial();

  /// Rotate clockwise radians to an absolute orientation by the shortest path.
  /// Uses the widget's rotationAnimation policy. Result confirms acceptance,
  /// not animation completion. setCamera remains the immediate alternative.
  PatchMapResult rotateTo(double rotation) =>
      _binding?.rotateTo(rotation) ?? _denial();
  List<PatchMapObject> get selected => _binding?.selected ?? const [];

  /// Replace the selection. Pass [recordHistory] to record changed IDs as one
  /// undoable selection action when editing history is enabled.
  PatchMapResult select(Iterable<String> ids, {bool recordHistory = false}) =>
      _binding?.select(ids, 'set', recordHistory: recordHistory) ?? _denial();
  PatchMapResult addSelection(Iterable<String> ids) =>
      _binding?.select(ids, 'add') ?? _denial();
  PatchMapResult removeSelection(Iterable<String> ids) =>
      _binding?.select(ids, 'remove') ?? _denial();
  PatchMapResult toggleSelection(Iterable<String> ids) =>
      _binding?.select(ids, 'toggle') ?? _denial();
  PatchMapResult clearSelection() => select(const []);

  /// Align or evenly space the current selection in world coordinates. Applied
  /// positions are returned after the map submits the change.
  Future<PatchMapMoveResult> alignSelection(PatchMapAlignment alignment) =>
      _binding?.alignSelection(alignment) ??
      Future.value(PatchMapMoveResult(_denial(), const {}));

  PatchMapEditHistoryState get editHistoryState =>
      _binding?.editHistoryState ?? emptyEditHistoryState;

  /// Restore the previous editor action. Scene changes follow submission.
  Future<PatchMapMoveResult> undo() =>
      _binding?.replayEdit(redo: false) ??
      Future.value(PatchMapMoveResult(_denial(), const {}));

  /// Reapply the next editor action. Scene changes follow submission.
  Future<PatchMapMoveResult> redo() =>
      _binding?.replayEdit(redo: true) ??
      Future.value(PatchMapMoveResult(_denial(), const {}));

  Offset? toWorld(Offset local) => _binding?.toWorld(local);
  Offset? toLocal(Offset world) => _binding?.toLocal(world);

  @internal
  void attach(PatchMapBinding binding) {
    if (_binding != null && !identical(_binding, binding)) {
      throw StateError(
        'PatchMapController is already attached to a live widget',
      );
    }
    _binding = binding;
  }

  @internal
  void detach(PatchMapBinding binding) {
    if (identical(_binding, binding)) _binding = null;
  }
}

/// Internal attachment port; public types carry no native renderer handles.
@internal
abstract class PatchMapBinding {
  PatchMapPhase get phase;
  PatchMapCameraState? get camera;
  Future<PatchMapResult> draw(Object? data);
  Future<PatchMapResult> update(Iterable<PatchMapUpdate> updates);
  Future<PatchMapResult> addObjects(
    List<Map<String, Object?>> objects, {
    required bool selectAdded,
  });
  Future<PatchMapResult> editRelation(
    String id, {
    List<Map<String, Object?>>? links,
    List<List<Map<String, Object?>>>? linkSteps,
    Map<String, Object?>? metadata,
    bool remove = false,
    bool mergeEmptyLinkEdit = false,
  });
  Future<PatchMapResult> beginRelationCreation(Map<String, Object?> relation);
  PatchMapResult beginRelationEdit(String id);
  PatchMapResult previewRelationLinks(
    String id,
    List<Map<String, Object?>> links,
  );
  void clearRelationLinkPreview();
  Future<PatchMapResult> finishRelationEdit(
    String id, {
    required bool removeIfEmpty,
    bool cancelCreation = false,
  });
  PatchMapPresentationResult setPresentation(
    String key,
    PatchMapPresentationLayer layer,
  );
  PatchMapPresentationResult clearPresentation(String key);
  Map<String, Object?>? value(PatchMapTarget target);
  List<String> get rootIds;
  PatchMapObjectGeometry? geometry(String id);
  List<PatchMapObject> selectableRelationsFor(String endpointId);
  PatchMapResult fit(Iterable<String>? targets, EdgeInsets padding);
  PatchMapResult focus(Iterable<String> targets, EdgeInsets padding);
  PatchMapResult setCamera(Offset? center, double? scale, double? rotation);
  PatchMapResult rotateTo(double rotation);
  List<PatchMapObject> get selected;
  PatchMapResult select(
    Iterable<String> ids,
    String mode, {
    bool recordHistory = false,
  });
  Future<PatchMapMoveResult> alignSelection(PatchMapAlignment alignment);
  PatchMapEditHistoryState get editHistoryState;
  Future<PatchMapMoveResult> replayEdit({required bool redo});
  Offset toWorld(Offset local);
  Offset toLocal(Offset world);
}

PatchMapResult _denial() => PatchMapResult(
  PatchMapOutcome.rejected,
  failures: const [PatchMapFailure('DETACHED', 'No map widget is attached')],
);
Future<PatchMapResult> _detached() => Future.value(_denial());

PatchMapPresentationResult _presentationDenial() => PatchMapPresentationResult(
  PatchMapOutcome.rejected,
  failures: const [PatchMapFailure('DETACHED', 'No map widget is attached')],
);
