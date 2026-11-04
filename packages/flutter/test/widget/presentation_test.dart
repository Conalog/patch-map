import 'dart:ui' as ui;

import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'patch_map_view_test.dart' as support;

List<Map<String, Object?>> rectangle(
  String id, {
  double alpha = 1,
  String color = '#ff0000',
}) => [
  {
    ...support.rectangle(id, color: color).single,
    'attrs': {'alpha': alpha},
  },
];

PatchMapPresentationLayer layer(String id, double alpha) =>
    PatchMapPresentationLayer(
      scope: [PatchMapTarget(id)],
      targets: const [],
      unmatchedAlpha: alpha,
    );

Future<List<int>> centerPixel(WidgetTester tester) async {
  final boundary = tester.renderObject<RenderRepaintBoundary>(
    find
        .descendant(
          of: find.byType(PatchMapView),
          matching: find.byType(RepaintBoundary),
        )
        .first,
  );
  return (await tester.runAsync(() async {
    final image = await boundary.toImage();
    try {
      final bytes = (await image.toByteData(
        format: ui.ImageByteFormat.rawStraightRgba,
      ))!;
      final offset = ((image.height ~/ 2) * image.width + image.width ~/ 2) * 4;
      return [for (var i = 0; i < 4; i++) bytes.getUint8(offset + i)];
    } finally {
      image.dispose();
    }
  }))!;
}

void expectAlpha(List<int> pixel, int expected) =>
    expect(pixel[3], closeTo(expected, 1));

Future<void> draw(
  WidgetTester tester,
  PatchMapController controller,
  Object data,
) async {
  final result = controller.draw(data);
  await support.progress(tester);
  expect((await result).outcome, PatchMapOutcome.applied);
}

