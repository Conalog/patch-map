import 'dart:convert';
import 'dart:ui' as ui;
import 'package:flutter/widgets.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:conalog_patch_map/conalog_patch_map.dart';

Future<PatchMapController> controller() => PatchMapController.create(
  data: [
    {
      'type': 'rect',
      'id': 'r',
      'size': {'width': 30, 'height': 40},
      'fill': '#123456',
    },
  ],
  fit: false,
  width: 100,
  height: 100,
);
Widget surface(PatchMapController c) => MediaQuery(
  data: const MediaQueryData(devicePixelRatio: 1),
  child: Directionality(
    textDirection: TextDirection.ltr,
    child: Center(
      child: SizedBox(
        width: 100,
        height: 100,
        child: PatchMapView(controller: c),
      ),
    ),
  ),
);
void main() {
  testWidgets('Semantics activation selects without a pointer event', (
    tester,
  ) async {
    final handle = tester.ensureSemantics();
    final c = await controller();
    final pointerEvents = <Map<String, dynamic>>[];
    c.selection.onPointerChange(pointerEvents.add);
    await tester.pumpWidget(surface(c));
    await tester.pumpAndSettle();
    final node = find.semantics.byLabel('r').evaluate().single;
    node.owner!.performAction(
      node.id,
      ui.SemanticsAction.tap,
    );
    await tester.pumpAndSettle();
    expect(c.selection.ids, ['r']);
    expect(pointerEvents, isEmpty);
    await tester.pumpWidget(const SizedBox());
    await c.destroy();
    handle.dispose();
  });

  testWidgets(
    'native frame publishes ready, captures real PNG and stays idle',
    (tester) async {
      final c = await controller();
      await tester.pumpWidget(surface(c));
      await tester.pumpAndSettle();
      await c.ready;
      expect(tester.binding.transientCallbackCount, 0);
      final result = await tester.runAsync(
        () => c.capture.png().timeout(const Duration(seconds: 10)),
      );
      expect(result!.size, [100, 100]);
      expect(base64Decode(result.dataUrl.split(',').last).take(8), [
        137,
        80,
        78,
        71,
        13,
        10,
        26,
        10,
      ]);
      expect(tester.binding.transientCallbackCount, 0);
      await c.destroy();
      await tester.pumpWidget(const SizedBox());
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('capture refuses a boundary invalidated after publication', (
    tester,
  ) async {
    final c = await controller();
    await tester.pumpWidget(surface(c));
    await tester.pumpAndSettle();
    final boundary = tester.renderObject<RenderRepaintBoundary>(
      find.descendant(
        of: find.byType(PatchMapView),
        matching: find.byWidgetPredicate((widget) => widget is RepaintBoundary),
      ),
    );
    boundary.markNeedsPaint();
    await expectLater(
      c.capture.png(),
      throwsA(
        isA<PatchMapException>().having(
          (error) => error.code,
          'code',
          'NOT_READY',
        ),
      ),
    );
    await tester.pumpAndSettle();
    final png = await tester.runAsync(
      () => c.capture.png().timeout(const Duration(seconds: 3)),
    );
    expect(png!.size, [100, 100]);
    await c.destroy();
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets(
    'controller survives surface detach and reattach with selection',
    (tester) async {
      final c = await controller();
      await tester.pumpWidget(surface(c));
      await tester.pumpAndSettle();
      c.selection.set(['r']);
      await tester.pumpAndSettle();
      await tester.pumpWidget(const SizedBox());
      expect(c.destroyed, false);
      expect(c.attached, false);
      await tester.pumpWidget(surface(c));
      await tester.pumpAndSettle();
      expect(c.selection.ids, ['r']);
      expect(c.attached, true);
      await tester.pumpWidget(const SizedBox());
      await c.destroy();
      expect(tester.binding.transientCallbackCount, 0);
    },
  );
  testWidgets(
    'Semantics refreshes selection and geometry without rebuilding the host',
    (tester) async {
      final handle = tester.ensureSemantics();
      final c = await controller();
      await tester.pumpWidget(surface(c));
      await tester.pumpAndSettle();
      var node = find.semantics.byLabel('r').evaluate().single;
      expect(node.flagsCollection.isSelected, ui.Tristate.isFalse);
      final before = node.rect;
      c.selection.set(['r']);
      await tester.pumpAndSettle();
      node = find.semantics.byLabel('r').evaluate().single;
      expect(node.flagsCollection.isSelected, ui.Tristate.isTrue);
      c.viewport.zoomBy(2);
      await tester.pumpAndSettle();
      node = find.semantics.byLabel('r').evaluate().single;
      expect(node.rect.size, before.size * 2);
      c.data.replace(<Object>[]);
      await tester.pumpAndSettle();
      expect(find.semantics.byLabel('r').evaluate(), isEmpty);
      await tester.pumpWidget(const SizedBox());
      await c.destroy();
      handle.dispose();
    },
  );

  testWidgets(
    'native gesture commits taps and yields cleanly when parent wins',
    (tester) async {
      final c = await controller();
      await tester.pumpWidget(surface(c));
      await tester.pumpAndSettle();
      await tester.tapAt(
        tester.getTopLeft(find.byType(PatchMapView)) + const Offset(10, 10),
      );
      await tester.pumpAndSettle();
      expect(c.selection.ids, ['r']);
      c.selection.clear();
      await tester.pumpWidget(const SizedBox());
      await tester.pumpWidget(
        RawGestureDetector(
          gestures: {
            EagerGestureRecognizer:
                GestureRecognizerFactoryWithHandlers<EagerGestureRecognizer>(
                  EagerGestureRecognizer.new,
                  (_) {},
                ),
          },
          child: surface(c),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tapAt(
        tester.getTopLeft(find.byType(PatchMapView)) + const Offset(10, 10),
      );
      await tester.pumpAndSettle();
      expect(c.selection.ids, isEmpty);
      await tester.pumpWidget(const SizedBox());
      await c.destroy();
    },
  );

  testWidgets('manual surface keeps explicit logical size and DPR for PNG', (
    tester,
  ) async {
    final c = await controller();
    await tester.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(devicePixelRatio: 3),
        child: Directionality(
          textDirection: TextDirection.ltr,
          child: Center(
            child: SizedBox(
              width: 200,
              height: 200,
              child: PatchMapView(
                controller: c,
                resizeMode: PatchMapResizeMode.manual,
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(c.renderSnapshot.viewport.width, 100);
    expect(c.renderSnapshot.viewport.pixelRatio, 1);
    c.viewport.resize(120, 80, 2);
    await tester.pumpAndSettle();
    final result = await tester.runAsync(() => c.capture.png());
    final codec = await tester.runAsync(
      () => ui.instantiateImageCodec(
        base64Decode(result!.dataUrl.split(',').last),
      ),
    );
    final frame = await tester.runAsync(() => codec!.getNextFrame());
    expect(result!.size, [120, 80]);
    expect([frame!.image.width, frame.image.height], [240, 160]);
    frame.image.dispose();
    codec!.dispose();
    await tester.pumpWidget(const SizedBox());
    await c.destroy();
  });

  testWidgets('background cancels native input and resumes one idle frame', (
    tester,
  ) async {
    final c = await controller();
    await tester.pumpWidget(surface(c));
    await tester.pumpAndSettle();
    final gesture = await tester.startGesture(
      tester.getTopLeft(find.byType(PatchMapView)) + const Offset(10, 10),
    );
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    await gesture.up();
    await tester.pump();
    expect(c.selection.ids, isEmpty);
    expect(tester.binding.transientCallbackCount, 0);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(tester.binding.transientCallbackCount, 0);
    await tester.pumpWidget(const SizedBox());
    await c.destroy();
  });

  testWidgets('MediaQuery motion preference follows the attached controller', (
    tester,
  ) async {
    final c = await controller();
    Widget host(bool reduced) => MediaQuery(
      data: MediaQueryData(disableAnimations: reduced),
      child: Directionality(
        textDirection: TextDirection.ltr,
        child: Center(
          child: SizedBox(
            width: 100,
            height: 100,
            child: PatchMapView(controller: c),
          ),
        ),
      ),
    );
    await tester.pumpWidget(host(true));
    await tester.pumpAndSettle();
    expect(c.reducedMotion, true);
    await tester.pumpWidget(host(false));
    await tester.pumpAndSettle();
    expect(c.reducedMotion, false);
    await tester.pumpWidget(const SizedBox());
    await c.destroy();
  });
  testWidgets(
    'empty scene and independent surfaces publish and destroy separately',
    (tester) async {
      final empty = await PatchMapController.create(
        data: [],
        fit: false,
        width: 100,
        height: 100,
      );
      final populated = await controller();
      Widget host(bool both) => MediaQuery(
        data: const MediaQueryData(devicePixelRatio: 1),
        child: Directionality(
          textDirection: TextDirection.ltr,
          child: Row(
            children: [
              if (both)
                SizedBox(
                  key: const ValueKey('empty-slot'),
                  width: 100,
                  height: 100,
                  child: PatchMapView(
                    key: const ValueKey('empty'),
                    controller: empty,
                  ),
                ),
              SizedBox(
                key: const ValueKey('populated-slot'),
                width: 100,
                height: 100,
                child: PatchMapView(
                  key: const ValueKey('populated'),
                  controller: populated,
                ),
              ),
            ],
          ),
        ),
      );
      await tester.pumpWidget(host(true));
      await tester.pumpAndSettle();
      await empty.ready;
      await populated.ready;
      final image = await tester.runAsync(() => empty.capture.png());
      expect(image!.size, [100, 100]);
      await tester.pumpWidget(host(false));
      await empty.destroy();
      populated.selection.set(['r']);
      await tester.pumpAndSettle();
      expect(populated.attached, true);
      expect(populated.selection.ids, ['r']);
      await tester.pumpWidget(const SizedBox());
      await populated.destroy();
      expect(tester.binding.transientCallbackCount, 0);
    },
  );
  testWidgets(
    'initial projection failure settles ready and capture and releases the host',
    (tester) async {
      final c = await PatchMapController.create(
        data: [
          {'type': 'text', 'id': 't', 'text': 'hello'},
        ],
        fit: false,
        textLayouter: (text, style, {frame, overflow, int split = 0}) =>
            throw StateError('projection failed'),
      );
      final errors = <Object>[];
      final readyFailure = expectLater(c.ready, throwsStateError);
      final captureFailure = expectLater(c.capture.png(), throwsStateError);
      await tester.pumpWidget(
        MediaQuery(
          data: const MediaQueryData(),
          child: Directionality(
            textDirection: TextDirection.ltr,
            child: PatchMapView(controller: c, onError: errors.add),
          ),
        ),
      );
      await tester.pump();
      await readyFailure;
      await captureFailure;
      expect(errors, hasLength(1));
      expect(c.attached, false);
      await tester.pumpWidget(const SizedBox());
      await c.destroy();
      expect(tester.takeException(), isNull);
      expect(tester.binding.transientCallbackCount, 0);
    },
  );
}
