import 'dart:ui';

/// Immutable geometry of one published object, in world coordinates.
///
/// This is layout geometry, not a pixel mask or animation/display fence. It
/// holds no renderer, scene or resource references. Use the controller's
/// `toLocal` to project individual points into the map widget's logical pixels.
final class PatchMapObjectGeometry {
  const PatchMapObjectGeometry({
    required this.origin,
    required this.bounds,
    required this.paintBounds,
    required this.corners,
  });

  /// The object's local (0, 0), after grid placement and ancestor transforms.
  final Offset origin;

  /// Axis-aligned logical bounds, excluding component overflow and strokes.
  ///
  /// Groups/grids aggregate visible descendants; relations use resolved path
  /// bounds. Empty containers/paths can have no bounds. Hidden leaves retain
  /// their logical bounds, independently of camera culling or alpha layers.
  final Rect? bounds;

  /// Conservative drawing envelope used by culling/fit, including overflow.
  ///
  /// Null for hidden objects or containers without visible drawing bounds.
  /// This is not a tight pixel bound: alpha and camera clipping do not trim it,
  /// and upright content can use a larger camera-independent envelope.
  final Rect? paintBounds;

  /// Transformed corners of an item/rect/text/image's local layout box.
  /// Groups/grids and relation paths have no single local box and return null.
  final PatchMapObjectCorners? corners;

  /// Logical bounds center; for a box this is also its transformed center.
  Offset? get center => bounds?.center;
}

/// Local box corner identities preserved through rotation, shear/reflection.
/// `topLeft` means the transformed local top-left, not screen top-left.
final class PatchMapObjectCorners {
  const PatchMapObjectCorners({
    required this.topLeft,
    required this.topRight,
    required this.bottomRight,
    required this.bottomLeft,
  });

  final Offset topLeft, topRight, bottomRight, bottomLeft;
}
