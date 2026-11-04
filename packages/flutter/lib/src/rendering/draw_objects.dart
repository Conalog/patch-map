import 'dart:typed_data';
import 'dart:ui';

import '../geometry/affine.dart';
import '../api/target.dart';
import '../geometry/item_layout.dart';
import '../geometry/scene_geometry.dart';
import '../geometry/readable_rect.dart';
import '../presentation/record_delta.dart';
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
  void paintWithAlpha(
    Canvas canvas,
    Rect rectangle,
    double physicalScale, {
    double alphaMultiplier = 1,
  }) {
    if (alphaMultiplier == 1) {
      paint(canvas, rectangle, physicalScale);
      return;
    }
    if (alphaMultiplier == 0) return;
    // Assets may paint beyond their destination. A content-level layer keeps
    // that overflow and avoids changing overlap between item components.
    canvas.saveLayer(
      null,
      Paint()
        ..color = const Color(0xffffffff).withValues(alpha: alphaMultiplier),
    );
    try {
      paint(canvas, rectangle, physicalScale);
    } finally {
      canvas.restore();
    }
  }

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
  @override
  void paintWithAlpha(
    Canvas canvas,
    Rect rectangle,
    double physicalScale, {
    double alphaMultiplier = 1,
  }) => drawing.paint(canvas, alphaMultiplier: alphaMultiplier);
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
  @override
  void paintWithAlpha(
    Canvas canvas,
    Rect rectangle,
    double physicalScale, {
    double alphaMultiplier = 1,
  }) => style.paint(canvas, rectangle, alphaMultiplier: alphaMultiplier);
}

final class TextContent extends DrawContent {
  TextContent(this.pool, this.handle);
  final TextPool pool;
  final TextHandle handle;
  @override
  void dispose() => pool.release(handle);
  @override
  void paint(Canvas canvas, Rect rectangle, double physicalScale) => pool.draw(
    handle,
    canvas,
    rectangle.left == 0 && rectangle.top == 0 ? Offset.zero : rectangle.topLeft,
    physicalScale,
  );
  @override
  void paintWithAlpha(
    Canvas canvas,
    Rect rectangle,
    double physicalScale, {
    double alphaMultiplier = 1,
  }) => pool.draw(
    handle,
    canvas,
    rectangle.left == 0 && rectangle.top == 0 ? Offset.zero : rectangle.topLeft,
    physicalScale,
    alphaMultiplier: alphaMultiplier,
  );
}

final class AssetContent extends DrawContent {
  AssetContent(this.asset) : assets = List.unmodifiable([asset]);
  final DrawAsset asset;
  @override
  final List<DrawAsset> assets;
  @override
  void dispose() => asset.release();
  @override
  void paint(Canvas canvas, Rect rectangle, double physicalScale) =>
      asset.paint(canvas, rectangle, physicalScale);
}

final class DrawComponent {
  DrawComponent(this.layout, this.content, {DrawComponent? previous})
    : _matrix = identical(layout.transform, previous?.layout.transform)
          ? previous!._matrix
          : _ComponentMatrix(layout.transform);
  ComponentLayout layout;
  DrawContent content;
  _ComponentMatrix? _matrix;
  Float64List get matrix =>
      (_matrix ??= _ComponentMatrix(layout.transform)).value;
  ReadableRectBasis? _readableBasis;

  ReadableRectBasis readableBasis(Affine authored, double rotation) {
    final prior = _readableBasis;
    if (prior != null && prior.matches(authored, rotation)) return prior;
    return _readableBasis = ReadableRectBasis(authored, rotation);
  }

  void commitValues(
    Affine transform,
    DrawContent value,
    void Function(void Function()) retire,
  ) {
    value.retain();
    if (identical(content, value)) {
      content.release();
    } else {
      retire(content.release);
    }
    if (!identical(layout.transform, transform)) {
      // The new local transform is already validated geometry. Its output-only
      // holder is needed only if this component is actually submitted.
      _matrix = null;
    }
    content = value;
  }
}

// Share the lazy projection without retaining a previous component/publication.
// Upright bars submit world-space vertices and never need this local matrix.
final class _ComponentMatrix {
  _ComponentMatrix(this.transform);
  final Affine transform;
  late final Float64List value = transform.toMatrix4().asUnmodifiableView();
}

