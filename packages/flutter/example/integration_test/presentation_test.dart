import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:conalog_patch_map/src/widget/map_backend.dart' show MapBackend;
import 'package:flutter/foundation.dart' show debugPrintSynchronously;
import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'runtime_test.dart' show submitted;

Future<Uint8List> capture(GlobalKey key, String name) async {
  final boundary =
      key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
  final image = await boundary.toImage(pixelRatio: 1);
  try {
    if (const bool.fromEnvironment('PRESENTATION_CAPTURE')) {
      final png = (await image.toByteData(format: ui.ImageByteFormat.png))!;
      debugPrintSynchronously(
        'PRESENTATION_PNG $name ${base64Encode(png.buffer.asUint8List(png.offsetInBytes, png.lengthInBytes))}',
      );
    }
    final raw = (await image.toByteData(format: ui.ImageByteFormat.rawRgba))!;
    return Uint8List.fromList(
      raw.buffer.asUint8List(raw.offsetInBytes, raw.lengthInBytes),
    );
  } finally {
    image.dispose();
  }
}

Future<String> rasterSource() async {
  final recorder = ui.PictureRecorder();
  Canvas(recorder).drawRect(
    const Rect.fromLTWH(0, 0, 20, 20),
    Paint()..color = const Color(0xcc22aa44),
  );
  final picture = recorder.endRecording();
  final image = await picture.toImage(20, 20);
  try {
    final bytes = (await image.toByteData(format: ui.ImageByteFormat.png))!;
    return 'data:image/png;base64,${base64Encode(bytes.buffer.asUint8List(bytes.offsetInBytes, bytes.lengthInBytes))}';
  } finally {
    image.dispose();
    picture.dispose();
  }
}

List<Map<String, Object?>> scene(String png, int copies) => [
  for (var i = 0; i < copies; i++)
    {
      'type': 'image',
      'id': 'svg$i',
      'source': 'object',
      'size': 18,
      'attrs': {'x': 8 + (i % 4) * 23, 'y': 8 + (i ~/ 4) * 23, 'alpha': .8},
    },
  {
    'type': 'image',
    'id': 'raster',
    'source': png,
    'size': 40,
    'attrs': {'x': 115, 'y': 8},
  },
  {
    'type': 'text',
    'id': 'label',
    'text': 'AB12',
    'attrs': {'x': 112, 'y': 60},
    'style': {
      'fontSize': 18,
      'fill': '#e08020',
      'stroke': {'color': '#224488', 'width': 1},
    },
  },
  {
    'type': 'item',
    'id': 'panel',
    'size': {'width': 70, 'height': 60},
    'attrs': {'x': 110, 'y': 100},
    'components': [
      {
        'type': 'background',
        'id': 'bg',
        'source': {'fill': '#778899', 'radius': 3},
      },
      {
        'type': 'bar',
        'id': 'bar',
        'source': {'fill': '#2288cc', 'radius': 3},
        'size': {'width': '100%', 'height': '40%'},
        'placement': 'bottom',
        'animation': true,
        'animationDuration': 80,
      },
      {
        'type': 'text',
        'id': 'number',
        'text': '1234',
        'placement': 'center',
        'style': {
          'fontFamily': 'FiraCode',
          'fontWeight': 500,
          'fontSize': 'auto',
          'autoFont': {'min': 8, 'max': 14},
          'fill': '#ffffff',
          'align': 'center',
          'wordWrap': true,
          'wordWrapWidth': 'auto',
        },
      },
    ],
  },
];

void samePixels(Uint8List actual, Uint8List expected) {
  expect(actual.length, expected.length);
  for (var i = 0; i < actual.length; i++) {
    // Native vector antialiasing/readback can vary by one or two byte levels
    // even with the identical display list. No geometric drift is permitted.
    expect(actual[i], closeTo(expected[i], 2), reason: 'Channel $i changed');
  }
}

void faded(
  Uint8List before,
  Uint8List after,
  Rect region,
  double factor, {
  double tolerance = 2,
}) {
  var checked = 0, beforeAlpha = 0, afterAlpha = 0;
  for (var y = region.top.toInt(); y < region.bottom; y++) {
    for (var x = region.left.toInt(); x < region.right; x++) {
      final offset = (y * 200 + x) * 4;
      beforeAlpha += before[offset + 3];
      afterAlpha += after[offset + 3];
      if (before[offset + 3] < 20) continue;
      checked++;
      expect(
        after[offset + 3],
        greaterThan(0),
        reason: 'Visible ink must not be clipped',
      );
      for (var c = 0; c < 4; c++) {
        expect(
          after[offset + c],
          closeTo(before[offset + c] * factor, tolerance),
          reason: 'Pixel ($x,$y) channel$c must multiply existing alpha',
        );
      }
    }
  }
  expect(
    checked,
    greaterThan(30),
    reason: 'The asset/text must actually be drawn',
  );
  expect(afterAlpha / beforeAlpha, closeTo(factor, .005));
}

