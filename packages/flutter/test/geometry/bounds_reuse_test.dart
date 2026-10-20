import 'dart:ui';

import 'package:conalog_patch_map/src/api/target.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/geometry/geometry_snapshot.dart';
import 'package:conalog_patch_map/src/geometry/affine.dart';
import 'package:conalog_patch_map/src/geometry/scene_geometry.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, Object?> changed(
  Map<String, Object?> before,
  Map<String, Object?> patch,
) => Map.unmodifiable({...before, ...patch});
Size measure(Map<String, Object?> data, Size? content) =>
    Size((data['text']! as String).length * 4, 8);
Map<String, Object?> component(GeometrySnapshot scene, String id, String cid) =>
    (scene[id]!.data['components']! as List)
        .cast<Map<String, Object?>>()
        .singleWhere((value) => value['id'] == cid);
Map<String, Object?> item(String id) => {
  'type': 'item',
  'id': id,
  'size': 40,
  'padding': 3,
  'components': [
    {'type': 'background', 'id': 'bg', 'source': {}},
    {'type': 'bar', 'id': 'bar', 'source': {}, 'size': '50%'},
    {'type': 'text', 'id': 'text', 'text': '12'},
  ],
};
GeometrySnapshot compile(List<Object?> data) =>
    GeometrySnapshot.compile(const DatasetReader().read(data), measure);
GeometrySnapshot gridScene() => compile([
  {
    'type': 'group',
    'id': 'group',
    'attrs': <String, Object?>{'x': 11, 'y': 17, 'angle': 27, 'scaleX': 1.2},
    'children': [
      {
        'type': 'grid',
        'id': 'grid',
        'attrs': <String, Object?>{'x': 5, 'y': 9, 'angle': -13},
        'gap': {'x': 4, 'y': 7},
        'cells': [
          [1, 1],
          [1, 1],
        ],
        'item': item('template')
          ..remove('type')
          ..remove('id'),
      },
    ],
  },
]);

// Recompute through the general projection path, without retainedWorld or a
// previous node, against the candidate's actual parent/grid state.
void expectGeneralProjection(GeometrySnapshot scene, String id) {
  final node = scene[id]!;
  final slot = scene.topology.slots[id]!;
  final parentSlot = scene.topology.parents[slot];
  final parent = parentSlot == null ? null : scene.nodes[parentSlot];
  final general = projectTargetGeometry(
    target: node.target,
    data: node.data,
    measureText: measure,
    parentWorld: parent?.world ?? Affine.identity,
    parentVisible: parent?.visible ?? true,
    parentOpacity: parent?.opacity ?? 1,
    parentLocked: parent?.locked ?? false,
    gridData: parent?.data,
    item: node.item,
    children: node.children,
  );
  expect(node.world.sameTransform(general.world), isTrue, reason: id);
  expect(node.bounds, general.bounds, reason: id);
  expect(node.paintBounds, general.paintBounds, reason: id);
  expect(node.visible, general.visible, reason: id);
  expect(node.opacity, general.opacity, reason: id);
  expect(node.locked, general.locked, reason: id);
}

