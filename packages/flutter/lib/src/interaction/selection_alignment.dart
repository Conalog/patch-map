import 'dart:math' as math;
import 'dart:ui';

import '../api/events.dart';
import '../api/result.dart';
import '../api/selection_alignment.dart';
import '../api/target.dart';
import '../geometry/geometry_snapshot.dart';
import '../geometry/layout.dart';
import '../geometry/scene_geometry.dart';
import 'edit_placement.dart';
import 'selection_state.dart';

Future<PatchMapMoveResult> alignSelectedObjects(
  PatchMapAlignment alignment,
  GeometrySnapshot snapshot,
  SelectionState selection,
  CommitMove commit,
) async {
  final ids = editRoots(snapshot, selection.ids);
  if (ids.length < 2) {
    return _rejected('INVALID_VALUE', 'Select at least two objects to align');
  }
  final targets = <({int slot, Rect bounds, EditPlacement placement})>[];
  for (final id in ids) {
    final slot = snapshot.topology.slots[id]!;
    final placement = EditPlacement.capture(snapshot, slot);
    final bounds = _alignmentBounds(snapshot.nodes[slot]);
    if (placement == null || bounds == null) {
      return _rejected(
        'INVALID_MUTATION',
        'Alignment requires an editable element with rectangular bounds',
        id,
      );
    }
    targets.add((slot: slot, bounds: bounds, placement: placement));
  }

  final coordinates = [
    for (final target in targets) _coordinate(alignment, target.bounds),
  ];
  final anchor = switch (alignment) {
    PatchMapAlignment.left ||
    PatchMapAlignment.top => coordinates.reduce(math.min),
    PatchMapAlignment.right ||
    PatchMapAlignment.bottom => coordinates.reduce(math.max),
    PatchMapAlignment.centerX || PatchMapAlignment.centerY => coordinates.fold(
      0.0,
      (sum, value) => sum + value / coordinates.length,
    ),
  };
  final positions = <String, Offset>{};
  for (var i = 0; i < targets.length; i++) {
    final delta = anchor - coordinates[i];
    if (delta.abs() <= 1e-9) continue;
    final placement = targets[i].placement;
    final position = placement.translate(switch (alignment) {
      PatchMapAlignment.left ||
      PatchMapAlignment.right ||
      PatchMapAlignment.centerX => Offset(delta, 0),
      _ => Offset(0, delta),
    });
    if (!position.isFinite) {
      return _rejected(
        'INVALID_GEOMETRY',
        'Nonfinite alignment position',
        ids[i],
      );
    }
    if (position != placement.local) positions[ids[i]] = position;
  }
  if (positions.isEmpty) {
    return PatchMapMoveResult(
      PatchMapResult(PatchMapOutcome.unchanged),
      const {},
    );
  }

  final topology = snapshot.topology, revision = selection.revision;
  return commitPositions(commit, positions, () {
    final current = selection.currentGeometry();
    return current != null &&
        identical(current.topology, topology) &&
        selection.revision == revision &&
        targets.every(
          (target) =>
              target.placement.matches(current, target.slot) &&
              _alignmentBounds(current.nodes[target.slot]) == target.bounds,
        );
  }, () {});
}

double _coordinate(PatchMapAlignment alignment, Rect bounds) =>
    switch (alignment) {
      PatchMapAlignment.left => bounds.left,
      PatchMapAlignment.right => bounds.right,
      PatchMapAlignment.top => bounds.top,
      PatchMapAlignment.bottom => bounds.bottom,
      PatchMapAlignment.centerX => bounds.left + bounds.width / 2,
      PatchMapAlignment.centerY => bounds.top + bounds.height / 2,
    };

Rect? _alignmentBounds(TargetGeometry node) {
  final data = node.data;
  final size = switch ((node.target.type, data['size'])) {
    ('item' || 'rect', _) => node.localBounds?.size,
    ('text' || 'image', final Map size) => fixedSize(size),
    ('grid', _) => _gridSize(data),
    _ => null,
  };
  if (size == null) return null;
  final bounds = node.world.projectRect(Offset.zero & size).bounds;
  return bounds.isFinite && bounds.size.isFinite ? bounds : null;
}

Size _gridSize(Map<String, Object?> data) {
  final rows = data['cells']! as List;
  var columns = 0;
  for (final row in rows) {
    columns = math.max(columns, (row as List).length);
  }
  final item = data['item']! as Map;
  final cell = fixedSize(item['size']! as Map), gap = data['gap']! as Map;
  // Authored grid slots count even when their cells are inactive.
  return Size(
    columns == 0
        ? 0
        : columns * cell.width + (columns - 1) * (gap['x']! as num),
    rows.isEmpty
        ? 0
        : rows.length * cell.height + (rows.length - 1) * (gap['y']! as num),
  );
}

PatchMapMoveResult _rejected(String code, String message, [String? id]) =>
    PatchMapMoveResult(
      PatchMapResult(
        PatchMapOutcome.rejected,
        failures: [
          PatchMapFailure(
            code,
            message,
            target: id == null ? null : PatchMapTarget(id),
          ),
        ],
      ),
      const {},
    );
