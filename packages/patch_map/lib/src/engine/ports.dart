import '../api/values.dart';
import '../model/dataset.dart';
import '../semantic/geometry/geometry.dart';

class PatchMapRevisionTuple {
  const PatchMapRevisionTuple(this.scene, this.view, this.interaction);
  final int scene;
  final int view;
  final int interaction;
  Map<String, int> toJson() => {
    'scene': scene,
    'view': view,
    'interaction': interaction,
  };
  @override
  bool operator ==(Object other) =>
      other is PatchMapRevisionTuple &&
      scene == other.scene &&
      view == other.view &&
      interaction == other.interaction;
  @override
  int get hashCode => Object.hash(scene, view, interaction);
}

class PatchMapRenderViewport {
  const PatchMapRenderViewport({
    required this.centerX,
    required this.centerY,
    required this.scale,
    required this.width,
    required this.height,
    required this.pixelRatio,
    required this.rotation,
  });
  final double centerX, centerY, scale, width, height, pixelRatio, rotation;
}

/// Read-only candidate. Surface preparation must not publish or notify clients.
class PatchMapRenderSnapshot {
  const PatchMapRenderSnapshot({
    required this.dataset,
    required this.overlays,
    required this.selectedIds,
    required this.viewport,
    required this.revisions,
    required this.presentationAlpha,
    required this.geometry,
    required this.projectionRevision,
    required this.theme,
    required this.selectionPolicy,
  });
  final PatchMapDataset dataset;
  final JsonMap theme;
  final JsonMap selectionPolicy;
  final PatchMapGeometry geometry;
  final int projectionRevision;
  final Map<String, JsonMap> overlays;
  final List<String> selectedIds;
  final PatchMapRenderViewport viewport;
  final PatchMapRevisionTuple revisions;
  final Map<String, double> presentationAlpha;
}

abstract interface class PatchMapSurfacePort {
  bool prepare(PatchMapRenderSnapshot snapshot);
  void requestFrame();
  Future<PatchMapCaptureResult> capture(PatchMapRenderSnapshot snapshot);
  Future<void> dispose();
}

/// Injected monotonic clock for deterministic animation and frame settlement.
abstract interface class PatchMapClock {
  double get milliseconds;
}

abstract interface class PatchMapAssetPort {
  Map<String, MapRect> get imageSizes;
  PatchMapResult register(List<JsonMap> registrations);
  JsonMap status([String? alias]);
  Future<void> ready(PatchMapRenderSnapshot snapshot);
  Future<void> dispose();
}

/// Optional host observations. Counts must describe actual owned resources.
abstract interface class PatchMapSurfaceProbePort {
  JsonMap get debugResources;
}
