import 'package:flutter_test/flutter_test.dart';
import 'package:conalog_patch_map/src/engine/controller.dart';
import 'package:conalog_patch_map/src/semantic/geometry/geometry.dart';
import 'controller_test.dart' as fixtures;

void main() {
  test(
    'icon alias batches preserve full projection, reset and refusal',
    () async {
      final c = await PatchMapController.create(
        data: [
          {
            'id': 'g',
            'type': 'grid',
            'cells': [
              [1, 1],
            ],
            'attrs': {'angle': 27},
            'item': {
              'size': {'width': 40, 'height': 80},
              'components': [
                {'id': 'icon', 'type': 'icon', 'size': 20, 'source': 'object'},
                {
                  'id': 'bar',
                  'type': 'bar',
                  'size': {'width': 20, 'height': 20},
                  'source': {'fill': 'blue'},
                },
              ],
            },
          },
        ],
        fit: false,
      );
      final surface = fixtures.Surface()..controller = c;
      c.attach(surface);
      surface.paint();
      addTearDown(c.destroy);
      final initial = c.renderSnapshot.geometry;
      Map<String, dynamic> batch(List<Object?> sources) => {
        'targets': ['g.0.0', 'g.0.1'],
        'icon': {
          'componentId': 'icon',
          'changes': {'source': sources},
        },
      };
      for (final sources in [
        <Object?>['loading', 'loading'],
        [null, 'object'],
        ['object', null],
      ]) {
        expect(
          c.updateBatch(batch(sources), recordHistory: false).status,
          'committed',
        );
        final projected = c.renderSnapshot.geometry;
        final full = buildGeometry(c.dataset, overlays: c.instanceOverlays);
        expect(
          projected.primitives.map((p) => p.value),
          full.primitives.map((p) => p.value),
        );
        for (final key in full.targets.keys) {
          final a = projected.targets[key]!.bounds,
              b = full.targets[key]!.bounds;
          expect(
            [a.left, a.top, a.right, a.bottom],
            [b.left, b.top, b.right, b.bottom],
          );
        }
        expect(
          projected.primitives.where((p) => p.type == 'bar').first,
          same(initial.primitives.where((p) => p.type == 'bar').first),
        );
      }
      expect(initial.primitives.first.value['source'], 'object');
      final before = c.instanceOverlays;
      surface.accept = false;
      expect(c.updateBatch(batch(['loading', 'loading'])).status, 'refused');
      expect(c.instanceOverlays, before);
      surface.accept = true;
      // Malformed source uses ordinary admission and cannot partially commit.
      expect(c.updateBatch(batch(['loading', 42])).status, 'rejected');
      expect(c.instanceOverlays, before);
      expect(c.history.state['depth'], 0);
    },
  );
}
