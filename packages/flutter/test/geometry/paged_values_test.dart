import 'dart:collection';

import 'package:conalog_patch_map/src/geometry/paged_values.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('fromList detaches caller lists and exposes nested read-only pages', () {
    final input = [1, 2, 3, 4, 5];
    final values = PagedValues.fromList(input, pageSize: 2);
    input[0] = 99;
    input.clear();
    expect(values.length, 5);
    expect(values.pageSize, 2);
    expect(values.pages, [
      [1, 2],
      [3, 4],
      [5],
    ]);
    expect(values.toList(), [1, 2, 3, 4, 5]);
    expect(() => values.pages.clear(), throwsUnsupportedError);
    expect(() => values.pages[0] = [9], throwsUnsupportedError);
    expect(() => values.pages.first.add(6), throwsUnsupportedError);
    expect(() => values.pages.first[0] = 9, throwsUnsupportedError);
  });

  test('10000-value single replacement shares every unchanged page', () {
    final input = List.generate(10000, (index) => _Value(index));
    final before = PagedValues.fromList(input);
    final replacement = _Value(-1);
    const index = 5555;
    final after = before.replace({index: replacement});
    expect(after.length, 10000);
    expect(after.pages.length, 79);
    expect(identical(after.pages, before.pages), false);
    expect(identical(after[index], replacement), true);
    expect(identical(before[index], input[index]), true);
    expect(before[index].value, index);
    for (var page = 0; page < before.pages.length; page++) {
      expect(
        identical(after.pages[page], before.pages[page]),
        page != index ~/ 128,
      );
    }
    for (var i = 0; i < before.length; i++) {
      if (i != index) expect(identical(after[i], before[i]), true);
    }
  });

  test('several changes in one page produce one new public page identity', () {
    final before = PagedValues.fromList(List.generate(300, _Value.new));
    final after = before.replace({
      0: _Value(-1),
      1: _Value(-2),
      127: _Value(-3),
    });
    expect(after.pages.first.map((value) => value.value).take(2), [-1, -2]);
    expect(after[127].value, -3);
    expect(identical(after.pages.first, before.pages.first), false);
    expect(identical(after.pages[1], before.pages[1]), true);
    expect(identical(after.pages[2], before.pages[2]), true);
    expect(before[0].value, 0);
    expect(before[127].value, 127);
    expect(() => after.pages.first[0] = _Value(0), throwsUnsupportedError);
  });

  test(
    'all-value replacement replaces each page while preserving prior snapshot',
    () {
      final before = PagedValues.fromList(List.generate(10000, _Value.new));
      final replacements = {
        for (var i = 0; i < before.length; i++) i: _Value(-i - 1),
      };
      final after = before.replace(replacements);
      for (var page = 0; page < before.pages.length; page++) {
        expect(identical(after.pages[page], before.pages[page]), false);
        expect(after.pages[page].length, before.pages[page].length);
      }
      for (var i = 0; i < before.length; i++) {
        expect(identical(after[i], replacements[i]), true);
        expect(before[i].value, i);
      }
      replacements.clear();
      expect(after.last.value, -10000);
    },
  );

  test(
    'empty and identical assignments preserve snapshot and page identities',
    () {
      final before = PagedValues.fromList(List.generate(10000, _Value.new));
      expect(identical(before.replace({}), before), true);
      final replacements = {
        for (var i = 0; i < before.length; i++) i: before[i],
      };
      final after = before.replace(replacements);
      expect(identical(after, before), true);
      expect(identical(after.pages, before.pages), true);
      expect(identical(after.pages.last, before.pages.last), true);
    },
  );

  test('equal but nonidentical values count as replacements', () {
    final old = _EqualValue(1);
    final next = _EqualValue(1);
    expect(old == next, true);
    final before = PagedValues.fromList([old]);
    final after = before.replace({0: next});
    expect(identical(after, before), false);
    expect(identical(after[0], next), true);
    expect(identical(before[0], old), true);
  });

  test('invalid tail index rejects before reading any replacement value', () {
    final before = PagedValues.fromList(List.generate(10000, _Value.new));
    final originalPages = before.pages;
    final replacements = _ObservedMap<_Value>({
      0: _Value(-1),
      10000: _Value(-2),
    });
    expect(() => before.replace(replacements), throwsRangeError);
    expect(replacements.valueReads, 0);
    expect(identical(before.pages, originalPages), true);
    expect(before[0].value, 0);
    expect(before.last.value, 9999);
    expect(() => before.replace({-1: _Value(-1)}), throwsRangeError);
  });

  test(
    'subsequent snapshots share pages directly and never modify predecessors',
    () {
      final original = PagedValues.fromList(List.generate(400, _Value.new));
      final first = original.replace({0: _Value(-1)});
      final second = first.replace({200: _Value(-2)});
      expect(identical(second.pages[0], first.pages[0]), true);
      expect(identical(second.pages[2], original.pages[2]), true);
      expect(second[0].value, -1);
      expect(second[200].value, -2);
      expect(first[200].value, 200);
      expect(original[0].value, 0);
      expect(original[200].value, 200);
    },
  );

  test(
    'iteration and indexing handle page boundaries and reject invalid indices',
    () {
      final values = PagedValues.fromList(List.generate(260, (i) => i));
      expect(values[0], 0);
      expect(values[127], 127);
      expect(values[128], 128);
      expect(values[259], 259);
      expect(values, List.generate(260, (i) => i));
      expect(() => values[-1], throwsRangeError);
      expect(() => values[260], throwsRangeError);
    },
  );

  test(
    'empty snapshots and custom page sizes have valid detached structure',
    () {
      final empty = PagedValues<int>.fromList([]);
      expect(empty.length, 0);
      expect(empty.pages, isEmpty);
      expect(empty.toList(), isEmpty);
      expect(identical(empty.replace({}), empty), true);
      expect(() => empty[0], throwsRangeError);
      expect(() => empty.replace({0: 1}), throwsRangeError);
      expect(() => PagedValues.fromList([1], pageSize: 0), throwsArgumentError);
      expect(
        () => PagedValues.fromList([1], pageSize: -1),
        throwsArgumentError,
      );
      expect(PagedValues.fromList([1, 2, 3], pageSize: 1).pages, [
        [1],
        [2],
        [3],
      ]);
    },
  );
}

class _Value {
  const _Value(this.value);
  final int value;
}

class _EqualValue {
  const _EqualValue(this.value);
  final int value;
  @override
  bool operator ==(Object other) =>
      other is _EqualValue && value == other.value;
  @override
  int get hashCode => value.hashCode;
}

class _ObservedMap<T> extends MapBase<int, T> {
  _ObservedMap(this._values);
  final Map<int, T> _values;
  var valueReads = 0;
  @override
  Iterable<int> get keys => _values.keys;
  @override
  T? operator [](Object? key) {
    valueReads++;
    return _values[key];
  }

  @override
  void operator []=(int key, T value) => _values[key] = value;
  @override
  void clear() => _values.clear();
  @override
  T? remove(Object? key) => _values.remove(key);
}
