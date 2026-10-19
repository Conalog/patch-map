import 'dart:convert';
import 'dart:math' as math;
import 'dart:ui' as ui;

import '../../dataset/colors.dart';
import '../../geometry/layout.dart' show BoxEdges;

/// Detached text and shared immutable preparation values. Placement and authored
/// transforms stay with geometry; [bounds] excludes this text's margin.
final class TextSpec {
  const TextSpec.fromParameters(this.text, this.parameters);

  factory TextSpec.fromData(
    Map<String, Object?> data,
    ui.Size? content,
    ColorResolver palette,
  ) {
    final parameters = TextParameters.fromData(data, content, palette);
    return TextSpec.fromParameters(data['text'] as String? ?? '', parameters);
  }

  final String text;
  final TextParameters parameters;
  List<String> get fontFamilies => parameters.fontFamilies;
  double get fontSize => parameters.fontSize;
  bool get auto => parameters.auto;
  int get autoMin => parameters.autoMin;
  int get autoMax => parameters.autoMax;
  ui.FontWeight get fontWeight => parameters.fontWeight;
  ui.FontStyle get fontStyle => parameters.fontStyle;
  ui.TextAlign get align => parameters.align;
  bool get wordWrap => parameters.wordWrap;
  double? get wrapWidth => parameters.wrapWidth;
  bool get breakWords => parameters.breakWords;
  String get whiteSpace => parameters.whiteSpace;
  String get overflow => parameters.overflow;
  ui.Size? get bounds => parameters.bounds;
  int get split => parameters.split;
  double get letterSpacing => parameters.letterSpacing;
  double? get lineHeight => parameters.lineHeight;
  double get padding => parameters.padding;
  ui.Color get color => parameters.color;
  double get objectOpacity => parameters.objectOpacity;
  ui.Color? get strokeColor => parameters.strokeColor;
  double get strokeWidth => parameters.strokeWidth;
  ui.StrokeJoin get strokeJoin => parameters.strokeJoin;
  ui.StrokeCap get strokeCap => parameters.strokeCap;
  double get strokeMiterLimit => parameters.strokeMiterLimit;
  ui.Shadow? get shadow => parameters.shadow;
  List<String> get unsupportedFields => parameters.unsupportedFields;

  String get metricStyleKey => parameters.metricStyleKey;
  (String, String) get metricKey => (text, metricStyleKey);
  String get paintKey => parameters.paintKey;
}

/// Parsed non-text parameters only: no numeric proof, atlas eligibility, fitted
/// font size, native metrics or Paragraph is shared through this value.
/// Scope-local input identity keys belong to TextPool, never to this object.
final class TextParameters {
  TextParameters._({
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
    required this.objectOpacity,
    required this.strokeColor,
    required this.strokeWidth,
    required this.strokeJoin,
    required this.strokeCap,
    required this.strokeMiterLimit,
    required this.shadow,
    required this.unsupportedFields,
  });

  factory TextParameters.fromData(
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
    // Release lowers component tint (including its normalized white default)
    // over style.fill, then rasterizes white text and applies object.tint/alpha.
    // Standalone text has no tint field and uses its authored fill instead.
    final paint = palette.resolve(data['tint'] ?? style['fill'] ?? 'black');
    final color = paint.withValues(alpha: paint.a * alpha);
    ui.Color strokePaint(Object source, double opacity) {
      // Raster stroke RGBA is multiplied by the object's RGB tint and alpha.
      final raster = palette.resolve(source);
      final resolved = multiplyColors(raster, paint);
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
        : strokePaint(
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
    // These authored fields do not reach release's Pixi TextStyle. Retain the
    // data in the dataset, but do not add shadow/spacing to native output. Keep
    // their existing conservative proof exclusion until qualified separately.
    final rawShadow = style['dropShadow'];
    if (rawShadow == true || rawShadow is Map) diagnostics.add('dropShadow');
    if ((style['padding'] as num? ?? 0) != 0) diagnostics.add('padding');
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
    return TextParameters._(
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
      padding: 0,
      color: color,
      objectOpacity: paint.a * alpha,
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
      shadow: null,
      unsupportedFields: List<String>.unmodifiable(diagnostics),
    );
  }

  final String whiteSpace, overflow;
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

  /// Opacity applied after the release text raster has combined fill and stroke.
  final double objectOpacity;
  final ui.Color? strokeColor;
  final ui.StrokeJoin strokeJoin;
  final ui.StrokeCap strokeCap;
  final ui.Shadow? shadow;
  final List<String> unsupportedFields;

  late final String metricStyleKey = jsonEncode([
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
