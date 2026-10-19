import 'dart:collection';
import 'dart:ui';

import '../dataset/dataset_reader.dart';
import 'affine.dart';
import 'item_layout.dart';
import 'layout.dart';

/// Derived initial geometry, never an alternative authored-data authority.
/// Item-local layout is shared by normalized template identity.
final class SceneGeometry {
  SceneGeometry._(this.targets, this.paintOrder, this.bounds);
  final Map<String, TargetGeometry> targets;
  final List<TargetGeometry> paintOrder;
  final Rect? bounds;

  factory SceneGeometry.compile(
    DatasetDocument document,
    MeasureText measureText,
  ) => _Builder(document, measureText).build();
}

final class TargetGeometry {
  const TargetGeometry({
    required this.target,
    required this.world,
    required this.visible,
    required this.opacity,
    required this.locked,
    required this.bounds,
    required this.paintBounds,
    required this.children,
    this.item,
  });
  final DatasetTarget target;
  final Affine world;
  final bool visible, locked;
  final double opacity;
  final Rect? bounds, paintBounds;
  final ItemLayout? item;
  final List<TargetGeometry> children;
  String get id => target.id;
}

class _Builder {
  _Builder(this.document, this.measureText);
  final DatasetDocument document;
  final MeasureText measureText;
  final _items = HashMap<Map<String, Object?>, ItemLayout>.identity();
  final _targets = <String, TargetGeometry>{};
  final _ordered = <TargetGeometry>[];

  SceneGeometry build() {
    Rect? bounds;
    for (final value in orderedRecords(document.roots)) {
      final node = _element(
        document.targets[value['id']]!,
        Affine.identity,
        true,
        false,
        1,
      );
      if (node.visible) bounds = _union(bounds, node.paintBounds);
    }
    return SceneGeometry._(
      Map.unmodifiable(_targets),
      List.unmodifiable(_ordered),
      bounds,
    );
  }

  TargetGeometry _element(
    DatasetTarget target,
    Affine parent,
    bool parentVisible,
    bool parentLocked,
    double parentOpacity,
  ) {
    final data = target.data;
    final attrs = data['attrs'] as Map<String, Object?>?;
    var local = Affine.fromAttrs(attrs);
    if (target.row != null) {
      final grid = document.targets[target.parentId]!.data;
      final size = fixedSize(data['size']! as Map);
      final gap = grid['gap']! as Map;
      local = Affine.identity.translated(
        target.column! * (size.width + (gap['x']! as num)),
        target.row! * (size.height + (gap['y']! as num)),
      );
    }
    final world = parent.multiply(local);
    if (!world.isFinite) {
      throw DatasetException(
        'INVALID_GEOMETRY',
        target.id,
        'nonfinite world transform',
      );
    }
    final visible = parentVisible && target.active && data['show'] != false;
    final locked = parentLocked || data['locked'] == true;
    final opacity =
        parentOpacity * ((attrs?['alpha'] as num?)?.toDouble() ?? 1);
    final children = <TargetGeometry>[];
    ItemLayout? item;
    Rect? bounds, paintBounds;
    switch (target.type) {
      case 'group':
        final values = (data['children']! as List).cast<Map<String, Object?>>();
        for (final value in orderedRecords(values)) {
          children.add(
            _element(
              document.targets[value['id']]!,
              world,
              visible,
              locked,
              opacity,
            ),
          );
        }
      case 'grid':
        final rows = data['cells']! as List;
        for (var row = 0; row < rows.length; row++) {
          for (var column = 0; column < (rows[row] as List).length; column++) {
            final cell = document.targets['${target.id}.$row.$column'];
            if (cell != null) {
              children.add(_element(cell, world, visible, locked, opacity));
            }
          }
        }
      case 'item':
        item = _items.putIfAbsent(
          data,
          () => ItemLayout.compile(data, measureText),
        );
        bounds = world.projectRect(Offset.zero & item.size).bounds;
        paintBounds = item.paintBounds(world);
      case 'rect':
        bounds = world
            .projectRect(Offset.zero & fixedSize(data['size']! as Map))
            .bounds;
        final stroke = data['stroke'] as Map?;
        final width = (stroke?['width'] as num?)?.toDouble() ?? 0;
        final scale =
            vectorLength(world.a, world.b) + vectorLength(world.c, world.d);
        paintBounds = bounds.inflate(width * scale);
      case 'text':
        final size = measureText(
          data,
          data['size'] == null ? null : fixedSize(data['size']! as Map),
        );
        bounds = world.projectRect(Offset.zero & size).bounds;
        paintBounds = bounds;
      case 'image':
        // Intrinsic-only asynchronous images acquire dimensions on completion.
        final size = data['size'] == null
            ? Size.zero
            : fixedSize(data['size']! as Map);
        bounds = world.projectRect(Offset.zero & size).bounds;
        paintBounds = bounds;
      case 'relations':
        // Endpoint geometry is resolved after all targets exist by its owner.
        break;
    }
    for (final child in children) {
      if (!child.visible) continue;
      bounds = _union(bounds, child.bounds);
      paintBounds = _union(paintBounds, child.paintBounds);
    }
    if (bounds != null) validateBounds(bounds);
    if (paintBounds != null) validateBounds(paintBounds);
    final result = TargetGeometry(
      target: target,
      world: world,
      visible: visible,
      opacity: opacity,
      locked: locked,
      bounds: bounds,
      paintBounds: paintBounds,
      children: List.unmodifiable(children),
      item: item,
    );
    _targets[target.id] = result;
    if (target.type != 'group' && target.type != 'grid') _ordered.add(result);
    return result;
  }
}

Rect? _union(Rect? left, Rect? right) => left == null
    ? right
    : right == null
    ? left
    : left.expandToInclude(right);
