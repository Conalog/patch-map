import 'dart:math' as math;
import 'dart:ui';
import '../semantic/geometry/geometry.dart';

/// Per-stroke screen-space broad phase. Camera/scene changes end the stroke.
/// Construction is lazy; movement visits only intersected buckets.
class BrushHitIndex {
  BrushHitIndex(
    PatchMapGeometry geometry,
    List<double> Function(double, double) screen,
  ) {
    for (final target in geometry.targets.values) {
      if (!target.visible ||
          target.locked ||
          target.componentId != null ||
          target.quad.isEmpty)
        continue;
      var left = double.infinity, top = double.infinity;
      var right = double.negativeInfinity, bottom = double.negativeInfinity;
      for (final p in target.quad) {
        final at = screen(p.x, p.y);
        left = math.min(left, at[0]);
        right = math.max(right, at[0]);
        top = math.min(top, at[1]);
        bottom = math.max(bottom, at[1]);
      }
      final rect = Rect.fromLTRB(left, top, right, bottom);
      final index = _targets.length;
      _targets.add((target, rect));
      final x0 = (left / 128).floor(), x1 = (right / 128).floor();
      final y0 = (top / 128).floor(), y1 = (bottom / 128).floor();
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 256) {
        _overflow.add(index);
        continue;
      }
      for (var x = x0; x <= x1; x++) {
        for (var y = y0; y <= y1; y++) {
          _buckets.putIfAbsent((x, y), () => []).add(index);
        }
      }
    }
  }
  final _targets = <(GeometryTarget, Rect)>[];
  final _buckets = <(int, int), List<int>>{};
  final _overflow = <int>[];
  Iterable<GeometryTarget> query(Offset a, Offset b) sync* {
    final rect = Rect.fromPoints(a, b);
    final x0 = (rect.left / 128).floor(), x1 = (rect.right / 128).floor();
    final y0 = (rect.top / 128).floor(), y1 = (rect.bottom / 128).floor();
    final candidates = <int>{..._overflow};
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4096) {
      candidates.addAll(Iterable.generate(_targets.length));
    } else {
      for (var x = x0; x <= x1; x++) {
        for (var y = y0; y <= y1; y++) {
          candidates.addAll(_buckets[(x, y)] ?? const []);
        }
      }
    }
    for (final i in candidates.toList()..sort()) {
      final (target, bounds) = _targets[i];
      if (_intersects(a, b, bounds)) yield target;
    }
  }
}

bool _intersects(Offset a, Offset b, Rect r) {
  var enter = 0.0, exit = 1.0;
  bool clip(double origin, double delta, double min, double max) {
    if (delta == 0) return origin >= min && origin <= max;
    final t0 = (min - origin) / delta, t1 = (max - origin) / delta;
    enter = math.max(enter, math.min(t0, t1));
    exit = math.min(exit, math.max(t0, t1));
    return enter <= exit;
  }

  return clip(a.dx, b.dx - a.dx, r.left, r.right) &&
      clip(a.dy, b.dy - a.dy, r.top, r.bottom);
}
