import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:patch_map/src/model/dataset.dart';
import 'package:patch_map/src/semantic/geometry/geometry.dart';

const _barKey = 'grid.0.0\u0000bar';

void main() {
  for (final (size, expectedWidth) in <(Object, double)>[
    (5, 5),
    ('50%', 40),
    ({'value': 25, 'unit': '%'}, 20),
  ]) {
    test('height overlays preserve scalar width for $size', () {
      final dataset = _dataset(size);
      final original = buildGeometry(dataset);
      var previous = original;
      for (final height in [0.0, 70.0, 220.0, 7.0]) {
        final full = buildGeometry(dataset, overlays: _overlay(height));
        final projected = projectBarHeights(previous, [
          _barKey,
        ], Float64List.fromList([height]))!;
        expect(full.primitives.single.localRect.width, expectedWidth);
        expect(full.primitives.single.localRect.height, height);
        _expectSameGeometry(projected, full);
        previous = projected;
      }
      expect(original.primitives.single.localRect.width, expectedWidth);
      expect(dataset.nodes['grid.0.0']!.components.single['size'], size);
    });
  }

  test('height overlay follows a later scalar template width update', () {
    final overlay = _overlay(70);
    final initial = buildGeometry(_dataset(5), overlays: overlay);
    final replacement = _dataset('50%');
    final replayed = buildGeometry(replacement, overlays: overlay);
    expect(initial.primitives.single.localRect.width, 5);
    expect(replayed.primitives.single.localRect.width, 40);
    expect(replayed.primitives.single.localRect.height, 70);
    expect(overlay[_barKey]!['size'], {'height': 70.0});

    final next = projectBarHeights(replayed, [
      _barKey,
    ], Float64List.fromList([55]))!;
    _expectSameGeometry(
      next,
      buildGeometry(replacement, overlays: _overlay(55)),
    );
    expect(next.primitives.single.localRect.width, 40);
    expect(replayed.primitives.single.localRect.height, 70);
  });
}

PatchMapDataset _dataset(Object size) => PatchMapDataset.parse([
  {
    'id': 'grid',
    'type': 'grid',
    'cells': [
      [1],
    ],
    'attrs': {'angle': 17, 'scaleX': -1.5},
    'item': {
      'size': {'width': 100, 'height': 200},
      'padding': 10,
      'components': [
        {'id': 'bar', 'type': 'bar', 'size': size, 'source': {}},
      ],
    },
  },
]);

Map<String, JsonMap> _overlay(double height) => {
  _barKey: {
    'size': {'height': height},
  },
};

void _expectSameGeometry(PatchMapGeometry actual, PatchMapGeometry expected) {
  expect(
    actual.primitives.single.localRect.width,
    expected.primitives.single.localRect.width,
  );
  expect(
    actual.primitives.single.localRect.height,
    expected.primitives.single.localRect.height,
  );
  expect(actual.targets.keys, orderedEquals(expected.targets.keys));
  for (final key in expected.targets.keys) {
    final left = actual.targets[key]!.bounds;
    final right = expected.targets[key]!.bounds;
    expect(left.left, closeTo(right.left, 1e-8), reason: '$key left');
    expect(left.top, closeTo(right.top, 1e-8), reason: '$key top');
    expect(left.right, closeTo(right.right, 1e-8), reason: '$key right');
    expect(left.bottom, closeTo(right.bottom, 1e-8), reason: '$key bottom');
  }
}
