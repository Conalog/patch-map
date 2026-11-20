import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'patch_map_view_test.dart' show progress;

Widget _host(
  PatchMapController map, {
  int limit = 50,
  bool active = true,
  ValueChanged<PatchMapEditHistoryState>? onHistory,
  ValueChanged<PatchMapInputEvent>? onEvent,
}) => Directionality(
  textDirection: TextDirection.ltr,
  child: Center(
    child: SizedBox.square(
      dimension: 400,
      child: PatchMapView(
        controller: map,
        active: active,
        editHistoryLimit: limit,
        longPressEditEnabled: true,
        onEditHistoryChanged: onHistory,
        onEvent: onEvent,
      ),
    ),
  ),
);

const _ids = ['a', 'b', 'c'];
const _b = PatchMapTarget('b');

Map<String, Object?> _rect(String id, int x, int y) => {
  'type': 'rect',
  'id': id,
  'size': {'width': 20, 'height': 12},
  'attrs': {'x': x, 'y': y},
};

final _scene = [
  _rect('a', 0, 0),
  _rect('b', 45, 35),
  _rect('c', 135, 85),
  {
    'type': 'relations',
    'id': 'link',
    'links': [
      {'source': 'a', 'target': 'b'},
    ],
  },
];

Future<T> _submit<T>(WidgetTester tester, Future<T> request) async {
  await progress(tester);
  return request;
}

Future<void> _draw(WidgetTester tester, PatchMapController map) async {
  expect(
    (await _submit(tester, map.draw(_scene))).outcome,
    PatchMapOutcome.applied,
  );
  map.setCamera(center: const Offset(75, 50), scale: 1, rotation: 0);
  await tester.pump();
}

Map<String, Rect> _bounds(PatchMapController map) => {
  for (final id in [..._ids, 'link']) id: map.getGeometry(id)!.bounds!,
};

Future<void> _align(
  WidgetTester tester,
  PatchMapController map,
  PatchMapAlignment alignment,
) async {
  expect(
    (await _submit(tester, map.alignSelection(alignment))).result.outcome,
    PatchMapOutcome.applied,
  );
}

Future<TestGesture> _hold(
  WidgetTester tester,
  PatchMapController map,
  Offset world,
) async {
  final view = tester.getTopLeft(find.byType(PatchMapView));
  final finger = await tester.startGesture(view + map.toLocal(world)!);
  await tester.pump(const Duration(milliseconds: 310));
  return finger;
}

Future<void> _selectByHold(
  WidgetTester tester,
  PatchMapController map,
  String id,
) async {
  final finger = await _hold(tester, map, map.getGeometry(id)!.center!);
  await finger.up();
  await tester.pump();
}

List<String> _selected(PatchMapController map) =>
    map.selected.map((item) => item.id).toList();