// Read only diagnostic readiness: a first-screen Paragraph may become an atlas
// asynchronously. Do not confuse that approved transition with effect clearing.
Future<void> resourcesReady(WidgetTester tester, int svgCopies) async {
  final dynamic state = tester.state(find.byType(PatchMapView));
  final backend = state.backend as MapBackend;
  final resources = backend.current!.resources;
  final limit = Stopwatch()..start();
  while ((resources.text.atlases.residentBytes == 0 ||
          resources.text.atlases.running > 0 ||
          resources.vectors.pendingCount > 0 ||
          resources.svgImages.preparingCount > 0 ||
          resources.svgImages.queuedCount > 0) &&
      limit.elapsed.inSeconds < 15) {
    await tester.pump(const Duration(milliseconds: 50));
  }
  expect(resources.text.atlases.residentBytes, greaterThan(0));
  expect(resources.text.atlases.failures, 0);
  expect(resources.svgImages.preparingCount, 0);
  expect(resources.svgImages.entryCount, svgCopies >= 16 ? greaterThan(0) : 0);
  await tester.pumpAndSettle();
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('native alpha layers preserve assets, values and replacement', (
    tester,
  ) async {
    final controller = PatchMapController(), key = GlobalKey();
    final failures = <PatchMapFailure>[];
    final png = await rasterSource();
    await tester.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(size: Size(200, 180)),
        child: Directionality(
          textDirection: TextDirection.ltr,
          child: Center(
            child: RepaintBoundary(
              key: key,
              child: SizedBox(
                width: 200,
                height: 180,
                child: PatchMapView(
                  controller: controller,
                  onImageFailure: failures.addAll,
                ),
              ),
            ),
          ),
        ),
      ),
    );
    for (final copies in [16, 1]) {
      final data = scene(png, copies);
      final result = await submitted(tester, controller.draw(data));
      expect(result.outcome, PatchMapOutcome.applied);
      expect(
        controller.clearPresentation('old').outcome,
        PatchMapOutcome.unchanged,
      );
      controller.setCamera(
        center: const Offset(100, 90),
        scale: 1,
        rotation: 0,
      );
      await resourcesReady(tester, copies);
      final before = await capture(key, 'baseline-$copies');
      final repeated = await capture(key, 'baseline-repeat-$copies');
      samePixels(repeated, before);
      final scope = data
          .map((record) => PatchMapTarget(record['id']! as String))
          .toList();
      PatchMapPresentationLayer layer(double factor) =>
          PatchMapPresentationLayer(
            scope: scope,
            targets: const [],
            unmatchedAlpha: factor,
          );
      controller.setPresentation('filter', layer(.5));
      controller.setPresentation('memo', layer(.5));
      await tester.pumpAndSettle();
      var dimmed = await capture(key, 'quarter-$copies');
      faded(
        before,
        dimmed,
        const Rect.fromLTWH(8, 8, 18, 18),
        .25,
        tolerance: copies == 1 ? 4 : 2,
      );
      faded(before, dimmed, const Rect.fromLTWH(115, 8, 40, 40), .25);
      // Vulkan's offscreen antialiasing differs slightly from direct glyph
      // drawing. Bound that difference while still rejecting lost ink/alpha.
      faded(
        before,
        dimmed,
        const Rect.fromLTWH(110, 58, 80, 35),
        .25,
        tolerance: 8,
      );
      controller.clearPresentation('memo');
      await tester.pumpAndSettle();
      dimmed = await capture(key, 'half-$copies');
      faded(
        before,
        dimmed,
        const Rect.fromLTWH(8, 8, 18, 18),
        .5,
        tolerance: copies == 1 ? 4 : 2,
      );
      controller.clearPresentation('filter');
      await tester.pumpAndSettle();
      samePixels(await capture(key, 'restored-$copies'), before);

      controller.setPresentation('filter', layer(.5));
      const number = PatchMapTarget('panel', componentId: 'number');
      const bar = PatchMapTarget('panel', componentId: 'bar');
      final updated = await submitted(
        tester,
        controller.updateValues(const [
          PatchMapUpdate(number, {'text': '98765'}),
          PatchMapUpdate(bar, {
            'size': {'height': '90%'},
            'tint': '#ff5555',
          }),
        ]),
      );
      expect(updated.outcome, PatchMapOutcome.applied);
      await tester.pumpAndSettle();
      controller.clearPresentation('filter');
      await tester.pumpAndSettle();
      expect(controller.getValue(number)?['text'], '98765');
      expect(controller.getValue(bar)?['size'], containsPair('height', '90%'));
      expect(
        await capture(key, 'updated-$copies'),
        isNot(orderedEquals(before)),
      );
      controller.setPresentation('old', layer(0));
    }
    expect(failures, isEmpty);
    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
    expect(controller.isAttached, isFalse);
    expect(tester.takeException(), isNull);
  });
}
