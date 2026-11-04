import 'dart:math' as math;
import 'dart:ui';

import 'package:conalog_patch_map/src/api/events.dart';
import 'package:conalog_patch_map/src/api/target.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/geometry/affine.dart';
import 'package:conalog_patch_map/src/geometry/geometry_snapshot.dart';
import 'package:conalog_patch_map/src/interaction/input_coordinator.dart';
import 'package:conalog_patch_map/src/interaction/input_query.dart';
import 'package:conalog_patch_map/src/viewport/camera.dart';
import 'package:flutter/gestures.dart' show kTouchSlop;
import 'package:flutter_test/flutter_test.dart';

Map<String, Object?> _item(String id, double x, {bool background = true}) => {
  'type': 'item',
  'id': id,
  'size': 10,
  'attrs': {'x': x},
  'components': [
    if (background) {'type': 'background', 'id': 'background', 'source': {}},
    {'type': 'text', 'id': 'text', 'text': '1'},
  ],
};
GeometrySnapshot _compile(List<Object?> data) => GeometrySnapshot.compile(
  const DatasetReader().read(data),
  (_, _) => const Size(4, 4),
);

void main() {
  test(
    'filter skips front rejected target; direct selection bypasses filter',
    () {
      final h = _Harness([_item('back', 0), _item('front', 0)]);
      h.input.query.filter = (object) => object.id != 'front';
      h.down(1, const Offset(5, 5));
      expect(h.events.single.target!.id, 'back');
      final result = h.input.selection.set(['front', 'missing']);
      expect(result.selected.single.id, 'front');
      expect(result.missing, ['missing']);
      expect(h.events.last.kind, PatchMapInputKind.selectionChange);
      expect(() => result.selected.clear(), throwsUnsupportedError);
      expect(
        () => h.events.first.target!.effectiveData['show'] = false,
        throwsUnsupportedError,
      );
      h.up(1, const Offset(5, 5));
      h.input.query.filter = (_) => throw StateError('judgment');
      h.input.hover(2, const Offset(5, 5), const Offset(105, 105));
      expect(h.events.last.target, isNull);
      expect(h.input.selection.selected.single.id, 'front');
    },
  );

  test(
    'paint resolves every raw segment then sends one cumulative move per frame',
    () {
      final h = _Harness([_item('a', 0), _item('b', 20), _item('c', 40)]);
      h.input.dragMode = PatchMapDragMode.paint;
      h.down(1, const Offset(-5, 5));
      h.move(1, const Offset(15, 5));
      h.move(1, const Offset(35, 5));
      h.move(1, const Offset(55, 5));
      expect(h.kinds, [PatchMapInputKind.down, PatchMapInputKind.dragStart]);
      expect(h.frames, 0);
      expect(h.notifications, 1);
      h.input.onFrame();
      expect(h.events.last.objects.map((value) => value.id), ['a', 'b', 'c']);
      expect(h.input.selection.selected, isEmpty);
      expect(() => h.events.last.objects.clear(), throwsUnsupportedError);
      h.move(1, const Offset(45, 5));
      h.up(1, const Offset(25, 5));
      expect(h.events.last.kind, PatchMapInputKind.dragEnd);
      expect(h.events.last.reason, PatchMapEndReason.completed);
      expect(h.events.last.objects.map((value) => value.id), ['a', 'b', 'c']);
      final count = h.events.length;
      h.input.onFrame();
      expect(h.events.length, count);
    },
  );

  test('only camera or selection changes demand paint during a drag', () {
    final h = _Harness([_item('a', 0)]);
    h.down(1, const Offset(5, 5));
    h.move(1, const Offset(10, 5));
    expect(h.frames, 1);
    expect(h.notifications, 0);
    h.input.onFrame();
    h.move(1, const Offset(10, 5));
    expect(h.frames, 1);
    expect(h.notifications, 1, reason: 'unchanged pan only notifies');
    h.move(1, const Offset(11, 5));
    expect(h.frames, 2, reason: 'later movement upgrades the pending frame');
    h.up(1, const Offset(11, 5));
    h.input.dragMode = PatchMapDragMode.range;
    h.down(2, const Offset(-10, -10));
    h.move(2, const Offset(20, 20));
    expect(h.frames, 2);
    expect(h.notifications, 2);
    h.extraNotify = (event) {
      if (event.kind == PatchMapInputKind.dragMove) {
        h.input.selection.set(event.objects.map((o) => o.id));
      }
    };
    h.input.onFrame();
    expect(h.input.selection.selected.single.id, 'a');
    expect(h.frames, 3, reason: 'callback selection change invalidates paint');
  });

  test('range result shrinks; mode remains latched until the next drag', () {
    final h = _Harness([_item('a', 0), _item('b', 20), _item('c', 40)]);
    h.input.dragMode = PatchMapDragMode.range;
    h.down(1, const Offset(-5, -5));
    h.move(1, const Offset(55, 15));
    h.input.onFrame();
    expect(h.events.last.objects.map((value) => value.id), ['c', 'b', 'a']);
    h.input.dragMode = PatchMapDragMode.paint;
    h.move(1, const Offset(15, 15));
    h.up(1, const Offset(15, 15));
    expect(h.events.last.mode, PatchMapDragMode.range);
    expect(h.events.last.objects.map((value) => value.id), ['a']);
    h.down(2, const Offset(-5, 5));
    h.move(2, const Offset(55, 5));
    h.input.cancel(PatchMapEndReason.cancelled);
    expect(h.events.last.mode, PatchMapDragMode.paint);
    expect(h.events.last.objects.length, 3);
  });

  test(
    'each raw move observes current publication and camera; frame preserves captured result',
    () {
      final h = _Harness([_item('a', 0), _item('b', 20)]);
      h.input.dragMode = PatchMapDragMode.paint;
      h.down(1, const Offset(-5, 5));
      h.move(1, const Offset(15, 5));
      final b = h.snapshot['b']!;
      h.snapshot = h.snapshot.prepare({
        const PatchMapTarget('b'): Map.unmodifiable({
          ...b.data,
          'attrs': const <String, Object?>{'x': 30},
        }),
      }, (_, _) => const Size(4, 4)).snapshot;
      h.camera.set(center: const Offset(10, 0));
      h.move(1, const Offset(35, 5)); // world45, sees b at30
      final captured = h.snapshot;
      h.snapshot = _compile([_item('replacement', 0)]);
      h.input.onFrame();
      expect(h.events.last.objects.map((value) => value.id), ['a', 'b']);
      expect(h.events.last.position!.world, const Offset(45, 5));
      expect(h.events.last.position!.global, const Offset(135, 105));
      expect(
        h.events.last.objects.last.effectiveData,
        same(captured['b']!.data),
      );
    },
  );

  test(
    'cancel includes pending result exactly once; permanent dispose emits no end',
    () {
      final h = _Harness([_item('a', 0)]);
      h.input.dragMode = PatchMapDragMode.paint;
      h.down(1, const Offset(-5, 5));
      h.move(1, const Offset(15, 5));
      h.input.cancel(PatchMapEndReason.inactive);
      expect(h.events.last.kind, PatchMapInputKind.dragEnd);
      expect(h.events.last.objects.single.id, 'a');
      expect(h.events.last.reason, PatchMapEndReason.inactive);
      h.input.cancel(PatchMapEndReason.cancelled);
      h.input.onFrame();
      expect(
        h.kinds.where((kind) => kind == PatchMapInputKind.dragEnd).length,
        1,
      );
      h.up(1, const Offset(15, 5));
      h.down(2, const Offset(-5, 5));
      h.move(2, const Offset(15, 5));
      final count = h.events.length;
      h.input.dispose();
      h.input.onFrame();
      h.up(2, const Offset(15, 5));
      expect(h.events.length, count);
    },
  );

  test(
    'second pointer ends raw drag; only multipointer scale can transform camera',
    () {
      final h = _Harness([_item('a', 0)]);
      h.down(1, const Offset(5, 5));
      h.move(1, const Offset(15, 5));
      expect(h.camera.center, const Offset(-10, 0));
      h.down(2, const Offset(20, 5));
      expect(h.events.last.reason, PatchMapEndReason.multitouch);
      h.move(1, const Offset(30, 5));
      expect(h.camera.center, const Offset(-10, 0));
      h.input.cameraGesture(
        pointerCount: 1,
        localAnchor: Offset.zero,
        scale: 2,
        rotation: .3,
      );
      expect(h.camera.scale, 1);
      h.input.cameraGesture(
        pointerCount: 2,
        localAnchor: Offset.zero,
        scale: 2,
        rotation: .3,
      );
      expect(h.camera.scale, 2);
      expect(h.camera.rotation, .3);
      h.up(2, const Offset(20, 5));
      h.move(1, const Offset(40, 5));
      expect(h.camera.scale, 2);
      expect(h.input.isDragging, isFalse);
    },
  );

  test(
    'recognizers classify tap double tap long press without implicit actions',
    () {
      final h = _Harness([_item('a', 0)]);
      h.down(1, const Offset(5, 5));
      h.up(1, const Offset(5, 5));
      h.input.recognizedTap();
      h.input.recognizedDoubleTap();
      h.input.recognizedLongPress();
      expect(h.kinds, [
        PatchMapInputKind.down,
        PatchMapInputKind.up,
        PatchMapInputKind.tap,
        PatchMapInputKind.doubleTap,
        PatchMapInputKind.longPress,
      ]);
      expect(h.events.every((event) => event.target?.id == 'a'), isTrue);
      expect(h.input.selection.selected, isEmpty);
      expect(h.camera.scale, 1);
    },
  );

  test('secondary click is recognized without starting a camera drag', () {
    final h = _Harness([_item('a', 0)]);
    h.input.pointerDown(
      1,
      const Offset(5, 5),
      const Offset(105, 105),
      buttons: 2,
    );
    h.move(1, const Offset(30, 5));
    h.input.recognizedSecondaryTap(epoch: h.input.inputEpoch);
    expect(h.events.last.kind, PatchMapInputKind.secondaryTap);
    expect(h.events.last.target!.id, 'a');
    expect(h.input.isDragging, isFalse);
    expect(h.camera.center, Offset.zero);
  });

  test('reset and multitouch invalidate delayed recognizer callbacks', () {
    final h = _Harness([_item('a', 0)]);
    h.down(1, const Offset(5, 5));
    final epoch = h.input.inputEpoch;
    h.up(1, const Offset(5, 5));
    h.input.reset();
    final count = h.events.length;
    h.input.recognizedTap(epoch: epoch);
    h.input.recognizedDoubleTap(epoch: epoch);
    expect(h.events.length, count);
    h.down(2, const Offset(5, 5));
    final longPressEpoch = h.input.inputEpoch;
    h.down(3, const Offset(15, 5));
    h.up(3, const Offset(15, 5));
    final beforeLongPress = h.events.length;
    h.input.recognizedLongPress(epoch: longPressEpoch);
    expect(h.events.length, beforeLongPress);
  });

  test(
    'callback failures and reentrant reset cannot resurrect pending drag',
    () {
      final h = _Harness([_item('a', 0)]);
      h.extraNotify = (event) {
        if (event.kind == PatchMapInputKind.dragStart) {
          h.input.reset();
          throw StateError('host');
        }
      };
      h.down(1, const Offset(5, 5));
      h.move(1, const Offset(15, 5));
      expect(h.input.isDragging, isFalse);
      expect(h.events.last.kind, PatchMapInputKind.dragEnd);
      expect(h.events.last.reason, PatchMapEndReason.replaced);
      expect(h.frames, 0);
      h.input.onFrame();
      expect(h.events.last.kind, PatchMapInputKind.dragEnd);
    },
  );

  for (final mode in [PatchMapDragMode.paint, PatchMapDragMode.range]) {
    test('$mode keeps raw-sample rotation across dragStart callbacks', () {
      final h = _Harness([
        {
          'type': 'item',
          'id': 'i',
          'size': 100,
          'contentOrientation': 'upright',
          'components': [
            {
              'type': 'bar',
              'source': {},
              'size': {'width': 80, 'height': 10},
              'placement': 'bottom',
            },
          ],
        },
      ]);
      addTearDown(h.input.dispose);
      h.input.dragMode = mode;
      h.extraNotify = (event) {
        if (event.kind == PatchMapInputKind.dragStart) {
          h.camera.set(rotation: math.pi);
        }
      };
      h.down(1, const Offset(0, 94));
      h.move(1, const Offset(30, 96));
      h.input.onFrame();
      final move = h.events.last;
      expect(move.kind, PatchMapInputKind.dragMove);
      expect(move.position!.world, const Offset(30, 96));
      expect(h.camera.rotation, math.pi);
      expect(move.objects.map((object) => object.id), ['i']);
    });
  }

  test('pan fast path does no per-move search and kTouchSlop is default', () {
    final h = _Harness([_item('a', 0)], slop: null);
    expect(h.input.dragSlop, kTouchSlop);
    h.down(1, const Offset(5, 5));
    final searches = h.searches;
    h.move(1, Offset(5 + kTouchSlop, 5));
    expect(h.input.isDragging, isFalse);
    h.move(1, Offset(6 + kTouchSlop, 5));
    h.move(1, const Offset(100, 5));
    expect(h.searches, searches);
    expect(h.input.isDragging, isTrue);
    expect(h.camera.center.dx, -95 + kTouchSlop);
    h.input.onFrame();
    expect(h.events.last.kind, PatchMapInputKind.dragMove);
  });

  test(
    'single selection owner preserves selection on updates and clears on reset',
    () {
      final h = _Harness([_item('a', 0), _item('b', 20)]);
      h.input.selection.set(['a']);
      h.input.selection.add(['b']);
      h.input.selection.toggle(['a']);
      expect(h.input.selection.selected.map((value) => value.id), ['b']);
      final b = h.snapshot['b']!;
      h.snapshot = h.snapshot.prepare({
        const PatchMapTarget('b'): Map.unmodifiable({...b.data, 'show': false}),
      }, (_, _) => const Size(4, 4)).snapshot;
      expect(h.input.selection.selected.single.effectiveData['show'], false);
      h.input.reset();
      expect(h.input.selection.selected, isEmpty);
      expect(h.events.last.removed.single.id, 'b');
    },
  );

  test(
    'backgroundless items use readable component intersections and clip bars',
    () {
      final h = _Harness([
        _item('bare', 0, background: false),
        {
          'type': 'item',
          'id': 'bar',
          'size': 10,
          'attrs': {'x': 20},
          'components': [
            {'type': 'bar', 'source': {}, 'size': 100},
          ],
        },
      ]);
      expect(h.input.query.point(h.snapshot, const Offset(.5, .5), 0), isNull);
      expect(
        h.input.query.point(h.snapshot, const Offset(5, 5), 0)!.id,
        'bare',
      );
      expect(
        h.input.query.point(h.snapshot, const Offset(25, 5), 0)!.id,
        'bar',
      );
      expect(h.input.query.point(h.snapshot, const Offset(45, 5), 0), isNull);
      final result = h.input.query.segment(
        h.snapshot,
        const Offset(15, 5),
        const Offset(35, 5),
        0,
      );
      expect(result.map((value) => value.id), ['bar']);
    },
  );

  test('clipped bar hit remains finite when naive cross products overflow', () {
    final snapshot = _compile([
      {
        'type': 'item',
        'id': 'large',
        'size': 1e150,
        'attrs': {'scaleX': 1e75, 'scaleY': 1e75},
        'components': [
          {'type': 'bar', 'source': {}, 'size': 1e150},
        ],
      },
    ]);
    final query = InputQuery(
      ports: InputQueryPorts(getSpatialCandidates: (_, _) => [0]),
    );
    expect(query.point(snapshot, const Offset(5e224, 5e224), 0)!.id, 'large');
    expect(query.point(snapshot, const Offset(2e225, 5e224), 0), isNull);
  });

  test(
    'standalone rotated text uses local measured bounds; grid data identifies cell',
    () {
      final h = _Harness([
        {
          'type': 'text',
          'id': 'text',
          'text': 'a',
          'attrs': {'x': 10, 'angle': 45},
        },
        {
          'type': 'grid',
          'id': 'grid',
          'attrs': {'x': 40},
          'cells': [
            [1],
          ],
          'item': {
            'size': 10,
            'components': [
              {'type': 'background', 'source': {}},
            ],
          },
        },
      ]);
      final text = h.snapshot['text']!;
      final inside = text.world.project(const Offset(2, 2));
      expect(h.input.query.point(h.snapshot, inside, 0)!.id, 'text');
      expect(h.input.query.point(h.snapshot, const Offset(7.3, .1), 0), isNull);
      final cell = h.input.query.point(h.snapshot, const Offset(45, 5), 0)!;
      expect(
        [cell.id, cell.gridId, cell.row, cell.column],
        ['grid.0.0', 'grid', 0, 0],
      );
      h.camera.set(rotation: math.pi / 2);
      final local = h.camera.worldToLocal(const Offset(45, 5));
      h.input.hover(3, local, local + const Offset(100, 100));
      expect(h.events.last.target!.id, 'grid.0.0');
      expect(
        (h.events.last.position!.world - const Offset(45, 5)).distance,
        lessThan(1e-10),
      );
    },
  );

  test(
    'spatial port visits only local candidates and relation shapes use explicit port',
    () {
      final snapshot = _compile([
        {'type': 'relations', 'id': 'relations', 'links': []},
        _item('item', 100),
      ]);
      var calls = 0;
      final shape = Affine.identity.projectRect(
        const Rect.fromLTWH(0, 0, 10, 2),
      );
      final query = InputQuery(
        ports: InputQueryPorts(
          getSpatialCandidates: (_, _) {
            calls++;
            return [0];
          },
          exactGeometry: (_, node) => node.id == 'relations'
              ? InputHitGeometry(
                  contains: shape.contains,
                  segmentEntry: shape.segmentEntry,
                  intersects: shape.intersects,
                )
              : null,
        ),
      );
      expect(query.point(snapshot, const Offset(5, 1), 0)!.id, 'relations');
      expect(calls, 1);
    },
  );
  test('delayed recognition retains raw input target and all coordinates', () {
    final h = _Harness([_item('a', 0), _item('b', 50)]);
    const local = Offset(5, 5), global = Offset(105, 105);
    h.down(1, local);
    final epoch = h.input.inputEpoch;
    h.up(1, local);
    h.camera.set(center: const Offset(50, 0));
    h.snapshot = _compile([_item('replacement', 50)]);
    final searches = h.searches;
    for (final recognize in [
      h.input.recognizedTap,
      h.input.recognizedDoubleTap,
      h.input.recognizedLongPress,
    ]) {
      recognize(epoch: epoch);
      expect(h.events.last.target!.id, 'a');
      expect(h.events.last.position!.world, local);
      expect(h.events.last.position!.local, local);
      expect(h.events.last.position!.global, global);
    }
    expect(h.searches, searches);
  });

  test(
    'point range use item size prefilter while paint retains text overflow',
    () {
      final h = _Harness([
        _item('bare', 0, background: false),
      ], textSize: const Size(20, 20));
      expect(
        h.input.query
            .segment(h.snapshot, const Offset(-4, 5), const Offset(-1, 5), 0)
            .map((value) => value.id),
        ['bare'],
      );
      expect(h.input.query.point(h.snapshot, const Offset(-2, 5), 0), isNull);
      expect(
        h.input.query.range(
          h.snapshot,
          Affine.identity.projectRect(const Rect.fromLTWH(-4, 2, 2, 6)),
          0,
        ),
        isEmpty,
      );
      final zero = _Harness([
        {..._item('zero', 0, background: false), 'size': 0},
      ], textSize: const Size(20, 20));
      expect(
        zero.input.query.point(zero.snapshot, const Offset(-2, 5), 0)!.id,
        'zero',
      );
    },
  );

  test('cancel reentry blocks subsequent wheel and scale camera mutations', () {
    for (final operation in ['wheel', 'scale']) {
      for (final action in ['inactive', 'dispose', 'epoch']) {
        final h = _Harness([_item('a', 0)]);
        h.down(1, const Offset(5, 5));
        h.move(1, const Offset(10, 5));
        final center = h.camera.center;
        h.extraNotify = (event) {
          if (event.kind != PatchMapInputKind.dragEnd) return;
          switch (action) {
            case 'inactive':
              h.input.setActive(false);
            case 'dispose':
              h.input.dispose();
            case 'epoch':
              h.input.reset();
          }
        };
        if (operation == 'wheel') {
          h.input.wheel(localAnchor: Offset.zero, scaleFactor: 2);
        } else {
          h.input.cameraGesture(
            pointerCount: 2,
            localAnchor: Offset.zero,
            scale: 2,
            rotation: .5,
          );
        }
        expect(h.camera.scale, 1, reason: '$operation/$action');
        expect(h.camera.rotation, 0, reason: '$operation/$action');
        expect(h.camera.center, center, reason: '$operation/$action');
      }
    }
  });

  test(
    'relation exact port rejects diagonal envelope false positives for every query',
    () {
      final snapshot = _compile([
        {'type': 'rect', 'id': 'a', 'size': 10},
        {
          'type': 'rect',
          'id': 'b',
          'size': 10,
          'attrs': {'x': 100, 'y': 100},
        },
        {
          'type': 'relations',
          'id': 'r',
          'links': [
            {'source': 'a', 'target': 'b'},
          ],
          'style': {'width': 10, 'cap': 'round'},
        },
      ]);
      final relation = snapshot.relationFor('r')!;
      final exact = InputHitGeometry(
        contains: relation.contains,
        segmentEntry: relation.segmentEntry,
        intersects: relation.intersects,
      );
      final query = InputQuery(
        ports: InputQueryPorts(
          getSpatialCandidates: (_, _) => [2],
          exactGeometry: (_, _) => exact,
        ),
      );
      expect(relation.paintBounds!.contains(const Offset(10, 100)), isTrue);
      expect(query.point(snapshot, const Offset(10, 100), 0), isNull);
      expect(
        query.range(
          snapshot,
          Affine.identity.projectRect(const Rect.fromLTWH(9, 99, 1, 1)),
          0,
        ),
        isEmpty,
      );
      expect(
        query.segment(snapshot, const Offset(9, 99), const Offset(10, 100), 0),
        isEmpty,
      );
      expect(query.point(snapshot, const Offset(50, 50), 0)!.id, 'r');
      expect(
        query
            .segment(snapshot, const Offset(0, 50), const Offset(100, 50), 0)
            .single
            .id,
        'r',
      );
    },
  );
}

