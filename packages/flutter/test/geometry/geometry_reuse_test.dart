import 'dart:ui';
import 'package:conalog_patch_map/src/api/target.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/geometry/geometry_snapshot.dart';
import 'package:conalog_patch_map/src/geometry/item_layout.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, Object?> changed(
  Map<String, Object?> data,
  Map<String, Object?> patch,
) => Map.unmodifiable({...data, ...patch});
Map<String, Object?> item(String id) => {
  'type': 'item',
  'id': id,
  'size': 40,
  'components': [
    {'type': 'background', 'id': 'bg', 'source': {}},
    {'type': 'bar', 'id': 'bar', 'source': {}, 'size': 20},
    {'type': 'text', 'id': 'text', 'text': '123', 'margin': 2},
  ],
};
ComponentLayout text(GeometrySnapshot snapshot, String id) =>
    snapshot[id]!.item!.components.singleWhere((c) => c.id == 'text');
Size measure(Map<String, Object?> data, Size? _) =>
    Size((data['text']! as String).length * 4, 8);

void main() {
  test(
    'placement reuses fixed attrs without accumulating translation error',
    () {
      for (final attrs in <Map<String, Object?>>[
        {},
        {'x': .1, 'y': -.2, 'angle': 137, 'scaleX': -2, 'scaleY': .3},
        {'x': 1e16, 'y': -1e16, 'rotation': .7, 'scaleX': 0},
        {'x': -3, 'y': 7, 'angle': 90, 'scaleY': 0},
      ]) {
        final source = item('i');
        (source['components']! as List)[1]['attrs'] = attrs;
        var current = GeometrySnapshot.compile(
          const DatasetReader().read([source]),
          measure,
        );
        for (final height in [1, 35, 8, 20]) {
          final old = current['i']!.item!.components[1];
          final next = changed(old.data, {
            'size': {'width': 20, 'height': height},
            'placement': height.isEven ? 'top' : 'bottom',
          });
          current = current.prepare({
            const PatchMapTarget('i', componentId: 'bar'): next,
          }, measure).snapshot;
          final prepared = current['i']!.item!;
          final actual = prepared.components[1];
          final fresh = ItemLayout.prepareComponentValues(
            next,
            prepared.size,
            prepared.content,
            actual.upright,
            measure,
          );
          expect(actual.box, fresh.box);
          expect(actual.transform.sameTransform(fresh.transform), true);
        }
      }
    },
  );

  test(
    'same-size text updates data while retaining box transform world and bounds',
    () {
      final before = GeometrySnapshot.compile(
        const DatasetReader().read([item('i')]),
        measure,
      );
      final old = text(before, 'i');
      var calls = 0;
      final change = before.prepare(
        {
          const PatchMapTarget('i', componentId: 'text'): changed(old.data, {
            'text': '456',
          }),
        },
        (data, content) {
          calls++;
          return measure(data, content);
        },
      );
      final after = change.snapshot, next = text(after, 'i');
      expect(calls, 1);
      expect(next.data['text'], '456');
      expect(old.data['text'], '123');
      expect(identical(old, next), false);
      expect(identical(old.box, next.box), true);
      expect(identical(old.transform, next.transform), true);
      expect(identical(before['i']!.world, after['i']!.world), true);
      expect(identical(before['i']!.bounds, after['i']!.bounds), true);
      expect(
        identical(before['i']!.paintBounds, after['i']!.paintBounds),
        true,
      );
      expect(before['i']!.item!.sameEnvelope(after['i']!.item!), true);
    },
  );
  test(
    'paint-only changes skip measurement while margin/content/style remain dependencies',
    () {
      final before = GeometrySnapshot.compile(
        const DatasetReader().read([item('i')]),
        measure,
      );
      final old = text(before, 'i');
      for (final patch in <Map<String, Object?>>[
        {'tint': 'red'},
        {'show': false},
        {'placement': 'top'},
        {
          'attrs': {'x': 20, 'angle': 30},
        },
      ]) {
        var calls = 0;
        final after = before.prepare(
          {
            const PatchMapTarget('i', componentId: 'text'): changed(
              old.data,
              patch,
            ),
          },
          (d, c) {
            calls++;
            return measure(d, c);
          },
        );
        expect(calls, 0, reason: '$patch');
        expect(
          text(after.snapshot, 'i').data,
          containsPair(patch.keys.single, patch.values.single),
        );
      }
      for (final patch in <Map<String, Object?>>[
        {
          'margin': {'top': 4, 'right': 2, 'bottom': 2, 'left': 2},
        },
        {'text': '456'},
        {'split': 1},
        {
          'style': {...old.data['style']! as Map, 'fontSize': 20},
        },
      ]) {
        var calls = 0;
        before.prepare(
          {
            const PatchMapTarget('i', componentId: 'text'): changed(
              old.data,
              patch,
            ),
          },
          (d, c) {
            calls++;
            return measure(d, c);
          },
        );
        expect(calls, 1, reason: '$patch');
      }
      var calls = 0;
      before.prepare(
        {
          const PatchMapTarget('i'): changed(before['i']!.data, {
            'padding': {'top': 2, 'right': 2, 'bottom': 2, 'left': 2},
          }),
        },
        (d, c) {
          calls++;
          return measure(d, c);
        },
      );
      expect(calls, 1);
    },
  );

  test(
    'overflow placement rotation visibility upright and order invalidate envelope',
    () {
      final before = GeometrySnapshot.compile(
        const DatasetReader().read([item('i')]),
        measure,
      );
      final old = text(before, 'i');
      for (final patch in <Map<String, Object?>>[
        {'text': '12345678901234567890'},
        {'placement': 'top'},
        {
          'attrs': {'x': 50, 'angle': 45},
        },
        {'show': false},
        {
          'attrs': {'zIndex': -1},
        },
      ]) {
        final after = before.prepare({
          const PatchMapTarget('i', componentId: 'text'): changed(
            old.data,
            patch,
          ),
        }, measure).snapshot;
        expect(
          before['i']!.item!.sameEnvelope(after['i']!.item!),
          false,
          reason: '$patch',
        );
        expect(
          identical(before['i']!.paintBounds, after['i']!.paintBounds),
          false,
        );
      }
      final after = before.prepare({
        const PatchMapTarget('i'): changed(before['i']!.data, {
          'contentOrientation': 'follow-item',
        }),
      }, measure).snapshot;
      expect(before['i']!.item!.sameEnvelope(after['i']!.item!), false);
    },
  );
  test(
    'group label and noninherited attrs do not reproject or measure descendants',
    () {
      final doc = const DatasetReader().read([
        {
          'type': 'group',
          'id': 'g',
          'children': [
            for (var i = 0; i < 100; i++)
              {'type': 'text', 'id': 't$i', 'text': '123'},
          ],
        },
      ]);
      var calls = 0;
      Size measured(Map<String, Object?> d, Size? c) {
        calls++;
        return measure(d, c);
      }

      final before = GeometrySnapshot.compile(doc, measured);
      calls = 0;
      final after = before.prepare({
        const PatchMapTarget('g'): changed(before['g']!.data, {
          'label': 'new',
          'attrs': {'x': 0, 'domain': 'updated'},
        }),
      }, measured);
      expect(calls, 0);
      expect(after.changed.length, 1);
      for (var i = 0; i < 100; i++) {
        expect(identical(before['t$i'], after.snapshot['t$i']), true);
      }
      expect(identical(before.prepare({}, measured).snapshot, before), true);
    },
  );
  test(
    'actual inherited transform show alpha lock propagates without text remeasurement',
    () {
      final before = GeometrySnapshot.compile(
        const DatasetReader().read([
          {
            'type': 'group',
            'id': 'g',
            'children': [
              {'type': 'text', 'id': 't', 'text': '123'},
            ],
          },
        ]),
        measure,
      );
      for (final patch in <Map<String, Object?>>[
        {
          'attrs': {'x': 20, 'angle': 30},
        },
        {'show': false},
        {
          'attrs': {'alpha': .5},
        },
        {'locked': true},
      ]) {
        var calls = 0;
        final after = before.prepare(
          {const PatchMapTarget('g'): changed(before['g']!.data, patch)},
          (d, c) {
            calls++;
            return measure(d, c);
          },
        );
        expect(after.changed.length, 2);
        expect(identical(before['t'], after.snapshot['t']), false);
        expect(calls, 0);
        expect(
          identical(before['t']!.localBounds, after.snapshot['t']!.localBounds),
          true,
        );
        if (patch.containsKey('show')) {
          expect(after.snapshot['t']!.visible, false);
        }
        if (patch.containsKey('locked')) {
          expect(after.snapshot['t']!.locked, true);
        }
        if ((patch['attrs'] as Map?)?.containsKey('alpha') == true) {
          expect(after.snapshot['t']!.opacity, .5);
        }
        if ((patch['attrs'] as Map?)?.containsKey('x') == true) {
          expect(after.snapshot['t']!.bounds, isNot(before['t']!.bounds));
        }
      }
    },
  );
  test(
    'grid gap propagation retains local item layout and updates cell pitch',
    () {
      final before = GeometrySnapshot.compile(
        const DatasetReader().read([
          {
            'type': 'grid',
            'id': 'g',
            'cells': [
              [1, 1],
            ],
            'gap': 4,
            'item': {
              'size': 40,
              'components': [
                {'type': 'text', 'id': 'text', 'text': '123'},
              ],
            },
          },
        ]),
        measure,
      );
      var calls = 0;
      final after = before.prepare(
        {
          const PatchMapTarget('g'): changed(before['g']!.data, {
            'gap': {'x': 10, 'y': 4},
          }),
        },
        (d, c) {
          calls++;
          return measure(d, c);
        },
      );
      expect(calls, 0);
      expect(after.changed.length, 3);
      expect(after.snapshot['g.0.1']!.bounds!.left, 50);
      expect(before['g.0.1']!.bounds!.left, 44);
      expect(
        identical(before['g.0.1']!.item, after.snapshot['g.0.1']!.item),
        true,
      );
    },
  );
  test(
    'label parent plus changed child still measures and projects child once',
    () {
      final before = GeometrySnapshot.compile(
        const DatasetReader().read([
          {
            'type': 'group',
            'id': 'g',
            'children': [
              {'type': 'text', 'id': 't', 'text': '123'},
            ],
          },
        ]),
        measure,
      );
      var calls = 0;
      final after = before.prepare(
        {
          const PatchMapTarget('g'): changed(before['g']!.data, {
            'label': 'next',
          }),
          const PatchMapTarget('t'): changed(before['t']!.data, {
            'text': '123456',
          }),
        },
        (d, c) {
          calls++;
          return measure(d, c);
        },
      );
      expect(calls, 1);
      expect(after.changed.length, 2);
      expect(after.snapshot['t']!.bounds!.width, 24);
    },
  );
  test(
    '10k same-size text changes share old geometric bounds without sharing data',
    () {
      final before = GeometrySnapshot.compile(
        const DatasetReader().read([
          {
            'type': 'grid',
            'id': 'g',
            'cells': List.generate(100, (_) => List.filled(100, 1)),
            'item': {
              'size': 40,
              'components': [
                {'type': 'text', 'id': 'text', 'text': '123'},
              ],
            },
          },
        ]),
        measure,
      );
      var calls = 0;
      final change = before.prepare(
        {
          for (var r = 0; r < 100; r++)
            for (var c = 0; c < 100; c++)
              PatchMapTarget('g.$r.$c', componentId: 'text'): changed(
                text(before, 'g.$r.$c').data,
                {'text': '456'},
              ),
        },
        (d, c) {
          calls++;
          return measure(d, c);
        },
      );
      expect(calls, 10000);
      expect(change.changed.length, 10000);
      for (final node in change.changed.values) {
        final old = before[node.id]!;
        expect(identical(node.bounds, old.bounds), true);
        expect(identical(node.paintBounds, old.paintBounds), true);
        expect(identical(node.world, old.world), true);
        expect(text(change.snapshot, node.id).data['text'], '456');
      }
    },
  );
}
