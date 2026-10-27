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

  test('unrepresentable arc rejects before replacing accepted travel', () {
    final c = camera()..set(center: const Offset(1.4e308, 1.4e308));
    // Both endpoints fit; the intermediate diagonal translation does not.
    c.set(rotation: math.pi / 2);
    c.set(rotation: 0);
    c.rotateTo(.01);
    c.advanceRotation(Duration.zero);
    final state = c.snapshot;
    final matrix = c.paintMatrix;
    expect(() => c.rotateTo(math.pi / 2), throwsArgumentError);
    expect(c.snapshot, same(state));
    expect(c.paintMatrix, same(matrix));
    expect(c.rotating, isTrue);
    c.advanceRotation(const Duration(milliseconds: 40));
    expect(c.rotation, greaterThan(0));
    c.advanceRotation(const Duration(milliseconds: 180));
    expect(c.rotation, .01);
    expect(c.rotating, isFalse);
    // Immediate rotation still only needs a representable endpoint.
    c.setRotationAnimation(
      const PatchMapRotationAnimationOptions(enabled: false),
    );
    c.rotateTo(math.pi / 2);
    expect(c.rotation, math.pi / 2);
  });

  test('tiny scaled coefficients cannot hide inverse overflow inside arc', () {
    final c = MapCamera()
      ..resize(const Size(2e145, 2e145))
      ..set(
        center: Offset(double.maxFinite - 1.2e299, 0),
        scale: 1e-154,
        rotation: math.pi,
      );
    c.set(rotation: 3 * math.pi / 2);
    c.set(rotation: math.pi);
    final state = c.snapshot;
    expect(() => c.rotateTo(3 * math.pi / 2), throwsArgumentError);
    expect(c.snapshot, same(state));
    expect(c.rotating, isFalse);
  });

  test('large safe arcs and short extreme arcs retain timing and target', () {
    for (final (center, target) in [
      (const Offset(1e308, 1e308), math.pi / 2),
      (const Offset(1.4e308, 1.4e308), .01),
      (const Offset(-1.4e308, -1.4e308), -.01),
      (const Offset(1e308, -1e308), -math.pi / 2),
    ]) {
      final c = camera()..set(center: center);
      c.rotateTo(target);
      c.advanceRotation(Duration.zero);
      for (var time = 1; time < 180; time++) {
        expect(c.advanceRotation(Duration(milliseconds: time)), isTrue);
        expect(c.paintMatrix.every((value) => value.isFinite), isTrue);
        expect(c.center, center);
        expect(c.scale, 1);
      }
      expect(c.advanceRotation(const Duration(milliseconds: 180)), isFalse);
      expect(c.rotation, target);
    }
  });

  test('resize rejects an unsafe remaining arc without changing travel', () {
    final c = camera()..set(center: const Offset(0, 1e308));
    c.rotateTo(math.pi / 2);
    c.advanceRotation(Duration.zero);
    final state = c.snapshot;
    final matrix = c.paintMatrix;
    expect(
      () => c.resize(const Size(double.maxFinite, 300)),
      throwsArgumentError,
    );
    expect(c.snapshot, same(state));
    expect(c.paintMatrix, same(matrix));
    expect(c.size, const Size(400, 300));
    expect(c.rotating, isTrue);
    c.resize(const Size(800, 600));
    expect(c.rotating, isTrue);
    c.advanceRotation(const Duration(milliseconds: 40));
    expect(c.rotation, greaterThan(0));
    c.advanceRotation(const Duration(milliseconds: 180));
    expect(c.rotation, math.pi / 2);
  });

  test(
    'large viewport accepts representable short arcs in either direction',
    () {
      for (final target in [.01, -.01]) {
        final c = MapCamera()
          ..resize(const Size(1.4e308, 1.4e308))
          ..set(scale: .5);
        c.rotateTo(target);
        c.advanceRotation(Duration.zero);
        for (var time = 1; time < 180; time++) {
          expect(c.advanceRotation(Duration(milliseconds: time)), isTrue);
          expect(c.paintMatrix.every((value) => value.isFinite), isTrue);
          expect(c.localToWorld(Offset.zero).isFinite, isTrue);
        }
        expect(c.advanceRotation(const Duration(milliseconds: 180)), isFalse);
        expect(c.rotation, target);
        expect(c.center, Offset.zero);
        expect(c.scale, .5);
      }
    },
  );

  test('large center and viewport cancellation preserves a safe short arc', () {
    final c = MapCamera()
      ..resize(const Size(1.4e308, 0))
      ..set(center: const Offset(1e308, 0), scale: .5);
    c.rotateTo(.01);
    c.advanceRotation(Duration.zero);
    for (var time = 1; time < 180; time++) {
      expect(c.advanceRotation(Duration(milliseconds: time)), isTrue);
      expect(c.paintMatrix.every((value) => value.isFinite), isTrue);
      expect(c.localToWorld(Offset.zero).isFinite, isTrue);
    }
    expect(c.advanceRotation(const Duration(milliseconds: 180)), isFalse);
    expect(c.rotation, .01);
    expect(c.center, const Offset(1e308, 0));
    expect(c.scale, .5);
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
