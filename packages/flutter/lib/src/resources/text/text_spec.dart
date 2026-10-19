import 'dart:convert';
import 'dart:math' as math;
import 'dart:ui' as ui;

import '../../dataset/colors.dart';
import '../../geometry/layout.dart' show BoxEdges;

/// Detached text preparation values. Placement and authored transforms stay with
/// geometry; [bounds] is the available content size after this text's margin.
final class TextSpec {
  TextSpec._({
    required this.text,
    required this.fontFamilies,
    required this.fontSize,
    required this.auto,
    required this.autoMin,
    required this.autoMax,
    required this.fontWeight,
    required this.fontStyle,
    required this.align,
    required this.wordWrap,
    required this.wrapWidth,
    required this.breakWords,
    required this.whiteSpace,
    required this.overflow,
    required this.bounds,
    required this.split,
    required this.letterSpacing,
    required this.lineHeight,
    required this.padding,
    required this.color,
    required this.strokeColor,
    required this.strokeWidth,
    required this.strokeJoin,
    required this.strokeCap,
    required this.strokeMiterLimit,
    required this.shadow,
    required this.unsupportedFields,
  });

  factory TextSpec.fromData(
    Map<String, Object?> data,
    ui.Size? content,
    ColorResolver palette,
  ) {
    final style = (data['style'] as Map?) ?? const {};
    final diagnostics = <String>[];
    final margin = data['margin'];
    final edges = margin is Map
        ? BoxEdges(
            _metric(margin['top'] ?? 0, 'margin.top'),
            _metric(margin['right'] ?? 0, 'margin.right'),
            _metric(margin['bottom'] ?? 0, 'margin.bottom'),
            _metric(margin['left'] ?? 0, 'margin.left'),
          )
        : BoxEdges(
            _metric(margin ?? 0, 'margin'),
            _metric(margin ?? 0, 'margin'),
            _metric(margin ?? 0, 'margin'),
            _metric(margin ?? 0, 'margin'),
          );
    if (content != null &&
        (!content.isFinite || content.width < 0 || content.height < 0)) {
      throw const FormatException(
        'Text content must be finite and nonnegative',
      );
    }
    final bounds = content == null
        ? null
        : ui.Size(
            math.max(0, content.width - edges.left - edges.right),
            math.max(0, content.height - edges.top - edges.bottom),
          );
    final rawFontSize = style['fontSize'] ?? 16;
    final auto = rawFontSize == 'auto';
    final range = (style['autoFont'] as Map?) ?? const {};
    final min = _metric(range['min'] ?? 1, 'autoFont.min', min: 0).ceil();
    final max = _metric(range['max'] ?? 100, 'autoFont.max', min: 0).floor();
    if (auto && (min <= 0 || min > max)) {
      throw const FormatException(
        'Auto font range must contain a positive integer',
      );
    }
    if (auto && bounds == null) {
      throw const FormatException('Auto text needs content bounds');
    }
    final rawWeight = style['fontWeight'] ?? 400;
    final weight = switch (rawWeight) {
      'normal' => 400,
      'bold' => 700,
      'bolder' || 'lighter' => throw const FormatException(
        'Relative text font weights require a parent font context',
      ),
      num value => value.toInt(),
      String value => int.tryParse(value),
      _ => null,
    };
    if (weight == null || weight < 100 || weight > 900) {
      throw const FormatException('Unsupported text font weight');
    }
    if (weight % 100 != 0) diagnostics.add('fontWeight.intermediate');
    final fontWeight = ui.FontWeight.values[(weight / 100).round() - 1];
    final families = style['fontFamily'] ?? 'FiraCode';
    final fontFamilies = List<String>.unmodifiable(
      (families is List
              ? families.cast<String>()
              : (families as String).split(','))
          .map(
            (family) =>
                family.trim().replaceAll(RegExp(r'''^['"]|['"]$'''), ''),
          ),
    );
    if (fontFamilies.isEmpty || fontFamilies.any((family) => family.isEmpty)) {
      throw const FormatException('Text needs a nonempty font family');
    }
    final fontStyle = style['fontStyle'] ?? 'normal';
    if (fontStyle == 'oblique') diagnostics.add('fontStyle.oblique');
    final align = switch (style['align']) {
      'center' => ui.TextAlign.center,
      'right' => ui.TextAlign.right,
      'justify' => ui.TextAlign.justify,
      _ => ui.TextAlign.left,
    };
    final wordWrap = style['wordWrap'] == true;
    final rawWidth = style['wordWrapWidth'];
    final wrapWidth = rawWidth == 'auto'
        ? bounds?.width
        : _metric(rawWidth ?? 100, 'wordWrapWidth', min: 0);
    if (wordWrap && wrapWidth == null) {
      throw const FormatException(
        'Automatic text wrap width needs content bounds',
      );
    }
    final alpha = _metric(style['alpha'] ?? 1, 'alpha', min: 0, max: 1);
    final tint = data['tint'] == null
        ? const ui.Color(0xffffffff)
        : palette.resolve(data['tint']!);
    ui.Color paintColor(Object source, [double opacity = 1]) {
      final resolved = multiplyColors(palette.resolve(source), tint);
      return resolved.withValues(alpha: resolved.a * alpha * opacity);
    }

    final rawStroke = style['stroke'];
    final stroke = rawStroke is Map ? rawStroke : const {};
    final strokeWidth = rawStroke == null
        ? 0.0
        : _metric(
            stroke['width'] ?? style['strokeWidth'] ?? 1,
            'stroke.width',
            min: 0,
          );
    final strokeColor = rawStroke == null
        ? null
        : paintColor(
            rawStroke is Map ? (stroke['color'] ?? 'black') : rawStroke,
            _metric(stroke['alpha'] ?? 1, 'stroke.alpha', min: 0, max: 1),
          );
    for (final key in ['fill', 'texture', 'matrix', 'textureSpace']) {
      if (stroke.containsKey(key)) diagnostics.add('stroke.$key');
    }
    if (stroke['alignment'] != null && stroke['alignment'] != 0.5) {
      diagnostics.add('stroke.alignment');
    }
    if (stroke['pixelLine'] == true) diagnostics.add('stroke.pixelLine');
    final rawShadow = style['dropShadow'];
    final shadowFields = rawShadow is Map ? rawShadow : const {};
    ui.Shadow? shadow;
    if (rawShadow == true || rawShadow is Map) {
      final angle = _metric(
        shadowFields['angle'] ?? math.pi / 6,
        'dropShadow.angle',
      );
      final distance = _metric(
        shadowFields['distance'] ?? 5,
        'dropShadow.distance',
      );
      shadow = ui.Shadow(
        color: paintColor(
          shadowFields['color'] ?? 'black',
          _metric(
            shadowFields['alpha'] ?? 1,
            'dropShadow.alpha',
            min: 0,
            max: 1,
          ),
        ),
        offset: ui.Offset(
          math.cos(angle) * distance,
          math.sin(angle) * distance,
        ),
        blurRadius: _metric(
          shadowFields['blur'] ?? 0,
          'dropShadow.blur',
          min: 0,
        ),
      );
    }
    for (final entry in style.entries) {
      final unsupported = switch (entry.key) {
        'fontVariant' => entry.value != 'normal',
        'textBaseline' => entry.value != 'alphabetic',
        'trim' => entry.value == true,
        'leading' || 'cornerRadius' => entry.value != 0,
        'tagStyles' => (entry.value as Map).isNotEmpty,
        'filters' => (entry.value as List).isNotEmpty,
        _ => false,
      };
      if (unsupported) diagnostics.add(entry.key as String);
    }
    final lineHeight = _metric(style['lineHeight'] ?? 0, 'lineHeight');
    if (lineHeight < 0) diagnostics.add('lineHeight.negative');
    final fontSize = auto ? max.toDouble() : _fontSize(rawFontSize);
    if (fontSize == 0) diagnostics.add('fontSize.zeroNativeLineHeight');
    return TextSpec._(
      text: data['text'] as String? ?? '',
      fontFamilies: fontFamilies,
      fontSize: fontSize,
      auto: auto,
      autoMin: min,
      autoMax: max,
      fontWeight: fontWeight,
      fontStyle: fontStyle == 'normal'
          ? ui.FontStyle.normal
          : ui.FontStyle.italic,
      align: align,
      wordWrap: wordWrap,
      wrapWidth: wrapWidth,
      breakWords: style['breakWords'] == true,
      whiteSpace: style['whiteSpace'] as String? ?? 'pre',
      overflow:
          style['overflow'] as String? ??
          data['overflow'] as String? ??
          'visible',
      bounds: bounds,
      split: (data['split'] as num? ?? 0).toInt(),
      letterSpacing: _metric(style['letterSpacing'] ?? 0, 'letterSpacing'),
      lineHeight: lineHeight > 0 ? lineHeight : null,
      padding: _metric(style['padding'] ?? 0, 'padding', min: 0),
      color: paintColor(style['fill'] ?? 'black'),
      strokeColor: strokeColor,
      strokeWidth: strokeWidth,
      strokeJoin: switch (stroke['join']) {
        'round' => ui.StrokeJoin.round,
        'bevel' => ui.StrokeJoin.bevel,
        _ => ui.StrokeJoin.miter,
      },
      strokeCap: switch (stroke['cap']) {
        'round' => ui.StrokeCap.round,
        'square' => ui.StrokeCap.square,
        _ => ui.StrokeCap.butt,
      },
      strokeMiterLimit: _metric(
        stroke['miterLimit'] ?? 10,
        'stroke.miterLimit',
        min: 0,
      ),
      shadow: shadow,
      unsupportedFields: List<String>.unmodifiable(diagnostics),
    );
  }

