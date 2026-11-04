import 'dart:math' as math;

/// Scalar trajectory only. MapCamera applies samples and the existing frame
/// coordinator supplies time. No camera copy, listener, timer or scheduler.
final class RotationTransition {
  RotationTransition(this.from, this.target, this.duration)
    : delta = shortestDelta(from, target);

  final double from, target, delta;
  final Duration duration;
  Duration? _start;
  bool finished = false;

  static double shortestDelta(double from, double to) {
    // Use the camera's trigonometric orientation, avoiding overflow and the
    // inaccurate `% 2pi` reduction of large but finite angles.
    final a = math.atan2(math.sin(from), math.cos(from));
    final b = math.atan2(math.sin(to), math.cos(to));
    final delta = (b - a + math.pi) % (2 * math.pi) - math.pi;
    if (delta.abs() < 1e-12) return 0;
    return (delta + math.pi).abs() < 1e-12 ? math.pi : delta;
  }

  double sample(Duration time) {
    final elapsed = time - (_start ??= time);
    if (elapsed >= duration) {
      finished = true;
      return target;
    }
    final t = (elapsed.inMicroseconds / duration.inMicroseconds).clamp(
      0.0,
      1.0,
    );
    final remaining = 1 - t;
    return from + delta * (1 - remaining * remaining * remaining);
  }
}
