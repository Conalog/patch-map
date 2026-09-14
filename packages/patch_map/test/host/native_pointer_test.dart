import 'package:flutter/gestures.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patch_map/src/engine/controller.dart';
import 'package:patch_map/src/engine/ports.dart';
import 'package:patch_map/src/api/values.dart';
import 'package:patch_map/src/host/native_pointer.dart';

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
}) async {
  final c = await PatchMapController.create(
    data: [
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
  final binding = NativePointerBinding(
    c,
    (p) => p.dx >= 0 && p.dy >= 0 && p.dx <= 30 && p.dy <= 30
        ? const PatchMapTarget('rect')
        : null,
    () {},
  );
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
  TestWidgetsFlutterBinding.ensureInitialized();
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
  test('box commit selects logical target once', () async {
    final (c, p) = await setup(selection: {'box': true});
    p.down(const PointerDownEvent(pointer: 1, position: Offset(0, 0)));
    p.move(const PointerMoveEvent(pointer: 1, position: Offset(35, 35)));
    p.up(const PointerUpEvent(pointer: 1, position: Offset(35, 35)));
    expect(c.selection.ids, ['rect']);
    expect(p.marquee, isNull);
  });
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
