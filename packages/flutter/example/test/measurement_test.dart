import 'dart:ui';
import 'package:flutter_test/flutter_test.dart';
import 'package:patch_map_example/measurement.dart';

FrameTiming frame(int number) => FrameTiming(
  vsyncStart: 100,
  buildStart: 120,
  buildFinish: 130,
  rasterStart: 140,
  rasterFinish: 150,
  rasterFinishWallTime: 0,
  frameNumber: number,
);
void main() {
  test(
    'delayed timing batches use engine frame numbers, not callback order',
    () {
      final selected = framesBetween(
        [frame(4), frame(1), frame(2), frame(5)],
        2,
        4,
      );
      expect(selected.map((f) => f.frameNumber), [4]);
      expect(framesBetween([frame(2)], 2, 2), isEmpty);
    },
  );
  test('last submitted frame included; subsequent host frame excluded', () {
    final selected = framesBetween([frame(2), frame(3), frame(4)], 2, 3);
    expect(selected.single.frameNumber, 3);
  });
}
