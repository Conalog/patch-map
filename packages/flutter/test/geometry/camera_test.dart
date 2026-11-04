import 'dart:math' as math;
import 'dart:ui';

import 'package:conalog_patch_map/src/api/camera.dart';
import 'package:conalog_patch_map/src/geometry/affine.dart';
import 'package:conalog_patch_map/src/viewport/camera.dart';
import 'package:flutter/painting.dart' show EdgeInsets;
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'unobserved changes do not queue events; snapshots detach and cache',
    () {
      final camera = MapCamera()..resize(const Size(400, 300));
      final before = camera.snapshot;
      for (var i = 1; i <= 10000; i++) {
        camera.set(center: Offset(i.toDouble(), 20));
      }
      expect(camera.takeChange(), isNull);
      expect(before.center, Offset.zero);
      expect(identical(camera.snapshot, camera.snapshot), isTrue);
      camera.observe(true);
      expect(camera.takeChange(), isNull);
      camera.set(rotation: .5);
      camera.pan(const Offset(10, 0));
      final change = camera.takeChange()!;
      expect(change.sources, {
        PatchMapCameraChangeSource.programmatic,
        PatchMapCameraChangeSource.gesture,
      });
      expect(change.state, camera.snapshot);
      expect(camera.takeChange(), isNull);
      camera.set(rotation: .7);
      camera.observe(false);
      expect(camera.takeChange(), isNull);
    },
  );

  test('fit preserves rotation and respects asymmetric screen padding', () {
    final camera = MapCamera()
      ..resize(const Size(400, 600))
      ..set(rotation: math.pi / 3);
    const bounds = Rect.fromLTWH(10, 20, 200, 100);
    const padding = EdgeInsets.fromLTRB(12, 20, 30, 200);
    camera.fit(bounds, padding: padding);
    final quad = Affine.identity.projectRect(bounds);
    for (var i = 0; i < 4; i++) {
      final point = camera.worldToLocal(quad.vertex(i));
      expect(point.dx, inInclusiveRange(12 - 1e-9, 370 + 1e-9));
      expect(point.dy, inInclusiveRange(20 - 1e-9, 400 + 1e-9));
    }
    expect(camera.rotation, math.pi / 3);
    expect(
      (camera.worldToLocal(bounds.center) - const Offset(191, 210)).distance,
      lessThan(1e-9),
    );
    final scale = camera.scale;
    camera.focus(const Rect.fromLTWH(-100, -200, 10, 20), padding: padding);
    expect(camera.scale, scale);
    expect(
      (camera.worldToLocal(const Offset(-95, -190)) - const Offset(191, 210))
          .distance,
      lessThan(1e-9),
    );
  });

  test(
    'resize preserves center/scale/rotation; anchored changes preserve hit position',
    () {
      final camera = MapCamera()
        ..resize(const Size(500, 300))
        ..set(center: const Offset(20, 30), scale: 4, rotation: .7);
      camera.resize(const Size(300, 500));
      expect(camera.center, const Offset(20, 30));
      expect(camera.scale, 4);
      expect(camera.rotation, .7);
      const anchor = Offset(10, 40);
      final before = camera.localToWorld(anchor);
      camera.transformAround(anchor, scale: 7, rotation: 1.2);
      expect((camera.worldToLocal(before) - anchor).distance, lessThan(1e-9));
      final projected = camera.worldToLocal(before);
      camera.pan(const Offset(30, -20));
      expect(
        (camera.worldToLocal(before) - projected - const Offset(30, -20))
            .distance,
        lessThan(1e-9),
      );
    },
  );

  test('invalid padding/camera changes preserve the previous valid state', () {
    final camera = MapCamera()..resize(const Size(100, 100));
    expect(
      () => camera.fit(
        const Rect.fromLTWH(0, 0, 1, 1),
        padding: const EdgeInsets.all(50),
      ),
      throwsArgumentError,
    );
    expect(() => camera.set(scale: 0), throwsArgumentError);
    expect(() => camera.set(scale: 1e200), throwsArgumentError);
    final matrix = List<double>.of(camera.paintMatrix);
    final world = camera.localToWorld(const Offset(20, 20));
    expect(
      () => camera.set(center: const Offset(1.79e308, 0), scale: 1e-161),
      throwsArgumentError,
    );
    expect(camera.paintMatrix, matrix);
    expect(camera.localToWorld(const Offset(20, 20)), world);
    expect(camera.center, Offset.zero);
    expect(camera.scale, 1);
  });
}
