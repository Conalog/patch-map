import 'dart:async';

import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patch_map_example/mobile_replay/fixture.dart';
import 'package:patch_map_example/mobile_replay/sync_replay.dart';
import 'package:patch_map_example/mobile_sync_main.dart';

import 'mobile_replay_test.dart' as support;

Future<SyncReplay> mount(WidgetTester tester) async {
  final fixture = (await tester.runAsync(MobileReplayFixture.load))!;
  final replay = SyncReplay(fixture);
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: PatchMapView(
          controller: replay.map,
          colors: fixture.colors,
          symbols: fixture.symbols,
          onImageFailure: replay.imageFailures.addAll,
        ),
      ),
    ),
  );
  addTearDown(replay.dispose);
  await support.submitted(tester, replay.replace());
  return replay;
}

void expectAligned(SyncReplay replay) {
  for (final id in SyncReplay.ids) {
    expect(replay.rows[id], replay.readPanel(id));
  }
}

void main() {
  testWidgets(
    'interactive replay shows partial failure without a full-ready label',
    (tester) async {
      final fixture = (await tester.runAsync(MobileReplayFixture.load))!;
      await tester.pumpWidget(MobileSyncApp(fixture: fixture));
      final partial = find.widgetWithText(OutlinedButton, '부분 실패');
      Future<void> idle() async {
        for (var i = 0; i < 300; i++) {
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 2)),
          );
          await tester.pump(const Duration(milliseconds: 16));
          if (tester.widget<OutlinedButton>(partial).onPressed != null) return;
        }
        fail('Experiment did not settle');
      }

      await idle();
      expect(find.textContaining('앱 상태: ready'), findsOneWidget);
      await tester.tap(partial);
      await tester.pump();
      expect(find.textContaining('동기화 대기'), findsOneWidget);
      await idle();
      expect(find.textContaining('앱 상태: partial'), findsOneWidget);
      expect(find.textContaining('앱 상태: ready'), findsNothing);
      expect(find.textContaining('실패, 이전 값 유지'), findsOneWidget);
      expect(find.textContaining('숫자 202, 막대 62%'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'normal completion waits for submission; unchanged is also a valid barrier',
    (tester) async {
      final replay = await mount(tester);
      final before = Map.of(replay.rows);
      final values = SyncReplay.values(SyncReplay.ids[0], '101', 31);
      final pending = replay.update(values);
      expect(replay.waiting, isTrue);
      expect(replay.rows, before);
      final result = await support.submitted(tester, pending);
      expect(result.outcome, PatchMapOutcome.applied);
      expect(replay.phase, SyncReplayPhase.ready);
      expect(replay.rows[SyncReplay.ids[0]], (text: '101', height: '31%'));
      expectAligned(replay);
      final same = await support.submitted(tester, replay.update(values));
      expect(same.outcome, PatchMapOutcome.unchanged);
      expect(replay.phase, SyncReplayPhase.ready);
      expectAligned(replay);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('map ready before app data does not unlock app publication', (
    tester,
  ) async {
    final replay = await mount(tester);
    final before = Map.of(replay.rows);
    final ready = Completer<void>();
    final request = replay.update(
      SyncReplay.values(SyncReplay.ids[0], '102', 32),
      appReady: ready.future,
    );
    for (var i = 0; i < 20; i++) {
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 2)),
      );
      await tester.pump(const Duration(milliseconds: 16));
    }
    expect(replay.readPanel(SyncReplay.ids[0]).text, '102');
    expect(replay.phase, SyncReplayPhase.waiting);
    expect(
      replay.rows,
      before,
    ); // UI withholds these stored old rows while waiting
    ready.complete();
    await support.submitted(tester, request);
    expect(replay.phase, SyncReplayPhase.ready);
    expectAligned(replay);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets(
    'real SVG failure retains the entire failed item; successful item and app row advance',
    (tester) async {
      final replay = await mount(tester);
      final failedBefore = replay.rows[SyncReplay.ids[0]];
      final lastFullyPublished = replay.publishedRequests.last;
      final result = await support.submitted(
        tester,
        replay.update(SyncReplay.partialValues()),
      );
      expect(result.outcome, PatchMapOutcome.partialFailure);
      expect(result.failures.single.code, 'IMAGE_PREPARATION');
      expect(result.failures.single.target?.id, SyncReplay.ids[0]);
      expect(replay.rows[SyncReplay.ids[0]], failedBefore);
      expect(replay.rows[SyncReplay.ids[1]], (text: '202', height: '62%'));
      expect(replay.phase, SyncReplayPhase.partial);
      expect(replay.failedItems, {SyncReplay.ids[0]});
      expect(replay.publishedRequests.last, lastFullyPublished);
      expectAligned(replay);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'superseded text still preserves earlier bar; only settled latest app snapshot publishes',
    (tester) async {
      final replay = await mount(tester);
      final a = replay.update(SyncReplay.values(SyncReplay.ids[0], '111', 45));
      final oldRequest = replay.latestRequest;
      final b = replay.update([
        PatchMapUpdate(SyncReplay.textTarget(SyncReplay.ids[0]), {
          'text': '222',
        }),
      ]);
      final result = await support.submitted(tester, Future.wait([a, b]));
      expect(result[0].superseded, isTrue);
      expect(result[0].outcome, PatchMapOutcome.applied);
      expect(result[1].superseded, isFalse);
      expect(replay.publishedRequests, isNot(contains(oldRequest)));
      expect(replay.rows[SyncReplay.ids[0]], (text: '222', height: '45%'));
      expect(replay.phase, SyncReplayPhase.ready);
      expectAligned(replay);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'superseded and partial failure coexist and must both be honored',
    (tester) async {
      final replay = await mount(tester);
      final before = replay.rows[SyncReplay.ids[0]];
      final a = replay.update(SyncReplay.partialValues());
      final b = replay.update([
        PatchMapUpdate(SyncReplay.textTarget(SyncReplay.ids[1]), {
          'text': '303',
        }),
      ]);
      final result = await support.submitted(tester, Future.wait([a, b]));
      expect(result[0].superseded, isTrue);
      expect(result[0].outcome, PatchMapOutcome.partialFailure);
      expect(result[1].outcome, PatchMapOutcome.applied);
      expect(replay.phase, SyncReplayPhase.partial);
      expect(replay.rows[SyncReplay.ids[0]], before);
      expect(replay.rows[SyncReplay.ids[1]], (text: '303', height: '62%'));
      expectAligned(replay);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'valid replacement interrupts old update; delayed old callback cannot publish or unlock new scope',
    (tester) async {
      final replay = await mount(tester);
      final oldAppReady = Completer<void>();
      final old = replay.update(
        SyncReplay.values(SyncReplay.ids[0], '999', 99),
        appReady: oldAppReady.future,
      );
      final oldEpoch = replay.epoch;
      final replacement = replay.replace(alternate: true);
      expect(replay.rows, isEmpty);
      expect(replay.phase, SyncReplayPhase.preparing);
      await support.submitted(tester, replacement);
      final newRows = Map.of(replay.rows);
      final publications = List.of(replay.publishedRequests);
      oldAppReady.complete();
      final result = await support.submitted(tester, old);
      expect(result.outcome, PatchMapOutcome.interrupted);
      expect(result.interruption, PatchMapInterruption.replaced);
      expect(replay.receipts.last.epoch, oldEpoch);
      expect(replay.rows, newRows);
      expect(replay.publishedRequests, publications);
      expect(replay.phase, SyncReplayPhase.ready);
      expect(replay.rows.values.any((v) => v.text == '999'), isFalse);
      expectAligned(replay);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
}
