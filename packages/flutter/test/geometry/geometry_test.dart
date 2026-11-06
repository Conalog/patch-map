import 'dart:math' as math;
import 'dart:ui';

import 'package:conalog_patch_map/src/geometry/affine.dart';
import 'package:conalog_patch_map/src/geometry/spatial_index.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('large finite geometry cannot turn a miss into a NaN hit', () {
    final huge = Affine.identity.projectRect(
      const Rect.fromLTWH(0, 0, 1e200, 1e200),
    );
    expect(
      huge.segmentEntry(
        const Offset(-1e200, 5e199),
        const Offset(-5e199, 5e199),
      ),
      isNull,
    );
    expect(
      huge.segmentEntry(
        const Offset(-1e200, 5e199),
        const Offset(1e200, 5e199),
      ),
      closeTo(.5, 1e-12),
    );
    expect(huge.contains(const Offset(-1e200, 5e199)), false);
    expect(huge.contains(const Offset(5e199, 5e199)), true);
    final small = Affine.identity.projectRect(
      const Rect.fromLTWH(0, 0, 10, 10),
    );
    expect(
      small.segmentEntry(const Offset(-1e308, 5), const Offset(1e308, 5)),
      closeTo(.5, 1e-12),
    );
  });
  test(
    'nested signed transforms share exact drawing and inverse coordinates',
    () {
      final parent = Affine.fromAttrs({
        'x': 20,
        'y': 30,
        'angle': 35,
        'scaleX': -2,
        'scaleY': 3,
      });
      final child = Affine.fromAttrs({'x': 5, 'y': -7, 'angle': -18});
      final combined = parent.multiply(child);
      const point = Offset(12, 8);
      expect(
        (combined.project(point) - parent.project(child.project(point)))
            .distance,
        lessThan(1e-10),
      );
      expect(
        (combined.inverse!.project(combined.project(point)) - point).distance,
        lessThan(1e-10),
      );
      expect(Affine.fromAttrs({'scaleX': 0}).inverse, isNull);
    },
  );

  test(
    'quad intersection and ordered segment entry include boundaries and reflection',
    () {
      final quad = Affine.identity.projectRect(
        const Rect.fromLTWH(0, 0, 10, 20),
      );
      expect(quad.contains(const Offset(10, 20)), isTrue);
      expect(
        quad.segmentEntry(const Offset(-10, 10), const Offset(20, 10)),
        closeTo(1 / 3, 1e-12),
      );
      expect(
        quad.segmentEntry(const Offset(-10, -1), const Offset(20, -1)),
        isNull,
      );
      final mirrored = Affine.fromAttrs({
        'scaleX': -1,
      }).projectRect(const Rect.fromLTWH(0, 0, 10, 20));
      expect(mirrored.contains(const Offset(-5, 5)), isTrue);
      expect(quad.intersects(mirrored), isTrue);
      expect(
        quad.intersects(
          Affine.identity.projectRect(const Rect.fromLTWH(20, 0, 1, 1)),
        ),
        isFalse,
      );
    },
  );

  test(
    'full scans are distinguishable from local queries with the same slots',
    () {
      final index = SpatialIndex()
        ..reset([const Rect.fromLTWH(0, 0, 600, 600)]);
      final local = index.candidates(const Rect.fromLTWH(5, 5, 10, 10));
      expect(local, [0]);
      expect(index.isFullScan(local), isFalse);
      final broad = index.candidates(const Rect.fromLTWH(5, 5, 590, 590));
      expect(broad, [0]);
      expect(index.isFullScan(broad), isTrue);
      expect(
        index.isFullScan(
          index.candidates(const Rect.fromLTWH(-1, -1, 602, 602)),
        ),
        isTrue,
      );
      index.clear();
      expect(index.isFullScan(index.candidates(Rect.zero)), isFalse);
    },
  );
  test(
    'index preserves scan results for point, broad, huge and moved envelopes',
    () {
      final random = math.Random(349), bounds = <Rect>[];
      for (var i = 0; i < 10000; i++) {
        bounds.add(
          Rect.fromLTWH(
            (i % 100) * 60 - 3000,
            (i ~/ 100) * 90 - 4500,
            30 + random.nextDouble() * 20,
            60 + random.nextDouble() * 20,
          ),
        );
      }
      bounds.add(const Rect.fromLTWH(-10000, -10000, 30000, 30000));
      bounds.add(const Rect.fromLTWH(1e17, 1e17, 1024, 1024));
      final index = SpatialIndex()..reset(bounds);
      expect(index.overflowCount, 2);
      expect(index.membershipCount, lessThanOrEqualTo(10000 * 16));
      final queries = [
        const Rect.fromLTRB(-3000, -4500, -3000, -4500),
        const Rect.fromLTWH(-1000, -1000, 2000, 2000),
        const Rect.fromLTWH(-1e18, -1e18, 2e18, 2e18),
        const Rect.fromLTWH(1e17, 1e17, 512, 512),
        for (var i = 0; i < 30; i++)
          Rect.fromLTWH(
            random.nextDouble() * 6000 - 3000,
            random.nextDouble() * 9000 - 4500,
            random.nextDouble() * 500,
            random.nextDouble() * 500,
          ),
      ];
      void compare() {
        for (final q in queries) {
          final actual =
              index
                  .candidates(q)
                  .where((i) => boundsOverlap(bounds[i], q))
                  .toList()
                ..sort();
          final expected = [
            for (var i = 0; i < bounds.length; i++)
              if (boundsOverlap(bounds[i], q)) i,
          ];
          expect(actual, expected);
          expect(actual.toSet().length, actual.length);
        }
      }

      compare();
      bounds[4] = const Rect.fromLTWH(10000, -10000, 5000, 5000);
      index.update(4, bounds[4]);
      bounds[10000] = const Rect.fromLTWH(0, 0, 1, 1);
      index.update(10000, bounds[10000]);
      compare();
      index.clear();
      expect(index.candidates(queries.first), isEmpty);
      expect(index.membershipCount, 0);
    },
  );
}
