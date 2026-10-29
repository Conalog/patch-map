import 'package:flutter/gestures.dart';
import 'package:flutter/widgets.dart';

/// The surface's existing recognizer arena, with a configurable hold duration.
/// Raw pointer admission, hit testing and host actions stay with the map view.
class MapGestureDetector extends StatelessWidget {
  const MapGestureDetector({
    super.key,
    required this.longPressDuration,
    required this.onTap,
    required this.onDoubleTap,
    required this.onSecondaryTap,
    required this.onLongPress,
    required this.onScaleStart,
    required this.onScaleUpdate,
    required this.child,
  });

  final Duration longPressDuration;
  final VoidCallback onTap, onDoubleTap, onSecondaryTap, onLongPress;
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
        DoubleTapGestureRecognizer:
            GestureRecognizerFactoryWithHandlers<DoubleTapGestureRecognizer>(
              () => DoubleTapGestureRecognizer(debugOwner: this),
              (recognizer) => recognizer
                ..gestureSettings = settings
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
        ScaleGestureRecognizer:
            GestureRecognizerFactoryWithHandlers<ScaleGestureRecognizer>(
              () => ScaleGestureRecognizer(debugOwner: this),
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

  // Flutter captures this value when it starts the primary pointer's timer.
  // Updating it keeps the current arena/timer intact and configures the next
  // press; Flutter still owns slop, rejection, cancellation and disposal.
  @override
  Duration get deadline => duration;
}
