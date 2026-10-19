import 'dart:ui';

import '../geometry/geometry_snapshot.dart';

/// Only active bar transitions are visited on a frame. Geometry/layout stays at
/// accepted target values; interruption samples the displayed rectangle.
final class BarTransitions {
  final _active = <(int, String), _Transition>{};
  Duration _time = Duration.zero;
  bool advance(Duration time) {
    _time = time;
    _active.removeWhere((key, value) {
      value.start ??= time;
      return time >= value.start! + value.duration;
    });
    return _active.isNotEmpty;
  }

  Rect? rectangle(int slot, String component) =>
      _active[(slot, component)]?.at(_time);
  void replace(
    GeometrySnapshot before,
    GeometrySnapshot after,
    Iterable<int> changed, {
    required bool animate,
  }) {
    for (final slot in changed) {
      final old = before.nodes[slot].item, next = after.nodes[slot].item;
      if (old == null || next == null) continue;
      final previous = {
        for (final component in old.components) component.id: component,
      };
      for (final component in next.components) {
        if (component.type != 'bar') continue;
        final key = (slot, component.id), oldComponent = previous[component.id];
        final running = _active[key];
        if (animate &&
            component.data['animation'] == true &&
            running?.to == component.box) {
          continue;
        }
        final from = rectangle(slot, component.id) ?? oldComponent?.box;
        _active.remove(key);
        if (!animate ||
            component.data['animation'] != true ||
            from == null ||
            from == component.box) {
          continue;
        }
        final duration = Duration(
          microseconds: ((component.data['animationDuration']! as num) * 1000)
              .round(),
        );
        if (duration == Duration.zero) continue;
        _active[key] = _Transition(from, component.box, duration);
      }
    }
  }

  void clear() => _active.clear();
}

final class _Transition {
  _Transition(this.from, this.to, this.duration);
  final Rect from, to;
  final Duration duration;
  Duration? start;
  Rect at(Duration time) {
    if (start == null) return from;
    final t = ((time - start!).inMicroseconds / duration.inMicroseconds).clamp(
      0.0,
      1.0,
    );
    return Rect.lerp(
      from,
      to,
      (t < .5
          ? 4 * t * t * t
          : 1 - (-2 * t + 2) * (-2 * t + 2) * (-2 * t + 2) / 2),
    )!;
  }
}
