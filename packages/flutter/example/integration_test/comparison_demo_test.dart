import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:conalog_patch_map/conalog_patch_map.dart';
import '../lib/main.dart';
import '../lib/shared_fixtures.dart';

// Drives the actual demo controls. The host compares these observations with
// the npm public trace; capture bytes provide native raster evidence separately.
void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  binding.framePolicy = LiveTestWidgetsFlutterBindingFramePolicy.fullyLive;
  testWidgets(
    'shared comparison demo on native Canvas',
    (tester) async {
      final rows = <Map<String, dynamic>>[];
      final captures = <String, String>{};
      final report = {
        'platform': Platform.operatingSystem,
        'revision': const String.fromEnvironment('PATCHMAP_REVISION'),
        'observations': rows,
        'captures': captures,
        'completed': false,
      };
      binding.reportData = {'comparisonDemo': report};
      await tester.pumpWidget(const ComparisonApp());
      Future<void> ready(String id) async {
        await tester.runAsync(() async {
          final timeout = DateTime.now().add(const Duration(seconds: 30));
          while (find.text('Ready · $id').evaluate().isEmpty) {
            if (DateTime.now().isAfter(timeout))
              throw StateError('Demo not ready: $id');
            await Future<void>.delayed(const Duration(milliseconds: 50));
          }
        });
        await tester.pumpAndSettle();
      }

      await ready('service');
      for (final id in ['gallery', 'updates', 'editor', 'alpha-parity']) {
        {
          await tester.tap(find.byKey(const Key('scenario-selector')));
          await tester.pumpAndSettle();
          await tester.tap(
            find
                .text(
                  demoScenarios.firstWhere((s) => s['id'] == id)['title']
                      as String,
                )
                .last,
          );
          await ready(id);
        }
        final c = tester
            .widget<PatchMapView>(find.byType(PatchMapView))
            .controller;
        final fixture =
            jsonDecode(sharedFixtureJson[id]!) as Map<String, dynamic>;
        final commands = fixture['commands'] as List;
        Map<String, dynamic> observe() => {
          'dataset': c.data.snapshot(),
          'semanticHash': c.dataset.semanticHash,
          'selectionIds': c.selection.ids,
          'history': c.history.state,
          'editor': c.editor.state,
          'viewport': c.viewport.state,
          'rotation': c.rotation.value,
        };
        final steps = <Map<String, dynamic>>[];
        rows.add({'fixtureId': id, 'initial': observe(), 'steps': steps});
        await tester.tap(find.text('시나리오'));
        await tester.pumpAndSettle();
        for (var i = 0; i < commands.length; i++) {
          await tester.tap(find.text('Step'));
          await tester.pumpAndSettle();
          expect(
            find.textContaining('· step ${i + 1}'),
            findsOneWidget,
            reason:
                '$id/${commands[i]['id']}: ${tester.widget<Text>(find.byKey(const Key('status'))).data}',
          );
          steps.add({'commandId': commands[i]['id'], 'observation': observe()});
        }
        if (id == 'gallery' || id == 'alpha-parity') {
          await tester.tap(find.text('조작'));
          await tester.pumpAndSettle();
          for (final angle in [0, 90]) {
            final button = find.text(
              angle == 0 ? 'Reset angle' : 'Rotate +90°',
            );
            await tester.ensureVisible(button);
            await tester.tap(button);
            await tester.pumpAndSettle();
            expect(c.rotation.value, angle);
            final capture = await tester.runAsync(c.capture.png);
            captures['$id-$angle'] = capture!.dataUrl;
          }
        }
        expect(tester.takeException(), isNull);
      }
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();
      report['completed'] = true;
    },
    timeout: const Timeout(Duration(minutes: 3)),
  );
}
