import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'long_press_options_test.dart' as support;

const _enabled = PatchMapGestureOptions(doubleTapDragZoomEnabled: true);

void main() {
  testWidgets(
    'second vertical drag zooms at its down point and reverses at the limit',
    (tester) async {
      final map = await _mount(
        tester,
        zoomLimits: const PatchMapZoomLimits(maxScale: 8),
      );
      final anchor = map.center + const Offset(25, 0);
      final initial = map.controller.camera!;
      final second = await _secondTouch(tester, anchor);
      await second.moveBy(const Offset(0, 19));
      expect(map.controller.camera, initial);
      await second.moveBy(const Offset(0, 160));
      expect(map.controller.camera!.scale, closeTo(initial.scale * 2, 1e-10));
      final worldAtAnchor = initial.center.dx + 25 / initial.scale;
      expect(
        map.controller.camera!.center.dx + 25 / map.controller.camera!.scale,
        closeTo(worldAtAnchor, 1e-10),
      );
      await second.moveBy(const Offset(0, 160));
      expect(map.controller.camera!.scale, 8);
      await second.moveBy(const Offset(0, 160));
      expect(map.controller.camera!.scale, 8);
      await second.moveBy(const Offset(0, -160));
      expect(map.controller.camera!.scale, 4);
      await second.up();
      expect(map.kinds, [
        PatchMapInputKind.down,
        PatchMapInputKind.up,
        PatchMapInputKind.down,
      ]);
      await _finish(tester);
    },
  );

  for (final releaseFirst in [true, false]) {
    testWidgets(
      'active zoom hands off to pinch and waits for all up ($releaseFirst)',
      (tester) async {
        final map = await _mount(tester);
        final second = await _secondTouch(tester, map.center);
        await second.moveBy(const Offset(0, 19));
        await second.moveBy(const Offset(0, 12));
        final zoomed = map.controller.camera!;
        final other = await tester.startGesture(
          map.center + const Offset(50, 31),
        );
        expect(map.controller.camera, zoomed);
        await tester.pump(const Duration(milliseconds: 320));
        await other.moveBy(const Offset(3, 0));
        expect(map.controller.camera, zoomed);
        await other.moveBy(const Offset(30, 0));
        await other.moveBy(const Offset(30, 0));
        expect(map.controller.camera!.scale, greaterThan(zoomed.scale));
        await (releaseFirst ? second : other).up();
        final pinched = map.controller.camera!;
        await (releaseFirst ? other : second).moveBy(const Offset(0, 70));
        expect(map.controller.camera, pinched);
        await (releaseFirst ? other : second).up();
        expect(map.kinds, [
          PatchMapInputKind.down,
          PatchMapInputKind.up,
          PatchMapInputKind.down,
        ]);
        await _finish(tester);
      },
    );
  }

  testWidgets(
    'plain double tap, both holds and horizontal fallback keep their events',
    (tester) async {
      final map = await _mount(tester);
      final initial = map.controller.camera!;
      final doubleTap = await _secondTouch(tester, map.center);
      await doubleTap.up();
      expect(map.kinds.last, PatchMapInputKind.doubleTap);
      expect(map.controller.camera, initial);

      final singleHold = await tester.startGesture(map.center);
      await tester.pump(const Duration(milliseconds: 300));
      expect(map.kinds.last, PatchMapInputKind.longPress);
      await singleHold.up();

      final secondHold = await _secondTouch(tester, map.center);
      await tester.pump(const Duration(milliseconds: 300));
      expect(map.kinds.last, PatchMapInputKind.longPress);
      await secondHold.moveBy(const Offset(0, 50));
      expect(map.kinds.last, PatchMapInputKind.dragStart);
      await secondHold.up();
      expect(map.kinds.last, PatchMapInputKind.dragEnd);

      final horizontal = await _secondTouch(tester, map.center);
      await horizontal.moveBy(const Offset(20, 10));
      expect(map.kinds.last, PatchMapInputKind.dragStart);
      await horizontal.moveBy(const Offset(0, 60));
      await horizontal.up();
      expect(map.kinds.last, PatchMapInputKind.dragEnd);
      expect(map.controller.camera!.scale, initial.scale);
      await _finish(tester);
    },
  );

  for (final mode in PatchMapDragMode.values) {
    testWidgets(
      'non-opted-in pan and opted-in edit modes keep vertical drags: $mode',
      (tester) async {
        final map = await _mount(
          tester,
          gestures: mode == PatchMapDragMode.pan
              ? const PatchMapGestureOptions()
              : _enabled,
          dragMode: mode,
        );
        final initial = map.controller.camera!;
        final second = await _secondTouch(tester, map.center);
        await second.moveBy(const Offset(0, 30));
        await second.moveBy(const Offset(0, 30));
        await second.up();
        expect(map.events.last.kind, PatchMapInputKind.dragEnd);
        expect(map.events.last.mode, mode);
        expect(map.controller.camera!.scale, initial.scale);
        await _finish(tester);
      },
    );
  }

  testWidgets(
    'nearby touch after a mouse tap or unrelated tap falls back to pan',
    (tester) async {
      final map = await _mount(tester);
      final initial = map.controller.camera!;
      final mouse = await tester.startGesture(
        map.center,
        kind: PointerDeviceKind.mouse,
      );
      await mouse.up();
      await tester.pump(const Duration(milliseconds: 60));
      final afterMouse = await tester.startGesture(map.center);
      await afterMouse.moveBy(const Offset(0, 28));
      await afterMouse.up();
      expect(map.kinds.last, PatchMapInputKind.dragEnd);

      await tester.tapAt(map.center - const Offset(100, 0));
      await tester.pump(const Duration(milliseconds: 60));
      await tester.tapAt(map.center + const Offset(1, 0));
      await tester.pump(const Duration(milliseconds: 60));
      final afterUnrelated = await tester.startGesture(map.center);
      await afterUnrelated.moveBy(const Offset(0, 27));
      await afterUnrelated.up();
      expect(map.kinds.last, PatchMapInputKind.dragEnd);
      expect(map.controller.camera!.scale, initial.scale);
      await _finish(tester);
    },
  );

  testWidgets('replacement clears the first tap and accepts new single taps', (
    tester,
  ) async {
    final map = await _mount(tester);
    await tester.tapAt(map.center);
    await tester.pump(const Duration(milliseconds: 60));
    await support.draw(tester, map.controller);
    map.events.clear();
    await tester.tapAt(map.center);
    await tester.pump(const Duration(milliseconds: 300));
    expect(map.kinds, [
      PatchMapInputKind.down,
      PatchMapInputKind.up,
      PatchMapInputKind.tap,
    ]);
    await _finish(tester);
  });

  testWidgets(
    'ordinary double tap keeps the Flutter timing and wider distance',
    (tester) async {
      final map = await _mount(tester);
      final first = await tester.startGesture(map.center);
      await tester.pump(const Duration(milliseconds: 50));
      await first.up();
      await tester.pump(const Duration(milliseconds: 5));
      await tester.tapAt(map.center + const Offset(30, 0));
      expect(map.kinds, [
        PatchMapInputKind.down,
        PatchMapInputKind.up,
        PatchMapInputKind.down,
        PatchMapInputKind.up,
        PatchMapInputKind.doubleTap,
      ]);
      await _finish(tester);
    },
  );

  testWidgets('zoom permission off lets the same vertical sequence pan', (
    tester,
  ) async {
    final map = await _mount(
      tester,
      gestures: const PatchMapGestureOptions(
        zoomEnabled: false,
        doubleTapDragZoomEnabled: true,
      ),
    );
    final before = map.controller.camera!;
    final second = await _secondTouch(tester, map.center);
    await second.moveBy(const Offset(0, 20));
    expect(map.kinds.last, PatchMapInputKind.dragStart);
    expect(map.controller.camera!.center, isNot(before.center));
    expect(map.controller.camera!.scale, before.scale);
    await second.up();
    await _finish(tester);
  });

  testWidgets(
    'camera command ends zoom without promoting the held finger to pan',
    (tester) async {
      final map = await _mount(tester);
      final second = await _secondTouch(tester, map.center);
      await second.moveBy(const Offset(0, 19));
      await second.moveBy(const Offset(0, 30));
      map.controller.setCamera(center: const Offset(10, 20), scale: 2);
      final commanded = map.controller.camera!;
      map.events.clear();
      await second.moveBy(const Offset(0, 50));
      await second.up();
      expect(map.controller.camera, commanded);
      expect(map.events, isEmpty);
      await _finish(tester);
    },
  );
}

