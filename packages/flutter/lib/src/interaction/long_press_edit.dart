import 'dart:async';
import 'dart:ui';

import '../api/camera.dart';
import '../api/events.dart';
import '../api/result.dart';
import '../api/target.dart';
import '../api/update.dart';
import '../geometry/affine.dart';
import '../geometry/geometry_snapshot.dart';
import '../geometry/scene_geometry.dart';
import '../viewport/camera.dart';
import 'input_query.dart';
import 'selection_state.dart';

typedef EditTargetResolver = String? Function(PatchMapObject hit);
typedef CommitMove =
    Future<PatchMapResult> Function(
      List<PatchMapUpdate> updates,
      bool Function() canPublish,
      void Function() didPublish,
    );

/// Transient edit input. Selection and committed geometry still belong to the
/// existing selection and session owners.
final class LongPressEdit {
  LongPressEdit({
    required this.currentGeometry,
    required this.camera,
    required this.query,
    required this.selection,
    required this.invalidate,
    required this.resolveTarget,
    required this.commit,
    required this.notify,
    required this.reportError,
  });

  final GeometrySnapshot? Function() currentGeometry;
  final MapCamera camera;
  final InputQuery query;
  final SelectionState selection;
  final void Function() invalidate;
  final EditTargetResolver resolveTarget;
  final CommitMove commit;
  final void Function(PatchMapMoveResult) notify;
  final void Function(Object, StackTrace) reportError;
  _EditDrag? _drag;
  _EditDrag? _pending;
  bool _disposed = false;

  ({Rect bounds, bool world})? get preview {
    final drag = _drag ?? _pending;
    if (drag == null || !drag.moved || camera.snapshot != drag.camera) {
      return null;
    }
    final bounds = drag.bounds?.shift(drag.worldDelta(camera));
    return bounds == null
        ? (bounds: Rect.fromPoints(drag.start, drag.end), world: false)
        : bounds.isFinite
        ? (bounds: bounds, world: true)
        : null;
  }

  bool begin(Offset local) {
    if (_pending != null) return true;
    final snapshot = currentGeometry();
    if (snapshot == null) return false;
    final hit = _point(snapshot, local);
    final initial = selection.ids.toList();
    final ids = hit == null
        ? const <String>[]
        : _roots(snapshot, initial.contains(hit) ? initial : [hit]);
    final targets = <String, _Placement>{};
    Rect? bounds;
    for (final id in ids) {
      final slot = snapshot.topology.slots[id]!;
      final target = snapshot.nodes[slot];
      final parent = _parentWorld(snapshot, slot);
      final inverse = parent.inverse;
      final envelope = snapshot.boundsFor(id, paint: false);
      if (!_movable(snapshot, slot) || inverse == null || envelope == null) {
        // An immovable selected root must not turn this into a range drag.
        return true;
      }
      targets[id] = _Placement(
        target.world,
        parent,
        inverse,
        _localPosition(target),
      );
      bounds = unionBounds(bounds, envelope);
    }
    final drag = _EditDrag(
      local,
      camera.snapshot,
      snapshot.topology,
      initial,
      targets,
      bounds,
    );
    _drag = drag;
    if (hit != null) {
      // A reentrant callback can change selection, cancel, or replace the map.
      final changed =
          initial.length != ids.length || !initial.every(targets.containsKey);
      drag.selectionRevision = selection.revision + (changed ? 1 : 0);
      selection.set(ids);
    }
    return true;
  }

  void move(Offset local, double slop) {
    final drag = _drag;
    if (drag == null) return;
    if (camera.snapshot != drag.camera) {
      cancel();
      return;
    }
    if (!drag.moved && (local - drag.start).distance <= slop) return;
    if (drag.moved && local == drag.end) return;
    drag
      ..moved = true
      ..end = local;
    invalidate();
  }

  void end(Offset local, double slop) {
    move(local, slop);
    final drag = _drag;
    _drag = null;
    if (drag == null || !drag.moved) return;
    final snapshot = currentGeometry();
    if (snapshot == null || !identical(snapshot.topology, drag.topology)) {
      invalidate();
      return;
    }
    if (drag.targets.isEmpty) {
      final box = Rect.fromPoints(drag.start, drag.end);
      if (!box.isEmpty) {
        final range = Quad(
          camera.localToWorld(box.topLeft),
          camera.localToWorld(box.topRight),
          camera.localToWorld(box.bottomRight),
          camera.localToWorld(box.bottomLeft),
        );
        selection.set(
          _roots(snapshot, [
            for (final hit in query.range(snapshot, range, camera.rotation))
              ?_resolve(snapshot, hit),
          ]),
        );
      }
      invalidate();
      return;
    }
    final delta = drag.worldDelta(camera);
    if (delta == Offset.zero) {
      invalidate();
      return;
    }
    final positions = <String, Offset>{
      for (final entry in drag.targets.entries)
        entry.key: entry.value.translate(delta),
    };
    _pending = drag;
    unawaited(_apply(drag, positions));
  }

