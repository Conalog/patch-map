import 'dart:math' as math;
import '../../model/json.dart';
import '../geometry/primitives.dart';
import 'unicode_data.dart';

const _maxAdvance = 9007199254740991.0;
double _sat(double value) => value.clamp(-_maxAdvance, _maxAdvance);
double _add(double a, double b) => _sat(a + b);
double _mul(double a, double b) => a == 0 || b == 0 ? 0 : _sat(a * b);

class SemanticBidiRun {
  const SemanticBidiRun(
    this.text,
    this.level,
    this.logicalStart,
    this.logicalEnd,
  );
  final String text;
  final int level, logicalStart, logicalEnd;
  String get direction => level.isOdd ? 'rtl' : 'ltr';
  JsonMap toJson() => {
    'text': text,
    'level': level,
    'direction': direction,
    'logicalStart': logicalStart,
    'logicalEnd': logicalEnd,
  };
}

class SemanticBidiLine {
  SemanticBidiLine(
    this.baseDirection,
    List<SemanticBidiRun> logicalRuns,
    List<SemanticBidiRun> visualRuns,
    List<int> logicalToVisual,
  ) : logicalRuns = List.unmodifiable(logicalRuns),
      visualRuns = List.unmodifiable(visualRuns),
      logicalToVisual = List.unmodifiable(logicalToVisual);
  final String baseDirection;
  final List<SemanticBidiRun> logicalRuns, visualRuns;
  final List<int> logicalToVisual;
}

class SemanticTextLayout {
  SemanticTextLayout({
    required this.source,
    required this.layoutSource,
    required List<String> graphemes,
    required List<String> hardLines,
    required List<String> splitLines,
    required List<String> naturalLines,
    required List<String> lines,
    required List<double> advances,
    required this.fontSize,
    required this.lineHeight,
    required this.letterSpacing,
    required this.width,
    required this.height,
    required this.naturalWidth,
    required this.naturalHeight,
    required this.truncated,
    required List<SemanticBidiLine> bidiLines,
  }) : graphemes = List.unmodifiable(graphemes),
       hardLines = List.unmodifiable(hardLines),
       splitLines = List.unmodifiable(splitLines),
       naturalLines = List.unmodifiable(naturalLines),
       lines = List.unmodifiable(lines),
       advances = List.unmodifiable(advances),
       bidiLines = List.unmodifiable(bidiLines);
  final String source, layoutSource;
  final List<String> graphemes, hardLines, splitLines, naturalLines, lines;
  final List<double> advances;
  final double fontSize,
      lineHeight,
      letterSpacing,
      width,
      height,
      naturalWidth,
      naturalHeight;
  final bool truncated;
  final List<SemanticBidiLine> bidiLines;
  String get visibleText => lines.join('\n');
  double get alphabeticBaseline => fontSize;
  JsonMap toJson() => {
    'source': source,
    'layoutSource': layoutSource,
    'graphemes': graphemes,
    'hardLines': hardLines,
    'splitLines': splitLines,
    'lines': naturalLines,
    'visibleLines': lines,
    'visibleText': visibleText,
    'fontSizePx': fontSize,
    'lineHeightPx': lineHeight,
    'letterSpacingPx': letterSpacing,
    'lineAdvancesPx': advances,
    'layoutBounds': {'x': 0, 'y': 0, 'width': width, 'height': height},
    'naturalLayoutBounds': {
      'x': 0,
      'y': 0,
      'width': naturalWidth,
      'height': naturalHeight,
    },
    'bidiLines': [
      for (var i = 0; i < bidiLines.length; i++)
        {
          'lineIndex': i,
          'source': naturalLines[i],
          'baseDirection': bidiLines[i].baseDirection,
          'logicalRuns': bidiLines[i].logicalRuns
              .map((run) => run.toJson())
              .toList(),
          'visualRuns': bidiLines[i].visualRuns
              .map((run) => run.toJson())
              .toList(),
          'logicalToVisual': bidiLines[i].logicalToVisual,
        },
    ],
  };
}

