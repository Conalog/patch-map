import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:patch_map/patch_map.dart';
import '../lib/main.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  binding.framePolicy = LiveTestWidgetsFlutterBindingFramePolicy.fullyLive;
  testWidgets('service blueprint touch box selects cells without moving map', (
    tester,
  ) async {
    final report = <String, dynamic>{
      'platform': Platform.operatingSystem,
      'completed': false,
    };
    binding.reportData = {'boxSelection': report};
    await tester.pumpWidget(const ComparisonApp());
    Future<void> ready() async {
      await tester.runAsync(() async {
        final deadline = DateTime.now().add(const Duration(seconds: 30));
        while (tester.widget<Text>(find.byKey(const Key('status'))).data !=
            'Ready · service') {
          if (DateTime.now().isAfter(deadline)) throw StateError('Not ready');
          await Future<void>.delayed(const Duration(milliseconds: 50));
        }
      });
      await tester.pumpAndSettle();
    }

    await ready();
    final toggle = find.widgetWithText(SwitchListTile, '드래그로 박스 선택');
    final scrollable = find
        .descendant(
          of: find.byKey(const Key('demo-controls')),
          matching: find.byType(Scrollable),
        )
        .first;
    await tester.scrollUntilVisible(toggle, 180, scrollable: scrollable);
    await tester.pumpAndSettle();
    await tester.tap(toggle);
    await tester.pump();
    await ready();
    expect(tester.widget<SwitchListTile>(toggle).value, true);
    final view = find.byType(PatchMapView);
    final c = tester.widget<PatchMapView>(view).controller;
    final bounds = tester.renderObject<RenderBox>(view);
    Offset screen(double x, double y) {
      final point = c.viewport.worldToScreen(x, y);
      return bounds.localToGlobal(Offset(point[0], point[1]));
    }

    final a = c.renderSnapshot.geometry.targets['g0.0.0']!.quad.first;
    final b = c.renderSnapshot.geometry.targets['g0.1.1']!.quad[2];
    final before = c.viewport.snapshot();
    final start = screen(a.x + 3, a.y + 3);
    final end = screen(b.x - 3, b.y - 3);
    final drag = await tester.startGesture(start);
    await drag.moveTo(end);
    await tester.pump(const Duration(milliseconds: 50));
    expect(c.selection.ids, isEmpty, reason: 'commit only on pointer up');
    await drag.up();
    await tester.pumpAndSettle();
    expect(c.selection.ids, ['g0.0.0', 'g0.0.1', 'g0.1.0', 'g0.1.1']);
    expect(c.viewport.snapshot(), before);
    expect(
      tester.widget<Text>(find.byKey(const Key('status'))).data,
      isNot(contains('오류')),
    );
    expect(tester.takeException(), isNull);
    report['selected'] = c.selection.ids;
    report['viewportUnchanged'] = true;
    report['completed'] = true;
    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
  });
}