void main() {
  test('container and relation bounds span unchanged and dirty pages', () {
    final before = compile([
      {
        'type': 'group',
        'id': 'g',
        'children': [
          for (var i = 0; i < 300; i++)
            {
              ...item('i$i'),
              'attrs': {'x': i * 50},
            },
        ],
      },
      {
        'type': 'rect',
        'id': 'outside',
        'size': 20,
        'attrs': {'y': 100},
      },
      {
        'type': 'relations',
        'id': 'r',
        'links': [
          {'source': 'g', 'target': 'outside'},
        ],
      },
    ]);
    final moved = before.prepare({
      const PatchMapTarget('i299'): changed(before['i299']!.data, {
        'attrs': <String, Object?>{'x': 15050},
      }),
      const PatchMapTarget('i1', componentId: 'bar'): changed(
        component(before, 'i1', 'bar'),
        {'size': '90%'},
      ),
    }, measure).snapshot;
    const bounds = Rect.fromLTWH(0, 0, 15090, 40);
    expect(moved.endpointBoundsFor('g'), bounds);
    expect(moved.boundsFor('g', paint: false), bounds);
    expect(
      moved.relationFor('r')!.paths.single.worldPoints.first,
      bounds.center,
    );
    final hidden = moved.prepare({
      const PatchMapTarget('g'): changed(moved['g']!.data, {'show': false}),
    }, measure).snapshot;
    expect(hidden.endpointBoundsFor('g'), isNull);
    expect(hidden.relationFor('r')!.paths, isEmpty);
    expect(hidden.bounds, const Rect.fromLTWH(0, 100, 20, 20));
  });
  test('bar-only pages reuse logical paint and endpoint aggregate objects', () {
    final before = gridScene();
    final after = before.prepare({
      for (final id in ['grid.0.0', 'grid.0.1', 'grid.1.0', 'grid.1.1'])
        PatchMapTarget(id, componentId: 'bar'): changed(
          component(before, id, 'bar'),
          {
            'size': {'width': '100%', 'height': '90%'},
            'tint': '#e74c3c',
          },
        ),
    }, measure).snapshot;
    expect(after.bounds, same(before.bounds));
    expect(
      after.boundsFor('group', paint: false),
      same(before.boundsFor('group', paint: false)),
    );
    expect(
      after.endpointBoundsFor('group'),
      same(before.endpointBoundsFor('group')),
    );
    for (final id in ['grid.0.0', 'grid.0.1', 'grid.1.0', 'grid.1.1']) {
      expect(after[id]!.world, same(before[id]!.world));
      expectGeneralProjection(after, id);
    }
  });

  test('changed interior bounds retain unchanged page aggregate objects', () {
    final before = compile([
      {
        'type': 'group',
        'id': 'g',
        'children': [
          {'type': 'rect', 'id': 'anchor', 'size': 100},
          {
            ...item('i'),
            'attrs': <String, Object?>{'x': 20, 'y': 20},
          },
        ],
      },
    ]);
    final after = before.prepare({
      const PatchMapTarget('i'): changed(before['i']!.data, {
        'attrs': <String, Object?>{'x': 30, 'y': 30},
      }),
    }, measure).snapshot;
    expect(after['i']!.bounds, isNot(before['i']!.bounds));
    expect(after.bounds, same(before.bounds));
    expect(
      after.boundsFor('g', paint: false),
      same(before.boundsFor('g', paint: false)),
    );
    expect(after.endpointBoundsFor('g'), same(before.endpointBoundsFor('g')));
  });

  test(
    'retained cell world follows actual parent frame pitch and cell attrs',
    () {
      final before = gridScene();
      final grid = before['grid']!.data;
      final cases = <Map<PatchMapTarget, Map<String, Object?>>>[
        {
          const PatchMapTarget('group'): changed(before['group']!.data, {
            'attrs': <String, Object?>{
              'x': 30,
              'y': 21,
              'angle': 61,
              'scaleX': -1.1,
            },
          }),
        },
        {
          const PatchMapTarget('grid'): changed(grid, {
            'gap': {'x': 23, 'y': 19},
          }),
        },
        {
          const PatchMapTarget('grid'): changed(grid, {
            'item': changed((grid['item']! as Map).cast<String, Object?>(), {
              'size': {'width': 53, 'height': 61},
            }),
          }),
        },
        {
          const PatchMapTarget('grid.1.1'): changed(before['grid.1.1']!.data, {
            'size': {'width': 70, 'height': 90},
          }),
        },
        {
          const PatchMapTarget('grid.1.1'): changed(before['grid.1.1']!.data, {
            'attrs': <String, Object?>{'x': 6, 'y': 8, 'angle': 90},
          }),
        },
        {
          const PatchMapTarget('group'): changed(before['group']!.data, {
            'show': false,
            'locked': true,
            'attrs': <String, Object?>{
              ...before['group']!.data['attrs']! as Map<String, Object?>,
              'alpha': .25,
            },
          }),
        },
      ];
      for (final fields in cases) {
        // Descendant first: projection must still use the changed parent in the
        // same batch. A cell's own size does not change authored grid pitch.
        final after = before.prepare({
          const PatchMapTarget('grid.1.1', componentId: 'bar'): changed(
            component(before, 'grid.1.1', 'bar'),
            {'size': '80%'},
          ),
          ...fields,
        }, measure).snapshot;
        for (final id in ['grid.0.0', 'grid.0.1', 'grid.1.0', 'grid.1.1']) {
          expectGeneralProjection(after, id);
        }
      }
    },
  );

  test('equal bounds do not prove an unchanged parent world', () {
    final before = compile([
      {
        'type': 'group',
        'id': 'g',
        'children': [item('i')],
      },
    ]);
    final after = before.prepare({
      const PatchMapTarget('i', componentId: 'bar'): changed(
        component(before, 'i', 'bar'),
        {'size': '90%'},
      ),
      const PatchMapTarget('g'): changed(before['g']!.data, {
        'attrs': <String, Object?>{
          'x': 40,
          'y': 40,
          'scaleX': -1,
          'scaleY': -1,
        },
      }),
    }, measure).snapshot;
    expect(after['i']!.bounds, before['i']!.bounds);
    expect(after['i']!.world, isNot(same(before['i']!.world)));
    expect(after['i']!.world.project(Offset.zero), const Offset(40, 40));
    expectGeneralProjection(after, 'i');
  });

  test('discarded preparation cannot supply a later retry world or bounds', () {
    final before = gridScene();
    final bar = changed(component(before, 'grid.0.0', 'bar'), {'size': '80%'});
    final discarded = before.prepare({
      const PatchMapTarget('grid.0.0', componentId: 'bar'): bar,
      const PatchMapTarget('grid.1.1'): changed(before['grid.1.1']!.data, {
        'attrs': <String, Object?>{'x': 90, 'angle': 45},
        'size': {'width': 70, 'height': 90},
      }),
    }, measure).snapshot;
    // A resource failure can discard that candidate and prepare only successful
    // items again against the previous valid publication.
    final retry = before.prepare({
      const PatchMapTarget('grid.0.0', componentId: 'bar'): bar,
    }, measure).snapshot;
    expect(
      discarded['grid.1.1']!.world,
      isNot(same(before['grid.1.1']!.world)),
    );
    expect(retry['grid.1.1'], same(before['grid.1.1']));
    expect(retry.bounds, same(before.bounds));
    expectGeneralProjection(retry, 'grid.0.0');
  });

  test(
    'paint overflow leaves endpoints stable and logical moves refresh relations',
    () {
      final before = compile([
        {
          'type': 'group',
          'id': 'g',
          'children': [item('i')],
        },
        {
          'type': 'rect',
          'id': 'b',
          'size': 20,
          'attrs': <String, Object?>{'x': 100},
        },
        {
          'type': 'relations',
          'id': 'r',
          'links': [
            {'source': 'g', 'target': 'b'},
          ],
        },
      ]);
      final overflow = before.prepare({
        const PatchMapTarget('i', componentId: 'text'): changed(
          component(before, 'i', 'text'),
          {'text': '1234567890123456789012345678901234567890'},
        ),
      }, measure).snapshot;
      expect(overflow['i']!.bounds, same(before['i']!.bounds));
      expect(overflow['i']!.paintBounds, isNot(before['i']!.paintBounds));
      expect(overflow.endpointBoundsFor('g'), before.endpointBoundsFor('g'));
      expect(overflow.relationFor('r'), same(before.relationFor('r')));
      final moved = overflow.prepare({
        const PatchMapTarget('g'): changed(overflow['g']!.data, {
          'attrs': <String, Object?>{'x': 60, 'y': 30},
        }),
      }, measure).snapshot;
      expect(moved.endpointBoundsFor('g'), const Rect.fromLTWH(60, 30, 40, 40));
      expect(
        moved.relationFor('r')!.paths.single.worldPoints.first,
        const Offset(80, 50),
      );
      final hidden = moved.prepare({
        const PatchMapTarget('g'): changed(moved['g']!.data, {'show': false}),
      }, measure).snapshot;
      expect(hidden.endpointBoundsFor('g'), isNull);
      expect(hidden.relationFor('r')!.paths, isEmpty);
      expect(hidden.bounds, const Rect.fromLTWH(100, 0, 20, 20));
    },
  );

  test(
    'rejected candidate leaves retained world and aggregates usable for retry',
    () {
      final before = gridScene();
      final bounds = before.bounds;
      expect(
        () => before.prepare({
          const PatchMapTarget('grid.0.0', componentId: 'bar'): changed(
            component(before, 'grid.0.0', 'bar'),
            {'size': '80%'},
          ),
          const PatchMapTarget('grid.1.1'): changed(before['grid.1.1']!.data, {
            'attrs': <String, Object?>{'scaleX': 1e308},
            'size': {'width': 1e308, 'height': 40},
          }),
        }, measure),
        throwsA(isA<DatasetException>()),
      );
      final retry = before.prepare({
        const PatchMapTarget('grid.0.0', componentId: 'bar'): changed(
          component(before, 'grid.0.0', 'bar'),
          {'size': '80%'},
        ),
      }, measure).snapshot;
      expect(before.bounds, same(bounds));
      expect(retry.bounds, same(bounds));
      expect(retry['grid.1.1'], same(before['grid.1.1']));
      expectGeneralProjection(retry, 'grid.0.0');
    },
  );
}
