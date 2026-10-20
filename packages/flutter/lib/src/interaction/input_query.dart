import 'dart:math' as math;
import 'dart:ui';

import '../api/events.dart';
import '../geometry/affine.dart';
import '../geometry/geometry_snapshot.dart';
import '../geometry/item_data.dart';
import '../geometry/scene_geometry.dart';

/// Slots and shapes must belong to the supplied publication, including any
/// renderer-owned relation stroke shapes. No index is rebuilt by pointer input.
typedef SpatialCandidates =
    Iterable<int> Function(GeometrySnapshot snapshot, Rect bounds);

/// Exact prepared geometry, e.g. RelationGeometry method tear-offs. The host
/// caches this adapter beside the corresponding published geometry.
final class InputHitGeometry {
  const InputHitGeometry({
    required this.contains,
    required this.segmentEntry,
    required this.intersects,
  });
  final bool Function(Offset point) contains;
  final double? Function(Offset from, Offset to) segmentEntry;
  final bool Function(Quad range) intersects;
}

typedef InputHitGeometryProvider =
    InputHitGeometry? Function(GeometrySnapshot snapshot, TargetGeometry node);

final class InputQueryPorts {
  const InputQueryPorts({
    required this.getSpatialCandidates,
    this.exactGeometry,
  });
  final SpatialCandidates getSpatialCandidates;
  final InputHitGeometryProvider? exactGeometry;
}

typedef InputFilter = bool Function(PatchMapObject object);

final class InputQuery {
  InputQuery({required this.ports, this.filter});
  final InputQueryPorts ports;
  InputFilter? filter;
  List<int>? _paintSlots;
  Map<int, int> _rank = const {};
  Object? lastFilterError;

  void reset() {
    _paintSlots = null;
    _rank = const {};
  }

  PatchMapObject object(TargetGeometry node) => PatchMapObject(
    id: node.id,
    type: node.target.type,
    gridId: node.target.row == null ? null : node.target.parentId,
    row: node.target.row,
    column: node.target.column,
    authoredData: node.target.data,
    effectiveData: exportItemData(node.data),
  );

  bool _allow(PatchMapObject object) {
    try {
      return filter?.call(object) ?? true;
    } catch (error) {
      lastFilterError = error;
      return false;
    }
  }

  List<int> _candidates(GeometrySnapshot snapshot, Rect bounds) {
    if (!identical(_paintSlots, snapshot.paintSlots)) {
      _paintSlots = snapshot.paintSlots;
      _rank = {
        for (var i = 0; i < snapshot.paintSlots.length; i++)
          snapshot.paintSlots[i]: i,
      };
    }
    final slots = ports.getSpatialCandidates(snapshot, bounds).toSet().toList();
    slots.sort((a, b) => (_rank[b] ?? -1).compareTo(_rank[a] ?? -1));
    return slots;
  }

  PatchMapObject? point(
    GeometrySnapshot snapshot,
    Offset world,
    double cameraRotation,
  ) {
    for (final slot in _candidates(snapshot, Rect.fromPoints(world, world))) {
      final node = snapshot.nodes[slot];
      if (!_acceptsInput(node)) continue;
      // Main entity point/range queries first reject against item size AABB.
      // Paint segments intentionally retain their component overflow surface.
      if (_hasItemSizeBounds(node) &&
          !boundsOverlap(node.bounds!, Rect.fromPoints(world, world))) {
        continue;
      }
      final exact = ports.exactGeometry?.call(snapshot, node);
      if (!(exact?.contains(world) ??
          _shapes(
            snapshot,
            node,
            cameraRotation,
          ).any((shape) => shape.contains(world)))) {
        continue;
      }
      final result = object(node);
      if (_allow(result)) return result;
    }
    return null;
  }

  List<PatchMapObject> range(
    GeometrySnapshot snapshot,
    Quad range,
    double cameraRotation,
  ) {
    final result = <PatchMapObject>[];
    for (final slot in _candidates(snapshot, range.bounds)) {
      final node = snapshot.nodes[slot];
      if (!_acceptsInput(node)) continue;
      if (_hasItemSizeBounds(node) &&
          !boundsOverlap(node.bounds!, range.bounds)) {
        continue;
      }
      final exact = ports.exactGeometry?.call(snapshot, node);
      if (!(exact?.intersects(range) ??
          _shapes(
            snapshot,
            node,
            cameraRotation,
          ).any((shape) => shape.intersects(range)))) {
        continue;
      }
      final value = object(node);
      if (_allow(value)) result.add(value);
    }
    return List.unmodifiable(result);
  }

