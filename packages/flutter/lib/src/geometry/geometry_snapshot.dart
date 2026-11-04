import 'dart:ui';

import '../api/target.dart';
import '../dataset/dataset_reader.dart';
import '../presentation/record_delta.dart';
import 'affine.dart';
import 'item_data.dart';
import 'item_layout.dart';
import 'paged_values.dart';
import 'relation_geometry.dart';
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
    this._endpointBounds,
    this._relationSlots,
    this._relations,
    this._dependencies,
  );

  factory GeometrySnapshot.compile(
    DatasetDocument document,
    MeasureText measure, {
    MeasureImage? measureImage,
  }) {
    final initial = SceneGeometry.compile(
      document,
      measure,
      measureImage: measureImage,
    );
    final topology = GeometryTopology(document);
    final baseNodes = PagedValues<TargetGeometry>.fromList([
      for (final id in topology.ids) initial.targets[id]!,
    ]);
    final dependencies = RelationDependencies.fromNodes(topology, baseNodes);
    final ids = dependencies.relationIds.toList(growable: false);
    final relationSlots = Map<String, int>.unmodifiable({
      for (var i = 0; i < ids.length; i++) ids[i]: i,
    });
    final endpoints = _pageBounds(
      baseNodes,
      paint: false,
      excludeRelations: true,
    );
    final replacements = <int, TargetGeometry>{};
    final relations = <RelationGeometry>[];
    for (final id in relationSlots.keys) {
      final slot = topology.slots[id]!;
      final relation = RelationGeometry.resolve(
        baseNodes[slot],
        targetFor: (id) {
          final target = topology.slots[id];
          return target == null ? null : baseNodes[target];
        },
        endpointBounds: (id) => _rangeBounds(
          baseNodes,
          topology,
          id,
          endpoints,
          paint: false,
          excludeRelations: true,
        ),
      );
      relations.add(relation);
      replacements[slot] = _withRelationBounds(baseNodes[slot], relation);
    }
    final nodes = baseNodes.replace(replacements);
    final paintBounds = _pageBounds(nodes, paint: true);
    // Finite leaves can still span an infinite width/height, including across
    // page boundaries. Reject before replacement acceptance and camera fit.
    final envelope = paintBounds.fold<Rect?>(null, unionBounds);
    if (envelope != null) validateBounds(envelope);
    return GeometrySnapshot._(
      topology,
      nodes,
      List.unmodifiable(
        initial.paintOrder.map((node) => topology.slots[node.id]!),
      ),
      relations.isEmpty ? endpoints : _pageBounds(nodes, paint: false),
      paintBounds,
      endpoints,
      relationSlots,
      PagedValues<RelationGeometry>.fromList(relations),
      dependencies,
    );
  }

  final GeometryTopology topology;
  final PagedValues<TargetGeometry> nodes;
  final List<int> paintSlots;
  final List<Rect?> _bounds, _paintBounds, _endpointBounds;
  final Map<String, int> _relationSlots;
  final PagedValues<RelationGeometry> _relations;
  final RelationDependencies _dependencies;
  RelationGeometry? relationFor(String id) {
    final slot = _relationSlots[id];
    return slot == null ? null : _relations[slot];
  }

  /// Logical endpoint bounds exclude relation paths, like release's endpoint
  /// entity map. This keeps relation cycles/container self-inclusion finite.
  Rect? endpointBoundsFor(String id) {
    final node = this[id];
    if (node == null || node.target.type == 'relations') return null;
    if (!node.isContainer) return node.bounds;
    return _rangeBounds(
      nodes,
      topology,
      id,
      _endpointBounds,
      paint: false,
      excludeRelations: true,
    );
  }

  TargetGeometry? operator [](String id) {
    final slot = topology.slots[id];
    return slot == null ? null : nodes[slot];
  }

  Rect? get bounds => _paintBounds.fold<Rect?>(null, unionBounds);

  Rect? boundsFor(String id, {bool paint = true}) => _rangeBounds(
    nodes,
    topology,
    id,
    paint ? _paintBounds : _bounds,
    paint: paint,
  );

  /// Candidate aggregates read staged envelopes without mutating live nodes.
  GeometrySnapshot stageRetainedBounds(Map<int, Rect?> changed) {
    List<Rect?>? paint;
    for (final page
        in changed.keys.map((slot) => slot ~/ nodes.pageSize).toSet()) {
      Rect? bounds;
      for (var offset = 0; offset < nodes.pages[page].length; offset++) {
        final slot = page * nodes.pageSize + offset, node = nodes[slot];
        if (node.visible && !node.isContainer) {
          bounds = unionBounds(
            bounds,
            changed.containsKey(slot) ? changed[slot] : node.paintBounds,
          );
        }
      }
      if (bounds != _paintBounds[page]) {
        paint ??= List.of(_paintBounds);
        paint[page] = bounds;
      }
    }
    if (paint != null) _validateUpdatedEnvelope(paint, staged: changed);
    return GeometrySnapshot._(
      topology,
      nodes,
      paintSlots,
      _bounds,
      paint == null ? _paintBounds : List.unmodifiable(paint),
      _endpointBounds,
      _relationSlots,
      _relations,
      _dependencies,
    );
  }

  /// Resource readiness changes geometry only. No authored/presentation field
  /// is manufactured, and fixed-size/unknown/non-image IDs need no projection.
  GeometryChange reprojectImages(
    Iterable<String> ids,
    MeasureText measure, {
    required MeasureImage measureImage,
  }) {
    final changes = <PatchMapTarget, Map<String, Object?>>{};
    final sizes = <String, Size?>{};
    for (final id in ids.toSet()) {
      final node = this[id];
      if (node == null ||
          node.target.type != 'image' ||
          node.data['size'] != null) {
        continue;
      }
      final size = measureImage(id, node.data);
      if ((size ?? Size.zero) == node.localBounds?.size) continue;
      sizes[id] = size;
      changes[PatchMapTarget(id)] = node.data;
    }
    return prepare(changes, measure, measureImage: (id, data) => sizes[id]);
  }

  /// Changed input records are already normalized and fully resolved by the
  /// session. Preparation returns a candidate and leaves this snapshot intact.
  GeometryChange prepare(
    Map<PatchMapTarget, Map<String, Object?>> changes,
    MeasureText measure, {
    MeasureImage? measureImage,
    ComponentLayoutMemo? layoutsMemo,
  }) {
    final deltas = <PatchMapTarget, RecordDelta>{};
    for (final entry in changes.entries) {
      final node = this[entry.key.id]!;
      final before = entry.key.componentId == null
          ? node.data
          : node
                .item!
                .components[node.item!.indices[entry.key.componentId]!]
                .data;
      deltas[entry.key] = RecordDelta(
        before: before,
        after: entry.value,
        fields: recordChangedFields(before, entry.value, RecordFields.all),
      );
    }
    return prepareChanges(
      deltas,
      measure,
      measureImage: measureImage,
      layoutsMemo: layoutsMemo,
    );
  }

  GeometryChange prepareChanges(
    Map<PatchMapTarget, RecordDelta> changes,
    MeasureText measure, {
    MeasureImage? measureImage,
    ComponentLayoutMemo? layoutsMemo,
  }) {
    if (changes.isEmpty) return GeometryChange(this, const {});
    final records = <String, Map<String, Object?>>{};
    final fields = <String, int>{};
    final componentChanges = <int, ComponentChanges>{};
    for (final entry in changes.entries) {
      final slot = topology.slots[entry.key.id];
      if (slot == null) {
        throw StateError('admitted geometry target is missing');
      }
      final component = entry.key.componentId;
      if (component == null) {
        records[entry.key.id] = entry.value.after;
        fields[entry.key.id] = entry.value.fields;
      } else {
        final index = nodes[slot].item!.indices[component]!;
        final addressed = componentChanges[slot];
        if (addressed == null) {
          componentChanges[slot] = ComponentChanges.single(index, entry.value);
        } else {
          addressed.add(index, entry.value);
        }
      }
    }
    final nodeFields = <int, int>{};
    final changed = <int, TargetGeometry>{};
    // Page flags are allocated only when an aggregate contribution changes:
    // logical=1, paint=2, nonrelation endpoint=4. Dynamic-only updates share all
    // three immutable aggregate arrays without visiting their page contents.
    Map<int, int>? dirtyBounds;
    void trackBounds(int slot, TargetGeometry after) {
      final before = nodes[slot];
      if (after.isContainer) return;
      var flags = 0;
      if (before.visible != after.visible ||
          after.visible && before.bounds != after.bounds) {
        flags |= after.target.type == 'relations' ? 1 : 5;
      }
      if (before.visible != after.visible ||
          after.visible && before.paintBounds != after.paintBounds) {
        flags |= 2;
      }
      if (flags == 0) return;
      final page = slot ~/ nodes.pageSize;
      final dirty = dirtyBounds ??= {};
      dirty[page] = (dirty[page] ?? 0) | flags;
    }

    var orderChanged = false;
    void project(int slot) {
      if (changed.containsKey(slot)) return;
      final before = nodes[slot], id = before.id;
      late Map<String, Object?> data;
      late final TargetGeometry projected;
      try {
        data = records[id] ?? before.data;
        final parentSlot = topology.parents[slot];
        final parent = parentSlot == null
            ? null
            : changed[parentSlot] ?? nodes[parentSlot];
        final flags = fields[id] ?? 0;
        if (flags != 0) nodeFields[slot] = flags;
        ItemLayout? item;
        if (before.item != null) {
          final addressed =
              componentChanges[slot] ?? const ComponentChanges.empty();
          item = before.item!.update(
            data,
            addressed,
            measure,
            fields: flags,
            memo: layoutsMemo,
          );
          if (item.size == before.item!.size &&
              item.content == before.item!.content &&
              (flags & RecordFields.contentOrientation) == 0 &&
              identical(item.indices, before.item!.indices)) {
            // Empty is an exact dependency hint too; null requests broad work.
            componentChanges[slot] = addressed;
          } else {
            componentChanges.remove(slot);
          }
          if (!identical(data, before.data) || !identical(item, before.item)) {
            data = ItemDataView(data, item);
          }
        }
        // World coordinates depend on the parent frame and grid template pitch,
        // not on this cell's independently updated size or bar dimensions.
        Affine? retainedWorld;
        if (before.item != null &&
            identical(data['attrs'], before.data['attrs'])) {
          final previousParent = parentSlot == null ? null : nodes[parentSlot];
          if (identical(parent?.world, previousParent?.world)) {
            final samePitch =
                before.target.row == null ||
                identical(parent!.data['gap'], previousParent!.data['gap']) &&
                    identical(
                      (parent.data['item']! as Map)['size'],
                      (previousParent.data['item']! as Map)['size'],
                    );
            if (samePitch) retainedWorld = before.world;
          }
        }
        projected = projectTargetGeometry(
          target: before.target,
          data: data,
          measureText: measure,
          measureImage: measureImage,
          parentWorld: parent?.world ?? Affine.identity,
          parentVisible: parent?.visible ?? true,
          parentLocked: parent?.locked ?? false,
          parentOpacity: parent?.opacity ?? 1,
          gridData: parent?.data,
          item: item,
          previous: before,
          retainedWorld: retainedWorld,
          fields: flags,
          componentChanges: componentChanges[slot],
        );
      } on DatasetException catch (error) {
        throw GeometryPreparationFailure(id, error);
      }
      changed[slot] = projected;
      // Relation bounds are resolved below; their temporary projection must
      // not mark an unchanged final relation as dirty.
      if (projected.target.type != 'relations') trackBounds(slot, projected);
      if (_z(before.data) != _z(data)) orderChanged = true;
      if (before.isContainer && _changesInheritance(before, projected)) {
        for (final child in topology.children[slot]) {
          project(child);
        }
      }
    }

    // Parent-first order prevents duplicate subtree projection when a batch
    // changes both a container and one of its descendants.
    final roots = {
      for (final id in records.keys) topology.slots[id]!,
      ...componentChanges.keys,
    }.toList()..sort();
    for (final slot in roots) {
      project(slot);
    }
    // Aggregate nonrelation endpoint pages from the overlay first. Relation
    // compilation reads this same candidate without cloning node pages twice.
    final endpointPages = <int, Rect?>{};
    final dirtyEndpoints = dirtyBounds;
    if (dirtyEndpoints != null) {
      for (final entry in dirtyEndpoints.entries) {
        if ((entry.value & 4) == 0) continue;
        final page = entry.key;
        final bounds = _aggregate(
          [
            for (
              var i = page * nodes.pageSize;
              i < page * nodes.pageSize + nodes.pages[page].length;
              i++
            )
              changed[i] ?? nodes[i],
          ],
          paint: false,
          excludeRelations: true,
        );
        if (bounds != _endpointBounds[page]) endpointPages[page] = bounds;
      }
    }
    TargetGeometry? targetFor(String id) {
      final slot = topology.slots[id];
      return slot == null ? null : changed[slot] ?? nodes[slot];
    }

    final relationChanges = <int, RelationGeometry>{};
    final affected = _dependencies.affectedIds(
      changed.entries
          .where((entry) {
            final before = nodes[entry.key], after = entry.value;
            return after.target.type == 'relations' ||
                before.bounds != after.bounds ||
                before.visible != after.visible;
          })
          .map((entry) => entry.value.id),
    );
    for (final id in affected) {
      final slot = topology.slots[id]!;
      late final RelationGeometry relation;
      try {
        relation = RelationGeometry.resolve(
          targetFor(id)!,
          targetFor: targetFor,
          endpointBounds: (id) {
            final target = targetFor(id);
            if (target == null || target.target.type == 'relations') {
              return null;
            }
            if (!target.isContainer) return target.bounds;
            return _rangeBounds(
              nodes,
              topology,
              id,
              _endpointBounds,
              paint: false,
              excludeRelations: true,
              changes: changed,
              pageOverrides: endpointPages,
            );
          },
        );
      } on DatasetException catch (error) {
        throw _preparationFailure(id, error, changed, roots: roots);
      }
      relationChanges[_relationSlots[id]!] = relation;
      final projected = _withRelationBounds(targetFor(id)!, relation);
      changed[slot] = projected;
      trackBounds(slot, projected);
    }
    final next = nodes.replace(changed);
    List<Rect?>? newBounds, newPaint, newEndpoints;
    if (endpointPages.isNotEmpty) {
      newEndpoints = List<Rect?>.of(_endpointBounds);
      for (final entry in endpointPages.entries) {
        newEndpoints[entry.key] = entry.value;
      }
    }
    final dirtyPages = dirtyBounds;
    if (dirtyPages != null) {
      for (final entry in dirtyPages.entries) {
        final page = entry.key;
        if ((entry.value & 1) != 0) {
          final bounds = _aggregate(next.pages[page], paint: false);
          if (bounds != _bounds[page]) {
            newBounds ??= List<Rect?>.of(_bounds);
            newBounds[page] = bounds;
          }
        }
        if ((entry.value & 2) != 0) {
          final bounds = _aggregate(next.pages[page], paint: true);
          if (bounds != _paintBounds[page]) {
            newPaint ??= List<Rect?>.of(_paintBounds);
            newPaint[page] = bounds;
          }
        }
      }
    }
    if (newPaint != null) {
      _validateUpdatedEnvelope(newPaint, changed: changed, roots: roots);
    }
    final snapshot = GeometrySnapshot._(
      topology,
      next,
      orderChanged ? topology.paintOrder(next) : paintSlots,
      newBounds == null ? _bounds : List.unmodifiable(newBounds),
      newPaint == null ? _paintBounds : List.unmodifiable(newPaint),
      newEndpoints == null ? _endpointBounds : List.unmodifiable(newEndpoints),
      _relationSlots,
      _relations.replace(relationChanges),
      _dependencies,
    );
    return GeometryChange(
      snapshot,
      Map.unmodifiable(changed),
      componentChanges: componentChanges,
      fields: nodeFields,
    );
  }

  void _validateUpdatedEnvelope(
    List<Rect?> pages, {
    Map<int, TargetGeometry> changed = const {},
    Map<int, Rect?> staged = const {},
    Iterable<int> roots = const [],
  }) {
    // Read page summaries only when their contribution changed. No per-item
    // walk or temporary Rects on valid updates; contained bar changes skip this.
    var left = double.infinity, top = double.infinity;
    var right = double.negativeInfinity, bottom = double.negativeInfinity;
    for (final bounds in pages) {
      if (bounds == null) continue;
      if (bounds.left < left) left = bounds.left;
      if (bounds.top < top) top = bounds.top;
      if (bounds.right > right) right = bounds.right;
      if (bounds.bottom > bottom) bottom = bounds.bottom;
    }
    if (left == double.infinity) return;
    final wide = !(right - left).isFinite;
    final tall = !(bottom - top).isFinite;
    if (!wide && !tall) return;
    try {
      validateBounds(Rect.fromLTRB(left, top, right, bottom));
    } on DatasetException catch (error) {
      // The previous envelope was valid. Attribute overflow to a changed leaf
      // extending an offending extreme, never an unchanged neighbour or a
      // companion value-only update. The backend also rolls back its ancestors.
      for (final slot in changed.isEmpty ? staged.keys : changed.keys) {
        final before = nodes[slot], after = changed[slot] ?? before;
        if (!after.visible || after.isContainer) continue;
        final next = staged.containsKey(slot)
            ? staged[slot]
            : after.paintBounds;
        if (next == null) continue;
        final prior = before.visible ? before.paintBounds : null;
        if (wide &&
                (next.left == left &&
                        (prior == null || next.left < prior.left) ||
                    next.right == right &&
                        (prior == null || next.right > prior.right)) ||
            tall &&
                (next.top == top && (prior == null || next.top < prior.top) ||
                    next.bottom == bottom &&
                        (prior == null || next.bottom > prior.bottom))) {
          throw _preparationFailure(
            after.id,
            error,
            changed,
            roots: roots,
            extremes: (
              wide && next.left == left,
              tall && next.top == top,
              wide && next.right == right,
              tall && next.bottom == bottom,
            ),
          );
        }
      }
      rethrow;
    }
  }

  GeometryPreparationFailure _preparationFailure(
    String id,
    DatasetException cause,
    Map<int, TargetGeometry> changed, {
    required Iterable<int> roots,
    (bool, bool, bool, bool)? extremes,
  }) {
    final slot = topology.slots[id]!, before = nodes[slot];
    final after = changed[slot] ?? before;
    if (before.target.type == 'relations' &&
        before.world.sameTransform(after.world) &&
        before.visible == after.visible &&
        (before.data['style']! as Map)['width'] ==
            (after.data['style']! as Map)['width']) {
      // A derived path can overflow even though the endpoint itself is valid.
      // Resolve failure candidates only: sharing a relation does not mean that
      // every moved endpoint contributed to its overflowing extent.
      final candidates = roots.where((root) {
        if (!_dependencies.affectedIds([nodes[root].id]).contains(id)) {
          return false;
        }
        for (var i = root; i < topology.ends[root]; i++) {
          final old = nodes[i], next = changed[i];
          if (next != null &&
              next.target.type != 'relations' &&
              (old.bounds != next.bounds || old.visible != next.visible)) {
            return true;
          }
        }
        return false;
      }).toList();
      // Remove harmless/redundant roots from the diagnostic overlay cumulatively.
      // A single-root rollback is insufficient when several endpoints share an
      // extreme. Nothing in this diagnostic overlay is published.
      final trialChanges = Map<int, TargetGeometry>.of(changed);
      TargetGeometry value(int slot) => trialChanges[slot] ?? nodes[slot];
      for (final candidate in candidates) {
        for (var i = candidate; i < topology.ends[candidate]; i++) {
          trialChanges.remove(i);
        }
        try {
          final trial = RelationGeometry.resolve(
            after,
            targetFor: (id) {
              final slot = topology.slots[id];
              return slot == null ? null : value(slot);
            },
            endpointBounds: (id) {
              final slot = topology.slots[id];
              if (slot == null) return null;
              final target = value(slot);
              if (!target.isContainer) return target.bounds;
              return _aggregate(
                [for (var i = slot + 1; i < topology.ends[slot]; i++) value(i)],
                paint: false,
                excludeRelations: true,
              );
            },
          ).paintBounds;
          if (extremes == null || trial == null) {
            return GeometryPreparationFailure(nodes[candidate].id, cause);
          }
          final actual = after.paintBounds!;
          final (left, top, right, bottom) = extremes;
          if (left && trial.left > actual.left ||
              top && trial.top > actual.top ||
              right && trial.right < actual.right ||
              bottom && trial.bottom < actual.bottom) {
            return GeometryPreparationFailure(nodes[candidate].id, cause);
          }
        } on DatasetException {
          // Other changed roots can still make the derived path invalid.
        }
      }
    }

    return GeometryPreparationFailure(id, cause);
  }
}

