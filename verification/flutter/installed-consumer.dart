import 'dart:ui' as ui;

// The extracted artifact's only PatchMap import is its public library.
import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _host(
  PatchMapController controller, {
  required List<PatchMapPhase> phases,
  required List<PatchMapFailure> failures,
  bool active = true,
}) => MediaQuery(
  data: const MediaQueryData(size: Size(240, 200)),
  child: Directionality(
    textDirection: TextDirection.ltr,
    child: Center(
      child: SizedBox(
        width: 240,
        height: 200,
        child: PatchMapView(
          controller: controller,
          active: active,
          onPhaseChanged: (phase, _) => phases.add(phase),
          onImageFailure: failures.addAll,
        ),
      ),
    ),
  ),
);

Future<void> _progress(WidgetTester tester, [int frames = 8]) async {
  for (var i = 0; i < frames; i++) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 1)),
    );
    await tester.pump(const Duration(milliseconds: 16));
  }
}

Future<PatchMapResult> _submitted(
  WidgetTester tester,
  Future<PatchMapResult> request,
) async {
  PatchMapResult? result;
  Object? failure;
  StackTrace? stack;
  request.then(
    (value) => result = value,
    onError: (Object error, StackTrace trace) {
      failure = error;
      stack = trace;
    },
  );
  for (var i = 0; i < 120 && result == null && failure == null; i++) {
    await _progress(tester, 1);
  }
  if (failure != null) Error.throwWithStackTrace(failure!, stack!);
  expect(result, isNotNull, reason: 'public request must settle after paint');
  return result!;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('installed bundled SVG and native font load', () async {
    final picture = await vg.loadPicture(
      const SvgAssetLoader(
        'assets/icons/object.svg',
        packageName: 'conalog_patch_map',
      ),
      null,
    );
    try {
      expect(picture.size.width, greaterThan(0));
      expect(picture.size.height, greaterThan(0));
      final bytes = await rootBundle.load(
        'packages/conalog_patch_map/assets/fonts/FiraCode-VF.ttf',
      );
      expect(bytes.getUint32(0), 0x00010000);
      expect(bytes.lengthInBytes, greaterThan(100000));
      await ui.loadFontFromList(
        bytes.buffer.asUint8List(bytes.offsetInBytes, bytes.lengthInBytes),
        fontFamily: 'InstalledFiraCode',
      );
    } finally {
      picture.picture.dispose();
    }
  });

  testWidgets('installed public runtime draw update getValue and detach', (
    tester,
  ) async {
    final controller = PatchMapController();
    final phases = <PatchMapPhase>[], failures = <PatchMapFailure>[];
    const panel = PatchMapTarget('panel');
    const number = PatchMapTarget('panel', componentId: 'number');
    const bar = PatchMapTarget('panel', componentId: 'level');
    expect(controller.isAttached, isFalse);
    expect((await controller.draw(const [])).outcome, PatchMapOutcome.rejected);
    await tester.pumpWidget(
      _host(controller, phases: phases, failures: failures),
    );
    expect(controller.isAttached, isTrue);
    final drawn = await _submitted(
      tester,
      controller.draw([
        {
          'type': 'item',
          'id': 'panel',
          'size': {'width': 40, 'height': 80},
          'padding': 3,
          'components': [
            {
              'type': 'background',
              'id': 'background',
              'source': {'fill': '#636363', 'radius': 6, 'borderWidth': 2},
            },
            {
              'type': 'bar',
              'id': 'level',
              'source': {'fill': '#0c73bf', 'radius': 3},
              'tint': 'white',
              'size': {'width': '100%', 'height': '50%'},
            },
            {
              'type': 'text',
              'id': 'number',
              'text': '1234',
              'margin': 4,
              'tint': 'white',
              'style': {
                'fontFamily': 'FiraCode',
                'fontWeight': 500,
                'fontSize': 'auto',
                'autoFont': {'min': 8, 'max': 14},
                'align': 'center',
                'wordWrap': true,
                'wordWrapWidth': 'auto',
              },
            },
          ],
        },
        {
          'type': 'image',
          'id': 'device',
          'source': 'device',
          'size': {'width': 30, 'height': 40},
          'attrs': {'x': 60},
        },
      ]),
    );
    expect(drawn.outcome, PatchMapOutcome.applied);
    expect(drawn.failures, isEmpty);
    expect(drawn.superseded, isFalse);
    expect(controller.phase, PatchMapPhase.ready);
    expect(controller.getValue(panel)?['type'], 'item');
    expect(controller.getValue(number)?['text'], '1234');
    expect(
      controller.getValue(const PatchMapTarget('device'))?['source'],
      'device',
    );
    await _progress(tester); // Bundled asynchronous SVG/atlas preparation.
    expect(phases, [PatchMapPhase.preparing, PatchMapPhase.ready]);
    expect(failures, isEmpty);

    final dimmed = controller.setPresentation(
      'filter',
      PatchMapPresentationLayer(
        scope: const [panel],
        targets: const [],
        unmatchedAlpha: .2,
      ),
    );
    expect(dimmed.changed, isTrue);
    expect(dimmed.scopeCount, 1);
    await _progress(tester);

    final updated = await _submitted(
      tester,
      controller.updateValues([
        const PatchMapUpdate(number, {'text': '654321'}),
        const PatchMapUpdate(bar, {
          'size': {'height': '75%'},
          'tint': '#2ecc71',
        }),
        const PatchMapUpdate(PatchMapTarget('device'), {'source': 'warning'}),
      ]),
    );
    expect(updated.outcome, PatchMapOutcome.applied);
    expect(updated.failures, isEmpty);
    expect(controller.getValue(number)?['text'], '654321');
    expect(
      controller.getValue(const PatchMapTarget('device'))?['source'],
      'warning',
    );
    final level = controller.getValue(bar)!;
    expect(level['size'], {'width': '100%', 'height': '75%'});
    expect(level['tint'], '#2ecc71');
    expect((level['source'] as Map)['radius'], 3);
    expect(() => level['tint'] = '#000000', throwsUnsupportedError);
    expect(controller.phase, PatchMapPhase.ready);

    expect(controller.clearPresentation('filter').changed, isTrue);
    expect(controller.getValue(number)?['text'], '654321');
    controller.setPresentation(
      'memo',
      PatchMapPresentationLayer(
        scope: const [panel],
        targets: const [panel],
        matchedAlpha: .5,
      ),
    );

    // Removal must settle a paused pending request and release the binding.
    await tester.pumpWidget(
      _host(controller, phases: phases, failures: failures, active: false),
    );
    var settled = false;
    final pending = controller
        .updateValues([
          const PatchMapUpdate(number, {'text': '999'}),
        ])
        .then((value) {
          settled = true;
          return value;
        });
    await _progress(tester, 2);
    expect(settled, isFalse);
    await tester.pumpWidget(const SizedBox());
    final interrupted = await pending;
    expect(interrupted.outcome, PatchMapOutcome.interrupted);
    expect(interrupted.interruption, PatchMapInterruption.detached);
    expect(controller.isAttached, isFalse);
    expect(controller.phase, PatchMapPhase.empty);
    expect(controller.getValue(panel), isNull);
    final detached = await controller.updateValues([
      const PatchMapUpdate(number, {'text': 'not replayed'}),
    ]);
    expect(detached.outcome, PatchMapOutcome.rejected);
    expect(detached.failures.single.code, 'DETACHED');
    final phaseCount = phases.length;
    await _progress(tester);
    expect(phases.length, phaseCount);

    // Reattachment starts empty and never replays the old session's commands.
    await tester.pumpWidget(
      _host(controller, phases: phases, failures: failures),
    );
    expect(controller.phase, PatchMapPhase.empty);
    expect(controller.getValue(panel), isNull);
    final redrawn = await _submitted(
      tester,
      controller.draw([
        {'type': 'rect', 'id': 'fresh', 'size': 20, 'fill': '#ff0000'},
      ]),
    );
    expect(redrawn.outcome, PatchMapOutcome.applied);
    expect(
      controller.clearPresentation('memo').outcome,
      PatchMapOutcome.unchanged,
    );
    expect(
      controller.getValue(const PatchMapTarget('fresh'))?['fill'],
      '#ff0000',
    );
    expect(failures, isEmpty);
    expect(phases, isNot(contains(PatchMapPhase.failed)));
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    expect(controller.isAttached, isFalse);
  });
}
