import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter_test/flutter_test.dart';
import 'package:patch_map/patch_map.dart';
import 'package:patch_map/src/engine/ports.dart';
import 'package:patch_map/src/host/native_assets.dart';
import 'package:patch_map/src/rendering/canvas_renderer.dart';
import '../lib/renderer_comparison/scene.dart';
import '../lib/renderer_comparison/dense_scene.dart';
import '../lib/renderer_comparison/flame_renderer.dart';

class Surface implements PatchMapSurfacePort {
  Surface(this.c);
  final PatchMapController c;
  @override
  bool prepare(PatchMapRenderSnapshot s) => true;
  @override
  void requestFrame() => scheduleMicrotask(() => c.frameConfirmed(c.revisions));
  @override
  Future<void> dispose() async {}
  @override
  Future<PatchMapCaptureResult> capture(PatchMapRenderSnapshot s) =>
      throw UnimplementedError();
}

int pictureIndex = 0;
Future<Uint8List> pixels(void Function(ui.Canvas) paint) async {
  final r = ui.PictureRecorder();
  paint(ui.Canvas(r));
  final p = r.endRecording();
  final image = await p.toImage(360, 640);
  final bytes = (await image.toByteData())!.buffer.asUint8List();
  if (const bool.fromEnvironment('PATCHMAP_COMPARE_IMAGES'))
    await File('/tmp/patchmap-compare-${pictureIndex++}.png').writeAsBytes(
      (await image.toByteData(
        format: ui.ImageByteFormat.png,
      ))!.buffer.asUint8List(),
    );
  image.dispose();
  p.dispose();
  return bytes;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'dense columns preserve offscreen retargeting and atomic validation',
    () async {
      final c = await createPanelController();
      final d = DensePanelScene(c.renderSnapshot);
      d.heights(List.filled(5000, 0), 0, animate: true);
      expect(d.heightAt(4999, 100), closeTo(9.25, 1e-9));
      d.heights(List.filled(5000, 74), 100, animate: true);
      expect(d.heightAt(4999, 100), 9.25);
      expect(d.heightAt(4999, 300), 74);
      final before = List.of(d.to);
      expect(
        () => d.heights(
          [...List.filled(4999, 1.0), double.nan],
          400,
          animate: false,
        ),
        throwsArgumentError,
      );
      expect(d.to, before);
      await c.destroy();
    },
  );
  test(
    'atlas and dense text retain panel geometry and visual quality',
    () async {
      final c = await createPanelController();
      c.attach(Surface(c));
      await c.ready;
      final initial = c.renderSnapshot;
      final dense = DensePanelScene(initial);
      final stock = PatchMapCanvasRenderer(c.assetPort as NativeAssetSession);
      final flame =
          FlamePanelRenderer(
              minAtlasScale: const bool.fromEnvironment('PATCHMAP_FIT_ATLAS')
                  ? 0
                  : 0.4,
            )
            ..dense = dense
            ..prepare(initial);
      final raw =
          FlamePanelRenderer(
              flameBatch: false,
              minAtlasScale: const bool.fromEnvironment('PATCHMAP_FIT_ATLAS')
                  ? 0
                  : 0.4,
            )
            ..dense = dense
            ..prepare(initial);
      try {
        for (final height in [0.74, 3.0, 6.0, 37.0, 74.0]) {
          final values = List.filled(5000, height);
          c.updateBatch(
            {
              'targets': panelTargets,
              'bar': {'componentId': 'bar', 'height': values},
            },
            animate: false,
            recordHistory: false,
          );
          dense.heights(values, 0, animate: false);
          for (final zoom in [false, true]) {
            if (zoom)
              c.viewport.restore({
                'centerWorld': [2318.0, 2368.0],
                'scale': 0.86,
              });
            else
              c.viewport.fit();
            final s = c.renderSnapshot;
            stock.prepare(s);
            flame.sampleTime = raw.sampleTime = 0;
            final a = await pixels(
              (canvas) => stock.paint(
                canvas,
                const ui.Size(360, 640),
                s,
                const ui.Color(0xfffafafa),
              ),
            );
            final b = await pixels(
              (canvas) => flame.paint(canvas, const ui.Size(360, 640), s),
            );
            final d = await pixels(
              (canvas) => raw.paint(canvas, const ui.Size(360, 640), s),
            );
            expect(b, d, reason: 'Flame and raw atlas pixels');
            var sum = 0, bad = 0;
            for (var i = 0; i < a.length; i += 4) {
              var delta = 0;
              for (var j = 0; j < 3; j++) delta += (a[i + j] - b[i + j]).abs();
              sum += delta;
              if (delta > 96) bad++;
            }
            final mean = sum / (360 * 640 * 3), badFraction = bad / (360 * 640);
            print(
              'quality height=$height zoom=$zoom mean=$mean bad=$badFraction',
            );
            expect(mean, lessThan(3.0));
            expect(badFraction, lessThan(0.025));
          }
        }
        final values = List.generate(
          5000,
          (i) => ['', '1', '1234', '한글', '🙂'][i % 5],
        );
        dense.mode(true, 0);
        dense.textValues(values);
        c.updateBatch(
          {
            'targets': panelTargets,
            'text': {
              'componentId': 'text',
              'changes': {'show': List.filled(5000, true)},
              'text': values,
            },
          },
          animate: false,
          recordHistory: false,
        );
        for (final slot in dense.textSlots) {
          final p = dense.textAt(slot);
          final expected = c.renderSnapshot.geometry.primitives[slot];
          expect(p.localRect.width, expected.localRect.width);
          expect(p.localRect.height, expected.localRect.height);
          expect(p.transform.tx, expected.transform.tx);
          expect(p.transform.ty, expected.transform.ty);
        }
        await c.assetPort!.ready(c.renderSnapshot);
        stock.prepare(c.renderSnapshot);
        final a = await pixels(
          (canvas) => stock.paint(
            canvas,
            const ui.Size(360, 640),
            c.renderSnapshot,
            const ui.Color(0xfffafafa),
          ),
        );
        final b = await pixels(
          (canvas) =>
              flame.paint(canvas, const ui.Size(360, 640), c.renderSnapshot),
        );
        var sum = 0;
        for (var i = 0; i < a.length; i++) sum += (a[i] - b[i]).abs();
        expect(sum / a.length, lessThan(3.0));
      } finally {
        stock.dispose();
        flame.dispose();
        raw.dispose();
        await c.destroy();
      }
    },
    timeout: const Timeout(Duration(minutes: 2)),
  );
}
