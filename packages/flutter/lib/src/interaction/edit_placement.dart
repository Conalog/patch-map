import 'dart:ui';

import '../api/result.dart';
import '../api/events.dart';
import '../api/target.dart';
import '../api/update.dart';
import '../geometry/affine.dart';
import '../geometry/geometry_snapshot.dart';

typedef CommitMove =
    Future<PatchMapResult> Function(
      List<PatchMapUpdate> updates,
      bool Function() canPublish,
      void Function() didPublish,
    );

Future<PatchMapMoveResult> commitPositions(
  CommitMove commit,
  Map<String, Offset> positions,
  bool Function() canPublish,
  void Function() didPublish,
) async {
  final result = await commit(
    [
      for (final entry in positions.entries)
        PatchMapUpdate(PatchMapTarget(entry.key), {
          'attrs': {'x': entry.value.dx, 'y': entry.value.dy},
        }),
    ],
    canPublish,
    didPublish,
  );
  return PatchMapMoveResult(
    result,
    result.outcome == PatchMapOutcome.applied && !result.superseded
        ? positions
        : const {},
  );
}

List<String> editRoots(GeometrySnapshot snapshot, Iterable<String> ids) {
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

/// The position and parent transform against which an edit was computed.
final class EditPlacement {
  const EditPlacement._(this._world, this._parent, this._inverse, this.local);

  static EditPlacement? capture(GeometrySnapshot snapshot, int slot) {
    if (!_movable(snapshot, slot)) return null;
    final target = snapshot.nodes[slot], parent = _parentWorld(snapshot, slot);
    final inverse = parent.inverse;
    return inverse == null
        ? null
        : EditPlacement._(
            target.world,
            parent,
            inverse,
            localTranslation(target.data),
          );
  }

  final Affine _world, _parent, _inverse;
  final Offset local;

  bool matches(GeometrySnapshot snapshot, int slot) {
    final target = snapshot.nodes[slot];
    return target.world.sameTransform(_world) &&
        _parentWorld(snapshot, slot).sameTransform(_parent) &&
        localTranslation(target.data) == local &&
        _movable(snapshot, slot);
  }

  Offset translate(Offset delta) =>
      local +
      Offset(
        _inverse.a * delta.dx + _inverse.c * delta.dy,
        _inverse.b * delta.dx + _inverse.d * delta.dy,
      );
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
