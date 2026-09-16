import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import '../lib/main.dart';
import '../lib/shared_fixtures.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  binding.framePolicy = LiveTestWidgetsFlutterBindingFramePolicy.fullyLive;
  testWidgets(
    'feature lab scenarios execute on native Canvas',
    (tester) async {
      final rows = <Map<String, dynamic>>[];
      binding.reportData = {
        'featureLab': {
          'completed': false,
          'platform': Platform.operatingSystem,
          'scenarios': rows,
        },
      };
      await tester.pumpWidget(const ComparisonApp());
      Future<void> waitFor(bool Function() predicate) async {
        await tester.runAsync(() async {
          final end = DateTime.now().add(const Duration(seconds: 45));
          while (!predicate()) {
            if (DateTime.now().isAfter(end))
              throw StateError(
                'Timeout: ${tester.widget<Text>(find.byKey(const Key('status'))).data}',
              );
            await Future<void>.delayed(const Duration(milliseconds: 50));
          }
        });
        await tester.pumpAndSettle();
      }

      String status() =>
          tester.widget<Text>(find.byKey(const Key('status'))).data!;
      await waitFor(() => status() == 'Ready · service');
      String? previousMode;
      for (final label in [
        '전체 Bar 높이',
        '전체 Text 값',
        '전체 Text 값',
        '데이터 없음',
        '통신 상태',
        '오류 상태',
      ]) {
        final button = find.widgetWithText(OutlinedButton, label);
        await tester.ensureVisible(button);
        await tester.tap(button);
        await waitFor(() => status().startsWith('서비스 '));
        expect(status(), isNot(contains('실패:')));
        expect(status(), contains('"status":"committed"'));
        if (label == '전체 Text 값' && previousMode == label)
          expect(status(), contains('"appliedCount":5000'));
        previousMode = label;
      }
      for (final scenario in demoScenarios) {
        final id = scenario['id'] as String;
        {
          await tester.tap(find.byKey(const Key('scenario-selector')));
          await tester.pumpAndSettle();
          final item = find.text(scenario['title'] as String).last;
          await tester.ensureVisible(item);
          await tester.tap(item);
          await waitFor(() => status() == 'Ready · $id');
        }
        await tester.tap(find.text('시나리오'));
        await tester.pumpAndSettle();
        final run = find.widgetWithText(OutlinedButton, '남은 단계 실행');
        await tester.ensureVisible(run);
        await tester.tap(run);
        await waitFor(() => status().startsWith('남은 단계 실행:'));
        final result =
            jsonDecode(status().substring('남은 단계 실행: '.length)) as Map;
        expect(result['ok'], true, reason: '$id: $result');
        final fixture =
            jsonDecode(sharedFixtureJson[scenario['fixture']]!) as Map;
        final count =
            ((scenario['commands'] ?? fixture['commands']) as List).length;
        expect((result['steps'] as List).length, count);
        rows.add({'scenario': id, 'steps': count});
        expect(tester.takeException(), isNull);
      }
      await tester.tap(find.text('조작'));
      await tester.pumpAndSettle();
      Future<void> tapControl(String label) async {
        final button = find.widgetWithText(OutlinedButton, label);
        final scrollable = find
            .descendant(
              of: find.byKey(const Key('demo-controls')),
              matching: find.byType(Scrollable),
            )
            .first;
        tester.state<ScrollableState>(scrollable).position.jumpTo(0);
        await tester.pumpAndSettle();
        await tester.scrollUntilVisible(button, 160, scrollable: scrollable);
        await tester.pumpAndSettle();
        await tester.tap(button);
        await tester.pumpAndSettle();
      }

      await tapControl('뷰 분리');
      await tapControl('Rotate +90°');
      expect(status(), '뷰를 먼저 재연결하세요.');
      await tapControl('뷰 재연결');
      await tapControl('Rotate +90°');
      await waitFor(() => status().startsWith('회전:'));
      await tapControl('두 번째 맵');
      await waitFor(() => status().contains('독립 인스턴스 생성됨'));
      await tapControl('두 번째 맵 해제');
      await waitFor(() => status().contains('해제됨'));
      await tapControl('Capture');
      await waitFor(() => find.text('닫기').evaluate().isNotEmpty);
      await tester.tap(find.text('닫기'));
      await waitFor(() => status().startsWith('PNG 캡처:'));
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();
      (binding.reportData!['featureLab'] as Map)['completed'] = true;
    },
    timeout: const Timeout(Duration(minutes: 6)),
  );
}
