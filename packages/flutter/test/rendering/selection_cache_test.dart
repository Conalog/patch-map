import 'dart:ui';

import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:conalog_patch_map/src/dataset/colors.dart';
import 'package:conalog_patch_map/src/rendering/selection_overlay.dart';
import 'package:flutter_test/flutter_test.dart';

import 'selection_overlay_test.dart' as support;
import 'retained_update_test.dart' as retained;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'culling preserves clipped pixels, offscreen aggregate and live styles',
    () async {
      final geometry = support.snapshot([
        support.item('visible', x: 20, y: 20, size: 30),
        support.item('far', x: -2000, y: -2000, size: 10),
        support.item('edge', x: 129, y: 60, size: 20),
        {
          ...support.item('rotated', x: 70, y: 70, size: 25),
          'attrs': {'x': 70, 'y': 70, 'angle': 40, 'scaleX': -1.0},
        },
      ]);
      final overlay = SelectionOverlay(palette: ColorResolver());
      addTearDown(overlay.dispose);
      const ids = ['visible', 'far', 'edge', 'rotated', 'visible', 'missing'];
      for (final mode in [
        PatchMapSelectionDisplayMode.all,
        PatchMapSelectionDisplayMode.elementOnly,
        PatchMapSelectionDisplayMode.groupOnly,
      ]) {
        for (final alignment in PatchMapSelectionStrokeAlignment.values) {
          final style = PatchMapSelectionStyle(
            displayMode: mode,
            strokeAlignment: alignment,
            strokeWidth: 4,
          );
          final fresh = SelectionOverlay(palette: ColorResolver())
            ..configure(style);
          overlay.configure(style);
          final actual = await support.pixels(
            (canvas) => overlay.paint(
              canvas,
              geometry,
              ids,
              cameraScale: 1,
              cameraRotation: 0,
              visibleWorldBounds: const Rect.fromLTWH(0, 0, 128, 128),
            ),
          );
          final expected = await support.render(fresh, geometry, ids);
          expect(actual, expected, reason: '$mode/$alignment');
          fresh.dispose();
        }
      }
      overlay.configure(
        const PatchMapSelectionStyle(
          displayMode: PatchMapSelectionDisplayMode.elementOnly,
        ),
      );
      await support.pixels(
        (canvas) => overlay.paint(
          canvas,
          geometry,
          ids,
          cameraScale: 1,
          cameraRotation: 0,
          visibleWorldBounds: const Rect.fromLTWH(0, 0, 128, 128),
        ),
      );
      expect(
        overlay.outlineCount,
        3,
      ); // Far individual omitted, near-edge stroke kept.
      expect(overlay.resolvedTargetCount, 5);
      await support.render(overlay, geometry, ['far']);
      expect(overlay.outlineCount, 1);
      await support.render(overlay, geometry, []);
      expect(overlay.outlineCount, 0);
      expect(
        await support.render(overlay, geometry, ['visible']),
        await support.reference([
          support.rect(const Rect.fromLTRB(19, 19, 51, 51)),
        ]),
      );
    },
  );

  test(
    'backend invalidates cached envelope across repeated retained commits',
    () async {
      final h = await retained.Harness.create();
      addTearDown(h.close);
      final overlay = h.backend.selectionOverlay;
      final node = h.current.geometry['g.0.0']!;
      await support.render(overlay, h.current.geometry, ['g.0.0', 'g.0.1']);
      for (final x in [60.0, 35.0, 5.0]) {
        h.publish(
          await h.prepare([
            retained.update('text', {
              'attrs': {'x': x},
            }),
          ]),
        );
        expect(h.current.geometry['g.0.0'], same(node));
        final actual = await support.render(overlay, h.current.geometry, [
          'g.0.0',
          'g.0.1',
        ]);
        final fresh = SelectionOverlay(palette: ColorResolver());
        expect(
          actual,
          await support.render(fresh, h.current.geometry, ['g.0.0', 'g.0.1']),
        );
        fresh.dispose();
        h.backend.retirement.flush();
      }
      h.backend.retire(h.current);
      h.backend.hide();
      expect(overlay.outlineCount, 0);
      expect(overlay.resolvedTargetCount, 0);
      expect((overlay.pathIdentity as Path).getBounds(), Rect.zero);
    },
  );
}