  final String text, whiteSpace, overflow;
  final List<String> fontFamilies;
  final double fontSize, letterSpacing, padding, strokeWidth, strokeMiterLimit;
  final double? wrapWidth, lineHeight;
  final bool auto, wordWrap, breakWords;
  final int autoMin, autoMax, split;
  final ui.FontWeight fontWeight;
  final ui.FontStyle fontStyle;
  final ui.TextAlign align;
  final ui.Size? bounds;
  final ui.Color color;
  final ui.Color? strokeColor;
  final ui.StrokeJoin strokeJoin;
  final ui.StrokeCap strokeCap;
  final ui.Shadow? shadow;
  final List<String> unsupportedFields;

  late final String metricKey = jsonEncode([
    text,
    fontFamilies,
    fontSize,
    auto,
    autoMin,
    autoMax,
    fontWeight.value,
    fontStyle.index,
    align.index,
    wordWrap,
    wrapWidth,
    breakWords,
    whiteSpace,
    overflow,
    bounds?.width,
    bounds?.height,
    split,
    letterSpacing,
    lineHeight,
    padding,
    strokeWidth,
    shadow?.offset.dx,
    shadow?.offset.dy,
    shadow?.blurRadius,
    unsupportedFields,
  ]);

  late final String paintKey = jsonEncode([
    color.toARGB32(),
    strokeColor?.toARGB32(),
    strokeWidth,
    strokeJoin.index,
    strokeCap.index,
    strokeMiterLimit,
    shadow?.color.toARGB32(),
  ]);
}

double _metric(Object value, String name, {double? min, double? max}) {
  if (value is! num ||
      !value.isFinite ||
      (min != null && value < min) ||
      (max != null && value > max)) {
    throw FormatException('Invalid text metric $name', value);
  }
  return value.toDouble();
}

// Pixi's TextStyle setter uses parseInt(value, 10), even for strings carrying
// CSS units: 12pt -> 12 logical pixels and 1.6em -> 1. Do not invent a CSS
// parent-size or DPI context here.
double _fontSize(Object value) {
  if (value is String) {
    final prefix = RegExp(r'^\s*([+-]?\d+)').firstMatch(value);
    if (prefix == null) {
      throw FormatException('Unresolvable text font size', value);
    }
    return _metric(num.parse(prefix[1]!), 'fontSize', min: 0);
  }
  return _metric(value, 'fontSize', min: 0);
}
