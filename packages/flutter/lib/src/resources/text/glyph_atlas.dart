import 'dart:async';
import 'dart:collection';
import 'dart:ui' as ui;

import '../../frame/resource_retirement.dart';

/// Only the bundled, validated monospace font is admitted by the text owner.
typedef GlyphStyle = ({String family, double size, int weight});

final class GlyphPage {
  GlyphPage(
    this.density,
    this.image,
    this.advance,
    this.cellWidth,
    this.cellHeight,
  );
  final double density, advance;
  final ui.Image image;
  final int cellWidth, cellHeight;
  static const columns = 8;
  static const chars = '0123456789.-%';
  static const padding = 4.0;
  int get bytes => image.width * image.height * 4;
}

final class GlyphAtlas {
  GlyphAtlas(this.style);
  final GlyphStyle style;
  int references = 0;
  bool pending = false, failed = false;
  List<GlyphPage>? pages;
  int get bytes => pages?.fold<int>(0, (n, page) => n + page.bytes) ?? 0;
  GlyphPage? page(double demand) {
    final ready = pages;
    return ready == null
        ? null
        : ready[demand <= 3
              ? 0
              : demand <= 6
              ? 1
              : 2];
  }
}

/// Shared 3/6/12 fixed-resolution glyph images. Live images have no new active
/// cap: that product decision is deferred. Unused entries alone are bounded.
final class GlyphAtlasCache {
  GlyphAtlasCache({
    required this.retirement,
    required this.onReady,
    this.maxUnusedBytes = 8 * 1024 * 1024,
  });
  final ResourceRetirement retirement;
  final void Function() onReady;
  // Internal starting bound, not a measured or user-approved optimum.
  final int maxUnusedBytes;
  final _styles = <GlyphStyle, GlyphAtlas>{};
  final _unused = <GlyphStyle, GlyphAtlas>{};
  final _queue = Queue<GlyphAtlas>();
  bool _closed = false, _active = true, _scheduled = false;
  int _running = 0, _unusedBytes = 0;
  int residentBytes = 0, retiringBytes = 0, builds = 0, failures = 0;
  int get running => _running;
  int get entries => _styles.length;

  GlyphAtlas acquire(GlyphStyle style) {
    if (_closed) throw StateError('atlas cache is closed');
    final atlas = _styles.putIfAbsent(style, () => GlyphAtlas(style));
    if (atlas.references++ == 0 && _unused.remove(style) != null) {
      _unusedBytes -= atlas.bytes;
    }
    if (atlas.pages == null && !atlas.pending && !atlas.failed) {
      atlas.pending = true;
      _queue.add(atlas);
      _schedule();
    }
    return atlas;
  }

  void release(GlyphAtlas atlas) {
    if (atlas.references <= 0) throw StateError('unbalanced atlas reference');
    if (--atlas.references == 0 && !_closed) {
      _unused[atlas.style] = atlas;
      _unusedBytes += atlas.bytes;
      trimUnused();
    }
  }

  void setActive(bool active) {
    _active = active;
    if (active) _schedule();
  }

  void _schedule() {
    if (_closed || !_active || _scheduled || _queue.isEmpty) return;
    _scheduled = true;
    scheduleMicrotask(() {
      _scheduled = false;
      _pump();
    });
  }

  void _pump() {
    while (!_closed && _active && _running < 4 && _queue.isNotEmpty) {
      final atlas = _queue.removeFirst();
      if (atlas.references == 0 || !identical(_styles[atlas.style], atlas)) {
        atlas.pending = false;
        if (identical(_styles[atlas.style], atlas)) {
          _unused.remove(atlas.style);
          _styles.remove(atlas.style);
        }
        continue;
      }
      _running++;
      unawaited(_build(atlas));
    }
  }

