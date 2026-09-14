import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:patch_map/src/api/values.dart';
import 'package:patch_map/src/engine/controller.dart';
import 'package:patch_map/src/engine/ports.dart';
import 'package:patch_map/src/model/dataset.dart';

class Surface implements PatchMapSurfacePort {
  late PatchMapController controller;
  bool accept = true;
  int frames = 0;
  PatchMapRenderSnapshot? prepared;
  void Function()? duringPrepare;
  @override
  bool prepare(PatchMapRenderSnapshot snapshot) {
    prepared = snapshot;
    duringPrepare?.call();
    return accept;
  }

  @override
  void requestFrame() {
    frames++;
  }

  @override
  Future<PatchMapCaptureResult> capture(
    PatchMapRenderSnapshot snapshot,
  ) async => PatchMapCaptureResult(
    dataUrl: 'data:image/png;base64,cG5n',
    size: [snapshot.viewport.width, snapshot.viewport.height],
  );
  @override
  Future<void> dispose() async {}
  void paint([double time = 0]) {
    controller.advanceFrame(time);
    controller.frameConfirmed(controller.revisions);
  }
}

List<JsonMap> scene() => [
  {
    'type': 'group',
    'id': 'group',
    'attrs': {'x': 20, 'y': 30},
    'children': [
      {
        'type': 'item',
        'id': 'item',
        'size': {'width': 60, 'height': 90},
        'components': [
          {
            'type': 'bar',
            'id': 'bar',
            'size': {'width': 20, 'height': 30},
            'source': {'type': 'rect', 'fill': '#123456'},
            'animation': false,
          },
        ],
      },
    ],
  },
  {
    'type': 'grid',
    'id': 'grid',
    'cells': [
      [1, 1],
    ],
    'item': {
      'size': {'width': 30, 'height': 60},
      'components': [
        {
          'type': 'bar',
          'id': 'bar',
          'size': {'width': 10, 'height': 20},
          'source': {'type': 'rect'},
          'animation': false,
        },
      ],
    },
  },
  {
    'type': 'rect',
    'id': 'rect',
    'size': {'width': 20, 'height': 10},
    'fill': '#000000',
  },
];
Future<(PatchMapController, Surface)> mounted({int historyLimit = 50}) async {
  final c = await PatchMapController.create(
    data: scene(),
    fit: false,
    historyLimit: historyLimit,
  );
  final surface = Surface()..controller = c;
  c.attach(surface);
  surface.paint();
  addTearDown(c.destroy);
  return (c, surface);
}

