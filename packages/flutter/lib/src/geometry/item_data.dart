import 'dart:collection';

import 'item_layout.dart';

/// Read-only effective item data. Layout owns the latest component records;
/// their authored-order list is derived only when a consumer asks for it.
final class ItemDataView extends UnmodifiableMapBase<String, Object?> {
  factory ItemDataView(Map<String, Object?> owner, ItemLayout layout) {
    if (owner is ItemDataView) {
      if (identical(owner._layout, layout)) return owner;
      return ItemDataView._(owner._owner, layout);
    }
    return ItemDataView._(owner, layout);
  }

  ItemDataView._(this._owner, this._layout);
  final Map<String, Object?> _owner;
  ItemLayout? _layout;
  List<Object?>? _components;

  @override
  Object? operator [](Object? key) =>
      key == 'components' ? _components ??= _projectComponents() : _owner[key];

  List<Object?> _projectComponents() {
    final layout = _layout!;
    final values = List<Object?>.filled(layout.components.length, null);
    for (final component in layout.components) {
      values[layout.sourceIndices[component.id]!] = component.data;
    }
    // This local list has no mutable alias outside its read-only wrapper.
    final result = UnmodifiableListView(values);
    _layout = null;
    return result;
  }

  /// External objects retain JSON values, never a renderer's item layout.
  Map<String, Object?> exportData() {
    this['components'];
    return this;
  }

  @override
  Iterable<String> get keys => _owner.keys;
  @override
  int get length => _owner.length;
  @override
  bool containsKey(Object? key) => _owner.containsKey(key);
}

Map<String, Object?> exportItemData(Map<String, Object?> data) =>
    data is ItemDataView ? data.exportData() : data;
