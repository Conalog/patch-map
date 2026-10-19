import 'package:conalog_patch_map/src/api/result.dart';
import 'package:conalog_patch_map/src/api/target.dart';
import 'package:conalog_patch_map/src/api/update.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/frame/frame_coordinator.dart';
import 'package:conalog_patch_map/src/presentation/field_operations.dart';
import 'package:conalog_patch_map/src/presentation/presentation_admission.dart';
import 'package:conalog_patch_map/src/session/map_session.dart';
import 'package:conalog_patch_map/src/session/session_backend.dart';
import 'package:flutter_test/flutter_test.dart';

class Pub extends SessionPublication {}

class Backend extends SessionBackend {
  int documents = 0, updates = 0;
  PaintSubmission? stamp;
  Map<String, List<PatchMapFailure>> failures = {};
  Map<PatchMapTarget, Map<String, Object?>> lastChanges = {};
  @override
  void validateDocument(DatasetDocument d) {}
  @override
  void validateUpdate(
    DatasetDocument d,
    PresentationBatch b,
    PresentationRecordLookup c,
  ) {}
  @override
  Future<SessionPublication> prepareDocument(DatasetDocument d, int g) async {
    documents++;
    return Pub();
  }

  @override
  Future<PreparedUpdate> prepareUpdate(
    SessionPublication p,
    DatasetDocument d,
    Map<PatchMapTarget, Map<String, Object?>> changes, {
    required int generation,
    required bool animate,
    PresentationPlan? intent,
  }) async {
    updates++;
    lastChanges = changes;
    return PreparedUpdate(Pub(), failures: failures);
  }

  @override
  void publish(SessionPublication p, int g, int r) {
    stamp = PaintSubmission(g, r);
  }

  @override
  void hide() {}
  @override
  void setActive(bool active) {}
  @override
  void retain(SessionPublication p) {}
  @override
  void retire(SessionPublication p) {}
  @override
  void close() {}
}

class BuggyBackend extends Backend {
  @override
  void validateDocument(DatasetDocument d) {
    throw StateError('validator bug');
  }
}

const target = PatchMapTarget('t');
const scene = [
  {'type': 'text', 'id': 't', 'text': '0'},
];
Future<void> flush() => Future<void>.delayed(Duration.zero);
MapSession make(
  Backend b, {
  void Function(PatchMapPhase, PatchMapFailure?)? phase,
}) => MapSession(
  backend: b,
  invalidate: () {},
  onPhase: phase ?? (p, e) {},
  onCallbackError: (e, s) {},
);
Future<void> ready(MapSession s, Backend b) async {
  final f = s.replace(scene);
  await flush();
  s.didSubmit(b.stamp!);
  await f;
}

