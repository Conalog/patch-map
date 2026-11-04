import 'dart:ui';

import 'package:conalog_patch_map/src/api/events.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/geometry/geometry_snapshot.dart';
import 'package:conalog_patch_map/src/interaction/input_query.dart';
import 'package:conalog_patch_map/src/interaction/selection_state.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, Object?> _item(String id) => {
  'type': 'item',
  'id': id,
  'size': 10,
  'components': [
    {'type': 'background', 'source': {}},
  ],
};

void main() {
  test(
    'unchanged selection reuses immutable projections and validates IDs',
    () {
      final h = _Harness();
      h.query.filter = (_) => false;
      final initial = h.selection.set(['a', 'b']).selected;
      for (final command in [h.selection.set, h.selection.add]) {
        final result = command(['a', 'a', 'b', 'absent', 'group', 'absent']);
        expect(result.selected, same(initial));
        expect(result.missing, ['absent', 'group']);
        expect(() => result.selected.clear(), throwsUnsupportedError);
        expect(() => result.missing.clear(), throwsUnsupportedError);
      }
      expect(h.selection.remove(['c']).selected, same(initial));
      expect(h.selection.toggle([]).selected, same(initial));
      expect(h.selection.selected, same(initial));
      expect(h.events, hasLength(1));
    },
  );

  test('same-set order changes silently; deltas retain selection order', () {
    final h = _Harness();
    final initial = h.selection.set(['a', 'b', 'c']).selected;
    final reordered = h.selection.set(['c', 'b', 'a']).selected;
    expect(reordered.map((object) => object.id), ['c', 'b', 'a']);
    expect(reordered.first, same(initial.last));
    expect(h.events, hasLength(1));
    final result = h.selection.set(['d', 'b', 'e']);
    final event = h.events.last;
    expect(result.selected.map((object) => object.id), ['d', 'b', 'e']);
    expect(event.added.map((object) => object.id), ['d', 'e']);
    expect(event.removed.map((object) => object.id), ['c', 'a']);
    expect(initial.map((object) => object.id), ['a', 'b', 'c']);
    expect(reordered.map((object) => object.id), ['c', 'b', 'a']);
    expect(() => event.removed.clear(), throwsUnsupportedError);
  });

  test(
    'first removal, middle toggle and end append reuse retained objects',
    () {
      final h = _Harness();
      final initial = h.selection.set(['a', 'b', 'c', 'd']).selected;
      final removed = h.selection.remove(['a']).selected;
      expect(removed.map((object) => object.id), ['b', 'c', 'd']);
      for (var i = 0; i < removed.length; i++) {
        expect(removed[i], same(initial[i + 1]));
      }
      final toggled = h.selection.toggle(['c']).selected;
      expect(toggled.map((object) => object.id), ['b', 'd']);
      expect(toggled.first, same(initial[1]));
      expect(toggled.last, same(initial[3]));
      final appended = h.selection.add(['e']).selected;
      expect(appended.map((object) => object.id), ['b', 'd', 'e']);
      expect(appended.first, same(initial[1]));
      expect(appended[1], same(initial[3]));
      expect(h.selection.selected, same(appended));
      expect(initial.map((object) => object.id), ['a', 'b', 'c', 'd']);
    },
  );

  test(
    'retained node mutation refreshes data while old snapshots stay fixed',
    () {
      final h = _Harness();
      final initial = h.selection.set(['a', 'b']).selected;
      final node = h.scene['a']!;
      final updated = Map<String, Object?>.unmodifiable({
        ...node.data,
        'show': false,
      });
      node.data = updated;
      final current = h.selection.set(['a', 'b']).selected;
      expect(current, isNot(same(initial)));
      expect(current.first.effectiveData, same(updated));
      expect(current.first.effectiveData['show'], false);
      expect(current.last, same(initial.last));
      expect(initial.first.effectiveData['show'], true);
      expect(h.events, hasLength(1));
      node.data = Map.unmodifiable({...updated, 'show': true});
      h.selection.remove(['a']);
      expect(h.events.last.removed.single.effectiveData['show'], true);
      expect(current.first.effectiveData['show'], false);
    },
  );

  test(
    'result and event snapshots survive reset and disposal in notification',
    () {
      final h = _Harness();
      h.onNotify = (event) {
        if (event.added.isNotEmpty) h.selection.reset();
      };
      final result = h.selection.set(['a', 'b']);
      expect(result.selected.map((object) => object.id), ['a', 'b']);
      expect(h.selection.selected, isEmpty);
      expect(h.events, hasLength(2));
      expect(h.events.first.objects.map((object) => object.id), ['a', 'b']);
      expect(h.events.last.removed.map((object) => object.id), ['a', 'b']);
      h.onNotify = (_) => h.selection.dispose();
      final disposed = h.selection.set(['c']);
      expect(disposed.selected.single.id, 'c');
      expect(h.selection.selected, isEmpty);
      expect(() => h.selection.add(['d']), throwsStateError);
    },
  );

  test('throwing notification leaves accepted state usable', () {
    final h = _Harness();
    h.onNotify = (_) => throw StateError('host callback');
    expect(() => h.selection.set(['a']), throwsStateError);
    expect(h.selection.selected.single.id, 'a');
    h.onNotify = null;
    h.selection.toggle(['a', 'b']);
    expect(h.selection.selected.single.id, 'b');
    expect(h.events.last.added.single.id, 'b');
    expect(h.events.last.removed.single.id, 'a');
  });
}

final class _Harness {
  _Harness() {
    scene = GeometrySnapshot.compile(
      const DatasetReader().read([
        for (final id in ['a', 'b', 'c', 'd', 'e']) _item(id),
        {'type': 'group', 'id': 'group', 'children': <Object?>[]},
      ]),
      (_, _) => const Size(4, 4),
    );
    query = InputQuery(
      ports: InputQueryPorts(getSpatialCandidates: (_, _) => const []),
    );
    selection = SelectionState(
      currentGeometry: () => scene,
      query: query,
      notify: (event) {
        events.add(event);
        onNotify?.call(event);
      },
    );
    addTearDown(selection.dispose);
  }

  late GeometrySnapshot scene;
  late final InputQuery query;
  late final SelectionState selection;
  final events = <PatchMapInputEvent>[];
  void Function(PatchMapInputEvent)? onNotify;
}