/// Native resources are owned by content leases; geometry is owned by the node.
/// Retained mutations are staged separately and applied only at publication.
/// A render page retains nodes; no publication retains its previous snapshot.
final class DrawNode {
  DrawNode(
    this.geometry,
    this.components,
    this.content, {
    DrawNode? previous,
    ComponentChanges? componentChanges,
    bool reuseAssetMetadata = false,
  }) : _world =
           previous != null &&
               geometry.world.sameTransform(previous.geometry.world)
           ? previous._world
           : _WorldProjection(geometry.world),
       _componentWorld = _prepareComponentWorlds(
         geometry,
         components,
         previous,
         componentChanges,
       ),
       _assets = reuseAssetMetadata && previous != null
           ? previous._assets
           : _NodeAssets.prepare(
               geometry.id,
               content,
               components,
               previous?._assets,
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
      for (final entry in previous._uprightWorld.entries) {
        final index = geometry.item!.indices[entry.key];
        if (index == null) continue;
        final component = components[index];
        final priorIndex = previous.geometry.item!.indices[entry.key];
        if (priorIndex == null) continue;
        final prior = previous.components[priorIndex];
        if (!identical(component, prior)) {
          final layout = component.layout, old = prior.layout;
          if (old.box != layout.box ||
              !identical(old.transform, layout.transform) ||
              old.upright != layout.upright) {
            continue;
          }
        }
        _uprightWorld[entry.key] = entry.value;
        final matrix = previous._upright[entry.key];
        if (matrix != null) _upright[entry.key] = matrix;
      }
    }
  }
  TargetGeometry geometry;
  final List<DrawComponent> components;
  final DrawContent? content;
  final _NodeAssets _assets;
  final _WorldProjection _world;
  Float64List get matrix => _world.matrix;
  final List<Affine?> _componentWorld;
  int get debugPendingProjectionCount =>
      _componentWorld.where((value) => value == null).length;
  Affine _componentWorldAt(int index) => _componentWorld[index] ??= geometry
      .world
      .multiply(components[index].layout.transform);
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

  /// First write detaches shared grid layouts only at actual publication.
  ItemLayout ownRetainedLayout() {
    final current = geometry.item!;
    if (current.mutationOwned) return current;
    final owned = current.detached();
    geometry.item = owned;
    for (var index = 0; index < components.length; index++) {
      components[index].layout = owned.components[index];
    }
    return owned;
  }

  /// Called only in the synchronous session publication handoff.
  void commitRetainedGeometry(
    TargetGeometry next,
    Iterable<(int, bool)> updates,
  ) {
    geometry = next;
    for (final (index, transformChanged) in updates) {
      final component = components[index];
      if (transformChanged) {
        // The owned slots retain no revision chain. Any number of offscreen
        // updates collapse into one computation from current published geometry.
        _componentWorld[index] = null;
      }
      _upright.remove(component.layout.id);
      _uprightWorld.remove(component.layout.id);
    }
  }

  List<DrawAsset> get assets => _assets.values;
  List<(DrawAsset, PatchMapTarget)> get assetTargets => _assets.targets;

  /// Submit a standalone object; item order belongs to DrawPlan.
  void paintStandalone(
    Canvas canvas, {
    required double physicalScale,
    BarSliceBatch? bars,
    double alphaMultiplier = 1,
  }) {
    assert(geometry.item == null);
    if (!geometry.visible || geometry.opacity == 0 || alphaMultiplier == 0) {
      return;
    }
    if (content is RelationContent) {
      bars?.flush(canvas);
      content!.paintWithAlpha(
        canvas,
        Rect.zero,
        physicalScale,
        alphaMultiplier: alphaMultiplier,
      );
      return;
    }
    bars?.flush(canvas);
    canvas.save();
    try {
      canvas.transform(matrix);
      final size = switch (geometry.target.type) {
        'rect' || 'image' =>
          geometry.data['size'] is Map
              ? Size(
                  ((geometry.data['size'] as Map)['width'] as num).toDouble(),
                  ((geometry.data['size'] as Map)['height'] as num).toDouble(),
                )
              : content is AssetContent
              ? (content as AssetContent).asset.intrinsicSize ?? Size.zero
              : Size.zero,
        _ => geometry.localBounds?.size ?? Size.zero,
      };
      content?.paintWithAlpha(
        canvas,
        Offset.zero & size,
        physicalScale * _scale(geometry.world),
        alphaMultiplier: alphaMultiplier,
      );
    } finally {
      canvas.restore();
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
    double alphaMultiplier = 1,
  }) {
    if (!geometry.visible || geometry.opacity == 0 || alphaMultiplier == 0) {
      return;
    }
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
          : _componentWorldAt(index);
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
            alphaMultiplier: alphaMultiplier,
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
      final localScale = physicalScale * _scale(_componentWorldAt(index));
      final destination = Offset.zero & (displayBox?.size ?? layout.box.size);
      component.content.paintWithAlpha(
        canvas,
        destination,
        localScale,
        alphaMultiplier: alphaMultiplier,
      );
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
    final component = components[index];
    final layout = component.layout;
    final cached = _uprightWorld[layout.id];
    if (cached != null && cached.$1 == display) return cached.$2;
    final Affine authored;
    if (display == null) {
      authored = _componentWorldAt(index);
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
      authored = geometry.world.multiply(placement);
    }
    final size = geometry.item!.size;
    final world = component
        .readableBasis(authored, rotation)
        .place(
          authored,
          Offset.zero & (display?.size ?? layout.box.size),
          placementAnchor: layout.type == 'bar'
              ? geometry.world.project(Offset(size.width / 2, size.height / 2))
              : null,
        );
    _upright.remove(layout.id);
    _uprightWorld[layout.id] = (display, world);
    return world;
  }
}

