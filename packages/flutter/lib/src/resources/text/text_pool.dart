import 'dart:collection';
import 'dart:typed_data';
import 'dart:ui' as ui;

import '../../dataset/colors.dart';
import '../../frame/resource_retirement.dart';
import 'glyph_atlas.dart';
import 'paragraph_configuration.dart';
import 'text_layout.dart';
import 'text_spec.dart';

/// A shared layout/paint identity. The renderer owns a reference for every use.
final class TextHandle {
  TextHandle._(
    this.key,
    this.spec,
    this.metrics,
    this._native,
    this.atlasEligible,
  );
  final (String, String, String) key;
  final TextSpec spec;
  final TextMetrics metrics;
  final bool atlasEligible;
  int _references = 0;
  int get references => _references;
  OwnedTextLayout? _native;
  GlyphAtlas? _atlas;
  // GlyphAtlasCache provides exactly these three fixed densities.
  _GlyphPlacement? _placement3, _placement6, _placement12;
  ui.Size get size => metrics.size;
  bool get hasParagraph => _native != null;
}

final class TextPool {
  TextPool({
    required this.palette,
    required this.retirement,
    required void Function() onReady,
    this.fontFamilyResolver,
    this.maxUnusedEntries = 800,
    this.maxUnusedCodeUnits = 131072,
  }) : atlases = GlyphAtlasCache(retirement: retirement, onReady: onReady);
  final ColorResolver palette;
  final String Function(String family)? fontFamilyResolver;
  final ResourceRetirement retirement;
  final GlyphAtlasCache atlases;
  // These bound unused state only and are provisional implementation defaults.
  final int maxUnusedEntries, maxUnusedCodeUnits;
  final _entries = <(String, String, String), TextHandle>{};
  final _unused = <(String, String, String), TextHandle>{};
  final _numeric = <Object, TextMetrics>{};
  final _paint = ui.Paint()..filterQuality = ui.FilterQuality.medium;
  bool _closed = false;
  int _unusedUnits = 0;
  int paragraphCreates = 0, liveParagraphLayouts = 0;
  int specCreates = 0, keyCreates = 0, parameterCreates = 0;
  _TextPreparation? _preparation;
  late final _paragraphPreparation = ParagraphPreparation(
    fontFamilyResolver: fontFamilyResolver,
  );

  /// Reuses scalar preparation for immutable admitted data during one synchronous
  /// measure/compile transaction. No handle references or async work are cached.
  /// Nested transactions have independent caches and restore the outer cache.
  T withPreparation<T>(T Function() action) {
    if (_closed) throw StateError('text pool is closed');
    final previous = _preparation;
    _preparation = _TextPreparation();
    try {
      final result = action();
      if (result is Future) {
        throw StateError('Text preparation action must be synchronous');
      }
      return result;
    } finally {
      _preparation = previous;
    }
  }

  TextParameters _parameters(Map<String, Object?> data, ui.Size? content) {
    final parameters = TextParameters.fromData(data, content, palette);
    parameterCreates++;
    return parameters;
  }

  TextSpec _spec(Map<String, Object?> data, ui.Size? content) {
    final cache = _preparation;
    final parameters = cache == null
        ? _parameters(data, content)
        : cache.parameters.putIfAbsent(
            _ParameterKey(data, content),
            () => _parameters(data, content),
          );
    final spec = TextSpec.fromParameters(
      data['text'] as String? ?? '',
      parameters,
    );
    specCreates++;
    return spec;
  }

  (String, String, String) _key(TextSpec spec) {
    keyCreates++;
    return (spec.text, spec.metricStyleKey, spec.paintKey);
  }

  int metricHits = 0, metricMisses = 0, atlasDraws = 0, paragraphDraws = 0;
  int get entries => _entries.length;
  int get unusedEntries => _unused.length;
  int get numericMetricEntries => _numeric.length;

  TextHandle acquire(Map<String, Object?> data, ui.Size? content) {
    if (_closed) throw StateError('text pool is closed');
    final cache = _preparation;
    final TextSpec spec;
    final (String, String, String) key;
    if (cache == null) {
      spec = _spec(data, content);
      key = _key(spec);
    } else {
      final byContent = cache.records.putIfAbsent(data, () => {});
      final prepared = byContent.putIfAbsent(
        content,
        () => _PreparedText(_spec(data, content)),
      );
      spec = prepared.spec;
      key = prepared.key ??= _key(spec);
    }
    return _retain(_entries[key] ?? _create(spec, key));
  }

