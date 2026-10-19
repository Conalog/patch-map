import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui';

import 'package:conalog_patch_map/src/dataset/colors.dart';
import 'package:conalog_patch_map/src/geometry/affine.dart';
import 'package:conalog_patch_map/src/rendering/bar_slices.dart';
import 'package:conalog_patch_map/src/rendering/rectangle_paint.dart';
import 'package:conalog_patch_map/src/resources/bars/bar_masks.dart';
import 'package:flutter_test/flutter_test.dart';

RectanglePaint style({
  Object radius = 3,
  Object fill = '#d04080',
  double alpha = 1,
  double border = 0,
}) => RectanglePaint.fromTexture(
  {
    'type': 'rect',
    'fill': fill,
    'radius': radius,
    'borderWidth': border,
    'borderColor': '#00ff00',
  },
  ColorResolver(),
  '#ffffff',
  alpha,
);
typedef Command = ({
  BarMasks? masks,
  Rect box,
  Affine world,
  RectanglePaint paint,
});
Command command(
  BarMasks? masks,
  Rect box, {
  Affine world = Affine.identity,
  RectanglePaint? paint,
}) => (masks: masks, box: box, world: world, paint: paint ?? style());
void fallback(Canvas canvas, Command draw) {
  canvas.save();
  canvas.transform(draw.world.toMatrix4());
  draw.paint.paint(canvas, draw.box);
  canvas.restore();
}

Future<Uint8List> picturePixels(Picture picture, int width, int height) async {
  final image = await picture.toImage(width, height);
  try {
    return (await image.toByteData(
      format: ImageByteFormat.rawRgba,
    ))!.buffer.asUint8List();
  } finally {
    image.dispose();
    picture.dispose();
  }
}

Future<Uint8List> render(
  List<Command> draws, {
  bool reference = false,
  int width = 128,
  int height = 128,
  void Function(Canvas)? before,
}) async {
  final recorder = PictureRecorder(),
      canvas = Canvas(recorder),
      batch = BarSliceBatch();
  before?.call(canvas);
  try {
    for (final draw in draws) {
      if (reference ||
          !batch.add(canvas, draw.masks, draw.box, draw.world, draw.paint)) {
        fallback(canvas, draw);
      }
    }
    batch.flush(canvas);
    return await picturePixels(recorder.endRecording(), width, height);
  } finally {
    batch.dispose();
  }
}

void comparePixels(
  Uint8List actual,
  Uint8List expected, {
  int maxDelta = 128,
  double meanDelta = 8,
}) {
  var maximum = 0, total = 0, ink = 0;
  for (var p = 0; p < actual.length; p += 4) {
    if (actual[p + 3] == 0 && expected[p + 3] == 0) continue;
    ink++;
    var delta = 0;
    for (var c = 0; c < 4; c++) {
      delta = math.max(delta, (actual[p + c] - expected[p + c]).abs());
    }
    maximum = math.max(maximum, delta);
    total += delta;
    if (delta > 3) {
      expect(
        _edgeNear(actual, p) || _edgeNear(expected, p),
        isTrue,
        reason: 'Interior color changed at pixel ${p ~/ 4}: delta=$delta',
      );
    }
    if (actual[p + 3] > 2 && expected[p + 3] == 0) {
      expect(
        _inkNear(expected, p),
        isTrue,
        reason: 'Coverage escaped the native contour by more than one pixel',
      );
    }
    if (expected[p + 3] > 2 && actual[p + 3] == 0) {
      expect(
        _inkNear(actual, p),
        isTrue,
        reason: 'Native contour is missing by more than one pixel',
      );
    }
  }
  expect(ink, greaterThan(0));
  expect(
    maximum,
    lessThanOrEqualTo(maxDelta),
    reason: 'maximum channel delta=$maximum, ink mean=${total / ink}',
  );
  expect(
    total / ink,
    lessThanOrEqualTo(meanDelta),
    reason: 'maximum channel delta=$maximum, ink mean=${total / ink}',
  );
}

bool _edgeNear(Uint8List bytes, int pixel) {
  final x = (pixel ~/ 4) % 128,
      y = (pixel ~/ 4) ~/ 128,
      height = bytes.length ~/ 4 ~/ 128;
  for (var c = 0; c < 4; c++) {
    var minimum = 255, maximum = 0;
    for (
      var row = math.max(0, y - 1);
      row <= math.min(height - 1, y + 1);
      row++
    ) {
      for (var col = math.max(0, x - 1); col <= math.min(127, x + 1); col++) {
        final value = bytes[(row * 128 + col) * 4 + c];
        minimum = math.min(minimum, value);
        maximum = math.max(maximum, value);
      }
    }
    if (maximum - minimum > 3) return true;
  }
  return false;
}

