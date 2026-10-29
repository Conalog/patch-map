import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

List<Map<String, Object?>> rectangle(String id, {String color = '#ff0000'}) => [
  {
    'type': 'rect',
    'id': id,
    'size': {'width': 100, 'height': 100},
    'fill': color,
  },
];
Widget host(
  PatchMapController controller, {
  bool active = true,
  Object? initial,
  ValueChanged<PatchMapPhase>? phase,
  ValueChanged<PatchMapInputEvent>? event,
  ValueChanged<List<PatchMapFailure>>? imageFailure,
  bool Function(PatchMapObject)? filter,
  PatchMapDragMode dragMode = PatchMapDragMode.pan,
  PatchMapSelectionStyle selectionStyle = const PatchMapSelectionStyle(),
}) => MediaQuery(
  data: const MediaQueryData(size: Size(400, 400)),
  child: Directionality(
    textDirection: TextDirection.ltr,
    child: Center(
      child: SizedBox(
        width: 400,
        height: 400,
        child: PatchMapView(
          controller: controller,
          active: active,
          initialData: initial,
          onEvent: event,
          onImageFailure: imageFailure,
          eventFilter: filter,
          dragMode: dragMode,
          selectionStyle: selectionStyle,
          onPhaseChanged: (value, _) => phase?.call(value),
        ),
      ),
    ),
  ),
);
Future<void> progress(WidgetTester tester, [int frames = 8]) async {
  for (var i = 0; i < frames; i++) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 1)),
    );
    await tester.pump(const Duration(milliseconds: 16));
  }
}

void main() {
  testWidgets(
    'first draw completes only with an actual submitted package paint',
    (tester) async {
      final controller = PatchMapController(), phases = <PatchMapPhase>[];
      await tester.pumpWidget(host(controller, phase: phases.add));
      var finished = false;
      final result = controller.draw(rectangle('a')).then((value) {
        finished = true;
        return value;
      });
      expect(finished, false);
      await progress(tester);
      expect((await result).outcome, PatchMapOutcome.applied);
      expect(controller.phase, PatchMapPhase.ready);
      expect(phases, [PatchMapPhase.preparing, PatchMapPhase.ready]);
      await tester.pumpWidget(const SizedBox());
      expect(controller.isAttached, false);
    },
  );
  testWidgets(
    'invalid replacement preserves the accepted generation and camera',
    (tester) async {
      final controller = PatchMapController();
      await tester.pumpWidget(host(controller));
      final draw = controller.draw(rectangle('a'));
      await progress(tester);
      await draw;
      controller.setCamera(
        center: const Offset(70, 80),
        scale: 2,
        rotation: .4,
      );
      final before = controller.toWorld(const Offset(200, 200));
      final result = await controller.draw([
        ...rectangle('b'),
        {'type': 'invalid', 'id': 'bad'},
      ]);
      expect(result.outcome, PatchMapOutcome.rejected);
      expect(controller.getValue(const PatchMapTarget('a'))?['id'], 'a');
      expect(controller.toWorld(const Offset(200, 200)), before);
      final overflow = await controller.draw([
        for (final x in [-1e308, 1e308])
          {
            'type': 'rect',
            'id': '$x',
            'size': {'width': 1e307, 'height': 10},
            'attrs': {'x': x},
          },
      ]);
      expect(overflow.outcome, PatchMapOutcome.rejected);
      expect(overflow.failures.single.code, 'INVALID_GEOMETRY');
      expect(controller.phase, PatchMapPhase.ready);
      expect(controller.getValue(const PatchMapTarget('a'))?['id'], 'a');
      expect(controller.toWorld(const Offset(200, 200)), before);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets('updates preserve camera and complete through the session', (
    tester,
  ) async {
    final controller = PatchMapController();
    await tester.pumpWidget(host(controller));
    final draw = controller.draw(rectangle('a'));
    await progress(tester);
    await draw;
    controller.setCamera(center: const Offset(11, 22), scale: 3, rotation: .2);
    final update = controller.updateValues([
      const PatchMapUpdate(PatchMapTarget('a'), {'fill': '#00ff00'}),
    ]);
    await progress(tester);
    expect((await update).outcome, PatchMapOutcome.applied);
    expect(controller.toWorld(const Offset(200, 200)), const Offset(11, 22));
    expect(controller.getValue(const PatchMapTarget('a'))?['fill'], '#00ff00');
    final noop = await controller.updateValues([
      const PatchMapUpdate(PatchMapTarget('a'), {'fill': '#00ff00'}),
    ]);
    expect(noop.outcome, PatchMapOutcome.unchanged);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets(
    'inactive update waits and removal settles before controller reuse',
    (tester) async {
      final controller = PatchMapController();
      await tester.pumpWidget(host(controller));
      final draw = controller.draw(rectangle('a'));
      await progress(tester);
      await draw;
      await tester.pumpWidget(host(controller, active: false));
      var finished = false;
      final pending = controller
          .updateValues([
            const PatchMapUpdate(PatchMapTarget('a'), {'fill': 'blue'}),
          ])
          .then((value) {
            finished = true;
            return value;
          });
      await progress(tester, 2);
      expect(finished, false);
      await tester.pumpWidget(const SizedBox());
      expect((await pending).interruption, PatchMapInterruption.detached);
      expect(
        (await controller.draw(rectangle('detached'))).outcome,
        PatchMapOutcome.rejected,
      );
      await tester.pumpWidget(host(controller));
      expect(controller.phase, PatchMapPhase.empty);
      final next = controller.draw(rectangle('new'));
      await progress(tester);
      expect((await next).outcome, PatchMapOutcome.applied);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'grid item number and bar changes use the actual native package',
    (tester) async {
      final controller = PatchMapController();
      await tester.pumpWidget(host(controller));
      final draw = controller.draw([
        {
          'type': 'grid',
          'id': 'g',
          'cells': [
            [1, 1],
          ],
          'item': {
            'size': {'width': 40, 'height': 60},
            'components': [
              {
                'type': 'background',
                'id': 'bg',
                'source': {'fill': '#ffffff', 'borderWidth': 1},
              },
              {
                'type': 'bar',
                'id': 'bar',
                'source': {'fill': '#00aa44', 'radius': 2},
                'size': {'width': '100%', 'height': '50%'},
              },
              {
                'type': 'text',
                'id': 'text',
                'text': '1234',
                'style': {
                  'fontFamily': 'FiraCode',
                  'fontSize': 'auto',
                  'autoFont': {'min': 8, 'max': 14},
                  'fontWeight': 500,
                  'align': 'center',
                  'wordWrap': true,
                  'wordWrapWidth': 'auto',
                },
              },
            ],
          },
        },
      ]);
      await progress(tester);
      final drawn = await draw;
      expect(
        drawn.outcome,
        PatchMapOutcome.applied,
        reason: drawn.failures
            .map((e) => "${e.code} ${e.path} ${e.message}")
            .join(";"),
      );
      final update = controller.updateValues([
        const PatchMapUpdate(PatchMapTarget('g.0.0', componentId: 'text'), {
          'text': '5678',
        }),
        const PatchMapUpdate(PatchMapTarget('g.0.0', componentId: 'bar'), {
          'size': {'height': '75%'},
        }),
      ]);
      await progress(tester);
      expect((await update).outcome, PatchMapOutcome.applied);
      expect(
        controller.getValue(
          const PatchMapTarget('g.0.0', componentId: 'text'),
        )?['text'],
        '5678',
      );
      await tester.pumpWidget(const SizedBox());
      await progress(tester, 2);
    },
  );
}
