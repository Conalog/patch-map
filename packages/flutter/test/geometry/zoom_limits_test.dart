import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:conalog_patch_map/src/viewport/camera.dart';
import 'package:flutter/painting.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'clamped anchored zoom preserves the world point and stops at limits',
    () {
      final camera = MapCamera()
        ..resize(const Size(400, 300))
        ..set(center: const Offset(20, 30), rotation: .7)
        ..setZoomLimits(const PatchMapZoomLimits(minScale: .5, maxScale: 2));
      const anchor = Offset(30, 70);
      final world = camera.localToWorld(anchor);
      camera.transformAround(anchor, scale: 99);
      expect(camera.scale, 2);
      expect((camera.worldToLocal(world) - anchor).distance, lessThan(1e-9));
      final stopped = camera.snapshot;
      for (var i = 0; i < 100; i++) {
        expect(camera.transformAround(anchor, scale: 99), false);
      }
      expect(camera.snapshot, stopped);
      camera.transformAround(anchor, scale: .01);
      expect(camera.scale, .5);
      expect((camera.worldToLocal(world) - anchor).distance, lessThan(1e-9));
    },
  );

  test('fit uses the limited scale when calculating asymmetric padding', () {
    final camera = MapCamera()
      ..resize(const Size(400, 300))
      ..set(rotation: .6)
      ..setZoomLimits(const PatchMapZoomLimits(minScale: 2, maxScale: 2));
    const padding = EdgeInsets.fromLTRB(10, 20, 90, 80);
    for (final bounds in const [
      Rect.fromLTWH(0, 0, 1000, 800),
      Rect.fromLTWH(0, 0, 10, 8),
    ]) {
      camera.fit(bounds, padding: padding);
      expect(camera.scale, 2);
      expect(camera.rotation, .6);
      expect(
        (camera.worldToLocal(bounds.center) - const Offset(160, 120)).distance,
        lessThan(1e-9),
      );
    }
  });

  test(
    'invalid limits and invalid input preserve the prior camera and bounds',
    () {
      final camera = MapCamera()
        ..resize(const Size(400, 300))
        ..setZoomLimits(const PatchMapZoomLimits(minScale: .5, maxScale: 2));
      final before = camera.snapshot;
      for (final invalid in [
        const PatchMapZoomLimits(minScale: 0),
        const PatchMapZoomLimits(maxScale: -1),
        const PatchMapZoomLimits(minScale: 3, maxScale: 2),
        const PatchMapZoomLimits(maxScale: double.infinity),
        const PatchMapZoomLimits(minScale: double.nan),
        const PatchMapZoomLimits(minScale: 1e200),
      ]) {
        expect(() => camera.setZoomLimits(invalid), throwsArgumentError);
        expect(camera.snapshot, before);
      }
      for (final invalid in [0.0, -1.0, double.nan, double.infinity]) {
        expect(() => camera.set(scale: invalid), throwsArgumentError);
        expect(
          () => camera.transformAround(Offset.zero, scale: invalid),
          throwsArgumentError,
        );
      }
      expect(camera.snapshot, before);
      camera.set(scale: 10);
      expect(camera.scale, 2);
    },
  );
}
