import 'dart:ui';

import '../geometry/geometry_snapshot.dart';
import '../geometry/item_layout.dart';
import '../presentation/record_delta.dart';

/// Only active bar transitions are visited on a frame. Geometry/layout stays at
/// accepted target values; interruption samples the displayed rectangle.
final class BarTransitions {
  final _active = <(int, String), _Transition>{};
  int _time = 0;
  bool advance(Duration time) {
    _time = time.inMicroseconds;
    _active.removeWhere((key, value) {
      value.start ??= _time;
      return _time - value.start! >= value.duration;
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
    Map<int, ComponentChanges>? componentChanges,
  }) {
    for (final slot in changed) {
      final old = before.nodes[slot].item, next = after.nodes[slot].item;
      if (old == null || next == null) continue;
      Map<String, ComponentLayout>? previous;
      final updates = animate ? (componentChanges?[slot]) : null;
      final updatesIterator = updates?.iterator;
      final count = updates?.length ?? next.components.length;
      for (var position = 0; position < count; position++) {
        final int index;
        if (updates == null) {
          index = position;
        } else {
          updatesIterator!.moveNext();
          final change = updatesIterator.current;
          if ((change.delta.fields &
                  (ItemLayout.componentGeometryFields |
                      RecordFields.animation |
                      RecordFields.animationDuration)) ==
              0) {
            continue;
          }
          index = change.index;
        }
        final component = next.components[index];
        if (component.type != 'bar') continue;
        final key = (slot, component.id);
        final running = _active[key];
        if (animate &&
            component.data['animation'] == true &&
            running?.to == component.box) {
          continue;
        }
        Rect? from = running?.at(_time);
        if (from == null) {
          final indexed = index < old.components.length
              ? old.components[index]
              : null;
          final oldComponent = indexed?.id == component.id
              ? indexed
              : (previous ??= {
                  for (final value in old.components) value.id: value,
                })[component.id];
          from = oldComponent?.box;
        }
        if (running != null) _active.remove(key);
        if (!animate ||
            component.data['animation'] != true ||
            from == null ||
            from == component.box) {
          continue;
        }
        final duration = ((component.data['animationDuration']! as num) * 1000)
            .round();
        if (duration == 0) continue;
        _active[key] = _Transition(from, component.box, duration);
      }
    }
  }

  /// Before boxes are captured before retained geometry mutates.
  void replaceRetained(
    int slot,
    String id,
    Rect before,
    Rect after,
    Map<String, Object?> data, {
    required bool animate,
  }) {
    final key = (slot, id), running = _active[key];
    if (animate && data['animation'] == true && running?.to == after) return;
    final from = running?.at(_time) ?? before;
    _active.remove(key);
    if (!animate || data['animation'] != true || from == after) return;
    final duration = ((data['animationDuration']! as num) * 1000).round();
    if (duration != 0) _active[key] = _Transition(from, after, duration);
  }

  void clear() => _active.clear();
}

final class _Transition {
  _Transition(this.from, this.to, this.duration);
  final Rect from, to;
  final int duration;
  int? start;
  Rect at(int time) {
    if (start == null) return from;
    final t = ((time - start!) / duration).clamp(0.0, 1.0);
    return Rect.lerp(
      from,
      to,
      (t < .5
          ? 4 * t * t * t
          : 1 - (-2 * t + 2) * (-2 * t + 2) * (-2 * t + 2) / 2),
    )!;
  }
}