/// Immutable profile layout; Canvas/TextPainter only paint these decided lines.
GeometryTextLayout layoutGeometryText(
  String text,
  JsonMap style, {
  MapRect? frame,
  String? overflow,
  int split = 0,
}) {
  double? metric(Object? value) =>
      value is num && value.isFinite && value > 0 ? value.toDouble() : null;
  var wrap = style['wordWrap'] == true
      ? (style['wordWrapWidth'] is num &&
                (style['wordWrapWidth'] as num).isFinite &&
                (style['wordWrapWidth'] as num) >= 0
            ? (style['wordWrapWidth'] as num).toDouble()
            : frame?.width)
      : null;
  final auto = style['autoFont'];
  int? min, max;
  if (auto is Map && auto['min'] is num && auto['max'] is num) {
    final a = auto['min'] as num, b = auto['max'] as num;
    if (a.isFinite &&
        b.isFinite &&
        a > 0 &&
        b >= a &&
        a == a.roundToDouble() &&
        b == b.roundToDouble()) {
      min = a.toInt();
      max = b.toInt();
    }
  }
  if (min != null && frame != null && wrap != null)
    wrap = math.min(wrap, frame.width);
  final layout = layoutSemanticText(
    text,
    fontSize: metric(style['fontSize']) ?? 16,
    lineHeight: metric(style['lineHeight']),
    letterSpacing:
        style['letterSpacing'] is num &&
            (style['letterSpacing'] as num).isFinite
        ? (style['letterSpacing'] as num).toDouble()
        : 0,
    wrapWidth: wrap,
    breakWords: style['breakWords'] == true,
    split: split,
    frame: frame,
    overflow: overflow == 'hidden' || overflow == 'ellipsis'
        ? overflow!
        : 'visible',
    autoMin: min,
    autoMax: max,
  );
  return (width: layout.width, height: layout.height, layout: layout);
}

class _Scalar {
  _Scalar(this.text, this.codePoint)
    : kind = patchMapGraphemeBreakClass(codePoint),
      pictographic = patchMapIsExtendedPictographic(codePoint);
  final String text, kind;
  final int codePoint;
  final bool pictographic;
}

List<_Scalar> _scalars(String source) {
  final result = <_Scalar>[];
  for (var index = 0; index < source.length; index++) {
    final a = source.codeUnitAt(index);
    if (a >= 0xd800 && a <= 0xdbff && index + 1 < source.length) {
      final b = source.codeUnitAt(index + 1);
      if (b >= 0xdc00 && b <= 0xdfff) {
        result.add(
          _Scalar(
            source.substring(index, index + 2),
            0x10000 + ((a - 0xd800) << 10) + (b - 0xdc00),
          ),
        );
        index++;
        continue;
      }
    }
    result.add(_Scalar(source.substring(index, index + 1), a));
  }
  return result;
}

List<String> segmentTextGraphemes(String source) {
  if (source.codeUnits.every((code) => code >= 0x20 && code <= 0x7e))
    return List.unmodifiable(source.split(''));
  final tokens = _scalars(source);
  if (tokens.isEmpty) return const [];
  final result = <String>[];
  var cluster = tokens.first.text,
      regional = tokens.first.kind == 'RegionalIndicator' ? 1 : 0;
  for (var i = 1; i < tokens.length; i++) {
    final previous = tokens[i - 1],
        current = tokens[i],
        a = previous.kind,
        b = current.kind;
    var separates = true;
    if (a == 'CR' && b == 'LF') {
      separates = false;
    } else if (['CR', 'LF', 'Control'].contains(a) ||
        ['CR', 'LF', 'Control'].contains(b)) {
      separates = true;
    } else if (a == 'L' && ['L', 'V', 'LV', 'LVT'].contains(b)) {
      separates = false;
    } else if (['LV', 'V'].contains(a) && ['V', 'T'].contains(b)) {
      separates = false;
    } else if (['LVT', 'T'].contains(a) && b == 'T') {
      separates = false;
    } else if (['Extend', 'ZWJ', 'SpacingMark'].contains(b) || a == 'Prepend') {
      separates = false;
    } else if (current.pictographic && a == 'ZWJ') {
      var cursor = i - 2;
      while (cursor >= 0 && tokens[cursor].kind == 'Extend') {
        cursor--;
      }
      if (cursor >= 0 && tokens[cursor].pictographic) separates = false;
    } else if (a == 'RegionalIndicator' && b == 'RegionalIndicator') {
      separates = regional.isEven;
    }
    if (separates) {
      result.add(cluster);
      cluster = current.text;
    } else {
      cluster += current.text;
    }
    regional = b == 'RegionalIndicator'
        ? (a == 'RegionalIndicator' ? regional + 1 : 1)
        : 0;
  }
  result.add(cluster);
  return List.unmodifiable(result);
}

