import 'dart:ui' as ui;

import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'patch_map_view_test.dart' as support;
import 'selection_paint_test.dart' show bluePixels, coloredPixels;

Widget _host(
  PatchMapController controller, {
  bool? enabled,
  ValueChanged<PatchMapInputEvent>? onEvent,
  ValueChanged<PatchMapMoveResult>? onMove,
  String? Function(PatchMapObject)? resolve,
  PatchMapSelectionStyle selectionStyle = const PatchMapSelectionStyle(),
}) => Directionality(
  textDirection: TextDirection.ltr,
  child: Center(
    child: SizedBox.square(
      dimension: 400,
      child: enabled == null
          ? PatchMapView(controller: controller, onEvent: onEvent)
          : PatchMapView(
              controller: controller,
              longPressEditEnabled: enabled,
              editTargetResolver: resolve,
              onEvent: onEvent,
              onMoveResult: onMove,
              selectionStyle: selectionStyle,
            ),
    ),
  ),
);

Map<String, Object?> _rect(String id, double x, double y) => {
  'type': 'rect',
  'id': id,
  'size': 20,
  'fill': '#aa0000',
  'attrs': {'x': x, 'y': y},
};

Future<void> _draw(
  WidgetTester tester,
  PatchMapController controller,
  List<Map<String, Object?>> data, {
  double rotation = 0,
}) async {
  final drawn = controller.draw(data);
  await support.progress(tester);
  expect((await drawn).outcome, PatchMapOutcome.applied);
  controller.setCamera(center: Offset.zero, scale: 1, rotation: rotation);
  await tester.pump();
}

Offset _topLeft(WidgetTester tester) =>
    tester.getTopLeft(find.byType(PatchMapView));

Future<TestGesture> _hold(WidgetTester tester, Offset local) async {
  final finger = await tester.startGesture(_topLeft(tester) + local);
  await tester.pump(const Duration(milliseconds: 300));
  return finger;
}

Iterable<String> _ids(PatchMapController controller) =>
    controller.selected.map((object) => object.id);

Future<int> _alphaAt(WidgetTester tester, Finder preview, Offset local) async {
  final boundary = tester.renderObject<RenderRepaintBoundary>(preview);
  return (await tester.runAsync(() async {
    final image = await boundary.toImage();
    try {
      final bytes = (await image.toByteData(
        format: ui.ImageByteFormat.rawRgba,
      ))!;
      final offset = (local.dy.floor() * image.width + local.dx.floor()) * 4;
      return bytes.getUint8(offset + 3);
    } finally {
      image.dispose();
    }
  }))!;
}

