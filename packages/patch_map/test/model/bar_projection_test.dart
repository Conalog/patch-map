import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:patch_map/src/model/dataset.dart';
import 'package:patch_map/src/semantic/geometry/geometry.dart';

void main() {
  test(
    'bar delta equals full geometry for placement, affine, bounds and hits',
    () {
      final dataset = PatchMapDataset.parse([
        {
          'id': 'group',
          'type': 'group',
          'attrs': {'x': 10, 'y': 20, 'angle': 33, 'scaleX': -2},
          'children': [
            {
              'id': 'item',
              'type': 'item',
              'size': {'width': 80, 'height': 100},
              'padding': 5,
              'components': [
                {
                  'id': 'bar',
                  'type': 'bar',
                  'size': {'width': '50%', 'height': '50%'},
                  'placement': 'right-bottom',
                  'margin': {'right': 3, 'bottom': 2},
                  'attrs': {'angle': 15, 'scaleY': 1.5},
                  'source': {'radius': 3},
                },
              ],
            },
          ],
        },
      ]);
      var previous = buildGeometry(dataset);
      expect(previous.resolveBarHeight('item\u0000bar', '50%'), 45);
      for (final height in [0.0, 2.0, 20.0, 100.0, 150.0, 10.0]) {
        final before = previous.primitives.single.localRect.height;
        final next = projectBarHeights(previous, [
          'item\u0000bar',
        ], Float64List.fromList([height]))!;
        final full = buildGeometry(
          dataset,
          overlays: {
            'item\u0000bar': {
              'size': {'height': height},
            },
          },
        );
        expect(previous.primitives.single.localRect.height, before);
        expect(identical(next.topology, previous.topology), isTrue);
        for (final key in full.targets.keys) {
          final a = next.targets[key]!, b = full.targets[key]!;
          expect(a.bounds.left, closeTo(b.bounds.left, 1e-8));
          expect(a.bounds.right, closeTo(b.bounds.right, 1e-8));
          expect(a.bounds.top, closeTo(b.bounds.top, 1e-8));
          expect(a.bounds.bottom, closeTo(b.bounds.bottom, 1e-8));
        }
        for (var x = -250.0; x < 100; x += 15)
          for (var y = -100.0; y < 250; y += 15) {
            expect(
              next.hitTest(x, y, includeComponents: true)?.id,
              full.hitTest(x, y, includeComponents: true)?.id,
            );
          }
        previous = next;
      }
    },
  );
  test(
    'unrelated primitive identity is retained and relation scope fallback is explicit',
    () {
      final data = PatchMapDataset.parse([
        {
          'type': 'item',
          'id': 'i',
          'size': 20,
          'components': [
            {'type': 'bar', 'id': 'b', 'size': 5, 'source': {}},
          ],
        },
        {
          'type': 'rect',
          'id': 'r',
          'size': 5,
          'attrs': {'x': 50},
        },
        {
          'type': 'relations',
          'id': 'link',
          'links': [
            {'source': 'i', 'target': 'r'},
          ],
        },
      ]);
      final previous = buildGeometry(data),
          next = projectBarHeights(previous, [
            'i\u0000b',
          ], Float64List.fromList([10]))!;
      expect(identical(previous.primitives[1], next.primitives[1]), isTrue);
      expect(next.changedPrimitiveSlots, [0]);
      expect(
        projectBarHeights(next, ['i\u0000b'], Float64List.fromList([100])),
        isNull,
      );
    },
  );
}
