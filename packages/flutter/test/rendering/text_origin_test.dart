import 'dart:io';
import 'dart:ui' as ui;

import 'package:conalog_patch_map/src/dataset/colors.dart';
import 'package:conalog_patch_map/src/frame/resource_retirement.dart';
import 'package:conalog_patch_map/src/rendering/draw_objects.dart';
import 'package:conalog_patch_map/src/resources/text/text_layout.dart';
import 'package:conalog_patch_map/src/resources/text/text_pool.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

Future<Uint8List> _pixels(void Function(ui.Canvas) paint) async {
  final recorder = ui.PictureRecorder();
  final canvas = ui.Canvas(recorder)
    ..translate(20, 20)
    ..rotate(.17)
    ..scale(1.2);
  paint(canvas);
  final picture = recorder.endRecording();
  final image = await picture.toImage(320, 160);
  try {
    return (await image.toByteData())!.buffer.asUint8List();
  } finally {
    image.dispose();
    picture.dispose();
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
    'text preserves origin, shifted destination and stroked inset pixels',
    () async {
      final retirement = ResourceRetirement();
      final pool = TextPool(
        palette: ColorResolver(),
        retirement: retirement,
        onReady: () {},
      )..setActive(false);
      try {
        for (final stroke in [0.0, 4.0]) {
          final handle = pool.acquire({
            'text': 'Panel 12',
            'style': {
              'fontFamily': 'FiraCode',
              'fontSize': 24,
              'fill': '#123456',
              'alpha': .5,
              if (stroke > 0) 'stroke': {'width': stroke},
            },
          }, null);
          final content = TextContent(pool, handle);
          final native = NativeTextLayout(handle.spec).resolve();
          try {
            for (final offset in [
              ui.Offset.zero,
              const ui.Offset(17, 9),
              const ui.Offset(0, 9),
              const ui.Offset(17, 0),
            ]) {
              final actual = await _pixels(
                (canvas) => content.paint(canvas, offset & handle.size, 1),
              );
              final expected = await _pixels((canvas) {
                if (native.paintOpacity < 1) {
                  canvas.saveLayer(
                    (offset & native.size).inflate(1),
                    ui.Paint()
                      ..color = const ui.Color(
                        0xffffffff,
                      ).withValues(alpha: native.paintOpacity),
                  );
                }
                final origin = offset + ui.Offset(stroke / 2, stroke / 2);
                if (native.strokeParagraph != null) {
                  canvas.drawParagraph(native.strokeParagraph!, origin);
                }
                canvas.drawParagraph(native.paragraph, origin);
                if (native.paintOpacity < 1) canvas.restore();
              });
              expect(actual, expected, reason: '$offset / stroke $stroke');
              expect(actual.any((byte) => byte != 0), true);
            }
          } finally {
            native.dispose();
            content.dispose();
          }
        }
      } finally {
        pool.close();
        retirement.close();
      }
    },
  );
}
