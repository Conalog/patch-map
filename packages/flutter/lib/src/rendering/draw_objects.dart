import 'dart:typed_data';
import 'dart:ui';

import '../geometry/affine.dart';
import '../api/target.dart';
import '../geometry/item_layout.dart';
import '../geometry/scene_geometry.dart';
import '../geometry/readable_rect.dart';
import '../resources/text/text_pool.dart';
import '../resources/bars/bar_masks.dart';
import 'bar_slices.dart';
import 'rectangle_paint.dart';
import 'relation_paint.dart';

/// Resource ports keep draw projections independent from asynchronous owners.
abstract class DrawAsset {
  Future<void> get ready;
  (String, int)? get creationKey;
  void updateLogicalCount(int count);
  void hide();
  Size? get intrinsicSize;
  Object? get failure;
  StackTrace? get failureStack;
  void paint(Canvas canvas, Rect destination, double physicalScale);
  void retain();
  void release();
}

abstract class DrawContent {
  int _references = 0;
  void Function()? onDisposed;
  void retain() => _references++;
  void release() {
    if (--_references == 0) {
      dispose();
      onDisposed?.call();
    }
    if (_references < 0) throw StateError('unbalanced draw reference');
  }

  void dispose();
  void paint(Canvas canvas, Rect rectangle, double physicalScale);
  Iterable<DrawAsset> get assets => const [];
}

final class RelationContent extends DrawContent {
  RelationContent(this.drawing);
  final RelationPaint drawing;
  @override
  void dispose() {}
  @override
  void paint(Canvas canvas, Rect rectangle, double physicalScale) =>
      drawing.paint(canvas);
}

final class RectangleContent extends DrawContent {
  RectangleContent(this.style, {this.barMask});
  final RectanglePaint style;
  final BarMaskHandle? barMask;
  @override
  void dispose() => barMask?.release();
  @override
  void paint(Canvas canvas, Rect rectangle, double physicalScale) =>
      style.paint(canvas, rectangle);
}

final class TextContent extends DrawContent {
  TextContent(this.pool, this.handle);
  final TextPool pool;
  final TextHandle handle;
  @override
  void dispose() => pool.release(handle);
  @override
  void paint(Canvas canvas, Rect rectangle, double physicalScale) =>
      pool.draw(handle, canvas, rectangle.topLeft, physicalScale);
}

final class AssetContent extends DrawContent {
  AssetContent(this.asset);
  final DrawAsset asset;
  @override
  Iterable<DrawAsset> get assets => [asset];
  @override
  void dispose() => asset.release();
  @override
  void paint(Canvas canvas, Rect rectangle, double physicalScale) =>
      asset.paint(canvas, rectangle, physicalScale);
}

final class DrawComponent {
  DrawComponent(this.layout, this.content, {DrawComponent? previous})
    : matrix = identical(layout.transform, previous?.layout.transform)
          ? previous!.matrix
          : layout.transform.toMatrix4().asUnmodifiableView();
  final ComponentLayout layout;
  final DrawContent content;
  final Float64List matrix;
}

/// Native resources are owned by content leases, geometry by an immutable node.
/// A render page retains nodes; no publication retains its previous snapshot.
final class DrawNode {
  DrawNode(this.geometry, this.components, this.content, {DrawNode? previous})
    : _world =
          previous != null &&
              geometry.world.sameTransform(previous.geometry.world)
          ? previous._world
          : _WorldProjection(geometry.world),
      _componentWorld = _prepareComponentWorlds(
        geometry,
        components,
        previous,
      ) {
    for (final component in components) {
      component.content.retain();
    }
    content?.retain();
    if (previous != null &&
        identical(_world, previous._world) &&
        geometry.item?.size == previous.geometry.item?.size &&
        previous._uprightWorld.isNotEmpty) {
      _uprightRotation = previous._uprightRotation;
      for (var i = 0; i < components.length; i++) {
        final layout = components[i].layout;
        final old = i < previous.components.length
            ? previous.components[i].layout
            : null;
        if (old?.id != layout.id ||
            old?.box != layout.box ||
            !identical(old?.transform, layout.transform) ||
            old?.upright != layout.upright) {
          continue;
        }
        final ready = previous._uprightWorld[layout.id];
        if (ready != null) _uprightWorld[layout.id] = ready;
        final matrix = previous._upright[layout.id];
        if (matrix != null) _upright[layout.id] = matrix;
      }
    }
  }
  final TargetGeometry geometry;
  final List<DrawComponent> components;
  final DrawContent? content;
  final _WorldProjection _world;
  Float64List get matrix => _world.matrix;
  final List<Affine> _componentWorld;
  Affine? get _inverseWorld => _world.inverse;
  Float64List? get _inverseMatrix => _world.inverseMatrix;
  int _references = 0;
  double? _uprightRotation;
  final _upright = <String, Float64List>{};
  final _uprightWorld = <String, (Rect?, Affine)>{};
  void retain() => _references++;
  void release() {
    if (--_references == 0) {
      for (final component in components) {
        component.content.release();
      }
      content?.release();
    }
    if (_references < 0) throw StateError('unbalanced render node');
  }

