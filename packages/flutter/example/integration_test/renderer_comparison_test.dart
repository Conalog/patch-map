import 'dart:async';
import 'renderer_environment.dart';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:patch_map/patch_map.dart';
import '../lib/renderer_comparison/scene.dart';
import '../lib/renderer_comparison/dense_scene.dart';
import '../lib/renderer_comparison/host.dart';

const width = 360.0, height = 640.0;

class Run {
  Run(this.c, this.dense);
  final PatchMapController c;
  final DensePlayback? dense;
  int get frames =>
      dense?.painted ?? c.debug.publication()['frameRevision'] as int;
  double get bar => dense == null
      ? c.renderSnapshot.geometry.primitives
            .firstWhere((p) => p.type == 'bar')
            .localRect
            .height
      : dense!.scene.heightAt(0, dense!.sampleTime);
  void camera(double x, double y, double scale) {
    if (dense != null) {
      dense!.camera(x, y, scale);
    } else {
      c.viewport.restore({
        'centerWorld': [x, y],
        'scale': scale,
      });
    }
  }

  void setMode(bool text) {
    if (dense != null) {
      dense!.mode(text);
    } else {
      c.updateBatch(
        {
          'targets': panelTargets,
          'bar': {'componentId': 'bar', 'height': List.filled(5000, 74.0)},
          'text': {
            'componentId': 'text',
            'changes': {'show': List.filled(5000, text)},
            'text': List.filled(5000, ''),
          },
        },
        animate: false,
        recordHistory: false,
      );
    }
  }

  void heights(List<double> values, bool animate) {
    if (dense != null) {
      dense!.heights(values, animate: animate);
    } else {
      expect(
        c
            .updateBatch(
              {
                'targets': panelTargets,
                'bar': {'componentId': 'bar', 'height': values},
              },
              animate: animate,
              recordHistory: false,
            )
            .status,
        'committed',
      );
    }
  }

  void texts(List<String> values) {
    if (dense != null) {
      dense!.texts(values);
    } else {
      expect(
        c.updateBatch({
          'targets': panelTargets,
          'text': {'componentId': 'text', 'text': values},
        }, recordHistory: false).status,
        'committed',
      );
    }
  }

  void verify(String workload, List<double> heights, List<String> texts) {
    if (workload == 'pan') return;
    if (dense != null) {
      if (workload == 'text') {
        expect(dense!.scene.texts, texts);
      } else {
        expect(dense!.scene.to, heights);
      }
    } else {
      final ps = c.renderSnapshot.geometry.primitives
          .where((p) => p.type == (workload == 'text' ? 'text' : 'bar'))
          .toList();
      expect(ps.length, 5000);
      for (var i = 0; i < 5000; i++) {
        if (workload == 'text') {
          expect(ps[i].value['text'], texts[i]);
        } else {
          expect(ps[i].localRect.height, closeTo(heights[i], 1e-7));
        }
      }
    }
  }
}

