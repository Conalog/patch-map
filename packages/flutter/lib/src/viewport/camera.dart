import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui';

import 'package:flutter/painting.dart' show EdgeInsets;

import '../api/camera.dart';
import '../api/gesture_options.dart';
import '../api/rotation_animation.dart';
import '../geometry/affine.dart';
import 'rotation_transition.dart';

/// Camera authority in logical pixels. Resize does not reset world center,
/// scale or rotation. It does not own a copy of scene or selection state.
final class MapCamera {
  Size _size = Size.zero;
  Offset _center = Offset.zero;
  double _scale = 1, _rotation = 0;
  Affine _worldToLocal = Affine.identity;
  Affine _localToWorld = Affine.identity;
  Float64List _matrix = Affine.identity.toMatrix4();
  PatchMapCameraState? _snapshot, _lastNotified;
  bool _observed = false;
  int _pendingSources = 0;
  PatchMapZoomLimits _zoomLimits = const PatchMapZoomLimits();
  PatchMapRotationAnimationOptions _rotationAnimation =
      const PatchMapRotationAnimationOptions();
  RotationTransition? _rotationTransition;
  bool get rotating => _rotationTransition != null;

  static void validateRotationAnimation(
    PatchMapRotationAnimationOptions options,
  ) {
    if (options.duration.isNegative) {
      throw ArgumentError('rotation animation duration must be nonnegative');
    }
  }

  /// Disabling animation completes the accepted target immediately. Duration
  /// changes apply to subsequent commands; they do not restart active travel.
  bool setRotationAnimation(PatchMapRotationAnimationOptions options) {
    validateRotationAnimation(options);
    final transition = _rotationTransition;
    var changed = false;
    if (transition != null &&
        (!options.enabled || options.duration == Duration.zero)) {
      changed = set(rotation: transition.target);
    }
    _rotationAnimation = options;
    return changed;
  }

  /// Accept a shortest-path rotation while retaining world center and scale.
  /// Validate the target before interrupting an already accepted trajectory.
  void rotateTo(double angle) {
    if (!angle.isFinite) throw ArgumentError('rotation must be finite');
    _candidate(_size, _center, _scale, angle);
    final options = _rotationAnimation;
    final transition = RotationTransition(_rotation, angle, options.duration);
    if (!options.enabled ||
        options.duration == Duration.zero ||
        transition.delta == 0) {
      set(rotation: angle);
      return;
    }
    // At huge unwrapped angles the incremental trajectory is not representable.
    if (_rotation + transition.delta == _rotation) {
      throw ArgumentError(
        'normalize the current angle before animated rotation',
      );
    }
    _validateRotationTravel(_size, transition.delta);
    _rotationTransition = transition;
  }

  /// Called only by the backend's existing frame callback. Idle is one null
  /// check; active travel changes the camera, never scene/resource preparation.
  bool advanceRotation(Duration time) {
    final transition = _rotationTransition;
    if (transition == null) return false;
    try {
      _set(rotation: transition.sample(time), interruptRotation: false);
    } on ArgumentError {
      // A numeric boundary must never fail the owning map generation. Retain
      // the last committed transform if platform rounding defeats admission.
      cancelRotation();
      return false;
    }
    if (transition.finished) _rotationTransition = null;
    return _rotationTransition != null;
  }

  /// Interruption retains the last applied angle, without replay on resume.
  void cancelRotation() => _rotationTransition = null;

  static void validateZoomLimits(PatchMapZoomLimits limits) {
    final min = limits.minScale, max = limits.maxScale;
    if ((min != null && (!min.isFinite || min <= 0)) ||
        (max != null && (!max.isFinite || max <= 0)) ||
        (min != null && max != null && min > max)) {
      throw ArgumentError('zoom limits must be finite, positive and ordered');
    }
  }