/// Identifies the failed projection without changing schema error diagnostics.
/// The backend owns item rollback; geometry never publishes a partial snapshot.
final class GeometryPreparationFailure extends DatasetException {
  GeometryPreparationFailure(this.targetId, DatasetException cause)
    : super(cause.code, cause.path, cause.message);
  final String targetId;
}

final class GeometryChange {
  const GeometryChange(
    this.snapshot,
    this.changed, {
    this.componentChanges = const {},
    this.fields = const {},
  });
  final GeometrySnapshot snapshot;
  final Map<int, TargetGeometry> changed;
  final Map<int, ComponentChanges> componentChanges;
  final Map<int, int> fields;
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
  bool excludeRelations = false,
}) => List.unmodifiable([
  for (final page in nodes.pages)
    _aggregate(page, paint: paint, excludeRelations: excludeRelations),
]);
Rect? _aggregate(
  List<TargetGeometry> nodes, {
  required bool paint,
  bool excludeRelations = false,
}) {
  Rect? bounds;
  for (final node in nodes) {
    if (node.visible &&
        !node.isContainer &&
        (!excludeRelations || node.target.type != 'relations')) {
      bounds = unionBounds(bounds, paint ? node.paintBounds : node.bounds);
    }
  }
  return bounds;
}

Rect? _rangeBounds(
  PagedValues<TargetGeometry> nodes,
  GeometryTopology topology,
  String id,
  List<Rect?> aggregates, {
  required bool paint,
  bool excludeRelations = false,
  Map<int, TargetGeometry> changes = const {},
  Map<int, Rect?> pageOverrides = const {},
}) {
  final start = topology.slots[id];
  if (start == null) return null;
  final end = topology.ends[start];
  Rect? result;
  var index = start;
  while (index < end) {
    final page = index ~/ nodes.pageSize;
    if (index % nodes.pageSize == 0 &&
        index + nodes.pages[page].length <= end) {
      result = unionBounds(
        result,
        pageOverrides.containsKey(page)
            ? pageOverrides[page]
            : aggregates[page],
      );
      index += nodes.pages[page].length;
    } else {
      final node = changes[index] ?? nodes[index];
      index++;
      if (node.visible &&
          !node.isContainer &&
          (!excludeRelations || node.target.type != 'relations')) {
        result = unionBounds(result, paint ? node.paintBounds : node.bounds);
      }
    }
  }
  return result;
}

