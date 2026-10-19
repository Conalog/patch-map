import 'dart:convert';
import 'dart:io';
import 'dart:ui';
import 'package:flutter/services.dart';

import 'package:conalog_patch_map/src/api/target.dart';
import 'package:conalog_patch_map/src/dataset/colors.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/frame/resource_retirement.dart';
import 'package:conalog_patch_map/src/geometry/geometry_snapshot.dart';
import 'package:conalog_patch_map/src/rendering/draw_compiler.dart';
import 'package:conalog_patch_map/src/rendering/draw_objects.dart';
import 'package:conalog_patch_map/src/rendering/draw_plan.dart';
import 'package:conalog_patch_map/src/rendering/render_publication.dart';
import 'package:conalog_patch_map/src/rendering/render_resources.dart';
import 'package:conalog_patch_map/src/rendering/static_geometry.dart';
import 'package:conalog_patch_map/src/resources/asset_registry.dart';
import 'package:conalog_patch_map/src/resources/bars/bar_masks.dart';
import 'package:conalog_patch_map/src/resources/images/image_source_store.dart';
import 'package:conalog_patch_map/src/resources/images/image_store.dart';
import 'package:conalog_patch_map/src/resources/preparation_queue.dart';
import 'package:conalog_patch_map/src/resources/resource_budget.dart';
import 'package:conalog_patch_map/src/resources/text/text_pool.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, Object?> background({
  String id = 'bg',
  Object radius = 0,
  String fill = '#405060',
  double width = 2,
}) => {
  'id': id,
  'type': 'background',
  'source': {
    'type': 'rect',
    'fill': fill,
    'radius': radius,
    'borderWidth': width,
    'borderColor': '#8090a0',
  },
};
Map<String, Object?> bar({
  Object size = 20,
  Map<String, Object?> attrs = const {},
  Object radius = 3,
  double border = 0,
}) => {
  'id': 'bar',
  'type': 'bar',
  'size': size,
  'placement': 'center',
  'attrs': attrs,
  'source': {
    'type': 'rect',
    'fill': '#e04020',
    'radius': radius,
    'borderWidth': border,
  },
};
Map<String, Object?> icon(
  String source, {
  Object size = 8,
  Map<String, Object?> attrs = const {},
}) => {
  'id': 'icon',
  'type': 'icon',
  'source': source,
  'size': size,
  'placement': 'center',
  'attrs': attrs,
};
Map<String, Object?> item(
  String id,
  double x, {
  double y = 8,
  double size = 40,
  List<Map<String, Object?>>? components,
  String orientation = 'normal',
}) => {
  'id': id,
  'type': 'item',
  'size': size,
  'attrs': {'x': x, 'y': y},
  if (orientation == 'upright') 'contentOrientation': orientation,
  'components': components ?? [background(), bar(), icon(id)],
};

class FakeAsset implements DrawAsset {
  FakeAsset(this.name, this.events);
  final String name;
  final List<String> events;
  int references = 1;
  @override
  Future<void> get ready => Future.value();
  @override
  (String, int)? get creationKey => null;
  @override
  Size get intrinsicSize => const Size(8, 8);
  @override
  Object? get failure => null;
  @override
  StackTrace? get failureStack => null;
  @override
  void updateLogicalCount(int count) {}
  @override
  void hide() {}
  @override
  void retain() => references++;
  @override
  void release() => references--;
  @override
  void paint(Canvas canvas, Rect destination, double physicalScale) {
    events.add(name);
    canvas.drawRect(destination, Paint()..color = const Color(0x800080ff));
  }
}

class Projection {
  Projection(this.geometry, this.nodes, this.pages, this.plan);
  final GeometrySnapshot geometry;
  final List<DrawNode> nodes;
  final List<RenderPage> pages;
  final RenderPlan plan;
}

