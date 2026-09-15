// Experimental renderer qualified only for the disjoint service panel scene.
import 'dart:math' as math;
import 'dart:ui' as ui;
import 'batches.dart';
import 'dense_scene.dart';
import 'package:flutter/painting.dart';
// Intentional experiment-only imports; no production dependency on Flame.
import 'package:patch_map/src/engine/ports.dart';
import 'package:patch_map/src/semantic/geometry/geometry.dart';
import 'package:patch_map/src/semantic/text/layout.dart';
import 'package:patch_map/src/rendering/color.dart';

class FlamePanelRenderer {
  FlamePanelRenderer({
    this.atlasBars = true,
    this.flameBatch = true,
    this.minAtlasScale = 0.4,
  });
  final double minAtlasScale;
  final bool atlasBars;
  final bool flameBatch;
  DensePanelScene? dense;
  double sampleTime = 0;
  int _denseRevision = -1;
  final _displayHeights = <int, double>{};
  static const ratio = 4.0, pad = 2.0;
  ui.Image? _atlas;
  PatchMapGeometry? _geometry;
  final _groups = <String, _Group>{};
  final _barSlots = <int, (_Group, List<int>)>{};
  final _texts = <(String, TextStyle, TextDirection), TextPainter>{};
  final _used = <TextPainter>{};
  final _textCommands = <int, void Function(ui.Canvas)>{};
  final _spritePaint = ui.Paint()..filterQuality = ui.FilterQuality.medium;
  final _barPaint = ui.Paint()..isAntiAlias = false;
  late ui.Rect _barSource;
  late double _barWidth, _barHeight, _radius;
  int visibleGroups = 0;

  void prepare(PatchMapRenderSnapshot snapshot) {
    final geometry = snapshot.geometry;
    if (identical(_geometry, geometry)) return;
    final previous = _geometry;
    if (previous == null || !identical(previous.topology, geometry.topology)) {
      _clearScene();
      _initialize(snapshot);
    }
    _geometry = geometry;
    final changed =
        previous != null &&
            identical(previous.topology, geometry.topology) &&
            identical(geometry.baseProjection, previous.projectionIdentity)
        ? geometry.changedPrimitiveSlots
        : List.generate(geometry.primitives.length, (i) => i);
    for (final slot in changed) {
      final p = geometry.primitives[slot];
      if (p.type == 'bar') _updateBar(slot, p);
      if (p.type == 'text') _textCommands.remove(slot);
    }
    // Text shaping is demand-driven at paint, while semantic updates still cover
    // every panel. Old paragraphs are pruned after visible commands are pinned.
  }

  void _initialize(PatchMapRenderSnapshot snapshot) {
    final geometry = snapshot.geometry;
    final bg = geometry.primitives.firstWhere((p) => p.type == 'background');
    final bar = geometry.primitives.firstWhere((p) => p.type == 'bar');
    final bstyle = bg.value['source'] as Map;
    final style = bar.value['source'] as Map;
    _barWidth = bar.localRect.width;
    _barHeight = 74;
    _radius = (style['radius'] as num).toDouble();
    final fill = mapColor(
      bstyle['fill'],
      const ui.Color(0xffffffff),
      snapshot.theme,
    );
    final border = mapColor(
      bstyle['borderColor'],
      const ui.Color(0xff000000),
      snapshot.theme,
    );
    _barPaint.color = multiplyColor(
      mapColor(style['fill'], const ui.Color(0xffffffff), snapshot.theme),
      mapColor(bar.value['tint'], const ui.Color(0xffffffff), snapshot.theme),
      1,
    );
    final recorder = ui.PictureRecorder();
    final c = ui.Canvas(recorder)..scale(ratio);
    final bx = pad;
    c.drawRRect(
      ui.RRect.fromRectAndRadius(
        ui.Rect.fromLTWH(bx, pad, _barWidth, _barHeight),
        ui.Radius.circular(_radius),
      ),
      _barPaint,
    );
    final picture = recorder.endRecording();
    _atlas = picture.toImageSync(
      ((bx + _barWidth + pad) * ratio).ceil(),
      ((bg.localRect.height + pad * 2) * ratio).ceil(),
    );
    picture.dispose();
    _barSource = ui.Rect.fromLTWH(
      bx * ratio,
      pad * ratio,
      _barWidth * ratio,
      _barHeight * ratio,
    );
    final ownerBounds = <String, ui.Rect>{};
    for (var i = 0; i < geometry.primitives.length; i++) {
      final p = geometry.primitives[i];
      final t = p.transform;
      if (t.a != 1 || t.b != 0 || t.c != 0 || t.d != 1)
        throw StateError('Experiment requires axis-aligned unit transforms');
      final name = p.ownerId.split('.').first;
      final group = _groups.putIfAbsent(
        name,
        () => _Group(_atlas!, flameBatch),
      );
      if (p.type == 'background') {
        final rect = ui.Rect.fromLTWH(
          t.tx,
          t.ty,
          p.localRect.width,
          p.localRect.height,
        );
        // Check disjoint owner bounds within the group before lane reordering.
        for (final other in group.panelBounds)
          if (rect.inflate(1).overlaps(other.inflate(1)))
            throw StateError('Overlapping panels');
        group.panelBounds.add(rect);
        ownerBounds[p.ownerId] = rect;
        group.bounds = group.bounds == null
            ? rect
            : group.bounds!.expandToInclude(rect);
      } else if (p.type == 'bar') {
        final handles = [
          for (var j = 0; j < 3; j++)
            group.bars.addTransform(
              source: ui.Rect.zero,
              transform: ui.RSTransform(1 / ratio, 0, t.tx, t.ty),
            ),
        ];
        _barSlots[i] = (group, handles);
        group.barIndices.add(i);
      } else if (p.type == 'text') {
        group.textIndices.add(i);
      } else if (p.visible)
        throw StateError('Unsupported visible primitive ${p.type}');
    }
    // Scene-level group overlap is also forbidden.
    for (final g in _groups.values) {
      g.cachedBackground = PanelBackground(
        g.panelBounds,
        fill,
        border,
        (bstyle['radius'] as num).toDouble(),
        (bstyle['borderWidth'] as num).toDouble(),
        flame: flameBatch,
      );
    }
    final groups = _groups.values.toList();
    for (var i = 0; i < groups.length; i++)
      for (var j = i + 1; j < groups.length; j++)
        if (groups[i].bounds!.inflate(1).overlaps(groups[j].bounds!.inflate(1)))
          throw StateError('Overlapping panel groups');
    for (final p in geometry.primitives.where(
      (p) => p.visible && p.type != 'background',
    )) {
      final owner = ownerBounds[p.ownerId]!;
      final b = p.bounds;
      if (!owner.contains(ui.Offset(b.left, b.top)) ||
          b.right > owner.right ||
          b.bottom > owner.bottom)
        throw StateError('Overflow requires ordered general renderer');
    }
  }