void main() {
  test(
    'preparing callback deactivation starts no resource preparation',
    () async {
      final b = Backend();
      late MapSession s;
      s = make(
        b,
        phase: (p, e) {
          if (p == PatchMapPhase.preparing) s.setActive(false);
        },
      );
      final f = s.replace(scene);
      await flush();
      final started = b.documents;
      s.close();
      await f;
      expect(started, 0);
    },
  );
  test(
    'interruption preserves already known per-item preparation failure',
    () async {
      final b = Backend();
      final actual = make(b);
      await ready(actual, b);
      b.failures = {
        't': [const PatchMapFailure('PREP', 'failed', target: target)],
      };
      final f = actual.update([
        const PatchMapUpdate(target, {'text': '1'}),
      ]);
      await flush();
      actual.close();
      final result = await f;
      expect(result.interruption, PatchMapInterruption.detached);
      expect(result.failures.map((e) => e.code), contains('PREP'));
    },
  );
  test(
    'resume prepares newest pending values before old unsubmitted frame',
    () async {
      final b = Backend();
      final s = make(b);
      await ready(s, b);
      final a = s.update([
        const PatchMapUpdate(target, {'text': '1'}),
      ]);
      await flush();
      s.setActive(false);
      final c = s.update([
        const PatchMapUpdate(target, {'text': '2'}),
      ]);
      s.setActive(true);
      await flush();
      final lastText = b.lastChanges[target]!['text'];
      s.close();
      await a;
      await c;
      expect(lastText, '2');
    },
  );
  test(
    'known failed executing values are not the validation baseline',
    () async {
      final b = Backend();
      final s = make(b);
      const t = PatchMapTarget('i', componentId: 'c');
      final r = s.replace([
        {
          'type': 'item',
          'id': 'i',
          'size': 20,
          'components': [
            {
              'type': 'text',
              'id': 'c',
              'text': '0',
              'style': {
                'autoFont': {'min': 1, 'max': 10},
              },
            },
          ],
        },
      ]);
      await flush();
      s.didSubmit(b.stamp!);
      await r;
      b.failures = {
        'i': [const PatchMapFailure('PREP', 'failed', target: t)],
      };
      final a = s.update([
        const PatchMapUpdate(t, {
          'style': {
            'autoFont': {'max': 5},
          },
        }),
      ]);
      await flush();
      expect(((s.current(t)!['style'] as Map)['autoFont'] as Map)['max'], 10);
      final next = s.update([
        const PatchMapUpdate(t, {
          'style': {
            'autoFont': {'min': 8},
          },
        }),
      ]);
      await flush();
      s.close();
      await a;
      final nextResult = await next;
      expect(nextResult.outcome, isNot(PatchMapOutcome.rejected));
    },
  );

  test('unexpected validation failure retains error channel', () async {
    final s = make(BuggyBackend());
    final f = s.replace(scene);
    s.close();
    await expectLater(f, throwsStateError);
  });

  test(
    'resume does not replay already failed fields into newly admitted values',
    () async {
      final backend = Backend();
      final session = make(backend);
      const target = PatchMapTarget('i', componentId: 'c');
      final replacement = session.replace([
        {
          'type': 'item',
          'id': 'i',
          'size': 20,
          'components': [
            {
              'type': 'text',
              'id': 'c',
              'text': '0',
              'style': {
                'autoFont': {'min': 1, 'max': 10},
              },
            },
          ],
        },
      ]);
      await flush();
      session.didSubmit(backend.stamp!);
      await replacement;
      backend.failures = {
        'i': [const PatchMapFailure('PREP', 'failed', target: target)],
      };
      final first = session.update([
        const PatchMapUpdate(target, {
          'style': {
            'autoFont': {'max': 5},
          },
        }),
      ]);
      await flush();
      expect(
        ((session.current(target)!['style'] as Map)['autoFont'] as Map)['max'],
        10,
      );
      session.setActive(false);
      final next = session.update([
        const PatchMapUpdate(target, {
          'style': {
            'autoFont': {'min': 8},
          },
        }),
      ]);
      backend.failures = {};
      session.setActive(true);
      await flush();
      final prepared =
          (backend.lastChanges[target]!['style'] as Map)['autoFont'];
      session.close();
      await first;
      await next;
      expect(prepared, {'min': 8, 'max': 10});
    },
  );
  test(
    'replacement interruption preserves failure across resumed unsubmitted frame',
    () async {
      final backend = Backend();
      final session = make(backend);
      backend.failures = {
        't': [const PatchMapFailure('PREP', 'failed', target: target)],
      };
      final replacement = session.replace([
        {'type': 'text', 'id': 't', 'text': '0'},
        {'type': 'text', 'id': 'u', 'text': '0'},
      ]);
      final first = session.update([
        const PatchMapUpdate(target, {'text': '1'}),
      ]);
      await flush();
      session.setActive(false);
      final next = session.update([
        const PatchMapUpdate(PatchMapTarget('u'), {'text': '1'}),
      ]);
      backend.failures = {};
      session.setActive(true);
      session.close();
      final result = await replacement;
      await first;
      await next;
      expect(result.interruption, PatchMapInterruption.detached);
      expect(result.failures.map((failure) => failure.code), contains('PREP'));
    },
  );
}
