import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/frame/frame_coordinator.dart';
import 'package:conalog_patch_map/src/presentation/field_operations.dart';
import 'package:conalog_patch_map/src/presentation/presentation_admission.dart';
import 'package:conalog_patch_map/src/presentation/record_delta.dart';
import 'package:conalog_patch_map/src/session/map_session.dart';
import 'package:conalog_patch_map/src/session/session_backend.dart';
import 'package:flutter_test/flutter_test.dart';

import 'backend_resources_test.dart' as support;

const _item = PatchMapTarget('i');
const _icon = PatchMapTarget('i', componentId: 'icon');
const _bar = PatchMapTarget('i', componentId: 'bar');
const _number = PatchMapTarget('i', componentId: 'number');
const _other = PatchMapTarget('other');

List<Object?> _scene() => [
  {
    'type': 'item',
    'id': 'i',
    'size': 20,
    'components': [
      {'type': 'icon', 'id': 'icon', 'source': 'good.svg', 'size': 10},
      {'type': 'bar', 'id': 'bar', 'source': {}, 'size': 10},
      {
        'type': 'text',
        'id': 'number',
        'text': '0',
        'style': {
          'autoFont': {'min': 1, 'max': 20},
        },
      },
    ],
  },
  {'type': 'text', 'id': 'other', 'text': 'old'},
];

