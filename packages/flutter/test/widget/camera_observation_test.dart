import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'patch_map_view_test.dart' as support;

Widget host(
  PatchMapController controller, {
  ValueChanged<PatchMapCameraChange>? changed,
  ValueChanged<PatchMapPhase>? phase,
  bool active = true,
  Size size = const Size(400, 400),
  PatchMapGestureOptions gestures = const PatchMapGestureOptions(),
  PatchMapZoomLimits zoomLimits = const PatchMapZoomLimits(),
  PatchMapRotationAnimationOptions rotationAnimation =
      const PatchMapRotationAnimationOptions(),
}) => MediaQuery(
  data: MediaQueryData(size: size),
  child: Directionality(
    textDirection: TextDirection.ltr,
    child: Center(
      child: SizedBox.fromSize(
        size: size,
        child: PatchMapView(
          controller: controller,
          active: active,
          onCameraChanged: changed,
          gestures: gestures,
          zoomLimits: zoomLimits,
          rotationAnimation: rotationAnimation,
          onPhaseChanged: (value, _) => phase?.call(value),
        ),
      ),
    ),
  ),
);

Future<void> draw(WidgetTester tester, PatchMapController controller) async {
  final result = controller.draw(support.rectangle('a'));
  await support.progress(tester);
  expect((await result).outcome, PatchMapOutcome.applied);
}

