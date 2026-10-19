import 'package:conalog_patch_map/src/api/result.dart';
import 'package:conalog_patch_map/src/api/target.dart';
import 'package:conalog_patch_map/src/presentation/field_operations.dart';
import 'package:conalog_patch_map/src/session/request_ledger.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  PresentationClaim claim(String id, List<String> path, Object? value) =>
      PresentationClaim(
        PatchMapTarget(id, componentId: 'text'),
        path,
        value,
        exists: true,
      );
  PresentationBatch batch(List<PresentationClaim> claims) =>
      PresentationBatch([], claims);

  test(
    'same claims share storage; replaced values leave no request snapshots',
    () async {
      final ledger = RequestLedger();
      final futures = [
        for (var i = 0; i < 1000; i++)
          ledger.add(
            batch([
              claim('i', ['text'], '$i'),
            ]),
          ),
      ];
      expect(ledger.retainedClaimCount, 1);
      expect(ledger.requestCount, 1000);
      final duplicate = ledger.add(
        batch([
          claim('i', ['text'], '999'),
        ]),
      );
      expect(ledger.retainedClaimCount, 1);
      ledger.submit();
      final results = await Future.wait(futures);
      expect(results.take(999).every((result) => result.superseded), true);
      expect(results.last.superseded, false);
      expect((await duplicate).superseded, false);
      expect(ledger.requestCount, 0);
      expect(ledger.retainedClaimCount, 0);
    },
  );

  test(
    'reset/child conflicts and surviving failures coexist without misattribution',
    () async {
      final ledger = RequestLedger();
      final a = ledger.add(
        batch([
          claim('i', ['style'], {'fontSize': 12, 'fill': 'black'}),
          claim('j', ['text'], '20'),
        ]),
      );
      final b = ledger.add(
        batch([
          claim('i', ['style', 'fill'], 'red'),
        ]),
      );
      ledger.submit(
        failures: {
          'i': [const PatchMapFailure('FONT', 'failed i')],
          'j': [const PatchMapFailure('FONT', 'failed j')],
        },
      );
      final first = await a, second = await b;
      expect(first.superseded, true);
      expect(first.outcome, PatchMapOutcome.partialFailure);
      expect(first.failures.map((value) => value.message).toSet(), {
        'failed i',
        'failed j',
      });
      expect(second.superseded, false);
      expect(second.failures.single.message, 'failed i');
    },
  );

  test('replacement closes all obligations once', () async {
    final ledger = RequestLedger();
    final result = ledger.add(
      batch([
        claim('i', ['text'], '1'),
      ]),
    );
    ledger.interrupt(PatchMapInterruption.replaced);
    ledger.submit();
    expect((await result).interruption, PatchMapInterruption.replaced);
    expect(() => ledger.add(batch([])), throwsStateError);
  });
}