Future<TestGesture> _secondTouch(WidgetTester tester, Offset at) async {
  await tester.tapAt(at);
  await tester.pump(const Duration(milliseconds: 60));
  return tester.startGesture(at);
}

Future<_Map> _mount(
  WidgetTester tester, {
  PatchMapGestureOptions gestures = _enabled,
  PatchMapZoomLimits zoomLimits = const PatchMapZoomLimits(),
  PatchMapDragMode dragMode = PatchMapDragMode.pan,
}) async {
  final controller = PatchMapController(), events = <PatchMapInputEvent>[];
  await tester.pumpWidget(
    support.host(
      controller,
      events,
      gestures: gestures,
      zoomLimits: zoomLimits,
      dragMode: dragMode,
    ),
  );
  await support.draw(tester, controller);
  return _Map(controller, events, tester.getCenter(find.byType(PatchMapView)));
}

Future<void> _finish(WidgetTester tester) async {
  await tester.pump(const Duration(milliseconds: 350));
  await tester.pumpWidget(const SizedBox());
  expect(tester.takeException(), isNull);
}

final class _Map {
  _Map(this.controller, this.events, this.center);

  final PatchMapController controller;
  final List<PatchMapInputEvent> events;
  final Offset center;
  List<PatchMapInputKind> get kinds =>
      events.map((event) => event.kind).toList();
}
