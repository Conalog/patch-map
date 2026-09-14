import 'dart:math' as math;
import '../../model/json.dart';

class MapPoint {
  const MapPoint(this.x, this.y);
  final double x, y;
}

class MapRect {
  const MapRect(this.x, this.y, this.width, this.height);
  final double x, y, width, height;
}

class MapBounds {
  const MapBounds(this.left, this.top, this.right, this.bottom);
  static const empty = MapBounds(0, 0, 0, 0);
  factory MapBounds.points(Iterable<MapPoint> points) {
    if (points.isEmpty) return empty;
    var left = double.infinity,
        top = double.infinity,
        right = double.negativeInfinity,
        bottom = double.negativeInfinity;
    for (final p in points) {
      if (!p.x.isFinite || !p.y.isFinite)
        throw const PatchMapDatasetError(
          'INVALID_VALUE',
          r'$.geometry',
          'non-finite point',
        );
      left = math.min(left, p.x);
      top = math.min(top, p.y);
      right = math.max(right, p.x);
      bottom = math.max(bottom, p.y);
    }
    return MapBounds(left, top, right, bottom);
  }
  final double left, top, right, bottom;
  double get width => right - left;
  double get height => bottom - top;
  double get centerX => (left + right) / 2;
  double get centerY => (top + bottom) / 2;
  bool contains(double x, double y) =>
      x >= left && x <= right && y >= top && y <= bottom;
  MapBounds union(MapBounds other) => MapBounds(
    math.min(left, other.left),
    math.min(top, other.top),
    math.max(right, other.right),
    math.max(bottom, other.bottom),
  );
}

class MapAffine {
  const MapAffine(this.a, this.b, this.c, this.d, this.tx, this.ty);
  static const identity = MapAffine(1, 0, 0, 1, 0, 0);
  factory MapAffine.authored({
    double x = 0,
    double y = 0,
    double angle = 0,
    double scaleX = 1,
    double scaleY = 1,
  }) {
    if (angle == 0) return MapAffine(scaleX, 0, 0, scaleY, x, y);
    final radians = angle * math.pi / 180,
        cos = math.cos(radians),
        sin = math.sin(radians);
    return MapAffine(
      cos * scaleX,
      sin * scaleX,
      -sin * scaleY,
      cos * scaleY,
      x,
      y,
    );
  }
  final double a, b, c, d, tx, ty;
  MapPoint project(double x, double y) =>
      MapPoint(a * x + c * y + tx, b * x + d * y + ty);
  MapAffine multiply(MapAffine r) => MapAffine(
    a * r.a + c * r.b,
    b * r.a + d * r.b,
    a * r.c + c * r.d,
    b * r.c + d * r.d,
    a * r.tx + c * r.ty + tx,
    b * r.tx + d * r.ty + ty,
  );
  MapAffine? get inverse {
    final determinant = a * d - b * c;
    if (!determinant.isFinite || determinant.abs() < 1e-15) return null;
    return MapAffine(
      d / determinant,
      -b / determinant,
      -c / determinant,
      a / determinant,
      (c * ty - d * tx) / determinant,
      (b * tx - a * ty) / determinant,
    );
  }

  List<MapPoint> quad(MapRect r) => List.unmodifiable([
    project(r.x, r.y),
    project(r.x + r.width, r.y),
    project(r.x + r.width, r.y + r.height),
    project(r.x, r.y + r.height),
  ]);
}

class GeometryPrimitive {
  GeometryPrimitive({
    required this.ownerId,
    required this.componentId,
    required this.type,
    required this.value,
    required this.localRect,
    required this.transform,
    required this.opacity,
    required this.visible,
    this.points = const [],
    this.contentOrientation = 'follow-item',
    this.textLayout,
    this.placementAnchor,
    this.strokeWidths = const [],
  });
  final String ownerId, type;
  final String? componentId;
  final JsonMap value;
  final MapRect localRect;
  final MapAffine transform;
  final double opacity;
  final bool visible;
  final List<MapPoint> points;
  final String contentOrientation;
  final Object? textLayout;
  final MapPoint? placementAnchor;
  final List<double> strokeWidths;
  late final List<MapPoint> quad = transform.quad(localRect);
  late final MapBounds bounds = points.isEmpty
      ? MapBounds.points(quad)
      : MapBounds.points(points);
}

