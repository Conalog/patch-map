/// User-input permissions. Explicit controller commands remain available.
/// A touch gesture captures these flags at its start; wheel input uses the
/// current flags. Single-pointer pan/range/paint still follows `dragMode`.
/// Touch zoom starts after a 2% span change; rotation starts after 5 degrees.
/// Each crossing sample becomes that axis's new baseline without a camera jump.
final class PatchMapGestureOptions {
  const PatchMapGestureOptions({
    this.zoomEnabled = true,
    this.rotationEnabled = true,
  });

  /// Enable pinch and wheel scaling. Two-finger translation remains available.
  final bool zoomEnabled;

  /// Enable two-finger rotation; does not gate `setCamera(rotation: ...)`.
  final bool rotationEnabled;
}

/// Optional absolute logical-scale bounds, shared by input, commands and fit.
/// Null bounds are unrestricted. Supplied bounds must be finite and positive,
/// with minScale <= maxScale. The widget validates them in all build modes.
final class PatchMapZoomLimits {
  const PatchMapZoomLimits({this.minScale, this.maxScale});
  final double? minScale, maxScale;
}