  Iterable<DrawAsset> get assets sync* {
    if (content != null) yield* content!.assets;
    for (final component in components) {
      yield* component.content.assets;
    }
  }

  Iterable<(DrawAsset, PatchMapTarget)> get assetTargets sync* {
    for (final asset in content?.assets ?? const <DrawAsset>[]) {
      yield (asset, PatchMapTarget(geometry.id));
    }
    for (final component in components) {
      for (final asset in component.content.assets) {
        yield (
          asset,
          PatchMapTarget(geometry.id, componentId: component.layout.id),
        );
      }
    }
  }

  void paint(
    Canvas canvas, {
    required double cameraRotation,
    required double physicalScale,
    Rect? Function(String componentId)? barRectangle,
    BarSliceBatch? bars,
  }) {
    if (!geometry.visible || geometry.opacity == 0) return;
    final item = geometry.item;
    if (content is RelationContent) {
      bars?.flush(canvas);
      content!.paint(canvas, Rect.zero, physicalScale);
      return;
    }
    if (item == null) {
      bars?.flush(canvas);
      canvas.save();
      try {
        canvas.transform(matrix);
        final size = switch (geometry.target.type) {
          'rect' || 'image' =>
            geometry.data['size'] is Map
                ? Size(
                    ((geometry.data['size'] as Map)['width'] as num).toDouble(),
                    ((geometry.data['size'] as Map)['height'] as num)
                        .toDouble(),
                  )
                : content is AssetContent
                ? (content as AssetContent).asset.intrinsicSize ?? Size.zero
                : Size.zero,
          _ => geometry.localBounds?.size ?? Size.zero,
        };
        content?.paint(
          canvas,
          Offset.zero & size,
          physicalScale * _scale(geometry.world),
        );
      } finally {
        canvas.restore();
      }
      return;
    }
    for (var index = 0; index < components.length; index++) {
      final component = components[index];
      paintComponent(
        canvas,
        index,
        cameraRotation: cameraRotation,
        physicalScale: physicalScale,
        displayBox: component.layout.type == 'bar'
            ? barRectangle?.call(component.layout.id)
            : null,
        bars: bars,
      );
    }
  }

  /// Component submission seam used by ordered disjoint render-plan phases.
  /// The shared bar batch always stays in the caller's world/camera space.
  void paintComponent(
    Canvas canvas,
    int index, {
    required double cameraRotation,
    required double physicalScale,
    Rect? displayBox,
    BarSliceBatch? bars,
  }) {
    if (!geometry.visible || geometry.opacity == 0) return;
    final item = geometry.item!;
    final component = components[index];
    final layout = component.layout;
    if (!layout.visible) return;
    final isBar = layout.type == 'bar';
    if (isBar && bars != null && component.content is RectangleContent) {
      final content = component.content as RectangleContent;
      final local = layout.upright
          ? Offset.zero & (displayBox?.size ?? layout.box.size)
          : _barLocal(layout, displayBox);
      final world = layout.upright
          ? _readableWorld(index, displayBox, cameraRotation)
          : _componentWorld[index];
      final contained =
          local != null &&
          (layout.upright
              ? _inverseWorld != null &&
                    _contained(
                      world,
                      local.inflate(BarMaskPlan.pad),
                      item.size,
                      inverse: _inverseWorld,
                    )
              : _contained(
                  layout.transform,
                  local.inflate(BarMaskPlan.pad),
                  item.size,
                ));
      if (contained &&
          bars.add(
            canvas,
            content.barMask?.masks,
            local,
            world,
            content.style,
          )) {
        return;
      }
    }
    // Every native operation/clip/transform is a boundary for pending bars.
    bars?.flush(canvas);
    canvas.save();
    try {
      if (isBar) {
        // Containment makes bars independent of the overflow/overlap envelope.
        canvas.transform(matrix);
        canvas.clipRect(Offset.zero & item.size);
        if (layout.upright) {
          final inverse = _inverseMatrix;
          if (inverse == null) return;
          canvas.transform(inverse);
        }
      }
      if (layout.upright) {
        final world = _readableWorld(index, displayBox, cameraRotation);
        final transform = _upright[layout.id] ??= world.toMatrix4();
        canvas.transform(transform);
      } else {
        if (!isBar) canvas.transform(matrix);
        if (displayBox != null) {
          canvas.translate(
            displayBox.left - layout.box.left,
            displayBox.top - layout.box.top,
          );
        }
        canvas.transform(component.matrix);
      }
      final localScale = physicalScale * _scale(_componentWorld[index]);
      var destination = Offset.zero & (displayBox?.size ?? layout.box.size);
      // JS background textures compensate the centered border, keeping the
      // outside edge at the item's origin rather than spilling left/up.
      if (layout.type == 'background' &&
          component.content is RectangleContent) {
        final width = (component.content as RectangleContent).style.strokeWidth;
        destination = destination.deflate(width / 2);
      }
      component.content.paint(canvas, destination, localScale);
    } finally {
      canvas.restore();
    }
  }

