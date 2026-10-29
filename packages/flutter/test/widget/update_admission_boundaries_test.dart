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
  }
}
