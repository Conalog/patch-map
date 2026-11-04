import 'dart:ui';

/// Which bounds decorate the selection; does not change selected IDs or hits.
enum PatchMapSelectionDisplayMode { all, groupOnly, elementOnly, hidden }

/// Placement relative to the existing selection envelope, not the item fill.
enum PatchMapSelectionStrokeAlignment { outside, center, inside }

/// Fixed logical-pixel width, or a width that shrinks only when zooming out.
enum PatchMapSelectionStrokeScale { fixed, viewport }

/// Immutable selection decoration. Rebuild PatchMapView with a new value to
/// change an existing selection without replacing the diagram or camera.
/// This configures paint only; object editing handles are not provided.
final class PatchMapSelectionStyle {
  const PatchMapSelectionStyle({
    this.color = const Color(0xff2f80ed),
    this.strokeWidth = 2,
    this.displayMode = PatchMapSelectionDisplayMode.all,
    this.strokeAlignment = PatchMapSelectionStrokeAlignment.center,
    this.strokeScale = PatchMapSelectionStrokeScale.fixed,
    this.minStrokeWidth = 1,
  });

  final Color color;

  /// Positive finite logical-pixel width at camera scale 1. Use hidden mode to
  /// suppress decoration while retaining selection.
  final double strokeWidth;
  final PatchMapSelectionDisplayMode displayMode;
  final PatchMapSelectionStrokeAlignment strokeAlignment;
  final PatchMapSelectionStrokeScale strokeScale;

  /// Positive finite floor for viewport scaling, at most [strokeWidth].
  /// Width is clamped between this and strokeWidth, even above camera scale 1.
  final double minStrokeWidth;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is PatchMapSelectionStyle &&
          color == other.color &&
          strokeWidth == other.strokeWidth &&
          displayMode == other.displayMode &&
          strokeAlignment == other.strokeAlignment &&
          strokeScale == other.strokeScale &&
          minStrokeWidth == other.minStrokeWidth;

  @override
  int get hashCode => Object.hash(
    color,
    strokeWidth,
    displayMode,
    strokeAlignment,
    strokeScale,
    minStrokeWidth,
  );
}
