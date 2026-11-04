import 'dart:math' as math;
import 'dart:ui';

import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:conalog_patch_map/src/dataset/colors.dart';
import 'package:conalog_patch_map/src/geometry/affine.dart';
import 'package:conalog_patch_map/src/geometry/selection_geometry.dart';
import 'package:conalog_patch_map/src/rendering/selection_overlay.dart';
import 'package:flutter_test/flutter_test.dart';

import 'selection_overlay_test.dart' as support;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'mode and color changes retain paint handles and only visit selected IDs',
    () async {
      final overlay = SelectionOverlay(palette: ColorResolver());
      addTearDown(overlay.dispose);
      final geometry = support.snapshot([
        support.item('a', x: 10, y: 20, size: 20, components: []),
        support.item('b', x: 70, y: 20, size: 20, components: []),
      ]);
      final path = overlay.pathIdentity, paint = overlay.paintIdentity;
      overlay.configure(
        const PatchMapSelectionStyle(
          color: Color(0xffef4444),
          strokeWidth: 4,
          displayMode: PatchMapSelectionDisplayMode.elementOnly,
        ),
      );
      final separate = await support.render(overlay, geometry, ['a', 'b']);
      expect(support.pixel(separate, 8, 30), [239, 68, 68, 255]);
      expect(support.pixel(separate, 50, 20)[3], 0);
      expect(overlay.outlineCount, 2);
      overlay.configure(
        const PatchMapSelectionStyle(
          displayMode: PatchMapSelectionDisplayMode.groupOnly,
        ),
      );
      final group = await support.render(overlay, geometry, ['a', 'b']);
      expect(support.pixel(group, 50, 20)[3], 255);
      expect(support.pixel(group, 30, 30)[3], 0);
      expect(overlay.outlineCount, 1);
      overlay.configure(
        const PatchMapSelectionStyle(
          displayMode: PatchMapSelectionDisplayMode.hidden,
        ),
      );
      final hidden = await support.render(
        overlay,
        geometry,
        Iterable.generate(1, (_) {
          fail('Hidden decoration must not even iterate selection');
        }),
      );
      expect(hidden.every((byte) => byte == 0), isTrue);
      expect(overlay.resolvedTargetCount, 0);
      expect(overlay.pathIdentity, same(path));
      expect(overlay.paintIdentity, same(paint));
      expect((path as Path).getBounds(), Rect.zero);
      overlay.configure(const PatchMapSelectionStyle());
      expect(
        await support.render(overlay, geometry, ['a']),
        await support.reference([
          support.rect(const Rect.fromLTWH(10, 20, 20, 20)),
        ]),
      );
      expect(overlay.configure(PatchMapSelectionStyle()), isFalse);
    },
  );

  test('group-only singleton retains its oriented envelope', () async {
    final overlay = SelectionOverlay(palette: ColorResolver());
    addTearDown(overlay.dispose);
    final geometry = support.snapshot([
      {
        ...support.item('a', size: 20, components: []),
        'attrs': {'x': 30, 'y': 20, 'angle': 40},
      },
    ]);
    final individual = await support.render(overlay, geometry, ['a']);
    overlay.configure(
      const PatchMapSelectionStyle(
        displayMode: PatchMapSelectionDisplayMode.groupOnly,
      ),
    );
    expect(
      await support.render(overlay, geometry, ['a', 'a', 'missing']),
      individual,
    );
  });

  test(
    'viewport width shrinks to its floor but never grows above base',
    () async {
      final overlay = SelectionOverlay(palette: ColorResolver());
      addTearDown(overlay.dispose);
      final geometry = support.snapshot([
        support.item('a', x: 30, y: 30, size: 20, components: []),
      ]);
      overlay.configure(
        const PatchMapSelectionStyle(
          strokeWidth: 4,
          minStrokeWidth: 2,
          strokeScale: PatchMapSelectionStrokeScale.viewport,
        ),
      );
      for (final (scale, width) in [
        (.25, 2.0),
        (.5, 2.0),
        (1.0, 4.0),
        (2.0, 4.0),
      ]) {
        final image = await support.render(
          overlay,
          geometry,
          ['a'],
          scale: scale,
          camera: true,
        );
        var coverage = 0.0;
        for (var x = 0; x < 128; x++) {
          coverage += support.pixel(image, x, 64)[3] / 255;
        }
        expect(coverage, closeTo(width * 2, .05), reason: 'scale=$scale');
      }
    },
  );

  test(
    'inside/outside bands keep correct placement, holes and overlap alpha',
    () async {
      final overlay = SelectionOverlay(palette: ColorResolver());
      addTearDown(overlay.dispose);
      final geometry = support.snapshot([
        support.item('a', x: 30, y: 30, size: 20, components: []),
        support.item('b', x: 30, y: 30, size: 20, components: []),
      ]);
      for (final alignment in [
        PatchMapSelectionStrokeAlignment.inside,
        PatchMapSelectionStrokeAlignment.outside,
      ]) {
        overlay.configure(
          PatchMapSelectionStyle(
            color: const Color(0x802f80ed),
            strokeWidth: 4,
            displayMode: PatchMapSelectionDisplayMode.elementOnly,
            strokeAlignment: alignment,
          ),
        );
        final image = await support.render(overlay, geometry, ['a', 'b']);
        final inside = alignment == PatchMapSelectionStrokeAlignment.inside;
        expect(support.pixel(image, 28, 40)[3], inside ? 0 : 128);
        expect(support.pixel(image, 32, 40)[3], inside ? 128 : 0);
        expect(support.pixel(image, 40, 40)[3], 0);
        expect(await support.render(overlay, geometry, ['a']), image);
      }
      overlay.configure(
        const PatchMapSelectionStyle(
          strokeWidth: 20,
          strokeAlignment: PatchMapSelectionStrokeAlignment.inside,
        ),
      );
      final filled = await support.render(overlay, geometry, ['a']);
      expect(support.pixel(filled, 40, 40)[3], 255);
      expect(support.pixel(filled, 29, 40)[3], 0);
    },
  );

  test(
    'aligned border remains uniform under reflection, shear and camera rotation',
    () async {
      final overlay = SelectionOverlay(palette: ColorResolver());
      addTearDown(overlay.dispose);
      for (final sx in [-1.0, 1.0]) {
        final geometry = support.snapshot([
          {
            'type': 'group',
            'id': 'parent',
            'attrs': {'x': 60, 'y': 40, 'scaleX': 1.2, 'scaleY': .8},
            'children': [
              {
                ...support.item('a', size: 20, components: []),
                'attrs': {'angle': 30, 'scaleX': sx},
              },
            ],
          },
        ]);
        final quad = selectionQuad(
          geometry['a']!,
          palette: ColorResolver(),
          cameraRotation: .4,
        )!;
        final expanded = offsetSelectionQuad(quad, 3)!;
        for (var i = 0; i < 4; i++) {
          final edge = quad.vertex(i + 1) - quad.vertex(i);
          final delta = expanded.vertex(i) - quad.vertex(i);
          expect(
            cross(edge, delta).abs() / math.sqrt(edge.distanceSquared),
            closeTo(3, 1e-8),
          );
        }
        overlay.configure(
          const PatchMapSelectionStyle(
            strokeWidth: 3,
            strokeAlignment: PatchMapSelectionStrokeAlignment.outside,
          ),
        );
        final actual = await support.render(
          overlay,
          geometry,
          ['a'],
          rotation: .4,
          camera: true,
        );
        final expected = await support.pixels(
          (canvas) {
            Path path(Quad q) => Path()..addPolygon(support.vertices(q), true);
            canvas.drawPath(
              Path.combine(
                PathOperation.difference,
                path(expanded),
                path(quad),
              ),
              Paint()..color = const Color(0xff2f80ed),
            );
          },
          rotation: .4,
          camera: true,
        );
        // Different contour tessellation may change edge rounding by one unit.
        expect(
          List.generate(
            actual.length,
            (i) => (actual[i] - expected[i]).abs(),
          ).reduce(math.max),
          lessThanOrEqualTo(1),
        );
      }
    },
  );

  test('invalid configuration cannot replace the last valid style', () async {
    final overlay = SelectionOverlay(palette: ColorResolver());
    addTearDown(overlay.dispose);
    final geometry = support.snapshot([support.item('a')]);
    final before = await support.render(overlay, geometry, ['a']);
    for (final style in [
      const PatchMapSelectionStyle(strokeWidth: 0),
      const PatchMapSelectionStyle(strokeWidth: double.nan),
      const PatchMapSelectionStyle(minStrokeWidth: double.infinity),
      const PatchMapSelectionStyle(minStrokeWidth: -1),
      const PatchMapSelectionStyle(strokeWidth: .5),
    ]) {
      expect(() => overlay.configure(style), throwsArgumentError);
    }
    expect(await support.render(overlay, geometry, ['a']), before);
  });
}
