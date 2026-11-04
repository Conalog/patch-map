import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'camera_observation_test.dart' show host, draw;
import 'patch_map_view_test.dart' as support;
import 'stroke_compatibility_test.dart' show pixels;

const slow = PatchMapRotationAnimationOptions(duration: Duration(seconds: 5));

Future<void> step(WidgetTester tester) async {
  await tester.pump();
  await tester.runAsync(
    () => Future<void>.delayed(const Duration(milliseconds: 25)),
  );
  await tester.pump();
}

void main() {
  testWidgets(
    'rotation accepts before travel, shares notifications and updates; live off applies target',
    (tester) async {
      final controller = PatchMapController(),
          changes = <PatchMapCameraChange>[];
      await tester.pumpWidget(
        host(controller, rotationAnimation: slow, changed: changes.add),
      );
      await draw(tester, controller);
      controller.select(['a']);
      await tester.pump();
      final before = controller.camera!;
      final beforePixels = await pixels(tester);
      changes.clear();
      expect(controller.rotateTo(2).outcome, PatchMapOutcome.applied);
      expect(controller.camera!.rotation, before.rotation);
      await step(tester);
      expect(controller.camera!.rotation, allOf(greaterThan(0), lessThan(2)));
      expect(changes, isNotEmpty);
      expect(await pixels(tester), isNot(equals(beforePixels)));
      expect(changes.last.sources, {PatchMapCameraChangeSource.programmatic});
      final update = controller.updateValues([
        const PatchMapUpdate(PatchMapTarget('a'), {'fill': '#00ff00'}),
      ]);
      await support.progress(tester);
      expect((await update).outcome, PatchMapOutcome.applied);
      expect(
        controller.camera!.rotation,
        lessThan(2),
        reason: 'value submission does not wait for rotation',
      );
      expect(controller.camera!.center, before.center);
      expect(controller.camera!.scale, before.scale);
      expect(controller.selected.single.id, 'a');
      await tester.pumpWidget(
        host(
          controller,
          rotationAnimation: const PatchMapRotationAnimationOptions(
            enabled: false,
          ),
          changed: changes.add,
        ),
      );
      expect(controller.camera!.rotation, 2);
      await tester.pump();
      expect(tester.binding.hasScheduledFrame, isFalse);
      controller.rotateTo(.3);
      expect(controller.camera!.rotation, .3);
      await tester.pump();
      expect(tester.binding.hasScheduledFrame, isFalse);
      await tester.pumpWidget(const SizedBox());
      expect(controller.rotateTo(0).failures.single.code, 'DETACHED');
    },
  );

  testWidgets('new touch, wheel and immediate commands terminate rotation', (
    tester,
  ) async {
    final controller = PatchMapController();
    await tester.pumpWidget(host(controller, rotationAnimation: slow));
    await draw(tester, controller);
    for (final kind in ['touch', 'wheel', 'command']) {
      controller.setCamera(rotation: 0);
      controller.rotateTo(2);
      await step(tester);
      final center = tester.getCenter(find.byType(PatchMapView));
      if (kind == 'touch') {
        final gesture = await tester.startGesture(center);
        await gesture.up();
        await tester.pump(const Duration(milliseconds: 350));
      } else if (kind == 'wheel') {
        await tester.sendEventToBinding(
          PointerScrollEvent(
            position: center,
            scrollDelta: const Offset(0, -20),
          ),
        );
      } else {
        controller.setCamera(rotation: .4);
        expect(controller.camera!.rotation, .4);
      }
      final angle = controller.camera!.rotation;
      await step(tester);
      expect(controller.camera!.rotation, angle);
    }
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('inactive, replacement and removal never replay old travel', (
    tester,
  ) async {
    final controller = PatchMapController();
    await tester.pumpWidget(host(controller, rotationAnimation: slow));
    await draw(tester, controller);
    controller.rotateTo(2);
    await step(tester);
    await tester.pumpWidget(
      host(controller, rotationAnimation: slow, active: false),
    );
    final paused = controller.camera!.rotation;
    expect(controller.rotateTo(0).outcome, PatchMapOutcome.rejected);
    await tester.pumpWidget(host(controller, rotationAnimation: slow));
    await step(tester);
    expect(controller.camera!.rotation, paused);
    controller.rotateTo(2);
    await step(tester);
    final replacement = controller.draw(support.rectangle('b'));
    expect(controller.rotateTo(0).outcome, PatchMapOutcome.rejected);
    await support.progress(tester);
    await replacement;
    await step(tester);
    expect(controller.camera!.rotation, 0);
    controller.rotateTo(1);
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(host(controller));
    await draw(tester, controller);
    expect(controller.camera!.rotation, 0);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
    'natural completion stops scheduling and invalid input keeps current travel',
    (tester) async {
      final controller = PatchMapController();
      const fast = PatchMapRotationAnimationOptions(
        duration: Duration(milliseconds: 40),
      );
      await tester.pumpWidget(
        host(
          controller,
          rotationAnimation: const PatchMapRotationAnimationOptions(
            duration: Duration(milliseconds: -1),
          ),
        ),
      );
      expect(tester.takeException(), isArgumentError);
      expect(controller.isAttached, isFalse);
      await tester.pumpWidget(const SizedBox());
      await tester.pumpWidget(host(controller, rotationAnimation: fast));
      await draw(tester, controller);
      controller.rotateTo(1);
      expect(
        controller.rotateTo(double.infinity).outcome,
        PatchMapOutcome.rejected,
      );
      expect(
        (await controller.draw([
          {'type': 'invalid'},
        ])).outcome,
        PatchMapOutcome.rejected,
      );
      await tester.pump();
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 60)),
      );
      await tester.pump();
      expect(controller.camera!.rotation, 1);
      expect(tester.binding.hasScheduledFrame, isFalse);
      final completedPixels = await pixels(tester);
      controller.setCamera(rotation: 0);
      await tester.pump();
      controller.setCamera(rotation: 1);
      await tester.pump();
      expect(
        await pixels(tester),
        completedPixels,
        reason: 'animated completion matches immediate camera output',
      );
      await tester.pumpWidget(
        host(
          controller,
          rotationAnimation: const PatchMapRotationAnimationOptions(
            duration: Duration(milliseconds: -1),
          ),
        ),
      );
      expect(tester.takeException(), isArgumentError);
      controller.rotateTo(2);
      expect(controller.camera!.rotation, 1);
      await tester.pumpWidget(
        host(
          controller,
          rotationAnimation: const PatchMapRotationAnimationOptions(
            enabled: false,
          ),
        ),
      );
      expect(controller.camera!.rotation, 2);
      await tester.pumpWidget(const SizedBox());
      expect(tester.takeException(), isNull);
    },
  );
}
