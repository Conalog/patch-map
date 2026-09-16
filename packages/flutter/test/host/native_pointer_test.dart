import 'dart:convert';
import 'dart:io';
import 'package:flutter/gestures.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:conalog_patch_map/src/engine/controller.dart';
import 'package:conalog_patch_map/src/engine/ports.dart';
import 'package:conalog_patch_map/src/api/values.dart';
import 'package:conalog_patch_map/src/host/native_pointer.dart';

class _Surface implements PatchMapSurfacePort {
  @override
  bool prepare(PatchMapRenderSnapshot snapshot) => true;
  @override
  void requestFrame() {}
  @override
  Future<void> dispose() async {}
  @override
  Future<PatchMapCaptureResult> capture(PatchMapRenderSnapshot snapshot) =>
      throw UnimplementedError('No capture in pointer-only surface');
}

Future<(PatchMapController, NativePointerBinding)> setup({
  Map<String, dynamic> selection = const {},
  Map<String, dynamic> pointer = const {},
  List<Map<String, dynamic>>? data,
}) async {
  final c = await PatchMapController.create(
    data:
        data ??
        [
          {
            'type': 'rect',
            'id': 'rect',
            'size': {'width': 30, 'height': 30},
          },
          {
            'type': 'rect',
            'id': 'other',
            'attrs': {'x': 60},
            'size': {'width': 10, 'height': 10},
          },
        ],
    fit: false,
    width: 100,
    height: 100,
    selectionPolicy: selection,
    pointerPolicy: pointer,
  );
  c.attach(_Surface());
  c.frameConfirmed(c.revisions);
  final binding = NativePointerBinding(c, (p) {
    final hit = c.renderSnapshot.geometry.hitTest(p.dx, p.dy);
    return hit == null ? null : PatchMapTarget(hit.id);
  }, () {});
  addTearDown(() async {
    binding.dispose();
    await c.destroy();
  });
  return (c, binding);
}

void click(
  NativePointerBinding p,
  Offset at, {
  int time = 0,
  int buttons = kPrimaryButton,
}) {
  p.down(
    PointerDownEvent(
      pointer: 1,
      position: at,
      timeStamp: Duration(milliseconds: time),
      buttons: buttons,
    ),
  );
  p.up(
    PointerUpEvent(
      pointer: 1,
      position: at,
      timeStamp: Duration(milliseconds: time + 10),
    ),
  );
}

