import 'dart:collection';
import 'dart:math' as math;
import 'dart:ui';

import 'color_names.dart';

const _defaultColors = <String, Object?>{
  'primary': {'default': '#0c73bf', 'dark': '#083967', 'accent': '#ef4444'},
  'gray': {'light': '#9eb3c3', 'default': '#d9d9d9', 'dark': '#71717a'},
  'white': '#ffffff',
  'black': '#1a1a1a',
  'transparent': '#00000000',
};

/// Instance-owned, detached theme lookup and native color conversion.
///
/// Exact flat keys take precedence over nested paths. String leaves may alias
/// other theme keys. All leaves are checked at construction, so an invalid
/// theme or alias cycle cannot become a partially accepted palette.
final class ColorResolver {
  ColorResolver({Map<String, Object?> colors = const {}})
    : _colors = _mergeColors(
        _defaultColors,
        _detachJson(colors, HashSet<Object>.identity()) as Map<String, Object?>,
      ) {
    for (final token in _themeTokens(_colors)) {
      resolve(token);
    }
  }

  final Map<String, Object?> _colors;
  // Palette values are detached and immutable for this resolver's lifetime.
  // Bound both entry count and string size; caller-owned collections are never
  // keys because their channels can change without changing their identity.
  final _resolved = <Object, Color>{};

  /// Whether this exact key/path names a theme color, including an alias.
  bool hasThemeColor(String token) => _lookup(token) != null;

  /// Resolves a direct color or theme token, throwing [FormatException] on
  /// unknown tokens, malformed values or alias cycles. Admission and drawing
  /// can share this method without maintaining separate conversion rules.
  Color resolve(Object value) {
    final cacheable = value is num || value is String && value.length <= 128;
    if (cacheable) {
      final ready = _resolved[value];
      if (ready != null) return ready;
    }
    Object current = value;
    final visited = <String>{};
    while (current is String) {
      final next = _lookup(current);
      if (next == null) break;
      if (!visited.add(current)) {
        throw FormatException('Cyclic color theme alias: $current', value);
      }
      current = next;
    }
    final result = resolveDirectColor(current);
    if (cacheable) {
      if (_resolved.length == 256) _resolved.remove(_resolved.keys.first);
      _resolved[value] = result;
    }
    return result;
  }

  Object? _lookup(String token) {
    Map<String, Object?> branch = _colors;
    var remaining = token;
    while (true) {
      if (branch.containsKey(remaining)) {
        final value = branch[remaining];
        return value is Map<String, Object?> && !_isColorObject(value)
            ? null
            : value;
      }
      final separator = remaining.indexOf('.');
      if (separator < 0) return null;
      final next = branch[remaining.substring(0, separator)];
      if (next is! Map<String, Object?> || _isColorObject(next)) return null;
      branch = next;
      remaining = remaining.substring(separator + 1);
    }
  }
}

/// Converts a direct CSS, numeric or JSON color value without theme lookup.
/// This is the shared syntax/value validator for direct authored colors.
///
/// Integers through 0xffffff mean RGB; larger integers through 0xffffffff mean
/// RRGGBBAA. Lists use normalized channels; RGB objects use byte channels and
/// HSL/HSV objects use degrees and percentages. Native channels round to bytes;
/// this does not promise Pixi's intermediate floating-point bit patterns.
Color resolveDirectColor(Object value) {
  if (value is num) {
    if (!value.isFinite ||
        value != value.truncateToDouble() ||
        value < 0 ||
        value > 0xffffffff) {
      throw FormatException(
        'Numeric color must be an unsigned 32-bit integer',
        value,
      );
    }
    final integer = value.toInt();
    return integer <= 0xffffff
        ? Color(0xff000000 | integer)
        : _fromRgba(integer);
  }
  if (value is String) return _parseCss(value);
  if (value is List) {
    if (value.length >= 2 && value.every((entry) => entry is String)) {
      throw FormatException('Gradient color arrays are not supported', value);
    }
    if (value.length != 3 && value.length != 4) {
      throw FormatException(
        'Color list must have three or four channels',
        value,
      );
    }
    return _channels(
      _range(value[0], 0, 1, 'red'),
      _range(value[1], 0, 1, 'green'),
      _range(value[2], 0, 1, 'blue'),
      value.length == 4 ? _range(value[3], 0, 1, 'alpha') : 1,
    );
  }
  if (value is Map) {
    if (value.containsKey('colorStops') ||
        value.containsKey('stops') ||
        value.containsKey('colors') ||
        value['type'] == 'linear' ||
        value['type'] == 'radial') {
      throw FormatException('Gradient color objects are not supported', value);
    }
    return _parseObject(value);
  }
  throw FormatException('Unsupported color value', value);
}

