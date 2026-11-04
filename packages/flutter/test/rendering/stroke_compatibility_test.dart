import 'dart:typed_data';
import 'dart:ui';

import 'package:conalog_patch_map/src/api/target.dart';
import 'package:conalog_patch_map/src/dataset/colors.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/dataset/dataset_styles.dart' as styles;
import 'package:conalog_patch_map/src/geometry/affine.dart';
import 'package:conalog_patch_map/src/geometry/geometry_snapshot.dart';
import 'package:conalog_patch_map/src/geometry/selection_geometry.dart';
import 'package:conalog_patch_map/src/rendering/rectangle_paint.dart';
import 'package:conalog_patch_map/src/rendering/relation_paint.dart';
import 'package:flutter_test/flutter_test.dart';

// Executed release oracle: d39550ea21b9ed4fbb0fd7352ea040e00b31a486,
// /tmp/patchmap_stroke_projection_review.{cjs,json}, 30 projection cases.
// These compare native baseline vs ignored input, not JS/native AA equivalence.
const ignored = <String, Object?>{
  'cap': 'round',
  'join': 'bevel',
  'miterLimit': 1,
  'alignment': 1,
  'pixelLine': true,
  'fill': {
    'colorStops': [
      {'color': 'unconfiguredIgnoredToken'},
    ],
  },
  'texture': {'src': 'ignored.png'},
  'matrix': {'a': 2, 'b': 0, 'c': 0, 'd': 1, 'tx': 2, 'ty': 3},
  'textureSpace': 'global',
};
final palette = ColorResolver();

Map<String, Object?> rectangle(Map<String, Object?> extra) =>
    const DatasetReader()
        .read([
          {
            'type': 'rect',
            'id': 'a',
            'size': {'width': 20, 'height': 16},
            'fill': '#ffffff80',
            'radius': [3, 4, 2, 1],
            'attrs': {'x': 3, 'y': 4, 'angle': 13, 'scaleX': 1.2, 'scaleY': .8},
            'stroke': {'color': '#ff000080', 'width': 4, ...extra},
          },
        ])
        .roots
        .single;

GeometrySnapshot geometry(List<Map<String, Object?>> values) =>
    GeometrySnapshot.compile(
      const DatasetReader().read(values),
      (_, _) => Size.zero,
    );

Future<Uint8List> pixels(void Function(Canvas) paint) async {
  final recorder = PictureRecorder();
  paint(Canvas(recorder)..translate(20, 20));
  final picture = recorder.endRecording();
  final image = await picture.toImage(100, 80);
  try {
    return (await image.toByteData(
      format: ImageByteFormat.rawStraightRgba,
    ))!.buffer.asUint8List();
  } finally {
    image.dispose();
    picture.dispose();
  }
}

List<Offset> vertices(Quad quad) => [
  for (var i = 0; i < 4; i++) quad.vertex(i),
];

GeometrySnapshot relation(Map<String, Object?> extra, {required bool self}) {
  final snapshot = geometry([
    {'type': 'rect', 'id': 'a', 'size': 10},
    {
      'type': 'rect',
      'id': 'b',
      'size': 10,
      'attrs': {'x': 35},
    },
    {
      'type': 'relations',
      'id': 'r',
      'links': [
        {'source': 'a', 'target': self ? 'a' : 'b'},
      ],
      'style': {'color': '#00ff0080', 'width': 6, 'alpha': .5},
    },
  ]);
  // Partial presentation records preserve input metadata. Exercise the actual
  // renderer/geometry even when initial relation normalization stripped it.
  return snapshot.prepare({
    const PatchMapTarget('r'): Map.unmodifiable({
      ...snapshot['r']!.data,
      'style': Map<String, Object?>.unmodifiable({
        ...snapshot['r']!.data['style']! as Map,
        ...extra,
      }),
    }),
  }, (_, _) => Size.zero).snapshot;
}

