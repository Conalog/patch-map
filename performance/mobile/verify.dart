import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'lib/geometry.dart';

void main(List<String> args) {
  final oracle = jsonDecode(File(args.single).readAsStringSync()) as Map;
  var vertices = 0;
  for (final count in [5000, 10000]) {
    for (final stride in [1, 10]) {
      final input = List.generate(count ~/ stride, (i) => 1.0 + i % 20);
      final actual = project(input, stride);
      final expected = Float32List.fromList(
        (jsonDecode(oracle['$count:$stride']) as List)
            .cast<num>()
            .map((v) => v.toDouble())
            .toList(),
      );
      checkVertices(actual, expected);
      vertices += actual.length ~/ 2;
      final updates = inputs(count, stride, 40);
      for (var sample = 1; sample < updates.length; sample++) {
        for (var i = 0; i < updates[sample].length; i++) {
          if (updates[sample][i] == updates[sample - 1][i]) {
            throw StateError('unchanged fixture height');
          }
        }
      }
    }
  }
  for (final value in [0.0, -1.0, 21.0, double.nan, double.infinity]) {
    try {
      project([value], 1);
    } on RangeError {
      continue;
    }
    throw StateError('invalid height accepted: $value');
  }
  print(
    'PASS: $vertices vertices match imported TypeScript kernel; fixtures change every targeted bar',
  );
}
