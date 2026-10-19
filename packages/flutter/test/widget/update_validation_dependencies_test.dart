import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/presentation/presentation_admission.dart';
import 'package:conalog_patch_map/src/presentation/presentation_resolver.dart';
import 'package:flutter_test/flutter_test.dart';

import 'backend_resources_test.dart' as backend;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final document = const DatasetReader().read([
    {
      'type': 'item',
      'id': 'i',
      'size': 40,
      'components': [
        {'type': 'background', 'id': 'bg', 'source': {}},
        {'type': 'bar', 'id': 'bar', 'source': {}, 'size': '50%'},
        {'type': 'text', 'id': 'text', 'text': '12'},
      ],
    },
  ]);
  const bar = PatchMapTarget('i', componentId: 'bar');
  late backend.Harness h;
  setUp(() {
    h = backend.Harness((_) => throw StateError('no asset loading'));
  });
  tearDown(() => h.close());

  test('unchanged bar fields need no owner or sibling validation', () {
    final batch = const PresentationAdmission().admit(document, [
      const PatchMapUpdate(bar, {'animationDuration': 200}),
    ]);
    var reads = 0;
    h.backend.validateUpdate(document, batch, (target) {
      expect(target, bar);
      reads++;
      return authoredRecord(document, target);
    });
    expect(reads, 1);
  });

  test(
    'component size validates against owner without unrelated text layout',
    () {
      void check(String height) {
        final batch = const PresentationAdmission().admit(document, [
          PatchMapUpdate(bar, {
            'size': {'height': height},
          }),
        ]);
        h.backend.validateUpdate(document, batch, (target) {
          expect(
            target.componentId == null || target == bar,
            true,
            reason: 'unchanged siblings cannot affect this size constraint',
          );
          return authoredRecord(document, target);
        });
      }

      expect(() => check('60%'), returnsNormally);
      expect(() => check('calc(50% - 30px)'), throwsA(isA<DatasetException>()));
    },
  );

  test('owner and component changes use the same final compound geometry', () {
    final batch = const PresentationAdmission().admit(document, [
      const PatchMapUpdate(bar, {
        'size': {'height': 'calc(100% - 50px)'},
      }),
      const PatchMapUpdate(PatchMapTarget('i'), {'size': 80}),
    ]);
    // The bar would be negative under the old size40, but is valid with size80.
    expect(
      () => h.backend.validateUpdate(
        document,
        batch,
        (target) => authoredRecord(document, target),
      ),
      returnsNormally,
    );
    final invalid = const PresentationAdmission().admit(document, [
      const PatchMapUpdate(PatchMapTarget('i'), {'size': 20}),
      const PatchMapUpdate(bar, {
        'size': {'height': 'calc(100% - 30px)'},
      }),
    ]);
    expect(
      () => h.backend.validateUpdate(
        document,
        invalid,
        (target) => authoredRecord(document, target),
      ),
      throwsA(isA<DatasetException>()),
    );
  });
}
