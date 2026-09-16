import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/painting.dart';
import 'package:flutter/foundation.dart';

import '../engine/ports.dart';
import '../api/values.dart';
import '../host/native_assets.dart';
import '../model/dataset.dart';
import '../model/theme.dart' show normalizeDirectColor;
import '../semantic/geometry/geometry.dart';
import '../semantic/text/layout.dart';
import 'color.dart';
import 'selection.dart';
export 'color.dart' show mapColor;

part 'canvas_primitives.dart';
part 'canvas_text.dart';

typedef _PaintCommand = void Function(ui.Canvas canvas);

/// Retains ordered mesh batches; camera changes do not rebuild geometry.
class PatchMapCanvasRenderer {
  PatchMapCanvasRenderer(this.assets, {this.antialias = true});
  final NativeAssetSession? assets;
  final bool antialias;
  PatchMapGeometry? geometry;
  Map<String, double> _alpha = const {};
  JsonMap _theme = const {};
  double _rotation = 0;
  int _orientationBucket = -1;
  List<double> _orientationThresholds = const [];
  SelectionGeometry? _selectionGeometry;
  List<String> _selected = const [];
  String? _selectionMode;
  List<ui.Path> _selectionPaths = const [];
  List<ui.Path> _selectionClips = const [];
  double? _selectionWidth;
  String? _selectionAlignment;
  Map<String, GeometryTarget>? _pointerComponents;
  final List<_MeshChunk> _meshes = [];
  final _barMeshSlots = <int, _MeshSlot>{};
  final _iconSlots = <int, int>{};
  final _assetSlots = <int, int>{};
  final _colors = <(Object, int), ui.Color>{};
  final Set<TextPainter> _texts = {};
  final _textSlots = <int, (int, List<TextPainter>)>{};
  final _textCache = <(String, TextStyle, TextDirection), TextPainter>{};
  final _usedTextCache = <TextPainter>{};
  final List<_PaintCommand> _commands = [];
  final _svgImages = <(ui.Picture, int, int), ui.Image>{};
  int _svgPixels = 0;
  double _rasterScale = 1;
  bool disposed = false;
  int get commandCount => _commands.length;
  int get visiblePrimitiveCount =>
      geometry?.primitives.where((p) => p.visible && p.opacity > 0).length ?? 0;

  void prepare(PatchMapRenderSnapshot snapshot) {
    if (disposed) return;
    final scale = snapshot.viewport.scale * snapshot.viewport.pixelRatio;
    final rasterScale = scale.isFinite && scale > 0
        ? math.pow(2, (math.log(scale) / math.ln2).ceil()).toDouble()
        : double.infinity;
    final rasterScaleChanged = rasterScale != _rasterScale;
    _rasterScale = rasterScale;
    final previous = geometry;
    final changed = !identical(previous, snapshot.geometry);
    final topologyChanged = !identical(
      previous?.topology,
      snapshot.geometry.topology,
    );
    geometry = snapshot.geometry;
    if (topologyChanged) {
      final boundaries = <double>{};
      final epsilonAngle = math.asin(readableHalfPlaneEpsilon) * 180 / math.pi;
      for (final primitive in geometry!.primitives) {
        if (primitive.contentOrientation != 'upright' || !primitive.visible)
          continue;
        final angle =
            math.atan2(primitive.transform.b, primitive.transform.a) *
            180 /
            math.pi;
        boundaries.add((90 - epsilonAngle - angle) % 360);
        boundaries.add((270 - epsilonAngle - angle) % 360);
      }
      _orientationThresholds = boundaries.toList()..sort();
    }
    final bucket = _bucket(snapshot.viewport.rotation);
    final styleChanged =
        bucket != _orientationBucket ||
        !mapEquals(_alpha, snapshot.presentationAlpha) ||
        !mapEquals(_theme, snapshot.theme);
    final paintChanged =
        changed ||
        bucket != _orientationBucket ||
        !mapEquals(_alpha, snapshot.presentationAlpha) ||
        !mapEquals(_theme, snapshot.theme);
    _rotation = snapshot.viewport.rotation;
    _orientationBucket = bucket;
    _alpha = snapshot.presentationAlpha;
    _theme = snapshot.theme;
    if (!paintChanged) {
      if (rasterScaleChanged && _iconSlots.isNotEmpty)
        _refreshImageCommands(snapshot);
      return;
    }
    _selectionGeometry = null;
    _pointerComponents = null;
    _selectionMode = null;
    if (changed && !styleChanged && _updateIconCommands(previous!, snapshot)) {
      if (rasterScaleChanged) _refreshImageCommands(snapshot);
      return;
    }
    if (changed &&
        !topologyChanged &&
        !styleChanged &&
        (_updateBarMeshes(previous!) ||
            _updateTextCommands(previous, snapshot))) {
      if (rasterScaleChanged) _refreshImageCommands(snapshot);
      return;
    }
    _rebuild(snapshot);
  }

