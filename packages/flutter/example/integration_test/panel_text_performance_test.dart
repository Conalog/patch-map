// Current service demo, actual native publication; no synthetic animation clock.
import 'dart:async';
import 'dart:io';
import 'dart:convert';
import 'package:flutter/widgets.dart';
import 'dart:ui' as ui;
import 'package:flutter/foundation.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:conalog_patch_map/conalog_patch_map.dart';
import '../lib/shared_fixtures.dart';

const _count = int.fromEnvironment('PATCHMAP_COUNT', defaultValue: 5000);
const _kind = String.fromEnvironment('PATCHMAP_CASE', defaultValue: 'text');

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  binding.framePolicy = LiveTestWidgetsFlutterBindingFramePolicy.fullyLive;
  testWidgets(
    'service panel text or icon publications',
    (tester) async {
      final scene =
          jsonDecode(sharedFixtureJson['scenes/panel-groups']!)
              as Map<String, dynamic>;
      final grid = scene['grid'] as Map<String, dynamic>;
      final item = grid['item'] as Map<String, dynamic>;
      final components = [
        for (final raw in item['components'] as List)
          {
            ...raw as Map<String, dynamic>,
            if (raw['type'] == 'text') 'show': _kind == 'text',
            if (raw['type'] == 'icon') ...{
              'show': _kind == 'icon',
              'source': 'object',
            },
          },
      ];
      final c = await PatchMap.create(
        data: [
          for (var g = 0; g < _count ~/ 100; g++)
            {
              ...grid,
              'id': 'g$g',
              'attrs': {'x': g % 5 * 940, 'y': g ~/ 5 * 480},
              'item': {...item, 'components': components},
              'cells': [for (var row = 0; row < 5; row++) List.filled(20, 1)],
            },
        ],
        theme: scene['theme'] as Map<String, dynamic>,
        fit: false,
        historyLimit: 0,
      );
      await tester.pumpWidget(
        Directionality(
          textDirection: TextDirection.ltr,
          child: Center(
            child: SizedBox(
              width: 360,
              height: 640,
              child: PatchMapView(controller: c),
            ),
          ),
        ),
      );
      await tester.runAsync(() async {
        await c.ready;
        c.viewport.fit();
        await c.assetPort!.ready(c.renderSnapshot);
      });
      final targets = [
        for (var i = 0; i < _count; i++)
          'g${i ~/ 100}.${i % 100 ~/ 20}.${i % 20}',
      ];
      var seed = 0x5eed;
      final inputs = [
        for (var sample = 0; sample < 25; sample++)
          [
            for (var i = 0; i < _count; i++)
              _kind == 'icon'
                  ? (sample.isEven ? 'loading' : 'object')
                  : '${1 + ((seed = (seed * 1664525 + 1013904223) & 0xffffffff) % 9999)}',
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
        'count': _count,
        'case': _kind,
        'mapSize': [360, 640],
        'rows': <Map<String, dynamic>>[],
      };
      binding.reportData = {'panelText': report};
      try {
        await tester.runAsync(() async {
          await Future<void>.delayed(const Duration(seconds: 1));
          report['viewport'] = c.viewport.state;
          report['rssBeforeWarmup'] = ProcessInfo.currentRss;
          for (var sample = 0; sample < inputs.length; sample++) {
            final done = Completer<void>();
            final watch = Stopwatch();
            var active = true;
            var assetsSettled = false;
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
                if (assetsSettled &&
                    (debug['frameRevision'] as int) > before &&
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
              if (_kind == 'text')
                'text': {'componentId': 'text', 'text': inputs[sample]}
              else
                'icon': {
                  'componentId': 'icon',
                  'changes': {'source': inputs[sample]},
                },
            }, recordHistory: false);
            row['commitMs'] = watch.elapsedMicroseconds / 1000;
            await c.assetPort!.ready(c.renderSnapshot);
            row['assetsReadyMs'] = watch.elapsedMicroseconds / 1000;
            assetsSettled = true;
            try {
              await done.future.timeout(const Duration(seconds: 20));
            } finally {
              active = false;
            }
            expect(result.status, 'committed');
            final texts = c.renderSnapshot.geometry.primitives
                .where((p) => p.type == _kind)
                .toList();
            expect(texts.length, _count);
            expect(
              texts.first.value[_kind == 'text' ? 'text' : 'source'],
              inputs[sample].first,
            );
            expect(
              texts.last.value[_kind == 'text' ? 'text' : 'source'],
              inputs[sample].last,
            );
            (report['rows'] as List).add(row);
            if (sample == 4) report['rssAfterWarmup'] = ProcessInfo.currentRss;
            await Future<void>.delayed(const Duration(milliseconds: 100));
          }
          await Future<void>.delayed(const Duration(seconds: 2));
        });
        report['rssAfterSamples'] = ProcessInfo.currentRss;
        report['peakRssBytes'] = ProcessInfo.maxRss;
        report['timings'] = timings;
        report['completed'] = true;
      } finally {
        binding.removeTimingsCallback(collect);
        await tester.pumpWidget(const SizedBox());
        await c.destroy();
      }
    },
    timeout: const Timeout(Duration(minutes: 3)),
  );
}
