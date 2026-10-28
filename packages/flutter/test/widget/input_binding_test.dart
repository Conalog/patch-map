import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'patch_map_view_test.dart' as support;
import 'selection_paint_test.dart' as pixels;

void main() {
  testWidgets('tap detects objects and host callback alone chooses selection', (
    tester,
  ) async {
    final controller = PatchMapController(), events = <PatchMapInputEvent>[];
    await tester.pumpWidget(
      support.host(
        controller,
        event: (event) {
          events.add(event);
          if (event.kind == PatchMapInputKind.tap) {
            controller.select([event.target!.id]);
          }
        },
      ),
    );
    final draw = controller.draw(support.rectangle('a'));
    await support.progress(tester);
    await draw;
    final center = tester.getCenter(find.byType(PatchMapView));
    await tester.tapAt(center);
    await tester.pump(const Duration(milliseconds: 350));
    expect(
      events.where((e) => e.kind == PatchMapInputKind.tap).single.target!.id,
      'a',
    );
    expect(controller.selected.single.id, 'a');
    expect(
      events.where((e) => e.kind == PatchMapInputKind.selectionChange).length,
      1,
    );
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets(
    'range callback changes selection, camera and values through real paint',
    (tester) async {
      final controller = PatchMapController();
      Future<PatchMapResult>? update;
      var moves = 0, completed = false;
      await tester.pumpWidget(
        support.host(
          controller,
          dragMode: PatchMapDragMode.range,
          event: (event) {
            if (event.kind != PatchMapInputKind.dragMove) return;
            moves++;
            controller.select(event.objects.map((object) => object.id));
            controller.setCamera(center: const Offset(50, 50), scale: 2);
            update = controller
                .updateValues([
                  const PatchMapUpdate(PatchMapTarget('a'), {
                    'fill': '#00aa00',
                  }),
                ])
                .then((result) {
                  completed = true;
                  return result;
                });
            expect(
              completed,
              false,
              reason: 'callback delivery is not submission',
            );
          },
        ),
      );
      final drawn = controller.draw(support.rectangle('a'));
      await support.progress(tester);
      await drawn;
      controller.setCamera(center: const Offset(50, 50), scale: 1);
      await tester.pump();
      final center = tester.getCenter(find.byType(PatchMapView));
      final gesture = await tester.startGesture(center - const Offset(70, 70));
      await gesture.moveTo(center + const Offset(70, 70));
      expect(moves, 0);
      await tester.pump();
      expect(moves, 1);
      await support.progress(tester);
      expect((await update!).outcome, PatchMapOutcome.applied);
      expect(controller.selected.single.id, 'a');
      expect(controller.camera!.scale, 2);
      expect(await pixels.bluePixels(tester), greaterThan(100));
      expect(
        await pixels.coloredPixels(tester, const Color(0xff00aa00)),
        greaterThan(30000),
      );
      await gesture.up();
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets('filter cannot change camera or selection but can reject hit', (
    tester,
  ) async {
    final controller = PatchMapController(),
        results = <PatchMapOutcome>[],
        events = <PatchMapInputEvent>[];
    await tester.pumpWidget(
      support.host(
        controller,
        event: events.add,
        filter: (object) {
          results.add(controller.setCamera(scale: 3).outcome);
          results.add(controller.select([object.id]).outcome);
          return false;
        },
      ),
    );
    final draw = controller.draw(support.rectangle('a'));
    await support.progress(tester);
    await draw;
    final before = controller.toWorld(const Offset(0, 0));
    await tester.tapAt(tester.getCenter(find.byType(PatchMapView)));
    await tester.pump(const Duration(milliseconds: 350));
    expect(results, isNotEmpty);
    expect(results.every((v) => v == PatchMapOutcome.rejected), true);
    expect(controller.selected, isEmpty);
    expect(controller.toWorld(Offset.zero), before);
    expect(
      events.where((e) => e.kind == PatchMapInputKind.tap).single.target,
      isNull,
    );
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets(
    'raw pan is applied once and move notifications coalesce until frame',
    (tester) async {
      final controller = PatchMapController(), events = <PatchMapInputEvent>[];
      await tester.pumpWidget(support.host(controller, event: events.add));
      final draw = controller.draw(support.rectangle('a'));
      await support.progress(tester);
      await draw;
      controller.setCamera(center: Offset.zero, scale: 1, rotation: 0);
      final center = tester.getCenter(find.byType(PatchMapView));
      final gesture = await tester.startGesture(center);
      await gesture.moveTo(center + const Offset(30, 0));
      await gesture.moveTo(center + const Offset(40, 0));
      expect(
        events.where((e) => e.kind == PatchMapInputKind.dragMove),
        isEmpty,
      );
      await tester.pump();
      expect(
        events.where((e) => e.kind == PatchMapInputKind.dragMove).length,
        1,
      );
      await gesture.up();
      await tester.pump(const Duration(milliseconds: 350));
      expect(controller.toWorld(const Offset(200, 200)), const Offset(-40, 0));
      expect(
        events.where((e) => e.kind == PatchMapInputKind.dragEnd).single.reason,
        PatchMapEndReason.completed,
      );
      await tester.pumpWidget(const SizedBox());
    },
  );
}
