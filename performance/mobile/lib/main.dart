import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:developer' as developer;
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/foundation.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'geometry.dart' as geometry;
import 'runtime.dart';

const blockCount = int.fromEnvironment('BLOCKS', defaultValue: 6);
const measuredCount = int.fromEnvironment('SAMPLES', defaultValue: 30);
const warmupCount = 10;
const selectedTransport = String.fromEnvironment(
  'TRANSPORT',
  defaultValue: 'all',
);
const runId = String.fromEnvironment('RUN_ID', defaultValue: 'qualification');

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  final model = BarScene();
  runApp(
    Directionality(
      textDirection: TextDirection.ltr,
      child: Center(
        child: SizedBox(
          width: 360,
          height: 640,
          child: CustomPaint(
            painter: BarPainter(model),
            child: const SizedBox.expand(),
          ),
        ),
      ),
    ),
  );
  await Future<void>.delayed(const Duration(seconds: 2));
  try {
    await runBenchmark(model);
  } catch (error, stack) {
    final failure = {'event': 'error', 'error': '$error', 'stack': '$stack'};
    await File(
      '${Directory.systemTemp.path}/patchmap-$runId-error.json',
    ).writeAsString(jsonEncode(failure));
    emit(failure);
  }
}

void emit(Map<String, Object?> row) {
  // One structured JSON line; host runner consumes only this marker.
  // ignore: avoid_print
  print('PATCHMAP_BENCH ${jsonEncode(row)}');
}

Future<void> runBenchmark(BarScene scene) async {
  final source = await rootBundle.loadString('assets/kernel.js');
  final oracles =
      jsonDecode(await rootBundle.loadString('assets/oracle.json')) as Map;
  final view = ui.PlatformDispatcher.instance.views.first;
  final report = <String, Object?>{
    'protocol': 1,
    'runId': runId,
    'runtime': runtimeName,
    'mode': kReleaseMode
        ? 'release'
        : kProfileMode
        ? 'profile'
        : 'debug',
    'os': Platform.operatingSystem,
    'osVersion': Platform.operatingSystemVersion,
    'physicalSize': [view.physicalSize.width, view.physicalSize.height],
    'dpr': view.devicePixelRatio,
    'refreshRate': view.display.refreshRate,
    'viewport': [360, 640],
    'blocks': <Object>[],
  };
  emit({'event': 'start', ...report});
  for (final count in [5000, 10000]) {
    for (final stride in [1, 10]) {
      final oracleHeights = List.generate(count ~/ stride, (i) => 1.0 + i % 20);
      geometry.checkVertices(
        geometry.project(oracleHeights, stride),
        Float32List.fromList(
          (jsonDecode(oracles['$count:$stride'] as String) as List)
              .cast<num>()
              .map((v) => v.toDouble())
              .toList(),
        ),
      );
      final inputs = geometry.inputs(
        count,
        stride,
        warmupCount + measuredCount,
      );
      for (final transport in transports.where(
        (t) => selectedTransport == 'all' || selectedTransport == t,
      )) {
        // Differential qualification for every prepared input, before timing.
        final qualification = Runtime(source);
        try {
          for (final input in inputs) {
            geometry.checkVertices(
              qualification.project(input, stride, transport),
              geometry.project(input, stride),
            );
          }
        } finally {
          qualification.dispose();
        }
        emit({
          'event': 'conformance',
          'count': count,
          'stride': stride,
          'transport': transport,
          'passed': true,
        });
        for (var block = 0; block < blockCount; block++) {
          final order = block.isEven
              ? ['dart', runtimeName]
              : [runtimeName, 'dart'];
          for (final variant in order) {
            scene.reset(count);
            await SchedulerBinding.instance.endOfFrame;
            final startup = Stopwatch()..start();
            final runtime = variant == 'dart' ? null : Runtime(source);
            startup.stop();
            final samples = <Map<String, Object?>>[];
            final frameTimes = <ui.FrameTiming>[];
            void timings(List<ui.FrameTiming> values) =>
                frameTimes.addAll(values);
            SchedulerBinding.instance.addTimingsCallback(timings);
            try {
              Float32List? last;
              for (var sample = 0; sample < inputs.length; sample++) {
                final input = inputs[sample];
                final done = Completer<void>();
                final row = <String, Object?>{
                  'sample': sample,
                  'warmup': sample < warmupCount,
                };
                SchedulerBinding.instance.scheduleFrameCallback((_) {
                  try {
                    row['vsyncUs'] = SchedulerBinding
                        .instance
                        .currentSystemFrameTimeStamp
                        .inMicroseconds;
                    row['workStartUs'] = developer.Timeline.now;
                    final watch = Stopwatch()..start();
                    final vertices = runtime == null
                        ? geometry.project(input, stride)
                        : runtime.project(input, stride, transport);
                    row['updateMs'] = watch.elapsedMicroseconds / 1000;
                    scene.apply(vertices, stride);
                    row['updateAndVerticesMs'] =
                        watch.elapsedMicroseconds / 1000;
                    last = vertices;
                    SchedulerBinding.instance.addPostFrameCallback((_) {
                      watch.stop();
                      row['postFrameMs'] = watch.elapsedMicroseconds / 1000;
                      samples.add(row);
                      done.complete();
                    });
                  } catch (error, stack) {
                    done.completeError(error, stack);
                  }
                });
                await done.future;
              }
              // Let raster and batched timing delivery finish before correctness work.
              await Future<void>.delayed(const Duration(seconds: 2));
              geometry.checkVertices(
                last!,
                geometry.project(inputs.last, stride),
              );
              final matchedFrames = <int>{};
              for (final row in samples) {
                final start = row['workStartUs'] as int;
                final matches = frameTimes
                    .where(
                      (frame) =>
                          frame.timestampInMicroseconds(
                                ui.FramePhase.buildStart,
                              ) <=
                              start &&
                          start <=
                              frame.timestampInMicroseconds(
                                ui.FramePhase.buildFinish,
                              ) &&
                          !matchedFrames.contains(frame.frameNumber),
                    )
                    .toList();
                if (matches.length == 1) {
                  final frame = matches.single;
                  matchedFrames.add(frame.frameNumber);
                  row['frameNumber'] = frame.frameNumber;
                  row['buildMs'] = frame.buildDuration.inMicroseconds / 1000;
                  row['rasterMs'] = frame.rasterDuration.inMicroseconds / 1000;
                  row['totalSpanMs'] = frame.totalSpan.inMicroseconds / 1000;
                }
              }
              final result = <String, Object?>{
                'variant': variant,
                'transport': transport,
                'count': count,
                'stride': stride,
                'block': block,
                'initializationMs': startup.elapsedMicroseconds / 1000,
                'samples': samples,
                'rawFrameTimings': [
                  for (final frame in frameTimes)
                    {
                      'frameNumber': frame.frameNumber,
                      for (final phase in ui.FramePhase.values)
                        phase.name: frame.timestampInMicroseconds(phase),
                    },
                ],
                'correctness': true,
                'timingCoverage': samples
                    .where((row) => row.containsKey('rasterMs'))
                    .length,
              };
              (report['blocks'] as List).add(result);
              await File(
                '${Directory.systemTemp.path}/patchmap-$runId.jsonl',
              ).writeAsString('${jsonEncode(result)}\n', mode: FileMode.append);
              emit({
                'event': 'block',
                'variant': variant,
                'transport': transport,
                'count': count,
                'stride': stride,
                'block': block,
                'timingCoverage': result['timingCoverage'],
              });
            } finally {
              SchedulerBinding.instance.removeTimingsCallback(timings);
              runtime?.dispose();
            }
          }
        }
      }
    }
  }
  // tmp is readable through adb run-as in profile and simctl's app container.
  final file = File('${Directory.systemTemp.path}/patchmap-$runId.json');
  await file.writeAsString(jsonEncode(report));
  emit({
    'event': 'complete',
    'path': file.path,
    'blocks': (report['blocks'] as List).length,
  });
}

