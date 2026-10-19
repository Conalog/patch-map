import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patch_map_example/main.dart';

void main() {
  testWidgets('automatic preparation waits for a real laid-out frame', (
    tester,
  ) async {
    await tester.pumpWidget(const PatchMapExampleApp(itemCount: 1));
    final map = tester.widget<PatchMapView>(find.byType(PatchMapView));
    expect(map.controller.phase, PatchMapPhase.empty);
    await tester.pump(const Duration(milliseconds: 16));
    expect(map.controller.phase, isNot(PatchMapPhase.empty));
    await tester.pumpWidget(const SizedBox.shrink());
    // Let the host's existing post-submission timing grace period settle.
    await tester.pump(const Duration(milliseconds: 300));
    expect(tester.takeException(), isNull);
  });

  testWidgets('manual host mounts and removes/reconnects the public map', (
    tester,
  ) async {
    await tester.pumpWidget(
      const PatchMapExampleApp(itemCount: 4, autoStart: false),
    );
    expect(find.text('PatchMap 10k native'), findsOneWidget);
    expect(find.text('number'), findsOneWidget);
    expect(find.text('bar'), findsOneWidget);
    expect(find.text('mixed'), findsOneWidget);
    await tester.tap(find.text('Remove'));
    await tester.pump();
    expect(find.text('Map removed'), findsOneWidget);
    await tester.tap(find.text('Reconnect'));
    await tester.pump();
    expect(find.text('Map removed'), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    expect(tester.takeException(), isNull);
  });
}
