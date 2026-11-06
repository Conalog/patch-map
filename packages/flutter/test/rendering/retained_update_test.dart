import 'dart:math' as math;
import 'dart:ui';

import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:conalog_patch_map/src/dataset/colors.dart';
import 'package:conalog_patch_map/src/dataset/dataset_reader.dart';
import 'package:conalog_patch_map/src/geometry/item_data.dart';
import 'package:conalog_patch_map/src/geometry/geometry_snapshot.dart';
import 'package:conalog_patch_map/src/rendering/draw_objects.dart';
import 'package:conalog_patch_map/src/presentation/presentation_admission.dart';
import 'package:conalog_patch_map/src/presentation/field_operations.dart';
import 'package:conalog_patch_map/src/presentation/presentation_resolver.dart';
import 'package:conalog_patch_map/src/presentation/record_delta.dart';
import 'package:conalog_patch_map/src/rendering/render_publication.dart';
import 'package:conalog_patch_map/src/rendering/retained_update.dart';
import 'package:conalog_patch_map/src/interaction/input_query.dart';
import 'package:conalog_patch_map/src/interaction/selection_state.dart';
import 'package:conalog_patch_map/src/resources/asset_registry.dart';
import 'package:conalog_patch_map/src/widget/map_backend.dart';
import 'package:flutter_test/flutter_test.dart';
import 'draw_plan_test.dart' as drawing;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'rotated full scans and local buckets preserve visible paint order',
    () async {
      Map<String, Object?> rect(
        String id,
        int x,
        int y, {
        int z = 0,
        bool show = true,
      }) => {
        'id': id,
        'type': 'rect',
        'size': 24,
        'show': show,
        'attrs': {'x': x, 'y': y, 'zIndex': z},
      };
      final h = await Harness.create(
        input: [
          rect('red', 90, 90, z: 9),
          rect('blue', 90, 90),
          rect('green', 90, 90, z: 9),
          rect('hidden', 90, 90, z: 99, show: false),
          rect('near', 136, 100),
          rect('outside', 230, 90),
          for (var i = 0; i < 64; i++)
            rect('far-$i', 1200 + (i % 8) * 256, 1200 + (i ~/ 8) * 256),
        ],
      );
      addTearDown(h.close);
      final backend = h.backend;
      void verifyOrder(List<String> overlapping) {
        for (final scale in [.12, 3.0]) {
          backend.camera.set(
            center: const Offset(102, 102),
            scale: scale,
            rotation: math.pi / 6,
          );
          final query = backend.camera.visibleWorldBounds;
          final candidates = backend.spatial.candidates(query);
          expect(backend.spatial.isFullScan(candidates), scale == .12);
          if (scale == 3) {
            expect(
              candidates,
              contains(h.current.geometry.topology.slots['outside']),
            );
          }
          final ids = backend
              .visibleSlots()
              .map((slot) => h.current.geometry.nodes[slot].id)
              .toList();
          expect(ids.where(['red', 'green', 'blue'].contains), overlapping);
          expect(ids, contains('near'));
          expect(ids, isNot(contains('hidden')));
          expect(ids, isNot(contains('far-63')));
          if (scale == 3) expect(ids, ['blue', 'near', ...overlapping.skip(1)]);
        }
      }

      verifyOrder(['blue', 'red', 'green']);
      h.publish(
        await h.prepare([
          const PatchMapUpdate(PatchMapTarget('red'), {
            'attrs': {'zIndex': 10},
          }),
        ]),
      );
      verifyOrder(['blue', 'green', 'red']);
    },
  );

  test(
    'retained dynamic show preserves proof, atomic visibility and item hits',
    () async {
      final h = await Harness.create();
      addTearDown(h.close);
      h.current.resources.text.setActive(false);
      final node = h.current.node(h.slot);
      final mesh = h.current.plan.staticMeshIdentities.single;
      final bounds = node.geometry.paintBounds;
      for (final visible in [false, true]) {
        final next = await h.prepare([
          update('text', {'show': visible}),
          update('bar', {'show': visible}),
        ]);
        expect(
          node.components[node.geometry.item!.indices['text']!].layout.visible,
          !visible,
        );
        expect(next.plan.reusedChunkCount, 1);
        expect(next.plan.overlapComparisonCount, 0);
        expect(next.plan.staticMeshIdentities.single, same(mesh));
        h.publish(next);
        expect(node.geometry.paintBounds, bounds);
        final query = InputQuery(
          ports: InputQueryPorts(getSpatialCandidates: (_, _) => [h.slot]),
        );
        expect(
          query.point(h.current.geometry, const Offset(5, 5), 0)?.id,
          'g.0.0',
        );
        expect(
          node.components[node.geometry.item!.indices['text']!].layout.visible,
          visible,
        );
        expect(
          h.current.geometry['g.0.1']!.item!.components.last.visible,
          isTrue,
        );
        final projection = drawing.Projection(
          h.current.geometry,
          [
            for (var i = 0; i < h.current.geometry.nodes.length; i++)
              h.current.node(i),
          ],
          h.current.pages,
          h.current.plan,
        );
        drawing.compare(
          await drawing.render(projection),
          await drawing.render(projection, reference: true),
        );
        h.backend.retirement.flush();
      }
    },
  );
  test(
    'retained overflow visibility still invalidates the static proof',
    () async {
      final h = await Harness.create();
      addTearDown(h.close);
      h.current.resources.text.setActive(false);
      final bounds = h.current.node(h.slot).geometry.paintBounds;
      h.publish(
        await h.prepare([
          update('text', {
            'attrs': {'x': 55},
          }),
        ]),
      );
      expect(h.current.plan.staticChunkCount, 0);
      for (final visible in [false, true]) {
        h.publish(
          await h.prepare([
            update('text', {'show': visible}),
          ]),
        );
        expect(h.current.plan.overlapComparisonCount, 1);
        expect(h.current.plan.staticChunkCount, visible ? 0 : 1);
        expect(h.current.node(h.slot).geometry.paintBounds == bounds, !visible);
        final projection = drawing.Projection(
          h.current.geometry,
          [
            for (var i = 0; i < h.current.geometry.nodes.length; i++)
              h.current.node(i),
          ],
          h.current.pages,
          h.current.plan,
        );
        drawing.compare(
          await drawing.render(projection),
          await drawing.render(projection, reference: true),
        );
        h.backend.retirement.flush();
      }
    },
  );
  test(
    'offscreen repeated updates leave only current output projection pending',
    () async {
      final h = await Harness.create();
      addTearDown(h.close);
      h.current.resources.text.setActive(false);
      h.backend.camera.set(center: const Offset(10000, 10000), scale: 1);
      var node = h.current.node(h.slot);
      for (final height in ['25%', '70%', '40%']) {
        h.publish(
          await h.prepare([
            update('bar', {
              'size': {'height': height},
              'placement': 'bottom',
            }),
            update('text', {'text': height, 'margin': 3}),
          ], animate: true),
        );
        final count = node.debugPendingProjectionCount;
        expect(count, greaterThan(0));
        expect(
          node.geometry.item!.components
              .firstWhere((c) => c.id == 'bar')
              .box
              .height,
          60 * double.parse(height.replaceAll('%', '')) / 100,
        );
        h.paint();
        expect(node.debugPendingProjectionCount, count);
        h.backend.retirement.flush();
      }
      // A general same-world projection must copy nullable cache slots, not
      // retain a mutable array shared with the previous draw node.
      final prior = node, priorPending = node.debugPendingProjectionCount;
      h.publish(
        await h.prepare([
          const PatchMapUpdate(PatchMapTarget('g.0.0'), {'label': 'new label'}),
        ]),
      );
      node = h.current.node(h.slot);
      expect(node, isNot(same(prior)));
      expect(node.debugPendingProjectionCount, priorPending);
      h.publish(
        await h.prepare([
          update('bar', {
            'size': {'height': '65%'},
          }),
        ]),
      );
      expect(prior.debugPendingProjectionCount, priorPending);
      h.paint();
      expect(node.debugPendingProjectionCount, greaterThan(0));
      h.backend.onFrame(Duration.zero);
      h.backend.onFrame(const Duration(seconds: 1));
      expect(h.backend.transitions.rectangle(h.slot, 'bar'), isNull);
      h.backend.camera.set(center: const Offset(40, 30), scale: 1);
      h.paint();
      expect(node.debugPendingProjectionCount, 0);
      final document = const DatasetReader().read([
        {
          ...exportItemData(node.geometry.data),
          'id': 'expected',
          'type': 'item',
        },
      ]);
      final geometry = GeometrySnapshot.compile(
        document,
        h.current.resources.text.measure,
      );
      final fresh = h.current.resources.compiler.compile(
        geometry['expected']!,
        initialLoad: false,
      );
      fresh.retain();

      try {
        expect(await pixels(node), orderedEquals(await pixels(fresh)));
      } finally {
        fresh.release();
      }
    },
  );
  test(
    'retained bounds and pixels equal a fresh projection across dependencies',
    () async {
      final h = await Harness.create();
      addTearDown(h.close);
      h.current.resources.text.setActive(false);
      final node = h.current.node(h.slot);

      for (final values in [
        [
          update('text', {'text': '123456'}),
        ],
        mixed(),
        [
          update('text', {
            'text': 'long value beyond item',
            'style': {'overflow': 'visible'},
          }),
        ],
        [
          update('text', {
            'style': {'fontSize': 18},
            'margin': 4,
            'placement': 'top',
          }),
        ],
        [
          update('text', {
            'attrs': {'x': 45, 'rotation': .2},
            'tint': '#ff00ff',
          }),
        ],
        [
          update('text', {
            'text': 'alpha',
            'attrs': {'alpha': .5},
          }),
        ],
        [
          update('text', {'text': 'after alpha'}),
        ],
        [
          update('text', {'text': 'split', 'split': 2}),
        ],
        [
          update('text', {'text': 'after split'}),
        ],
        [
          update('background', {'tint': '#ff0000'}),
        ],
        [
          update('background', {'show': false}),
          update('text', {'show': false}),
        ],
        [
          update('background', {'show': true}),
          update('text', {'show': true}),
        ],
        [
          update('bar', {
            'size': {'height': '80%'},
            'attrs': {'alpha': .5},
          }),
        ],
      ]) {
        h.publish(await h.prepare(values));
        expect(h.current.node(h.slot), same(node));
        final document = const DatasetReader().read([
          {
            ...exportItemData(node.geometry.data),
            'id': 'expected',
            'type': 'item',
          },
        ]);
        final geometry = GeometrySnapshot.compile(
          document,
          h.current.resources.text.measure,
        );
        final reference = h.current.resources.compiler.compile(
          geometry['expected']!,
          initialLoad: false,
        );
        reference.retain();
        try {
          expect(node.geometry.paintBounds, reference.geometry.paintBounds);
          expect(await pixels(node), orderedEquals(await pixels(reference)));
        } finally {
          reference.release();
        }
        h.backend.retirement.flush();
      }
    },
  );
  test(
    'retained text reuses parameters only while owner and style stay fixed',
    () async {
      final h = await Harness.create();
      addTearDown(h.close);
      final pool = h.current.resources.text;
      TextContent content([String id = 'g.0.0']) =>
          h.current
                  .node(h.current.geometry.topology.slots[id]!)
                  .components[2]
                  .content
              as TextContent;
      final before = content();
      final count = pool.parameterCreates;
      h.publish(
        await h.prepare([
          update('text', {'text': '22'}),
          const PatchMapUpdate(PatchMapTarget('g.0.1', componentId: 'text'), {
            'text': '22',
          }),
        ]),
      );
      expect(content(), same(content('g.0.1')));
      expect(
        content().handle.spec.parameters,
        same(before.handle.spec.parameters),
      );
      expect(pool.parameterCreates, count);
      expect(before.handle.spec.text, '1');
      expect(
        content().handle.references,
        1,
      ); // Shared content owns one pool lease.

      final oldParameters = content().handle.spec.parameters;
      h.publish(
        await h.prepare([
          update('text', {'text': '333', 'margin': 4}),
        ]),
      );
      expect(content().handle.spec.parameters, isNot(same(oldParameters)));
      expect(content().handle.spec.bounds!.width, 32);
      h.publish(
        await h.prepare([
          const PatchMapUpdate(PatchMapTarget('g.0.0'), {
            'size': {'width': 60},
            'attrs': {'alpha': .5},
          }),
        ]),
      );
      final ownerParameters = content().handle.spec.parameters;
      expect(ownerParameters.bounds!.width, 52);
      expect(ownerParameters.color.a, closeTo(.5, .01));
      h.publish(
        await h.prepare([
          update('text', {'text': '4444'}),
        ]),
      );
      expect(content().handle.spec.parameters, same(ownerParameters));
      h.backend.retirement.flush();
      h.paint();
    },
  );
  test(
    'validated records cross preparation once and bind exact state',
    () async {
      final h = await Harness.create();
      addTearDown(h.close);
      final before = h.current;
      final batch = const PresentationAdmission().admit(
        h.document,
        mixed(),
        current: h.lookup,
      );
      expect(
        h.backend.validateRetainedUpdate(
          h.document,
          batch,
          h.lookup,
          before,
          1,
        ),
        true,
      );
      final changes = h.backend.validatedChanges(h.document, batch, before, 1)!;
      expect(changes, isA<RetainedUpdate>());
      expect(
        h.backend.validatedChanges(
          h.document,
          PresentationPlan(batch.patches),
          before,
          1,
        ),
        same(changes),
      );
      final text =
          changes[const PatchMapTarget('g.0.0', componentId: 'text')]!.after;
      final prepared = await h.backend.prepareUpdate(
        before,
        h.document,
        changes,
        generation: 1,
        animate: false,
        intent: batch,
      );
      expect(
        h.lookup(const PatchMapTarget('g.0.0', componentId: 'text'))!['text'],
        '1',
      );
      h.publish(prepared.publication as RenderPublication);
      expect(
        h.lookup(const PatchMapTarget('g.0.0', componentId: 'text')),
        same(text),
      );
      expect(h.backend.validatedChanges(h.document, batch, before, 1), isNull);
      final other = const PresentationAdmission().admit(
        h.document,
        mixed(),
        current: h.lookup,
      );
      final proof = RetainedUpdate.validate(
        h.document,
        h.current,
        1,
        h.backend.revision,
        0,
        other,
        h.lookup,
        h.backend.palette,
      )!;
      expect(
        proof.matches(h.document, h.current, 2, h.backend.revision, 0, other),
        false,
      );
      expect(
        proof.matches(
          h.document,
          h.current,
          1,
          h.backend.revision + 1,
          0,
          other,
        ),
        false,
      );
      expect(
        proof.matches(h.document, h.current, 1, h.backend.revision, 1, other),
        false,
      );
      expect(
        proof.matches(h.document, h.current, 1, h.backend.revision, 0, batch),
        false,
      );
      proof.dispose();
    },
  );
  test(
    'hit and selection exports survive repeated mutation of the same layout',
    () async {
      final h = await Harness.create();
      addTearDown(h.close);
      final query = InputQuery(
        ports: InputQueryPorts(getSpatialCandidates: (_, _) => [h.slot]),
      );
      final events = <PatchMapInputEvent>[];
      final selection = SelectionState(
        currentGeometry: () => h.current.geometry,
        query: query,
        notify: events.add,
      );
      addTearDown(selection.dispose);
      h.publish(await h.prepare(mixed()));
      final layout = h.current.geometry['g.0.0']!.item;
      final selected = selection.set(['g.0.0']).selected.single;
      final hit = query.point(h.current.geometry, const Offset(5, 5), 0)!;
      h.publish(
        await h.prepare([
          update('text', {'text': '42'}),
        ]),
      );
      expect(h.current.geometry['g.0.0']!.item, same(layout));
      Object? number(PatchMapObject object) =>
          (object.effectiveData['components'] as List).cast<Map>().firstWhere(
            (v) => v['id'] == 'text',
          )['text'];
      expect(number(selected), '1234567');
      expect(number(hit), '1234567');
      expect(number(events.single.objects.single), '1234567');
      expect(number(selection.selected.single), '42');
    },
  );
  for (final action in ['suspend', 'replace', 'close']) {
    test(
      'unpublished retained candidate releases leases after $action',
      () async {
        final h = await Harness.create();
        final old = exportItemData(h.current.geometry['g.0.0']!.data);
        final candidate = await h.prepare(mixed());
        if (action == 'suspend') {
          h.backend.setActive(false);
        } else if (action == 'replace') {
          final previous = h.current;
          h.backend.hide();
          final replacement =
              await h.backend.prepareDocument(h.document, 2)
                  as RenderPublication;
          h.backend.publish(replacement, 2, ++h.revision);
          h.backend.retire(previous);
        } else {
          h.close();
        }
        h.backend.retire(candidate);
        h.backend.retirement.flush();
        expect(
          (old['components'] as List).cast<Map>().firstWhere(
            (v) => v['id'] == 'text',
          )['text'],
          '1',
        );
        if (action != 'close') {
          h.backend.setActive(true);
          h.paint();
          h.close();
        }
      },
    );
  }
  test(
    'prepare/discard leaves live values; commit retains actual handles; old retirement is safe',
    () async {
      final h = await Harness.create();
      addTearDown(h.close);
      final node = h.current.node(h.slot),
          geometry = node.geometry,
          item = geometry.item!;
      final bar = node.components[item.indices['bar']!],
          text = node.components[item.indices['text']!];
      final oldBarLayout = bar.layout, oldBox = bar.layout.box;
      final ownedBefore = item.mutationOwned;
      final oldData = exportItemData(geometry.data),
          oldComponents = oldData['components'] as List;
      final next = await h.prepare(mixed());
      expect(bar.layout.box, oldBox);
      expect(text.layout.data['text'], '1');
      expect(h.current.node(h.slot), same(node));
      h.backend.retire(next);
      h.backend.retirement.flush();
      expect(bar.layout.box, oldBox);
      expect(text.layout.data['text'], '1');
      h.publish(await h.prepare(mixed()));
      final now = h.current.node(h.slot), nextItem = now.geometry.item!;
      expect(
        now.components[nextItem.indices['text']!].layout.data['text'],
        '1234567',
      );
      expect(now.components[nextItem.indices['bar']!].layout.box.height, 15);
      expect(identical(now, node), true);
      expect(identical(now.components[nextItem.indices['bar']!], bar), true);
      expect(identical(now.geometry, geometry), true);
      expect(identical(nextItem, item), ownedBefore);
      expect(
        identical(
          now.components[nextItem.indices['bar']!].layout,
          oldBarLayout,
        ),
        ownedBefore,
      );
      expect(
        oldComponents.cast<Map>().firstWhere((v) => v['id'] == 'text')['text'],
        '1',
      );
      expect(
        () => (oldComponents.first as Map)['show'] = false,
        throwsUnsupportedError,
      );
      h.backend.retirement.flush();
      h.paint();
      h.publish(
        await h.prepare([
          update('text', {'text': '42'}),
        ]),
      );
      h.backend.retirement.flush();
      h.paint();
      expect(
        h.current.geometry['g.0.0']!.item!.components
            .firstWhere((c) => c.id == 'text')
            .data['text'],
        '42',
      );
    },
  );
  test(
    'first-write sharing detaches only at commit and warm updates retain ownership',
    () async {
      final h = await Harness.create();
      addTearDown(h.close);
      final initial = h.current.node(h.slot);
      final layout = initial.geometry.item!;
      final sibling = h.current.geometry['g.0.1']!.item!;
      expect(identical(layout, sibling), true);
      final exported = exportItemData(initial.geometry.data);
      final siblingExported = exportItemData(h.current.geometry['g.0.1']!.data);
      final initialBar = layout.components[layout.indices['bar']!].box;
      final candidate = await h.prepare(mixed());
      expect(initial.geometry.item, same(layout));
      expect(layout.components[layout.indices['bar']!].box, initialBar);
      expect(h.current.geometry['g.0.1']!.item, same(sibling));
      h.backend.retire(candidate);
      h.backend.retirement.flush();
      expect(initial.geometry.item, same(layout));
      expect(exportItemData(initial.geometry.data), exported);
      expect(
        exportItemData(h.current.geometry['g.0.1']!.data),
        siblingExported,
      );
      await expectLater(
        h.prepare([
          update('text', {'text': 'must not publish'}),
          update('bar', {
            'size': {'height': -1},
          }),
        ]),
        throwsA(anything),
      );
      expect(initial.geometry.item, same(layout));
      expect(exportItemData(initial.geometry.data), exported);
      h.publish(await h.prepare(mixed()));
      final owned = h.current.node(h.slot).geometry.item!;
      expect(identical(owned, layout), false);
      expect(identical(owned, sibling), false);
      expect(
        exportItemData(h.current.geometry['g.0.1']!.data),
        siblingExported,
      );
      expect(
        (exported['components'] as List).cast<Map>().firstWhere(
          (c) => c['id'] == 'text',
        )['text'],
        '1',
      );
      final liveNode = h.current.node(h.slot);
      final liveBar = liveNode.components[owned.indices['bar']!];
      h.publish(
        await h.prepare([
          update('bar', {
            'size': {'height': '60%'},
          }),
        ]),
      );
      expect(identical(h.current.node(h.slot), liveNode), true);
      expect(identical(h.current.node(h.slot).geometry.item, owned), true);
      expect(
        identical(
          h.current.node(h.slot).components[owned.indices['bar']!],
          liveBar,
        ),
        true,
      );
      expect(
        exportItemData(h.current.geometry['g.0.1']!.data),
        siblingExported,
      );
      h.backend.retirement.flush();
      h.paint();
    },
  );
  test(
    'shared template isolation, changing envelope/background, baseline fallback then retained update',
    () async {
      final h = await Harness.create();
      addTearDown(h.close);
      final sibling = exportItemData(h.current.geometry['g.0.1']!.data);
      h.publish(await h.prepare(mixed()));
      expect(exportItemData(h.current.geometry['g.0.1']!.data), sibling);
      expect(
        h.current.geometry['g.0.1']!.item!.components
            .firstWhere((c) => c.id == 'text')
            .data['text'],
        '1',
      );
      h.publish(
        await h.prepare([
          update('background', {'tint': '#ff0000'}),
        ]),
      );
      h.paint();
      final old = h.current.node(h.slot);
      h.publish(
        await h.prepare([
          PatchMapUpdate(const PatchMapTarget('g.0.0'), {
            'size': {'width': 55},
            'contentOrientation': 'upright',
          }),
        ]),
      );
      expect(identical(h.current.node(h.slot), old), false);
      final fallback = h.current.node(h.slot), item = fallback.geometry.item;
      h.publish(
        await h.prepare([
          update('bar', {
            'size': {'height': '50%'},
          }),
        ]),
      );
      expect(identical(h.current.node(h.slot), fallback), true);
      expect(identical(h.current.geometry['g.0.0']!.item, item), true);
      expect(h.current.geometry['g.0.1']!.item!.size.width, 40);
      h.backend.retirement.flush();
      h.paint();
    },
  );
  test(
    'source failure preserves the entire item while another item succeeds',
    () async {
      final h = await Harness.create();
      addTearDown(h.close);
      final before = h.current.geometry['g.0.0']!.item!;
      final oldBox = before.components[before.indices['bar']!].box;
      final candidate = await h.prepare([
        ...mixed(),
        update('background', {'source': 'data:image/svg+xml,not-svg'}),
        PatchMapUpdate(const PatchMapTarget('g.0.1', componentId: 'text'), {
          'text': '99',
        }),
      ]);
      expect(h.lastFailures, contains('g.0.0'));
      h.publish(candidate);
      final item = h.current.geometry['g.0.0']!.item!;
      expect(item.components[item.indices['bar']!].box, oldBox);
      expect(item.components[item.indices['text']!].data['text'], '1');
      expect(
        h.current.geometry['g.0.1']!.item!.components
            .firstWhere((c) => c.id == 'text')
            .data['text'],
        '99',
      );
      h.backend.retirement.flush();
      h.paint();
    },
  );
  test(
    'label fallback gives each new node independent component leases',
    () async {
      final h = await Harness.create();
      addTearDown(h.close);
      h.publish(await h.prepare(mixed()));
      h.publish(
        await h.prepare([
          PatchMapUpdate(const PatchMapTarget('g.0.0'), {'label': 'changed'}),
        ]),
      );
      final next = await h.prepare([
        update('text', {'text': '7'}),
      ]);
      h.publish(next);
      h.backend.retirement.flush();
      h.paint();
      final refresh =
          await h.backend.prepareRefresh(h.current) as RenderPublication;
      h.publish(refresh);
      h.publish(
        await h.prepare([
          update('text', {'text': '9'}),
        ]),
      );
      h.backend.retirement.flush();
      h.paint();
      expect(
        h.current.geometry['g.0.0']!.item!.components
            .firstWhere((c) => c.id == 'text')
            .data['text'],
        '9',
      );
    },
  );
  test('upright Bar paints through exact tween completion', () async {
    final h = await Harness.create(
      input: [
        {
          'type': 'grid',
          'id': 'g',
          'cells': [
            [1, 1],
          ],
          'item': {
            'size': 100,
            'components': [
              {
                'type': 'bar',
                'id': 'bar',
                'size': 20,
                'source': {'fill': '#ff0000'},
                'placement': 'none',
                'animationDuration': 200,
              },
            ],
          },
        },
      ],
    );
    addTearDown(h.close);
    h.backend.camera.set(
      center: const Offset(50, 50),
      scale: 1,
      rotation: math.pi,
    );

    Future<List<int>> paintedColors() async {
      final recorder = PictureRecorder();
      h.backend.paint(Canvas(recorder), 1);
      final picture = recorder.endRecording();
      final image = await picture.toImage(300, 300);
      try {
        final bytes = (await image.toByteData(
          format: ImageByteFormat.rawRgba,
        ))!;
        return [
          for (final coordinate in [190, 150, 110])
            bytes.getUint32((coordinate * 300 + coordinate) * 4),
        ];
      } finally {
        image.dispose();
        picture.dispose();
      }
    }

    const red = 0xff0000ff;
    final geometry = h.current.geometry['g.0.0']!;
    final layout = geometry.item!.components.single;
    final center = Offset(layout.box.width / 2, layout.box.height / 2);
    expect(
      layout
          .worldTransform(geometry.world, math.pi, geometry.item!.content)
          .project(center),
      const Offset(10, 10),
    );

    final next = await h.prepare([
      update('bar', {'placement': 'left-top'}),
    ], animate: true);
    h.publish(next);
    final published = h.current.geometry['g.0.0']!;
    final moved = published.item!.components.single;
    expect(moved.box.topLeft, Offset.zero);
    expect(
      moved
          .worldTransform(published.world, math.pi, published.item!.content)
          .project(center),
      const Offset(90, 90),
    );
    final transition = h.backend.transitions;
    expect(
      transition.rectangle(h.slot, 'bar', 3)!.center,
      const Offset(10, 10),
    );
    expect(await paintedColors(), [red, 0, 0]);
    h.backend.onFrame(Duration.zero);
    h.backend.onFrame(const Duration(milliseconds: 100));
    expect(
      transition.rectangle(h.slot, 'bar', 3)!.center,
      const Offset(50, 50),
    );
    expect(await paintedColors(), [0, red, 0]);
    expect(h.backend.onFrame(const Duration(milliseconds: 200)), isFalse);
    expect(await paintedColors(), [0, 0, red]);
  });

  test('mid-flight retarget captures the displayed rectangle', () async {
    final h = await Harness.create();
    addTearDown(h.close);
    h.backend.camera.set(
      center: const Offset(20, 30),
      scale: 1,
      rotation: math.pi,
    );

    Future<List<int>> paintedBarColumn() async {
      final recorder = PictureRecorder();
      h.backend.paint(Canvas(recorder), 1);
      final picture = recorder.endRecording();
      final image = await picture.toImage(300, 300);
      try {
        final bytes = (await image.toByteData(
          format: ImageByteFormat.rawRgba,
        ))!;
        return [
          for (var y = 120; y < 180; y++)
            if (bytes.getUint32((y * 300 + 140) * 4) == 0x0000ffff) y,
        ];
      } finally {
        image.dispose();
        picture.dispose();
      }
    }

    h.publish(
      await h.prepare([
        update('bar', {
          'size': {'height': '25%'},
        }),
      ], animate: true),
    );
    h.backend.onFrame(Duration.zero);
    const retargetTime = Duration(milliseconds: 200);
    h.backend.onFrame(retargetTime);
    final displayed = h.backend.transitions.rectangle(h.slot, 'bar', 3);
    expect(displayed?.height, 37.5);
    final before = await paintedBarColumn();
    expect(before, hasLength(inInclusiveRange(37, 38)));
    h.backend.camera.rotateTo(0);
    h.publish(
      await h.prepare([
        update('bar', {
          'size': {'height': '80%'},
        }),
      ], animate: true),
    );
    h.backend.onFrame(retargetTime);
    expect(h.backend.camera.rotating, isTrue);
    expect(h.backend.transitions.rectangle(h.slot, 'bar', 3), displayed);
    expect(await paintedBarColumn(), before);
    h.backend.onFrame(retargetTime + const Duration(milliseconds: 400));
    expect(await paintedBarColumn(), hasLength(48));
  });
}

