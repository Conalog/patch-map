import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patch_map/patch_map.dart';

Future<PatchMapController> mountMap(
  WidgetTester tester, {
  bool reducedMotion = false,
}) async {
  final controller = await PatchMapController.create(
    data: [
      {
        'id': 'grid',
        'type': 'grid',
        'cells': [
          [1],
        ],
        'item': {
          'size': 80,
          'components': [
            {
              'id': 'bar',
              'type': 'bar',
              'size': {'width': 10, 'height': 20},
              'source': {'fill': '#123456'},
            },
          ],
        },
      },
    ],
    fit: false,
    width: 100,
    height: 100,
  );
  await tester.pumpWidget(
    MediaQuery(
      data: MediaQueryData(
        devicePixelRatio: 1,
        disableAnimations: reducedMotion,
      ),
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
    ),
  );
  await tester.pumpAndSettle();
  addTearDown(controller.destroy);
  return controller;
}

double height(PatchMapController controller) => controller
    .renderSnapshot
    .geometry
    .targets['grid.0.0\u0000bar']!
    .bounds
    .height;

void main() {
  testWidgets('height animation starts at request time after an idle surface', (
    tester,
  ) async {
    final controller = await mountMap(tester);
    await tester.pump(const Duration(seconds: 5));
    expect(tester.binding.transientCallbackCount, 0);
    expect(
      controller.update({
        'id': 'grid.0.0',
        'bar': {'height': 60},
      }).status,
      'committed',
    );
    expect(height(controller), 20);
    await tester.pump(const Duration(milliseconds: 100));
    expect(height(controller), closeTo(55, 1e-7));
    await tester.pump(const Duration(milliseconds: 100));
    expect(height(controller), 60);
    await tester.pumpAndSettle();
    expect(tester.binding.transientCallbackCount, 0);
  });

  testWidgets('batch retarget samples the current height between frames', (
    tester,
  ) async {
    final controller = await mountMap(tester);
    await tester.pump(const Duration(seconds: 5));
    void update(double value) => controller.updateBatch({
      'targets': ['grid.0.0'],
      'bar': {
        'height': [value],
      },
    }, animate: true);
    update(60);
    await tester.pump(const Duration(milliseconds: 50));
    expect(height(controller), closeTo(43.125, 1e-7));
    // Advance the host clock without publishing a map frame, as a second
    // command can arrive between vsyncs.
    (tester.binding as AutomatedTestWidgetsFlutterBinding).elapseBlocking(
      const Duration(milliseconds: 25),
    );
    update(10);
    expect(height(controller), closeTo(50.234375, 1e-7));
    await tester.pump(const Duration(milliseconds: 100));
    expect(height(controller), closeTo(15.029296875, 1e-7));
    await tester.pump(const Duration(milliseconds: 100));
    expect(height(controller), 10);
    await tester.pumpAndSettle();
    expect(tester.binding.transientCallbackCount, 0);
  });

  testWidgets(
    'explicit immediate and reduced motion skip height interpolation',
    (tester) async {
      final controller = await mountMap(tester, reducedMotion: true);
      await tester.pump(const Duration(seconds: 5));
      controller.update({
        'id': 'grid.0.0',
        'bar': {'height': 60},
      }, animate: true);
      expect(height(controller), 60);
      await tester.pumpAndSettle();
      expect(tester.binding.transientCallbackCount, 0);
      controller.update({
        'id': 'grid.0.0',
        'bar': {'height': 10},
      }, animate: false);
      expect(height(controller), 10);
      await tester.pumpAndSettle();
      expect(tester.binding.transientCallbackCount, 0);
    },
  );

  testWidgets('rotation shares the idle-safe animation clock', (tester) async {
    final controller = await mountMap(tester);
    await tester.pump(const Duration(seconds: 5));
    final animation = controller.rotation.animateTo(90, durationMs: 200);
    await tester.pump(const Duration(milliseconds: 100));
    expect(controller.rotation.value, closeTo(78.75, 1e-7));
    await tester.pump(const Duration(milliseconds: 100));
    expect(controller.rotation.value, 90);
    expect((await animation.finished).status, 'completed');
    await tester.pumpAndSettle();
  });
}