  void _updateBar(
    int slot,
    GeometryPrimitive p, {
    double? height,
    bool useSprites = true,
  }) {
    final entry = _barSlots[slot]!;
    final batch = entry.$1.bars;
    final handles = entry.$2;
    final h = height ?? (p.visible ? p.localRect.height : 0.0);
    final x = p.transform.tx, y = p.transform.ty + p.localRect.height - h;
    _displayHeights[slot] = h;
    if (!useSprites) return;
    if (!atlasBars || h < 2 * _radius) {
      for (final handle in handles) batch.replace(handle, source: ui.Rect.zero);
      return;
    }
    if (h > _barHeight) throw StateError('Height outside service panel');
    final sourceWidth = _barWidth * ratio;
    batch.replaceSlice(
      handles[0],
      _barSource.left,
      _barSource.top,
      sourceWidth,
      _radius * ratio,
      1 / ratio,
      x,
      y,
    );
    batch.replaceSlice(
      handles[1],
      _barSource.left,
      _barSource.top + _radius * ratio,
      sourceWidth,
      (h - 2 * _radius) * ratio,
      1 / ratio,
      x,
      y + _radius,
    );
    batch.replaceSlice(
      handles[2],
      _barSource.left,
      _barSource.bottom - _radius * ratio,
      sourceWidth,
      _radius * ratio,
      1 / ratio,
      x,
      y + h - _radius,
    );
  }

