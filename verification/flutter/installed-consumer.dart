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
  ValueChanged<PatchMapCameraChange>? cameraChanged,
  ValueChanged<PatchMapMoveResult>? moveResult,
  int editHistoryLimit = 0,
  ValueChanged<PatchMapEditHistoryState>? historyChanged,
  bool active = true,
  PatchMapSelectionStyle selectionStyle = const PatchMapSelectionStyle(),
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
          selectionStyle: selectionStyle,
          rotationAnimation: const PatchMapRotationAnimationOptions(
            enabled: false,
          ),
          gestures: const PatchMapGestureOptions(
            rotationEnabled: false,
            zoomThreshold: .03,
            zoomThresholdAfterRotation: .06,
            rotationThresholdDegrees: 15,
            rotationThresholdAfterZoomDegrees: 25,
            longPressDuration: Duration(milliseconds: 650),
          ),
          zoomLimits: const PatchMapZoomLimits(minScale: .5, maxScale: 4),
          onPhaseChanged: (phase, _) => phases.add(phase),
          onImageFailure: failures.addAll,
          onCameraChanged: cameraChanged,
          longPressEditEnabled: moveResult != null,
          onMoveResult: moveResult,
          editHistoryLimit: editHistoryLimit,
          onEditHistoryChanged: historyChanged,
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
  testWidgets('installed consumer aligns, undoes and redoes edits', (
    tester,
  ) async {
    final controller = PatchMapController();
    final history = <PatchMapEditHistoryState>[];
    await tester.pumpWidget(
      _host(
        controller,
        phases: [],
        failures: [],
        editHistoryLimit: 50,
        historyChanged: history.add,
      ),
    );
    final drawn = await _submitted(
      tester,
      controller.draw([
        {'type': 'rect', 'id': 'a', 'size': 20},
        {
          'type': 'rect',
          'id': 'b',
          'size': 10,
          'attrs': {'x': 60, 'y': 40},
        },
      ]),
    );
    expect(drawn.outcome, PatchMapOutcome.applied);
    expect(controller.select(['a', 'b']).outcome, PatchMapOutcome.applied);
    final alignment = controller.alignSelection(PatchMapAlignment.right);
    await _progress(tester);
    final moved = await alignment;
    expect(moved.result.outcome, PatchMapOutcome.applied);
    expect(moved.positions, {'a': const Offset(50, 0)});
    expect(controller.getGeometry('a')!.bounds!.right, 70);
    expect(controller.getGeometry('b')!.origin, const Offset(60, 40));
    expect(history.last.canUndo, isTrue);
    final undo = controller.undo();
    await _progress(tester);
    expect((await undo).positions, {'a': Offset.zero});
    expect(controller.getGeometry('a')!.origin, Offset.zero);
    expect(controller.editHistoryState.canRedo, isTrue);
    final redo = controller.redo();
    await _progress(tester);
    expect((await redo).positions, moved.positions);
    expect(controller.getGeometry('a')!.bounds!.right, 70);

    final added = await _submitted(
      tester,
      controller.addObjects([
        {'type': 'text', 'id': 'label', 'text': 'New label'},
      ]),
    );
    expect(added.outcome, PatchMapOutcome.applied);
    expect(controller.rootIds, ['a', 'b', 'label']);
    expect(controller.selected.single.id, 'label');
    final undoAdd = controller.undo();
    await _progress(tester);
    expect((await undoAdd).result.outcome, PatchMapOutcome.applied);
    expect(controller.rootIds, ['a', 'b']);
    expect(controller.selected.map((object) => object.id), ['a', 'b']);
  });

  testWidgets('installed consumer opts into a submitted long-press move', (
    tester,
  ) async {
    final controller = PatchMapController();
    final moves = <PatchMapMoveResult>[];
    await tester.pumpWidget(
      _host(
        controller,
        phases: [],
        failures: [],
        moveResult: moves.add,
        editHistoryLimit: 50,
      ),
    );
    final drawn = await _submitted(
      tester,
      controller.draw([
        {'type': 'rect', 'id': 'target', 'size': 50, 'fill': 'red'},
      ]),
    );
    expect(drawn.outcome, PatchMapOutcome.applied);
    final start = tester.getCenter(find.byType(PatchMapView));
    final before = controller.getGeometry('target')!.origin;
    final camera = controller.camera!;
    final hold = await tester.startGesture(start);
    await tester.pump(const Duration(milliseconds: 650));
    expect(controller.selected.single.id, 'target');
    await hold.moveBy(const Offset(40, 20));
    await tester.pump();
    expect(controller.getGeometry('target')!.origin, before);
    await hold.up();
    await _progress(tester);
    final move = moves.single;
    expect(move.result.outcome, PatchMapOutcome.applied);
    expect(
      (move.positions['target']! - Offset(40, 20) / camera.scale).distance,
      lessThan(1e-9),
    );
    expect(controller.getGeometry('target')!.origin, move.positions['target']);
    expect(controller.camera, camera);
    expect(controller.editHistoryState.undoDepth, 2);
    final undoMove = controller.undo();
    await _progress(tester);
    expect((await undoMove).positions, {'target': before});
    expect(controller.selected.single.id, 'target');
    expect((await controller.undo()).positions, isEmpty);
    expect(controller.selected, isEmpty);
    expect((await controller.redo()).result.outcome, PatchMapOutcome.applied);
    expect(controller.selected.single.id, 'target');
  });

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
    final cameraChanges = <PatchMapCameraChange>[];
    const panel = PatchMapTarget('panel');
    const number = PatchMapTarget('panel', componentId: 'number');
    const bar = PatchMapTarget('panel', componentId: 'level');
    expect(controller.isAttached, isFalse);
    expect((await controller.draw(const [])).outcome, PatchMapOutcome.rejected);
    await tester.pumpWidget(
      _host(
        controller,
        phases: phases,
        failures: failures,
        cameraChanged: cameraChanges.add,
      ),
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
    expect(controller.camera, isNotNull);
    final PatchMapObjectGeometry geometry = controller.getGeometry('panel')!;
    expect(geometry.bounds, const Rect.fromLTWH(0, 0, 40, 80));
    expect(geometry.center, const Offset(20, 40));
    expect(geometry.corners!.bottomLeft, const Offset(0, 80));
    expect(controller.getGeometry('missing'), isNull);
    controller.setCamera(scale: 20);
    expect(controller.camera!.scale, 4);
    await tester.pump();
    cameraChanges.clear();
    controller.setCamera(rotation: .2);
    controller.setCamera(rotation: .3);
    await tester.pump();
    expect(cameraChanges.single.state.rotation, .3);
    expect(cameraChanges.single.state, controller.camera);
    expect(cameraChanges.single.sources, {
      PatchMapCameraChangeSource.programmatic,
    });
    expect(controller.getValue(panel)?['type'], 'item');
    expect(controller.getValue(number)?['text'], '1234');
    expect(controller.rotateTo(.6).outcome, PatchMapOutcome.applied);
    expect(controller.camera!.rotation, .6);
    expect(
      controller.getValue(const PatchMapTarget('device'))?['source'],
      'device',
    );
    await _progress(tester); // Bundled asynchronous SVG/atlas preparation.
    expect(phases, [PatchMapPhase.preparing, PatchMapPhase.ready]);
    expect(failures, isEmpty);

    controller.select(['panel']);
    final selectedCamera = controller.camera;
    await tester.pumpWidget(
      _host(
        controller,
        phases: phases,
        failures: failures,
        cameraChanged: cameraChanges.add,
        selectionStyle: const PatchMapSelectionStyle(
          color: ui.Color(0xffef4444),
          strokeWidth: 2,
          displayMode: PatchMapSelectionDisplayMode.elementOnly,
          strokeAlignment: PatchMapSelectionStrokeAlignment.outside,
          strokeScale: PatchMapSelectionStrokeScale.viewport,
        ),
      ),
    );
    await tester.pump();
    expect(controller.selected.single.id, 'panel');
    expect(controller.camera, selectedCamera);
    expect(controller.getValue(number)?['text'], '1234');

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
    expect(controller.camera, isNull);
    expect(controller.getGeometry('panel'), isNull);
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
