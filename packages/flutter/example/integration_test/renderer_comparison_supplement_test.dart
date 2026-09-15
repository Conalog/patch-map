import 'dart:async';
import 'renderer_environment.dart';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:patch_map/patch_map.dart';
import '../lib/renderer_comparison/scene.dart';
import '../lib/renderer_comparison/dense_scene.dart';
import '../lib/renderer_comparison/host.dart';
import 'renderer_comparison_test.dart'
    show Run, sample, width, height, mathFit, verifyViewport;

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  binding.framePolicy = LiveTestWidgetsFlutterBindingFramePolicy.fullyLive;
  testWidgets(
    'cold text re-entry, idle resume and bar batching control',
    (tester) async {
      final dpr = ui.PlatformDispatcher.instance.views.single.devicePixelRatio;
      final filter = ui.PlatformDispatcher.instance.defaultRouteName.split('/');
      final isolated = filter.length > 1 && filter[1].isNotEmpty;
      final report = <String, dynamic>{
        'hostQualitySkippedForIsolation': isolated,
        'protocol': 'patch-map-canvas-flame/supplement-1',
        'revision': const String.fromEnvironment('PATCHMAP_REVISION'),
        'mode': kProfileMode ? 'profile/AOT' : 'debug/JIT',
        'os': Platform.operatingSystemVersion,
        'dpr': dpr,
        'viewport': [width, height],
        'completed': false,
        'cases': <Map<String, dynamic>>[],
        'hostQuality': <Map<String, dynamic>>[],
      };
      binding.reportData = {'rendererComparison': report};
      final hostPixels = <String, Uint8List>{};
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
        for (var block = 0; block < 2; block++) {
          for (final workload in ['cold-reentry', 'animated', 'fit-animated']) {
            final variants = workload == 'cold-reentry'
                ? ['stock', 'canvas', 'flame']
                : workload == 'fit-animated'
                ? [
                    'canvas',
                    'canvas-atlas',
                    'flame',
                    'flame-atlas',
                    'flame-raw',
                  ]
                : [
                    'canvas',
                    'canvas-vector',
                    'flame',
                    'flame-vector',
                    'flame-raw',
                  ];
            for (final variant in block == 0 ? variants : variants.reversed) {
              if (isolated && filter[1] != variant) continue;
              if (filter.length > 2 &&
                  filter[2].isNotEmpty &&
                  filter[2] != '$block')
                continue;
              if (filter.length > 3 &&
                  filter[3].isNotEmpty &&
                  filter[3] != (workload == 'fit-animated' ? 'fit' : 'zoom'))
                continue;
              if (filter.length > 4 &&
                  filter[4].isNotEmpty &&
                  filter[4] != workload)
                continue;
              await tester.runAsync(awaitCoolDevice);
              final c = (await tester.runAsync(
                () => createPanelController(
                  width: width,
                  height: height,
                  dpr: dpr,
                ),
              ))!;
              final dense = variant == 'stock'
                  ? null
                  : DensePlayback(
                      DensePanelScene(c.renderSnapshot),
                      flame: variant.startsWith('flame'),
                      flameBatch: variant == 'flame-raw' ? false : null,
                      atlasBars: !variant.endsWith('vector'),
                      minAtlasScale:
                          variant.endsWith('atlas') || variant == 'flame-raw'
                          ? 0
                          : 0.4,
                    );
              final run = Run(c, dense);
              final captureKey = GlobalKey();
              await tester.pumpWidget(
                MaterialApp(
                  initialRoute: '/',
                  home: Scaffold(
                    body: Center(
                      child: SizedBox(
                        width: width,
                        height: height,
                        child: RepaintBoundary(
                          key: captureKey,
                          child: dense == null
                              ? PatchMapView(controller: c)
                              : DenseView(dense),
                        ),
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
                        throw TimeoutException('Dense mount');
                      await Future<void>.delayed(
                        const Duration(milliseconds: 10),
                      );
                    }
                  }
                  if (!isolated &&
                      block == 0 &&
                      (workload == 'cold-reentry' ||
                          variant.endsWith('atlas'))) {
                    run.setMode(false);
                    await sample(
                      run,
                      () => run.heights(List.filled(5000, 37), false),
                      animated: false,
                      pan: false,
                    );
                    for (final zoom in [false, true]) {
                      await sample(
                        run,
                        () => run.camera(2318, 2368, zoom ? 0.86 : mathFit()),
                        animated: false,
                        pan: true,
                      );
                      verifyViewport(dense);
                      final boundary =
                          captureKey.currentContext!.findRenderObject()!
                              as RenderRepaintBoundary;
                      final image = await boundary.toImage(pixelRatio: 1);
                      final bytes = (await image.toByteData())!.buffer
                          .asUint8List();
                      image.dispose();
                      final key = '$zoom';
                      if (variant == 'stock') {
                        hostPixels[key] = bytes;
                      } else {
                        final reference = hostPixels[key]!;
                        expect(bytes.length, reference.length);
                        var error = 0, bad = 0;
                        for (var i = 0; i < bytes.length; i += 4) {
                          var delta = 0;
                          for (var j = 0; j < 3; j++)
                            delta += (bytes[i + j] - reference[i + j]).abs();
                          error += delta;
                          if (delta > 96) bad++;
                        }
                        final mean = error / (bytes.length / 4 * 3);
                        final badFraction = bad / (bytes.length / 4);
                        (report['hostQuality'] as List).add({
                          'variant': variant,
                          'zoom': zoom,
                          'meanRgb': mean,
                          'badFraction': badFraction,
                          'visibleGroups': dense!.renderer.visibleGroups,
                        });
                        expect(
                          mean,
                          lessThan(3.0),
                          reason: 'Actual host picture mismatch',
                        );
                        expect(badFraction, lessThan(0.025));
                      }
                    }
                  }
                  run.setMode(workload == 'cold-reentry');
                  run.camera(430, 200, 0.86);
                  await Future<void>.delayed(const Duration(milliseconds: 350));
                  final beforeIdle = run.frames;
                  await Future<void>.delayed(const Duration(milliseconds: 250));
                  expect(
                    run.frames,
                    beforeIdle,
                    reason: '$variant paints while idle',
                  );
                  final resumed = await sample(
                    run,
                    () => run.camera(440, 200, 0.86),
                    animated: false,
                    pan: true,
                  );
                  expect(run.frames, greaterThan(beforeIdle));
                  await Future<void>.delayed(const Duration(milliseconds: 250));
                  final afterResume = run.frames;
                  await Future<void>.delayed(const Duration(milliseconds: 250));
                  expect(
                    run.frames,
                    afterResume,
                    reason: '$variant did not return to idle',
                  );
                  final entry = <String, dynamic>{
                    'block': block,
                    'variant': variant,
                    'workload': workload,
                    'zoom': workload != 'fit-animated',
                    'idlePassed': true,
                    'rendererConfig': dense == null
                        ? {'host': 'stock'}
                        : {
                            'host': dense.flame ? 'flame' : 'canvas',
                            'flameBatch': dense.renderer.flameBatch,
                            'atlasBars': dense.renderer.atlasBars,
                            'minAtlasScale': dense.renderer.minAtlasScale,
                          },
                    'resumeMs': resumed['finalMs'],
                    'rows': <Map<String, dynamic>>[],
                  };
                  (report['cases'] as List).add(entry);
                  if (workload != 'cold-reentry') {
                    await sample(
                      run,
                      () => run.camera(
                        2318,
                        2368,
                        workload == 'fit-animated' ? mathFit() : 0.86,
                      ),
                      animated: false,
                      pan: true,
                    );
                  }
                  final count = workload == 'cold-reentry' ? 12 : 25;
                  final warmups = workload == 'cold-reentry' ? 2 : 5;
                  var seed = 0x5eed;
                  final hs = <List<double>>[];
                  for (var s = 0; s < count; s++) {
                    hs.add(
                      List.generate(5000, (i) {
                        seed = (seed * 1664525 + 1013904223) & 0xffffffff;
                        var percent = 1 + seed % 100;
                        final previous = hs.isEmpty ? 74.0 : hs.last[i];
                        if (74 * percent / 100 == previous)
                          percent = percent % 100 + 1;
                        return 74 * percent / 100;
                      }),
                    );
                  }
                  for (var s = 0; s < count; s++) {
                    await awaitCoolDevice();
                    Map<String, dynamic> row;
                    if (workload == 'cold-reentry') {
                      // Reset to the first group. New values invalidate the hidden
                      // last group's text; no measured string was shaped earlier.
                      await sample(
                        run,
                        () => run.camera(430, 200, 0.86),
                        animated: false,
                        pan: true,
                      );
                      final values = List.generate(
                        5000,
                        (i) => '${s.toRadixString(16)}P$i',
                      );
                      final update = await sample(
                        run,
                        () => run.texts(values),
                        animated: false,
                        pan: false,
                      );
                      await Future<void>.delayed(
                        const Duration(milliseconds: 100),
                      );
                      row = await sample(
                        run,
                        () => run.camera(4190, 4510, 0.86),
                        animated: false,
                        pan: true,
                      );
                      row['precedingUpdate'] = update;
                      run.verify('text', [], values);
                    } else {
                      row = await sample(
                        run,
                        () => run.heights(hs[s], true),
                        animated: true,
                        pan: false,
                        destination: hs[s].first,
                      );
                      run.verify('animated', hs[s], []);
                    }
                    row['thermalAfter'] = await thermalStatus();
                    expect(
                      row['thermalAfter'],
                      0,
                      reason: 'Thermal state changed during sample',
                    );
                    verifyViewport(dense);
                    row['visibleGroups'] = dense?.renderer.visibleGroups;
                    row['sample'] = s;
                    row['warmup'] = s < warmups;
                    (entry['rows'] as List).add(row);
                    await Future<void>.delayed(
                      const Duration(milliseconds: 100),
                    );
                  }
                  await Future<void>.delayed(const Duration(seconds: 2));
                  for (final row in entry['rows'] as List) {
                    for (final frame in [
                      ...row['frames'] as List,
                      if (row['precedingUpdate'] != null)
                        ...row['precedingUpdate']['frames'] as List,
                    ]) {
                      final t = timings[frame['number']];
                      expect(t, isNotNull, reason: 'Engine timing missing');
                      frame.addAll(t!);
                    }
                  }
                  entry['completed'] = true;
                  print('SUPPLEMENT $block $variant $workload completed');
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
        }
        report['completed'] = true;
      } finally {
        binding.removeTimingsCallback(collect);
      }
    },
    timeout: const Timeout(Duration(minutes: 12)),
  );
}