bool _inkNear(Uint8List bytes, int pixel) {
  final x = (pixel ~/ 4) % 128,
      y = (pixel ~/ 4) ~/ 128,
      height = bytes.length ~/ 4 ~/ 128;
  for (
    var row = math.max(0, y - 1);
    row <= math.min(height - 1, y + 1);
    row++
  ) {
    for (var col = math.max(0, x - 1); col <= math.min(127, x + 1); col++) {
      if (bytes[(row * 128 + col) * 4 + 3] > 0) return true;
    }
  }
  return false;
}

List<int> pixel(Uint8List bytes, int x, int y, {int width = 128}) => [
  for (var c = 0; c < 4; c++) bytes[(y * width + x) * 4 + c],
];

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late BarMasks masks, other;
  setUpAll(() async {
    masks = await createBarMasks(BarMaskPlan.tryCreate(20, 3)!);
    other = await createBarMasks(BarMaskPlan.tryCreate(20, 5)!);
  });
  tearDownAll(() {
    masks.dispose();
    other.dispose();
  });

  test(
    'representative initial width chooses three and changing width chooses nine',
    () {
      final recorder = PictureRecorder(),
          canvas = Canvas(recorder),
          batch = BarSliceBatch();
      expect(
        batch.add(
          canvas,
          masks,
          const Rect.fromLTWH(10, 10, 20, 18),
          Affine.identity,
          style(),
        ),
        isTrue,
      );
      expect(batch.representation, BarSliceRepresentation.three);
      expect(
        batch.add(
          canvas,
          masks,
          const Rect.fromLTWH(40, 10, 30, 25),
          Affine.identity,
          style(),
        ),
        isTrue,
      );
      expect(batch.submissionCount, 1);
      expect(batch.representation, BarSliceRepresentation.nine);
      expect(
        batch.add(
          canvas,
          masks,
          const Rect.fromLTWH(10, 50, 20, 18),
          Affine.identity,
          style(),
        ),
        isTrue,
      );
      expect(batch.submissionCount, 2);
      expect(batch.representation, BarSliceRepresentation.three);
      batch.flush(canvas);
      expect(batch.submissionCount, 3);
      expect(batch.verticesCreated, 3);
      expect(batch.verticesDisposed, 3);
      expect(masks.isDisposed, isFalse);
      recorder.endRecording().dispose();
      batch.dispose();
    },
  );

  test(
    'native three/nine slice shape, opacity and colors match Canvas within sampling tolerance',
    () async {
      final draws = [
        command(
          masks,
          const Rect.fromLTWH(8, 8, 20, 26),
          paint: style(fill: '#ee4020', alpha: .5),
        ),
        command(
          masks,
          const Rect.fromLTWH(40, 8, 36, 20),
          paint: style(fill: '#20a0ee', alpha: .75),
        ),
        command(
          masks,
          const Rect.fromLTWH(8, 45, 6, 6),
          paint: style(fill: '#20ee70'),
        ),
        command(
          other,
          const Rect.fromLTWH(34, 45, 20, 16),
          paint: style(radius: 5, fill: '#8c20ee'),
        ),
        command(masks, const Rect.fromLTWH(8, 85, 20, 6)),
        command(masks, const Rect.fromLTWH(40, 85, 6, 20)),
      ];
      final actual = await render(draws),
          expected = await render(draws, reference: true);
      comparePixels(actual, expected);
      expect(pixel(actual, 18, 18), pixel(expected, 18, 18));
      expect(pixel(actual, 55, 18), pixel(expected, 55, 18));
      expect(pixel(actual, 2, 2), [0, 0, 0, 0]);
    },
  );

  test(
    'rotation, nested nonuniform scale, reflection and shear use full affine',
    () async {
      final angle = .47,
          rotation = Affine(
            math.cos(angle),
            math.sin(angle),
            -math.sin(angle),
            math.cos(angle),
            31,
            17,
          );
      final draws = [
        command(
          masks,
          const Rect.fromLTWH(2, 1, 20, 21),
          world: rotation.multiply(const Affine(1.4, 0, 0, .7, 0, 0)),
          paint: style(fill: '#d06020', alpha: .8),
        ),
        command(
          masks,
          const Rect.fromLTWH(2, 1, 33, 17),
          world: const Affine(-1.1, .2, .25, 1.2, 105, 55),
          paint: style(fill: '#30c090', alpha: .6),
        ),
        command(
          masks,
          const Rect.fromLTWH(0, 0, 20, 8),
          world: const Affine(.8, -.25, .55, 1.1, 18, 90),
          paint: style(fill: '#30a0ff'),
        ),
      ];
      comparePixels(await render(draws), await render(draws, reference: true));
    },
  );

  test(
    'world translation rebasing matches the same native Canvas matrix precision',
    () async {
      final draws = [
        command(
          masks,
          const Rect.fromLTWH(0, 0, 20, 20),
          world: const Affine(1, 0, 0, 1, 1e12 + 10, 1e12 + 10),
        ),
      ];
      void camera(Canvas canvas) => canvas.translate(-1e12, -1e12);
      final actual = await render(draws, before: camera);
      final expected = await render(draws, reference: true, before: camera);
      comparePixels(actual, expected);
      expect(pixel(actual, 10, 10), pixel(expected, 10, 10));
    },
  );

  test(
    'consecutive run order survives representation, mask and fallback transitions',
    () async {
      final fallbackPaint = style(
        radius: [3, 1, 3, 1],
        fill: '#0000ff',
        alpha: .5,
      );
      final draws = [
        command(
          masks,
          const Rect.fromLTWH(10, 10, 20, 20),
          paint: style(fill: '#ff0000'),
        ),
        command(
          masks,
          const Rect.fromLTWH(12, 12, 30, 20),
          paint: style(fill: '#00ff00', alpha: .5),
        ),
        command(
          masks,
          const Rect.fromLTWH(14, 14, 20, 20),
          paint: style(fill: '#ffff00', alpha: .5),
        ),
        command(
          other,
          const Rect.fromLTWH(16, 16, 20, 20),
          paint: style(radius: 5, fill: '#00ffff', alpha: .5),
        ),
        command(
          masks,
          const Rect.fromLTWH(18, 18, 20, 20),
          paint: fallbackPaint,
        ),
        command(
          masks,
          const Rect.fromLTWH(20, 20, 20, 20),
          paint: style(fill: '#ff00ff', alpha: .5),
        ),
      ];
      final actual = await render(draws),
          expected = await render(draws, reference: true);
      comparePixels(actual, expected);
      final a = pixel(actual, 25, 25), b = pixel(expected, 25, 25);
      for (var c = 0; c < 4; c++) {
        expect((a[c] - b[c]).abs(), lessThanOrEqualTo(1));
      }
    },
  );

  test(
    'same-shader translucent overlap keeps input primitive order inside one draw',
    () async {
      final draws = [
        command(
          masks,
          const Rect.fromLTWH(10, 10, 20, 20),
          paint: style(fill: '#ff0000', alpha: .5),
        ),
        command(
          masks,
          const Rect.fromLTWH(15, 15, 20, 20),
          paint: style(fill: '#00ff00', alpha: .5),
        ),
        command(
          masks,
          const Rect.fromLTWH(20, 20, 20, 20),
          paint: style(fill: '#0000ff', alpha: .5),
        ),
      ];
      final actual = await render(draws),
          expected = await render(draws, reference: true);
      comparePixels(actual, expected);
      final a = pixel(actual, 25, 25), b = pixel(expected, 25, 25);
      for (var c = 0; c < 4; c++) {
        expect((a[c] - b[c]).abs(), lessThanOrEqualTo(1));
      }
    },
  );

  test(
    'undersize, nonuniform radius, border and missing mask return ordered Canvas fallback',
    () async {
      final draws = [
        command(masks, const Rect.fromLTWH(5, 5, 20, 15)),
        command(masks, const Rect.fromLTWH(30, 5, 5, 18)),
        command(masks, const Rect.fromLTWH(45, 5, 20, 5)),
        command(
          masks,
          const Rect.fromLTWH(5, 35, 20, 18),
          paint: style(radius: [3, 1, 2, 3]),
        ),
        command(
          masks,
          const Rect.fromLTWH(35, 35, 20, 18),
          paint: style(border: 2),
        ),
        command(null, const Rect.fromLTWH(65, 35, 20, 18)),
        command(
          masks,
          const Rect.fromLTWH(5, 65, 20, 18),
          paint: style(radius: 5),
        ),
      ];
      final recorder = PictureRecorder(),
          canvas = Canvas(recorder),
          batch = BarSliceBatch();
      for (var i = 0; i < draws.length; i++) {
        final draw = draws[i];
        final accepted = batch.add(
          canvas,
          draw.masks,
          draw.box,
          draw.world,
          draw.paint,
        );
        expect(accepted, i == 0);
        if (!accepted) {
          expect(batch.queuedBarCount, 0);
          fallback(canvas, draw);
        }
      }
      batch.flush(canvas);
      final actual = await picturePixels(recorder.endRecording(), 128, 128);
      comparePixels(actual, await render(draws, reference: true));
      batch.dispose();
    },
  );

  test(
    'zero size is successful no-op and transparent fill does not split a run',
    () {
      final recorder = PictureRecorder(),
          canvas = Canvas(recorder),
          batch = BarSliceBatch();
      expect(
        batch.add(
          canvas,
          null,
          const Rect.fromLTWH(0, 0, 0, 5),
          Affine.identity,
          style(border: 2),
        ),
        isTrue,
      );
      expect(batch.queuedBarCount, 0);
      expect(
        batch.add(
          canvas,
          masks,
          const Rect.fromLTWH(0, 0, 20, 10),
          Affine.identity,
          style(),
        ),
        isTrue,
      );
      expect(
        batch.add(
          canvas,
          masks,
          const Rect.fromLTWH(0, 0, 20, 10),
          Affine.identity,
          style(alpha: 0),
        ),
        isTrue,
      );
      expect(batch.queuedBarCount, 1);
      expect(batch.submissionCount, 0);
      batch.flush(canvas);
      recorder.endRecording().dispose();
      batch.dispose();
    },
  );

  test(
    'capacity scratch is reused across many recordings and all submitted Vertices dispose',
    () {
      final batch = BarSliceBatch(capacity: 2);
      final allocation = batch.scratchIdentity, bytes = batch.scratchBytes;
      expect(bytes, 928);
      for (var frame = 0; frame < 50; frame++) {
        final recorder = PictureRecorder(), canvas = Canvas(recorder);
        for (var i = 0; i < 7; i++) {
          expect(
            batch.add(
              canvas,
              masks,
              Rect.fromLTWH(i * 22.0, 0, 20, 12),
              Affine.identity,
              style(),
            ),
            isTrue,
          );
        }
        expect(batch.queuedBarCount, 1);
        batch.flush(canvas);
        batch.flush(canvas);
        expect(batch.queuedBarCount, 0);
        expect(batch.scratchIdentity, same(allocation));
        expect(batch.scratchBytes, bytes);
        expect(batch.verticesCreated, batch.verticesDisposed);
        recorder.endRecording().dispose();
      }
      expect(batch.submissionCount, 200);
      expect(batch.verticesDisposed, 200);
      batch.dispose();
      batch.dispose();
      expect(masks.isDisposed, isFalse);
      final recorder = PictureRecorder(), canvas = Canvas(recorder);
      expect(() => batch.flush(canvas), throwsStateError);
      recorder.endRecording().dispose();
    },
  );

  test(
    'premature borrowed-mask disposal fails explicitly and clears the pending run',
    () async {
      final borrowed = await createBarMasks(BarMaskPlan.tryCreate(20, 3)!);
      final recorder = PictureRecorder(),
          canvas = Canvas(recorder),
          batch = BarSliceBatch();
      expect(
        batch.add(
          canvas,
          borrowed,
          const Rect.fromLTWH(0, 0, 20, 20),
          Affine.identity,
          style(),
        ),
        isTrue,
      );
      borrowed.dispose();
      expect(() => batch.flush(canvas), throwsStateError);
      expect(batch.queuedBarCount, 0);
      expect(batch.verticesCreated, 0);
      expect(batch.verticesDisposed, 0);
      expect(
        batch.add(
          canvas,
          masks,
          const Rect.fromLTWH(0, 0, 20, 20),
          Affine.identity,
          style(),
        ),
        isTrue,
      );
      batch.flush(canvas);
      expect(batch.verticesCreated, 1);
      expect(batch.verticesDisposed, 1);
      batch.dispose();
      recorder.endRecording().dispose();
    },
  );

  test(
    'native resource teardown and invalid coordinates leave no submitted vertex handles',
    () async {
      final disposedMask = await createBarMasks(BarMaskPlan.tryCreate(20, 3)!);
      disposedMask.dispose();
      final recorder = PictureRecorder(),
          canvas = Canvas(recorder),
          batch = BarSliceBatch();
      expect(
        batch.add(
          canvas,
          disposedMask,
          const Rect.fromLTWH(0, 0, 20, 20),
          Affine.identity,
          style(),
        ),
        isFalse,
      );
      expect(
        batch.add(
          canvas,
          masks,
          const Rect.fromLTWH(0, 0, 20, 20),
          const Affine(1e300, 0, 0, 1, 0, 0),
          style(),
        ),
        isFalse,
      );
      expect(
        batch.add(
          canvas,
          masks,
          const Rect.fromLTRB(4, 0, 2, 20),
          Affine.identity,
          style(),
        ),
        isFalse,
      );
      expect(batch.verticesCreated, 0);
      batch.dispose();
      recorder.endRecording().dispose();
      expect(() => BarSliceBatch(capacity: 0), throwsRangeError);
      expect(() => BarSliceBatch(capacity: 101), throwsRangeError);
    },
  );
}