PatchMapUpdate update(String id, Map<String, Object?> values) =>
    PatchMapUpdate(PatchMapTarget('g.0.0', componentId: id), values);
List<PatchMapUpdate> mixed() => [
  update('bar', {
    'size': {'height': '25%'},
    'tint': '#00ff00',
  }),
  update('text', {'text': '1234567'}),
];

final class Harness {
  Harness(this.backend, this.document);
  final MapBackend backend;
  final DatasetDocument document;
  int revision = 1;
  Map<String, Object?> lastFailures = {};
  RenderPublication get current => backend.current!;
  int get slot => current.geometry.topology.slots['g.0.0']!;
  static Future<Harness> create({List<Map<String, Object?>>? input}) async {
    final records =
        input ??
        [
          {
            'type': 'grid',
            'id': 'g',
            'cells': [
              [1, 1],
            ],
            'gap': 8,
            'item': {
              'size': {'width': 40, 'height': 60},
              'components': [
                {
                  'id': 'background',
                  'type': 'background',
                  'source': {'type': 'rect', 'fill': '#ffffff'},
                },
                {
                  'id': 'bar',
                  'type': 'bar',
                  'source': {'type': 'rect', 'fill': '#0000ff'},
                  'size': {'width': '100%', 'height': '100%'},
                  'animation': true,
                  'animationDuration': 400,
                },
                {
                  'id': 'text',
                  'type': 'text',
                  'text': '1',
                  'style': {'fontSize': 12},
                },
              ],
            },
          },
        ];
    final document = const DatasetReader().read(records);
    final backend = MapBackend(
      palette: ColorResolver(),
      registry: AssetRegistry(),
      invalidate: () {},
      onAssetFailure: (_) {},
      onReplacement: () {},
    );
    backend.validateDocument(document);
    final first =
        await backend.prepareDocument(document, 1) as RenderPublication;
    backend.publish(first, 1, 1);
    backend.resize(const Size(300, 300));
    return Harness(backend, document);
  }

