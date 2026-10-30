import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/presentation/presentation_layers.dart';
import 'package:conalog_patch_map/src/rendering/draw_objects.dart';
import 'package:conalog_patch_map/src/rendering/static_geometry.dart';
import 'package:flutter_test/flutter_test.dart';

import 'draw_plan_test.dart' as fixture;
import 'retained_update_test.dart' as retained;

List<Map<String, Object?>> panels({bool show = true, double pitch = 48}) => [
  for (var i = 0; i < 2; i++)
    {
      ...fixture.item(
        'g.0.$i',
        8 + i * pitch,
        orientation: 'upright',
        components: [
          fixture.background(),
          fixture.bar(size: 20, radius: 0),
          {
            'id': 'text',
            'type': 'text',
            'show': show,
            'text': '1234567890',
            'style': {'fontSize': 20},
          },
          {
            'id': 'small',
            'type': 'text',
            'text': 'x',
            'style': {'fontSize': 8},
          },
        ],
      ),
    },
];

PresentationLayers hidden(List<Map<String, Object?>> input, double alpha) {
  final layers = PresentationLayers();
  layers.set(
    'numbers',
    PatchMapPresentationLayer(
      scope: const [
        PatchMapTarget('g.0.0', componentId: 'text'),
        PatchMapTarget('g.0.1', componentId: 'text'),
      ],
      targets: const [],
      unmatchedAlpha: alpha,
    ),
    const DatasetReader().read(input),
  );
  return layers;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'hidden overflow batches without changing text, geometry or reveal',
    () async {
      final h = fixture.Harness(active: false);
      addTearDown(h.close);
      final input = panels(), p = h.read(input);
      final before = await fixture.render(p, rotation: .3);
      final node = p.nodes.first;
      final bounds = node.geometry.paintBounds;
      final content =
          node.components.firstWhere((c) => c.layout.id == 'text').content
              as TextContent;
      final handle = content.handle;
      expect(p.plan.staticChunkCount, 0);
      final layers = hidden(input, 0);
      p.plan.setPresentation(layers.opacity)?.call();
      final expected = h.read(panels(show: false));
      for (final angle in [0.0, .3, 1.2]) {
        expect(
          await fixture.render(p, rotation: angle),
          await fixture.render(expected, rotation: angle),
        );
        expect(p.plan.presentationMeshCount, 1);
      }
      final mesh = p.plan.presentationMeshIdentities.single;
      await fixture.render(p, visible: [1], rotation: .3);
      expect(p.plan.presentationMeshIdentities.single, same(mesh));
      expect(node.geometry.paintBounds, bounds);
      expect(
        node.geometry.item!.components
            .firstWhere((c) => c.id == 'text')
            .visible,
        true,
      );
      expect(content.handle, same(handle));
      p.plan.setPresentation(hidden(input, .5).opacity)?.call();
      await fixture.render(p);
      expect(p.plan.presentationMeshCount, 0);
      p.plan.setPresentation(layers.opacity)?.call();
      await fixture.render(p);
      expect(p.plan.presentationMeshCount, 1);
      final retire = p.plan.setPresentation(null);
      expect(await fixture.render(p, rotation: .3), before);
      retire!();
      expect(content.handle, same(handle));
    },
  );

  test(
    'overlap-only changes retain background vertices through reveal and release',
    () async {
      final h = fixture.Harness(active: false);
      late StaticGeometry mesh;
      try {
        final initial = h.read(panels(show: false));
        mesh = initial.plan.staticMeshIdentities.single as StaticGeometry;
        final geometry = initial.geometry.prepare({
          for (final id in ['g.0.0', 'g.0.1'])
            PatchMapTarget(id, componentId: 'text'): {
              ...initial.geometry[id]!.item!.components
                  .firstWhere((c) => c.id == 'text')
                  .data,
              'show': true,
            },
        }, h.text.measure).snapshot;
        final next = h.project(geometry, previous: initial);
        expect(next.plan.staticChunkCount, 0);
        initial.plan.dispose();
        expect(mesh.isDisposed, false);
        next.plan.setPresentation(hidden(panels(), 0).opacity)?.call();
        await fixture.render(next);
        expect(next.plan.presentationMeshIdentities.single, same(mesh));
        next.plan.setPresentation(null)?.call();
        expect(mesh.isDisposed, false);
        next.plan.setPresentation(hidden(panels(), 0).opacity)?.call();
        await fixture.render(next);
        expect(next.plan.presentationMeshIdentities.single, same(mesh));
      } finally {
        h.close();
      }
      expect(mesh.isDisposed, true);
    },
  );

  test('actual item overlap still uses ordered per-item paint', () async {
    final h = fixture.Harness(active: false);
    addTearDown(h.close);
    final input = panels(pitch: 20), p = h.read(input);
    p.plan.setPresentation(hidden(input, 0).opacity)?.call();
    final expected = h.read(panels(show: false, pitch: 20));
    expect(
      await fixture.render(p, rotation: .7),
      await fixture.render(expected, rotation: .7),
    );
    expect(p.plan.presentationMeshCount, 0);
  });

  test(
    'general publication rechecks visible geometry under unchanged full envelope',
    () async {
      final h = fixture.Harness(active: false);
      addTearDown(h.close);
      final input = panels(), p = h.read(input);
      p.plan.setPresentation(hidden(input, 0).opacity)?.call();
      await fixture.render(p);
      expect(p.plan.presentationMeshCount, 1);
      final target = const PatchMapTarget('g.0.0', componentId: 'small');
      final current = p.geometry[target.id]!.item!.components
          .firstWhere((c) => c.id == 'small')
          .data;
      final geometry = p.geometry.prepare({
        target: {
          ...current,
          'attrs': <String, Object?>{
            ...?(current['attrs'] as Map<String, Object?>?),
            'x': 48,
          },
        },
      }, h.text.measure).snapshot;
      expect(
        geometry[target.id]!.paintBounds,
        p.geometry[target.id]!.paintBounds,
      );
      final next = h.project(geometry, previous: p);
      expect(next.plan.presentationMeshCount, 0);
      await fixture.render(next);
      expect(next.plan.presentationMeshCount, 0);
      p.plan.dispose();
      await fixture.render(next);
    },
  );

  test(
    'retained publication preserves paint-only reuse but invalidates narrower geometry',
    () async {
      final input = panels();
      final h = await retained.Harness.create(input: input);
      addTearDown(h.close);
      h.current.resources.text.setActive(false);
      h.backend.setPresentation(hidden(input, 0).opacity);
      h.paint();
      final mesh = h.current.plan.presentationMeshIdentities.single;
      final bounds = h.current.geometry['g.0.0']!.paintBounds;
      final node = h.current.node(h.slot);
      h.publish(
        await h.prepare([
          const PatchMapUpdate(PatchMapTarget('g.0.0', componentId: 'bar'), {
            'tint': '#00ff00',
          }),
        ]),
      );
      h.paint();
      expect(h.current.plan.presentationMeshIdentities.single, same(mesh));
      expect(h.current.node(h.slot), same(node));
      final candidate = await h.prepare([
        const PatchMapUpdate(PatchMapTarget('g.0.0', componentId: 'small'), {
          'attrs': {'x': 48},
        }),
      ]);
      expect(h.current.plan.presentationMeshIdentities.single, same(mesh));
      expect(h.current.geometry['g.0.0']!.paintBounds, bounds);
      h.publish(candidate);
      expect(h.current.node(h.slot), same(node));
      expect(h.current.geometry['g.0.0']!.paintBounds, bounds);
      h.paint();
      expect(h.current.plan.presentationMeshCount, 0);
      h.backend.retirement.flush();
      h.publish(
        await h.prepare([
          const PatchMapUpdate(PatchMapTarget('g.0.0', componentId: 'small'), {
            'attrs': {'x': 0},
          }),
        ]),
      );
      h.paint();
      expect(h.current.plan.presentationMeshCount, 1);
      h.backend.setPresentation(null);
      h.paint();
      expect(h.current.plan.presentationMeshCount, 0);
      h.backend.retirement.flush();
    },
  );
}
