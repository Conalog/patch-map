import 'dart:convert';
import 'dart:io';
import 'dart:ui';

import 'package:conalog_patch_map/src/api/target.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/geometry/affine.dart';
import 'package:conalog_patch_map/src/geometry/geometry_snapshot.dart';
import 'package:conalog_patch_map/src/geometry/relation_geometry.dart';
import 'package:flutter_test/flutter_test.dart';

GeometrySnapshot scene(List<Object?> values) => GeometrySnapshot.compile(
  const DatasetReader().read(values),
  (_, _) => const Size(8, 6),
);
Map<String, Object?> box(String id, double x, {bool show = true}) => {
  'type': 'rect',
  'id': id,
  'size': 10,
  'show': show,
  'attrs': {'x': x},
};
Map<String, Object?> relation(
  List<Map<String, Object?>> links, {
  Map<String, Object?> style = const {},
  String id = 'r',
  Map<String, Object?> attrs = const {},
}) => {
  'type': 'relations',
  'id': id,
  'links': links,
  'style': style,
  'attrs': attrs,
};
RelationGeometry project(GeometrySnapshot snapshot, [String id = 'r']) =>
    snapshot.relationFor(id)!;

void main() {
  test(
    'executed release JS reference matches straight transformed and self paths',
    () {
      final fixture =
          (jsonDecode(
                    File(
                      'test/geometry/fixtures/relation_reference.json',
                    ).readAsStringSync(),
                  )
                  as Map)['cases']
              as List;
      for (final value in fixture.cast<Map<String, dynamic>>()) {
        final affine = value['affine'] as List;
        final source = value['source'] as Map, target = value['target'] as Map;
        final snapshot = scene([
          box('a', 0),
          box('b', 100),
          relation(
            [
              {'source': source['id'], 'target': target['id']},
            ],
            style: {'width': value['width']},
            attrs: {
              'scaleX': affine[0],
              'scaleY': affine[3],
              'x': affine[4],
              'y': affine[5],
            },
          ),
        ]);
        final geometry = project(snapshot), actual = geometry.paths.single;
        final expected = value['result'] as Map;
        expect(
          [
            for (final p in actual.worldPoints) [p.dx, p.dy],
          ],
          expected['worldPoints'],
          reason: value['name'],
        );
        final local = expected['localPoints'] as List;
        for (var i = 0; i < local.length; i++) {
          expect(
            actual.localPoints[i].dx,
            closeTo((local[i] as List)[0] as num, 1e-10),
          );
          expect(
            actual.localPoints[i].dy,
            closeTo((local[i] as List)[1] as num, 1e-10),
          );
        }
        expect(actual.isSelfLink, value['name'] == 'self');
        expect(() => actual.localPoints.clear(), throwsUnsupportedError);
        expect(() => geometry.paths.clear(), throwsUnsupportedError);
      }
    },
  );

  test(
    'missing or hidden endpoints omit paths without changing admitted links',
    () {
      final snapshot = scene([
        box('a', 0, show: false),
        box('b', 100),
        relation([
          {'source': 'a', 'target': 'b'},
          {'source': 'missing', 'target': 'b'},
        ]),
      ]);
      expect(project(snapshot).paths, isEmpty);
      expect(project(snapshot).paintBounds, isNull);
      expect((snapshot['r']!.data['links']! as List).length, 2);
    },
  );

  test(
    'group and grid endpoints use current shared descendant bounds center',
    () {
      final snapshot = scene([
        {
          'type': 'group',
          'id': 'group',
          'attrs': {'x': 10},
          'children': [box('a', 0), box('b', 20)],
        },
        {
          'type': 'grid',
          'id': 'grid',
          'attrs': {'x': 100},
          'cells': [
            [1, 1],
          ],
          'item': {'size': 10},
        },
        relation([
          {'source': 'group', 'target': 'grid'},
        ]),
      ]);
      expect(project(snapshot).paths.single.worldPoints, [
        const Offset(25, 5),
        const Offset(110, 5),
      ]);
      final moved = snapshot.prepare({
        const PatchMapTarget('b'): Map.unmodifiable({
          ...snapshot['b']!.data,
          'attrs': const <String, Object?>{'x': 40},
        }),
      }, (_, _) => const Size(8, 6)).snapshot;
      expect(
        project(moved).paths.single.worldPoints.first,
        const Offset(35, 5),
      );
      expect(
        project(snapshot).paths.single.worldPoints.first,
        const Offset(25, 5),
      );
    },
  );

  test(
    'reverse dependencies include endpoint ancestors descendants and transitive relations',
    () {
      final snapshot = scene([
        {
          'type': 'group',
          'id': 'group',
          'children': [box('a', 0), box('b', 20)],
        },
        box('other', 100),
        relation([
          {'source': 'a', 'target': 'other'},
        ]),
        relation([
          {'source': 'group', 'target': 'other'},
        ], id: 'containerRelation'),
        relation([
          {'source': 'r', 'target': 'other'},
        ], id: 'dependent'),
        box('unrelated', 200),
      ]);
      final dependencies = RelationDependencies.fromNodes(
        snapshot.topology,
        snapshot.nodes,
      );
      expect(dependencies.affectedIds(['a']), {
        'r',
        'containerRelation',
        'dependent',
      });
      expect(dependencies.affectedIds(['group']), {
        'r',
        'containerRelation',
        'dependent',
      });
      expect(dependencies.affectedIds(['b']), {'containerRelation'});
      expect(dependencies.affectedIds(['r']), {'r', 'dependent'});
      expect(dependencies.affectedIds(['unrelated']), isEmpty);
      expect(
        () => dependencies.affectedIds(['a']).clear(),
        throwsUnsupportedError,
      );
    },
  );

  test('ignored round-cap input retains butt point/path/range projection', () {
    final initial = scene([
      box('a', 0),
      box('b', 100),
      relation([
        {'source': 'a', 'target': 'b'},
      ]),
    ]);
    final snapshot = initial.prepare({
      const PatchMapTarget('r'): Map.unmodifiable({
        ...initial['r']!.data,
        'style': const <String, Object?>{
          'width': 10,
          'color': '#f00',
          'alpha': 1,
          'cap': 'round',
          'join': 'round',
        },
      }),
    }, (_, _) => const Size(8, 6)).snapshot;
    final geometry = project(snapshot);
    expect(geometry.paintBounds, const Rect.fromLTRB(5, 0, 105, 10));
    expect(geometry.contains(const Offset(1, 5)), isFalse);
    expect(
      geometry.contains(const Offset(1, 1)),
      isFalse,
    ); // ignored cap does not extend the body
    expect(
      geometry.segmentEntry(const Offset(-5, 5), const Offset(10, 5)),
      closeTo(2 / 3, 1e-10),
    );
    expect(
      geometry.intersects(
        Affine.identity.projectRect(const Rect.fromLTWH(0, 4, 2, 2)),
      ),
      isFalse,
    );
    expect(
      geometry.intersects(
        Affine.identity.projectRect(const Rect.fromLTWH(0, 0, 1, 1)),
      ),
      isFalse,
    );
  });

  test(
    'relation inverse failure is atomic and ignored options do not fail',
    () {
      final initial = scene([
        box('a', 0),
        box('b', 100),
        relation([
          {'source': 'a', 'target': 'b'},
        ]),
      ]);
      expect(
        () => initial.prepare({
          const PatchMapTarget('r'): Map.unmodifiable({
            ...initial['r']!.data,
            'attrs': const <String, Object?>{'scaleX': 0},
          }),
        }, (_, _) => const Size(8, 6)),
        throwsA(isA<DatasetException>()),
      );
      expect(project(initial).paths.length, 1);
      for (final extra in <Map<String, Object?>>[
        {'alignment': .25},
        {'pixelLine': true},
        {'texture': {}},
        {'matrix': []},
        {'textureSpace': 'local'},
      ]) {
        expect(
          () => initial.prepare({
            const PatchMapTarget('r'): Map.unmodifiable({
              ...initial['r']!.data,
              'style': Map<String, Object?>.unmodifiable({
                ...initial['r']!.data['style']! as Map,
                ...extra,
              }),
            }),
          }, (_, _) => const Size(8, 6)),
          returnsNormally,
        );
      }
    },
  );
}
