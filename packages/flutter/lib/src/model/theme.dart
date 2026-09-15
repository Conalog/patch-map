import 'dart:collection';
import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';
import 'json.dart';
import 'theme_colors.dart';

/// Public theme admission mirrors semantic/color.ts. Dataset paint tokens use
/// the separate deterministic parser boundary after this canonicalization.
JsonMap normalizeColorTheme(JsonMap input) {
  final result = <String, dynamic>{}, ancestors = HashSet<Object>.identity();
  void visit(Map input, String prefix, String path) {
    if (!ancestors.add(input)) _invalid(path, 'cyclic color theme');
    final keys = input.keys.toList();
    if (keys.any((key) => key is! String))
      _invalid(path, 'theme keys must be strings');
    keys.sort((a, b) => (a as String).compareTo(b as String));
    for (final raw in keys) {
      final key = raw as String,
          value = input[key],
          name = prefix.isEmpty ? key : '$prefix.$key';
      final at = RegExp(r'^[A-Za-z_$][\w$]*$').hasMatch(key)
          ? '$path.$key'
          : '$path[${jsonEncode(key)}]';
      if (value is Map && !['r', 'g', 'b', 'l', 'v'].any(value.containsKey)) {
        visit(value, name, at);
      } else {
        if (result.containsKey(name))
          _invalid(at, 'duplicate theme color path $name');
        result[name] = normalizeDirectColor(value, path: at);
      }
    }
    ancestors.remove(input);
  }

  visit(input, '', r'$.theme');
  return Map.unmodifiable(result);
}

