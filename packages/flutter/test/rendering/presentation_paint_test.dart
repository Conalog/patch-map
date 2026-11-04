import 'dart:io';
import 'dart:ui';

import 'package:conalog_patch_map/src/dataset/colors.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/frame/resource_retirement.dart';
import 'package:conalog_patch_map/src/geometry/affine.dart';
import 'package:conalog_patch_map/src/geometry/geometry_snapshot.dart';
import 'package:conalog_patch_map/src/rendering/bar_slices.dart';
import 'package:conalog_patch_map/src/rendering/draw_objects.dart';
import 'package:conalog_patch_map/src/rendering/rectangle_paint.dart';
import 'package:conalog_patch_map/src/rendering/relation_paint.dart';
import 'package:conalog_patch_map/src/resources/bars/bar_masks.dart';
import 'package:conalog_patch_map/src/resources/text/text_pool.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

RectanglePaint rectangle({double opacity = .5}) => RectanglePaint.fromTexture(
  {'fill': '#ff0000', 'radius': 3},
  ColorResolver(),
  '#ffffff',
  opacity,
);

Future<Uint8List> render(void Function(Canvas) paint) async {
  final recorder = PictureRecorder();
  paint(Canvas(recorder));
  final picture = recorder.endRecording();
  final image = await picture.toImage(80, 60);
  try {
    return (await image.toByteData(
      format: ImageByteFormat.rawStraightRgba,
    ))!.buffer.asUint8List();
  } finally {
    image.dispose();
    picture.dispose();
  }
}

