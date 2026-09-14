import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:patch_map/patch_map.dart';
import '../lib/shared_fixtures.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  binding.framePolicy = LiveTestWidgetsFlutterBindingFramePolicy.fullyLive;
  testWidgets(
    'native public rendering input assets lifecycle and capture',
    (tester) async {
      final assertions = <String>[];
      final report = <String, dynamic>{
        'platform': Platform.operatingSystem,
        'revision': const String.fromEnvironment('PATCHMAP_REVISION'),
        'scope':
            'Native surface smoke; lifecycle uses Flutter binding callbacks, not OS background automation',
        'assertions': assertions,
        'completed': false,
      };
      binding.reportData = {'nativeContract': report};
      final semantics = tester.ensureSemantics();
      var semanticsDisposed = false;
      addTearDown(() {
        if (!semanticsDisposed) semantics.dispose();
      });
      const width = 320.0, height = 400.0;
      final dpr = binding.platformDispatcher.views.first.devicePixelRatio;
      report['devicePixelRatio'] = dpr;
      final gallery =
          jsonDecode(sharedFixtureJson['gallery']!) as Map<String, dynamic>;
      final c = (await tester.runAsync(
        () => PatchMap.create(
          data: gallery['dataset'],
          fit: false,
          instanceId: 'native-contract',
          width: width,
          height: height,
          pixelRatio: dpr,
          viewport: {
            'initial': {
              'centerWorld': [240, 260],
              'scale': .6,
            },
          },
        ),
      ))!;
      addTearDown(c.destroy);
      Widget view(PatchMapController controller) => MediaQuery(
        data: MediaQueryData(devicePixelRatio: dpr),
        child: Directionality(
          textDirection: TextDirection.ltr,
          child: Center(
            child: SizedBox(
              width: width,
              height: height,
              child: PatchMapView(
                controller: controller,
                resizeMode: PatchMapResizeMode.manual,
              ),
            ),
          ),
        ),
      );
      await tester.pumpWidget(view(c));
      await tester.pumpAndSettle();
      await tester.runAsync(() => c.ready.timeout(const Duration(seconds: 15)));
      expect(c.debug.snapshot()['lifecycle'], 'scene-ready');
      assertions.add('real native Canvas publishes shared gallery');
      final origin = tester.getTopLeft(find.byType(PatchMapView));
      final point = c.viewport.worldToScreen(397, 280);
      await tester.tapAt(origin + Offset(point[0], point[1]));
      await tester.pumpAndSettle();
      expect(c.selection.ids, ['zone']);
      expect(
        find.semantics
            .byLabel('zone')
            .evaluate()
            .single
            .flagsCollection
            .isSelected,
        ui.Tristate.isTrue,
      );
      assertions.add(
        'native touch selects zone and Semantics selected state updates',
      );
      final original = c.data.serialize();
      expect(
        c.update({
          'id': 'zone',
          'changes': {'fill': '#123456'},
        }).status,
        'committed',
      );
      await tester.pumpAndSettle();
      final changed = c.data.serialize();
      expect(changed, isNot(original));
      c.history.undo();
      expect(c.data.serialize(), original);
      c.history.redo();
      expect(c.data.serialize(), changed);
      await tester.pumpAndSettle();
      assertions.add(
        'native attached mutation undo and redo preserve exact authored data',
      );
      final scale = c.viewport.snapshot()['scale'] as num;
      final left = await tester.startGesture(
        origin + const Offset(130, 180),
        pointer: 1,
      );
      final right = await tester.startGesture(
        origin + const Offset(190, 180),
        pointer: 2,
      );
      await left.moveTo(origin + const Offset(110, 180));
      await right.moveTo(origin + const Offset(210, 180));
      await left.up();
      await right.up();
      await tester.pumpAndSettle();
      expect(c.viewport.snapshot()['scale'] as num, greaterThan(scale));
      assertions.add('two native touch pointers increase viewport scale');
      binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      final frame = c.debug.publication()['frameRevision'];
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 50)),
      );
      expect(c.debug.publication()['frameRevision'], frame);
      binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();
      expect(c.debug.snapshot()['pendingWork'], 0);
      assertions.add('binding pause stops publication and resume returns idle');
      final codecs =
          jsonDecode(sharedFixtureJson['codecs']!) as Map<String, dynamic>;
      c.assets.register(codecs['assets']);
      c.data.replace(codecs['dataset'], fit: false);
      c.viewport.restore({
        'centerWorld': [240, 275],
        'scale': .55,
      });
      await tester.pumpAndSettle();
      final png = (await tester.runAsync(
        () => c.capture.png().timeout(const Duration(seconds: 20)),
      ))!;
      expect(png.size, [width, height]);
      final decoder = await ui.instantiateImageCodec(
        base64Decode(png.dataUrl.split(',').last),
      );
      final image = (await decoder.getNextFrame()).image;
      final pixels = (await image.toByteData(
        format: ui.ImageByteFormat.rawRgba,
      ))!;
      expect(image.width, (width * dpr).round());
      expect(image.height, (height * dpr).round());
      for (final element in (codecs['dataset'] as List).where(
        (e) => e['type'] == 'image',
      )) {
        final attrs = element['attrs'] as Map;
        final sample = c.viewport.worldToScreen(
          (attrs['x'] as num).toDouble() + 18,
          (attrs['y'] as num).toDouble() + 18,
        );
        final index =
            ((sample[1] * dpr).floor() * image.width +
                (sample[0] * dpr).floor()) *
            4;
        expect(
          (pixels.getUint8(index) - 250).abs() +
              (pixels.getUint8(index + 1) - 250).abs() +
              (pixels.getUint8(index + 2) - 250).abs(),
          greaterThan(100),
          reason: element['id'],
        );
        assertions.add('${element['id']} decoded into captured native pixels');
      }
      report['assets'] = c.assets.status();
      expect(
        (report['assets']['session']['resolved'] as num),
        greaterThanOrEqualTo(10),
      );
      expect(report['assets']['session']['failed'], 0);
      for (final y in [330.0, 380.0, 430.0, 480.0]) {
        final a = c.viewport.worldToScreen(152, y);
        final b = c.viewport.worldToScreen(282, y + 32);
        var ink = 0;
        for (var py = (a[1] * dpr).floor(); py < (b[1] * dpr).floor(); py++) {
          for (var px = (a[0] * dpr).floor(); px < (b[0] * dpr).floor(); px++) {
            final index = (py * image.width + px) * 4;
            if (pixels.getUint8(index) < 100 &&
                pixels.getUint8(index + 1) < 100 &&
                pixels.getUint8(index + 2) < 100)
              ink++;
          }
        }
        expect(ink, greaterThan(30), reason: 'font sample at y=$y');
      }
      assertions.add(
        'TTF OTF WOFF WOFF2 assets resolve and each native text sample paints ink',
      );
      image.dispose();
      decoder.dispose();
      assertions.add('real native PNG has exact logical size and physical DPR');
      await c.destroy();
      await tester.pumpWidget(const SizedBox());
      expect(c.destroyed, true);
      expect(c.debug.snapshot()['pendingWork'], 0);
      final next = (await tester.runAsync(
        () => PatchMap.create(
          data: [],
          width: width,
          height: height,
          pixelRatio: dpr,
          instanceId: 'native-recreated',
        ),
      ))!;
      addTearDown(next.destroy);
      await tester.pumpWidget(view(next));
      await tester.pumpAndSettle();
      await next.ready;
      expect(next.instanceId, isNot(c.instanceId));
      expect(next.debug.snapshot()['lifecycle'], 'ready-empty');
      await next.destroy();
      await tester.pumpWidget(const SizedBox());
      expect(tester.takeException(), isNull);
      assertions.add(
        'destroy releases surface and a new independent empty map mounts',
      );
      semantics.dispose();
      semanticsDisposed = true;
      report['completed'] = true;
    },
    timeout: const Timeout(Duration(minutes: 3)),
  );
}
