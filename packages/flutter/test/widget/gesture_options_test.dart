import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'camera_observation_test.dart' show host, draw;
import 'patch_map_view_test.dart' as support;

Future<(TestGesture, TestGesture)> pinch(WidgetTester tester) async {
  final center = tester.getCenter(find.byType(PatchMapView));
  final a = await tester.startGesture(center - const Offset(35, 0), pointer: 1);
  final b = await tester.startGesture(center + const Offset(35, 0), pointer: 2);
  await a.moveTo(center - const Offset(70, 20));
  await b.moveTo(center + const Offset(70, 20));
  // The crossing sample arms each axis; subsequent motion changes the camera.
  await a.moveTo(center - const Offset(90, 35));
  await b.moveTo(center + const Offset(90, 35));
  await tester.pump();
  return (a, b);
}

Future<void> release(
  WidgetTester tester,
  (TestGesture, TestGesture) pair,
) async {
  await pair.$1.up();
  await pair.$2.up();
  await tester.pump(const Duration(milliseconds: 350));
}

void main() {
  testWidgets('invalid initial limits can be removed and remounted cleanly', (
    tester,
  ) async {
    final controller = PatchMapController();
    for (final invalid in const [
      PatchMapZoomLimits(minScale: 0),
      PatchMapZoomLimits(minScale: 1e200),
    ]) {
      await tester.pumpWidget(host(controller, zoomLimits: invalid));
      expect(tester.takeException(), isArgumentError);
      expect(controller.isAttached, isFalse);
      await tester.pumpWidget(const SizedBox());
      expect(tester.takeException(), isNull);
    }
    await tester.pumpWidget(host(controller));
    await draw(tester, controller);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('invalid limit rebuild preserves camera, attachment and limits', (
    tester,
  ) async {
    final controller = PatchMapController();
    await tester.pumpWidget(
      host(controller, zoomLimits: const PatchMapZoomLimits(maxScale: 2)),
    );
    await draw(tester, controller);
    final before = controller.camera!;
    await tester.pumpWidget(
      host(controller, zoomLimits: const PatchMapZoomLimits(minScale: 1e200)),
    );
    expect(tester.takeException(), isArgumentError);
    expect(controller.isAttached, isTrue);
    expect(controller.camera, before);
    controller.setCamera(scale: 99);
    expect(controller.camera!.scale, 2);
    await tester.pumpWidget(const SizedBox());
    expect(tester.takeException(), isNull);
    expect(controller.isAttached, isFalse);
  });

  testWidgets(
    'throwing error reporter does not interrupt invalid limit rebuild',
    (tester) async {
      final controller = PatchMapController();
      await tester.pumpWidget(
        host(controller, zoomLimits: const PatchMapZoomLimits(maxScale: 2)),
      );
      await draw(tester, controller);
      final before = controller.camera!;
      final previousReporter = FlutterError.onError;
      Object? reported;
      FlutterError.onError = (details) {
        reported = details.exception;
        throw StateError('host error reporter failed');
      };
      try {
        await tester.pumpWidget(
          host(
            controller,
            zoomLimits: const PatchMapZoomLimits(minScale: 1e200),
          ),
        );
      } finally {
        FlutterError.onError = previousReporter;
      }
      expect(reported, isArgumentError);
      expect(controller.camera, before);
      expect(controller.isAttached, isTrue);
      controller.setCamera(scale: 99);
      expect(controller.camera!.scale, 2);
      await tester.pumpWidget(const SizedBox());
      expect(tester.takeException(), isNull);
      expect(controller.isAttached, isFalse);
    },
  );

  for (final (zoom, rotate) in [(true, false), (false, true), (false, false)]) {
    testWidgets(
      'zoom=$zoom rotation=$rotate gates input, not commands or pan',
      (tester) async {
        final controller = PatchMapController();
        await tester.pumpWidget(
          host(
            controller,
            gestures: PatchMapGestureOptions(
              zoomEnabled: zoom,
              rotationEnabled: rotate,
            ),
          ),
        );
        await draw(tester, controller);
        controller.setCamera(center: Offset.zero, scale: 1, rotation: .3);
        await tester.pump();
        final pair = await pinch(tester);
        expect(controller.camera!.scale, zoom ? greaterThan(1) : 1);
        expect(controller.camera!.rotation, rotate ? isNot(.3) : .3);
        final beforePan = controller.camera!.center;
        final center = tester.getCenter(find.byType(PatchMapView));
        await pair.$1.moveTo(
          center - const Offset(70, 20) + const Offset(25, 12),
        );
        await pair.$2.moveTo(
          center + const Offset(70, 20) + const Offset(25, 12),
        );
        expect(controller.camera!.center, isNot(beforePan));
        await release(tester, pair);
        expect(
          controller.setCamera(scale: 2, rotation: .7).outcome,
          PatchMapOutcome.applied,
        );
        expect(controller.camera!.scale, 2);
        expect(controller.camera!.rotation, .7);
        await tester.pumpWidget(const SizedBox());
      },
    );
  }

  testWidgets('changed permissions apply to the next touch gesture', (
    tester,
  ) async {
    final controller = PatchMapController();
    await tester.pumpWidget(host(controller));
    await draw(tester, controller);
    controller.setCamera(scale: 1, rotation: 0);
    await tester.pump();
    final pair = await pinch(tester);
    final before = controller.camera!;
    await tester.pumpWidget(
      host(
        controller,
        gestures: const PatchMapGestureOptions(
          zoomEnabled: false,
          rotationEnabled: false,
        ),
      ),
    );
    final center = tester.getCenter(find.byType(PatchMapView));
    await pair.$1.moveTo(center - const Offset(110, 55));
    await pair.$2.moveTo(center + const Offset(110, 55));
    expect(controller.camera!.scale, greaterThan(before.scale));
    expect(controller.camera!.rotation, isNot(before.rotation));
    await release(tester, pair);
    final stopped = controller.camera!;
    final next = await pinch(tester);
    expect(controller.camera!.scale, stopped.scale);
    expect(controller.camera!.rotation, stopped.rotation);
    await release(tester, next);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('disabled wheel is available to parent scroll handling', (
    tester,
  ) async {
    final controller = PatchMapController();
    var parentEvents = 0;
    Widget wrapped(bool enabled) => Listener(
      onPointerSignal: (event) => GestureBinding.instance.pointerSignalResolver
          .register(event, (_) => parentEvents++),
      child: host(
        controller,
        gestures: PatchMapGestureOptions(zoomEnabled: enabled),
      ),
    );
    await tester.pumpWidget(wrapped(false));
    await draw(tester, controller);
    final before = controller.camera!;
    final center = tester.getCenter(find.byType(PatchMapView));
    await tester.sendEventToBinding(
      PointerScrollEvent(position: center, scrollDelta: const Offset(0, -50)),
    );
    expect(controller.camera, before);
    expect(parentEvents, 1);
    await tester.pumpWidget(wrapped(true));
    await tester.sendEventToBinding(
      PointerScrollEvent(position: center, scrollDelta: const Offset(0, -.5)),
    );
    expect(controller.camera!.scale, closeTo(before.scale * 1.001, 1e-12));
    expect(parentEvents, 1);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('limits cover first fit, commands, wheel and runtime changes', (
    tester,
  ) async {
    final controller = PatchMapController();
    final changes = <PatchMapCameraChange>[];
    await tester.pumpWidget(
      host(
        controller,
        changed: changes.add,
        zoomLimits: const PatchMapZoomLimits(minScale: .5, maxScale: 2),
      ),
    );
    await draw(tester, controller);
    expect(controller.camera!.scale, 2);
    controller.setCamera(scale: .1, rotation: .4);
    expect(controller.camera!.scale, .5);
    controller.setCamera(scale: 8);
    expect(controller.camera!.scale, 2);
    final pair = await pinch(tester);
    expect(controller.camera!.scale, 2);
    await release(tester, pair);
    final center = tester.getCenter(find.byType(PatchMapView));
    await tester.sendEventToBinding(
      PointerScrollEvent(position: center, scrollDelta: const Offset(0, 499)),
    );
    expect(controller.camera!.scale, .5);
    controller.fit();
    expect(controller.camera!.scale, 2);
    await tester.pump();
    final before = controller.camera!;
    changes.clear();
    await tester.pumpWidget(
      host(
        controller,
        changed: changes.add,
        zoomLimits: const PatchMapZoomLimits(maxScale: 1),
      ),
    );
    await tester.pump();
    expect(controller.camera!.scale, 1);
    expect(controller.camera!.center, before.center);
    expect(controller.camera!.rotation, before.rotation);
    expect(changes.single.sources, {PatchMapCameraChangeSource.configuration});
    await tester.pumpWidget(host(controller));
    controller.setCamera(scale: 8);
    expect(
      controller.camera!.scale,
      8,
      reason: 'removing limits restores freedom',
    );
    final replacement = controller.draw(support.rectangle('new'));
    await support.progress(tester);
    await replacement;
    await tester.pumpWidget(const SizedBox());
  });
}
