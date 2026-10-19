import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/widgets.dart' show Characters;

import 'text_spec.dart';

/// One resolved layout. The caller owns its native paragraphs until [dispose].
final class OwnedTextLayout {
  OwnedTextLayout._(
    this.fontSize,
    this.paragraph,
    this.strokeParagraph,
    this.size,
    this.longestLine,
    this.lineCount,
    this.visibleText,
    this.paintOffset,
  );

  final double fontSize, longestLine;
  final ui.Paragraph paragraph;
  final ui.Paragraph? strokeParagraph;
  final ui.Size size;
  final int lineCount;
  final String visibleText;
  final ui.Offset paintOffset;
  bool _disposed = false;
  bool get isDisposed => _disposed;
  double get paragraphWidth => paragraph.width;

  void paint(ui.Canvas canvas, ui.Offset offset) {
    if (_disposed) throw StateError('Text layout has been disposed');
    if (strokeParagraph != null) {
      canvas.drawParagraph(strokeParagraph!, offset + paintOffset);
    }
    canvas.drawParagraph(paragraph, offset + paintOffset);
  }

  void dispose() {
    if (_disposed) return;
    _disposed = true;
    strokeParagraph?.dispose();
    paragraph.dispose();
  }
}

/// Native shaping and bounded preparation only; no cache, scheduler or pool.
final class NativeTextLayout {
  NativeTextLayout(
    this.spec, {
    this.onParagraphCreated,
    this.fontFamilyResolver,
  });
  final TextSpec spec;
  final String Function(String family)? fontFamilyResolver;
  String _family(String family) => fontFamilyResolver?.call(family) ?? family;

  /// An optional creation observer for resource accounting/diagnostics. It does
  /// not receive ownership. A throwing observer still disposes its paragraph.
  final void Function(ui.Paragraph)? onParagraphCreated;

  OwnedTextLayout resolve({double? resolvedFontSize}) {
    if (resolvedFontSize != null &&
        (!resolvedFontSize.isFinite || resolvedFontSize < 0)) {
      throw ArgumentError.value(resolvedFontSize, 'resolvedFontSize');
    }
    var text = _split(spec.text, spec.split);
    ui.Paragraph? chosen;
    var chosenText = '';
    ui.Paragraph? stroke;
    var fontSize = resolvedFontSize ?? spec.fontSize;
    try {
      if (resolvedFontSize == null && spec.auto && text.isEmpty) {
        fontSize = spec.autoMax.toDouble();
      }
      if (resolvedFontSize == null && spec.auto && text.isNotEmpty) {
        var low = spec.autoMin, high = spec.autoMax;
        fontSize = low.toDouble();
        while (low <= high) {
          final mid = (low + high) ~/ 2;
          final candidate = _candidate(text, mid.toDouble());
          if (_fits(candidate.paragraph, candidate.text)) {
            chosen?.dispose();
            chosen = candidate.paragraph;
            chosenText = candidate.text;
            fontSize = mid.toDouble();
            low = mid + 1;
          } else {
            candidate.paragraph.dispose();
            high = mid - 1;
          }
        }
      }
      if (chosen == null) {
        final candidate = _candidate(text, fontSize);
        chosen = candidate.paragraph;
        chosenText = candidate.text;
      }
      if (spec.overflow != 'visible' &&
          spec.bounds != null &&
          !_fits(chosen, chosenText)) {
        chosen.dispose();
        chosen = null;
        final graphemes = Characters(text).toList(growable: false);
        var low = 0, high = graphemes.length;
        var best = '';
        while (low <= high) {
          final mid = (low + high) ~/ 2;
          final suffix = spec.overflow == 'ellipsis' && mid < graphemes.length
              ? '…'
              : '';
          final candidateText = graphemes.take(mid).join() + suffix;
          final candidate = _candidate(candidateText, fontSize);
          if (_fits(candidate.paragraph, candidate.text)) {
            chosen?.dispose();
            chosen = candidate.paragraph;
            chosenText = candidate.text;
            best = candidateText;
            low = mid + 1;
          } else {
            candidate.paragraph.dispose();
            high = mid - 1;
          }
        }
        text = best;
        if (chosen == null) {
          final candidate = _candidate(text, fontSize);
          chosen = candidate.paragraph;
          chosenText = candidate.text;
        }
      }
      final visibleText = chosenText;
      if (spec.strokeColor != null && spec.strokeWidth > 0) {
        stroke = _paragraph(visibleText, fontSize, stroke: true);
      }
      final size = visibleText.isEmpty ? ui.Size.zero : _size(chosen);
      final inset = _insets();
      final result = OwnedTextLayout._(
        fontSize,
        chosen,
        stroke,
        size,
        chosen.longestLine,
        visibleText.isEmpty ? 0 : chosen.computeLineMetrics().length,
        visibleText,
        ui.Offset(inset.$1, inset.$2),
      );
      chosen = null;
      stroke = null;
      return result;
    } finally {
      chosen?.dispose();
      stroke?.dispose();
    }
  }

  ({ui.Paragraph paragraph, String text}) _candidate(String text, double size) {
    final wrapped = _wrap(text, size);
    return (paragraph: _paragraph(wrapped, size), text: wrapped);
  }

