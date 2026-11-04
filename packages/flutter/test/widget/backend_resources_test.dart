import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui';
import 'package:conalog_patch_map/src/api/target.dart';
import 'package:conalog_patch_map/src/dataset/colors.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/frame/resource_retirement.dart';
import 'package:conalog_patch_map/src/geometry/geometry_snapshot.dart';
import 'package:conalog_patch_map/src/presentation/record_delta.dart';
import 'package:conalog_patch_map/src/rendering/draw_objects.dart';
import 'package:conalog_patch_map/src/rendering/render_publication.dart';
import 'package:conalog_patch_map/src/rendering/render_resources.dart';
import 'package:conalog_patch_map/src/resources/asset_registry.dart';
import 'package:conalog_patch_map/src/resources/images/image_source_store.dart';
import 'package:conalog_patch_map/src/resources/images/image_store.dart';
import 'package:conalog_patch_map/src/resources/preparation_queue.dart';
import 'package:conalog_patch_map/src/resources/resource_budget.dart';
import 'package:conalog_patch_map/src/session/session_backend.dart';
import 'package:conalog_patch_map/src/widget/map_backend.dart';
import 'package:flutter_test/flutter_test.dart';

const good =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="red"/></svg>';
const unsupported =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><foreignObject width="20" height="10"><div>content</div></foreignObject></svg>';
Future<void> tick() => Future<void>.delayed(Duration.zero);

class Harness {
  Harness(
    Future<Uint8List> Function(String) load, {
    void Function(DrawAsset)? changed,
  }) {
    sources = ImageSourceStore(assetLoader: (key, _) => load(key));
    raster = RasterImageStore(
      sources: sources,
      outputBudget: output,
      retirement: retirement,
    );
    resources = RenderResources(
      palette: palette,
      registry: registry,
      sources: sources,
      raster: raster,
      optimizationBudget: optimization,
      preparations: queue,
      retirement: retirement,
      invalidate: () {},
      onAssetChanged: changed ?? (_) {},
      onClosed: () {},
      active: true,
    );
    backend = MapBackend(
      palette: palette,
      registry: registry,
      invalidate: () {},
      onAssetFailure: (_) {},
      onReplacement: () {},
    );
  }
  final palette = ColorResolver(), registry = AssetRegistry();
  final retirement = ResourceRetirement(), queue = PreparationQueue();
  final optimization = ResourceBudget(limitBytes: 2 * 1024 * 1024),
      output = ResourceBudget(limitBytes: 256 * 1024 * 1024);
  late ImageSourceStore sources;
  late RasterImageStore raster;
  late RenderResources resources;
  late MapBackend backend;
  RenderPublication initial(DatasetDocument doc) {
    final geometry = GeometrySnapshot.compile(doc, resources.text.measure);
    resources.initialize(geometry);
    final nodes = [
      for (var i = 0; i < geometry.nodes.length; i++)
        resources.compiler.compile(geometry.nodes[i], initialLoad: true)
          ..retain(),
    ];
    final pub = RenderPublication(geometry, [RenderPage(nodes)], resources);
    resources.applyCounts(pub.assetCounts);
    for (final node in nodes) {
      node.release();
    }
    return pub;
  }

