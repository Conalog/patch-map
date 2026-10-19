import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui';

import 'package:flutter/painting.dart' show EdgeInsets;

import '../geometry/affine.dart';

/// Camera authority in logical pixels. Resize does not reset world center,
/// scale or rotation. It does not own a copy of scene or selection state.
final class MapCamera {
  Size _size = Size.zero;
  Offset _center = Offset.zero;
  double _scale = 1, _rotation = 0;
  Affine _worldToLocal = Affine.identity;
  Affine _localToWorld = Affine.identity;
  Float64List _matrix = Affine.identity.toMatrix4();

  Size get size => _size;
  Offset get center => _center;
  double get scale => _scale;
  double get rotation => _rotation;
  Float64List get paintMatrix => _matrix;
  bool get hasSize => _size.width > 0 && _size.height > 0;

  Offset worldToLocal(Offset value) => _worldToLocal.project(value);
  Offset localToWorld(Offset value) => _localToWorld.project(value);
  Quad get visibleWorldQuad => _localToWorld.projectRect(Offset.zero & _size);
  Rect get visibleWorldBounds => visibleWorldQuad.bounds;

  bool resize(Size value) {
    if (!value.isFinite || value.width < 0 || value.height < 0) {
      throw ArgumentError.value(value, 'size');
    }
    if (value == _size) return false;
    _size = value;
    _rebuild();
    return true;
  }

  bool set({Offset? center, double? scale, double? rotation}) {
    final c = center ?? _center, s = scale ?? _scale, r = rotation ?? _rotation;
    if (!c.dx.isFinite ||
        !c.dy.isFinite ||
        !s.isFinite ||
        s <= 0 ||
        !r.isFinite) {
      throw ArgumentError(
        'camera requires a finite center/rotation and positive scale',
      );
    }
    final cos = math.cos(r), sin = math.sin(r);
    final tx = _size.width / 2 - s * (cos * c.dx - sin * c.dy);
    final ty = _size.height / 2 - s * (sin * c.dx + cos * c.dy);
    if (!tx.isFinite || !ty.isFinite || !(s * s).isFinite || s * s == 0) {
      throw ArgumentError('camera transform is not representable');
    }
    if (c == _center && s == _scale && r == _rotation) return false;
    _center = c;
    _scale = s;
    _rotation = r;
    _rebuild();
    return true;
  }

  bool pan(Offset localDelta) => set(
    center: _center - (localToWorld(localDelta) - localToWorld(Offset.zero)),
  );

  /// Keep the world point under [localAnchor] fixed while changing camera size
  /// or angle. Used by pinch/wheel and explicit anchored camera commands.
  bool transformAround(Offset localAnchor, {double? scale, double? rotation}) {
    final world = localToWorld(localAnchor);
    final nextScale = scale ?? _scale, nextRotation = rotation ?? _rotation;
    if (!nextScale.isFinite || nextScale <= 0 || !nextRotation.isFinite) {
      throw ArgumentError('invalid anchored camera transform');
    }
    final offset = localAnchor - Offset(_size.width / 2, _size.height / 2);
    final cos = math.cos(nextRotation), sin = math.sin(nextRotation);
    final worldOffset =
        Offset(
          cos * offset.dx + sin * offset.dy,
          -sin * offset.dx + cos * offset.dy,
        ) /
        nextScale;
    return set(
      center: world - worldOffset,
      scale: nextScale,
      rotation: nextRotation,
    );
  }

  bool focus(Rect worldBounds, {EdgeInsets padding = EdgeInsets.zero}) {
    final available = _available(padding);
    _validateBounds(worldBounds);
    return set(
      center: _centerFor(worldBounds.center, available.center, _scale),
    );
  }

  bool fit(Rect worldBounds, {EdgeInsets padding = EdgeInsets.zero}) {
    final available = _available(padding);
    _validateBounds(worldBounds);
    final rotated = Affine.fromAttrs({
      'rotation': _rotation,
    }).projectRect(worldBounds).bounds;
    final sx = rotated.width == 0
        ? double.infinity
        : available.width / rotated.width;
    final sy = rotated.height == 0
        ? double.infinity
        : available.height / rotated.height;
    final candidate = math.min(sx, sy);
    final nextScale = candidate.isFinite ? candidate : _scale;
    return set(
      center: _centerFor(worldBounds.center, available.center, nextScale),
      scale: nextScale,
    );
  }

  Offset _centerFor(Offset target, Offset localDestination, double scale) {
    final delta = localDestination - Offset(_size.width / 2, _size.height / 2);
    final cos = math.cos(_rotation), sin = math.sin(_rotation);
    return target -
        Offset(
              cos * delta.dx + sin * delta.dy,
              -sin * delta.dx + cos * delta.dy,
            ) /
            scale;
  }

  Rect _available(EdgeInsets padding) {
    if (!hasSize ||
        !padding.isNonNegative ||
        !padding.left.isFinite ||
        !padding.top.isFinite ||
        !padding.right.isFinite ||
        !padding.bottom.isFinite) {
      throw ArgumentError(
        'focus/fit needs a surface and finite nonnegative padding',
      );
    }
    final rect = Rect.fromLTRB(
      padding.left,
      padding.top,
      _size.width - padding.right,
      _size.height - padding.bottom,
    );
    if (rect.width <= 0 || rect.height <= 0) {
      throw ArgumentError('padding leaves no available viewport');
    }
    return rect;
  }

  void _validateBounds(Rect bounds) {
    if (!bounds.isFinite || bounds.width < 0 || bounds.height < 0) {
      throw ArgumentError.value(bounds, 'bounds');
    }
  }

  void _rebuild() {
    final cos = math.cos(_rotation) * _scale,
        sin = math.sin(_rotation) * _scale;
    _worldToLocal = Affine(
      cos,
      sin,
      -sin,
      cos,
      _size.width / 2 - cos * _center.dx + sin * _center.dy,
      _size.height / 2 - sin * _center.dx - cos * _center.dy,
    );
    _localToWorld = _worldToLocal.inverse!;
    _matrix = _worldToLocal.toMatrix4();
  }
}
