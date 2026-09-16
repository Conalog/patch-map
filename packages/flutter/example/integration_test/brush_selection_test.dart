import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:patch_map/patch_map.dart';
import '../lib/main.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  binding.framePolicy = LiveTestWidgetsFlutterBindingFramePolicy.fullyLive;
  testWidgets('service brush touch toggle erase and manual reset', (
    tester,
  ) async {
    final report = <String, dynamic>{
      'platform': Platform.operatingSystem,
      'completed': false,
    };
    binding.reportData = {'brushSelection': report};
    await tester.pumpWidget(const ComparisonApp());
    await tester.runAsync(() async {
      final deadline = DateTime.now().add(const Duration(seconds: 30));
      while (tester.widget<Text>(find.byKey(const Key('status'))).data !=
          'Ready · service') {
        if (DateTime.now().isAfter(deadline)) throw StateError('Not ready');
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }
    });
    await tester.pumpAndSettle();
    final view = find.byType(PatchMapView);
    final c = tester.widget<PatchMapView>(view).controller;
    final bounds = tester.renderObject<RenderBox>(view);
    Offset cell(String id) {
      final quad = c.renderSnapshot.geometry.targets[id]!.quad;
      final point = c.viewport.worldToScreen(
        (quad[0].x + quad[2].x) / 2,
        (quad[0].y + quad[2].y) / 2,
      );
      return bounds.localToGlobal(Offset(point[0], point[1]));
    }

    final start = cell('g0.0.0'), end = cell('g0.0.3');
    Future<void> hold() async {
      final touch = await tester.startGesture(start);
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 650)),
      );
      await touch.up();
      await tester.pumpAndSettle();
    }

    await hold();
    expect(c.selection.brush.state.enabled, true);
    final off = find.widgetWithText(OutlinedButton, '브러시 끄기');
    await tester.ensureVisible(off);
    await tester.tap(off);
    await tester.pumpAndSettle();
    expect(c.selection.brush.state.enabled, false);
    await hold();
    expect(c.selection.brush.state.enabled, true);
    final selected = c.selection.ids;
    await hold();
    expect(c.selection.brush.state.enabled, false);
    expect(c.selection.ids, selected, reason: 'toggle off cannot paint');
    c.selection.clear();
    c.selection.brush.enable();
    final before = c.viewport.snapshot();
    final samples = <double>[];
    for (var i = 0; i < 12; i++) {
      c.selection.clear();
      final touch = await tester.startGesture(start);
      final watch = Stopwatch()..start();
      await touch.moveTo(end);
      watch.stop();
      if (i >= 3) samples.add(watch.elapsedMicroseconds / 1000);
      await touch.up();
      await tester.pumpAndSettle();
      expect(c.selection.ids, ['g0.0.0', 'g0.0.1', 'g0.0.2', 'g0.0.3']);
      expect(c.viewport.snapshot(), before);
    }
    final erase = await tester.startGesture(start);
    await erase.moveTo(end);
    await erase.up();
    await tester.pumpAndSettle();
    expect(c.selection.ids, isEmpty);
    c.rotation.set(90);
    await tester.pumpAndSettle();
    final rotated = await tester.startGesture(cell('g0.0.0'));
    await rotated.moveTo(cell('g0.0.3'));
    await rotated.up();
    await tester.pumpAndSettle();
    expect(c.selection.ids, ['g0.0.0', 'g0.0.1', 'g0.0.2', 'g0.0.3']);
    expect(tester.takeException(), isNull);
    report.addAll({
      'completed': true,
      'panels': 5000,
      'warmup': 3,
      'strokeDispatchMs': samples,
      'viewportUnchanged': true,
      'toggleOffPreservesSelection': true,
      'manualDisableThenLongpress': true,
    });
    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
  });
}
