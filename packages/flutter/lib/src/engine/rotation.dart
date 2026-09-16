part of 'controller.dart';

class PatchMapRotationAnimation {
  final _completer = Completer<PatchMapResult>();
  late bool Function() _cancel;
  Future<PatchMapResult> get finished => _completer.future;
  bool cancel() => _cancel();
}

class _RotationPlan {
  _RotationPlan(this.handle, this.from, this.to, this.completed, this.duration);
  final PatchMapRotationAnimation handle;
  final double from, to, completed, duration;
  double? start, hiddenAt;
  bool awaitingFrame = false;
}

class PatchMapRotationApi {
  PatchMapRotationApi._(this._c);
  final PatchMapController _c;
  double _value = 0;
  double get value => _value;
  set value(num angle) {
    set(angle);
  }

  _RotationPlan? _animation;
  double set(num angle) {
    _c._assertLive();
    final next = _number(angle);
    _cancel();
    _assign(next);
    return _value;
  }

  void _assign(double value) {
    if (_value == value) return;
    _value = value;
    _c.viewport._changed();
  }

  double rotateBy(num delta) => set(_value + _number(delta));
  double reset() => set(0);
  PatchMapRotationAnimation animateTo(
    num angle, {
    num durationMs = 250,
    String path = 'raw',
    bool normalizeOnComplete = false,
  }) {
    _c._assertLive();
    final target = _number(angle), duration = _number(durationMs);
    if (duration < 0 ||
        !['raw', 'clockwise', 'counterclockwise', 'shortest'].contains(path))
      throw const PatchMapException(
        'INVALID_INPUT',
        'Invalid rotation animation',
      );
    var to = target;
    if (path != 'raw') {
      final distance = (target % 360 - _value % 360) % 360;
      final clockwise = math.min(distance, 360 - distance) <= 1e-9
          ? 0.0
          : (distance - 180).abs() <= 1e-9
          ? 180.0
          : distance;
      final delta =
          clockwise == 0 ||
              path == 'clockwise' ||
              path == 'shortest' && clockwise <= 180
          ? clockwise
          : clockwise - 360;
      to = _value + delta;
      final bearingError = (to % 360 - target % 360).abs();
      if (_value.abs() > 9007199254740991 ||
          to.abs() > 9007199254740991 ||
          math.min(bearingError, 360 - bearingError) > 1e-9)
        throw const PatchMapException(
          'INVALID_INPUT',
          'Directed angle cannot represent target',
        );
    }
    _cancel();
    final handle = PatchMapRotationAnimation();
    final plan = _RotationPlan(
      handle,
      _value,
      to,
      normalizeOnComplete ? target % 360 : to,
      duration,
    );
    handle._cancel = () => identical(_animation, plan) ? _cancel() : false;
    _c._syncAnimationClock();
    plan.start = _c._clockMs;
    _animation = plan;
    plan.hiddenAt = _c._surfaceVisible ? null : _c._clockMs;
    _c.viewport._settleTimer?.cancel();
    if (duration == 0 || to == _value || _c.reducedMotion) {
      final changed = plan.completed != _value;
      _assign(plan.completed);
      _animation = null;
      if (changed) _c.viewport._queueSettled();
      handle._completer.complete(
        PatchMapResult({'status': 'completed', 'angle': _value}),
      );
    } else {
      _c._dirty = false;
      _c._schedule();
    }
    return handle;
  }

  bool _cancel({String status = 'cancelled'}) {
    final animation = _animation;
    if (animation == null) return false;
    _animation = null;
    _c.viewport._queueSettled();
    animation.handle._completer.complete(
      PatchMapResult({'status': status, 'angle': _value}),
    );
    return true;
  }

  void _completeFrame() {
    final animation = _animation;
    if (animation == null || !animation.awaitingFrame) return;
    _value = animation.completed;
    _animation = null;
    _c.viewport._queueSettled();
    animation.handle._completer.complete(
      PatchMapResult({'status': 'completed', 'angle': _value}),
    );
  }

  void _visibilityChanged(bool visible, double milliseconds) {
    final plan = _animation;
    if (plan == null) return;
    if (!visible) {
      plan.hiddenAt = milliseconds;
    } else if (plan.hiddenAt != null) {
      plan.start = plan.start! + math.max(0, milliseconds - plan.hiddenAt!);
      plan.hiddenAt = null;
    }
  }

  bool _advance(double milliseconds) {
    final animation = _animation;
    if (animation == null || animation.awaitingFrame) return false;
    final t = _c.reducedMotion
        ? 1.0
        : ((milliseconds - animation.start!) / animation.duration).clamp(
            0.0,
            1.0,
          );
    final inverse = 1 - t, eased = 1 - inverse * inverse * inverse;
    _assign(
      t >= 1
          ? animation.to
          : animation.from * (1 - eased) + animation.to * eased,
    );
    if (t >= 1) {
      animation.awaitingFrame = true;
      return false;
    }
    return true;
  }
}
