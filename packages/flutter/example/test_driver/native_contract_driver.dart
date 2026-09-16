import 'dart:convert';
import 'dart:io';
import 'package:integration_test/integration_test_driver.dart';

Future<void> main() => integrationDriver(
  timeout: const Duration(minutes: 4),
  writeResponseOnFailure: true,
  responseDataCallback: (data) async {
    final destination = Platform.environment['PATCHMAP_CONTRACT_OUTPUT'];
    if (destination == null)
      throw StateError('PATCHMAP_CONTRACT_OUTPUT is required');
    final file = File(destination);
    await file.parent.create(recursive: true);
    await file.writeAsString(
      '${const JsonEncoder.withIndent('  ').convert(data)}\n',
    );
    stdout.writeln('PATCHMAP_NATIVE_CONTRACT ${file.absolute.path}');
  },
);
