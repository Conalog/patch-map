import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'patch_map_view_test.dart' as support;
import 'stroke_compatibility_test.dart' show pixels;

void main() {
  testWidgets(
    'background updates keep border-only viewport visible without changing item bounds',
    (tester) async {
      final controller = PatchMapController();
      await tester.pumpWidget(support.host(controller));
      final draw = controller.draw([
        {
          'type': 'item',
          'id': 'a',
          'size': 20,
          'components': [
            {
              'type': 'background',
              'id': 'bg',
              'source': {
                'fill': '#ff0000',
                'borderColor': '#0000ff',
                'borderWidth': 4,
              },
            },
          ],
        },
      ]);
      await support.progress(tester);
      expect((await draw).outcome, PatchMapOutcome.applied);
      const logical = Rect.fromLTWH(0, 0, 20, 20);
      expect(controller.getGeometry('a')!.bounds, logical);
      expect(controller.getGeometry('a')!.paintBounds, logical.inflate(2));

      // The viewport ends at world x=-2: only a thick outer border can appear.
      controller.setCamera(center: const Offset(-202, 10), scale: 1);
      final camera = controller.toWorld(const Offset(200, 200));
      var finished = false;
      final grow = controller
          .updateValues([
            const PatchMapUpdate(PatchMapTarget('a', componentId: 'bg'), {
              'source': {'borderWidth': 20},
            }),
          ])
          .then((result) {
            finished = true;
            return result;
          });
      expect(finished, isFalse);
      await support.progress(tester);
      expect((await grow).outcome, PatchMapOutcome.applied);
      expect(controller.getGeometry('a')!.paintBounds, logical.inflate(10));
      var image = await pixels(tester);
      expect(image.sublist((200 * 400 + 397) * 4, (200 * 400 + 398) * 4), [
        0,
        0,
        255,
        255,
      ]);

      // A component transform uses retained staging; it must include the outset.
      final move = controller.updateValues([
        const PatchMapUpdate(PatchMapTarget('a', componentId: 'bg'), {
          'attrs': {'x': 5},
        }),
      ]);
      await support.progress(tester);
      expect((await move).outcome, PatchMapOutcome.applied);
      expect(
        controller.getGeometry('a')!.paintBounds,
        const Rect.fromLTWH(-5, -10, 40, 40),
      );
      image = await pixels(tester);
      expect(image[(200 * 400 + 399) * 4 + 3], 255);

      final shrink = controller.updateValues([
        const PatchMapUpdate(PatchMapTarget('a', componentId: 'bg'), {
          'source': {'borderWidth': 0},
        }),
      ]);
      await support.progress(tester);
      expect((await shrink).outcome, PatchMapOutcome.applied);
      expect(
        controller.getGeometry('a')!.paintBounds,
        const Rect.fromLTWH(0, 0, 25, 20),
      );
      image = await pixels(tester);
      expect(image[(200 * 400 + 399) * 4 + 3], 0);
      expect(controller.getGeometry('a')!.bounds, logical);
      expect(controller.toWorld(const Offset(200, 200)), camera);
      expect(controller.phase, PatchMapPhase.ready);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