  int _bucket(double angle) {
    final bearing = angle % 360;
    var lower = 0, upper = _orientationThresholds.length;
    while (lower < upper) {
      final middle = (lower + upper) ~/ 2;
      if (_orientationThresholds[middle] <= bearing)
        lower = middle + 1;
      else
        upper = middle;
    }
    return lower;
  }

  ui.Color _color(
    Object? value, [
    ui.Color fallback = const ui.Color(0xff000000),
  ]) => value == null
      ? fallback
      : _colors.putIfAbsent((
          value,
          fallback.toARGB32(),
        ), () => mapColor(value, fallback, _theme));

  bool _updateBarMeshes(PatchMapGeometry previous) {
    final current = geometry!;
    final changed =
        identical(current.baseProjection, previous.projectionIdentity)
        ? current.changedPrimitiveSlots
        : [
            for (var i = 0; i < current.primitives.length; i++)
              if (!identical(current.primitives[i], previous.primitives[i])) i,
          ];
    for (final index in changed) {
      final primitive = current.primitives[index];
      if (primitive.visible &&
          primitive.opacity > 0 &&
          !_barMeshSlots.containsKey(index))
        return false;
    }
    final dirty = <_MeshChunk>{};
    for (final index in changed) {
      final slot = _barMeshSlots[index];
      if (slot == null) continue;
      final primitive = current.primitives[index];
      _writeBarPositions(
        primitive.localRect,
        readableTransform(primitive, worldRotation: _rotation),
        slot.radius,
        slot.chunk.positions,
        slot.offset,
      );
      dirty.add(slot.chunk);
    }
    for (final chunk in dirty) chunk.publish();
    return true;
  }

  void refreshAssets(PatchMapRenderSnapshot snapshot) {
    if (disposed || geometry == null) return;
    for (final painter in _textCache.values) painter.dispose();
    _textCache.clear();
    _usedTextCache.clear();
    _clearSvgImages();
    if (!identical(geometry, snapshot.geometry)) {
      geometry = snapshot.geometry;
      _rebuild(snapshot);
      return;
    }
    // Resource completion changes image commands and native font paragraphs,
    // while retained geometry meshes and ordering remain valid.
    for (final painter in _texts) painter.dispose();
    _texts.clear();
    double alphaFor(GeometryPrimitive p) =>
        p.opacity *
        (snapshot
                .presentationAlpha['${p.ownerId}\u0000${p.componentId ?? ''}'] ??
            snapshot.presentationAlpha[p.ownerId] ??
            1);
    _refreshImageCommands(snapshot);
    for (final index in _textSlots.keys.toList()) {
      final p = geometry!.primitives[index], slot = _textSlots[index]!.$1;
      final next = _textCommand(p, alphaFor(p));
      _commands[slot] = next.$1;
      _textSlots[index] = (slot, next.$2);
    }
    _pruneTextCache();
  }