  ui.Paragraph _paragraph(String text, double size, {bool stroke = false}) {
    final paint = stroke
        ? (ui.Paint()
            ..color = spec.strokeColor!
            ..style = ui.PaintingStyle.stroke
            ..strokeWidth = spec.strokeWidth
            ..strokeJoin = spec.strokeJoin
            ..strokeCap = spec.strokeCap
            ..strokeMiterLimit = spec.strokeMiterLimit)
        : null;
    final builder =
        ui.ParagraphBuilder(
            ui.ParagraphStyle(
              textDirection: ui.TextDirection.ltr,
              textAlign: spec.align,
              fontFamily: _family(spec.fontFamilies.first),
              fontSize: size,
              fontWeight: spec.fontWeight,
              fontStyle: spec.fontStyle,
            ),
          )
          ..pushStyle(
            ui.TextStyle(
              fontFamily: _family(spec.fontFamilies.first),
              fontFamilyFallback: spec.fontFamilies
                  .skip(1)
                  .map(_family)
                  .toList(growable: false),
              fontSize: size,
              fontWeight: spec.fontWeight,
              fontStyle: spec.fontStyle,
              letterSpacing: spec.letterSpacing,
              height: size > 0 && spec.lineHeight != null
                  ? spec.lineHeight! / size
                  : null,
              color: stroke ? null : spec.color,
              foreground: paint,
              shadows: !stroke && spec.shadow != null ? [spec.shadow!] : null,
            ),
          )
          ..addText(text);
    final paragraph = builder.build();
    var transferred = false;
    try {
      onParagraphCreated?.call(paragraph);
      paragraph.layout(const ui.ParagraphConstraints(width: double.infinity));
      final width = paragraph.maxIntrinsicWidth.ceilToDouble();
      paragraph.layout(ui.ParagraphConstraints(width: width));
      transferred = true;
      return paragraph;
    } finally {
      if (!transferred) paragraph.dispose();
    }
  }

  bool _fits(ui.Paragraph paragraph, String text) {
    if (text.isEmpty) return true;
    final bounds = spec.bounds;
    if (bounds == null) return true;
    final size = _size(paragraph);
    return size.width <= bounds.width && size.height <= bounds.height;
  }

  // Keep alignment/placement width distinct from the ink/advance longest line.
  ui.Size _size(ui.Paragraph paragraph) {
    final (left, top, right, bottom) = _insets();
    return ui.Size(
      paragraph.width + left + right,
      paragraph.height + top + bottom,
    );
  }

  (double, double, double, double) _insets() {
    final edge = spec.padding + spec.strokeWidth / 2;
    final shadow = spec.shadow;
    if (shadow == null) return (edge, edge, edge, edge);
    final blur = shadow.blurRadius * 3;
    return (
      edge + math.max(0, blur - shadow.offset.dx),
      edge + math.max(0, blur - shadow.offset.dy),
      edge + math.max(0, blur + shadow.offset.dx),
      edge + math.max(0, blur + shadow.offset.dy),
    );
  }

  String _wrap(String text, double size) {
    if (!spec.wordWrap) return text;
    final collapse = spec.whiteSpace != 'pre';
    if (spec.whiteSpace == 'normal') {
      text = text.replaceAll(RegExp(r'\r\n|\r|\n'), ' ');
    }
    if (collapse) text = text.replaceAll(RegExp(r'[^\S\r\n]+'), ' ');
    final tokens = RegExp(r'\r\n|\r|\n|[^\S\r\n]|[^\s]+').allMatches(text);
    final widths = <String, double>{};
    double width(String token) => widths.putIfAbsent(token, () {
      final p = _paragraph(token, size);
      try {
        // Native advances already include one letterSpacing per grapheme;
        // Pixi's wrap cache adds its trailing spacing to an n-1 measurement.
        return p.longestLine;
      } finally {
        p.dispose();
      }
    });
    final limit = spec.wrapWidth! + spec.letterSpacing;
    final lines = <String>[];
    var line = '', used = 0.0, prependSpaces = !collapse;
    void endLine() {
      lines.add(line.trimRight());
      line = '';
      used = 0;
    }

    for (final match in tokens) {
      final token = match[0]!;
      if (token == '\n' || token == '\r' || token == '\r\n') {
        endLine();
        prependSpaces = !collapse;
        continue;
      }
      final tokenWidth = width(token);
      if (tokenWidth > limit) {
        if (line.isNotEmpty) endLine();
        if (!spec.breakWords) {
          lines.add(token.trimRight());
          prependSpaces = false;
          continue;
        }
        for (final char in Characters(token)) {
          final charWidth = width(char);
          if (used + charWidth > limit && line.isNotEmpty) {
            endLine();
            prependSpaces = false;
          }
          line += char;
          used += charWidth;
        }
      } else {
        if (used + tokenWidth > limit) {
          endLine();
          prependSpaces = false;
        }
        if (line.isNotEmpty || token.trim().isNotEmpty || prependSpaces) {
          line += token;
          used += tokenWidth;
        }
      }
    }
    if (line.trimRight().isNotEmpty) lines.add(line.trimRight());
    return lines.join('\n');
  }
}

String _split(String text, int split) {
  if (split <= 0) return text;
  final chars = Characters(text).toList(growable: false);
  return [
    for (var i = 0; i < chars.length; i += split)
      chars.skip(i).take(split).join(),
  ].join('\n').trim();
}
