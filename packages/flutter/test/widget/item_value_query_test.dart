import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'patch_map_view_test.dart' as support;

void main() {
  for (final grid in [false, true]) {
    testWidgets(
      'whole ${grid ? 'grid cell' : 'item'} query shares current immutable components',
      (tester) async {
        final controller = PatchMapController();
        final item = {
          'size': 40,
          'components': [
            {'type': 'text', 'id': 't', 'text': 'old'},
            {'type': 'bar', 'id': 'b', 'source': {}, 'size': 10},
          ],
        };
        final id = grid ? 'g.0.0' : 'i';
        final owner = PatchMapTarget(id);
        final text = PatchMapTarget(id, componentId: 't');
        await tester.pumpWidget(support.host(controller));
        final drawing = controller.draw([
          if (grid)
            {
              'type': 'grid',
              'id': 'g',
              'cells': [
                [1],
              ],
              'item': item,
            }
          else
            {'type': 'item', 'id': 'i', ...item},
        ]);
        await support.progress(tester);
        expect((await drawing).outcome, PatchMapOutcome.applied);
        final held = controller.getValue(owner)!;
        // Do not read the component list until after the retained update.
        final update = controller.updateValues([
          PatchMapUpdate(text, {'text': 'new'}),
        ]);
        await support.progress(tester);
        expect((await update).outcome, PatchMapOutcome.applied);
        final current = controller.getValue(owner)!;
        final components = current['components'] as List;
        expect(
          (components.first as Map)['text'],
          controller.getValue(text)!['text'],
        );
        expect((components.first as Map)['text'], 'new');
        expect(((held['components'] as List).first as Map)['text'], 'old');
        expect(identical(controller.getValue(owner), current), isTrue);
        expect(() => current['label'] = 'mutated', throwsUnsupportedError);
        expect(() => components.clear(), throwsUnsupportedError);
        expect(
          () => (components.first as Map)['text'] = 'mutated',
          throwsUnsupportedError,
        );

        await tester.pumpWidget(support.host(controller, active: false));
        final pending = controller.updateValues([
          PatchMapUpdate(text, {'text': 'later'}),
        ]);
        await support.progress(tester, 2);
        expect(identical(controller.getValue(owner), current), isTrue);
        await tester.pumpWidget(support.host(controller));
        await support.progress(tester);
        expect((await pending).outcome, PatchMapOutcome.applied);
        expect(
          ((controller.getValue(owner)!['components'] as List).first
              as Map)['text'],
          'later',
        );
        expect((components.first as Map)['text'], 'new');
        await tester.pumpWidget(const SizedBox());
        expect(controller.getValue(owner), isNull);
        expect(tester.takeException(), isNull);
      },
    );
  }
}