  Map<String, Object?>? lookup(PatchMapTarget target) {
    final node = current.geometry[target.id]!;
    return target.componentId == null
        ? node.data
        : node.item!.components[node.item!.indices[target.componentId]!].data;
  }

  Future<RenderPublication> prepare(
    List<PatchMapUpdate> updates, {
    bool animate = false,
  }) async {
    final batch = const PresentationAdmission().admit(
      document,
      updates,
      current: lookup,
    );
    final direct = backend.validateRetainedUpdate(
      document,
      batch,
      lookup,
      current,
      1,
    );
    Map<PatchMapTarget, RecordDelta> changes;
    if (direct) {
      changes = backend.validatedChanges(document, batch, current, 1)!;
    } else {
      backend.validateUpdate(document, batch, lookup);
      changes = <PatchMapTarget, RecordDelta>{};
      for (final patch in batch.patches) {
        changes[patch.target] = const PresentationResolver().resolveDelta(
          authoredRecord(document, patch.target),
          lookup(patch.target)!,
          patch,
        );
      }
    }
    final prepared = await backend.prepareUpdate(
      current,
      document,
      changes,
      generation: 1,
      animate: animate,
      intent: batch,
    );
    lastFailures = prepared.failures;
    return prepared.publication as RenderPublication;
  }

  void publish(RenderPublication next) {
    final previous = current;
    backend.publish(next, 1, ++revision);
    backend.retire(previous);
  }

  void paint() {
    final recorder = PictureRecorder();
    backend.paint(Canvas(recorder), 1);
    recorder.endRecording().dispose();
  }

  void close() {
    final pub = backend.current;
    if (pub != null) backend.retire(pub);
    backend.close();
  }
}

Future<List<int>> pixels(DrawNode value) async {
  final recorder = PictureRecorder();
  drawing.paintReferenceNode(
    value,
    Canvas(recorder),
    cameraRotation: .3,
    physicalScale: 1,
  );
  final picture = recorder.endRecording();
  final image = await picture.toImage(180, 180);
  try {
    return (await image.toByteData(
      format: ImageByteFormat.rawRgba,
    ))!.buffer.asUint8List().toList();
  } finally {
    image.dispose();
    picture.dispose();
  }
}
