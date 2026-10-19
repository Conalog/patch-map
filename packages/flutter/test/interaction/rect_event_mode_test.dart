import 'dart:ui';
import 'package:conalog_patch_map/src/api/target.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/geometry/affine.dart';
import 'package:conalog_patch_map/src/geometry/geometry_snapshot.dart';
import 'package:conalog_patch_map/src/interaction/input_query.dart';
import 'package:conalog_patch_map/src/interaction/selection_state.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, Object?> rect(String id, [String? eventMode]) => {
  'type': 'rect',
  'id': id,
  'size': 10,
  if (eventMode != null) 'eventMode': eventMode,
};
GeometrySnapshot scene(List<Object?> data) => GeometrySnapshot.compile(
  const DatasetReader().read(data),
  (_, _) => Size.zero,
);
InputQuery query() => InputQuery(
  ports: InputQueryPorts(
    getSpatialCandidates: (snapshot, _) =>
        List.generate(snapshot.nodes.length, (i) => i),
  ),
);
void main() {
  for (final mode in ['none', 'passive']) {
    test('rect $mode skips all input queries but allows direct selection', () {
      final snapshot = scene([rect('back'), rect('front', mode)]), q = query();
      final filtered = <String>[];
      q.filter = (object) {
        filtered.add(object.id);
        return true;
      };
      expect(q.point(snapshot, const Offset(5, 5), 0)!.id, 'back');
      expect(
        q
            .range(
              snapshot,
              Affine.identity.projectRect(const Rect.fromLTWH(0, 0, 10, 10)),
              0,
            )
            .map((o) => o.id),
        ['back'],
      );
      expect(
        q
            .segment(snapshot, const Offset(-1, 5), const Offset(11, 5), 0)
            .map((o) => o.id),
        ['back'],
      );
      expect(filtered, ['back', 'back', 'back']);
      q.filter = (_) => false;
      final selection = SelectionState(
        currentGeometry: () => snapshot,
        query: q,
        notify: (_) {},
      );
      expect(selection.set(['front']).selected.single.id, 'front');
      selection.dispose();
    });
  }
  test(
    'rect auto static dynamic and omitted modes preserve input eligibility',
    () {
      for (final mode in <String?>[null, 'auto', 'static', 'dynamic']) {
        final snapshot = scene([rect('rect', mode)]), q = query();
        expect(q.point(snapshot, const Offset(5, 5), 0)!.id, 'rect');
        expect(
          q
              .range(
                snapshot,
                Affine.identity.projectRect(const Rect.fromLTWH(0, 0, 10, 10)),
                0,
              )
              .single
              .id,
          'rect',
        );
        expect(
          q
              .segment(snapshot, const Offset(-1, 5), const Offset(11, 5), 0)
              .single
              .id,
          'rect',
        );
      }
    },
  );
  test(
    'effective eventMode update changes hit eligibility without clearing selection',
    () {
      var snapshot = scene([rect('rect', 'static')]);
      final q = query();
      final selection = SelectionState(
        currentGeometry: () => snapshot,
        query: q,
        notify: (_) {},
      );
      selection.set(['rect']);
      snapshot = snapshot.prepare({
        const PatchMapTarget('rect'): Map<String, Object?>.unmodifiable({
          ...snapshot['rect']!.data,
          'eventMode': 'none',
        }),
      }, (_, _) => Size.zero).snapshot;
      expect(q.point(snapshot, const Offset(5, 5), 0), isNull);
      expect(selection.selected.single.id, 'rect');
      expect(selection.selected.single.effectiveData['eventMode'], 'none');
      selection.dispose();
    },
  );
}
