// Full SDK CPU stage diagnostic for deterministic 5,000/10,000-bar workloads.
// Opt in with --dart-define=PATCHMAP_PROFILE=true; no platform frame claims.
import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:patch_map/src/api/values.dart';
import 'package:patch_map/src/engine/controller.dart';
import 'package:patch_map/src/engine/ports.dart';
import 'package:patch_map/src/model/dataset.dart';
import 'package:patch_map/src/rendering/canvas_renderer.dart';
import 'package:patch_map/src/semantic/geometry/geometry.dart';
import '../support/bar_profile_inputs.dart';

class _Surface implements PatchMapSurfacePort {
  final renderer = PatchMapCanvasRenderer(null);
  double prepareMs = 0;
  int preparations = 0;
  @override
  bool prepare(PatchMapRenderSnapshot state) {
    final watch = Stopwatch()..start();
    renderer.prepare(state);
    prepareMs += watch.elapsedMicroseconds / 1000;
    preparations++;
    return true;
  }

  @override
  void requestFrame() {}
  @override
  Future<void> dispose() async => renderer.dispose();
  @override
  Future<PatchMapCaptureResult> capture(PatchMapRenderSnapshot state) =>
      throw UnimplementedError();
}

List<JsonMap> _data(int grids) => [
  for (var g = 0; g < grids; g++)
    {
      'id': 'g$g',
      'type': 'grid',
      'attrs': {'x': (g % 5) * 270, 'y': (g ~/ 5) * 110},
      'cells': [for (var row = 0; row < 4; row++) List.filled(25, 1)],
      'gap': {'x': 2, 'y': 4},
      'item': {
        'size': {'width': 8, 'height': 20},
        'components': [
          {
            'id': 'bar',
            'type': 'bar',
            'size': {'width': 8, 'height': 10},
            'source': {'type': 'rect', 'fill': '#287ac7', 'radius': 3},
            'animation': true,
          },
        ],
      },
    },
];

double _time(void Function() run) {
  final watch = Stopwatch()..start();
  run();
  return watch.elapsedMicroseconds / 1000;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'bar pipeline stage profile',
    () async {
      const warmups = 10, samples = 30, blocks = 2;
      final report = <String, Object?>{
        'protocol': 'patch-map-full-dart-pipeline-diagnostic/2',
        'mode': 'host Flutter tester debug/JIT; no build/raster/frame timing',
        'os': Platform.operatingSystem,
        'osVersion': Platform.operatingSystemVersion,
        'dart': Platform.version,
        'warmups': warmups,
        'samples': samples,
        'blocks': blocks,
        'seed': 0x5eed,
        'revision': Process.runSync('git', [
          'rev-parse',
          'HEAD',
        ]).stdout.toString().trim(),
        'startedAt': DateTime.now().toUtc().toIso8601String(),
        'rows': <Object?>[],
      };
      final destination = File(
        '../../.artifacts/performance/flutter/full-dart-pipeline-${DateTime.now().millisecondsSinceEpoch}.json',
      );
      addTearDown(() {
        report['finishedAt'] = DateTime.now().toUtc().toIso8601String();
        destination.parent.createSync(recursive: true);
        destination.writeAsStringSync(jsonEncode(report));
        // ignore: avoid_print
        print('PATCHMAP_PIPELINE_PROFILE ${destination.absolute.path}');
      });
      for (final count in [5000, 10000])
        for (final animated in [false, true]) {
          final inputs = barProfileInputs(count, warmups + samples);
          final targets = [
            for (var i = 0; i < count; i++)
              'g${i ~/ 100}.${(i % 100) ~/ 25}.${i % 25}',
          ];
          for (var block = 0; block < blocks; block++) {
            final c = await PatchMapController.create(
              data: _data(count ~/ 100),
              fit: false,
              historyLimit: 0,
            );
            final surface = _Surface();
            c.attach(surface);
            c.frameConfirmed(c.revisions);
            try {
              for (var sample = 0; sample < inputs.length; sample++) {
                c.advanceFrame(sample * 250);
                surface.prepare(c.renderSnapshot);
                c.frameConfirmed(c.revisions);
                final heights = inputs[sample],
                    beforePrepare = surface.prepareMs,
                    beforeCalls = surface.preparations;
                final row = <String, Object?>{
                  'count': count,
                  'animated': animated,
                  'block': block,
                  'sample': sample,
                  'warmup': sample < warmups,
                };
                row['commitMs'] = _time(
                  () => c.updateBatch(
                    {
                      'targets': targets,
                      'bar': {'height': heights},
                    },
                    animate: animated,
                    recordHistory: false,
                  ),
                );
                row['commitRendererPrepareMs'] =
                    surface.prepareMs - beforePrepare;
                row['commitPrepareCalls'] = surface.preparations - beforeCalls;
                row['snapshotCachedMs'] = _time(() => c.renderSnapshot);
                if (animated) {
                  row['animationSampleMs'] = _time(
                    () => c.advanceFrame(sample * 250 + 100),
                  );
                  late PatchMapRenderSnapshot state;
                  row['animationGeometryMs'] = _time(
                    () => state = c.renderSnapshot,
                  );
                  row['animationRendererMs'] = _time(
                    () => surface.renderer.prepare(state),
                  );
                }
                late PatchMapGeometry projected;
                row['freshGeometryMs'] = _time(
                  () => projected = buildGeometry(
                    c.dataset,
                    overlays: c.instanceOverlays,
                  ),
                );
                expect(projected.primitives.length, count);
                expect(
                  projected.primitives.first.localRect.height,
                  heights.first,
                );
                expect(
                  projected.primitives.last.localRect.height,
                  heights.last,
                );
                c.frameConfirmed(c.revisions);
                (report['rows'] as List).add(row);
              }
            } finally {
              await c.destroy();
            }
          }
        }
    },
    skip: !const bool.fromEnvironment('PATCHMAP_PROFILE'),
    timeout: const Timeout(Duration(minutes: 10)),
  );
}
