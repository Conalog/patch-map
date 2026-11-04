import 'dart:convert';
import 'dart:io';

import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/foundation.dart'
    show debugPrintSynchronously, listEquals;
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'presentation_test.dart' show capture, rasterSource;
import 'runtime_test.dart' show submitted;

Widget host(
  PatchMapController controller,
  GlobalKey boundary, {
  Size size = const Size(200, 160),
  bool active = true,
}) => MediaQuery(
  data: const MediaQueryData(size: Size(400, 400)),
  child: Directionality(
    textDirection: TextDirection.ltr,
    child: Center(
      child: RepaintBoundary(
        key: boundary,
        child: SizedBox.fromSize(
          size: size,
          child: ColoredBox(
            color: const Color(0xffffffff),
            child: PatchMapView(
              controller: controller,
              active: active,
              // Transparent host loading UI must not mask a stale map layer.
              loadingBuilder: (_) => const SizedBox.shrink(),
            ),
          ),
        ),
      ),
    ),
  ),
);

const rectangle = [
  {'type': 'rect', 'id': 'old', 'size': 100, 'fill': '#ff0000'},
];

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('replacement clears idle native pixels before a delayed update', (
    tester,
  ) async {
    final controller = PatchMapController(), boundary = GlobalKey();
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final received = <HttpRequest>[];
    final listener = server.listen(received.add);
    addTearDown(() async {
      await listener.cancel();
      await server.close(force: true);
    });
    await tester.pumpWidget(host(controller, boundary));
    final empty = await capture(boundary, 'replacement-empty');
    expect(
      (await submitted(tester, controller.draw(rectangle))).outcome,
      PatchMapOutcome.applied,
    );
    await tester.pumpAndSettle();
    final before = await capture(boundary, 'replacement-before');
    expect(before, isNot(orderedEquals(empty)));

    final source = await rasterSource();
    final draw = controller.draw([
      {
        'type': 'image',
        'id': 'new',
        'size': 100,
        'source': 'http://127.0.0.1:${server.port}/initial.png',
      },
    ]);
    var finished = false;
    final update = controller
        .updateValues([
          PatchMapUpdate(const PatchMapTarget('new'), {
            'source': 'http://127.0.0.1:${server.port}/delayed.png',
          }),
        ])
        .then((value) {
          finished = true;
          return value;
        });
    final deadline = Stopwatch()..start();
    while (received.length < 2 && deadline.elapsed.inSeconds < 5) {
      await tester.pump(const Duration(milliseconds: 16));
    }
    expect(received, hasLength(2));
    await tester.pumpAndSettle();
    expect(controller.phase, PatchMapPhase.preparing);
    expect(finished, isFalse);
    final preparing = await capture(boundary, 'replacement-preparing');
    debugPrintSynchronously(
      'REPLACEMENT_PROBE ${jsonEncode({'phase': controller.phase.name, 'oldPixelsRemain': listEquals(preparing, before), 'cleared': listEquals(preparing, empty)})}',
    );

    // Release the real HTTP response before asserting, so failure still cleans up.
    for (final request in received) {
      request.response.headers.contentType = ContentType('image', 'png');
      request.response.add(Uri.parse(source).data!.contentAsBytes());
      await request.response.close();
    }
    expect((await submitted(tester, draw)).outcome, PatchMapOutcome.applied);
    expect((await submitted(tester, update)).outcome, PatchMapOutcome.applied);
    expect(controller.getValue(const PatchMapTarget('old')), isNull);
    await tester.pumpAndSettle();
    final after = await capture(boundary, 'replacement-after');
    await tester.pumpWidget(const SizedBox.shrink());
    expect(preparing, orderedEquals(empty));
    expect(after, isNot(orderedEquals(before)));
    expect(tester.takeException(), isNull);
  });
}