/// A schema may preserve these possible theme references without a palette.
/// Existence and alias validity are checked only by [ColorResolver.resolve].
/// This does not classify arbitrary CSS/function strings as theme tokens.
bool isColorThemeIdentifier(String value) =>
    RegExp(r'^[A-Za-z_][\w-]*(?:\.[A-Za-z_][\w-]*)*$').hasMatch(value);

/// Multiplies source color by tint, including alpha, using native byte rounding.
Color multiplyColors(Color source, Color tint) => _channels(
  source.r * tint.r,
  source.g * tint.g,
  source.b * tint.b,
  source.a * tint.a,
);

Color _fromRgba(int rgba) => Color(((rgba & 0xff) << 24) | (rgba >> 8));

Color _channels(num r, num g, num b, num a) => Color.fromARGB(
  (a.clamp(0, 1) * 255).round(),
  (r.clamp(0, 1) * 255).round(),
  (g.clamp(0, 1) * 255).round(),
  (b.clamp(0, 1) * 255).round(),
);

Color _parseObject(Map value) {
  final alpha = value.containsKey('a')
      ? _range(value['a'], 0, 1, 'alpha')
      : 1.0;
  if (value.containsKey('r') ||
      value.containsKey('g') ||
      value.containsKey('b')) {
    _objectFields(value, const {'r', 'g', 'b', 'a'});
    return _channels(
      _range(value['r'], 0, 255, 'red') / 255,
      _range(value['g'], 0, 255, 'green') / 255,
      _range(value['b'], 0, 255, 'blue') / 255,
      alpha,
    );
  }
  if (value.containsKey('l') || value.containsKey('v')) {
    final hsl = value.containsKey('l');
    _objectFields(
      value,
      hsl ? const {'h', 's', 'l', 'a'} : const {'h', 's', 'v', 'a'},
    );
    return _hueColor(
      _finite(value['h'], 'hue'),
      _range(value['s'], 0, 100, 'saturation') / 100,
      _range(value[hsl ? 'l' : 'v'], 0, 100, hsl ? 'lightness' : 'value') / 100,
      alpha,
      hsl: hsl,
    );
  }
  throw FormatException('Color object must use RGB, HSL or HSV fields', value);
}

void _objectFields(Map value, Set<String> fields) {
  if (value.keys.any((key) => !fields.contains(key))) {
    throw FormatException('Unexpected color object field', value);
  }
}

Color _parseCss(String input) {
  final text = input.trim().toLowerCase();
  if (text == 'transparent') return const Color(0x00000000);
  final named = cssColorNames[text];
  if (named != null) return Color(0xff000000 | named);

  var hex = text;
  final hasHash = hex.startsWith('#');
  if (hasHash) {
    hex = hex.substring(1);
  } else if (hex.startsWith('0x')) {
    hex = hex.substring(2);
  }
  if ((hex.length == 3 ||
          hex.length == 6 ||
          hex.length == 8 ||
          (hasHash && hex.length == 4)) &&
      RegExp(r'^[0-9a-f]+$').hasMatch(hex)) {
    if (hex.length <= 4) {
      hex = hex.split('').map((digit) => '$digit$digit').join();
    }
    if (hex.length == 6) hex = '${hex}ff';
    return _fromRgba(int.parse(hex, radix: 16));
  }

  final function = RegExp(
    r'^(rgba?|hsla?)\((.*)\)$',
    dotAll: true,
  ).firstMatch(text);
  if (function == null) {
    throw FormatException('Unknown color or theme token', input);
  }
  final body = function[2]!;
  late List<String> parts;
  String? alpha;
  if (body.contains(',')) {
    if (body.contains('/')) {
      throw FormatException('Mixed color separators', input);
    }
    parts = body.split(',').map((part) => part.trim()).toList();
    if (parts.length == 4) alpha = parts.removeLast();
  } else {
    final separated = body.split('/');
    if (separated.length > 2) {
      throw FormatException('Invalid color alpha', input);
    }
    if (separated.length == 2) alpha = separated[1].trim();
    parts = separated[0].trim().split(RegExp(r'\s+'));
  }
  if (parts.length != 3) {
    throw FormatException('Color needs three channels', input);
  }
  final a = alpha == null
      ? 1.0
      : _cssAmount(alpha, percentageScale: 1).clamp(0, 1).toDouble();
  if (function[1]!.startsWith('rgb')) {
    final percent = parts[0].endsWith('%');
    if (parts.any((part) => part.endsWith('%') != percent)) {
      throw FormatException('RGB channels must use the same unit', input);
    }
    return _channels(
      _cssAmount(parts[0], percentageScale: 255) / 255,
      _cssAmount(parts[1], percentageScale: 255) / 255,
      _cssAmount(parts[2], percentageScale: 255) / 255,
      a,
    );
  }
  if (!parts[1].endsWith('%') || !parts[2].endsWith('%')) {
    throw FormatException(
      'HSL saturation and lightness need percentages',
      input,
    );
  }
  return _hueColor(
    _cssHue(parts[0]),
    _cssAmount(parts[1], percentageScale: 1).clamp(0, 1).toDouble(),
    _cssAmount(parts[2], percentageScale: 1).clamp(0, 1).toDouble(),
    a,
    hsl: true,
  );
}

