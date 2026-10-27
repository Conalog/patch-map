import 'dart:io';
import 'dart:ui' as ui;

import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patch_map_example/mobile_replay/fixture.dart';
import 'package:patch_map_example/mobile_replay/replay.dart';
import 'package:patch_map_example/mobile_replay_main.dart';

Future<T> submitted<T>(WidgetTester tester, Future<T> future) async {
  var done = false;
  T? value;
  Object? failure;
  future.then(
    (v) {
      value = v;
      done = true;
    },
    onError: (Object e) {
      failure = e;
      done = true;
    },
  );
  for (var i = 0; !done && i < 300; i++) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 2)),
    );
    await tester.pump(const Duration(milliseconds: 16));
  }
  if (failure != null) throw failure!;
  expect(done, isTrue, reason: 'Public operation did not submit');
  return value as T;
}

Future<MobileReplay> mount(WidgetTester tester) async {
  final fixture = (await tester.runAsync(MobileReplayFixture.load))!;
  final replay = MobileReplay(fixture);
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: PatchMapView(
          controller: replay.map,
          colors: fixture.colors,
          symbols: fixture.symbols,
          onImageFailure: replay.imageFailures.addAll,
          eventFilter: replay.allows,
          onEvent: replay.onEvent,
          selectionStyle: const PatchMapSelectionStyle(
            color: Color(0xffef4444),
            displayMode: PatchMapSelectionDisplayMode.elementOnly,
          ),
        ),
      ),
    ),
  );
  return replay;
}

Future<int> darkNamePixels(WidgetTester tester, PatchMapController map) async {
  final boundary = tester.renderObject<RenderRepaintBoundary>(
    find
        .descendant(
          of: find.byType(PatchMapView),
          matching: find.byType(RepaintBoundary),
        )
        .first,
  );
  // Name band inside the frame, excluding its dark outer border.
  final a = map.toLocal(const Offset(5, 34))!;
  final b = map.toLocal(const Offset(55, 46))!;
  return (await tester.runAsync(() async {
    final image = await boundary.toImage();
    try {
      final bytes = (await image.toByteData(
        format: ui.ImageByteFormat.rawStraightRgba,
      ))!;
      var count = 0;
      for (var y = a.dy.ceil(); y < b.dy.floor(); y++) {
        for (var x = a.dx.ceil(); x < b.dx.floor(); x++) {
          final i = (y * image.width + x) * 4;
          if (bytes.getUint8(i) < 80 &&
              bytes.getUint8(i + 1) < 130 &&
              bytes.getUint8(i + 2) < 170 &&
              bytes.getUint8(i + 3) > 200) {
            count++;
          }
        }
      }
      return count;
    } finally {
      image.dispose();
    }
  }))!;
}

