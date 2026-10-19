import 'dart:async';

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

const _aText = PatchMapTarget('a', componentId: 'text');
const _aBar = PatchMapTarget('a', componentId: 'bar');
const _bText = PatchMapTarget('b', componentId: 'text');

List<Object?> _scene([String first = 'a']) => [
  {
    'type': 'item',
    'id': first,
    'size': 20,
    'components': [
      {
        'type': 'text',
        'id': 'text',
        'text': '0',
        'style': {'fontSize': 12},
      },
      {
        'type': 'bar',
        'id': 'bar',
        'size': 20,
        'source': {'fill': 'blue'},
      },
    ],
  },
  if (first != 'b')
    {
      'type': 'item',
      'id': 'b',
      'size': 20,
      'components': [
        {'type': 'text', 'id': 'text', 'text': '0'},
      ],
    },
];

Future<void> _tick() => Future<void>.delayed(Duration.zero);

void main() {
  _Harness make() {
    final harness = _Harness();
    addTearDown(harness.dispose);
    return harness;
  }

  test(
    'invalid replacement preserves accepted generation and submitted drawing',
    () async {
      final h = make();
      await h.ready();
      final generation = h.session.generation;
      final publication = h.backend.visible;
      final hides = h.backend.hides;
      final document = h.session.document;
      final rejected = await h.session.replace([
        ..._scene(),
        {'type': 'item', 'id': 'invalid-last', 'size': -1},
      ]);
      await _tick();
      expect(rejected.outcome, PatchMapOutcome.rejected);
      expect(h.session.generation, generation);
      expect(identical(h.session.document, document), true);
      expect(identical(h.backend.visible, publication), true);
      expect(h.backend.hides, hides);
      expect(h.backend.documents, hasLength(1));
      expect(publication!.references, 1);
    },
  );

  test(
    'accepted replacement admits new-generation updates before preparation',
    () async {
      final h = make();
      await h.ready();
      final old = h.backend.visible!;
      final replacement = h.session.replace(_scene('new'));
      final update = h.session.update(const [
        PatchMapUpdate(PatchMapTarget('new', componentId: 'text'), {
          'text': 'new-value',
        }),
      ]);
      final oldAddress = await h.session.update(const [
        PatchMapUpdate(_aText, {'text': 'old'}),
      ]);
      expect(oldAddress.outcome, PatchMapOutcome.rejected);
      expect(h.session.generation, 2);
      await _tick();
      expect(h.backend.visible, null);
      expect(old.references, 0);
      h.backend.documents.last.complete();
      await _tick();
      expect(
        h.backend.updates.last.changes[const PatchMapTarget(
          'new',
          componentId: 'text',
        )]!['text'],
        'new-value',
      );
      h.backend.updates.last.complete();
      await _tick();
      var ready = false;
      replacement.then((_) => ready = true);
      h.session.didSubmit(
        PaintSubmission(1, h.backend.published.last.revision),
      );
      await _tick();
      expect(ready, false);
      h.submit();
      expect((await replacement).outcome, PatchMapOutcome.applied);
      expect((await update).outcome, PatchMapOutcome.applied);
      expect(h.session.phase, PatchMapPhase.ready);
    },
  );

  test(
    'first-screen batch cuts at presentation preparation and later input waits',
    () async {
      final h = make();
      final replacement = h.session.replace(_scene());
      final early = h.session.update(const [
        PatchMapUpdate(_aText, {'text': 'first'}),
      ]);
      await _tick();
      h.backend.documents.single.complete();
      await _tick();
      final first = h.backend.updates.single;
      expect(first.animate, false);
      expect(first.changes[_aText]!['text'], 'first');
      final later = h.session.update(const [
        PatchMapUpdate(_aText, {'text': 'later'}),
      ]);
      first.complete();
      await _tick();
      expect(h.backend.updates, hasLength(1));
      expect(h.session.phase, PatchMapPhase.preparing);
      h.submit();
      expect((await replacement).outcome, PatchMapOutcome.applied);
      expect((await early).outcome, PatchMapOutcome.applied);
      expect(h.session.phase, PatchMapPhase.ready);
      await _tick();
      final second = h.backend.updates.last;
      expect(h.backend.updates, hasLength(2));
      expect(second.changes[_aText]!['text'], 'later');
      expect(second.animate, true);
      var laterDone = false;
      later.then((_) => laterDone = true);
      await _tick();
      expect(laterDone, false);
      second.complete();
      await _tick();
      h.submit();
      expect((await later).outcome, PatchMapOutcome.applied);
    },
  );

  test(
    'callback reentry admits replacement and update but defers backend work',
    () async {
      final h = make();
      await h.ready();
      late Future<PatchMapResult> replacement;
      late Future<PatchMapResult> update;
      final documents = h.backend.documents.length;
      h.session.notify(() {
        replacement = h.session.replace(_scene('callback'));
        update = h.session.update(const [
          PatchMapUpdate(PatchMapTarget('callback', componentId: 'text'), {
            'text': 'inside',
          }),
        ]);
        expect(h.session.document!.targets.containsKey('callback'), true);
        expect(h.backend.documents.length, documents);
        throw StateError('host callback');
      });
      expect(h.callbackErrors, hasLength(1));
      await _tick();
      expect(h.backend.documents.length, documents + 1);
      h.backend.documents.last.complete();
      await _tick();
      h.backend.updates.last.complete();
      await _tick();
      h.submit();
      expect((await replacement).outcome, PatchMapOutcome.applied);
      expect((await update).outcome, PatchMapOutcome.applied);
      expect(
        h.session.current(
          const PatchMapTarget('callback', componentId: 'text'),
        )!['text'],
        'inside',
      );
    },
  );

  test(
    'only already-submitted unchanged input completes without another publication',
    () async {
      final h = make();
      await h.ready();
      final publishes = h.backend.published.length;
      final invalidations = h.invalidations;
      final result = await h.session.update(const [
        PatchMapUpdate(_aText, {'text': '0'}),
      ]);
      await _tick();
      expect(result.outcome, PatchMapOutcome.unchanged);
      expect(h.backend.updates, isEmpty);
      expect(h.backend.published.length, publishes);
      expect(h.invalidations, invalidations);
    },
  );

  test(
    'matching submitted stamp is required even for a queued unchanged request',
    () async {
      final h = make();
      final replacement = h.session.replace(_scene());
      await _tick();
      h.backend.documents.single.complete();
      await _tick();
      final update = h.session.update(const [
        PatchMapUpdate(_aText, {'text': '0'}),
      ]);
      var done = false;
      update.then((_) => done = true);
      h.session.didSubmit(const PaintSubmission(1, 999));
      await _tick();
      expect(done, false);
      h.submit();
      await replacement;
      await _tick();
      expect(h.backend.published, hasLength(2));
      expect(h.backend.updates, isEmpty);
      expect(done, false);
      h.submit();
      expect((await update).outcome, PatchMapOutcome.applied);
      expect(h.backend.visible!.references, 1);
    },
  );

  test(
    'one latest pending plan preserves companion fields and superseded claims',
    () async {
      final h = make();
      await h.ready();
      final first = h.session.update(const [
        PatchMapUpdate(_aText, {'text': '1'}),
      ]);
      await _tick();
      final work = h.backend.updates.single;
      expect(work.before.references, 2); // Live session plus async input pin.
      final second = h.session.update(const [
        PatchMapUpdate(_aText, {
          'text': '2',
          'style': {'fontSize': 30},
        }),
      ]);
      final third = h.session.update(const [
        PatchMapUpdate(_aBar, {
          'size': {'height': 7},
        }),
      ]);
      final fourth = h.session.update(const [
        PatchMapUpdate(_aText, {'text': '3'}),
      ]);
      work.complete();
      await _tick();
      h.submit();
      expect((await first).superseded, false);
      await _tick();
      expect(h.backend.updates, hasLength(2));
      final pending = h.backend.updates.last;
      expect(pending.changes[_aText]!['text'], '3');
      expect((pending.changes[_aText]!['style'] as Map)['fontSize'], 30);
      expect(pending.changes[_aBar]!['size'], {'width': 20, 'height': 7});
      pending.complete();
      await _tick();
      h.submit();
      expect((await second).superseded, true);
      expect((await third).superseded, false);
      expect((await fourth).superseded, false);
      expect(work.before.references, 0);
      expect(h.backend.visible!.references, 1);
    },
  );

  test(
    'partial item failure retains all its components and respecification retries',
    () async {
      final h = make();
      await h.ready();
      final request = h.session.update(const [
        PatchMapUpdate(_aText, {'text': 'a-next'}),
        PatchMapUpdate(_aBar, {
          'size': {'height': 8},
        }),
        PatchMapUpdate(_bText, {'text': 'b-next'}),
      ]);
      await _tick();
      h.backend.updates.last.complete(failedItems: {'a'});
      await _tick();
      expect(h.session.current(_aText)!['text'], '0');
      expect(h.session.current(_aBar)!['size'], 20);
      expect(h.session.current(_bText)!['text'], 'b-next');
      expect(h.backend.visible!.values[_aText]!['text'], '0');
      expect(h.backend.visible!.values[_aBar]!['size'], 20);
      h.submit();
      final result = await request;
      expect(result.outcome, PatchMapOutcome.partialFailure);
      expect(result.failures.map((failure) => failure.code), ['PREPARE_ITEM']);
      final retry = h.session.update(const [
        PatchMapUpdate(_aText, {'text': 'a-next'}),
        PatchMapUpdate(_aBar, {
          'size': {'height': 8},
        }),
      ]);
      await _tick();
      expect(h.backend.updates, hasLength(2));
      h.backend.updates.last.complete();
      await _tick();
      h.submit();
      expect((await retry).outcome, PatchMapOutcome.applied);
      expect(h.session.current(_aText)!['text'], 'a-next');
      expect(h.session.current(_aBar)!['size'], {'width': 20, 'height': 8});
    },
  );

  test(
    'inactive input validates and composes without preparation, then resumes latest without animation',
    () async {
      final h = make();
      await h.ready();
      h.session.setActive(false);
      final publishes = h.backend.published.length;
      final first = h.session.update(const [
        PatchMapUpdate(_aText, {'text': 'inactive-1'}),
      ]);
      final second = h.session.update(const [
        PatchMapUpdate(_aText, {'text': 'inactive-2'}),
      ]);
      final invalid = await h.session.update(const [
        PatchMapUpdate(_bText, {'text': 'discarded'}),
        PatchMapUpdate(_aBar, {
          'size': {'height': -1},
        }),
      ]);
      await _tick();
      expect(invalid.outcome, PatchMapOutcome.rejected);
      expect(h.backend.updateValidations, 2);
      expect(h.backend.updates, isEmpty);
      expect(h.backend.published.length, publishes);
      expect(h.session.current(_aText)!['text'], '0');
      h.session.setActive(true);
      await _tick();
      final work = h.backend.updates.single;
      expect(work.animate, false);
      expect(work.changes.keys, [_aText]);
      expect(work.changes[_aText]!['text'], 'inactive-2');
      work.complete();
      await _tick();
      h.submit();
      expect((await first).superseded, true);
      expect((await second).outcome, PatchMapOutcome.applied);
    },
  );

  test(
    'in-flight suspension keeps reservation until settlement and publishes only latest on resume',
    () async {
      final h = make();
      await h.ready();
      final first = h.session.update(const [
        PatchMapUpdate(_aText, {'text': 'in-flight'}),
      ]);
      await _tick();
      final work = h.backend.updates.single;
      final original = work.before;
      expect(work.animate, true);
      h.session.setActive(false);
      final second = h.session.update(const [
        PatchMapUpdate(_aText, {'text': 'resume-latest'}),
      ]);
      expect(original.references, 2);
      final stale = work.complete();
      await _tick();
      expect(stale.references, 1);
      expect(original.references, 2);
      expect(h.backend.published, hasLength(1));
      h.session.setActive(true);
      await _tick();
      expect(stale.references, 0);
      expect(h.backend.updates, hasLength(2));
      final resumed = h.backend.updates.last;
      expect(resumed.animate, false);
      expect(resumed.changes[_aText]!['text'], 'resume-latest');
      resumed.complete();
      await _tick();
      expect(h.backend.published, hasLength(2));
      expect(h.backend.visible!.values[_aText]!['text'], 'resume-latest');
      h.submit();
      expect((await first).superseded, true);
      expect((await second).outcome, PatchMapOutcome.applied);
      expect(original.references, 0);
    },
  );

  test(
    'replaced asynchronous document candidate retires when it actually finishes',
    () async {
      final h = make();
      final first = h.session.replace(_scene());
      await _tick();
      final oldWork = h.backend.documents.single;
      final second = h.session.replace(_scene('new'));
      await _tick();
      expect((await first).interruption, PatchMapInterruption.replaced);
      h.backend.documents.last.complete();
      await _tick();
      h.submit();
      await second;
      final published = h.backend.visible;
      final stale = oldWork.complete();
      await _tick();
      expect(stale.references, 0);
      expect(identical(h.backend.visible, published), true);
      expect(h.backend.published, hasLength(1));
    },
  );

  test(
    'replacement pins old in-flight update until its late candidate settles',
    () async {
      final h = make();
      await h.ready();
      final update = h.session.update(const [
        PatchMapUpdate(_aText, {'text': 'stale'}),
      ]);
      await _tick();
      final oldWork = h.backend.updates.single;
      final oldPublication = oldWork.before;
      final replacement = h.session.replace(_scene('new'));
      await _tick();
      expect((await update).interruption, PatchMapInterruption.replaced);
      expect(oldPublication.references, 1);
      h.backend.documents.last.complete();
      await _tick();
      h.submit();
      await replacement;
      final current = h.backend.visible;
      final stale = oldWork.complete();
      await _tick();
      expect(stale.references, 0);
      expect(oldPublication.references, 0);
      expect(identical(h.backend.visible, current), true);
      expect(h.backend.published, hasLength(2));
    },
  );

  test(
    'close interrupts obligations and retires late document and update results',
    () async {
      final h = make();
      final replacing = h.session.replace(_scene());
      await _tick();
      final document = h.backend.documents.single;
      h.session.close();
      h.session.close();
      expect((await replacing).interruption, PatchMapInterruption.detached);
      final lateDocument = document.complete();
      await _tick();
      expect(lateDocument.references, 0);
      expect(h.backend.closeCalls, 1);
      expect(h.backend.published, isEmpty);

      final second = make();
      await second.ready();
      final updating = second.session.update(const [
        PatchMapUpdate(_aText, {'text': 'late'}),
      ]);
      await _tick();
      final updateWork = second.backend.updates.single;
      second.session.close();
      expect((await updating).interruption, PatchMapInterruption.detached);
      expect(updateWork.before.references, 1);
      final lateUpdate = updateWork.complete();
      await _tick();
      expect(lateUpdate.references, 0);
      expect(updateWork.before.references, 0);
      expect(second.backend.published, hasLength(1));
    },
  );

  test(
    'filter mutations reject and throwing host callbacks cannot corrupt progression',
    () async {
      final h = make();
      await h.ready();
      late Future<PatchMapResult> update;
      late Future<PatchMapResult> replacement;
      final generation = h.session.generation;
      expect(
        h.session.filter(() {
          update = h.session.update(const [
            PatchMapUpdate(_aText, {'text': 'forbidden'}),
          ]);
          replacement = h.session.replace(_scene('forbidden'));
          return true;
        }),
        true,
      );
      expect((await update).outcome, PatchMapOutcome.rejected);
      expect((await replacement).outcome, PatchMapOutcome.rejected);
      expect(h.session.generation, generation);
      expect(h.backend.updates, isEmpty);
      expect(h.backend.documents, hasLength(1));
      h.throwFromReporter = true;
      expect(h.session.filter(() => throw StateError('predicate')), false);
      h.session.notify(() => throw StateError('notification'));
      expect(h.callbackErrors, hasLength(2));
      final accepted = h.session.update(const [
        PatchMapUpdate(_aText, {'text': 'allowed'}),
      ]);
      await _tick();
      h.backend.updates.last.complete();
      await _tick();
      h.submit();
      expect((await accepted).outcome, PatchMapOutcome.applied);
    },
  );

  test(
    'fatal failure interrupts all work, rejects updates, and replacement alone recovers',
    () async {
      final h = make();
      await h.ready();
      final first = h.session.update(const [
        PatchMapUpdate(_aText, {'text': 'first'}),
      ]);
      await _tick();
      final oldWork = h.backend.updates.single;
      final pending = h.session.update(const [
        PatchMapUpdate(_bText, {'text': 'pending'}),
      ]);
      h.session.fail(const FormatException('paint failure'));
      expect(h.session.phase, PatchMapPhase.failed);
      expect(h.backend.visible, null);
      expect((await first).interruption, PatchMapInterruption.failed);
      expect((await pending).interruption, PatchMapInterruption.failed);
      final rejected = await h.session.update(const [
        PatchMapUpdate(_aText, {'text': 'cannot-restart'}),
      ]);
      expect(rejected.outcome, PatchMapOutcome.rejected);
      final replacement = h.session.replace(_scene('recovered'));
      await _tick();
      final late = oldWork.complete();
      await _tick();
      expect(late.references, 0);
      h.backend.documents.last.complete();
      await _tick();
      h.submit();
      expect((await replacement).outcome, PatchMapOutcome.applied);
      expect(h.session.phase, PatchMapPhase.ready);
      expect(
        h.phases.where((phase) => phase == PatchMapPhase.failed),
        hasLength(1),
      );
    },
  );

  test(
    'fatal initial preparation failure reports failure and a valid replacement recovers',
    () async {
      final h = make();
      final first = h.session.replace(_scene());
      await _tick();
      h.backend.documents.single.fail(
        const FormatException('prepare-document'),
      );
      await _tick();
      final failure = await first;
      expect(failure.interruption, PatchMapInterruption.failed);
      expect(failure.failures, hasLength(1));
      expect(h.session.phase, PatchMapPhase.failed);
      final next = h.session.replace(_scene('recovered'));
      await _tick();
      h.backend.documents.last.complete();
      await _tick();
      h.submit();
      expect((await next).outcome, PatchMapOutcome.applied);
      expect(h.session.phase, PatchMapPhase.ready);
    },
  );

  test(
    'backend identity reuse returns one owned reference without leaking pins',
    () async {
      final h = make();
      await h.ready();
      final publication = h.backend.visible!;
      final request = h.session.update(const [
        PatchMapUpdate(_aText, {'text': 'changed'}),
      ]);
      await _tick();
      expect(publication.references, 2);
      h.backend.updates.single.complete(reuse: true);
      await _tick();
      expect(identical(h.backend.visible, publication), true);
      expect(publication.references, 1);
      h.submit();
      expect((await request).outcome, PatchMapOutcome.applied);
    },
  );

  test(
    'inactive replacements retain only latest valid accepted document',
    () async {
      final h = make();
      await h.ready();
      h.session.setActive(false);
      final first = h.session.replace(_scene('inactive-first'));
      final latest = h.session.replace(_scene('inactive-latest'));
      final generation = h.session.generation;
      final invalid = await h.session.replace([
        {'type': 'item', 'size': -1},
      ]);
      await _tick();
      expect((await first).interruption, PatchMapInterruption.replaced);
      expect(invalid.outcome, PatchMapOutcome.rejected);
      expect(h.session.generation, generation);
      expect(h.session.document!.targets.containsKey('inactive-latest'), true);
      expect(h.backend.documents, hasLength(1));
      h.session.setActive(true);
      await _tick();
      expect(h.backend.documents, hasLength(2));
      expect(
        h.backend.documents.last.document.targets.containsKey(
          'inactive-latest',
        ),
        true,
      );
      h.backend.documents.last.complete();
      await _tick();
      h.submit();
      expect((await latest).outcome, PatchMapOutcome.applied);
    },
  );

  test(
    'superseded request retains companion failure while other item succeeds',
    () async {
      final h = make();
      await h.ready();
      final executing = h.session.update(const [
        PatchMapUpdate(_aText, {'text': '1'}),
      ]);
      await _tick();
      final overwritten = h.session.update(const [
        PatchMapUpdate(_aText, {
          'text': '2',
          'style': {'fontSize': 30},
        }),
      ]);
      final latest = h.session.update(const [
        PatchMapUpdate(_aText, {'text': '3'}),
      ]);
      final independent = h.session.update(const [
        PatchMapUpdate(_bText, {'text': 'b-success'}),
      ]);
      h.backend.updates.first.complete();
      await _tick();
      h.submit();
      await executing;
      await _tick();
      h.backend.updates.last.complete(failedItems: {'a'});
      await _tick();
      h.submit();
      final old = await overwritten;
      expect(old.superseded, true);
      expect(old.outcome, PatchMapOutcome.partialFailure);
      expect(old.failures.single.target, const PatchMapTarget('a'));
      expect((await latest).outcome, PatchMapOutcome.partialFailure);
      expect((await independent).outcome, PatchMapOutcome.applied);
      expect(h.session.current(_aText)!['text'], '1');
      expect((h.session.current(_aText)!['style'] as Map)['fontSize'], 12);
      expect(h.session.current(_bText)!['text'], 'b-success');
    },
  );
}

