import 'dart:typed_data';

// Inputs are prepared outside timing and match the native frame protocol.
List<Float64List> barProfileInputs(int count, int samples) {
  var state = 0x5eed;
  final previous = Float64List(count)..fillRange(0, count, 10);
  return List.generate(samples, (_) {
    final values = Float64List(count);
    for (var index = 0; index < count; index++) {
      state = (state * 1664525 + 1013904223) & 0xffffffff;
      var next = 1.0 + state % 20;
      if (next == previous[index]) next = next % 20 + 1;
      values[index] = next;
      previous[index] = next;
    }
    return values;
  });
}
