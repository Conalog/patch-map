import 'dart:math' as math;
import 'dart:ui';

import 'affine.dart';

const readableFlipX = 1;
const readableFlipY = 2;
const _determinantEpsilon = 2.220446049250313e-16;

bool hasPositiveAxisAlignedBasis(Affine world) =>
    world.b == 0 && world.c == 0 && world.a > 0 && world.d > 0;

/// The sign of the determinant after normalizing the two authored axes.
int readableHandedness(Affine authored) {
  final x = vectorLength(authored.a, authored.b);
  final y = vectorLength(authored.c, authored.d);
  if (x == 0 || y == 0) return 0;
  final determinant =
      (authored.a / x) * (authored.d / y) - (authored.b / x) * (authored.c / y);
  if (determinant.abs() <= _determinantEpsilon) return 0;
  return determinant < 0 ? -1 : 1;
}

/// Readable orientation is a sign change of the authored axes about the box's
/// center. It preserves the authored footprint, including shear and collapse.
Affine readableRectTransform(
  Affine authored,
  Rect localBounds,
  double cameraRotation,
) => ReadableRectBasis(authored, cameraRotation).place(authored, localBounds);

/// Cached orientation coefficients, reusable while bounds/translation animate.
final class ReadableRectBasis {
  ReadableRectBasis(this._authored, this._rotation)
    : axes = resolveAxes(_authored, _rotation);

  final Affine _authored;
  final double _rotation;
  final int axes;

  static int resolveAxes(Affine authored, double rotation) {
    final handedness = readableHandedness(authored);
    if (handedness == 0) return 0;
    final length = vectorLength(authored.a, authored.b);
    final x = authored.a / length, y = authored.b / length;
    final cos = math.cos(rotation), sin = math.sin(rotation);
    final a = cos * x - sin * y, b = sin * x + cos * y;
    final halfTurn = a < -1e-7 || (a <= 1e-7 && b >= 0);
    final mirror = handedness < 0 ? readableFlipY : 0;
    return halfTurn ? mirror ^ (readableFlipX | readableFlipY) : mirror;
  }

  bool matches(Affine authored, double rotation) =>
      rotation == _rotation &&
      authored.a == _authored.a &&
      authored.b == _authored.b &&
      authored.c == _authored.c &&
      authored.d == _authored.d;

  Affine place(Affine authored, Rect localBounds) =>
      placeReadableRect(authored, localBounds, axes);
}

Affine placeReadableRect(Affine authored, Rect localBounds, int axes) {
  if (axes == 0 && localBounds.topLeft == Offset.zero) return authored;
  final flipX = (axes & readableFlipX) != 0;
  final flipY = (axes & readableFlipY) != 0;
  final origin = authored.project(
    Offset(
      flipX ? localBounds.right : localBounds.left,
      flipY ? localBounds.bottom : localBounds.top,
    ),
  );
  return Affine(
    flipX ? -authored.a : authored.a,
    flipX ? -authored.b : authored.b,
    flipY ? -authored.c : authored.c,
    flipY ? -authored.d : authored.d,
    origin.dx,
    origin.dy,
  );
}
