import 'dart:math' as math;

import '../api/gesture_options.dart';

/// Adapts one Flutter scale gesture into independent camera targets. This only
/// retains scalar input baselines; the input coordinator still applies them.
final class TouchCameraGesture {
  PatchMapGestureOptions _options = const PatchMapGestureOptions();
  double _zoomLower = 1, _zoomUpper = 1, _rotationThreshold = 0;
  double? _zoomOrigin, _rotationOrigin;
  double _cameraScale = 1, _cameraRotation = 0;
  double _lastRotation = 0, _rotationTravel = 0;

  bool get enabled => _options.zoomEnabled || _options.rotationEnabled;

  static void validateOptions(PatchMapGestureOptions options) {
    if (!options.zoomThreshold.isFinite ||
        options.zoomThreshold < 0 ||
        options.zoomThreshold >= 1 ||
        !options.rotationThresholdDegrees.isFinite ||
        options.rotationThresholdDegrees < 0) {
      throw ArgumentError(
        'zoomThreshold must be finite in [0, 1); '
        'rotationThresholdDegrees must be finite and nonnegative',
      );
    }
  }

  void start(
    PatchMapGestureOptions options, {
    required double cameraScale,
    required double cameraRotation,
  }) {
    validateOptions(options);
    _options = options;
    _zoomLower = 1 - options.zoomThreshold;
    _zoomUpper = 1 + options.zoomThreshold;
    _rotationThreshold = options.rotationThresholdDegrees * (math.pi / 180);
    _zoomOrigin = options.zoomThreshold == 0 ? 1 : null;
    _rotationOrigin = options.rotationThresholdDegrees == 0 ? 0 : null;
    _cameraScale = cameraScale;
    _cameraRotation = cameraRotation;
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
      if (factor >= _zoomUpper || factor <= _zoomLower) {
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
