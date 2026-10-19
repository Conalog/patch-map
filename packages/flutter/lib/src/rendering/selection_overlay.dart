import 'dart:math' as math;
import 'dart:ui';

import '../dataset/colors.dart';
import '../geometry/affine.dart';
import '../geometry/geometry_snapshot.dart';
import '../geometry/selection_geometry.dart';

/// Paint-only selection decoration. Selection IDs, geometry, invalidation and
/// the world camera remain owned by their existing coordinators. This owner
/// retains no selection/snapshot/Canvas, creates no listener and schedules no work.
final class SelectionOverlay {
  SelectionOverlay({required this.palette});
  final ColorResolver palette;
  final _path = Path();
  final _paint = Paint()
    ..color = const Color(0xff2f80ed)
    ..style = PaintingStyle.stroke
    ..strokeJoin = StrokeJoin.miter
    ..strokeMiterLimit = 10
    ..isAntiAlias = true;
  bool _disposed = false;
  int _outlineCount = 0, _resolvedTargetCount = 0;
  bool get isDisposed => _disposed;
  int get outlineCount => _outlineCount;
  int get resolvedTargetCount => _resolvedTargetCount;
  Object get pathIdentity => _path;
  Object get paintIdentity => _paint;

  /// The Canvas already carries the world camera. Release defaults: centered
  /// #2f80ed stroke, fixed 2 logical/CSS pixels, individual oriented outlines
  /// plus a world-axis aggregate rectangle when at least two quads exist.
  /// Device pixel ratio is applied by Flutter's Canvas, not to [cameraScale].
  int paint(
    Canvas canvas,
    GeometrySnapshot geometry,
    Iterable<String> selectedIds, {
    required double cameraScale,
    required double cameraRotation,
  }) {
    if (_disposed) throw StateError('Selection overlay is disposed');
    if (!cameraScale.isFinite || cameraScale < 0 || !cameraRotation.isFinite) {
      throw ArgumentError(
        'Selection camera requires finite nonnegative scale and finite rotation',
      );
    }
    _path.reset();
    _outlineCount = 0;
    _resolvedTargetCount = 0;
    // Transient duplicate suppression only; no retained copy of selection state.
    final seen = <String>{};
    Rect? aggregate;
    try {
      for (final id in selectedIds) {
        if (!seen.add(id)) continue;
        _resolvedTargetCount++;
        final target = geometry[id];
        if (target == null) continue;
        final quad = selectionQuad(
          target,
          palette: palette,
          cameraRotation: cameraRotation,
        );
        if (quad == null) continue;
        _append(quad);
        aggregate = aggregate?.expandToInclude(quad.bounds) ?? quad.bounds;
        _outlineCount++;
      }
      if (_outlineCount > 1) {
        _path.addRect(aggregate!);
        _outlineCount++;
      }
      if (_outlineCount > 0) {
        _paint.strokeWidth = 2 / math.max(cameraScale, .001);
        canvas.drawPath(_path, _paint);
      }
      return _outlineCount;
    } finally {
      // A recording owns its Path value. Drop all old coordinates after draw,
      // including deselection/throw paths, while reusing the Path/Paint handles.
      _path.reset();
    }
  }

  void _append(Quad quad) {
    _path.moveTo(quad.p0.dx, quad.p0.dy);
    _path.lineTo(quad.p1.dx, quad.p1.dy);
    _path.lineTo(quad.p2.dx, quad.p2.dy);
    _path.lineTo(quad.p3.dx, quad.p3.dy);
    _path.close();
  }

  void dispose() {
    if (_disposed) return;
    _disposed = true;
    _path.reset();
    _outlineCount = 0;
    _resolvedTargetCount = 0;
  }
}
