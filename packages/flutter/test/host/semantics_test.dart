import 'dart:ui' as ui;

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:conalog_patch_map/src/semantic/text/layout.dart';

Widget surface(PatchMapController controller) => MediaQuery(
  data: const MediaQueryData(devicePixelRatio: 1),
  child: Directionality(
    textDirection: TextDirection.ltr,
    child: Center(
      child: SizedBox(
        width: 100,
        height: 100,
        child: PatchMapView(controller: controller),
      ),
    ),
  ),
);

Future<PatchMapController> create(List<Map<String, dynamic>> data) =>
    PatchMapController.create(
      data: data,
      fit: false,
      width: 100,
      height: 100,
      textLayouter: layoutGeometryText,
    );

void expectRect(Rect actual, Rect expected) {
  expect(actual.left, closeTo(expected.left, 1e-7));
  expect(actual.top, closeTo(expected.top, 1e-7));
  expect(actual.right, closeTo(expected.right, 1e-7));
  expect(actual.bottom, closeTo(expected.bottom, 1e-7));
}

void main() {
  testWidgets('Semantics labels use nonempty label then text then identity', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    final c = await create([
      {
        'id': 'named',
        'type': 'text',
        'label': 'Authored label',
        'text': 'ignored',
      },
      {
        'id': 'text',
        'type': 'text',
        'label': '',
        'text': 'Text fallback',
        'attrs': {'y': 25},
      },
      {
        'id': 'identity',
        'type': 'rect',
        'label': '',
        'attrs': {'y': 60},
        'size': 20,
      },
    ]);
    await tester.pumpWidget(surface(c));
    await tester.pumpAndSettle();
    for (final label in ['Authored label', 'Text fallback', 'identity']) {
      expect(find.semantics.byLabel(label).evaluate(), hasLength(1));
    }
    expect(find.semantics.byLabel('ignored').evaluate(), isEmpty);
    await tester.pumpWidget(const SizedBox());
    await c.destroy();
    semantics.dispose();
  });

  testWidgets(
    'locked and ancestor-locked Semantics retain labels without activation',
    (tester) async {
      final semantics = tester.ensureSemantics();
      final c = await create([
        {'id': 'locked', 'type': 'rect', 'locked': true, 'size': 20},
        {
          'id': 'group',
          'type': 'group',
          'locked': true,
          'attrs': {'x': 30},
          'children': [
            {'id': 'child', 'type': 'rect', 'size': 20},
          ],
        },
        {
          'id': 'active',
          'type': 'rect',
          'size': 20,
          'attrs': {'x': 60},
        },
      ]);
      await tester.pumpWidget(surface(c));
      await tester.pumpAndSettle();
      for (final id in ['locked', 'child']) {
        final node = find.semantics.byLabel(id).evaluate().single;
        expect(
          node.getSemanticsData().hasAction(ui.SemanticsAction.tap),
          false,
        );
        expect(node.flagsCollection.isEnabled, ui.Tristate.isFalse);
      }
      final active = find.semantics.byLabel('active').evaluate().single;
      expect(active.getSemanticsData().hasAction(ui.SemanticsAction.tap), true);
      tester.semantics.tap(find.semantics.byLabel('active'));
      await tester.pumpAndSettle();
      expect(c.selection.ids, ['active']);
      await tester.pumpWidget(const SizedBox());
      await c.destroy();
      semantics.dispose();
    },
  );

  testWidgets(
    'overflow component bounds refresh with height and viewport rotation',
    (tester) async {
      final semantics = tester.ensureSemantics();
      final c = await create([
        {
          'id': 'grid',
          'type': 'grid',
          'cells': [
            [1],
          ],
          'attrs': {'x': 30, 'y': 40},
          'item': {
            'size': 20,
            'contentOrientation': 'follow-item',
            'components': [
              {
                'id': 'bar',
                'type': 'bar',
                'size': {'width': 10, 'height': 40},
                'placement': 'bottom',
                'animation': false,
                'source': {'fill': '#123456'},
              },
            ],
          },
        },
      ]);
      await tester.pumpWidget(surface(c));
      await tester.pumpAndSettle();
      expectRect(
        find.semantics.byLabel('grid.0.0').evaluate().single.rect,
        const Rect.fromLTWH(30, 20, 20, 40),
      );
      final before = c.renderSnapshot.geometry.topology;
      expect(
        c.updateBatch({
          'targets': ['grid.0.0'],
          'bar': {
            'height': [50],
          },
        }, animate: false).status,
        'committed',
      );
      await tester.pumpAndSettle();
      expect(identical(before, c.renderSnapshot.geometry.topology), true);
      expectRect(
        find.semantics.byLabel('grid.0.0').evaluate().single.rect,
        const Rect.fromLTWH(30, 10, 20, 50),
      );
      c.rotation.set(90);
      await tester.pumpAndSettle();
      expectRect(
        find.semantics.byLabel('grid.0.0').evaluate().single.rect,
        const Rect.fromLTWH(40, 30, 50, 20),
      );
      await tester.pumpWidget(const SizedBox());
      await c.destroy();
      semantics.dispose();
    },
  );

  testWidgets('upright overflow bounds follow the rendered owner anchor', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    final c = await create([
      {
        'id': 'upright',
        'type': 'item',
        'size': 20,
        'attrs': {'x': 70, 'y': 70, 'angle': 180},
        'contentOrientation': 'upright',
        'components': [
          {
            'id': 'bar',
            'type': 'bar',
            'size': {'width': 10, 'height': 40},
            'placement': 'bottom',
            'source': {'fill': '#123456'},
          },
        ],
      },
    ]);
    await tester.pumpWidget(surface(c));
    await tester.pumpAndSettle();
    expectRect(
      find.semantics.byLabel('upright').evaluate().single.rect,
      const Rect.fromLTWH(50, 30, 20, 40),
    );
    await tester.pumpWidget(const SizedBox());
    await c.destroy();
    semantics.dispose();
  });
}
