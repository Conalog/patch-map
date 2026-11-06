import 'dart:typed_data';
import 'dart:ui';

import '../dataset/colors.dart';
import '../geometry/relation_geometry.dart';

/// Retained resource-free local paths and resolved solid color. Paint in normal
/// sibling order; this owner neither reparents relations nor scans endpoints.
final class RelationPaint {
  RelationPaint._(
    this.geometry,
    this.color,
    this._paths,
    this._paint,
    this._start,
    this._end,
  ) : _matrix = geometry.world.toMatrix4(),
      _fill = _start != null || _end != null ? (Paint()..color = color) : null;
  factory RelationPaint(
    RelationGeometry geometry,
    Map<String, Object?> data,
    ColorResolver palette,
    double opacity,
  ) {
    if (!opacity.isFinite || opacity < 0 || opacity > 1) {
      throw ArgumentError.value(opacity);
    }
    final style = data['style']! as Map<String, Object?>;
    final source = palette.resolve(style['color'] ?? '#1a1a1a');
    final color = source.withValues(
      alpha: source.a * opacity * ((style['alpha'] as num?)?.toDouble() ?? 1),
    );
    final paths = <Path>[];
    Path? start, end;
    for (final relation in geometry.paths) {
      final decoration = relation.decoration;
      if (decoration != null) {
        final path = Path();
        for (final quad in decoration.polygons) {
          path
            ..moveTo(quad.p0.dx, quad.p0.dy)
            ..lineTo(quad.p1.dx, quad.p1.dy)
            ..lineTo(quad.p2.dx, quad.p2.dy)
            ..lineTo(quad.p3.dx, quad.p3.dy)
            ..close();
        }
        for (final circle in decoration.circles) {
          path.addOval(circle);
        }
        if (decoration.atStart) {
          start = path;
        } else {
          end = path;
        }
        continue;
      }
      final run = relation.localPoints;
      if (!relation.hasLength) continue;
      final path = Path();
      path.moveTo(run.first.dx, run.first.dy);
      for (final point in run.skip(1)) {
        path.lineTo(point.dx, point.dy);
      }
      paths.add(path);
    }
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = geometry.width
      ..strokeMiterLimit = 10
      ..strokeCap = StrokeCap.butt
      ..strokeJoin = StrokeJoin.miter;
    return RelationPaint._(
      geometry,
      color,
      List.unmodifiable(paths),
      paint,
      start,
      end,
    );
  }
  final RelationGeometry geometry;
  final Color color;
  final List<Path> _paths;
  final Paint _paint;
  final Path? _start, _end;
  final Paint? _fill;
  final Float64List _matrix;
  void paint(Canvas canvas, {double alphaMultiplier = 1}) {
    if (color.a == 0 ||
        alphaMultiplier == 0 ||
        geometry.width == 0 ||
        geometry.paths.isEmpty) {
      return;
    }
    canvas.save();
    try {
      if (alphaMultiplier != 1) {
        final faded = color.withValues(alpha: color.a * alphaMultiplier);
        _paint.color = faded;
        _fill?.color = faded;
      }
      canvas.transform(_matrix);
      if (_start case final path?) canvas.drawPath(path, _fill!);
      for (final path in _paths) {
        canvas.drawPath(path, _paint);
      }
      if (_end case final path?) canvas.drawPath(path, _fill!);
    } finally {
      if (alphaMultiplier != 1) {
        _paint.color = color;
        _fill?.color = color;
      }
      canvas.restore();
    }
  }
}
