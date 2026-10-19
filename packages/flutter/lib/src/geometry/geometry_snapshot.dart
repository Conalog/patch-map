import 'dart:collection';
import 'dart:ui';

import '../api/target.dart';
import '../dataset/dataset_reader.dart';
import 'affine.dart';
import 'item_layout.dart';
import 'paged_values.dart';
import 'scene_geometry.dart';

/// A retained geometry publication. Immutable pages share unchanged projections;
/// no snapshot keeps a chain of earlier full snapshots alive.
final class GeometrySnapshot {
  GeometrySnapshot._(
    this.topology,
    this.nodes,
    this.paintSlots,
    this._bounds,
    this._paintBounds,
  );

  factory GeometrySnapshot.compile(
    DatasetDocument document,
    MeasureText measure,
  ) {
    final initial = SceneGeometry.compile(document, measure);
    final topology = GeometryTopology(document);
    final nodes = PagedValues<TargetGeometry>.fromList([
      for (final id in topology.ids) initial.targets[id]!,
    ]);
    return GeometrySnapshot._(
      topology,
      nodes,
      List.unmodifiable(
        initial.paintOrder.map((node) => topology.slots[node.id]!),
      ),
      _pageBounds(nodes, paint: false),
      _pageBounds(nodes, paint: true),
    );
  }

  final GeometryTopology topology;
  final PagedValues<TargetGeometry> nodes;
  final List<int> paintSlots;
  final List<Rect?> _bounds, _paintBounds;
  TargetGeometry? operator [](String id) {
    final slot = topology.slots[id];
    return slot == null ? null : nodes[slot];
  }

  Rect? get bounds => _paintBounds.fold<Rect?>(null, unionBounds);

  Rect? boundsFor(String id, {bool paint = true}) {
    final start = topology.slots[id];
    if (start == null) return null;
    final end = topology.ends[start];
    final aggregates = paint ? _paintBounds : _bounds;
    Rect? result;
    var index = start;
    while (index < end) {
      final page = index ~/ nodes.pageSize;
      if (index % nodes.pageSize == 0 &&
          index + nodes.pages[page].length <= end) {
        result = unionBounds(result, aggregates[page]);
        index += nodes.pages[page].length;
      } else {
        final node = nodes[index++];
        if (node.visible && !node.isContainer) {
          result = unionBounds(result, paint ? node.paintBounds : node.bounds);
        }
      }
    }
    return result;
  }

  /// Changed input records are already normalized and fully resolved by the
  /// session. Preparation returns a candidate and leaves this snapshot intact.
  GeometryChange prepare(
    Map<PatchMapTarget, Map<String, Object?>> changes,
    MeasureText measure,
  ) {
    if (changes.isEmpty) return GeometryChange(this, const {});
    final records = <String, Map<String, Object?>>{};
    final components = <String, Map<String, Map<String, Object?>>>{};
    for (final entry in changes.entries) {
      if (!topology.slots.containsKey(entry.key.id)) {
        throw StateError('admitted geometry target is missing');
      }
      final component = entry.key.componentId;
      if (component == null) {
        records[entry.key.id] = entry.value;
      } else {
        (components[entry.key.id] ??= {})[component] = entry.value;
      }
    }
    for (final id in {...records.keys, ...components.keys}) {
      final previous = this[id]!;
      final record = records[id] ?? previous.data;
      if (previous.target.type == 'item') {
        // Element and component presentations have distinct addresses. An
        // element update must not restore its authored component list.
        final old = previous.data['components']! as List;
        final replacements = components[id];
        final values = replacements == null
            ? old
            : [
                for (final value in old.cast<Map<String, Object?>>())
                  replacements[value['id']] ?? value,
              ];
        records[id] = Map.unmodifiable({
          ...record,
          'components': replacements == null
              ? values
              : List.unmodifiable(values),
        });
      }
    }
    final changed = <int, TargetGeometry>{};
    final layouts = HashMap<Map<String, Object?>, ItemLayout>.identity();
    var orderChanged = false;
    void project(int slot) {
      if (changed.containsKey(slot)) return;
      final before = nodes[slot], id = before.id;
      final data = records[id] ?? before.data;
      final parentSlot = topology.parents[slot];
      final parent = parentSlot == null
          ? null
          : changed[parentSlot] ?? nodes[parentSlot];
      ItemLayout? item;
      if (before.item != null) {
        final unchanged = [
          'size',
          'padding',
          'components',
          'contentOrientation',
        ].every((key) => identical(before.data[key], data[key]));
        item = unchanged
            ? before.item
            : layouts.putIfAbsent(
                data,
                () => ItemLayout.compile(data, measure, previous: before.item),
              );
      }
      final projected = projectTargetGeometry(
        target: before.target,
        data: data,
        measureText: measure,
        parentWorld: parent?.world ?? Affine.identity,
        parentVisible: parent?.visible ?? true,
        parentLocked: parent?.locked ?? false,
        parentOpacity: parent?.opacity ?? 1,
        gridData: parent?.data,
        item: item,
        previous: before,
        children: before.children,
      );
      changed[slot] = projected;
      if (_z(before.data) != _z(data)) orderChanged = true;
      if (before.isContainer) {
        for (final child in topology.children[slot]) {
          project(child);
        }
      }
    }

    // Parent-first order prevents duplicate subtree projection when a batch
    // changes both a container and one of its descendants.
    final roots = records.keys.map((id) => topology.slots[id]!).toList()
      ..sort();
    for (final slot in roots) {
      project(slot);
    }
    final next = nodes.replace(changed);
    final newBounds = List<Rect?>.of(_bounds),
        newPaint = List<Rect?>.of(_paintBounds);
    final pages = changed.keys.map((slot) => slot ~/ nodes.pageSize).toSet();
    for (final page in pages) {
      newBounds[page] = _aggregate(next.pages[page], paint: false);
      newPaint[page] = _aggregate(next.pages[page], paint: true);
    }
    final snapshot = GeometrySnapshot._(
      topology,
      next,
      orderChanged ? topology.paintOrder(next) : paintSlots,
      List.unmodifiable(newBounds),
      List.unmodifiable(newPaint),
    );
    return GeometryChange(snapshot, Map.unmodifiable(changed));
  }
}

