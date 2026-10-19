import 'dart:typed_data';
import 'dart:ui';

import '../dataset/colors.dart';
import '../geometry/relation_geometry.dart';

/// Retained resource-free local path and resolved solid stroke. Paint in normal
/// sibling order; this owner neither reparents relations nor scans endpoints.
final class RelationPaint {
  RelationPaint._(this.geometry, this.color, this._paths, this._paint)
    : _matrix = geometry.world.toMatrix4();
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
    // Release projects color/alpha/width only. Preserved optional input cannot
    // become a fill override, a new rendering feature or an unsupported error.
    final source = palette.resolve(style['color'] ?? '#1a1a1a');
    final color = source.withValues(
      alpha: source.a * opacity * ((style['alpha'] as num?)?.toDouble() ?? 1),
    );
    final paths = <Path>[];
    for (final run in geometry.runs) {
      if (run.length < 2 || run.every((point) => point == run.first)) continue;
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
    return RelationPaint._(geometry, color, List.unmodifiable(paths), paint);
  }
  final RelationGeometry geometry;
  final Color color;
  final List<Path> _paths;
  final Paint _paint;
  final Float64List _matrix;
  void paint(Canvas canvas) {
    if (color.a == 0 || geometry.width == 0 || geometry.paths.isEmpty) return;
    canvas.save();
    try {
      canvas.transform(_matrix);
      for (final path in _paths) {
        canvas.drawPath(path, _paint);
      }
    } finally {
      canvas.restore();
    }
  }
}
