/// Rotation-command animation policy. Gesture rotation and setCamera remain
/// immediate. Rebuild PatchMapView to change this configuration.
final class PatchMapRotationAnimationOptions {
  const PatchMapRotationAnimationOptions({
    this.enabled = true,
    this.duration = const Duration(milliseconds: 180),
  });

  final bool enabled;

  /// Nonnegative travel time, starting at the first animation frame. Zero
  /// applies immediately. Active travel captures its duration at acceptance.
  final Duration duration;
}
