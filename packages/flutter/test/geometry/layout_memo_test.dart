import 'dart:ui';

import 'package:conalog_patch_map/src/api/target.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/geometry/affine.dart';
import 'package:conalog_patch_map/src/geometry/geometry_snapshot.dart';
import 'package:conalog_patch_map/src/geometry/item_layout.dart';
import 'package:flutter_test/flutter_test.dart';

const _owner = PatchMapTarget('item');
const _bar = PatchMapTarget('item', componentId: 'bar');
const _text = PatchMapTarget('item', componentId: 'text');

GeometrySnapshot _scene() => GeometrySnapshot.compile(
  const DatasetReader().read([
    {
      'type': 'item',
      'id': 'item',
      'size': {'width': 100, 'height': 80},
      'padding': 10,
      'contentOrientation': 'upright',
      'components': [
        {'type': 'background', 'id': 'bg', 'source': {}},
        {
          'type': 'bar',
          'id': 'bar',
          'source': {},
          'size': {'width': '100%', 'height': '25%'},
          'placement': 'bottom',
        },
        {
          'type': 'text',
          'id': 'text',
          'text': 'old',
          'placement': 'right-bottom',
          'margin': 2,
        },
      ],
    },
  ]),
  (_, _) => const Size(12, 10),
);

ComponentLayout _component(ItemLayout layout, String id) =>
    layout.components.singleWhere((c) => c.id == id);

Map<String, Object?> _tallerBar(GeometrySnapshot snapshot) => Map.unmodifiable({
  ..._component(snapshot['item']!.item!, 'bar').data,
  'size': {'width': '100%', 'height': '50%'},
});

ItemLayout _validate(
  GeometrySnapshot before,
  ComponentLayoutMemo memo,
  Map<String, Object?> bar, {
  Map<String, Object?>? text,
}) => ItemLayout.compile(
  {
    ...before['item']!.data,
    'components': [
      for (final component in before['item']!.item!.components)
        switch (component.id) {
          'bar' => bar,
          'text' => text ?? component.data,
          _ => component.data,
        },
    ],
  },
  (_, _) => Size.zero,
  memo: memo,
);

void main() {
  test(
    'preparation reuses checked bars but measures text beyond validation placeholder',
    () {
      final before = _scene(), memo = ComponentLayoutMemo();
      final bar = _tallerBar(before);
      final text = Map<String, Object?>.unmodifiable({
        ..._component(before['item']!.item!, 'text').data,
        'text': 'a longer value',
      });
      final validation = _validate(before, memo, bar, text: text);
      expect(_component(validation, 'text').box.size, Size.zero);
      var measured = 0;
      final after = before
          .prepare({_bar: bar, _text: text}, (data, content) {
            measured++;
            expect(data['text'], 'a longer value');
            expect(content, const Size(80, 60));
            return const Size(28, 14);
          }, layoutsMemo: memo)
          .snapshot['item']!
          .item!;
      expect(measured, 1);
      expect(_component(after, 'bar'), same(_component(validation, 'bar')));
      expect(_component(after, 'bar').box, const Rect.fromLTWH(10, 40, 80, 30));
      expect(
        _component(after, 'text').box,
        const Rect.fromLTWH(60, 54, 28, 14),
      );
      expect(
        _component(before['item']!.item!, 'text').box.size,
        const Size(12, 10),
      );
    },
  );

  final ownerChanges =
      <String, ({Map<String, Object?> fields, Rect box, bool upright})>{
        'size': (
          fields: {
            'size': {'width': 140, 'height': 80},
            // Keep content fixed to test owner size as an independent key.
            'padding': {'left': 10, 'right': 50, 'top': 10, 'bottom': 10},
          },
          box: const Rect.fromLTWH(10, 40, 80, 30),
          upright: true,
        ),
        'content position': (
          fields: {
            'padding': {'left': 14, 'right': 6, 'top': 10, 'bottom': 10},
          },
          box: const Rect.fromLTWH(14, 40, 80, 30),
          upright: true,
        ),
        'content orientation': (
          fields: {'contentOrientation': 'follow-item'},
          box: const Rect.fromLTWH(10, 40, 80, 30),
          upright: false,
        ),
      };
  for (final entry in ownerChanges.entries) {
    test('admission layout cannot hide later owner ${entry.key} change', () {
      final before = _scene(), memo = ComponentLayoutMemo();
      final bar = _tallerBar(before);
      final checked = _component(_validate(before, memo, bar), 'bar');
      final after = before
          .prepare(
            {
              _owner: Map.unmodifiable({
                ...before['item']!.data,
                ...entry.value.fields,
              }),
              _bar: bar,
            },
            (_, _) => const Size(12, 10),
            layoutsMemo: memo,
          )
          .snapshot['item']!
          .item!;
      final effective = _component(after, 'bar');
      expect(_component(after, 'bg').box, Offset.zero & after.size);
      expect(effective.box, entry.value.box);
      expect(effective.upright, entry.value.upright);
      expect(effective, isNot(same(checked)));
      expect(effective.transform.project(Offset.zero), entry.value.box.topLeft);
      if (!entry.value.upright) {
        final world = Affine.fromAttrs({'rotation': .6});
        expect(
          effective
              .worldTransform(world, 0, after.size)
              .sameTransform(checked.worldTransform(world, 0, after.size)),
          false,
        );
      }
    });
  }

  test('later component data cannot reuse the earlier checked placement', () {
    final before = _scene(), memo = ComponentLayoutMemo();
    final admitted = _tallerBar(before);
    _validate(before, memo, admitted);
    final rebased = Map<String, Object?>.unmodifiable({
      ...admitted,
      'attrs': {'x': 9},
    });
    final after = before
        .prepare(
          {_bar: rebased},
          (_, _) => const Size(12, 10),
          layoutsMemo: memo,
        )
        .snapshot['item']!
        .item!;
    final bar = _component(after, 'bar');
    expect(bar.data, same(rebased));
    expect(bar.box, const Rect.fromLTWH(10, 40, 80, 30));
    expect(bar.transform.project(Offset.zero), const Offset(19, 40));
  });
}
