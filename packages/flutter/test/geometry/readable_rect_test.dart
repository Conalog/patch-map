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

  test('bar placement flips with readable frame about item center', () {
    final authored = Affine.fromAttrs({'angle': 180});
    final anchor = authored.project(const Offset(50, 50));
    const box = Rect.fromLTWH(25, 75, 50, 25);
    final bar = readableRectTransform(
      authored,
      box,
      0,
      placementAnchor: anchor,
    );
    final text = readableRectTransform(authored, box, 0);
    expect(bar.project(const Offset(25, 12.5)).dy, closeTo(-12.5, 1e-10));
    expect(text.project(const Offset(25, 12.5)).dy, closeTo(-87.5, 1e-10));
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
