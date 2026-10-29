import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui';

import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/rendering/render_publication.dart';
import 'package:flutter_test/flutter_test.dart';

import '../widget/backend_resources_test.dart' as support;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'compiled SVG uses keep simultaneous density buckets across frames',
    () async {
      final h = _harness();
      final pub = h.initial(_icons());
      await Future.wait(pub.assetTargets.keys.map((asset) => asset.ready));
      final created = <Image>[];
      final prior = Image.onCreate;
      Image.onCreate = (image) {
        created.add(image);
        prior?.call(image);
      };
      try {
        expect(
          pub.node(0).assets.single,
          isNot(same(pub.node(1).assets.single)),
        );
        expect(pub.assetCounts.values.single, 16);
        expect(h.resources.vectors.entryCount, 1);
        final builds = <int>[];
        for (var frame = 0; frame < 3; frame++) {
          _paint(h, pub);
          h.retirement.flush();
          await _until(
            () =>
                h.resources.svgImages.preparingCount == 0 &&
                h.queue.running == 0,
          );
          builds.add(created.length);
        }
        expect(builds, [2, 2, 2]);
        expect(h.resources.svgImages.entryCount, 2);
        expect(h.optimization.liveBytes, (192 * 96 + 384 * 192) * 4);
        final previous = pub.node(0);
        final next = h.resources.compiler.compile(
          previous.geometry,
          initialLoad: false,
          previous: previous,
        )..retain();
        expect(
          next.components.single.content,
          same(previous.components.single.content),
        );
        next.release();
      } finally {
        Image.onCreate = prior;
        pub.dispose();
        h.close();
      }
      expect(created.every((image) => image.debugDisposed), isTrue);
    },
  );
}

support.Harness _harness() =>
    support.Harness((_) async => Uint8List.fromList(utf8.encode(support.good)));
DatasetDocument _icons() => const DatasetReader().read([
  for (var i = 0; i < 16; i++)
    {
      'type': 'item',
      'id': 'item$i',
      'size': 400,
      'attrs': {'x': i * 410},
      'components': [
        {
          'type': 'icon',
          'id': 'icon',
          'source': 'good.svg',
          'size': {'width': i.isEven ? 20 : 300, 'height': i.isEven ? 10 : 150},
        },
      ],
    },
]);
void _paint(support.Harness h, RenderPublication pub) {
  final recorder = PictureRecorder();
  h.resources.beginPaint();
  pub.plan.paint(
    Canvas(recorder),
    visibleSlots: pub.geometry.paintSlots,
    cameraRotation: 0,
    physicalScale: 1,
  );
  h.resources.endPaint();
  recorder.endRecording().dispose();
}

Future<void> _until(bool Function() done) async {
  final deadline = DateTime.now().add(const Duration(seconds: 8));
  while (!done()) {
    if (DateTime.now().isAfter(deadline)) fail('native preparation timeout');
    await Future<void>.delayed(const Duration(milliseconds: 1));
  }
}
