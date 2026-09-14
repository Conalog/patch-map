import 'dart:convert';
import 'dart:io';
import 'package:integration_test/integration_test_driver.dart';

Future<void> main() => integrationDriver(
  timeout: const Duration(minutes: 6),
  writeResponseOnFailure: true,
  responseDataCallback: (data) async {
    final destination =
        Platform.environment['PATCHMAP_BENCH_OUTPUT'] ??
        '../../../.artifacts/flutter/full-sdk-native-bars-${DateTime.now().millisecondsSinceEpoch}.json';
    final file = File(destination);
    await file.parent.create(recursive: true);
    await file.writeAsString(
      '${const JsonEncoder.withIndent('  ').convert(data)}\n',
    );
    stdout.writeln('PATCHMAP_FULL_SDK_BENCH ${file.absolute.path}');
  },
);
