// Current service demo, actual native publication; no synthetic animation clock.
import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/foundation.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:conalog_patch_map/conalog_patch_map.dart';
import '../lib/bar_demo.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  binding.framePolicy = LiveTestWidgetsFlutterBindingFramePolicy.fullyLive;
  testWidgets(
    '5000 service panel text publications',
    (tester) async {
      await tester.pumpWidget(const BarDemoApp());
      await tester.runAsync(() async {
        while (find.text('5,000개 panel 준비 완료').evaluate().isEmpty) {
          await Future<void>.delayed(const Duration(milliseconds: 100));
        }
      });
      await tester.tap(find.text('Text 값'));
      final c = tester
          .widget<PatchMapView>(find.byType(PatchMapView))
          .controller;
      final targets = [
        for (var i = 0; i < 5000; i++)
          'g${i ~/ 100}.${i % 100 ~/ 20}.${i % 20}',
      ];
      var seed = 0x5eed;
      final inputs = [
        for (var sample = 0; sample < 25; sample++)
          [
            for (var i = 0; i < 5000; i++)
              '${1 + ((seed = (seed * 1664525 + 1013904223) & 0xffffffff) % 9999)}',
          ],
      ];
      final timings = <Map<String, dynamic>>[];
      void collect(List<ui.FrameTiming> frames) {
        for (final f in frames)
          timings.add({
            'frame': f.frameNumber,
            'buildMs': f.buildDuration.inMicroseconds / 1000,
            'rasterMs': f.rasterDuration.inMicroseconds / 1000,
          });
      }

      binding.addTimingsCallback(collect);
      final report = <String, dynamic>{
        'revision': const String.fromEnvironment('PATCHMAP_REVISION'),
        'mode': kProfileMode ? 'profile/AOT' : 'debug/JIT',
        'os': Platform.operatingSystemVersion,
        'dpr': ui.PlatformDispatcher.instance.views.single.devicePixelRatio,
        'physicalSize': ui.PlatformDispatcher.instance.views.single.physicalSize
            .toString(),
        'warmups': 5,
        'samples': 20,
        'seed': 0x5eed,
        'scene': 'conformance/scenes/panel-groups.json',
        'rows': <Map<String, dynamic>>[],
      };
      binding.reportData = {'panelText': report};
      try {
        await tester.runAsync(() async {
          await Future<void>.delayed(const Duration(seconds: 1));
          report['viewport'] = c.viewport.state;
          for (var sample = 0; sample < inputs.length; sample++) {
            final done = Completer<void>();
            final watch = Stopwatch();
            var active = true;
            final row = <String, dynamic>{
              'sample': sample,
              'warmup': sample < 5,
            };
            final before = c.debug.publication()['frameRevision'] as int;
            void observe(Duration _) {
              final frame =
                  ui.PlatformDispatcher.instance.frameData.frameNumber;
              scheduleMicrotask(() {
                if (!active) return;
                final debug = c.debug.publication();
                final tuple = debug['publishedTuple'];
                if ((debug['frameRevision'] as int) > before &&
                    tuple is Map &&
                    tuple['interaction'] == c.revisions.interaction) {
                  row['publishedMs'] = watch.elapsedMicroseconds / 1000;
                  row['frame'] = frame;
                  active = false;
                  done.complete();
                } else {
                  SchedulerBinding.instance.addPostFrameCallback(observe);
                }
              });
            }

            SchedulerBinding.instance.addPostFrameCallback(observe);
            watch.start();
            final result = c.updateBatch({
              'targets': targets,
              'text': {'componentId': 'text', 'text': inputs[sample]},
            }, recordHistory: false);
            row['commitMs'] = watch.elapsedMicroseconds / 1000;
            try {
              await done.future.timeout(const Duration(seconds: 20));
            } finally {
              active = false;
            }
            expect(result.status, 'committed');
            final texts = c.renderSnapshot.geometry.primitives
                .where((p) => p.type == 'text')
                .toList();
            expect(texts.length, 5000);
            expect(texts.first.value['text'], inputs[sample].first);
            expect(texts.last.value['text'], inputs[sample].last);
            (report['rows'] as List).add(row);
            await Future<void>.delayed(const Duration(milliseconds: 100));
          }
          await Future<void>.delayed(const Duration(seconds: 2));
        });
        report['timings'] = timings;
        report['completed'] = true;
      } finally {
        binding.removeTimingsCallback(collect);
      }
    },
    timeout: const Timeout(Duration(minutes: 3)),
  );
}
