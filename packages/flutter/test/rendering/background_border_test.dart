import 'dart:typed_data';
import 'dart:ui';

import 'package:conalog_patch_map/src/api/target.dart';
import 'package:flutter_test/flutter_test.dart';

import 'draw_plan_test.dart' as support;

Map<String, Object?> background(double width) => {
  'type': 'background',
  'id': 'bg',
  'source': {
    'type': 'rect',
    'fill': '#ff0000',
    'borderColor': '#0000ff',
    'borderWidth': width,
  },
};

// release/1.0 lowers the full item rectangle, with centered stroke alignment.
// Independent Canvas output avoids comparing two paths with the same inset bug.
Future<Uint8List> expectedPixels(double width) async {
  final recorder = PictureRecorder(), canvas = Canvas(recorder);
  const rect = Rect.fromLTWH(32, 32, 20, 20);
  canvas.drawRect(rect, Paint()..color = const Color(0xffff0000));
  if (width > 0) {
    canvas.drawRect(
      rect,
      Paint()
        ..color = const Color(0xff0000ff)
        ..style = PaintingStyle.stroke
        ..strokeWidth = width,
    );
  }
  final picture = recorder.endRecording();
  final image = await picture.toImage(128, 128);
  try {
    return (await image.toByteData(
      format: ImageByteFormat.rawRgba,
    ))!.buffer.asUint8List();
  } finally {
    image.dispose();
    picture.dispose();
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final width in [0.0, 4.0, 20.0, 30.0]) {
    test(
      'background width $width preserves full rect in both paint paths',
      () async {
        final h = support.Harness(active: false);
        addTearDown(h.close);
        final p = h.read([
          support.item(
            'a',
            32,
            y: 32,
            size: 20,
            components: [background(width)],
          ),
        ]);
        final expected = await expectedPixels(width);
        final direct = await support.render(p, reference: true);
        final planned = await support.render(p);
        support.compare(direct, expected, interior: [(31, 42), (42, 42)]);
        support.compare(planned, expected, interior: [(31, 42), (42, 42)]);
        expect(direct[(42 * 128 + 42) * 4 + 3], 255);
        expect(p.plan.staticChunkCount, width < 20 ? 1 : 0);
        expect(p.geometry['a']!.bounds, const Rect.fromLTWH(32, 32, 20, 20));
        expect(
          p.geometry['a']!.paintBounds,
          const Rect.fromLTWH(32, 32, 20, 20).inflate(width / 2),
        );
      },
    );
  }

  test(
    'border source changes invalidate bounds but tint changes reuse them',
    () {
      final h = support.Harness(active: false);
      addTearDown(h.close);
      final p = h.read([
        {
          ...support.item(
            'a',
            60,
            y: 32,
            size: 20,
            components: [background(4)],
          ),
          'attrs': {'x': 60, 'y': 32, 'angle': 90, 'scaleX': 2},
        },
      ]);
      var geometry = p.geometry;
      for (final width in [20.0, 0.0]) {
        final before = support.component(geometry, 'a', 'bg');
        final after = geometry.prepare({
          const PatchMapTarget('a', componentId: 'bg'): {
            ...before,
            'source': {...before['source']! as Map, 'borderWidth': width},
          },
        }, h.text.measure).snapshot;
        // Rotation maps local (x,y) to (60-y,32+2*x).
        final expected = Rect.fromLTRB(
          40 - width / 2,
          32 - width,
          60 + width / 2,
          72 + width,
        );
        expect(after['a']!.paintBounds!.left, closeTo(expected.left, 1e-9));
        expect(after['a']!.paintBounds!.top, closeTo(expected.top, 1e-9));
        expect(after['a']!.paintBounds!.right, closeTo(expected.right, 1e-9));
        expect(after['a']!.paintBounds!.bottom, closeTo(expected.bottom, 1e-9));
        expect(after['a']!.bounds, same(geometry['a']!.bounds));
        geometry = after;
      }
      final before = support.component(geometry, 'a', 'bg');
      final tinted = geometry.prepare({
        const PatchMapTarget('a', componentId: 'bg'): {
          ...before,
          'tint': '#808080',
        },
      }, h.text.measure).snapshot;
      expect(tinted['a']!.paintBounds, same(geometry['a']!.paintBounds));
    },
  );

  test('touching outer borders retain item draw order', () async {
    final h = support.Harness(active: false);
    addTearDown(h.close);
    final p = h.read([
      for (final entry in [('a', 32.0), ('b', 55.0)])
        support.item(
          entry.$1,
          entry.$2,
          y: 32,
          size: 20,
          components: [background(4), support.bar(size: 20)],
        ),
    ]);
    expect(p.plan.staticChunkCount, 0);
    expect(await support.render(p), await support.render(p, reference: true));
  });
}