  /// Encounter order follows the raw segment; ties use front-to-back paint order.
  List<PatchMapObject> segment(
    GeometrySnapshot snapshot,
    Offset from,
    Offset to,
    double cameraRotation,
  ) {
    final hits = <({double t, int order, PatchMapObject object})>[];
    var order = 0;
    for (final slot in _candidates(snapshot, Rect.fromPoints(from, to))) {
      final node = snapshot.nodes[slot];
      if (!_acceptsInput(node)) continue;
      final exact = ports.exactGeometry?.call(snapshot, node);
      double? first;
      if (exact != null) {
        first = exact.segmentEntry(from, to);
      } else {
        for (final shape in _shapes(snapshot, node, cameraRotation)) {
          final t = shape.segmentEntry(from, to);
          if (t != null) first = first == null ? t : math.min(first, t);
        }
      }
      if (first == null) continue;
      final value = object(node);
      if (_allow(value)) hits.add((t: first, order: order++, object: value));
    }
    hits.sort((a, b) {
      final t = a.t.compareTo(b.t);
      return t == 0 ? a.order.compareTo(b.order) : t;
    });
    return List.unmodifiable(hits.map((hit) => hit.object));
  }

  bool _acceptsInput(TargetGeometry node) {
    if (!node.visible || node.locked || node.isContainer) return false;
    if (node.target.type != 'rect') return true;
    final mode = node.data['eventMode'];
    return mode != 'none' && mode != 'passive';
  }

  bool _hasItemSizeBounds(TargetGeometry node) {
    final item = node.item;
    // Main's normalized size fallback is absent for an entirely zero size.
    return item != null && (item.size.width > 0 || item.size.height > 0);
  }

  Iterable<Quad> _shapes(
    GeometrySnapshot snapshot,
    TargetGeometry node,
    double rotation,
  ) sync* {
    final item = node.item;
    if (item == null) {
      final local = node.localBounds;
      if (local != null && !local.isEmpty) {
        yield node.world.projectRect(local);
      }
      return;
    }
    final base = node.world.projectRect(Offset.zero & item.size);
    if (item.components.any(
      (component) => component.visible && component.type == 'background',
    )) {
      yield base;
      return;
    }
    for (final component in item.components) {
      if (!component.visible || component.box.isEmpty) continue;
      final quad = component
          .worldTransform(node.world, rotation, item.size)
          .projectRect(Offset.zero & component.box.size);
      if (component.type != 'bar') {
        yield quad;
        continue;
      }
      // A bar's public hit surface respects the same item clip as drawing.
      final polygon = _clip(quad, base);
      for (var i = 1; i + 1 < polygon.length; i++) {
        yield Quad(polygon[0], polygon[i], polygon[i + 1], polygon[i + 1]);
      }
    }
  }
}

List<Offset> _clip(Quad subject, Quad clip) {
  var points = [for (var i = 0; i < 4; i++) subject.vertex(i)];
  Offset unit(Offset value) {
    final scale = math.max(value.dx.abs(), value.dy.abs());
    return scale == 0 ? Offset.zero : value / scale;
  }

  final sign = cross(unit(clip.p1 - clip.p0), unit(clip.p3 - clip.p0)).sign;
  if (sign == 0) return const [];
  for (var edge = 0; edge < 4 && points.isNotEmpty; edge++) {
    final a = clip.vertex(edge);
    final direction = unit(clip.vertex(edge + 1) - a);
    var coordinateScale = math.max(1.0, math.max(a.dx.abs(), a.dy.abs()));
    for (final point in points) {
      coordinateScale = math.max(
        coordinateScale,
        math.max(point.dx.abs(), point.dy.abs()),
      );
    }
    double distance(Offset point) =>
        cross(direction, point / coordinateScale - a / coordinateScale) * sign;
    final output = <Offset>[];
    var previous = points.last;
    var before = distance(previous);
    for (final point in points) {
      final after = distance(point);
      if ((before >= 0) != (after >= 0)) {
        final t = before / (before - after);
        output.add(previous * (1 - t) + point * t);
      }
      if (after >= 0) output.add(point);
      previous = point;
      before = after;
    }
    points = output;
  }
  return points;
}