  Future<void> _apply(_EditDrag drag, Map<String, Offset> positions) async {
    try {
      final result = await commit(
        [
          for (final entry in positions.entries)
            PatchMapUpdate(PatchMapTarget(entry.key), {
              'attrs': {'x': entry.value.dx, 'y': entry.value.dy},
            }),
        ],
        () => !drag.cancelled && _stillCurrent(drag),
        () {
          drag.published = true;
          // The next frame has the new selection geometry.
          if (identical(_pending, drag)) {
            drag.moved = false;
            invalidate();
          }
        },
      );
      if (!_disposed && !drag.cancelled) {
        notify(
          PatchMapMoveResult(
            result,
            result.outcome == PatchMapOutcome.applied && !result.superseded
                ? positions
                : const {},
          ),
        );
      }
    } catch (error, stack) {
      if (!_disposed && !drag.cancelled) reportError(error, stack);
    } finally {
      if (identical(_pending, drag)) {
        _pending = null;
        invalidate();
      }
    }
  }

  bool _stillCurrent(_EditDrag drag) {
    final snapshot = currentGeometry();
    if (snapshot == null ||
        !identical(snapshot.topology, drag.topology) ||
        camera.snapshot != drag.camera ||
        selection.revision != drag.selectionRevision) {
      return false;
    }
    for (final entry in drag.targets.entries) {
      final slot = snapshot.topology.slots[entry.key]!;
      final before = entry.value;
      final target = snapshot.nodes[slot];
      if (!_movable(snapshot, slot) ||
          !target.world.sameTransform(before.world) ||
          !_parentWorld(snapshot, slot).sameTransform(before.parent) ||
          _localPosition(target) != before.local) {
        return false;
      }
    }
    return true;
  }

  void clearIfEmpty(Offset local) {
    final snapshot = currentGeometry();
    if (snapshot != null &&
        _pending == null &&
        _point(snapshot, local) == null) {
      selection.clear();
    }
  }

  void onCameraChanged() {
    final drag = _drag ?? _pending;
    if (drag != null && camera.snapshot != drag.camera) {
      cancel(pending: true);
    }
  }

  void cancel({bool pending = false, bool restore = true}) {
    final drag = _drag ?? (pending ? _pending : null);
    _drag = null;
    if (drag == null || drag.published || drag.cancelled) return;
    drag.cancelled = true;
    if (restore &&
        drag.targets.isNotEmpty &&
        selection.revision == drag.selectionRevision &&
        identical(currentGeometry()?.topology, drag.topology)) {
      selection.set(drag.selectionBefore);
    }
    if (drag.moved) {
      drag.moved = false;
      invalidate();
    }
  }

  void dispose() {
    _disposed = true;
    cancel(pending: true, restore: false);
  }

  String? _point(GeometrySnapshot snapshot, Offset local) {
    String? id;
    query.point(
      snapshot,
      camera.localToWorld(local),
      camera.rotation,
      accept: (hit) => (id = _resolve(snapshot, hit)) != null,
    );
    return id;
  }

  String? _resolve(GeometrySnapshot snapshot, PatchMapObject hit) {
    if (hit.type == 'relations') return null;
    final id = resolveTarget(hit);
    final node = id == null ? null : snapshot[id];
    return node == null ||
            !node.visible ||
            node.locked ||
            node.target.row != null ||
            node.target.type == 'relations'
        ? null
        : id;
  }
}

List<String> _roots(GeometrySnapshot snapshot, Iterable<String> ids) {
  final selected = ids.toSet(), topology = snapshot.topology;
  return [
    for (final id in selected)
      if (!_hasSelectedAncestor(topology, topology.slots[id]!, selected)) id,
  ];
}

bool _hasSelectedAncestor(
  GeometryTopology topology,
  int slot,
  Set<String> selected,
) {
  for (var p = topology.parents[slot]; p != null; p = topology.parents[p]) {
    if (selected.contains(topology.ids[p])) return true;
  }
  return false;
}

bool _movable(GeometrySnapshot snapshot, int slot) {
  final node = snapshot.nodes[slot];
  if (!node.visible ||
      node.target.row != null ||
      node.target.type == 'relations') {
    return false;
  }
  for (var i = slot; i < snapshot.topology.ends[slot]; i++) {
    if (snapshot.nodes[i].locked) return false;
  }
  return true;
}

Affine _parentWorld(GeometrySnapshot snapshot, int slot) {
  final parent = snapshot.topology.parents[slot];
  return parent == null ? Affine.identity : snapshot.nodes[parent].world;
}

Offset _localPosition(TargetGeometry node) {
  final attrs = node.data['attrs'] as Map?;
  return Offset(
    (attrs?['x'] as num?)?.toDouble() ?? 0,
    (attrs?['y'] as num?)?.toDouble() ?? 0,
  );
}

final class _Placement {
  const _Placement(this.world, this.parent, this.inverse, this.local);
  final Affine world, parent, inverse;
  final Offset local;

  Offset translate(Offset delta) =>
      local +
      Offset(
        inverse.a * delta.dx + inverse.c * delta.dy,
        inverse.b * delta.dx + inverse.d * delta.dy,
      );
}

final class _EditDrag {
  _EditDrag(
    this.start,
    this.camera,
    this.topology,
    this.selectionBefore,
    this.targets,
    this.bounds,
  ) : end = start;

  final Offset start;
  final PatchMapCameraState camera;
  final GeometryTopology topology;
  final List<String> selectionBefore;
  final Map<String, _Placement> targets;
  final Rect? bounds;
  Offset end;
  int? selectionRevision;
  bool moved = false, cancelled = false, published = false;

  Offset worldDelta(MapCamera camera) =>
      camera.localToWorld(end) - camera.localToWorld(start);
}
