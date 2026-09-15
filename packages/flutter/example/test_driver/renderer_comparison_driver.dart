import 'dart:convert';
import 'dart:io';
import 'package:integration_test/integration_test_driver.dart';

Future<void> main() => integrationDriver(
  timeout: const Duration(minutes: 18),
  writeResponseOnFailure: true,
  responseDataCallback: (data) async {
    final file = File(Platform.environment['PATCHMAP_COMPARISON_OUTPUT']!);
    await file.parent.create(recursive: true);
    await file.writeAsString(
      '${const JsonEncoder.withIndent('  ').convert(data)}\n',
    );
    stdout.writeln('COMPARISON_REPORT ${file.absolute.path}');
  },
);
