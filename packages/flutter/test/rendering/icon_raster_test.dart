import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:conalog_patch_map/src/host/native_assets.dart';
import 'package:conalog_patch_map/src/model/dataset.dart';
import 'package:conalog_patch_map/src/rendering/canvas_renderer.dart';
import 'package:conalog_patch_map/src/semantic/geometry/geometry.dart';
import 'canvas_renderer_test.dart' as fixtures;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'cached SVG icons preserve tinted vector output and survive refresh',
    () async {
      final session = NativeAssetSession(
        fontInitializer: () async {},
        reader: (_) async => (
          'image/svg+xml',
          Uint8List.fromList(
            utf8.encode(
              '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><path d="M4 6H32V12H18V35H4Z" fill="white"/></svg>',
            ),
          ),
        ),
      );
      session.register([
        {'alias': 'fixture', 'descriptor': 'https://example.test/icon.svg'},
      ]);
      await session.ensure('fixture');
      final icon = PatchMapCanvasRenderer(session),
          vector = PatchMapCanvasRenderer(session);
      try {
        for (final tint in ['white', '#e02040']) {
          for (final alpha in [1.0, 0.5]) {
            final data = PatchMapDataset.parse([
              {
                'id': 'i',
                'type': 'item',
                'size': 40,
                'attrs': {'x': 30, 'y': 30, 'alpha': alpha},
                'components': [
                  {
                    'id': 'icon',
                    'type': 'icon',
                    'size': 40,
                    'source': 'fixture',
                    'tint': tint,
                  },
                ],
              },
            ]);
            final geometry = buildGeometry(data);
            final p = geometry.primitives.single;
            // Same geometry through the standalone vector lane bypasses icon rasterization.
            final reference = PatchMapGeometry(
              primitives: [
                GeometryPrimitive(
                  ownerId: p.ownerId,
                  componentId: p.componentId,
                  type: 'image',
                  value: p.value,
                  localRect: p.localRect,
                  transform: p.transform,
                  opacity: p.opacity,
                  visible: p.visible,
                  contentOrientation: p.contentOrientation,
                ),
              ],
              targets: geometry.targets,
              bounds: geometry.bounds,
            );
            final state = fixtures.snapshot(data, geometry);
            for (final rotation in [0.0, 37.0, 180.0]) {
              final actual = await fixtures.raster(
                icon,
                fixtures.snapshot(data, geometry, rotation: rotation),
              );
              final expected = await fixtures.raster(
                vector,
                fixtures.snapshot(data, reference, rotation: rotation),
              );
              var delta = 0;
              for (var i = 0; i < actual.length; i++)
                delta += (actual[i] - expected[i]).abs();
              expect(
                delta / actual.length,
                lessThan(3),
                reason: 'only edge sampling may differ',
              );
            }
            for (final scale in [0.49, 0.51, 0.99, 1.01, 100.0, 1.0]) {
              final zoomed = fixtures.snapshot(
                data,
                geometry,
                scale: scale,
                pixelRatio: 2,
              );
              final actual = await fixtures.raster(icon, zoomed);
              final fresh = PatchMapCanvasRenderer(session);
              try {
                expect(
                  actual,
                  orderedEquals(await fixtures.raster(fresh, zoomed)),
                );
              } finally {
                fresh.dispose();
              }
            }
            icon.prepare(state);
            icon.refreshAssets(state);
            expect(await fixtures.raster(icon, state), isNotEmpty);
          }
        }
      } finally {
        icon.dispose();
        vector.dispose();
        expect(icon.commandCount, 0);
        await session.dispose();
      }
    },
  );
}
