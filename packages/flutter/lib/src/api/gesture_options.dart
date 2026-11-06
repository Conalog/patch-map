/// User-input permissions. Explicit controller commands remain available.
/// Pinch and rotation capture their settings at the start. Wheel uses the
/// current zoom permission, and disabling either zoom flag ends one-finger
/// zoom. Single-pointer pan/range/paint follows `dragMode`.
/// Touch zoom defaults to 2%, or 5% after rotation starts; rotation defaults to
/// 15 degrees, or 25 degrees after zoom starts. Active axes stay active.
/// Each crossing sample becomes that axis's new baseline without a camera jump.
final class PatchMapGestureOptions {
  const PatchMapGestureOptions({
    this.zoomEnabled = true,
    this.doubleTapDragZoomEnabled = false,
    this.rotationEnabled = true,
    this.zoomThreshold = .02,
    this.zoomThresholdAfterRotation = .05,
    this.rotationThresholdDegrees = 15,
    this.rotationThresholdAfterZoomDegrees = 25,
    this.longPressDuration = const Duration(milliseconds: 300),
  });

  /// Enable pinch, wheel and opted-in double-tap drag scaling.
  /// Two-finger translation remains available.
  final bool zoomEnabled;

  /// Allow a nearby second touch to drag vertically and zoom at the viewport
  /// center in pan mode. An eligible second touch skips long-press recognition.
  final bool doubleTapDragZoomEnabled;

  /// Enable two-finger rotation; does not gate `setCamera(rotation: ...)`.
  final bool rotationEnabled;

  /// Relative pinch span change: .02 means 2%. Must be finite in [0, 1).
  /// Zero applies zoom immediately. Wheel scaling does not use this threshold.
  final double zoomThreshold;

  /// Pending zoom's threshold after rotation starts, finite in [0, 1).
  /// Uses the larger of this and [zoomThreshold], from the gesture's start span.
  /// Does not re-gate active zoom; a zero base threshold remains immediate.
  final double zoomThresholdAfterRotation;

  /// Touch rotation threshold in degrees, finite and nonnegative.
  /// Zero applies rotation immediately. Camera commands still use radians.
  final double rotationThresholdDegrees;

  /// Pending rotation's threshold after zoom starts, finite and nonnegative.
  /// Uses the larger of this and [rotationThresholdDegrees], from gesture start.
  /// Does not re-gate active rotation; a zero base threshold remains immediate.
  final double rotationThresholdAfterZoomDegrees;

  /// Hold time before `longPress`, captured when the pointer goes down.
  /// Must be nonnegative. Zero recognizes on the next timer turn; rebuilding
  /// with a new duration only affects the next press.
  final Duration longPressDuration;
}

/// Optional absolute logical-scale bounds, shared by input, commands and fit.
/// Null bounds are unrestricted. Supplied bounds must be finite and positive,
/// with minScale <= maxScale. The widget validates them in all build modes.
final class PatchMapZoomLimits {
  const PatchMapZoomLimits({this.minScale, this.maxScale});
  final double? minScale, maxScale;
}
