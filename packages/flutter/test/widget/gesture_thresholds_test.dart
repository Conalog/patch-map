import 'dart:math' as math;

import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'camera_observation_test.dart' show host, draw;

void main() {
  testWidgets(
    'crossing samples stay still; subsequent deltas preserve anchor',
    (tester) async {
      final controller = PatchMapController();
      final changes = <PatchMapCameraChange>[];
      await tester.pumpWidget(host(controller, changed: changes.add));
      await draw(tester, controller);
      controller.setCamera(
        center: const Offset(50, 60),
        scale: 2,
        rotation: .3,
      );
      await tester.pump();
      changes.clear();
      const anchor = Offset(140, 160);
      final global = tester.getTopLeft(find.byType(PatchMapView)) + anchor;
      final a = await tester.startGesture(
        global - const Offset(35, 0),
        pointer: 1,
      );
      final b = await tester.startGesture(
        global + const Offset(35, 0),
        pointer: 2,
      );
      final detector = tester.widget<GestureDetector>(
        find.descendant(
          of: find.byType(PatchMapView),
          matching: find.byType(GestureDetector),
        ),
      );
      // Real pointer admission + controlled recognizer output isolates our
      // threshold from Flutter's separate touch slop. Other widget tests drive
      // actual two-pointer moves through the recognizer as well.
      detector.onScaleStart!(
        ScaleStartDetails(
          focalPoint: global,
          localFocalPoint: anchor,
          pointerCount: 2,
        ),
      );
      void sample(double scale, double degrees) => detector.onScaleUpdate!(
        ScaleUpdateDetails(
          focalPoint: global,
          localFocalPoint: anchor,
          pointerCount: 2,
          scale: scale,
          rotation: degrees * math.pi / 180,
        ),
      );
      final before = controller.camera!;
      final world = controller.toWorld(anchor)!;
      sample(1.019, 4.9);
      expect(controller.camera, before);
      sample(1.03, 6);
      expect(
        controller.camera,
        before,
        reason: 'crossing overshoot is discarded',
      );
      await tester.pump();
      expect(changes, isEmpty);
      sample(1.06, 8);
      expect(controller.camera!.scale, closeTo(2 * 1.06 / 1.03, 1e-12));
      expect(
        controller.camera!.rotation,
        closeTo(.3 + 2 * math.pi / 180, 1e-12),
      );
      expect((controller.toWorld(anchor)! - world).distance, lessThan(1e-9));
      await tester.pump();
      expect(changes.single.sources, {PatchMapCameraChangeSource.gesture});
      sample(1.01, 4);
      expect(controller.camera!.scale, closeTo(2 * 1.01 / 1.03, 1e-12));
      expect(
        controller.camera!.rotation,
        closeTo(.3 - 2 * math.pi / 180, 1e-12),
      );
      expect((controller.toWorld(anchor)! - world).distance, lessThan(1e-9));
      await a.up();
      await b.up();
      await tester.pump(const Duration(milliseconds: 350));
      await tester.pumpWidget(const SizedBox());
    },
  );
}
