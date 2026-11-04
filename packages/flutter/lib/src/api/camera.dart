import 'dart:ui';

/// Detached camera values. Coordinates are world/logical pixels; rotation is
/// clockwise radians, matching `PatchMapController.setCamera`.
final class PatchMapCameraState {
  const PatchMapCameraState({
    required this.center,
    required this.scale,
    required this.rotation,
    required this.viewportSize,
  });

  final Offset center;
  final double scale, rotation;
  final Size viewportSize;

  @override
  bool operator ==(Object other) =>
      other is PatchMapCameraState &&
      center == other.center &&
      scale == other.scale &&
      rotation == other.rotation &&
      viewportSize == other.viewportSize;

  @override
  int get hashCode => Object.hash(center, scale, rotation, viewportSize);
}

enum PatchMapCameraChangeSource {
  gesture,
  programmatic,
  fit,
  focus,
  replacement,
  resize,
  configuration,
}

/// Latest applied state, coalesced through the existing frame coordinator.
/// Sources combine the causes in the current pending interval; they are
/// not an ordered action history or a raster/display completion notification.
final class PatchMapCameraChange {
  PatchMapCameraChange({
    required this.state,
    required Iterable<PatchMapCameraChangeSource> sources,
  }) : sources = Set.unmodifiable(sources);

  final PatchMapCameraState state;
  final Set<PatchMapCameraChangeSource> sources;
}