  Affine _readableWorld(int index, Rect? display, double rotation) {
    if (_uprightRotation != rotation) {
      _upright.clear();
      _uprightWorld.clear();
      _uprightRotation = rotation;
    }
    final layout = components[index].layout;
    final cached = _uprightWorld[layout.id];
    if (cached != null && cached.$1 == display) return cached.$2;
    final Affine world;
    if (display == null) {
      world = layout.worldTransform(
        geometry.world,
        rotation,
        geometry.item!.size,
      );
    } else {
      final local = layout.transform;
      final placement = Affine(
        local.a,
        local.b,
        local.c,
        local.d,
        local.tx + display.left - layout.box.left,
        local.ty + display.top - layout.box.top,
      );
      final size = geometry.item!.size;
      world = readableRectTransform(
        geometry.world.multiply(placement),
        Offset.zero & display.size,
        rotation,
        placementAnchor: layout.type == 'bar'
            ? geometry.world.project(Offset(size.width / 2, size.height / 2))
            : null,
      );
    }
    _upright.remove(layout.id);
    _uprightWorld[layout.id] = (display, world);
    return world;
  }
}

// A tween moves the placement before component attrs. Express that translation
// in the existing component basis so submission reuses its retained Affine.
Rect? _barLocal(ComponentLayout layout, Rect? display) {
  if (display == null) return Offset.zero & layout.box.size;
  final m = layout.transform, determinant = m.a * m.d - m.b * m.c;
  if (determinant == 0 || !determinant.isFinite) return null;
  final dx = display.left - layout.box.left, dy = display.top - layout.box.top;
  return Rect.fromLTWH(
    (m.d * dx - m.c * dy) / determinant,
    (m.a * dy - m.b * dx) / determinant,
    display.width,
    display.height,
  );
}

bool _contained(Affine transform, Rect rect, Size size, {Affine? inverse}) {
  for (var i = 0; i < 4; i++) {
    final x = i < 2 ? rect.left : rect.right;
    final y = i.isEven ? rect.top : rect.bottom;
    var px = transform.a * x + transform.c * y + transform.tx;
    var py = transform.b * x + transform.d * y + transform.ty;
    if (inverse != null) {
      final wx = px, wy = py;
      px = inverse.a * wx + inverse.c * wy + inverse.tx;
      py = inverse.b * wx + inverse.d * wy + inverse.ty;
    }
    if (!px.isFinite ||
        !py.isFinite ||
        px < 0 ||
        py < 0 ||
        px > size.width ||
        py > size.height) {
      return false;
    }
  }
  return true;
}

final class RenderPage {
  RenderPage(this.nodes) {
    for (final node in nodes) {
      node.retain();
    }
  }
  final List<DrawNode> nodes;
  int _references = 0;
  void retain() => _references++;
  void release() {
    if (--_references == 0) {
      for (final node in nodes) {
        node.release();
      }
    }
    if (_references < 0) throw StateError('unbalanced render page');
  }
}

double _scale(Affine transform) {
  final x = vectorLength(transform.a, transform.b),
      y = vectorLength(transform.c, transform.d);
  return x > y ? x : y;
}

// Shared prepared values contain no DrawNode/publication or mutable cache map.
final class _WorldProjection {
  _WorldProjection(this.world)
    : matrix = world.toMatrix4().asUnmodifiableView(),
      inverse = world.inverse;
  final Affine world;
  final Float64List matrix;
  final Affine? inverse;
  late final Float64List? inverseMatrix = inverse
      ?.toMatrix4()
      .asUnmodifiableView();
}

List<Affine> _prepareComponentWorlds(
  TargetGeometry geometry,
  List<DrawComponent> components,
  DrawNode? previous,
) {
  final sameWorld =
      previous != null && geometry.world.sameTransform(previous.geometry.world);
  if (sameWorld && components.length == previous.components.length) {
    var unchanged = true;
    for (var i = 0; i < components.length; i++) {
      if (components[i].layout.id != previous.components[i].layout.id ||
          !identical(
            components[i].layout.transform,
            previous.components[i].layout.transform,
          )) {
        unchanged = false;
        break;
      }
    }
    if (unchanged) return previous._componentWorld;
  }
  return List.unmodifiable([
    for (var i = 0; i < components.length; i++)
      if (sameWorld &&
          i < previous.components.length &&
          components[i].layout.id == previous.components[i].layout.id &&
          identical(
            components[i].layout.transform,
            previous.components[i].layout.transform,
          ))
        previous._componentWorld[i]
      else
        geometry.world.multiply(components[i].layout.transform),
  ]);
}
