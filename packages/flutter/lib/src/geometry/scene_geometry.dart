import 'dart:collection';
import 'dart:ui';

import '../dataset/dataset_reader.dart';
import '../presentation/record_delta.dart';
import 'affine.dart';
import 'item_layout.dart';
import 'layout.dart';
import 'readable_rect.dart';

/// Intrinsic pixel dimensions only. Asset/native lifetime belongs to the caller.
/// Return null until ready; authored fixed sizes never invoke this callback.
typedef MeasureImage = Size? Function(String id, Map<String, Object?> data);

/// Derived initial geometry, never an alternative authored-data authority.
final class SceneGeometry {
  SceneGeometry._(this.targets, this.paintOrder);
  final Map<String, TargetGeometry> targets;
  final List<TargetGeometry> paintOrder;

  factory SceneGeometry.compile(
    DatasetDocument document,
    MeasureText measureText, {
    MeasureImage? measureImage,
  }) => _Builder(document, measureText, measureImage).build();
}

final class TargetGeometry {
  TargetGeometry({
    required this.target,
    required this.data,
    required this.world,
    required this.visible,
    required this.opacity,
    required this.locked,
    required this.bounds,
    required this.paintBounds,
    this.item,
    this.localBounds,
  });
  final DatasetTarget target;
  Map<String, Object?> data;
  final Affine world;
  final bool visible, locked;
  final double opacity;
  final Rect? bounds, localBounds;
  Rect? paintBounds;
  ItemLayout? item;
  String get id => target.id;
  Affine textWorldTransform(double cameraRotation) =>
      readableRectTransform(world, localBounds!, cameraRotation);

  bool get isContainer => target.type == 'group' || target.type == 'grid';
}

/// Shared initial/update projection. Containers carry inherited state; their
/// aggregate bounds belong to the scene's bounds index, not this local helper.
TargetGeometry projectTargetGeometry({
  required DatasetTarget target,
  required Map<String, Object?> data,
  required MeasureText measureText,
  required Affine parentWorld,
  MeasureImage? measureImage,
  bool parentVisible = true,
  bool parentLocked = false,
  double parentOpacity = 1,
  Map<String, Object?>? gridData,
  ItemLayout? item,
  TargetGeometry? previous,
  // Proven by the snapshot from unchanged attrs, parent world and grid pitch.
  Affine? retainedWorld,
  int fields = RecordFields.all,
  ComponentChanges? componentChanges,
}) {
  final attrs = data['attrs'] as Map<String, Object?>?;
  var world = retainedWorld;
  if (world == null) {
    var local = Affine.fromAttrs(attrs);
    if (target.row != null) {
      final grid = gridData!;
      final template = grid['item']! as Map;
      final pitch = fixedSize(template['size']! as Map);
      final gap = grid['gap']! as Map;
      local = Affine.identity
          .translated(
            target.column! * (pitch.width + (gap['x']! as num)),
            target.row! * (pitch.height + (gap['y']! as num)),
          )
          .multiply(local);
    }
    world = parentWorld.multiply(local);
    if (previous != null && previous.world.sameTransform(world)) {
      world = previous.world;
    }
  }
  if (!world.isFinite) {
    throw DatasetException(
      'INVALID_GEOMETRY',
      target.id,
      'nonfinite world transform',
    );
  }
  final visible = parentVisible && target.active && data['show'] != false;
  final locked = parentLocked || data['locked'] == true;
  final opacity = parentOpacity * ((attrs?['alpha'] as num?)?.toDouble() ?? 1);
  final geometricFields = switch (target.type) {
    'rect' => RecordFields.size | RecordFields.stroke,
    'text' =>
      RecordFields.size |
          RecordFields.text |
          RecordFields.style |
          RecordFields.overflow |
          RecordFields.split,
    'image' => RecordFields.size | RecordFields.source,
    _ => RecordFields.all,
  };
  if (previous != null &&
      target.type != 'item' &&
      measureImage == null &&
      (fields & geometricFields) == 0 &&
      world.sameTransform(previous.world)) {
    return TargetGeometry(
      target: target,
      data: data,
      world: previous.world,
      visible: visible,
      opacity: opacity,
      locked: locked,
      bounds: previous.bounds,
      paintBounds: previous.paintBounds,
      localBounds: previous.localBounds,
      item: item,
    );
  }
  Rect? bounds, paintBounds, localBounds;
  switch (target.type) {
    case 'item':
      item ??= ItemLayout.compile(data, measureText);
      localBounds = previous?.localBounds?.size == item.size
          ? previous!.localBounds
          : Offset.zero & item.size;
      bounds =
          previous != null &&
              identical(world, previous.world) &&
              identical(localBounds, previous.localBounds)
          ? previous.bounds
          : world.projectRect(localBounds!).bounds;
      paintBounds =
          previous?.item != null &&
              previous!.item!.sameEnvelope(
                item,
                changed: identical(item.indices, previous.item!.indices)
                    ? componentChanges
                    : null,
              ) &&
              previous.world.sameTransform(world)
          ? previous.paintBounds
          : item.paintBounds(world);
    case 'rect':
      localBounds = Offset.zero & fixedSize(data['size']! as Map);
      bounds = world.projectRect(localBounds).bounds;
      final stroke = data['stroke'] as Map?;
      final width = (stroke?['width'] as num?)?.toDouble() ?? 0;
      final scale =
          vectorLength(world.a, world.b) + vectorLength(world.c, world.d);
      paintBounds = bounds.inflate(width * scale);
    case 'text':
      final sameText =
          previous != null &&
          previous.localBounds != null &&
          const [
            'text',
            'style',
            'size',
            'overflow',
            'split',
          ].every((key) => identical(data[key], previous.data[key]));
      final size = sameText
          ? previous.localBounds!.size
          : measureText(
              data,
              data['size'] == null ? null : fixedSize(data['size']! as Map),
            );
      localBounds = previous?.localBounds?.size == size
          ? previous!.localBounds
          : Offset.zero & size;
      bounds =
          previous != null &&
              identical(world, previous.world) &&
              identical(localBounds, previous.localBounds)
          ? previous.bounds
          : world.projectRect(localBounds!).bounds;
      paintBounds = bounds;
    case 'image':
      final Size size;
      if (data['size'] != null) {
        size = fixedSize(data['size']! as Map);
      } else if (measureImage != null) {
        size = measureImage(target.id, data) ?? Size.zero;
      } else {
        // Preserve a previously resolved intrinsic size during unrelated attrs
        // updates when the same source remains and no resolver was supplied.
        size = identical(previous?.data['source'], data['source'])
            ? previous?.localBounds?.size ?? Size.zero
            : Size.zero;
      }
      if (!size.isFinite || size.width < 0 || size.height < 0) {
        throw DatasetException(
          'INVALID_GEOMETRY',
          target.id,
          'invalid intrinsic image size',
        );
      }
      localBounds = Offset.zero & size;
      bounds = world.projectRect(localBounds).bounds;
      paintBounds = bounds;
    case 'group':
    case 'grid':
    case 'relations':
      break;
  }
  if (bounds != null) validateBounds(bounds);
  if (paintBounds != null) validateBounds(paintBounds);
  return TargetGeometry(
    target: target,
    data: data,
    world: world,
    visible: visible,
    opacity: opacity,
    locked: locked,
    bounds: bounds,
    paintBounds: paintBounds,
    localBounds: localBounds,
    item: item,
  );
}

