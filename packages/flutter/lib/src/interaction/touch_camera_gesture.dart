import 'dart:math' as math;

import '../api/gesture_options.dart';

/// Adapts one Flutter scale gesture into independent camera targets. This only
/// retains scalar input baselines; the input coordinator still applies them.
final class TouchCameraGesture {
  static const _zoomThreshold = .02;
  static const _rotationThreshold = 5 * math.pi / 180;

  PatchMapGestureOptions _options = const PatchMapGestureOptions();
  double? _zoomOrigin, _rotationOrigin;
  double _cameraScale = 1, _cameraRotation = 0;
  double _lastRotation = 0, _rotationTravel = 0;

  bool get enabled => _options.zoomEnabled || _options.rotationEnabled;

  void start(PatchMapGestureOptions options) {
    _options = options;
    _zoomOrigin = _rotationOrigin = null;
    _lastRotation = _rotationTravel = 0;
  }

  double scale(double factor, double currentScale) {
    // Coincident fingers can produce a zero span. It cannot become a divisor
    // or a valid camera scale, so retain the last camera for that sample.
    if (!_options.zoomEnabled || !factor.isFinite || factor <= 0) {
      return currentScale;
    }
    final origin = _zoomOrigin;
    if (origin == null) {
      if (factor >= 1 + _zoomThreshold || factor <= 1 - _zoomThreshold) {
        _zoomOrigin = factor;
        _cameraScale = currentScale;
      }
      // Discard the entire activation sample, including threshold overshoot.
      return currentScale;
    }
    return _cameraScale * (factor / origin);
  }

  double rotation(double angle, double currentRotation) {
    if (!_options.rotationEnabled || !angle.isFinite) return currentRotation;
    // Flutter derives its angle from atan2. Crossing its branch cut must not
    // look like a full turn or activate rotation on a tiny finger movement.
    var delta = angle - _lastRotation;
    if (delta > math.pi) {
      delta -= 2 * math.pi;
    } else if (delta < -math.pi) {
      delta += 2 * math.pi;
    }
    _lastRotation = angle;
    _rotationTravel += delta;
    final origin = _rotationOrigin;
    if (origin == null) {
      if (_rotationTravel.abs() >= _rotationThreshold) {
        _rotationOrigin = _rotationTravel;
        _cameraRotation = currentRotation;
      }
      return currentRotation;
    }
    return _cameraRotation + (_rotationTravel - origin);
  }
}