String normalizeDirectColor(Object? value, {String path = r'$.color'}) {
  List<double> channels;
  if (value is num) {
    if (!value.isFinite ||
        value < 0 ||
        value > 0xffffff ||
        value != value.roundToDouble())
      _invalid(path, 'numeric color must be a finite 24-bit integer');
    final n = value.toInt();
    channels = [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
  } else if (value is List) {
    if (value.length != 3 && value.length != 4)
      _invalid(path, 'color arrays need three or four channels');
    final max = value is Uint8List || value is Uint8ClampedList ? 255.0 : 1.0;
    if (value is TypedData &&
        value is! Uint8List &&
        value is! Uint8ClampedList &&
        value is! Float32List)
      _invalid(path, 'unsupported typed color array');
    channels = [
      for (final channel in value) _range(channel, 0, max, path) / max,
    ];
    if (channels.length == 3) channels.add(1);
  } else if (value is Map) {
    final rgb = ['r', 'g', 'b'].any(value.containsKey),
        hsl = value.containsKey('l'),
        hsv = value.containsKey('v');
    final required = rgb
        ? ['r', 'g', 'b']
        : hsl
        ? ['h', 's', 'l']
        : hsv
        ? ['h', 's', 'v']
        : <String>[];
    if (required.isEmpty ||
        required.any((key) => !value.containsKey(key)) ||
        value.keys.any((key) => !required.contains(key) && key != 'a'))
      _invalid(path, 'invalid color object fields');
    final alpha = value.containsKey('a') ? _range(value['a'], 0, 1, path) : 1.0;
    if (rgb) {
      channels = [
        for (final key in required) _range(value[key], 0, 255, path) / 255,
        alpha,
      ];
    } else {
      channels = _hue(
        _range(value['h'], 0, 360, path),
        _range(value['s'], 0, 100, path) / 100,
        _range(value[hsl ? 'l' : 'v'], 0, 100, path) / 100,
        hsl,
      )..add(alpha);
    }
  } else if (value is String) {
    final parsed = _css(value);
    if (parsed == null) _invalid(path, 'unsupported color string');
    channels = parsed;
  } else {
    _invalid(path, 'unsupported color value');
  }
  // Pixi's Color stores normalized components as float32 before byte rounding.
  final packed = Float32List.fromList(channels);
  return '#${packed.map((value) => (value * 255).round().clamp(0, 255).toRadixString(16).padLeft(2, '0')).join()}';
}

Never _invalid(String path, String detail) =>
    throw PatchMapDatasetError('INVALID_VALUE', path, detail);
double _range(Object? value, double min, double max, String path) {
  if (value is! num || !value.isFinite || value < min || value > max)
    _invalid(path, 'color channel must be finite in $min..$max');
  return value.toDouble();
}

double? _number(String text) {
  final n = double.tryParse(text);
  return n != null && n.isFinite ? n : null;
}

double? _unit(String text, double max) {
  final percent = text.endsWith('%'),
      n = _number(percent ? text.substring(0, text.length - 1) : text);
  return n == null ? null : (n * (percent ? max / 100 : 1)).clamp(0, max);
}

List<double> _hue(double hue, double saturation, double third, bool hsl) {
  final h = hue % 360,
      chroma = hsl
          ? (1 - (2 * third - 1).abs()) * saturation
          : third * saturation;
  final second = chroma * (1 - ((h / 60) % 2 - 1).abs()),
      m = hsl ? third - chroma / 2 : third - chroma;
  final channels = switch (h) {
    < 60 => [chroma, second, 0.0],
    < 120 => [second, chroma, 0.0],
    < 180 => [0.0, chroma, second],
    < 240 => [0.0, second, chroma],
    < 300 => [second, 0.0, chroma],
    _ => [chroma, 0.0, second],
  };
  return channels.map((c) => c + m).toList();
}

List<double>? _css(String input) {
  var text = input.trim().toLowerCase();
  text = cssNamedColors[text] ?? text;
  final hex =
      RegExp(
        r'^(?:#|0x)?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$',
      ).firstMatch(text)?[1] ??
      RegExp(r'^#([0-9a-f]{4})$').firstMatch(text)?[1];
  if (hex != null) {
    final full = hex.length <= 4
        ? hex.split('').map((c) => '$c$c').join()
        : hex;
    return [
      for (var i = 0; i < full.length; i += 2)
        int.parse(full.substring(i, i + 2), radix: 16) / 255,
      if (full.length == 6) 1,
    ];
  }
  final fn = RegExp(r'^(rgba?|hsla?)\((.*)\)$').firstMatch(text);
  if (fn == null) return null;
  final body = fn[2]!.trim(), comma = body.contains(',');
  final parts = comma
      ? body.split(',').map((v) => v.trim()).toList()
      : body.replaceAll('/', ' / ').split(RegExp(r'\s+'));
  if (!comma && parts.contains('/')) {
    if (parts.length != 5 || parts[3] != '/') return null;
    parts.removeAt(3);
  }
  if (parts.length != 3 && parts.length != 4) return null;
  final alpha = parts.length == 4 ? _unit(parts[3], 1) : 1.0;
  if (alpha == null) return null;
  if (fn[1]!.startsWith('rgb')) {
    final percentage = parts.take(3).where((part) => part.endsWith('%')).length;
    if (percentage != 0 && percentage != 3) return null;
    final rgb = parts.take(3).map((part) => _unit(part, 255)).toList();
    if (rgb.any((n) => n == null)) return null;
    return [for (final n in rgb) n! / 255, alpha];
  }
  final angle = RegExp(
    r'^([+-]?(?:\d+\.?\d*|\.\d+))(deg|rad|turn|grad)?$',
  ).firstMatch(parts[0]);
  if (angle == null || !parts[1].endsWith('%') || !parts[2].endsWith('%'))
    return null;
  final h = _number(angle[1]!);
  if (h == null) return null;
  final factor = switch (angle[2]) {
    'rad' => 180 / math.pi,
    'turn' => 360.0,
    'grad' => 0.9,
    _ => 1.0,
  };
  final saturation = _unit(parts[1], 1), lightness = _unit(parts[2], 1);
  if (saturation == null || lightness == null) return null;
  return _hue(h * factor, saturation, lightness, true)..add(alpha);
}
