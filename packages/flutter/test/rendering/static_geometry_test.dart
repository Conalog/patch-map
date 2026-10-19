import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui';

import 'package:conalog_patch_map/src/dataset/colors.dart';
import 'package:conalog_patch_map/src/geometry/affine.dart';
import 'package:conalog_patch_map/src/rendering/rectangle_paint.dart';
import 'package:conalog_patch_map/src/rendering/static_geometry.dart';
import 'package:flutter_test/flutter_test.dart';

RectanglePaint style({
  Object radius = 4,
  Object fill = '#e06030',
  double alpha = 1,
  double width = 2,
  Object stroke = '#2080d0',
  double alignment = .5,
  String join = 'miter',
  double miterLimit = 10,
}) => RectanglePaint.fromElement(
  {
    'fill': fill,
    'radius': radius,
    'stroke': {
      'fill': stroke,
      'width': width,
      'alignment': alignment,
      'join': join,
      'miterLimit': miterLimit,
    },
  },
  ColorResolver(),
  alpha,
);

StaticRectangle shape(
  Rect rect, {
  RectanglePaint? paint,
  Affine world = Affine.identity,
}) => StaticRectangle(rect, world, paint ?? style());

Future<Uint8List> pixels(
  List<StaticRectangle> shapes, {
  bool reference = false,
  StaticGeometry? owner,
  void Function(Canvas)? before,
}) async {
  final recorder = PictureRecorder(), canvas = Canvas(recorder);
  before?.call(canvas);
  final geometry = owner ?? StaticGeometry.tryBuild(shapes)!;
  if (reference) {
    for (final input in shapes) {
      canvas.save();
      canvas.transform(input.world.toMatrix4());
      input.paint.paint(canvas, input.rect);
      canvas.restore();
    }
  } else {
    geometry.draw(canvas);
  }
  final picture = recorder.endRecording();
  try {
    final image = await picture.toImage(128, 128);
    try {
      return (await image.toByteData(
        format: ImageByteFormat.rawRgba,
      ))!.buffer.asUint8List();
    } finally {
      image.dispose();
    }
  } finally {
    picture.dispose();
    if (owner == null) geometry.dispose();
  }
}

List<int> pixel(Uint8List data, int x, int y) => [
  for (var c = 0; c < 4; c++) data[(y * 128 + x) * 4 + c],
];

bool edgeNear(Uint8List data, int x, int y) {
  for (var c = 0; c < 4; c++) {
    var minimum = 255, maximum = 0;
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        final xx = (x + dx).clamp(0, 127), yy = (y + dy).clamp(0, 127);
        final value = data[(yy * 128 + xx) * 4 + c];
        minimum = math.min(minimum, value);
        maximum = math.max(maximum, value);
      }
    }
    if (maximum - minimum > 3) return true;
  }
  return false;
}

bool inkNear(Uint8List data, int x, int y) {
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      final xx = (x + dx).clamp(0, 127), yy = (y + dy).clamp(0, 127);
      if (data[(yy * 128 + xx) * 4 + 3] > 0) return true;
    }
  }
  return false;
}