class _Harness {
  _Harness() {
    session = MapSession(
      backend: backend,
      invalidate: () => invalidations++,
      onPhase: (phase, failure) => phases.add(phase),
      onCallbackError: (error, stack) {
        callbackErrors.add(error);
        if (throwFromReporter) {
          throw StateError('reporter');
        }
      },
    );
  }
  final backend = _Backend();
  late final MapSession session;
  final phases = <PatchMapPhase>[];
  final callbackErrors = <Object>[];
  var invalidations = 0;
  var throwFromReporter = false;

  Future<void> ready() async {
    final replacement = session.replace(_scene());
    await _tick();
    backend.documents.last.complete();
    await _tick();
    submit();
    expect((await replacement).outcome, PatchMapOutcome.applied);
    await _tick();
    expect(session.phase, PatchMapPhase.ready);
  }

  void submit() {
    final publication = backend.published.last;
    session.didSubmit(
      PaintSubmission(publication.generation, publication.revision),
    );
  }

  Future<void> dispose() async {
    session.close();
    // Settle uncancellable work after close through its real completion path.
    for (final work in backend.documents) {
      if (!work.completer.isCompleted) {
        work.complete();
      }
    }
    for (final work in backend.updates) {
      if (!work.completer.isCompleted) {
        work.complete();
      }
    }
    await _tick();
    expect(
      backend.publications.every((publication) => publication.references == 0),
      true,
      reason: backend.publications
          .map((p) => '${p.id}:${p.references}')
          .join(', '),
    );
    expect(backend.closeCalls, 1);
  }
}