class Harness {
  Harness({bool active = true}) {
    text = TextPool(palette: palette, retirement: retirement, onReady: () {});
    bars = BarMaskPool(
      representativeWidth: 20,
      budget: budget,
      retirement: retirement,
      onReady: () {},
      active: active,
    );
    compiler = DrawCompiler(
      palette: palette,
      text: text,
      assets: (source, tint, {required initialLoad, retry = false}) =>
          FakeAsset(
            source is String ? source : (source as Map)['src'] as String,
            events,
          ),
      barMasks: bars.acquire,
    );
  }
  final palette = ColorResolver(), retirement = ResourceRetirement();
  final budget = ResourceBudget(limitBytes: 2 * 1024 * 1024);
  final events = <String>[];
  late final TextPool text;
  late final BarMaskPool bars;
  late final DrawCompiler compiler;
  final projections = <Projection>[];
  Projection read(List<Map<String, Object?>> records) => project(
    GeometrySnapshot.compile(const DatasetReader().read(records), text.measure),
  );
  Projection project(GeometrySnapshot geometry, {Projection? previous}) {
    final nodes = [
      for (var i = 0; i < geometry.nodes.length; i++)
        previous != null &&
                identical(geometry.nodes[i], previous.geometry.nodes[i])
            ? previous.nodes[i]
            : compiler.compile(
                geometry.nodes[i],
                initialLoad: true,
                previous: previous?.nodes[i],
                relation: geometry.relationFor(geometry.nodes[i].id),
              ),
    ];
    final pages = <RenderPage>[];
    for (
      var start = 0;
      start < nodes.length;
      start += geometry.nodes.pageSize
    ) {
      final end = (start + geometry.nodes.pageSize).clamp(0, nodes.length);
      pages.add(RenderPage(List.unmodifiable(nodes.sublist(start, end))));
    }
    final plan = RenderPlan.build(geometry, pages, previous: previous?.plan);
    final value = Projection(geometry, nodes, pages, plan);
    projections.add(value);
    return value;
  }

  Future<void> prepared(Projection projection) async {
    await Future.wait([
      for (final node in projection.nodes)
        for (final component in node.components)
          if (component.content case RectangleContent(barMask: final mask?))
            mask.ready,
    ]);
  }

  void close() {
    for (final p in projections) {
      p.plan.dispose();
    }
    bars.close();
    text.close();
    retirement.close();
    budget.close();
  }
}

Future<Uint8List> render(
  Projection projection, {
  bool reference = false,
  List<int>? visible,
  Rect? Function(int, String)? tween,
  double rotation = 0,
}) async {
  final recorder = PictureRecorder(), canvas = Canvas(recorder);
  final slots = visible ?? projection.geometry.paintSlots;
  if (reference) {
    for (final slot in slots) {
      projection.nodes[slot].paint(
        canvas,
        cameraRotation: rotation,
        physicalScale: 1,
        barRectangle: (id) => tween?.call(slot, id),
      );
    }
  } else {
    projection.plan.paint(
      canvas,
      visibleSlots: slots,
      cameraRotation: rotation,
      physicalScale: 1,
      barRectangle: tween,
    );
  }
  final picture = recorder.endRecording();
  final image = await picture.toImage(128, 128);
  try {
    return (await image.toByteData(
      format: ImageByteFormat.rawRgba,
    ))!.buffer.asUint8List();
  } finally {
    image.dispose();
    picture.dispose();
  }
}

void compare(
  Uint8List actual,
  Uint8List reference, {
  List<(int, int)> interior = const [],
}) {
  var total = 0, ink = 0;
  for (var p = 0; p < actual.length; p += 4) {
    if (actual[p + 3] == 0 && reference[p + 3] == 0) continue;
    ink++;
    var delta = 0;
    for (var c = 0; c < 4; c++) {
      final d = (actual[p + c] - reference[p + c]).abs();
      if (d > delta) delta = d;
    }
    total += delta;
    if (delta > 3) {
      final x = (p ~/ 4) % 128, y = (p ~/ 4) ~/ 128;
      expect(
        _edgeNear(actual, x, y) || _edgeNear(reference, x, y),
        isTrue,
        reason: 'Interior changed at ($x,$y): $delta',
      );
    }
  }
  expect(
    total / ink,
    lessThan(12),
    reason: 'native contour sampling tolerance',
  );
  for (final point in interior) {
    final p = (point.$2 * 128 + point.$1) * 4;
    // Fixtures choose flat interiors for these samples.
    for (var c = 0; c < 4; c++) {
      expect((actual[p + c] - reference[p + c]).abs(), lessThanOrEqualTo(2));
    }
  }
}