void main() {
  test(
    'throwing box predicate clears marquee and preserves selection',
    () async {
      final (c, p) = await setup(
        selection: {
          'box': true,
          'isSelectable': (Map<String, dynamic> _) =>
              throw StateError('predicate'),
        },
      );
      c.selection.set(['rect']);
      p.down(const PointerDownEvent(pointer: 1, position: Offset(0, 0)));
      p.move(const PointerMoveEvent(pointer: 1, position: Offset(90, 90)));
      expect(p.marquee, isNotNull);
      expect(
        () => p.up(const PointerUpEvent(pointer: 1, position: Offset(90, 90))),
        throwsStateError,
      );
      expect(p.marquee, isNull);
      expect(c.selection.ids, ['rect']);
    },
  );

  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'single selection box and editing modes preserve pointer policy',
    () async {
      final (c, p) = await setup(
        selection: {'box': true, 'allowMultiple': false},
      );
      p.down(const PointerDownEvent(pointer: 1, position: Offset(0, 0)));
      p.move(const PointerMoveEvent(pointer: 1, position: Offset(90, 90)));
      p.up(const PointerUpEvent(pointer: 1, position: Offset(90, 90)));
      expect(c.selection.ids.length, 1);
      c.data.replace([
        ...c.data.snapshot(),
        {
          'type': 'grid',
          'id': 'g',
          'cells': [
            [1],
          ],
          'item': {'size': 10},
        },
      ], fit: false);
      c.editor.execute({'type': 'enter-grid-edit', 'target': 'g'});
      final selected = c.selection.ids;
      click(p, const Offset(10, 10));
      expect(c.selection.ids, selected);
      p.down(const PointerDownEvent(pointer: 1, position: Offset(0, 0)));
      p.move(const PointerMoveEvent(pointer: 1, position: Offset(90, 90)));
      p.up(const PointerUpEvent(pointer: 1, position: Offset(90, 90)));
      expect(c.selection.ids, selected);
    },
  );
  test(
    'replacement invalidates same-id press and clears pinned tooltip',
    () async {
      final (c, p) = await setup(
        pointer: {
          'tooltip': {'pinOnContextMenu': true},
        },
      );
      final tooltip = <Map<String, dynamic>>[];
      c.pointer.onTooltip(tooltip.add);
      p.down(const PointerDownEvent(pointer: 1, position: Offset(10, 10)));
      c.data.replace(c.data.snapshot(), fit: false);
      p.up(const PointerUpEvent(pointer: 1, position: Offset(10, 10)));
      expect(c.selection.ids, isEmpty);
      p.down(
        const PointerDownEvent(
          pointer: 2,
          position: Offset(10, 10),
          buttons: kSecondaryMouseButton,
        ),
      );
      p.up(const PointerUpEvent(pointer: 2, position: Offset(10, 10)));
      expect(tooltip.last['type'], 'pin');
      c.data.replace(c.data.snapshot(), fit: false);
      p.syncDataset();
      expect(tooltip.last['type'], 'hide');
    },
  );
  test('trackpad pan and zoom use incremental deltas and one anchor', () async {
    final (c, p) = await setup();
    p.panZoomStart(const PointerPanZoomStartEvent(position: Offset(50, 50)));
    p.panZoomUpdate(
      const PointerPanZoomUpdateEvent(
        position: Offset(50, 50),
        pan: Offset(10, 0),
        scale: 2,
      ),
    );
    expect(c.viewport.snapshot()['scale'], 2);
    p.panZoomUpdate(
      const PointerPanZoomUpdateEvent(
        position: Offset(50, 50),
        pan: Offset(10, 0),
        scale: 2,
      ),
    );
    expect(c.viewport.snapshot()['scale'], 2);
  });
  test(
    '4 logical pixels remains a click; any excursion beyond stays a drag',
    () async {
      final (c, p) = await setup();
      final events = <Map<String, dynamic>>[];
      c.selection.onPointerChange(events.add);
      p.down(const PointerDownEvent(pointer: 1, position: Offset(10, 10)));
      p.move(const PointerMoveEvent(pointer: 1, position: Offset(14, 10)));
      p.up(const PointerUpEvent(pointer: 1, position: Offset(14, 10)));
      expect(c.selection.ids, ['rect']);
      expect(events.length, 1);
      c.selection.clear();
      events.clear();
      p.down(const PointerDownEvent(pointer: 1, position: Offset(10, 10)));
      p.move(const PointerMoveEvent(pointer: 1, position: Offset(15, 10)));
      p.move(const PointerMoveEvent(pointer: 1, position: Offset(10, 10)));
      p.up(const PointerUpEvent(pointer: 1, position: Offset(10, 10)));
      expect(c.selection.ids, isEmpty);
      expect(events, isEmpty);
    },
  );
  test(
    'cancelled marquee neither commits selection nor leaves transient paint',
    () async {
      final (c, p) = await setup(selection: {'box': true});
      p.down(const PointerDownEvent(pointer: 1, position: Offset(0, 0)));
      p.move(const PointerMoveEvent(pointer: 1, position: Offset(35, 35)));
      expect(p.marquee, isNotNull);
      p.cancel(const PointerCancelEvent(pointer: 1));
      p.up(const PointerUpEvent(pointer: 1, position: Offset(35, 35)));
      expect(p.marquee, isNull);
      expect(c.selection.ids, isEmpty);
    },
  );
  final brushFixture =
      jsonDecode(
            File(
              '../../conformance/scenes/brush-selection.json',
            ).readAsStringSync(),
          )
          as Map;
  Future<(PatchMapController, NativePointerBinding)> brushSetup([
    String behavior = 'toggle',
  ]) => setup(
    data: (brushFixture['dataset'] as List)
        .map((v) => Map<String, dynamic>.from(v as Map))
        .toList(),
    selection: {
      'brush': {
        'longPress': {'behavior': behavior},
      },
    },
  );
  void brushDown(NativePointerBinding p, [int pointer = 1, double x = 20]) =>
      p.down(
        PointerDownEvent(
          pointer: pointer,
          kind: PointerDeviceKind.touch,
          position: Offset(x, 20),
        ),
      );
  void brushMove(NativePointerBinding p, double x) => p.move(
    PointerMoveEvent(
      pointer: 1,
      kind: PointerDeviceKind.touch,
      position: Offset(x, 20),
    ),
  );
  void brushUp(NativePointerBinding p, [double x = 20]) => p.up(
    PointerUpEvent(
      pointer: 1,
      kind: PointerDeviceKind.touch,
      position: Offset(x, 20),
    ),
  );
  testWidgets('brush toggle API disable and next longpress share one state', (
    tester,
  ) async {
    final (c, p) = await brushSetup();
    brushDown(p);
    await tester.pump(const Duration(milliseconds: 500));
    brushUp(p);
    expect(c.selection.brush.state.enabled, true);
    c.selection.brush.disable();
    expect(c.selection.brush.state.enabled, false);
    brushDown(p);
    await tester.pump(const Duration(milliseconds: 500));
    brushUp(p);
    expect(c.selection.brush.state.enabled, true);
    final before = c.selection.ids;
    brushDown(p);
    await tester.pump(const Duration(milliseconds: 500));
    brushUp(p);
    expect(c.selection.brush.state.enabled, false);
    expect(c.selection.ids, before);
  });
  testWidgets('brush segments add erase and revisit common fixture', (
    tester,
  ) async {
    final (c, p) = await brushSetup();
    c.selection.set(['off']);
    c.selection.brush.enable();
    brushDown(p);
    brushMove(p, 100);
    brushMove(p, 20);
    brushUp(p);
    expect(c.selection.ids, brushFixture['added']);
    brushDown(p);
    brushMove(p, 100);
    brushUp(p, 100);
    expect(c.selection.ids, brushFixture['removed']);
  });
  testWidgets('brush hold restores prior mode and cancel retains selection', (
    tester,
  ) async {
    final (c, p) = await brushSetup('hold');
    c.selection.set(['off']);
    brushDown(p);
    await tester.pump(const Duration(milliseconds: 500));
    brushMove(p, 100);
    p.cancel();
    expect(c.selection.ids, brushFixture['added']);
    expect(c.selection.brush.state.enabled, false);
    expect(c.selection.brush.state.drawing, false);
  });
  testWidgets(
    'brush timer cancels on movement second pointer API replacement and destroy',
    (tester) async {
      for (final action in ['move', 'second', 'api', 'replace', 'destroy']) {
        final (c, p) = await brushSetup();
        brushDown(p);
        if (action == 'move') brushMove(p, 26);
        if (action == 'second') brushDown(p, 2, 60);
        if (action == 'api') c.selection.brush.disable();
        if (action == 'replace') c.data.replace(c.data.snapshot(), fit: false);
        if (action == 'destroy') await c.destroy();
        await tester.pump(const Duration(milliseconds: 600));
        expect(c.selection.brush.state.enabled, false, reason: action);
        expect(c.selection.ids, isEmpty, reason: action);
      }
    },
  );
  testWidgets(
    'brush cancellation consumes remaining moves and pinch uses latest positions',
    (tester) async {
      final (c, p) = await brushSetup();
      c.selection.brush.enable();
      brushDown(p);
      brushMove(p, 60);
      final before = c.viewport.state;
      c.selection.brush.disable();
      brushMove(p, 100);
      brushUp(p, 100);
      expect(c.viewport.state, before);
      c.selection.brush.enable();
      brushDown(p);
      brushMove(p, 60);
      brushDown(p, 2, 100);
      p.move(
        const PointerMoveEvent(
          pointer: 2,
          position: Offset(100, 20),
          buttons: kPrimaryButton,
        ),
      );
      expect(c.viewport.state, before);
    },
  );
  testWidgets('brush initial predicate cancellation does not arm a timer', (
    tester,
  ) async {
    late PatchMapController controller;
    final (c, p) = await setup(
      selection: {
        'brush': {
          'longPress': {'behavior': 'toggle'},
        },
        'isSelectable': (Map<String, dynamic> _) {
          controller.selection.brush.disable();
          return true;
        },
      },
    );
    controller = c;
    brushDown(p);
    await tester.pump(const Duration(milliseconds: 600));
    expect(c.selection.brush.state.enabled, false);
    expect(c.selection.ids, isEmpty);
  });
  testWidgets(
    'external selection cancellation commits after reentrant selection',
    (tester) async {
      final (c, p) = await brushSetup();
      c.selection.brush.enable();
      brushDown(p);
      brushMove(p, 60);
      c.selection.brush.onChange((e) {
        if (!e.state.drawing) c.selection.set(['off']);
      });
      c.selection.add(['c']);
      expect(c.selection.ids, ['off', 'c']);
    },
  );
  testWidgets('external selection cancels hold and restores the prior mode', (
    tester,
  ) async {
    final (c, p) = await brushSetup('hold');
    brushDown(p);
    await tester.pump(const Duration(milliseconds: 500));
    c.selection.set(['off']);
    expect(c.selection.brush.state.enabled, false);
    expect(c.selection.ids, ['off']);
    brushMove(p, 100);
    brushUp(p, 100);
    expect(c.selection.ids, ['off']);
  });
  testWidgets('brush activation callback disable has no stale selection', (
    tester,
  ) async {
    final (c, p) = await brushSetup();
    c.selection.brush.onChange((_) => c.selection.brush.disable());
    brushDown(p);
    await tester.pump(const Duration(milliseconds: 500));
    expect(c.selection.ids, isEmpty);
    expect(c.selection.brush.state.enabled, false);
  });
  test('box commit selects logical target once', () async {
    final (c, p) = await setup(selection: {'box': true});
    p.down(const PointerDownEvent(pointer: 1, position: Offset(0, 0)));
    p.move(const PointerMoveEvent(pointer: 1, position: Offset(35, 35)));
    p.up(const PointerUpEvent(pointer: 1, position: Offset(35, 35)));
    expect(c.selection.ids, ['rect']);
    expect(p.marquee, isNull);
  });
  for (final partial in [true, false]) {
    test(
      'box selects nested grid cells, not composite scopes ($partial)',
      () async {
        final (c, p) = await setup(
          selection: {
            'box': {'partialIntersection': partial},
          },
          data: [
            {
              'id': 'plant',
              'type': 'group',
              'children': [
                {
                  'id': 'g',
                  'type': 'grid',
                  'attrs': {'x': 20, 'y': 20},
                  'cells': [
                    [1, 1],
                    [1, 1],
                  ],
                  'item': {'size': 10},
                },
              ],
            },
            {'id': 'empty', 'type': 'group', 'children': []},
          ],
        );
        final before = c.viewport.snapshot();
        final events = <Map<String, dynamic>>[];
        c.selection.onPointerChange(events.add);
        p.down(const PointerDownEvent(pointer: 1, position: Offset(0, 0)));
        p.move(const PointerMoveEvent(pointer: 1, position: Offset(90, 90)));
        expect(p.marquee, isNotNull);
        p.up(const PointerUpEvent(pointer: 1, position: Offset(90, 90)));
        expect(c.selection.ids, ['g.0.0', 'g.0.1', 'g.1.0', 'g.1.1']);
        expect(events, hasLength(1));
        expect(c.viewport.snapshot(), before);
        expect(p.marquee, isNull);
      },
    );
  }
  test('pin survives leave and primary blank click hides it', () async {
    final (c, p) = await setup(
      pointer: {
        'tooltip': {'pinOnContextMenu': true},
      },
    );
    final events = <Map<String, dynamic>>[];
    c.pointer.onTooltip(events.add);
    p.hover(const PointerHoverEvent(pointer: 1, position: Offset(10, 10)));
    click(p, const Offset(10, 10), buttons: kSecondaryMouseButton);
    p.leave(const PointerHoverEvent(pointer: 1, position: Offset(90, 90)));
    expect(events.last['type'], 'pin');
    expect(events.last['pinned'], true);
    click(p, const Offset(90, 90));
    expect(events.last['type'], 'hide');
    expect(events.last['pinned'], false);
  });
  test(
    'blank double click policy and target eligibility preserve selection',
    () async {
      final (c, p) = await setup(
        selection: {
          'clearOnBlankClick': 'double',
          'isSelectable': (Map<String, dynamic> target) => false,
        },
      );
      c.selection.set(['rect']);
      click(p, const Offset(10, 10));
      expect(c.selection.ids, ['rect']);
      click(p, const Offset(10, 10), time: 100);
      expect(c.selection.ids, isEmpty);
    },
  );
  test('pinch changes viewport without creating a point selection', () async {
    final (c, p) = await setup();
    p.down(const PointerDownEvent(pointer: 1, position: Offset(10, 10)));
    p.down(const PointerDownEvent(pointer: 2, position: Offset(30, 10)));
    p.move(const PointerMoveEvent(pointer: 2, position: Offset(50, 10)));
    p.up(const PointerUpEvent(pointer: 2, position: Offset(50, 10)));
    p.up(const PointerUpEvent(pointer: 1, position: Offset(10, 10)));
    expect(c.viewport.snapshot()['scale'], 2);
    expect(c.selection.ids, isEmpty);
  });
  test('double click removes only the previously selected target', () async {
    final (c, p) = await setup(
      selection: {'deselectOnTargetDoubleClick': true},
    );
    c.selection.set(['rect', 'other']);
    click(p, const Offset(10, 10));
    expect(c.selection.ids, ['rect', 'other']);
    click(p, const Offset(10, 10), time: 100);
    expect(c.selection.ids, ['other']);
  });
  test('hover exposes detached component identity', () async {
    final (c, _) = await setup();
    final p = NativePointerBinding(
      c,
      (_) => const PatchMapTarget('rect', componentId: 'bar'),
      () {},
    );
    final events = <Map<String, dynamic>>[];
    c.pointer.onHover(events.add);
    p.hover(const PointerHoverEvent(position: Offset(5, 5)));
    p.hover(const PointerHoverEvent(position: Offset(6, 5)));
    expect(events.first['target'], {'id': 'rect', 'componentId': 'bar'});
    expect(events.last['type'], 'move');
    p.dispose();
  });

  testWidgets('touch long press pins once and cancellation removes its timer', (
    tester,
  ) async {
    final (c, p) = await setup(
      pointer: {
        'tooltip': {'pinOnContextMenu': true},
      },
    );
    final events = <Map<String, dynamic>>[];
    c.pointer.onTooltip(events.add);
    p.down(
      const PointerDownEvent(
        pointer: 1,
        kind: PointerDeviceKind.touch,
        position: Offset(10, 10),
      ),
    );
    await tester.pump(const Duration(milliseconds: 501));
    expect(events.last['type'], 'pin');
    p.up(
      const PointerUpEvent(
        pointer: 1,
        kind: PointerDeviceKind.touch,
        position: Offset(10, 10),
      ),
    );
    expect(c.selection.ids, isEmpty);
    final count = events.length;
    p.down(
      const PointerDownEvent(
        pointer: 1,
        kind: PointerDeviceKind.touch,
        position: Offset(10, 10),
      ),
    );
    p.cancel();
    await tester.pump(const Duration(milliseconds: 501));
    expect(events.length, count);
  });
}
