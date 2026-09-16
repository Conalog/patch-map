import 'dart:async';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:conalog_patch_map/src/api/values.dart';
import 'package:conalog_patch_map/src/engine/ports.dart';
import 'package:conalog_patch_map/src/semantic/geometry/primitives.dart';
import 'package:conalog_patch_map/src/engine/controller.dart';
import 'controller_test.dart' as fixtures;
import 'package:conalog_patch_map/src/semantic/text/layout.dart';

Future<(PatchMapController, fixtures.Surface)> mount(Object data) async {
  final c = await PatchMapController.create(
    data: data,
    fit: false,
    textLayouter: layoutGeometryText,
  );
  final surface = fixtures.Surface()..controller = c;
  c.attach(surface);
  surface.paint();
  addTearDown(c.destroy);
  return (c, surface);
}

class DelayedSurface extends fixtures.Surface {
  final entered = Completer<void>(), release = Completer<void>();
  @override
  Future<PatchMapCaptureResult> capture(PatchMapRenderSnapshot snapshot) async {
    entered.complete();
    await release.future;
    return super.capture(snapshot);
  }
}

class RetrySurface extends fixtures.Surface {
  int attempts = 0;
  @override
  Future<void> dispose() async {
    attempts++;
    if (attempts == 1) throw StateError('surface cleanup failed');
  }
}

class DisposalAssets implements PatchMapAssetPort {
  int attempts = 0;
  @override
  Map<String, MapRect> get imageSizes => const {};
  @override
  PatchMapResult register(List<Map<String, dynamic>> _) => PatchMapResult({});
  @override
  Map<String, dynamic> status([String? alias]) => {};
  @override
  Future<void> ready(PatchMapRenderSnapshot snapshot) async {}
  @override
  Future<void> dispose() async {
    attempts++;
  }
}

