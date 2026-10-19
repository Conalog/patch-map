import 'dart:typed_data';
import 'dart:ui';

import 'package:conalog_patch_map/src/dataset/colors.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/geometry/geometry_snapshot.dart';
import 'package:conalog_patch_map/src/geometry/relation_geometry.dart';
import 'package:conalog_patch_map/src/rendering/relation_paint.dart';
import 'package:flutter_test/flutter_test.dart';

GeometrySnapshot scene(
  Map<String, Object?> style, {
  bool self = false,
  bool hidden = false,
}) => GeometrySnapshot.compile(
  const DatasetReader().read([
    {'type': 'rect', 'id': 'a', 'size': 10, 'show': !hidden},
    {
      'type': 'rect',
      'id': 'b',
      'size': 10,
      'attrs': {'x': 30},
    },
    {
      'type': 'relations',
      'id': 'r',
      'style': style,
      'links': [
        {'source': 'a', 'target': self ? 'a' : 'b'},
      ],
    },
  ]),
  (_, _) => Size.zero,
);

Future<ByteData> pixels(RelationPaint paint) async {
  final recorder = PictureRecorder();
  final canvas = Canvas(recorder)..translate(10, 20);
  paint.paint(canvas);
  final picture = recorder.endRecording();
  final image = await picture.toImage(64, 64);
  try {
    return (await image.toByteData(format: ImageByteFormat.rawStraightRgba))!;
  } finally {
    image.dispose();
    picture.dispose();
  }
}

List<int> pixel(ByteData data, int x, int y) => [
  for (var c = 0; c < 4; c++) data.getUint8((y * 64 + x) * 4 + c),
];

void main() {
  testWidgets(
    'native straight stroke preserves alpha and butt endpoint extents',
    (tester) async {
      final snapshot = scene({'width': 4, 'color': '#ff000080', 'alpha': .5});
      final geometry = RelationGeometry.compile(snapshot, snapshot['r']!);
      final paint = RelationPaint(
        geometry,
        snapshot['r']!.data,
        ColorResolver(),
        .5,
      );
      final data = await tester.runAsync(() => pixels(paint));
      expect(pixel(data!, 25, 25), [255, 0, 0, 32]);
      expect(pixel(data, 14, 25), [0, 0, 0, 0]);
      expect(pixel(data, 45, 25), [0, 0, 0, 0]);
      expect(pixel(data, 25, 22), [0, 0, 0, 0]);
    },
  );

  testWidgets('native square and round caps match shared exact hit shape', (
    tester,
  ) async {
    for (final cap in ['round', 'square']) {
      final snapshot = scene({'width': 8, 'color': '#00ff00', 'cap': cap});
      final geometry = RelationGeometry.compile(snapshot, snapshot['r']!);
      final paint = RelationPaint(
        geometry,
        snapshot['r']!.data,
        ColorResolver(),
        1,
      );
      final data = await tester.runAsync(() => pixels(paint));
      expect(pixel(data!, 11, 21)[3], cap == 'round' ? 0 : 255);
      expect(geometry.contains(const Offset(1.5, 1.5)), cap != 'round');
      expect(pixel(data, 11, 25)[3], greaterThan(200));
      expect(geometry.contains(const Offset(1.5, 5.5)), isTrue);
    }
  });

  testWidgets(
    'self-link is five-point polyline and hidden endpoint paints nothing',
    (tester) async {
      final snapshot = scene({'width': 2, 'color': '#0000ff'}, self: true);
      final geometry = RelationGeometry.compile(snapshot, snapshot['r']!);
      expect(geometry.paths.single.worldPoints, [
        const Offset(5, 0),
        const Offset(20, -10),
        const Offset(30, 5),
        const Offset(20, 20),
        const Offset(5, 10),
      ]);
      final data = await tester.runAsync(
        () => pixels(
          RelationPaint(geometry, snapshot['r']!.data, ColorResolver(), 1),
        ),
      );
      expect(pixel(data!, 40, 25)[3], greaterThan(0));
      expect(
        pixel(data, 15, 25)[3],
        0,
      ); // no spurious center-to-center self segment
      final hidden = scene({'width': 2}, hidden: true);
      final blank = await tester.runAsync(
        () => pixels(
          RelationPaint(
            RelationGeometry.compile(hidden, hidden['r']!),
            hidden['r']!.data,
            ColorResolver(),
            1,
          ),
        ),
      );
      expect(blank!.buffer.asUint8List().every((value) => value == 0), isTrue);
    },
  );

  testWidgets('self-loop join hit envelope contains native painted coverage', (
    tester,
  ) async {
    for (final join in ['miter', 'bevel', 'round']) {
      final snapshot = scene({
        'width': 6,
        'color': '#fff',
        'join': join,
        'miterLimit': 2,
      }, self: true);
      final geometry = RelationGeometry.compile(snapshot, snapshot['r']!);
      final data = await tester.runAsync(
        () => pixels(
          RelationPaint(geometry, snapshot['r']!.data, ColorResolver(), 1),
        ),
      );
      var covered = 0;
      for (var y = 0; y < 64; y++) {
        for (var x = 0; x < 64; x++) {
          if (pixel(data!, x, y)[3] < 220) continue;
          covered++;
          expect(
            geometry.contains(Offset(x + .5 - 10, y + .5 - 20)),
            isTrue,
            reason: '$join pixel $x,$y',
          );
        }
      }
      expect(covered, greaterThan(100));
    }
  });

  test(
    'gradient style is rejected instead of silently drawing a flat color',
    () {
      final snapshot = scene({
        'fill': {'colorStops': []},
      });
      expect(
        () => RelationPaint(
          RelationGeometry.compile(snapshot, snapshot['r']!),
          snapshot['r']!.data,
          ColorResolver(),
          1,
        ),
        throwsFormatException,
      );
    },
  );
}
