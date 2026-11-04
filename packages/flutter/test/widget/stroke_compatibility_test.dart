import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import '../rendering/stroke_compatibility_test.dart' show ignored;
import 'patch_map_view_test.dart' as support;

Future<Uint8List> pixels(WidgetTester tester) async {
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
      return (await image.toByteData(
        format: ui.ImageByteFormat.rawStraightRgba,
      ))!.buffer.asUint8List();
    } finally {
      image.dispose();
    }
  }))!;
}

void main() {
  testWidgets(
    'public updates preserve ignored stroke input without failing paint, geometry or selection',
    (tester) async {
      final controller = PatchMapController();
      final phases = <PatchMapPhase>[], failures = <PatchMapFailure>[];
      await tester.pumpWidget(
        support.host(
          controller,
          phase: phases.add,
          imageFailure: failures.addAll,
        ),
      );
      final draw = controller.draw([
        {
          'type': 'rect',
          'id': 'a',
          'size': 50,
          'stroke': {'color': '#ff0000', 'width': 8},
        },
        {
          'type': 'rect',
          'id': 'b',
          'size': 50,
          'attrs': {'x': 100},
        },
        {
          'type': 'relations',
          'id': 'r',
          'links': [
            {'source': 'a', 'target': 'b'},
            {'source': 'a', 'target': 'a'},
          ],
          'style': {'color': '#00aa0080', 'width': 6, 'alpha': .4},
        },
      ]);
      await support.progress(tester);
      expect((await draw).outcome, PatchMapOutcome.applied);
      controller.select(['a']);
      await tester.pump();
      final baseline = await pixels(tester);
      final update = controller.updateValues([
        PatchMapUpdate(const PatchMapTarget('a'), {
          'stroke': {...ignored, 'alpha': 0},
        }),
        const PatchMapUpdate(PatchMapTarget('r'), {
          'style': {...ignored, 'opacity': .4},
        }),
      ]);
      await support.progress(tester);
      expect((await update).outcome, PatchMapOutcome.applied);
      expect(controller.phase, PatchMapPhase.ready);
      expect(phases, isNot(contains(PatchMapPhase.failed)));
      expect(failures, isEmpty);
      expect(await pixels(tester), baseline);
      final stroke =
          controller.getValue(const PatchMapTarget('a'))!['stroke'] as Map;
      expect(stroke['color'], '#ff0000');
      expect(stroke['width'], 8);
      expect(stroke['alpha'], 0);
      expect(stroke['fill'], ignored['fill']);
      expect(stroke['texture'], ignored['texture']);
      for (final patch in [
        {'color': 'unknownStrokeToken'},
        {'cap': 'triangle'},
        {'opacity': .4},
      ]) {
        final rejected = await controller.updateValues([
          PatchMapUpdate(const PatchMapTarget('a'), {'stroke': patch}),
        ]);
        expect(rejected.outcome, PatchMapOutcome.rejected);
        expect(controller.phase, PatchMapPhase.ready);
      }
      expect(await pixels(tester), baseline);
      await tester.pumpWidget(const SizedBox());
      expect(controller.isAttached, isFalse);
    },
  );
}
