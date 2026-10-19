import 'dart:typed_data';
import 'dart:ui';

import 'package:conalog_patch_map/src/dataset/colors.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/rendering/rectangle_paint.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, Object?> _element(Map<String, Object?> fields) =>
    const DatasetReader()
        .read([
          {'type': 'rect', 'id': 'rect', 'size': 20, ...fields},
        ])
        .roots
        .single;

Map<String, Object?> _texture(Map<String, Object?> source) =>
    ((const DatasetReader()
                        .read([
                          {
                            'type': 'item',
                            'id': 'item',
                            'size': 20,
                            'components': [
                              {
                                'type': 'background',
                                'id': 'background',
                                'source': source,
                              },
                            ],
                          },
                        ])
                        .roots
                        .single['components']!
                    as List)
                .single
            as Map)['source']!
        as Map<String, Object?>;

Future<ByteData> _pixels(
  RectanglePaint paint, {
  Rect rect = const Rect.fromLTWH(10, 10, 20, 20),
}) async {
  final recorder = PictureRecorder();
  paint.paint(Canvas(recorder), rect);
  final picture = recorder.endRecording();
  final image = await picture.toImage(48, 48);
  try {
    return (await image.toByteData(format: ImageByteFormat.rawStraightRgba))!;
  } finally {
    image.dispose();
    picture.dispose();
  }
}

List<int> _pixel(ByteData bytes, int x, int y) => [
  for (var channel = 0; channel < 4; channel++)
    bytes.getUint8((y * 48 + x) * 4 + channel),
];

