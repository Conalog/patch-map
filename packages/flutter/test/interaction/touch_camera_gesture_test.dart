import 'dart:math' as math;

import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:conalog_patch_map/src/interaction/touch_camera_gesture.dart';
import 'package:flutter_test/flutter_test.dart';

double radians(double degrees) => degrees * math.pi / 180;

TouchCameraGesture begin([
  PatchMapGestureOptions options = const PatchMapGestureOptions(),
]) => TouchCameraGesture()..start(options, cameraScale: 2, cameraRotation: .4);

void main() {
  test(
    'custom thresholds and independent zero thresholds use supplied values',
    () {
      final custom = begin(
        const PatchMapGestureOptions(
          zoomThreshold: .1,
          rotationThresholdDegrees: 20,
        ),
      );
      expect(custom.scale(1.05, 2), 2);
      expect(custom.rotation(radians(15), .4), .4);
      expect(custom.scale(1.11, 2), 2);
      expect(custom.rotation(radians(21), .4), .4);
      expect(custom.scale(1.22, 2), closeTo(2 * 1.22 / 1.11, 1e-12));
      expect(custom.rotation(radians(23), .4), closeTo(.4 + radians(2), 1e-12));
      final immediate = begin(
        const PatchMapGestureOptions(
          zoomThreshold: 0,
          rotationThresholdDegrees: 0,
        ),
      );
      expect(immediate.scale(1.005, 2), closeTo(2.01, 1e-12));
      expect(immediate.rotation(.01, .4), closeTo(.41, 1e-12));
      final zoomOnly = begin(const PatchMapGestureOptions(zoomThreshold: 0));
      expect(zoomOnly.scale(1.005, 2), closeTo(2.01, 1e-12));
      expect(zoomOnly.rotation(.01, .4), .4);
      final rotateOnly = begin(
        const PatchMapGestureOptions(rotationThresholdDegrees: 0),
      );
      expect(rotateOnly.scale(1.005, 2), 2);
      expect(rotateOnly.rotation(.01, .4), closeTo(.41, 1e-12));
    },
  );

  test(
    'thresholds require finite values and a reachable zoom-out threshold',
    () {
      for (final invalid in const [
        PatchMapGestureOptions(zoomThreshold: -.1),
        PatchMapGestureOptions(zoomThreshold: 1),
        PatchMapGestureOptions(zoomThreshold: double.nan),
        PatchMapGestureOptions(zoomThreshold: double.infinity),
        PatchMapGestureOptions(rotationThresholdDegrees: -1),
        PatchMapGestureOptions(rotationThresholdDegrees: double.nan),
        PatchMapGestureOptions(rotationThresholdDegrees: double.infinity),
      ]) {
        expect(() => begin(invalid), throwsArgumentError);
      }
    },
  );

  test('independent thresholds discard overshoot and then allow both axes', () {
    final gesture = begin();
    expect(gesture.scale(1.019, 2), 2);
    expect(gesture.rotation(radians(9.9), .4), .4);
    expect(gesture.scale(1.03, 2), 2);
    expect(gesture.scale(1.06, 2), closeTo(2 * 1.06 / 1.03, 1e-12));
    expect(gesture.rotation(radians(9), .4), .4);
    expect(gesture.rotation(radians(11), .4), .4);
    expect(gesture.rotation(radians(13), .4), closeTo(.4 + radians(2), 1e-12));
    expect(gesture.scale(1.09, 2), closeTo(2 * 1.09 / 1.03, 1e-12));
  });

  test(
    'rotation can start first while zoom waits and captures current scale',
    () {
      final gesture = begin();
      expect(gesture.rotation(radians(-11), .7), .7);
      expect(
        gesture.rotation(radians(-13), .7),
        closeTo(.7 - radians(2), 1e-12),
      );
      expect(gesture.scale(.99, 2), 2);
      // An explicit camera change while zoom is pending becomes its new base.
      expect(gesture.scale(.97, 3), 3);
      expect(gesture.scale(.94, 3), closeTo(3 * .94 / .97, 1e-12));
    },
  );

  test(
    'activation stays latched across reversals and resets on a new gesture',
    () {
      final gesture = begin();
      gesture.scale(1.03, 2);
      gesture.rotation(radians(11), .4);
      expect(gesture.scale(1.01, 2), closeTo(2 * 1.01 / 1.03, 1e-12));
      expect(gesture.rotation(radians(9), .4), closeTo(.4 - radians(2), 1e-12));
      expect(gesture.scale(1.011, 2), closeTo(2 * 1.011 / 1.03, 1e-12));
      expect(
        gesture.rotation(radians(9.1), .4),
        closeTo(.4 - radians(1.9), 1e-12),
      );
      gesture.start(
        const PatchMapGestureOptions(),
        cameraScale: 7,
        cameraRotation: 1,
      );
      expect(gesture.scale(1.01, 7), 7);
      expect(gesture.rotation(radians(9), 1), 1);
      expect(gesture.scale(1.03, 7), 7);
      expect(gesture.rotation(radians(11), 1), 1);
    },
  );

  for (final sign in [1.0, -1.0]) {
    test('atan2 wrap in direction $sign cannot falsely activate rotation', () {
      final gesture = begin();
      expect(gesture.rotation(sign * (-2 * math.pi + radians(1)), .4), .4);
      expect(gesture.rotation(sign * (-2 * math.pi + radians(9)), .4), .4);
      expect(gesture.rotation(sign * (-2 * math.pi + radians(11)), .4), .4);
      expect(
        gesture.rotation(sign * (-2 * math.pi + radians(13)), .4),
        closeTo(.4 + sign * radians(2), 1e-12),
      );
      expect(
        gesture.rotation(sign * radians(-1), .4),
        closeTo(.4 - sign * radians(12), 1e-12),
      );
    });
  }

  test('coincident fingers do not activate zoom or poison its divisor', () {
    final gesture = begin();
    expect(gesture.scale(0, 2), 2);
    expect(gesture.scale(1.01, 2), 2);
    expect(gesture.scale(1.03, 2), 2);
    expect(gesture.scale(0, 2), 2);
    expect(gesture.scale(1.06, 2), closeTo(2 * 1.06 / 1.03, 1e-12));
  });
}
