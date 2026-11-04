import 'dart:ui' as ui;

import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'patch_map_view_test.dart' as support;

Future<int> bluePixels(WidgetTester tester) =>
    coloredPixels(tester, const ui.Color(0xff2f80ed));

Future<int> coloredPixels(WidgetTester tester, ui.Color color) async {
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
        format: ui.ImageByteFormat.rawRgba,
      ))!;
      var count = 0;
      for (var i = 0; i < bytes.lengthInBytes; i += 4) {
        if ((bytes.getUint8(i) - color.r * 255).abs() < 20 &&
            (bytes.getUint8(i + 1) - color.g * 255).abs() < 20 &&
            (bytes.getUint8(i + 2) - color.b * 255).abs() < 20 &&
            bytes.getUint8(i + 3) > 200) {
          count++;
        }
      }
      return count;
    } finally {
      image.dispose();
    }
  }))!;
}

void main() {
  const green = ui.Color(0xff00aa00);
  const greenStyle = PatchMapSelectionStyle(
    color: green,
    strokeWidth: 4,
    displayMode: PatchMapSelectionDisplayMode.elementOnly,
  );

  testWidgets(
    'live style changes preserve selection, camera and pending value submission',
    (tester) async {
      final controller = PatchMapController(), events = <PatchMapInputEvent>[];
      await tester.pumpWidget(support.host(controller, event: events.add));
      final drawn = controller.draw(support.rectangle('a'));
      await support.progress(tester);
      await drawn;
      controller.select(['a']);
      controller.setCamera(scale: 2, rotation: .2);
      await tester.pump();
      final camera = controller.camera;
      events.clear();
      var finished = false;
      final update = controller
          .updateValues([
            const PatchMapUpdate(PatchMapTarget('a'), {'fill': '#333333'}),
          ])
          .then((result) {
            finished = true;
            return result;
          });
      expect(finished, isFalse);
      await tester.pumpWidget(
        support.host(controller, event: events.add, selectionStyle: greenStyle),
      );
      await support.progress(tester);
      expect((await update).outcome, PatchMapOutcome.applied);
      expect(
        controller.getValue(const PatchMapTarget('a'))!['fill'],
        '#333333',
      );
      expect(controller.selected.map((object) => object.id), ['a']);
      expect(controller.camera, camera);
      expect(events, isEmpty);
      expect(await bluePixels(tester), 0);
      expect(await coloredPixels(tester, green), greaterThan(100));
      await tester.pumpWidget(
        support.host(
          controller,
          selectionStyle: const PatchMapSelectionStyle(
            displayMode: PatchMapSelectionDisplayMode.hidden,
          ),
        ),
      );
      expect(controller.selected.map((object) => object.id), ['a']);
      await tester.pump();
      expect(await coloredPixels(tester, green), 0);
      expect(await bluePixels(tester), 0);
      await tester.pumpWidget(support.host(controller));
      await tester.pump();
      expect(await bluePixels(tester), greaterThan(100));
      expect(controller.camera, camera);
      // Equivalent new values must not create a follow-up map frame.
      await tester.pumpWidget(
        support.host(controller, selectionStyle: PatchMapSelectionStyle()),
      );
      expect(tester.binding.hasScheduledFrame, isFalse);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'style survives inactive changes and replacement; selection still resets',
    (tester) async {
      final controller = PatchMapController();
      await tester.pumpWidget(support.host(controller));
      final drawn = controller.draw(support.rectangle('a'));
      await support.progress(tester);
      await drawn;
      controller.select(['a']);
      await tester.pump();
      final blueCount = await bluePixels(tester);
      await tester.pumpWidget(support.host(controller, active: false));
      await tester.pumpWidget(
        support.host(controller, active: false, selectionStyle: greenStyle),
      );
      expect(await bluePixels(tester), blueCount);
      expect(controller.selected.map((object) => object.id), ['a']);
      await tester.pumpWidget(
        support.host(controller, selectionStyle: greenStyle),
      );
      await tester.pump();
      expect(await coloredPixels(tester, green), greaterThan(100));
      final replacement = controller.draw(support.rectangle('b'));
      await support.progress(tester);
      await replacement;
      expect(controller.selected.map((object) => object.id), isEmpty);
      expect(await coloredPixels(tester, green), 0);
      controller.select(['b']);
      await tester.pump();
      expect(await coloredPixels(tester, green), greaterThan(100));
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'invalid initial style rejects before attachment; invalid rebuild retains prior style',
    (tester) async {
      final controller = PatchMapController();
      const invalid = PatchMapSelectionStyle(strokeWidth: double.nan);
      await tester.pumpWidget(
        support.host(controller, selectionStyle: invalid),
      );
      expect(tester.takeException(), isArgumentError);
      expect(controller.isAttached, isFalse);
      await tester.pumpWidget(const SizedBox());
      await tester.pumpWidget(
        support.host(controller, selectionStyle: greenStyle),
      );
      final drawn = controller.draw(support.rectangle('a'));
      await support.progress(tester);
      await drawn;
      controller.select(['a']);
      await tester.pump();
      final before = await coloredPixels(tester, green);
      await tester.pumpWidget(
        support.host(controller, selectionStyle: invalid),
      );
      expect(tester.takeException(), isArgumentError);
      expect(controller.selected.map((object) => object.id), ['a']);
      expect(await coloredPixels(tester, green), before);
      // Subsequent valid commands and configuration still work.
      controller.setCamera(scale: 1);
      await tester.pumpWidget(support.host(controller));
      await tester.pump();
      expect(await bluePixels(tester), greaterThan(100));
      await tester.pumpWidget(const SizedBox());
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('controller selection paints and clears the package outline', (
    tester,
  ) async {
    final controller = PatchMapController();
    await tester.pumpWidget(support.host(controller));
    final draw = controller.draw(support.rectangle('a'));
    await support.progress(tester);
    await draw;
    expect(await bluePixels(tester), 0);
    controller.select(['a']);
    await tester.pump();
    expect(await bluePixels(tester), greaterThan(100));
    controller.clearSelection();
    await tester.pump();
    expect(await bluePixels(tester), 0);
    await tester.pumpWidget(const SizedBox());
  });
}
