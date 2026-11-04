import 'dart:ui';

import 'package:conalog_patch_map/src/api/target.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/geometry/affine.dart';
import 'package:conalog_patch_map/src/geometry/geometry_snapshot.dart';
import 'package:conalog_patch_map/src/interaction/input_query.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, Object?> _rect(String id, double x, int z) => {
  'type': 'rect',
  'id': id,
  'size': 10,
  'attrs': {'x': x, 'zIndex': z},
};

GeometrySnapshot _scene() => GeometrySnapshot.compile(
  const DatasetReader().read([
    _rect('back', 0, 0),
    {
      'type': 'group',
      'id': 'group',
      'attrs': {'zIndex': 1},
      'children': [_rect('middle', 0, 0), _rect('front', 0, 1)],
    },
    _rect('later', 40, 2),
    _rect('outside', 200, 3),
  ]),
  (_, _) => Size.zero,
);

final _range = Affine.identity.projectRect(const Rect.fromLTWH(-5, -5, 60, 20));

InputQuery _query({required bool full}) => InputQuery(
  ports: InputQueryPorts(
    getSpatialCandidates: (snapshot, _) {
      final slots = snapshot.topology.slots;
      // Both paths deliberately receive duplicates and arbitrary index order.
      // Full candidates also include the non-interactive group and a miss.
      return full
          ? [
              ...List.generate(snapshot.nodes.length, (i) => i).reversed,
              slots['front']!,
              slots['group']!,
            ]
          : [
              slots['middle']!,
              slots['later']!,
              slots['back']!,
              slots['front']!,
              slots['back']!,
            ];
    },
  ),
);

void main() {
  for (final full in [false, true]) {
    final path = full ? 'full' : 'sparse';
    test('$path candidates preserve overlap and segment encounter order', () {
      final snapshot = _scene(), query = _query(full: full);
      final filtered = <String>[];
      query.filter = (object) {
        filtered.add(object.id);
        return true;
      };
      expect(query.point(snapshot, const Offset(5, 5), 0)!.id, 'front');
      expect(filtered, ['front']);
      filtered.clear();
      final range = query.range(snapshot, _range, 0);
      expect(range.map((object) => object.id), [
        'later',
        'front',
        'middle',
        'back',
      ]);
      expect(filtered, ['later', 'front', 'middle', 'back']);
      expect(() => range.clear(), throwsUnsupportedError);
      filtered.clear();
      final segment = query.segment(
        snapshot,
        const Offset(-5, 5),
        const Offset(55, 5),
        0,
      );
      expect(segment.map((object) => object.id), [
        'front',
        'middle',
        'back',
        'later',
      ]);
      // Filter judgments precede encounter ordering and run only once per hit.
      expect(filtered, ['later', 'front', 'middle', 'back']);
      expect(() => segment.clear(), throwsUnsupportedError);
    });

    test(
      '$path candidates preserve rejected and throwing filter judgments',
      () {
        final snapshot = _scene(), query = _query(full: full);
        final filtered = <String>[];
        query.filter = (object) {
          filtered.add(object.id);
          if (object.id == 'front') return false;
          if (object.id == 'middle') throw StateError('judgment');
          return true;
        };
        expect(query.point(snapshot, const Offset(5, 5), 0)!.id, 'back');
        expect(filtered, ['front', 'middle', 'back']);
        filtered.clear();
        expect(query.range(snapshot, _range, 0).map((object) => object.id), [
          'later',
          'back',
        ]);
        expect(filtered, ['later', 'front', 'middle', 'back']);
        filtered.clear();
        expect(
          query
              .segment(snapshot, const Offset(-5, 5), const Offset(55, 5), 0)
              .map((object) => object.id),
          ['back', 'later'],
        );
        expect(filtered, ['later', 'front', 'middle', 'back']);
      },
    );

    test('$path candidates use paint order from each geometry publication', () {
      final before = _scene(), query = _query(full: full);
      expect(query.point(before, const Offset(5, 5), 0)!.id, 'front');
      final after = before.prepare({
        const PatchMapTarget('back'): Map.unmodifiable({
          ...before['back']!.data,
          'attrs': const <String, Object?>{'zIndex': 5},
        }),
      }, (_, _) => Size.zero).snapshot;
      expect(after.paintSlots, isNot(same(before.paintSlots)));
      expect(query.point(after, const Offset(5, 5), 0)!.id, 'back');
      expect(query.range(after, _range, 0).map((object) => object.id), [
        'back',
        'later',
        'front',
        'middle',
      ]);
      expect(
        query
            .segment(after, const Offset(-5, 5), const Offset(55, 5), 0)
            .map((object) => object.id),
        ['back', 'front', 'middle', 'later'],
      );
      // Reading a retained publication and resetting both rebuild its rank.
      expect(query.point(before, const Offset(5, 5), 0)!.id, 'front');
      query.reset();
      expect(query.point(after, const Offset(5, 5), 0)!.id, 'back');
    });
  }
}
