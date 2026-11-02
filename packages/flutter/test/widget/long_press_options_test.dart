import 'dart:ui' show SemanticsAction;

import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'patch_map_view_test.dart' as support;

Widget host(
  PatchMapController controller,
  List<PatchMapInputEvent> events, {
  PatchMapGestureOptions gestures = const PatchMapGestureOptions(),
  bool active = true,
  PatchMapDragMode dragMode = PatchMapDragMode.pan,
}) => MediaQuery(
  data: const MediaQueryData(size: Size(400, 400)),
  child: Directionality(
    textDirection: TextDirection.ltr,
    child: Center(
      child: SizedBox(
        width: 400,
        height: 400,
        child: PatchMapView(
          controller: controller,
          gestures: gestures,
          active: active,
          dragMode: dragMode,
          onEvent: events.add,
        ),
      ),
    ),
  ),
);

Future<void> draw(WidgetTester tester, PatchMapController controller) async {
  final result = controller.draw(support.rectangle('a'));
  await support.progress(tester);
  expect((await result).outcome, PatchMapOutcome.applied);
}

Iterable<PatchMapInputEvent> holds(List<PatchMapInputEvent> events) =>
    events.where((event) => event.kind == PatchMapInputKind.longPress);

void main() {
  testWidgets('map retains tap and long press semantics actions', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    final controller = PatchMapController();
    await tester.pumpWidget(host(controller, []));
    await draw(tester, controller);
    final data = tester
        .getSemantics(find.byType(RawGestureDetector))
        .getSemanticsData();
    expect(data.hasAction(SemanticsAction.tap), isTrue);
    expect(data.hasAction(SemanticsAction.longPress), isTrue);
    await tester.pumpWidget(const SizedBox());
    semantics.dispose();
    expect(tester.takeException(), isNull);
  });

  for (final custom in [false, true]) {
    testWidgets('hold recognizes at ${custom ? 650 : 300}ms exactly once', (
      tester,
    ) async {
      final controller = PatchMapController(), events = <PatchMapInputEvent>[];
      final duration = Duration(milliseconds: custom ? 650 : 300);
      await tester.pumpWidget(
        host(
          controller,
          events,
          gestures: custom
              ? PatchMapGestureOptions(longPressDuration: duration)
              : const PatchMapGestureOptions(),
        ),
      );
      await draw(tester, controller);
      final gesture = await tester.startGesture(
        tester.getCenter(find.byType(PatchMapView)),
      );
      await tester.pump(duration - const Duration(milliseconds: 1));
      expect(holds(events), isEmpty);
      await tester.pump(const Duration(milliseconds: 1));
      expect(holds(events).single.target!.id, 'a');
      expect(controller.selected, isEmpty, reason: 'host owns selection');
      await tester.pump(const Duration(seconds: 1));
      await gesture.up();
      expect(holds(events).length, 1);
      expect(events.where((e) => e.kind == PatchMapInputKind.tap), isEmpty);
      await tester.pumpWidget(const SizedBox());
      expect(tester.takeException(), isNull);
    });
  }

  for (final durations in [(600, 100), (100, 600)]) {
    testWidgets('held press retains ${durations.$1}ms across rebuild', (
      tester,
    ) async {
      final controller = PatchMapController(), events = <PatchMapInputEvent>[];
      Widget configured(int milliseconds) => host(
        controller,
        events,
        gestures: PatchMapGestureOptions(
          longPressDuration: Duration(milliseconds: milliseconds),
        ),
      );
      await tester.pumpWidget(configured(durations.$1));
      await draw(tester, controller);
      final center = tester.getCenter(find.byType(PatchMapView));
      final first = await tester.startGesture(center);
      await tester.pump(const Duration(milliseconds: 50));
      await tester.pumpWidget(configured(durations.$2));
      await tester.pump(Duration(milliseconds: durations.$1 - 51));
      expect(holds(events), isEmpty);
      await tester.pump(const Duration(milliseconds: 1));
      expect(holds(events).length, 1);
      await first.up();
      final next = await tester.startGesture(center);
      await tester.pump(Duration(milliseconds: durations.$2 - 1));
      expect(holds(events).length, 1);
      await tester.pump(const Duration(milliseconds: 1));
      expect(holds(events).length, 2);
      await next.up();
      await tester.pumpWidget(const SizedBox());
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('zero hold is asynchronous and negative values are rejected', (
    tester,
  ) async {
    final controller = PatchMapController(), events = <PatchMapInputEvent>[];
    const invalid = PatchMapGestureOptions(
      longPressDuration: Duration(milliseconds: -1),
    );
    await tester.pumpWidget(host(controller, events, gestures: invalid));
    expect(tester.takeException(), isArgumentError);
    expect(controller.isAttached, isFalse);
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(
      host(
        controller,
        events,
        gestures: const PatchMapGestureOptions(
          longPressDuration: Duration.zero,
        ),
      ),
    );
    await draw(tester, controller);
    await tester.pumpWidget(host(controller, events, gestures: invalid));
    expect(tester.takeException(), isArgumentError);
    final gesture = await tester.startGesture(
      tester.getCenter(find.byType(PatchMapView)),
    );
    expect(holds(events), isEmpty);
    await tester.pump(Duration.zero);
    expect(holds(events).length, 1, reason: 'last valid options survive');
    await gesture.up();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.pumpWidget(const SizedBox());
    expect(tester.takeException(), isNull);
  });

  testWidgets('long press can switch the held pointer from pan to paint', (
    tester,
  ) async {
    final controller = PatchMapController(), events = <PatchMapInputEvent>[];
    await tester.pumpWidget(host(controller, events));
    await draw(tester, controller);
    final camera = controller.camera!;
    final center = tester.getCenter(find.byType(PatchMapView));
    final gesture = await tester.startGesture(center);
    await tester.pump(const Duration(milliseconds: 300));
    expect(holds(events).length, 1);
    await tester.pumpWidget(
      host(controller, events, dragMode: PatchMapDragMode.paint),
    );
    await gesture.moveTo(center + const Offset(40, 0));
    await tester.pump();
    await gesture.up();
    final end = events.where((e) => e.kind == PatchMapInputKind.dragEnd).single;
    expect(end.mode, PatchMapDragMode.paint);
    expect(end.reason, PatchMapEndReason.completed);
    expect(controller.camera, same(camera));
    await tester.pumpWidget(const SizedBox());
    expect(tester.takeException(), isNull);
  });

  testWidgets('slow pinch survives the hold deadline and a value update', (
    tester,
  ) async {
    final controller = PatchMapController(), events = <PatchMapInputEvent>[];
    await tester.pumpWidget(host(controller, events));
    await draw(tester, controller);
    final center = tester.getCenter(find.byType(PatchMapView));
    final scale = controller.camera!.scale;
    final a = await tester.startGesture(
      center - const Offset(35, 0),
      pointer: 1,
    );
    final b = await tester.startGesture(
      center + const Offset(35, 0),
      pointer: 2,
    );
    await tester.pump(const Duration(milliseconds: 100));
    final update = controller.updateValues(const [
      PatchMapUpdate(PatchMapTarget('a'), {'fill': '#00ff00'}),
    ]);
    await support.progress(tester);
    expect((await update).outcome, PatchMapOutcome.applied);
    // Neither pointer crosses slop until after the 300ms hold timer.
    await tester.pump(const Duration(milliseconds: 200));
    expect(holds(events), isEmpty);
    for (final span in [70.0, 100.0, 130.0]) {
      await a.moveTo(center - Offset(span, 0));
      await b.moveTo(center + Offset(span, 0));
      await tester.pump();
    }
    expect(controller.camera!.scale, greaterThan(scale));
    expect(controller.getValue(const PatchMapTarget('a'))!['fill'], '#00ff00');
    await a.up();
    await b.up();
    await tester.pumpWidget(const SizedBox());
    expect(tester.takeException(), isNull);
  });

  for (final firstHeld in [false, true]) {
    testWidgets(
      'multiple pointers reset before the next hold (held=$firstHeld)',
      (tester) async {
        final controller = PatchMapController(),
            events = <PatchMapInputEvent>[];
        await tester.pumpWidget(host(controller, events));
        await draw(tester, controller);
        final center = tester.getCenter(find.byType(PatchMapView));
        final a = await tester.startGesture(center, pointer: 1);
        await tester.pump(Duration(milliseconds: firstHeld ? 300 : 100));
        expect(holds(events).length, firstHeld ? 1 : 0);
        final b = await tester.startGesture(
          center + const Offset(20, 0),
          pointer: 2,
        );
        await a.up();
        await tester.pump(const Duration(milliseconds: 350));
        expect(holds(events).length, firstHeld ? 1 : 0);
        final c = await tester.startGesture(center, pointer: 3);
        await c.cancel();
        await b.up();
        events.clear();
        final next = await tester.startGesture(center, pointer: 4);
        await tester.pump(const Duration(milliseconds: 299));
        expect(holds(events), isEmpty);
        await tester.pump(const Duration(milliseconds: 1));
        expect(holds(events).single.target!.id, 'a');
        await next.up();
        await tester.pumpWidget(const SizedBox());
        expect(tester.takeException(), isNull);
      },
    );
  }

  for (final interruption in [
    'move',
    'cancel',
    'inactive',
    'replace',
    'remove',
  ]) {
    testWidgets('$interruption before deadline suppresses long press', (
      tester,
    ) async {
      final controller = PatchMapController(), events = <PatchMapInputEvent>[];
      await tester.pumpWidget(host(controller, events));
      await draw(tester, controller);
      final center = tester.getCenter(find.byType(PatchMapView));
      final gesture = await tester.startGesture(center);
      await tester.pump(const Duration(milliseconds: 100));
      switch (interruption) {
        case 'move':
          await gesture.moveTo(center + const Offset(50, 0));
        case 'cancel':
          await gesture.cancel();
        case 'inactive':
          await tester.pumpWidget(host(controller, events, active: false));
        case 'replace':
          await draw(tester, controller);
        case 'remove':
          await tester.pumpWidget(const SizedBox());
      }
      await tester.pump(const Duration(seconds: 1));
      expect(holds(events), isEmpty);
      if (interruption != 'cancel') await gesture.up();
      await tester.pumpWidget(const SizedBox());
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('double tap and secondary tap retain their recognition', (
    tester,
  ) async {
    final controller = PatchMapController(), events = <PatchMapInputEvent>[];
    await tester.pumpWidget(host(controller, events));
    await draw(tester, controller);
    final center = tester.getCenter(find.byType(PatchMapView));
    await tester.tapAt(center);
    await tester.pump(const Duration(milliseconds: 60));
    await tester.tapAt(center);
    expect(
      events.where((e) => e.kind == PatchMapInputKind.doubleTap).length,
      1,
    );
    final secondary = await tester.startGesture(
      center,
      kind: PointerDeviceKind.mouse,
      buttons: kSecondaryMouseButton,
    );
    await secondary.up();
    expect(
      events.where((e) => e.kind == PatchMapInputKind.secondaryTap).length,
      1,
    );
    expect(holds(events), isEmpty);
    await tester.pump(const Duration(milliseconds: 50));
    await tester.pumpWidget(const SizedBox());
    expect(tester.takeException(), isNull);
  });
}