  Future<void> _build(GlyphAtlas atlas) async {
    final pages = <GlyphPage>[];
    try {
      for (final density in const [3.0, 6.0, 12.0]) {
        // No next native preparation is started while the host is inactive.
        // A partially built set is discarded, then requested on resume.
        if (_closed || !_active || atlas.references == 0) break;
        pages.add(await _buildPage(atlas.style, density));
      }
      if (!_closed &&
          identical(_styles[atlas.style], atlas) &&
          pages.length == 3) {
        atlas.pages = List.unmodifiable(pages);
        residentBytes += atlas.bytes;
        if (atlas.references == 0) _unusedBytes += atlas.bytes;
        pages.clear();
        builds++;
        trimUnused();
        if (_active) {
          try {
            onReady();
          } catch (_) {
            /* Observer cannot fail a resource. */
          }
        }
      }
    } catch (_) {
      // Optimization failure keeps the native Paragraph path usable. Remember
      // it for this generation rather than retrying on every pan or update.
      atlas.failed = true;
      failures++;
    } finally {
      for (final page in pages) {
        page.image.dispose(); // Unpublished, uniquely owned temporary.
      }
      atlas.pending = false;
      _running--;
      if (!_closed &&
          identical(_styles[atlas.style], atlas) &&
          atlas.pages == null &&
          !atlas.failed &&
          atlas.references > 0) {
        atlas.pending = true;
        _queue.add(atlas);
      }
      _pump();
    }
  }

  void trimUnused() {
    final evicted = <GlyphAtlas>[];
    for (final entry in _unused.values) {
      if (_unusedBytes <= maxUnusedBytes) break;
      evicted.add(entry);
      _unusedBytes -= entry.bytes;
    }
    for (final entry in evicted) {
      _unused.remove(entry.style);
      _styles.remove(entry.style);
      _retire(entry);
    }
  }

  void _retire(GlyphAtlas atlas) {
    final pages = atlas.pages;
    if (pages == null) return;
    final bytes = atlas.bytes;
    atlas.pages = null;
    residentBytes -= bytes;
    retiringBytes += bytes;
    retirement.enqueue(() {
      for (final page in pages) {
        page.image.dispose();
      }
      retiringBytes -= bytes;
    });
  }

  void close() {
    if (_closed) return;
    _closed = true;
    for (final queued in _queue) {
      queued.pending = false;
    }
    _queue.clear();
    for (final entry in _styles.values) {
      _retire(entry);
    }
    _styles.clear();
    _unused.clear();
    _unusedBytes = 0;
  }
}

Future<GlyphPage> _buildPage(GlyphStyle style, double density) async {
  ui.Paragraph paragraph(String text) =>
      (ui.ParagraphBuilder(
              ui.ParagraphStyle(
                textDirection: ui.TextDirection.ltr,
                fontFamily: style.family,
                fontSize: style.size,
                fontWeight: ui.FontWeight.values[style.weight ~/ 100 - 1],
              ),
            )
            ..pushStyle(
              ui.TextStyle(
                fontFamily: style.family,
                fontSize: style.size,
                fontWeight: ui.FontWeight.values[style.weight ~/ 100 - 1],
                color: const ui.Color(0xffffffff),
              ),
            )
            ..addText(text))
          .build()
        ..layout(const ui.ParagraphConstraints(width: 10000));
  final sample = paragraph('0');
  late final double advance, height;
  try {
    advance = sample.longestLine;
    height = sample.height;
  } finally {
    sample.dispose();
  }
  final width = ((advance + 8).ceil() * density).round();
  final rowHeight = ((height + 8).ceil() * density).round();
  final imageWidth = width * GlyphPage.columns;
  final imageHeight =
      rowHeight *
      ((GlyphPage.chars.length + GlyphPage.columns - 1) ~/ GlyphPage.columns);
  if (imageWidth > 4096 ||
      imageHeight > 4096 ||
      imageWidth <= 0 ||
      imageHeight <= 0) {
    throw StateError('glyph page dimensions exceed supported bounds');
  }
  final recorder = ui.PictureRecorder();
  // Each recorder is ended exactly once, including a failed glyph assertion.
  final drawing = ui.Canvas(recorder);
  ui.Picture? picture;
  try {
    for (var i = 0; i < GlyphPage.chars.length; i++) {
      final p = paragraph(GlyphPage.chars[i]);
      try {
        if ((p.longestLine - advance).abs() > .02 ||
            (p.height - height).abs() > .02) {
          throw StateError('font no longer satisfies fixed glyph metrics');
        }
        drawing.save();
        drawing.translate(
          (i % GlyphPage.columns) * width + 4 * density,
          (i ~/ GlyphPage.columns) * rowHeight + 4 * density,
        );
        drawing.scale(density);
        drawing.drawParagraph(p, ui.Offset.zero);
        drawing.restore();
      } finally {
        p.dispose();
      }
    }
    picture = recorder.endRecording();
    final image = await picture.toImage(imageWidth, imageHeight);
    return GlyphPage(density, image, advance, width, rowHeight);
  } finally {
    picture ??= recorder.endRecording();
    picture.dispose();
  }
}
