import 'dart:convert';
import 'dart:io';
import 'dart:ui';

import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/geometry/scene_geometry.dart';
import 'package:conalog_patch_map/src/geometry/geometry_snapshot.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'grid cells share layout and retain scoped paint order and transforms',
    () {
      var measures = 0;
      final document = const DatasetReader().read([
        {
          'type': 'group',
          'id': 'g',
          'attrs': {'x': 10, 'angle': 90},
          'children': [
            {
              'type': 'rect',
              'id': 'front',
              'size': 5,
              'attrs': {'zIndex': 2},
            },
            {
              'type': 'grid',
              'id': 'grid',
              'attrs': {'x': 20, 'alpha': .5},
              'cells': [
                [1, 0, 1],
              ],
              'inactiveCellStrategy': 'hide',
              'gap': 3,
              'item': {
                'size': {'width': 20, 'height': 40},
                'components': [
                  {
                    'id': 'text',
                    'type': 'text',
                    'text': '12',
                    'attrs': {'zIndex': 999},
                  },
                  {
                    'id': 'bar',
                    'type': 'bar',
                    'size': '50%',
                    'source': {},
                    'animation': false,
                  },
                ],
              },
            },
          ],
        },
      ]);
      final scene = SceneGeometry.compile(document, (_, _) {
        measures++;
        return const Size(8, 10);
      });
      expect(measures, 1);
      expect(scene.paintOrder.map((value) => value.id), [
        'grid.0.0',
        'grid.0.1',
        'grid.0.2',
        'front',
      ]);
      final first = scene.targets['grid.0.0']!,
          last = scene.targets['grid.0.2']!;
      expect(identical(first.item, last.item), true);
      expect(first.item!.components.map((value) => value.id), ['bar', 'text']);
      expect(
        first.item!.components.first.box,
        const Rect.fromLTWH(5, 20, 10, 20),
      );
      expect(scene.targets['grid.0.1']!.visible, false);
      expect(first.opacity, .5);
      expect(
        (last.world.project(Offset.zero) - const Offset(10, 66)).distance,
        lessThan(1e-10),
      );
    },
  );

  test('text overflow extends safety envelope while contained bars do not', () {
    final document = const DatasetReader().read([
      {
        'type': 'item',
        'id': 'i',
        'size': 20,
        'components': [
          {'type': 'bar', 'source': {}, 'size': 10000},
          {'type': 'text', 'text': 'overflow'},
        ],
      },
    ]);
    final scene = GeometrySnapshot.compile(
      document,
      (_, _) => const Size(80, 10),
    );
    expect(scene['i']!.bounds, const Rect.fromLTWH(0, 0, 20, 20));
    expect(scene.bounds!.width, 90);
    expect(scene.bounds!.height, 90);
  });

  test(
    'large consumer fixture compiles shared templates without per-cell text measurement',
    () {
      final input = jsonDecode(
        File(
          '../javascript/tests/fixtures/large-grid-scene.json',
        ).readAsStringSync(),
      );
      final document = const DatasetReader().read(input);
      var measures = 0;
      final scene = GeometrySnapshot.compile(document, (_, _) {
        measures++;
        return const Size(10, 10);
      });
      final cells = scene.nodes
          .where((value) => value.target.row != null)
          .toList();
      expect(cells.length, greaterThan(9000));
      expect(measures, lessThan(1000));
      expect(scene.nodes.length, document.targets.length);
      expect(scene.bounds!.isFinite, true);
    },
  );
}