void main() {
  testWidgets('default and mid-press opt-in preserve regular hold behavior', (
    tester,
  ) async {
    final map = PatchMapController(), events = <PatchMapInputEvent>[];
    await tester.pumpWidget(_host(map, onEvent: events.add));
    await _draw(tester, map, [_rect('a', 0, 0)]);
    final center = map.toLocal(const Offset(10, 10))!;
    final camera = map.camera!;
    final finger = await tester.startGesture(_topLeft(tester) + center);
    await tester.pump(const Duration(milliseconds: 150));
    await tester.pumpWidget(_host(map, enabled: true, onEvent: events.add));
    await tester.pump(const Duration(milliseconds: 150));
    expect(_ids(map), isEmpty);
    await finger.moveBy(const Offset(45, 10));
    await finger.up();
    await tester.pump();
    expect(map.camera, isNot(camera));
    expect(
      events
          .where((event) => event.kind == PatchMapInputKind.longPress)
          .single
          .target!
          .id,
      'a',
    );

    final next = await _hold(tester, map.toLocal(const Offset(10, 10))!);
    expect(_ids(map), ['a']);
    await next.up();
    expect(map.getGeometry('a')!.origin, Offset.zero);
  });

  testWidgets('rotated screen range selects a touched grid once and clears', (
    tester,
  ) async {
    final map = PatchMapController();
    await tester.pumpWidget(_host(map, enabled: true));
    const angle = .7853981633974483;
    await _draw(tester, map, [
      {
        'type': 'grid',
        'id': 'panels',
        'cells': [
          [1, 1],
        ],
        'item': {
          'size': 20,
          'components': [
            {
              'type': 'background',
              'source': {'type': 'rect', 'fill': '#aa0000'},
            },
          ],
        },
      },
      // In the world AABB of the screen range but outside its exact quad.
      {..._rect('outside', -23, -12), 'size': 3},
    ], rotation: angle);
    final center = map.toLocal(const Offset(10, 10))!;
    final finger = await _hold(tester, center - const Offset(27, 22));
    await finger.moveTo(_topLeft(tester) + center + const Offset(14, 25));
    await tester.pump();
    expect(_ids(map), isEmpty);
    final preview = find
        .descendant(
          of: find.byType(PatchMapView),
          matching: find.byType(RepaintBoundary),
        )
        .last;
    expect(await bluePixels(tester, boundary: preview), greaterThan(30));
    expect(await _alphaAt(tester, preview, center), closeTo(20, 1));
    final outsideDefaultStroke = center - const Offset(29, 0);
    expect(await _alphaAt(tester, preview, outsideDefaultStroke), 0);
    expect(await bluePixels(tester), 0);

    const green = Color(0xff00aa00);
    await tester.pumpWidget(
      _host(
        map,
        enabled: true,
        selectionStyle: const PatchMapSelectionStyle(
          color: green,
          strokeWidth: 6,
        ),
      ),
    );
    expect(
      await coloredPixels(tester, green, boundary: preview),
      greaterThan(30),
    );
    expect(await _alphaAt(tester, preview, outsideDefaultStroke), 255);
    await tester.pumpWidget(_host(map, enabled: true));
    await finger.up();
    await tester.pump();
    expect(_ids(map), ['panels']);
    expect(await bluePixels(tester), greaterThan(30));
    expect(await bluePixels(tester, boundary: preview), 0);

    final cell = map.getGeometry('panels.0.0')!.origin;
    final mover = await _hold(tester, center);
    await mover.moveBy(const Offset(40, 0));
    await mover.up();
    await support.progress(tester);
    final expected =
        map.toWorld(center + const Offset(40, 0))! - map.toWorld(center)!;
    expect(
      (map.getGeometry('panels.0.0')!.origin - cell - expected).distance,
      lessThan(1e-9),
    );

    await tester.pumpWidget(_host(map, enabled: false));
    expect(_ids(map), ['panels']);
    expect(await bluePixels(tester), greaterThan(30));
    await tester.pumpWidget(_host(map, enabled: true));
    final blank = _topLeft(tester) + const Offset(40, 40);
    await tester.tapAt(blank);
    await tester.pump(const Duration(milliseconds: 60));
    await tester.tapAt(blank);
    await tester.pump();
    expect(_ids(map), isEmpty);
  });

  testWidgets('moves multiple roots and relation in one submitted frame', (
    tester,
  ) async {
    final map = PatchMapController(), moves = <PatchMapMoveResult>[];
    await tester.pumpWidget(_host(map, enabled: true, onMove: moves.add));
    await _draw(tester, map, [
      _rect('a', -70, -10),
      {
        'type': 'group',
        'id': 'parent',
        'attrs': {'x': 50, 'scaleX': -2, 'scaleY': .5, 'angle': 90},
        'children': [_rect('b', 2, 4)],
      },
      {
        'type': 'relations',
        'id': 'connection',
        'links': [
          {'source': 'a', 'target': 'b'},
        ],
      },
    ], rotation: .25);
    final beforeA = map.getGeometry('a')!.origin;
    final beforeB = map.getGeometry('b')!.origin;
    final beforeRelation = map.getGeometry('connection')!.bounds!;
    final start = map.toLocal(map.getGeometry('a')!.center!)!;
    const dragBy = Offset(40, 20);
    final worldDelta = map.toWorld(start + dragBy)! - map.toWorld(start)!;
    final camera = map.camera;
    map.select(['a', 'b']);
    await tester.pump();
    final finger = await _hold(tester, start);
    expect(_ids(map), ['a', 'b']);
    await finger.moveBy(dragBy);
    await tester.pump();
    expect(map.getGeometry('a')!.origin, beforeA);
    expect(moves, isEmpty);
    await finger.up();
    await support.progress(tester);
    expect(moves.single.result.outcome, PatchMapOutcome.applied);
    expect(moves.single.positions.keys, ['a', 'b']);
    expect(
      (map.getGeometry('a')!.origin - beforeA - worldDelta).distance,
      lessThan(1e-9),
    );
    expect(
      (map.getGeometry('b')!.origin - beforeB - worldDelta).distance,
      lessThan(1e-9),
    );
    expect(
      (map.getGeometry('connection')!.bounds!.center -
              beforeRelation.center -
              worldDelta)
          .distance,
      lessThan(1e-9),
    );
    expect(map.camera, camera);
    expect(_ids(map), ['a', 'b']);
  });

  for (final mode in [
    PatchMapSelectionDisplayMode.all,
    PatchMapSelectionDisplayMode.elementOnly,
  ]) {
    testWidgets('empty space within the selection moves it in ${mode.name}', (
      tester,
    ) async {
      final map = PatchMapController(), moves = <PatchMapMoveResult>[];
      final selectionChanges = <PatchMapInputEvent>[];
      await tester.pumpWidget(
        _host(
          map,
          enabled: true,
          selectionStyle: PatchMapSelectionStyle(displayMode: mode),
          onMove: moves.add,
          onEvent: (event) {
            if (event.kind == PatchMapInputKind.selectionChange) {
              selectionChanges.add(event);
            }
          },
        ),
      );
      await _draw(tester, map, [
        {
          ..._rect('a', -70, -10),
          'stroke': {'width': 16, 'color': '#333333'},
        },
        _rect('b', 50, -10),
      ], rotation: .4);
      map.setCamera(scale: 1.6);
      map.select(['a', 'b']);
      await tester.pump();
      selectionChanges.clear();

      // The authored stroke extends the selection bounds above the layout.
      final start = map.toLocal(const Offset(0, -16))!;
      const dragBy = Offset(48, 24);
      final delta = map.toWorld(start + dragBy)! - map.toWorld(start)!;
      final finger = await _hold(tester, start);
      await finger.moveBy(dragBy);
      await tester.pump();
      expect(map.getGeometry('a')!.origin, const Offset(-70, -10));
      await finger.up();
      await support.progress(tester);
      expect(moves, hasLength(1));
      expect(moves.single.result.outcome, PatchMapOutcome.applied);
      expect(moves.single.positions.keys, ['a', 'b']);
      expect(_ids(map), ['a', 'b']);
      expect(selectionChanges, isEmpty);
      expect(
        (map.getGeometry('a')!.origin - const Offset(-70, -10) - delta)
            .distance,
        lessThan(1e-9),
      );
      expect(
        (map.getGeometry('b')!.origin - const Offset(50, -10) - delta).distance,
        lessThan(1e-9),
      );

      final a = map.toLocal(map.getGeometry('a')!.center!)!;
      final range = await _hold(tester, a - const Offset(65, 45));
      await range.moveTo(_topLeft(tester) + a);
      await range.up();
      await tester.pump();
      expect(_ids(map), ['a']);
      expect(moves, hasLength(1));
    });
  }

  testWidgets('an unselected object inside the bounds keeps hit priority', (
    tester,
  ) async {
    final map = PatchMapController(), moves = <PatchMapMoveResult>[];
    await tester.pumpWidget(_host(map, enabled: true, onMove: moves.add));
    await _draw(tester, map, [
      _rect('a', -70, -10),
      _rect('b', 50, -10),
      _rect('c', -10, -10),
    ]);
    map.select(['a', 'b']);
    final finger = await _hold(tester, map.toLocal(Offset.zero)!);
    expect(_ids(map), ['c']);
    await finger.moveBy(const Offset(30, 10));
    await finger.up();
    await support.progress(tester);
    expect(moves.single.positions, {'c': const Offset(20, 0)});
    expect(map.getGeometry('a')!.origin, const Offset(-70, -10));
    expect(map.getGeometry('b')!.origin, const Offset(50, -10));
  });

  testWidgets(
    'disabling during a move restores prior selection and consumes it',
    (tester) async {
      final map = PatchMapController(), moves = <PatchMapMoveResult>[];
      await tester.pumpWidget(_host(map, enabled: true, onMove: moves.add));
      await _draw(tester, map, [_rect('a', 0, 0), _rect('b', 60, 0)]);
      map.select(['b']);
      final camera = map.camera;
      final finger = await _hold(tester, map.toLocal(const Offset(10, 10))!);
      expect(_ids(map), ['a']);
      await finger.moveBy(const Offset(50, 20));
      await tester.pumpWidget(_host(map, enabled: false, onMove: moves.add));
      await finger.moveBy(const Offset(25, 10));
      await finger.up();
      await support.progress(tester);
      expect(_ids(map), ['b']);
      expect(map.getGeometry('a')!.origin, Offset.zero);
      expect(map.camera, camera);
      expect(moves, isEmpty);
    },
  );

  testWidgets('an external position change rejects the whole move', (
    tester,
  ) async {
    final map = PatchMapController(), moves = <PatchMapMoveResult>[];
    await tester.pumpWidget(_host(map, enabled: true, onMove: moves.add));
    await _draw(tester, map, [_rect('a', 0, 0), _rect('b', 60, 0)]);
    map.select(['a', 'b']);
    final finger = await _hold(tester, map.toLocal(const Offset(40, 10))!);
    await finger.moveBy(const Offset(50, 20));
    final updated = map.updateValues(const [
      PatchMapUpdate(PatchMapTarget('b'), {
        'attrs': {'x': 70},
      }),
    ]);
    await support.progress(tester);
    expect((await updated).outcome, PatchMapOutcome.applied);
    await finger.up();
    await support.progress(tester);
    expect(moves.single.result.outcome, PatchMapOutcome.rejected);
    expect(moves.single.result.failures.single.code, 'MOVE_CONFLICT');
    expect(moves.single.positions, isEmpty);
    expect(map.getGeometry('a')!.origin, Offset.zero);
    expect(map.getGeometry('b')!.origin, const Offset(70, 0));
  });
}
