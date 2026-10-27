import 'dart:math' as math;
import 'dart:ui';

import '../api/selection_style.dart';
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
  PatchMapSelectionStyle _style = const PatchMapSelectionStyle();
  bool get isDisposed => _disposed;
  int get outlineCount => _outlineCount;
  int get resolvedTargetCount => _resolvedTargetCount;
  Object get pathIdentity => _path;
  Object get paintIdentity => _paint;

  static void validateStyle(PatchMapSelectionStyle style) {
    if (!style.strokeWidth.isFinite ||
        style.strokeWidth <= 0 ||
        !style.minStrokeWidth.isFinite ||
        style.minStrokeWidth <= 0 ||
        style.minStrokeWidth > style.strokeWidth) {
      throw ArgumentError(
        'Selection widths must be finite, positive, and '
        'minStrokeWidth <= strokeWidth',
      );
    }
    final color = style.color;
    if (!color.r.isFinite ||
        !color.g.isFinite ||
        !color.b.isFinite ||
        !color.a.isFinite ||
        color.a < 0 ||
        color.a > 1) {
      throw ArgumentError(
        'Selection color must have finite channels and 0–1 alpha',
      );
    }
  }

  /// Configure only this paint owner. The widget uses the existing frame owner
  /// to invalidate once; no selection/session state or resource work is changed.
  bool configure(PatchMapSelectionStyle style) {
    if (_disposed) throw StateError('Selection overlay is disposed');
    if (_style == style) return false;
    validateStyle(style);
    _style = style;
    _paint
      ..color = style.color
      ..style = style.strokeAlignment == PatchMapSelectionStrokeAlignment.center
          ? PaintingStyle.stroke
          : PaintingStyle.fill;
    return true;
  }

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
    final style = _style, mode = style.displayMode;
    if (mode == PatchMapSelectionDisplayMode.hidden || style.color.a == 0) {
      return 0;
    }
    final scale = math.max(cameraScale, .001);
    final width = style.strokeScale == PatchMapSelectionStrokeScale.fixed
        ? style.strokeWidth
        : (style.strokeWidth * scale).clamp(
            style.minStrokeWidth,
            style.strokeWidth,
          );
    final worldWidth = width / scale;
    // Transient duplicate suppression only; no retained copy of selection state.
    final seen = <String>{};
    Rect? aggregate;
    Quad? first;
    var count = 0;
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
        if (mode != PatchMapSelectionDisplayMode.groupOnly) {
          _appendOutline(quad, worldWidth);
        }
        if (mode != PatchMapSelectionDisplayMode.elementOnly) {
          first ??= quad;
          aggregate = aggregate?.expandToInclude(quad.bounds) ?? quad.bounds;
        }
        count++;
      }
      if (mode != PatchMapSelectionDisplayMode.elementOnly && count > 0) {
        if (count > 1) {
          if (style.strokeAlignment ==
              PatchMapSelectionStrokeAlignment.center) {
            _path.addRect(aggregate!);
            _outlineCount++;
          } else {
            _appendOutline(Affine.identity.projectRect(aggregate!), worldWidth);
          }
        } else if (mode == PatchMapSelectionDisplayMode.groupOnly) {
          _appendOutline(first!, worldWidth);
        }
      }
      if (_outlineCount > 0) {
        _paint.strokeWidth = worldWidth;
        canvas.drawPath(_path, _paint);
      }
      return _outlineCount;
    } finally {
      // A recording owns its Path value. Drop all old coordinates after draw,
      // including deselection/throw paths, while reusing the Path/Paint handles.
      _path.reset();
    }
  }

  void _appendOutline(Quad quad, double width) {
    _outlineCount++;
    final alignment = _style.strokeAlignment;
    if (alignment == PatchMapSelectionStrokeAlignment.center) {
      _append(quad);
      return;
    }
    final outside = alignment == PatchMapSelectionStrokeAlignment.outside;
    final outer = outside ? offsetSelectionQuad(quad, width) : quad;
    if (outer == null) return;
    final inner = outside ? quad : offsetSelectionQuad(quad, -width);
    // One winding-filled path unions border bands, including overlapping
    // selected objects, without per-object clips/layers or alpha overdraw.
    _appendContour(outer, hole: false);
    if (inner != null) _appendContour(inner, hole: true);
  }

  void _appendContour(Quad quad, {required bool hole}) {
    final u = quad.p1 - quad.p0, v = quad.p3 - quad.p0;
    final positive =
        cross(u / vectorLength(u.dx, u.dy), v / vectorLength(v.dx, v.dy)) > 0;
    final step = positive != hole ? 1 : -1;
    _path.moveTo(quad.p0.dx, quad.p0.dy);
    for (var i = 1; i < 4; i++) {
      final point = quad.vertex(i * step);
      _path.lineTo(point.dx, point.dy);
    }
    _path.close();
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