  /// The caller proved that every non-text preparation input is unchanged.
  /// Reuse parameters and the style/paint key parts, never fitted metrics or
  /// glyph placement: the new string still follows ordinary handle creation.
  TextHandle acquireText(String value, TextHandle previous) {
    if (_closed) throw StateError('text pool is closed');
    final key = (value, previous.key.$2, previous.key.$3);
    keyCreates++;
    var handle = _entries[key];
    if (handle == null) {
      final spec = TextSpec.fromParameters(value, previous.spec.parameters);
      specCreates++;
      handle = _create(spec, key);
    }
    return _retain(handle);
  }

  TextHandle _create(TextSpec spec, (String, String, String) key) {
    OwnedTextLayout? native;
    TextMetrics? metrics;
    final proof = _numericProofKey(spec);
    if (proof != null) {
      metrics = _numeric[proof];
      if (metrics != null) {
        metricHits++;
      } else {
        metricMisses++;
      }
    }
    if (metrics == null) {
      native = _resolve(spec);
      metrics = TextMetrics.fromLayout(native);
      if (proof != null) {
        if (_numeric.length >= 256) _numeric.remove(_numeric.keys.first);
        _numeric[proof] = metrics;
      }
    }
    final handle = TextHandle._(
      key,
      spec,
      metrics,
      native,
      _eligible(spec, metrics),
    );
    _entries[key] = handle;
    return handle;
  }

  TextHandle _retain(TextHandle handle) {
    if (handle._references++ == 0) {
      if (_unused.remove(handle.key) != null) {
        _unusedUnits -= handle.spec.text.length;
      }
      if (handle.atlasEligible) {
        handle._atlas = atlases.acquire((
          family:
              fontFamilyResolver?.call(handle.spec.fontFamilies.single) ??
              handle.spec.fontFamilies.single,
          size: handle.metrics.fontSize,
          weight: handle.spec.fontWeight.value,
        ));
      }
    }
    return handle;
  }

  ui.Size measure(Map<String, Object?> data, ui.Size? content) {
    final handle = acquire(data, content);
    final size = handle.size;
    release(handle);
    return size;
  }

  void release(TextHandle handle) {
    if (handle._references <= 0) throw StateError('unbalanced text reference');
    if (--handle._references != 0) return;
    if (handle._atlas != null) {
      atlases.release(handle._atlas!);
      handle._atlas = null;
    }
    if (_closed) {
      _entries.remove(handle.key);
      _retire(handle);
    } else {
      _unused[handle.key] = handle;
      _unusedUnits += handle.spec.text.length;
    }
  }

  /// Run after an update transaction, not once per glyph or cache entry.
  void trimUnused() {
    var remaining = _unused.length;
    final evicted = <TextHandle>[];
    // Keep one iterator: repeatedly asking compact maps for keys.first scans
    // their growing prefix of deleted entries and makes a burst quadratic.
    for (final handle in _unused.values) {
      if (remaining <= maxUnusedEntries && _unusedUnits <= maxUnusedCodeUnits) {
        break;
      }
      evicted.add(handle);
      remaining--;
      _unusedUnits -= handle.spec.text.length;
    }
    for (final handle in evicted) {
      _unused.remove(handle.key);
      _entries.remove(handle.key);
      _retire(handle);
    }
    atlases.trimUnused();
  }

  void draw(
    TextHandle handle,
    ui.Canvas canvas,
    ui.Offset offset,
    double demand,
  ) {
    if (_closed || handle.references <= 0) throw StateError('text is not live');
    final page = handle._atlas?.page(demand);
    if (page == null) {
      // Only a numeric proof hit defers its Paragraph. Other formats already
      // own the native layout that supplied their metrics.
      handle._native ??= _resolve(handle.spec, measured: handle.metrics);
      handle._native!.paint(canvas, offset);
      paragraphDraws++;
      return;
    }
    final placement = switch (page.density) {
      3 => handle._placement3 ??= _GlyphPlacement(handle, page),
      6 => handle._placement6 ??= _GlyphPlacement(handle, page),
      12 => handle._placement12 ??= _GlyphPlacement(handle, page),
      _ => throw StateError('unsupported glyph density: ${page.density}'),
    };
    canvas.save();
    canvas.translate(offset.dx, offset.dy);
    canvas.drawRawAtlas(
      page.image,
      placement.transforms,
      placement.rects,
      placement.colors,
      ui.BlendMode.modulate,
      null,
      _paint,
    );
    canvas.restore();
    atlasDraws++;
  }

  OwnedTextLayout _resolve(TextSpec spec, {TextMetrics? measured}) {
    final layout = NativeTextLayout(
      spec,
      preparation: _paragraphPreparation,
      onParagraphCreated: (_) {
        paragraphCreates++;
      },
    ).resolve(measured: measured);
    liveParagraphLayouts++;
    return layout;
  }

  void _retire(TextHandle handle) {
    final native = handle._native;
    handle._native = null;
    handle._placement3 = null;
    handle._placement6 = null;
    handle._placement12 = null;
    if (native != null) {
      retirement.enqueue(() {
        native.dispose();
        liveParagraphLayouts--;
      });
    }
  }