class _Builder {
  _Builder(this.document, this.measureText, this.measureImage);
  final DatasetDocument document;
  final MeasureText measureText;
  final MeasureImage? measureImage;
  final _items = HashMap<Map<String, Object?>, ItemLayout>.identity();
  final _targets = <String, TargetGeometry>{};
  final _ordered = <TargetGeometry>[];

  SceneGeometry build() {
    for (final data in orderedRecords(document.roots)) {
      _element(document.targets[data['id']]!, null);
    }
    return SceneGeometry._(
      Map.unmodifiable(_targets),
      List.unmodifiable(_ordered),
    );
  }

  TargetGeometry _element(DatasetTarget target, TargetGeometry? parent) {
    final data = target.data, childIds = <String>[];
    if (target.type == 'group') {
      childIds.addAll(
        orderedRecords(
          (data['children']! as List).cast<Map<String, Object?>>(),
        ).map((value) => value['id']! as String),
      );
    } else if (target.type == 'grid') {
      final rows = data['cells']! as List;
      for (var row = 0; row < rows.length; row++) {
        for (var col = 0; col < (rows[row] as List).length; col++) {
          final id = '${target.id}.$row.$col';
          if (document.targets.containsKey(id)) childIds.add(id);
        }
      }
    }
    final result = projectTargetGeometry(
      target: target,
      data: data,
      measureText: measureText,
      measureImage: measureImage,
      parentWorld: parent?.world ?? Affine.identity,
      parentVisible: parent?.visible ?? true,
      parentLocked: parent?.locked ?? false,
      parentOpacity: parent?.opacity ?? 1,
      gridData: parent?.data,
      item: target.type == 'item'
          ? _items.putIfAbsent(
              data,
              () => ItemLayout.compile(data, measureText),
            )
          : null,
    );
    for (final id in childIds) {
      _element(document.targets[id]!, result);
    }
    _targets[target.id] = result;
    if (!result.isContainer) _ordered.add(result);
    return result;
  }
}

Rect? unionBounds(Rect? left, Rect? right) => left == null
    ? right
    : right == null
    ? left
    : left.expandToInclude(right);
