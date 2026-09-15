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
  final _colors = <(Object, int), ui.Color>{};
  final Set<TextPainter> _texts = {};
  final _textSlots = <int, (int, List<TextPainter>)>{};
  final _textCache = <(String, TextStyle, TextDirection), TextPainter>{};
  final _usedTextCache = <TextPainter>{};
  final List<_PaintCommand> _commands = [];
  bool disposed = false;
  int get commandCount => _commands.length;
  int get visiblePrimitiveCount =>
      geometry?.primitives.where((p) => p.visible && p.opacity > 0).length ?? 0;

  void prepare(PatchMapRenderSnapshot snapshot) {
    if (disposed) return;
    final previous = geometry;
    final changed = !identical(previous, snapshot.geometry);
    final topologyChanged = !identical(
      previous?.topology,
      snapshot.geometry.topology,
    );
    geometry = snapshot.geometry;
    if (topologyChanged) {
      final boundaries = <double>{};
      for (final primitive in geometry!.primitives) {
        if (primitive.contentOrientation != 'upright' || !primitive.visible)
          continue;
        final angle =
            math.atan2(primitive.transform.b, primitive.transform.a) *
            180 /
            math.pi;
        boundaries.add((90 - angle) % 360);
        boundaries.add((270 - angle) % 360);
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
    if (!paintChanged) return;
    _selectionGeometry = null;
    _pointerComponents = null;
    _selectionMode = null;
    if (changed &&
        !topologyChanged &&
        !styleChanged &&
        (_updateBarMeshes(previous!) ||
            _updateTextCommands(previous, snapshot)))
      return;
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

  bool _updateTextCommands(
    PatchMapGeometry previous,
    PatchMapRenderSnapshot snapshot,
  ) {
    final current = geometry!;
    if (!identical(current.baseProjection, previous.projectionIdentity))
      return false;
    for (final index in current.changedPrimitiveSlots) {
      final p = current.primitives[index];
      if (p.type != 'text' ||
          (p.visible && p.opacity > 0 && !_textSlots.containsKey(index)))
        return false;
    }
    _usedTextCache.clear();
    // Pins from unchanged commands must survive cache pruning.
    final changed = current.changedPrimitiveSlots.toSet();
    for (final entry in _textSlots.entries) {
      if (!changed.contains(entry.key))
        _usedTextCache.addAll(entry.value.$2.where((p) => !_texts.contains(p)));
    }
    for (final index in current.changedPrimitiveSlots) {
      final old = _textSlots[index];
      if (old == null) continue;
      for (final text in old.$2) {
        if (_texts.remove(text)) text.dispose();
      }
      final primitive = current.primitives[index];
      final key = '${primitive.ownerId}\u0000${primitive.componentId}';
      final alpha =
          primitive.opacity *
          (snapshot.presentationAlpha[key] ??
              snapshot.presentationAlpha[primitive.ownerId] ??
              1);
      final next = _textCommand(primitive, alpha);
      _commands[old.$1] = next.$1;
      _textSlots[index] = (old.$1, next.$2);
    }
    _pruneTextCache();
    return true;
  }

  TextPainter _linePainter(
    String text,
    TextStyle style,
    TextDirection direction,
    bool cache,
  ) {
    if (!cache) {
      final painter = TextPainter(
        text: TextSpan(text: text, style: style),
        textDirection: direction,
      )..layout();
      _texts.add(painter);
      return painter;
    }
    final key = (text, style, direction);
    final painter =
        _textCache.remove(key) ??
        (TextPainter(
          text: TextSpan(text: text, style: style),
          textDirection: direction,
        )..layout());
    _textCache[key] = painter;
    _usedTextCache.add(painter);
    return painter;
  }

  void _pruneTextCache() {
    // Active paragraphs plus at most 1024 inactive lines; never retain frames.
    var spare = _textCache.length - _usedTextCache.length - 1024;
    if (spare <= 0) return;
    final remove = <(String, TextStyle, TextDirection)>[];
    for (final entry in _textCache.entries) {
      if (!_usedTextCache.contains(entry.value) && spare > 0) {
        remove.add(entry.key);
        spare--;
      }
    }
    for (final key in remove) _textCache.remove(key)!.dispose();
  }

  void refreshAssets(PatchMapRenderSnapshot snapshot) {
    if (!disposed && geometry != null) {
      for (final painter in _textCache.values) {
        painter.dispose();
      }
      _textCache.clear();
      _usedTextCache.clear();
      _rebuild(snapshot);
    }
  }

  void _rebuild(PatchMapRenderSnapshot snapshot) {
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
        final asset = assets?.lookup(source!, key);
        if (asset != null) {
          _commands.add((canvas) {
            canvas.save();
            canvas.transform(
              _matrix(readableTransform(primitive, worldRotation: _rotation)),
            );
            final rect = _rect(primitive.localRect);
            final tint = _color(value['tint'], const ui.Color(0xffffffff));
            final paint = ui.Paint()
              ..isAntiAlias = antialias
              ..color = ui.Color.fromRGBO(255, 255, 255, alpha.clamp(0, 1))
              ..colorFilter = ui.ColorFilter.mode(tint, ui.BlendMode.modulate);
            if (asset.image != null)
              canvas.drawImageRect(
                asset.image!,
                ui.Rect.fromLTWH(0, 0, asset.width, asset.height),
                rect,
                paint,
              );
            if (asset.picture != null) {
              canvas.saveLayer(rect, paint);
              canvas.translate(rect.left, rect.top);
              canvas.scale(
                rect.width / asset.width,
                rect.height / asset.height,
              );
              canvas.drawPicture(asset.picture!);
              canvas.restore();
            }
            canvas.restore();
          });
        }
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
        final radius = _radius(style['radius']);
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
        final borderWidth =
            (style['borderWidth'] as num?)?.toDouble() ??
            (stroke is Map ? (stroke['width'] as num?)?.toDouble() : null) ??
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

  (_PaintCommand, List<TextPainter>) _textCommand(
    GeometryPrimitive primitive,
    double alpha,
  ) {
    final value = primitive.value;
    final style = value['style'] as Map? ?? const {};
    final layout = primitive.textLayout as SemanticTextLayout;
    final weight = style['fontWeight'];
    final numericWeight = weight is num
        ? weight.toInt()
        : {'normal': 400, 'bold': 700, 'bolder': 700, 'lighter': 300}[weight] ??
              int.tryParse('$weight') ??
              400;
    final painters = <TextPainter>[];
    final strokePainters = <TextPainter>[];
    final color = _color(
      primitive.componentId == null
          ? style['fill']
          : value['tint'] ?? style['fill'],
      const ui.Color(0xff1a1a1a),
    );
    final textAlpha = alpha * number(style['alpha'], 1);
    final family = style['fontFamily'];
    final families = family is List
        ? family.cast<String>()
        : [family is String ? family : 'FiraCode'];
    final stroke = style['stroke'];
    final strokeWidth = stroke is Map
        ? number(stroke['width'], 1)
        : number(style['strokeWidth'], 1);
    final rasterStyle = TextStyle(
      fontFamily: families.isEmpty ? null : families.first,
      fontFamilyFallback: families.length > 1
          ? families.skip(1).toList()
          : null,
      fontSize: layout.fontSize,
      fontStyle:
          style['fontStyle'] == 'italic' || style['fontStyle'] == 'oblique'
          ? FontStyle.italic
          : FontStyle.normal,
      fontWeight:
          FontWeight.values[((numericWeight / 100).round() - 1).clamp(0, 8)],
      color: applyOpacity(color, textAlpha),
      letterSpacing: layout.letterSpacing,
      // The v1 alpha leaf-text-style authority retains fontVariant/dropShadow
      // in authored data but does not pass them into its Pixi raster style.
    );
    for (var i = 0; i < layout.lines.length; i++) {
      final direction =
          i < layout.bidiLines.length &&
              layout.bidiLines[i].baseDirection == 'rtl'
          ? TextDirection.rtl
          : TextDirection.ltr;
      final text = _linePainter(
        layout.lines[i],
        rasterStyle,
        direction,
        style['align'] != 'justify',
      );
      painters.add(text);
      if (stroke != null && strokeWidth > 0) {
        final strokeColor = stroke is Map ? stroke['color'] : stroke;
        final strokeAlpha =
            textAlpha * (stroke is Map ? number(stroke['alpha'], 1) : 1);
        final paint = ui.Paint()
          ..isAntiAlias = antialias
          ..style = ui.PaintingStyle.stroke
          ..strokeWidth = strokeWidth
          // Pixi leaf stroke consumes a direct ColorSource, unlike the dense
          // deterministic paint-token parser used for the glyph fill tint.
          ..color = multiplyColor(
            mapColor(normalizeDirectColor(strokeColor)),
            color,
            strokeAlpha,
          );
        if (stroke is Map) {
          paint.strokeCap = switch (stroke['cap']) {
            'round' => ui.StrokeCap.round,
            'square' => ui.StrokeCap.square,
            _ => ui.StrokeCap.butt,
          };
          paint.strokeJoin = switch (stroke['join']) {
            'round' => ui.StrokeJoin.round,
            'bevel' => ui.StrokeJoin.bevel,
            _ => ui.StrokeJoin.miter,
          };
          paint.strokeMiterLimit = number(stroke['miterLimit'], 10);
        }
        final strokeText = TextPainter(
          text: TextSpan(
            text: layout.lines[i],
            style: rasterStyle.copyWith(foreground: paint, shadows: const []),
          ),
          textDirection: direction,
        )..layout();
        strokePainters.add(strokeText);
        _texts.add(strokeText);
      }
    }
    final rect = _rect(primitive.localRect);
    final maxWidth = painters.fold<double>(
      0,
      (value, line) => math.max(value, line.width),
    );
    if (style['align'] == 'justify') {
      // Pixi expands ASCII word gaps on every semantic line except the last.
      // Reusing each paragraph preserves shaping/bidi and avoids word widgets.
      for (var i = 0; i < painters.length - 1; i++) {
        final spaces = ' '.allMatches(layout.lines[i]).length;
        if (spaces == 0) continue;
        final spacing = (maxWidth - painters[i].width) / spaces;
        for (final painter in [
          painters[i],
          if (strokePainters.isNotEmpty) strokePainters[i],
        ]) {
          final span = painter.text as TextSpan;
          painter.text = TextSpan(
            text: span.text,
            style: span.style!.copyWith(wordSpacing: spacing),
          );
          painter.layout();
        }
      }
    }
    final rasterHeight = painters.isEmpty
        ? 0.0
        : (painters.length - 1) * layout.lineHeight + painters.last.height;
    final fitted = primitive.componentId != null;
    final scale = fitted && maxWidth > 0 && rasterHeight > 0
        ? math.min(
            1.0,
            math.min(rect.width / maxWidth, rect.height / rasterHeight),
          )
        : 1.0;
    return (
      (canvas) {
        canvas.save();
        canvas.transform(
          _matrix(readableTransform(primitive, worldRotation: _rotation)),
        );
        final overflow = value['overflow'] ?? style['overflow'];
        if (overflow == 'hidden' || overflow == 'ellipsis')
          canvas.clipRect(rect);
        final offset = fitted
            ? ui.Offset(
                rect.left + (rect.width - maxWidth * scale) / 2,
                rect.top + (rect.height - rasterHeight * scale) / 2,
              )
            : rect.topLeft;
        canvas.translate(offset.dx, offset.dy);
        canvas.scale(scale);
        for (var i = 0; i < painters.length; i++) {
          final line = painters[i];
          final x = style['align'] == 'center'
              ? (maxWidth - line.width) / 2
              : style['align'] == 'right'
              ? maxWidth - line.width
              : 0.0;
          final position = ui.Offset(x, i * layout.lineHeight);
          if (strokePainters.isNotEmpty)
            strokePainters[i].paint(canvas, position);
          line.paint(canvas, position);
        }
        canvas.restore();
      },
      [...painters, ...strokePainters],
    );
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
    _colors.clear();
  }
}

ui.Rect _rect(MapRect r) => ui.Rect.fromLTWH(r.x, r.y, r.width, r.height);
Float64List _matrix(MapAffine m) => Float64List.fromList([
  m.a,
  m.b,
  0,
  0,
  m.c,
  m.d,
  0,
  0,
  0,
  0,
  1,
  0,
  m.tx,
  m.ty,
  0,
  1,
]);
double _radius(Object? value) => value is num
    ? value.toDouble()
    : value is List
    ? value.whereType<num>().fold<double>(
        0,
        (a, b) => math.max(a, b.toDouble()),
      )
    : value is Map
    ? value.values.whereType<num>().fold<double>(
        0,
        (a, b) => math.max(a, b.toDouble()),
      )
    : 0;

List<double> _corners(Object? value) {
  if (value is List)
    return [
      for (var i = 0; i < 4; i++) number(i < value.length ? value[i] : 0),
    ];
  if (value is Map)
    return [
      for (final key in ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'])
        number(value[key]),
    ];
  return List.filled(4, number(value));
}

ui.RRect _rrect(MapRect rect, List<double> corners) =>
    ui.RRect.fromRectAndCorners(
      _rect(rect),
      topLeft: ui.Radius.circular(corners[0]),
      topRight: ui.Radius.circular(corners[1]),
      bottomRight: ui.Radius.circular(corners[2]),
      bottomLeft: ui.Radius.circular(corners[3]),
    );

final _unitCorners = [
  for (var corner = 0; corner < 4; corner++)
    for (var segment = 0; segment <= 4; segment++)
      (
        x: math.cos(
          -math.pi / 2 + corner * math.pi / 2 + segment * math.pi / 8,
        ),
        y: math.sin(
          -math.pi / 2 + corner * math.pi / 2 + segment * math.pi / 8,
        ),
      ),
];

void _roundedTriangles(
  MapRect r,
  MapAffine m,
  List<double> radii,
  int color,
  List<double> positions,
  List<int> colors,
  List<int> indices, {
  bool retainDegenerate = false,
}) {
  if (!retainDegenerate && (r.width <= 0 || r.height <= 0)) return;
  final base = colors.length;
  void vertex(double x, double y) {
    positions.add(m.a * x + m.c * y + m.tx);
    positions.add(m.b * x + m.d * y + m.ty);
    colors.add(color);
  }

  if (radii.every((radius) => radius <= 0)) {
    vertex(r.x, r.y);
    vertex(r.x + r.width, r.y);
    vertex(r.x + r.width, r.y + r.height);
    vertex(r.x, r.y + r.height);
    indices.addAll([base, base + 1, base + 2, base, base + 2, base + 3]);
    return;
  }
  vertex(r.x + r.width / 2, r.y + r.height / 2);
  for (var corner = 0; corner < 4; corner++) {
    final radius = radii[(corner + 1) % 4].clamp(
      0.0,
      math.min(r.width, r.height) / 2,
    );
    final cx = corner < 2 ? r.x + r.width - radius : r.x + radius;
    final cy = corner == 0 || corner == 3
        ? r.y + radius
        : r.y + r.height - radius;
    for (var segment = 0; segment <= 4; segment++) {
      final unit = _unitCorners[corner * 5 + segment];
      vertex(cx + unit.x * radius, cy + unit.y * radius);
    }
  }
  for (var i = 0; i < 20; i++) {
    indices.add(base);
    indices.add(base + 1 + i);
    indices.add(base + 1 + (i + 1) % 20);
  }
}

class _MeshChunk {
  _MeshChunk(
    this.positions,
    this.colors,
    this.indices, {
    required bool antialias,
  }) : paintStyle = ui.Paint()..isAntiAlias = antialias {
    publish();
  }
  final Float32List positions;
  final Int32List colors;
  final Uint16List indices;
  ui.Vertices? mesh;
  final ui.Paint paintStyle;
  void publish() {
    mesh?.dispose();
    mesh = ui.Vertices.raw(
      ui.VertexMode.triangles,
      positions,
      colors: colors,
      indices: indices,
    );
  }

  void paint(ui.Canvas canvas) =>
      canvas.drawVertices(mesh!, ui.BlendMode.srcOver, paintStyle);
  void dispose() {
    mesh?.dispose();
    mesh = null;
  }
}

class _MeshSlot {
  const _MeshSlot(this.chunk, this.offset, this.radius);
  final _MeshChunk chunk;
  final int offset;
  final double radius;
}

void _writeBarPositions(
  MapRect r,
  MapAffine m,
  double authoredRadius,
  Float32List positions,
  int offset,
) {
  void vertex(double x, double y) {
    positions[offset++] = m.a * x + m.c * y + m.tx;
    positions[offset++] = m.b * x + m.d * y + m.ty;
  }

  if (authoredRadius <= 0) {
    vertex(r.x, r.y);
    vertex(r.x + r.width, r.y);
    vertex(r.x + r.width, r.y + r.height);
    vertex(r.x, r.y + r.height);
    return;
  }
  vertex(r.x + r.width / 2, r.y + r.height / 2);
  final radius = authoredRadius.clamp(0.0, math.min(r.width, r.height) / 2);
  for (var corner = 0; corner < 4; corner++) {
    final cx = corner < 2 ? r.x + r.width - radius : r.x + radius,
        cy = corner == 0 || corner == 3
            ? r.y + radius
            : r.y + r.height - radius;
    for (var segment = 0; segment <= 4; segment++) {
      final unit = _unitCorners[corner * 5 + segment];
      vertex(cx + unit.x * radius, cy + unit.y * radius);
    }
  }
}