  void _rebuild(PatchMapRenderSnapshot snapshot) {
    _clearSvgImages();
    for (final mesh in _meshes) {
      mesh.dispose();
    }
    for (final text in _texts) {
      text.dispose();
    }
    _meshes.clear();
    _texts.clear();
    _textSlots.clear();
    _usedTextCache.clear();
    _commands.clear();
    _barMeshSlots.clear();
    _iconSlots.clear();
    _assetSlots.clear();
    _colors.clear();
    final positions = <double>[];
    final colors = <int>[];
    final indices = <int>[];
    final pendingSlots = <(int, int, double)>[];
    void flush() {
      if (positions.isEmpty) return;
      final mesh = _MeshChunk(
        Float32List.fromList(positions),
        Int32List.fromList(colors),
        Uint16List.fromList(indices),
        antialias: antialias,
      );
      _meshes.add(mesh);
      _commands.add(mesh.paint);
      for (final slot in pendingSlots)
        _barMeshSlots[slot.$1] = _MeshSlot(mesh, slot.$2, slot.$3);
      pendingSlots.clear();
      positions.clear();
      colors.clear();
      indices.clear();
    }

    for (
      var primitiveIndex = 0;
      primitiveIndex < geometry!.primitives.length;
      primitiveIndex++
    ) {
      final primitive = geometry!.primitives[primitiveIndex];
      if (!primitive.visible || primitive.opacity <= 0) continue;
      final value = primitive.value;
      final key = '${primitive.ownerId}\u0000${primitive.componentId ?? ''}';
      final alpha =
          primitive.opacity *
          (snapshot.presentationAlpha[key] ??
              snapshot.presentationAlpha[primitive.ownerId] ??
              1);
      final source = value['source'];
      if (primitive.type == 'text') {
        flush();
        final text = _textCommand(primitive, alpha);
        _textSlots[primitiveIndex] = (_commands.length, text.$2);
        _commands.add(text.$1);
      } else if (primitive.type == 'relation') {
        flush();
        final points = primitive.points;
        final style = value['style'] as Map? ?? const {};
        final paint = ui.Paint()
          ..isAntiAlias = antialias
          ..color = applyOpacity(_color(style['color']), alpha)
          ..style = ui.PaintingStyle.stroke;
        for (var i = 1; i < points.length; i++) {
          final from = points[i - 1], to = points[i];
          final segmentPaint = ui.Paint()
            ..isAntiAlias = antialias
            ..color = paint.color
            ..strokeWidth = i - 1 < primitive.strokeWidths.length
                ? primitive.strokeWidths[i - 1]
                : number(style['width'], 1)
            ..style = ui.PaintingStyle.stroke;
          _commands.add(
            (canvas) => canvas.drawLine(
              ui.Offset(from.x, from.y),
              ui.Offset(to.x, to.y),
              segmentPaint,
            ),
          );
        }
      } else if (source is String ||
          source is Map && source.containsKey('src')) {
        flush();
        _assetSlots[primitiveIndex] = _commands.length;
        if (primitive.type == 'icon')
          _iconSlots[primitiveIndex] = _commands.length;
        _commands.add(_imageCommand(primitive, alpha));
      } else {
        final style = source is Map ? source : value;
        var base = _color(
          style['fill'],
          primitive.type == 'rect'
              ? const ui.Color(0xffffffff)
              : const ui.Color(0x00000000),
        );
        final tint = _color(value['tint'], const ui.Color(0xffffffff));
        if (primitive.type == 'bar' &&
            base.toARGB32() == 0 &&
            value.containsKey('tint'))
          base = const ui.Color(0xffffffff);
        final color = multiplyColor(base, tint, alpha);
        // Alpha bars lower only numeric radius and have no source stroke.
        final radius = primitive.type == 'bar'
            ? number(style['radius'])
            : _radius(style['radius']);
        if (colors.length + 21 > 65535) flush();
        final transform = readableTransform(
          primitive,
          worldRotation: _rotation,
        );
        final corners = primitive.type == 'background'
            ? _corners(style['radius'])
            : List<double>.filled(4, radius);
        final vertexOffset = positions.length;
        _roundedTriangles(
          primitive.localRect,
          transform,
          corners,
          color.toARGB32(),
          positions,
          colors,
          indices,
          retainDegenerate: primitive.type == 'bar',
        );
        final stroke = style['stroke'];
        final borderWidth = primitive.type == 'bar'
            ? 0.0
            : (style['borderWidth'] as num?)?.toDouble() ??
                  (stroke is Map
                      ? (stroke['width'] as num?)?.toDouble()
                      : null) ??
                  (stroke == null ? 0 : 1);
        if (primitive.type == 'bar' && borderWidth == 0)
          pendingSlots.add((primitiveIndex, vertexOffset, radius));
        if (borderWidth > 0) {
          flush();
          final borderColor = _color(
            style['borderColor'] ?? (stroke is Map ? stroke['color'] : stroke),
          );
          final borderAlpha =
              alpha * (stroke is Map ? number(stroke['alpha'], 1) : 1);
          _commands.add((canvas) {
            canvas.save();
            canvas.transform(_matrix(transform));
            canvas.drawRRect(
              _rrect(primitive.localRect, corners),
              ui.Paint()
                ..isAntiAlias = antialias
                ..color = applyOpacity(borderColor, borderAlpha)
                ..strokeWidth = borderWidth
                ..style = ui.PaintingStyle.stroke,
            );
            canvas.restore();
          });
        }
      }
    }
    flush();
    _pruneTextCache();
  }

