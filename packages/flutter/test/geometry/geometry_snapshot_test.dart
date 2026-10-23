import 'dart:ui';

import 'package:conalog_patch_map/src/api/target.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/geometry/geometry_snapshot.dart';
import 'package:conalog_patch_map/src/geometry/item_layout.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, Object?> _with(
  Map<String, Object?> record,
  Map<String, Object?> fields,
) => Map.unmodifiable({...record, ...fields});

Map<String, Object?> _component(
  GeometrySnapshot snapshot,
  String id,
  String cid,
) => (snapshot[id]!.data['components']! as List)
    .cast<Map<String, Object?>>()
    .singleWhere((value) => value['id'] == cid);

ComponentLayout _layout(GeometrySnapshot snapshot, String id, String cid) =>
    snapshot[id]!.item!.components.singleWhere((value) => value.id == cid);

List<String> _paintIds(GeometrySnapshot snapshot) => [
  for (final slot in snapshot.paintSlots) snapshot.nodes[slot].id,
];

final class _Measurements {
  final texts = <String>[];
  Size call(Map<String, Object?> data, Size? content) {
    final text = data['text']! as String;
    texts.add(text);
    return Size(text.length * 4, 8);
  }
}

void main() {
  test('10k cells retain all but one node and one page for a numeric edit', () {
    final document = const DatasetReader().read([
      {
        'type': 'grid',
        'id': 'grid',
        'cells': List.generate(100, (_) => List.filled(100, 1)),
        'item': {
          'size': 20,
          'components': [
            {'type': 'text', 'id': 'number', 'text': '123'},
          ],
        },
      },
    ]);
    final measure = _Measurements();
    final before = GeometrySnapshot.compile(document, measure.call);
    expect(measure.texts, ['123']);
    measure.texts.clear();
    final change = before.prepare({
      const PatchMapTarget('grid.50.50', componentId: 'number'): _with(
        _component(before, 'grid.50.50', 'number'),
        {'text': '456'},
      ),
    }, measure.call);
    final after = change.snapshot;
    final slot = before.topology.slots['grid.50.50']!;
    expect(change.changed.keys, [slot]);
    expect(measure.texts, ['456']);
    expect(identical(after.topology, before.topology), isTrue);
    expect(identical(after.paintSlots, before.paintSlots), isTrue);
    expect(after.nodes.length, 10001);
    for (var page = 0; page < before.nodes.pages.length; page++) {
      expect(
        identical(before.nodes.pages[page], after.nodes.pages[page]),
        page != slot ~/ before.nodes.pageSize,
      );
    }
    for (var index = 0; index < before.nodes.length; index++) {
      expect(identical(before.nodes[index], after.nodes[index]), index != slot);
    }
    expect(_component(before, 'grid.50.50', 'number')['text'], '123');
    expect(_component(after, 'grid.50.50', 'number')['text'], '456');
    expect(() => change.changed.clear(), throwsUnsupportedError);
  });

  test('bar-only edits reuse text layout without measuring', () {
    final document = const DatasetReader().read([
      {
        'type': 'item',
        'id': 'item',
        'size': 40,
        'components': [
          {'id': 'number', 'type': 'text', 'text': '12'},
          {'id': 'bar', 'type': 'bar', 'source': {}, 'size': '50%'},
        ],
      },
    ]);
    final measure = _Measurements();
    final before = GeometrySnapshot.compile(document, measure.call);
    measure.texts.clear();
    final after = before.prepare({
      const PatchMapTarget('item', componentId: 'bar'): _with(
        _component(before, 'item', 'bar'),
        {'size': 10},
      ),
    }, measure.call).snapshot;
    expect(measure.texts, isEmpty);
    expect(
      identical(
        _layout(before, 'item', 'number').box,
        _layout(after, 'item', 'number').box,
      ),
      isTrue,
    );
    expect(_layout(after, 'item', 'bar').box.size, const Size(10, 10));
  });

  test(
    'later item attributes preserve independently resolved component data',
    () {
      final document = const DatasetReader().read([
        {
          'type': 'item',
          'id': 'item',
          'size': 40,
          'components': [
            {'id': 'number', 'type': 'text', 'text': '12'},
          ],
        },
      ]);
      final measure = _Measurements();
      final before = GeometrySnapshot.compile(document, measure.call);
      final edited = before.prepare({
        const PatchMapTarget('item', componentId: 'number'): _with(
          _component(before, 'item', 'number'),
          {'text': '345'},
        ),
      }, measure.call).snapshot;
      measure.texts.clear();
      final after = edited.prepare({
        const PatchMapTarget('item'): _with(before['item']!.data, {
          'attrs': const <String, Object?>{'x': 17},
        }),
      }, measure.call).snapshot;
      expect(_component(after, 'item', 'number')['text'], '345');
      expect(
        identical(
          _layout(edited, 'item', 'number'),
          _layout(after, 'item', 'number'),
        ),
        isTrue,
      );
      expect(measure.texts, isEmpty);
      expect(after['item']!.world.project(Offset.zero), const Offset(17, 0));
      expect(before['item']!.world.project(Offset.zero), Offset.zero);
    },
  );

  test('parent and descendant edits project once in parent-first order', () {
    final document = const DatasetReader().read([
      {
        'type': 'group',
        'id': 'group',
        'children': [
          {
            'type': 'text',
            'id': 'text',
            'text': '1',
            'attrs': {'x': 3},
          },
          {'type': 'rect', 'id': 'rect', 'size': 10},
        ],
      },
    ]);
    final measure = _Measurements();
    final before = GeometrySnapshot.compile(document, measure.call);
    measure.texts.clear();
    // Deliberately submit the descendant first.
    final change = before.prepare({
      const PatchMapTarget('text'): _with(before['text']!.data, {
        'text': '222',
      }),
      const PatchMapTarget('group'): _with(before['group']!.data, {
        'attrs': const <String, Object?>{'x': 20, 'y': 30},
      }),
    }, measure.call);
    expect(change.changed.keys, [0, 1, 2]);
    expect(measure.texts, ['222']);
    expect(
      change.snapshot['text']!.world.project(Offset.zero),
      const Offset(23, 30),
    );
    expect(
      change.snapshot['rect']!.world.project(Offset.zero),
      const Offset(20, 30),
    );
    expect(before['text']!.world.project(Offset.zero), const Offset(3, 0));
  });

  test('cell dimensions do not change the authored grid pitch', () {
    final document = const DatasetReader().read([
      {
        'type': 'grid',
        'id': 'grid',
        'cells': [
          [1, 1],
          [1, 1],
        ],
        'gap': {'x': 5, 'y': 7},
        'item': {
          'size': {'width': 20, 'height': 30},
        },
      },
    ]);
    final before = GeometrySnapshot.compile(document, (_, _) => Size.zero);
    final resized = before.prepare({
      const PatchMapTarget('grid.0.0'): _with(before['grid.0.0']!.data, {
        'size': const <String, Object?>{'width': 100, 'height': 120},
      }),
    }, (_, _) => Size.zero).snapshot;
    expect(resized['grid.0.0']!.item!.size, const Size(100, 120));
    expect(identical(before['grid.1.1'], resized['grid.1.1']), isTrue);
    final moved = resized.prepare({
      const PatchMapTarget('grid'): _with(before['grid']!.data, {
        'attrs': const <String, Object?>{'x': 10, 'y': 20},
      }),
    }, (_, _) => Size.zero).snapshot;
    expect(moved['grid.0.1']!.world.project(Offset.zero), const Offset(35, 20));
    expect(moved['grid.1.0']!.world.project(Offset.zero), const Offset(10, 57));
    expect(moved['grid.1.1']!.world.project(Offset.zero), const Offset(35, 57));
    expect(moved['grid.0.0']!.item!.size, const Size(100, 120));
  });

  test(
    'nested visibility opacity and locking inherit through a changed parent',
    () {
      final document = const DatasetReader().read([
        {
          'type': 'group',
          'id': 'outer',
          'show': false,
          'locked': true,
          'attrs': {'alpha': .5},
          'children': [
            {
              'type': 'group',
              'id': 'inner',
              'attrs': {'alpha': .4},
              'children': [
                {
                  'type': 'rect',
                  'id': 'child',
                  'size': 10,
                  'attrs': {'alpha': .25},
                },
                {
                  'type': 'rect',
                  'id': 'hidden',
                  'size': 20,
                  'show': false,
                  'locked': true,
                },
              ],
            },
          ],
        },
      ]);
      final before = GeometrySnapshot.compile(document, (_, _) => Size.zero);
      expect(before['child']!.visible, isFalse);
      expect(before['child']!.locked, isTrue);
      expect(before['child']!.opacity, closeTo(.05, 1e-12));
      expect(before.bounds, isNull);
      final after = before.prepare({
        const PatchMapTarget('outer'): _with(before['outer']!.data, {
          'show': true,
          'locked': false,
        }),
      }, (_, _) => Size.zero).snapshot;
      expect(after['child']!.visible, isTrue);
      expect(after['child']!.locked, isFalse);
      expect(after['child']!.opacity, closeTo(.05, 1e-12));
      expect(after['hidden']!.visible, isFalse);
      expect(after['hidden']!.locked, isTrue);
      expect(after.boundsFor('outer'), const Rect.fromLTWH(0, 0, 10, 10));
      expect(after.boundsFor('missing'), isNull);
    },
  );

  test('z-order changes preserve stable slots and sibling scope', () {
    final document = const DatasetReader().read([
      {
        'type': 'group',
        'id': 'group',
        'children': [
          {'type': 'rect', 'id': 'a', 'size': 10},
          {
            'type': 'rect',
            'id': 'b',
            'size': 10,
            'attrs': {'zIndex': 1},
          },
        ],
      },
      {
        'type': 'rect',
        'id': 'c',
        'size': 10,
        'attrs': {'zIndex': 1},
      },
    ]);
    final before = GeometrySnapshot.compile(document, (_, _) => Size.zero);
    final after = before.prepare({
      const PatchMapTarget('a'): _with(before['a']!.data, {
        'attrs': const <String, Object?>{'zIndex': 20},
      }),
    }, (_, _) => Size.zero).snapshot;
    expect(_paintIds(before), ['a', 'b', 'c']);
    expect(_paintIds(after), ['b', 'a', 'c']);
    final raised = after.prepare({
      const PatchMapTarget('group'): _with(after['group']!.data, {
        'attrs': const <String, Object?>{'zIndex': 2},
      }),
    }, (_, _) => Size.zero).snapshot;
    expect(_paintIds(raised), ['c', 'b', 'a']);
    expect(identical(before.topology, raised.topology), isTrue);
    expect(raised.topology.slots, {'group': 0, 'a': 1, 'b': 2, 'c': 3});
    expect(raised.nodes.map((value) => value.id), ['group', 'a', 'b', 'c']);
  });

  test('bounds grow shrink and rotate without changing old publications', () {
    final document = const DatasetReader().read([
      {
        'type': 'rect',
        'id': 'rect',
        'size': {'width': 10, 'height': 20},
      },
    ]);
    final before = GeometrySnapshot.compile(document, (_, _) => Size.zero);
    final grown = before.prepare({
      const PatchMapTarget('rect'): _with(before['rect']!.data, {
        'size': const <String, Object?>{'width': 40, 'height': 60},
      }),
    }, (_, _) => Size.zero).snapshot;
    final shrunk = grown.prepare({
      const PatchMapTarget('rect'): _with(grown['rect']!.data, {
        'size': const <String, Object?>{'width': 4, 'height': 8},
      }),
    }, (_, _) => Size.zero).snapshot;
    final rotated = shrunk.prepare({
      const PatchMapTarget('rect'): _with(shrunk['rect']!.data, {
        'attrs': const <String, Object?>{'x': 10, 'y': 30, 'angle': 90},
      }),
    }, (_, _) => Size.zero).snapshot;
    expect(before.bounds, const Rect.fromLTWH(0, 0, 10, 20));
    expect(grown.bounds, const Rect.fromLTWH(0, 0, 40, 60));
    expect(shrunk.bounds, const Rect.fromLTWH(0, 0, 4, 8));
    expect(rotated.bounds!.left, closeTo(2, 1e-10));
    expect(rotated.bounds!.top, closeTo(30, 1e-10));
    expect(rotated.bounds!.width, closeTo(8, 1e-10));
    expect(rotated.bounds!.height, closeTo(4, 1e-10));
    expect(rotated.boundsFor('rect', paint: false), rotated.bounds);
  });

  test(
    'invalid derived bounds reject the whole candidate and preserve old pages',
    () {
      final document = const DatasetReader().read([
        {'type': 'rect', 'id': 'a', 'size': 10},
        {'type': 'rect', 'id': 'b', 'size': 20},
      ]);
      final before = GeometrySnapshot.compile(document, (_, _) => Size.zero);
      final oldPage = before.nodes.pages.single;
      expect(
        () => before.prepare({
          const PatchMapTarget('a'): _with(before['a']!.data, {
            'attrs': const <String, Object?>{'x': 100},
          }),
          const PatchMapTarget('b'): _with(before['b']!.data, {
            'size': const <String, Object?>{'width': 1e308, 'height': 20},
            'attrs': const <String, Object?>{'scaleX': 1e308},
          }),
        }, (_, _) => Size.zero),
        throwsA(
          isA<DatasetException>().having(
            (value) => value.code,
            'code',
            'INVALID_GEOMETRY',
          ),
        ),
      );
      expect(identical(before.nodes.pages.single, oldPage), isTrue);
      expect(before['a']!.world.project(Offset.zero), Offset.zero);
      expect(before.bounds, const Rect.fromLTWH(0, 0, 20, 20));
      expect(_paintIds(before), ['a', 'b']);
      final empty = before.prepare(
        {},
        (_, _) => throw StateError('unexpected measure'),
      );
      expect(identical(empty.snapshot, before), isTrue);
      expect(empty.changed, isEmpty);
    },
  );
}
