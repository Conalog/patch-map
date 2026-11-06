import 'dart:math' as math;
import 'dart:ui';

import '../dataset/dataset_values.dart' show DatasetException;
import 'affine.dart';
import 'geometry_snapshot.dart';
import 'paged_values.dart';
import 'item_layout.dart' show validateBounds;
import 'scene_geometry.dart';

typedef RelationEndpointBounds = Rect? Function(String id);

final class RelationPath {
  RelationPath._(
    this.sourceId,
    this.targetId,
    Iterable<Offset> local,
    Iterable<Offset> world,
  ) : localPoints = List.unmodifiable(local),
      worldPoints = List.unmodifiable(world),
      decoration = null;

  RelationPath._withDecoration(RelationPath path, this.decoration)
    : sourceId = path.sourceId,
      targetId = path.targetId,
      localPoints = path.localPoints,
      worldPoints = path.worldPoints;
  final String sourceId, targetId;
  final List<Offset> localPoints, worldPoints;
  final RelationDecoration? decoration;
  bool get isSelfLink => sourceId == targetId;
  bool get hasLength => localPoints.any((point) => point != localPoints.first);
}

/// Filled contours for a marked link, including the stroke pieces. Each
/// contour winds clockwise so the fill applies alpha once across overlaps.
typedef RelationDecoration = ({
  bool atStart,
  List<Quad> polygons,
  List<Rect> circles,
});

/// Shared retained relation projection. Matches release relation-paths.ts:
/// endpoint centers are world-first, self links are five-point outside loops,
/// and hidden/missing endpoints omit their path.
final class RelationGeometry {
  RelationGeometry._(
    this.world,
    this._inverse,
    this.paths,
    this.width,
    this.bounds,
    this.paintBounds,
    this.hitQuads,
    this._localQuads,
  );

  /// Overlay-friendly projection for a candidate snapshot. Relation endpoints
  /// intentionally omit other relation nodes, matching release surface lookup.
  factory RelationGeometry.resolve(
    TargetGeometry node, {
    required TargetGeometry? Function(String id) targetFor,
    required RelationEndpointBounds endpointBounds,
  }) {
    if (node.target.type != 'relations') {
      throw ArgumentError('expected relations target');
    }
    final inverse = node.world.inverse;
    final determinant =
        node.world.a * node.world.d - node.world.b * node.world.c;
    if (inverse == null ||
        !determinant.isFinite ||
        determinant.abs() <= 2.220446049250313e-16) {
      throw DatasetException(
        'INVALID_GEOMETRY',
        node.id,
        'relation transform must be invertible',
      );
    }
    final style = node.data['style']! as Map<String, Object?>;
    final width = (style['width'] as num?)?.toDouble() ?? 1;
    final startMarker = style['startMarker'] as String? ?? 'none';
    final endMarker = style['endMarker'] as String? ?? 'none';
    final paths = <RelationPath>[];
    final boundsCache = <String, Rect?>{};
    Rect? bounds(String id) => boundsCache.putIfAbsent(id, () {
      final endpoint = targetFor(id);
      if (endpoint == null) return null;
      if (endpoint.target.type == 'relations') return null;
      return endpointBounds(id);
    });
    for (final link
        in (node.data['links']! as List).cast<Map<String, Object?>>()) {
      final fromId = link['source']! as String,
          toId = link['target']! as String;
      final from = targetFor(fromId), to = targetFor(toId);
      if (!node.visible ||
          from == null ||
          to == null ||
          !from.visible ||
          !to.visible ||
          from.target.type == 'relations' ||
          to.target.type == 'relations') {
        continue;
      }
      final source = bounds(fromId), target = bounds(toId);
      if (source == null || target == null) continue;
      final worldPoints = fromId == toId
          ? _selfLoop(source)
          : [source.center, target.center];
      final localPoints = [
        for (final point in worldPoints) _snap(inverse.project(point)),
      ];
      paths.add(RelationPath._(fromId, toId, localPoints, worldPoints));
    }

    final quads = <Quad>[];
    final half = width / 2;
    Rect? paintBounds;
    if (half > 0) {
      final start = startMarker == 'none'
          ? -1
          : paths.indexWhere((path) => path.hasLength);
      final end = endMarker == 'none'
          ? -1
          : paths.lastIndexWhere((path) => path.hasLength);
      for (var index = 0; index < paths.length; index++) {
        final path = paths[index];
        final points = <Offset>[];
        for (final point in path.localPoints) {
          if (points.isEmpty || point != points.last) points.add(point);
        }
        if (points.length < 2) continue;
        final firstQuad = quads.length;
        _addStrokeQuads(points, half, quads);
        if (index != start && index != end) continue;

        final polygons = <Quad>[];
        final circles = <Rect>[];
        if (index == start) {
          _addMarker(
            startMarker,
            points.first,
            points[1],
            width,
            polygons,
            circles,
          );
        }
        if (index == end) {
          _addMarker(
            endMarker,
            points.last,
            points[points.length - 2],
            width,
            polygons,
            circles,
          );
        }
        for (final polygon in polygons) {
          paintBounds = unionBounds(
            paintBounds,
            _project(node.world, polygon).bounds,
          );
        }
        for (final circle in circles) {
          paintBounds = unionBounds(
            paintBounds,
            node.world.projectRect(circle).bounds,
          );
        }
        paths[index] = RelationPath._withDecoration(path, (
          atStart: index == start,
          polygons: List.unmodifiable(
            quads.getRange(firstQuad, quads.length).followedBy(polygons),
          ),
          circles: List.unmodifiable(circles),
        ));
      }
    }
    Rect? logicalBounds;
    for (final path in paths) {
      for (final point in path.worldPoints) {
        logicalBounds = unionBounds(
          logicalBounds,
          Rect.fromPoints(point, point),
        );
      }
    }
    if (logicalBounds != null) validateBounds(logicalBounds);
    final worldQuads = [for (final quad in quads) _project(node.world, quad)];
    for (final quad in worldQuads) {
      paintBounds = unionBounds(paintBounds, quad.bounds);
    }
    if (paintBounds != null) validateBounds(paintBounds);
    for (final path in paths) {
      for (final point in path.localPoints) {
        if (!point.dx.isFinite || !point.dy.isFinite) {
          throw DatasetException(
            'INVALID_GEOMETRY',
            node.id,
            'nonfinite relation point',
          );
        }
      }
    }
    return RelationGeometry._(
      node.world,
      inverse,
      List.unmodifiable(paths),
      width,
      logicalBounds,
      paintBounds,
      List.unmodifiable(worldQuads),
      List.unmodifiable(quads),
    );
  }

