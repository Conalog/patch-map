part of 'canvas_renderer.dart';

extension _CanvasText on PatchMapCanvasRenderer {
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
    // Active paragraphs plus at most 8192 inactive lines; never retain frames.
    var spare = _textCache.length - _usedTextCache.length - 8192;
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
}
