import 'dart:math' as math;
import 'dart:ui';

import 'package:conalog_patch_map/src/api/rotation_animation.dart';
import 'package:conalog_patch_map/src/api/camera.dart';
import 'package:conalog_patch_map/src/dataset/colors.dart';
import 'package:conalog_patch_map/src/resources/asset_registry.dart';
import 'package:conalog_patch_map/src/viewport/camera.dart';
import 'package:conalog_patch_map/src/widget/map_backend.dart';
import 'package:flutter/painting.dart' show EdgeInsets;
import 'package:flutter_test/flutter_test.dart';

MapCamera camera() => MapCamera()..resize(const Size(400, 300));
double radians(double degrees) => degrees * math.pi / 180;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    '180ms cubic travel preserves center/scale; observation and exact target',
    () {
      final c = camera()..set(center: const Offset(40, 30), scale: 2);
      c.observe(true);
      c.rotateTo(math.pi);
      expect(c.rotation, 0);
      expect(c.takeChange(), isNull);
      // A delayed first frame starts the clock rather than consuming travel.
      expect(c.advanceRotation(const Duration(seconds: 3)), isTrue);
      expect(c.rotation, 0);
      expect(c.advanceRotation(const Duration(milliseconds: 3090)), isTrue);
      expect(c.rotation, closeTo(math.pi * .875, 1e-12));
      expect(c.takeChange()!.sources, {
        PatchMapCameraChangeSource.programmatic,
      });
      expect(c.center, const Offset(40, 30));
      expect(c.scale, 2);
      expect(c.advanceRotation(const Duration(milliseconds: 3180)), isFalse);
      expect(c.rotation, math.pi);
      expect(c.rotating, isFalse);
      final state = c.snapshot;
      expect(c.advanceRotation(const Duration(seconds: 8)), isFalse);
      expect(c.snapshot, same(state));
    },
  );

  test('shortest wrap, clockwise half-turn and equivalent orientations', () {
    final c = camera()..set(rotation: radians(350));
    c.rotateTo(radians(10));
    c.advanceRotation(Duration.zero);
    c.advanceRotation(const Duration(milliseconds: 90));
    expect(c.rotation, closeTo(radians(367.5), 1e-12));
    c.advanceRotation(const Duration(milliseconds: 180));
    expect(c.rotation, radians(10));
    c.set(rotation: 0);
    c.rotateTo(-math.pi);
    c.advanceRotation(Duration.zero);
    c.advanceRotation(const Duration(milliseconds: 90));
    expect(c.rotation, greaterThan(0));
    c.advanceRotation(const Duration(milliseconds: 180));
    expect(c.rotation, -math.pi);
    c.rotateTo(math.pi);
    expect(c.rotating, isFalse);
    expect(c.rotation, math.pi);
  });

  test(
    'retarget starts at displayed angle; invalid commands do not interrupt',
    () {
      final c = camera();
      c.rotateTo(2);
      c.advanceRotation(Duration.zero);
      c.advanceRotation(const Duration(milliseconds: 60));
      final displayed = c.rotation;
      c.rotateTo(-1);
      expect(c.rotation, displayed);
      c.advanceRotation(const Duration(milliseconds: 80));
      expect(c.rotation, displayed);
      expect(() => c.rotateTo(double.nan), throwsArgumentError);
      expect(() => c.set(scale: 0), throwsArgumentError);
      expect(
        () => c.fit(
          const Rect.fromLTWH(0, 0, 10, 10),
          padding: const EdgeInsets.all(300),
        ),
        throwsArgumentError,
      );
      expect(
        () => c.setRotationAnimation(
          const PatchMapRotationAnimationOptions(
            duration: Duration(milliseconds: -1),
          ),
        ),
        throwsArgumentError,
      );
      expect(c.rotating, isTrue);
      c.advanceRotation(const Duration(milliseconds: 260));
      expect(c.rotation, -1);
      expect(c.rotating, isFalse);
    },
  );

  test(
    'live disabling settles target; duration changes only affect next travel',
    () {
      final c = camera();
      c.rotateTo(2);
      c.advanceRotation(Duration.zero);
      c.advanceRotation(const Duration(milliseconds: 90));
      c.setRotationAnimation(
        const PatchMapRotationAnimationOptions(duration: Duration(seconds: 2)),
      );
      c.advanceRotation(const Duration(milliseconds: 180));
      expect(c.rotation, 2);
      expect(c.rotating, isFalse);
      c.rotateTo(1);
      c.advanceRotation(Duration.zero);
      c.advanceRotation(const Duration(milliseconds: 180));
      expect(c.rotating, isTrue);
      expect(
        c.setRotationAnimation(
          const PatchMapRotationAnimationOptions(enabled: false),
        ),
        isTrue,
      );
      expect(c.rotation, 1);
      expect(c.rotating, isFalse);
      c.rotateTo(2.5);
      expect(c.rotation, 2.5);
      c.setRotationAnimation(
        const PatchMapRotationAnimationOptions(duration: Duration.zero),
      );
      c.rotateTo(.5);
      expect(c.rotation, .5);
      expect(c.rotating, isFalse);
    },
  );

  test('accepted camera commands cancel, resize preserves trajectory', () {
    final c = camera();
    for (final command in <void Function()>[
      () => c.set(),
      () => c.set(rotation: .2),
      () => c.focus(const Rect.fromLTWH(0, 0, 10, 10)),
      () => c.fit(const Rect.fromLTWH(0, 0, 10, 10)),
      () => c.pan(const Offset(3, 4)),
      () => c.cancelRotation(),
    ]) {
      c.rotateTo(2);
      c.advanceRotation(Duration.zero);
      command();
      final angle = c.rotation;
      expect(c.advanceRotation(const Duration(seconds: 1)), isFalse);
      expect(c.rotation, angle);
    }
    c.rotateTo(1);
    c.advanceRotation(Duration.zero);
    c.resize(const Size(800, 600));
    expect(c.rotating, isTrue);
    c.advanceRotation(const Duration(milliseconds: 180));
    expect(c.rotation, 1);
  });

  test(
    'backend advances both bars and rotation; inactivity and hide release travel',
    () {
      final backend = MapBackend(
        palette: ColorResolver(),
        registry: AssetRegistry(),
        invalidate: () {},
        onAssetFailure: (_) {},
        onReplacement: () {},
      );
      addTearDown(backend.close);
      backend.camera.resize(const Size(400, 300));
      backend.camera.rotateTo(1);
      backend.transitions.replaceRetained(
        0,
        'bar',
        const Rect.fromLTWH(0, 0, 10, 10),
        const Rect.fromLTWH(0, 0, 10, 100),
        {'animation': true, 'animationDuration': 180},
        animate: true,
      );
      expect(backend.onFrame(Duration.zero), isTrue);
      expect(backend.onFrame(const Duration(milliseconds: 90)), isTrue);
      expect(backend.camera.rotation, closeTo(.875, 1e-12));
      expect(backend.transitions.rectangle(0, 'bar')!.height, greaterThan(10));
      expect(backend.onFrame(const Duration(milliseconds: 180)), isFalse);
      expect(backend.camera.rotation, 1);
      expect(backend.transitions.rectangle(0, 'bar'), isNull);
      backend.camera.rotateTo(2);
      backend.setActive(false);
      backend.setActive(true);
      expect(backend.onFrame(const Duration(seconds: 1)), isFalse);
      expect(backend.camera.rotation, 1);
      backend.camera.rotateTo(2);
      backend.hide();
      expect(backend.onFrame(const Duration(seconds: 2)), isFalse);
    },
  );
}