  final Affine world, _inverse;
  final List<RelationPath> paths;
  final double width;
  final Rect? bounds, paintBounds;

  /// Shared polygon pieces for the default butt-cap/miter-join stroke.
  final List<Quad> hitQuads;
  final List<Quad> _localQuads;

  bool contains(Offset worldPoint) {
    final point = _inverse.project(worldPoint);
    return _localQuads.any((quad) => quad.contains(point));
  }

  double? segmentEntry(Offset fromWorld, Offset toWorld) {
    final inverse = _inverse;
    final from = inverse.project(fromWorld), to = inverse.project(toWorld);
    double? first;
    void include(double? value) {
      if (value != null) {
        first = first == null ? value : math.min(first!, value);
      }
    }

    for (final quad in _localQuads) {
      include(quad.segmentEntry(from, to));
    }
    return first;
  }

  bool intersects(Quad worldRange) {
    final range = _project(_inverse, worldRange);
    return _localQuads.any((quad) => quad.intersects(range));
  }
}

void _addStrokeQuads(List<Offset> points, double half, List<Quad> quads) {
  // Relations use butt caps and miter joins with limit 10.
  const miterLimit = 10.0;
  final directions = <Offset>[];
  for (var i = 1; i < points.length; i++) {
    final delta = points[i] - points[i - 1];
    final unit = delta / vectorLength(delta.dx, delta.dy);
    directions.add(unit);
    final normal = Offset(-unit.dy, unit.dx) * half;
    quads.add(
      Quad(
        points[i - 1] - normal,
        points[i] - normal,
        points[i] + normal,
        points[i - 1] + normal,
      ),
    );
  }
  for (var i = 1; i + 1 < points.length; i++) {
    final previous = directions[i - 1], next = directions[i];
    final turn = cross(previous, next);
    if (turn.abs() < 1e-14) continue;
    final center = points[i];
    final n0 = Offset(previous.dy, -previous.dx) * turn.sign;
    final n1 = Offset(next.dy, -next.dx) * turn.sign;
    final a = center + n0 * half, b = center + n1 * half;
    final denominator = 1 + n0.dx * n1.dx + n0.dy * n1.dy;
    final offset = denominator <= 0 ? null : (n0 + n1) * (half / denominator);
    final tip =
        offset != null &&
            vectorLength(offset.dx, offset.dy) <= half * miterLimit
        ? center + offset
        : b;
    quads.add(turn > 0 ? Quad(center, a, tip, b) : Quad(center, b, tip, a));
  }
}

