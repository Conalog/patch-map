import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'foundation_test.dart' as foundation;
import 'presentation_test.dart' as presentation;
import 'runtime_test.dart' as runtime;

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  // Let asynchronously prepared publications request paint as they do in an app.
  binding.framePolicy = LiveTestWidgetsFlutterBindingFramePolicy.fullyLive;

  testWidgets('release checks execute on ${Platform.operatingSystem}', (
    tester,
  ) async {
    const expected = String.fromEnvironment('PATCH_MAP_RELEASE_PLATFORM');
    expect(Platform.operatingSystem, isIn(['android', 'ios']));
    if (expected.isNotEmpty) expect(Platform.operatingSystem, expected);
  });
  foundation.main();
  runtime.main();
  presentation.main();
}
