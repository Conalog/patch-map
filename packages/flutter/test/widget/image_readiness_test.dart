import 'dart:convert';
import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'patch_map_view_test.dart' as support;

String svg(String body) =>
    'data:image/svg+xml;base64,${base64Encode(utf8.encode('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10">$body</svg>'))}';
void main() {
  testWidgets(
    'late intrinsic image geometry becomes targetable without a second readiness phase',
    (tester) async {
      final controller = PatchMapController(), phases = <PatchMapPhase>[];
      await tester.pumpWidget(support.host(controller, phase: phases.add));
      final drawn = controller.draw([
        {
          'id': 'a',
          'type': 'image',
          'source': svg('<rect width="20" height="10" fill="red"/>'),
        },
      ]);
      await support.progress(tester, 16);
      expect((await drawn).outcome, PatchMapOutcome.applied);
      expect(controller.fit(targets: ['a']).outcome, PatchMapOutcome.applied);
      expect(
        controller.getValue(const PatchMapTarget('a'))!.containsKey('size'),
        false,
      );
      expect(phases, [PatchMapPhase.preparing, PatchMapPhase.ready]);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'initial failed SVG reports target while the diagram becomes ready',
    (tester) async {
      final controller = PatchMapController(), failures = <PatchMapFailure>[];
      await tester.pumpWidget(
        support.host(controller, imageFailure: failures.addAll),
      );
      final source = svg('<foreignObject width="20" height="10"/>');
      final drawn = controller.draw([
        {
          'id': 'a',
          'type': 'image',
          'source': source,
          'size': {'width': 20, 'height': 10},
        },
      ]);
      await support.progress(tester, 16);
      expect((await drawn).outcome, PatchMapOutcome.applied);
      expect(controller.phase, PatchMapPhase.ready);
      expect(failures.single.target, const PatchMapTarget('a'));
      final moved = controller.updateValues([
        const PatchMapUpdate(PatchMapTarget('a'), {
          'attrs': {'x': 5},
        }),
      ]);
      await support.progress(tester);
      expect((await moved).outcome, PatchMapOutcome.applied);
      final retry = controller.updateValues([
        PatchMapUpdate(const PatchMapTarget('a'), {'source': source}),
      ]);
      await support.progress(tester);
      expect((await retry).outcome, PatchMapOutcome.partialFailure);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
