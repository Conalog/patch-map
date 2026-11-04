import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'patch_map_view_test.dart' as support;
import 'presentation_test.dart' show centerPixel;
import 'resource_atomicity_test.dart' show png;

String svg(String body) =>
    'data:image/svg+xml;base64,${base64Encode(utf8.encode('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10">$body</svg>'))}';
void main() {
  testWidgets('replacement clears old pixels while first update waits', (
    tester,
  ) async {
    final controller = PatchMapController();
    await tester.pumpWidget(support.host(controller));
    final first = controller.draw(support.rectangle('old'));
    await support.progress(tester);
    await first;
    expect(await centerPixel(tester), [255, 0, 0, 255]);
    final bytes = (await tester.runAsync(png))!;
    final pending = Completer<ByteData?>();
    final requested = <String>[];
    tester.binding.defaultBinaryMessenger.setMockMessageHandler(
      'flutter/assets',
      (message) {
        requested.add(utf8.decode(message!.buffer.asUint8List()));
        return pending.future;
      },
    );
    addTearDown(
      () => tester.binding.defaultBinaryMessenger.setMockMessageHandler(
        'flutter/assets',
        null,
      ),
    );
    final replacement = controller.draw([
      {
        'type': 'image',
        'id': 'new',
        'size': 100,
        'source': 'replacement-initial.png',
      },
    ]);
    var completed = false;
    final update = controller
        .updateValues([
          const PatchMapUpdate(PatchMapTarget('new'), {
            'source': 'replacement-updated.png',
          }),
        ])
        .then((value) {
          completed = true;
          return value;
        });
    await support.progress(tester);
    expect(
      requested,
      containsAll(['replacement-initial.png', 'replacement-updated.png']),
    );
    expect(controller.phase, PatchMapPhase.preparing);
    expect(completed, isFalse);
    final waitingPixel = await centerPixel(tester);
    pending.complete(ByteData.sublistView(bytes));
    await support.progress(tester, 16);
    expect((await replacement).outcome, PatchMapOutcome.applied);
    expect((await update).outcome, PatchMapOutcome.applied);
    expect(controller.phase, PatchMapPhase.ready);
    await tester.pumpWidget(const SizedBox());
    expect(waitingPixel[3], 0, reason: 'The old drawing must be cleared');
    expect(tester.takeException(), isNull);
  });
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
        controller.getGeometry('a')!.bounds,
        const Rect.fromLTWH(0, 0, 20, 10),
      );
      expect(
        controller.getGeometry('a')!.corners!.bottomRight,
        const Offset(20, 10),
      );
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
