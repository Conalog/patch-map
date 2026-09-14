import 'package:flutter_test/flutter_test.dart';
import 'package:patch_map/patch_map.dart';
import 'package:patch_map/src/engine/ports.dart';
import 'package:patch_map/src/semantic/geometry/primitives.dart';

typedef Json = Map<String, dynamic>;

class _Surface implements PatchMapSurfacePort {
  @override
  bool prepare(PatchMapRenderSnapshot snapshot) => true;
  @override
  void requestFrame() {}
  @override
  Future<void> dispose() async {}
  @override
  Future<PatchMapCaptureResult> capture(PatchMapRenderSnapshot snapshot) =>
      throw UnimplementedError('This semantic test does not exercise capture');
}

Future<PatchMapController> _mount(List<Json> data) async {
  final controller = await PatchMapController.create(data: data, fit: false);
  controller.attach(_Surface());
  controller.frameConfirmed(controller.revisions);
  return controller;
}

List<MapPoint> _quad(PatchMapController c, String id) =>
    c.renderSnapshot.geometry.targets[id]!.quad;
void _sameQuad(List<MapPoint> actual, List<MapPoint> expected) {
  expect(actual.length, expected.length);
  for (var i = 0; i < actual.length; i++) {
    expect(actual[i].x, closeTo(expected[i].x, 1e-8));
    expect(actual[i].y, closeTo(expected[i].y, 1e-8));
  }
}

