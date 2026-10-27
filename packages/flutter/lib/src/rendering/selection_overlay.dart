import 'dart:math' as math;
import 'dart:ui';

import '../api/selection_style.dart';
import '../dataset/colors.dart';
import '../geometry/affine.dart';
import '../geometry/geometry_snapshot.dart';
import '../geometry/selection_geometry.dart';

/// Paint-only selection decoration. Selection IDs, geometry, invalidation and
/// the world camera remain owned by their existing coordinators. This owner
/// retains only derived geometry for the last painted selection. Publication
/// invalidates changed targets; this owner never changes selection or schedules work.
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
  final _envelopes = <String, _SelectionEnvelope>{};
  GeometrySnapshot? _geometry;
  double? _rotation;
  int _visit = 0, _drawableCount = 0;
  bool _aggregateDirty = true;
  Rect? _aggregate;
  Quad? _first;
  PatchMapSelectionStyle _style = const PatchMapSelectionStyle();
  bool get isDisposed => _disposed;
  int get outlineCount => _outlineCount;
  int get resolvedTargetCount => _resolvedTargetCount;
  Object get pathIdentity => _path;
  Object get paintIdentity => _paint;

  /// Retained commits can mutate nodes/layouts without changing their identity.
  /// The existing publication boundary supplies exactly those changed slots.
  /// No selection means no added traversal on the ordinary update path.
  void didPublish(GeometrySnapshot geometry, Iterable<int> changed) {
    if (_envelopes.isEmpty) return;
    if (!identical(_geometry?.topology, geometry.topology)) {
      _clearGeometry();
      return;
    }
    for (final slot in changed) {
      final entry = _envelopes[geometry.nodes[slot].id];
      if (entry != null) {
        entry.ready = false;
        _aggregateDirty = true;
      }
    }
    _geometry = geometry;
  }

  void _clearGeometry() {
    _envelopes.clear();
    _geometry = null;
    _rotation = null;
    _aggregate = null;
    _first = null;
    _drawableCount = 0;
    _aggregateDirty = true;
  }

  /// Hiding/replacing a document may never paint again. Release derived state
  /// at that boundary rather than waiting for a future empty selection frame.
  void reset() {
    _clearGeometry();
    _path.reset();
    _outlineCount = 0;
    _resolvedTargetCount = 0;
  }

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
    if (style.displayMode == PatchMapSelectionDisplayMode.hidden ||
        style.color.a == 0) {
      _clearGeometry();
    }
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
    Rect? visibleWorldBounds,
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
    if (!identical(_geometry, geometry) || _rotation != cameraRotation) {
      _clearGeometry();
      _geometry = geometry;
      _rotation = cameraRotation;
    }
    final visit = ++_visit;
    // Centered strokes may reach the miter limit; include antialias coverage.
    // Outside bands under strong shear can extend arbitrarily far, so retain
    // their existing drawing path rather than imposing an unsafe culling bound.
    final cull =
        _style.strokeAlignment == PatchMapSelectionStrokeAlignment.outside
        ? null
        : visibleWorldBounds?.inflate(
            (_style.strokeAlignment == PatchMapSelectionStrokeAlignment.center
                    ? worldWidth * _paint.strokeMiterLimit
                    : 0) +
                1 / scale,
          );
    try {
      for (final id in selectedIds) {
        final entry = _envelopes.putIfAbsent(id, _SelectionEnvelope.new);
        if (entry.visit == visit) continue;
        entry.visit = visit;
        _resolvedTargetCount++;
        if (!entry.ready) {
          final target = geometry[id];
          entry.quad = target == null
              ? null
              : selectionQuad(
                  target,
                  palette: palette,
                  cameraRotation: cameraRotation,
                );
          entry.bounds = entry.quad?.bounds;
          entry.ready = true;
          _aggregateDirty = true;
        }
        final quad = entry.quad;
        if (quad == null) continue;
        if (mode != PatchMapSelectionDisplayMode.groupOnly &&
            (cull == null || boundsOverlap(entry.bounds!, cull))) {
          _appendOutline(quad, worldWidth);
        }
      }
      if (_envelopes.length != _resolvedTargetCount) {
        _envelopes.removeWhere((_, entry) => entry.visit != visit);
        _aggregateDirty = true;
      }
      if (_envelopes.isEmpty) _clearGeometry();
      if (mode != PatchMapSelectionDisplayMode.elementOnly && _aggregateDirty) {
        _aggregate = null;
        _first = null;
        _drawableCount = 0;
        for (final entry in _envelopes.values) {
          if (entry.quad == null) continue;
          _first ??= entry.quad;
          _aggregate =
              _aggregate?.expandToInclude(entry.bounds!) ?? entry.bounds;
          _drawableCount++;
        }
        _aggregateDirty = false;
      }
      if (mode != PatchMapSelectionDisplayMode.elementOnly &&
          _drawableCount > 0) {
        if (_drawableCount > 1) {
          if (style.strokeAlignment ==
              PatchMapSelectionStrokeAlignment.center) {
            _path.addRect(_aggregate!);
            _outlineCount++;
          } else {
            _appendOutline(
              Affine.identity.projectRect(_aggregate!),
              worldWidth,
            );
          }
        } else if (mode == PatchMapSelectionDisplayMode.groupOnly) {
          _appendOutline(_first!, worldWidth);
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
    reset();
  }
}

final class _SelectionEnvelope {
  bool ready = false;
  int visit = 0;
  Quad? quad;
  Rect? bounds;
}