double measureGraphemeAdvance(String grapheme, [double fontSize = 16]) {
  var units = 0;
  for (final scalar in _scalars(grapheme)) {
    final cp = scalar.codePoint;
    if (cp == 10 || cp == 13 || patchMapIsZeroAdvance(cp)) continue;
    units += cp == 0x10ffff || patchMapIsFullWidth(cp) ? 16 : 8;
  }
  return _mul(units.toDouble(), fontSize / 16);
}

bool _breakBetween(String previous, String current) {
  if (previous == ' ' || previous == '\t') return true;
  final a = previous.runes.first, b = current.runes.first;
  return a <= 0xffff &&
      b <= 0xffff &&
      patchMapIsFullWidth(a) &&
      patchMapIsFullWidth(b);
}

class _Metrics {
  _Metrics(List<String> line, double fontSize, this.spacing)
    : prefix = List.filled(line.length + 1, 0) {
    var advances = 0.0;
    for (var i = 0; i < line.length; i++) {
      advances = _add(advances, measureGraphemeAdvance(line[i], fontSize));
      prefix[i + 1] = _add(advances, _mul((i + 1).toDouble(), spacing));
      if (prefix[i + 1] < prefix[i]) monotonic = false;
    }
    if (!monotonic) {
      while (leaves < prefix.length) {
        leaves *= 2;
      }
      tree = List.filled(leaves * 2, double.infinity);
      for (var i = 0; i < prefix.length; i++) {
        tree[leaves + i] = prefix[i];
      }
      for (var i = leaves - 1; i > 0; i--) {
        tree[i] = math.min(tree[i * 2], tree[i * 2 + 1]);
      }
    }
  }
  final List<double> prefix;
  final double spacing;
  var monotonic = true, leaves = 1;
  List<double> tree = [];
  double measure(int start, int end) => end <= start
      ? 0
      : math.max(0, _add(_add(prefix[end], -prefix[start]), -spacing));
  int fitting(int start, double width, {bool force = false}) {
    final first = start + 1, last = prefix.length - 1;
    if (first > last) return start;
    if (monotonic) {
      if (measure(start, first) > width) return force ? first : start;
      var lower = first, upper = last;
      while (lower < upper) {
        final candidate = lower + (upper - lower + 1) ~/ 2;
        if (measure(start, candidate) <= width) {
          lower = candidate;
        } else {
          upper = candidate - 1;
        }
      }
      return lower;
    }
    final threshold = _add(_add(width, prefix[start]), spacing);
    int search(int node, int low, int high) {
      if (high <= first || low >= prefix.length || tree[node] > threshold)
        return -1;
      if (node >= leaves) return low;
      final middle = low + (high - low) ~/ 2;
      final right = search(node * 2 + 1, middle, high);
      return right >= 0 ? right : search(node * 2, low, middle);
    }

    final result = search(1, 0, leaves);
    return result < first ? (force ? first : start) : result;
  }
}

List<List<String>> _wrap(
  List<String> line,
  double width,
  bool breakWords,
  double fontSize,
  double spacing,
) {
  if (line.isEmpty) return [[]];
  final metrics = _Metrics(line, fontSize, spacing),
      breaks = List.filled(line.length + 1, 0);
  var lastBreak = 0;
  for (var boundary = 1; boundary < line.length; boundary++) {
    if (_breakBetween(line[boundary - 1], line[boundary])) lastBreak = boundary;
    breaks[boundary] = lastBreak;
  }
  breaks[line.length] = lastBreak;
  final result = <List<String>>[];
  var start = 0;
  while (start < line.length) {
    final end = metrics.fitting(start, width, force: true);
    if (end >= line.length) {
      result.add(line.sublist(start));
      break;
    }
    var boundary = breaks[end];
    if (boundary <= start &&
        (breakWords || _breakBetween(line[end - 1], line[end])))
      boundary = end;
    if (boundary <= start) {
      result.add(line.sublist(start));
      break;
    }
    result.add(line.sublist(start, boundary));
    start = boundary;
  }
  return result;
}

