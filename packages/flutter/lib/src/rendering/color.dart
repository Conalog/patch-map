import 'dart:math' as math;
import 'dart:ui' as ui;

const defaultMapTheme = <String, Object>{
  'white': '#ffffffff',
  'black': '#1a1a1aff',
  'transparent': '#00000000',
  'primary.default': '#0c73bfff',
  'primary.dark': '#083967ff',
  'primary.accent': '#ef4444ff',
  'gray.light': '#9eb3c3ff',
  'gray.default': '#d9d9d9ff',
  'gray.dark': '#71717aff',
};

/// Matches the release/1.0 deterministic parser color boundary, including the
/// opaque hash fallback for tokens that are not in the active theme.
ui.Color mapColor(
  Object? input, [
  ui.Color fallback = const ui.Color(0xff000000),
  Map<String, dynamic> theme = const {},
]) {
  var value = input;
  String? root;
  final visited = <String>{};
  while (value is String) {
    final next = theme[value] ?? defaultMapTheme[value];
    if (next == null || next == value) break;
    root ??= value;
    visited.add(value);
    if (next is String && !visited.add(next)) return _token(root);
    value = next;
  }
  if (value is num &&
      value.isFinite &&
      value >= 0 &&
      value <= 0xffffffff &&
      value == value.roundToDouble()) {
    final n = value.toInt();
    return n <= 0xffffff
        ? ui.Color(0xff000000 | n)
        : ui.Color(((n & 255) << 24) | (n >> 8));
  }
  if (value is! String) return fallback;
  final source = value.trim().toLowerCase();
  final hex = RegExp(r'^#([0-9a-f]{3,8})$').firstMatch(source)?[1];
  if (hex != null && [3, 4, 6, 8].contains(hex.length)) {
    final full = hex.length <= 4
        ? hex.split('').map((c) => '$c$c').join()
        : hex;
    final n = int.parse(full, radix: 16);
    return full.length == 6
        ? ui.Color(0xff000000 | n)
        : ui.Color(((n & 255) << 24) | (n >> 8));
  }
  final rgb = RegExp(
    r'^rgba?\(\s*([^,]+),\s*([^,]+),\s*([^,)]+)(?:,\s*([^)]*))?\s*\)$',
  ).firstMatch(source);
  if (rgb != null) {
    final channels = [for (var i = 1; i <= 3; i++) _channel(rgb[i]!)];
    final alpha = rgb[4] == null ? 255 : _alpha(rgb[4]!);
    if (channels.every((n) => n != null) && alpha != null)
      return ui.Color.fromARGB(alpha, channels[0]!, channels[1]!, channels[2]!);
  }
  final hsl = RegExp(
    r'^hsla?\(\s*([^,]+),\s*([^,]+)%,\s*([^,)]+)%(?:,\s*([^)]*))?\s*\)$',
  ).firstMatch(source);
  if (hsl != null) {
    final h = double.tryParse(hsl[1]!.trim()),
        s = double.tryParse(hsl[2]!.trim()),
        l = double.tryParse(hsl[3]!.trim());
    final alpha = hsl[4] == null ? 255 : _alpha(hsl[4]!);
    if (h != null &&
        h.isFinite &&
        s != null &&
        s.isFinite &&
        l != null &&
        l.isFinite &&
        alpha != null) {
      final hue = ((h % 360) + 360) % 360,
          saturation = (s / 100).clamp(0.0, 1.0),
          lightness = (l / 100).clamp(0.0, 1.0);
      final chroma = (1 - (2 * lightness - 1).abs()) * saturation,
          secondary = chroma * (1 - ((hue / 60) % 2 - 1).abs()),
          m = lightness - chroma / 2;
      final channels = switch (hue) {
        < 60 => [chroma, secondary, 0.0],
        < 120 => [secondary, chroma, 0.0],
        < 180 => [0.0, chroma, secondary],
        < 240 => [0.0, secondary, chroma],
        < 300 => [secondary, 0.0, chroma],
        _ => [chroma, 0.0, secondary],
      };
      return ui.Color.fromARGB(
        alpha,
        ((channels[0] + m) * 255).round(),
        ((channels[1] + m) * 255).round(),
        ((channels[2] + m) * 255).round(),
      );
    }
  }
  return _token(root ?? value);
}

int? _channel(String value) {
  final text = value.trim();
  final percentage = RegExp(r'^(-?(?:\d+\.?\d*|\.\d+))%$').firstMatch(text);
  final n = percentage == null
      ? double.tryParse(text)
      : double.parse(percentage[1]!) * 2.55;
  return n == null || !n.isFinite ? null : n.clamp(0.0, 255.0).round();
}

int? _alpha(String value) {
  final text = value.trim(), percentage = text.endsWith('%');
  final n = double.tryParse(
    percentage ? text.substring(0, text.length - 1) : text,
  );
  return n == null || !n.isFinite
      ? null
      : ((n / (percentage ? 100 : 1)).clamp(0.0, 1.0) * 255).round();
}

ui.Color _token(String value) {
  var hash = 0x811c9dc5;
  for (final unit in value.codeUnits) {
    hash = ((hash ^ unit) * 0x01000193) & 0xffffffff;
  }
  return ui.Color(0xff000000 | (hash & 0xffffff));
}

ui.Color multiplyColor(ui.Color a, ui.Color b, double opacity) =>
    ui.Color.fromARGB(
      (a.a * b.a * opacity * 255).clamp(0.0, 255.0).round(),
      (a.r * b.r * 255).round(),
      (a.g * b.g * 255).round(),
      (a.b * b.b * 255).round(),
    );
ui.Color applyOpacity(ui.Color color, double opacity) =>
    color.withValues(alpha: math.max(0.0, math.min(1.0, color.a * opacity)));
