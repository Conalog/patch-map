import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'patch_map_view_test.dart' as support;

Future<void> submit(WidgetTester tester, Future<PatchMapResult> request) async {
  await support.progress(tester);
  expect((await request).outcome, PatchMapOutcome.applied);
}

void main() {
  testWidgets('relation marker updates change paint bounds independently', (
    tester,
  ) async {
    const target = PatchMapTarget('r');
    final controller = PatchMapController();
    await tester.pumpWidget(support.host(controller));
    await submit(
      tester,
      controller.draw([
        {'type': 'rect', 'id': 'a', 'size': 10},
        {
          'type': 'rect',
          'id': 'b',
          'size': 10,
          'attrs': {'x': 30},
        },
        {
          'type': 'relations',
          'id': 'r',
          'links': [
            {'source': 'a', 'target': 'b'},
          ],
          'style': {'width': 4, 'startMarker': 'circle'},
        },
      ]),
    );
    final before = controller.getGeometry('r')!;
    expect(before.paintBounds, const Rect.fromLTRB(-3, -3, 35, 13));
    await submit(
      tester,
      controller.updateValues(const [
        PatchMapUpdate(target, {
          'style': {'endMarker': 'diamond'},
        }),
      ]),
    );
    final both = controller.getGeometry('r')!;
    expect(both.paintBounds, const Rect.fromLTRB(-3, -3, 43, 13));
    expect(both.bounds, before.bounds);
    expect(
      controller.getValue(target)!['style'],
      containsPair('startMarker', 'circle'),
    );

    final invalid = await controller.updateValues(const [
      PatchMapUpdate(target, {
        'style': {'startMarker': 'none', 'endMarker': 'square'},
      }),
    ]);
    expect(invalid.outcome, PatchMapOutcome.rejected);
    expect(controller.getGeometry('r')!.paintBounds, both.paintBounds);

    await submit(
      tester,
      controller.updateValues(const [
        PatchMapUpdate(target, {
          'style': {'startMarker': 'none'},
        }),
        PatchMapUpdate(PatchMapTarget('b'), {
          'attrs': {'x': 50},
        }),
      ]),
    );
    expect(
      controller.getGeometry('r')!.paintBounds,
      const Rect.fromLTRB(5, -3, 63, 13),
    );
    expect(both.paintBounds, const Rect.fromLTRB(-3, -3, 43, 13));
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('reads are inert, world-based and detached from later updates', (
    tester,
  ) async {
    final controller = PatchMapController();
    expect(controller.getGeometry('a'), isNull);
    await tester.pumpWidget(support.host(controller));
    expect(controller.getGeometry('a'), isNull);
    final draw = controller.draw(support.rectangle('a'));
    expect(controller.getGeometry('a'), isNull);
    await submit(tester, draw);
    final before = controller.getGeometry('a')!;
    expect(before.bounds, const Rect.fromLTWH(0, 0, 100, 100));
    expect(before.center, const Offset(50, 50));
    expect(controller.getGeometry('absent'), isNull);
    controller.select(['a']);
    controller.setCamera(center: const Offset(20, 40), scale: 2, rotation: .3);
    await support.progress(tester);
    final camera = controller.camera;
    for (var i = 0; i < 100; i++) {
      final read = controller.getGeometry('a')!;
      expect(read.bounds, same(before.bounds));
      expect(read.origin, before.origin);
    }
    expect(tester.binding.hasScheduledFrame, isFalse);
    expect(controller.camera, same(camera));
    final point = before.corners!.bottomLeft;
    final roundTrip = controller.toWorld(controller.toLocal(point)!)!;
    expect((roundTrip - point).distance, lessThan(1e-9));

    final update = controller.updateValues(const [
      PatchMapUpdate(PatchMapTarget('a'), {
        'attrs': {'x': 10000, 'y': 30},
        'size': {'width': 50},
      }),
    ]);
    // Admission does not expose staged geometry before publication.
    expect(controller.getGeometry('a')!.bounds, before.bounds);
    await submit(tester, update);
    final after = controller.getGeometry('a')!;
    expect(after.bounds, const Rect.fromLTWH(10000, 30, 50, 100));
    expect(after.corners!.bottomLeft, const Offset(10000, 130));
    expect(before.bounds, const Rect.fromLTWH(0, 0, 100, 100));
    expect(before.corners!.bottomLeft, const Offset(0, 100));
    expect(controller.camera, same(camera));
    expect(controller.selected.single.id, 'a');
    final invalid = await controller.updateValues(const [
      PatchMapUpdate(PatchMapTarget('a'), {'size': -1}),
    ]);
    expect(invalid.outcome, PatchMapOutcome.rejected);
    expect(controller.getGeometry('a')!.bounds, after.bounds);
    await tester.pumpWidget(const SizedBox());
    expect(controller.getGeometry('a'), isNull);
    expect(after.center, const Offset(10025, 80));
  });

  testWidgets(
    'inactivity, replacement and reattachment expose only the current map',
    (tester) async {
      final controller = PatchMapController();
      await tester.pumpWidget(support.host(controller));
      await submit(tester, controller.draw(support.rectangle('a')));
      await tester.pumpWidget(support.host(controller, active: false));
      final queued = controller.updateValues(const [
        PatchMapUpdate(PatchMapTarget('a'), {
          'attrs': {'x': 25},
        }),
      ]);
      await support.progress(tester, 2);
      expect(controller.getGeometry('a')!.origin, Offset.zero);
      await tester.pumpWidget(support.host(controller));
      await submit(tester, queued);
      expect(controller.getGeometry('a')!.origin, const Offset(25, 0));

      expect(
        (await controller.draw({'bad': true})).outcome,
        PatchMapOutcome.rejected,
      );
      expect(controller.getGeometry('a')!.origin, const Offset(25, 0));
      final replacement = controller.draw(support.rectangle('b'));
      expect(controller.getGeometry('a'), isNull);
      expect(controller.getGeometry('b'), isNull);
      await submit(tester, replacement);
      expect(controller.getGeometry('a'), isNull);
      expect(controller.getGeometry('b')!.origin, Offset.zero);
      await tester.pumpWidget(const SizedBox());
      await tester.pumpWidget(support.host(controller));
      expect(controller.getGeometry('b'), isNull);
      await submit(tester, controller.draw(support.rectangle('c')));
      expect(controller.getGeometry('c'), isNotNull);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
