import 'dart:convert';

import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'patch_map_view_test.dart' as support;

Future<PatchMapResult> update(
  WidgetTester tester,
  PatchMapController controller,
  List<PatchMapUpdate> values,
) async {
  PatchMapResult? result;
  Object? error;
  controller
      .updateValues(values)
      .then<void>(
        (value) => result = value,
        onError: (Object value) => error = value,
      );
  await support.progress(tester, 16);
  expect(error, isNull);
  expect(tester.takeException(), isNull);
  expect(
    controller.phase,
    PatchMapPhase.ready,
    reason:
        '${result?.failures.map((failure) => '${failure.code}: ${failure.message} (${failure.path})')}',
  );
  return result!;
}

void main() {
  for (final count in [1, 2]) {
    testWidgets('derived relation isolates $count overflowing endpoints', (
      tester,
    ) async {
      final endpoints = [for (var i = 0; i < count; i++) 'endpoint$i'];
      final controller = PatchMapController();
      await tester.pumpWidget(support.host(controller));
      final draw = controller.draw([
        {'type': 'rect', 'id': 'fixed', 'size': 10},
        {'type': 'rect', 'id': 'safe', 'size': 10},
        for (final id in endpoints) {'type': 'rect', 'id': id, 'size': 10},
        {
          'type': 'relations',
          'id': 'relation',
          'links': [
            {'source': 'safe', 'target': 'safe'},
            for (final id in endpoints) {'source': id, 'target': id},
          ],
        },
        {'type': 'text', 'id': 'label', 'text': 'old'},
      ]);
      await support.progress(tester);
      expect((await draw).outcome, PatchMapOutcome.applied);
      final positioned = await update(tester, controller, [
        const PatchMapUpdate(PatchMapTarget('fixed'), {
          'attrs': {'x': -1e308},
        }),
        for (final id in endpoints)
          PatchMapUpdate(PatchMapTarget(id), {
            'attrs': {'x': 5e307},
            'size': {'width': 1e307, 'height': 10},
          }),
      ]);
      expect(positioned.outcome, PatchMapOutcome.applied);
      final before = {
        for (final id in endpoints) id: controller.getValue(PatchMapTarget(id)),
      };
      final result = await update(tester, controller, [
        const PatchMapUpdate(PatchMapTarget('safe'), {
          'attrs': {'x': 1},
        }),
        for (final id in endpoints)
          PatchMapUpdate(PatchMapTarget(id), {
            'attrs': {'x': 6e307},
          }),
        const PatchMapUpdate(PatchMapTarget('label'), {'text': 'new'}),
      ]);
      expect(result.outcome, PatchMapOutcome.partialFailure);
      expect(
        result.failures.map((failure) => failure.target!.id),
        unorderedEquals(endpoints),
      );
      expect(
        result.failures.map((failure) => failure.code),
        everyElement('INVALID_GEOMETRY'),
      );
      for (final id in endpoints) {
        expect(controller.getValue(PatchMapTarget(id)), before[id]);
      }
      expect(controller.getGeometry('safe')!.bounds!.left, 1);
      expect(
        controller.getValue(const PatchMapTarget('label'))!['text'],
        'new',
      );
      await tester.pumpWidget(const SizedBox());
    });
  }

  testWidgets('derived relation isolates a container visibility update', (
    tester,
  ) async {
    final controller = PatchMapController();
    await tester.pumpWidget(support.host(controller));
    final draw = controller.draw([
      {'type': 'rect', 'id': 'fixed', 'size': 10},
      {
        'type': 'group',
        'id': 'g',
        'show': false,
        'children': [
          for (var i = 0; i < 2; i++)
            {
              'type': 'rect',
              'id': 'child$i',
              'attrs': {'x': 6e307},
              'size': {'width': 1e307, 'height': 10},
            },
        ],
      },
      {
        'type': 'relations',
        'id': 'relation',
        'links': [
          {'source': 'g', 'target': 'g'},
        ],
      },
      {'type': 'text', 'id': 'label', 'text': 'old'},
    ]);
    await support.progress(tester);
    expect((await draw).outcome, PatchMapOutcome.applied);
    expect(
      (await update(tester, controller, const [
        PatchMapUpdate(PatchMapTarget('fixed'), {
          'attrs': {'x': -1e308},
        }),
      ])).outcome,
      PatchMapOutcome.applied,
    );
    final result = await update(tester, controller, const [
      PatchMapUpdate(PatchMapTarget('g'), {'show': true}),
      PatchMapUpdate(PatchMapTarget('label'), {'text': 'new'}),
    ]);
    expect(result.outcome, PatchMapOutcome.partialFailure);
    expect(result.failures.single.target, const PatchMapTarget('g'));
    expect(controller.getValue(const PatchMapTarget('g'))!['show'], false);
    expect(controller.getValue(const PatchMapTarget('label'))!['text'], 'new');
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('joint tied container extremes keep the publication valid', (
    tester,
  ) async {
    final controller = PatchMapController();
    await tester.pumpWidget(support.host(controller));
    final draw = controller.draw([
      {'type': 'rect', 'id': 'fixed', 'size': 10},
      {
        'type': 'group',
        'id': 'g',
        'children': [
          for (var i = 0; i < 4; i++)
            {'type': 'rect', 'id': 'child$i', 'size': 10},
        ],
      },
      {
        'type': 'relations',
        'id': 'relation',
        'links': [
          {'source': 'g', 'target': 'g'},
        ],
      },
      {'type': 'text', 'id': 'label', 'text': 'old'},
    ]);
    await support.progress(tester);
    expect((await draw).outcome, PatchMapOutcome.applied);
    expect(
      (await update(tester, controller, [
        const PatchMapUpdate(PatchMapTarget('fixed'), {
          'attrs': {'x': -1e308},
        }),
        for (var i = 0; i < 4; i++)
          PatchMapUpdate(PatchMapTarget('child$i'), {
            'attrs': {'x': 5e307},
            'size': {'width': 1e306, 'height': 10},
          }),
      ])).outcome,
      PatchMapOutcome.applied,
    );
    final result = await update(tester, controller, [
      for (var i = 0; i < 4; i++)
        PatchMapUpdate(PatchMapTarget('child$i'), {
          'attrs': {'x': i < 2 ? 4e307 : 6e307},
        }),
      const PatchMapUpdate(PatchMapTarget('label'), {'text': 'new'}),
    ]);
    expect(result.outcome, PatchMapOutcome.partialFailure);
    expect(result.failures, hasLength(2));
    for (final failure in result.failures) {
      expect(failure.code, 'INVALID_GEOMETRY');
      expect(
        (controller.getValue(failure.target!)!['attrs'] as Map)['x'],
        5e307,
      );
    }
    final left = controller.getGeometry('fixed')!.paintBounds!.left;
    final right = controller.getGeometry('relation')!.paintBounds!.right;
    expect((right - left).isFinite, true);
    expect(controller.getValue(const PatchMapTarget('label'))!['text'], 'new');
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('ready intrinsic overflow rolls back the image source update', (
    tester,
  ) async {
    String source(int width) =>
        'data:image/svg+xml;base64,${base64Encode(utf8.encode('<svg xmlns="http://www.w3.org/2000/svg" width="$width" height="1"><rect width="$width" height="1"/></svg>'))}';
    final controller = PatchMapController();
    await tester.pumpWidget(support.host(controller));
    final original = source(1);
    final draw = controller.draw([
      {'type': 'rect', 'id': 'fixed', 'size': 10},
      {'type': 'image', 'id': 'image', 'source': original},
      {'type': 'text', 'id': 'label', 'text': 'old'},
    ]);
    await support.progress(tester, 16);
    expect((await draw).outcome, PatchMapOutcome.applied);
    expect(controller.getGeometry('image')!.bounds!.width, 1);
    final positioned = await update(tester, controller, const [
      PatchMapUpdate(PatchMapTarget('fixed'), {
        'attrs': {'x': -1e308},
      }),
      PatchMapUpdate(PatchMapTarget('image'), {
        'attrs': {'x': 7e307, 'scaleX': 1e306},
      }),
    ]);
    expect(positioned.outcome, PatchMapOutcome.applied);
    final before = controller.getGeometry('image')!.bounds;
    final result = await update(tester, controller, [
      PatchMapUpdate(const PatchMapTarget('image'), {'source': source(10)}),
      const PatchMapUpdate(PatchMapTarget('label'), {'text': 'new'}),
    ]);
    expect(result.outcome, PatchMapOutcome.partialFailure);
    expect(result.failures.single.code, 'INVALID_GEOMETRY');
    expect(result.failures.single.target, const PatchMapTarget('image'));
    expect(
      controller.getValue(const PatchMapTarget('image'))!['source'],
      original,
    );
    expect(controller.getGeometry('image')!.bounds, before);
    expect(controller.getValue(const PatchMapTarget('label'))!['text'], 'new');
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
    'overflowing aggregate rolls back a changed item and keeps independent updates',
    (tester) async {
      final controller = PatchMapController();
      await tester.pumpWidget(support.host(controller));
      final draw = controller.draw([
        {
          'type': 'group',
          'id': 'g',
          'children': [
            {'type': 'rect', 'id': 'left', 'size': 10},
            {'type': 'rect', 'id': 'right', 'size': 10},
            {'type': 'text', 'id': 'label', 'text': 'old'},
          ],
        },
      ]);
      await support.progress(tester);
      expect((await draw).outcome, PatchMapOutcome.applied);
      final before = {
        for (final id in ['left', 'right'])
          id: controller.getValue(PatchMapTarget(id)),
      };
      final update = controller.updateValues(const [
        PatchMapUpdate(PatchMapTarget('left'), {
          'attrs': {'x': -1e308},
        }),
        PatchMapUpdate(PatchMapTarget('right'), {
          'attrs': {'x': 1e308},
        }),
        PatchMapUpdate(PatchMapTarget('label'), {'text': 'new'}),
      ]);
      await support.progress(tester);
      final result = await update;
      final geometry = controller.getGeometry('g')!;
      expect(result.outcome, PatchMapOutcome.partialFailure);
      expect(result.failures.single.code, 'INVALID_GEOMETRY');
      final failed = result.failures.single.target!.id;
      expect(failed, anyOf('left', 'right'));
      expect(controller.getValue(PatchMapTarget(failed)), before[failed]);
      expect(
        controller.getValue(const PatchMapTarget('label'))!['text'],
        'new',
      );
      expect(geometry.bounds!.width.isFinite, isTrue);
      expect(geometry.paintBounds!.width.isFinite, isTrue);
      expect(controller.phase, PatchMapPhase.ready);
      expect(tester.takeException(), isNull);
      final recovery = controller.updateValues(const [
        PatchMapUpdate(PatchMapTarget('left'), {
          'attrs': {'x': 0},
        }),
        PatchMapUpdate(PatchMapTarget('right'), {
          'attrs': {'x': 20},
        }),
      ]);
      await support.progress(tester);
      expect((await recovery).outcome, PatchMapOutcome.applied);
      expect(controller.fit().outcome, PatchMapOutcome.applied);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
