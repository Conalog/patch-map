// Native correctness probe: real vsync, actual Canvas publication, and no
// manual animation clock. Use test_driver/native_contract_driver.dart with
// PATCHMAP_CONTRACT_OUTPUT to preserve the Android/iOS observations.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/scheduler.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:conalog_patch_map/conalog_patch_map.dart';

const _targets = ['grid.0.0', 'grid.0.1', 'grid.0.2', 'grid.0.3'];
const _width = 240.0, _height = 160.0;
typedef _Json = Map<String, dynamic>;

List<double> _heights(PatchMapController controller) => [
  for (final primitive in controller.renderSnapshot.geometry.primitives)
    primitive.localRect.height,
];

PatchMapResult _update(PatchMapController controller, double destination) =>
    controller.updateBatch(
      {
        'targets': _targets,
        'bar': {
          'componentId': 'bar',
          'height': List.filled(_targets.length, destination),
        },
      },
      animate: true,
      recordHistory: false,
    );

bool _published(PatchMapController controller, _Json debug) {
  final tuple = debug['publishedTuple'];
  final current = controller.revisions;
  return tuple is Map &&
      tuple['scene'] == current.scene &&
      tuple['view'] == current.view &&
      tuple['interaction'] == current.interaction;
}

Future<_Json> _transition(
  PatchMapController controller,
  double destination, {
  double? retarget,
  required List<_Json> cases,
}) async {
  final initial = _heights(controller);
  final rows = <_Json>[];
  final done = Completer<void>();
  var lastFrame = controller.debug.publication()['frameRevision'] as int;
  var active = true, didRetarget = false;
  var currentDestination = destination;
  var origin = initial.first;
  var phase = 'initial';
  final report = <String, dynamic>{
    'initialHeights': initial,
    'destination': destination,
    'retarget': retarget,
    'frames': rows,
    'completed': false,
  };
  cases.add(report);

  void observe(Duration _) {
    final frameNumber = ui.PlatformDispatcher.instance.frameData.frameNumber;
    // PatchMapView confirms its painted tuple in another post-frame callback.
    // A microtask observes the completed publication, without requesting a frame.
    scheduleMicrotask(() {
      if (!active) return;
      try {
        final debug = controller.debug.publication();
        final revision = debug['frameRevision'] as int;
        if (revision > lastFrame && _published(controller, debug)) {
          lastFrame = revision;
          final heights = _heights(controller);
          final value = heights.first;
          expect(heights, hasLength(_targets.length));
          for (final height in heights) expect(height, closeTo(value, 1e-7));
          final lower = origin < currentDestination
              ? origin
              : currentDestination;
          final upper = origin > currentDestination
              ? origin
              : currentDestination;
          expect(value, inInclusiveRange(lower - 1e-7, upper + 1e-7));
          final intermediate = value > lower + 1e-7 && value < upper - 1e-7;
          rows.add({
            'frameNumber': frameNumber,
            'frameRevision': revision,
            'phase': phase,
            'heights': heights,
            'intermediate': intermediate,
          });
          if (intermediate && retarget != null && !didRetarget) {
            didRetarget = true;
            phase = 'retarget';
            final result = _update(controller, retarget);
            expect(result.status, 'committed');
            origin = _heights(controller).first;
            // The current monotonic sample may be slightly ahead of the last
            // painted height, but must not reset to the old origin or new target.
            expect(origin, inInclusiveRange(value, destination));
            report['retargetStart'] = origin;
            currentDestination = retarget;
          } else if ((value - currentDestination).abs() < 1e-7) {
            if (retarget != null) expect(didRetarget, isTrue);
            expect(
              rows.any(
                (row) =>
                    row['phase'] == 'initial' && row['intermediate'] == true,
              ),
              isTrue,
              reason:
                  'The native surface must paint an intermediate height after idle',
            );
            if (retarget != null) {
              expect(
                rows.any(
                  (row) =>
                      row['phase'] == 'retarget' && row['intermediate'] == true,
                ),
                isTrue,
                reason:
                    'The interrupted transition must paint its new interpolation',
              );
            }
            report['completed'] = true;
            active = false;
            done.complete();
            return;
          }
        }
        SchedulerBinding.instance.addPostFrameCallback(observe);
      } catch (error, stack) {
        active = false;
        done.completeError(error, stack);
      }
    });
  }

  SchedulerBinding.instance.addPostFrameCallback(observe);
  try {
    expect(_update(controller, destination).status, 'committed');
    expect(_heights(controller), initial);
    await done.future.timeout(const Duration(seconds: 10));
    return report;
  } finally {
    active = false;
  }
}

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  binding.framePolicy = LiveTestWidgetsFlutterBindingFramePolicy.fullyLive;
  testWidgets(
    'native height animation publishes intermediate frames after idle',
    (tester) async {
      final dpr = binding.platformDispatcher.views.first.devicePixelRatio;
      final report = <String, dynamic>{
        'protocol': 'patch-map-native-height-animation/1',
        'platform': Platform.operatingSystem,
        'revision': const String.fromEnvironment('PATCHMAP_REVISION'),
        'devicePixelRatio': dpr,
        'scope':
            'Correctness on actual native Canvas frames; not a performance benchmark',
        'idleMilliseconds': 600,
        'durationMilliseconds': 200,
        'cases': <_Json>[],
        'completed': false,
      };
      binding.reportData = {'heightAnimation': report};
      final controller = (await tester.runAsync(
        () => PatchMap.create(
          data: [
            {
              'id': 'grid',
              'type': 'grid',
              'attrs': {'x': 20, 'y': 80},
              'cells': [
                [1, 1, 1, 1],
              ],
              'gap': {'x': 10, 'y': 0},
              'item': {
                'size': 30,
                'components': [
                  {
                    'id': 'bar',
                    'type': 'bar',
                    'size': {'width': 24, 'height': 20},
                    'source': {'type': 'rect', 'fill': '#287ac7'},
                    'animation': true,
                  },
                ],
              },
            },
          ],
          width: _width,
          height: _height,
          pixelRatio: dpr,
          fit: false,
          historyLimit: 0,
        ),
      ))!;
      try {
        await tester.pumpWidget(
          MediaQuery(
            data: MediaQueryData(
              devicePixelRatio: dpr,
              disableAnimations: false,
            ),
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
          ),
        );
        await tester.runAsync(() async {
          await controller.ready.timeout(const Duration(seconds: 15));
          final before = await controller.capture.png();
          // All waits are real elapsed time. No pump(Duration) or advanceFrame is
          // used between the command and any recorded native publication.
          await Future<void>.delayed(const Duration(milliseconds: 600));
          await _transition(
            controller,
            60,
            cases: report['cases'] as List<_Json>,
          );
          final after = await controller.capture.png();
          expect(after.dataUrl, isNot(before.dataUrl));
          expect(after.size, [_width, _height]);
          final png = base64Decode(after.dataUrl.split(',').last);
          expect(png.take(8), [137, 80, 78, 71, 13, 10, 26, 10]);
          report['capture'] = {
            'pngChanged': true,
            'pngBytes': png.length,
            'logicalSize': after.size,
          };
          await Future<void>.delayed(const Duration(milliseconds: 600));
          await _transition(
            controller,
            80,
            retarget: 10,
            cases: report['cases'] as List<_Json>,
          );
          expect(_heights(controller), List.filled(_targets.length, 10));
          expect(controller.history.state['depth'], 0);
          report['completed'] = true;
        });
      } finally {
        await controller.destroy();
        await tester.pumpWidget(const SizedBox.shrink());
      }
    },
    timeout: const Timeout(Duration(minutes: 1)),
  );
}
