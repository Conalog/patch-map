import 'package:conalog_patch_map/src/api/target.dart';
import 'package:conalog_patch_map/src/api/update.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/presentation/presentation_admission.dart';
import 'package:conalog_patch_map/src/presentation/presentation_resolver.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'relation optional stroke fields survive normalization and partial updates',
    () {
      final doc = const DatasetReader().read([
        {
          'id': 'r',
          'type': 'relations',
          'links': [],
          'style': {'cap': 'round', 'join': 'bevel', 'opacity': .4},
        },
      ]);
      const target = PatchMapTarget('r');
      final before = authoredRecord(doc, target);
      final patch = const PresentationAdmission()
          .admit(doc, [
            const PatchMapUpdate(target, {
              'style': {'cap': 'square', 'miterLimit': 3},
            }),
          ])
          .patches
          .single;
      final next = const PresentationResolver().resolvePatch(
        before,
        before,
        patch,
      );
      expect((next['style'] as Map)['cap'], 'square');
      expect((next['style'] as Map)['join'], 'bevel');
      expect((next['style'] as Map)['miterLimit'], 3);
      expect((next['style'] as Map)['alpha'], .4);
    },
  );
}
