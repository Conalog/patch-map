import 'dart:math';
import 'dart:ui';

import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/geometry/affine.dart';
import 'package:conalog_patch_map/src/geometry/geometry_snapshot.dart';
import 'package:conalog_patch_map/src/interaction/input_query.dart';
import 'package:flutter_test/flutter_test.dart';

GeometrySnapshot _scene({
  double scale = 1,
  double rotation = 0,
  bool show = true,
}) => GeometrySnapshot.compile(
  const DatasetReader().read([
    {
      'type': 'group',
      'id': 'group',
      'attrs': {'scaleX': scale, 'scaleY': scale * .5},
      'children': [
        {
          'type': 'item',
          'id': 'panel',
          'size': {'width': 40, 'height': 80},
          'attrs': {'rotation': rotation},
          'components': [
            {
              'type': 'background',
              'id': 'bg',
              'show': show,
              'source': {'type': 'rect', 'fill': 'gray'},
            },
          ],
        },
      ],
    },
  ]),
  (_, _) => Size.zero,
);
InputQuery _query({InputHitGeometryProvider? exact}) => InputQuery(
  ports: InputQueryPorts(
    getSpatialCandidates: (s, _) => s.paintSlots,
    exactGeometry: exact,
  ),
);

void main() {
  test(
    'background range agrees with exact geometry including fallback shapes',
    () {
      final random = Random(3476), query = _query();
      for (final scale in [1.0, -1.0, 1e-150, 1e150]) {
        for (final rotation in [0.0, .3]) {
          final scene = _scene(scale: scale, rotation: rotation),
              node = scene['panel']!;
          final quad = node.world.projectRect(Offset.zero & node.item!.size),
              bounds = quad.bounds;
          final boxes = [
            bounds,
            bounds.shift(Offset(bounds.width, 0)),
            Rect.fromLTRB(
              bounds.right,
              bounds.top,
              bounds.right,
              bounds.bottom,
            ),
            for (var i = 0; i < 25; i++)
              Rect.fromLTWH(
                bounds.left + bounds.width * (random.nextDouble() * 2 - 1),
                bounds.top + bounds.height * (random.nextDouble() * 2 - 1),
                bounds.width * random.nextDouble(),
                bounds.height * random.nextDouble(),
              ),
          ];
          for (final box in boxes) {
            for (final transform in [
              Affine.identity,
              Affine.fromAttrs({'rotation': .37}),
            ]) {
              final range = transform.projectRect(box);
              expect(
                query.range(scene, range, .2).map((o) => o.id).toList(),
                quad.intersects(range) ? ['panel'] : isEmpty,
              );
            }
          }
        }
      }
    },
  );
  test(
    'hidden background and exact geometry still control range membership',
    () {
      final query = _query(), visible = _scene(), hidden = _scene(show: false);
      final range = Affine.identity.projectRect(
        const Rect.fromLTWH(-1, -1, 100, 100),
      );
      expect(query.range(visible, range, 0).single.id, 'panel');
      expect(query.range(hidden, range, 0), isEmpty);
      var calls = 0;
      final exact = _query(
        exact: (_, _) => InputHitGeometry(
          contains: (_) => false,
          segmentEntry: (_, _) => null,
          intersects: (_) {
            calls++;
            return false;
          },
        ),
      );
      expect(exact.range(visible, range, 0), isEmpty);
      expect(calls, 1);
    },
  );
}