  void paint(
    ui.Canvas canvas,
    ui.Size size,
    PatchMapRenderSnapshot snapshot, {
    ui.Rect? visibleWorldRect,
  }) {
    canvas.drawColor(const ui.Color(0xfffafafa), ui.BlendMode.srcOver);
    final v = snapshot.viewport;
    if (v.rotation != 0)
      throw StateError('Service comparison rotation is zero');
    if (v.scale * v.pixelRatio > ratio)
      throw StateError('Zoom exceeds atlas qualification');
    final world =
        visibleWorldRect ??
        ui.Rect.fromCenter(
          center: ui.Offset(v.centerX, v.centerY),
          width: v.width / v.scale,
          height: v.height / v.scale,
        );
    canvas.save();
    canvas.clipRect(ui.Offset.zero & size);
    canvas.translate(v.width / 2, v.height / 2);
    canvas.scale(v.scale);
    canvas.translate(-v.centerX, -v.centerY);
    visibleGroups = 0;
    _used.clear();
    if (dense != null && _denseRevision != dense!.revision) {
      _textCommands.clear();
      _denseRevision = dense!.revision;
    }
    for (final group in _groups.values) {
      if (!group.bounds!.inflate(1).overlaps(world)) continue;
      visibleGroups++;
      if (dense != null) {
        for (final slot in group.barIndices) {
          _updateBar(
            slot,
            snapshot.geometry.primitives[slot],
            height: dense!.heightAt(dense!.barIndex[slot]!, sampleTime),
            useSprites: atlasBars && v.scale >= minAtlasScale,
          );
        }
      }
      group.cachedBackground!.render(canvas);
      if (atlasBars && v.scale >= minAtlasScale)
        group.bars.render(canvas, paint: _spritePaint);
      for (final slot in group.barIndices) {
        final p = snapshot.geometry.primitives[slot];
        final h = _displayHeights[slot] ?? p.localRect.height;
        if (!p.visible || h <= 0) continue;
        if (!atlasBars || v.scale < minAtlasScale || h < 2 * _radius) {
          final r = ui.Rect.fromLTWH(
            p.transform.tx,
            p.transform.ty + p.localRect.height - h,
            p.localRect.width,
            h,
          );
          if (r.overlaps(world))
            canvas.drawRRect(
              ui.RRect.fromRectAndRadius(
                r,
                ui.Radius.circular(math.min(_radius, h / 2)),
              ),
              _barPaint,
            );
        }
      }
      for (final slot in group.textIndices) {
        if (dense != null && !dense!.textMode) continue;
        final base = snapshot.geometry.primitives[slot];
        if (dense == null && !base.visible) continue;
        final owner = snapshot.geometry.targets[base.ownerId]!.bounds;
        if (!ui.Rect.fromLTRB(
          owner.left,
          owner.top,
          owner.right,
          owner.bottom,
        ).overlaps(world))
          continue;
        final p = dense?.textAt(slot) ?? base;
        final b = p.bounds;
        if (!ui.Rect.fromLTRB(b.left, b.top, b.right, b.bottom).overlaps(world))
          continue;
        // Command compilation pins all paragraphs used in this render, including
        // unchanged commands. Cache lifetime never depends on input sample values.
        final command = _textCommands.putIfAbsent(
          slot,
          () => _compileText(p, snapshot),
        );
        command(canvas);
      }
    }
    canvas.restore();
    // The paragraph cache is bounded; commands retain active painters. Rebuild
    // text commands when pruning so no closure can keep a disposed painter.
    if (_texts.length > 12000) {
      _textCommands.clear();
      for (final e
          in _texts.entries.where((e) => !_used.contains(e.value)).toList()) {
        e.value.dispose();
        _texts.remove(e.key);
        if (_texts.length <= 10000) break;
      }
    }
  }

  void Function(ui.Canvas) _compileText(
    GeometryPrimitive p,
    PatchMapRenderSnapshot snapshot,
  ) {
    final layout = p.textLayout as SemanticTextLayout;
    final style = p.value['style'] as Map;
    if (style['align'] == 'justify' || style['stroke'] != null)
      throw StateError('Unsupported comparison text style');
    final family = style['fontFamily'];
    final families = family is List
        ? family.cast<String>()
        : [family is String ? family : 'FiraCode'];
    final weight = int.tryParse('${style['fontWeight']}') ?? 400;
    final textStyle = TextStyle(
      fontFamily: families.first,
      fontFamilyFallback: families.skip(1).toList(),
      fontSize: layout.fontSize,
      fontWeight: FontWeight.values[(weight ~/ 100 - 1).clamp(0, 8)],
      color: mapColor(
        p.value['tint'] ?? style['fill'],
        const ui.Color(0xff1a1a1a),
        snapshot.theme,
      ),
      letterSpacing: layout.letterSpacing,
    );
    final painters = <TextPainter>[];
    for (var i = 0; i < layout.lines.length; i++) {
      final direction = layout.bidiLines[i].baseDirection == 'rtl'
          ? TextDirection.rtl
          : TextDirection.ltr;
      painters.add(
        _texts.putIfAbsent(
          (layout.lines[i], textStyle, direction),
          () => TextPainter(
            text: TextSpan(text: layout.lines[i], style: textStyle),
            textDirection: direction,
          )..layout(),
        ),
      );
    }
    final maxWidth = painters.fold<double>(0, (v, p) => math.max(v, p.width));
    final height = painters.isEmpty
        ? 0.0
        : (painters.length - 1) * layout.lineHeight + painters.last.height;
    final rect = p.localRect;
    final scale = maxWidth > 0 && height > 0
        ? math.min(1.0, math.min(rect.width / maxWidth, rect.height / height))
        : 1.0;
    return (canvas) {
      _used.addAll(painters);
      canvas.save();
      canvas.translate(
        p.transform.tx + (rect.width - maxWidth * scale) / 2,
        p.transform.ty + (rect.height - height * scale) / 2,
      );
      canvas.scale(scale);
      for (var i = 0; i < painters.length; i++) {
        final line = painters[i];
        line.paint(
          canvas,
          ui.Offset((maxWidth - line.width) / 2, i * layout.lineHeight),
        );
      }
      canvas.restore();
    };
  }

  void _clearScene() {
    for (final group in _groups.values) {
      group.cachedBackground?.dispose();
    }
    _groups.clear();
    _barSlots.clear();
    _textCommands.clear();
    _atlas?.dispose();
    _atlas = null;
  }

  void dispose() {
    _clearScene();
    for (final p in _texts.values) p.dispose();
    _texts.clear();
    _used.clear();
    _geometry = null;
  }
}

class _Group {
  _Group(ui.Image atlas, bool flame) : bars = PanelBatch(atlas, flame, 300);
  final PanelBatch bars;
  PanelBackground? cachedBackground;
  ui.Rect? bounds;
  final panelBounds = <ui.Rect>[];
  final barIndices = <int>[], textIndices = <int>[];
}