bool _edgeNear(Uint8List pixels, int x, int y) {
  for (var channel = 0; channel < 4; channel++) {
    var minimum = 255, maximum = 0;
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        final xx = (x + dx).clamp(0, 127), yy = (y + dy).clamp(0, 127);
        final value = pixels[(yy * 128 + xx) * 4 + channel];
        if (value < minimum) minimum = value;
        if (value > maximum) maximum = value;
      }
    }
    if (maximum - minimum > 3) return true;
  }
  return false;
}

Map<String, Object?> component(
  GeometrySnapshot geometry,
  String id,
  String cid,
) => (geometry[id]!.data['components'] as List)
    .cast<Map<String, Object?>>()
    .singleWhere((c) => c['id'] == cid);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final bytes = await File('assets/fonts/FiraCode-VF.ttf').readAsBytes();
    await (FontLoader(
      'FiraCode',
    )..addFont(Future.value(ByteData.sublistView(bytes)))).load();
  });

  test(
    'safe prefixes draw one retained mesh and visible dynamic phases in order',
    () async {
      final h = Harness();
      addTearDown(h.close);
      final p = h.read([item('a', 8), item('b', 70)]);
      await h.prepared(p);
      expect(p.plan.staticChunkCount, 1);
      expect(p.plan.overlapComparisonCount, 1);
      final actual = await render(p),
          reference = await render(p, reference: true);
      compare(actual, reference, interior: [(28, 28), (90, 28)]);
      expect(
        p.plan.barSubmissionCount,
        1,
      ); // Two contiguous bars precede icon phase.
      h.events.clear();
      await render(p, visible: [p.geometry.topology.slots['b']!]);
      expect(h.events, ['b']);
    },
  );

  test(
    'overlap and touching paint envelopes preserve exact item ordering',
    () async {
      for (final x in [30.0, 48.0]) {
        final h = Harness();
        try {
          final p = h.read([
            item('a', 8, components: [background(), icon('a')]),
            item(
              'b',
              x,
              components: [
                background(fill: '#e03060'),
                icon('b'),
              ],
            ),
          ]);
          expect(p.plan.staticChunkCount, 0);
          expect(await render(p), await render(p, reference: true));
          expect(h.events, ['a', 'b', 'a', 'b']);
        } finally {
          h.close();
        }
      }
    },
  );

  test(
    'late, incompatible or hidden backgrounds use ordered fallback',
    () async {
      final records = [
        item('late', 8, components: [icon('late'), background()]),
        item(
          'corner',
          70,
          components: [
            background(radius: [1, 2, 3, 4]),
            icon('corner'),
          ],
        ),
        item(
          'hidden',
          8,
          y: 70,
          components: [
            {...background(), 'show': false},
            icon('hidden'),
          ],
        ),
      ];
      final h = Harness();
      addTearDown(h.close);
      final p = h.read(records);
      expect(p.plan.staticChunkCount, 0);
      expect(await render(p), await render(p, reference: true));
    },
  );

  test(
    'overflow, attrs, upright and nested parent transforms keep conservative safety',
    () async {
      final h = Harness();
      addTearDown(h.close);
      final p = h.read([
        {
          'id': 'group',
          'type': 'group',
          'attrs': {'x': 4, 'scaleX': 1.1, 'scaleY': .8},
          'children': [
            item(
              'a',
              8,
              size: 24,
              components: [background(), icon('overflow', size: 40)],
            ),
            item(
              'b',
              40,
              size: 24,
              orientation: 'upright',
              components: [
                background(),
                icon('upright', size: 20, attrs: {'rotation': .4}),
              ],
            ),
          ],
        },
      ]);
      expect(p.plan.staticChunkCount, 0);
      expect(
        await render(p, rotation: .8),
        await render(p, rotation: .8, reference: true),
      );
    },
  );

  test(
    'chunk maximum is 100 and incompatible skeleton boundaries stay contiguous',
    () {
      final h = Harness(active: false);
      addTearDown(h.close);
      final p = h.read([
        for (var i = 0; i < 205; i++)
          item('i$i', i * 44.0, components: [background(), icon('i$i')]),
      ]);
      expect(p.plan.chunkCount, 3);
      expect(p.plan.staticChunkCount, 3);
      final q = h.read([
        item('a', 8, components: [background(), icon('a')]),
        item(
          'b',
          70,
          components: [
            background(),
            {...icon('b'), 'id': 'other'},
          ],
        ),
        item('c', 130, components: [background(), icon('c')]),
      ]);
      expect(q.plan.chunkCount, 3);
      expect(q.plan.staticChunkCount, 3);
    },
  );

  test(
    'pending masks fallback, tween three/nine changes keep the same static mesh',
    () async {
      final h = Harness(active: false);
      addTearDown(h.close);
      final p = h.read([item('a', 8), item('b', 70)]);
      final mesh = p.plan.staticMeshIdentities.single;
      compare(await render(p), await render(p, reference: true));
      expect(p.plan.barSubmissionCount, 0);
      h.bars.setActive(true);
      await h.prepared(p);
      Rect tween(int slot, String id) => slot == 0
          ? const Rect.fromLTWH(10, 12, 20, 16)
          : const Rect.fromLTWH(6, 10, 28, 20);
      compare(
        await render(p, tween: tween),
        await render(p, reference: true, tween: tween),
      );
      expect(p.plan.barSubmissionCount, 2);
      expect(p.plan.staticMeshIdentities.single, same(mesh));
      expect(p.plan.meshBuildCount, 1);
    },
  );

  test(
    'bar attrs, border, undersize and clipping flush to exact Canvas fallback',
    () async {
      final h = Harness();
      addTearDown(h.close);
      final p = h.read([
        item(
          'a',
          8,
          components: [
            background(),
            bar(size: {'width': 38, 'height': 20}, attrs: {'x': 7}),
          ],
        ),
        item('b', 70, components: [background(), bar(border: 2)]),
        item('c', 8, y: 70, components: [background(), bar(size: 4)]),
        item(
          'd',
          70,
          y: 70,
          orientation: 'upright',
          components: [
            background(),
            bar(attrs: {'angle': 30}),
          ],
        ),
      ]);
      await h.prepared(p);
      expect(
        await render(p, rotation: .4),
        await render(p, reference: true, rotation: .4),
      );
      expect(p.plan.barSubmissionCount, 0);
    },
  );

  test(
    'ordinary per-item fallback still uses slices and flushes before a late background',
    () async {
      final h = Harness();
      addTearDown(h.close);
      final p = h.read([
        item(
          'a',
          8,
          components: [
            bar(),
            background(fill: '#0080ff80'),
          ],
        ),
        item(
          'b',
          70,
          components: [
            bar(),
            background(fill: '#ff800080'),
          ],
        ),
      ]);
      await h.prepared(p);
      expect(p.plan.staticChunkCount, 0);
      compare(
        await render(p),
        await render(p, reference: true),
        interior: [(28, 28), (90, 28)],
      );
      expect(p.plan.barSubmissionCount, 2);
    },
  );

  test(
    'contained transformed bar tween preserves placement before component attrs',
    () async {
      for (final orientation in ['upright', 'follow-item']) {
        final h = Harness();
        addTearDown(h.close);
        final p = h.read([
          {
            ...item(
              'a',
              15,
              size: 80,
              components: [
                background(),
                bar(
                  attrs: {'angle': 23, 'scaleX': -1.2, 'scaleY': .8, 'x': 18},
                ),
              ],
            ),
            'contentOrientation': orientation,
          },
        ]);
        await h.prepared(p);
        Rect tween(int slot, String id) => const Rect.fromLTWH(27, 34, 28, 18);
        compare(
          await render(p, tween: tween),
          await render(p, reference: true, tween: tween),
        );
        expect(p.plan.barSubmissionCount, 1);
      }
    },
  );

  test(
    'ten thousand numeric/bar edits reuse every static proof and vertex owner',
    () {
      final h = Harness(active: false);
      addTearDown(h.close);
      final p = h.read([
        {
          'id': 'grid',
          'type': 'grid',
          'gap': 2,
          'cells': List.generate(100, (_) => List.filled(100, 1)),
          'item': {
            'size': 20,
            'contentOrientation': 'follow-item',
            'components': [
              background(width: 0),
              bar(size: 10, radius: 2),
              {
                'id': 'number',
                'type': 'text',
                'text': '123',
                'style': {'fontSize': 8},
              },
            ],
          },
        },
      ]);
      expect(p.plan.staticChunkCount, 100);
      final oldMeshes = p.plan.staticMeshIdentities.toList();
      final oldText = component(p.geometry, 'grid.0.0', 'number');
      final oldBar = component(p.geometry, 'grid.0.0', 'bar');
      final changes = <PatchMapTarget, Map<String, Object?>>{};
      final nextText = Map<String, Object?>.unmodifiable({
        ...oldText,
        'text': '456',
      });
      final nextBar = Map<String, Object?>.unmodifiable({
        ...oldBar,
        'size': {'width': 10, 'height': 12},
      });
      for (var row = 0; row < 100; row++) {
        for (var col = 0; col < 100; col++) {
          changes[PatchMapTarget('grid.$row.$col', componentId: 'number')] =
              nextText;
          changes[PatchMapTarget('grid.$row.$col', componentId: 'bar')] =
              nextBar;
        }
      }
      final next = p.geometry.prepare(changes, h.text.measure).snapshot;
      final q = h.project(next, previous: p);
      expect(q.plan.staticChunkCount, 100);
      expect(q.plan.meshBuildCount, 0);
      expect(q.plan.overlapComparisonCount, 0);
      expect(q.plan.reusedChunkCount, 100);
      expect(q.plan.staticMeshIdentities.toList(), oldMeshes);
      p.plan.dispose();
      expect((oldMeshes.first as StaticGeometry).isDisposed, isFalse);
      q.plan.dispose();
      expect((oldMeshes.first as StaticGeometry).isDisposed, isTrue);
    },
  );

  test(
    'static/world/envelope/skeleton changes invalidate only their chunk proof',
    () {
      final h = Harness(active: false);
      addTearDown(h.close);
      final p = h.read([
        for (var i = 0; i < 101; i++)
          item('i$i', i * 44.0, components: [background(), icon('i$i')]),
      ]);
      final old = p.plan.staticMeshIdentities.toList();
      final record = p.geometry['i0']!.data;
      final moved = Map<String, Object?>.unmodifiable({
        ...record,
        'attrs': <String, Object?>{
          ...record['attrs'] as Map<String, Object?>,
          'x': -1,
        },
      });
      final q = h.project(
        p.geometry.prepare({
          const PatchMapTarget('i0'): moved,
        }, h.text.measure).snapshot,
        previous: p,
      );
      expect(q.plan.meshBuildCount, 1);
      expect(q.plan.staticMeshIdentities.last, same(old.last));
      expect(q.plan.staticMeshIdentities.first, isNot(same(old.first)));
      expect(q.plan.overlapComparisonCount, 4950);
    },
  );

  test(
    'compiler shares mask lease through content and releases at last plan',
    () {
      final h = Harness(active: false);
      addTearDown(h.close);
      final p = h.read([
        {
          'id': 'grid',
          'type': 'grid',
          'cells': [
            [1, 1],
          ],
          'gap': 2,
          'item': {
            'size': 40,
            'components': [background(), bar()],
          },
        },
      ]);
      final a = p.nodes[1].components[1].content as RectangleContent;
      final b = p.nodes[2].components[1].content as RectangleContent;
      expect(a, same(b));
      final mask = a.barMask!;
      expect(mask.sharedReferenceCount, 1);
      final q = h.project(p.geometry, previous: p);
      p.plan.dispose();
      expect(mask.isReleased, isFalse);
      q.plan.dispose();
      expect(mask.isReleased, isTrue);
      q.plan.dispose();
    },
  );

  test(
    'publication owns plan pages and deferred optimization never starts after close',
    () async {
      final palette = ColorResolver(), retirement = ResourceRetirement();
      final queue = PreparationQueue()..setActive(false);
      final optimization = ResourceBudget(limitBytes: 2 * 1024 * 1024);
      final output = ResourceBudget(limitBytes: 256 * 1024 * 1024);
      final sources = ImageSourceStore(
        assetLoader: (_, _) async => Uint8List.fromList(
          utf8.encode(
            '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>',
          ),
        ),
      );
      final raster = RasterImageStore(
        outputBudget: output,
        retirement: retirement,
        sources: sources,
      );
      var closed = 0, nativeImages = 0;
      final oldObserver = Image.onCreate;
      Image.onCreate = (image) {
        nativeImages++;
        oldObserver?.call(image);
      };
      final resources = RenderResources(
        palette: palette,
        registry: AssetRegistry(),
        sources: sources,
        raster: raster,
        optimizationBudget: optimization,
        preparations: queue,
        retirement: retirement,
        invalidate: () {},
        onAssetChanged: (_) {},
        onClosed: () {
          closed++;
        },
        active: true,
      );
      DrawAsset? svg;
      try {
        final geometry = GeometrySnapshot.compile(
          const DatasetReader().read([
            item('a', 8, components: [background(), bar()]),
          ]),
          resources.text.measure,
        );
        resources.initialize(geometry);
        final node = resources.compiler.compile(
          geometry.nodes[0],
          initialLoad: true,
        );
        final pub = RenderPublication(geometry, [
          RenderPage([node]),
        ], resources);
        final next = RenderPublication(
          geometry,
          pub.pages,
          resources,
          previousPlan: pub.plan,
        );
        final mask = (node.components[1].content as RectangleContent).barMask!;
        svg = resources.acquireAsset(
          'queued.svg',
          const Color(0xffffffff),
          initialLoad: true,
        );
        await svg.ready;
        svg.updateLogicalCount(16);
        final recorder = PictureRecorder(), canvas = Canvas(recorder);
        svg.paint(canvas, const Rect.fromLTWH(0, 0, 20, 20), 1);
        recorder.endRecording().dispose();
        expect(resources.svgImages.preparingCount, 1);
        expect(optimization.chargedBytes, greaterThan(0));
        pub.dispose();
        expect(mask.isReleased, isFalse);
        resources.close();
        queue.setActive(true);
        await mask.ready;
        for (var i = 0; i < 10 && resources.svgImages.preparingCount > 0; i++) {
          await Future<void>.delayed(Duration.zero);
        }
        expect(resources.svgImages.preparingCount, 0);
        expect(nativeImages, 0);
        expect(optimization.chargedBytes, 0);
        next.dispose();
        next.dispose();
        expect(mask.isReleased, isTrue);
        expect(closed, 1);
      } finally {
        svg?.release();
        Image.onCreate = oldObserver;
        resources.close();
        raster.close();
        sources.close();
        queue.close();
        retirement.close();
        optimization.close();
        output.close();
      }
    },
  );
}
