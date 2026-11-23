/// Align or evenly space selected object bounds along a world axis.
enum PatchMapAlignment {
  left,
  right,
  top,
  bottom,
  centerX,
  centerY,
  distributeHorizontally(3),
  distributeVertically(3);

  const PatchMapAlignment([this.minimumSelectionCount = 2]);

  /// Minimum number of independently movable objects for this command.
  final int minimumSelectionCount;
}