void main() {
  testWidgets(
    'superseded and replaced metrics are not logged as fully applied',
    (tester) async {
      final replay = await mount(tester);
      await submitted(tester, replay.replace(replay.beginDateChange()));
      final first = replay.metrics(replay.generation, 'noData');
      final latest = replay.metrics(replay.generation, 'dataText');
      expect(await submitted(tester, Future.wait([first, latest])), [
        false,
        true,
      ]);
      expect(replay.log, isNot(contains('METRICS_REFRESH applied: noData')));
      final old = replay.metrics(replay.generation, 'noData');
      final replacement = replay.replace(replay.beginDateChange(), next: true);
      expect(await submitted(tester, Future.wait([old, replacement])), [
        false,
        true,
      ]);
      expect(replay.log, isNot(contains('METRICS_REFRESH applied: noData')));
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'inverter name needs explicit native tint to preserve deployed consumer fill',
    (tester) async {
      final replay = await mount(tester);
      await submitted(tester, replay.replace(replay.beginDateChange()));
      for (var i = 0; i < 30; i++) {
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 3)),
        );
        await tester.pump(const Duration(milliseconds: 16));
      }
      final adapted = await darkNamePixels(tester, replay.map);
      // Native admission supplies white when raw component tint is absent.
      MobileReplay.check(
        await submitted(
          tester,
          replay.map.updateValues([
            const PatchMapUpdate(
              PatchMapTarget('inverter-map-1', componentId: 'name'),
              {'tint': 'white'},
            ),
          ]),
        ),
      );
      final raw = await darkNamePixels(tester, replay.map);
      expect(adapted, greaterThan(raw + 8));
      expect(
        replay.map.getValue(
          const PatchMapTarget('inverter-map-1', componentId: 'name'),
        )!['style'],
        containsPair('fill', '#083967'),
      );
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'raw consumer payload exposes incomplete icons and non-schema ellipsis flag',
    (tester) async {
      final replay = await mount(tester);
      final raw = replay.fixture.scene(complete: false);
      var result = await submitted(tester, replay.map.draw(raw));
      expect(result.outcome, PatchMapOutcome.rejected);
      expect(result.failures.single.path, endsWith('components[2].size'));
      final inverter = ((raw.single['children'] as List)[1] as Map);
      for (final component in inverter['components'] as List) {
        if (component['type'] == 'icon' && !component.containsKey('size')) {
          component['size'] = 0;
        }
      }
      result = await submitted(tester, replay.map.draw(raw));
      expect(result.outcome, PatchMapOutcome.rejected);
      expect(result.failures.single.path, endsWith('style.ellipsis'));
      expect(replay.map.phase, PatchMapPhase.empty);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('manual replay app loads, handles selection and changes diagram', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(440, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final fixture = (await tester.runAsync(MobileReplayFixture.load))!;
    await tester.pumpWidget(MobileReplayApp(fixture: fixture));
    for (var i = 0; i < 50; i++) {
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 3)),
      );
      await tester.pump(const Duration(milliseconds: 16));
    }
    final view = tester.widget<PatchMapView>(find.byType(PatchMapView));
    expect(view.controller.phase, PatchMapPhase.ready);
    final target = view.controller.toLocal(
      view.controller.getGeometry('panel-grid.0.0')!.center!,
    )!;
    await tester.tapAt(tester.getTopLeft(find.byType(PatchMapView)) + target);
    await tester.pump(const Duration(milliseconds: 400));
    expect(view.controller.selected.single.id, 'panel-grid.0.0');
    await tester.tap(find.text('필터 강조'));
    await tester.pump();
    expect(view.controller.selected.single.id, 'panel-grid.0.0');
    await tester.tap(find.text('날짜 / 도면 교체'));
    for (var i = 0; i < 30; i++) {
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 3)),
      );
      await tester.pump(const Duration(milliseconds: 16));
    }
    expect(view.controller.getGeometry('edge-map-2'), isNotNull);
    expect(find.textContaining('stale metrics ignored'), findsOneWidget);
    expect(tester.takeException(), isNull);
    // Optional current-run evidence, never a committed platform/visual oracle.
    final output = Platform.environment['MOBILE_REPLAY_SCREENSHOT'];
    if (output != null) {
      final boundary = tester.renderObject<RenderRepaintBoundary>(
        find
            .descendant(
              of: find.byType(PatchMapView),
              matching: find.byType(RepaintBoundary),
            )
            .first,
      );
      await tester.runAsync(() async {
        final image = await boundary.toImage(pixelRatio: 2);
        try {
          final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
          await File(output).writeAsBytes(bytes!.buffer.asUint8List());
        } finally {
          image.dispose();
        }
      });
    }
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('captured panel/inverter/router/Edge inputs draw and update', (
    tester,
  ) async {
    final replay = await mount(tester);
    await submitted(tester, replay.replace(replay.beginDateChange()));
    expect(
      replay.map.getGeometry('inverter-map-1')?.bounds?.size,
      const Size(60, 70),
    );
    for (var i = 0; i < replay.fixture.panelStates.length; i++) {
      final state = replay.fixture.panelStates[i];
      await submitted(tester, replay.metrics(replay.generation, state));
      for (final component in replay.fixture.panel(state)) {
        final value = replay.map.getValue(
          PatchMapTarget(
            'panel-grid.0.0',
            componentId: component['id'] as String,
          ),
        )!;
        expect(
          value['show'],
          component['show'],
          reason: '$state/${component['id']}',
        );
        if (component.containsKey('text')) {
          expect(value['text'], component['text']);
        }
      }
    }
    for (final state in ['registered', 'monitoring', 'failed', 'pending']) {
      MobileReplay.check(
        await submitted(
          tester,
          replay.map.updateValues(replay.fixture.inverterUpdates(state)),
        ),
      );
      for (final component in MobileReplayFixture.records(
        replay.fixture.inverter(state)['components'],
      )) {
        final value = replay.map.getValue(
          PatchMapTarget(
            'inverter-map-1',
            componentId: component['id'] as String,
          ),
        )!;
        expect(value['show'], component['show']);
        if (component.containsKey('text')) {
          expect(value['text'], component['text']);
        }
      }
    }
    MobileReplay.check(
      await submitted(
        tester,
        replay.map.updateValues([
          ...MobileReplayFixture.componentUpdates(
            'router-map-1',
            MobileReplayFixture.withIds(
              MobileReplayFixture.records(
                replay.fixture.raw['routers']['failed'],
              ),
            ),
          ),
          const PatchMapUpdate(
            PatchMapTarget('edge-map-1', componentId: 'power'),
            {'show': true, 'source': 'pv-badge'},
          ),
        ]),
      ),
    );
    for (var i = 0; i < 30; i++) {
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 3)),
      );
      await tester.pump(const Duration(milliseconds: 16));
    }
    expect(replay.imageFailures.map((e) => e.message), isEmpty);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets(
    'highlight is separate; hidden types dim but cannot be selected by touch',
    (tester) async {
      final replay = await mount(tester);
      await submitted(tester, replay.replace(replay.beginDateChange()));
      expect(replay.select(['panel-grid.0.0']), isTrue);
      replay.highlight(['panel-grid.0.1']);
      expect(replay.map.selected.single.id, 'panel-grid.0.0');
      replay.highlight(['panel-grid.1.0']); // memo replaces filter
      expect(replay.map.selected.single.id, 'panel-grid.0.0');
      expect(replay.highlighted, {'panel-grid.1.0'});
      expect(replay.select(['panel-grid.0.0', 'router-map-1']), isFalse);
      replay.setVisible('device', false);
      await tester.pump();
      replay.map.clearSelection();
      final center = replay.map.toLocal(
        replay.map.getGeometry('panel-grid.0.1')!.center!,
      )!;
      await tester.tapAt(tester.getTopLeft(find.byType(PatchMapView)) + center);
      await tester.pump(const Duration(milliseconds: 400));
      expect(replay.map.selected, isEmpty);
      expect(
        replay.map.getValue(const PatchMapTarget('panel-grid.0.1'))!['show'],
        isNot(false),
      );
      replay.setVisible('device', true);
      replay.highlight(['panel-grid.0.1'], restricted: true);
      expect(replay.select(['panel-grid.0.0']), isFalse);
      expect(replay.select(['panel-grid.0.1']), isTrue);
      replay.highlight([]);
      expect(replay.highlightedOnly, isTrue); // preference survives clear
      expect(replay.map.selected.single.id, 'panel-grid.0.1');
      replay.highlight(['panel-grid.1.0']);
      expect(
        replay.map.selected,
        isEmpty,
      ); // retained scope applies immediately
      replay.setSelectionScope(false);
      expect(replay.select(['panel-grid.0.0']), isTrue);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'date replacement admits new values, ignores old host responses and retries external selection',
    (tester) async {
      final replay = await mount(tester);
      final oldToken = replay.beginDateChange();
      await submitted(tester, replay.replace(oldToken));
      replay.select(['edge-map-1']);
      replay.map.setCamera(rotation: .7);
      replay.highlight(['panel-grid.0.0']);
      final next = replay.beginDateChange();
      final replacing = replay.replace(next, next: true);
      expect(replay.map.phase, PatchMapPhase.preparing);
      replay.select(['panel-grid.0.4']);
      await submitted(tester, replacing);
      expect(replay.map.camera!.rotation, 0);
      expect(replay.map.selected.single.id, 'panel-grid.0.4');
      expect(replay.map.getGeometry('edge-map-1'), isNull);
      expect(replay.map.getGeometry('edge-map-2'), isNotNull);
      expect(await replay.replace(oldToken), isFalse);
      expect(await replay.metrics(oldToken, 'noData'), isFalse);
      replay.map.setCamera(rotation: .3, scale: 1.2);
      await submitted(tester, replay.metrics(next, 'dataText'));
      expect(replay.map.camera!.rotation, .3);
      expect(replay.map.camera!.scale, 1.2);
      expect(
        replay.map.getValue(
          const PatchMapTarget('panel-grid.0.4', componentId: 'metric-text'),
        )!['text'],
        '123.4',
      );
      replay.select(['panel-grid.0.0']);
      await submitted(tester, replay.replace(replay.beginDateChange()));
      expect(replay.map.selected.single.id, 'panel-grid.0.0');
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'sheet focus and native geometry use published results; structural edits stay excluded',
    (tester) async {
      final replay = await mount(tester);
      await submitted(tester, replay.replace(replay.beginDateChange()));
      replay.select(['panel-grid.0.0']);
      replay.map.setCamera(rotation: .4);
      replay.focusSelection(bottomInset: 160);
      final geometry = replay.map.getGeometry('panel-grid.0.0')!;
      final projected = replay.map.toLocal(geometry.center!)!;
      final size = tester.getSize(find.byType(PatchMapView));
      expect(projected.dy, closeTo((size.height - 160) / 2, .001));
      expect(
        replay.screenBounds('panel-grid.0.0')!.contains(projected),
        isTrue,
      );
      expect(
        replay.map
            .getGeometry('panel-grid')!
            .bounds!
            .contains(geometry.center!),
        isTrue,
      );
      final result = await submitted(
        tester,
        replay.map.updateValues([
          const PatchMapUpdate(PatchMapTarget('inverter-map-1'), {
            'components': [],
          }),
        ]),
      );
      expect(result.outcome, PatchMapOutcome.rejected);
      expect(
        replay.map.getValue(
          const PatchMapTarget('inverter-map-1', componentId: 'frame'),
        ),
        isNotNull,
      );
      await tester.pumpWidget(const SizedBox.shrink());
      expect(replay.map.getGeometry('panel-grid.0.0'), isNull);
    },
  );
}