  void close() {
    resources.close();
    raster.close();
    sources.close();
    queue.close();
    optimization.close();
    output.close();
    retirement.close();
    backend.close();
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'publication releases dependency hints after starting animation',
    () async {
      final h = Harness((_) async => Uint8List(0));
      final doc = const DatasetReader().read([
        {
          'type': 'item',
          'id': 'panel',
          'size': {'width': 100, 'height': 80},
          'components': [
            {
              'type': 'bar',
              'id': 'bar',
              'source': {'fill': '#ffffff'},
              'size': {'width': '100%', 'height': '40%'},
              'animation': true,
              'placement': 'bottom',
            },
          ],
        },
      ]);
      final before = h.initial(doc);
      h.backend.publish(before, 1, 0);
      final oldBox = before.geometry.nodes[0].item!.components.single.box;
      final data = doc.targets['panel']!.components['bar']!;
      final prepared = await h.backend.prepareUpdate(
        before,
        doc,
        {
          const PatchMapTarget('panel', componentId: 'bar'): RecordDelta(
            before: data,
            after: {
              ...data,
              'size': {'width': '100%', 'height': '80%'},
            },
            fields: RecordFields.size,
          ),
        },
        generation: 1,
        animate: true,
      );
      final after = prepared.publication as RenderPublication;
      h.backend.publish(after, 1, 1);
      expect(after.takeComponentChanges(), isEmpty);
      expect(h.backend.transitions.rectangle(0, 'bar'), oldBox);
      after.dispose();
      before.dispose();
      h.close();
    },
  );
  test(
    'asset observer exception does not reject a successfully prepared resource',
    () async {
      final h = Harness(
        (_) async => Uint8List.fromList(utf8.encode(good)),
        changed: (_) => throw const FormatException('observer failure'),
      );
      final asset = h.resources.acquireAsset(
        'good.svg',
        const Color(0xffffffff),
        initialLoad: false,
      );
      Object? error;
      try {
        await asset.ready;
      } catch (e) {
        error = e;
      }
      final intrinsic = asset.intrinsicSize;
      final failure = asset.failure;
      asset.release();
      h.close();
      expect(intrinsic, const Size(20, 10));
      expect(failure, isNull);
      expect(
        error,
        isNull,
        reason: 'a notification must not replace successful readiness',
      );
    },
  );
  test(
    'geometry-only update does not wait for an unchanged initial asset',
    () async {
      final bytes = Completer<Uint8List>();
      final h = Harness((_) => bytes.future);
      final doc = const DatasetReader().read([
        {
          'type': 'image',
          'id': 'a',
          'source': 'slow.svg',
          'size': {'width': 20, 'height': 10},
        },
      ]);
      final before = h.initial(doc), record = doc.targets['a']!.data;
      var done = false;
      final task = h.backend
          .prepareUpdate(
            before,
            doc,
            {
              const PatchMapTarget('a'): RecordDelta(
                before: record,
                after: {
                  ...record,
                  'attrs': <String, Object?>{
                    ...(record['attrs'] as Map? ?? const {}),
                    'x': 10,
                  },
                },
                fields: RecordFields.attrsTransform,
              ),
            },
            generation: 1,
            animate: false,
          )
          .then((value) {
            done = true;
            return value;
          });
      await tick();
      await tick();
      final completedWithoutImage = done;
      bytes.complete(Uint8List.fromList(utf8.encode(good)));
      final next = await task;
      final after = next.publication as RenderPublication;
      expect(identical(after.node(0).assets, before.node(0).assets), true);
      expect(identical(after.assetTargets, before.assetTargets), true);
      expect(identical(after.assetCounts, before.assetCounts), true);
      await after.node(0).assets.single.ready;
      expect(after.node(0).assets.single.intrinsicSize, const Size(20, 10));
      after.dispose();
      before.dispose();
      h.close();
      expect(completedWithoutImage, true);
    },
  );
  test(
    'unsupported SVG update is an item failure and preserves independent updates',
    () async {
      final h = Harness(
        (key) async => Uint8List.fromList(
          utf8.encode(key == 'bad.svg' ? unsupported : good),
        ),
      );
      final doc = const DatasetReader().read([
        {
          'type': 'image',
          'id': 'a',
          'source': 'good.svg',
          'size': {'width': 20, 'height': 10},
        },
        {
          'type': 'rect',
          'id': 'b',
          'size': {'width': 20, 'height': 10},
        },
      ]);
      final before = h.initial(doc);
      await before.node(0).assets.single.ready;
      final a = doc.targets['a']!.data, b = doc.targets['b']!.data;
      Object? error;
      PreparedUpdate? result;
      try {
        result = await h.backend.prepareUpdate(
          before,
          doc,
          {
            const PatchMapTarget('a'): RecordDelta(
              before: a,
              after: {...a, 'source': 'bad.svg'},
              fields: RecordFields.source,
            ),
            const PatchMapTarget('b'): RecordDelta(
              before: b,
              after: {
                ...b,
                'attrs': <String, Object?>{
                  ...(b['attrs'] as Map? ?? const {}),
                  'x': 10,
                },
              },
              fields: RecordFields.attrsTransform,
            ),
          },
          generation: 1,
          animate: false,
        );
      } catch (e) {
        error = e;
      }
      if (result != null) {
        (result.publication as RenderPublication).dispose();
      }
      before.dispose();
      h.close();
      expect(
        error,
        isNull,
        reason:
            'unsupported source artwork is a preparation failure, not a whole-map internal error',
      );
      expect(result!.failures.keys, contains('a'));
    },
  );
  test(
    'different visible SVG demands retain their own optimization references',
    () async {
      final h = Harness((_) async => Uint8List.fromList(utf8.encode(good)));
      final doc = const DatasetReader().read([
        for (var i = 0; i < 16; i++)
          {
            'type': 'image',
            'id': 'a$i',
            'source': 'good.svg',
            'size': {'width': 20, 'height': 10},
          },
      ]);
      final geometry = GeometrySnapshot.compile(doc, h.resources.text.measure);
      h.resources.initialize(geometry);
      final a = h.resources.acquireAsset(
        'good.svg',
        const Color(0xffffffff),
        initialLoad: true,
      );
      final b = h.resources.acquireAsset(
        'good.svg',
        const Color(0xffffffff),
        initialLoad: true,
      );
      await a.ready;
      await b.ready;
      h.resources.applyCounts({a.creationKey!: 16});
      final created = <Image>[];
      final previous = Image.onCreate;
      Image.onCreate = (image) {
        created.add(image);
        previous?.call(image);
      };
      Future<void> paint(DrawAsset asset, Rect destination) async {
        final recorder = PictureRecorder();
        asset.paint(Canvas(recorder), destination, 1);
        recorder.endRecording().dispose();
        final deadline = DateTime.now().add(const Duration(seconds: 8));
        while (h.resources.svgImages.preparingCount > 0 ||
            h.queue.running > 0) {
          if (DateTime.now().isAfter(deadline)) fail('rasterization timeout');
          await Future<void>.delayed(const Duration(milliseconds: 1));
        }
      }

      try {
        await paint(a, const Rect.fromLTWH(0, 0, 20, 10));
        await paint(b, const Rect.fromLTWH(0, 0, 300, 150));
        await paint(a, const Rect.fromLTWH(0, 0, 20, 10));
        final builds = created.length;
        a.release();
        b.release();
        h.close();
        expect(
          builds,
          2,
          reason:
              'returning to an already prepared visible demand must reuse its image',
        );
      } finally {
        Image.onCreate = previous;
        h.close();
      }
    },
  );

