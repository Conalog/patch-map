import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/rendering/draw_objects.dart';
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

  test(
    'compiled bars drop unstarted global work and immediately reacquire',
    () async {
      final h = _harness();
      final blockers = List.generate(4, (_) => Completer<void>());
      final pending = [
        for (final blocker in blockers) h.queue.schedule(() => blocker.future),
      ];
      final doc = const DatasetReader().read([
        {
          'type': 'item',
          'id': 'bar',
          'size': 20,
          'components': [
            {
              'type': 'bar',
              'id': 'bar',
              'source': {'fill': '#ffffff', 'radius': 3},
              'size': {'width': 20, 'height': 20},
            },
          ],
        },
      ]);
      h.resources.retain();
      final first = h.initial(doc);
      final geometry = first.geometry;
      final pool = h.resources.bars!;
      final mask = (first.node(0).components.single.content as RectangleContent)
          .barMask!;
      final ready = mask.ready;
      final created = <Image>[];
      final prior = Image.onCreate;
      Image.onCreate = (image) {
        created.add(image);
        prior?.call(image);
      };
      RenderPublication? next;
      try {
        expect(h.queue.running, 4);
        expect(h.optimization.reservedBytes, greaterThan(0));
        first.dispose();
        expect(pool.referenceCount, 0);
        expect(pool.entryCount, 0);
        expect(h.optimization.chargedBytes, 0);
        expect(pool.failed(3), isFalse);
        expect(created, isEmpty);
        final node = h.resources.compiler.compile(
          geometry.nodes[0],
          initialLoad: false,
        );
        next = RenderPublication(geometry, [
          RenderPage([node]),
        ], h.resources);
        final replacement =
            (node.components.single.content as RectangleContent).barMask!;
        expect(replacement, isNot(same(mask)));
        expect(pool.referenceCount, 1);
        expect(await ready, isNull);
        for (final blocker in blockers) {
          blocker.complete();
        }
        await Future.wait(pending);
        expect(await replacement.ready, isNotNull);
        await _until(() => pool.preparingCount == 0 && h.queue.running == 0);
        expect(created.length, 2);
        expect(pool.lastCreationError, isNull);
        expect(h.optimization.reservedBytes, 0);
        expect(pool.unusedBytes, 0);
      } finally {
        for (final blocker in blockers) {
          if (!blocker.isCompleted) blocker.complete();
        }
        await Future.wait(pending);
        Image.onCreate = prior;
        first.dispose();
        next?.dispose();
        h.resources.release();
        h.close();
      }
      expect(h.optimization.chargedBytes, 0);
    },
  );

  test(
    'compiled SVG hidden demand cancels global wait without poisoning reacquire',
    () async {
      final h = _harness();
      final blockers = List.generate(4, (_) => Completer<void>());
      final pending = [
        for (final blocker in blockers) h.queue.schedule(() => blocker.future),
      ];
      final pub = h.initial(_icons());
      await Future.wait(pub.assetTargets.keys.map((asset) => asset.ready));
      final created = <Image>[];
      final prior = Image.onCreate;
      Image.onCreate = (image) {
        created.add(image);
        prior?.call(image);
      };
      try {
        _paint(h, pub);
        expect(h.resources.svgImages.entryCount, 2);
        expect(h.optimization.reservedBytes, greaterThan(0));
        h.resources.beginPaint();
        h.resources.endPaint();
        expect(h.resources.svgImages.entryCount, 0);
        expect(h.optimization.chargedBytes, 0);
        expect(created, isEmpty);
        // Reacquire before cancelled futures settle: stale cleanup must not
        // remove new entries with the same source/style/level identity.
        _paint(h, pub);
        for (final blocker in blockers) {
          blocker.complete();
        }
        await Future.wait(pending);
        await _until(
          () =>
              h.resources.svgImages.preparingCount == 0 && h.queue.running == 0,
        );
        expect(created.length, 2);
        expect(h.resources.svgImages.entryCount, 2);
        expect(h.resources.svgImages.lastCreationError, isNull);
        expect(h.optimization.reservedBytes, 0);
        _paint(h, pub);
        expect(created.length, 2);
      } finally {
        for (final blocker in blockers) {
          if (!blocker.isCompleted) blocker.complete();
        }
        await Future.wait(pending);
        Image.onCreate = prior;
        pub.dispose();
        h.close();
      }
      expect(h.optimization.chargedBytes, 0);
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