void main() {
  testWidgets(
    'every ignored rect field preserves pixels, bounds and selection quad',
    (tester) async {
      final base = rectangle({});
      final baseGeometry = geometry([base])['a']!;
      final expected = await tester.runAsync(
        () => pixels(
          (canvas) => RectanglePaint.fromElement(
            base,
            palette,
            .5,
          ).paint(canvas, const Rect.fromLTWH(0, 0, 20, 16)),
        ),
      );
      for (final extra in [
        {'alpha': 0},
        for (final entry in ignored.entries) {entry.key: entry.value},
        {...ignored, 'alpha': 0},
      ]) {
        final record = rectangle(extra);
        styles.validateRecordColors(record, palette);
        for (final entry in extra.entries) {
          expect((record['stroke'] as Map)[entry.key], entry.value);
        }
        final actualGeometry = geometry([record])['a']!;
        expect(actualGeometry.bounds, baseGeometry.bounds, reason: '$extra');
        expect(
          actualGeometry.paintBounds,
          baseGeometry.paintBounds,
          reason: '$extra',
        );
        expect(
          vertices(
            selectionQuad(
              actualGeometry,
              palette: palette,
              cameraRotation: .2,
            )!,
          ),
          vertices(
            selectionQuad(baseGeometry, palette: palette, cameraRotation: .2)!,
          ),
        );
        final actual = await tester.runAsync(
          () => pixels(
            (canvas) => RectanglePaint.fromElement(
              record,
              palette,
              .5,
            ).paint(canvas, const Rect.fromLTWH(0, 0, 20, 16)),
          ),
        );
        expect(actual, expected, reason: '$extra');
      }
      for (final extra in [
        {'color': '#00ff00'},
        {'width': 8},
      ]) {
        final actual = await tester.runAsync(
          () => pixels(
            (canvas) => RectanglePaint.fromElement(
              rectangle(extra),
              palette,
              .5,
            ).paint(canvas, const Rect.fromLTWH(0, 0, 20, 16)),
          ),
        );
        expect(actual, isNot(expected));
      }
    },
  );

  testWidgets(
    'ignored relation input preserves straight and self-loop paint and hit projection',
    (tester) async {
      for (final self in [false, true]) {
        final baseline = relation({}, self: self);
        final base = baseline.relationFor('r')!;
        final expected = await tester.runAsync(
          () => pixels(
            RelationPaint(base, baseline['r']!.data, palette, .5).paint,
          ),
        );
        for (final extra in [
          for (final entry in ignored.entries) {entry.key: entry.value},
          ignored,
        ]) {
          final actual = relation(extra, self: self);
          styles.validateRecordColors(actual['r']!.data, palette);
          final projected = actual.relationFor('r')!;
          expect(projected.paintBounds, base.paintBounds);
          expect(
            projected.paths.single.worldPoints,
            base.paths.single.worldPoints,
          );
          expect(projected.hitQuads.map(vertices), base.hitQuads.map(vertices));
          expect(
            projected.contains(const Offset(5, 5)),
            base.contains(const Offset(5, 5)),
          );
          expect(
            projected.segmentEntry(const Offset(-10, 5), const Offset(50, 5)),
            base.segmentEntry(const Offset(-10, 5), const Offset(50, 5)),
          );
          final query = Affine.identity.projectRect(
            const Rect.fromLTWH(0, 0, 5, 5),
          );
          expect(projected.intersects(query), base.intersects(query));
          final output = await tester.runAsync(
            () => pixels(
              RelationPaint(projected, actual['r']!.data, palette, .5).paint,
            ),
          );
          expect(output, expected, reason: 'self=$self $extra');
        }
        for (final extra in [
          {'color': '#ff0000'},
          {'alpha': .8},
          {'width': 10},
        ]) {
          final actual = relation(extra, self: self);
          final output = await tester.runAsync(
            () => pixels(
              RelationPaint(
                actual.relationFor('r')!,
                actual['r']!.data,
                palette,
                .5,
              ).paint,
            ),
          );
          expect(output, isNot(expected), reason: '$extra');
        }
      }
    },
  );

  test(
    'relation initial projection and opacity alias match release while scalar admission stays strict',
    () {
      Map<String, Object?> record(Map<String, Object?> extra) =>
          const DatasetReader()
              .read([
                {
                  'type': 'relations',
                  'id': 'r',
                  'links': [],
                  'style': {'color': '#123456', 'width': 3, ...extra},
                },
              ])
              .roots
              .single;
      expect(record({...ignored, 'opacity': .4})['style'], {
        'color': '#123456',
        'alpha': .4,
        'width': 3,
      });
      for (final extra in [
        {'cap': 'triangle'},
        {'width': -1},
        {'alignment': 2},
        {'pixelLine': 1},
        {'alpha': .4, 'opacity': .4},
      ]) {
        expect(() => record(extra), throwsA(isA<DatasetException>()));
      }
      expect(
        () => rectangle({'opacity': .4}),
        throwsA(isA<DatasetException>()),
      );
      expect(
        () => styles.validateRecordColors(
          rectangle({'color': 'unknownStrokeToken'}),
          palette,
        ),
        throwsA(isA<DatasetException>()),
      );
      expect(
        () => styles.validateRecordColors({
          'type': 'rect',
          'fill': 'unknownFillToken',
        }, palette),
        throwsA(isA<DatasetException>()),
      );
    },
  );
}
