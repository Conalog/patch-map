import 'package:flutter_test/flutter_test.dart';
import 'package:conalog_patch_map/src/model/dataset.dart';
import 'package:conalog_patch_map/src/semantic/geometry/geometry.dart';

void main() {
  test(
    'readable content removes reflections and flips around the owner anchor',
    () {
      final dataset = PatchMapDataset.parse([
        {
          'type': 'item',
          'id': 'i',
          'size': 100,
          'attrs': {'angle': 180},
          'components': [
            {
              'type': 'bar',
              'id': 'b',
              'size': {'width': 20, 'height': 30},
              'source': {},
              'placement': 'bottom',
            },
          ],
        },
      ]);
      final bar = buildGeometry(dataset).primitives.single;
      final upright = readableTransform(bar);
      expect(upright.a, closeTo(1, 1e-9));
      expect(upright.d, closeTo(1, 1e-9));
      final center = upright.project(10, 15);
      expect(center.x, closeTo(-50, 1e-9));
      expect(center.y, closeTo(-15, 1e-9));
      final mirrored = GeometryPrimitive(
        ownerId: 'm',
        componentId: 'icon',
        type: 'icon',
        value: {},
        localRect: const MapRect(0, 0, 10, 20),
        transform: MapAffine.authored(scaleX: -2),
        opacity: 1,
        visible: true,
        contentOrientation: 'upright',
      );
      final readable = readableTransform(mirrored);
      expect(readable.a, 2);
      expect(readable.d, 1);
      expect(readable.project(5, 10).x, -10);
      final camera = readableTransform(mirrored, worldRotation: 180);
      expect(camera.a, closeTo(-2, 1e-9));
      expect(camera.d, closeTo(-1, 1e-9));
    },
  );
  test(
    'relation stroke widths follow affine normals without becoming pointer targets',
    () {
      final dataset = PatchMapDataset.parse([
        {'type': 'item', 'id': 'a', 'size': 10, 'components': []},
        {
          'type': 'item',
          'id': 'b',
          'size': 10,
          'attrs': {'x': 100},
          'components': [],
        },
        {
          'type': 'relations',
          'id': 'r',
          'attrs': {'scaleX': 2, 'scaleY': 3},
          'links': [
            {'source': 'a', 'target': 'b'},
          ],
          'style': {'width': 2},
        },
      ]);
      final geometry = buildGeometry(dataset),
          relation = geometry.primitives.single;
      expect(relation.strokeWidths.single, closeTo(6, 1e-9));
      expect(geometry.targets['r']!.contains(50, 5), isTrue);
      expect(geometry.hitTest(50, 5), isNull);
      expect(geometry.hitTest(50, 5, includeComponents: true), isNull);
    },
  );
  test(
    'transforms preserve top-left origins, signed scale and nested affine',
    () {
      final dataset = PatchMapDataset.parse([
        {
          'type': 'group',
          'attrs': {'x': 10, 'y': 20, 'angle': 90},
          'children': [
            {
              'type': 'image',
              'id': 'im',
              'source': 'object',
              'size': {'width': 20, 'height': 10},
              'attrs': {'x': 5, 'scaleX': -2},
            },
          ],
        },
      ]);
      final geometry = buildGeometry(dataset);
      final q = geometry.primitives.single.quad;
      expect(q[0].x, closeTo(10, 1e-9));
      expect(q[0].y, closeTo(25, 1e-9));
      expect(q[1].x, closeTo(10, 1e-9));
      expect(q[1].y, closeTo(-15, 1e-9));
      expect(geometry.hitTest(5, 0)?.id, 'im');
    },
  );
  test(
    'scalar percentages use both content axes and named margins only anchor their axes',
    () {
      final dataset = PatchMapDataset.parse([
        {
          'type': 'item',
          'id': 'i',
          'size': {'width': 100, 'height': 200},
          'padding': 10,
          'components': [
            {
              'type': 'bar',
              'id': 'b',
              'source': {},
              'size': '50%',
              'margin': {'top': 9, 'left': 13, 'bottom': 7},
            },
          ],
        },
      ]);
      final bar = buildGeometry(dataset).primitives.single;
      expect(bar.localRect.width, 40);
      expect(bar.localRect.height, 90);
      expect(bar.transform.tx, 30);
      expect(bar.transform.ty, 93);
    },
  );
  test('stable hierarchical paint order keeps item descendants together', () {
    final dataset = PatchMapDataset.parse([
      {
        'type': 'item',
        'id': 'a',
        'size': 10,
        'components': [
          {
            'type': 'bar',
            'id': 'b',
            'source': {},
            'size': 1,
            'attrs': {'zIndex': 999},
          },
        ],
      },
      {'type': 'rect', 'id': 'b', 'size': 10},
    ]);
    expect(buildGeometry(dataset).primitives.map((p) => p.ownerId), ['a', 'b']);
  });
  test(
    'instance overlays update geometry without altering authored data or hashes',
    () {
      final dataset = PatchMapDataset.parse([
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
                'id': 'bar',
                'source': {},
                'size': {'width': 20, 'height': 50},
              },
            ],
          },
        },
      ]);
      final before = dataset.semanticHash;
      final geometry = buildGeometry(
        dataset,
        overlays: {
          'g.0.1\u0000bar': {'height': 80},
        },
      );
      expect(geometry.primitives.map((p) => p.localRect.height), [50, 80]);
      expect(dataset.semanticHash, before);
      expect(dataset.roots[0]['item']['components'][0]['size']['height'], 50);
    },
  );
  test(
    'relations resolve world centers, self loops and missing endpoint omission',
    () {
      final dataset = PatchMapDataset.parse([
        {
          'type': 'relations',
          'id': 'r',
          'links': [
            {'source': 'a', 'target': 'a'},
            {'source': 'a', 'target': 'missing'},
          ],
        },
        {
          'type': 'rect',
          'id': 'a',
          'size': 20,
          'attrs': {'x': 30, 'y': 40},
        },
      ]);
      final geometry = buildGeometry(dataset);
      final relation = geometry.primitives.first;
      expect(relation.type, 'relation');
      expect(relation.points.length, 5);
      expect(relation.points.first.x, 40);
      expect(relation.points.first.y, 40);
    },
  );
  test(
    'text geometry uses the semantic layout port and never silently approximates',
    () {
      final dataset = PatchMapDataset.parse([
        {'type': 'text', 'id': 't', 'text': '한😀', 'size': 100},
      ]);
      expect(() => buildGeometry(dataset), throwsStateError);
      final geometry = buildGeometry(
        dataset,
        textLayouter: (text, style, {frame, overflow, split = 0}) =>
            (width: 32, height: 20, layout: text),
      );
      expect(geometry.primitives.single.localRect.width, 32);
      expect(geometry.primitives.single.textLayout, '한😀');
    },
  );
}
