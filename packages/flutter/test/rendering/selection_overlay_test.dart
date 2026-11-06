import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui';

import 'package:conalog_patch_map/src/api/target.dart';
import 'package:conalog_patch_map/src/dataset/colors.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/geometry/affine.dart';
import 'package:conalog_patch_map/src/geometry/geometry_snapshot.dart';
import 'package:conalog_patch_map/src/geometry/selection_geometry.dart';
import 'package:conalog_patch_map/src/rendering/selection_overlay.dart';
import 'package:flutter_test/flutter_test.dart';

GeometrySnapshot snapshot(List<Map<String, Object?>> values) =>
    GeometrySnapshot.compile(
      const DatasetReader().read(values),
      (data, content) => const Size(12, 8),
    );

Map<String, Object?> item(
  String id, {
  double x = 20,
  double y = 20,
  Object size = const {'width': 40, 'height': 30},
  List<Map<String, Object?>>? components,
}) => {
  'type': 'item',
  'id': id,
  'attrs': {'x': x, 'y': y},
  'size': size,
  'components':
      components ??
      [
        {
          'type': 'background',
          'id': 'bg',
          'source': {'type': 'rect', 'fill': 'white', 'borderWidth': 2},
        },
      ],
};

List<Offset> vertices(Quad quad) => [quad.p0, quad.p1, quad.p2, quad.p3];
void expectQuad(Quad? actual, List<Offset> expected) {
  expect(actual, isNotNull);
  for (var i = 0; i < 4; i++) {
    expect(actual!.vertex(i).dx, closeTo(expected[i].dx, 1e-9));
    expect(actual.vertex(i).dy, closeTo(expected[i].dy, 1e-9));
  }
}

Future<Uint8List> pixels(
  void Function(Canvas) paint, {
  double scale = 1,
  double rotation = 0,
  bool camera = false,
}) async {
  final recorder = PictureRecorder(), canvas = Canvas(recorder);
  if (camera) {
    canvas.translate(64, 64);
    canvas.rotate(rotation);
    canvas.scale(scale);
    canvas.translate(-40, -40);
  }
  paint(canvas);
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
  }
}

Future<Uint8List> render(
  SelectionOverlay overlay,
  GeometrySnapshot geometry,
  Iterable<String> selected, {
  double scale = 1,
  double rotation = 0,
  bool camera = false,
}) => pixels(
  (canvas) => overlay.paint(
    canvas,
    geometry,
    selected,
    cameraScale: scale,
    cameraRotation: rotation,
  ),
  scale: scale,
  rotation: rotation,
  camera: camera,
);

Future<Uint8List> reference(
  List<List<Offset>> contours, {
  double scale = 1,
  double rotation = 0,
  bool camera = false,
}) => pixels(
  (canvas) {
    final path = Path();
    for (final contour in contours) {
      path.moveTo(contour.first.dx, contour.first.dy);
      for (final point in contour.skip(1)) {
        path.lineTo(point.dx, point.dy);
      }
      path.close();
    }
    canvas.drawPath(
      path,
      Paint()
        ..color = const Color(0xff2f80ed)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2 / math.max(scale, .001)
        ..strokeJoin = StrokeJoin.miter
        ..strokeMiterLimit = 10,
    );
  },
  scale: scale,
  rotation: rotation,
  camera: camera,
);

