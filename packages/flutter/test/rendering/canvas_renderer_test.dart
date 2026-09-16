import 'dart:ui' as ui;
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:conalog_patch_map/src/engine/ports.dart';
import 'package:conalog_patch_map/src/model/dataset.dart';
import 'package:conalog_patch_map/src/rendering/canvas_renderer.dart';
import 'package:conalog_patch_map/src/rendering/color.dart';
import 'package:conalog_patch_map/src/rendering/selection.dart';
import 'package:conalog_patch_map/src/semantic/geometry/geometry.dart';
import 'package:conalog_patch_map/src/semantic/text/layout.dart';

PatchMapRenderSnapshot snapshot(
  PatchMapDataset dataset,
  PatchMapGeometry geometry, {
  JsonMap theme = const {},
  JsonMap visual = const {},
  List<String> selected = const [],
  double rotation = 0,
}) => PatchMapRenderSnapshot(
  dataset: dataset,
  geometry: geometry,
  projectionRevision: 0,
  overlays: const {},
  selectedIds: selected,
  viewport: PatchMapRenderViewport(
    centerX: 50,
    centerY: 50,
    scale: 1,
    width: 100,
    height: 100,
    pixelRatio: 1,
    rotation: rotation,
  ),
  revisions: const PatchMapRevisionTuple(0, 0, 0),
  presentationAlpha: const {},
  theme: theme,
  selectionPolicy: {'visual': visual},
);

Future<List<int>> pixel(
  PatchMapCanvasRenderer renderer,
  PatchMapRenderSnapshot state,
  int x,
  int y,
) async {
  final bytes = await raster(renderer, state);
  final offset = (y * 100 + x) * 4;
  return [for (var i = 0; i < 4; i++) bytes[offset + i]];
}

Future<Uint8List> raster(
  PatchMapCanvasRenderer renderer,
  PatchMapRenderSnapshot state,
) async {
  renderer.prepare(state);
  final recorder = ui.PictureRecorder();
  renderer.paint(
    ui.Canvas(recorder),
    const ui.Size(100, 100),
    state,
    const ui.Color(0xffffffff),
  );
  final picture = recorder.endRecording();
  final image = await picture.toImage(100, 100);
  final bytes = (await image.toByteData())!;
  final result = Uint8List.fromList(bytes.buffer.asUint8List());
  image.dispose();
  picture.dispose();
  return result;
}

