import 'dart:ui';

import '../dataset/dataset_values.dart' show DatasetException;

/// A normalized dimension compiled once, outside animation and paint paths.
/// calc() is linear in the available dimension; it does not need an evaluator
/// or string parsing when a bar changes its displayed size.
final class Dimension {
  const Dimension(this.pixels, this.fraction);
  final double pixels, fraction;

  factory Dimension.compile(Object value) {
    if (value is num) return Dimension(value.toDouble(), 0);
    if (value is Map) {
      final amount = (value['value'] as num).toDouble();
      return value['unit'] == '%'
          ? Dimension(0, amount / 100)
          : Dimension(amount, 0);
    }
    final text = value as String;
    if (!text.startsWith('calc(')) {
      return Dimension(
        0,
        double.parse(text.substring(0, text.length - 1)) / 100,
      );
    }
    final expression = text.substring(5, text.length - 1);
    var pixels = 0.0, fraction = 0.0, consumed = 0;
    for (final match in _terms.allMatches(expression)) {
      if (match.start != consumed) _invalid('size', 'invalid calc expression');
      final sign = match.group(2) == '-' ? -1 : 1;
      final amount = double.parse(match.group(3)!) * sign;
      if (match.group(4) == '%') {
        fraction += amount / 100;
      } else {
        pixels += amount;
      }
      consumed = match.end;
    }
    if (consumed != expression.length || consumed == 0) {
      _invalid('size', 'invalid calc expression');
    }
    return Dimension(pixels, fraction);
  }

  static final _terms = RegExp(
    r'(^| ([+-]) )([+-]?(?:\d+(?:\.\d+)?|\.\d+))(px|%)',
  );

  double resolve(double available, {String path = 'size'}) {
    final result = pixels + available * fraction;
    if (!available.isFinite ||
        available < 0 ||
        !result.isFinite ||
        result < 0) {
      _invalid(path, 'resolved dimension must be finite and nonnegative');
    }
    return result;
  }
}

final class RelativeSize {
  const RelativeSize(this.width, this.height);
  final Dimension width, height;

  factory RelativeSize.compile(Object value) {
    if (value is Map && value.containsKey('width')) {
      return RelativeSize(
        Dimension.compile(value['width'] as Object),
        Dimension.compile(value['height'] as Object),
      );
    }
    final dimension = Dimension.compile(value);
    return RelativeSize(dimension, dimension);
  }

  Size resolve(Size available, {String path = 'size'}) => Size(
    width.resolve(available.width, path: '$path.width'),
    height.resolve(available.height, path: '$path.height'),
  );
}

/// Dataset spacing permits negative margins/padding, unlike camera padding.
final class BoxEdges {
  const BoxEdges(this.top, this.right, this.bottom, this.left);
  static const zero = BoxEdges(0, 0, 0, 0);
  final double top, right, bottom, left;

  factory BoxEdges.fromData(Map value) => BoxEdges(
    (value['top'] as num).toDouble(),
    (value['right'] as num).toDouble(),
    (value['bottom'] as num).toDouble(),
    (value['left'] as num).toDouble(),
  );

  Rect contentBox(Size size, {String path = 'padding'}) {
    final width = size.width - left - right;
    final height = size.height - top - bottom;
    if (!width.isFinite || !height.isFinite || width < 0 || height < 0) {
      _invalid(path, 'padding produces invalid content dimensions');
    }
    return Rect.fromLTWH(left, top, width, height);
  }
}

Size fixedSize(Map value) => Size(
  (value['width'] as num).toDouble(),
  (value['height'] as num).toDouble(),
);

/// Named edges consume their own margin. The unanchored axis stays centered
/// inside the unmodified content rectangle; margin does not shrink that box.
Rect placeBox(Rect reference, Size size, String placement, BoxEdges margin) {
  if (placement == 'none') return Offset.zero & size;
  var x = reference.left + (reference.width - size.width) / 2;
  var y = reference.top + (reference.height - size.height) / 2;
  switch (placement) {
    case 'left' || 'left-top' || 'left-bottom':
      x = reference.left + margin.left;
    case 'right' || 'right-top' || 'right-bottom':
      x = reference.right - margin.right - size.width;
  }
  switch (placement) {
    case 'top' || 'left-top' || 'right-top':
      y = reference.top + margin.top;
    case 'bottom' || 'left-bottom' || 'right-bottom':
      y = reference.bottom - margin.bottom - size.height;
  }
  if (!x.isFinite || !y.isFinite) _invalid('placement', 'nonfinite position');
  return Rect.fromLTWH(x, y, size.width, size.height);
}

Never _invalid(String path, String message) =>
    throw DatasetException('INVALID_GEOMETRY', path, message);
