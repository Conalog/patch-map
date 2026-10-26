import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/widgets.dart' show Characters;

import 'paragraph_configuration.dart';
import 'text_spec.dart';

final class TextMetrics {
  const TextMetrics(this.fontSize, this.size, this.longestLine, this.lines);
  factory TextMetrics.fromLayout(OwnedTextLayout layout) => TextMetrics(
    layout.fontSize,
    layout.size,
    layout.longestLine,
    layout.lineCount,
  );
  final double fontSize, longestLine;
  final ui.Size size;
  final int lines;
}

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
    this.paintOpacity,
  );

  final double fontSize, longestLine;
  final ui.Paragraph paragraph;
  final ui.Paragraph? strokeParagraph;
  final ui.Size size;
  final int lineCount;
  final String visibleText;
  final ui.Offset paintOffset;
  final double paintOpacity;
  bool _disposed = false;
  bool get isDisposed => _disposed;
  double get paragraphWidth => paragraph.width;

  void paint(ui.Canvas canvas, ui.Offset offset, {double alphaMultiplier = 1}) {
    if (_disposed) throw StateError('Text layout has been disposed');
    final opacity = paintOpacity * alphaMultiplier;
    if (opacity == 0) return;
    if (opacity < 1) {
      canvas.saveLayer(
        (offset & size).inflate(1),
        ui.Paint()
          ..color = const ui.Color(0xffffffff).withValues(alpha: opacity),
      );
    }
    try {
      if (opacity < 1 && strokeParagraph != null) {
        // Impeller text coverage excludes part of the stroked glyph fringe.
        // Establish the padded ink extent inside the already-clear layer so
        // its offscreen allocation cannot crop those pixels. Src is required:
        // transparent srcOver is culled and contributes no coverage.
        canvas.drawRect(
          (offset & size).inflate(1),
          ui.Paint()
            ..color = const ui.Color(0x00000000)
            ..blendMode = ui.BlendMode.src,
        );
      }
      final origin = paintOffset == ui.Offset.zero
          ? offset
          : offset == ui.Offset.zero
          ? paintOffset
          : offset + paintOffset;
      if (strokeParagraph != null) {
        canvas.drawParagraph(strokeParagraph!, origin);
      }
      canvas.drawParagraph(paragraph, origin);
    } finally {
      if (opacity < 1) canvas.restore();
    }
  }

  void dispose() {
    if (_disposed) return;
    _disposed = true;
    strokeParagraph?.dispose();
    paragraph.dispose();
  }
}

/// Native shaping and bounded preparation; no native resource cache/scheduler.
final class NativeTextLayout {
  NativeTextLayout(
    this.spec, {
    this.onParagraphCreated,
    String Function(String family)? fontFamilyResolver,
    ParagraphPreparation? preparation,
  }) : _configuration =
           (preparation ??
                   ParagraphPreparation(fontFamilyResolver: fontFamilyResolver))
               .forParameters(spec.parameters);
  final TextSpec spec;
  final ParagraphConfiguration _configuration;

  /// An optional creation observer for resource accounting/diagnostics. It does
  /// not receive ownership. A throwing observer still disposes its paragraph.
  final void Function(ui.Paragraph)? onParagraphCreated;

  /// [measured] is supplied only after TextPool proves equivalent single-line
  /// metrics with no insets or overflow fitting. Its size contains the rounded
  /// Paragraph width, not the content bounds or the unrounded longest line.
  OwnedTextLayout resolve({double? resolvedFontSize, TextMetrics? measured}) {
    assert(resolvedFontSize == null || measured == null);
    resolvedFontSize ??= measured?.fontSize;
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
        final candidate = _candidate(
          text,
          fontSize,
          measuredWidth: measured?.size.width,
        );
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
      final size =
          measured?.size ??
          (visibleText.isEmpty ? ui.Size.zero : _size(chosen));
      final inset = _insets();
      final result = OwnedTextLayout._(
        fontSize,
        chosen,
        stroke,
        size,
        measured?.longestLine ?? chosen.longestLine,
        measured?.lines ??
            (visibleText.isEmpty ? 0 : chosen.computeLineMetrics().length),
        visibleText,
        inset.$1 == 0 && inset.$2 == 0
            ? ui.Offset.zero
            : ui.Offset(inset.$1, inset.$2),
        _configuration.paintOpacity,
      );
      chosen = null;
      stroke = null;
      return result;
    } finally {
      chosen?.dispose();
      stroke?.dispose();
    }
  }

  ({ui.Paragraph paragraph, String text}) _candidate(
    String text,
    double size, {
    double? measuredWidth,
  }) {
    final wrapped = _wrap(text, size);
    return (
      paragraph: _paragraph(wrapped, size, measuredWidth: measuredWidth),
      text: wrapped,
    );
  }

  ui.Paragraph _paragraph(
    String text,
    double size, {
    bool stroke = false,
    double? measuredWidth,
  }) {
    _configuration.prepareSize(size);
    final builder = ui.ParagraphBuilder(_configuration.paragraphStyle)
      ..pushStyle(_configuration.style(stroke: stroke))
      ..addText(text);
    final paragraph = builder.build();
    var transferred = false;
    try {
      onParagraphCreated?.call(paragraph);
      var width = measuredWidth;
      if (width == null) {
        paragraph.layout(const ui.ParagraphConstraints(width: double.infinity));
        width = paragraph.maxIntrinsicWidth.ceilToDouble();
      }
      paragraph.layout(_configuration.constraints(width));
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
    // One unbreakable token is unchanged by wrapping even when it exceeds the
    // width. Avoid measuring it once for wrap and again for the final layout.
    if (!spec.breakWords && text.isNotEmpty && !_whitespace.hasMatch(text)) {
      return text;
    }
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

final _whitespace = RegExp(r'\s');

String _split(String text, int split) {
  if (split <= 0) return text;
  final chars = Characters(text).toList(growable: false);
  return [
    for (var i = 0; i < chars.length; i += split)
      chars.skip(i).take(split).join(),
  ].join('\n').trim();
}
