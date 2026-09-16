import 'dart:math' as math;
import 'dart:ui' as ui;
import '../semantic/geometry/geometry.dart';
import '../model/json.dart';
import 'color.dart';

/// Projection-owned lookup. Selection work visits only selected owners and
/// their paint primitives, never the whole scene on a camera frame.
class SelectionGeometry {
  SelectionGeometry(this.geometry, this.rotation, this.theme) {
    for (final target in geometry.targets.values) {
      if (target.componentId != null) {
        aliases['${target.ownerId}::${target.type}:${target.componentId}'] =
            target.id;
      }
    }
    for (final primitive in geometry.primitives) {
      if (!primitive.visible || primitive.opacity <= 0) continue;
      owned.putIfAbsent(primitive.ownerId, () => []).add(primitive);
      if (primitive.componentId != null) {
        owned['${primitive.ownerId}\u0000${primitive.componentId}'] = [
          primitive,
        ];
      }
    }
  }
  final PatchMapGeometry geometry;
  final double rotation;
  final JsonMap theme;
  final aliases = <String, String>{};
  final owned = <String, List<GeometryPrimitive>>{};
  final _quads = <String, List<MapPoint>>{};

  List<MapPoint> quad(String id) => _quads.putIfAbsent(id, () {
    final key = aliases[id] ?? id;
    final target = geometry.targets[key];
    if (target == null || !target.visible || target.quad.length != 4)
      return const [];
    final components = owned[key] ?? const <GeometryPrimitive>[];
    final reference = target.componentId != null && components.isNotEmpty
        ? readableTransform(
            components.first,
            worldRotation: rotation,
          ).quad(components.first.localRect)
        : target.quad;
    final candidates = <MapPoint>[...reference];
    for (final primitive in owned[key] ?? const <GeometryPrimitive>[]) {
      if (primitive.type == 'relation') continue;
      final source = primitive.value['source'];
      final style = source is Map ? source : primitive.value;
      final stroke = style['stroke'];
      final border = primitive.type == 'background'
          ? number(style['borderWidth'])
          : primitive.type == 'rect'
          ? (stroke is Map
                ? number(stroke['width'], 1)
                : stroke == null
                ? 0.0
                : 1.0)
          : 0.0;
      final color =
          style['borderColor'] ?? (stroke is Map ? stroke['color'] : stroke);
      final outset = mapColor(color, const ui.Color(0xff000000), theme).a > 0
          ? border / 2
          : 0.0;
      final r = primitive.localRect;
      candidates.addAll(
        readableTransform(primitive, worldRotation: rotation).quad(
          MapRect(
            r.x - outset,
            r.y - outset,
            r.width + outset * 2,
            r.height + outset * 2,
          ),
        ),
      );
    }
    final frame = MapAffine(
      reference[1].x - reference[0].x,
      reference[1].y - reference[0].y,
      reference[3].x - reference[0].x,
      reference[3].y - reference[0].y,
      reference[0].x,
      reference[0].y,
    );
    final inverse = frame.inverse;
    if (inverse == null) return _boundsQuad(MapBounds.points(candidates));
    final bounds = MapBounds.points(
      candidates.map((p) => inverse.project(p.x, p.y)),
    );
    return frame.quad(
      MapRect(bounds.left, bounds.top, bounds.width, bounds.height),
    );
  });

  List<ui.Path> paths(List<String> selected, String mode) {
    if (mode == 'hidden') return const [];
    final quads = [for (final id in selected) quad(id)]
        .where(
          (quad) =>
              quad.length == 4 &&
              MapBounds.points(quad).width > 0 &&
              MapBounds.points(quad).height > 0,
        )
        .toList();
    if (quads.isEmpty) return const [];
    final aggregate = quads.length == 1
        ? quads.single
        : _boundsQuad(MapBounds.points(quads.expand((q) => q)));
    final chosen = mode == 'group-only'
        ? [aggregate]
        : mode == 'element-only' || quads.length == 1
        ? quads
        : [...quads, aggregate];
    return [for (final quad in chosen) _path(quad)];
  }
}

double selectionStrokeWidth(JsonMap visual, double scale) {
  final width = number(visual['strokeWidth'], 2),
      minimum = number(visual['minStrokeWidth'], 1);
  final zoom = math.max(scale, 0.001);
  return (visual['strokeScale'] == 'viewport'
          ? math.min(width, math.max(minimum, width * zoom))
          : width) /
      zoom;
}

List<ui.Path> selectionClipPaths(
  List<ui.Path> paths,
  double width,
  String alignment,
) => alignment == 'inside'
    ? paths
    : alignment == 'outside'
    ? [
        for (final path in paths)
          ui.Path.combine(
            ui.PathOperation.difference,
            ui.Path()..addRect(path.getBounds().inflate(width * 2)),
            path,
          ),
      ]
    : const [];

void paintSelection(
  ui.Canvas canvas,
  List<ui.Path> paths,
  ui.Paint paint,
  String alignment,
  List<ui.Path> clips,
) {
  final aligned = alignment == 'inside' || alignment == 'outside';
  if (aligned) paint.strokeWidth *= 2;
  for (var i = 0; i < paths.length; i++) {
    final path = paths[i];
    if (aligned) {
      canvas.save();
      canvas.clipPath(clips[i]);
      canvas.drawPath(path, paint);
      canvas.restore();
    } else {
      canvas.drawPath(path, paint);
    }
  }
  if (aligned) paint.strokeWidth /= 2;
}

List<MapPoint> _boundsQuad(MapBounds b) => [
  MapPoint(b.left, b.top),
  MapPoint(b.right, b.top),
  MapPoint(b.right, b.bottom),
  MapPoint(b.left, b.bottom),
];
ui.Path _path(List<MapPoint> quad) {
  final path = ui.Path()..moveTo(quad.first.x, quad.first.y);
  for (final point in quad.skip(1)) {
    path.lineTo(point.x, point.y);
  }
  return path..close();
}