  test(
    'whole-diagram SVG count follows a batch changing all sixteen sources',
    () async {
      final h = Harness((_) async => Uint8List.fromList(utf8.encode(good)));
      final doc = const DatasetReader().read([
        for (var i = 0; i < 16; i++)
          {
            'type': 'image',
            'id': 'a$i',
            'source': 'old.svg',
            'size': {'width': 20, 'height': 10},
          },
      ]);
      final before = h.initial(doc);
      await before.node(0).assets.single.ready;
      final result = await h.backend.prepareUpdate(
        before,
        doc,
        {
          for (var i = 0; i < 16; i++)
            PatchMapTarget('a$i'): RecordDelta(
              before: doc.targets['a$i']!.data,
              after: <String, Object?>{
                ...doc.targets['a$i']!.data,
                'source': 'new.svg',
              },
              fields: RecordFields.source,
            ),
        },
        generation: 1,
        animate: false,
      );
      final after = result.publication as RenderPublication;
      h.resources.applyCounts(after.assetCounts);
      final recorder = PictureRecorder();
      after.node(0).paintStandalone(Canvas(recorder), physicalScale: 1);
      recorder.endRecording().dispose();
      final requested = h.resources.svgImages.entryCount;
      after.dispose();
      before.dispose();
      h.close();
      await tick();
      expect(
        requested,
        1,
        reason: 'new.svg now has sixteen whole-diagram uses and should qualify',
      );
    },
  );
}
