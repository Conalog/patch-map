import 'dart:collection';
import '../../model/json.dart';
import 'primitives.dart';

/// Controller-local memoization of immutable layout inputs and results.
/// Paint style is included so injected layouters retain their complete input.
class GeometryTextLayoutCache {
  GeometryTextLayoutCache(this.layout, {this.capacity = 8192});
  final GeometryTextLayouter layout;
  final int capacity;
  final _entries = LinkedHashMap<Object, GeometryTextLayout>();
  Expando<String> _styles = Expando<String>();

  GeometryTextLayout call(
    String text,
    JsonMap style, {
    MapRect? frame,
    String? overflow,
    int split = 0,
  }) {
    if (text.length > 64 || capacity <= 0) {
      return layout(
        text,
        style,
        frame: frame,
        overflow: overflow,
        split: split,
      );
    }
    final key = (
      text,
      _styles[style] ??= canonicalJson(style),
      frame == null ? null : (frame.x, frame.y, frame.width, frame.height),
      overflow,
      split,
    );
    final value =
        _entries.remove(key) ??
        layout(text, style, frame: frame, overflow: overflow, split: split);
    _entries[key] = value;
    if (_entries.length > capacity) _entries.remove(_entries.keys.first);
    return value;
  }

  void clear() {
    _entries.clear();
    _styles = Expando<String>();
  }
}
