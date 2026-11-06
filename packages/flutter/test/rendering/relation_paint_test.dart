import 'dart:typed_data';
import 'dart:ui';

import 'package:conalog_patch_map/src/dataset/colors.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/geometry/geometry_snapshot.dart';
import 'package:conalog_patch_map/src/rendering/relation_paint.dart';
import 'package:flutter_test/flutter_test.dart';

GeometrySnapshot scene(
  Map<String, Object?> style, {
  bool self = false,
  bool hidden = false,
  bool chain = false,
  double targetX = 30,
}) => GeometrySnapshot.compile(
  const DatasetReader().read([
    {'type': 'rect', 'id': 'a', 'size': 10, 'show': !hidden},
    if (chain)
      {
        'type': 'rect',
        'id': 'mid',
        'size': 10,
        'attrs': {'x': 15},
      },
    {
      'type': 'rect',
      'id': 'b',
      'size': 10,
      'attrs': {'x': targetX},
    },
    {
      'type': 'relations',
      'id': 'r',
      'style': style,
      'links': [
        if (chain) ...[
          {'source': 'missing', 'target': 'a'},
          {'source': 'a', 'target': 'mid'},
          {'source': 'mid', 'target': 'b'},
          {'source': 'b', 'target': 'missing'},
        ] else
          {'source': 'a', 'target': self ? 'a' : 'b'},
      ],
    },
  ]),
  (_, _) => Size.zero,
);

Future<ByteData> pixels(RelationPaint paint, {double alpha = 1}) async {
  final recorder = PictureRecorder();
  final canvas = Canvas(recorder)..translate(10, 20);
  paint.paint(canvas, alphaMultiplier: alpha);
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
  testWidgets('a chain decorates only its first and last drawable ends', (
    tester,
  ) async {
    final snapshot = scene({
      'width': 2,
      'startMarker': 'circle',
      'endMarker': 'diamond',
    }, chain: true);
    final geometry = snapshot.relationFor('r')!;
    final data = (await tester.runAsync(
      () => pixels(
        RelationPaint(geometry, snapshot['r']!.data, ColorResolver(), 1),
      ),
    ))!;
    expect(geometry.paintBounds, const Rect.fromLTRB(1, 1, 39, 9));
    expect(pixel(data, 12, 25)[3], 255);
    expect(pixel(data, 30, 27)[3], 0);
    expect(pixel(data, 47, 25)[3], 255);
    expect(geometry.contains(const Offset(2.5, 5.5)), isFalse);
  });

  testWidgets('circle and end arrow share one translucent stroke fill', (
    tester,
  ) async {
    final snapshot = scene({
      'width': 4,
      'color': '#ff000080',
      'startMarker': 'circle',
      'endMarker': 'arrow',
    });
    final geometry = snapshot.relationFor('r')!;
    final data = (await tester.runAsync(
      () => pixels(
        RelationPaint(geometry, snapshot['r']!.data, ColorResolver(), .5),
        alpha: .5,
      ),
    ))!;
    for (final (x, y) in [(10, 25), (15, 25), (25, 25), (32, 25), (32, 29)]) {
      expect(pixel(data, x, y), [255, 0, 0, 32], reason: '$x,$y');
    }
    expect(pixel(data, 43, 29)[3], 0); // Arrow narrows toward the target.
    expect(pixel(data, 46, 25)[3], 0);
  });

  testWidgets('start arrow points outward and end diamond is centered', (
    tester,
  ) async {
    final snapshot = scene({
      'width': 4,
      'startMarker': 'arrow',
      'endMarker': 'diamond',
    });
    final data = (await tester.runAsync(
      () => pixels(
        RelationPaint(
          snapshot.relationFor('r')!,
          snapshot['r']!.data,
          ColorResolver(),
          1,
        ),
      ),
    ))!;
    expect(pixel(data, 16, 29)[3], 0);
    expect(pixel(data, 27, 29)[3], 255);
    expect(pixel(data, 49, 25)[3], 255);
    expect(pixel(data, 49, 30)[3], 0);
    expect(pixel(data, 54, 25)[3], 0);
  });

  testWidgets('hidden, coincident and zero-width paths omit markers', (
    tester,
  ) async {
    const markers = {'startMarker': 'circle', 'endMarker': 'arrow'};
    for (final snapshot in [
      scene(markers, hidden: true),
      scene(markers, targetX: 0),
      scene({...markers, 'width': 0}),
    ]) {
      final geometry = snapshot.relationFor('r')!;
      expect(geometry.paintBounds, isNull);
      final data = (await tester.runAsync(
        () => pixels(
          RelationPaint(geometry, snapshot['r']!.data, ColorResolver(), 1),
        ),
      ))!;
      expect(data.buffer.asUint8List().every((value) => value == 0), isTrue);
    }
  });

  testWidgets(
    'native straight stroke preserves alpha and butt endpoint extents',
    (tester) async {
      final snapshot = scene({'width': 4, 'color': '#ff000080', 'alpha': .5});
      final geometry = snapshot.relationFor('r')!;
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

  testWidgets('ignored square and round caps retain butt endpoints', (
    tester,
  ) async {
    final baseline = scene({'width': 8, 'color': '#00ff00'});
    final expected = await tester.runAsync(
      () => pixels(
        RelationPaint(
          baseline.relationFor('r')!,
          baseline['r']!.data,
          ColorResolver(),
          1,
        ),
      ),
    );
    for (final cap in ['round', 'square']) {
      final snapshot = scene({'width': 8, 'color': '#00ff00', 'cap': cap});
      final geometry = snapshot.relationFor('r')!;
      final data = await tester.runAsync(
        () => pixels(
          RelationPaint(geometry, snapshot['r']!.data, ColorResolver(), 1),
        ),
      );
      expect(data!.buffer.asUint8List(), expected!.buffer.asUint8List());
      expect(pixel(data, 11, 25)[3], 0);
      expect(geometry.contains(const Offset(1.5, 5.5)), isFalse);
      expect(geometry.contains(const Offset(5.5, 5.5)), isTrue);
    }
  });

  testWidgets(
    'self-link is five-point polyline and hidden endpoint paints nothing',
    (tester) async {
      final snapshot = scene({'width': 2, 'color': '#0000ff'}, self: true);
      final geometry = snapshot.relationFor('r')!;
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
            hidden.relationFor('r')!,
            hidden['r']!.data,
            ColorResolver(),
            1,
          ),
        ),
      );
      expect(blank!.buffer.asUint8List().every((value) => value == 0), isTrue);
    },
  );

  testWidgets('ignored self-loop joins retain default native hit envelope', (
    tester,
  ) async {
    for (final join in ['miter', 'bevel', 'round']) {
      final snapshot = scene({
        'width': 6,
        'color': '#fff',
        'join': join,
        'miterLimit': 2,
      }, self: true);
      final geometry = snapshot.relationFor('r')!;
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

  test('ignored gradient fill does not replace projected color or fail', () {
    final snapshot = scene({
      'color': '#123456',
      'fill': {'colorStops': []},
    });
    final paint = RelationPaint(
      snapshot.relationFor('r')!,
      snapshot['r']!.data,
      ColorResolver(),
      1,
    );
    expect(paint.color, const Color(0xff123456));
  });
}
