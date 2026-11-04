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

  test(
    'sibling claims retain independent owners through absorb and replacement',
    () async {
      final older = RequestLedger(), newer = RequestLedger();
      final first = older.add(
        batch([
          claim('i', ['text'], '1'),
          claim('j', ['text'], '1'),
        ]),
      );
      final second = newer.add(
        batch([
          claim('i', ['text'], '1'),
        ]),
      );
      older.absorb(newer);
      final third = older.add(
        batch([
          claim('i', ['text'], '2'),
        ]),
      );
      older.submit(
        failures: {
          'j': [const PatchMapFailure('PREP', 'only j failed')],
        },
      );
      final a = await first, b = await second, c = await third;
      expect(a.outcome, PatchMapOutcome.partialFailure);
      expect(a.superseded, true);
      expect(a.failures.single.message, 'only j failed');
      expect(b.outcome, PatchMapOutcome.applied);
      expect(b.superseded, true);
      expect(b.failures, isEmpty);
      expect(c.outcome, PatchMapOutcome.applied);
      expect(c.superseded, false);
      expect(c.failures, isEmpty);
    },
  );

  test(
    'empty failure recording preserves previously attributed failures',
    () async {
      final ledger = RequestLedger();
      final result = ledger.add(
        batch([
          claim('i', ['text'], '1'),
        ]),
      );
      ledger.recordFailures({
        'i': [const PatchMapFailure('PREP', 'failed before submission')],
      });
      ledger.recordFailures({});
      ledger.submit();
      final completed = await result;
      expect(completed.outcome, PatchMapOutcome.partialFailure);
      expect(completed.failures.single.message, 'failed before submission');
    },
  );
}