Future<Map<String, dynamic>> sample(
  Run run,
  void Function() mutate, {
  required bool animated,
  required bool pan,
  double? destination,
}) async {
  final done = Completer<void>();
  final watch = Stopwatch();
  final frames = <Map<String, dynamic>>[];
  final previous = run.frames, oldBar = run.bar;
  var last = previous, active = true;
  double? firstChanged;
  void observe(Duration _) {
    final number = ui.PlatformDispatcher.instance.frameData.frameNumber;
    scheduleMicrotask(() {
      if (!active) return;
      final revision = run.frames;
      if (revision > last) {
        last = revision;
        final elapsed = watch.elapsedMicroseconds / 1000;
        final bar = run.bar;
        frames.add({'number': number, 'elapsedMs': elapsed, 'bar': bar});
        if (firstChanged == null && (!animated || (bar - oldBar).abs() > 1e-7))
          firstChanged = elapsed;
        final finished = animated
            ? (run.dense == null
                  ? (bar - destination!).abs() < 1e-7 &&
                        SchedulerBinding.instance.transientCallbackCount == 0
                  : !run.dense!.active)
            : true;
        if (finished) {
          active = false;
          done.complete();
          return;
        }
      }
      SchedulerBinding.instance.addPostFrameCallback(observe);
    });
  }

  SchedulerBinding.instance.addPostFrameCallback(observe);
  watch.start();
  mutate();
  final commit = watch.elapsedMicroseconds / 1000;
  try {
    await done.future.timeout(const Duration(seconds: 8));
  } finally {
    active = false;
  }
  return {
    'commitMs': commit,
    'firstChangedMs': firstChanged,
    'finalMs': frames.last['elapsedMs'],
    'frames': frames,
  };
}

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  binding.framePolicy = LiveTestWidgetsFlutterBindingFramePolicy.fullyLive;
  testWidgets(
    'current Canvas and optimized Canvas/Flame service panels',
    (tester) async {
      final dpr = ui.PlatformDispatcher.instance.views.single.devicePixelRatio;
      final report = <String, dynamic>{
        'protocol': 'patch-map-canvas-flame/1',
        'filter': ui.PlatformDispatcher.instance.defaultRouteName,
        'revision': const String.fromEnvironment('PATCHMAP_REVISION'),
        'mode': kProfileMode ? 'profile/AOT' : 'debug/JIT',
        'os': Platform.operatingSystemVersion,
        'dpr': dpr,
        'physicalSize': [
          ui.PlatformDispatcher.instance.views.single.physicalSize.width,
          ui.PlatformDispatcher.instance.views.single.physicalSize.height,
        ],
        'viewport': [width, height],
        'warmups': 5,
        'samples': 20,
        'fitAtlas': const bool.fromEnvironment('PATCHMAP_FIT_ATLAS'),
        'cases': <Map<String, dynamic>>[],
        'completed': false,
      };
      binding.reportData = {'rendererComparison': report};
      final timings = <int, Map<String, dynamic>>{};
      void collect(List<ui.FrameTiming> values) {
        for (final f in values) {
          timings[f.frameNumber] = {
            'buildMs': f.buildDuration.inMicroseconds / 1000,
            'rasterMs': f.rasterDuration.inMicroseconds / 1000,
            'vsyncUs': f.timestampInMicroseconds(ui.FramePhase.vsyncStart),
          };
        }
      }

      binding.addTimingsCallback(collect);
      try {
        for (var block = 0; block < 2; block++)
          for (final variant
              in (block == 0
                  ? ['stock', 'canvas', 'flame']
                  : ['flame', 'canvas', 'stock'])) {
            for (final zoom in [false, true])
              for (final workload in ['immediate', 'animated', 'text', 'pan']) {
                final filter = ui.PlatformDispatcher.instance.defaultRouteName
                    .split('/');
                if (filter.length > 1 &&
                    filter[1].isNotEmpty &&
                    filter[1] != variant)
                  continue;
                if (filter.length > 2 &&
                    filter[2].isNotEmpty &&
                    filter[2] != '$block')
                  continue;
                if (filter.length > 3 &&
                    filter[3].isNotEmpty &&
                    filter[3] != (zoom ? 'zoom' : 'fit'))
                  continue;
                if (filter.length > 4 &&
                    filter[4].isNotEmpty &&
                    filter[4] != workload)
                  continue;
                await tester.runAsync(awaitCoolDevice);
                final cold = Stopwatch()..start();
                final c = (await tester.runAsync(
                  () => createPanelController(
                    width: width,
                    height: height,
                    dpr: dpr,
                  ),
                ))!;
                DensePlayback? dense;
                if (variant != 'stock')
                  dense = DensePlayback(
                    DensePanelScene(c.renderSnapshot),
                    flame: variant == 'flame',
                    minAtlasScale:
                        const bool.fromEnvironment('PATCHMAP_FIT_ATLAS')
                        ? 0
                        : 0.4,
                  );
                final run = Run(c, dense);
                await tester.pumpWidget(
                  MaterialApp(
                    initialRoute: '/',
                    home: Scaffold(
                      body: Center(
                        child: SizedBox(
                          width: width,
                          height: height,
                          child: dense == null
                              ? PatchMapView(controller: c)
                              : DenseView(dense),
                        ),
                      ),
                    ),
                  ),
                );
                try {
                  var finishedCase = false;
                  await tester.runAsync(() async {
                    if (dense == null) {
                      await c.ready.timeout(const Duration(seconds: 15));
                    } else {
                      final limit = DateTime.now().add(
                        const Duration(seconds: 15),
                      );
                      while (dense.painted == 0) {
                        if (DateTime.now().isAfter(limit))
                          throw TimeoutException('Dense first paint');
                        await Future<void>.delayed(
                          const Duration(milliseconds: 10),
                        );
                      }
                    }
                    final coldMs = cold.elapsedMicroseconds / 1000;
                    run.setMode(workload == 'text' || workload == 'pan');
                    if (workload == 'pan')
                      run.texts(List.generate(5000, (i) => 'P$i'));
                    final scale = zoom ? 0.86 : mathFit();
                    run.camera(2318, 2368, scale);
                    await Future<void>.delayed(
                      const Duration(milliseconds: 300),
                    );
                    final entry = <String, dynamic>{
                      'block': block,
                      'variant': variant,
                      'zoom': zoom,
                      'workload': workload,
                      'coldMs': coldMs,
                      'rssBefore': ProcessInfo.currentRss,
                      'rows': <Map<String, dynamic>>[],
                    };
                    (report['cases'] as List).add(entry);
                    var seed = 0x5eed;
                    var previousHeights = List.filled(5000, 74.0),
                        previousTexts = List.filled(5000, '');
                    final heights = <List<double>>[], texts = <List<String>>[];
                    for (var s = 0; s < 25; s++) {
                      final hs = <double>[], ts = <String>[];
                      for (var i = 0; i < 5000; i++) {
                        seed = (seed * 1664525 + 1013904223) & 0xffffffff;
                        var percent = 1 + seed % 100;
                        var h = 74 * percent / 100;
                        if (h == previousHeights[i]) {
                          percent = percent % 100 + 1;
                          h = 74 * percent / 100;
                        }
                        var t = '${1 + seed % 9999}';
                        if (t == previousTexts[i])
                          t = '${(int.parse(t) % 9999) + 1}';
                        hs.add(h);
                        ts.add(t);
                      }
                      heights.add(hs);
                      texts.add(ts);
                      previousHeights = hs;
                      previousTexts = ts;
                    }
                    for (var s = 0; s < 25; s++) {
                      await awaitCoolDevice();
                      final row = await sample(
                        run,
                        () {
                          switch (workload) {
                            case 'text':
                              run.texts(texts[s]);
                            case 'pan':
                              run.camera(
                                2318 + (s % 5 + 1) * 180,
                                2368 + (s % 5 + 1) * 120,
                                scale * (s.isEven ? 1.0 : 1.02),
                              );
                            default:
                              run.heights(heights[s], workload == 'animated');
                          }
                        },
                        animated: workload == 'animated',
                        pan: workload == 'pan',
                        destination: heights[s].first,
                      );
                      row['thermalAfter'] = await thermalStatus();
                      expect(
                        row['thermalAfter'],
                        0,
                        reason: 'Thermal state changed during sample',
                      );
                      verifyViewport(dense);
                      row['sample'] = s;
                      row['warmup'] = s < 5;
                      (entry['rows'] as List).add(row);
                      run.verify(workload, heights[s], texts[s]);
                      await Future<void>.delayed(
                        const Duration(milliseconds: 100),
                      );
                    }
                    await Future<void>.delayed(const Duration(seconds: 2));
                    for (final row in entry['rows'] as List)
                      for (final frame in row['frames'] as List) {
                        final t = timings[frame['number']];
                        expect(
                          t,
                          isNotNull,
                          reason: 'Actual engine frame timing missing',
                        );
                        frame.addAll(t!);
                      }
                    entry['rssAfter'] = ProcessInfo.currentRss;
                    entry['completed'] = true;
                    print(
                      'COMPARISON $block $variant $zoom $workload completed',
                    );
                    finishedCase = true;
                  });
                  expect(
                    finishedCase,
                    isTrue,
                    reason: 'Native case failed; stop matrix',
                  );
                } finally {
                  await tester.pumpWidget(const SizedBox.shrink());
                  dense?.dispose();
                  await tester.runAsync(c.destroy);
                }
              }
          }
        report['completed'] = true;
      } finally {
        binding.removeTimingsCallback(collect);
      }
    },
    timeout: const Timeout(Duration(minutes: 18)),
  );
}

double mathFit() => (360 - 32) / 4636;

/// Check the actual host culling rectangle, not only the renderer's pixel path.
void verifyViewport(DensePlayback? dense) {
  if (dense == null) return;
  final v = dense.viewport;
  final actual = dense.lastVisibleWorldRect!;
  // Flame camera matrices use Float32 storage. Compare in physical pixels,
  // allowing less than 1/100 pixel rather than demanding double precision.
  final tolerance = 0.01 / (v.scale * v.pixelRatio);
  expect(actual.center.dx, closeTo(v.centerX, tolerance));
  expect(actual.center.dy, closeTo(v.centerY, tolerance));
  expect(actual.width, closeTo(v.width / v.scale, tolerance));
  expect(actual.height, closeTo(v.height / v.scale, tolerance));
}
