import 'package:conalog_patch_map/src/api/result.dart';
import 'package:conalog_patch_map/src/api/target.dart';
import 'package:conalog_patch_map/src/api/update.dart';
import 'package:conalog_patch_map/src/presentation/field_operations.dart';
import 'package:conalog_patch_map/src/session/session_backend.dart';
import 'package:flutter_test/flutter_test.dart';

import 'session_transition_regressions_test.dart' as support;

class RetryBackend extends support.Backend {
  bool retry = true;
  Object? retryError;
  final checked = <String>[];
  @override
  bool needsRetry(SessionPublication publication, PresentationPatch patch) {
    checked.add(patch.target.id);
    if (retryError case final error?) throw error;
    return retry && patch.target.id == 'image';
  }
}

const text = PatchMapTarget('text'), image = PatchMapTarget('image');
const scene = [
  {'type': 'text', 'id': 'text', 'text': 'old'},
  {'type': 'image', 'id': 'image', 'source': 'asset.png', 'size': 20},
];

void main() {
  test(
    'first change stops no-op probe but later equal failed source still retries',
    () async {
      final backend = RetryBackend();
      final current = support.make(backend);
      addTearDown(current.close);
      final draw = current.replace(scene);
      await support.flush();
      current.didSubmit(backend.stamp!);
      await draw;
      final update = current.update(const [
        PatchMapUpdate(text, {'text': 'new'}),
        PatchMapUpdate(image, {'source': 'asset.png'}),
      ]);
      expect(backend.checked, isEmpty);
      await support.flush();
      expect(backend.lastChanges.keys, unorderedEquals([text, image]));
      expect(backend.checked, ['image']);
      current.didSubmit(backend.stamp!);
      expect((await update).outcome, PatchMapOutcome.applied);
      backend.retry = false;
      final stamp = backend.stamp;
      final unchanged = await current.update(const [
        PatchMapUpdate(text, {'text': 'new'}),
        PatchMapUpdate(image, {'source': 'asset.png'}),
      ]);
      await support.flush();
      expect(unchanged.outcome, PatchMapOutcome.unchanged);
      expect(backend.stamp, same(stamp));
      expect(backend.updates, 1);
    },
  );

  test(
    'invalid final input rejects before an early changed-field probe',
    () async {
      final backend = RetryBackend();
      final session = support.make(backend);
      addTearDown(session.close);
      final draw = session.replace(scene);
      await support.flush();
      session.didSubmit(backend.stamp!);
      await draw;
      final result = await session.update(const [
        PatchMapUpdate(text, {'text': 'new'}),
        PatchMapUpdate(image, {'size': -1}),
      ]);
      expect(result.outcome, PatchMapOutcome.rejected);
      expect(session.current(text)!['text'], 'old');
      expect(backend.checked, isEmpty);
      expect(backend.updates, 0);
    },
  );

  test(
    'unexpected synchronous probe error preserves Future error identity',
    () async {
      final backend = RetryBackend();
      final session = support.make(backend);
      addTearDown(session.close);
      final draw = session.replace(scene);
      await support.flush();
      session.didSubmit(backend.stamp!);
      await draw;
      final error = StateError('retry predicate bug');
      backend.retryError = error;
      final task = session.update(const [
        PatchMapUpdate(text, {'text': 'old'}),
      ]);
      await expectLater(task, throwsA(same(error)));
      expect(session.phase, PatchMapPhase.ready);
      expect(session.current(text)!['text'], 'old');
    },
  );
}
