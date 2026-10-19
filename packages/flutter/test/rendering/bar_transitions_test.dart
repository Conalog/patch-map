import 'dart:ui';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/geometry/geometry_snapshot.dart';
import 'package:conalog_patch_map/src/rendering/bar_transitions.dart';
import 'package:flutter_test/flutter_test.dart';

GeometrySnapshot diagram(double height, {bool animate = true}) =>
    GeometrySnapshot.compile(
      const DatasetReader().read([
        {
          'type': 'item',
          'id': 'a',
          'size': 100,
          'components': [
            {
              'type': 'bar',
              'id': 'b',
              'source': {'type': 'rect', 'fill': '#00ff00'},
              'size': {'width': 40, 'height': height},
              'animation': animate,
              'animationDuration': 200,
            },
          ],
        },
      ]),
      (_, _) => Size.zero,
    );
void main() {
  test(
    'bar starts at next frame after idle and follows approved cubic polynomial',
    () {
      final transitions = BarTransitions(),
          before = diagram(20),
          after = diagram(80);
      transitions.advance(const Duration(seconds: 1));
      transitions.replace(before, after, [0], animate: true);
      expect(transitions.rectangle(0, 'b')!.height, 20);
      transitions.advance(const Duration(seconds: 50));
      expect(transitions.rectangle(0, 'b')!.height, 20);
      transitions.advance(const Duration(milliseconds: 50050));
      expect(transitions.rectangle(0, 'b')!.height, closeTo(23.75, 1e-8));
      transitions.advance(const Duration(milliseconds: 50100));
      expect(transitions.rectangle(0, 'b')!.height, 50);
      transitions.replace(after, after, [0], animate: true);
      transitions.advance(const Duration(milliseconds: 50150));
      expect(transitions.rectangle(0, 'b')!.height, closeTo(76.25, 1e-8));
      expect(transitions.advance(const Duration(milliseconds: 50200)), false);
      expect(transitions.rectangle(0, 'b'), isNull);
    },
  );
  test(
    'retarget samples displayed rectangle and nonanimated updates stop transition',
    () {
      final transitions = BarTransitions(),
          a = diagram(20),
          b = diagram(80),
          c = diagram(40);
      transitions.replace(a, b, [0], animate: true);
      transitions.advance(Duration.zero);
      transitions.advance(const Duration(milliseconds: 100));
      transitions.replace(b, c, [0], animate: true);
      expect(transitions.rectangle(0, 'b')!.height, 50);
      transitions.advance(const Duration(milliseconds: 120));
      expect(transitions.rectangle(0, 'b')!.height, 50);
      transitions.replace(c, diagram(90, animate: false), [0], animate: true);
      expect(transitions.rectangle(0, 'b'), isNull);
    },
  );
}
