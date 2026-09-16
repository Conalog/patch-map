import 'package:flutter_test/flutter_test.dart';
import 'package:conalog_patch_map/src/semantic/geometry/primitives.dart';
import 'package:conalog_patch_map/src/semantic/geometry/text_layout_cache.dart';
import 'package:conalog_patch_map/src/semantic/text/layout.dart';

void main() {
  test('cached layouts preserve all semantic inputs and eviction', () {
    var calls = 0;
    final cache = GeometryTextLayoutCache((
      text,
      style, {
      frame,
      overflow,
      split = 0,
    }) {
      calls++;
      return layoutGeometryText(
        text,
        style,
        frame: frame,
        overflow: overflow,
        split: split,
      );
    }, capacity: 2);
    const style = <String, dynamic>{'fontSize': 14, 'wordWrap': true};
    const frame = MapRect(0, 0, 30, 60);
    for (final text in ['1234', '한글😀', 'אב12', 'a\nb']) {
      final first = cache.call(text, style, frame: frame);
      final before = calls;
      final again = cache.call(text, Map.unmodifiable(style), frame: frame);
      expect(identical(first.layout, again.layout), isTrue);
      expect(calls, before);
      final expected = layoutGeometryText(text, style, frame: frame);
      expect(
        (again.layout as SemanticTextLayout).toJson(),
        (expected.layout as SemanticTextLayout).toJson(),
      );
    }
    final before = calls;
    cache.call('1234', style, frame: frame);
    expect(calls, before + 1, reason: 'least recently used entry was evicted');
    cache.call(
      '1234',
      style,
      frame: const MapRect(0, 0, 15, 20),
      overflow: 'ellipsis',
      split: 1,
    );
    expect(calls, before + 2);
    cache.clear();
    cache.call('1234', style, frame: frame);
    expect(
      calls,
      before + 3,
      reason: 'asset invalidation clears memoized layout',
    );
  });
}
