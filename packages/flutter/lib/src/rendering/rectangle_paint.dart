import 'dart:math' as math;
import 'dart:ui';

import '../dataset/colors.dart';

/// Resource-free resolved paint for authored rectangles and rectangular textures.
/// Receives admitted records; asset textures and device-space pixel lines belong
/// to other rendering owners and are rejected explicitly here.
final class RectanglePaint {
  RectanglePaint._({
    required this.fillColor,
    required this.strokeColor,
    required this.strokeWidth,
    required this.strokeAlignment,
    required this.strokeCap,
    required this.strokeJoin,
    required this.strokeMiterLimit,
    required List<double> radii,
  }) : radii = List.unmodifiable(radii);

  factory RectanglePaint.fromElement(
    Map<String, Object?> data,
    ColorResolver palette,
    double opacity,
  ) {
    _opacity(opacity);
    final stroke = data['stroke'] as Map<String, Object?>?;
    if (stroke != null) {
      for (final key in ['texture', 'matrix', 'textureSpace']) {
        if (stroke.containsKey(key)) {
          throw UnsupportedError('Rectangle stroke.$key is not supported');
        }
      }
      if (stroke['pixelLine'] == true) {
        throw UnsupportedError(
          'Rectangle stroke.pixelLine needs device-space rendering',
        );
      }
    }
    return RectanglePaint._(
      fillColor: _alpha(palette.resolve(data['fill'] ?? '#00000000'), opacity),
      strokeColor: _alpha(
        palette.resolve(stroke?['fill'] ?? stroke?['color'] ?? '#1a1a1a'),
        opacity * ((stroke?['alpha'] as num?)?.toDouble() ?? 1),
      ),
      strokeWidth: stroke == null ? 0 : (stroke['width']! as num).toDouble(),
      strokeAlignment: (stroke?['alignment'] as num?)?.toDouble() ?? .5,
      strokeCap: switch (stroke?['cap']) {
        'round' => StrokeCap.round,
        'square' => StrokeCap.square,
        _ => StrokeCap.butt,
      },
      strokeJoin: switch (stroke?['join']) {
        'round' => StrokeJoin.round,
        'bevel' => StrokeJoin.bevel,
        _ => StrokeJoin.miter,
      },
      strokeMiterLimit: (stroke?['miterLimit'] as num?)?.toDouble() ?? 10,
      radii: _radii(data['radius'] ?? 0),
    );
  }

  factory RectanglePaint.fromTexture(
    Map<String, Object?> source,
    ColorResolver palette,
    Object tint,
    double opacity,
  ) {
    _opacity(opacity);
    if (source.containsKey('src') ||
        (source['type'] != null && source['type'] != 'rect')) {
      throw UnsupportedError('RectanglePaint requires a rectangular texture');
    }
    final tintColor = palette.resolve(tint);
    Color color(Object value) =>
        _alpha(multiplyColors(palette.resolve(value), tintColor), opacity);
    return RectanglePaint._(
      fillColor: color(source['fill'] ?? '#00000000'),
      strokeColor: color(source['borderColor'] ?? '#1a1a1a'),
      strokeWidth: (source['borderWidth'] as num?)?.toDouble() ?? 0,
      strokeAlignment: .5,
      strokeCap: StrokeCap.butt,
      strokeJoin: StrokeJoin.miter,
      strokeMiterLimit: 10,
      radii: _radii(source['radius'] ?? 0),
    );
  }

  final Color fillColor, strokeColor;
  final double strokeWidth, strokeAlignment, strokeMiterLimit;
  final StrokeCap strokeCap;
  final StrokeJoin strokeJoin;

  /// Top-left, top-right, bottom-right, bottom-left, before fitting to a size.
  final List<double> radii;
  double? get uniformRadius =>
      radii.every((radius) => radius == radii.first) ? radii.first : null;

  /// Fits all corners proportionally, retaining authored ratios like JS.
  RRect roundedRect(Size size) {
    if (!size.isFinite || size.width < 0 || size.height < 0) {
      throw ArgumentError.value(
        size,
        'size',
        'requires finite nonnegative size',
      );
    }
    var scale = 1.0;
    void fit(double available, double requested) {
      if (requested > 0) scale = math.min(scale, available / requested);
    }

    fit(size.width, radii[0] + radii[1]);
    fit(size.width, radii[3] + radii[2]);
    fit(size.height, radii[0] + radii[3]);
    fit(size.height, radii[1] + radii[2]);
    return RRect.fromRectAndCorners(
      Offset.zero & size,
      topLeft: Radius.circular(radii[0] * scale),
      topRight: Radius.circular(radii[1] * scale),
      bottomRight: Radius.circular(radii[2] * scale),
      bottomLeft: Radius.circular(radii[3] * scale),
    );
  }

  /// Paints local shape only; placement, transforms, opacity inheritance and bar
  /// clipping are supplied by the caller. No retained Canvas/Paint/Path exists.
  void paint(Canvas canvas, Rect rect) {
    if (!rect.isFinite) throw ArgumentError.value(rect, 'rect');
    if (rect.isEmpty) return;
    final shape = roundedRect(rect.size).shift(rect.topLeft);
    if (fillColor.a > 0) {
      canvas.drawRRect(shape, Paint()..color = fillColor);
    }
    if (strokeWidth <= 0 || strokeColor.a == 0) return;
    final path = Path()..addRRect(shape);
    final stroke = Paint()
      ..color = strokeColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = strokeCap
      ..strokeJoin = strokeJoin
      ..strokeMiterLimit = strokeMiterLimit;
    if (strokeAlignment == .5) {
      canvas.drawPath(path, stroke);
      return;
    }
    // Draw the two native stroke halves independently. This also handles an
    // inside stroke wider than the shape without inverted/negative contours,
    // while preserving native miter/bevel/round joins on sharp corners.
    final inside = strokeWidth * strokeAlignment;
    final outside = strokeWidth * (1 - strokeAlignment);
    if (outside > 0) {
      final exterior = Path()
        ..fillType = PathFillType.evenOdd
        ..addRect(rect.inflate(strokeWidth * (strokeMiterLimit + 2)))
        ..addPath(path, Offset.zero);
      canvas.save();
      canvas.clipPath(exterior, doAntiAlias: false);
      canvas.drawPath(path, stroke..strokeWidth = outside * 2);
      canvas.restore();
    }
    if (inside > 0) {
      canvas.save();
      canvas.clipPath(path, doAntiAlias: false);
      canvas.drawPath(path, stroke..strokeWidth = inside * 2);
      canvas.restore();
    }
  }
}

Color _alpha(Color color, double opacity) =>
    color.withValues(alpha: color.a * opacity);
void _opacity(double value) {
  if (!value.isFinite || value < 0 || value > 1) {
    throw ArgumentError.value(value, 'opacity', 'requires a value in [0, 1]');
  }
}

List<double> _radii(Object value) {
  if (value is num) return List.filled(4, value.toDouble());
  if (value is List) {
    return [for (final radius in value) (radius as num).toDouble()];
  }
  final corners = value as Map;
  return [
    for (final key in ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'])
      (corners[key]! as num).toDouble(),
  ];
}
