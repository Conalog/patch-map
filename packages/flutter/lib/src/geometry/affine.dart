import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui';

/// Shared exact 2D transform. Composition preserves nested nonuniform scale,
/// reflection and rotation instead of reconstructing them from a world angle.
final class Affine {
  const Affine(this.a, this.b, this.c, this.d, this.tx, this.ty);

  static const identity = Affine(1, 0, 0, 1, 0, 0);
  final double a, b, c, d, tx, ty;

  factory Affine.fromAttrs(Map<String, Object?>? attrs) {
    if (attrs == null || attrs.isEmpty) return identity;
    double read(String key, double fallback) =>
        (attrs[key] as num?)?.toDouble() ?? fallback;
    final angle = attrs.containsKey('angle')
        ? read('angle', 0) * math.pi / 180
        : read('rotation', 0);
    final cos = math.cos(angle), sin = math.sin(angle);
    final sx = read('scaleX', 1), sy = read('scaleY', 1);
    return Affine(
      cos * sx,
      sin * sx,
      -sin * sy,
      cos * sy,
      read('x', 0),
      read('y', 0),
    );
  }

  Affine multiply(Affine local) => Affine(
    a * local.a + c * local.b,
    b * local.a + d * local.b,
    a * local.c + c * local.d,
    b * local.c + d * local.d,
    a * local.tx + c * local.ty + tx,
    b * local.tx + d * local.ty + ty,
  );

  Affine translated(double x, double y) =>
      Affine(a, b, c, d, a * x + c * y + tx, b * x + d * y + ty);

  Offset project(Offset p) =>
      Offset(a * p.dx + c * p.dy + tx, b * p.dx + d * p.dy + ty);

  Affine? get inverse {
    final determinant = a * d - b * c;
    if (determinant == 0 || !determinant.isFinite) return null;
    final ia = d / determinant, ib = -b / determinant;
    final ic = -c / determinant, id = a / determinant;
    final result = Affine(
      ia,
      ib,
      ic,
      id,
      -(ia * tx + ic * ty),
      -(ib * tx + id * ty),
    );
    return result.isFinite ? result : null;
  }

  bool get isFinite =>
      a.isFinite &&
      b.isFinite &&
      c.isFinite &&
      d.isFinite &&
      tx.isFinite &&
      ty.isFinite;

  /// Prepared once with a retained drawing projection, not per paint.
  Float64List toMatrix4() =>
      Float64List.fromList([a, b, 0, 0, c, d, 0, 0, 0, 0, 1, 0, tx, ty, 0, 1]);

  Quad projectRect(Rect box) => Quad(
    project(box.topLeft),
    project(box.topRight),
    project(box.bottomRight),
    project(box.bottomLeft),
  );
}

/// A retained convex quad used by hit detection, bounds and painting checks.
final class Quad {
  const Quad(this.p0, this.p1, this.p2, this.p3);
  final Offset p0, p1, p2, p3;

  Offset vertex(int index) => switch (index & 3) {
    0 => p0,
    1 => p1,
    2 => p2,
    _ => p3,
  };

  Rect get bounds => Rect.fromLTRB(
    math.min(math.min(p0.dx, p1.dx), math.min(p2.dx, p3.dx)),
    math.min(math.min(p0.dy, p1.dy), math.min(p2.dy, p3.dy)),
    math.max(math.max(p0.dx, p1.dx), math.max(p2.dx, p3.dx)),
    math.max(math.max(p0.dy, p1.dy), math.max(p2.dy, p3.dy)),
  );

  double get _orientation =>
      _crossSign(_difference(p1, p0), _difference(p3, p0));

  bool contains(Offset point) {
    final orientation = _orientation;
    if (orientation == 0) return false;
    final sign = orientation.sign;
    for (var i = 0; i < 4; i++) {
      final p = vertex(i);
      if (_crossSign(_difference(vertex(i + 1), p), _difference(point, p)) *
              sign <
          0) {
        return false;
      }
    }
    return true;
  }

  /// Earliest normalized location of a segment inside the quad, inclusive of
  /// its boundary. Used to keep paint-drag encounter order across raw moves.
  double? segmentEntry(Offset from, Offset to) {
    final orientation = _orientation;
    if (orientation == 0) return null;
    final sign = orientation.sign, delta = to - from;
    var enter = 0.0, leave = 1.0;
    for (var i = 0; i < 4; i++) {
      final p = vertex(i), edge = vertex(i + 1) - p;
      var start = cross(edge, from - p) * sign;
      var rate = cross(edge, delta) * sign;
      if (!start.isFinite ||
          !rate.isFinite ||
          (start == 0 && rate == 0 && (edge.dx != 0 || edge.dy != 0))) {
        // Rare numeric fallback. Scale the edge independently, and both
        // signed distances by the same coordinate factor, preserving t.
        final direction = _difference(vertex(i + 1), p);
        final edgeScale = math.max(direction.dx.abs(), direction.dy.abs());
        if (edgeScale == 0) continue;
        final unit = direction / edgeScale;
        final coordinateScale = math.max(
          1.0,
          math.max(
            math.max(p.dx.abs(), p.dy.abs()),
            math.max(
              math.max(from.dx.abs(), from.dy.abs()),
              math.max(to.dx.abs(), to.dy.abs()),
            ),
          ),
        );
        final scaledFrom = from / coordinateScale;
        start = cross(unit, scaledFrom - p / coordinateScale) * sign;
        rate = cross(unit, to / coordinateScale - scaledFrom) * sign;
      }
      if (!start.isFinite || !rate.isFinite) return null;
      if (rate == 0) {
        if (start < 0) return null;
      } else {
        final t = -start / rate;
        if (rate > 0) {
          enter = math.max(enter, t);
        } else {
          leave = math.min(leave, t);
        }
        if (enter > leave) return null;
      }
    }
    return enter;
  }

  bool intersects(Quad other) {
    if (!boundsOverlap(bounds, other.bounds) ||
        _orientation == 0 ||
        other._orientation == 0) {
      return false;
    }
    if (contains(other.p0) || other.contains(p0)) return true;
    for (var i = 0; i < 4; i++) {
      if (segmentEntry(other.vertex(i), other.vertex(i + 1)) != null) {
        return true;
      }
    }
    return false;
  }
}

double cross(Offset a, Offset b) => a.dx * b.dy - a.dy * b.dx;

Offset _difference(Offset a, Offset b) {
  final delta = a - b;
  return delta.dx.isFinite && delta.dy.isFinite ? delta : a / 2 - b / 2;
}

double _crossSign(Offset a, Offset b) {
  final value = cross(a, b);
  if (value.isFinite && value != 0) return value.sign;
  final as = math.max(a.dx.abs(), a.dy.abs());
  final bs = math.max(b.dx.abs(), b.dy.abs());
  return as == 0 || bs == 0 ? 0 : cross(a / as, b / bs).sign;
}

/// Math.hypot-style length avoids squaring large/small finite coefficients.
double vectorLength(double x, double y) {
  final scale = math.max(x.abs(), y.abs());
  if (scale == 0) return 0;
  return scale *
      math.sqrt((x / scale) * (x / scale) + (y / scale) * (y / scale));
}

/// Rect.overlaps excludes touching/zero-width query bounds; input points and
/// paint paths require inclusive conservative rejection instead.
bool boundsOverlap(Rect a, Rect b) =>
    a.left <= b.right &&
    a.right >= b.left &&
    a.top <= b.bottom &&
    a.bottom >= b.top;
