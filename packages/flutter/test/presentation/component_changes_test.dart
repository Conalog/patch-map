import 'dart:collection';

import 'package:conalog_patch_map/src/presentation/record_delta.dart';
import 'package:flutter_test/flutter_test.dart';

final class _UnreadRecord extends MapBase<String, Object?> {
  @override
  Object? operator [](Object? key) => throw StateError('raw record read');
  @override
  Iterable<String> get keys => throw StateError('raw record traversal');
  @override
  void operator []=(String key, Object? value) =>
      throw UnsupportedError('read only');
  @override
  Object? remove(Object? key) => throw UnsupportedError('read only');
  @override
  void clear() => throw UnsupportedError('read only');
}

RecordDelta _delta(int fields) => RecordDelta(
  before: _UnreadRecord(),
  after: _UnreadRecord(),
  fields: fields,
);

void main() {
  test(
    'empty hints are constant, exact and distinct from broad null hints',
    () {
      const changes = ComponentChanges.empty();
      expect(changes, same(const ComponentChanges.empty()));
      expect(changes, isEmpty);
      expect(changes.length, 0);
      expect(changes[4], isNull);
      expect(changes.iterator.moveNext(), false);
      expect(() => changes.add(4, _delta(0)), throwsUnsupportedError);
    },
  );

  test(
    'singleton is its own entry and preserves zero-field source retry delta',
    () {
      final delta = _delta(0);
      final changes = ComponentChanges.single(4, delta);
      expect(changes.length, 1);
      expect(changes.isEmpty, false);
      expect(changes.first, same(changes));
      expect(changes.first.index, 4);
      expect(changes.first.delta, same(delta));
      expect(changes[4], same(delta));
      expect(changes[0], isNull);
      final first = changes.iterator, second = changes.iterator;
      expect(first.moveNext(), true);
      expect(second.moveNext(), true);
      expect(first.current, same(second.current));
      expect(first.current, same(changes));
      expect(first.moveNext(), false);
      expect(second.current.delta, same(delta));
    },
  );

  test(
    'two changes append directly and repeated iteration reuses stored entries',
    () {
      final a = _delta(RecordFields.tint), b = _delta(RecordFields.size);
      final changes = ComponentChanges.single(7, a)..add(2, b);
      expect(changes.length, 2);
      expect(changes[7], same(a));
      expect(changes[2], same(b));
      expect(changes[9], isNull);
      final first = changes.toList(), second = changes.toList();
      expect(first.map((entry) => entry.index), [7, 2]);
      expect(second[0], same(first[0]));
      expect(second[1], same(first[1]));
      expect(second[1].delta, same(b));
    },
  );

  test('many lookups and append after indexing retain every original delta', () {
    final deltas = [for (var i = 0; i < 1024; i++) _delta(i)];
    final changes = ComponentChanges.single(0, deltas[0]);
    for (var i = 1; i < deltas.length - 1; i++) {
      changes.add(i, deltas[i]);
    }
    // The first tail lookup materializes its index; later reads reuse it, and
    // append keeps that index current instead of invalidating and rebuilding it.
    expect(changes[1000], same(deltas[1000]));
    changes.add(1023, deltas[1023]);
    for (var pass = 0; pass < 2; pass++) {
      for (var i = 0; i < deltas.length; i++) {
        expect(changes[i], same(deltas[i]));
      }
    }
    expect(changes[1024], isNull);
    final first = changes.toList(), second = changes.toList();
    expect(first.length, deltas.length);
    for (var i = 0; i < deltas.length; i++) {
      expect(first[i].index, i);
      expect(first[i].delta, same(deltas[i]));
      expect(second[i], same(first[i]));
    }
  });
}
