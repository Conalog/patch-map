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

  Rect? rectangle(int slot, String component, [int axes = 0]) =>
      _active[(slot, component)]?.at(_time, axes);
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
      final updates =
          animate &&
              old.content == next.content &&
              before.nodes[slot].data['contentOrientation'] ==
                  after.nodes[slot].data['contentOrientation']
          ? (componentChanges?[slot])
          : null;
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
        final indexed = index < old.components.length
            ? old.components[index]
            : null;
        final oldComponent = indexed?.id == component.id
            ? indexed
            : (previous ??= {
                for (final value in old.components) value.id: value,
              })[component.id];
        _replace(
          (slot, component.id),
          oldComponent?.box,
          component.box,
          component.data,
          oldComponent?.remapsPlacement == true ? old.content : null,
          component.remapsPlacement ? next.content : null,
          animate,
        );
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
    Rect? beforeContent,
    Rect? afterContent,
  }) => _replace(
    (slot, id),
    before,
    after,
    data,
    beforeContent,
    afterContent,
    animate,
  );

  void _replace(
    (int, String) key,
    Rect? before,
    Rect after,
    Map<String, Object?> data,
    Rect? beforeContent,
    Rect? afterContent,
    bool animate,
  ) {
    final running = _active[key];
    final enabled = animate && data['animation'] == true;
    if (enabled &&
        running != null &&
        running.to == after &&
        _samePlacement(after, running.toContent, afterContent)) {
      return;
    }
    if (running != null) _active.remove(key);
    if (!enabled) return;
    final duration = ((data['animationDuration']! as num) * 1000).round();
    if (duration == 0) return;
    final from = running?.at(_time, 0) ?? before;
    if (from == null) return;
    final sourceContent = running == null ? beforeContent : running.toContent;
    final variants = running != null && !running.uniformPlacement
        ? [for (var axes = 1; axes <= 3; axes++) running.at(_time, axes)]
        : null;
    if (from == after &&
        (variants == null
            ? _samePlacement(after, sourceContent, afterContent)
            : variants[0] == orientPlacement(after, afterContent, 1) &&
                  variants[1] == orientPlacement(after, afterContent, 2) &&
                  variants[2] == orientPlacement(after, afterContent, 3))) {
      return;
    }
    _active[key] = _Transition(
      from,
      after,
      sourceContent,
      afterContent,
      variants,
      duration,
    );
  }

  bool _samePlacement(Rect box, Rect? before, Rect? after) {
    if (before == after) return true;
    for (var axes = 1; axes <= 3; axes++) {
      if (orientPlacement(box, before, axes) !=
          orientPlacement(box, after, axes)) {
        return false;
      }
    }
    return true;
  }

  void clear() => _active.clear();
}

final class _Transition {
  _Transition(
    this.from,
    this.to,
    this.fromContent,
    this.toContent,
    this.fromVariants,
    this.duration,
  );
  final Rect from, to;
  final Rect? fromContent, toContent;
  // Only a retarget of a transition between different placement frames needs
  // to keep an explicit starting rectangle for each flip combination.
  final List<Rect>? fromVariants;
  final int duration;
  int? start;

  bool get uniformPlacement => fromVariants == null && fromContent == toContent;

  Rect at(int time, int axes) {
    final t = start == null
        ? 0.0
        : ((time - start!) / duration).clamp(0.0, 1.0);
    final progress = t < .5
        ? 4 * t * t * t
        : 1 - (-2 * t + 2) * (-2 * t + 2) * (-2 * t + 2) / 2;
    if (axes == 0) return progress == 0 ? from : Rect.lerp(from, to, progress)!;
    if (uniformPlacement) {
      final box = progress == 0 ? from : Rect.lerp(from, to, progress)!;
      return orientPlacement(box, toContent, axes);
    }
    final beginning =
        fromVariants?[axes - 1] ?? orientPlacement(from, fromContent, axes);
    return progress == 0
        ? beginning
        : Rect.lerp(beginning, orientPlacement(to, toContent, axes), progress)!;
  }
}
