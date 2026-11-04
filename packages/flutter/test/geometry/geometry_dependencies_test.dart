import 'dart:ui';

import 'package:conalog_patch_map/src/api/target.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/geometry/geometry_snapshot.dart';
import 'package:conalog_patch_map/src/geometry/scene_geometry.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, Object?> rect(String id, double x) => {
  'type': 'rect',
  'id': id,
  'size': 10,
  'attrs': {'x': x},
};
Map<String, Object?> relation(String id, String from, String to) => {
  'type': 'relations',
  'id': id,
  'links': [
    {'source': from, 'target': to},
  ],
  'style': {'width': 2},
};
GeometrySnapshot compile(List<Object?> values, {MeasureImage? image}) =>
    GeometrySnapshot.compile(
      const DatasetReader().read(values),
      (_, _) => const Size(4, 4),
      measureImage: image,
    );

void main() {
  test(
    'retained relation is the authority for bounds and unaffected relations share identity',
    () {
      final before = compile([
        rect('a', 0),
        rect('b', 100),
        rect('c', 200),
        rect('d', 300),
        relation('r', 'a', 'a'),
        relation('other', 'c', 'd'),
      ]);
      final r = before.relationFor('r')!;
      expect(before['r']!.bounds, r.bounds);
      expect(before['r']!.paintBounds, r.paintBounds);
      expect(before.boundsFor('r'), r.paintBounds);
      expect(before.bounds!.top, lessThan(0));
      final change = before.prepare({
        const PatchMapTarget('a'): Map.unmodifiable({
          ...before['a']!.data,
          'attrs': const <String, Object?>{'x': 40},
        }),
      }, (_, _) => const Size(4, 4));
      expect(change.changed.keys.toSet(), {0, 4});
      expect(change.snapshot.relationFor('r'), isNot(same(r)));
      expect(
        change.snapshot.relationFor('other'),
        same(before.relationFor('other')),
      );
      expect(change.snapshot['other'], same(before['other']));
      expect(change.snapshot.paintSlots, same(before.paintSlots));
      expect(before['a']!.bounds, const Rect.fromLTWH(0, 0, 10, 10));
      expect(before.boundsFor('r'), r.paintBounds);
      expect(change.snapshot.relationFor('missing'), isNull);
    },
  );

  test(
    'ancestor moves update referenced endpoints and container self inclusion stays finite',
    () {
      final before = compile([
        {
          'type': 'group',
          'id': 'g',
          'children': [rect('a', 0), relation('r', 'g', 'b')],
        },
        rect('b', 100),
      ]);
      expect(before.endpointBoundsFor('g'), const Rect.fromLTWH(0, 0, 10, 10));
      expect(before.boundsFor('g')!.right, greaterThan(100));
      final topology = before.topology;
      final after = before.prepare({
        const PatchMapTarget('g'): Map.unmodifiable({
          ...before['g']!.data,
          'attrs': const <String, Object?>{'x': 20},
        }),
      }, (_, _) => const Size(4, 4)).snapshot;
      expect(after.relationFor('r')!.paths.single.worldPoints, [
        const Offset(25, 5),
        const Offset(105, 5),
      ]);
      expect(after.topology, same(topology));
      expect(after.endpointBoundsFor('g'), const Rect.fromLTWH(20, 0, 10, 10));
    },
  );

  test(
    'relation endpoint cycles omit only unresolved relation links and preserve valid links',
    () {
      final snapshot = compile([
        rect('a', 0),
        rect('b', 100),
        {
          'type': 'relations',
          'id': 'r1',
          'links': [
            {'source': 'r2', 'target': 'a'},
            {'source': 'a', 'target': 'b'},
          ],
        },
        relation('r2', 'r1', 'b'),
      ]);
      expect(snapshot.relationFor('r1')!.paths.single.sourceId, 'a');
      expect(snapshot.relationFor('r2')!.paths, isEmpty);
      expect(snapshot['r2']!.bounds, isNull);
      final after = snapshot.prepare({
        const PatchMapTarget('a'): Map.unmodifiable({
          ...snapshot['a']!.data,
          'attrs': const <String, Object?>{'x': 10},
        }),
      }, (_, _) => const Size(4, 4)).snapshot;
      expect(
        after.relationFor('r1')!.paths.single.worldPoints.first,
        const Offset(15, 5),
      );
      expect(after.relationFor('r2')!.paths, isEmpty);
    },
  );

  test(
    'numeric text changes with identical endpoint bounds retain relation geometry',
    () {
      final before = compile([
        {
          'type': 'item',
          'id': 'i',
          'size': 20,
          'components': [
            {'id': 'number', 'type': 'text', 'text': '123'},
          ],
        },
        rect('b', 100),
        relation('r', 'i', 'b'),
      ]);
      final component =
          (before['i']!.data['components']! as List).single
              as Map<String, Object?>;
      final change = before.prepare({
        const PatchMapTarget('i', componentId: 'number'): Map.unmodifiable({
          ...component,
          'text': '456',
        }),
      }, (_, _) => const Size(4, 4));
      expect(change.changed.keys, [0]);
      expect(change.snapshot.relationFor('r'), same(before.relationFor('r')));
    },
  );

  test(
    'intrinsic images preserve top-left nested affine and authored data',
    () {
      final document = const DatasetReader().read([
        {
          'type': 'group',
          'id': 'g',
          'attrs': {'x': 10, 'angle': 90},
          'children': [
            {
              'type': 'image',
              'id': 'image',
              'source': 'image.png',
              'attrs': {'x': 3, 'y': 4, 'scaleX': -2},
            },
          ],
        },
        rect('b', 100),
        relation('r', 'image', 'b'),
      ]);
      var calls = 0;
      final before = GeometrySnapshot.compile(document, (_, _) => Size.zero);
      final origin = before['image']!.world.project(Offset.zero);
      final change = before.reprojectImages(
        ['image'],
        (_, _) => throw StateError('unexpected text'),
        measureImage: (id, data) {
          calls++;
          return const Size(20, 10);
        },
      );
      final after = change.snapshot;
      expect(calls, 1);
      expect(after['image']!.world.project(Offset.zero), origin);
      expect(
        after['image']!.bounds,
        after['image']!.world
            .projectRect(const Rect.fromLTWH(0, 0, 20, 10))
            .bounds,
      );
      expect(after['image']!.localBounds!.size, const Size(20, 10));
      expect(after['image']!.data, same(before['image']!.data));
      expect(after['image']!.data.containsKey('size'), isFalse);
      expect(before['image']!.localBounds!.size, Size.zero);
      expect(after.relationFor('r'), isNot(same(before.relationFor('r'))));
      final noChange = after.reprojectImages(
        ['image'],
        (_, _) => Size.zero,
        measureImage: (_, _) => const Size(20, 10),
      );
      expect(noChange.snapshot, same(after));
      expect(noChange.changed, isEmpty);
      final attrs = after.prepare({
        const PatchMapTarget('image'): Map.unmodifiable({
          ...after['image']!.data,
          'attrs': const <String, Object?>{'x': 7},
        }),
      }, (_, _) => Size.zero).snapshot;
      expect(attrs['image']!.localBounds!.size, const Size(20, 10));
    },
  );

  test(
    'image callbacks skip fixed size and SceneGeometry supports ready intrinsics',
    () {
      final document = const DatasetReader().read([
        {
          'type': 'image',
          'id': 'fixed',
          'source': 'fixed.png',
          'size': {'width': 3, 'height': 4},
        },
        {
          'type': 'image',
          'id': 'intrinsic',
          'source': 'intrinsic.png',
          'attrs': {'x': 20},
        },
      ]);
      var calls = 0;
      Size? image(String id, Map<String, Object?> data) {
        calls++;
        expect(id, 'intrinsic');
        return const Size(8, 6);
      }

      final scene = SceneGeometry.compile(
        document,
        (_, _) => Size.zero,
        measureImage: image,
      );
      expect(calls, 1);
      expect(
        scene.targets['intrinsic']!.bounds,
        const Rect.fromLTWH(20, 0, 8, 6),
      );
      final snapshot = GeometrySnapshot.compile(
        document,
        (_, _) => Size.zero,
        measureImage: image,
      );
      expect(calls, 2);
      expect(
        snapshot
            .reprojectImages(
              ['fixed', 'missing'],
              (_, _) => Size.zero,
              measureImage: (_, _) => throw StateError('fixed-size callback'),
            )
            .snapshot,
        same(snapshot),
      );
    },
  );

  test(
    'one ready image in 10k scene replaces one page and invalid intrinsic tail is atomic',
    () {
      final before = compile([
        {
          'type': 'grid',
          'id': 'grid',
          'cells': List.generate(100, (_) => List.filled(100, 1)),
          'item': {'size': 10},
        },
        {'type': 'image', 'id': 'a', 'source': 'a.png'},
        {'type': 'image', 'id': 'b', 'source': 'b.png'},
      ]);
      final change = before.reprojectImages(
        ['a'],
        (_, _) => throw StateError('unexpected text'),
        measureImage: (_, _) => const Size(40, 30),
      );
      final slot = before.topology.slots['a']!;
      expect(change.changed.keys, [slot]);
      for (var page = 0; page < before.nodes.pages.length; page++) {
        expect(
          identical(
            before.nodes.pages[page],
            change.snapshot.nodes.pages[page],
          ),
          page != slot ~/ before.nodes.pageSize,
        );
      }
      expect(
        () => before.reprojectImages(
          ['a', 'b'],
          (_, _) => Size.zero,
          measureImage: (id, _) =>
              id == 'a' ? const Size(40, 30) : const Size(double.nan, 4),
        ),
        throwsA(isA<DatasetException>()),
      );
      expect(before['a']!.localBounds!.size, Size.zero);
      expect(before['b']!.localBounds!.size, Size.zero);
    },
  );
}
