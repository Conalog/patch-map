import 'dart:math' as math;
import 'primitives.dart';

/// Returns the scene-space transform for readable content. Camera rotation is
/// included when choosing the half-plane, but camera translation/zoom stays in
/// the host Canvas transform. Bar placement rotates about its owning item.
MapAffine readableTransform(
  GeometryPrimitive primitive, {
  double worldRotation = 0,
}) {
  if (primitive.contentOrientation != 'upright') return primitive.transform;
  final t = primitive.transform;
  if (t.a * t.d - t.b * t.c > 0) {
    final theta = worldRotation * math.pi / 180;
    final x = worldRotation % 360 == 0
        ? t.a
        : t.a * math.cos(theta) - t.b * math.sin(theta);
    final y = worldRotation % 360 == 0
        ? t.b
        : t.a * math.sin(theta) + t.b * math.cos(theta);
    final epsilon = 1e-7 * math.sqrt(t.a * t.a + t.b * t.b);
    if (!(x < -epsilon || (x <= epsilon && y >= 0))) return t;
  }
  final world = MapAffine.authored(angle: worldRotation);
  final sx = math.sqrt(t.a * t.a + t.b * t.b),
      sy = math.sqrt(t.c * t.c + t.d * t.d);
  final screen = world.multiply(t);
  final screenX = math.sqrt(screen.a * screen.a + screen.b * screen.b),
      screenY = math.sqrt(screen.c * screen.c + screen.d * screen.d);
  var a = screenX == 0 ? 1.0 : screen.a / screenX,
      b = screenX == 0 ? 0.0 : screen.b / screenX;
  var c = screenY == 0 ? -b : screen.c / screenY,
      d = screenY == 0 ? a : screen.d / screenY;
  final determinant = a * d - b * c;
  if (determinant < 0) {
    c = -c;
    d = -d;
  } else if (determinant.abs() <= 2.220446049250313e-16) {
    c = -b;
    d = a;
  }
  if (a < -1e-7 || (a <= 1e-7 && b >= 0)) {
    a = -a;
    b = -b;
    c = -c;
    d = -d;
  }
  final basis = world.inverse!.multiply(MapAffine(a, b, c, d, 0, 0));
  final r = primitive.localRect;
  var center = t.project(r.x + r.width / 2, r.y + r.height / 2);
  final anchor = primitive.placementAnchor;
  if (anchor != null && sx > 0 && sy > 0) {
    final oa = t.a / sx,
        ob = t.b / sx,
        oc = t.c / sy,
        od = t.d / sy,
        det = oa * od - ob * oc;
    if (det.abs() > 2.220446049250313e-16) {
      final dx = center.x - anchor.x, dy = center.y - anchor.y;
      final localX = (od * dx - oc * dy) / det,
          localY = (-ob * dx + oa * dy) / det;
      center = MapPoint(
        anchor.x + basis.a * localX + basis.c * localY,
        anchor.y + basis.b * localX + basis.d * localY,
      );
    }
  }
  final ra = basis.a * sx,
      rb = basis.b * sx,
      rc = basis.c * sy,
      rd = basis.d * sy;
  return MapAffine(
    ra,
    rb,
    rc,
    rd,
    center.x - ra * (r.x + r.width / 2) - rc * (r.y + r.height / 2),
    center.y - rb * (r.x + r.width / 2) - rd * (r.y + r.height / 2),
  );
}