void main() {
  test(
    'move group and ungroup preserve signed world affine and rotation channel',
    () async {
      final c = await _mount([
        {
          'id': 'a',
          'type': 'group',
          'attrs': {'x': 20, 'y': 30, 'angle': 90, 'scaleX': 2, 'scaleY': 2},
          'children': [
            {
              'id': 'r',
              'type': 'rect',
              'size': {'width': 20, 'height': 10},
              'attrs': {'x': 4, 'y': 5, 'rotation': 0.25, 'scaleX': -1},
            },
          ],
        },
        {
          'id': 'b',
          'type': 'group',
          'attrs': {
            'x': 140,
            'y': 80,
            'angle': -30,
            'scaleX': 1.5,
            'scaleY': 1.5,
          },
          'children': [
            {
              'id': 'q',
              'type': 'rect',
              'size': 12,
              'attrs': {'x': 5, 'y': 7},
            },
          ],
        },
      ]);
      addTearDown(c.destroy);
      final r = _quad(c, 'r'), q = _quad(c, 'q');
      expect(
        c.transaction([
          {'type': 'move', 'id': 'r', 'parentId': 'b', 'index': 0},
        ]).status,
        'committed',
      );
      _sameQuad(_quad(c, 'r'), r);
      final attrs =
          c.targets.get(const PatchMapTarget('r'))!.value['attrs'] as Map;
      expect(attrs.containsKey('rotation'), isTrue);
      expect(attrs.containsKey('angle'), isFalse);
      expect(
        c.transaction([
          {
            'type': 'group',
            'ids': ['q', 'r'],
            'value': {
              'id': 'g',
              'type': 'group',
              'attrs': {
                'x': 10,
                'y': 20,
                'angle': 15,
                'scaleX': 2,
                'scaleY': 2,
              },
            },
          },
        ]).status,
        'committed',
      );
      expect(c.selection.ids, ['g']);
      expect(
        (c.targets.get(const PatchMapTarget('g'))!.value['children'] as List)
            .map((v) => v['id']),
        ['r', 'q'],
      );
      _sameQuad(_quad(c, 'r'), r);
      _sameQuad(_quad(c, 'q'), q);
      expect(
        c.transaction([
          {'type': 'ungroup', 'id': 'g'},
        ]).status,
        'committed',
      );
      expect(c.selection.ids, ['r', 'q']);
      _sameQuad(_quad(c, 'r'), r);
      _sameQuad(_quad(c, 'q'), q);
      expect(c.history.undo().status, 'committed');
      expect(c.targets.get(const PatchMapTarget('g')), isNotNull);
      _sameQuad(_quad(c, 'r'), r);
      expect(c.history.redo().status, 'committed');
      expect(c.targets.get(const PatchMapTarget('g')), isNull);
    },
  );

  test(
    'same-parent move uses pre-removal insertion index and preserves no-op history',
    () async {
      final c = await _mount([
        for (final id in ['a', 'b', 'c', 'd'])
          {'id': id, 'type': 'rect', 'size': 10},
      ]);
      addTearDown(c.destroy);
      expect(
        c.transaction([
          {'type': 'move', 'id': 'a', 'parentId': null, 'index': 3},
        ]).status,
        'committed',
      );
      expect(c.data.snapshot().map((v) => v['id']), ['b', 'c', 'a', 'd']);
      final before = c.data.serialize(), history = c.history.state;
      expect(
        c.transaction([
          {'type': 'move', 'id': 'a', 'parentId': null, 'index': 3},
        ]).status,
        'unchanged',
      );
      expect(c.data.serialize(), before);
      expect(c.history.state, history);
      expect(
        c.transaction([
          {'type': 'move', 'id': 'a', 'parentId': null, 'index': 5},
        ]).status,
        'rejected',
      );
      expect(c.data.serialize(), before);
      expect(c.history.state, history);
    },
  );

  test(
    'relation policy and locked or skewed destinations reject atomically',
    () async {
      final c = await _mount([
        {
          'id': 'g',
          'type': 'group',
          'attrs': {'x': 20, 'angle': 90},
          'children': [
            {
              'id': 'x',
              'type': 'rect',
              'size': 10,
              'attrs': {'x': 5},
            },
          ],
        },
        {
          'id': 'z',
          'type': 'rect',
          'size': 10,
          'attrs': {'x': 100},
        },
        {
          'id': 'link',
          'type': 'relations',
          'links': [
            {'source': 'g', 'target': 'z'},
          ],
        },
        {
          'id': 'locked',
          'type': 'group',
          'locked': true,
          'children': [
            {'id': 'locked-child', 'type': 'rect', 'size': 10},
          ],
        },
        {
          'id': 'skew',
          'type': 'group',
          'attrs': {'angle': 45, 'scaleX': 2},
          'children': [],
        },
      ]);
      addTearDown(c.destroy);
      final before = c.data.serialize(), history = c.history.state;
      for (final operation in <Json>[
        {'type': 'ungroup', 'id': 'g'},
        {'type': 'move', 'id': 'locked-child', 'parentId': null, 'index': 0},
        {
          'type': 'add',
          'parentId': 'locked',
          'index': 0,
          'value': {'type': 'rect', 'id': 'new', 'size': 1},
        },
        {
          'type': 'group',
          'ids': ['locked-child'],
          'value': {'type': 'group', 'id': 'nested'},
        },
        {'type': 'ungroup', 'id': 'locked'},
        {'type': 'move', 'id': 'x', 'parentId': 'skew', 'index': 0},
      ]) {
        final result = c.transaction([operation]);
        expect(result.status, 'rejected', reason: operation.toString());
        expect((result.diagnostic as Map)['code'], 'CONFLICT');
        expect(c.data.serialize(), before);
        expect(c.history.state, history);
      }
      final world = _quad(c, 'x');
      expect(
        c.transaction([
          {'type': 'ungroup', 'id': 'g', 'relationPolicy': 'remove'},
        ]).status,
        'committed',
      );
      expect(c.targets.get(const PatchMapTarget('g')), isNull);
      expect(
        c.targets.get(const PatchMapTarget('link'))!.value['links'],
        isEmpty,
      );
      expect(c.selection.ids, ['x']);
      _sameQuad(_quad(c, 'x'), world);
      expect(c.history.undo().status, 'committed');
      expect(c.data.serialize(), before);
    },
  );
}
