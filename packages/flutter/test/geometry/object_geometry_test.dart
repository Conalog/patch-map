import 'dart:ui';

import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/geometry/geometry_snapshot.dart';
import 'package:conalog_patch_map/src/geometry/object_geometry.dart';
import 'package:flutter_test/flutter_test.dart';

void point(Offset actual, Offset expected) {
  expect(actual.dx, closeTo(expected.dx, 1e-9));
  expect(actual.dy, closeTo(expected.dy, 1e-9));
}

void main() {
  test('nested grid corners preserve rotation, scale and reflection', () {
    var measurements = 0;
    final snapshot = GeometrySnapshot.compile(
      const DatasetReader().read([
        {
          'type': 'group',
          'id': 'plant',
          'attrs': {'x': 100, 'y': 200, 'angle': 90, 'scaleX': 2},
          'children': [
            {
              'type': 'grid',
              'id': 'grid',
              'attrs': {'x': 10, 'y': 20, 'scaleX': -1, 'scaleY': 3},
              'gap': {'x': 5, 'y': 7},
              'cells': [
                [1, 1],
                [1, 1],
              ],
              'item': {
                'size': {'width': 20, 'height': 10},
                'components': [
                  {'type': 'text', 'id': 'label', 'text': 'overflow'},
                ],
              },
            },
          ],
        },
      ]),
      (_, _) {
        measurements++;
        return const Size(50, 8);
      },
    );
    final preparedMeasurements = measurements;
    final node = snapshot['grid.1.1']!;
    for (var i = 0; i < 10; i++) {
      final result = readObjectGeometry(snapshot, 'grid.1.1')!;
      // Independent arithmetic: group maps (x,y) -> (100-y,200+2*x),
      // grid maps cell (25,17) -> (-15,71), giving world (29,170).
      point(result.origin, const Offset(29, 170));
      point(result.corners!.topLeft, const Offset(29, 170));
      point(result.corners!.topRight, const Offset(29, 130));
      point(result.corners!.bottomRight, const Offset(-1, 130));
      point(result.corners!.bottomLeft, const Offset(-1, 170));
      point(result.center!, const Offset(14, 150));
      point(result.bounds!.topLeft, const Offset(-1, 130));
      point(result.bounds!.bottomRight, const Offset(29, 170));
      expect(result.bounds, same(node.bounds));
      expect(result.paintBounds, same(node.paintBounds));
      expect(result.paintBounds!.height, greaterThan(result.bounds!.height));
    }
    expect(
      measurements,
      preparedMeasurements,
      reason: 'reads never lay out text',
    );
    expect(snapshot['grid.1.1'], same(node));
    expect(readObjectGeometry(snapshot, 'missing'), isNull);
  });

  test('container aggregates, hidden leaves and paths keep their meanings', () {
    final snapshot = GeometrySnapshot.compile(
      const DatasetReader().read([
        {
          'type': 'group',
          'id': 'group',
          'children': [
            {'type': 'rect', 'id': 'a', 'size': 10},
            {
              'type': 'rect',
              'id': 'b',
              'size': 10,
              'attrs': {'x': 20},
            },
            {
              'type': 'rect',
              'id': 'hidden',
              'size': 10,
              'show': false,
              'attrs': {'x': 1000},
            },
          ],
        },
        {'type': 'group', 'id': 'empty', 'children': []},
        {
          'type': 'relations',
          'id': 'link',
          'links': [
            {'source': 'a', 'target': 'b'},
          ],
        },
      ]),
      (_, _) => const Size(8, 6),
    );
    final group = readObjectGeometry(snapshot, 'group')!;
    expect(group.bounds, const Rect.fromLTWH(0, 0, 30, 10));
    expect(group.center, const Offset(15, 5));
    expect(group.corners, isNull);
    final hidden = readObjectGeometry(snapshot, 'hidden')!;
    expect(hidden.bounds, const Rect.fromLTWH(1000, 0, 10, 10));
    expect(hidden.corners!.bottomLeft, const Offset(1000, 10));
    expect(hidden.paintBounds, isNull);
    final empty = readObjectGeometry(snapshot, 'empty')!;
    expect(empty.origin, Offset.zero);
    expect(empty.center, isNull);
    expect(empty.bounds, isNull);
    expect(empty.paintBounds, isNull);
    final link = readObjectGeometry(snapshot, 'link')!;
    expect(link.bounds, isNotNull);
    expect(link.bounds, same(snapshot.relationFor('link')!.bounds));
    expect(link.paintBounds, same(snapshot.relationFor('link')!.paintBounds));
    expect(link.corners, isNull);
  });
}