  void _refreshImageCommands(PatchMapRenderSnapshot snapshot) {
    _clearSvgImages();
    for (final entry in _assetSlots.entries) {
      final p = geometry!.primitives[entry.key];
      final key = '${p.ownerId}\u0000${p.componentId ?? ''}';
      final alpha =
          p.opacity *
          (snapshot.presentationAlpha[key] ??
              snapshot.presentationAlpha[p.ownerId] ??
              1);
      _commands[entry.value] = _imageCommand(p, alpha);
    }
  }

  void _clearSvgImages() {
    for (final image in _svgImages.values) image.dispose();
    _svgImages.clear();
    _svgPixels = 0;
  }

  ui.Image? _rasterIcon(NativeAsset asset, GeometryPrimitive primitive) {
    if (primitive.type != 'icon' || asset.picture == null) return null;
    final t = primitive.transform;
    // Frobenius norm bounds the largest axis stretch, including skew/reflection.
    final stretch = math.sqrt(t.a * t.a + t.b * t.b + t.c * t.c + t.d * t.d);
    final pixelWidth = primitive.localRect.width * stretch * _rasterScale;
    final pixelHeight = primitive.localRect.height * stretch * _rasterScale;
    if (!pixelWidth.isFinite ||
        !pixelHeight.isFinite ||
        pixelWidth > 2048 ||
        pixelHeight > 2048)
      return null;
    final width = pixelWidth.ceil(), height = pixelHeight.ceil();
    if (width < 1 || height < 1 || width > 2048 || height > 2048) return null;
    final key = (asset.picture!, width, height);
    final cached = _svgImages[key];
    if (cached != null) return cached;
    // Bound derived GPU storage. Excess variants retain the exact vector path.
    if (_svgImages.length >= 32 ||
        _svgPixels + width * height > 4 * 1024 * 1024)
      return null;
    final recorder = ui.PictureRecorder();
    final canvas = ui.Canvas(recorder)
      ..scale(width / asset.width, height / asset.height);
    canvas.drawPicture(asset.picture!);
    final picture = recorder.endRecording();
    try {
      final image = picture.toImageSync(width, height);
      _svgImages[key] = image;
      _svgPixels += width * height;
      return image;
    } catch (_) {
      return null; // Resource-constrained devices can keep the vector path.
    } finally {
      picture.dispose();
    }
  }

