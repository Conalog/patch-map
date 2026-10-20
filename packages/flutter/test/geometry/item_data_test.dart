import 'dart:collection';
import 'dart:ui';

import 'package:conalog_patch_map/src/api/target.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/geometry/geometry_snapshot.dart';
import 'package:conalog_patch_map/src/geometry/item_data.dart';
import 'package:conalog_patch_map/src/geometry/item_layout.dart';
import 'package:flutter_test/flutter_test.dart';

Size _measure(Map<String, Object?> data, Size? content) =>
    Size((data['text']! as String).length * 4, 8);

GeometrySnapshot _scene() => GeometrySnapshot.compile(
  const DatasetReader().read([
    {
      'type': 'group',
      'id': 'g',
      'children': [
        {
          'type': 'item',
          'id': 'i',
          'size': {'width': 80, 'height': 60},
          'padding': 4,
          'components': [
            {
              'type': 'icon',
              'id': 'a',
              'source': 'a.png',
              'size': '50%',
              'attrs': {'zIndex': 2},
            },
            {
              'type': 'text',
              'id': 'b',
              'text': 'old',
              'attrs': {'zIndex': 1},
            },
            {'type': 'background', 'id': 'bg', 'source': {}},
          ],
        },
      ],
    },
  ]),
  _measure,
);

Map<String, Object?> _component(GeometrySnapshot scene, String id) {
  final item = scene['i']!.item!;
  return item.components[item.indices[id]!].data;
}

Map<String, Object?> _change(
  Map<String, Object?> value,
  Map<String, Object?> fields,
) => Map.unmodifiable({...value, ...fields});

List<Map<String, Object?>> _values(Map<String, Object?> data) =>
    (data['components']! as List).cast<Map<String, Object?>>();

