import 'package:flutter/gestures.dart';
import 'package:flutter/widgets.dart';

import 'map_double_tap_recognizer.dart';

/// Bridges raw input admission to the two recognizers that share ownership
/// of a double-tap drag. Raw moves still go through the input coordinator.
final class MapGestureArena {
  MapDoubleTapRecognizer? _doubleTap;
  _MapScaleGestureRecognizer? _scale;

  int? firstTapFor(int pointer) => _doubleTap?.firstTapFor(pointer);
  void resetDoubleTap() => _doubleTap?.reset();
  void trackZoomCandidate(int? pointer) => _scale?.trackCandidate(pointer);
  bool claimZoom(int pointer) => _scale?.claim(pointer) ?? false;
}

/// The surface's existing recognizer arena, with a configurable hold duration.
/// Raw pointer admission, hit testing and host actions stay with the map view.
class MapGestureDetector extends StatelessWidget {
  const MapGestureDetector({
    super.key,
    required this.arena,
    required this.canStart,
    required this.longPressDuration,
    required this.onTap,
    required this.onDoubleTap,
    required this.onSecondaryTap,
    required this.onLongPress,
    required this.onScaleStart,
    required this.onScaleUpdate,
    required this.child,
  });

  final MapGestureArena arena;
  final bool Function() canStart;
  final Duration longPressDuration;
  final VoidCallback onTap, onSecondaryTap, onLongPress;
  final void Function(int pointer) onDoubleTap;
  final GestureScaleStartCallback onScaleStart;
  final GestureScaleUpdateCallback onScaleUpdate;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final settings = MediaQuery.maybeGestureSettingsOf(context);
    return RawGestureDetector(
      semantics: _MapGestureSemantics(onTap, onLongPress),
      behavior: HitTestBehavior.opaque,
      gestures: {
        TapGestureRecognizer:
            GestureRecognizerFactoryWithHandlers<TapGestureRecognizer>(
              () => TapGestureRecognizer(debugOwner: this),
              (recognizer) => recognizer
                ..gestureSettings = settings
                ..onTap = onTap
                ..onSecondaryTap = onSecondaryTap,
            ),
        MapDoubleTapRecognizer:
            GestureRecognizerFactoryWithHandlers<MapDoubleTapRecognizer>(
              () => arena._doubleTap = MapDoubleTapRecognizer(debugOwner: this),
              (recognizer) => recognizer
                ..gestureSettings = settings
                ..canStart = canStart
                ..onDoubleTap = onDoubleTap,
            ),
        _MapLongPressGestureRecognizer:
            GestureRecognizerFactoryWithHandlers<
              _MapLongPressGestureRecognizer
            >(
              () => _MapLongPressGestureRecognizer(
                duration: longPressDuration,
                debugOwner: this,
              ),
              (recognizer) => recognizer
                ..duration = longPressDuration
                ..gestureSettings = settings
                ..onLongPress = onLongPress,
            ),
        _MapScaleGestureRecognizer:
            GestureRecognizerFactoryWithHandlers<_MapScaleGestureRecognizer>(
              () => arena._scale = _MapScaleGestureRecognizer(debugOwner: this),
              (recognizer) => recognizer
                ..gestureSettings = settings
                ..onStart = onScaleStart
                ..onUpdate = onScaleUpdate,
            ),
      },
      child: child,
    );
  }
}

/// Let scale win the second tap's arena and keep its route for a later pinch.
/// A separate winner would cause Flutter to drop the held finger from scale.
class _MapScaleGestureRecognizer extends ScaleGestureRecognizer {
  _MapScaleGestureRecognizer({super.debugOwner});

  int? _candidate;
  bool _won = false;

  void trackCandidate(int? pointer) {
    _candidate = pointer;
    _won = false;
  }

  bool claim(int pointer) {
    if (_candidate != pointer) return false;
    if (!_won) resolvePointer(pointer, GestureDisposition.accepted);
    return _won;
  }

  @override
  void acceptGesture(int pointer) {
    if (pointer == _candidate) _won = true;
    super.acceptGesture(pointer);
  }

  @override
  void rejectGesture(int pointer) {
    if (pointer == _candidate) trackCandidate(null);
    super.rejectGesture(pointer);
  }
}

/// RawGestureDetector's default delegate looks up exact recognizer types.
/// Preserve the surface's two existing actions with our custom hold type.
class _MapGestureSemantics extends SemanticsGestureDelegate {
  _MapGestureSemantics(this.onTap, this.onLongPress);

  final VoidCallback onTap, onLongPress;

  @override
  void assignSemantics(RenderSemanticsGestureHandler renderObject) {
    renderObject
      ..onTap = onTap
      ..onLongPress = onLongPress;
  }
}

class _MapLongPressGestureRecognizer extends LongPressGestureRecognizer {
  _MapLongPressGestureRecognizer({required this.duration, super.debugOwner});

  Duration duration;
  // Flutter's `possible` state also includes an already recognized hold.
  bool _holdRecognized = false;

  @override
  void handleEvent(PointerEvent event) {
    if (event is PointerDownEvent &&
        event.pointer != primaryPointer &&
        !_holdRecognized) {
      // Reject the hold in the arena, not just its callback, so a slow pinch
      // can still start after the hold deadline. Keep tracking until all up.
      resolve(GestureDisposition.rejected);
    }
    super.handleEvent(event);
  }

  @override
  void didExceedDeadline() {
    _holdRecognized = true;
    super.didExceedDeadline();
  }

  @override
  void didStopTrackingLastPointer(int pointer) {
    _holdRecognized = false;
    super.didStopTrackingLastPointer(pointer);
  }

  // Flutter captures this value when it starts the primary pointer's timer.
  // Updating it keeps the current arena/timer intact and configures the next
  // press; Flutter still owns slop, rejection, cancellation and disposal.
  @override
  Duration get deadline => duration;
}
