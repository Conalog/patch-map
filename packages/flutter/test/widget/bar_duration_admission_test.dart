import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'patch_map_view_test.dart' as support;

List<Map<String, Object?>> scene([num duration = 200]) => [
  {
    'type': 'item',
    'id': 'i',
    'size': 100,
    'components': [
      {
        'type': 'bar',
        'id': 'bar',
        'source': {},
        'size': 20,
        'animationDuration': duration,
      },
    ],
  },
  {'type': 'text', 'id': 'label', 'text': 'old'},
];

void main() {
  test('authored bar duration must fit integer microseconds', () {
    for (final duration in <num>[
      0,
      .0005,
      200,
      9223372036854775,
      9223372036854774.0,
    ]) {
      expect(
        () => const DatasetReader().read(scene(duration)),
        returnsNormally,
      );
    }
    for (final duration in <num>[
      1e308,
      9223372036854776,
      9223372036854776.0,
      0x7fffffffffffffff,
    ]) {
      expect(
        () => const DatasetReader().read(scene(duration)),
        throwsA(isA<DatasetException>()),
        reason: '$duration milliseconds cannot fit integer microseconds',
      );
    }
  });

  for (final general in [false, true]) {
    testWidgets(
      'invalid bar duration rejects before publication general=$general',
      (tester) async {
        final controller = PatchMapController();
        await tester.pumpWidget(support.host(controller));
        final draw = controller.draw(scene());
        await support.progress(tester);
        expect((await draw).outcome, PatchMapOutcome.applied);
        const bar = PatchMapTarget('i', componentId: 'bar');
        final before = controller.getValue(bar);
        for (final duration in <num>[1e308, 9223372036854776]) {
          PatchMapResult? result;
          Object? error;
          controller
              .updateValues([
                const PatchMapUpdate(PatchMapTarget('label'), {
                  'text': 'changed',
                }),
                if (general)
                  const PatchMapUpdate(PatchMapTarget('i'), {'padding': 2}),
                PatchMapUpdate(bar, {
                  'size': 80,
                  'animationDuration': duration,
                }),
              ])
              .then<void>(
                (value) => result = value,
                onError: (Object value) => error = value,
              );
          await support.progress(tester);
          final reported = tester.takeException();
          expect(error, isNull);
          expect(reported, isNull);
          expect(result!.outcome, PatchMapOutcome.rejected);
          expect(result!.failures.single.code, 'INVALID_VALUE');
          expect(result!.failures.single.path, contains('animationDuration'));
          expect(controller.phase, PatchMapPhase.ready);
          expect(controller.getValue(bar), before);
          expect(
            controller.getValue(const PatchMapTarget('label'))?['text'],
            'old',
          );
        }
        final valid = controller.updateValues(const [
          PatchMapUpdate(bar, {'size': 80, 'animationDuration': 200}),
        ]);
        await support.progress(tester);
        expect((await valid).outcome, PatchMapOutcome.applied);
        await tester.pumpWidget(const SizedBox());
      },
    );
  }
}
