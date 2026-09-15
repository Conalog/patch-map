import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patch_map/patch_map.dart';

import '../lib/bar_demo.dart';

void main() {
  testWidgets('service panel demo separates height and text updates', (
    tester,
  ) async {
    await tester.pumpWidget(const BarDemoApp());
    for (
      var attempt = 0;
      attempt < 100 && find.text('5,000개 panel 준비 완료').evaluate().isEmpty;
      attempt++
    ) {
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 50)),
      );
      await tester.pump();
    }
    expect(find.text('5,000개 panel 준비 완료'), findsOneWidget);
    final controller = tester
        .widget<PatchMapView>(find.byType(PatchMapView))
        .controller;
    primitives(String type) => controller
        .renderSnapshot
        .geometry
        .primitives
        .where((p) => p.type == type)
        .toList();
    final backgrounds = primitives(
      'background',
    ).map((p) => p.localRect.height).toList();
    expect(backgrounds, hasLength(5000));
    expect(backgrounds.every((height) => height == 80), isTrue);
    expect(
      primitives('bar').every((p) => p.visible && p.localRect.height == 74),
      isTrue,
    );
    expect(primitives('text').every((p) => !p.visible), isTrue);

    // Disable animation to inspect committed destinations without a fake clock.
    await tester.tap(find.byType(Switch));
    await tester.pump();
    await tester.tap(find.text('전체 높이 랜덤 변경'));
    await tester.pump();
    expect(find.textContaining('5000개 · committed'), findsOneWidget);
    final heights = primitives('bar').map((p) => p.localRect.height).toList();
    expect(heights, hasLength(5000));
    expect(heights.every((h) => h > 0 && h < 74), isTrue);

    final camera = controller.viewport.state;
    await tester.tap(find.text('Text 값'));
    await tester.pump();
    expect(
      primitives('bar').every((p) => p.visible && p.localRect.height == 74),
      isTrue,
    );
    expect(primitives('text').where((p) => p.visible), hasLength(5000));
    for (var update = 0; update < 2; update++) {
      final previous = primitives('text').map((p) => p.value['text']).toList();
      await tester.tap(find.text('전체 텍스트 랜덤 변경'));
      await tester.pump();
      expect(find.textContaining('5000개 · committed'), findsOneWidget);
      final current = primitives('text');
      for (var i = 0; i < current.length; i++) {
        expect(current[i].value['text'], isNot(previous[i]));
      }
      expect(primitives('bar').every((p) => p.localRect.height == 74), isTrue);
      expect(
        primitives('background').map((p) => p.localRect.height),
        backgrounds,
      );
    }
    await tester.tap(find.text('Bar 높이'));
    await tester.pump();
    expect(primitives('bar').map((p) => p.localRect.height), heights);
    expect(primitives('text').every((p) => !p.visible), isTrue);
    expect(controller.viewport.state, camera);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });
}