/// drawVertices has hard boundary coverage on the test engine. This explicitly
/// checks its difference from native AA rather than claiming bit-identical AA.
void compareCoverage(
  Uint8List actual,
  Uint8List expected, {
  double maximumInkMean = 14,
}) {
  var ink = 0, total = 0;
  for (var p = 0; p < actual.length; p += 4) {
    if (actual[p + 3] == 0 && expected[p + 3] == 0) continue;
    ink++;
    var difference = 0;
    for (var c = 0; c < 4; c++) {
      difference = math.max(
        difference,
        (actual[p + c] - expected[p + c]).abs(),
      );
    }
    total += difference;
    final x = (p ~/ 4) % 128, y = (p ~/ 4) ~/ 128;
    if (difference > 3) {
      expect(
        edgeNear(actual, x, y) || edgeNear(expected, x, y),
        isTrue,
        reason: 'interior color changed at ($x,$y): $difference',
      );
    }
    if (actual[p + 3] > 2 && expected[p + 3] == 0) {
      expect(
        inkNear(expected, x, y),
        isTrue,
        reason: 'coverage escaped the native contour by more than one pixel',
      );
    }
    if (expected[p + 3] > 2 && actual[p + 3] == 0) {
      expect(
        inkNear(actual, x, y),
        isTrue,
        reason: 'native coverage is missing by more than one pixel',
      );
    }
  }
  expect(ink, greaterThan(0));
  expect(
    total / ink,
    lessThanOrEqualTo(maximumInkMean),
    reason: 'ink-pixel mean maximum-channel delta ${total / ink}',
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'square opaque fill and centered miter border retain native bounds',
    () async {
      final input = [
        shape(
          const Rect.fromLTWH(12, 12, 40, 30),
          paint: style(radius: 0, width: 4),
        ),
      ];
      final owner = StaticGeometry.tryBuild(input)!;
      expect(owner.bounds, const Rect.fromLTRB(10, 10, 54, 44));
      final actual = await pixels(input, owner: owner),
          expected = await pixels(input, reference: true);
      expect(actual, expected);
      expect(pixel(actual, 10, 10), [32, 128, 208, 255]);
      expect(pixel(actual, 9, 10), [0, 0, 0, 0]);
      owner.dispose();
    },
  );

  test(
    'rounded fill, border, fitted capsule and fractional placement compare native AA',
    () async {
      final input = [
        shape(const Rect.fromLTWH(8.25, 8.25, 42, 30)),
        shape(
          const Rect.fromLTWH(65, 8, 35, 24),
          paint: style(radius: 100, width: 3, alpha: .7),
        ),
        shape(
          const Rect.fromLTWH(8, 58, 40, 38),
          paint: style(radius: 14, width: 7),
        ),
        shape(
          const Rect.fromLTWH(65, 60, 40, 30),
          paint: style(radius: 5, width: 0, fill: '#4080ff80'),
        ),
      ];
      final actual = await pixels(input),
          expected = await pixels(input, reference: true);
      compareCoverage(actual, expected);
      expect(pixel(actual, 20, 20), pixel(expected, 20, 20));
      expect(pixel(actual, 80, 75), pixel(expected, 80, 75));
      // Native AA has partially covered pixels which a polygon boundary lacks.
      expect(actual, isNot(expected));
    },
  );

  test(
    'full affine transforms preserve geometry and projected bounds',
    () async {
      final angle = .4;
      final input = [
        shape(
          const Rect.fromLTWH(0, 0, 30, 18),
          world: Affine(
            math.cos(angle),
            math.sin(angle),
            -math.sin(angle),
            math.cos(angle),
            28,
            12,
          ),
        ),
        shape(
          const Rect.fromLTWH(0, 0, 30, 18),
          world: const Affine(-1.1, .2, .3, 1.2, 100, 55),
          paint: style(fill: '#40d070', alpha: .75),
        ),
      ];
      compareCoverage(
        await pixels(input),
        await pixels(input, reference: true),
      );
      final owner = StaticGeometry.tryBuild(input)!;
      expect(owner.bounds.left, lessThan(28));
      expect(owner.bounds.right, greaterThan(100));
      owner.dispose();
    },
  );

  test(
    'input and fill-before-stroke order preserve translucent compositing',
    () async {
      final input = [
        shape(
          const Rect.fromLTWH(10, 10, 45, 40),
          paint: style(fill: '#ff0000', stroke: '#00ffff', width: 6, alpha: .5),
        ),
        shape(
          const Rect.fromLTWH(20, 20, 45, 40),
          paint: style(fill: '#00ff00', stroke: '#ff00ff', width: 6, alpha: .5),
        ),
        shape(
          const Rect.fromLTWH(30, 30, 45, 40),
          paint: style(fill: '#0000ff', stroke: '#ffff00', width: 6, alpha: .5),
        ),
      ];
      final actual = await pixels(input),
          expected = await pixels(input, reference: true);
      compareCoverage(actual, expected);
      for (final xy in [(35, 35), (51, 38), (61, 45)]) {
        final a = pixel(actual, xy.$1, xy.$2),
            b = pixel(expected, xy.$1, xy.$2);
        for (var c = 0; c < 4; c++) {
          expect((a[c] - b[c]).abs(), lessThanOrEqualTo(1));
        }
      }
    },
  );

  test(
    'common world translation is rebased before Float32 vertex conversion',
    () async {
      final input = [
        shape(
          const Rect.fromLTWH(0, 0, 32, 24),
          world: const Affine(1, 0, 0, 1, 1e12 + 20, 1e12 + 20),
          paint: style(radius: 0, width: 0),
        ),
      ];
      void camera(Canvas canvas) => canvas.translate(-1e12, -1e12);
      final actual = await pixels(input, before: camera);
      final expected = await pixels(input, before: camera, reference: true);
      compareCoverage(actual, expected);
      expect(pixel(actual, 10, 10), pixel(expected, 10, 10));
    },
  );

  test(
    'unsupported paint, collapsed interiors and invalid transforms request fallback',
    () {
      final rect = const Rect.fromLTWH(10, 10, 30, 20);
      final unsupported = [
        shape(rect, paint: style(radius: [1, 2, 3, 4])),
        shape(rect, paint: style(alignment: 0)),
        shape(rect, paint: style(alignment: 1)),
        shape(rect, paint: style(radius: 0, join: 'bevel')),
        shape(rect, paint: style(radius: 0, join: 'round')),
        shape(rect, paint: style(radius: 0, miterLimit: 1)),
        shape(rect, paint: style(width: 20)),
        shape(rect, paint: style(radius: 1, width: 3)),
        shape(rect, world: const Affine(0, 0, 0, 0, 0, 0)),
        shape(rect, world: const Affine(double.nan, 0, 0, 1, 0, 0)),
        shape(rect, world: const Affine(1e300, 0, 0, 1, 0, 0)),
        shape(const Rect.fromLTRB(10, 10, 5, 20)),
        shape(
          const Rect.fromLTWH(0, 0, 100000, 100000),
          paint: style(radius: 50000),
        ),
        shape(
          const Rect.fromLTWH(0, 0, 1e20, 1e20),
          paint: style(radius: 1e19),
        ),
      ];
      for (final input in unsupported) {
        expect(StaticGeometry.isEligible(input), isFalse);
        expect(StaticGeometry.tryBuild([shape(rect), input]), isNull);
      }
      expect(
        StaticGeometry.isEligible(shape(rect, paint: style(radius: 100))),
        isTrue,
      );
    },
  );

  test(
    'owner retains one mesh and paint across recordings, disposal is explicit and idempotent',
    () async {
      final input = [shape(const Rect.fromLTWH(10, 10, 30, 20))];
      final owner = StaticGeometry.tryBuild(input)!;
      final native = owner.verticesIdentity as Vertices,
          paint = owner.paintIdentity;
      final bytes = owner.geometryBytes;
      expect(owner.vertexCount, greaterThan(0));
      expect(owner.triangleCount, greaterThan(0));
      expect(bytes, owner.vertexCount * 12 + owner.triangleCount * 6);
      input.clear(); // No retained mutable caller list.
      final first = await pixels([], owner: owner);
      for (var i = 0; i < 5; i++) {
        expect(await pixels([], owner: owner), first);
        expect(owner.verticesIdentity, same(native));
        expect(owner.paintIdentity, same(paint));
        expect(owner.geometryBytes, bytes);
        expect(native.debugDisposed, isFalse);
      }
      expect(owner.drawCount, 6);
      owner.dispose();
      owner.dispose();
      expect(owner.isDisposed, isTrue);
      expect(native.debugDisposed, isTrue);
      expect(owner.verticesIdentity, isNull);
      final recorder = PictureRecorder(), canvas = Canvas(recorder);
      expect(() => owner.draw(canvas), throwsStateError);
      recorder.endRecording().dispose();
    },
  );

  test('empty/transparent geometry no-ops and index overflow is bounded', () {
    for (final inputs in [
      <StaticRectangle>[],
      [shape(const Rect.fromLTWH(0, 0, 0, 10))],
      [shape(const Rect.fromLTWH(0, 0, 20, 10), paint: style(alpha: 0))],
    ]) {
      final owner = StaticGeometry.tryBuild(inputs)!;
      expect(owner.verticesIdentity, isNull);
      expect(owner.geometryBytes, 0);
      final recorder = PictureRecorder(), canvas = Canvas(recorder);
      owner.draw(canvas);
      expect(owner.drawCount, 0);
      recorder.endRecording().dispose();
      owner.dispose();
    }
    final repeated = shape(const Rect.fromLTWH(0, 0, 20, 10));
    final hundred = StaticGeometry.tryBuild(List.filled(100, repeated))!;
    expect(hundred.vertexCount, lessThan(65536));
    hundred.dispose();
    expect(StaticGeometry.tryBuild(List.filled(10000, repeated)), isNull);
  });

  test(
    'stroke-only holes stay transparent and recording survives owner disposal',
    () async {
      final input = [
        shape(
          const Rect.fromLTWH(20, 20, 40, 30),
          paint: style(fill: 'transparent', width: 4, radius: 7),
        ),
      ];
      final owner = StaticGeometry.tryBuild(input)!;
      final recorder = PictureRecorder(), canvas = Canvas(recorder);
      owner.draw(canvas);
      final picture = recorder.endRecording();
      owner.dispose();
      final image = await picture.toImage(128, 128);
      try {
        final actual = (await image.toByteData(
          format: ImageByteFormat.rawRgba,
        ))!.buffer.asUint8List();
        compareCoverage(actual, await pixels(input, reference: true));
        expect(pixel(actual, 40, 35), [0, 0, 0, 0]);
        expect(pixel(actual, 40, 20), [32, 128, 208, 255]);
      } finally {
        image.dispose();
        picture.dispose();
      }
    },
  );
}
