part of 'controller.dart';

class PatchMapBrushState {
  const PatchMapBrushState({required this.enabled, required this.drawing});
  final bool enabled, drawing;
  JsonMap toJson() => {'enabled': enabled, 'drawing': drawing};
}

class PatchMapBrushChange {
  const PatchMapBrushChange(this.state, this.source);
  final PatchMapBrushState state;
  final String source;
}

/// Instance-owned mode, shared by service controls and native gestures.
class PatchMapBrushApi {
  PatchMapBrushApi._(this._c);
  final PatchMapController _c;
  PatchMapBrushState _state = const PatchMapBrushState(
    enabled: false,
    drawing: false,
  );
  PatchMapBrushState get state => _state;
  final _listeners = <void Function(PatchMapBrushChange)>{};
  // Installed by the one attached native input binding, released with it.
  void Function(bool restore)? cancelGesture;
  PatchMapBrushState enable() => _set(true);
  PatchMapBrushState disable() => _set(false);
  PatchMapBrushState toggle() => _set(!_state.enabled);
  PatchMapBrushState _set(bool enabled) {
    _c._assertLive();
    cancelGesture?.call(false);
    _c._assertLive();
    publishGestureState(enabled, false, 'api');
    return _state;
  }

  PatchMapDisposer onChange(void Function(PatchMapBrushChange) listener) {
    _c._assertLive();
    _listeners.add(listener);
    return () => _listeners.remove(listener);
  }

  /// Native input binding only; selection remains with PatchMapSelectionApi.
  void publishGestureState(bool enabled, bool drawing, String source) {
    if (_c.destroyed ||
        (_state.enabled == enabled && _state.drawing == drawing))
      return;
    _state = PatchMapBrushState(enabled: enabled, drawing: drawing);
    final event = PatchMapBrushChange(_state, source);
    for (final listener in List.of(_listeners)) {
      if (!identical(_state, event.state)) break;
      if (_listeners.contains(listener)) _c._call(() => listener(event));
    }
  }

  void _dispose() {
    cancelGesture?.call(false);
    cancelGesture = null;
    _listeners.clear();
    _state = const PatchMapBrushState(enabled: false, drawing: false);
  }
}
