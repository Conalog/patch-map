import 'dart:math' as math;

import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:conalog_patch_map/src/interaction/touch_camera_gesture.dart';
import 'package:flutter_test/flutter_test.dart';

double radians(double degrees) => degrees * (math.pi / 180);

TouchCameraGesture begin([
  PatchMapGestureOptions options = const PatchMapGestureOptions(),
]) => TouchCameraGesture()..start(options, cameraScale: 2, cameraRotation: .4);

void sample(
  TouchCameraGesture gesture, {
  double factor = 1,
  double degrees = 0,
  double scale = 2,
  double? rotation,
}) => gesture.update(
  factor: factor,
  angle: radians(degrees),
  currentScale: scale,
  currentRotation: rotation ?? gesture.rotation,
);

void main() {
  test(
    'simultaneous base crossings activate both without applying overshoot',
    () {
      final gesture = begin();
      sample(gesture, factor: 1.019, degrees: 14.9);
      expect(gesture.scale, 2);
      expect(gesture.rotation, .4);
      sample(gesture, factor: 1.03, degrees: 16);
      expect(gesture.scale, 2);
      expect(gesture.rotation, .4);
      sample(gesture, factor: 1.04, degrees: 17);
      expect(gesture.scale, closeTo(2 * 1.04 / 1.03, 1e-12));
      expect(gesture.rotation, closeTo(.4 + radians(1), 1e-12));
      // Neither axis is re-gated by the other starting or by a reversal.
      sample(gesture, factor: 1.01, degrees: 14);
      expect(gesture.scale, closeTo(2 * 1.01 / 1.03, 1e-12));
      expect(gesture.rotation, closeTo(.4 - radians(2), 1e-12));
    },
  );

  for (final sign in [1.0, -1.0]) {
    test('zoom first raises pending rotation to 25 degrees ($sign)', () {
      final gesture = begin();
      sample(gesture, factor: 1.02, degrees: sign * 14);
      sample(gesture, factor: 1.03, degrees: sign * 24.9);
      expect(gesture.scale, closeTo(2 * 1.03 / 1.02, 1e-12));
      expect(gesture.rotation, .4);
      sample(gesture, factor: 1.04, degrees: sign * 25, rotation: .7);
      expect(gesture.rotation, .7);
      sample(gesture, factor: 1.05, degrees: sign * 26, rotation: .7);
      expect(gesture.rotation, closeTo(.7 + sign * radians(1), 1e-12));
      expect(gesture.scale, closeTo(2 * 1.05 / 1.02, 1e-12));
    });

    test('rotation first raises pending zoom to 5% ($sign)', () {
      final gesture = begin();
      sample(gesture, factor: 1 + sign * .01, degrees: 15);
      sample(gesture, factor: 1 + sign * .049, degrees: 16);
      expect(gesture.scale, 2);
      expect(gesture.rotation, closeTo(.4 + radians(1), 1e-12));
      // Pending zoom captures an explicit camera command at activation.
      sample(gesture, factor: 1 + sign * .05, degrees: 17, scale: 3);
      expect(gesture.scale, 3);
      sample(gesture, factor: 1 + sign * .06, degrees: 18, scale: 3);
      expect(
        gesture.scale,
        closeTo(3 * (1 + sign * .06) / (1 + sign * .05), 1e-12),
      );
      expect(gesture.rotation, closeTo(.4 + radians(3), 1e-12));
    });

    test(
      'exact simultaneous base boundaries work in both directions ($sign)',
      () {
        final gesture = begin();
        sample(gesture, factor: 1 + sign * .02, degrees: sign * 15);
        expect(gesture.scale, 2);
        expect(gesture.rotation, .4);
        sample(gesture, factor: 1 + sign * .03, degrees: sign * 16);
        expect(
          gesture.scale,
          closeTo(2 * (1 + sign * .03) / (1 + sign * .02), 1e-12),
        );
        expect(gesture.rotation, closeTo(.4 + sign * radians(1), 1e-12));
      },
    );

    test('atan2 wrap cannot falsely activate rotation ($sign)', () {
      final gesture = begin();
      sample(gesture, degrees: sign * -359);
      sample(gesture, degrees: sign * -346);
      expect(gesture.rotation, .4);
      sample(gesture, degrees: sign * -344);
      expect(gesture.rotation, .4);
      sample(gesture, degrees: sign * -342);
      expect(gesture.rotation, closeTo(.4 + sign * radians(2), 1e-12));
      sample(gesture, degrees: sign * -1);
      expect(gesture.rotation, closeTo(.4 - sign * radians(17), 1e-12));
    });
  }

  test('a new gesture clears both histories and activation baselines', () {
    final gesture = begin();
    sample(gesture, factor: 1.03);
    sample(gesture, factor: 1.04, degrees: 26);
    gesture.start(
      const PatchMapGestureOptions(),
      cameraScale: 7,
      cameraRotation: 1,
    );
    sample(gesture, factor: 1.02, degrees: 15, scale: 7, rotation: 1);
    expect(gesture.scale, 7);
    expect(gesture.rotation, 1);
    sample(gesture, factor: 1.03, degrees: 16, scale: 7, rotation: 1);
    expect(gesture.scale, closeTo(7 * 1.03 / 1.02, 1e-12));
    expect(gesture.rotation, closeTo(1 + radians(1), 1e-12));
  });

  for (final threshold in [0.0, 15.0]) {
    test(
      'pinch rebases onto an external rotation with threshold $threshold',
      () {
        final gesture = begin(
          PatchMapGestureOptions(rotationThresholdDegrees: threshold),
        );
        sample(gesture, degrees: threshold);
        sample(gesture, factor: 1.1, degrees: threshold, rotation: .7);
        expect(gesture.rotation, .7);
        sample(gesture, factor: 1.2, degrees: threshold + 2);
        expect(gesture.rotation, closeTo(.7 + radians(2), 1e-12));
        sample(gesture, factor: 1.3, degrees: threshold + 3, rotation: 1.2);
        expect(gesture.rotation, closeTo(1.2 + radians(1), 1e-12));
        sample(gesture, factor: 1.4, degrees: threshold + 3);
        expect(gesture.rotation, closeTo(1.2 + radians(1), 1e-12));
        sample(gesture, degrees: double.nan, rotation: 1.5);
        expect(gesture.rotation, 1.5);
        sample(gesture, degrees: threshold + 4);
        expect(gesture.rotation, closeTo(1.5 + radians(1), 1e-12));
      },
    );
  }

  test('custom follow-on thresholds never lower the configured base', () {
    final gesture = begin(
      const PatchMapGestureOptions(
        zoomThreshold: .1,
        zoomThresholdAfterRotation: .15,
        rotationThresholdDegrees: 20,
        rotationThresholdAfterZoomDegrees: 30,
      ),
    );
    sample(gesture, factor: 1.11);
    sample(gesture, factor: 1.12, degrees: 29);
    expect(gesture.rotation, .4);
    sample(gesture, factor: 1.13, degrees: 31);
    sample(gesture, factor: 1.14, degrees: 32);
    expect(gesture.rotation, closeTo(.4 + radians(1), 1e-12));
    final rotated = begin(
      const PatchMapGestureOptions(zoomThresholdAfterRotation: .15),
    );
    sample(rotated, degrees: 16);
    sample(rotated, degrees: 17, factor: 1.14);
    expect(rotated.scale, 2);
    sample(rotated, degrees: 18, factor: 1.16);
    sample(rotated, degrees: 19, factor: 1.17);
    expect(rotated.scale, closeTo(2 * 1.17 / 1.16, 1e-12));
    final largerBase = begin(
      const PatchMapGestureOptions(
        zoomThreshold: .1,
        rotationThresholdDegrees: 30,
      ),
    );
    sample(largerBase, degrees: 31);
    sample(largerBase, factor: 1.09, degrees: 32);
    expect(largerBase.scale, 2);
    sample(largerBase, factor: 1.11, degrees: 33);
    sample(largerBase, factor: 1.12, degrees: 34);
    expect(largerBase.scale, closeTo(2 * 1.12 / 1.11, 1e-12));
  });

  test('zero remains immediate; neutral and disabled axes do not suppress', () {
    final immediate = begin(
      const PatchMapGestureOptions(
        zoomThreshold: 0,
        rotationThresholdDegrees: 0,
      ),
    );
    sample(immediate, factor: 1.005, degrees: 1);
    expect(immediate.scale, closeTo(2.01, 1e-12));
    expect(immediate.rotation, closeTo(.4 + radians(1), 1e-12));
    final zeroZoom = begin(const PatchMapGestureOptions(zoomThreshold: 0));
    sample(zeroZoom);
    sample(zeroZoom, degrees: 16);
    sample(zeroZoom, factor: 1.005, degrees: 17);
    expect(zeroZoom.rotation, closeTo(.4 + radians(1), 1e-12));
    expect(zeroZoom.scale, closeTo(2.01, 1e-12));
    final zeroRotation = begin(
      const PatchMapGestureOptions(rotationThresholdDegrees: 0),
    );
    sample(zeroRotation);
    sample(zeroRotation, factor: 1.03);
    sample(zeroRotation, factor: 1.04, degrees: 1);
    expect(zeroRotation.scale, closeTo(2 * 1.04 / 1.03, 1e-12));
    expect(zeroRotation.rotation, closeTo(.4 + radians(1), 1e-12));
    final disabledZoom = begin(
      const PatchMapGestureOptions(zoomEnabled: false, zoomThreshold: 0),
    );
    sample(disabledZoom, factor: 2);
    sample(disabledZoom, factor: 3, degrees: 16);
    sample(disabledZoom, factor: 4, degrees: 17);
    expect(disabledZoom.scale, 2);
    expect(disabledZoom.rotation, closeTo(.4 + radians(1), 1e-12));
    final disabledRotation = begin(
      const PatchMapGestureOptions(
        rotationEnabled: false,
        rotationThresholdDegrees: 0,
      ),
    );
    sample(disabledRotation, degrees: 20);
    sample(disabledRotation, factor: 1.03, degrees: 30);
    sample(disabledRotation, factor: 1.04, degrees: 40);
    expect(disabledRotation.scale, closeTo(2 * 1.04 / 1.03, 1e-12));
    expect(disabledRotation.rotation, .4);
  });

  test('all four thresholds validate before disturbing an active gesture', () {
    final gesture = begin();
    sample(gesture, factor: 1.03, degrees: 16);
    for (final invalid in const [
      PatchMapGestureOptions(zoomThreshold: -.1),
      PatchMapGestureOptions(zoomThreshold: 1),
      PatchMapGestureOptions(zoomThreshold: double.nan),
      PatchMapGestureOptions(zoomThreshold: double.infinity),
      PatchMapGestureOptions(zoomThresholdAfterRotation: -.1),
      PatchMapGestureOptions(zoomThresholdAfterRotation: 1),
      PatchMapGestureOptions(zoomThresholdAfterRotation: double.nan),
      PatchMapGestureOptions(zoomThresholdAfterRotation: double.infinity),
      PatchMapGestureOptions(rotationThresholdDegrees: -1),
      PatchMapGestureOptions(rotationThresholdDegrees: double.nan),
      PatchMapGestureOptions(rotationThresholdDegrees: double.infinity),
      PatchMapGestureOptions(rotationThresholdAfterZoomDegrees: -1),
      PatchMapGestureOptions(rotationThresholdAfterZoomDegrees: double.nan),
      PatchMapGestureOptions(
        rotationThresholdAfterZoomDegrees: double.infinity,
      ),
    ]) {
      expect(
        () => gesture.start(invalid, cameraScale: 7, cameraRotation: 1),
        throwsArgumentError,
      );
    }
    sample(gesture, factor: 1.04, degrees: 17);
    expect(gesture.scale, closeTo(2 * 1.04 / 1.03, 1e-12));
    expect(gesture.rotation, closeTo(.4 + radians(1), 1e-12));
  });

  test('invalid samples cannot activate or poison either axis', () {
    final gesture = begin();
    for (final factor in [0.0, -1.0, double.nan, double.infinity]) {
      sample(gesture, factor: factor, degrees: double.nan);
      expect(gesture.scale, 2);
      expect(gesture.rotation, .4);
    }
    sample(gesture, factor: 1.03, degrees: 16);
    sample(gesture, factor: 0, degrees: double.infinity);
    expect(gesture.scale, 2);
    expect(gesture.rotation, .4);
    sample(gesture, factor: 1.06, degrees: 18);
    expect(gesture.scale, closeTo(2 * 1.06 / 1.03, 1e-12));
    expect(gesture.rotation, closeTo(.4 + radians(2), 1e-12));
  });
}