void main() {
  testWidgets('keyed alpha multiplies and clear preserves authored values', (
    tester,
  ) async {
    final controller = PatchMapController();
    await tester.pumpWidget(support.host(controller));
    await draw(tester, controller, rectangle('a', alpha: 0.8));
    final before = controller.getValue(const PatchMapTarget('a'));
    expectAlpha(await centerPixel(tester), 204);
    expect(controller.setPresentation('first', layer('a', 0.5)).changed, true);
    expect(
      controller.setPresentation('second', layer('a', 0.25)).changed,
      true,
    );
    await tester.pump();
    expectAlpha(await centerPixel(tester), 26);
    expect(
      identical(controller.getValue(const PatchMapTarget('a')), before),
      true,
    );
    expect(controller.clearPresentation('second').changed, true);
    await tester.pump();
    expectAlpha(await centerPixel(tester), 102);
    expect(controller.clearPresentation('first').changed, true);
    await tester.pump();
    expectAlpha(await centerPixel(tester), 204);
    expect(controller.getValue(const PatchMapTarget('a')), before);
    expect(
      controller.clearPresentation('first').outcome,
      PatchMapOutcome.unchanged,
    );
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
    'live alpha and color updates survive retained layers and clearing',
    (tester) async {
      final controller = PatchMapController();
      await tester.pumpWidget(support.host(controller));
      await draw(tester, controller, rectangle('a', alpha: 0.8));
      controller.setPresentation('dim', layer('a', 0.5));
      final update = controller.updateValues([
        const PatchMapUpdate(PatchMapTarget('a'), {
          'fill': '#00ff00',
          'attrs': {'alpha': 0.4},
        }),
      ]);
      await support.progress(tester);
      expect((await update).outcome, PatchMapOutcome.applied);
      var pixel = await centerPixel(tester);
      expect(pixel.take(3), [0, 255, 0]);
      expectAlpha(pixel, 51);
      final value = controller.getValue(const PatchMapTarget('a'))!;
      expect(value['fill'], '#00ff00');
      expect((value['attrs'] as Map)['alpha'], 0.4);
      controller.clearPresentation('dim');
      await tester.pump();
      pixel = await centerPixel(tester);
      expect(pixel.take(3), [0, 255, 0]);
      expectAlpha(pixel, 102);
      expect(
        identical(controller.getValue(const PatchMapTarget('a')), value),
        true,
      );
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'invalid replacement preserves layers and accepted replacement resets',
    (tester) async {
      final controller = PatchMapController();
      await tester.pumpWidget(support.host(controller));
      await draw(tester, controller, rectangle('a'));
      controller.setPresentation('dim', layer('a', 0.25));
      await tester.pump();
      expectAlpha(await centerPixel(tester), 64);
      final invalid = await controller.draw([
        ...rectangle('b'),
        {'type': 'invalid', 'id': 'bad'},
      ]);
      expect(invalid.outcome, PatchMapOutcome.rejected);
      await tester.pump();
      expectAlpha(await centerPixel(tester), 64);
      expect(controller.getValue(const PatchMapTarget('a')), isNotNull);
      await draw(tester, controller, rectangle('b', color: '#0000ff'));
      expect(await centerPixel(tester), [0, 0, 255, 255]);
      expect(
        controller.clearPresentation('dim').outcome,
        PatchMapOutcome.unchanged,
      );
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'layer admitted immediately after draw survives asynchronous hide',
    (tester) async {
      final controller = PatchMapController();
      await tester.pumpWidget(support.host(controller));
      await draw(tester, controller, rectangle('old'));
      controller.setPresentation('old-layer', layer('old', 0));
      final replacement = controller.draw(rectangle('next', alpha: 0.8));
      expect(controller.phase, PatchMapPhase.preparing);
      expect(
        controller.setPresentation('new-layer', layer('next', 0.5)).changed,
        true,
      );
      await support.progress(tester);
      expect((await replacement).outcome, PatchMapOutcome.applied);
      expectAlpha(await centerPixel(tester), 102);
      expect(
        controller.clearPresentation('old-layer').outcome,
        PatchMapOutcome.unchanged,
      );
      controller.clearPresentation('new-layer');
      await tester.pump();
      expectAlpha(await centerPixel(tester), 204);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'inactive layers retain latest state without repainting until resume',
    (tester) async {
      final controller = PatchMapController();
      await tester.pumpWidget(support.host(controller));
      await draw(tester, controller, rectangle('a'));
      await tester.pumpWidget(support.host(controller, active: false));
      controller.setPresentation('dim', layer('a', .5));
      controller.setPresentation('dim', layer('a', .25));
      await tester.pump();
      expectAlpha(await centerPixel(tester), 255);
      await tester.pumpWidget(support.host(controller));
      await support.progress(tester);
      expectAlpha(await centerPixel(tester), 64);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'callback replacement binds layers and updates to the new diagram',
    (tester) async {
      final controller = PatchMapController();
      Future<PatchMapResult>? replacement, update;
      PatchMapPresentationResult? effect;
      await tester.pumpWidget(
        support.host(
          controller,
          event: (event) {
            if (event.kind != PatchMapInputKind.tap) return;
            replacement = controller.draw(rectangle('new'));
            effect = controller.setPresentation('next', layer('new', .5));
            update = controller.updateValues(const [
              PatchMapUpdate(PatchMapTarget('new'), {'fill': '#00ff00'}),
            ]);
          },
        ),
      );
      await draw(tester, controller, rectangle('old'));
      controller.setPresentation('old', layer('old', .25));
      await tester.pump();
      await tester.tapAt(tester.getCenter(find.byType(PatchMapView)));
      await tester.pump(const Duration(milliseconds: 350));
      await support.progress(tester);
      expect(effect?.outcome, PatchMapOutcome.applied);
      expect((await replacement!).outcome, PatchMapOutcome.applied);
      expect((await update!).outcome, PatchMapOutcome.applied);
      expect(controller.getValue(const PatchMapTarget('old')), isNull);
      expect(await centerPixel(tester), [0, 255, 0, 128]);
      expect(
        controller.clearPresentation('old').outcome,
        PatchMapOutcome.unchanged,
      );
      controller.clearPresentation('next');
      await tester.pump();
      expect(await centerPixel(tester), [0, 255, 0, 255]);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets('alpha zero leaves selection and hit events available', (
    tester,
  ) async {
    final controller = PatchMapController(), events = <PatchMapInputEvent>[];
    await tester.pumpWidget(support.host(controller, event: events.add));
    await draw(tester, controller, rectangle('a'));
    controller.select(['a']);
    controller.setPresentation('hidden', layer('a', 0));
    await tester.pump();
    expectAlpha(await centerPixel(tester), 0);
    expect(controller.selected.single.id, 'a');
    await tester.tapAt(tester.getCenter(find.byType(PatchMapView)));
    await tester.pump(const Duration(milliseconds: 350));
    expect(
      events
          .where((event) => event.kind == PatchMapInputKind.tap)
          .single
          .target!
          .id,
      'a',
    );
    expect(controller.selected.single.id, 'a');
    controller.clearPresentation('hidden');
    await tester.pump();
    expectAlpha(await centerPixel(tester), 255);
    expect(controller.selected.single.id, 'a');
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
    'filters reject layer commands and reattachment starts with no layers',
    (tester) async {
      final controller = PatchMapController(),
          rejected = <PatchMapPresentationResult>[];
      await tester.pumpWidget(
        support.host(
          controller,
          filter: (object) {
            rejected.add(
              controller.setPresentation('dim', layer(object.id, 0)),
            );
            rejected.add(controller.clearPresentation('dim'));
            return true;
          },
        ),
      );
      await draw(tester, controller, rectangle('a'));
      controller.setPresentation('dim', layer('a', 0.5));
      await tester.pump();
      await tester.tapAt(tester.getCenter(find.byType(PatchMapView)));
      await tester.pump(const Duration(milliseconds: 350));
      expect(rejected, isNotEmpty);
      expect(
        rejected.every((result) => result.outcome == PatchMapOutcome.rejected),
        true,
      );
      expectAlpha(await centerPixel(tester), 128);
      await tester.pumpWidget(const SizedBox());
      expect(
        controller
            .setPresentation('detached', layer('a', 0))
            .failures
            .single
            .code,
        'DETACHED',
      );
      expect(
        controller.clearPresentation('dim').failures.single.code,
        'DETACHED',
      );
      await tester.pumpWidget(support.host(controller));
      expect(controller.phase, PatchMapPhase.empty);
      final early = controller.setPresentation('early', layer('a', 0));
      expect(early.outcome, PatchMapOutcome.rejected);
      expect(early.failures, isNotEmpty);
      await draw(tester, controller, rectangle('a'));
      expectAlpha(await centerPixel(tester), 255);
      expect(
        controller.clearPresentation('dim').outcome,
        PatchMapOutcome.unchanged,
      );
      await tester.pumpWidget(const SizedBox());
    },
  );
}
