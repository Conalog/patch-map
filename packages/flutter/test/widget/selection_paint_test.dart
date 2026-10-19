import 'dart:ui' as ui;

import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'patch_map_view_test.dart' as support;

Future<int> bluePixels(WidgetTester tester) async {
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
        if (bytes.getUint8(i) < 90 &&
            bytes.getUint8(i + 1) > 70 &&
            bytes.getUint8(i + 2) > 180 &&
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
