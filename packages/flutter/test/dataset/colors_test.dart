import 'dart:math' as math;
import 'dart:collection';
import 'dart:ui';

import 'package:conalog_patch_map/src/dataset/colors.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/dataset/dataset_styles.dart' as styles;
import 'package:flutter_test/flutter_test.dart';

/// The selected color check must not inspect unrelated record groups, even
/// with containsKey or broad map traversal.
final class _SelectedRecord extends MapBase<String, Object?> {
  _SelectedRecord(this.data, this.field);
  final Map<String, Object?> data;
  final String field;
  void _allow(Object? key) {
    if (key != 'type' && key != field) {
      throw StateError('unrelated field read: $key');
    }
  }

  @override
  Object? operator [](Object? key) {
    _allow(key);
    return data[key];
  }

  @override
  bool containsKey(Object? key) {
    _allow(key);
    return data.containsKey(key);
  }

  @override
  Iterable<String> get keys => throw StateError('record traversal');
  @override
  void operator []=(String key, Object? value) =>
      throw UnsupportedError('read only');
  @override
  Object? remove(Object? key) => throw UnsupportedError('read only');
  @override
  void clear() => throw UnsupportedError('read only');
}

void main() {
  test('direct hexadecimal forms preserve RGBA alpha with native rounding', () {
    final cases = <Object, int>{
      '#f00': 0xffff0000,
      '#f008': 0x88ff0000,
      '#112233': 0xff112233,
      '#11223344': 0x44112233,
      'f00': 0xffff0000,
      '112233': 0xff112233,
      '11223344': 0x44112233,
      '0xf00': 0xffff0000,
      '0x112233': 0xff112233,
      '0x11223344': 0x44112233,
      '  #ABCd  ': 0xddaabbcc,
    };
    for (final entry in cases.entries) {
      expect(
        resolveDirectColor(entry.key).toARGB32(),
        entry.value,
        reason: '${entry.key}',
      );
    }
  });

  test('named CSS colors include synonyms and transparent', () {
    final cases = {
      'red': 0xffff0000,
      'rebeccapurple': 0xff663399,
      ' LightGoldenRodYellow ': 0xfffafad2,
      'gray': 0xff808080,
      'grey': 0xff808080,
      'black': 0xff000000,
      'transparent': 0x00000000,
    };
    for (final entry in cases.entries) {
      expect(resolveDirectColor(entry.key).toARGB32(), entry.value);
    }
  });

  test(
    'numeric RGB and 32-bit RRGGBBAA retain the accepted numeric contract',
    () {
      final cases = <Object, int>{
        0: 0xff000000,
        0xffffff: 0xffffffff,
        0xff0000: 0xffff0000,
        0x11223344: 0x44112233,
        0x01000000: 0x00010000,
        0xffffffff: 0xffffffff,
        16711680.0: 0xffff0000,
      };
      for (final entry in cases.entries) {
        expect(resolveDirectColor(entry.key).toARGB32(), entry.value);
      }
      for (final value in [-1, 1.5, 0x100000000, double.nan, double.infinity]) {
        expect(() => resolveDirectColor(value), throwsFormatException);
      }
    },
  );

  test(
    'RGB comma and modern space forms accept numbers, percentages and alpha',
    () {
      for (final input in [
        'rgb(255, 0, 0)',
        'rgb(100%, 0%, 0%)',
        'rgb(255 0 0)',
        'rgb(\n255\t0\n0\n)',
        'RGB(100% 0% 0%)',
      ]) {
        expect(resolveDirectColor(input).toARGB32(), 0xffff0000, reason: input);
      }
      for (final input in [
        'rgba(255, 0, 0, .5)',
        'rgb(100%, 0%, 0%, 50%)',
        'rgb(255 0 0 / 50%)',
        'rgba(100% 0% 0% / 0.5)',
      ]) {
        expect(resolveDirectColor(input).toARGB32(), 0x80ff0000, reason: input);
      }
      expect(resolveDirectColor('rgb(50% 50% 50%)').toARGB32(), 0xff808080);
      expect(resolveDirectColor('rgba(300, -50, 0, 2)').toARGB32(), 0xffff0000);
      expect(resolveDirectColor('rgb(0 0 0 / -10%)').toARGB32(), 0x00000000);
    },
  );

  test('HSL comma, space, units and hue wrapping resolve the same color', () {
    for (final input in [
      'hsl(120, 100%, 50%)',
      'hsl(120 100% 50%)',
      'hsl(120deg 100% 50%)',
      'hsl(133.33333333333333grad, 100%, 50%)',
      'hsl(${2 * math.pi / 3}rad 100% 50%)',
      'hsl(.3333333333333333turn 100% 50%)',
      'hsl(-240 100% 50%)',
      'hsl(480,100%,50%)',
    ]) {
      expect(resolveDirectColor(input).toARGB32(), 0xff00ff00, reason: input);
    }
    expect(resolveDirectColor('hsla(240,100%,50%,.5)').toARGB32(), 0x800000ff);
    expect(resolveDirectColor('hsl(0 0% 50% / 25%)').toARGB32(), 0x40808080);
    expect(resolveDirectColor('hsl(0 200% 50%)').toARGB32(), 0xffff0000);
    // Native rounding intentionally need not match Pixi's truncated RGB integer.
    expect(resolveDirectColor('hsl(25.404, 51%, 58%)').toARGB32(), 0xffcb8c5d);
  });

  test('normalized lists and RGB objects use distinct channel units', () {
    expect(resolveDirectColor([1, 0, 0]).toARGB32(), 0xffff0000);
    expect(resolveDirectColor([1, 0, .5, .5]).toARGB32(), 0x80ff0080);
    expect(
      resolveDirectColor({'r': 255, 'g': 0, 'b': 128}).toARGB32(),
      0xffff0080,
    );
    expect(
      resolveDirectColor({'r': 255, 'g': 0, 'b': 0, 'a': .5}).toARGB32(),
      0x80ff0000,
    );
    expect(resolveDirectColor({'r': 1, 'g': 0, 'b': 0}).toARGB32(), 0xff010000);
  });

  test('HSL and HSV objects use degrees, percentages and optional alpha', () {
    expect(
      resolveDirectColor({'h': 120, 's': 100, 'l': 50}).toARGB32(),
      0xff00ff00,
    );
    expect(
      resolveDirectColor({'h': 240, 's': 100, 'v': 100, 'a': .5}).toARGB32(),
      0x800000ff,
    );
    expect(
      resolveDirectColor({'h': -120, 's': 100, 'v': 100}).toARGB32(),
      0xff0000ff,
    );
    expect(
      resolveDirectColor({'h': 0, 's': 0, 'v': 50}).toARGB32(),
      0xff808080,
    );
  });

  test('malformed direct values fail explicitly without hash fallback', () {
    final invalid = <Object>[
      '',
      'unknown',
      'missing.token',
      '#12',
      '#12345',
      'abcd',
      '0xabcd',
      '#gg0000',
      'rgb()',
      'rgb(1,2)',
      'rgb(1 2 3 4)',
      'rgb(1,2,3 / .5)',
      'rgb(10%,2,3)',
      'rgb(NaN,0,0)',
      'rgb(1e2,0,0)',
      'rgb(1.,2,3)',
      'rgb(0 0 0 /)',
      'hsl(0,50,50)',
      'hsl(,0%,0%)',
      'hsl(50% 0% 0%)',
      'hsl(1foo 0% 0%)',
      [],
      [1, 0],
      [1, 0, 0, 1, 1],
      [255, 0, 0],
      [1, 0, double.nan],
      [1, 0, 0, -1],
      [true, 0, 0],
      {},
      {'r': 255, 'g': 0},
      {'r': 256, 'g': 0, 'b': 0},
      {'r': 255, 'g': 0, 'b': 0, 'extra': 1},
      {'h': 0, 's': 100, 'l': 50, 'v': 10},
      {'h': 0, 's': 101, 'l': 50},
      {'h': double.infinity, 's': 100, 'v': 100},
      {'h': 0, 's': 100},
      {'r': 0, 'g': 0, 'b': 0, 'a': 2},
      true,
    ];
    for (final value in invalid) {
      expect(
        () => resolveDirectColor(value),
        throwsFormatException,
        reason: '$value',
      );
    }
  });

  test(
    'resolved colors preserve palette isolation and mutable input validation',
    () {
      final first = ColorResolver(colors: {'accent': '#ff0000'});
      final second = ColorResolver(colors: {'accent': '#0000ff'});
      expect(first.resolve('accent').toARGB32(), 0xffff0000);
      expect(second.resolve('accent').toARGB32(), 0xff0000ff);
      final channels = <String, Object?>{'r': 255, 'g': 0, 'b': 0};
      expect(first.resolve(channels).toARGB32(), 0xffff0000);
      channels['r'] = 0;
      channels['b'] = 255;
      expect(first.resolve(channels).toARGB32(), 0xff0000ff);
      channels['b'] = -1;
      expect(() => first.resolve(channels), throwsFormatException);
      // Eviction must affect work only, never interpretation or error meaning.
      for (var i = 0; i < 300; i++) {
        first.resolve(i);
      }
      expect(first.resolve('accent').toARGB32(), 0xffff0000);
      expect(() => first.resolve('missing.color'), throwsFormatException);
      expect(() => first.resolve('missing.color'), throwsFormatException);
    },
  );

  test(
    'resolver merges default theme and permits nested and flat overrides',
    () {
      final resolver = ColorResolver(
        colors: {
          'primary': {'default': '#ff0000', 'light': '#eeeeee'},
          'primary.dark': '#0000ff',
          'textOnLight': '#111111',
          'black': '#222222',
        },
      );
      expect(resolver.resolve('primary.default').toARGB32(), 0xffff0000);
      expect(resolver.resolve('primary.dark').toARGB32(), 0xff0000ff);
      expect(resolver.resolve('primary.accent').toARGB32(), 0xffef4444);
      expect(resolver.resolve('gray.default').toARGB32(), 0xffd9d9d9);
      expect(resolver.resolve('textOnLight').toARGB32(), 0xff111111);
      expect(resolver.resolve('black').toARGB32(), 0xff222222);
      expect(resolver.resolve('white').toARGB32(), 0xffffffff);
      expect(resolver.resolve('transparent').toARGB32(), 0);
      expect(() => resolver.resolve('missing.token'), throwsFormatException);
      expect(ColorResolver().resolve('black').toARGB32(), 0xff1a1a1a);
      expect(resolveDirectColor('black').toARGB32(), 0xff000000);
    },
  );

  test(
    'theme aliases chain through nested and flat leaves before CSS lookup',
    () {
      final resolver = ColorResolver(
        colors: {
          'alias': 'nested.color',
          'nested': {'color': 'finalLeaf'},
          'finalLeaf': 'red',
          'red': [0, 1, 0, .5],
        },
      );
      expect(resolver.resolve('alias').toARGB32(), 0x8000ff00);
      expect(resolver.resolve('red').toARGB32(), 0x8000ff00);
      expect(resolveDirectColor('red').toARGB32(), 0xffff0000);
    },
  );

  test('constructor rejects alias cycles, unknown leaves and invalid JSON', () {
    for (final palette in <Map<String, Object?>>[
      {'one': 'two', 'two': 'one'},
      {'one': 'one'},
      {'one': 'missing.token'},
      {'one': null},
      {'one': true},
      {'one': double.nan},
      {'one': Object()},
      {
        'one': [1, 0, 0, 2],
      },
      {
        'one': {1: '#ffffff'},
      },
    ]) {
      expect(() => ColorResolver(colors: palette), throwsFormatException);
    }
    final cyclicMap = <String, Object?>{};
    cyclicMap['self'] = cyclicMap;
    expect(() => ColorResolver(colors: cyclicMap), throwsFormatException);
    final cyclicList = <Object?>[];
    cyclicList.add(cyclicList);
    expect(
      () => ColorResolver(colors: {'one': cyclicList}),
      throwsFormatException,
    );
  });

  test('palette JSON is deeply detached and independent between instances', () {
    final channels = <Object?>[1, 0, 0, .5];
    final rgb = <String, Object?>{'r': 0, 'g': 255, 'b': 0};
    final branch = <String, Object?>{'array': channels, 'object': rgb};
    final palette = <String, Object?>{
      'custom': branch,
      'alias': 'custom.array',
    };
    final resolver = ColorResolver(colors: palette);
    channels[0] = 0;
    rgb['g'] = 0;
    branch['array'] = '#000000';
    palette.clear();
    expect(resolver.resolve('alias').toARGB32(), 0x80ff0000);
    expect(resolver.resolve('custom.object').toARGB32(), 0xff00ff00);
    expect(ColorResolver().resolve('primary.default').toARGB32(), 0xff0c73bf);
  });

  test('tint multiplication includes alpha and rounds to native bytes', () {
    expect(
      multiplyColors(
        const Color(0x80102030),
        const Color(0x80ffffff),
      ).toARGB32(),
      0x40102030,
    );
    expect(
      multiplyColors(
        const Color(0xffffffff),
        const Color(0xff123456),
      ).toARGB32(),
      0xff123456,
    );
    expect(
      multiplyColors(
        const Color(0xff808080),
        const Color(0xff808080),
      ).toARGB32(),
      0xff404040,
    );
    expect(
      multiplyColors(
        const Color(0x00ffffff),
        const Color(0xffff0000),
      ).toARGB32(),
      0x00ff0000,
    );
  });

  test(
    'schema admits consumer theme leaves and final admission resolves the configured palette',
    () {
      final document = const DatasetReader().read([
        {
          'type': 'item',
          'size': 20,
          'components': [
            {
              'type': 'bar',
              'source': {'fill': 'white'},
              'size': '100%',
              'tint': 'statusRed',
            },
            {
              'type': 'text',
              'style': {'fill': 'textOnLight'},
            },
          ],
        },
      ]);
      final before = document.roots.single;
      final palette = ColorResolver(
        colors: {
          'statusRed': '#e74c3c',
          'textOnLight': '#111111',
          'primary': {'dark': '#063559'},
        },
      );
      styles.validateDatasetColors(document.roots, palette);
      expect(document.roots.single, same(before));
      expect(palette.resolve('statusRed').toARGB32(), 0xffe74c3c);
      expect(palette.resolve('textOnLight').toARGB32(), 0xff111111);
      expect(palette.resolve('primary.dark').toARGB32(), 0xff063559);
      expect(palette.resolve('primary.accent').toARGB32(), 0xffef4444);
      expect(
        () => styles.validateDatasetColors(document.roots, ColorResolver()),
        throwsA(colorDiagnostic(r'$[0].components[0].tint')),
      );
    },
  );

  test(
    'direct schema validation shares the native resolver instead of broad JSON bypasses',
    () {
      final valid = <Object>[
        '#1234',
        'rgb(10 20 30 / 50%)',
        'hsl(.5turn 100% 50%)',
        [1, 0, 0, .5],
        {'r': 12, 'g': 34, 'b': 56},
        {'h': 240, 's': 100, 'v': 100},
        0x11223344,
      ];
      for (final value in valid) {
        final admitted = styles.color(value, r'$.fill');
        expect(resolveDirectColor(admitted), resolveDirectColor(value));
      }
      for (final value in <Object?>[
        null,
        true,
        -1,
        1.5,
        0x100000000,
        [],
        [255, 0, 0],
        {'r': 1, 'g': 2},
        {'unsupported': '#ffffff'},
        'rgb(nope)',
        '#12345',
        'url(image)',
        'rgb(1.,2,3)',
      ]) {
        expect(
          () => styles.color(value, r'$.fill'),
          throwsA(colorDiagnostic(r'$.fill')),
          reason: '$value',
        );
      }
      expect(
        () => styles.color([1, 0, 0, double.nan], r'$.fill'),
        throwsA(colorDiagnostic(r'$.fill[3]')),
      );
      final input = <Object?>[1, 0, 0, .5];
      final detached = styles.color(input, r'$.fill') as List;
      input[0] = 0;
      expect(detached, [1, 0, 0, .5]);
      expect(() => detached[0] = 0, throwsUnsupportedError);
    },
  );

  test(
    'recursive tag styles, shadows and stroke fills are semantic color owners',
    () {
      final document = const DatasetReader().read([
        {
          'type': 'text',
          'style': {
            'fill': 'statusRed',
            'stroke': {'color': 'textOnLight', 'fill': 'statusRed'},
            'dropShadow': {'color': 'textOnLight'},
            'tagStyles': {
              'outer': {
                'fill': 'statusRed',
                'tagStyles': {
                  'inner': {
                    'stroke': {'color': 'missingLeaf'},
                  },
                },
              },
            },
          },
        },
      ]);
      final palette = ColorResolver(
        colors: {'statusRed': 'red', 'textOnLight': '#111111'},
      );
      expect(
        () => styles.validateDatasetColors(document.roots, palette),
        throwsA(
          colorDiagnostic(
            r'$[0].style.tagStyles.outer.tagStyles.inner.stroke.color',
          ),
        ),
      );
      styles.validateDatasetColors(
        document.roots,
        ColorResolver(
          colors: {
            'statusRed': 'red',
            'textOnLight': '#111111',
            'missingLeaf': [0, 0, 1],
          },
        ),
      );
      expect(
        () => styles.validateRecordColors({
          'type': 'text',
          'style': {
            'dropShadow': {'color': 'missingLeaf'},
          },
        }, palette),
        throwsA(colorDiagnostic(r'$.style.dropShadow.color')),
      );
      expect(
        () => styles.validateRecordColors({
          'type': 'text',
          'style': {'stroke': 'missingLeaf'},
        }, palette),
        throwsA(colorDiagnostic(r'$.style.stroke')),
      );
    },
  );

  test(
    'unsupported gradients have an explicit diagnostic at the owning style path',
    () {
      for (final value in <Object>[
        ['red', 'blue'],
        {
          'type': 'linear',
          'stops': [
            {'offset': 0, 'color': 'red'},
          ],
        },
      ]) {
        expect(
          () => styles.textStyle(
            {
              'tagStyles': {
                'hot': {'fill': value},
              },
            },
            r'$.style',
            item: true,
          ),
          throwsA(colorDiagnostic(r'$.style.tagStyles.hot.fill', 'Gradient')),
        );
      }
      // Stroke fill is retained as compatibility JSON by the schema. Its native
      // semantics must still be checked, including when nested in a tag style.
      final normalized = styles.textStyle(
        {
          'tagStyles': {
            'hot': {
              'stroke': {
                'fill': {
                  'type': 'radial',
                  'colorStops': [
                    {'color': 'red', 'offset': 0},
                  ],
                },
              },
            },
          },
        },
        r'$.style',
        item: true,
      );
      expect(
        () => styles.validateRecordColors({
          'type': 'text',
          'style': normalized,
        }, ColorResolver()),
        throwsA(
          colorDiagnostic(r'$.style.tagStyles.hot.stroke.fill', 'Gradient'),
        ),
      );
    },
  );

  test(
    'schema-directed traversal checks templates once and ignores host color-like metadata',
    () {
      final document = const DatasetReader().read([
        {
          'type': 'group',
          'attrs': {
            'color': null,
            'fill': ['invalid'],
          },
          'children': [
            {
              'type': 'grid',
              'cells': [
                [1, 1],
              ],
              'item': {
                'size': 20,
                'components': [
                  {
                    'type': 'bar',
                    'size': 10,
                    'source': {
                      'fill': 'statusRed',
                      'borderColor': 'textOnLight',
                    },
                  },
                  {
                    'type': 'background',
                    'source': {
                      'src': 'a.svg',
                      'data': {'color': 'missing', 'fill': '#nothex'},
                    },
                  },
                  {
                    'type': 'icon',
                    'size': 3,
                    'source': {
                      'src': 'b.svg',
                      'data': {'fill': true},
                    },
                  },
                  {
                    'type': 'text',
                    'style': {
                      'filters': [
                        {'color': 'missing'},
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
        {
          'type': 'rect',
          'size': 3,
          'fill': [0, 1, 0],
          'stroke': {'color': 'statusRed'},
        },
        {
          'type': 'relations',
          'links': [],
          'style': {'color': 'textOnLight'},
        },
        {
          'type': 'image',
          'source': {
            'src': 'c.png',
            'data': {'color': false},
          },
        },
      ]);
      styles.validateDatasetColors(
        document.roots,
        ColorResolver(colors: {'statusRed': 'red', 'textOnLight': '#111111'}),
      );
      expect(
        () => styles.validateDatasetColors(document.roots, ColorResolver()),
        throwsA(
          colorDiagnostic(r'$[0].children[0].item.components[0].source.fill'),
        ),
      );
      expect(
        () => styles.validateRecordColors({
          'type': 'rect',
          'stroke': {'color': 'missingLeaf'},
        }, ColorResolver()),
        throwsA(colorDiagnostic(r'$.stroke.color')),
      );
      expect(
        () => styles.validateRecordColors({
          'type': 'relations',
          'style': {'color': 'missingLeaf'},
        }, ColorResolver()),
        throwsA(colorDiagnostic(r'$.style.color')),
      );
    },
  );

  test(
    'selected color roots reuse schema validation without unrelated reads',
    () {
      final palette = ColorResolver();
      final cases =
          <
            ({
              String type,
              String field,
              Object valid,
              Object invalid,
              String path,
            })
          >[
            (
              type: 'icon',
              field: 'tint',
              valid: 'red',
              invalid: 'missingLeaf',
              path: r'$.tint',
            ),
            (
              type: 'background',
              field: 'tint',
              valid: 'red',
              invalid: 'missingLeaf',
              path: r'$.tint',
            ),
            (
              type: 'bar',
              field: 'tint',
              valid: 'red',
              invalid: 'missingLeaf',
              path: r'$.tint',
            ),
            (
              type: 'text',
              field: 'tint',
              valid: 'red',
              invalid: 'missingLeaf',
              path: r'$.tint',
            ),
            (
              type: 'background',
              field: 'source',
              valid: {'type': 'rect', 'fill': 'red'},
              invalid: {'type': 'rect', 'fill': 'missingLeaf'},
              path: r'$.source.fill',
            ),
            (
              type: 'bar',
              field: 'source',
              valid: {'type': 'rect', 'borderColor': 'red'},
              invalid: {'type': 'rect', 'borderColor': 'missingLeaf'},
              path: r'$.source.borderColor',
            ),
            (
              type: 'text',
              field: 'style',
              valid: {'fill': 'red'},
              invalid: {
                'tagStyles': {
                  'hot': {
                    'stroke': {'fill': 'missingLeaf'},
                  },
                },
              },
              path: r'$.style.tagStyles.hot.stroke.fill',
            ),
            (
              type: 'relations',
              field: 'style',
              valid: {'color': 'red'},
              invalid: {'color': 'missingLeaf'},
              path: r'$.style.color',
            ),
            (
              type: 'rect',
              field: 'fill',
              valid: 'red',
              invalid: 'missingLeaf',
              path: r'$.fill',
            ),
            (
              type: 'rect',
              field: 'stroke',
              valid: {'color': 'red', 'fill': 'missingLeaf'},
              invalid: {'color': 'missingLeaf'},
              path: r'$.stroke.color',
            ),
          ];
      for (final entry in cases) {
        final values = <String, Object?>{
          'type': entry.type,
          'tint': 'missingLeaf',
          'source': {'fill': 'missingLeaf'},
          'style': {'fill': 'missingLeaf'},
          'fill': 'missingLeaf',
          'stroke': {'color': 'missingLeaf'},
          entry.field: entry.valid,
        };
        styles.validateRecordColors(
          _SelectedRecord(values, entry.field),
          palette,
          field: entry.field,
        );
        values[entry.field] = entry.invalid;
        expect(
          () => styles.validateRecordColors(
            _SelectedRecord(values, entry.field),
            palette,
            field: entry.field,
          ),
          throwsA(colorDiagnostic(entry.path)),
        );
      }
    },
  );

  test(
    'selected groups never traverse owners while full validation still does',
    () {
      final palette = ColorResolver();
      final child = <String, Object?>{'type': 'icon', 'tint': 'missingLeaf'};
      final owners = <(Map<String, Object?>, String)>[
        (
          {
            'type': 'group',
            'children': [child],
          },
          r'$.children[0].tint',
        ),
        (
          {
            'type': 'grid',
            'item': {
              'components': [child],
            },
          },
          r'$.item.components[0].tint',
        ),
        (
          {
            'type': 'item',
            'components': [child],
          },
          r'$.components[0].tint',
        ),
      ];
      for (final (owner, path) in owners) {
        for (final field in ['tint', 'source', 'style', 'fill', 'stroke']) {
          styles.validateRecordColors(
            _SelectedRecord(owner, field),
            palette,
            field: field,
          );
        }
        expect(
          () => styles.validateRecordColors(owner, palette),
          throwsA(colorDiagnostic(path)),
        );
      }
      expect(
        () => styles.validateRecordColors(
          {
            'type': 'text',
            'tint': 'red',
            'style': {'fill': 'missingLeaf'},
          },
          palette,
          field: 'style',
          path: r'$.item',
        ),
        throwsA(colorDiagnostic(r'$.item.style.fill')),
      );
    },
  );

  test(
    'partial effective records use the same color seam without inventing fields',
    () {
      final palette = ColorResolver(colors: {'statusRed': 'red'});
      styles.validateRecordColors({
        'type': 'text',
        'style': {'fill': 'statusRed'},
      }, palette);
      styles.validateRecordColors({'type': 'group'}, palette);
      styles.validateRecordColors({'type': 'grid'}, palette);
      expect(
        () => styles.validateRecordColors({
          'type': 'icon',
          'tint': 'missingLeaf',
        }, palette),
        throwsA(colorDiagnostic(r'$.tint')),
      );
    },
  );
}

Matcher colorDiagnostic(String path, [String? message]) =>
    isA<DatasetException>()
        .having((error) => error.code, 'code', 'INVALID_VALUE')
        .having((error) => error.path, 'path', path)
        .having(
          (error) => message == null || error.message.contains(message),
          'message',
          isTrue,
        );