double _measure(List<String> line, double size, double spacing) {
  var result = 0.0;
  for (final cluster in line) {
    result = _add(result, measureGraphemeAdvance(cluster, size));
  }
  return math.max(
    0,
    _add(result, _mul(math.max(0, line.length - 1).toDouble(), spacing)),
  );
}

String _visible(List<String> clusters) =>
    clusters.join('').replaceAll(String.fromCharCode(0x10ffff), '□');

SemanticTextLayout layoutSemanticText(
  String source, {
  double fontSize = 16,
  double? lineHeight,
  double letterSpacing = 0,
  double? wrapWidth,
  bool breakWords = false,
  int split = 0,
  MapRect? frame,
  String overflow = 'visible',
  int? autoMin,
  int? autoMax,
}) {
  if (!fontSize.isFinite ||
      fontSize <= 0 ||
      lineHeight != null && (!lineHeight.isFinite || lineHeight <= 0) ||
      !letterSpacing.isFinite ||
      wrapWidth != null && (!wrapWidth.isFinite || wrapWidth < 0) ||
      !['visible', 'hidden', 'ellipsis'].contains(overflow) ||
      frame != null &&
          (!frame.width.isFinite ||
              !frame.height.isFinite ||
              frame.width < 0 ||
              frame.height < 0)) {
    throw ArgumentError('Text layout metrics outside pinned semantic profile');
  }
  if (autoMin != null && frame != null && wrapWidth != null) {
    wrapWidth = math.min(wrapWidth, frame.width);
  }
  final graphemes = segmentTextGraphemes(source),
      normalized = source.replaceAll(RegExp(r'\r\n?'), '\n');
  final layoutGraphemes = source == normalized
      ? graphemes
      : segmentTextGraphemes(normalized);
  final hard = <List<String>>[[]];
  for (final cluster in layoutGraphemes) {
    if (patchMapIsHardBreak(cluster)) {
      hard.add([]);
    } else {
      hard.last.add(cluster);
    }
  }
  final splits = <List<String>>[];
  for (final line in hard) {
    if (split <= 0 || line.isEmpty) {
      splits.add(line);
      continue;
    }
    for (var i = 0; i < line.length; i += split) {
      splits.add(line.sublist(i, math.min(i + split, line.length)));
    }
  }
  List<List<String>> wrapAt(double size) => wrapWidth == null
      ? splits
      : [
          for (final line in splits)
            ..._wrap(line, wrapWidth, breakWords, size, letterSpacing),
        ];
  double maxWidth(List<List<String>> lines, double size) => lines.fold<double>(
    0,
    (max, line) => math.max(max, _measure(line, size, letterSpacing)),
  );
  if (autoMin != null && autoMax != null) {
    if (frame == null || autoMin <= 0 || autoMax < autoMin)
      throw ArgumentError('autoFont requires valid frame and integer bounds');
    bool fits(int size) {
      final lines = wrapAt(size.toDouble());
      return maxWidth(lines, size.toDouble()) <= frame.width &&
          _mul(
                lines.length.toDouble(),
                lineHeight ?? _mul(size.toDouble(), 1.25),
              ) <=
              frame.height;
    }

    var lower = autoMin, upper = autoMax;
    if (fits(lower)) {
      while (lower < upper) {
        final next = lower + (upper - lower + 1) ~/ 2;
        if (fits(next)) {
          lower = next;
        } else {
          upper = next - 1;
        }
      }
    }
    fontSize = lower.toDouble();
  }
  final resolvedHeight = lineHeight ?? _mul(fontSize, 1.25),
      natural = wrapAt(fontSize);
  var visible = natural, truncated = false;
  if (overflow != 'visible' && frame != null) {
    final maxLines = (frame.height / resolvedHeight).floor();
    visible = natural
        .take(math.max(0, maxLines))
        .map((line) => List<String>.of(line))
        .toList();
    truncated = visible.length < natural.length;
    for (var i = 0; i < visible.length; i++) {
      final line = visible[i],
          end = _Metrics(line, fontSize, letterSpacing).fitting(0, frame.width);
      if (end != line.length) truncated = true;
      visible[i] = line.sublist(0, end);
    }
    if (overflow == 'ellipsis' && truncated && visible.isNotEmpty) {
      final marker = measureGraphemeAdvance('…', fontSize);
      if (marker <= frame.width) {
        final budget = math.max(
          0.0,
          _add(_add(frame.width, -marker), -letterSpacing),
        );
        final line = visible.last,
            end = _Metrics(line, fontSize, letterSpacing).fitting(0, budget);
        visible[visible.length - 1] = [...line.sublist(0, end), '…'];
      } else {
        visible[visible.length - 1] = [];
      }
    }
  }
  final advances = visible
      .map((line) => _measure(line, fontSize, letterSpacing))
      .toList();
  return SemanticTextLayout(
    source: source,
    layoutSource: normalized,
    graphemes: graphemes,
    hardLines: hard.map((line) => line.join()).toList(),
    splitLines: splits.map((line) => line.join()).toList(),
    naturalLines: natural.map((line) => line.join()).toList(),
    lines: visible.map(_visible).toList(),
    advances: advances,
    fontSize: fontSize,
    lineHeight: resolvedHeight,
    letterSpacing: letterSpacing,
    width: advances.fold<double>(0, math.max),
    height: _mul(visible.length.toDouble(), resolvedHeight),
    naturalWidth: maxWidth(natural, fontSize),
    naturalHeight: _mul(natural.length.toDouble(), resolvedHeight),
    truncated: truncated,
    bidiLines: natural.map(resolveTextBidi).toList(),
  );
}