  _PaintCommand _imageCommand(GeometryPrimitive primitive, double alpha) {
    final value = primitive.value;
    final source = value['source'];
    final key = '${primitive.ownerId}\u0000${primitive.componentId ?? ''}';
    final asset = assets?.lookup(source!, key);
    if (asset == null) return (_) {};
    final rasterIcon = _rasterIcon(asset, primitive);
    final matrix = _matrix(
      readableTransform(primitive, worldRotation: _rotation),
    );
    final rect = _rect(primitive.localRect);
    final tint = _color(value['tint'], const ui.Color(0xffffffff));
    final paint = ui.Paint()
      ..isAntiAlias = antialias
      ..color = ui.Color.fromRGBO(255, 255, 255, alpha.clamp(0, 1))
      ..colorFilter = ui.ColorFilter.mode(tint, ui.BlendMode.modulate);
    return (canvas) {
      canvas.save();
      canvas.transform(matrix);
      if (asset.image != null)
        canvas.drawImageRect(
          asset.image!,
          ui.Rect.fromLTWH(0, 0, asset.width, asset.height),
          rect,
          paint,
        );
      if (rasterIcon != null) {
        canvas.drawImageRect(
          rasterIcon,
          ui.Rect.fromLTWH(
            0,
            0,
            rasterIcon.width.toDouble(),
            rasterIcon.height.toDouble(),
          ),
          rect,
          paint,
        );
      } else if (asset.picture != null) {
        canvas.saveLayer(rect, paint);
        canvas.translate(rect.left, rect.top);
        canvas.scale(rect.width / asset.width, rect.height / asset.height);
        canvas.drawPicture(asset.picture!);
        canvas.restore();
      }
      canvas.restore();
    };
  }

  bool _updateIconCommands(
    PatchMapGeometry previous,
    PatchMapRenderSnapshot snapshot,
  ) {
    final current = geometry!;
    if (!identical(current.baseProjection, previous.projectionIdentity))
      return false;
    for (final index in current.changedPrimitiveSlots) {
      final p = current.primitives[index];
      if (p.type != 'icon' ||
          (p.visible && p.opacity > 0 && !_iconSlots.containsKey(index)))
        return false;
    }
    for (final index in current.changedPrimitiveSlots) {
      final slot = _iconSlots[index];
      if (slot == null) continue;
      final p = current.primitives[index];
      final key = '${p.ownerId}\u0000${p.componentId}';
      final alpha =
          p.opacity *
          (snapshot.presentationAlpha[key] ??
              snapshot.presentationAlpha[p.ownerId] ??
              1);
      _commands[slot] = _imageCommand(p, alpha);
    }
    return true;
  }

  void paint(
    ui.Canvas canvas,
    ui.Size size,
    PatchMapRenderSnapshot snapshot,
    ui.Color background,
  ) {
    if (disposed) return;
    canvas.drawRect(
      ui.Offset.zero & size,
      ui.Paint()
        ..isAntiAlias = antialias
        ..color = background,
    );
    canvas.save();
    canvas.clipRect(ui.Offset.zero & size);
    final view = snapshot.viewport;
    canvas.translate(view.width / 2, view.height / 2);
    canvas.rotate(view.rotation * math.pi / 180);
    canvas.scale(view.scale);
    canvas.translate(-view.centerX, -view.centerY);
    for (final command in _commands) {
      command(canvas);
    }
    final visual =
        snapshot.selectionPolicy['visual'] as JsonMap? ??
        const <String, dynamic>{};
    final mode = visual['displayMode'] as String? ?? 'all';
    if (_selectionMode != mode ||
        !listEquals(_selected, snapshot.selectedIds)) {
      _selected = snapshot.selectedIds;
      _selectionMode = mode;
      _selectionWidth = null;
      _selectionPaths = _selected.isEmpty || mode == 'hidden'
          ? const []
          : (_selectionGeometry ??= SelectionGeometry(
              geometry!,
              _rotation,
              _theme,
            )).paths(_selected, mode);
    }
    final outline = ui.Paint()
      ..isAntiAlias = antialias
      ..color = _color(visual['color'], const ui.Color(0xff2f80ed))
      ..strokeWidth = selectionStrokeWidth(visual, view.scale)
      ..style = ui.PaintingStyle.stroke;
    final alignment = visual['strokeAlignment'] as String? ?? 'center';
    if (_selectionWidth != outline.strokeWidth ||
        _selectionAlignment != alignment) {
      _selectionWidth = outline.strokeWidth;
      _selectionAlignment = alignment;
      _selectionClips = selectionClipPaths(
        _selectionPaths,
        outline.strokeWidth,
        alignment,
      );
    }
    paintSelection(
      canvas,
      _selectionPaths,
      outline,
      alignment,
      _selectionClips,
    );
    canvas.restore();
  }

