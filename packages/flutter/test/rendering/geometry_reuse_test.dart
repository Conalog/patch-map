import 'dart:io';
import 'package:conalog_patch_map/src/geometry/affine.dart';
import 'package:conalog_patch_map/src/api/target.dart';
import 'package:conalog_patch_map/src/rendering/draw_objects.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'draw_plan_test.dart' as support;

Map<String, Object?> patch(
  Map<String, Object?> data,
  Map<String, Object?> values,
) => Map.unmodifiable({...data, ...values});
Map<String, Object?> number() => {
  'type': 'text',
  'id': 'text',
  'text': '111',
  'tint': 'white',
  'style': {'fontSize': 16, 'fontFamily': 'FiraCode'},
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final loader = FontLoader('FiraCode')
      ..addFont(
        Future.value(
          ByteData.sublistView(
            File('assets/fonts/FiraCode-VF.ttf').readAsBytesSync(),
          ),
        ),
      );
    await loader.load();
  });
  test(
    'animated upright placement reuses only the fixed readable basis',
    () async {
      final h = support.Harness(active: false);
      addTearDown(h.close);
      final source = support.item(
        'i',
        40,
        orientation: 'upright',
        components: [
          support.background(),
          support.bar(attrs: {'angle': 27, 'scaleX': -.7, 'scaleY': 1.2}),
        ],
      );
      final p = h.read([source]);
      final component = p.nodes.single.components.last;
      final authored = p.nodes.single.geometry.world.multiply(
        component.layout.transform,
      );
      final basis = component.readableBasis(authored, .3);
      expect(
        component.readableBasis(
          Affine(authored.a, authored.b, authored.c, authored.d, 99, -77),
          .3,
        ),
        same(basis),
      );
      for (final height in [1.0, 7.5, 20.0, 0.0]) {
        final box = Rect.fromLTWH(10, 40 - height, 20, height);
        final fresh = h.read([source]);
        expect(
          await support.render(p, rotation: .3, tween: (_, _) => box),
          orderedEquals(
            await support.render(fresh, rotation: .3, tween: (_, _) => box),
          ),
        );
        expect(component.readableBasis(authored, .3), same(basis));
      }
      final rotated = component.readableBasis(authored, 2.1);
      expect(rotated, isNot(same(basis)));
      final scaled = component.readableBasis(
        const Affine(0, 0, 2, -3, 0, 0),
        2.1,
      );
      expect(scaled, isNot(same(rotated)));
      expect(
        scaled
            .place(
              const Affine(0, 0, 2, -3, 0, 0),
              const Rect.fromLTWH(0, 0, 5, 7),
            )
            .isFinite,
        true,
      );
    },
  );
  test(
    'fresh number and mixed publications need no previous render node',
    () async {
      final h = support.Harness(active: false);
      h.text.setActive(false);
      addTearDown(h.close);
      for (final components in [
        [support.background(), number()],
        [support.background(), support.bar(), number()],
      ]) {
        // Replacement compiles each new node without a previous publication.
        final fresh = h.read([support.item('i', 8, components: components)]);
        expect(fresh.nodes.single.components.length, components.length);
        expect(
          await support.render(fresh),
          orderedEquals(await support.render(fresh, reference: true)),
        );
      }
    },
  );

  test(
    'bar size and placement share paint while style changes remain isolated',
    () async {
      final h = support.Harness(active: false);
      addTearDown(h.close);
      final before = h.read([
        support.item('i', 8, components: [support.background(), support.bar()]),
      ]);
      final old = before.nodes.single.components.last;
      final oldPixels = await support.render(before);
      final resized = before.geometry.prepare({
        const PatchMapTarget('i', componentId: 'bar'): patch(old.layout.data, {
          'size': {'width': 7, 'height': 9},
          'placement': 'top',
        }),
      }, h.text.measure);
      final next = h.project(resized.snapshot, previous: before);
      expect(next.nodes.single.components.last.content, same(old.content));
      expect(await support.render(next), isNot(orderedEquals(oldPixels)));
      expect(await support.render(before), orderedEquals(oldPixels));
      expect(
        await support.render(next),
        orderedEquals(await support.render(next, reference: true)),
      );
      final recolored = next.geometry.prepare({
        const PatchMapTarget('i', componentId: 'bar'): patch(
          next.nodes.single.components.last.layout.data,
          {'tint': 'red'},
        ),
      }, h.text.measure);
      final colored = h.project(recolored.snapshot, previous: next);
      expect(
        colored.nodes.single.components.last.content,
        isNot(same(old.content)),
      );
      expect(await support.render(before), orderedEquals(oldPixels));
      expect(
        await support.render(colored),
        orderedEquals(await support.render(colored, reference: true)),
      );
    },
  );

  test('same-world bar transform changes retain sibling projections', () async {
    final h = support.Harness(active: false);
    h.text.setActive(false);
    addTearDown(h.close);
    final before = h.read([
      support.item(
        'i',
        8,
        components: [support.background(), support.bar(), number()],
      ),
    ]);
    final old = before.nodes.single;
    final change = before.geometry.prepare({
      const PatchMapTarget('i', componentId: 'bar'): patch(
        old.components[1].layout.data,
        {
          'attrs': {'x': 5},
        },
      ),
    }, h.text.measure);
    final next = h.project(change.snapshot, previous: before);
    final fresh = h.read([
      support.item(
        'i',
        8,
        components: [
          support.background(),
          support.bar(attrs: {'x': 5}),
          number(),
        ],
      ),
    ]);
    expect(next.nodes.single.matrix, same(old.matrix));
    expect(
      next.nodes.single.components.first,
      isNot(same(old.components.first)),
    );
    expect(
      next.nodes.single.components.first.content,
      same(old.components.first.content),
    );
    expect(
      next.nodes.single.components.first.matrix,
      same(old.components.first.matrix),
    );
    expect(next.nodes.single.components.last, isNot(same(old.components.last)));
    expect(
      next.nodes.single.components.last.content,
      same(old.components.last.content),
    );
    expect(
      next.nodes.single.components.last.matrix,
      same(old.components.last.matrix),
    );
    expect(
      next.nodes.single.components[1].layout.transform,
      isNot(same(old.components[1].layout.transform)),
    );
    expect(
      await support.render(next),
      orderedEquals(await support.render(fresh)),
    );
    expect(
      await support.render(next),
      orderedEquals(await support.render(next, reference: true)),
    );
  });

  test(
    'same-size number has new pixels and handle with shared immutable projections',
    () async {
      final h = support.Harness(active: false);
      h.text.setActive(false);
      addTearDown(h.close);
      final p = h.read([
        support.item(
          'i',
          8,
          components: [support.background(), support.bar(), number()],
        ),
      ]);
      final oldPixels = await support.render(p);
      final before = p.nodes.single;
      final change = p.geometry.prepare({
        const PatchMapTarget('i', componentId: 'text'): patch(
          before.components.last.layout.data,
          {'text': '888'},
        ),
      }, h.text.measure);
      final q = h.project(change.snapshot, previous: p), after = q.nodes.single;
      expect(identical(before, after), false);
      expect(identical(before.matrix, after.matrix), true);
      expect(identical(before.components[0], after.components[0]), false);
      expect(after.components[0].content, same(before.components[0].content));
      expect(after.components[0].matrix, same(before.components[0].matrix));
      expect(identical(before.components[1], after.components[1]), false);
      expect(after.components[1].content, same(before.components[1].content));
      expect(after.components[1].matrix, same(before.components[1].matrix));
      expect(identical(before.components.last, after.components.last), false);
      expect(
        identical(before.components.last.matrix, after.components.last.matrix),
        true,
      );
      final oldText = before.components.last.content as TextContent,
          nextText = after.components.last.content as TextContent;
      expect(identical(oldText, nextText), false);
      expect(nextText.handle.spec.text, '888');
      expect(oldText.handle.spec.text, '111');
      expect(q.plan.meshBuildCount, 0);
      expect(
        q.plan.staticMeshIdentities.single,
        same(p.plan.staticMeshIdentities.single),
      );
      expect(() => after.matrix[0] = 2, throwsUnsupportedError);
      expect(() => after.components.last.matrix[0] = 2, throwsUnsupportedError);
      final newPixels = await support.render(q);
      expect(newPixels, isNot(orderedEquals(oldPixels)));
      expect(await support.render(p), orderedEquals(oldPixels));
      expect(
        newPixels,
        orderedEquals(await support.render(q, reference: true)),
      );
    },
  );
  test(
    'tint-only geometry reuses measured box and paints the new color',
    () async {
      final h = support.Harness(active: false);
      h.text.setActive(false);
      addTearDown(h.close);
      final p = h.read([
        support.item('i', 8, components: [support.background(), number()]),
      ]);
      final old = p.nodes.single;
      var measurements = 0;
      final beforePixels = await support.render(p);
      final change = p.geometry.prepare(
        {
          const PatchMapTarget('i', componentId: 'text'): patch(
            old.components.last.layout.data,
            {'tint': 'red'},
          ),
        },
        (d, c) {
          measurements++;
          return h.text.measure(d, c);
        },
      );
      final q = h.project(change.snapshot, previous: p);
      expect(measurements, 0);
      expect(
        identical(
          old.components.last.layout.box,
          q.nodes.single.components.last.layout.box,
        ),
        true,
      );
      expect(
        (q.nodes.single.components.last.content as TextContent)
            .handle
            .spec
            .color
            .toARGB32(),
        0xffff0000,
      );
      expect(await support.render(q), isNot(orderedEquals(beforePixels)));
      expect(await support.render(p), orderedEquals(beforePixels));
    },
  );

  test(
    'changed item world produces new immutable projections and correct exact paint',
    () async {
      final h = support.Harness(active: false);
      h.text.setActive(false);
      addTearDown(h.close);
      final p = h.read([
        support.item('i', 8, components: [support.background(), number()]),
      ]);
      final old = p.nodes.single;
      final change = p.geometry.prepare({
        const PatchMapTarget('i'): patch(old.geometry.data, {
          'attrs': {'x': 30, 'y': 40, 'angle': 20, 'scaleX': .7},
        }),
      }, h.text.measure);
      final q = h.project(change.snapshot, previous: p);
      expect(identical(q.nodes.single.matrix, old.matrix), false);
      expect(q.nodes.single.matrix[12], 30);
      expect(old.matrix[12], 8);
      final fresh = h.read([
        {
          ...support.item('i', 8, components: [support.background(), number()]),
          'attrs': {'x': 30, 'y': 40, 'angle': 20, 'scaleX': .7},
        },
      ]);
      expect(
        await support.render(q),
        orderedEquals(await support.render(fresh)),
      );
    },
  );
}
