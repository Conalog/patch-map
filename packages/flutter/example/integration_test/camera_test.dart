import 'dart:math' as math;

import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'runtime_test.dart' show pixels, submitted;

const scene = [
  {
    'type': 'rect',
    'id': 'panel',
    'size': {'width': 100, 'height': 80},
    'attrs': {'x': 10, 'y': 20},
    'fill': '#ff0000',
  },
];

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('native camera notifications match rendered transforms', (
    tester,
  ) async {
    final controller = PatchMapController(), key = GlobalKey();
    final changes = <PatchMapCameraChange>[];
    final deliveryFrames = <Duration>[];
    var active = true, reenter = false;
    var gestures = const PatchMapGestureOptions();
    var zoomLimits = const PatchMapZoomLimits();
    Widget host() => MediaQuery(
      data: const MediaQueryData(size: Size(300, 240)),
      child: Directionality(
        textDirection: TextDirection.ltr,
        child: Center(
          child: RepaintBoundary(
            key: key,
            child: SizedBox(
              width: 300,
              height: 240,
              child: PatchMapView(
                controller: controller,
                active: active,
                gestures: gestures,
                zoomLimits: zoomLimits,
                onCameraChanged: (change) {
                  changes.add(change);
                  deliveryFrames.add(
                    SchedulerBinding.instance.currentFrameTimeStamp,
                  );
                  expectSync(change.state, controller.camera);
                  if (reenter) {
                    reenter = false;
                    controller.setCamera(rotation: .8);
                  }
                },
              ),
            ),
          ),
        ),
      ),
    );
    Future<void> verifyInk(PatchMapCameraState state) async {
      // Independent projection from the public state into native readback.
      // Three known points lie inside the red shape, away from AA edges.
      final raw = await pixels(key);
      for (final world in const [
        Offset(30, 40),
        Offset(60, 60),
        Offset(90, 80),
      ]) {
        final delta = world - state.center;
        final x =
            (150 +
                    state.scale *
                        (math.cos(state.rotation) * delta.dx -
                            math.sin(state.rotation) * delta.dy))
                .floor();
        final y =
            (120 +
                    state.scale *
                        (math.sin(state.rotation) * delta.dx +
                            math.cos(state.rotation) * delta.dy))
                .floor();
        expect(x, inInclusiveRange(0, 299));
        expect(y, inInclusiveRange(0, 239));
        final offset = (y * 300 + x) * 4;
        expect(raw.sublist(offset, offset + 4), [255, 0, 0, 255]);
      }
    }

    await tester.pumpWidget(host());
    expect(controller.camera, isNull);
    expect(
      (await submitted(tester, controller.draw(scene))).outcome,
      PatchMapOutcome.applied,
    );
    await tester.pumpAndSettle();
    expect(changes.single.sources, {PatchMapCameraChangeSource.replacement});
    changes.clear();
    for (var i = 1; i <= 100; i++) {
      controller.setCamera(center: const Offset(60, 60), scale: 1 + i / 1000);
    }
    controller.setCamera(rotation: .4);
    expect(changes, isEmpty);
    await tester.pumpAndSettle();
    expect(changes.single.sources, {PatchMapCameraChangeSource.programmatic});
    expect(changes.single.state.scale, 1.1);
    await verifyInk(changes.single.state);
    final before = await pixels(key);
    changes.clear();
    final center = tester.getCenter(find.byType(PatchMapView));
    final pan = await tester.startGesture(center);
    await pan.moveTo(center + const Offset(30, 12));
    await pan.up();
    await tester.pumpAndSettle();
    expect(changes, isNotEmpty);
    expect(
      changes.every(
        (e) => e.sources.contains(PatchMapCameraChangeSource.gesture),
      ),
      isTrue,
    );
    await verifyInk(controller.camera!);
    expect(await pixels(key), isNot(orderedEquals(before)));

    controller.setCamera(center: const Offset(60, 60), scale: 1, rotation: 0);
    await tester.pumpAndSettle();
    changes.clear();
    final a = await tester.startGesture(
      center - const Offset(35, 0),
      pointer: 1,
    );
    final b = await tester.startGesture(
      center + const Offset(35, 0),
      pointer: 2,
    );
    await a.moveTo(center - const Offset(70, 20));
    await b.moveTo(center + const Offset(70, 20));
    await a.up();
    await b.up();
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pumpAndSettle();
    expect(changes, isNotEmpty);
    expect(changes.last.state.scale, greaterThan(1));
    expect(changes.last.state.rotation.abs(), greaterThan(.01));
    await verifyInk(controller.camera!);

    changes.clear();
    reenter = true;
    controller.setCamera(rotation: .6);
    await tester.pumpAndSettle();
    expect(changes.map((e) => e.state.rotation).toList(), [.6, .8]);
    expect(
      deliveryFrames.toSet().length,
      deliveryFrames.length,
      reason: 'No two camera notifications in one frame',
    );
    changes.clear();
    controller.setCamera(rotation: .8);
    await tester.pumpAndSettle();
    expect(changes, isEmpty);

    gestures = const PatchMapGestureOptions(
      zoomEnabled: false,
      rotationEnabled: false,
    );
    zoomLimits = const PatchMapZoomLimits(minScale: 1, maxScale: 2);
    await tester.pumpWidget(host());
    controller.setCamera(center: const Offset(60, 60), scale: 1, rotation: .2);
    await tester.pumpAndSettle();
    final lockedA = await tester.startGesture(
      center - const Offset(35, 0),
      pointer: 1,
    );
    final lockedB = await tester.startGesture(
      center + const Offset(35, 0),
      pointer: 2,
    );
    await lockedA.moveTo(center - const Offset(70, 20));
    await lockedB.moveTo(center + const Offset(70, 20));
    await lockedA.up();
    await lockedB.up();
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pumpAndSettle();
    expect(controller.camera!.scale, 1);
    expect(controller.camera!.rotation, .2);
    await verifyInk(controller.camera!);
    controller.setCamera(scale: 99, rotation: .8);
    await tester.pumpAndSettle();
    expect(controller.camera!.scale, 2);
    expect(controller.camera!.rotation, .8);
    controller.fit();
    await tester.pumpAndSettle();
    expect(controller.camera!.scale, 2);
    await verifyInk(controller.camera!);
    gestures = const PatchMapGestureOptions();
    zoomLimits = const PatchMapZoomLimits();
    await tester.pumpWidget(host());
    changes.clear();

    controller.setCamera(rotation: .9);
    active = false;
    await tester.pumpWidget(host());
    expect(changes, isEmpty);
    expect(controller.camera!.rotation, .9);
    active = true;
    await tester.pumpWidget(host());
    await tester.pumpAndSettle();
    expect(changes.single.state.rotation, .9);

    changes.clear();
    controller.setCamera(center: Offset.zero, scale: 1);
    final replacement = controller.draw(const []);
    expect(controller.camera, isNull);
    expect(
      (await submitted(tester, replacement)).outcome,
      PatchMapOutcome.applied,
    );
    await tester.pumpAndSettle();
    expect(changes.single.sources, {PatchMapCameraChangeSource.replacement});
    expect(changes.single.state.center, Offset.zero);
    expect(changes.single.state.scale, 1);
    expect(changes.single.state.rotation, .9);
    changes.clear();
    controller.setCamera(rotation: 1);
    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
    expect(changes, isEmpty);
    expect(controller.camera, isNull);
    expect(tester.takeException(), isNull);
  });
}
