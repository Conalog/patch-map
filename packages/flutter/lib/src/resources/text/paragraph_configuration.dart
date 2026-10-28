import 'dart:ui' as ui;

import 'text_spec.dart';

/// One recent configuration, owned and cleared by TextPool. Reuse is optional:
/// alternating styles/sizes replace it instead of growing a global cache.
final class ParagraphPreparation {
  ParagraphPreparation({this.fontFamilyResolver});
  final String Function(String family)? fontFamilyResolver;
  ParagraphConfiguration? _recent;

  ParagraphConfiguration forParameters(TextParameters parameters) {
    final recent = _recent;
    if (recent != null) {
      final previous = recent.parameters;
      if (identical(previous, parameters) ||
          (previous.metricStyleKey == parameters.metricStyleKey &&
              previous.paintKey == parameters.paintKey &&
              previous.color == parameters.color &&
              previous.strokeColor == parameters.strokeColor &&
              previous.objectOpacity == parameters.objectOpacity)) {
        return recent;
      }
    }
    return _recent = ParagraphConfiguration._(parameters, fontFamilyResolver);
  }

  void clear() => _recent = null;
}

/// String-independent native arguments only. Builders, Paragraphs, fitted
/// metrics and layout decisions remain per string in NativeTextLayout.
final class ParagraphConfiguration {
  ParagraphConfiguration._(this.parameters, String Function(String)? resolver)
    : family =
          resolver?.call(parameters.fontFamilies.first) ??
          parameters.fontFamilies.first,
      fallback = List<String>.unmodifiable(
        parameters.fontFamilies
            .skip(1)
            .map((name) => resolver?.call(name) ?? name),
      );

  final TextParameters parameters;
  final String family;
  final List<String> fallback;
  double? _size;
  late ui.ParagraphStyle paragraphStyle;
  ui.TextStyle? _fillStyle, _strokeStyle;
  ui.ParagraphConstraints? _constraints;

  void prepareSize(double size) {
    if (_size == size) return;
    _size = size;
    _fillStyle = null;
    _strokeStyle = null;
    paragraphStyle = ui.ParagraphStyle(
      textDirection: ui.TextDirection.ltr,
      textAlign: parameters.align,
      fontFamily: family,
      fontSize: size,
      fontWeight: parameters.fontWeight,
      fontStyle: parameters.fontStyle,
    );
  }

  ui.TextStyle style({required bool stroke}) =>
      stroke ? _strokeStyle ??= _style(true) : _fillStyle ??= _style(false);

  ui.ParagraphConstraints constraints(double width) {
    final previous = _constraints;
    if (previous != null && previous.width == width) return previous;
    return _constraints = ui.ParagraphConstraints(width: width);
  }

  // Tint alpha applies once after the combined stroke/fill raster.
  double get paintOpacity =>
      parameters.strokeWidth > 0 && parameters.strokeColor != null
      ? parameters.objectOpacity
      : 1;

  ui.Color _rasterColor(ui.Color color) {
    final opacity = paintOpacity;
    return opacity == 1 || opacity == 0
        ? color
        : color.withValues(alpha: (color.a / opacity).clamp(0, 1));
  }

  ui.TextStyle _style(bool stroke) {
    final size = _size!;
    final p = parameters;
    final paint = stroke
        ? (ui.Paint()
            ..color = _rasterColor(p.strokeColor!)
            ..style = ui.PaintingStyle.stroke
            ..strokeWidth = p.strokeWidth
            ..strokeJoin = p.strokeJoin
            ..strokeCap = p.strokeCap
            ..strokeMiterLimit = p.strokeMiterLimit)
        : null;
    return ui.TextStyle(
      fontFamily: family,
      fontFamilyFallback: fallback,
      fontSize: size,
      fontWeight: p.fontWeight,
      fontStyle: p.fontStyle,
      letterSpacing: p.letterSpacing,
      height: size > 0 && p.lineHeight != null ? p.lineHeight! / size : null,
      // pushStyle mutates an encoded leading-distribution bit. Always bind it
      // to our unchanged proportional Paragraph default, never another owner.
      leadingDistribution: ui.TextLeadingDistribution.proportional,
      color: stroke ? null : _rasterColor(p.color),
      foreground: paint,
    );
  }
}
