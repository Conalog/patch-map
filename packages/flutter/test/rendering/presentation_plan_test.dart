import 'dart:ui';

import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/presentation/presentation_layers.dart';
import 'package:flutter_test/flutter_test.dart';

import 'draw_plan_test.dart' as fixture;

List<Map<String, Object?>> panels({double firstAlpha = 1}) => [
  for (var i = 0; i < 100; i++)
    {
      ...fixture.item(
        'p$i',
        (i % 10) * 12 + 2,
        y: (i ~/ 10) * 12 + 2,
        size: 10,
        components: [
          fixture.background(width: 1),
          fixture.bar(size: 4, radius: 0),
        ],
      ),
      'attrs': {
        'x': (i % 10) * 12 + 2,
        'y': (i ~/ 10) * 12 + 2,
        'alpha': i == 0 ? firstAlpha : 1,
      },
    },
];
PatchMapPresentationLayer layer(double alpha, {String? component}) =>
    PatchMapPresentationLayer(
      scope: [PatchMapTarget('p0', componentId: component)],
      targets: [PatchMapTarget('p0', componentId: component)],
      matchedAlpha: alpha,
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'one target in a 100-item mesh composes, clears and restores exact output',
    () async {
      final h = fixture.Harness(active: false);
      addTearDown(h.close);
      final input = panels(), p = h.read(input);
      final document = const DatasetReader().read(input),
          layers = PresentationLayers();
      final meshes = p.plan.staticMeshIdentities.toList();
      final baseline = await fixture.render(p);
      expect(p.plan.staticChunkCount, 1);
      expect(p.plan.presentationMeshCount, 0);
      layers.set('filter', layer(.5), document);
      layers.set('memo', layer(.5), document);
      p.plan.setPresentation(layers.opacity)?.call();
      final expected = h.read(panels(firstAlpha: .25));
      expect(await fixture.render(p), await fixture.render(expected));
      expect(p.plan.staticMeshIdentities.toList(), orderedEquals(meshes));
      expect(p.plan.presentationMeshCount, 1);
      expect(p.plan.setPresentation(layers.opacity), isNull);
      expect(await fixture.render(p), await fixture.render(expected));
      layers.clear('memo');
      final retire = p.plan.setPresentation(layers.opacity);
      expect(retire, isNotNull);
      expect(p.plan.presentationMeshCount, 0);
      retire!();
      expect(
        await fixture.render(p),
        await fixture.render(h.read(panels(firstAlpha: .5))),
      );
      layers.clear('filter');
      p.plan.setPresentation(layers.opacity)?.call();
      expect(await fixture.render(p), baseline);
      expect(p.plan.presentationMeshCount, 0);
      expect(p.geometry['p0']!.opacity, 1);
      expect(p.plan.staticMeshIdentities.toList(), orderedEquals(meshes));
    },
  );

  test(
    'ordinary bar updates share alpha variants until both plans retire',
    () async {
      final h = fixture.Harness(active: false);
      addTearDown(h.close);
      final input = panels(), p = h.read(input), layers = PresentationLayers();
      layers.set('dim', layer(.5), const DatasetReader().read(input));
      p.plan.setPresentation(layers.opacity)?.call();
      await fixture.render(p);
      final variants = p.plan.presentationMeshIdentities.toList();
      final current = p.geometry['p0']!.item!.components
          .firstWhere((c) => c.id == 'bar')
          .data;
      final next = h.project(
        p.geometry.prepare({
          const PatchMapTarget('p0', componentId: 'bar'): {
            ...current,
            'tint': '#00ff00',
          },
        }, h.text.measure).snapshot,
        previous: p,
      );
      expect(
        next.plan.presentationMeshIdentities.toList(),
        orderedEquals(variants),
      );
      p.plan.dispose();
      expect(await fixture.render(next), isNotEmpty);
      expect(
        next.plan.presentationMeshIdentities.toList(),
        orderedEquals(variants),
      );
      final retire = next.plan.setPresentation(null);
      expect(next.plan.presentationMeshCount, 0);
      retire!();
      expect(await fixture.render(next), isNotEmpty);
    },
  );

  test('component-only layer leaves static mesh and siblings intact', () async {
    final h = fixture.Harness(active: false);
    addTearDown(h.close);
    final input = panels(), p = h.read(input), layers = PresentationLayers();
    final document = const DatasetReader().read(input);
    final before = await fixture.render(p);
    layers.set('bar-only', layer(0, component: 'bar'), document);
    p.plan.setPresentation(layers.opacity)?.call();
    final after = await fixture.render(p);
    expect(after, isNot(equals(before)));
    expect(p.plan.presentationMeshCount, 0);
    // Every other item's pixels remain identical.
    for (var y = 0; y < 128; y++) {
      for (var x = 0; x < 128; x++) {
        if (const Rect.fromLTWH(
          2,
          2,
          10,
          10,
        ).contains(Offset(x.toDouble(), y.toDouble()))) {
          continue;
        }
        final offset = (y * 128 + x) * 4;
        expect(
          after.sublist(offset, offset + 4),
          before.sublist(offset, offset + 4),
        );
      }
    }
    layers.clear('bar-only');
    p.plan.setPresentation(layers.opacity)?.call();
    expect(await fixture.render(p), before);
  });

  test('overlapping items retain per-content composition and order', () async {
    final h = fixture.Harness(active: false);
    addTearDown(h.close);
    List<Map<String, Object?>> input(double alpha) => [
      for (var i = 0; i < 2; i++)
        {
          ...fixture.item(
            'p$i',
            10 + i * 10,
            components: [
              fixture.background(),
              fixture.bar(size: 30, radius: 0),
            ],
          ),
          'attrs': {'x': 10 + i * 10, 'y': 8, 'alpha': i == 0 ? alpha : .8},
        },
    ];
    final p = h.read(input(.8)), layers = PresentationLayers();
    expect(p.plan.staticChunkCount, 0);
    layers.set('dim', layer(.5), const DatasetReader().read(input(.8)));
    p.plan.setPresentation(layers.opacity)?.call();
    expect(await fixture.render(p), await fixture.render(h.read(input(.4))));
  });
}