int alpha(Uint8List pixels, int x, int y) => pixels[(y * 80 + x) * 4 + 3];

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('default content keeps the unit path and preserves overflow', () async {
    final content = _OverflowContent();
    final baseline = await render((canvas) {
      content.paintWithAlpha(canvas, const Rect.fromLTWH(10, 10, 5, 5), 1);
    });
    expect(content.saveCounts, [1]);
    final dimmed = await render((canvas) {
      content.paintWithAlpha(
        canvas,
        const Rect.fromLTWH(10, 10, 5, 5),
        1,
        alphaMultiplier: .5,
      );
    });
    expect(content.saveCounts, [1, 2]);
    expect(alpha(baseline, 35, 20), 255);
    expect(alpha(dimmed, 35, 20), 128);
    await render((canvas) {
      content.paintWithAlpha(canvas, Rect.zero, 1, alphaMultiplier: 0);
    });
    expect(content.saveCounts, [1, 2]);
  });

  test(
    'rectangle alpha multiplies each overlapping content independently',
    () async {
      final style = rectangle();
      final content = RectangleContent(style);
      final pixels = await render((canvas) {
        content.paintWithAlpha(
          canvas,
          const Rect.fromLTWH(5, 5, 25, 25),
          1,
          alphaMultiplier: .5,
        );
        content.paintWithAlpha(
          canvas,
          const Rect.fromLTWH(15, 15, 25, 25),
          1,
          alphaMultiplier: .5,
        );
      });
      expect(alpha(pixels, 10, 10), 64);
      expect(alpha(pixels, 20, 20), 112);
      expect(style.fillColor.a, .5);
      final restored = await render((canvas) {
        content.paint(canvas, const Rect.fromLTWH(5, 5, 25, 25), 1);
      });
      expect(alpha(restored, 10, 10), 128);
    },
  );

  test(
    'bar vertices multiply existing alpha and reuse bounded scratch',
    () async {
      final masks = await createBarMasks(BarMaskPlan.tryCreate(20, 3)!);
      final batch = BarSliceBatch();
      final identity = batch.scratchIdentity, bytes = batch.scratchBytes;
      final style = rectangle();
      try {
        final pixels = await render((canvas) {
          for (final (x, width, multiplier) in [
            (5.0, 20.0, .5),
            (30.0, 30.0, .5),
            (0.0, 20.0, 0.0),
          ]) {
            expect(
              batch.add(
                canvas,
                masks,
                Rect.fromLTWH(x, 5, width, 20),
                Affine.identity,
                style,
                alphaMultiplier: multiplier,
              ),
              isTrue,
            );
          }
          batch.flush(canvas);
        });
        expect(alpha(pixels, 15, 15), 64);
        expect(alpha(pixels, 45, 15), 64);
        expect(batch.submissionCount, 2);
        expect(batch.scratchIdentity, same(identity));
        expect(batch.scratchBytes, bytes);
        expect(batch.verticesCreated, batch.verticesDisposed);
        expect(style.fillColor.a, .5);
      } finally {
        batch.dispose();
        masks.dispose();
      }
    },
  );

  test(
    'relation alpha restores retained Paint and preserves geometry',
    () async {
      final snapshot = GeometrySnapshot.compile(
        const DatasetReader().read([
          {'type': 'rect', 'id': 'a', 'size': 10},
          {
            'type': 'rect',
            'id': 'b',
            'size': 10,
            'attrs': {'x': 30},
          },
          {
            'type': 'relations',
            'id': 'r',
            'style': {'width': 4, 'color': '#ff000080', 'alpha': .5},
            'links': [
              {'source': 'a', 'target': 'b'},
            ],
          },
        ]),
        (_, _) => Size.zero,
      );
      final geometry = snapshot.relationFor('r')!;
      final content = RelationContent(
        RelationPaint(geometry, snapshot['r']!.data, ColorResolver(), .5),
      );
      final dimmed = await render((canvas) {
        canvas.translate(10, 20);
        content.paintWithAlpha(canvas, Rect.zero, 1, alphaMultiplier: .5);
      });
      final restored = await render((canvas) {
        canvas.translate(10, 20);
        content.paint(canvas, Rect.zero, 1);
      });
      expect(alpha(dimmed, 25, 25), 16);
      expect(alpha(restored, 25, 25), 32);
      expect(geometry.contains(const Offset(15, 5)), isTrue);
    },
  );

  testWidgets(
    'native and atlas text multiply alpha without changing shared resources',
    (tester) async {
      await tester.runAsync(() async {
        final loader = FontLoader('FiraCode')
          ..addFont(
            Future.value(
              ByteData.sublistView(
                File('assets/fonts/FiraCode-VF.ttf').readAsBytesSync(),
              ),
            ),
          );
        await loader.load();
        final retirement = ResourceRetirement();
        final pool = TextPool(
          palette: ColorResolver(),
          retirement: retirement,
          onReady: () {},
        );
        pool.setActive(false);
        final handle = pool.acquire({
          'text': '5678',
          'tint': '#ffffff80',
          'style': {
            'fontFamily': 'FiraCode',
            'fontWeight': 500,
            'fontSize': 14,
            'fill': '#ff000080',
          },
        }, const Size(50, 30));
        final spec = handle.spec, key = handle.key;
        Future<Uint8List> draw(double multiplier) => render((canvas) {
          pool.draw(
            handle,
            canvas,
            const Offset(4, 4),
            3,
            alphaMultiplier: multiplier,
          );
        });
        try {
          expect(handle.atlasEligible, isTrue);
          final creates = pool.paragraphCreates;
          final native = await draw(1);
          final nativeDimmed = await draw(.5);
          expect(pool.paragraphCreates, creates);
          _expectHalfAlpha(nativeDimmed, native);
          expect(await draw(1), native);
          pool.setActive(true);
          final deadline = DateTime.now().add(const Duration(seconds: 8));
          while (pool.atlases.running != 0 || pool.atlases.builds != 1) {
            if (DateTime.now().isAfter(deadline)) fail('atlas did not settle');
            await Future<void>.delayed(const Duration(milliseconds: 1));
          }
          final atlas = await draw(1);
          final atlasDimmed = await draw(.5);
          _expectHalfAlpha(atlasDimmed, atlas);
          expect(await draw(1), atlas);
          expect(pool.atlasDraws, 3);
          expect(pool.paragraphCreates, creates);
          expect(handle.spec, same(spec));
          expect(handle.key, key);
          expect(pool.entries, 1);
        } finally {
          pool.release(handle);
          pool.close();
          retirement.close();
        }
        expect(pool.liveParagraphLayouts, 0);
        expect(pool.atlases.residentBytes, 0);
        expect(pool.atlases.retiringBytes, 0);
      });
    },
  );
}

void _expectHalfAlpha(Uint8List actual, Uint8List baseline) {
  var ink = 0;
  for (var p = 3; p < baseline.length; p += 4) {
    if (baseline[p] > 0) ink++;
    expect((actual[p] - baseline[p] / 2).abs(), lessThanOrEqualTo(1));
  }
  expect(ink, greaterThan(0));
}

final class _OverflowContent extends DrawContent {
  final saveCounts = <int>[];
  @override
  void dispose() {}
  @override
  void paint(Canvas canvas, Rect rectangle, double physicalScale) {
    saveCounts.add(canvas.getSaveCount());
    canvas.drawRect(
      const Rect.fromLTWH(10, 10, 30, 20),
      Paint()..color = const Color(0xffff0000),
    );
  }
}
