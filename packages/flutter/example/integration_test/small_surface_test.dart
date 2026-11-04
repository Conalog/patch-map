import 'dart:convert';

import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/foundation.dart' show debugPrintSynchronously;
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'presentation_test.dart' show capture;
import 'replacement_test.dart' show host, rectangle;
import 'runtime_test.dart' show submitted;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('small native surface can draw and resize without fatal failure', (
    tester,
  ) async {
    final controller = PatchMapController(), boundary = GlobalKey();
    await tester.pumpWidget(
      host(controller, boundary, size: const Size(20, 100)),
    );
    final draw = controller.draw(rectangle);
    Object? failure;
    final result = await submitted(tester, draw).catchError((Object error) {
      failure = error;
      return PatchMapResult(PatchMapOutcome.rejected);
    });
    final beforeResize = controller.phase;
    tester.takeException();
    await tester.pumpWidget(host(controller, boundary));
    await tester.pumpAndSettle();
    final afterResize = controller.phase;
    debugPrintSynchronously(
      'SMALL_SURFACE_PROBE ${jsonEncode({'beforeResize': beforeResize.name, 'afterResize': afterResize.name, 'outcome': result.outcome.name, 'error': failure?.toString()})}',
    );
    await capture(boundary, 'small-surface-resized');
    await tester.pumpWidget(const SizedBox.shrink());
    expect(failure, isNull);
    expect(result.outcome, PatchMapOutcome.applied);
    expect(beforeResize, PatchMapPhase.ready);
    expect(afterResize, PatchMapPhase.ready);
    expect(tester.takeException(), isNull);
  });
}
