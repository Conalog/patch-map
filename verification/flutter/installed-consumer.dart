import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patch_map/patch_map.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('installed public assets decode shipped SVG and font bytes', () async {
    final runtime = PatchMapAssetRuntime();
    final session = runtime.createSession(instanceId: 'installed-assets');
    session.registerAssets();
    final icon = await session.acquire('object');
    expect(icon.resource, isA<NativeAsset>());
    expect((icon.resource as NativeAsset).picture, isNotNull);
    expect((icon.resource as NativeAsset).width, greaterThan(0));
    final font = await session.acquire('FiraCode-400');
    expect((font.resource as NativeAsset).isFont, true);
    final bytes = await rootBundle.load(
      'packages/patch_map/assets/fonts/FiraCode-VF.ttf',
    );
    expect(bytes.getUint32(0), 0x00010000);
    expect(bytes.lengthInBytes, greaterThan(100000));
    await icon.release();
    await font.release();
    await session.destroy();
    expect(runtime.probe()['resourceCount'], 0);
    // Register the actual bundled platform font outside the widget fake clock.
    final prepared = await PatchMap.create(data: const [], fit: false);
    await prepared.destroy();
  });
  test(
    'installed public create queries refuses unattached mutation and destroys',
    () async {
      final controller = await PatchMap.create(
        data: [
          {
            'type': 'rect',
            'id': 'rect',
            'size': {'width': 30, 'height': 40},
            'fill': '#123456',
          },
        ],
        fit: false,
        width: 100,
        height: 100,
      );
      try {
        expect(
          controller.update({
            'id': 'rect',
            'changes': {'fill': '#ff0000'},
          }).status,
          'refused',
        );
        expect(
          controller.targets.get({'id': 'rect'})!.value['fill'],
          '#123456',
        );
        expect(controller.history.undo().status, 'unavailable');
        expect(
          controller.targets.get({'id': 'rect'})!.value['fill'],
          '#123456',
        );
      } finally {
        await controller.destroy();
      }
      expect(controller.destroyed, true);
    },
  );
}