final class _Harness {
  _Harness(
    List<Object?> data, {
    double? slop = 0,
    Size textSize = const Size(4, 4),
  }) {
    snapshot = GeometrySnapshot.compile(
      const DatasetReader().read(data),
      (_, _) => textSize,
    );
    input = InputCoordinator(
      currentGeometry: () => snapshot,
      camera: camera,
      getSpatialCandidates: (snapshot, bounds) {
        searches++;
        return List.generate(snapshot.nodes.length, (index) => index);
      },
      notify: (event) {
        events.add(event);
        extraNotify?.call(event);
      },
      onNeedFrame: () => frames++,
      onNeedNotification: () => notifications++,
      dragSlop: slop ?? kTouchSlop,
    );
  }
  late GeometrySnapshot snapshot;
  final camera = MapCamera();
  late final InputCoordinator input;
  final events = <PatchMapInputEvent>[];
  void Function(PatchMapInputEvent)? extraNotify;
  int frames = 0, notifications = 0, searches = 0;
  List<PatchMapInputKind> get kinds =>
      events.map((event) => event.kind).toList();
  void down(int id, Offset p) =>
      input.pointerDown(id, p, p + const Offset(100, 100));
  void move(int id, Offset p) =>
      input.pointerMove(id, p, p + const Offset(100, 100));
  void up(int id, Offset p) =>
      input.pointerUp(id, p, p + const Offset(100, 100));
}
