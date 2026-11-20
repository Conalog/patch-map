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

  /// Remove a root or nested relation as one undoable edit.
  Future<PatchMapResult> removeRelation(String id) =>
      _binding?.editRelation(id, remove: true) ?? _detached();

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
    Map<String, Object?>? metadata,
    bool remove = false,
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
