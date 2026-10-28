import 'dart:collection';
import 'dart:math' as math;

/// An immutable indexed sequence sharing unchanged pages between snapshots.
/// Values themselves remain caller-defined; the collection owns its list data.
final class PagedValues<T> extends IterableBase<T> {
  factory PagedValues.fromList(List<T> values, {int pageSize = 128}) {
    if (pageSize <= 0) {
      throw ArgumentError.value(pageSize, 'pageSize', 'must be positive');
    }
    final pages = <List<T>>[
      for (var start = 0; start < values.length; start += pageSize)
        List<T>.unmodifiable(
          values.getRange(start, math.min(start + pageSize, values.length)),
        ),
    ];
    return PagedValues._(UnmodifiableListView(pages), values.length, pageSize);
  }

  PagedValues._(this.pages, this.length, this.pageSize);

  /// Read-only page identities, usable by a renderer's page resource leases.
  final List<List<T>> pages;
  @override
  final int length;
  final int pageSize;

  T operator [](int index) {
    RangeError.checkValidIndex(index, this, 'index', length);
    return pages[index ~/ pageSize][index % pageSize];
  }

  /// Validates every address before copying any page. Equality is identity:
  /// setting the same value object leaves its page and snapshot untouched.
  PagedValues<T> replace(Map<int, T> replacements) {
    for (final index in replacements.keys) {
      RangeError.checkValidIndex(index, this, 'index', length);
    }
    List<List<T>>? next;
    final changed = <int, List<T>>{};
    for (final entry in replacements.entries) {
      final page = entry.key ~/ pageSize;
      final offset = entry.key % pageSize;
      if (identical(pages[page][offset], entry.value)) {
        continue;
      }
      next ??= List<List<T>>.of(pages);
      final values = changed.putIfAbsent(page, () => List<T>.of(pages[page]));
      values[offset] = entry.value;
    }
    if (next == null) {
      return this;
    }
    for (final entry in changed.entries) {
      // Wrapping the private copy does not clone its contents a second time.
      next[entry.key] = UnmodifiableListView(entry.value);
    }
    return PagedValues._(UnmodifiableListView(next), length, pageSize);
  }

  @override
  Iterator<T> get iterator => pages.expand((page) => page).iterator;
}
