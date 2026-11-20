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

typedef _AlignmentTarget = ({int slot, Rect bounds, EditPlacement placement});

Future<PatchMapMoveResult> alignSelectedObjects(
  PatchMapAlignment alignment,
  GeometrySnapshot snapshot,
  SelectionState selection,
  CommitMove commit,
) async {
  final ids = editRoots(snapshot, selection.ids);
  final minimum = alignment.minimumSelectionCount;
  if (ids.length < minimum) {
    return _rejected(
      'INVALID_VALUE',
      'This alignment requires at least $minimum selected objects',
    );
  }
  final targets = <_AlignmentTarget>[];
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

  final horizontal = switch (alignment) {
    PatchMapAlignment.left ||
    PatchMapAlignment.right ||
    PatchMapAlignment.centerX ||
    PatchMapAlignment.distributeHorizontally => true,
    _ => false,
  };
  final deltas = switch (alignment) {
    PatchMapAlignment.distributeHorizontally ||
    PatchMapAlignment.distributeVertically => _distributionDeltas(
      targets,
      horizontal,
    ),
    _ => _alignmentDeltas(targets, alignment),
  };
  final positions = <String, Offset>{};
  for (var i = 0; i < targets.length; i++) {
    final delta = deltas[i];
    if (delta.abs() <= 1e-9) continue;
    final target = targets[i];
    final id = snapshot.topology.ids[target.slot];
    final position = target.placement.translate(
      horizontal ? Offset(delta, 0) : Offset(0, delta),
    );
    if (!position.isFinite) {
      return _rejected('INVALID_GEOMETRY', 'Nonfinite alignment position', id);
    }
    if (position != target.placement.local) positions[id] = position;
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

List<double> _alignmentDeltas(
  List<_AlignmentTarget> targets,
  PatchMapAlignment alignment,
) {
  final coordinates = [
    for (final target in targets) _coordinate(alignment, target.bounds),
  ];
  final anchor = switch (alignment) {
    PatchMapAlignment.left ||
    PatchMapAlignment.top => coordinates.reduce(math.min),
    PatchMapAlignment.right ||
    PatchMapAlignment.bottom => coordinates.reduce(math.max),
    _ => coordinates.fold(
      0.0,
      (sum, value) => sum + value / coordinates.length,
    ),
  };
  for (var i = 0; i < coordinates.length; i++) {
    coordinates[i] = anchor - coordinates[i];
  }
  return coordinates;
}

List<double> _distributionDeltas(
  List<_AlignmentTarget> targets,
  bool horizontal,
) {
  double start(Rect bounds) => horizontal ? bounds.left : bounds.top;
  double end(Rect bounds) => horizontal ? bounds.right : bounds.bottom;
  double extent(Rect bounds) => horizontal ? bounds.width : bounds.height;

  targets.sort((a, b) {
    final byStart = start(a.bounds).compareTo(start(b.bounds));
    if (byStart != 0) return byStart;
    final byExtent = extent(a.bounds).compareTo(extent(b.bounds));
    return byExtent != 0 ? byExtent : a.slot.compareTo(b.slot);
  });
  final first = start(targets.first.bounds);
  var last = end(targets.first.bounds), occupied = 0.0;
  for (final target in targets) {
    last = math.max(last, end(target.bounds));
    occupied += extent(target.bounds);
  }
  // Keep the current span when it can hold every object. For overlapping
  // objects that cannot fit, extend the trailing edge with zero gaps.
  final gap = math.max(0.0, (last - first - occupied) / (targets.length - 1));
  var cursor = first;
  final deltas = <double>[];
  for (final target in targets) {
    deltas.add(cursor - start(target.bounds));
    cursor += extent(target.bounds) + gap;
  }
  return deltas;
}

double _coordinate(PatchMapAlignment alignment, Rect bounds) =>
    switch (alignment) {
      PatchMapAlignment.left => bounds.left,
      PatchMapAlignment.right => bounds.right,
      PatchMapAlignment.top => bounds.top,
      PatchMapAlignment.bottom => bounds.bottom,
      PatchMapAlignment.centerX => bounds.left + bounds.width / 2,
      PatchMapAlignment.centerY => bounds.top + bounds.height / 2,
      _ => throw StateError('Spacing computes its own coordinates'),
    };

Rect? _alignmentBounds(TargetGeometry node) {
  final data = node.data;
  final size = switch ((node.target.type, data['size'])) {
    ('item' || 'rect', _) || ('text', null) => node.localBounds?.size,
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
