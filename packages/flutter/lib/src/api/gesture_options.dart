/// User-input permissions. Explicit controller commands remain available.
/// A touch gesture captures these flags at its start; wheel input uses the
/// current flags. Single-pointer pan/range/paint still follows `dragMode`.
/// Touch zoom defaults to a 2% span threshold; rotation defaults to 10 degrees.
/// Each crossing sample becomes that axis's new baseline without a camera jump.
final class PatchMapGestureOptions {
  const PatchMapGestureOptions({
    this.zoomEnabled = true,
    this.rotationEnabled = true,
    this.zoomThreshold = .02,
    this.rotationThresholdDegrees = 10,
  });

  /// Enable pinch and wheel scaling. Two-finger translation remains available.
  final bool zoomEnabled;

  /// Enable two-finger rotation; does not gate `setCamera(rotation: ...)`.
  final bool rotationEnabled;

  /// Relative pinch span change: .02 means 2%. Must be finite in [0, 1).
  /// Zero applies zoom immediately. Wheel scaling does not use this threshold.
  final double zoomThreshold;

  /// Touch rotation threshold in degrees, finite and nonnegative.
  /// Zero applies rotation immediately. Camera commands still use radians.
  final double rotationThresholdDegrees;
}

/// Optional absolute logical-scale bounds, shared by input, commands and fit.
/// Null bounds are unrestricted. Supplied bounds must be finite and positive,
/// with minScale <= maxScale. The widget validates them in all build modes.
final class PatchMapZoomLimits {
  const PatchMapZoomLimits({this.minScale, this.maxScale});
  final double? minScale, maxScale;
}