List<Offset> rect(Rect value) => [
  value.topLeft,
  value.topRight,
  value.bottomRight,
  value.bottomLeft,
];
List<int> pixel(Uint8List bytes, int x, int y) => [
  for (var c = 0; c < 4; c++) bytes[(y * 128 + x) * 4 + c],
];

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'release blue centered 2px outline includes background half-stroke outset',
    () async {
      final palette = ColorResolver(),
          overlay = SelectionOverlay(palette: ColorResolver());
      addTearDown(overlay.dispose);
      final geometry = snapshot([item('cell')]);
      expectQuad(
        selectionQuad(geometry['cell']!, palette: palette, cameraRotation: 0),
        rect(const Rect.fromLTRB(19, 19, 61, 51)),
      );
      final actual = await render(overlay, geometry, ['cell']);
      expect(
        actual,
        await reference([rect(const Rect.fromLTRB(19, 19, 61, 51))]),
      );
      expect(pixel(actual, 18, 30), [47, 128, 237, 255]);
      expect(pixel(actual, 19, 30), [47, 128, 237, 255]);
      expect(pixel(actual, 20, 30), [0, 0, 0, 0]);
      expect(pixel(actual, 40, 35), [0, 0, 0, 0]);
      expect(overlay.outlineCount, 1);
    },
  );

  test('fixed screen thickness survives camera scale and rotation', () async {
    final overlay = SelectionOverlay(palette: ColorResolver());
    addTearDown(overlay.dispose);
    final geometry = snapshot([
      item('cell', x: 30, y: 30, size: 20, components: []),
    ]);
    for (final scale in [.5, 1.0, 2.0, 4.0]) {
      final actual = await render(
        overlay,
        geometry,
        ['cell'],
        scale: scale,
        camera: true,
      );
      final row = [
        for (var x = 0; x < 128; x++)
          if (pixel(actual, x, 64)[3] > 0) x,
      ];
      expect(
        row.length,
        4,
        reason: 'two vertical edges, each exactly 2 pixels at scale $scale',
      );
      expect(
        actual,
        await reference(
          [rect(const Rect.fromLTRB(30, 30, 50, 50))],
          scale: scale,
          camera: true,
        ),
      );
    }
    expect(
      await render(
        overlay,
        geometry,
        ['cell'],
        scale: 2,
        rotation: .7,
        camera: true,
      ),
      await reference(
        [rect(const Rect.fromLTRB(30, 30, 50, 50))],
        scale: 2,
        rotation: .7,
        camera: true,
      ),
    );
  });

  test(
    'rotated reflected nonuniform owner keeps its affine frame including stroke',
    () async {
      final palette = ColorResolver(),
          overlay = SelectionOverlay(palette: ColorResolver());
      addTearDown(overlay.dispose);
      final geometry = snapshot([
        {
          ...item('cell', size: const {'width': 30, 'height': 20}),
          'attrs': {
            'x': 70,
            'y': 25,
            'angle': 32,
            'scaleX': -1.4,
            'scaleY': .8,
          },
        },
      ]);
      final world = geometry['cell']!.world;
      final expected = [
        for (final p in rect(const Rect.fromLTRB(-1, -1, 31, 21)))
          world.project(p),
      ];
      expectQuad(
        selectionQuad(geometry['cell']!, palette: palette, cameraRotation: 0),
        expected,
      );
      expect(
        await render(overlay, geometry, ['cell']),
        await reference([expected]),
      );
    },
  );

  test(
    'multiple selections keep individual oriented quads and one world-axis aggregate',
    () async {
      final overlay = SelectionOverlay(palette: ColorResolver());
      addTearDown(overlay.dispose);
      final geometry = snapshot([
        item('a', x: 10, y: 20, size: 20, components: []),
        {
          ...item('b', size: 20, components: []),
          'attrs': {'x': 70, 'y': 30, 'angle': 30},
        },
      ]);
      final a = rect(const Rect.fromLTRB(10, 20, 30, 40));
      final b = [
        for (final p in rect(const Rect.fromLTWH(0, 0, 20, 20)))
          geometry['b']!.world.project(p),
      ];
      final union = const Rect.fromLTRB(
        10,
        20,
        30,
        40,
      ).expandToInclude(geometry['b']!.bounds!);
      expect(
        await render(overlay, geometry, ['a', 'b'], rotation: .4, camera: true),
        await reference([a, b, rect(union)], rotation: .4, camera: true),
      );
      expect(overlay.outlineCount, 3);
      await render(overlay, geometry, ['a', 'a']);
      expect(overlay.outlineCount, 1);
    },
  );

  test(
    'hidden and zero-opacity selected owners retain semantic outline only',
    () async {
      final palette = ColorResolver(),
          overlay = SelectionOverlay(palette: ColorResolver());
      addTearDown(overlay.dispose);
      final geometry = snapshot([
        {...item('hidden', x: 10, y: 10, size: 20), 'show': false},
        {
          ...item('alpha', x: 60, y: 10, size: 20),
          'attrs': {'x': 60, 'y': 10, 'alpha': 0},
        },
      ]);
      expectQuad(
        selectionQuad(geometry['hidden']!, palette: palette, cameraRotation: 0),
        rect(const Rect.fromLTRB(10, 10, 30, 30)),
      );
      expectQuad(
        selectionQuad(geometry['alpha']!, palette: palette, cameraRotation: 0),
        rect(const Rect.fromLTRB(60, 10, 80, 30)),
      );
      expect(
        await render(overlay, geometry, ['hidden', 'alpha']),
        await reference([
          rect(const Rect.fromLTRB(10, 10, 30, 30)),
          rect(const Rect.fromLTRB(60, 10, 80, 30)),
          rect(const Rect.fromLTRB(10, 10, 80, 30)),
        ]),
      );
    },
  );

  test(
    'visible negative-margin content expands owner frame, hidden content does not',
    () {
      final palette = ColorResolver();
      final geometry = snapshot([
        item(
          'a',
          x: 40,
          y: 50,
          size: const {'width': 80, 'height': 60},
          components: [
            {
              'type': 'icon',
              'id': 'overflow',
              'source': 'icon.svg',
              'size': 20,
              'placement': 'left-top',
              'margin': {'left': -8, 'top': -5},
            },
            {
              'type': 'icon',
              'id': 'hidden',
              'show': false,
              'source': 'icon.svg',
              'size': 20,
              'placement': 'left-top',
              'margin': {'left': -100, 'top': -100},
            },
          ],
        ),
      ]);
      expectQuad(
        selectionQuad(geometry['a']!, palette: palette, cameraRotation: 0),
        rect(const Rect.fromLTRB(32, 45, 120, 110)),
      );
    },
  );

  test(
    'upright paint union follows existing camera-dependent readable transform',
    () {
      final palette = ColorResolver();
      final geometry = snapshot([
        {
          ...item(
            'a',
            size: 20,
            components: [
              {
                'type': 'icon',
                'id': 'overflow',
                'source': 'icon.svg',
                'size': {'width': 40, 'height': 10},
                'placement': 'center',
                'attrs': {'angle': 20},
              },
            ],
          ),
          'attrs': {
            'x': 60,
            'y': 40,
            'angle': 50,
            'scaleX': -1.2,
            'scaleY': .8,
          },
        },
      ]);
      final target = geometry['a']!, layout = target.item!.components.single;
      for (final angle in [0.0, 1.5, 3.0]) {
        final component = layout
            .worldTransform(target.world, angle, target.item!.content)
            .projectRect(Offset.zero & layout.box.size);
        final inverse = target.world.inverse!;
        var local = const Rect.fromLTWH(0, 0, 20, 20);
        for (var i = 0; i < 4; i++) {
          final p = inverse.project(component.vertex(i));
          local = local.expandToInclude(Rect.fromPoints(p, p));
        }
        expectQuad(
          selectionQuad(target, palette: palette, cameraRotation: angle),
          vertices(target.world.projectRect(local)),
        );
      }
    },
  );

  test(
    'configured color alpha controls outset for background tint and rect stroke',
    () {
      final palette = ColorResolver(
        colors: {'clearBorder': 'transparent', 'ink': '#11223380'},
      );
      final geometry = snapshot([
        {
          'type': 'rect',
          'id': 'clear',
          'size': 20,
          'stroke': {'width': 6, 'color': 'clearBorder'},
        },
        {
          'type': 'rect',
          'id': 'ink',
          'size': 20,
          'stroke': {'width': 6, 'color': 'ink', 'alignment': 0},
        },
        item(
          'bg',
          x: 30,
          y: 30,
          size: 20,
          components: [
            {
              'type': 'background',
              'id': 'bg',
              'tint': 'clearBorder',
              'source': {
                'type': 'rect',
                'borderWidth': 6,
                'borderColor': 'ink',
              },
            },
          ],
        ),
      ]);
      expectQuad(
        selectionQuad(geometry['clear']!, palette: palette, cameraRotation: 0),
        rect(const Rect.fromLTWH(0, 0, 20, 20)),
      );
      // Preserve release overlay half-width even for an outside-aligned stroke.
      expectQuad(
        selectionQuad(geometry['ink']!, palette: palette, cameraRotation: 0),
        rect(const Rect.fromLTRB(-3, -3, 23, 23)),
      );
      expectQuad(
        selectionQuad(geometry['bg']!, palette: palette, cameraRotation: 0),
        rect(const Rect.fromLTWH(30, 30, 20, 20)),
      );
    },
  );

  test(
    'deselection and geometry publication changes retain no old selection paths',
    () async {
      final overlay = SelectionOverlay(palette: ColorResolver());
      addTearDown(overlay.dispose);
      final before = snapshot([
        item('a', x: 10, y: 10, size: 20, components: []),
      ]);
      final record = before['a']!.data;
      final after = before.prepare({
        const PatchMapTarget('a'): Map<String, Object?>.unmodifiable({
          ...record,
          'attrs': <String, Object?>{'x': 70, 'y': 10},
        }),
      }, (_, _) => const Size(12, 8)).snapshot;
      final path = overlay.pathIdentity, paint = overlay.paintIdentity;
      await render(overlay, before, ['a']);
      final moved = await render(overlay, after, ['a']);
      expect(pixel(moved, 9, 20)[3], 0);
      expect(pixel(moved, 69, 20)[3], 255);
      final empty = await render(overlay, after, []);
      expect(empty.every((byte) => byte == 0), isTrue);
      expect(overlay.outlineCount, 0);
      expect(overlay.resolvedTargetCount, 0);
      expect(overlay.pathIdentity, same(path));
      expect(overlay.paintIdentity, same(paint));
      expect((path as Path).getBounds(), Rect.zero);
    },
  );

  test(
    'only supplied selected IDs are resolved, no traversal of 10000 unselected cells',
    () async {
      final overlay = SelectionOverlay(palette: ColorResolver());
      addTearDown(overlay.dispose);
      final geometry = snapshot([
        {
          'type': 'grid',
          'id': 'grid',
          'cells': List.generate(100, (_) => List.filled(100, 1)),
          'item': {'size': 20, 'components': []},
        },
      ]);
      var visits = 0;
      final selected = Iterable<String>.generate(1, (_) {
        visits++;
        return 'grid.0.0';
      });
      await render(overlay, geometry, selected);
      expect(visits, 1);
      expect(overlay.resolvedTargetCount, 1);
      expect(overlay.outlineCount, 1);
      await render(overlay, geometry, ['missing', 'grid']);
      expect(overlay.resolvedTargetCount, 2);
      expect(overlay.outlineCount, 0);
    },
  );

  test(
    'empty/unknown geometry no-ops, invalid camera and use-after-dispose reject',
    () async {
      final overlay = SelectionOverlay(palette: ColorResolver());
      final geometry = snapshot([
        {'type': 'rect', 'id': 'empty', 'size': 0},
      ]);
      expect(
        (await render(overlay, geometry, [
          'empty',
          'missing',
        ])).every((byte) => byte == 0),
        isTrue,
      );
      final recorder = PictureRecorder(), canvas = Canvas(recorder);
      expect(
        () => overlay.paint(
          canvas,
          geometry,
          [],
          cameraScale: double.nan,
          cameraRotation: 0,
        ),
        throwsArgumentError,
      );
      expect(
        () => overlay.paint(
          canvas,
          geometry,
          [],
          cameraScale: -1,
          cameraRotation: 0,
        ),
        throwsArgumentError,
      );
      expect(
        () => overlay.paint(
          canvas,
          geometry,
          [],
          cameraScale: 1,
          cameraRotation: double.infinity,
        ),
        throwsArgumentError,
      );
      overlay.dispose();
      overlay.dispose();
      expect(overlay.isDisposed, isTrue);
      expect(
        () => overlay.paint(
          canvas,
          geometry,
          [],
          cameraScale: 1,
          cameraRotation: 0,
        ),
        throwsStateError,
      );
      recorder.endRecording().dispose();
    },
  );

  test(
    'relation owner selection reuses its published world logical bounds AABB',
    () async {
      final palette = ColorResolver(),
          overlay = SelectionOverlay(palette: ColorResolver());
      addTearDown(overlay.dispose);
      final geometry = snapshot([
        item('a', x: 10, y: 10, size: 10, components: []),
        item('b', x: 70, y: 40, size: 10, components: []),
        {
          'type': 'relations',
          'id': 'links',
          'links': [
            {'source': 'a', 'target': 'b'},
          ],
          'style': {'width': 6},
        },
      ]);
      final relation = geometry['links']!;
      expect(relation.localBounds, isNull);
      expectQuad(
        selectionQuad(relation, palette: palette, cameraRotation: .5),
        rect(relation.bounds!),
      );
      expect(
        await render(overlay, geometry, ['links']),
        await reference([rect(relation.bounds!)]),
      );
    },
  );
}
