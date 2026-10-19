import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patch_map_example/workload.dart';

Future<void> progress(WidgetTester tester) async {
  for (var i = 0; i < 16; i++) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 1)),
    );
    await tester.pump(const Duration(milliseconds: 16));
  }
}

void main() {
  for (final layout in MapLayout.values) {
    testWidgets(
      '${layout.name} example data draws and all update kinds are admitted through public API',
      (tester) async {
        final controller = PatchMapController();
        await tester.pumpWidget(
          MediaQuery(
            data: const MediaQueryData(size: Size(400, 400)),
            child: Directionality(
              textDirection: TextDirection.ltr,
              child: SizedBox(
                width: 400,
                height: 400,
                child: PatchMapView(controller: controller),
              ),
            ),
          ),
        );
        final scene = MapWorkload(layout, count: 4);
        final draw = controller.draw(scene.data);
        await progress(tester);
        final drawn = await draw;
        expect(
          drawn.failures,
          isEmpty,
          reason: drawn.failures
              .map((f) => '${f.path}: ${f.message}')
              .join('\n'),
        );
        expect(drawn.outcome, PatchMapOutcome.applied);
        for (final kind in UpdateWorkload.values) {
          final pending = controller.updateValues(
            scene.updates(kind, kind.index),
          );
          await progress(tester);
          final result = await pending;
          expect(
            result.failures,
            isEmpty,
            reason: result.failures
                .map((f) => '${f.path}: ${f.message}')
                .join('\n'),
          );
          expect(result.outcome, PatchMapOutcome.applied);
        }
        // Normalization is permitted once; later 0% full requests are no-ops.
        for (final kind in UpdateWorkload.values) {
          final normalize = controller.updateValues(
            scene.benchmarkUpdates(kind, 0, changedPercent: 0),
          );
          await progress(tester);
          expect((await normalize).failures, isEmpty);
          final unchanged = controller.updateValues(
            scene.benchmarkUpdates(kind, 1, changedPercent: 0),
          );
          await progress(tester);
          expect((await unchanged).outcome, PatchMapOutcome.unchanged);
        }
        final focus = controller.focus([scene.benchmarkFocusTarget!]);
        expect(focus.outcome, PatchMapOutcome.applied);
        final center = controller.toWorld(const Offset(400, 300));
        controller.setCamera(scale: .75);
        await tester.pump();
        expect(
          (controller.toWorld(const Offset(400, 300))! - center!).distance,
          lessThan(1e-9),
        );
        final a = controller.toWorld(Offset.zero)!;
        final b = controller.toWorld(const Offset(1, 0))!;
        expect((b - a).distance, closeTo(1 / .75, 1e-9));
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }
}
