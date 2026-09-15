import 'dart:math' as math;
import 'package:flutter/gestures.dart';

/// Enters Flutter's gesture arena while retaining PatchMap's 4px threshold.
class NativeMapGestureRecognizer extends OneSequenceGestureRecognizer {
  void Function(PointerEvent)? onEvent;
  final _starts = <int, Offset>{};
  final _last = <int, PointerEvent>{};
  @override
  String get debugDescription => 'patch-map';
  @override
  void addAllowedPointer(PointerDownEvent event) {
    _starts[event.pointer] = event.localPosition;
    _last[event.pointer] = event;
    startTrackingPointer(event.pointer, event.transform);
    onEvent?.call(event);
    if (_starts.length > 1) acceptAll();
  }

  void acceptAll() => resolve(GestureDisposition.accepted);
  @override
  void handleEvent(PointerEvent event) {
    final start = _starts[event.pointer];
    if (start == null) return;
    _last[event.pointer] = event;
    if (event is PointerMoveEvent) {
      final d = event.localPosition - start;
      if (math.max(d.dx.abs(), d.dy.abs()) > 4) acceptAll();
      if (_starts.containsKey(event.pointer)) onEvent?.call(event);
    } else if (event is PointerUpEvent) {
      acceptAll();
      if (_starts.containsKey(event.pointer)) onEvent?.call(event);
      _stop(event.pointer);
    } else if (event is PointerCancelEvent) {
      onEvent?.call(event);
      _stop(event.pointer);
    }
  }

  void _stop(int pointer) {
    _starts.remove(pointer);
    _last.remove(pointer);
    stopTrackingPointer(pointer);
  }

  @override
  void acceptGesture(int pointer) {}
  @override
  void rejectGesture(int pointer) {
    final event = _last[pointer];
    if (event == null) return;
    onEvent?.call(
      PointerCancelEvent(
        pointer: pointer,
        kind: event.kind,
        position: event.position,
      ).transformed(event.transform),
    );
    _stop(pointer);
  }

  @override
  void didStopTrackingLastPointer(int pointer) {
    resolve(GestureDisposition.rejected);
  }

  void cancelAll() {
    for (final pointer in _starts.keys.toList()) {
      rejectGesture(pointer);
    }
  }

  @override
  void dispose() {
    cancelAll();
    onEvent = null;
    super.dispose();
  }
}
