import 'dart:math' as math;
import 'dart:ui';

import 'package:conalog_patch_map/src/geometry/affine.dart';
import 'package:conalog_patch_map/src/geometry/readable_rect.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('finite large scale and small bounds retain a representable output', () {
    final result = readableRectTransform(
      const Affine(1e200, 0, 0, 1e200, 0, 0),
      const Rect.fromLTWH(0, 0, 1e-200, 1e-200),
      0,
    );
    expect(result.isFinite, true);
    final bounds = result
        .projectRect(const Rect.fromLTWH(0, 0, 1e-200, 1e-200))
        .bounds;
    expect(bounds.width, closeTo(1, 1e-12));
    expect(bounds.height, closeTo(1, 1e-12));
  });
  test('upright keeps readable rotation and authored text center', () {
    const box = Rect.fromLTWH(10, 20, 30, 40);
    for (final angle in [0.0, .4, 1.8, 3.1, 4.5, 6.0]) {
      final authored = Affine.fromAttrs({'rotation': angle});
      final result = readableRectTransform(authored, box, .3);
      final actualCenter = result.project(const Offset(15, 20));
      final expectedCenter = authored.project(box.center);
      expect((actualCenter - expectedCenter).distance, lessThan(1e-10));
      final screenA = math.cos(.3) * result.a - math.sin(.3) * result.b;
      expect(screenA, greaterThanOrEqualTo(-1e-7));
      expect(result.a * result.d - result.b * result.c, greaterThan(0));
    }
    final angled = readableRectTransform(
      Affine.fromAttrs({'rotation': .4}),
      box,
      0,
    );
    expect(angled.b, closeTo(math.sin(.4), 1e-12));
  });

  test(
    'camera angle preserves oblique text and chooses the upward vertical',
    () {
      final angles = <(double, double)>[
        (45, 45),
        (89.99, 89.99),
        (90, -90),
        (90.01, -89.99),
        (180, 0),
        (269.99, 89.99),
        (270, -90),
        (270.01, -89.99),
        (-90, -90),
        (450, -90),
      ];
      const box = Rect.fromLTWH(0, 0, 60, 20);
      for (final (camera, expected) in angles) {
        final rotation = camera * math.pi / 180;
        final result = readableRectTransform(Affine.identity, box, rotation);
        expect(result.project(box.center), box.center);
        final x = result.a * math.cos(rotation) - result.b * math.sin(rotation);
        final y = result.a * math.sin(rotation) + result.b * math.cos(rotation);
        expect(math.atan2(y, x) * 180 / math.pi, closeTo(expected, 1e-8));
      }
      final collapsed = const Affine(
        1,
        0,
        0,
        0,
        3,
        5,
      ).multiply(Affine.fromAttrs({'angle': 45}));
      expect(readableRectTransform(collapsed, box, math.pi), same(collapsed));
    },
  );

  test('reflection is removed without moving the box center', () {
    const box = Rect.fromLTWH(25, 75, 50, 25);
    final reflected = readableRectTransform(
      const Affine(-2, 0, 1, 3, 0, 0),
      box,
      0,
    );
    expect(reflected.a, greaterThan(0));
    expect(
      reflected.a * reflected.d - reflected.b * reflected.c,
      greaterThan(0),
    );
  });
}
