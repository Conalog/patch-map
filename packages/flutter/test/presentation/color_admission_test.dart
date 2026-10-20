import 'package:conalog_patch_map/src/api/target.dart';
import 'package:conalog_patch_map/src/api/update.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/presentation/presentation_admission.dart';
import 'package:conalog_patch_map/src/presentation/presentation_resolver.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final scene = const DatasetReader().read([
    {
      'id': 'g',
      'type': 'grid',
      'cells': [List.filled(300, 1)],
      'item': {
        'size': 20,
        'components': [
          {'id': 'bar', 'type': 'bar', 'size': 20, 'source': {}},
        ],
      },
    },
  ]);
  PatchMapTarget target(int i) => PatchMapTarget('g.0.$i', componentId: 'bar');
  const admission = PresentationAdmission();

  test(
    'repeated and excess unique scalar colors retain exact admitted values',
    () {
      for (final repeated in [true, false]) {
        final colors = [
          for (var i = 0; i < 300; i++)
            repeated ? '#336699' : '#${i.toRadixString(16).padLeft(6, '0')}',
        ];
        final batch = admission.admit(scene, [
          for (var i = 0; i < colors.length; i++)
            PatchMapUpdate(target(i), {'tint': colors[i]}),
        ]);
        final resolved = const PresentationResolver().resolve(scene, batch);
        for (var i = 0; i < colors.length; i++) {
          expect(resolved[target(i)]!['tint'], colors[i]);
        }
        expect(
          () => admission.admit(scene, [
            for (var i = 0; i < 299; i++)
              PatchMapUpdate(target(i), {'tint': colors[i]}),
            PatchMapUpdate(target(299), {'tint': '#invalid'}),
          ]),
          throwsA(
            isA<DatasetException>().having(
              (e) => e.path,
              'path',
              r'$[299].values.tint',
            ),
          ),
        );
      }
    },
  );

  test('mutable colors are detached and checked for every yielded update', () {
    final channels = <String, Object?>{'r': 255, 'g': 0, 'b': 0};
    Iterable<PatchMapUpdate> updates({bool invalid = false}) sync* {
      yield PatchMapUpdate(target(0), {'tint': channels});
      channels['r'] = invalid ? 'bad' : 0;
      channels['g'] = 255;
      yield PatchMapUpdate(target(1), {'tint': channels});
    }

    final resolved = const PresentationResolver().resolve(
      scene,
      admission.admit(scene, updates()),
    );
    expect(resolved[target(0)]!['tint'], {'r': 255, 'g': 0, 'b': 0});
    expect(resolved[target(1)]!['tint'], {'r': 0, 'g': 255, 'b': 0});
    channels['r'] = 255;
    expect(
      () => admission.admit(scene, updates(invalid: true)),
      throwsA(
        isA<DatasetException>().having(
          (e) => e.path,
          'path',
          r'$[1].values.tint',
        ),
      ),
    );
  });

  test('unknown field diagnostics keep lexical order', () {
    expect(
      () => admission.admit(scene, [
        PatchMapUpdate(target(0), {'zUnknown': 1, 'aUnknown': 2}),
      ]),
      throwsA(
        isA<DatasetException>().having(
          (e) => e.path,
          'path',
          r'$[0].values.aUnknown',
        ),
      ),
    );
  });
}