  /// Derived only when Flutter requests a Semantics tree, never during prepare.
  /// Components contribute their actual readable bounds to the logical owner.
  Map<String, ui.Rect> accessibilityBounds(PatchMapRenderViewport viewport) {
    final current = geometry;
    if (current == null) return const {};
    final bounds = <String, ui.Rect>{};
    final angle = viewport.rotation * math.pi / 180;
    final cosine = math.cos(angle), sine = math.sin(angle);
    void include(String id, Iterable<MapPoint> points) {
      ui.Rect? rect;
      for (final point in points) {
        final x = point.x - viewport.centerX;
        final y = point.y - viewport.centerY;
        final dx =
            (x * cosine - y * sine) * viewport.scale + viewport.width / 2;
        final dy =
            (x * sine + y * cosine) * viewport.scale + viewport.height / 2;
        if (!dx.isFinite || !dy.isFinite) return;
        final corner = ui.Rect.fromLTRB(dx, dy, dx, dy);
        rect = rect == null ? corner : rect.expandToInclude(corner);
      }
      if (rect != null) bounds[id] = bounds[id]?.expandToInclude(rect) ?? rect;
    }

    for (final target in current.targets.values) {
      if (!target.visible ||
          target.componentId != null ||
          target.type == 'group' ||
          target.type == 'grid' ||
          target.type == 'relations')
        continue;
      include(target.id, target.quad);
    }
    for (final primitive in current.primitives) {
      if (!primitive.visible ||
          primitive.componentId == null ||
          !bounds.containsKey(primitive.ownerId))
        continue;
      include(
        primitive.ownerId,
        readableTransform(
          primitive,
          worldRotation: viewport.rotation,
        ).quad(primitive.localRect),
      );
    }
    return bounds;
  }

  String? hitTest(ui.Offset world) {
    final current = geometry;
    if (current == null) return null;
    return current.hitTest(world.dx, world.dy)?.id;
  }

  PatchMapTarget? hitTestTarget(ui.Offset world) {
    final current = geometry;
    if (current == null) return null;
    if (_pointerComponents == null) {
      final projected = <String, GeometryTarget>{};
      for (final primitive in current.primitives) {
        if (primitive.componentId == null ||
            primitive.contentOrientation != 'upright')
          continue;
        final key = '${primitive.ownerId}\u0000${primitive.componentId}',
            target = current.targets[key];
        if (target == null) continue;
        final transform = readableTransform(
          primitive,
          worldRotation: _rotation,
        );
        if (identical(transform, primitive.transform)) continue;
        final quad = transform.quad(primitive.localRect);
        projected[key] = GeometryTarget(
          id: target.id,
          type: target.type,
          bounds: MapBounds.points(quad),
          quad: quad,
          transform: transform,
          visible: target.visible,
          locked: target.locked,
          ownerId: target.ownerId,
          componentId: target.componentId,
          paintOrder: target.paintOrder,
        );
      }
      _pointerComponents = projected;
    }
    final target = current.hitTest(
      world.dx,
      world.dy,
      includeComponents: true,
      projectedComponents: _pointerComponents!,
    );
    return target == null
        ? null
        : PatchMapTarget(
            target.ownerId ?? target.id,
            componentId: target.componentId,
          );
  }

  void dispose() {
    if (disposed) return;
    disposed = true;
    _clearSvgImages();
    for (final mesh in _meshes) {
      mesh.dispose();
    }
    for (final text in _texts) {
      text.dispose();
    }
    _meshes.clear();
    _texts.clear();
    for (final painter in _textCache.values) {
      painter.dispose();
    }
    _textCache.clear();
    _usedTextCache.clear();
    _textSlots.clear();
    _commands.clear();
    geometry = null;
    _selectionGeometry = null;
    _selectionPaths = const [];
    _selectionClips = const [];
    _selected = const [];
    _alpha = const {};
    _theme = const {};
    _pointerComponents = null;
    _barMeshSlots.clear();
    _iconSlots.clear();
    _assetSlots.clear();
    _colors.clear();
  }
}
