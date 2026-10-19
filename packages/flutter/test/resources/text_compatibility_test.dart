import 'dart:io';
import 'dart:ui' as ui;

import 'package:conalog_patch_map/src/dataset/colors.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/resources/text/text_layout.dart';
import 'package:conalog_patch_map/src/resources/text/text_spec.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, Object?> component(Map<String, Object?> values) {
  final document = DatasetReader().read([
    {
      'type': 'item',
      'id': 'i',
      'size': 200,
      'components': [
        {'type': 'text', 'id': 't', 'text': 'MMMM', ...values},
      ],
    },
  ]);
  return document.targets['i']!.components['t']!;
}

TextSpec spec(Map<String, Object?> data) =>
    TextSpec.fromData(data, const ui.Size(200, 200), ColorResolver());
Future<List<int>> pixels(TextSpec value) async {
  final layout = NativeTextLayout(value).resolve();
  final recorder = ui.PictureRecorder();
  layout.paint(ui.Canvas(recorder), const ui.Offset(10, 10));
  final picture = recorder.endRecording();
  final image = await picture.toImage(240, 120);
  try {
    return (await image.toByteData())!.buffer.asUint8List().toList();
  } finally {
    image.dispose();
    picture.dispose();
    layout.dispose();
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final font = FontLoader('FiraCode')
      ..addFont(
        Future.value(
          ByteData.sublistView(
            File('assets/fonts/FiraCode-VF.ttf').readAsBytesSync(),
          ),
        ),
      );
    await font.load();
  });
  test(
    'canonical component tint overrides red fill including default white',
    () {
      expect(
        spec(
          component({
            'style': {'fill': 'red'},
          }),
        ).color,
        const ui.Color(0xffffffff),
      );
      expect(
        spec(
          component({
            'tint': 'blue',
            'style': {'fill': 'red'},
          }),
        ).color,
        const ui.Color(0xff0000ff),
      );
      final standalone = DatasetReader()
          .read([
            {
              'type': 'text',
              'id': 's',
              'text': 'MMMM',
              'style': {'fill': 'red'},
            },
          ])
          .roots
          .single;
      expect(spec(standalone).color, const ui.Color(0xffff0000));
    },
  );
  test(
    'native red fill plus blue tint paints blue rather than multiplied black',
    () async {
      final rgba = await pixels(
        spec(
          component({
            'tint': 'blue',
            'style': {'fontSize': 32, 'fill': 'red'},
          }),
        ),
      );
      var blue = 0, red = 0, black = 0;
      for (var i = 0; i < rgba.length; i += 4) {
        if (rgba[i + 3] < 200) continue;
        if (rgba[i] < 30 && rgba[i + 1] < 30 && rgba[i + 2] > 200) blue++;
        if (rgba[i] > 200 && rgba[i + 2] < 30) red++;
        if (rgba[i] < 30 && rgba[i + 1] < 30 && rgba[i + 2] < 30) black++;
      }
      expect(blue, greaterThan(0));
      expect(red, 0);
      expect(black, 0);
    },
  );
  test(
    'stroke raster color is multiplied by selected object RGB and alpha',
    () {
      final blue = spec(
        component({
          'tint': '#0000ff80',
          'style': {
            'fill': '#ff000080',
            'alpha': .5,
            'stroke': {'color': '#ffffff80', 'alpha': .5, 'width': 2},
          },
        }),
      );
      expect(blue.color.r, 0);
      expect(blue.color.b, 1);
      expect(blue.color.a, closeTo((128 / 255) * .5, .005));
      expect(blue.strokeColor!.b, 1);
      expect(
        blue.strokeColor!.a,
        closeTo((128 / 255) * (128 / 255) * .5 * .5, .005),
      );
      final standalone = spec({
        'text': 'A',
        'style': {
          'fill': 'red',
          'stroke': {'color': 'blue', 'width': 2},
        },
      });
      expect(standalone.strokeColor, const ui.Color(0xff000000));
    },
  );
  test(
    'ignored release shadow and padding preserve native pixels and metrics',
    () async {
      final data = component({
        'tint': '#123456',
        'style': {
          'fontSize': 32,
          'padding': 18,
          'dropShadow': {'color': 'red', 'blur': 8, 'distance': 12},
        },
      });
      final styled = spec(data);
      final plain = spec(
        component({
          'tint': '#123456',
          'style': {'fontSize': 32},
        }),
      );
      expect(styled.shadow, isNull);
      expect(styled.padding, 0);
      expect(styled.unsupportedFields, containsAll(['padding', 'dropShadow']));
      expect((data['style']! as Map)['padding'], 18);
      expect((data['style']! as Map)['dropShadow'], isNotNull);
      final a = NativeTextLayout(styled).resolve(),
          b = NativeTextLayout(plain).resolve();
      try {
        expect(a.size, b.size);
        expect(a.fontSize, b.fontSize);
        expect(a.paintOffset, b.paintOffset);
      } finally {
        a.dispose();
        b.dispose();
      }
      expect(await pixels(styled), await pixels(plain));
    },
  );
  test(
    'stroke and fill overlap receives object alpha after raster composition',
    () async {
      final rgba = await pixels(
        spec(
          component({
            'tint': '#0000ff80',
            'style': {
              'fontSize': 32,
              'fill': 'red',
              'stroke': {'color': 'white', 'width': 6},
            },
          }),
        ),
      );
      var maximum = 0;
      for (var i = 3; i < rgba.length; i += 4) {
        if (rgba[i] > maximum) maximum = rgba[i];
      }
      expect(maximum, inInclusiveRange(127, 129));
    },
  );

  test(
    'unsupported JSON stroke fill does not copy the Pixi red error fallback',
    () {
      final value = spec(
        component({
          'style': {
            'stroke': {'fill': 'blue', 'width': 2},
          },
        }),
      );
      expect(value.unsupportedFields, contains('stroke.fill'));
      expect(value.strokeColor, isNot(const ui.Color(0xffff0000)));
    },
  );
}