class BarScene extends ChangeNotifier {
  static const chunkBars = 1000;
  static final indices = Uint16List.fromList([
    for (var bar = 0; bar < chunkBars; bar++)
      for (var edge = 0; edge < 20; edge++) ...[
        bar * 21,
        bar * 21 + 1 + edge,
        bar * 21 + 1 + (edge + 1) % 20,
      ],
  ]);
  int count = 0;
  final positions = <Float32List>[];
  final meshes = <ui.Vertices>[];
  void reset(int value) {
    for (final mesh in meshes) {
      mesh.dispose();
    }
    count = value;
    positions.clear();
    meshes.clear();
    final initial = geometry.project(List<double>.filled(value, 10), 1);
    for (var start = 0; start < value; start += chunkBars) {
      final data = Float32List.fromList(
        initial.sublist(start * 42, (start + chunkBars) * 42),
      );
      positions.add(data);
      meshes.add(
        ui.Vertices.raw(ui.VertexMode.triangles, data, indices: indices),
      );
    }
    notifyListeners();
  }

  void apply(Float32List update, int stride) {
    for (var ordinal = 0; ordinal < update.length ~/ 42; ordinal++) {
      final index = ordinal * stride;
      positions[index ~/ chunkBars].setRange(
        (index % chunkBars) * 42,
        (index % chunkBars + 1) * 42,
        update,
        ordinal * 42,
      );
    }
    for (var chunk = 0; chunk < meshes.length; chunk++) {
      meshes[chunk].dispose();
      meshes[chunk] = ui.Vertices.raw(
        ui.VertexMode.triangles,
        positions[chunk],
        indices: indices,
      );
    }
    notifyListeners();
  }
}

class BarPainter extends CustomPainter {
  BarPainter(this.scene) : super(repaint: scene);
  final BarScene scene;
  final paintBar = Paint()
    ..color = const Color(0xff3976e8)
    ..isAntiAlias = false;
  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawColor(const Color(0xfff4f6fa), BlendMode.src);
    canvas.save();
    canvas.scale(size.width / 1350, size.height / 2200);
    for (final mesh in scene.meshes) {
      canvas.drawVertices(mesh, BlendMode.src, paintBar);
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(BarPainter oldDelegate) => oldDelegate.scene != scene;
}
