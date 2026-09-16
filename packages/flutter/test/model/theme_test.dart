import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:conalog_patch_map/src/model/json.dart';
import 'package:conalog_patch_map/src/model/theme.dart';

void main() {
  test(
    'theme canonicalizes nested CSS, array, RGB, HSL, HSV and byte inputs',
    () {
      final source = <String, dynamic>{
        'colors': {
          'red': 'red',
          'rgba': 'rgba(100% 0% 0% / 50%)',
          'turn': 'hsl(0.5turn 100% 50%)',
        },
        'array': [1, 0.5, 0, 0.25],
        'byte': Uint8List.fromList([128, 255, 0, 64]),
        'float': Float32List.fromList([0, 0.5, 1]),
        'rgb': {'r': 12, 'g': 34, 'b': 56, 'a': 0.5},
        'hsl': {'h': 120, 's': 100, 'l': 50},
        'hsv': {'h': 240, 's': 100, 'v': 50},
        'numeric': 0x112233,
        'bare': '0x112233',
        'short': '#f008',
      };
      final normalized = normalizeColorTheme(source);
      expect(normalized, {
        'colors.red': '#ff0000ff',
        'colors.rgba': '#ff000080',
        'colors.turn': '#00ffffff',
        'array': '#ff800040',
        'byte': '#80ff0040',
        'float': '#0080ffff',
        'rgb': '#0c223880',
        'hsl': '#00ff00ff',
        'hsv': '#000080ff',
        'numeric': '#112233ff',
        'bare': '#112233ff',
        'short': '#ff000088',
      });
      (source['array'] as List)[0] = 0;
      expect(normalized['array'], '#ff800040');
      expect(() => normalized['extra'] = '#000000ff', throwsUnsupportedError);
    },
  );
  test('theme rejects invalid input atomically with public theme paths', () {
    for (final value in [
      0x1000000,
      [1, 2, 0],
      Int16List(3),
      {'r': 0, 'g': 0},
      'primary.default',
      'unknown-color',
      null,
    ]) {
      expect(
        () => normalizeColorTheme({'valid': 'red', 'invalid': value}),
        throwsA(
          isA<PatchMapDatasetError>().having(
            (e) => e.datasetPath,
            'path',
            r'$.theme.invalid',
          ),
        ),
      );
    }
    expect(
      () => normalizeColorTheme({
        'a.b': 'red',
        'a': {'b': 'blue'},
      }),
      throwsA(isA<PatchMapDatasetError>()),
    );
    final cycle = <String, dynamic>{};
    cycle['self'] = cycle;
    expect(
      () => normalizeColorTheme(cycle),
      throwsA(isA<PatchMapDatasetError>()),
    );
  });
}
