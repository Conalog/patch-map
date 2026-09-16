// Full SDK native frame benchmark. Only the package's public entry is imported.
// Run via flutter drive; see verification/flutter/benchmark.md. Never pump a
// synthetic animation timeline or use a substitute renderer in measured work.
import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart' show kProfileMode, kReleaseMode;
import 'package:flutter/scheduler.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:conalog_patch_map/conalog_patch_map.dart';

const _width = 360.0, _height = 640.0;
const _warmups = 5, _samples = 20, _blocks = 2;
const _seed = 0x5eed;
const _revision = String.fromEnvironment('PATCHMAP_REVISION');
const _runId = String.fromEnvironment(
  'PATCHMAP_RUN_ID',
  defaultValue: 'native',
);
const _camera = <String, dynamic>{
  'initial': {
    'centerWorld': [675.0, 1100.0],
    'scale': 360.0 / 1350.0,
  },
};

typedef _Json = Map<String, dynamic>;

List<_Json> _dataset(int grids) => [
  for (var grid = 0; grid < grids; grid++)
    {
      'id': 'g$grid',
      'type': 'grid',
      'attrs': {'x': grid % 5 * 270, 'y': grid ~/ 5 * 110},
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

List<Float64List> _inputs(int count) {
  var random = _seed;
  final previous = Float64List(count)..fillRange(0, count, 10);
  return List.generate(_warmups + _samples, (_) {
    final values = Float64List(count);
    for (var index = 0; index < count; index++) {
      random = (random * 1664525 + 1013904223) & 0xffffffff;
      var next = 1.0 + random % 20;
      if (next == previous[index]) next = next % 20 + 1;
      values[index] = next;
      previous[index] = next;
    }
    return values;
  });
}

// An input identity for matching npm/native workloads, not a semantic hash.
int _inputChecksum(List<Float64List> batches) {
  var hash = 0x811c9dc5;
  for (final batch in batches) {
    for (final height in batch) {
      hash = ((hash ^ height.toInt()) * 0x01000193) & 0xffffffff;
    }
  }
  return hash;
}

Widget _view(PatchMapController controller, double dpr) => MediaQuery(
  data: MediaQueryData(devicePixelRatio: dpr, disableAnimations: false),
  child: Directionality(
    textDirection: TextDirection.ltr,
    child: Center(
      child: SizedBox(
        width: _width,
        height: _height,
        child: PatchMapView(controller: controller),
      ),
    ),
  ),
);

bool _sameTuple(Object? published, PatchMapController controller) {
  if (published is! Map) return false;
  final current = controller.revisions;
  return published['scene'] == current.scene &&
      published['view'] == current.view &&
      published['interaction'] == current.interaction;
}

bool _finalHeights(PatchMapController controller, Float64List heights) {
  final bars = controller.renderSnapshot.geometry.primitives;
  return bars.length == heights.length &&
      (bars.first.localRect.height - heights.first).abs() < 1e-9 &&
      (bars.last.localRect.height - heights.last).abs() < 1e-9;
}

void _checkFinal(PatchMapController controller, Float64List heights) {
  final bars = controller.renderSnapshot.geometry.primitives;
  expect(bars.length, heights.length);
  expect(bars.first.ownerId, 'g0.0.0');
  expect(bars.last.ownerId, 'g${heights.length ~/ 100 - 1}.3.24');
  expect(bars.first.localRect.height, closeTo(heights.first, 1e-9));
  expect(bars.last.localRect.height, closeTo(heights.last, 1e-9));
  expect(controller.history.state['depth'], 0);
  expect(
    _sameTuple(controller.debug.publication()['publishedTuple'], controller),
    isTrue,
  );
}

Future<_Json> _measure(
  PatchMapController controller,
  List<String> targets,
  Float64List heights,
  bool animated,
) async {
  final before = controller.debug.publication();
  final previousFrame = before['frameRevision'] as int;
  final initialHash = controller.dataset.semanticHash;
  final completed = Completer<void>();
  final watch = Stopwatch();
  final row = <String, dynamic>{};
  var active = true;
  var publications = 0;

  void observe(Duration _) {
    // The View confirms publication in a post-frame callback of its own. Read
    // after every callback in this frame, without scheduling an extra frame.
    final frameNumber = ui.PlatformDispatcher.instance.frameData.frameNumber;
    scheduleMicrotask(() {
      if (!active) return;
      final debug = controller.debug.publication();
      if ((debug['frameRevision'] as int) > previousFrame &&
          _sameTuple(debug['publishedTuple'], controller)) {
        publications++;
        row.putIfAbsent(
          'nextPublishedMs',
          () => watch.elapsedMicroseconds / 1000,
        );
        (row.putIfAbsent('publishedFrameNumbers', () => <int>[]) as List<int>)
            .add(frameNumber);
        if (!animated || _finalHeights(controller, heights)) {
          row['finalPublishedMs'] = watch.elapsedMicroseconds / 1000;
          row['observedPublications'] = publications;
          active = false;
          completed.complete();
          return;
        }
      }
      SchedulerBinding.instance.addPostFrameCallback(observe);
    });
  }

  SchedulerBinding.instance.addPostFrameCallback(observe);
  try {
    watch.start();
    final commit = Stopwatch()..start();
    final result = controller.updateBatch(
      {
        'targets': targets,
        'bar': {'componentId': 'bar', 'height': heights},
      },
      animate: animated,
      recordHistory: false,
    );
    commit.stop();
    row['commitMs'] = commit.elapsedMicroseconds / 1000;
    await completed.future.timeout(const Duration(seconds: 10));
    watch.stop();
    expect(result.status, 'committed');
    expect(result.changed, isTrue);
    // Correctness is outside measured completion. Only first/last height
    // sentinels run per animation frame; no full geometry traversal is timed.
    _checkFinal(controller, heights);
    expect(controller.dataset.semanticHash, initialHash);
    return row;
  } finally {
    active = false;
    watch.stop();
  }
}

_Json _timing(ui.FrameTiming frame) => {
  'frameNumber': frame.frameNumber,
  'vsyncUs': frame.timestampInMicroseconds(ui.FramePhase.vsyncStart),
  'buildMs': frame.buildDuration.inMicroseconds / 1000,
  'rasterMs': frame.rasterDuration.inMicroseconds / 1000,
  'totalSpanMs': frame.totalSpan.inMicroseconds / 1000,
  'vsyncOverheadMs': frame.vsyncOverhead.inMicroseconds / 1000,
};

_Json _summary(Iterable<num> values) {
  final sorted = values.map((v) => v.toDouble()).toList()..sort();
  if (sorted.isEmpty)
    throw StateError('No timing samples; never report zero as success');
  double percentile(double p) => sorted[((sorted.length - 1) * p).ceil()];
  return {
    'count': sorted.length,
    'median': percentile(0.5),
    'p95': percentile(0.95),
    'min': sorted.first,
    'max': sorted.last,
  };
}

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  binding.framePolicy = LiveTestWidgetsFlutterBindingFramePolicy.fullyLive;
  testWidgets(
    'full SDK native bar commit and frame benchmark',
    (tester) async {
      final view = ui.PlatformDispatcher.instance.views.single;
      final dpr = view.devicePixelRatio;
      final logical = view.physicalSize / dpr;
      expect(logical.width, greaterThanOrEqualTo(_width));
      expect(logical.height, greaterThanOrEqualTo(_height));
      final timings = <ui.FrameTiming>[];
      void collect(List<ui.FrameTiming> frames) => timings.addAll(frames);
      binding.addTimingsCallback(collect);
      final report = <String, dynamic>{
        'protocol': 'patch-map-full-sdk-native-frames/1',
        'runId': _runId,
        'revision': _revision.isEmpty ? null : _revision,
        'runtime': 'Dart public package + PatchMapView native Canvas',
        'mode': kReleaseMode
            ? 'release/AOT'
            : kProfileMode
            ? 'profile/AOT'
            : 'debug/JIT',
        'optimizationComparisonEligible': kProfileMode && _revision.isNotEmpty,
        'dartVersion': Platform.version,
        'os': Platform.operatingSystem,
        'osVersion': Platform.operatingSystemVersion,
        'physicalSize': [view.physicalSize.width, view.physicalSize.height],
        'devicePixelRatio': dpr,
        'refreshRateHz': view.display.refreshRate,
        'logicalMapSize': [_width, _height],
        'viewport': _camera,
        'seed': _seed,
        'gridShape': [4, 25],
        'warmups': _warmups,
        'measuredSamples': _samples,
        'blocks': _blocks,
        'startedAt': DateTime.now().toUtc().toIso8601String(),
        'measurementNotes': [
          'FrameTiming is actual engine build/raster, collected in batched callbacks.',
          'Samples match published engine frame numbers exactly; target/vsync timestamps have different meanings.',
          'Publication observer reads compact publication counters + first/last geometry sentinel once per frame.',
          'No capture/readback, forced GC, synthetic clock, per-entity Widgets or pump occurs in measured actions.',
          'debug/JIT results are diagnostic and cannot establish profile/AOT performance equivalence.',
        ],
        'cases': <_Json>[],
      };
      binding.reportData = {'barPerformance': report};
      final preparedInputs = {
        for (final grids in [50, 100]) grids: _inputs(grids * 100),
      };
      try {
        for (var block = 0; block < _blocks; block++) {
          final order = [(50, false), (50, true), (100, false), (100, true)];
          for (final scenario in block.isEven ? order : order.reversed) {
            final (grids, animated) = scenario;
            expect(
              view.devicePixelRatio,
              dpr,
              reason: 'DPR changed during trial',
            );
            expect(
              view.physicalSize / dpr,
              logical,
              reason: 'Surface changed during trial',
            );
            final count = grids * 100;
            final targets = [
              for (var index = 0; index < count; index++)
                'g${index ~/ 100}.${index % 100 ~/ 25}.${index % 25}',
            ];
            final inputs = preparedInputs[grids]!;
            final controller = await PatchMap.create(
              data: _dataset(grids),
              width: _width,
              height: _height,
              pixelRatio: dpr,
              viewport: _camera,
              fit: false,
              historyLimit: 0,
            );
            try {
              await tester.pumpWidget(_view(controller, dpr));
              await tester.runAsync(
                () => controller.ready.timeout(const Duration(seconds: 20)),
              );
              final rows = <_Json>[];
              await tester.runAsync(() async {
                // Allow creation/font/shader setup to finish outside measured work.
                await Future<void>.delayed(const Duration(milliseconds: 300));
                for (var sample = 0; sample < inputs.length; sample++) {
                  rows.add({
                    ...await _measure(
                      controller,
                      targets,
                      inputs[sample],
                      animated,
                    ),
                    'sample': sample,
                    'warmup': sample < _warmups,
                  });
                }
                // Flutter batches timings; flush after the entire case, not between
                // updates. The pause lies outside all per-sample timestamp windows.
                await Future<void>.delayed(const Duration(seconds: 2));
              });
              final frames = timings.map(_timing).toList();
              final caseReport = <String, dynamic>{
                'block': block,
                'grids': grids,
                'bars': count,
                'animated': animated,
                'inputChecksumFnv32': _inputChecksum(
                  inputs,
                ).toRadixString(16).padLeft(8, '0'),
                'rows': rows,
                'rawFrameTimings': frames,
              };
              (report['cases'] as List).add(caseReport);
              for (final row in rows) {
                final observed = (row['publishedFrameNumbers'] as List<int>)
                    .toSet();
                row['frames'] = frames.where((frame) {
                  return observed.contains(frame['frameNumber']);
                }).toList();
                expect(
                  row['frames'],
                  isNotEmpty,
                  reason:
                      'Missing real FrameTiming for sample ${row['sample']}',
                );
              }
              final measured = rows
                  .where((row) => row['warmup'] == false)
                  .toList();
              final measuredFrames = measured
                  .expand((row) => row['frames'] as List)
                  .cast<_Json>()
                  .toList();
              caseReport['summary'] = {
                for (final field in [
                  'commitMs',
                  'nextPublishedMs',
                  'finalPublishedMs',
                ])
                  field: _summary(measured.map((row) => row[field] as num)),
                for (final field in ['buildMs', 'rasterMs', 'totalSpanMs'])
                  field: _summary(
                    measuredFrames.map((row) => row[field] as num),
                  ),
              };
              caseReport['completed'] = true;
            } finally {
              await controller.destroy();
              await tester.pumpWidget(const SizedBox.shrink());
              timings.clear();
            }
          }
        }
        report['completed'] = true;
      } finally {
        binding.removeTimingsCallback(collect);
        report['finishedAt'] = DateTime.now().toUtc().toIso8601String();
      }
    },
    timeout: const Timeout(Duration(minutes: 5)),
  );
}