class _Publication extends SessionPublication {
  _Publication(this.id, this.values);
  final int id;
  final Map<PatchMapTarget, Map<String, Object?>> values;
  var references = 1;
}

class _Published {
  _Published(this.publication, this.generation, this.revision);
  final _Publication publication;
  final int generation, revision;
}

class _DocumentWork {
  _DocumentWork(this.backend, this.document, this.generation);
  final _Backend backend;
  final DatasetDocument document;
  final int generation;
  final completer = Completer<SessionPublication>();
  _Publication complete() {
    final publication = backend.create({
      for (final target in document.targets.values)
        PatchMapTarget(target.id): target.data,
      for (final target in document.targets.values)
        for (final component in target.components.entries)
          PatchMapTarget(target.id, componentId: component.key):
              component.value,
    });
    completer.complete(publication);
    return publication;
  }

  void fail(Object error) => completer.completeError(error, StackTrace.current);
}

class _UpdateWork {
  _UpdateWork(
    this.backend,
    this.before,
    this.document,
    this.changes,
    this.generation,
    this.animate,
  );
  final _Backend backend;
  final _Publication before;
  final DatasetDocument document;
  final Map<PatchMapTarget, Map<String, Object?>> changes;
  final int generation;
  final bool animate;
  final completer = Completer<PreparedUpdate>();
  _Publication complete({
    Set<String> failedItems = const {},
    bool reuse = false,
  }) {
    expect(
      before.references,
      greaterThan(0),
      reason: 'async input pin must outlive preparation',
    );
    final publication = reuse
        ? before
        : backend.create({
            ...before.values,
            for (final entry in changes.entries)
              if (!failedItems.contains(entry.key.id)) entry.key: entry.value,
          });
    if (reuse) {
      backend.retain(publication);
    }
    completer.complete(
      PreparedUpdate(
        publication,
        failures: {
          for (final id in failedItems)
            id: [
              PatchMapFailure(
                'PREPARE_ITEM',
                'injected item preparation failure',
                target: PatchMapTarget(id),
              ),
            ],
        },
      ),
    );
    return publication;
  }
}