  void setActive(bool active) => atlases.setActive(active);

  void close() {
    if (_closed) return;
    _closed = true;
    for (final handle in _unused.values) {
      _entries.remove(handle.key);
      _retire(handle);
    }
    _unused.clear();
    _unusedUnits = 0;
    _numeric.clear();
    _paragraphPreparation.clear();
    atlases.close();
    // Still-pinned candidates release their own handles after async settlement.
  }
}

/// Both caches die with their synchronous transaction, including on throw.
final class _TextPreparation {
  final records =
      HashMap<Map<String, Object?>, Map<ui.Size?, _PreparedText>>.identity();
  final parameters = <_ParameterKey, TextParameters>{};
}

/// Admitted style/margin maps are immutable. Identity avoids rescanning them;
/// content and the top-level non-text overrides must still distinguish parses.
final class _ParameterKey {
  _ParameterKey(Map<String, Object?> data, this.content)
    : style = data['style'],
      margin = data['margin'],
      tint = data['tint'],
      overflow = data['overflow'],
      split = data['split'];
  final Object? style, margin, tint, overflow, split;
  final ui.Size? content;
  @override
  bool operator ==(Object other) =>
      other is _ParameterKey &&
      identical(style, other.style) &&
      identical(margin, other.margin) &&
      content == other.content &&
      tint == other.tint &&
      overflow == other.overflow &&
      split == other.split;
  @override
  int get hashCode => Object.hash(
    identityHashCode(style),
    identityHashCode(margin),
    content,
    tint,
    overflow,
    split,
  );
}

final class _PreparedText {
  _PreparedText(this.spec);
  final TextSpec spec;
  (String, String, String)? key;
}

final _digits = RegExp(r'^[0-9]{1,12}$');
final _number = RegExp(r'^-?[0-9]+(?:\.[0-9]+)?%?$');

bool _simpleFont(TextSpec s) =>
    s.fontFamilies.length == 1 &&
    s.fontFamilies.single == 'FiraCode' &&
    s.fontStyle == ui.FontStyle.normal &&
    s.letterSpacing == 0 &&
    s.lineHeight == null &&
    s.padding == 0 &&
    s.strokeWidth == 0 &&
    s.shadow == null &&
    s.unsupportedFields.isEmpty;

Object? _numericProofKey(TextSpec s) {
  if (!_simpleFont(s) ||
      s.fontWeight != ui.FontWeight.w500 ||
      !s.auto ||
      s.autoMin != 8 ||
      s.autoMax != 14 ||
      !s.wordWrap ||
      s.breakWords ||
      s.align != ui.TextAlign.center ||
      s.overflow != 'visible' ||
      s.split != 0 ||
      s.wrapWidth != s.bounds?.width ||
      !_digits.hasMatch(s.text)) {
    return null;
  }
  return (s.bounds, s.text.length, s.whiteSpace);
}

bool _eligible(TextSpec s, TextMetrics m) =>
    _simpleFont(s) &&
    s.split == 0 &&
    s.overflow == 'visible' &&
    m.lines == 1 &&
    _number.hasMatch(s.text) &&
    m.fontSize > 0 &&
    m.fontSize <= 64 &&
    (s.bounds == null ||
        (m.size.width <= s.bounds!.width && m.size.height <= s.bounds!.height));

final class _GlyphPlacement {
  _GlyphPlacement(TextHandle handle, GlyphPage page)
    : transforms = Float32List(handle.spec.text.length * 4),
      rects = Float32List(handle.spec.text.length * 4),
      colors = Int32List(handle.spec.text.length) {
    final count = handle.spec.text.length;
    final remaining = handle.size.width - count * page.advance;
    final shift = switch (handle.spec.align) {
      ui.TextAlign.center => remaining / 2,
      ui.TextAlign.right || ui.TextAlign.end => remaining,
      _ => 0.0,
    };
    for (var i = 0; i < count; i++) {
      final cell = GlyphPage.chars.indexOf(handle.spec.text[i]), n = i * 4;
      if (cell < 0) throw StateError('unvalidated glyph');
      transforms[n] = 1 / page.density;
      transforms[n + 2] = shift + i * page.advance - GlyphPage.padding;
      transforms[n + 3] = -GlyphPage.padding;
      rects[n] = (cell % GlyphPage.columns * page.cellWidth).toDouble();
      rects[n + 1] = (cell ~/ GlyphPage.columns * page.cellHeight).toDouble();
      rects[n + 2] = rects[n] + page.cellWidth;
      rects[n + 3] = rects[n + 1] + page.cellHeight;
      colors[i] = handle.spec.color.toARGB32();
    }
  }
  final Float32List transforms, rects;
  final Int32List colors;
}
