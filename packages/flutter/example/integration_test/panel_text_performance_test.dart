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
const _view = String.fromEnvironment('PATCHMAP_VIEW', defaultValue: 'fit');
const _action = String.fromEnvironment('PATCHMAP_ACTION', defaultValue: 'all');
const _suite = bool.fromEnvironment('PATCHMAP_STRATEGY_SUITE');
const _clipText = bool.fromEnvironment('PATCHMAP_CLIP_TEXT');

// Same service scene through the shipped controller/host. Each workload has its
// own controller and native caches; the APK lifecycle is recorded separately.
const _workloads = [
  ('text', 'fit', 'all'),
  ('text', 'zoom', 'all'),
  ('icon', 'fit', 'all'),
  ('icon', 'zoom', 'all'),
  ('text', 'zoom', 'sparse'),
  ('text', 'zoom', 'camera'),
  ('text', 'zoom', 'reentry'),
  ('bar', 'fit', 'all'),
];

void main() {
  if (_count < 100 || _count % 100 != 0) {
    throw ArgumentError('PATCHMAP_COUNT must be a positive multiple of 100');
  }
  final lastGrid = _count ~/ 100 - 1;
  final farCenter = [lastGrid % 5 * 940 + 438, lastGrid ~/ 5 * 480 + 208];
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  binding.framePolicy = LiveTestWidgetsFlutterBindingFramePolicy.fullyLive;
  final reports = <Map<String, dynamic>>[];
  for (final workload in _suite ? _workloads : [(_kind, _view, _action)]) {
    if (!_workloads.contains(workload)) {
      throw ArgumentError('Unsupported benchmark workload: $workload');
    }
    final (kind, view, action) = workload;
    testWidgets(
      'service panel $kind/$view/$action publications',
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
              if (raw['type'] == 'text') ...{
                'show': kind == 'text',
                if (_clipText)
                  'style': {...raw['style'] as Map, 'overflow': 'hidden'},
              },
              if (raw['type'] == 'icon') ...{
                'show': kind == 'icon',
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
          if (view == 'fit') {
            c.viewport.fit();
          } else {
            c.viewport.restore({
              'centerWorld': [438, 208],
              'scale': 0.86,
            });
          }
          await c.assetPort!.ready(c.renderSnapshot);
        });
        final targets = [
          for (var i = 0; i < _count; i++)
            'g${i ~/ 100}.${i % 100 ~/ 20}.${i % 20}',
        ];
        final changedTargets = action == 'sparse'
            ? [for (var i = 0; i < _count; i += 100) targets[i]]
            : targets;
        var seed = 0x5eed;
        final inputs = [
          for (var sample = 0; sample < 25; sample++)
            [
              for (var i = 0; i < changedTargets.length; i++)
                kind == 'icon'
                    ? (sample.isEven ? 'loading' : 'object')
                    : kind == 'bar'
                    ? 1.0 + sample % 20 * 3.0
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
          'physicalSize': ui
              .PlatformDispatcher
              .instance
              .views
              .single
              .physicalSize
              .toString(),
          'warmups': 5,
          'samples': 20,
          'seed': 0x5eed,
          'scene': 'conformance/scenes/panel-groups.json',
          'count': _count,
          'case': kind,
          'view': view,
          'clipText': _clipText,
          'action': action,
          'mapSize': [360, 640],
          'rows': <Map<String, dynamic>>[],
        };
        reports.add(report);
        binding.reportData = _suite
            ? {'panelRuns': reports}
            : {'panelText': report};
        try {
          await tester.runAsync(() async {
            await Future<void>.delayed(const Duration(seconds: 1));
            report['viewport'] = c.viewport.state;
            report['rssBeforeWarmup'] = ProcessInfo.currentRss;
            if (action == 'camera') {
              c.updateBatch({
                'targets': targets,
                'text': {
                  'componentId': 'text',
                  'text': List.filled(_count, '17'),
                },
              }, recordHistory: false);
              await SchedulerBinding.instance.endOfFrame;
            }
            for (var sample = 0; sample < inputs.length; sample++) {
              if (action == 'reentry') {
                c.updateBatch({
                  'targets': targets,
                  'text': {'componentId': 'text', 'text': inputs[sample]},
                }, recordHistory: false);
                await c.assetPort!.ready(c.renderSnapshot);
                await SchedulerBinding.instance.endOfFrame;
              }
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
                      tuple['interaction'] == c.revisions.interaction &&
                      tuple['view'] == c.revisions.view) {
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
              PatchMapResult? result;
              if (action == 'camera' || action == 'reentry') {
                c.viewport.restore({
                  'centerWorld': sample.isEven ? farCenter : [438, 208],
                  'scale': 0.86,
                });
              } else {
                result = c.updateBatch(
                  {
                    'targets': changedTargets,
                    if (kind == 'text')
                      'text': {'componentId': 'text', 'text': inputs[sample]}
                    else if (kind == 'bar')
                      'bar': {'componentId': 'bar', 'height': inputs[sample]}
                    else
                      'icon': {
                        'componentId': 'icon',
                        'changes': {'source': inputs[sample]},
                      },
                  },
                  recordHistory: false,
                  animate: false,
                );
              }
              row['commitMs'] = watch.elapsedMicroseconds / 1000;
              await c.assetPort!.ready(c.renderSnapshot);
              row['assetsReadyMs'] = watch.elapsedMicroseconds / 1000;
              assetsSettled = true;
              try {
                await done.future.timeout(const Duration(seconds: 20));
              } finally {
                active = false;
              }
              if (result != null) expect(result.status, 'committed');
              final texts = c.renderSnapshot.geometry.primitives
                  .where((p) => p.type == kind)
                  .toList();
              expect(texts.length, _count);
              if (kind == 'bar') {
                expect(texts.first.localRect.height, inputs[sample].first);
                expect(texts.last.localRect.height, inputs[sample].last);
              } else {
                final field = kind == 'text' ? 'text' : 'source';
                expect(
                  texts.first.value[field],
                  action == 'camera' ? '17' : inputs[sample].first,
                );
                final lastChanged = action == 'sparse'
                    ? texts[_count - 100]
                    : texts.last;
                expect(
                  lastChanged.value[field],
                  action == 'camera' ? '17' : inputs[sample].last,
                );
                if (action == 'sparse') expect(texts[1].value[field], '');
              }
              if (action == 'camera' || action == 'reentry') {
                expect(
                  c.viewport.state['centerWorld'],
                  sample.isEven ? farCenter : [438.0, 208.0],
                );
              }
              (report['rows'] as List).add(row);
              if (sample == 4)
                report['rssAfterWarmup'] = ProcessInfo.currentRss;
              await Future<void>.delayed(const Duration(milliseconds: 100));
            }
            await Future<void>.delayed(const Duration(seconds: 2));
          });
          report['rssAfterSamples'] = ProcessInfo.currentRss;
          report['peakRssBytes'] = ProcessInfo.maxRss;
          report['timings'] = timings;
          final measured = (report['rows'] as List).where(
            (row) => row['warmup'] == false,
          );
          final frames = timings.map((timing) => timing['frame']).toSet();
          expect(measured.length, 20);
          expect(
            measured.every((row) => frames.contains(row['frame'])),
            isTrue,
            reason: 'Every measured publication requires an engine FrameTiming',
          );
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
}