  /// Validate and prepare before committing either limits or camera values.
  /// Tightening bounds keeps the world center and angle, without fitting again.
  bool setZoomLimits(PatchMapZoomLimits limits) {
    if (limits.minScale == _zoomLimits.minScale &&
        limits.maxScale == _zoomLimits.maxScale) {
      return false;
    }
    validateZoomLimits(limits);
    final scale = _limitedScale(_scale, limits);
    final candidate = scale == _scale
        ? null
        : _candidate(_size, _center, scale, _rotation);
    _zoomLimits = limits;
    if (candidate == null) return false;
    cancelRotation();
    _scale = scale;
    _commit(candidate, PatchMapCameraChangeSource.configuration);
    return true;
  }

  double _resolveScale(double value) {
    if (!value.isFinite || value <= 0) {
      throw ArgumentError('camera scale must be finite and positive');
    }
    return _limitedScale(value, _zoomLimits);
  }

  static double _limitedScale(double value, PatchMapZoomLimits limits) {
    final min = limits.minScale, max = limits.maxScale;
    if (min != null && value < min) return min;
    if (max != null && value > max) return max;
    return value;
  }

  PatchMapCameraState get snapshot => _snapshot ??= PatchMapCameraState(
    center: _center,
    scale: _scale,
    rotation: _rotation,
    viewportSize: _size,
  );

  /// Observation adds no timer, listener or snapshot allocation per mutation.
  void observe(bool value) {
    if (value == _observed) return;
    _observed = value;
    _pendingSources = 0;
    _lastNotified = value ? snapshot : null;
  }

  void discardChanges() => _pendingSources = 0;

  /// The new diagram adopts this camera even if its fit was already satisfied
  /// by an unreported old-diagram command. Net-zero delivery is still skipped.
  void markReplacement() {
    if (_observed) {
      _pendingSources |= 1 << PatchMapCameraChangeSource.replacement.index;
    }
  }