void main() {
  testWidgets('records completed point, range and clear selections', (
    tester,
  ) async {
    final map = PatchMapController();
    final history = <PatchMapEditHistoryState>[];
    await tester.pumpWidget(_host(map, onHistory: history.add));
    await _draw(tester, map);
    final original = _bounds(map), camera = map.camera;
    map.select(['c']);
    map.clearSelection();
    expect(map.editHistoryState.undoDepth, 0);

    await _selectByHold(tester, map, 'a');
    expect(_selected(map), ['a']);
    expect(history.last.undoDepth, 1);
    final range = await _hold(tester, map, const Offset(30, 25));
    final view = tester.getTopLeft(find.byType(PatchMapView));
    await range.moveTo(view + map.toLocal(const Offset(165, 105))!);
    await tester.pump();
    expect(_selected(map), ['a']);
    expect(map.editHistoryState.undoDepth, 1);
    await range.up();
    await tester.pump();
    expect(_selected(map), unorderedEquals(['b', 'c']));
    expect(history.last.undoDepth, 2);

    final blank = view + map.toLocal(const Offset(-55, -45))!;
    await tester.tapAt(blank);
    await tester.pump(const Duration(milliseconds: 60));
    await tester.tapAt(blank);
    await tester.pump();
    expect(_selected(map), isEmpty);
    expect(history.last.undoDepth, 3);

    final undo = await map.undo();
    expect(undo.result.outcome, PatchMapOutcome.applied);
    expect(undo.positions, isEmpty);
    expect(_selected(map), unorderedEquals(['b', 'c']));
    expect((await map.undo()).result.outcome, PatchMapOutcome.applied);
    expect(_selected(map), ['a']);
    expect((await map.redo()).result.outcome, PatchMapOutcome.applied);
    expect(_selected(map), unorderedEquals(['b', 'c']));
    expect(map.editHistoryState.redoDepth, 1);

    await _selectByHold(tester, map, 'a');
    expect(map.editHistoryState.redoDepth, 0);
    expect(map.editHistoryState.undoDepth, 3);
    await _selectByHold(tester, map, 'a');
    expect(map.editHistoryState.undoDepth, 3);
    expect(_bounds(map), original);
    expect(map.camera, camera);
  });

  testWidgets('cancelled point selection preserves the redo branch', (
    tester,
  ) async {
    final map = PatchMapController();
    await tester.pumpWidget(_host(map));
    await _draw(tester, map);
    await _selectByHold(tester, map, 'a');
    await _selectByHold(tester, map, 'b');
    await map.undo();
    await tester.pump();

    final finger = await _hold(tester, map, map.getGeometry('c')!.center!);
    expect(_selected(map), ['c']);
    expect((await map.redo()).result.failures.single.code, 'EDIT_BUSY');
    await finger.cancel();
    await tester.pump();
    expect(_selected(map), ['a']);
    expect(map.editHistoryState.undoDepth, 1);
    expect(map.editHistoryState.redoDepth, 1);
    await map.redo();
    expect(_selected(map), ['b']);
  });

  testWidgets('holding an unselected object then moving it records two steps', (
    tester,
  ) async {
    final map = PatchMapController();
    await tester.pumpWidget(_host(map));
    await _draw(tester, map);
    map.select(['a']);
    final original = _bounds(map);
    final finger = await _hold(tester, map, map.getGeometry('b')!.center!);
    expect(_selected(map), ['b']);
    expect(map.editHistoryState.undoDepth, 0);
    await finger.moveBy(const Offset(20, 24));
    await finger.up();
    await progress(tester);
    final moved = _bounds(map);
    expect(moved['b']!.topLeft, original['b']!.topLeft + const Offset(20, 24));
    expect(map.editHistoryState.undoDepth, 2);

    expect(
      (await _submit(tester, map.undo())).result.outcome,
      PatchMapOutcome.applied,
    );
    expect(_bounds(map), original);
    expect(_selected(map), ['b']);
    await map.undo();
    expect(_selected(map), ['a']);
    await map.redo();
    expect(_selected(map), ['b']);
    expect(_bounds(map), original);
    await _submit(tester, map.redo());
    expect(_bounds(map), moved);
  });

  testWidgets('undoes and redoes drag, alignment and spacing in order', (
    tester,
  ) async {
    final map = PatchMapController();
    final history = <PatchMapEditHistoryState>[];
    final undoDepthAtSelection = <int>[];
    await tester.pumpWidget(
      _host(
        map,
        onHistory: history.add,
        onEvent: (event) {
          if (event.kind == PatchMapInputKind.selectionChange) {
            undoDepthAtSelection.add(map.editHistoryState.undoDepth);
          }
        },
      ),
    );
    await _draw(tester, map);
    final initial = _bounds(map), camera = map.camera;
    map.select(_ids);
    final view = tester.getTopLeft(find.byType(PatchMapView));
    final start = map.toLocal(map.getGeometry('a')!.center!)!;
    final finger = await tester.startGesture(view + start);
    await tester.pump(const Duration(milliseconds: 310));
    await finger.moveBy(const Offset(24, 18));
    await tester.pump();
    expect(map.editHistoryState.undoDepth, 0);
    expect(_bounds(map), initial);
    await finger.up();
    await progress(tester);
    expect(map.editHistoryState.undoDepth, 1);
    final dragged = _bounds(map);

    await _align(tester, map, PatchMapAlignment.top);
    final aligned = _bounds(map);
    await _align(tester, map, PatchMapAlignment.distributeHorizontally);
    final spaced = _bounds(map);
    expect(map.editHistoryState.undoDepth, 3);
    map.clearSelection();
    undoDepthAtSelection.clear();

    final undo = map.undo();
    expect(map.editHistoryState.isBusy, isTrue);
    expect(map.editHistoryState.canUndo, isFalse);
    expect((await map.undo()).result.failures.single.code, 'EDIT_BUSY');
    final undone = await _submit(tester, undo);
    expect(undone.result.outcome, PatchMapOutcome.applied);
    expect(_bounds(map), aligned);
    expect(undone.positions.keys, ['b']);
    expect(map.selected.map((item) => item.id), _ids);
    expect(undoDepthAtSelection, [2]);

    for (final expected in [dragged, initial]) {
      expect(
        (await _submit(tester, map.undo())).result.outcome,
        PatchMapOutcome.applied,
      );
      expect(_bounds(map), expected);
    }
    expect(map.editHistoryState.canUndo, isFalse);
    expect((await map.undo()).result.outcome, PatchMapOutcome.unchanged);
    for (final expected in [dragged, aligned, spaced]) {
      expect(
        (await _submit(tester, map.redo())).result.outcome,
        PatchMapOutcome.applied,
      );
      expect(_bounds(map), expected);
    }
    expect(history.last, map.editHistoryState);
    expect(map.editHistoryState.canUndo, isTrue);
    expect(map.editHistoryState.canRedo, isFalse);
    expect(map.camera, camera);
  });

  testWidgets(
    'branches only on a changed successful edit and evicts the oldest',
    (tester) async {
      final map = PatchMapController();
      await tester.pumpWidget(_host(map, limit: 2));
      await _draw(tester, map);
      map.select(_ids);
      await _align(tester, map, PatchMapAlignment.left);
      final earliest = _bounds(map);
      await _align(tester, map, PatchMapAlignment.top);
      await _align(tester, map, PatchMapAlignment.distributeHorizontally);
      expect(map.editHistoryState.undoDepth, 2);
      await _submit(tester, map.undo());
      await _submit(tester, map.undo());
      expect(_bounds(map), earliest);
      expect(map.editHistoryState.redoDepth, 2);

      expect(
        (await map.alignSelection(PatchMapAlignment.left)).result.outcome,
        PatchMapOutcome.unchanged,
      );
      map.select(['a']);
      expect(
        (await map.alignSelection(PatchMapAlignment.top)).result.outcome,
        PatchMapOutcome.rejected,
      );
      expect(map.editHistoryState.redoDepth, 2);
      map.select(_ids);
      await _align(tester, map, PatchMapAlignment.bottom);
      expect(map.editHistoryState.undoDepth, 1);
      expect(map.editHistoryState.redoDepth, 0);
    },
  );

  testWidgets(
    'preserves independent updates and rejects a queued stale replay',
    (tester) async {
      final map = PatchMapController();
      await tester.pumpWidget(_host(map));
      await _draw(tester, map);
      map.select(['a', 'b']);
      await _align(tester, map, PatchMapAlignment.left);

      expect(
        (await _submit(
          tester,
          map.updateValues(const [
            PatchMapUpdate(_b, {
              'label': 'fresh',
              'attrs': {'y': 95},
            }),
          ]),
        )).outcome,
        PatchMapOutcome.applied,
      );
      expect(map.editHistoryState.canUndo, isTrue);
      final undo = await _submit(tester, map.undo());
      expect(undo.positions['b'], const Offset(45, 95));
      expect(map.getValue(_b)!['label'], 'fresh');
      expect(map.editHistoryState.canRedo, isTrue);

      final overwrite = map.updateValues(const [
        PatchMapUpdate(_b, {
          'attrs': {'x': 70},
        }),
      ]);
      final redo = map.redo();
      await progress(tester);
      expect((await overwrite).outcome, PatchMapOutcome.applied);
      expect((await redo).result.failures.single.code, 'MOVE_CONFLICT');
      expect(map.getGeometry('b')!.origin, const Offset(70, 95));
      expect(map.editHistoryState.undoDepth, 0);
      expect(map.editHistoryState.redoDepth, 0);
    },
  );

  testWidgets('locked targets reject replay without advancing the cursor', (
    tester,
  ) async {
    final map = PatchMapController();
    await tester.pumpWidget(_host(map));
    await _draw(tester, map);
    map.select(_ids);
    await _align(tester, map, PatchMapAlignment.left);
    final aligned = _bounds(map);
    final lock = map.updateValues(const [
      PatchMapUpdate(_b, {'locked': true}),
    ]);
    final undo = map.undo();
    await progress(tester);
    expect((await lock).outcome, PatchMapOutcome.applied);
    expect((await undo).result.failures.single.code, 'MOVE_CONFLICT');
    expect(_bounds(map), aligned);
    expect(map.editHistoryState.undoDepth, 1);
    await _submit(
      tester,
      map.updateValues(const [
        PatchMapUpdate(_b, {'locked': false}),
      ]),
    );
    expect(
      (await _submit(tester, map.undo())).result.outcome,
      PatchMapOutcome.applied,
    );
  });

  testWidgets('retains history while inactive and on rejected replacements', (
    tester,
  ) async {
    final map = PatchMapController();
    await tester.pumpWidget(_host(map));
    await _draw(tester, map);
    map.select(_ids);
    await _align(tester, map, PatchMapAlignment.left);
    expect(
      (await map.draw([
        {'type': 'bad'},
      ])).outcome,
      PatchMapOutcome.rejected,
    );
    expect(map.editHistoryState.canUndo, isTrue);
    await tester.pumpWidget(_host(map, active: false));
    expect(map.editHistoryState.undoDepth, 1);
    expect(map.editHistoryState.canUndo, isFalse);
    expect((await map.undo()).result.failures.single.code, 'NOT_READY');
    await tester.pumpWidget(_host(map));
    expect(map.editHistoryState.canUndo, isTrue);

    final undo = map.undo();
    final replacement = map.draw(_scene);
    await progress(tester);
    expect((await undo).result.interruption, PatchMapInterruption.replaced);
    expect((await replacement).outcome, PatchMapOutcome.applied);
    expect(map.editHistoryState.undoDepth, 0);
    expect(map.editHistoryState.redoDepth, 0);
    map.select(_ids);
    await _align(tester, map, PatchMapAlignment.top);
    await tester.pumpWidget(const SizedBox());
    expect(map.editHistoryState.undoDepth, 0);
    expect((await map.undo()).result.failures.single.code, 'DETACHED');
    await tester.pumpWidget(_host(map));
    await _draw(tester, map);
    expect((await map.undo()).result.outcome, PatchMapOutcome.unchanged);
  });

  testWidgets('zero limit still applies edits without retaining history', (
    tester,
  ) async {
    final map = PatchMapController();
    final history = <PatchMapEditHistoryState>[];
    await tester.pumpWidget(_host(map, limit: 0, onHistory: history.add));
    await _draw(tester, map);
    map.select(_ids);
    await _align(tester, map, PatchMapAlignment.top);
    expect(history, isEmpty);
    expect(map.editHistoryState.undoDepth, 0);
    expect((await map.undo()).result.outcome, PatchMapOutcome.unchanged);
  });
}
