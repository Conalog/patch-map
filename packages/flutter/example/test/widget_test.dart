import 'dart:ui' as ui;

import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patch_map_example/main.dart';

Future<void> advance(WidgetTester tester) async {
  for (var i = 0; i < 28; i++) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 1)),
    );
    await tester.pump(const Duration(milliseconds: 20));
  }
  // Widget tests do not emit the engine's final batched FrameTiming callback.
  await tester.pump(const Duration(seconds: 11));
  await tester.pump();
}

Future<int> panelWhitePixels(WidgetTester tester) async {
  final boundary = tester.renderObject<RenderRepaintBoundary>(
    find
        .descendant(
          of: find.byType(PatchMapView),
          matching: find.byType(RepaintBoundary),
        )
        .first,
  );
  return (await tester.runAsync(() async {
    final image = await boundary.toImage();
    try {
      final bytes = (await image.toByteData(
        format: ui.ImageByteFormat.rawStraightRgba,
      ))!;
      var white = 0;
      for (var y = image.height ~/ 2 - 8; y < image.height ~/ 2 + 8; y++) {
        for (var x = image.width ~/ 2 - 7; x < image.width ~/ 2 + 7; x++) {
          final offset = (y * image.width + x) * 4;
          if (bytes.getUint8(offset) > 180 &&
              bytes.getUint8(offset + 1) > 180 &&
              bytes.getUint8(offset + 2) > 180 &&
              bytes.getUint8(offset + 3) > 100) {
            white++;
          }
        }
      }
      return white;
    } finally {
      image.dispose();
    }
  }))!;
}

void main() {
  testWidgets(
    'manual zoom hides numbers, retains updates and survives mode replacement',
    (tester) async {
      await tester.pumpWidget(const PatchMapExampleApp(itemCount: 1));
      await advance(tester);
      final controller = tester
          .widget<PatchMapView>(find.byType(PatchMapView))
          .controller;
      // The first panel's world center; its full blue bar remains under the text.
      controller.setCamera(center: const Offset(180, 136), scale: .45);
      await tester.pump();
      await tester.pump();
      const target = PatchMapTarget('grid-0.0.0', componentId: 'text');
      final update = controller.updateValues([
        PatchMapUpdate(target, {'text': '888'}),
      ]);
      await advance(tester);
      expect((await update).outcome, PatchMapOutcome.applied);
      expect(controller.getValue(target)!['text'], '888');
      expect(await panelWhitePixels(tester), 0);
      controller.setCamera(scale: .46);
      await tester.pump();
      await tester.pump();
      expect(await panelWhitePixels(tester), greaterThan(0));
      expect(controller.getValue(target)!['text'], '888');
      controller.setCamera(scale: .44);
      await tester.pump();
      await tester.pump();
      await tester.tap(find.text('bar'));
      await advance(tester);
      await tester.tap(find.text('number'));
      await advance(tester);
      expect(controller.camera!.scale, closeTo(.44, 1e-9));
      expect(await panelWhitePixels(tester), 0);
      controller.setCamera(scale: .46);
      await tester.pump();
      await tester.pump();
      expect(await panelWhitePixels(tester), greaterThan(0));
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 300));
      expect(tester.takeException(), isNull);
    },
  );

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

  testWidgets('mode buttons prepare the matching scene and retain camera', (
    tester,
  ) async {
    await tester.pumpWidget(const PatchMapExampleApp(itemCount: 4));
    await advance(tester);
    final controller = tester
        .widget<PatchMapView>(find.byType(PatchMapView))
        .controller;
    controller.setCamera(
      center: const Offset(211, 312),
      scale: 1.25,
      rotation: .2,
    );
    await tester.pump();
    final origin = controller.toWorld(Offset.zero)!;
    final unit = controller.toWorld(const Offset(1, 0))!;
    await tester.tap(find.text('bar'));
    await advance(tester);
    expect(
      find.textContaining('mode: bar'),
      findsOneWidget,
      reason: tester.widget<Text>(find.byKey(const Key('metrics'))).data,
    );
    expect(find.textContaining('/bar/0: applied'), findsOneWidget);
    expect(
      controller.getValue(
        const PatchMapTarget('grid-0.0.0', componentId: 'text'),
      ),
      isNull,
    );
    expect(
      (controller.toWorld(Offset.zero)! - origin).distance,
      lessThan(1e-8),
    );
    expect(
      (controller.toWorld(const Offset(1, 0))! - unit).distance,
      lessThan(1e-8),
    );
    // Selection survives a repeated button, proving no replacement is performed.
    controller.select(['grid-0.0.0']);
    await tester.tap(find.text('bar'));
    await advance(tester);
    expect(controller.selected.single.id, 'grid-0.0.0');
    expect(find.textContaining('/bar/1: applied'), findsOneWidget);
    await tester.tap(find.text('number'));
    await advance(tester);
    expect(find.textContaining('mode: number'), findsOneWidget);
    final bar = controller.getValue(
      const PatchMapTarget('grid-0.0.0', componentId: 'bar'),
    )!;
    expect(bar['size'], {'width': '100%', 'height': '100%'});
    expect(
      controller.getValue(
        const PatchMapTarget('grid-0.0.0', componentId: 'text'),
      ),
      isNotNull,
    );
    await tester.tap(find.text('Stress ON'));
    await tester.pump(const Duration(milliseconds: 250));
    await tester.tap(find.text('Stress OFF'));
    await advance(tester);
    expect(
      controller.getValue(
        const PatchMapTarget('grid-0.0.0', componentId: 'bar'),
      ),
      bar,
    );
    expect(find.textContaining('/number/1: applied'), findsOneWidget);
    await tester.tap(find.text('mixed'));
    await advance(tester);
    expect(find.textContaining('mode: mixed'), findsOneWidget);
    expect(find.textContaining('/mixed/0: applied'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
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