/// Immutable reference metadata only. Content leases still own asset lifetime;
/// readiness, failures and intrinsic dimensions are always read from the asset.
final class _NodeAssets {
  const _NodeAssets(this.values, this.targets);
  static const empty = _NodeAssets([], []);
  final List<DrawAsset> values;
  final List<(DrawAsset, PatchMapTarget)> targets;

  static _NodeAssets prepare(
    String id,
    DrawContent? content,
    List<DrawComponent> components,
    _NodeAssets? previous,
  ) {
    List<(DrawAsset, PatchMapTarget)>? targets;
    for (final asset in content?.assets ?? const <DrawAsset>[]) {
      (targets ??= []).add((asset, PatchMapTarget(id)));
    }
    for (final component in components) {
      for (final asset in component.content.assets) {
        (targets ??= []).add((
          asset,
          PatchMapTarget(id, componentId: component.layout.id),
        ));
      }
    }
    if (targets == null) return empty;
    if (previous != null && targets.length == previous.targets.length) {
      var same = true;
      for (var i = 0; i < targets.length; i++) {
        if (targets[i] != previous.targets[i]) {
          same = false;
          break;
        }
      }
      if (same) return previous;
    }
    return _NodeAssets(
      List.unmodifiable(targets.map((entry) => entry.$1)),
      List.unmodifiable(targets),
    );
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

List<Affine?> _prepareComponentWorlds(
  TargetGeometry geometry,
  List<DrawComponent> components,
  DrawNode? previous,
  ComponentChanges? changes,
) {
  // Keep nullable predecessors outside the reuse loops. Profile AOT must not
  // read previous component arrays while constructing a fresh publication.
  if (previous == null) {
    return <Affine?>[
      for (final component in components)
        geometry.world.multiply(component.layout.transform),
    ];
  }
  if (!geometry.world.sameTransform(previous.geometry.world)) {
    return <Affine?>[
      for (final component in components)
        geometry.world.multiply(component.layout.transform),
    ];
  }
  if (changes != null) {
    List<Affine?>? worlds;
    for (final entry in changes) {
      final index = entry.index;
      if (identical(
        components[index].layout.transform,
        previous.components[index].layout.transform,
      )) {
        continue;
      }
      worlds ??= previous._componentWorld.toList();
      worlds[index] = geometry.world.multiply(
        components[index].layout.transform,
      );
    }
    return worlds ?? previous._componentWorld.toList();
  }
  if (components.length == previous.components.length) {
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
    if (unchanged) return previous._componentWorld.toList();
  }
  return <Affine?>[
    for (var i = 0; i < components.length; i++)
      if (i < previous.components.length &&
          components[i].layout.id == previous.components[i].layout.id &&
          identical(
            components[i].layout.transform,
            previous.components[i].layout.transform,
          ))
        previous._componentWorld[i]
      else
        geometry.world.multiply(components[i].layout.transform),
  ];
}
