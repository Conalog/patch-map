import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'patch_map_view_test.dart' as support;

Widget pair(PatchMapController first, PatchMapController second) => MediaQuery(
  data: const MediaQueryData(size: Size(800, 400)),
  child: Directionality(
    textDirection: TextDirection.ltr,
    child: Row(
      children: [
        SizedBox(
          width: 400,
          height: 400,
          child: PatchMapView(key: const ValueKey('first'), controller: first),
        ),
        SizedBox(
          width: 400,
          height: 400,
          child: PatchMapView(
            key: const ValueKey('second'),
            controller: second,
          ),
        ),
      ],
    ),
  ),
);
void main() {
  testWidgets(
    'replacement invalidates the still-held multi-pointer scale gesture',
    (tester) async {
      final controller = PatchMapController();
      await tester.pumpWidget(support.host(controller));
      final first = controller.draw(support.rectangle('old'));
      await support.progress(tester);
      await first;
      controller.setCamera(center: Offset.zero, scale: 1, rotation: 0);
      final center = tester.getCenter(find.byType(PatchMapView));
      final a = await tester.startGesture(
        center - const Offset(40, 0),
        pointer: 1,
      );
      final b = await tester.startGesture(
        center + const Offset(40, 0),
        pointer: 2,
      );
      await a.moveTo(center - const Offset(70, 0));
      await b.moveTo(center + const Offset(70, 0));
      await tester.pump();
      final replacement = controller.draw(support.rectangle('new'));
      await support.progress(tester);
      await replacement;
      final before = controller.toWorld(Offset.zero);
      await a.moveTo(center - const Offset(100, 0));
      await b.moveTo(center + const Offset(100, 0));
      final after = controller.toWorld(Offset.zero);
      await a.up();
      await b.up();
      await tester.pumpWidget(const SizedBox());
      expect(
        after,
        before,
        reason: 'old multi-touch gesture ended on replacement',
      );
    },
  );

  testWidgets(
    'rejected controller swap does not leave original controller bound after removal',
    (tester) async {
      final first = PatchMapController(), second = PatchMapController();
      await tester.pumpWidget(pair(first, second));
      expect(first.isAttached, true);
      expect(second.isAttached, true);
      final element =
          tester.element(find.byKey(const ValueKey('first')))
              as StatefulElement;
      expect(
        () => element.update(
          PatchMapView(key: const ValueKey('first'), controller: second),
        ),
        throwsStateError,
      );
      await tester.pumpWidget(const SizedBox());
      expect(first.isAttached, false);
      expect(second.isAttached, false);
      await tester.pumpWidget(support.host(first));
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
