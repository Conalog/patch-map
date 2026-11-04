import 'dart:ui';
import 'package:conalog_patch_map/src/geometry/affine.dart';
import 'package:conalog_patch_map/src/rendering/static_geometry.dart';
import 'package:flutter_test/flutter_test.dart';
import 'static_geometry_test.dart' as fixture;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'retained topology matches full rebuild for per-content alpha and order',
    () async {
      final shapes = [
        fixture.shape(
          const Rect.fromLTWH(10, 10, 44, 40),
          paint: fixture.style(
            alpha: .333333333,
            fill: '#eeaa11',
            stroke: '#80aa0055',
          ),
        ),
        fixture.shape(
          const Rect.fromLTWH(33, 21, 37, 46),
          paint: fixture.style(radius: 6, alpha: .7),
          world: const Affine(1, .12, -.15, 1, 5, 2),
        ),
        fixture.shape(
          const Rect.fromLTWH(77, 8, 18, 18),
          paint: fixture.style(width: 0, fill: '#00000000'),
        ),
        fixture.shape(
          const Rect.fromLTWH(71, 48, 31, 29),
          paint: fixture.style(radius: 0, fill: '#00000000'),
        ),
      ];
      final base = StaticGeometry.tryBuild(shapes, retainTopology: true)!;
      addTearDown(base.dispose);
      expect(base.retainedTopologyBytes, greaterThan(0));
      for (final factors in [
        [.08, .28, 1.0, .22],
        [.25, 1.0, .5, .00001],
        [1.0, 1.0, 1.0, 1.0],
      ]) {
        final variant = base.withOpacities(factors)!;
        final rebuilt = StaticGeometry.tryBuild([
          for (var i = 0; i < shapes.length; i++)
            StaticRectangle(
              shapes[i].rect,
              shapes[i].world,
              shapes[i].paint.multipliedAlpha(factors[i]),
            ),
        ])!;
        expect(variant.retainedTopologyBytes, 0);
        expect(variant.bounds, rebuilt.bounds);
        expect(variant.geometryBytes, rebuilt.geometryBytes);
        expect(variant.vertexCount, rebuilt.vertexCount);
        expect(
          await fixture.pixels([], owner: variant),
          await fixture.pixels([], owner: rebuilt),
        );
        variant.dispose();
        rebuilt.dispose();
      }
      final independent = base.withOpacities([.5, .5, 1, .5])!;
      final before = await fixture.pixels([], owner: independent);
      base.dispose();
      expect(base.retainedTopologyBytes, 0);
      expect(await fixture.pixels([], owner: independent), before);
      independent.dispose();
    },
  );
  test('zero or incompatible opacity uses unchanged builder fallback', () {
    final shapes = [fixture.shape(const Rect.fromLTWH(4, 4, 20, 20))];
    final base = StaticGeometry.tryBuild(shapes, retainTopology: true)!;
    expect(base.withOpacities([0]), isNull);
    expect(base.withOpacities([1, 1]), isNull);
    final ordinary = StaticGeometry.tryBuild(shapes)!;
    expect(ordinary.retainedTopologyBytes, 0);
    expect(ordinary.withOpacities([.5]), isNull);
    base.dispose();
    ordinary.dispose();
  });
}
