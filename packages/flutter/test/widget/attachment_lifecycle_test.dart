import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

class ObserverBinding extends AutomatedTestWidgetsFlutterBinding {
  final mapObservers = <WidgetsBindingObserver>{};

  @override
  void addObserver(WidgetsBindingObserver observer) {
    if (observer.runtimeType.toString() == '_PatchMapViewState') {
      mapObservers.add(observer);
    }
    super.addObserver(observer);
  }

  @override
  bool removeObserver(WidgetsBindingObserver observer) {
    mapObservers.remove(observer);
    return super.removeObserver(observer);
  }
}

void main() {
  final binding = ObserverBinding();
  testWidgets('rejected duplicate mount does not register an orphan observer', (
    tester,
  ) async {
    final controller = PatchMapController();
    Widget pair(bool duplicate) => MediaQuery(
      data: const MediaQueryData(size: Size(800, 400)),
      child: Directionality(
        textDirection: TextDirection.ltr,
        child: Row(
          children: [
            SizedBox(
              key: const ValueKey('original'),
              width: 400,
              height: 400,
              child: PatchMapView(controller: controller),
            ),
            if (duplicate)
              SizedBox(
                key: const ValueKey('duplicate'),
                width: 400,
                height: 400,
                child: Builder(
                  builder: (_) => PatchMapView(controller: controller),
                ),
              ),
          ],
        ),
      ),
    );
    await tester.pumpWidget(pair(false));
    expect(binding.mapObservers, hasLength(1));
    await tester.pumpWidget(pair(true));
    expect(tester.takeException(), isStateError);
    expect(binding.mapObservers, hasLength(1));
    expect(controller.isAttached, isTrue);
    await tester.pumpWidget(const SizedBox());
    expect(binding.mapObservers, isEmpty);
    expect(controller.isAttached, isFalse);
    await tester.pumpWidget(pair(false));
    expect(controller.isAttached, isTrue);
    await tester.pumpWidget(const SizedBox());
    expect(binding.mapObservers, isEmpty);
    expect(tester.takeException(), isNull);
  });
}
