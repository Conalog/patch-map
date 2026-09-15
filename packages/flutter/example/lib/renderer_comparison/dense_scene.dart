import 'dart:convert';
import 'dart:typed_data';
import 'package:patch_map/src/engine/ports.dart';
import 'package:patch_map/src/semantic/geometry/geometry.dart';
import 'package:patch_map/src/semantic/text/layout.dart';

/// Schema compiled once; mutations replace columns, visible rows sample time.
class DensePanelScene {
  DensePanelScene(this.initial) {
    final ps = initial.geometry.primitives;
    for (var slot = 0; slot < ps.length; slot++) {
      final p = ps[slot];
      if (p.type == 'bar') {
        barIndex[slot] = barIndex.length;
        barSlots.add(slot);
      }
      if (p.type == 'text') {
        textIndex[slot] = textIndex.length;
        textSlots.add(slot);
      }
    }
    if (barSlots.length != 5000 || textSlots.length != 5000)
      throw StateError('Expected 5000 service panels');
    from = Float64List(5000)..fillRange(0, 5000, 74);
    to = Float64List.fromList(from);
    start = Float64List(5000)..fillRange(0, 5000, -200);
    texts = List.filled(5000, '');
    _textPrimitives = List.filled(5000, null);
    for (final slot in textSlots) {
      final p = ps[slot];
      final b =
          initial.geometry.textBindings['${p.ownerId}\u0000${p.componentId}']!;
      textStyles[slot] = jsonEncode([
        p.value['style'],
        p.value['split'],
        b.frame.width,
        b.frame.height,
      ]);
    }
  }
  final PatchMapRenderSnapshot initial;
  final barIndex = <int, int>{}, textIndex = <int, int>{};
  final barSlots = <int>[], textSlots = <int>[];
  late Float64List from, to, start;
  late List<String> texts;
  late List<GeometryPrimitive?> _textPrimitives;
  final textStyles = <int, String>{};
  final _layoutCache = <(String, String), GeometryTextLayout>{};
  int revision = 0;
  bool textMode = false;
  double animationEnd = -1;
  double heightAt(int i, double now) {
    final t = ((now - start[i]) / 200).clamp(0.0, 1.0);
    if (t >= 1) return to[i];
    final inv = 1 - t, ease = 1 - inv * inv * inv;
    return from[i] * (1 - ease) + to[i] * ease;
  }

  void heights(List<double> values, double now, {required bool animate}) {
    if (values.length != 5000 ||
        values.any((v) => !v.isFinite || v < 0 || v > 74))
      throw ArgumentError('Height columns');
    for (var i = 0; i < 5000; i++) {
      from[i] = heightAt(i, now);
      to[i] = values[i];
      start[i] = animate ? now : now - 200;
    }
    animationEnd = animate ? now + 200 : now;
    revision++;
  }

  void textValues(List<String> values) {
    if (values.length != 5000) throw ArgumentError('Text column');
    texts = List.of(values);
    _textPrimitives = List.filled(5000, null);
    revision++;
  }

  void mode(bool text, double now) {
    textMode = text;
    if (text) heights(List.filled(5000, 74), now, animate: false);
    revision++;
  }

  GeometryPrimitive textAt(int slot) {
    final i = textIndex[slot]!;
    final cached = _textPrimitives[i];
    if (cached != null) return cached;
    final old = initial.geometry.primitives[slot],
        value = {...initial.geometry.primitives[slot].value, 'text': texts[i]};
    final b = initial
        .geometry
        .textBindings['${old.ownerId}\u0000${old.componentId}']!;
    final style = value['style'] as Map<String, dynamic>;
    final key = (texts[i], textStyles[slot]!);
    final layout =
        _layoutCache.remove(key) ??
        layoutGeometryText(
          texts[i],
          style,
          frame: b.frame,
          overflow: style['overflow'] as String?,
          split: (value['split'] as num).toInt(),
        );
    _layoutCache[key] = layout;
    if (_layoutCache.length > 10000)
      _layoutCache.remove(_layoutCache.keys.first);
    final local = resolvePlacement(
      b.content,
      layout.width,
      layout.height,
      value['placement'] as String,
      value['margin'] as Map<String, dynamic>,
    );
    return _textPrimitives[i] = GeometryPrimitive(
      ownerId: old.ownerId,
      componentId: old.componentId,
      type: old.type,
      value: value,
      localRect: MapRect(0, 0, local.width, local.height),
      transform: b.owner
          .multiply(MapAffine(1, 0, 0, 1, local.x, local.y))
          .multiply(b.attrs),
      opacity: old.opacity,
      visible: true,
      contentOrientation: old.contentOrientation,
      textLayout: layout.layout,
    );
  }
}