Future<void> _tick() async {
  for (var i = 0; i < 20; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final suspended in [false, true]) {
    test(
      'rollback revalidates item geometry and submission; suspended=$suspended',
      () async {
        final h = _Harness();
        addTearDown(h.close);
        await h.ready();
        final held = h.resources.backend.current!.geometry['i']!.item!.size;
        final first = h.session.update(const [
          PatchMapUpdate(_item, {'size': 80}),
          PatchMapUpdate(_icon, {'source': 'bad.svg'}),
        ]);
        await _tick();
        final pending = h.session.update(const [
          PatchMapUpdate(_bar, {
            'size': {'height': 'calc(100% - 50px)'},
          }),
          PatchMapUpdate(_number, {'text': 'must roll back'}),
          PatchMapUpdate(_other, {'text': 'independent'}),
        ]);
        var completed = false;
        pending.then((_) => completed = true);
        h.failAsset();
        await _tick();
        if (suspended) {
          h.session.setActive(false);
          h.session.setActive(true);
        } else {
          h.submit();
          expect((await first).outcome, PatchMapOutcome.partialFailure);
        }
        await _tick();
        expect(h.session.phase, PatchMapPhase.ready);
        expect(
          completed,
          false,
          reason: 'partial failure still waits for matching paint',
        );
        expect(h.session.current(_number)!['text'], '0');
        expect(h.session.current(_other)!['text'], 'independent');
        expect(h.resources.backend.current!.geometry['i']!.item!.size, held);
        h.submit();
        expect((await first).outcome, PatchMapOutcome.partialFailure);
        final result = await pending;
        expect(result.outcome, PatchMapOutcome.partialFailure);
        expect(result.interruption, isNull);
        expect(result.failures.single.target, _item);
        expect(result.failures.single.code, 'INVALID_GEOMETRY');
        expect(h.errors, isEmpty);

        final recovery = h.session.update(const [
          PatchMapUpdate(_bar, {'size': 15}),
        ]);
        await _tick();
        h.submit();
        expect((await recovery).outcome, PatchMapOutcome.applied);
        expect(h.session.current(_bar)!['size'], 15);
      },
    );
  }

  for (final scenario in ['style', 'attrs']) {
    test(
      'rollback revalidates compound $scenario schema before preparation',
      () async {
        final h = _Harness();
        addTearDown(h.close);
        await h.ready();
        final target = scenario == 'style' ? _number : _bar;
        final firstValues = scenario == 'style'
            ? <String, Object?>{
                'style': {
                  'autoFont': {'max': 40},
                },
              }
            : <String, Object?>{
                'attrs': {
                  'pivot': {'x': 0, 'y': 0},
                },
              };
        final laterValues = scenario == 'style'
            ? <String, Object?>{
                'style': {
                  'autoFont': {'min': 30},
                },
              }
            : <String, Object?>{
                'attrs': {
                  'pivot': {'x': 2},
                },
              };
        final first = h.session.update([
          PatchMapUpdate(target, firstValues),
          const PatchMapUpdate(_icon, {'source': 'bad.svg'}),
        ]);
        await _tick();
        final pending = h.session.update([PatchMapUpdate(target, laterValues)]);
        h.failAsset();
        await _tick();
        h.submit();
        expect((await first).outcome, PatchMapOutcome.partialFailure);
        final prepares = h.backend.prepares;
        await _tick();
        expect(
          h.backend.prepares,
          prepares,
          reason: 'invalid rebased input never reaches renderer',
        );
        expect(h.session.phase, PatchMapPhase.ready);
        h.submit();
        final result = await pending;
        expect(result.outcome, PatchMapOutcome.partialFailure);
        expect(result.failures.single.target, _item);
        expect(h.errors, isEmpty);
      },
    );
  }

  test(
    'pending replacement fields repair rollback and retain superseded claims',
    () async {
      final h = _Harness();
      addTearDown(h.close);
      await h.ready();
      final first = h.session.update(const [
        PatchMapUpdate(_item, {'size': 80}),
        PatchMapUpdate(_icon, {'source': 'bad.svg'}),
      ]);
      await _tick();
      final older = h.session.update(const [
        PatchMapUpdate(_bar, {
          'size': {'height': 'calc(100% - 50px)'},
        }),
        PatchMapUpdate(_number, {'text': 'older'}),
      ]);
      final latest = h.session.update(const [
        PatchMapUpdate(_item, {'size': 100}),
        PatchMapUpdate(_number, {'text': 'latest'}),
      ]);
      h.failAsset();
      await _tick();
      h.submit();
      await first;
      await _tick();
      h.submit();
      final oldResult = await older, latestResult = await latest;
      expect(oldResult.outcome, PatchMapOutcome.applied);
      expect(oldResult.superseded, true);
      expect(latestResult.outcome, PatchMapOutcome.applied);
      expect(latestResult.superseded, false);
      expect(h.session.current(_number)!['text'], 'latest');
      expect(
        h.resources.backend.current!.geometry['i']!.item!.components
            .firstWhere((component) => component.id == 'bar')
            .box
            .height,
        50,
      );
      expect(h.errors, isEmpty);
    },
  );

  test(
    'rebased reset removes published attrs before child-field validation',
    () async {
      final h = _Harness();
      addTearDown(h.close);
      await h.ready([
        {
          'type': 'grid',
          'id': 'g',
          'cells': [
            [1],
          ],
          'item': {
            'size': 20,
            'components': [
              {'type': 'icon', 'id': 'icon', 'source': 'good.svg', 'size': 10},
              {'type': 'text', 'id': 'text', 'text': '0'},
            ],
          },
        },
      ]);
      const text = PatchMapTarget('g.0.0', componentId: 'text');
      const icon = PatchMapTarget('g.0.0', componentId: 'icon');
      final setup = h.session.update(const [
        PatchMapUpdate(text, {
          'attrs': {'angle': 10},
        }),
      ]);
      await _tick();
      h.submit();
      await setup;
      final first = h.session.update(const [
        PatchMapUpdate(icon, {'source': 'bad.svg'}),
      ]);
      await _tick();
      final reset = h.session.update(const [
        PatchMapUpdate(text, {'attrs': null}),
      ]);
      final later = h.session.update(const [
        PatchMapUpdate(text, {
          'attrs': {'rotation': 1},
        }),
      ]);
      h.failAsset();
      await _tick();
      h.submit();
      expect((await first).outcome, PatchMapOutcome.partialFailure);
      await _tick();
      h.submit();
      expect((await reset).outcome, PatchMapOutcome.applied);
      expect((await later).outcome, PatchMapOutcome.applied);
      expect(h.session.current(text)!['attrs'], {'rotation': 1});
      expect(h.errors, isEmpty);
    },
  );

  for (final component in [false, true]) {
    test(
      'ancestor rollback isolates world geometry; component=$component',
      () async {
        final h = _Harness();
        addTearDown(h.close);
        await h.ready([
          {
            'type': 'group',
            'id': 'g',
            'attrs': {'scaleX': 2},
            'children': [
              _scene().first,
              if (component)
                {
                  'type': 'item',
                  'id': 'r',
                  'size': 20,
                  'components': [
                    {'type': 'text', 'id': 't', 'text': '0'},
                  ],
                }
              else
                {'type': 'rect', 'id': 'r', 'size': 1},
            ],
          },
          _scene().last,
        ]);
        const group = PatchMapTarget('g');
        final target = PatchMapTarget('r', componentId: component ? 't' : null);
        final first = h.session.update(const [
          PatchMapUpdate(group, {
            'attrs': {'scaleX': .5},
          }),
          PatchMapUpdate(_icon, {'source': 'bad.svg'}),
        ]);
        await _tick();
        final pending = h.session.update([
          PatchMapUpdate(target, const {
            'attrs': {'x': 1e308},
          }),
          const PatchMapUpdate(_other, {'text': 'independent'}),
        ]);
        h.failAsset();
        await _tick();
        h.submit();
        expect((await first).outcome, PatchMapOutcome.partialFailure);
        await _tick();
        h.submit();
        final result = await pending;
        expect(result.outcome, PatchMapOutcome.partialFailure);
        expect(result.failures.single.code, 'INVALID_GEOMETRY');
        expect(result.failures.single.target, const PatchMapTarget('r'));
        expect(h.session.current(target)!['attrs'], isNot(contains('x')));
        expect(h.session.current(_other)!['text'], 'independent');
        expect(h.session.phase, PatchMapPhase.ready);
        expect(h.errors, isEmpty);

        // Parent + child are evaluated together; the changed parent makes this
        // same extreme local coordinate valid against the final transform.
        final repaired = h.session.update([
          const PatchMapUpdate(group, {
            'attrs': {'scaleX': .5},
          }),
          PatchMapUpdate(target, const {
            'attrs': {'x': 1e308},
          }),
        ]);
        await _tick();
        h.submit();
        expect((await repaired).outcome, PatchMapOutcome.applied);
        expect((h.session.current(target)!['attrs'] as Map)['x'], 1e308);
        expect(h.errors, isEmpty);
      },
    );
  }

  test('successful updates do not repeat admission at execution', () async {
    final h = _Harness();
    addTearDown(h.close);
    await h.ready();
    final before = h.backend.validations;
    for (var i = 1; i <= 3; i++) {
      final result = h.session.update([
        PatchMapUpdate(_bar, {'size': 10 + i}),
      ]);
      await _tick();
      h.submit();
      expect((await result).outcome, PatchMapOutcome.applied);
    }
    expect(h.backend.validations - before, 3);
    final failed = h.session.update(const [
      PatchMapUpdate(_icon, {'source': 'bad.svg'}),
    ]);
    await _tick();
    h.failAsset();
    await _tick();
    h.submit();
    expect((await failed).outcome, PatchMapOutcome.partialFailure);
    final afterFailure = h.backend.validations;
    for (var i = 0; i < 3; i++) {
      final result = h.session.update([
        PatchMapUpdate(_other, {'text': 'later-$i'}),
      ]);
      await _tick();
      h.submit();
      expect((await result).outcome, PatchMapOutcome.applied);
    }
    expect(
      h.backend.validations - afterFailure,
      3,
      reason: 'past failures do not revalidate newly admitted requests',
    );
    expect(h.errors, isEmpty);
  });
}