void main() {
  final palette = ColorResolver();

  test('admitted defaults and each radius grammar retain immutable values', () {
    final empty = RectanglePaint.fromElement(_element({}), palette, 1);
    expect(empty.fillColor, const Color(0xffffffff));
    expect(empty.strokeWidth, 0);
    expect(empty.uniformRadius, 0);
    for (final radius in <Object>[
      [12, 6, 3, 9],
      {'topLeft': 12, 'topRight': 6, 'bottomRight': 3, 'bottomLeft': 9},
    ]) {
      final style = RectanglePaint.fromElement(
        _element({'radius': radius}),
        palette,
        1,
      );
      expect(style.radii, [12, 6, 3, 9]);
      expect(style.uniformRadius, isNull);
      final fitted = style.roundedRect(const Size(18, 14));
      expect(fitted.tlRadiusX, 8);
      expect(fitted.trRadiusX, 4);
      expect(fitted.brRadiusX, 2);
      expect(fitted.blRadiusX, 6);
      expect(() => style.radii[0] = 5, throwsUnsupportedError);
    }
    final uniform = RectanglePaint.fromTexture(
      _texture({'radius': 12}),
      palette,
      '#fff',
      1,
    );
    expect(uniform.uniformRadius, 12);
    expect(uniform.roundedRect(const Size(20, 10)).tlRadiusX, 5);
  });

  test('stroke settings and color alpha resolve without retained input', () {
    final stroke = <String, Object?>{
      'color': '#ff000080',
      'alpha': .5,
      'width': 4,
      'alignment': .25,
      'join': 'bevel',
      'cap': 'square',
      'miterLimit': 7,
    };
    final style = RectanglePaint.fromElement(
      _element({'stroke': stroke}),
      palette,
      .5,
    );
    stroke['width'] = 99;
    expect(style.strokeWidth, 4);
    expect(style.strokeAlignment, .25);
    expect(style.strokeJoin, StrokeJoin.bevel);
    expect(style.strokeCap, StrokeCap.square);
    expect(style.strokeMiterLimit, 7);
    expect(style.strokeColor.a, closeTo(128 / 255 * .25, 1e-6));
    expect(
      () => style.roundedRect(const Size(double.infinity, 10)),
      throwsArgumentError,
    );
  });

  test(
    'unsupported resource and device-space stroke fields fail explicitly',
    () {
      for (final field in <Map<String, Object?>>[
        {'pixelLine': true},
        {'texture': {}},
        {
          'matrix': [1, 0, 0, 1, 0, 0],
        },
        {'textureSpace': 'local'},
      ]) {
        expect(
          () => RectanglePaint.fromElement(
            _element({'stroke': field}),
            palette,
            1,
          ),
          throwsUnsupportedError,
        );
      }
      expect(
        () => RectanglePaint.fromElement(
          _element({
            'stroke': {
              'fill': {'colorStops': []},
            },
          }),
          palette,
          1,
        ),
        throwsFormatException,
      );
      expect(
        () => RectanglePaint.fromTexture(
          {'src': 'asset.png'},
          palette,
          '#fff',
          1,
        ),
        throwsUnsupportedError,
      );
      expect(
        () => RectanglePaint.fromElement(_element({}), palette, double.nan),
        throwsArgumentError,
      );
    },
  );

  testWidgets(
    'centered texture border paints inside and outside the supplied bounds',
    (tester) async {
      final style = RectanglePaint.fromTexture(
        _texture({
          'fill': '#ff0000',
          'borderColor': '#0000ff',
          'borderWidth': 4,
        }),
        palette,
        '#fff',
        1,
      );
      final bytes = await tester.runAsync(() => _pixels(style));
      expect(_pixel(bytes!, 7, 20), [0, 0, 0, 0]);
      expect(_pixel(bytes, 8, 20), [0, 0, 255, 255]);
      expect(_pixel(bytes, 11, 20), [0, 0, 255, 255]);
      expect(_pixel(bytes, 13, 20), [255, 0, 0, 255]);
      expect(_pixel(bytes, 31, 20), [0, 0, 255, 255]);
      expect(_pixel(bytes, 32, 20), [0, 0, 0, 0]);
    },
  );

  testWidgets(
    'radii clear corners and multiply tint and opacity on fill and border',
    (tester) async {
      final style = RectanglePaint.fromTexture(
        _texture({
          'fill': '#ffffff80',
          'borderColor': '#ffffff',
          'borderWidth': 2,
          'radius': 8,
        }),
        palette,
        '#4080ff80',
        .5,
      );
      final bytes = await tester.runAsync(() => _pixels(style));
      expect(_pixel(bytes!, 10, 10), [0, 0, 0, 0]);
      final center = _pixel(bytes, 20, 20);
      expect(center[0], closeTo(64, 4));
      expect(center[1], closeTo(128, 4));
      expect(center[2], 255);
      expect(center[3], closeTo(32, 1));
      final border = _pixel(bytes, 20, 9);
      expect(border[0], closeTo(64, 4));
      expect(border[1], closeTo(128, 4));
      expect(border[2], 255);
      expect(border[3], closeTo(64, 1));
    },
  );

  testWidgets('inside outside and oversized inside strokes respect alignment', (
    tester,
  ) async {
    for (final alignment in [0.0, .25, 1.0]) {
      final style = RectanglePaint.fromElement(
        _element({
          'fill': '#00000000',
          'stroke': {'width': 4, 'color': '#00ff00', 'alignment': alignment},
        }),
        palette,
        1,
      );
      final bytes = await tester.runAsync(() => _pixels(style));
      expect(
        _pixel(bytes!, alignment == 1 ? 9 : 7, 20)[3],
        alignment == 1 ? 0 : 255,
      );
      expect(_pixel(bytes, 10, 20)[3], alignment == 0 ? 0 : 255);
    }
    final thick = RectanglePaint.fromElement(
      _element({
        'stroke': {'width': 100, 'color': '#00ff00', 'alignment': 1},
      }),
      palette,
      1,
    );
    final bytes = await tester.runAsync(() => _pixels(thick));
    expect(_pixel(bytes!, 9, 20)[3], 0);
    expect(_pixel(bytes, 20, 20), [0, 255, 0, 255]);
  });
}
