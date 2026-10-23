import 'dart:collection';
import 'dart:ui';

import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/api/target.dart';
import 'package:conalog_patch_map/src/geometry/geometry_snapshot.dart';
import 'package:conalog_patch_map/src/geometry/item_layout.dart';
import 'package:conalog_patch_map/src/presentation/record_delta.dart';
import 'package:flutter_test/flutter_test.dart';

/// A read witness: pointer-list copying is allowed, inspecting unrelated
/// component data during an update is not.
class _GuardedRecord extends MapBase<String, Object?> {
  _GuardedRecord(this.value);
  final Map<String, Object?> value;
  bool readable = true;
  @override
  Object? operator [](Object? key) {
    if (!readable) throw StateError('Unrelated component read: $key');
    return value[key];
  }

  @override
  Iterable<String> get keys {
    if (!readable) throw StateError('Unrelated component traversal');
    return value.keys;
  }

  @override
  void operator []=(String key, Object? value) =>
      throw UnsupportedError('read');
  @override
  Object? remove(Object? key) => throw UnsupportedError('read');
  @override
  void clear() => throw UnsupportedError('read');
}

void main() {
  final document = const DatasetReader().read([
    {
      'type': 'item',
      'id': 'i',
      'size': {'width': 100, 'height': 80},
      'padding': 10,
      'components': [
        {'type': 'background', 'id': 'bg', 'source': {}},
        {
          'type': 'bar',
          'id': 'bar',
          'source': {},
          'size': {'width': '100%', 'height': '25%'},
          'placement': 'bottom',
        },
        {'type': 'text', 'id': 'text', 'text': '12'},
      ],
    },
  ]);
  for (final field in ['tint', 'size']) {
    test('$field update never reads sibling records', () {
      final data = document.targets['i']!.data;
      final records = (data['components']! as List)
          .cast<Map<String, Object?>>()
          .map(_GuardedRecord.new)
          .toList();
      final owner = {...data, 'components': records};
      final before = ItemLayout.compile(owner, (_, _) => const Size(15, 10));
      final bar = before.components[before.indices['bar']!];
      final next = Map<String, Object?>.unmodifiable({
        ...bar.data,
        if (field == 'tint') 'tint': '#ff0000',
        if (field == 'size') 'size': {'width': '100%', 'height': '50%'},
      });
      records[0].readable = records[2].readable = false;
      final after = before.update(
        owner,
        ComponentChanges.single(
          before.indices['bar']!,
          RecordDelta(
            before: bar.data,
            after: next,
            fields: field == 'tint' ? RecordFields.tint : RecordFields.size,
          ),
        ),
        (_, _) => throw StateError('Unrelated text measurement'),
        fields: 0,
      );
      expect(after.components[0], isNot(same(before.components[0])));
      expect(after.components[0].data, same(before.components[0].data));
      expect(after.components[0].box, same(before.components[0].box));
      expect(
        after.components[0].transform,
        same(before.components[0].transform),
      );
      expect(after.components[2], isNot(same(before.components[2])));
      expect(after.components[2].data, same(before.components[2].data));
      expect(after.components[2].box, same(before.components[2].box));
      expect(
        after.components[2].transform,
        same(before.components[2].transform),
      );
      expect(after.indices, same(before.indices));
      expect(after.sourceIndices, same(before.sourceIndices));
      expect(after.size, same(before.size));
      expect(after.content, same(before.content));
      expect(
        before.sameEnvelope(
          after,
          changed: ComponentChanges.single(
            before.indices['bar']!,
            RecordDelta(
              before: bar.data,
              after: next,
              fields: RecordFields.size,
            ),
          ),
        ),
        isTrue,
      );
      if (field == 'tint') {
        expect(after.components[1].box, same(bar.box));
        expect(after.components[1].transform, same(bar.transform));
      } else {
        expect(after.components[1].box, const Rect.fromLTWH(10, 40, 80, 30));
        expect(bar.box, const Rect.fromLTWH(10, 55, 80, 15));
      }
    });
  }

  test(
    'geometry shares addressed deltas and publishes read-only record views',
    () {
      final before = GeometrySnapshot.compile(
        document,
        (_, _) => const Size(15, 10),
      );
      final bar =
          before['i']!.item!.components[before['i']!.item!.indices['bar']!];
      final next = Map<String, Object?>.unmodifiable({
        ...bar.data,
        'tint': '#ff0000',
      });
      final delta = RecordDelta(
        before: bar.data,
        after: next,
        fields: RecordFields.tint,
      );
      final requests = <PatchMapTarget, RecordDelta>{
        const PatchMapTarget('i', componentId: 'bar'): delta,
      };
      final change = before.prepareChanges(
        requests,
        (_, _) => throw StateError('Unrelated text measurement'),
      );
      final hints = change.componentChanges.values.single;
      expect(hints.map((entry) => entry.index), [1]);
      expect(hints[1], same(delta));
      requests.clear();
      expect(hints[1], same(delta));
      final data = change.snapshot['i']!.data;
      expect(() => data['padding'] = 0, throwsUnsupportedError);
      expect(
        () => (data['components']! as List)[0] = {},
        throwsUnsupportedError,
      );
      expect(before['i']!.data, same(document.targets['i']!.data));
      expect(bar.data['tint'], isNot('#ff0000'));
      expect((data['components']! as List)[1], same(next));
    },
  );

  test('slot hints preserve empty owner and inherited dependencies', () {
    final nested = const DatasetReader().read([
      {'type': 'group', 'id': 'g', 'children': document.roots},
    ]);
    final before = GeometrySnapshot.compile(
      nested,
      (_, _) => const Size(15, 10),
    );
    final group = before['g']!.data, owner = before['i']!.data;
    final slot = before.topology.slots['i']!;
    final inherited = before.prepareChanges({
      const PatchMapTarget('g'): RecordDelta(
        before: group,
        after: {
          ...group,
          'attrs': <String, Object?>{
            ...(group['attrs'] as Map? ?? const {}),
            'alpha': .5,
          },
        },
        fields: RecordFields.attrsAlpha,
      ),
      const PatchMapTarget('i'): RecordDelta(
        before: owner,
        after: {...owner, 'locked': true},
        fields: RecordFields.locked,
      ),
    }, (_, _) => throw StateError('Unrelated text measurement'));
    expect(inherited.changed.keys, [before.topology.slots['g'], slot]);
    expect(inherited.componentChanges.containsKey(slot), true);
    expect(inherited.componentChanges[slot], isEmpty);
    expect(inherited.snapshot['i']!.opacity, .5);
    expect(inherited.snapshot['i']!.locked, true);
    expect(inherited.snapshot['i']!.item, same(before['i']!.item));
    final bar = before['i']!.item!.components[1].data;
    final barDelta = RecordDelta(
      before: bar,
      after: {...bar, 'tint': 'red'},
      fields: RecordFields.tint,
    );
    final combined = before.prepareChanges({
      const PatchMapTarget('g'): RecordDelta(
        before: group,
        after: {
          ...group,
          'attrs': <String, Object?>{'alpha': .5},
        },
        fields: RecordFields.attrsAlpha,
      ),
      const PatchMapTarget('i', componentId: 'bar'): barDelta,
    }, (_, _) => throw StateError('Unrelated text measurement'));
    expect(combined.changed.length, 2);
    expect(combined.componentChanges[slot]![1], same(barDelta));
    expect(combined.snapshot['i']!.opacity, .5);
    expect(combined.snapshot['i']!.item!.components[1].data['tint'], 'red');
    final resized = before.prepareChanges({
      const PatchMapTarget('i'): RecordDelta(
        before: owner,
        after: {
          ...owner,
          'size': {'width': 120, 'height': 100},
        },
        fields: RecordFields.size,
      ),
    }, (_, _) => const Size(15, 10));
    expect(resized.componentChanges.containsKey(slot), false);
  });

  test(
    'old sorted indices apply before reorder and broad owner invalidation',
    () {
      final before = GeometrySnapshot.compile(
        document,
        (_, _) => const Size(15, 10),
      );
      final owner = before['i']!.data;
      final bar = before['i']!.item!.components[1].data;
      final nextBar = Map<String, Object?>.unmodifiable({
        ...bar,
        'size': {'width': '100%', 'height': '50%'},
        'attrs': <String, Object?>{
          ...(bar['attrs'] as Map? ?? const {}),
          'zIndex': 4,
        },
      });
      final componentDelta = RecordDelta(
        before: bar,
        after: nextBar,
        fields: RecordFields.size | RecordFields.attrsZIndex,
      );
      for (final resize in [false, true]) {
        final change = before.prepareChanges({
          const PatchMapTarget('i', componentId: 'bar'): componentDelta,
          if (resize)
            const PatchMapTarget('i'): RecordDelta(
              before: owner,
              after: {
                ...owner,
                'size': {'width': 120, 'height': 100},
              },
              fields: RecordFields.size,
            ),
        }, (_, _) => const Size(15, 10));
        final after = change.snapshot['i']!;
        expect(after.item!.components.map((c) => c.id), ['bg', 'text', 'bar']);
        expect(after.item!.components[2].data, same(nextBar));
        expect(after.item!.components[2].box.height, resize ? 40 : 30);
        expect(
          change.componentChanges.containsKey(before.topology.slots['i']),
          false,
        );
        expect(before['i']!.item!.components[1].id, 'bar');
        expect(before['i']!.item!.components[1].box.height, 15);
        final authored = (after.data['components']! as List).cast<Map>();
        expect(authored.map((c) => c['id']), ['bg', 'bar', 'text']);
      }
    },
  );

  test('parent content and child update use one final coordinate frame', () {
    final owner = document.targets['i']!.data;
    final before = ItemLayout.compile(owner, (_, _) => const Size(15, 10));
    final bar = before.components[before.indices['bar']!];
    final next = Map<String, Object?>.unmodifiable({
      ...bar.data,
      'size': {'width': '100%', 'height': '50%'},
    });
    var measurements = 0;
    final after = before.update(
      {
        ...owner,
        'size': {'width': 120, 'height': 100},
      },
      ComponentChanges.single(
        before.indices['bar']!,
        RecordDelta(before: bar.data, after: next, fields: RecordFields.size),
      ),
      (_, bounds) {
        measurements++;
        expect(bounds, const Size(100, 80));
        return const Size(15, 10);
      },
      fields: RecordFields.size,
    );
    expect(measurements, 1);
    expect(after.components[0].box, const Rect.fromLTWH(0, 0, 120, 100));
    expect(after.components[1].box, const Rect.fromLTWH(10, 50, 100, 40));
    expect(before.size, const Size(100, 80));
  });
}
