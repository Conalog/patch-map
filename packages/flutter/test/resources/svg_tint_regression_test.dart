import 'dart:convert';
import 'dart:ui' as ui;
import 'package:conalog_patch_map/src/resources/svg/svg_source.dart';
import 'package:conalog_patch_map/src/resources/svg/svg_vectors.dart';
import 'package:flutter_test/flutter_test.dart';

Future<List<int>> pixel(SvgVector vector, int x, int y) async {
  final image = await vector.picture.toImage(20, 10);
  try {
    final bytes = (await image.toByteData(
      format: ui.ImageByteFormat.rawStraightRgba,
    ))!;
    return [for (var i = 0; i < 4; i++) bytes.getUint8((y * 20 + x) * 4 + i)];
  } finally {
    image.dispose();
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'tint alpha applies once to composed SVG artwork, including overlaps',
    () async {
      const xml =
          '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="15" height="10" fill="red"/><rect x="5" width="15" height="10" fill="blue"/></svg>';
      final store = SvgVectorStore(sourceLoader: (_) async => xml);
      final lease = store.acquire(
        SvgSourceResolver().resolve('overlap.svg'),
        tint: const ui.Color(0x80ffffff),
      );
      final vector = await lease.ready;
      final nonoverlap = await pixel(vector, 2, 5),
          overlap = await pixel(vector, 10, 5);
      lease.release();
      store.close();
      expect(nonoverlap[3], 128);
      expect(overlap, [0, 0, 255, 128]);
    },
  );
  test('tint multiplies embedded SVG image pixels', () async {
    final recorder = ui.PictureRecorder();
    ui.Canvas(recorder).drawRect(
      const ui.Rect.fromLTWH(0, 0, 20, 10),
      ui.Paint()..color = const ui.Color(0xffff0000),
    );
    final picture = recorder.endRecording();
    final image = await picture.toImage(20, 10);
    final data = (await image.toByteData(format: ui.ImageByteFormat.png))!;
    final encoded = base64Encode(
      data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes),
    );
    image.dispose();
    picture.dispose();
    final xml =
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="20" height="10"><image width="20" height="10" xlink:href="data:image/png;base64,$encoded"/></svg>';
    final store = SvgVectorStore(sourceLoader: (_) async => xml);
    final lease = store.acquire(
      SvgSourceResolver().resolve('embedded.svg'),
      tint: const ui.Color(0xff00ff00),
    );
    final vector = await lease.ready;
    final value = await pixel(vector, 10, 5);
    lease.release();
    store.close();
    expect(value, [0, 0, 0, 255]);
  });
}