class _Backend extends SessionBackend {
  final documents = <_DocumentWork>[];
  final updates = <_UpdateWork>[];
  final publications = <_Publication>[];
  final published = <_Published>[];
  final activities = <bool>[];
  _Publication? visible;
  var hides = 0, closeCalls = 0, updateValidations = 0;

  _Publication create(Map<PatchMapTarget, Map<String, Object?>> values) {
    final publication = _Publication(
      publications.length,
      Map.unmodifiable(values),
    );
    publications.add(publication);
    return publication;
  }

  @override
  void validateDocument(DatasetDocument document) {}
  @override
  void validateUpdate(
    DatasetDocument document,
    PresentationBatch batch,
    PresentationRecordLookup current,
  ) {
    updateValidations++;
  }

  @override
  Future<SessionPublication> prepareDocument(
    DatasetDocument document,
    int generation,
  ) {
    final work = _DocumentWork(this, document, generation);
    documents.add(work);
    return work.completer.future;
  }

  @override
  Future<PreparedUpdate> prepareUpdate(
    SessionPublication before,
    DatasetDocument document,
    Map<PatchMapTarget, Map<String, Object?>> changes, {
    required int generation,
    required bool animate,
    PresentationPlan? intent,
  }) {
    final work = _UpdateWork(
      this,
      before as _Publication,
      document,
      changes,
      generation,
      animate,
    );
    updates.add(work);
    return work.completer.future;
  }

  @override
  void publish(SessionPublication publication, int generation, int revision) {
    final value = publication as _Publication;
    expect(value.references, greaterThan(0));
    visible = value;
    published.add(_Published(value, generation, revision));
  }

  @override
  void hide() {
    hides++;
    visible = null;
  }

  @override
  void setActive(bool active) => activities.add(active);
  @override
  void retain(SessionPublication publication) {
    final value = publication as _Publication;
    expect(
      value.references,
      greaterThan(0),
      reason: 'cannot retain retired publication',
    );
    value.references++;
  }

  @override
  void retire(SessionPublication publication) {
    final value = publication as _Publication;
    expect(value.references, greaterThan(0), reason: 'no double release');
    value.references--;
  }

  @override
  void close() {
    closeCalls++;
    visible = null;
  }
}
