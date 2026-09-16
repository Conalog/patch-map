import 'package:flutter_test/flutter_test.dart';
import 'package:conalog_patch_map/src/model/dataset.dart';
import 'package:conalog_patch_map/src/semantic/geometry/geometry.dart';
import 'package:conalog_patch_map/src/semantic/text/layout.dart';

void main() {
  test('text projection matches full geometry and preserves snapshots', () {
    final data = PatchMapDataset.parse([
      {
        'id': 'g',
        'type': 'grid',
        'attrs': {'angle': 17, 'scaleX': -1.2},
        'cells': [
          [1, 1],
        ],
        'gap': 4,
        'item': {
          'size': {'width': 40, 'height': 80},
          'padding': 3,
          'components': [
            {
              'id': 'bg',
              'type': 'background',
              'source': {'fill': 'white'},
            },
            {
              'id': 't',
              'type': 'text',
              'text': '12',
              'placement': 'center',
              'margin': 4,
              'style': {
                'fontSize': 'auto',
                'autoFont': {'min': 8, 'max': 14},
                'wordWrap': true,
                'wordWrapWidth': 'auto',
              },
            },
          ],
        },
      },
    ]);
    var previous = buildGeometry(data, textLayouter: layoutGeometryText);
    final retained = previous;
    final overlays = <String, JsonMap>{};
    for (final value in ['1234', '한글', '😀', '1', '']) {
      const key = 'g.0.0\u0000t';
      final projected = projectTextValues(previous, {
        key: value,
      }, layoutGeometryText)!;
      overlays[key] = {'text': value};
      final full = buildGeometry(
        data,
        overlays: overlays,
        textLayouter: layoutGeometryText,
      );
      for (final key in full.targets.keys) {
        final a = projected.targets[key]!.bounds, b = full.targets[key]!.bounds;
        expect(a.left, closeTo(b.left, 1e-8));
        expect(a.top, closeTo(b.top, 1e-8));
        expect(a.right, closeTo(b.right, 1e-8));
        expect(a.bottom, closeTo(b.bottom, 1e-8));
      }
      expect(projected.primitives.first, same(previous.primitives.first));
      expect(projected.topology, same(previous.topology));
      expect(() => projected.primitives.clear(), throwsUnsupportedError);
      previous = projected;
    }
    expect(
      retained.primitives.where((p) => p.type == 'text').first.value['text'],
      '12',
    );
    expect(
      projectTextValues(previous, {'missing': '1'}, layoutGeometryText),
      isNull,
    );
    expect(
      projectTextValues(previous, {
        'g.0.0\u0000t': 'x' * 200,
      }, layoutGeometryText),
      isNull,
    );
  });
}
