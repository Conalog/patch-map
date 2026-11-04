import 'package:conalog_patch_map/src/api/target.dart';
import 'package:conalog_patch_map/src/api/update.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/presentation/presentation_admission.dart';
import 'package:conalog_patch_map/src/presentation/presentation_resolver.dart';
import 'package:flutter_test/flutter_test.dart';

DatasetDocument scene(Map<String, Object?> attrs) =>
    const DatasetReader().read([
      {'type': 'item', 'id': 'i', 'size': 20, 'attrs': attrs},
    ]);

Map<String, Object?> update(
  DatasetDocument document,
  Map<String, Object?> attrs,
) {
  const target = PatchMapTarget('i');
  final patch = const PresentationAdmission()
      .admit(document, [
        PatchMapUpdate(target, {'attrs': attrs}),
      ])
      .patches
      .single;
  final authored = authoredRecord(document, target);
  return const PresentationResolver().resolvePatch(authored, authored, patch);
}

void main() {
  test('full and partial attrs share scalar diagnostics and alpha bounds', () {
    final document = scene({});
    for (final key in [
      'x',
      'y',
      'angle',
      'rotation',
      'zIndex',
      'scaleX',
      'scaleY',
      'alpha',
    ]) {
      for (final value in [null, 'invalid', double.nan, double.infinity]) {
        expect(
          () => scene({key: value}),
          throwsA(
            isA<DatasetException>().having(
              (e) => e.path,
              'path',
              '\$[0].attrs.$key',
            ),
          ),
        );
        expect(
          () => update(document, {key: value}),
          throwsA(
            isA<DatasetException>().having(
              (e) => e.path,
              'path',
              '\$[0].values.attrs.$key',
            ),
          ),
        );
      }
    }
    for (final alpha in [-0.1, 1.1]) {
      expect(() => scene({'alpha': alpha}), throwsA(isA<DatasetException>()));
      expect(
        () => update(document, {'alpha': alpha}),
        throwsA(isA<DatasetException>()),
      );
    }
    expect(update(document, {'x': -2, 'alpha': 0})['attrs'], {
      'x': -2,
      'alpha': 0,
    });
    expect(scene({'alpha': 1}).targets['i']!.data['attrs'], {'alpha': 1});
  });

  test('full vector axes and partial baseline rules remain distinct', () {
    for (final key in ['scale', 'skew', 'pivot']) {
      final document = scene({
        key: {'x': 1, 'y': 3},
      });
      expect(
        () => scene({
          key: {'x': 2},
        }),
        throwsA(isA<DatasetException>()),
      );
      expect(
        (update(document, {
              key: {'x': 2},
            })['attrs']
            as Map)[key],
        {'x': 2, 'y': 3},
      );
      expect(
        () => update(scene({key: 1}), {
          key: {'x': 2},
        }),
        throwsA(isA<DatasetException>()),
      );
      expect(
        () => update(document, {
          key: {'x': null},
        }),
        throwsA(isA<DatasetException>()),
      );
      expect(
        () => update(document, {key: null}),
        throwsA(isA<DatasetException>()),
      );
      expect((update(document, {key: 2})['attrs'] as Map)[key], 2);
    }
  });

  test(
    'partial angle conflicts include baseline and extension nulls remain JSON',
    () {
      expect(
        () => scene({'angle': 1, 'rotation': 2}),
        throwsA(isA<DatasetException>()),
      );
      expect(
        () => update(scene({'angle': 1}), {'rotation': 2}),
        throwsA(isA<DatasetException>()),
      );
      expect(
        () => update(scene({'rotation': 1}), {'angle': 2}),
        throwsA(isA<DatasetException>()),
      );
      final extension = {
        'custom': {'nullable': null},
      };
      final document = scene(extension);
      expect(document.targets['i']!.data['attrs'], extension);
      expect(
        update(document, {
          'custom': {'next': null},
        })['attrs'],
        {
          'custom': {'nullable': null, 'next': null},
        },
      );
    },
  );
}
