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
    Iterable<double> widths,
  ) : localPoints = List.unmodifiable(local),
      worldPoints = List.unmodifiable(world),
      worldStrokeWidths = List.unmodifiable(widths);
  final String sourceId, targetId;
  final List<Offset> localPoints, worldPoints;
  final List<double> worldStrokeWidths;
  bool get isSelfLink => sourceId == targetId;
}

/// Shared retained relation projection. Matches release relation-paths.ts:
/// endpoint centers are world-first, self links are five-point outside loops,
/// and hidden/missing endpoints omit their path. No curve/arrow schema exists.
final class RelationGeometry {
  RelationGeometry._(
    this.id,
    this.world,
    this._inverse,
    this.paths,
    this.runs,
    this.width,
    this.cap,
    this.join,
    this.miterLimit,
    this.bounds,
    this.paintBounds,
    this.hitQuads,
    this._localQuads,
    this._circles,
  );

  factory RelationGeometry.compile(
    GeometrySnapshot snapshot,
    TargetGeometry node, {
    RelationEndpointBounds? endpointBounds,
  }) {
    return RelationGeometry.resolve(
      node,
      targetFor: (id) => snapshot[id],
      endpointBounds: endpointBounds ?? snapshot.endpointBoundsFor,
    );
  }

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
    _supportedStyle(style);
    final width = (style['width'] as num?)?.toDouble() ?? 1;
    final cap = style['cap'] as String? ?? 'butt';
    final join = style['join'] as String? ?? 'miter';
    final miterLimit = (style['miterLimit'] as num?)?.toDouble() ?? 10;
    final paths = <RelationPath>[], runs = <List<Offset>>[];
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
      final widths = <double>[];
      for (var i = 1; i < localPoints.length; i++) {
        final delta = localPoints[i] - localPoints[i - 1];
        final length = vectorLength(delta.dx, delta.dy);
        if (length == 0) {
          widths.add(width);
          continue;
        }
        final normal = Offset(-delta.dy / length, delta.dx / length);
        widths.add(
          width *
              vectorLength(
                node.world.a * normal.dx + node.world.c * normal.dy,
                node.world.b * normal.dx + node.world.d * normal.dy,
              ),
        );
      }
      paths.add(RelationPath._(fromId, toId, localPoints, worldPoints, widths));
      runs.add(List.of(localPoints));
    }
    final quads = <Quad>[], circles = <(Offset, double)>[];
    final half = width / 2;
    if (half > 0) {
      for (final raw in runs) {
        final points = <Offset>[];
        for (final point in raw) {
          if (points.isEmpty || point != points.last) points.add(point);
        }
        if (points.length < 2) continue;
        final directions = <Offset>[];
        for (var i = 1; i < points.length; i++) {
          final delta = points[i] - points[i - 1];
          final length = vectorLength(delta.dx, delta.dy);
          final unit = delta / length;
          directions.add(unit);
          final normal = Offset(-unit.dy, unit.dx) * half;
          quads.add(
            Quad(
              points[i - 1] + normal,
              points[i] + normal,
              points[i] - normal,
              points[i - 1] - normal,
            ),
          );
        }
        for (final (point, direction) in [
          (points.first, -directions.first),
          (points.last, directions.last),
        ]) {
          if (cap == 'round') circles.add((point, half));
          if (cap == 'square') {
            final normal = Offset(-direction.dy, direction.dx) * half;
            quads.add(
              Quad(
                point + normal,
                point + direction * half + normal,
                point + direction * half - normal,
                point - normal,
              ),
            );
          }
        }
        for (var i = 1; i + 1 < points.length; i++) {
          final previous = directions[i - 1], next = directions[i];
          final turn = cross(previous, next);
          if (turn.abs() < 1e-14) continue;
          final center = points[i];
          if (join == 'round') {
            circles.add((center, half));
            continue;
          }
          final n0 = Offset(previous.dy, -previous.dx) * turn.sign;
          final n1 = Offset(next.dy, -next.dx) * turn.sign;
          final a = center + n0 * half, b = center + n1 * half;
          final denominator = 1 + n0.dx * n1.dx + n0.dy * n1.dy;
          final offset = denominator <= 0
              ? null
              : (n0 + n1) * (half / denominator);
          if (join == 'miter' &&
              offset != null &&
              vectorLength(offset.dx, offset.dy) <= half * miterLimit) {
            quads.add(Quad(center, a, center + offset, b));
          } else {
            quads.add(Quad(center, a, b, b));
          }
        }
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
    Rect? paintBounds;
    for (final quad in worldQuads) {
      paintBounds = unionBounds(paintBounds, quad.bounds);
    }
    for (final (center, radius) in circles) {
      final quad = node.world.projectRect(
        Rect.fromCircle(center: center, radius: radius),
      );
      worldQuads.add(quad);
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
      node.id,
      node.world,
      inverse,
      List.unmodifiable(paths),
      List.unmodifiable([
        for (final run in runs) List<Offset>.unmodifiable(run),
      ]),
      width,
      cap,
      join,
      miterLimit,
      logicalBounds,
      paintBounds,
      List.unmodifiable(worldQuads),
      List.unmodifiable(quads),
      List.unmodifiable(circles),
    );
  }

  final String id;
  final Affine world, _inverse;
  final List<RelationPath> paths;
  final List<List<Offset>> runs;
  final double width, miterLimit;
  final String cap, join;
  final Rect? bounds, paintBounds;

  /// Exact for polygon pieces, conservative for transformed round cap/joins.
  /// Use [contains] after broad-phase quads to reject round-corner false hits.
  final List<Quad> hitQuads;
  final List<Quad> _localQuads;
  final List<(Offset, double)> _circles;

  bool contains(Offset worldPoint) {
    final point = _inverse.project(worldPoint);
    return _localQuads.any((quad) => quad.contains(point)) ||
        _circles.any(
          (circle) =>
              vectorLength(point.dx - circle.$1.dx, point.dy - circle.$1.dy) <=
              circle.$2,
        );
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
    for (final circle in _circles) {
      include(_circleEntry(from, to, circle.$1, circle.$2));
    }
    return first;
  }

  bool intersects(Quad worldRange) {
    final range = _project(_inverse, worldRange);
    if (_localQuads.any((quad) => quad.intersects(range))) return true;
    for (final (center, radius) in _circles) {
      if (range.contains(center)) return true;
      for (var edge = 0; edge < 4; edge++) {
        if (_circleEntry(
              range.vertex(edge),
              range.vertex(edge + 1),
              center,
              radius,
            ) !=
            null) {
          return true;
        }
      }
    }
    return false;
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
  factory RelationDependencies.compile(GeometrySnapshot snapshot) =>
      RelationDependencies.fromNodes(snapshot.topology, snapshot.nodes);
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

void _supportedStyle(Map<String, Object?> style) {
  for (final key in ['texture', 'matrix', 'textureSpace']) {
    if (style.containsKey(key)) {
      throw UnsupportedError('Relation style.$key is not supported');
    }
  }
  if (style['pixelLine'] == true) {
    throw UnsupportedError(
      'Relation pixelLine requires device-space rendering',
    );
  }
  if ((style['alignment'] as num? ?? .5) != .5) {
    throw UnsupportedError(
      'Noncenter relation alignment requires Pixi polyline tessellation',
    );
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
double? _circleEntry(Offset from, Offset to, Offset center, double radius) {
  final scale = math.max(
    radius,
    math.max(
      math.max(from.dx.abs(), from.dy.abs()),
      math.max(
        math.max(to.dx.abs(), to.dy.abs()),
        math.max(center.dx.abs(), center.dy.abs()),
      ),
    ),
  );
  if (scale == 0) return 0;
  final start = from / scale - center / scale,
      delta = to / scale - from / scale;
  final r = radius / scale;
  final c = start.dx * start.dx + start.dy * start.dy - r * r;
  if (c <= 0) return 0;
  final a = delta.dx * delta.dx + delta.dy * delta.dy;
  if (a == 0) return null;
  final b = start.dx * delta.dx + start.dy * delta.dy;
  final discriminant = b * b - a * c;
  if (discriminant < 0) return null;
  final t = (-b - math.sqrt(discriminant)) / a;
  return t >= 0 && t <= 1 ? t : null;
}
