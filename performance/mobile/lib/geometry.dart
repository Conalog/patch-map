import 'dart:math' as math;
import 'dart:typed_data';

// Independent port for the axis-aligned rounded-bar slice specified in README.
// This is not a replacement for PatchMap's full geometry/transaction authority.
final _corners = <(double, double)>[
  for (final start in [-math.pi / 2, 0.0, math.pi / 2, math.pi])
    for (var segment = 0; segment <= 4; segment++)
      (
        math.cos(start + segment / 4 * math.pi / 2),
        math.sin(start + segment / 4 * math.pi / 2),
      ),
];

Float32List project(List<double> heights, int stride) {
  final result = Float32List(heights.length * 42);
  for (var ordinal = 0; ordinal < heights.length; ordinal++) {
    final index = ordinal * stride;
    final grid = index ~/ 100;
    final cell = index % 100;
    final x = (grid % 5) * 270.0 + (cell % 25) * 10;
    final bottom = (grid ~/ 5) * 110.0 + (cell ~/ 25) * 24 + 20;
    final height = heights[ordinal];
    if (!height.isFinite || height <= 0 || height > 20) {
      throw RangeError('benchmark height must be in (0, 20]');
    }
    final y = bottom - height;
    final radius = math.min(3.0, math.min(4.0, height / 2));
    final base = ordinal * 42;
    result[base] = x + 4;
    result[base + 1] = y + height / 2;
    for (var corner = 0; corner < 4; corner++) {
      final cx = corner < 2 ? 8 - radius : radius;
      final cy = corner == 0 || corner == 3 ? radius : height - radius;
      for (var segment = 0; segment <= 4; segment++) {
        final perimeter = corner * 5 + segment;
        final unit = _corners[perimeter];
        final offset = base + (1 + perimeter) * 2;
        result[offset] = x + cx + unit.$1 * radius;
        result[offset + 1] = y + cy + unit.$2 * radius;
      }
    }
  }
  return result;
}

List<List<double>> inputs(int count, int stride, int samples) {
  var state = 0x5eed;
  final previous = List<double>.filled(count ~/ stride, 10);
  return List.generate(samples, (_) {
    return List.generate(previous.length, (i) {
      state = (state * 1664525 + 1013904223) & 0xffffffff;
      var next = 1.0 + state % 20;
      if (next == previous[i]) next = next % 20 + 1;
      previous[i] = next;
      return next;
    });
  });
}

void checkVertices(Float32List actual, Float32List expected) {
  if (actual.length != expected.length)
    throw StateError('vertex length mismatch');
  for (var i = 0; i < actual.length; i++) {
    if (!actual[i].isFinite || (actual[i] - expected[i]).abs() > 0.0001) {
      throw StateError('vertex $i: ${actual[i]} != ${expected[i]}');
    }
  }
}
