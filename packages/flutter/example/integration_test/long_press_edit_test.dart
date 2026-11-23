import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:patch_map_example/workload.dart';

import 'runtime_test.dart' show pixels, submitted;

Widget _host(
  PatchMapController controller,
  ValueChanged<PatchMapMoveResult> onMove, {
  GlobalKey? key,
  String? Function(PatchMapObject)? resolveTarget,
}) => Directionality(
  textDirection: TextDirection.ltr,
  child: Center(
    child: RepaintBoundary(
      key: key,
      child: SizedBox(
        width: 300,
        height: 240,
        child: PatchMapView(
          controller: controller,
          longPressEditEnabled: true,
          editTargetResolver: resolveTarget,
          onMoveResult: onMove,
        ),
      ),
    ),
  ),
);

Future<TestGesture> _press(WidgetTester tester, Offset local) async {
  final origin = tester.getTopLeft(find.byType(PatchMapView));
  final finger = await tester.startGesture(origin + local);
  await tester.pump(const Duration(milliseconds: 310));
  return finger;
}

Future<void> _wait(WidgetTester tester, bool Function() done) async {
  final deadline = Stopwatch()..start();
  while (!done() && deadline.elapsed.inSeconds < 20) {
    await tester.pump(const Duration(milliseconds: 16));
  }
  expect(done(), isTrue);
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    'native move swaps preview for moved pixels and cancels on pinch',
    (tester) async {
      final map = PatchMapController(), key = GlobalKey();
      final moves = <PatchMapMoveResult>[];
      await tester.pumpWidget(_host(map, moves.add, key: key));
      await submitted(
        tester,
        map.draw([
          {'type': 'rect', 'id': 'a', 'size': 20, 'fill': '#ff0000'},
        ]),
      );
      map.setCamera(center: Offset.zero, scale: 1);
      await tester.pumpAndSettle();

      Future<List<int>> at(Offset local) async {
        final image = await pixels(key);
        final index = (local.dy.toInt() * 300 + local.dx.toInt()) * 4;
        return image.sublist(index, index + 4);
      }

      final origin = tester.getTopLeft(find.byType(PatchMapView));
      final start = map.toLocal(const Offset(10, 10))!;
      const delta = Offset(45, 30);
      final finish = start + delta;
      final first = await _press(tester, start);
      expect(map.selected.single.id, 'a');
      await first.moveTo(origin + finish);
      await tester.pumpAndSettle();
      expect(await at(start), [255, 0, 0, 255]);
      expect(await at(finish), isNot([255, 0, 0, 255]));
      final second = await tester.startGesture(origin + const Offset(90, 60));
      await first.up();
      await second.up();
      await tester.pumpAndSettle();
      expect(map.selected, isEmpty);
      expect(moves, isEmpty);

      final drag = await _press(tester, start);
      await drag.moveTo(origin + finish);
      await drag.up();
      await _wait(tester, () => moves.isNotEmpty);
      expect(moves.single.result.outcome, PatchMapOutcome.applied);
      expect(map.getGeometry('a')!.origin, delta);
      expect(await at(finish), [255, 0, 0, 255]);
      expect(await at(start), isNot([255, 0, 0, 255]));
    },
  );

  testWidgets(
    'native range selects and translates 100 grids with 10000 cells',
    (tester) async {
      final map = PatchMapController(), moves = <PatchMapMoveResult>[];
      await tester.pumpWidget(
        _host(map, moves.add, resolveTarget: (hit) => hit.gridId),
      );
      final workload = MapWorkload(MapLayout.grid, mode: UpdateWorkload.bar);
      expect(
        (await submitted(tester, map.draw(workload.data))).outcome,
        PatchMapOutcome.applied,
      );
      await tester.pumpAndSettle();
      final origin = tester.getTopLeft(find.byType(PatchMapView));
      final range = await _press(tester, const Offset(4, 4));
      await range.moveTo(origin + const Offset(296, 236));
      await tester.pump();
      final choose = Stopwatch()..start();
      await range.up();
      choose.stop();
      await tester.pumpAndSettle();
      expect(map.selected.length, 100);

      const firstCell = 'grid-0.0.0', lastCell = 'grid-99.9.9';
      final before = map.getGeometry(lastCell)!.origin;
      final start = map.toLocal(map.getGeometry(firstCell)!.center!)!;
      final camera = map.camera;
      final drag = await _press(tester, start);
      final preview = Stopwatch()..start();
      for (var i = 0; i < 12; i++) {
        await drag.moveTo(origin + start + Offset(26 + i * 2, 20));
        await tester.pump(const Duration(milliseconds: 16));
      }
      preview.stop();
      final submit = Stopwatch()..start();
      await drag.up();
      await _wait(tester, () => moves.isNotEmpty);
      submit.stop();
      expect(moves.single.result.outcome, PatchMapOutcome.applied);
      expect(moves.single.positions.length, 100);
      final delta =
          map.toWorld(start + const Offset(48, 20))! - map.toWorld(start)!;
      expect(
        (map.getGeometry(lastCell)!.origin - before - delta).distance,
        lessThan(1e-7),
      );
      expect(map.camera, camera);
      debugPrint(
        'edit-10k rangeUpUs=${choose.elapsedMicroseconds} '
        'preview12PumpsUs=${preview.elapsedMicroseconds} '
        'moveSubmittedUs=${submit.elapsedMicroseconds}',
      );
    },
  );
}
