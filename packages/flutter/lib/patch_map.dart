library;

import 'src/engine/controller.dart';
import 'src/host/native_assets.dart';
import 'src/model/dataset.dart';
import 'src/semantic/text/layout.dart';

export 'src/api/values.dart';
export 'src/engine/controller.dart';
export 'src/host/patch_map_view.dart';
export 'src/host/native_assets.dart'
    show
        PatchMapAssetRuntime,
        PatchMapAssetSession,
        PatchMapAssetAcquisition,
        PatchMapAssetUse,
        PatchMapAssetBackend,
        PatchMapAssetBackendRequest,
        PatchMapAssetResourceDescription,
        PatchMapAssetError,
        PatchMapNormalizedAssetRegistration,
        NativeAsset,
        createPatchMapNativeAssetBackend,
        patchMapBuiltinAssets,
        patchMapAssetRuntime,
        patchMapDefaultAssetPolicy,
        normalizePatchMapAssetPolicy,
        normalizePatchMapAssetDescriptor,
        evaluatePatchMapAssetResponsePolicy,
        assertPatchMapAssetResponseAllowed;

/// Constructs an independent native PatchMap controller.
abstract final class PatchMap {
  static Future<PatchMapController> create({
    Object? data,
    double width = 360,
    double height = 640,
    double pixelRatio = 1,
    Object fit = true,
    int historyLimit = 50,
    String? instanceId,
    JsonMap? theme,
    List<JsonMap> assets = const [],
    PatchMapAssetRuntime? assetRuntime,
    JsonMap? assetPolicy,
    JsonMap pointer = const {},
    JsonMap selection = const {},
    JsonMap viewport = const {},
    List<num> zoomLimits = const [0.01, 100],
  }) async {
    final session = NativeAssetSession(
      runtime: assetRuntime,
      policy: assetPolicy,
      instanceId: instanceId,
    );
    try {
      if (assets.isNotEmpty) session.register(assets);
      await session.initialize();
      return await PatchMapController.create(
        data: data,
        width: width,
        height: height,
        pixelRatio: pixelRatio,
        fit: fit,
        historyLimit: historyLimit,
        instanceId: instanceId,
        theme: theme,
        assetPort: session,
        textLayouter: layoutGeometryText,
        pointerPolicy: pointer,
        selectionPolicy: selection,
        viewportPolicy: viewport,
        zoomLimits: zoomLimits,
      );
    } catch (_) {
      await session.dispose();
      rethrow;
    }
  }
}
