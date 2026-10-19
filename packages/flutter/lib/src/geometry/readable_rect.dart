import 'dart:math' as math;
import 'dart:ui';

import 'affine.dart';

/// `upright` means readable authored orientation, not screen-axis alignment.
/// Preserve rotation/skew, remove reflection and correct the unreadable half
/// plane. This is shared by drawing and interaction geometry.
Affine readableRectTransform(
  Affine authored,
  Rect localBounds,
  double cameraRotation, {
  Offset? placementAnchor,
}) {
  final xs = vectorLength(authored.a, authored.b);
  final ys = vectorLength(authored.c, authored.d);
  final cos = math.cos(cameraRotation), sin = math.sin(cameraRotation);
  final xa = xs == 0 ? 1.0 : authored.a / xs;
  final xb = xs == 0 ? 0.0 : authored.b / xs;
  final yc = ys == 0 ? -xb : authored.c / ys;
  final yd = ys == 0 ? xa : authored.d / ys;
  var a = cos * xa - sin * xb, b = sin * xa + cos * xb;
  var c = cos * yc - sin * yd, d = sin * yc + cos * yd;
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
  final wa = cos * a + sin * b, wb = -sin * a + cos * b;
  final wc = cos * c + sin * d, wd = -sin * c + cos * d;
  var center = authored.project(localBounds.center);
  final originalDeterminant = xa * yd - xb * yc;
  if (placementAnchor != null &&
      xs > 0 &&
      ys > 0 &&
      originalDeterminant.abs() > 2.220446049250313e-16) {
    final offset = center - placementAnchor;
    final ox = (yd * offset.dx - yc * offset.dy) / originalDeterminant;
    final oy = (-xb * offset.dx + xa * offset.dy) / originalDeterminant;
    center = placementAnchor + Offset(wa * ox + wc * oy, wb * ox + wd * oy);
  }
  final width = localBounds.width * xs, height = localBounds.height * ys;
  return Affine(
    wa * xs,
    wb * xs,
    wc * ys,
    wd * ys,
    center.dx - wa * width / 2 - wc * height / 2,
    center.dy - wb * width / 2 - wd * height / 2,
  );
}