class GeometryTarget {
  GeometryTarget({
    required this.id,
    required this.type,
    MapBounds? bounds,
    List<MapPoint>? quad,
    MapRect? localRect,
    required this.transform,
    required this.visible,
    required this.locked,
    this.ownerId,
    this.componentId,
    this.paths = const [],
    this.strokeWidth = 0,
    this.paintOrder = 0,
  }) : _bounds = bounds,
       _quad = quad,
       _localRect = localRect;
  final String id, type;
  MapBounds? _bounds;
  List<MapPoint>? _quad;
  final MapRect? _localRect;
  MapBounds get bounds => _bounds ??= MapBounds.points(quad);
  List<MapPoint> get quad => _quad ??= transform.quad(_localRect!);
  final MapAffine transform;
  final bool visible, locked;
  final String? ownerId, componentId;
  final List<List<MapPoint>> paths;
  final double strokeWidth;
  final int paintOrder;
  bool contains(double x, double y, {double tolerance = 4}) {
    if (!visible) return false;
    if (paths.isNotEmpty) {
      final radius = math.max(tolerance, strokeWidth / 2);
      for (final path in paths) {
        for (var i = 1; i < path.length; i++) {
          final a = path[i - 1],
              b = path[i],
              dx = b.x - a.x,
              dy = b.y - a.y,
              length = dx * dx + dy * dy;
          final t = length == 0
              ? 0.0
              : (((x - a.x) * dx + (y - a.y) * dy) / length).clamp(0.0, 1.0);
          final px = x - a.x - dx * t, py = y - a.y - dy * t;
          if (px * px + py * py <= radius * radius) return true;
        }
      }
      return false;
    }
    if (!visible || !bounds.contains(x, y)) return false;
    if (quad.length < 3) return true;
    var positive = false, negative = false;
    for (var i = 0; i < quad.length; i++) {
      final a = quad[i], b = quad[(i + 1) % quad.length];
      final cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
      if (cross > 1e-9) positive = true;
      if (cross < -1e-9) negative = true;
      if (positive && negative) return false;
    }
    return true;
  }
}

class PatchMapGeometry {
  PatchMapGeometry({
    required List<GeometryPrimitive> primitives,
    required Map<String, GeometryTarget> targets,
    required this.bounds,
    Map<String, BarGeometryBinding>? barBindings,
    Map<String, BarGeometryBinding> Function()? barBindingsBuilder,
    this.scopeChildren = const {},
    this.hasRelations = false,
    Object? topology,
    this.changedPrimitiveSlots = const [],
    this.baseProjection,
  }) : primitives = List.unmodifiable(primitives),
       targets = Map.unmodifiable(targets),
       _barBindings = barBindings,
       _barBindingsBuilder = barBindingsBuilder,
       topology = topology ?? Object();
  final List<GeometryPrimitive> primitives;
  final Map<String, GeometryTarget> targets;
  final MapBounds bounds;
  Map<String, BarGeometryBinding>? _barBindings;
  Map<String, BarGeometryBinding> Function()? _barBindingsBuilder;
  Map<String, BarGeometryBinding> get barBindings {
    if (_barBindings == null) {
      _barBindings = _barBindingsBuilder?.call() ?? const {};
      _barBindingsBuilder = null;
    }
    return _barBindings!;
  }

  final Map<String, List<String>> scopeChildren;
  final bool hasRelations;
  final Object topology;
  final Object projectionIdentity = Object();
  final Object? baseProjection;
  final List<int> changedPrimitiveSlots;
  double resolveBarHeight(String key, Object? raw) {
    final reference = barBindings[key]?.content.height ?? 0;
    if (raw is num) return math.max(0, raw.toDouble());
    if (raw is String && raw.endsWith('%'))
      return math.max(
        0,
        (double.tryParse(raw.substring(0, raw.length - 1)) ?? 0) *
            reference /
            100,
      );
    if (raw is Map && raw['value'] is num)
      return math.max(
        0,
        (raw['value'] as num).toDouble() *
            (raw['unit'] == '%' ? reference / 100 : 1),
      );
    return 0;
  }

  late final List<GeometryTarget> _hitTargets = List.unmodifiable(
    targets.values
        .where((t) => t.componentId == null && _pointerTarget(t))
        .toList()
      ..sort((a, b) => a.paintOrder.compareTo(b.paintOrder)),
  );
  MapBounds? worldBounds(String id) => targets[id]?.bounds;
  late final List<GeometryTarget> _componentHitTargets = List.unmodifiable(
    targets.values.where(_pointerTarget).toList()
      ..sort((a, b) => a.paintOrder.compareTo(b.paintOrder)),
  );
  GeometryTarget? hitTest(
    double x,
    double y, {
    double tolerance = 4,
    bool includeComponents = false,
    Map<String, GeometryTarget> projectedComponents = const {},
  }) {
    final candidates = includeComponents ? _componentHitTargets : _hitTargets;
    for (var i = candidates.length - 1; i >= 0; i--) {
      final candidate = candidates[i],
          target = projectedComponents[candidate.id] ?? candidate;
      if (!target.locked && target.contains(x, y, tolerance: tolerance))
        return target;
    }
    return null;
  }
}

/// Stable placement/transform data compiled by the one geometry authority.
class BarGeometryBinding {
  const BarGeometryBinding({
    required this.slot,
    required this.ownerTransform,
    required this.attrsTransform,
    required this.content,
    required this.width,
    required this.placement,
    required this.margin,
    required this.scopes,
    required this.containedHeightLimit,
  });
  final int slot;
  final MapAffine ownerTransform, attrsTransform;
  final MapRect content;
  final double width;
  final double containedHeightLimit;
  final String placement;
  final JsonMap margin;
  final List<String> scopes;
}

/// Text semantics supply explicit fitted bounds and their prepared layout.
typedef GeometryTextLayout = ({double width, double height, Object? layout});
typedef GeometryTextLayouter =
    GeometryTextLayout Function(
      String text,
      JsonMap style, {
      MapRect? frame,
      String? overflow,
      int split,
    });

// v1 alpha relation-lowering marks every relation interactive:false.
// Programmatic relation targets/bounds remain available through targets.
bool _pointerTarget(GeometryTarget target) =>
    target.type != 'group' &&
    target.type != 'grid' &&
    target.type != 'relations';
