import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:patch_map/src/semantic/geometry/primitives.dart';
import 'package:patch_map/src/semantic/text/layout.dart';

void main() {
  final observations =
      jsonDecode(
            File('../../conformance/text/expected.json').readAsStringSync(),
          )
          as List;
  for (final entry in observations) {
    final data = entry as Map<String, dynamic>,
        options = data['options'] as Map<String, dynamic>;
    test('shared npm text observation: ${data['id']}', () {
      final frame = options['contentFrame'] as Map<String, dynamic>?;
      final auto = options['autoFont'] as Map<String, dynamic>?;
      final actual = layoutSemanticText(
        options['source'] as String,
        fontSize: (options['fontSizePx'] as num?)?.toDouble() ?? 16,
        lineHeight: (options['lineHeightPx'] as num?)?.toDouble(),
        letterSpacing: (options['letterSpacingPx'] as num?)?.toDouble() ?? 0,
        split: (options['split'] as num?)?.toInt() ?? 0,
        wrapWidth: (options['wordWrapWidthPx'] as num?)?.toDouble(),
        breakWords: options['breakWords'] == true,
        frame: frame == null
            ? null
            : MapRect(
                0,
                0,
                (frame['width'] as num).toDouble(),
                (frame['height'] as num).toDouble(),
              ),
        overflow: options['overflow'] as String? ?? 'visible',
        autoMin: (auto?['minPx'] as num?)?.toInt(),
        autoMax: (auto?['maxPx'] as num?)?.toInt(),
      );
      expect(actual.toJson(), data['expected']);
    });
  }
  test(
    'geometry adapter applies style wrap and preserves explicit short line height',
    () {
      final result = layoutGeometryText('가나다라', {
        'fontSize': 16,
        'lineHeight': 12,
        'wordWrap': true,
      }, frame: const MapRect(0, 0, 32, 24));
      final layout = result.layout as SemanticTextLayout;
      expect(layout.lines, ['가나', '다라']);
      expect(result.width, 32);
      expect(result.height, 24);
      expect(layout.lineHeight, 12);
    },
  );
  test(
    'grapheme advance preserves supplementary nonzero scalars inside one cluster',
    () {
      expect(segmentTextGraphemes('👨‍👩‍👧‍👦👍🏽'), ['👨‍👩‍👧‍👦', '👍🏽']);
      expect(measureGraphemeAdvance('👨‍👩‍👧‍👦'), 64);
      expect(measureGraphemeAdvance('👍🏽'), 32);
      expect(segmentTextGraphemes('e\u0301'), ['e\u0301']);
    },
  );
  test('invalid metrics reject before producing layout', () {
    expect(
      () => layoutSemanticText('A', fontSize: double.nan),
      throwsArgumentError,
    );
    expect(() => layoutSemanticText('A', lineHeight: 0), throwsArgumentError);
    expect(() => layoutSemanticText('A', wrapWidth: -1), throwsArgumentError);
    expect(
      () => layoutSemanticText('A', autoMin: 2, autoMax: 20),
      throwsArgumentError,
    );
  });
}