void main() {
  test('whitespace-only target and query identities reject', () async {
    final (c, _) = await mount(fixtures.scene());
    for (final value in [
      const PatchMapTarget(' '),
      const PatchMapTarget('item', componentId: ' '),
      {'id': ' '},
      {'id': 'item', 'componentId': ' '},
    ]) {
      expect(() => c.selection.set([value]), throwsA(isA<PatchMapException>()));
    }
    for (final field in ['id', 'componentId', 'type', 'within']) {
      expect(
        () => c.targets.query({field: ' '}),
        throwsA(isA<PatchMapException>()),
      );
    }
  });

  test(
    'partial bar retarget preserves topology and other active tweens',
    () async {
      final (c, surface) = await fixtures.mounted();
      addTearDown(c.destroy);
      c.updateBatch({
        'targets': ['grid.0.0', 'grid.0.1'],
        'bar': {
          'height': Float64List.fromList([60, 40]),
        },
      }, animate: true);
      surface.paint(50);
      final before = c.renderSnapshot.geometry;
      c.updateBatch({
        'targets': ['grid.0.0'],
        'bar': {
          'height': Float64List.fromList([30]),
        },
      }, animate: true);
      expect(
        identical(c.renderSnapshot.geometry.topology, before.topology),
        true,
      );
      surface.paint(250);
      expect(
        c.renderSnapshot.geometry.targets['grid.0.0\u0000bar']!.bounds.height,
        30,
      );
      expect(
        c.renderSnapshot.geometry.targets['grid.0.1\u0000bar']!.bounds.height,
        40,
      );
    },
  );
  for (final size in [
    25,
    '25%',
    {'value': 25, 'unit': '%'},
  ]) {
    test(
      'concrete scalar bar $size retains width with companion changes',
      () async {
        final (c, surface) = await mount([
          {
            'type': 'grid',
            'id': 'g',
            'cells': [
              [1],
            ],
            'item': {
              'size': 100,
              'components': [
                {
                  'type': 'bar',
                  'id': 'b',
                  'size': size,
                  'source': {'type': 'rect'},
                },
              ],
            },
          },
        ]);
        expect(
          c.update({
            'id': 'g.0.0',
            'bar': {
              'height': 40,
              'changes': {'show': true},
            },
          }, animate: false).status,
          'committed',
        );
        final bounds =
            c.renderSnapshot.geometry.targets['g.0.0\u0000b']!.bounds;
        expect(bounds.width, 25);
        expect(bounds.height, 40);
        c.updateBatch({
          'targets': ['g.0.0'],
          'bar': {
            'height': [null],
          },
        }, animate: false);
        expect(
          c.renderSnapshot.geometry.targets['g.0.0\u0000b']!.bounds.height,
          25,
        );
        c.update({
          'id': 'g.0.0',
          'bar': {'height': 65},
        }, animate: true);
        expect(
          c.renderSnapshot.geometry.targets['g.0.0\u0000b']!.bounds.height,
          25,
        );
        surface.paint(100);
        expect(
          c.renderSnapshot.geometry.targets['g.0.0\u0000b']!.bounds.height,
          60,
        );
        surface.paint(200);
        c.update({
          'id': 'g.0.0',
          'bar': {'height': null},
        }, animate: false);
        expect(
          c.renderSnapshot.geometry.targets['g.0.0\u0000b']!.bounds.height,
          25,
        );
      },
    );
  }

  test(
    'destroy joins callers, attempts assets after surface failure and retries only failed cleanup',
    () async {
      final assets = DisposalAssets();
      final c = await PatchMapController.create(
        data: [],
        fit: false,
        assetPort: assets,
      );
      final surface = RetrySurface()..controller = c;
      c.attach(surface);
      surface.paint();
      final first = c.destroy(), joined = c.destroy();
      expect(identical(first, joined), true);
      await expectLater(first, throwsStateError);
      expect(assets.attempts, 1);
      expect(await c.destroy(), true);
      expect(surface.attempts, 2);
      expect(assets.attempts, 1);
      expect(await c.destroy(), false);
    },
  );
  test(
    'capture freezes both animation timelines and resumes their remaining duration',
    () async {
      final c = await PatchMapController.create(
        data: fixtures.scene(),
        fit: false,
      );
      final surface = DelayedSurface()..controller = c;
      c.attach(surface);
      surface.paint();
      addTearDown(c.destroy);
      c.update({
        'id': 'item',
        'bar': {'height': 60},
      }, animate: true);
      final rotation = c.rotation.animateTo(90);
      surface.paint(50);
      final height =
          c.renderSnapshot.geometry.targets['item\u0000bar']!.bounds.height;
      final angle = c.rotation.value;
      final capture = c.capture.png();
      await surface.entered.future;
      expect(c.advanceFrame(150), false);
      expect(c.rotation.value, angle);
      expect(
        c.renderSnapshot.geometry.targets['item\u0000bar']!.bounds.height,
        height,
      );
      expect(c.viewport.resize(480, 520), false);
      surface.release.complete();
      await capture;
      surface.paint(150);
      expect(c.rotation.value, angle);
      surface.paint(350);
      expect((await rotation.finished).status, 'completed');
      expect(
        c.renderSnapshot.geometry.targets['item\u0000bar']!.bounds.height,
        60,
      );
      expect(c.viewport.state['screenBounds'], [0, 0, 480, 520]);
    },
  );
  test(
    'scalar bar companions preserve width and source replacement defaults',
    () async {
      final (c, _) = await mount([
        {
          'type': 'grid',
          'id': 'g',
          'cells': [
            [1],
          ],
          'item': {
            'size': 100,
            'components': [
              {
                'type': 'bar',
                'id': 'b',
                'size': 20,
                'source': {'type': 'rect', 'borderWidth': 5},
              },
            ],
          },
        },
      ]);
      expect(
        c.update({
          'id': 'g.0.0',
          'bar': {
            'height': 40,
            'changes': {'show': true},
          },
        }, animate: false).status,
        'committed',
      );
      final bounds = c.renderSnapshot.geometry.targets['g.0.0\u0000b']!.bounds;
      expect(bounds.width, 20);
      expect(bounds.height, 40);
      expect(
        c.update({
          'id': 'g.0.0',
          'bar': {
            'changes': {
              'source': {'fill': '#00ff00'},
            },
          },
        }).status,
        'committed',
      );
      expect(
        c.renderSnapshot.overlays['g.0.0\u0000b']!['source']['borderWidth'],
        0,
      );
      c.update({
        'id': 'g.0.0',
        'bar': {
          'changes': {'source': null},
        },
      });
      expect(
        c.renderSnapshot.overlays['g.0.0\u0000b']!.containsKey('source'),
        false,
      );
    },
  );
  for (final time in [50.0, 250.0]) {
    test('undo reconciles bar rendering at animation time $time', () async {
      final (c, surface) = await fixtures.mounted();
      c.update({
        'id': 'item',
        'bar': {'height': 60},
      }, animate: true);
      surface.paint(time);
      expect(c.history.undo().status, 'committed');
      surface.paint(500);
      expect(
        c.renderSnapshot.geometry.targets['item\u0000bar']!.bounds.height,
        30,
      );
      expect(c.history.redo().status, 'committed');
      surface.paint(750);
      expect(
        c.renderSnapshot.geometry.targets['item\u0000bar']!.bounds.height,
        60,
      );
    });
  }
  test(
    'concrete overlays normalize values and reject malformed batches atomically',
    () async {
      final (c, _) = await mount([
        {
          'type': 'grid',
          'id': 'g',
          'cells': [
            [1, 1],
          ],
          'item': {
            'size': 100,
            'components': [
              {
                'type': 'bar',
                'id': 'b',
                'size': 20,
                'source': {'type': 'rect'},
              },
              {'type': 'text', 'id': 't', 'text': 'base'},
            ],
          },
        },
      ]);
      expect(
        c.update({
          'id': 'g.0.0',
          'text': {
            'changes': {'margin': 4},
          },
        }).status,
        'committed',
      );
      final overlay = c.renderSnapshot.overlays['g.0.0\u0000t']!;
      expect(overlay['margin'], {'top': 4, 'right': 4, 'bottom': 4, 'left': 4});
      final stamp = c.revisionStamp;
      expect(
        c.update({
          'id': 'g.0.0',
          'text': {
            'changes': {'placement': 'nonsense'},
          },
        }).status,
        'rejected',
      );
      expect(
        () => c.updateBatch({
          'targets': ['g.0.0', 'g.0.1'],
          'bar': {
            'height': [40, -1],
          },
        }),
        throwsA(isA<PatchMapException>()),
      );
      expect(
        c.update({
          'id': 'g.0.0',
          'text': {
            'text': 'a',
            'changes': {'text': 'b'},
          },
        }).status,
        'rejected',
      );
      expect(c.revisionStamp, stamp);
      expect(
        c.update({
          'id': 'g.0.0',
          'text': {
            'changes': {'margin': null},
          },
        }).status,
        'committed',
      );
      expect(c.renderSnapshot.overlays['g.0.0\u0000t'], isNull);
    },
  );
  test(
    'presentation counts requested identities and admits explicit paints',
    () async {
      final (c, _) = await fixtures.mounted();
      final scope = c.targets.query({'id': 'rect'});
      final layer = {
        'scope': scope,
        'targets': ['rect', 'missing'],
        'matched': {'alphaMultiplier': .5},
      };
      final result = c.presentation.set('dim', layer).toJson();
      expect(result['targetCount'], 2);
      expect(result['ignoredTargetCount'], 1);
      for (final invalid in [
        {
          'scope': scope,
          'targets': ['rect'],
        },
        {...layer, 'matched': null},
      ]) {
        expect(
          () => c.presentation.set('bad', invalid),
          throwsA(isA<PatchMapException>()),
        );
      }
      expect(
        () => c.presentation.clear(' '),
        throwsA(isA<PatchMapException>()),
      );
      expect(
        () => c.targets.query({'id': 3}),
        throwsA(isA<PatchMapException>()),
      );
      expect(
        () => c.targets.get(const PatchMapTarget('rect', componentId: '')),
        throwsA(isA<PatchMapException>()),
      );
    },
  );
  test(
    'fit follows alpha root exclusions, duplicate accounting and XYWH',
    () async {
      final (c, _) = await mount([
        {
          'id': 'r',
          'type': 'rect',
          'size': {'width': 20, 'height': 10},
          'attrs': {'x': -10, 'y': -5},
        },
        {'id': 'hidden', 'type': 'rect', 'show': false, 'size': 1000},
        {'id': 'image', 'type': 'image', 'source': 'asset:test', 'size': 1000},
      ]);
      final initial = c.viewport.fit().toJson();
      expect(initial['applied'], ['r']);
      expect(initial['excluded'], ['hidden', 'image']);
      expect(initial['worldBounds'], [-10, -5, 20, 10]);
      final duplicate = c.viewport.fit(targets: ['r', 'r', 'hidden']).toJson();
      expect(duplicate['applied'], ['r', 'r']);
      expect(duplicate['duplicateCount'], 1);
      expect(duplicate['missing'], ['hidden']);
    },
  );
  test(
    'replacement validates fit before publication and resolves old TargetSet',
    () async {
      final (c, _) = await fixtures.mounted();
      c.update({
        'id': 'rect',
        'changes': {'fill': '#abcdef'},
      });
      final stamp = c.revisionStamp,
          hash = c.dataset.semanticHash,
          history = c.history.state;
      expect(
        () => c.data.replace([], fit: {'padding': -1}),
        throwsA(isA<PatchMapException>()),
      );
      expect(c.revisionStamp, stamp);
      expect(c.dataset.semanticHash, hash);
      expect(c.history.state, history);
      final targets = c.targets.query({'id': 'rect'});
      c.data.replace(
        [
          {'type': 'rect', 'id': 'rect', 'size': 40},
        ],
        fit: {'targets': targets},
      );
      expect(c.viewport.snapshot()['centerWorld'], [20, 20]);
    },
  );
  test(
    'invalid viewport and empty fit preserve rotation; equivalent request stays quiet',
    () async {
      final (c, surface) = await fixtures.mounted();
      var settled = 0;
      c.viewport.onSettled((_) => settled++);
      await c.rotation.animateTo(0, durationMs: 0).finished;
      await Future<void>.delayed(const Duration(milliseconds: 120));
      expect(settled, 0);
      final animation = c.rotation.animateTo(90);
      expect(
        () => c.viewport.fit(padding: -1),
        throwsA(isA<PatchMapException>()),
      );
      expect(
        () => c.viewport.panBy([double.infinity, 0]),
        throwsA(isA<PatchMapException>()),
      );
      expect(c.viewport.fit(targets: []).status, 'empty');
      surface.paint(250);
      expect((await animation.finished).status, 'completed');
      c.rotation.set(.1);
      expect(
        (await c.rotation.animateTo(360.1, path: 'counterclockwise').finished)
            .status,
        'completed',
      );
      expect(c.rotation.value, .1);
      c.rotation.set(1e12);
      expect(
        () => c.rotation.animateTo(.1, path: 'clockwise'),
        throwsA(isA<PatchMapException>()),
      );
    },
  );
}
