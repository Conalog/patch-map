import 'dart:ui';

import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/geometry/layout.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('component scalar resolves against each content axis', () {
    expect(
      RelativeSize.compile('25%').resolve(const Size(80, 120)),
      const Size(20, 30),
    );
    expect(
      RelativeSize.compile(25).resolve(const Size(80, 120)),
      const Size(25, 25),
    );
    final size = RelativeSize.compile({
      'width': 'calc(100% - 10px + 2px)',
      'height': {'value': 20, 'unit': 'px'},
    });
    expect(size.resolve(const Size(80, 120)), const Size(72, 20));
    expect(size.resolve(const Size(160, 240)), const Size(152, 20));
    expect(Dimension.compile('calc(10px - -2px + -1px)').resolve(100), 11);
    expect(Dimension.compile('calc(10px + 50%)').resolve(100), 60);
    expect(
      () => Dimension.compile('calc(50% - 60px)').resolve(100),
      throwsA(isA<DatasetException>()),
    );
    expect(
      () => Dimension(1e308, 1e308).resolve(100),
      throwsA(isA<DatasetException>()),
    );
  });

  test('placement keeps unanchored axis centered and allows outsets', () {
    const reference = Rect.fromLTWH(3, 5, 100, 200);
    const size = Size(20, 40);
    const margin = BoxEdges(-2, 7, 9, 11);
    final expected = <String, Offset>{
      'left': const Offset(14, 85),
      'right': const Offset(76, 85),
      'top': const Offset(43, 3),
      'bottom': const Offset(43, 156),
      'left-top': const Offset(14, 3),
      'left-bottom': const Offset(14, 156),
      'right-top': const Offset(76, 3),
      'right-bottom': const Offset(76, 156),
      'center': const Offset(43, 85),
      'none': Offset.zero,
    };
    for (final entry in expected.entries) {
      expect(
        placeBox(reference, size, entry.key, margin),
        entry.value & size,
        reason: entry.key,
      );
    }
    expect(
      const BoxEdges(-2, -3, -4, -5).contentBox(const Size(20, 30)),
      const Rect.fromLTWH(-5, -2, 28, 36),
    );
    expect(
      () => const BoxEdges(20, 0, 20, 0).contentBox(const Size(20, 30)),
      throwsA(isA<DatasetException>()),
    );
  });
}
