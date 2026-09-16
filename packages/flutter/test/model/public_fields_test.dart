import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:conalog_patch_map/src/model/dataset.dart';

void main() {
  final cases =
      jsonDecode(File('../../conformance/model/cases.json').readAsStringSync())
          as List;
  final expected = {
    for (final entry
        in jsonDecode(
              File('../../conformance/model/expected.json').readAsStringSync(),
            )
            as List)
      entry['id']: entry['actual'],
  };
  test(
    'public model fields and finite union variants match exact npm normalization',
    () {
      for (final entry in cases.where((c) => c['reject'] != true)) {
        final input = entry['dataset'];
        final before = jsonEncode(input);
        final result = PatchMapDataset.parse(input);
        expect(
          {'dataset': result.snapshot(), 'semanticHash': result.semanticHash},
          expected[entry['id']],
          reason: entry['id'],
        );
        expect(jsonEncode(input), before, reason: entry['id']);
        expect(
          PatchMapDataset.parse(result.snapshot()).semanticHash,
          result.semanticHash,
          reason: entry['id'],
        );
      }
    },
  );
  test(
    'public model critical failures match npm code and exact field path',
    () {
      for (final entry in cases.where((c) => c['reject'] == true)) {
        final before = jsonEncode(entry['dataset']);
        expect(
          () => PatchMapDataset.parse(entry['dataset']),
          throwsA(
            isA<PatchMapDatasetError>()
                .having(
                  (error) => error.code,
                  'code',
                  expected[entry['id']]['code'],
                )
                .having(
                  (error) => error.datasetPath,
                  'path',
                  expected[entry['id']]['path'],
                ),
          ),
          reason: entry['id'],
        );
        expect(jsonEncode(entry['dataset']), before, reason: entry['id']);
      }
    },
  );
}
