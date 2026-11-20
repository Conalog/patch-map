import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'patch_map_view_test.dart' as support;

Map<String, Object?> _rect(String id, num x, num y, num width, num height) => {
  'type': 'rect',
  'id': id,
  'size': {'width': width, 'height': height},
  'attrs': {'x': x, 'y': y},
};

Map<String, Object?> _text(String id, String text, num x, num y) => {
  'type': 'text',
  'id': id,
  'text': text,
  'attrs': {'x': x, 'y': y},
};

Future<void> _draw(
  WidgetTester tester,
  PatchMapController map,
  Object data,
) async {
  final drawn = map.draw(data);
  await support.progress(tester);
  expect((await drawn).outcome, PatchMapOutcome.applied);
}

void main() {
  for (final (alignment, anchor) in [
    (PatchMapAlignment.left, -40.0),
    (PatchMapAlignment.right, 90.0),
    (PatchMapAlignment.top, 20.0),
    (PatchMapAlignment.bottom, 120.0),
    (PatchMapAlignment.centerX, 85 / 3),
    (PatchMapAlignment.centerY, 60.0),
  ]) {
    testWidgets('aligns ${alignment.name} in world space across parents', (
      tester,
    ) async {
      final map = PatchMapController(), events = <PatchMapInputEvent>[];
      await tester.pumpWidget(support.host(map, event: events.add));
      await _draw(tester, map, [
        _rect('a', 10, 20, 20, 10),
        {
          'type': 'group',
          'id': 'parent',
          'attrs': {'x': 100, 'y': 20, 'angle': 90, 'scaleX': 2},
          'children': [_rect('b', 10, 10, 10, 20)],
        },
        _rect('c', -40, 90, 50, 30),
        {
          'type': 'relations',
          'id': 'link',
          'links': [
            {'source': 'a', 'target': 'b'},
          ],
        },
      ]);
      map.setCamera(rotation: .4, scale: 2);
      const ids = ['a', 'b', 'c'];
      map.select(ids);
      await tester.pump();
      events.clear();
      final camera = map.camera;
      final before = {for (final id in ids) id: map.getGeometry(id)!.bounds!};

      final task = map.alignSelection(alignment);
      expect(map.getGeometry('a')!.bounds, before['a']);
      await support.progress(tester);
      final moved = await task;
      expect(moved.result.outcome, PatchMapOutcome.applied);
      expect(moved.positions, isNotEmpty);
      for (final id in ids) {
        final bounds = map.getGeometry(id)!.bounds!;
        final coordinate = switch (alignment) {
          PatchMapAlignment.left => bounds.left,
          PatchMapAlignment.right => bounds.right,
          PatchMapAlignment.top => bounds.top,
          PatchMapAlignment.bottom => bounds.bottom,
          PatchMapAlignment.centerX => bounds.center.dx,
          PatchMapAlignment.centerY => bounds.center.dy,
        };
        expect(coordinate, closeTo(anchor, 1e-9));
        final horizontal = [
          PatchMapAlignment.left,
          PatchMapAlignment.right,
          PatchMapAlignment.centerX,
        ].contains(alignment);
        expect(
          horizontal ? bounds.top : bounds.left,
          closeTo(horizontal ? before[id]!.top : before[id]!.left, 1e-9),
        );
        final position = moved.positions[id];
        if (position != null) {
          final attrs = map.getValue(PatchMapTarget(id))!['attrs'] as Map;
          expect(
            Offset(
              (attrs['x'] as num).toDouble(),
              (attrs['y'] as num).toDouble(),
            ),
            position,
          );
        }
      }
      final a = map.getGeometry('a')!.center!,
          b = map.getGeometry('b')!.center!;
      expect(map.getGeometry('link')!.bounds, Rect.fromPoints(a, b));
      expect(map.selected.map((target) => target.id), ids);
      expect(
        events.where(
          (event) => event.kind == PatchMapInputKind.selectionChange,
        ),
        isEmpty,
      );
      expect(map.camera, camera);
      final repeatRequest = map.alignSelection(alignment);
      await support.progress(tester);
      final repeat = await repeatRequest;
      expect(repeat.result.outcome, PatchMapOutcome.unchanged);
      expect(repeat.positions, isEmpty);
    });
  }

  testWidgets('aligns full grid footprints with fixed-size text and images', (
    tester,
  ) async {
    final map = PatchMapController();
    await tester.pumpWidget(
      Directionality(
        textDirection: TextDirection.ltr,
        child: PatchMapView(controller: map, longPressEditEnabled: true),
      ),
    );
    await _draw(tester, map, [
      {
        'type': 'grid',
        'id': 'grid',
        'attrs': {'x': 20},
        'cells': [
          [0, 1, 0],
        ],
        'gap': 5,
        'item': {'size': 20, 'components': []},
      },
      _rect('rhs', 120, 50, 10, 20),
      {
        'type': 'text',
        'id': 'text',
        'text': 'Label',
        'attrs': {'y': 80},
        'size': {'width': 30, 'height': 20},
      },
      {
        'type': 'image',
        'id': 'image',
        'attrs': {'y': 110},
        'size': {'width': 25, 'height': 20},
        'source': Uri.dataFromString(
          '<svg xmlns="http://www.w3.org/2000/svg" width="25" height="20"/>',
          mimeType: 'image/svg+xml',
        ).toString(),
      },
    ]);
    map.select(['grid', 'rhs', 'text', 'image']);
    final task = map.alignSelection(PatchMapAlignment.right);
    await support.progress(tester);
    expect((await task).positions, {
      'grid': const Offset(60, 0),
      'text': const Offset(100, 80),
      'image': const Offset(105, 110),
    });
    expect(map.getGeometry('grid.0.1')!.origin, const Offset(85, 0));
  });

  testWidgets('aligns a text-only selection by its measured bounds', (
    tester,
  ) async {
    final map = PatchMapController();
    await tester.pumpWidget(support.host(map));
    await _draw(tester, map, [
      _text('short', 'Label', 0, 20),
      _text('long', 'A much wider label', 200, 100),
    ]);
    map.select(['short', 'long']);
    final anchor = map.getGeometry('long')!.bounds!;
    expect(anchor.width, greaterThan(map.getGeometry('short')!.bounds!.width));

    final task = map.alignSelection(PatchMapAlignment.right);
    await support.progress(tester);
    final moved = await task;
    expect(moved.result.outcome, PatchMapOutcome.applied);
    expect(moved.positions.keys, ['short']);
    final aligned = map.getGeometry('short')!.bounds!;
    expect(aligned.right, closeTo(anchor.right, 1e-9));
    expect(aligned.top, 20);
    expect(map.getGeometry('long')!.bounds, anchor);
    expect(map.selected.map((object) => object.id), ['short', 'long']);
  });

  testWidgets(
    'rejects insufficient and ineligible selections without moving anything',
    (tester) async {
      final map = PatchMapController();
      final detached = await map.alignSelection(PatchMapAlignment.left);
      expect(detached.result.failures.single.code, 'DETACHED');
      await tester.pumpWidget(support.host(map));
      final empty = await map.alignSelection(PatchMapAlignment.left);
      expect(empty.result.failures.single.code, 'NOT_READY');
      await _draw(tester, map, [
        _rect('a', 50, 20, 20, 10),
        {..._rect('locked', 0, 0, 20, 10), 'locked': true},
        {..._rect('hidden', 0, 40, 20, 10), 'show': false},
        {
          'type': 'relations',
          'id': 'link',
          'links': [
            {'source': 'a', 'target': 'locked'},
          ],
        },
      ]);
      map.select(['a']);
      final singleton = await map.alignSelection(PatchMapAlignment.left);
      expect(singleton.result.failures.single.code, 'INVALID_VALUE');
      for (final id in ['locked', 'hidden', 'link']) {
        map.select(['a', id]);
        final rejected = await map.alignSelection(PatchMapAlignment.left);
        expect(rejected.result.outcome, PatchMapOutcome.rejected);
        expect(rejected.result.failures.single.code, 'INVALID_MUTATION');
        expect(rejected.result.failures.single.target!.id, id);
        expect(rejected.positions, isEmpty);
        expect(map.getGeometry('a')!.origin, const Offset(50, 20));
      }
    },
  );

  testWidgets(
    'rejects a queued alignment when a text anchor changes measured size',
    (tester) async {
      final map = PatchMapController();
      await tester.pumpWidget(support.host(map));
      await _draw(tester, map, [
        _rect('a', 0, 0, 20, 10),
        _text('b', 'Label', 80, 40),
      ]);
      map.select(['a', 'b']);
      final resize = map.updateValues(const [
        PatchMapUpdate(PatchMapTarget('b'), {'text': 'A much wider label'}),
      ]);
      final task = map.alignSelection(PatchMapAlignment.right);
      await support.progress(tester);
      expect((await resize).outcome, PatchMapOutcome.applied);
      final rejected = await task;
      expect(rejected.result.outcome, PatchMapOutcome.rejected);
      expect(rejected.result.failures.single.code, 'MOVE_CONFLICT');
      expect(rejected.positions, isEmpty);
      expect(map.getGeometry('a')!.origin, Offset.zero);
    },
  );
}