final class _Harness {
  _Harness() {
    resources = resourcesSupport();
    backend = _Backend(resources);
    session = MapSession(
      backend: backend,
      invalidate: () {},
      onPhase: (_, _) {},
      onCallbackError: (error, _) => errors.add(error),
    );
  }
  final bad = Completer<Uint8List>();
  final errors = <Object>[];
  late final support.Harness resources;
  late final _Backend backend;
  late final MapSession session;
  support.Harness resourcesSupport() => support.Harness(
    (key) => key == 'bad.svg'
        ? bad.future
        : Future.value(Uint8List.fromList(utf8.encode(support.good))),
  );
  Future<void> ready([List<Object?>? data]) async {
    final result = session.replace(data ?? _scene());
    await _tick();
    submit();
    await result;
    final publication = resources.backend.current!;
    for (var i = 0; i < publication.geometry.nodes.length; i++) {
      for (final asset in publication.node(i).assets) {
        await asset.ready;
      }
    }
  }

  void failAsset() =>
      bad.complete(Uint8List.fromList(utf8.encode(support.unsupported)));
  void submit() => session.didSubmit(backend.stamp!);
  void close() {
    session.close();
    resources.close();
  }
}

final class _Backend extends SessionBackend {
  _Backend(this.harness);
  final support.Harness harness;
  PaintSubmission? stamp;
  int validations = 0, prepares = 0;
  @override
  void validateDocument(DatasetDocument d) =>
      harness.backend.validateDocument(d);
  @override
  void validateUpdate(
    DatasetDocument d,
    PresentationBatch b,
    PresentationRecordLookup lookup,
  ) {
    validations++;
    harness.backend.validateUpdate(d, b, lookup);
  }

  @override
  Future<SessionPublication> prepareDocument(
    DatasetDocument d,
    int generation,
  ) async => harness.initial(d);
  @override
  Future<PreparedUpdate> prepareUpdate(
    SessionPublication p,
    DatasetDocument d,
    Map<PatchMapTarget, RecordDelta> changes, {
    required int generation,
    required bool animate,
    PresentationPlan? intent,
  }) {
    prepares++;
    return harness.backend.prepareUpdate(
      p,
      d,
      changes,
      generation: generation,
      animate: animate,
      intent: intent,
    );
  }

  @override
  void publish(SessionPublication p, int generation, int revision) {
    harness.backend.publish(p, generation, revision);
    stamp = PaintSubmission(generation, revision);
  }

  @override
  void hide() => harness.backend.hide();
  @override
  void setActive(bool active) => harness.backend.setActive(active);
  @override
  void retain(SessionPublication p) => harness.backend.retain(p);
  @override
  void retire(SessionPublication p) => harness.backend.retire(p);
  @override
  void close() => harness.backend.close();
}
