import 'dart:convert';

import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/foundation.dart'
    show debugPrintSynchronously, listEquals;
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'presentation_test.dart' show capture;
import 'replacement_test.dart' show host;
import 'runtime_test.dart' show submitted;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  for (final active in [true, false]) {
    for (final field in ['size', 'padding']) {
      testWidgets('grid $field rejects the whole native batch active=$active', (
        tester,
      ) async {
        final controller = PatchMapController(), boundary = GlobalKey();
        await tester.pumpWidget(host(controller, boundary));
        expect(
          (await submitted(
            tester,
            controller.draw([
              {
                'type': 'grid',
                'id': 'g',
                'cells': [
                  [1],
                ],
                'item': {'size': 100, 'padding': 20, 'components': []},
              },
              {
                'type': 'text',
                'id': 'label',
                'text': 'old',
                'attrs': {'x': 120, 'y': 30},
                'style': {'fontSize': 16},
              },
            ]),
          )).outcome,
          PatchMapOutcome.applied,
        );
        await tester.pumpAndSettle();
        final before = await capture(boundary, 'grid-$field-$active-before');
        if (!active) {
          await tester.pumpWidget(host(controller, boundary, active: false));
        }
        var settled = false;
        final pending = controller
            .updateValues([
              const PatchMapUpdate(PatchMapTarget('label'), {
                'text': 'changed',
              }),
              PatchMapUpdate(const PatchMapTarget('g.0.0'), {
                field: field == 'size' ? 10 : 60,
              }),
            ])
            .then((result) {
              settled = true;
              return result;
            });
        await tester.pump(const Duration(milliseconds: 16));
        final settledBeforeResume = settled;
        if (!active) await tester.pumpWidget(host(controller, boundary));
        final result = await submitted(tester, pending);
        await tester.pumpAndSettle();
        final after = await capture(boundary, 'grid-$field-$active-after');
        final text = controller.getValue(
          const PatchMapTarget('label'),
        )?['text'];
        final cell = controller.getValue(const PatchMapTarget('g.0.0'))!;
        debugPrintSynchronously(
          'GRID_ADMISSION_PROBE ${jsonEncode({'field': field, 'active': active, 'settledBeforeResume': settledBeforeResume, 'outcome': result.outcome.name, 'text': text, 'pixelsUnchanged': listEquals(before, after), 'cellSize': cell['size'], 'cellPadding': cell['padding']})}',
        );
        // A valid combined owner change still uses the ordinary submission path.
        final valid = await submitted(
          tester,
          controller.updateValues(const [
            PatchMapUpdate(PatchMapTarget('g.0.0'), {'size': 10, 'padding': 2}),
          ]),
        );
        await tester.pumpWidget(const SizedBox.shrink());
        expect(result.outcome, PatchMapOutcome.rejected);
        expect(result.failures.single.code, 'INVALID_GEOMETRY');
        expect(text, 'old');
        expect(after, orderedEquals(before));
        if (!active) expect(settledBeforeResume, isTrue);
        expect(valid.outcome, PatchMapOutcome.applied);
        expect(tester.takeException(), isNull);
      });
    }
  }
}