void main() {
  testWidgets('snapshot is current, immutable and notifications coalesce', (
    tester,
  ) async {
    final controller = PatchMapController();
    final changes = <PatchMapCameraChange>[];
    expect(controller.camera, isNull);
    await tester.pumpWidget(host(controller, changed: changes.add));
    expect(controller.camera, isNull);
    await draw(tester, controller);
    expect(changes.single.sources, {PatchMapCameraChangeSource.replacement});
    final before = controller.camera!;
    expect(identical(before, controller.camera), isTrue);
    changes.clear();
    for (var i = 1; i <= 100; i++) {
      controller.setCamera(center: Offset(i.toDouble(), 70), scale: 2);
    }
    controller.setCamera(rotation: .7);
    expect(changes, isEmpty);
    expect(controller.camera!.center, const Offset(100, 70));
    expect(controller.camera!.rotation, .7);
    expect(before.center, const Offset(50, 50));
    await tester.pump();
    expect(changes.single.state, controller.camera);
    expect(changes.single.sources, {PatchMapCameraChangeSource.programmatic});
    expect(() => changes.single.sources.clear(), throwsUnsupportedError);
    changes.clear();
    final current = controller.camera!;
    controller.setCamera(center: const Offset(20, 30));
    controller.setCamera(center: current.center);
    controller.setCamera(scale: current.scale);
    expect(controller.setCamera(scale: 0).outcome, PatchMapOutcome.rejected);
    await tester.pump();
    expect(changes, isEmpty, reason: 'no net change, no-op and invalid inputs');
    expect(tester.binding.hasScheduledFrame, isFalse);
    final update = controller.updateValues(const [
      PatchMapUpdate(PatchMapTarget('a'), {'fill': '#00ff00'}),
    ]);
    await support.progress(tester);
    expect((await update).outcome, PatchMapOutcome.applied);
    expect(changes, isEmpty, reason: 'data repaint does not change the camera');
    expect(controller.camera!.rotation, current.rotation);
    await tester.pumpWidget(const SizedBox());
    expect(controller.camera, isNull);
  });

  testWidgets('pan, wheel and pinch report actual gesture changes', (
    tester,
  ) async {
    final controller = PatchMapController();
    final changes = <PatchMapCameraChange>[];
    await tester.pumpWidget(host(controller, changed: changes.add));
    await draw(tester, controller);
    controller.setCamera(center: Offset.zero, scale: 1, rotation: 0);
    await tester.pump();
    changes.clear();
    final center = tester.getCenter(find.byType(PatchMapView));
    final pan = await tester.startGesture(center);
    await pan.moveTo(center + const Offset(30, 0));
    await pan.moveTo(center + const Offset(40, 0));
    expect(changes, isEmpty);
    await tester.pump();
    expect(changes.single.state.center, const Offset(-40, 0));
    expect(changes.single.sources, {PatchMapCameraChangeSource.gesture});
    await pan.up();
    await tester.pumpAndSettle();
    changes.clear();
    await tester.sendEventToBinding(
      PointerScrollEvent(position: center, scrollDelta: const Offset(0, -50)),
    );
    // A following app command must not hide that the user also changed it.
    controller.setCamera(rotation: .2);
    await tester.pump();
    expect(changes.single.sources, {
      PatchMapCameraChangeSource.gesture,
      PatchMapCameraChangeSource.programmatic,
    });
    expect(changes.single.state.scale, closeTo(1.1, 1e-9));
    changes.clear();
    final a = await tester.startGesture(
      center - const Offset(40, 0),
      pointer: 1,
    );
    final b = await tester.startGesture(
      center + const Offset(40, 0),
      pointer: 2,
    );
    await a.moveTo(center - const Offset(70, 15));
    await b.moveTo(center + const Offset(70, 15));
    await a.moveTo(center - const Offset(95, 40));
    await b.moveTo(center + const Offset(95, 40));
    await a.moveTo(center - const Offset(110, 60));
    await b.moveTo(center + const Offset(110, 60));
    // Move beyond the 25-degree rotation threshold after zoom activates.
    await a.moveTo(center - const Offset(110, 100));
    await b.moveTo(center + const Offset(110, 100));
    await a.moveTo(center - const Offset(100, 130));
    await b.moveTo(center + const Offset(100, 130));
    await tester.pump();
    expect(changes.single.sources, {PatchMapCameraChangeSource.gesture});
    expect(changes.single.state.scale, greaterThan(1.1));
    expect(changes.single.state.rotation, isNot(.2));
    await a.up();
    await b.up();
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('fit, focus and resize preserve rotation and name their causes', (
    tester,
  ) async {
    final controller = PatchMapController();
    final changes = <PatchMapCameraChange>[];
    await tester.pumpWidget(host(controller, changed: changes.add));
    await draw(tester, controller);
    controller.setCamera(center: Offset.zero, scale: 1, rotation: .4);
    await tester.pump();
    changes.clear();
    controller.focus(['a']);
    await tester.pump();
    expect(changes.single.sources, {PatchMapCameraChangeSource.focus});
    expect(changes.single.state.scale, 1);
    changes.clear();
    controller.fit();
    await tester.pump();
    expect(changes.single.sources, {PatchMapCameraChangeSource.fit});
    expect(changes.single.state.rotation, .4);
    final before = controller.camera!;
    changes.clear();
    await tester.pumpWidget(
      host(controller, changed: changes.add, size: const Size(300, 350)),
    );
    expect(changes.single.sources, {PatchMapCameraChangeSource.resize});
    expect(changes.single.state.viewportSize, const Size(300, 350));
    expect(changes.single.state.center, before.center);
    expect(changes.single.state.scale, before.scale);
    expect(changes.single.state.rotation, before.rotation);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
    'callback reentry waits for next frame and failures are isolated',
    (tester) async {
      final controller = PatchMapController();
      final changes = <PatchMapCameraChange>[];
      var reenter = false;
      await tester.pumpWidget(
        host(
          controller,
          changed: (change) {
            changes.add(change);
            if (reenter) {
              reenter = false;
              controller.setCamera(rotation: .9);
              throw StateError('host callback failed');
            }
          },
        ),
      );
      await draw(tester, controller);
      changes.clear();
      reenter = true;
      controller.setCamera(rotation: .5);
      await tester.pump();
      expect(tester.takeException(), isStateError);
      expect(changes.single.state.rotation, .5);
      expect(controller.camera!.rotation, .9);
      await tester.pump();
      expect(changes.length, 2);
      expect(changes.last.state.rotation, .9);
      expect(tester.binding.hasScheduledFrame, isFalse);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'replacement drops old pending causes, invalid draw preserves them',
    (tester) async {
      final controller = PatchMapController();
      final changes = <PatchMapCameraChange>[];
      await tester.pumpWidget(host(controller, changed: changes.add));
      await draw(tester, controller);
      changes.clear();
      controller.setCamera(scale: 2, rotation: .6);
      final invalid = await controller.draw([
        {'type': 'invalid'},
      ]);
      expect(invalid.outcome, PatchMapOutcome.rejected);
      expect(controller.camera!.rotation, .6);
      await tester.pump();
      expect(changes.single.sources, {PatchMapCameraChangeSource.programmatic});
      changes.clear();
      controller.setCamera(center: const Offset(700, 800));
      final replacement = controller.draw([
        {
          ...support.rectangle('new').single,
          'size': {'width': 200, 'height': 100},
          'attrs': {'x': 200, 'y': 100},
        },
      ]);
      expect(controller.camera, isNull);
      await support.progress(tester);
      expect((await replacement).outcome, PatchMapOutcome.applied);
      expect(changes.single.sources, {PatchMapCameraChangeSource.replacement});
      expect(changes.single.state.center, const Offset(300, 150));
      expect(changes.single.state.rotation, 0);
      expect(changes.single.state.scale, closeTo(1.88, 1e-9));
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'ready callback replacement does not deliver stale camera state',
    (tester) async {
      final controller = PatchMapController();
      final changes = <PatchMapCameraChange>[];
      Future<PatchMapResult>? second;
      await tester.pumpWidget(
        host(
          controller,
          changed: changes.add,
          phase: (phase) {
            if (phase == PatchMapPhase.ready && second == null) {
              second = controller.draw([
                {
                  ...support.rectangle('new').single,
                  'attrs': {'x': 200},
                },
              ]);
            }
          },
        ),
      );
      await draw(tester, controller);
      await support.progress(tester);
      expect((await second!).outcome, PatchMapOutcome.applied);
      expect(changes.single.state.center, const Offset(250, 50));
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'replacement reports adopted state even when fitting is a no-op',
    (tester) async {
      final controller = PatchMapController();
      final changes = <PatchMapCameraChange>[];
      await tester.pumpWidget(host(controller, changed: changes.add));
      await draw(tester, controller);
      changes.clear();
      controller.setCamera(center: Offset.zero, scale: 1);
      final replacement = controller.draw(const []);
      await support.progress(tester);
      expect((await replacement).outcome, PatchMapOutcome.applied);
      expect(changes.single.state.center, Offset.zero);
      expect(changes.single.state.scale, 1);
      expect(changes.single.sources, {PatchMapCameraChangeSource.replacement});
      changes.clear();
      final same = controller.draw(const []);
      await support.progress(tester);
      await same;
      expect(
        changes,
        isEmpty,
        reason: 'identical adopted state is still quiet',
      );
      controller.setCamera(rotation: .9);
      await tester.pump();
      changes.clear();
      final empty = controller.draw(const []);
      await support.progress(tester);
      expect((await empty).outcome, PatchMapOutcome.applied);
      expect(changes.single.sources, {PatchMapCameraChangeSource.replacement});
      expect(changes.single.state.rotation, 0);
      expect(changes.single.state.center, Offset.zero);
      expect(changes.single.state.scale, 1);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'inactivity, subscription changes and reattachment do not replay',
    (tester) async {
      final controller = PatchMapController();
      final changes = <PatchMapCameraChange>[];
      await tester.pumpWidget(host(controller, changed: changes.add));
      await draw(tester, controller);
      changes.clear();
      controller.setCamera(rotation: .3);
      await tester.pumpWidget(
        host(controller, changed: changes.add, active: false),
      );
      expect(changes, isEmpty);
      expect(controller.camera!.rotation, .3);
      expect(
        controller.setCamera(rotation: .5).outcome,
        PatchMapOutcome.rejected,
      );
      await tester.pumpWidget(host(controller, changed: changes.add));
      await tester.pump();
      expect(changes.single.state.rotation, .3);
      changes.clear();
      controller.setCamera(rotation: .6);
      await tester.pumpWidget(host(controller));
      await tester.pumpWidget(host(controller, changed: changes.add));
      expect(
        changes,
        isEmpty,
        reason: 'subscribing does not replay old changes',
      );
      controller.setCamera(rotation: .8);
      await tester.pumpWidget(const SizedBox());
      expect(changes, isEmpty);
      expect(controller.camera, isNull);
      await tester.pumpWidget(host(controller, changed: changes.add));
      expect(controller.camera, isNull);
      await draw(tester, controller);
      expect(changes.single.state.rotation, 0);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