void _addMarker(
  String shape,
  Offset endpoint,
  Offset adjacent,
  double width,
  List<Quad> polygons,
  List<Rect> circles,
) {
  final radius = 2 * width;
  if (shape == 'circle') {
    circles.add(Rect.fromCircle(center: endpoint, radius: radius));
    return;
  }
  final delta = endpoint - adjacent;
  final direction = delta / vectorLength(delta.dx, delta.dy);
  final side = Offset(-direction.dy, direction.dx) * radius;
  if (shape == 'diamond') {
    final axis = direction * radius;
    polygons.add(
      Quad(endpoint + axis, endpoint + side, endpoint - axis, endpoint - side),
    );
  } else {
    final base = endpoint - direction * (4 * width);
    polygons.add(Quad(endpoint, base + side, base - side, base - side));
  }
}

/// Compile once per structural replacement. Updates visit changed ancestors and
/// direct reverse dependencies; no per-frame source/whole-map scan is required.
final class RelationDependencies {
  RelationDependencies._(
    this._topology,
    this._relations,
    this._direct,
    this._descendant,
  );
  factory RelationDependencies.fromNodes(
    GeometryTopology topology,
    PagedValues<TargetGeometry> nodes,
  ) {
    final direct = <String, Set<String>>{},
        descendants = <String, Set<String>>{};
    for (final node in nodes) {
      if (node.target.type != 'relations') continue;
      for (final link
          in (node.data['links']! as List).cast<Map<String, Object?>>()) {
        for (final endpoint in [
          link['source']! as String,
          link['target']! as String,
        ]) {
          (direct[endpoint] ??= {}).add(node.id);
          var slot = topology.slots[endpoint];
          while (slot != null) {
            final parent = topology.parents[slot];
            if (parent == null) break;
            (descendants[topology.ids[parent]] ??= {}).add(node.id);
            slot = parent;
          }
        }
      }
    }
    return RelationDependencies._(
      topology,
      Set.unmodifiable(
        nodes
            .where((node) => node.target.type == 'relations')
            .map((node) => node.id),
      ),
      Map.unmodifiable({
        for (final entry in direct.entries)
          entry.key: Set<String>.unmodifiable(entry.value),
      }),
      Map.unmodifiable({
        for (final entry in descendants.entries)
          entry.key: Set<String>.unmodifiable(entry.value),
      }),
    );
  }
  final GeometryTopology _topology;
  final Set<String> _relations;
  final Map<String, Set<String>> _direct, _descendant;
  Set<String> get relationIds => _relations;
  Set<String> affectedIds(Iterable<String> changedIds) {
    final result = <String>{}, visited = <String>{};
    final pending = changedIds.toList();
    while (pending.isNotEmpty) {
      final id = pending.removeLast();
      if (!visited.add(id)) continue;
      if (_relations.contains(id)) result.add(id);
      for (final relation in {...?_direct[id], ...?_descendant[id]}) {
        if (result.add(relation)) pending.add(relation);
      }
      var slot = _topology.slots[id];
      while (slot != null) {
        slot = _topology.parents[slot];
        if (slot == null) break;
        final ancestor = _topology.ids[slot];
        for (final relation in _direct[ancestor] ?? const <String>{}) {
          if (result.add(relation)) pending.add(relation);
        }
      }
    }
    return Set.unmodifiable(result);
  }
}

List<Offset> _selfLoop(Rect bounds) {
  final pad = math.max(10.0, math.max(bounds.width / 2, bounds.height / 2));
  return [
    Offset(bounds.center.dx, bounds.top),
    Offset(bounds.right + pad, bounds.top - pad),
    Offset(bounds.right + 2 * pad, bounds.center.dy),
    Offset(bounds.right + pad, bounds.bottom + pad),
    Offset(bounds.center.dx, bounds.bottom),
  ];
}

Offset _snap(Offset point) {
  double snap(double value) =>
      value.isFinite && (value - value.roundToDouble()).abs() <= 1e-12
      ? value.roundToDouble()
      : value;
  return Offset(snap(point.dx), snap(point.dy));
}

Quad _project(Affine transform, Quad quad) => Quad(
  transform.project(quad.p0),
  transform.project(quad.p1),
  transform.project(quad.p2),
  transform.project(quad.p3),
);