TargetGeometry _withRelationBounds(
  TargetGeometry node,
  RelationGeometry relation,
) => TargetGeometry(
  target: node.target,
  data: node.data,
  world: node.world,
  visible: node.visible,
  opacity: node.opacity,
  locked: node.locked,
  bounds: relation.bounds,
  paintBounds: relation.paintBounds,
  item: node.item,
  localBounds: node.localBounds,
);

// Data such as labels/extension attrs do not invalidate descendants. Grid pitch
// additionally positions cells and must propagate even with a stable container.
bool _changesInheritance(TargetGeometry before, TargetGeometry after) {
  final a = before.world, b = after.world;
  if (!identical(a, b) ||
      before.visible != after.visible ||
      before.opacity != after.opacity ||
      before.locked != after.locked) {
    return true;
  }
  if (before.target.type != 'grid') return false;
  final oldItem = before.data['item']! as Map;
  final nextItem = after.data['item']! as Map;
  final oldSize = oldItem['size']! as Map, nextSize = nextItem['size']! as Map;
  final oldGap = before.data['gap']! as Map,
      nextGap = after.data['gap']! as Map;
  return oldSize['width'] != nextSize['width'] ||
      oldSize['height'] != nextSize['height'] ||
      oldGap['x'] != nextGap['x'] ||
      oldGap['y'] != nextGap['y'];
}