  /// Drained by the widget's existing submitted-frame callback, before calling
  /// the host, so a reentrant command belongs to the next frame.
  PatchMapCameraChange? takeChange() {
    final sources = _pendingSources;
    _pendingSources = 0;
    if (sources == 0) return null;
    final state = snapshot;
    if (state == _lastNotified) return null;
    _lastNotified = state;
    return PatchMapCameraChange(
      state: state,
      sources: PatchMapCameraChangeSource.values.where(
        (source) => sources & (1 << source.index) != 0,
      ),
    );
  }

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
    final candidate = _candidate(value, _center, _scale, _rotation);
    final transition = _rotationTransition;
    if (transition != null) {
      _validateRotationTravel(
        value,
        RotationTransition.shortestDelta(_rotation, transition.target),
      );
    }
    _size = value;
    _commit(candidate, PatchMapCameraChangeSource.resize);
    return true;
  }

  bool set({
    Offset? center,
    double? scale,
    double? rotation,
    PatchMapCameraChangeSource source = PatchMapCameraChangeSource.programmatic,
  }) => _set(center: center, scale: scale, rotation: rotation, source: source);

  bool _set({
    Offset? center,
    double? scale,
    double? rotation,
    PatchMapCameraChangeSource source = PatchMapCameraChangeSource.programmatic,
    bool interruptRotation = true,
  }) {
    final c = center ?? _center,
        s = _resolveScale(scale ?? _scale),
        r = rotation ?? _rotation;
    if (!c.dx.isFinite || !c.dy.isFinite || !r.isFinite) {
      throw ArgumentError(
        'camera requires a finite center/rotation and positive scale',
      );
    }
    if (c == _center && s == _scale && r == _rotation) {
      if (interruptRotation) cancelRotation();
      return false;
    }
    final candidate = _candidate(_size, c, s, r);
    if (interruptRotation) cancelRotation();
    _center = c;
    _scale = s;
    _rotation = r;
    _commit(candidate, source);
    return true;
  }

  bool pan(Offset localDelta) => set(
    center: _center - (localToWorld(localDelta) - localToWorld(Offset.zero)),
    source: PatchMapCameraChangeSource.gesture,
  );

  /// Keep the world point under [localAnchor] fixed while changing camera size
  /// or angle. Used by pinch/wheel and explicit anchored camera commands.
  bool transformAround(Offset localAnchor, {double? scale, double? rotation}) {
    final nextScale = _resolveScale(scale ?? _scale),
        nextRotation = rotation ?? _rotation;
    if (!nextRotation.isFinite) {
      throw ArgumentError('invalid anchored camera transform');
    }
    if (nextScale == _scale && nextRotation == _rotation) return false;
    final world = localToWorld(localAnchor);
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
      source: PatchMapCameraChangeSource.gesture,
    );
  }

  bool focus(Rect worldBounds, {EdgeInsets padding = EdgeInsets.zero}) {
    final available = _available(padding);
    _validateBounds(worldBounds);
    return set(
      center: _centerFor(worldBounds.center, available.center, _scale),
      source: PatchMapCameraChangeSource.focus,
    );
  }

  bool fit(
    Rect worldBounds, {
    EdgeInsets padding = EdgeInsets.zero,
    PatchMapCameraChangeSource source = PatchMapCameraChangeSource.fit,
  }) {
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
    final nextScale = _resolveScale(candidate.isFinite ? candidate : _scale);
    return set(
      center: _centerFor(worldBounds.center, available.center, nextScale),
      scale: nextScale,
      source: source,
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

  /// Admission only: prove the entire arc fits the forward/inverse arithmetic.
  /// The usual path uses orientation-independent bounds, without trigonometry.
  /// Only extreme coordinates need the tighter arc extrema. Leave frame samples
  /// on the existing matrix path; do not repeatedly validate the trajectory.
  void _validateRotationTravel(Size size, double delta) {
    if (_rotationEnvelopeFits(size, null, null)) return;
    final from = math.atan2(math.sin(_rotation), math.cos(_rotation));
    // Include rounding when the unwrapped scalar is added to its travel delta.
    final slack = 1e-12 + _rotation.abs() * 1e-15;
    final start = math.min(from, from + delta) - slack;
    final end = math.max(from, from + delta) + slack;
    if (!_rotationEnvelopeFits(size, start, end)) {
      throw ArgumentError('camera rotation trajectory is not representable');
    }
  }

  bool _rotationEnvelopeFits(Size size, double? start, double? end) {
    // The slack covers coefficient, product, sum and determinant rounding. An
    // ambiguous floating-point boundary is rejected before changing any state.
    const slack = 1e-12;
    final square = _scale * _scale;
    final determinantMin = square * (1 - slack) - 2 * double.minPositive;
    final determinantMax = square * (1 + slack) + 2 * double.minPositive;
    if (determinantMin <= 0 || !determinantMax.isFinite) return false;
    final cos = _linearMagnitude(1, 0, _scale, start, end) * (1 + slack);
    final sin = _linearMagnitude(0, 1, _scale, start, end) * (1 + slack);
    final x = _center.dx.abs(), y = _center.dy.abs();
    final halfWidth = size.width / 2, halfHeight = size.height / 2;
    final error = x * (_scale * slack) + y * (_scale * slack);
    final tx =
        _linearMagnitude(
          -_center.dx,
          _center.dy,
          _scale,
          start,
          end,
          offset: halfWidth,
        ) +
        error;
    final ty =
        _linearMagnitude(
          -_center.dy,
          -_center.dx,
          _scale,
          start,
          end,
          offset: halfHeight,
        ) +
        error;
    // _candidate evaluates these partial sums before the final translation.
    if (!_linearMagnitude(
          -_center.dx,
          0,
          _scale,
          start,
          end,
          offset: halfWidth,
        ).isFinite ||
        !_linearMagnitude(
          0,
          -_center.dx,
          _scale,
          start,
          end,
          offset: halfHeight,
        ).isFinite ||
        !(cos * x).isFinite ||
        !(sin * x).isFinite ||
        !(sin * y).isFinite ||
        !(cos * y).isFinite ||
        !tx.isFinite ||
        !ty.isFinite) {
      return false;
    }
    final inverseCos = cos / determinantMin;
    final inverseSin = sin / determinantMin;
    if (!(inverseCos * tx).isFinite ||
        !(inverseSin * ty).isFinite ||
        !(inverseSin * tx).isFinite ||
        !(inverseCos * ty).isFinite) {
      return false;
    }
    // In the inverse sum the center terms cancel to center * scale²/det.
    // Bound that sum directly, retaining a generous arithmetic error allowance,
    // rather than rejecting valid large centers by adding both absolute terms.
    final viewportX = _linearMagnitude(
      halfWidth,
      halfHeight,
      1 / _scale,
      start,
      end,
    );
    final viewportY = _linearMagnitude(
      halfHeight,
      -halfWidth,
      1 / _scale,
      start,
      end,
    );
    final inverseError =
        x * slack + y * slack + math.max(viewportX, viewportY) * slack;
    final determinantError = math.max(x, y) * (square / determinantMin - 1);
    final inverseX = _linearMagnitude(
      -halfWidth,
      -halfHeight,
      1 / _scale,
      start,
      end,
      offset: _center.dx,
    );
    final inverseY = _linearMagnitude(
      -halfHeight,
      halfWidth,
      1 / _scale,
      start,
      end,
      offset: _center.dy,
    );
    return (inverseX + inverseError + determinantError).isFinite &&
        (inverseY + inverseError + determinantError).isFinite;
  }

  /// Maximum |offset + factor * (x cos(t) + y sin(t))| over an arc/full turn.
  /// Normalize coefficients before arithmetic so large finite centers can be
  /// checked without overflowing the validator itself. There are no samples:
  /// an arc maximum is at an endpoint or at phase + k*pi.
  static double _linearMagnitude(
    double x,
    double y,
    double factor,
    double? start,
    double? end, {
    double offset = 0,
  }) {
    final magnitude = math.max(math.max(x.abs(), y.abs()), offset.abs());
    if (magnitude == 0) return 0;
    final a = x / magnitude, b = y / magnitude;
    final amplitude = vectorLength(a, b);
    final constant = offset / magnitude;
    // Preserve the original multiplication order for unshifted bounds, so a
    // small factor cannot underflow before a large coordinate restores it.
    final weight = offset == 0 ? 1.0 : factor;
    var bound = constant.abs() + amplitude * weight;
    if (start != null && end != null && end - start < 2 * math.pi) {
      final phase = math.atan2(b, a);
      final index = ((start - phase) / math.pi).ceil();
      final extremum = phase + index * math.pi;
      bound = math.max(
        (constant + weight * (a * math.cos(start) + b * math.sin(start))).abs(),
        (constant + weight * (a * math.cos(end) + b * math.sin(end))).abs(),
      );
      if (extremum <= end) {
        final peak = (index.isEven ? amplitude : -amplitude) * weight;
        bound = math.max(bound, (constant + peak).abs());
        if (extremum + math.pi <= end) {
          bound = math.max(bound, (constant - peak).abs());
        }
      }
    }
    if (offset != 0) return bound * magnitude;
    return factor <= 1
        ? (magnitude * factor) * bound
        : (bound * factor) * magnitude;
  }

  (Affine, Affine, Float64List) _candidate(
    Size size,
    Offset center,
    double scale,
    double rotation,
  ) {
    final cos = math.cos(rotation) * scale, sin = math.sin(rotation) * scale;
    final forward = Affine(
      cos,
      sin,
      -sin,
      cos,
      size.width / 2 - cos * center.dx + sin * center.dy,
      size.height / 2 - sin * center.dx - cos * center.dy,
    );
    final inverse = forward.inverse;
    if (!forward.isFinite || inverse == null) {
      throw ArgumentError('camera transform is not representable');
    }
    return (forward, inverse, forward.toMatrix4());
  }

  void _commit(
    (Affine, Affine, Float64List) candidate,
    PatchMapCameraChangeSource source,
  ) {
    _worldToLocal = candidate.$1;
    _localToWorld = candidate.$2;
    _matrix = candidate.$3;
    _snapshot = null;
    if (_observed) _pendingSources |= 1 << source.index;
  }
}
