import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/presentation/presentation_admission.dart';
import 'package:conalog_patch_map/src/presentation/presentation_resolver.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'backend_resources_test.dart' as backend;
import 'patch_map_view_test.dart' as support;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'admitted text-only values do not traverse sibling geometry or style',
    () {
      final h = backend.Harness((_) => throw StateError('no assets expected'));
      final document = const DatasetReader().read([
        {
          'type': 'grid',
          'id': 'grid',
          'cells': [List.filled(10000, 1)],
          'item': {
            'size': {'width': 40, 'height': 80},
            'components': [
              {'id': 'text', 'type': 'text', 'text': '1'},
            ],
          },
        },
      ]);
      final batch = const PresentationAdmission().admit(document, [
        for (var i = 0; i < 10000; i++)
          PatchMapUpdate(PatchMapTarget('grid.0.$i', componentId: 'text'), {
            'text': '$i',
          }),
      ]);
      h.backend.validateUpdate(
        document,
        batch,
        (_) => throw StateError(
          'text-only validation must not read retained sibling records',
        ),
      );
      final style = const PresentationAdmission().admit(document, [
        const PatchMapUpdate(PatchMapTarget('grid.0.0', componentId: 'text'), {
          'text': '2',
          'style': {'fontWeight': 'bolder'},
        }),
      ]);
      expect(
        () => h.backend.validateUpdate(
          document,
          style,
          (target) => authoredRecord(document, target),
        ),
        throwsFormatException,
      );
      h.close();
    },
  );

  testWidgets('invalid final string still rejects the entire update', (
    tester,
  ) async {
    final controller = PatchMapController();
    await tester.pumpWidget(support.host(controller));
    final draw = controller.draw([
      {'type': 'text', 'id': 'a', 'text': 'old-a'},
      {'type': 'text', 'id': 'b', 'text': 'old-b'},
    ]);
    await support.progress(tester);
    await draw;
    final result = await controller.updateValues([
      const PatchMapUpdate(PatchMapTarget('a'), {'text': 'new-a'}),
      const PatchMapUpdate(PatchMapTarget('b'), {'text': 42}),
    ]);
    expect(result.outcome, PatchMapOutcome.rejected);
    expect(controller.getValue(const PatchMapTarget('a'))?['text'], 'old-a');
    expect(controller.phase, PatchMapPhase.ready);
    await tester.pumpWidget(const SizedBox());
  });
}