final class GeometryChange {
  const GeometryChange(this.snapshot, this.changed);
  final GeometrySnapshot snapshot;
  final Map<int, TargetGeometry> changed;
}

/// Structural topology is fixed until replacement. Slots are stable preorder
/// identities, independent of visual sibling z-order.
final class GeometryTopology {
  GeometryTopology(DatasetDocument document) {
    void add(String id, int? parent) {
      final target = document.targets[id]!;
      final slot = _ids.length;
      _slots[id] = slot;
      _ids.add(id);
      _parents.add(parent);
      _ends.add(0);
      _children.add([]);
      final childIds = target.type == 'group'
          ? (target.data['children']! as List).cast<Map<String, Object?>>().map(
              (value) => value['id']! as String,
            )
          : target.type == 'grid'
          ? _gridChildren(document, target)
          : const <String>[];
      for (final child in childIds) {
        _children[slot].add(_ids.length);
        add(child, slot);
      }
      _children[slot] = List.unmodifiable(_children[slot]);
      _ends[slot] = _ids.length;
    }

    for (final root in document.roots) {
      _roots.add(_ids.length);
      add(root['id']! as String, null);
    }
  }
  final _ids = <String>[];
  final _slots = <String, int>{};
  final _parents = <int?>[];
  final _ends = <int>[];
  final _children = <List<int>>[];
  final _roots = <int>[];
  late final ids = List<String>.unmodifiable(_ids);
  late final slots = Map<String, int>.unmodifiable(_slots);
  late final parents = List<int?>.unmodifiable(_parents);
  late final ends = List<int>.unmodifiable(_ends);
  late final children = List<List<int>>.unmodifiable(_children);

  List<int> paintOrder(PagedValues<TargetGeometry> values) {
    final result = <int>[];
    void visit(List<int> siblings) {
      final order = List<int>.of(siblings)
        ..sort((a, b) {
          final compared = _z(values[a].data).compareTo(_z(values[b].data));
          return compared == 0 ? a.compareTo(b) : compared;
        });
      for (final slot in order) {
        if (values[slot].isContainer) {
          visit(children[slot]);
        } else {
          result.add(slot);
        }
      }
    }

    visit(_roots);
    return List.unmodifiable(result);
  }
}

Iterable<String> _gridChildren(
  DatasetDocument document,
  DatasetTarget grid,
) sync* {
  final rows = grid.data['cells']! as List;
  for (var r = 0; r < rows.length; r++) {
    for (var c = 0; c < (rows[r] as List).length; c++) {
      final id = '${grid.id}.$r.$c';
      if (document.targets.containsKey(id)) yield id;
    }
  }
}

double _z(Map<String, Object?> record) =>
    ((record['attrs'] as Map?)?['zIndex'] as num?)?.toDouble() ?? 0;
List<Rect?> _pageBounds(
  PagedValues<TargetGeometry> nodes, {
  required bool paint,
}) => List.unmodifiable([
  for (final page in nodes.pages) _aggregate(page, paint: paint),
]);
Rect? _aggregate(List<TargetGeometry> nodes, {required bool paint}) {
  Rect? bounds;
  for (final node in nodes) {
    if (node.visible && !node.isContainer) {
      bounds = unionBounds(bounds, paint ? node.paintBounds : node.bounds);
    }
  }
  return bounds;
}
