import 'dart:math' as math;

import '../api/gesture_options.dart';

/// Adapts one Flutter scale gesture into independent camera targets. This only
/// retains scalar input baselines; the input coordinator still applies them.
final class TouchCameraGesture {
  PatchMapGestureOptions _options = const PatchMapGestureOptions();
  double _zoomLower = 1, _zoomUpper = 1, _rotationThreshold = 0;
  double _zoomLowerAfterRotation = 1, _zoomUpperAfterRotation = 1;
  double _rotationThresholdAfterZoom = 0;
  double? _zoomOrigin, _rotationOrigin;
  bool _zoomActive = false, _rotationActive = false;
  double _cameraScale = 1, _cameraRotation = 0;
  double _lastRotation = 0, _rotationTravel = 0;
  double _scale = 1, _rotation = 0;

  bool get enabled => _options.zoomEnabled || _options.rotationEnabled;
  double get scale => _scale;
  double get rotation => _rotation;

  static void validateOptions(PatchMapGestureOptions options) {
    if (options.longPressDuration.isNegative) {
      throw ArgumentError.value(
        options.longPressDuration,
        'longPressDuration',
        'must be nonnegative',
      );
    }
    if (!options.zoomThreshold.isFinite ||
        options.zoomThreshold < 0 ||
        options.zoomThreshold >= 1 ||
        !options.zoomThresholdAfterRotation.isFinite ||
        options.zoomThresholdAfterRotation < 0 ||
        options.zoomThresholdAfterRotation >= 1 ||
        !options.rotationThresholdDegrees.isFinite ||
        options.rotationThresholdDegrees < 0 ||
        !options.rotationThresholdAfterZoomDegrees.isFinite ||
        options.rotationThresholdAfterZoomDegrees < 0) {
      throw ArgumentError(
        'zoom thresholds must be finite in [0, 1); '
        'rotation thresholds must be finite and nonnegative',
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
    final zoomAfterRotation = math.max(
      options.zoomThreshold,
      options.zoomThresholdAfterRotation,
    );
    _zoomLowerAfterRotation = 1 - zoomAfterRotation;
    _zoomUpperAfterRotation = 1 + zoomAfterRotation;
    _rotationThresholdAfterZoom =
        math.max(
          options.rotationThresholdDegrees,
          options.rotationThresholdAfterZoomDegrees,
        ) *
        (math.pi / 180);
    _zoomOrigin = options.zoomThreshold == 0 ? 1 : null;
    _rotationOrigin = options.rotationThresholdDegrees == 0 ? 0 : null;
    _zoomActive = _rotationActive = false;
    _cameraScale = cameraScale;
    _cameraRotation = cameraRotation;
    _scale = cameraScale;
    _rotation = cameraRotation;
    _lastRotation = _rotationTravel = 0;
  }

  /// Evaluate both axes against the state before this sample. A simultaneous
  /// crossing must not depend on which scalar calculation runs first.
  void update({
    required double factor,
    required double angle,
    required double currentScale,
    required double currentRotation,
  }) {
    final zoomWasActive = _zoomActive;
    final rotationWasActive = _rotationActive;
    _scale = _nextScale(factor, currentScale, rotationWasActive);
    _rotation = _nextRotation(angle, currentRotation, zoomWasActive);
  }

  double _nextScale(
    double factor,
    double currentScale,
    bool rotationWasActive,
  ) {
    // Coincident fingers can produce a zero span. It cannot become a divisor
    // or a valid camera scale, so retain the last camera for that sample.
    if (!_options.zoomEnabled || !factor.isFinite || factor <= 0) {
      return currentScale;
    }
    final origin = _zoomOrigin;
    if (origin == null) {
      final lower = rotationWasActive ? _zoomLowerAfterRotation : _zoomLower;
      final upper = rotationWasActive ? _zoomUpperAfterRotation : _zoomUpper;
      if (factor >= upper || factor <= lower) {
        _zoomOrigin = factor;
        _cameraScale = currentScale;
        _zoomActive = true;
      }
      // Discard the entire activation sample, including threshold overshoot.
      return currentScale;
    }
    // A zero threshold has an origin immediately, but neutral input must not
    // count as the first active axis and suppress the other one.
    if (factor != 1) _zoomActive = true;
    return _cameraScale * (factor / origin);
  }

  double _nextRotation(
    double angle,
    double currentRotation,
    bool zoomWasActive,
  ) {
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
      final threshold = zoomWasActive
          ? _rotationThresholdAfterZoom
          : _rotationThreshold;
      if (_rotationTravel.abs() >= threshold) {
        _rotationOrigin = _rotationTravel;
        _cameraRotation = currentRotation;
        _rotationActive = true;
      }
      return currentRotation;
    }
    if (_rotationTravel != 0) _rotationActive = true;
    return _cameraRotation + (_rotationTravel - origin);
  }
}