void main() {
  test(
    'policy inputs detach nested maps while preserving callback identity',
    () async {
      bool selectable(Object target) => true;
      final pointer = <String, dynamic>{
        'tooltip': {'pinOnContextMenu': true},
      };
      final selection = <String, dynamic>{
        'visual': {'color': '#123456'},
        'box': {
          'visual': {'fillAlpha': .3},
        },
        'isSelectable': selectable,
      };
      final c = await PatchMapController.create(
        pointerPolicy: pointer,
        selectionPolicy: selection,
        instanceId: 'policy-instance',
      );
      pointer['tooltip']['pinOnContextMenu'] = false;
      selection['visual']['color'] = '#ffffff';
      selection['box']['visual']['fillAlpha'] = .9;
      expect(c.pointerPolicy['tooltip']['pinOnContextMenu'], true);
      expect(c.selectionPolicy['visual']['color'], '#123456');
      expect(c.selectionPolicy['box']['visual']['fillAlpha'], .3);
      expect(identical(c.selectionPolicy['isSelectable'], selectable), true);
      expect(
        () => c.selectionPolicy['visual']['color'] = 'red',
        throwsUnsupportedError,
      );
      expect(c.debug.snapshot()['instanceId'], 'policy-instance');
      await c.destroy();
    },
  );
  test(
    'public exception preserves detached diagnostic fields and category hint',
    () {
      final diagnostic = <String, dynamic>{
        'code': 'INVALID_INPUT',
        'category': 'INVALID_INPUT',
        'operation': 'update',
        'recoverable': true,
        'logicalId': 'rect',
        'sanitizedAssetId': 'image-1',
        'sanitizedHash': 'fnv1a64:1234',
        'revisionStamp': {'sceneRevision': 2},
      };
      final error = PatchMapException.fromDiagnostic(diagnostic);
      diagnostic['revisionStamp']['sceneRevision'] = 99;
      expect(error.code, 'INVALID_INPUT');
      expect(error.operation, 'update');
      expect(error.recoverable, true);
      expect(
        error.hint,
        'Check the operation arguments and PatchMap input shape.',
      );
      expect(error.diagnostic, {
        'code': 'INVALID_INPUT',
        'category': 'INVALID_INPUT',
        'operation': 'update',
        'recoverable': true,
        'logicalId': 'rect',
        'sanitizedAssetId': 'image-1',
        'sanitizedHash': 'fnv1a64:1234',
        'revisionStamp': {'sceneRevision': 2},
      });
      expect(() => error.diagnostic!['code'] = 'OTHER', throwsUnsupportedError);
    },
  );

  test(
    'debug interaction mode stays independent of editor and counts pointer subscriptions',
    () async {
      final (c, _) = await mounted();
      final before = c.debug.snapshot()['resources']['subscriptions']['active'];
      final release = c.selection.onPointerChange((_) {});
      expect(
        c.debug.snapshot()['resources']['subscriptions']['active'],
        before + 1,
      );
      c.editor.execute({'type': 'enter-grid-edit', 'target': 'grid'});
      expect(c.editor.state['mode'], 'grid-edit');
      expect(c.debug.snapshot()['interaction']['mode'], 'select');
      release();
      expect(
        c.debug.snapshot()['resources']['subscriptions']['active'],
        before,
      );
    },
  );

  // v1 oracle: src/engine/event-hub.ts snapshot delivery and failure isolation.
  test(
    'callback failure and in-flight disposal preserve publication order',
    () async {
      final (c, _) = await mounted();
      final calls = <String>[];
      late void Function() removeSecond;
      final removeFirst = c.onChanged(() {
        calls.add('first');
        removeSecond();
        throw StateError('listener failed');
      });
      removeSecond = c.onChanged(() => calls.add('disposed'));
      final removeLast = c.onChanged(() => calls.add('last'));
      final removeHistory = c.history.onChange(
        (state) => calls.add('history:${state['cursor']}'),
      );
      expect(
        c.update({
          'id': 'rect',
          'changes': {'fill': '#ff0000'},
        }).status,
        'committed',
      );
      expect(calls, ['first', 'last', 'history:1']);
      final diagnostic = c.debug.snapshot()['lastCallbackFailure'] as Map;
      expect(diagnostic['code'], 'HOST_CALLBACK_FAILURE');
      expect(diagnostic.toString(), isNot(contains('listener failed')));
      expect(c.targets.get({'id': 'rect'})!.value['fill'], '#ff0000');
      removeFirst();
      removeSecond();
      removeLast();
      removeHistory();
      calls.clear();
      expect(
        c.update({
          'id': 'rect',
          'changes': {'fill': '#00ff00'},
        }).status,
        'committed',
      );
      expect(calls, isEmpty);
    },
  );
  test(
    'reentrant history mutation preserves detached event snapshots',
    () async {
      final (c, _) = await mounted();
      final calls = <String>[];
      var nested = false;
      c.history.onChange((state) {
        calls.add('a:${state['cursor']}');
        if (!nested) {
          nested = true;
          expect(
            c.update({
              'id': 'rect',
              'changes': {'fill': '#00ff00'},
            }).status,
            'committed',
          );
        }
      });
      c.history.onChange((state) => calls.add('b:${state['cursor']}'));
      expect(
        c.update({
          'id': 'rect',
          'changes': {'fill': '#ff0000'},
        }).status,
        'committed',
      );
      expect(calls, ['a:1', 'a:2', 'b:2', 'b:1']);
      expect(c.history.state['cursor'], 2);
      expect(c.targets.get({'id': 'rect'})!.value['fill'], '#00ff00');
    },
  );
  // v1 oracle: tests/integration/developer-api-workflows.test.ts public token reentry.
  test(
    'transform commit invalidates token before change callback and refused settlement',
    () async {
      final (c, surface) = await mounted();
      final session = c.transform.beginSession(
        targets: {'id': 'rect'},
        kind: 'move',
        actionId: 'drag',
      );
      session.preview({
        'kind': 'move',
        'delta': [8, 0],
      });
      final view = c.viewport.snapshot();
      var callbackObserved = false;
      final remove = c.onChanged(() {
        callbackObserved = true;
        expect(() => session.edgePan([359, 300], [4, 0]), throwsStateError);
      });
      expect(session.commit().status, 'committed');
      expect(callbackObserved, true);
      expect(c.viewport.snapshot(), view);
      remove();
      final refused = c.transform.beginSession(
        targets: {'id': 'rect'},
        kind: 'move',
        actionId: 'refused',
      );
      refused.preview({
        'kind': 'move',
        'delta': [4, 0],
      });
      surface.accept = false;
      expect(refused.commit().status, 'refused');
      expect(() => refused.commit(), throwsStateError);
    },
  );
  test(
    'typed bar view preserves tint and old snapshots on null height reset',
    () async {
      final (c, _) = await mounted();
      expect(
        c.update({
          'id': 'grid.0.0',
          'bar': {
            'changes': {'source': 'image.png'},
          },
        }).status,
        'committed',
      );
      expect(
        c.update({
          'id': 'grid.0.0',
          'bar': {
            'changes': {
              'source': {'type': 'rect', 'fill': '#000000'},
            },
          },
        }).status,
        'committed',
      );

      expect(
        c.update({
          'id': 'grid.0.0',
          'bar': {
            'changes': {'tint': '#123456'},
          },
        }).status,
        'committed',
      );
      expect(
        c.updateBatch({
          'targets': ['grid.0.0'],
          'bar': {
            'height': [33],
          },
        }, animate: false).status,
        'committed',
      );
      final previous = c.renderSnapshot.overlays['grid.0.0\u0000bar']!;
      expect(previous['size'], {'height': 33});
      expect(previous['tint'], '#123456');
      expect(
        c.updateBatch({
          'targets': ['grid.0.0'],
          'bar': {
            'height': [null],
          },
        }, animate: false).status,
        'committed',
      );
      final reset = c.renderSnapshot.overlays['grid.0.0\u0000bar']!;
      expect(reset['size'], {'height': 20});
      expect(reset['tint'], '#123456');
      expect(previous['size'], {'height': 33});
      expect(
        () => (previous['size'] as Map)['height'] = 9,
        throwsUnsupportedError,
      );
    },
  );
  test(
    'unfitted origin matches browser; view change reuses overlays',
    () async {
      final (c, _) = await mounted();
      expect(c.viewport.screenToWorld(0, 0), [0, 0]);
      final overlays = c.renderSnapshot.overlays;
      c.viewport.panBy([20, 10]);
      expect(identical(overlays, c.renderSnapshot.overlays), true);
      expect(c.viewport.worldToScreen(0, 0), [20, 10]);
    },
  );
  test(
    'nested update is detached and history restores semantic state',
    () async {
      final (c, _) = await mounted();
      final hash = c.dataset.semanticHash;
      final events = <String>[];
      c.history.onChange((_) => events.add('history'));
      c.onChanged(() => events.add('scene'));
      final input = <String, dynamic>{
            'id': 'item',
            'bar': {'height': 72},
          },
          saved = {
            'id': 'item',
            'bar': {'height': 72},
          };
      expect(c.update(input).status, 'committed');
      expect(input, saved);
      expect(
        c.targets.get({
          'id': 'item',
          'componentId': 'bar',
        })!.value['size']['height'],
        72,
      );
      expect(c.history.state['undoDepth'], 1);
      expect(events, ['scene', 'history']);
      expect(c.history.undo().status, 'committed');
      expect(c.dataset.semanticHash, hash);
      expect(c.history.redo().status, 'committed');
    },
  );
  test('refusal and reentrant prepare never publish a candidate', () async {
    final (c, surface) = await mounted();
    final hash = c.dataset.semanticHash;
    surface.accept = false;
    expect(
      c.update({
        'id': 'item',
        'bar': {'height': 52},
      }).status,
      'refused',
    );
    expect(c.dataset.semanticHash, hash);
    expect(c.history.state['depth'], 0);
    surface.accept = true;
    var once = false;
    surface.duringPrepare = () {
      if (!once) {
        once = true;
        c.viewport.panBy([1, 0]);
      }
    };
    expect(
      c.update({
        'id': 'item',
        'bar': {'height': 52},
      }).status,
      'refused',
    );
    expect(c.dataset.semanticHash, hash);
    expect(c.history.state['depth'], 0);
  });
  test(
    'typed columns and null overlay reset; missing last target is atomic',
    () async {
      final (c, _) = await mounted();
      final hash = c.dataset.semanticHash;
      expect(
        c.updateBatch({
          'targets': ['grid.0.0', 'grid.0.1'],
          'bar': {
            'height': Float64List.fromList([12, 42]),
          },
        }).status,
        'committed',
      );
      expect(c.dataset.semanticHash, hash);
      expect(c.history.state['depth'], 0);
      expect(c.instanceOverlays['grid.0.1\u0000bar']!['size']['height'], 42);
      expect(
        c.targets.get({
          'id': 'grid.0.1',
          'componentId': 'bar',
        })!.value['size']['height'],
        20,
      );
      final overlays = cloneJson(c.instanceOverlays);
      expect(
        () => c.updateBatch({
          'targets': ['grid.0.0', 'missing'],
          'bar': {
            'height': [22, 32],
          },
        }),
        throwsA(isA<PatchMapException>()),
      );
      expect(c.instanceOverlays, overlays);
      expect(
        c.update({
          'id': 'grid.0.0',
          'bar': {'height': null},
        }).status,
        'committed',
      );
      expect(c.instanceOverlays.containsKey('grid.0.0\u0000bar'), false);
    },
  );
  test(
    'stale and unequal columns throw; duplicate targets are rejected',
    () async {
      final (c, _) = await mounted();
      final targets = c.targets.query({'type': 'bar', 'scope': 'instances'});
      final duplicate = c.updateBatch({
        'targets': ['grid.0.0', 'grid.0.0'],
        'bar': {
          'height': [1, 2],
        },
      });
      expect(duplicate.status, 'rejected');
      expect((duplicate.diagnostic as Map)['code'], 'DUPLICATE_ID');
      c.update({
        'id': 'rect',
        'changes': {'fill': '#ff0000'},
      });
      for (final input in <JsonMap>[
        {
          'targets': targets,
          'bar': {
            'height': [1, 2],
          },
        },
        {
          'targets': ['grid.0.0'],
          'bar': {
            'height': [1, 2],
          },
        },
      ]) {
        expect(() => c.updateBatch(input), throwsA(isA<PatchMapException>()));
      }
    },
  );
  test(
    'history coalescing capacity and refused undo preserve cursor',
    () async {
      final (c, surface) = await mounted(historyLimit: 2);
      for (final x in [1, 2]) {
        c.update({
          'id': 'rect',
          'changes': {
            'attrs': {'x': x},
          },
        }, actionId: 'drag');
      }
      expect(c.history.state['depth'], 1);
      for (final x in [3, 4]) {
        c.update({
          'id': 'rect',
          'changes': {
            'attrs': {'x': x},
          },
        }, actionId: 'step$x');
      }
      expect(c.history.state['depth'], 2);
      surface.accept = false;
      expect(c.history.undo().status, 'refused');
      expect(c.history.state['cursor'], 2);
      surface.accept = true;
      expect(c.history.undo().status, 'committed');
      expect(c.targets.get('rect')!.value['attrs']['x'], 3);
    },
  );
  test('transaction companion and selection follow undo redo', () async {
    final (c, _) = await mounted();
    c.selection.set('item');
    c.transaction(
      [
        {
          'type': 'update',
          'id': 'rect',
          'changes': {'fill': '#ff0000'},
        },
      ],
      selectedIds: ['rect'],
      companion: {'panel': 'edit'},
    );
    expect(c.selection.ids, ['rect']);
    expect(c.history.undo()['companion'], null);
    expect(c.selection.ids, ['item']);
    expect(c.history.redo()['companion'], {'panel': 'edit'});
    expect(c.selection.ids, ['rect']);
  });
  test('structural add replace move group ungroup remove', () async {
    final (c, _) = await mounted();
    expect(
      c.transaction([
        {
          'type': 'add',
          'parentId': null,
          'index': 3,
          'value': {'type': 'rect', 'id': 'added', 'size': 20},
        },
      ]).status,
      'committed',
    );
    expect(
      c.transaction([
        {
          'type': 'replace',
          'id': 'added',
          'value': {'type': 'rect', 'id': 'added', 'size': 30},
        },
      ]).status,
      'committed',
    );
    expect(
      c.transaction([
        {'type': 'move', 'id': 'added', 'parentId': 'group', 'index': 1},
      ]).status,
      'committed',
    );
    expect(
      c.transaction([
        {
          'type': 'group',
          'ids': ['item', 'added'],
          'value': {'type': 'group', 'id': 'nested'},
        },
      ]).status,
      'committed',
    );
    expect(
      c.transaction([
        {'type': 'ungroup', 'id': 'nested'},
      ]).status,
      'committed',
    );
    expect(
      c.transaction([
        {'type': 'remove', 'id': 'added'},
      ]).status,
      'committed',
    );
    expect(c.targets.get('added'), null);
  });
  test(
    'query order and grid cell public value follow npm logical API',
    () async {
      final (c, _) = await mounted();
      expect(c.targets.query().matches.map((m) => m.kind).toList(), [
        'element',
        'element',
        'element',
        'element',
        'element',
        'element',
        'component',
        'component',
        'component',
      ]);
      expect(c.targets.get({'id': 'grid', 'componentId': 'bar'}), null);
      expect(c.targets.get('grid.0.0')!.value, {
        'type': 'grid-cell',
        'id': 'grid.0.0',
        'gridId': 'grid',
        'row': 0,
        'column': 0,
        'value': 1,
        'show': true,
        'locked': false,
      });
    },
  );
  test(
    'bar uses 200ms cubic interpolation with committed destination',
    () async {
      final (c, surface) = await mounted();
      c.update({
        'id': 'grid.0.0',
        'bar': {'height': 60},
      }, animate: true);
      expect(
        c.renderSnapshot.overlays['grid.0.0\u0000bar']!['size']['height'],
        20,
      );
      surface.paint(100);
      expect(
        c.renderSnapshot.overlays['grid.0.0\u0000bar']!['size']['height'],
        55,
      );
      surface.paint(200);
      expect(
        c.renderSnapshot.overlays['grid.0.0\u0000bar']!['size']['height'],
        60,
      );
      expect(c.advanceFrame(300), false);
    },
  );
  test(
    'batch animation prepares its actual first frame and keeps old snapshots immutable',
    () async {
      final (c, surface) = await mounted();
      final old = c.renderSnapshot;
      final result = c.updateBatch({
        'targets': ['grid.0.0', 'grid.0.1'],
        'bar': {
          'height': Float64List.fromList([50, 40]),
        },
      }, animate: true);
      expect(result.status, 'committed');
      final first = c.renderSnapshot;
      expect(identical(first.geometry, surface.prepared!.geometry), true);
      expect(identical(first.geometry, c.renderSnapshot.geometry), true);
      expect(first.geometry.targets['grid.0.0\u0000bar']!.bounds.height, 20);
      c.advanceFrame(100);
      final middle = c.renderSnapshot;
      expect(
        middle.geometry.targets['grid.0.0\u0000bar']!.bounds.height,
        closeTo(46.25, 1e-9),
      );
      expect(old.geometry.targets['grid.0.0\u0000bar']!.bounds.height, 20);
      expect(first.overlays['grid.0.0\u0000bar']!['size']['height'], 20);
      expect(c.instanceOverlays['grid.0.0\u0000bar']!['size']['height'], 50);
      surface.accept = false;
      expect(
        c.updateBatch({
          'targets': ['grid.0.0'],
          'bar': {
            'height': [1],
          },
        }, animate: false).status,
        'refused',
      );
      expect(c.instanceOverlays['grid.0.0\u0000bar']!['size']['height'], 50);
      expect(
        c.renderSnapshot.geometry.targets['grid.0.0\u0000bar']!.bounds.height,
        closeTo(46.25, 1e-9),
      );
    },
  );
  test(
    'host failure rejects pending readiness and captures without hanging',
    () async {
      final c = await PatchMapController.create(data: scene(), fit: false);
      final ready = expectLater(c.ready, throwsA(isA<StateError>()));
      final capture = expectLater(c.capture.png(), throwsA(isA<StateError>()));
      c.surfaceFailed(StateError('asset decode failed'));
      await Future.wait([ready, capture]);
      await c.destroy();
    },
  );
  test(
    'initial viewport overrides fitting and honors declared zoom limits',
    () async {
      final c = await PatchMapController.create(
        data: scene(),
        fit: {'padding': 40},
        zoomLimits: [0.5, 2],
        viewportPolicy: {
          'initial': {
            'centerWorld': [7, 11],
            'scale': 3,
          },
          'wheel': {'activationModifier': 'control'},
        },
      );
      expect(c.viewport.snapshot(), {
        'centerWorld': [7.0, 11.0],
        'scale': 2.0,
      });
      expect(c.viewportPolicy['wheel']['activationModifier'], 'control');
      await c.destroy();
    },
  );
  test('rotation shortest path, completion and cancellation', () async {
    final (c, surface) = await mounted();
    surface.paint(1000);
    c.rotation.set(350);
    final animation = c.rotation.animateTo(
      10,
      path: 'shortest',
      durationMs: 200,
    );
    surface.paint(1100);
    expect(c.rotation.value, 367.5);
    surface.paint(1200);
    expect((await animation.finished).status, 'completed');
    expect(c.rotation.value, 370);
    final cancelled = c.rotation.animateTo(90);
    expect(cancelled.cancel(), true);
    expect(cancelled.cancel(), false);
    expect((await cancelled.finished).status, 'cancelled');
  });
  test(
    'rotation completion follows painted final frame and failure settles failed',
    () async {
      final (c, surface) = await mounted();
      var finished = false;
      final animation = c.rotation.animateTo(
        450,
        durationMs: 200,
        normalizeOnComplete: true,
      );
      animation.finished.then((_) => finished = true);
      c.advanceFrame(100);
      expect(c.rotation.value, 393.75);
      c.advanceFrame(200);
      expect(c.rotation.value, 450);
      await Future<void>.value();
      expect(finished, false);
      c.frameConfirmed(c.revisions);
      expect((await animation.finished).toJson(), {
        'status': 'completed',
        'angle': 90.0,
      });
      final failure = c.rotation.animateTo(0);
      c.surfaceFailed(StateError('frame failed'));
      expect((await failure.finished).status, 'failed');
      final interrupted = c.rotation.animateTo(180);
      c.viewport.panBy([0, 0]);
      expect((await interrupted.finished).status, 'cancelled');
      c.reducedMotion = true;
      expect((await c.rotation.animateTo(270).finished).status, 'completed');
      surface.paint(300);
    },
  );
  test(
    'visibility settles bars and cancels transient transforms and rotation',
    () async {
      final (c, _) = await mounted();
      c.updateBatch({
        'targets': ['grid.0.0'],
        'bar': {
          'height': [60],
        },
      }, animate: true);
      final rotation = c.rotation.animateTo(90);
      final session = c.transform.beginSession(
        targets: 'rect',
        kind: 'move',
        actionId: 'blur',
      );
      session.preview({
        'kind': 'move',
        'delta': [8, 12],
      });
      c.advanceFrame(50);
      c.surfaceVisibilityChanged(false, 50);
      expect((await rotation.finished).status, 'cancelled');
      expect(
        c.renderSnapshot.geometry.targets['grid.0.0\u0000bar']!.bounds.height,
        60,
      );
      expect(c.renderSnapshot.geometry.targets['rect']!.bounds.left, 0);
      expect(c.advanceFrame(5000), false);
      c.surfaceVisibilityChanged(true, 50);
      expect(
        c.renderSnapshot.geometry.targets['grid.0.0\u0000bar']!.bounds.height,
        60,
      );
      expect(c.renderSnapshot.geometry.targets['rect']!.bounds.left, 0);
    },
  );
  test('refused preview cannot become a committed transform', () async {
    final (c, surface) = await mounted();
    final session = c.transform.beginSession(
      targets: 'rect',
      kind: 'move',
      actionId: 'refused',
    );
    final stamp = c.revisionStamp;
    surface.accept = false;
    expect(
      session.preview({
        'kind': 'move',
        'delta': [9, 12],
      }).status,
      'refused',
    );
    expect(c.revisionStamp, stamp);
    surface.accept = true;
    expect(session.commit().changed, false);
    expect(c.dataset.nodes['rect']!.value['attrs'], isNull);
  });
  test('preview cancel preserves authored hash and history', () async {
    final (c, _) = await mounted();
    final hash = c.dataset.semanticHash;
    final session = c.transform.beginSession(
      targets: 'rect',
      kind: 'move',
      actionId: 'drag',
    );
    expect(
      session.preview({
        'kind': 'move',
        'delta': [8, 12],
      }).status,
      'previewed',
    );
    expect(c.dataset.semanticHash, hash);
    expect(c.history.state['depth'], 0);
    expect(session.cancel().status, 'cancelled');
    expect(c.instanceOverlays.isEmpty, true);
  });
  test('grid editor respects linked-cell conflict and resizes', () async {
    final (c, _) = await mounted();
    expect(
      c.editor.execute({
        'type': 'enter-grid-edit',
        'target': 'grid',
        'linkedCellIds': ['grid.0.0'],
      }).status,
      'committed',
    );
    expect(
      c.editor.execute({
        'type': 'set-grid-cell-active',
        'target': 'grid.0.0',
        'active': false,
        'actionId': 'cell',
      }).status,
      'rejected',
    );
    expect(
      c.editor.execute({
        'type': 'resize-grid',
        'target': 'grid',
        'rows': 2,
        'columns': 3,
        'gapX': 4,
        'gapY': 5,
        'actionId': 'resize',
      }).status,
      'committed',
    );
    expect(c.dataset.nodes['grid']!.value['cells'], [
      [1, 1, 0],
      [0, 0, 0],
    ]);
    expect(
      c.editor.execute({'type': 'exit-grid-edit', 'target': 'grid'}).status,
      'committed',
    );
  });
  test('destroy settles capture waiting on initial readiness', () async {
    final c = await PatchMapController.create(data: [], fit: false);
    final pending = c.capture.png();
    final failed = expectLater(pending, throwsA(isA<PatchMapException>()));
    await c.destroy();
    await failed;
    expect(await c.destroy(), false);
  });
  test(
    'capture waits matching publication and returns logical dimensions',
    () async {
      final (c, surface) = await mounted();
      expect((await c.capture.png()).size, [360, 640]);
      c.update({
        'id': 'rect',
        'changes': {'fill': '#ff0000'},
      });
      final capture = c.capture.png();
      await Future<void>.delayed(Duration.zero);
      surface.paint();
      expect((await capture).mime, 'image/png');
    },
  );
}
