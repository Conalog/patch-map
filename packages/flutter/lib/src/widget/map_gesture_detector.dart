import 'package:flutter/gestures.dart';
import 'package:flutter/widgets.dart';

import 'map_double_tap_recognizer.dart';

/// Bridges raw input admission to the recognizers involved in double-tap zoom.
/// Raw moves still go through the input coordinator.
final class MapGestureArena {
  MapDoubleTapRecognizer? _doubleTap;
  _MapScaleGestureRecognizer? _scale;

  int? firstTapFor(int pointer) => _doubleTap?.firstTapFor(pointer);
  void reset() {
    _doubleTap?.reset();
    _scale?.retireContacts();
  }

  void trackZoomCandidate(int? pointer) {
    _scale?.trackCandidate(pointer);
    if (pointer != null) _doubleTap?.markZoomCandidate(pointer);
  }

  bool isZoomCandidate(int pointer) =>
      _doubleTap?.isZoomCandidate(pointer) ?? false;
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
                isZoomCandidate: arena.isZoomCandidate,
                debugOwner: this,
              ),
              (recognizer) => recognizer
                ..duration = longPressDuration
                ..gestureSettings = settings
                ..onLongPress = onLongPress,
            ),
        _MapScaleGestureRecognizer:
            GestureRecognizerFactoryWithHandlers<_MapScaleGestureRecognizer>(
              () => arena._scale = _MapScaleGestureRecognizer(
                canStart: canStart,
                debugOwner: this,
              ),
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
  _MapScaleGestureRecognizer({required this.canStart, super.debugOwner});

  final bool Function() canStart;
  final _contacts = <int, bool>{};
  int? _candidate;
  bool _won = false;

  @override
  bool isPointerAllowed(PointerDownEvent event) =>
      canStart() && super.isPointerAllowed(event);

  @override
  bool isPointerPanZoomAllowed(PointerPanZoomStartEvent event) =>
      canStart() && super.isPointerPanZoomAllowed(event);

  @override
  void handleEvent(PointerEvent event) {
    if (event is PointerDownEvent || event is PointerPanZoomStartEvent) {
      _contacts[event.pointer] = event is PointerPanZoomStartEvent;
    }
    super.handleEvent(event);
  }

  @override
  void stopTrackingPointer(int pointer) {
    _contacts.remove(pointer);
    super.stopTrackingPointer(pointer);
  }

  void retireContacts() {
    trackCandidate(null);
    resolve(GestureDisposition.rejected);
    // Accepted pointers still have routes. End them in this recognizer so
    // Flutter clears its scale geometry without canceling other widgets.
    while (_contacts.isNotEmpty) {
      final pointer = _contacts.keys.first;
      final event = _contacts[pointer]!
          ? PointerPanZoomEndEvent(pointer: pointer)
          : PointerCancelEvent(pointer: pointer);
      super.handleEvent(event);
    }
  }

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
  _MapLongPressGestureRecognizer({
    required this.duration,
    required this.isZoomCandidate,
    super.debugOwner,
  });

  Duration duration;
  final bool Function(int pointer) isZoomCandidate;
  // Flutter's `possible` state also includes an already recognized hold.
  bool _holdRecognized = false;

  @override
  void handleEvent(PointerEvent event) {
    super.handleEvent(event);
    if (event is PointerDownEvent &&
        !_holdRecognized &&
        (event.pointer != primaryPointer || isZoomCandidate(event.pointer))) {
      // Flutter initializes the press on routed down before it can be rejected.
      // Keep tracking until all up while leaving zoom and pinch in the arena.
      resolve(GestureDisposition.rejected);
    }
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
