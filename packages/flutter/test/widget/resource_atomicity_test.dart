import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui';
import 'package:conalog_patch_map/src/api/target.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/presentation/field_operations.dart';
import 'package:conalog_patch_map/src/presentation/record_delta.dart';
import 'package:flutter_test/flutter_test.dart';
import 'backend_resources_test.dart' as support;

Future<Uint8List> png() async {
  final recorder = PictureRecorder();
  Canvas(recorder).drawRect(
    const Rect.fromLTWH(0, 0, 2, 3),
    Paint()..color = const Color(0xffff0000),
  );
  final picture = recorder.endRecording();
  final image = await picture.toImage(2, 3);
  picture.dispose();
  try {
    return (await image.toByteData(
      format: ImageByteFormat.png,
    ))!.buffer.asUint8List();
  } finally {
    image.dispose();
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'failed item retry cannot change the prior published raster use',
    () async {
      final bytes = await png();
      var rasterAttempts = 0;
      final h = support.Harness((key) async {
        if (key == 'r.png') {
          if (rasterAttempts++ == 0) {
            throw const FormatException('first source failure');
          }
          return bytes;
        }
        return Uint8List.fromList(
          utf8.encode(key == 'bad.svg' ? support.unsupported : support.good),
        );
      });
      final doc = const DatasetReader().read([
        {
          'type': 'item',
          'id': 'a',
          'size': 20,
          'components': [
            {'type': 'icon', 'id': 'raster', 'source': 'r.png', 'size': 10},
            {'type': 'icon', 'id': 'svg', 'source': 'good.svg', 'size': 10},
          ],
        },
      ]);
      final before = h.initial(doc);
      final oldRaster = before.node(0).components.first.content.assets.single;
      for (final asset in before.node(0).assets) {
        try {
          await asset.ready;
        } catch (_) {}
      }
      expect(oldRaster.intrinsicSize, isNull);
      final targetR = const PatchMapTarget('a', componentId: 'raster');
      final targetS = const PatchMapTarget('a', componentId: 'svg');
      final r = doc.targets['a']!.components['raster']!;
      final s = doc.targets['a']!.components['svg']!;
      final result = await h.backend.prepareUpdate(
        before,
        doc,
        {
          targetR: RecordDelta(before: r, after: r, fields: 0),
          targetS: RecordDelta(
            before: s,
            after: Map<String, Object?>.unmodifiable({
              ...s,
              'source': 'bad.svg',
            }),
            fields: RecordFields.source,
          ),
        },
        generation: 1,
        animate: false,
        intent: PresentationPlan([
          PresentationPatch(targetR, [
            FieldOperation(FieldOperationKind.set, ['source'], 'r.png'),
          ]),
          PresentationPatch(targetS, [
            FieldOperation(FieldOperationKind.set, ['source'], 'bad.svg'),
          ]),
        ]),
      );
      final oldSizeAfter = oldRaster.intrinsicSize;
      final oldFailure = oldRaster.failure;
      expect(result.publication, same(before));
      expect(result.failures.keys, ['a']);
      // The backend retained the identical publication as its result.
      h.backend.retire(result.publication);
      h.backend.retire(before);
      h.close();
      expect(rasterAttempts, 2);
      expect(oldFailure, isNotNull);
      expect(
        oldSizeAfter,
        isNull,
        reason:
            'an item rejected as a whole must preserve its old published resource',
      );
    },
  );
}