void main() {
  test('alpha bars ignore source borders and nonnumeric radius', () async {
    Future<Uint8List> draw(Map<String, dynamic> source) async {
      final dataset = PatchMapDataset.parse([
        {
          'type': 'item',
          'id': 'i',
          'size': 80,
          'components': [
            {'type': 'bar', 'id': 'b', 'size': 40, 'source': source},
          ],
        },
      ]);
      final renderer = PatchMapCanvasRenderer(null);
      try {
        return await raster(
          renderer,
          snapshot(dataset, buildGeometry(dataset)),
        );
      } finally {
        renderer.dispose();
      }
    }

    final square = await draw({'fill': '#287ac7'});
    for (final radius in [
      0,
      [8, 4, 2, 1],
      {'topLeft': 8},
    ]) {
      expect(
        await draw({
          'fill': '#287ac7',
          'borderWidth': 5,
          'borderColor': '#000000',
          'radius': radius,
        }),
        orderedEquals(square),
      );
    }
    expect(
      await draw({'fill': '#287ac7', 'radius': 8}),
      isNot(orderedEquals(square)),
    );
  });

  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'incremental text paint matches rebuild across cached values and asset refresh',
    () async {
      final data = PatchMapDataset.parse([
        {
          'id': 'g',
          'type': 'grid',
          'cells': [
            [1, 1],
          ],
          'gap': 4,
          'item': {
            'size': {'width': 40, 'height': 80},
            'components': [
              {
                'id': 'bg',
                'type': 'background',
                'source': {
                  'fill': '#112233',
                  'borderWidth': 2,
                  'borderColor': '#888888',
                },
              },
              {
                'id': 't',
                'type': 'text',
                'text': '12',
                'placement': 'center',
                'style': {
                  'fontSize': 'auto',
                  'autoFont': {'min': 8, 'max': 14},
                  'fill': 'white',
                },
              },
            ],
          },
        },
      ]);
      final retained = PatchMapCanvasRenderer(null);
      var geometry = buildGeometry(data, textLayouter: layoutGeometryText);
      await raster(retained, snapshot(data, geometry));
      for (final value in ['1234', '1234', '99', '12', '99']) {
        final texts = {'g.0.0\u0000t': value, 'g.0.1\u0000t': value};
        geometry = projectTextValues(geometry, texts, layoutGeometryText)!;
        final state = snapshot(data, geometry);
        final actual = await raster(retained, state);
        final fresh = PatchMapCanvasRenderer(null);
        final full = buildGeometry(
          data,
          textLayouter: layoutGeometryText,
          overlays: {
            for (final e in texts.entries) e.key: {'text': e.value},
          },
        );
        expect(
          actual,
          orderedEquals(await raster(fresh, snapshot(data, full))),
        );
        fresh.dispose();
        retained.refreshAssets(state);
        expect(await raster(retained, state), orderedEquals(actual));
      }
      retained.dispose();
      expect(retained.commandCount, 0);
    },
  );
  test(
    'text stroke accepts direct CSS colors and renderer counters release',
    () async {
      Future<Uint8List> draw(Object stroke) async {
        final dataset = PatchMapDataset.parse([
          {
            'type': 'text',
            'text': 'A',
            'size': 60,
            'style': {
              'fontSize': 30,
              'fill': '#ffffff',
              'stroke': {'color': stroke, 'width': 3, 'join': 'round'},
            },
          },
        ]);
        final renderer = PatchMapCanvasRenderer(null, antialias: false);
        try {
          final bytes = await raster(
            renderer,
            snapshot(
              dataset,
              buildGeometry(dataset, textLayouter: layoutGeometryText),
            ),
          );
          expect(renderer.commandCount, greaterThan(0));
          expect(renderer.visiblePrimitiveCount, 1);
          return bytes;
        } finally {
          renderer.dispose();
          expect(renderer.commandCount, 0);
          expect(renderer.visiblePrimitiveCount, 0);
        }
      }

      final canonical = await draw('#ff0000');
      expect(await draw('red'), orderedEquals(canonical));
    },
  );
  test(
    'retained bar meshes equal full rendering across height zero, rotation and selection',
    () async {
      final dataset = PatchMapDataset.parse([
        {
          'type': 'item',
          'id': 'i',
          'size': 40,
          'attrs': {'x': 70, 'y': 70, 'angle': 180},
          'components': [
            {
              'type': 'bar',
              'id': 'b',
              'size': {'width': 12, 'height': 10},
              'source': {'fill': '#287ac7', 'radius': 3},
            },
          ],
        },
      ]);
      var geometry = buildGeometry(dataset);
      final incremental = PatchMapCanvasRenderer(null);
      await raster(incremental, snapshot(dataset, geometry));
      try {
        for (final height in [0.0, 30.0, 5.0, 40.0]) {
          geometry = projectBarHeights(geometry, [
            'i\u0000b',
          ], Float64List.fromList([height]))!;
          final full = buildGeometry(
            dataset,
            overlays: {
              'i\u0000b': {
                'size': {'height': height},
              },
            },
          );
          final rebuilt = PatchMapCanvasRenderer(null);
          final state = snapshot(dataset, geometry, selected: ['i']);
          try {
            expect(
              await raster(incremental, state),
              orderedEquals(
                await raster(rebuilt, snapshot(dataset, full, selected: ['i'])),
              ),
            );
          } finally {
            rebuilt.dispose();
          }
          if (height > 0) {
            final primitive = geometry.primitives.single,
                transform = readableTransform(primitive);
            final center = transform.project(
              primitive.localRect.width / 2,
              primitive.localRect.height / 2,
            );
            final hit = incremental.hitTestTarget(
              ui.Offset(center.x, center.y),
            );
            expect(hit?.id, 'i');
            expect(hit?.componentId, 'b');
          }
        }
      } finally {
        incremental.dispose();
      }
    },
  );
  test(
    'justify expands word gaps while v1 alpha raster ignores small-caps and shadow',
    () async {
      Future<Uint8List> text(JsonMap style) async {
        final data = PatchMapDataset.parse([
          {
            'type': 'text',
            'id': 't',
            'text': 'a a\nAAAA',
            'size': 100,
            'style': {'fontFamily': 'Ahem', 'fontSize': 20, ...style},
          },
        ]);
        final renderer = PatchMapCanvasRenderer(null);
        try {
          return await raster(
            renderer,
            snapshot(
              data,
              buildGeometry(data, textLayouter: layoutGeometryText),
            ),
          );
        } finally {
          renderer.dispose();
        }
      }

      final left = await text({}), justified = await text({'align': 'justify'});
      int firstLineRight(Uint8List bytes) {
        var right = -1;
        for (var y = 0; y < 20; y++)
          for (var x = 0; x < 100; x++) {
            if (bytes[(y * 100 + x) * 4] < 128) right = x > right ? x : right;
          }
        return right;
      }

      expect(firstLineRight(justified), greaterThan(firstLineRight(left) + 5));
      expect(
        await text({'fontVariant': 'small-caps', 'dropShadow': true}),
        orderedEquals(left),
      );
    },
  );
  test(
    'text raster applies component tint precedence and supports authored stroke',
    () async {
      final dataset = PatchMapDataset.parse([
        {
          'type': 'text',
          'id': 't',
          'text': 'A',
          'size': 40,
          'attrs': {'x': 5, 'y': 5},
          'style': {
            'fontSize': 20,
            'fill': '#ff0000',
            'stroke': '#ffffff',
            'strokeWidth': 2,
          },
        },
        {
          'type': 'item',
          'id': 'i',
          'size': 40,
          'attrs': {'x': 50, 'y': 5},
          'components': [
            {
              'type': 'text',
              'id': 'label',
              'text': 'A',
              'style': {'fontSize': 20, 'fill': '#ff0000'},
            },
          ],
        },
      ]);
      final renderer = PatchMapCanvasRenderer(null);
      final state = snapshot(
        dataset,
        buildGeometry(dataset, textLayouter: layoutGeometryText),
      );
      renderer.prepare(state);
      final recorder = ui.PictureRecorder();
      renderer.paint(
        ui.Canvas(recorder),
        const ui.Size(100, 100),
        state,
        const ui.Color(0xff000000),
      );
      final picture = recorder.endRecording(),
          image = await picture.toImage(100, 100),
          bytes = (await image.toByteData())!;
      var red = 0, white = 0;
      for (var y = 0; y < 60; y++)
        for (var x = 0; x < 100; x++) {
          final offset = (y * 100 + x) * 4,
              r = bytes.getUint8(offset),
              g = bytes.getUint8(offset + 1),
              b = bytes.getUint8(offset + 2);
          if (x < 50 && r > 100 && g < 10 && b < 10) red++;
          if (x >= 50 && r > 100 && g > 100 && b > 100) white++;
        }
      expect(red, greaterThan(0));
      expect(white, greaterThan(0));
      image.dispose();
      picture.dispose();
      renderer.dispose();
    },
  );
  test(
    'packed colors, theme chains, CSS functions and tint alpha retain parser semantics',
    () {
      expect(mapColor(0x112233).toARGB32(), 0xff112233);
      expect(mapColor(0x11223380).toARGB32(), 0x80112233);
      expect(mapColor('#0f08').toARGB32(), 0x8800ff00);
      expect(mapColor('rgba(255, 0, 0, 0.5)').toARGB32(), 0x80ff0000);
      expect(mapColor('hsl(120, 100%, 50%)').toARGB32(), 0xff00ff00);
      expect(
        mapColor('custom', const ui.Color(0), {
          'custom': 'primary.default',
          'primary.default': '#12345678',
        }).toARGB32(),
        0x78123456,
      );
      expect(mapColor('black').toARGB32(), 0xff1a1a1a);
      expect(
        mapColor('custom', const ui.Color(0), {
          'custom': 'other',
          'other': 'custom',
        }),
        mapColor('custom'),
      );
      expect(
        multiplyColor(
          const ui.Color(0x80ff8040),
          const ui.Color(0x8080ff80),
          0.5,
        ).toARGB32(),
        0x20808020,
      );
    },
  );
  test(
    'indexed mesh uses shared geometry and honors theme and parent alpha',
    () async {
      final dataset = PatchMapDataset.parse([
        {
          'type': 'rect',
          'id': 'r',
          'size': 40,
          'attrs': {'x': 10, 'y': 10, 'alpha': 0.5},
          'fill': 'primary.default',
        },
      ]);
      final geometry = buildGeometry(dataset),
          renderer = PatchMapCanvasRenderer(null);
      final state = snapshot(
        dataset,
        geometry,
        theme: {'primary.default': '#ff0000'},
      );
      expect(await pixel(renderer, state, 20, 20), [255, 127, 127, 255]);
      expect(identical(renderer.geometry, geometry), isTrue);
      expect(await pixel(renderer, state, 80, 80), [255, 255, 255, 255]);
      renderer.dispose();
      expect(renderer.geometry, isNull);
    },
  );
  test('relations render with color alpha exactly once', () async {
    final dataset = PatchMapDataset.parse([
      {
        'type': 'item',
        'id': 'a',
        'size': 10,
        'attrs': {'x': 5, 'y': 45},
        'components': [],
      },
      {
        'type': 'item',
        'id': 'b',
        'size': 10,
        'attrs': {'x': 85, 'y': 45},
        'components': [],
      },
      {
        'type': 'relations',
        'id': 'r',
        'links': [
          {'source': 'a', 'target': 'b'},
        ],
        'style': {'color': '#ff0000', 'alpha': 0.5, 'width': 6},
      },
    ]);
    final renderer = PatchMapCanvasRenderer(null);
    expect(
      await pixel(renderer, snapshot(dataset, buildGeometry(dataset)), 50, 50),
      [255, 128, 128, 255],
    );
    renderer.dispose();
  });
  test(
    'selection honors encoded component IDs, display modes and stroke policy',
    () {
      final dataset = PatchMapDataset.parse([
        {
          'type': 'item',
          'id': 'owner::special',
          'size': 20,
          'components': [
            {
              'type': 'bar',
              'id': 'bar:one',
              'source': {'fill': '#ff0000'},
              'size': {'width': 5, 'height': 10},
            },
          ],
        },
        {
          'type': 'rect',
          'id': 'second',
          'size': 10,
          'attrs': {'x': 50},
        },
      ]);
      final geometry = buildGeometry(dataset),
          selection = SelectionGeometry(buildGeometry(dataset), 0, {});
      final component = selection.quad('owner::special::bar:bar:one');
      expect(MapBounds.points(component).width, 5);
      expect(MapBounds.points(component).height, 10);
      expect(
        geometry.targets.containsKey('owner::special\u0000bar:one'),
        isTrue,
      );
      expect(
        selection.paths(['owner::special', 'second'], 'all'),
        hasLength(3),
      );
      expect(
        selection.paths(['owner::special', 'second'], 'element-only'),
        hasLength(2),
      );
      expect(
        selection.paths(['owner::special', 'second'], 'group-only'),
        hasLength(1),
      );
      expect(selection.paths(['owner::special'], 'hidden'), isEmpty);
      expect(selectionStrokeWidth({'strokeWidth': 4}, 0.25), 16);
      expect(
        selectionStrokeWidth({
          'strokeWidth': 4,
          'strokeScale': 'viewport',
          'minStrokeWidth': 2,
        }, 0.25),
        8,
      );
    },
  );
  test(
    'selection outline paints authored visual color and hidden mode',
    () async {
      final dataset = PatchMapDataset.parse([
        {
          'type': 'item',
          'id': 'i',
          'size': 20,
          'attrs': {'x': 20, 'y': 20},
          'components': [],
        },
      ]);
      final geometry = buildGeometry(dataset),
          renderer = PatchMapCanvasRenderer(null);
      expect(
        await pixel(
          renderer,
          snapshot(
            dataset,
            geometry,
            selected: ['i'],
            visual: {'color': '#00ff00', 'strokeWidth': 4},
          ),
          20,
          30,
        ),
        [0, 255, 0, 255],
      );
      expect(
        await pixel(
          renderer,
          snapshot(
            dataset,
            geometry,
            selected: ['i'],
            visual: {'displayMode': 'hidden'},
          ),
          20,
          30,
        ),
        [255, 255, 255, 255],
      );
      renderer.dispose();
    },
  );
}
