import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'patch_map_view_test.dart' as support;

void main() {
  for (final active in [true, false]) {
    testWidgets(
      'grid template component rejects atomically while active=$active',
      (tester) async {
        final controller = PatchMapController();
        await tester.pumpWidget(support.host(controller));
        final draw = controller.draw([
          {
            'type': 'grid',
            'id': 'g',
            'cells': [
              [1],
            ],
            'item': {
              'size': 20,
              'components': [
                {'type': 'text', 'id': 't', 'text': 'old'},
              ],
            },
          },
        ]);
        await support.progress(tester);
        expect((await draw).outcome, PatchMapOutcome.applied);
        const cell = PatchMapTarget('g.0.0', componentId: 't');
        if (!active) {
          await tester.pumpWidget(support.host(controller, active: false));
        }
        final result = await controller.updateValues([
          const PatchMapUpdate(cell, {'text': 'partial'}),
          const PatchMapUpdate(PatchMapTarget('g', componentId: 't'), {
            'text': 'invalid',
          }),
        ]);
        expect(result.outcome, PatchMapOutcome.rejected);
        expect(result.failures.single.code, 'MISSING_TARGET');
        expect(result.failures.single.path, 'g/t');
        expect(controller.getValue(cell)?['text'], 'old');
        expect(controller.phase, PatchMapPhase.ready);
        if (!active) await tester.pumpWidget(support.host(controller));
        await support.progress(tester);
        expect(tester.takeException(), isNull);
        expect(controller.phase, PatchMapPhase.ready);
        expect(controller.getValue(cell)?['text'], 'old');

        final valid = controller.updateValues([
          const PatchMapUpdate(cell, {'text': 'new'}),
        ]);
        await support.progress(tester);
        expect((await valid).outcome, PatchMapOutcome.applied);
        expect(controller.getValue(cell)?['text'], 'new');
        await tester.pumpWidget(const SizedBox());
      },
    );

    for (final gridCell in [false, true]) {
      testWidgets(
        'empty item content box rejects atomically while active=$active gridCell=$gridCell',
        (tester) async {
          final controller = PatchMapController();
          final id = gridCell ? 'g.0.0' : 'i';
          final target = PatchMapTarget(id);
          final item = <String, Object?>{
            'size': 100,
            'padding': 20,
            'components': [],
          };
          await tester.pumpWidget(support.host(controller));
          final draw = controller.draw([
            {'type': 'text', 'id': 'label', 'text': 'old'},
            if (gridCell)
              {
                'type': 'grid',
                'id': 'g',
                'cells': [
                  [1],
                ],
                'item': item,
              }
            else
              {'type': 'item', 'id': id, ...item},
          ]);
          await support.progress(tester);
          expect((await draw).outcome, PatchMapOutcome.applied);
          final geometry = controller.getGeometry(id);
          final value = controller.getValue(target);
          if (!active) {
            await tester.pumpWidget(support.host(controller, active: false));
          }
          for (final values in [
            <String, Object?>{'size': 10},
            <String, Object?>{'padding': 60},
          ]) {
            final result = await controller.updateValues([
              const PatchMapUpdate(PatchMapTarget('label'), {
                'text': 'partial',
              }),
              PatchMapUpdate(target, values),
            ]);
            expect(result.outcome, PatchMapOutcome.rejected);
            expect(result.failures.single.code, 'INVALID_GEOMETRY');
            expect(result.failures.single.path, 'padding');
            expect(controller.getValue(target), value);
            expect(
              controller.getValue(const PatchMapTarget('label'))?['text'],
              'old',
            );
            expect(controller.getGeometry(id)!.bounds, geometry!.bounds);
            expect(controller.phase, PatchMapPhase.ready);
          }
          if (!active) await tester.pumpWidget(support.host(controller));
          await support.progress(tester);
          expect(tester.takeException(), isNull);
          expect(controller.phase, PatchMapPhase.ready);

          final valid = controller.updateValues([
            PatchMapUpdate(target, const {'size': 10, 'padding': 2}),
          ]);
          await support.progress(tester);
          expect((await valid).outcome, PatchMapOutcome.applied);
          expect(controller.getValue(target)?['size'], {
            'width': 10,
            'height': 10,
          });
          await tester.pumpWidget(const SizedBox());
        },
      );
    }
  }
}