SemanticBidiLine resolveTextBidi(List<String> graphemes) {
  String? classify(String cluster) {
    var number = false;
    for (final cp in cluster.runes) {
      if (cp >= 0x30 && cp <= 0x39 ||
          cp >= 0x660 && cp <= 0x669 ||
          cp >= 0x6f0 && cp <= 0x6f9) {
        number = true;
        continue;
      }
      if (patchMapIsRtlStrong(cp)) return 'rtl';
      if (patchMapIsLtrStrong(cp)) return 'ltr';
    }
    return number ? 'number' : null;
  }

  final content = graphemes
          .where((cluster) => !patchMapIsHardBreak(cluster))
          .toList(),
      directions = content.map(classify).toList();
  final base =
      directions
          .where((direction) => direction == 'rtl' || direction == 'ltr')
          .firstOrNull ??
      'ltr';
  String? previous;
  final levels = <int>[];
  for (final direction in directions) {
    if (direction != null) previous = direction;
    final resolved = direction ?? previous ?? base;
    levels.add(
      base == 'ltr'
          ? (resolved == 'rtl'
                ? 1
                : resolved == 'number'
                ? 2
                : 0)
          : (resolved == 'rtl' ? 1 : 2),
    );
  }
  final logical = <SemanticBidiRun>[];
  for (var start = 0; start < content.length;) {
    var end = start + 1;
    while (end < content.length && levels[end] == levels[start]) {
      end++;
    }
    logical.add(
      SemanticBidiRun(
        content.sublist(start, end).join(),
        levels[start],
        start,
        end,
      ),
    );
    start = end;
  }
  final indexes = List.generate(content.length, (index) => index);
  final odd = levels.where((level) => level.isOdd).toList();
  final max = levels.fold<int>(0, math.max),
      lowest = odd.isEmpty ? max + 1 : odd.reduce(math.min);
  for (var level = max; level >= lowest; level--) {
    var cursor = 0;
    while (cursor < indexes.length) {
      while (cursor < indexes.length && levels[indexes[cursor]] < level) {
        cursor++;
      }
      final start = cursor;
      while (cursor < indexes.length && levels[indexes[cursor]] >= level) {
        cursor++;
      }
      final reversed = indexes.sublist(start, cursor).reversed.toList();
      indexes.setRange(start, cursor, reversed);
    }
  }
  final map = List.filled(content.length, 0);
  for (var i = 0; i < indexes.length; i++) {
    map[indexes[i]] = i;
  }
  final visual = List<SemanticBidiRun>.of(logical)
    ..sort(
      (a, b) =>
          map.sublist(a.logicalStart, a.logicalEnd).reduce(math.min) -
          map.sublist(b.logicalStart, b.logicalEnd).reduce(math.min),
    );
  return SemanticBidiLine(base, logical, visual, map);
}
