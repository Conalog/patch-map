import 'dart:math' as math;

import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:conalog_patch_map/src/interaction/touch_camera_gesture.dart';
import 'package:flutter_test/flutter_test.dart';

double radians(double degrees) => degrees * math.pi / 180;

void main() {
  test('independent thresholds discard overshoot and then allow both axes', () {
    final gesture = TouchCameraGesture()..start(const PatchMapGestureOptions());
    expect(gesture.scale(1.019, 2), 2);
    expect(gesture.rotation(radians(4.9), .4), .4);
    expect(gesture.scale(1.03, 2), 2);
    expect(gesture.scale(1.06, 2), closeTo(2 * 1.06 / 1.03, 1e-12));
    expect(gesture.rotation(radians(4), .4), .4);
    expect(gesture.rotation(radians(6), .4), .4);
    expect(gesture.rotation(radians(8), .4), closeTo(.4 + radians(2), 1e-12));
    expect(gesture.scale(1.09, 2), closeTo(2 * 1.09 / 1.03, 1e-12));
  });

  test(
    'rotation can start first while zoom waits and captures current scale',
    () {
      final gesture = TouchCameraGesture()
        ..start(const PatchMapGestureOptions());
      expect(gesture.rotation(radians(-6), .7), .7);
      expect(
        gesture.rotation(radians(-8), .7),
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
      final gesture = TouchCameraGesture()
        ..start(const PatchMapGestureOptions());
      gesture.scale(1.03, 2);
      gesture.rotation(radians(6), .4);
      expect(gesture.scale(1.01, 2), closeTo(2 * 1.01 / 1.03, 1e-12));
      expect(gesture.rotation(radians(4), .4), closeTo(.4 - radians(2), 1e-12));
      expect(gesture.scale(1.011, 2), closeTo(2 * 1.011 / 1.03, 1e-12));
      expect(
        gesture.rotation(radians(4.1), .4),
        closeTo(.4 - radians(1.9), 1e-12),
      );
      gesture.start(const PatchMapGestureOptions());
      expect(gesture.scale(1.01, 7), 7);
      expect(gesture.rotation(radians(4), 1), 1);
      expect(gesture.scale(1.03, 7), 7);
      expect(gesture.rotation(radians(6), 1), 1);
    },
  );

  for (final sign in [1.0, -1.0]) {
    test('atan2 wrap in direction $sign cannot falsely activate rotation', () {
      final gesture = TouchCameraGesture()
        ..start(const PatchMapGestureOptions());
      expect(gesture.rotation(sign * (-2 * math.pi + radians(1)), .4), .4);
      expect(gesture.rotation(sign * (-2 * math.pi + radians(4)), .4), .4);
      expect(gesture.rotation(sign * (-2 * math.pi + radians(6)), .4), .4);
      expect(
        gesture.rotation(sign * (-2 * math.pi + radians(8)), .4),
        closeTo(.4 + sign * radians(2), 1e-12),
      );
      expect(
        gesture.rotation(sign * radians(-1), .4),
        closeTo(.4 - sign * radians(7), 1e-12),
      );
    });
  }

  test('coincident fingers do not activate zoom or poison its divisor', () {
    final gesture = TouchCameraGesture()..start(const PatchMapGestureOptions());
    expect(gesture.scale(0, 2), 2);
    expect(gesture.scale(1.01, 2), 2);
    expect(gesture.scale(1.03, 2), 2);
    expect(gesture.scale(0, 2), 2);
    expect(gesture.scale(1.06, 2), closeTo(2 * 1.06 / 1.03, 1e-12));
  });
}
