import 'dart:typed_data';

import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:patch_map_example/workload.dart';

Future<PatchMapResult> submitted(
  WidgetTester tester,
  Future<PatchMapResult> request,
) async {
  PatchMapResult? result;
  Object? failure;
  StackTrace? trace;
  request.then<void>(
    (value) {
      result = value;
    },
    onError: (Object error, StackTrace stack) {
      failure = error;
      trace = stack;
    },
  );
  final deadline = Stopwatch()..start();
  while (result == null && failure == null && deadline.elapsed.inSeconds < 30) {
    await tester.pump(const Duration(milliseconds: 16));
  }
  if (failure != null) Error.throwWithStackTrace(failure!, trace!);
  expect(result, isNotNull, reason: 'Native paint must settle the request');
  return result!;
}

Future<Uint8List> pixels(GlobalKey key) async {
  final boundary =
      key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
  final image = await boundary.toImage(pixelRatio: 1);
  try {
    final data = (await image.toByteData())!;
    return Uint8List.fromList(
      data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes),
    );
  } finally {
    image.dispose();
  }
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('native map selects a tapped item, paints updates and detaches', (
    tester,
  ) async {
    final controller = PatchMapController(), key = GlobalKey();
    final failures = <PatchMapFailure>[];
    final taps = <String>[];
    Widget host() => MediaQuery(
      data: const MediaQueryData(size: Size(300, 240)),
      child: Directionality(
        textDirection: TextDirection.ltr,
        child: Center(
          child: RepaintBoundary(
            key: key,
            child: SizedBox(
              width: 300,
              height: 240,
              child: PatchMapView(
                controller: controller,
                onImageFailure: failures.addAll,
                onEvent: (event) {
                  final target = event.target;
                  if (event.kind == PatchMapInputKind.tap && target != null) {
                    taps.add(target.id);
                    controller.toggleSelection([target.id]);
                  }
                },
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpWidget(host());
    final scene = MapWorkload(MapLayout.grid, count: 4);
    expect(
      (await submitted(tester, controller.draw(scene.data))).outcome,
      PatchMapOutcome.applied,
    );
    await tester.pumpAndSettle();
    final item = scene.ids.first;
    final local = controller.toLocal(controller.getGeometry(item)!.center!)!;
    final boundary = key.currentContext!.findRenderObject()! as RenderBox;
    await tester.tapAt(boundary.localToGlobal(local));
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pumpAndSettle();
    expect(taps, [item]);
    expect(controller.selected.map((object) => object.id), [item]);
    final before = await pixels(key);
    final bar = PatchMapTarget(scene.ids.first, componentId: 'bar');
    final text = PatchMapTarget(scene.ids.first, componentId: 'text');
    final result = await submitted(
      tester,
      controller.updateValues([
        PatchMapUpdate(bar, const {
          'size': {'height': '90%'},
          'tint': '#e74c3c',
        }),
        PatchMapUpdate(text, const {'text': '48271'}),
      ]),
    );
    expect(result.outcome, PatchMapOutcome.applied);
    expect(result.failures, isEmpty);
    expect(controller.getValue(bar)?['size'], containsPair('height', '90%'));
    expect(controller.getValue(text)?['text'], '48271');
    await tester.pumpAndSettle();
    final after = await pixels(key);
    expect(after.length, before.length);
    expect(
      after,
      isNot(orderedEquals(before)),
      reason: 'Native pixels must reflect the value update',
    );
    expect(failures, isEmpty);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
    expect(controller.isAttached, isFalse);
    expect(controller.getValue(text), isNull);
    await tester.pumpWidget(host());
    expect(controller.phase, PatchMapPhase.empty);
    expect(
      (await submitted(tester, controller.draw(scene.data))).outcome,
      PatchMapOutcome.applied,
    );
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