final _cssNumberPattern = RegExp(r'^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$');

double _cssAmount(String input, {required double percentageScale}) {
  final percent = input.endsWith('%');
  final number = percent ? input.substring(0, input.length - 1) : input;
  if (!_cssNumberPattern.hasMatch(number)) {
    throw FormatException('Invalid CSS color channel', input);
  }
  final amount = double.tryParse(number);
  if (amount == null || !amount.isFinite) {
    throw FormatException('Nonfinite color channel', input);
  }
  return percent ? amount / 100 * percentageScale : amount;
}

double _cssHue(String input) {
  final match = RegExp(r'^(.+?)(deg|grad|rad|turn)?$').firstMatch(input);
  if (match == null) throw FormatException('Invalid hue', input);
  final amount = _cssAmount(match[1]!, percentageScale: 1);
  if (match[1]!.endsWith('%')) {
    throw FormatException('Hue cannot be a percentage', input);
  }
  return switch (match[2]) {
    'grad' => amount * 0.9,
    'rad' => amount * 180 / math.pi,
    'turn' => amount * 360,
    _ => amount,
  };
}

Color _hueColor(
  double hue,
  double saturation,
  double level,
  num alpha, {
  required bool hsl,
}) {
  if (!hue.isFinite) throw FormatException('Nonfinite hue', hue);
  final h = (hue % 360) / 60;
  final chroma = hsl
      ? (1 - (2 * level - 1).abs()) * saturation
      : level * saturation;
  final x = chroma * (1 - (h % 2 - 1).abs());
  final m = hsl ? level - chroma / 2 : level - chroma;
  final (r, g, b) = switch (h.floor()) {
    0 => (chroma, x, 0.0),
    1 => (x, chroma, 0.0),
    2 => (0.0, chroma, x),
    3 => (0.0, x, chroma),
    4 => (x, 0.0, chroma),
    _ => (chroma, 0.0, x),
  };
  return _channels(r + m, g + m, b + m, alpha);
}

double _finite(Object? value, String channel) {
  if (value is! num || !value.isFinite) {
    throw FormatException('$channel must be finite', value);
  }
  return value.toDouble();
}

double _range(Object? value, num min, num max, String channel) {
  final number = _finite(value, channel);
  if (number < min || number > max) {
    throw FormatException('$channel must be in $min..$max', value);
  }
  return number;
}

bool _isColorObject(Map value) =>
    const ['r', 'g', 'b', 'l', 'v'].any(value.containsKey);

Iterable<String> _themeTokens(
  Map<String, Object?> colors, [
  String prefix = '',
]) sync* {
  for (final entry in colors.entries) {
    final token = prefix.isEmpty ? entry.key : '$prefix.${entry.key}';
    if (entry.value is Map<String, Object?> &&
        !_isColorObject(entry.value as Map)) {
      yield* _themeTokens(entry.value as Map<String, Object?>, token);
    } else {
      yield token;
    }
  }
}

Map<String, Object?> _mergeColors(
  Map<String, Object?> defaults,
  Map<String, Object?> custom,
) {
  return Map<String, Object?>.unmodifiable({
    ...defaults,
    for (final entry in custom.entries)
      entry.key:
          entry.value is Map<String, Object?> &&
              !_isColorObject(entry.value as Map) &&
              defaults[entry.key] is Map<String, Object?> &&
              !_isColorObject(defaults[entry.key] as Map)
          ? _mergeColors(
              defaults[entry.key] as Map<String, Object?>,
              entry.value as Map<String, Object?>,
            )
          : entry.value,
  });
}

Object? _detachJson(Object? value, Set<Object> ancestors) {
  if (value == null || value is String || value is bool) return value;
  if (value is num && value.isFinite) return value;
  if (value is! Map && value is! List) {
    throw FormatException('Theme must contain JSON values', value);
  }
  if (!ancestors.add(value)) {
    throw FormatException('Cyclic theme input', value.runtimeType);
  }
  try {
    if (value is List) {
      return List<Object?>.unmodifiable(
        value.map((entry) => _detachJson(entry, ancestors)),
      );
    }
    final result = <String, Object?>{};
    for (final entry in (value as Map).entries) {
      if (entry.key is! String) {
        throw FormatException('Theme keys must be strings', entry.key);
      }
      result[entry.key as String] = _detachJson(entry.value, ancestors);
    }
    return Map<String, Object?>.unmodifiable(result);
  } finally {
    ancestors.remove(value);
  }
}
