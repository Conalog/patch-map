import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:conalog_patch_map/src/host/native_assets.dart'
    show NativeAssetSession;
import 'package:conalog_patch_map/src/semantic/text/layout.dart';
import 'asset_runtime_test.dart' show Backend;
import 'view_test.dart' show surface;

void main() {
  testWidgets(
    'late font registration re-enters readiness without geometry churn',
    (tester) async {
      final backend = Backend()
        ..onLoad = (_) async => NativeAsset(width: 1, height: 1, isFont: true);
      final runtime = PatchMapAssetRuntime(backend);
      final session = NativeAssetSession(
        runtime: runtime,
        fontInitializer: () async {},
      );
      final c = await PatchMapController.create(
        data: [
          {
            'id': 'label',
            'type': 'text',
            'text': 'Late font',
            'style': {'fontFamily': 'LateFont', 'fontSize': 14},
          },
        ],
        fit: false,
        assetPort: session,
        textLayouter: layoutGeometryText,
      );
      await tester.pumpWidget(surface(c));
      await tester.pumpAndSettle();
      final geometry = c.renderSnapshot.geometry;
      c.assets.register([
        {
          'alias': 'late',
          'kind': 'font',
          'descriptor': {
            'src': 'https://example.test/late.ttf',
            'data': {'family': 'LateFont'},
          },
        },
      ]);
      await tester.pumpAndSettle();
      expect(
        backend.requests.any(
          (r) => r.descriptor['src'] == 'https://example.test/late.ttf',
        ),
        isTrue,
      );
      expect(c.renderSnapshot.geometry, same(geometry));
      await tester.pumpWidget(const SizedBox());
      await c.destroy();
      expect(runtime.probe()['resourceCount'], 0);
      expect(tester.takeException(), isNull);
    },
  );
}
