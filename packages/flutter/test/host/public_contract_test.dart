import 'dart:convert';
import 'dart:ui' as ui;
import 'dart:math' as math;
import 'package:flutter/gestures.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patch_map/patch_map.dart';
import 'native_pointer_test.dart' as pointer;

void main() {
  testWidgets(
    'native pointer records complete event fields and finite selection callback policies',
    (tester) async {
      final resolverCalls = <Map<String, dynamic>>[];
      final (c, p) = await pointer.setup(
        pointer: {
          'hoverDuringPress': true,
          'tooltip': {'pinOnContextMenu': true, 'preventDefault': false},
        },
        selection: {
          'allowMultiple': true,
          'resolveModifierSelection': (Map<String, dynamic> input) {
            resolverCalls.add(input);
            return ['other', 'rect'];
          },
        },
      );
      final hover = <Map<String, dynamic>>[],
          tooltip = <Map<String, dynamic>>[],
          changes = <List<String>>[],
          pointerChanges = <Map<String, dynamic>>[];
      final disposers = [
        c.pointer.onHover(hover.add),
        c.pointer.onTooltip(tooltip.add),
        c.selection.onChange(changes.add),
        c.selection.onPointerChange(pointerChanges.add),
      ];
      p.hover(
        const PointerHoverEvent(
          pointer: 7,
          kind: PointerDeviceKind.stylus,
          position: Offset(10, 12),
        ),
      );
      expect(hover.single, {
        'type': 'hover',
        'target': {'id': 'rect'},
        'previousTarget': null,
        'anchor': [10.0, 12.0],
        'world': [10.0, 12.0],
        'pointerId': 7,
        'pointerType': 'pen',
        'modifiers': {
          'shift': false,
          'ctrl': false,
          'alt': false,
          'meta': false,
        },
      });
      expect(tooltip.single, {
        ...hover.single,
        'type': 'show',
        'pinned': false,
      });
      p.down(const PointerDownEvent(pointer: 7, position: Offset(10, 12)));
      expect(hover, hasLength(1));
      p.cancel(const PointerCancelEvent(pointer: 7, position: Offset(10, 12)));
      expect(hover.last['type'], 'leave');
      expect(hover.last['previousTarget'], {'id': 'rect'});
      expect(tooltip.last['type'], 'hide');
      c.selection.set(['other']);
      final keys = [
        LogicalKeyboardKey.controlLeft,
        LogicalKeyboardKey.metaLeft,
        LogicalKeyboardKey.altLeft,
        LogicalKeyboardKey.shiftLeft,
      ];
      for (final key in keys) await tester.sendKeyDownEvent(key);
      pointer.click(p, const Offset(10, 12));
      expect(resolverCalls.single, {
        'target': {'id': 'rect'},
        'currentIds': ['other'],
        'modifiers': {'shift': true, 'ctrl': true, 'alt': true, 'meta': true},
        'clickCount': 1,
      });
      expect(pointerChanges.single, {
        'source': 'pointer',
        'selected': [
          {'id': 'other'},
          {'id': 'rect'},
        ],
        'added': [
          {'id': 'rect'},
        ],
        'removed': [],
        'interactionRevision': c.renderSnapshot.revisions.interaction,
      });
      expect(changes.last, ['other', 'rect']);
      for (final key in keys.reversed) await tester.sendKeyUpEvent(key);
      c.selection.remove(['other']);
      c.selection.toggle(['rect']);
      c.selection.add(['other']);
      c.selection.clear();
      expect(changes.sublist(changes.length - 4), [
        ['rect'],
        [],
        ['other'],
        [],
      ]);
      expect(pointerChanges, hasLength(1));
      for (final dispose in disposers) dispose();
      final counts = [
        hover.length,
        tooltip.length,
        changes.length,
        pointerChanges.length,
      ];
      p.hover(const PointerHoverEvent(position: Offset(10, 12)));
      c.selection.set(['rect']);
      expect([
        hover.length,
        tooltip.length,
        changes.length,
        pointerChanges.length,
      ], counts);
      final (boxController, boxPointer) = await pointer.setup(
        selection: {
          'box': {'activationModifier': 'shift', 'partialIntersection': false},
        },
      );
      boxPointer.down(
        const PointerDownEvent(pointer: 9, position: Offset.zero),
      );
      boxPointer.move(
        const PointerMoveEvent(pointer: 9, position: Offset(35, 35)),
      );
      expect(boxPointer.marquee, isNull);
      boxPointer.cancel();
      boxController.viewport.restore({
        'centerWorld': [50, 50],
        'scale': 1,
      });
      await tester.sendKeyDownEvent(LogicalKeyboardKey.shiftLeft);
      boxPointer.down(
        const PointerDownEvent(pointer: 10, position: Offset.zero),
      );
      boxPointer.move(
        const PointerMoveEvent(pointer: 10, position: Offset(20, 20)),
      );
      await tester.sendKeyUpEvent(LogicalKeyboardKey.shiftLeft);
      boxPointer.up(
        const PointerUpEvent(pointer: 10, position: Offset(20, 20)),
      );
      expect(boxController.selection.ids, isEmpty);
      await tester.sendKeyDownEvent(LogicalKeyboardKey.shiftLeft);
      boxPointer.down(
        const PointerDownEvent(pointer: 11, position: Offset.zero),
      );
      boxPointer.move(
        const PointerMoveEvent(pointer: 11, position: Offset(35, 35)),
      );
      await tester.sendKeyUpEvent(LogicalKeyboardKey.shiftLeft);
      boxPointer.up(
        const PointerUpEvent(pointer: 11, position: Offset(35, 35)),
      );
      expect(boxController.selection.ids, ['rect']);
      boxPointer.dispose();
      await boxController.destroy();
      p.dispose();
      await c.destroy();
    },
  );

  testWidgets(
    'native surface options gate wheel input and expose detached diagnostic facts',
    (tester) async {
      final c = await PatchMapController.create(
        data: [
          {'type': 'rect', 'id': 'r', 'size': 20, 'fill': '#ffffff'},
        ],
        width: 100,
        height: 100,
        fit: false,
        instanceId: 'native-contract',
        selectionPolicy: {
          'visual': {
            'color': '#00ff00',
            'displayMode': 'element-only',
            'strokeWidth': 4,
            'strokeScale': 'viewport',
            'minStrokeWidth': 2,
            'strokeAlignment': 'inside',
          },
          'box': {
            'partialIntersection': false,
            'visual': {'color': '#ff0000', 'fillAlpha': 0.5, 'strokeWidth': 2},
          },
        },
        zoomLimits: [0.5, 4],
        viewportPolicy: {
          'initial': {
            'centerWorld': [50, 50],
            'scale': 1,
          },
          'wheel': {'activationModifier': 'control'},
        },
      );
      await tester.pumpWidget(
        MediaQuery(
          data: const MediaQueryData(devicePixelRatio: 1),
          child: Directionality(
            textDirection: TextDirection.ltr,
            child: Center(
              child: SizedBox(
                width: 100,
                height: 100,
                child: PatchMapView(
                  controller: c,
                  antialias: false,
                  background: const Color(0xff123456),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      final origin = tester.getTopLeft(find.byType(PatchMapView));
      final anchor = origin + const Offset(20, 30);
      await tester.sendEventToBinding(
        PointerScrollEvent(
          position: anchor,
          scrollDelta: const Offset(0, -100),
        ),
      );
      await tester.pumpAndSettle();
      expect(c.viewport.snapshot()['scale'], 1);
      await tester.sendKeyDownEvent(LogicalKeyboardKey.controlLeft);
      await tester.sendEventToBinding(
        PointerScrollEvent(
          position: anchor,
          scrollDelta: const Offset(0, -100),
        ),
      );
      await tester.sendKeyUpEvent(LogicalKeyboardKey.controlLeft);
      await tester.pumpAndSettle();
      expect(c.viewport.snapshot()['scale'], closeTo(math.exp(0.1), 1e-9));
      expect(c.viewport.screenToWorld(20, 30)[0], closeTo(20, 1e-9));
      expect(c.viewport.screenToWorld(20, 30)[1], closeTo(30, 1e-9));
      final debug = c.debug.snapshot();
      expect(debug['instanceId'], 'native-contract');
      expect(debug['lifecycle'], 'scene-ready');
      expect(debug['rootIds'], ['r']);
      expect(debug['semanticHash'], c.dataset.semanticHash);
      expect(debug['historyDepth'], 0);
      expect(debug['selectionIds'], isEmpty);
      expect(debug['zoomLimits'], [0.5, 4]);
      expect(debug['frameRevision'], greaterThan(0));
      expect(debug['pendingWork'], 0);
      expect(debug['publishedTuple'], c.renderSnapshot.revisions.toJson());
      expect(debug['revisions'], c.revisionStamp);
      expect(debug['datasetRef'], isNull);
      expect(debug['presentation'], {'revision': 0, 'layerCount': 0});
      expect(
        debug['facilities'],
        containsAll(['renderer', 'viewport', 'history', 'assets']),
      );
      expect(debug['resources']['canvasCount'], 1);
      expect(debug['resources']['renderer'], {
        'resolution': 1.0,
        'antialias': false,
        'background': 0xff123456,
        'backend': 'flutter-canvas',
      });
      expect(debug['resources']['canvas'], {
        'cssSize': [100.0, 100.0],
        'backingSize': [100, 100],
      });
      expect(debug['resources']['rendering']['visiblePrimitiveCount'], 1);
      (debug['rootIds'] as List).clear();
      expect(c.debug.snapshot()['rootIds'], ['r']);
      final settlements = <Map<String, dynamic>>[];
      final stopSettled = c.viewport.onSettled(settlements.add);
      final fit = c.viewport.reset(padding: 0).toJson();
      expect(fit, {
        'status': 'fallback:auto-fit',
        'changed': true,
        'viewport': {
          'centerWorld': [10.0, 10.0],
          'scale': 4.0,
          'screenBounds': [0.0, 0.0, 100.0, 100.0],
        },
        'fit': {
          'status': 'applied',
          'changed': true,
          'paddingCssPx': [0.0, 0.0],
          'viewport': {
            'centerWorld': [10.0, 10.0],
            'scale': 4.0,
            'screenBounds': [0.0, 0.0, 100.0, 100.0],
          },
          'contributors': [
            {
              'id': 'r',
              'worldBounds': [0.0, 0.0, 20.0, 20.0],
            },
          ],
          'applied': ['r'],
          'missing': [],
          'excluded': [],
          'duplicateCount': 0,
          'worldBounds': [0.0, 0.0, 20.0, 20.0],
        },
      });
      await tester.pump(const Duration(milliseconds: 101));
      expect(settlements, [
        {
          'centerWorld': [10.0, 10.0],
          'scale': 4.0,
          'screenBounds': [0.0, 0.0, 100.0, 100.0],
        },
      ]);
      stopSettled();
      expect(c.viewport.snapshot(), {'centerWorld': [10.0, 10.0], 'scale': 4.0});
      expect(c.viewport.fit(padding: 0).toJson(), {...(fit['fit'] as Map<String,dynamic>), 'changed': false});
      c.selection.set(['r']);
      await tester.pumpAndSettle();
      final gesture = await tester.startGesture(origin + const Offset(2, 2));
      await gesture.moveTo(origin + const Offset(8, 8));
      await tester.pumpAndSettle();
      final pixels = await tester.runAsync(() async {
        final capture = await c.capture.png();
        final codec = await ui.instantiateImageCodec(
          base64Decode(capture.dataUrl.split(',').last),
        );
        final frame = await codec.getNextFrame();
        try {
          final bytes = (await frame.image.toByteData(
            format: ui.ImageByteFormat.rawRgba,
          ))!;
          List<int> pixel(int x, int y) => List.generate(
            4,
            (channel) => bytes.getUint8((y * 100 + x) * 4 + channel),
          );
          return [pixel(12, 50), pixel(8, 50), pixel(5, 5), pixel(2, 5)];
        } finally {
          frame.image.dispose();
          codec.dispose();
        }
      });
      expect(pixels![0], [0, 255, 0, 255]);
      expect(pixels[1], [18, 52, 86, 255]);
      for (var channel = 0; channel < 3; channel++)
        expect(pixels[2][channel], closeTo([137, 26, 43][channel], 1));
      expect(pixels[2][3], 255);
      expect(pixels[3], [255, 0, 0, 255]);
      await gesture.cancel();
      await tester.pumpAndSettle();
      expect(c.selection.ids, ['r']);

      await tester.pumpWidget(const SizedBox());
      await c.destroy();
      expect(c.debug.snapshot()['lifecycle'], 'destroyed');
      await expectLater(
        PatchMapController.create(
          viewportPolicy: {
            'wheel': {'activationModifier': 'shift'},
          },
        ),
        throwsA(isA<PatchMapException>()),
      );
      await expectLater(
        PatchMapController.create(zoomLimits: [4, 0.5]),
        throwsA(isA<PatchMapException>()),
      );
    },
  );
}