void main() {
  test('component projection is lazy, cached, authored-order and read-only', () {
    final scene = _scene();
    final owner = scene['i']!.data;
    final records = [for (final value in _values(owner)) _ReadGuard(value)];
    final guardedOwner = _ReadGuard({...owner, 'components': records});
    final layout = ItemLayout.compile(guardedOwner, _measure);
    guardedOwner.blocked.add('components');
    records.first.blocked.add('id');
    final view = ItemDataView(guardedOwner, layout);
    expect(view.keys, owner.keys);
    expect(view.length, owner.length);
    expect(view.containsKey('components'), true);
    expect(view.containsKey('missing'), false);
    expect(view['missing'], null);
    expect(view['size'], same(owner['size']));
    expect(ItemDataView(view, layout), same(view));
    // The guarded layout data is first traversed on this explicit request.
    expect(() => view['components'], throwsStateError);
    records.first.blocked.clear();
    final projected = view['components']! as List;
    expect(projected.map((value) => (value as Map)['id']), ['a', 'b', 'bg']);
    for (var i = 0; i < records.length; i++) {
      expect(projected[i], same(records[i]));
      records[i].blocked.add('id');
    }
    expect(view['components'], same(projected));
    expect(view.exportData(), same(view));
    // Materialization releases the layout, including on the external boundary.
    expect(ItemDataView(view, layout), isNot(same(view)));
    expect(() => view['show'] = false, throwsUnsupportedError);
    expect(() => view.clear(), throwsUnsupportedError);
    expect(() => view.remove('size'), throwsUnsupportedError);
    expect(() => view.addAll({'show': false}), throwsUnsupportedError);
    expect(() => view.update('size', (_) => 0), throwsUnsupportedError);
    expect(() => projected[0] = records.first, throwsUnsupportedError);
    expect(() => projected.add(records.first), throwsUnsupportedError);
    expect(() => (projected[0] as Map)['show'] = false, throwsUnsupportedError);
    final minimal = ItemDataView({'components': records}, layout);
    expect(minimal.keys, ['components']);
    expect(minimal.containsKey('id'), false);
    expect(minimal['id'], null);
    expect(minimal.containsKey('type'), false);
    expect(minimal['type'], null);
  });

  test(
    'successive child and owner edits retain latest and older projections',
    () {
      final before = _scene();
      final initialData = before['i']!.data;
      final first = before.prepare({
        const PatchMapTarget('i', componentId: 'a'): _change(
          _component(before, 'a'),
          {'tint': 'red'},
        ),
        const PatchMapTarget('i', componentId: 'b'): _change(
          _component(before, 'b'),
          {'text': 'first'},
        ),
      }, _measure).snapshot;
      final firstData = first['i']!.data;
      expect(firstData, isA<ItemDataView>());
      expect(ItemDataView(firstData, first['i']!.item!), same(firstData));
      final second = first.prepare({
        const PatchMapTarget('i', componentId: 'b'): _change(
          _component(first, 'b'),
          {'text': 'second'},
        ),
      }, _measure).snapshot;
      final secondData = second['i']!.data;
      expect(ItemDataView(secondData, second['i']!.item!), same(secondData));
      final owner = _change(initialData, {
        'label': 'resized',
        'size': {'width': 120, 'height': 100},
      });
      final resized = second.prepare({
        const PatchMapTarget('i'): owner,
        const PatchMapTarget('i', componentId: 'b'): _change(
          _component(second, 'b'),
          {'text': 'third'},
        ),
      }, _measure).snapshot;
      final resizedData = resized['i']!.data;
      expect(resizedData.keys, owner.keys);
      expect(resizedData['label'], 'resized');
      expect(resized['i']!.item!.size, const Size(120, 100));
      expect(_component(resized, 'a')['tint'], 'red');
      expect(
        resized['i']!
            .item!
            .components[resized['i']!.item!.indices['a']!]
            .box
            .size,
        const Size(56, 46),
      );
      expect(_values(resizedData).map((value) => value['id']), [
        'a',
        'b',
        'bg',
      ]);
      expect(_values(resizedData)[0]['tint'], 'red');
      expect(_values(resizedData)[1]['text'], 'third');
      expect(_values(firstData)[1]['text'], 'first');
      expect(_values(secondData)[1]['text'], 'second');
      expect(_values(initialData)[1]['text'], 'old');
      final ownerOnly = resized.prepare({
        const PatchMapTarget('i'): _change(owner, {'label': 'owner-only'}),
      }, _measure).snapshot;
      expect(ownerOnly['i']!.data['label'], 'owner-only');
      expect(_values(ownerOnly['i']!.data)[1]['text'], 'third');
      expect(_values(ownerOnly['i']!.data)[0]['tint'], 'red');
    },
  );

  test(
    'z-order ties use original authored ranks without materializing data',
    () {
      final before = _scene();
      final first = before.prepare({
        const PatchMapTarget('i', componentId: 'a'): _change(
          _component(before, 'a'),
          {
            'attrs': {'zIndex': 1},
          },
        ),
      }, _measure).snapshot;
      expect(first['i']!.item!.components.map((value) => value.id), [
        'bg',
        'a',
        'b',
      ]);
      final second = first.prepare({
        const PatchMapTarget('i', componentId: 'bg'): _change(
          _component(first, 'bg'),
          {
            'attrs': {'zIndex': 1},
          },
        ),
      }, _measure).snapshot;
      expect(second['i']!.item!.components.map((value) => value.id), [
        'a',
        'b',
        'bg',
      ]);
      expect(
        ItemDataView(first['i']!.data, first['i']!.item!),
        same(first['i']!.data),
      );
      expect(
        ItemDataView(second['i']!.data, second['i']!.item!),
        same(second['i']!.data),
      );
      expect(_values(first['i']!.data).map((value) => value['id']), [
        'a',
        'b',
        'bg',
      ]);
      expect(_values(second['i']!.data).map((value) => value['id']), [
        'a',
        'b',
        'bg',
      ]);
    },
  );

  test(
    'inherited world-only changes preserve raw and exported data identities',
    () {
      final before = _scene();
      GeometrySnapshot move(GeometrySnapshot source, int x) => source.prepare({
        const PatchMapTarget('g'): _change(source['g']!.data, {
          'attrs': {'x': x},
        }),
      }, _measure).snapshot;
      final moved = move(before, 10);
      expect(moved['i']!.data, same(before['i']!.data));
      expect(moved['i']!.item, same(before['i']!.item));
      final edited = moved.prepare({
        const PatchMapTarget('i', componentId: 'b'): _change(
          _component(moved, 'b'),
          {'text': 'new'},
        ),
      }, _measure).snapshot;
      final exported = exportItemData(edited['i']!.data);
      final again = move(edited, 20);
      expect(again['i']!.data, same(exported));
      expect(again['i']!.item, same(edited['i']!.item));
      expect(again['i']!.world.project(Offset.zero), const Offset(20, 0));
      expect(_values(exported)[1]['text'], 'new');
    },
  );
}

class _ReadGuard extends MapBase<String, Object?> {
  _ReadGuard(this.valuesMap);
  final Map<String, Object?> valuesMap;
  final blocked = <Object?>{};
  @override
  Object? operator [](Object? key) {
    if (blocked.contains(key)) throw StateError('unexpected read of $key');
    return valuesMap[key];
  }

  @override
  Iterable<String> get keys => valuesMap.keys;
  @override
  void operator []=(String key, Object? value) =>
      throw UnsupportedError('immutable');
  @override
  Object? remove(Object? key) => throw UnsupportedError('immutable');
  @override
  void clear() => throw UnsupportedError('immutable');
}
