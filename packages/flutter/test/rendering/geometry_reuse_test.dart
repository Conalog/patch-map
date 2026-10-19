import 'dart:io';
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
      expect(identical(before.components[0], after.components[0]), true);
      expect(identical(before.components[1], after.components[1]), true);
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
