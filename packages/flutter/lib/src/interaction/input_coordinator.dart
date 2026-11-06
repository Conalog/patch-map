import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter/gestures.dart' show kTouchSlop;

import '../api/events.dart';
import '../geometry/affine.dart';
import '../geometry/geometry_snapshot.dart';
import '../viewport/camera.dart';
import 'input_query.dart';
import 'selection_state.dart';

/// Feed Listener raw down/move/up/cancel exactly once. Flutter tap/double-tap/
/// long-press recognizers own timing and classification and call recognized*;
/// do not attach a second pan recognizer or independently mutate the camera.
/// ScaleGestureRecognizer may call cameraGesture only at pointerCount >= 2.
/// This coordinator owns no timer, ticker, listener or independent frame loop.
final class InputCoordinator {
  InputCoordinator({
    required this.currentGeometry,
    required this.camera,
    required SpatialCandidates getSpatialCandidates,
    required this.notify,
    required this.onNeedFrame,
    required this.onNeedNotification,
    InputFilter? filter,
    InputHitGeometryProvider? exactGeometry,
    this.dragSlop = kTouchSlop,
    this.claimDoubleTapZoom,
  }) : query = InputQuery(
         ports: InputQueryPorts(
           getSpatialCandidates: getSpatialCandidates,
           exactGeometry: exactGeometry,
         ),
         filter: filter,
       ) {
    if (!dragSlop.isFinite || dragSlop < 0) throw ArgumentError.value(dragSlop);
    selection = SelectionState(
      currentGeometry: currentGeometry,
      query: query,
      notify: (event) {
        _frame();
        _emit(event);
      },
    );
  }
  final GeometrySnapshot? Function() currentGeometry;
  final MapCamera camera;
  final void Function(PatchMapInputEvent event) notify;
  final void Function() onNeedFrame, onNeedNotification;
  final double dragSlop;
  final bool Function(int pointer)? claimDoubleTapZoom;
  final InputQuery query;
  late final SelectionState selection;
  PatchMapDragMode dragMode = PatchMapDragMode.pan;
  bool _doubleTapZoomEnabled = false;
  final _pointers = <int>{};
  _Gesture? _gesture;
  _PendingMove? _pendingMove;
  bool _disposed = false, _active = true;
  int _epoch = 0;
  _Recognition? _recognition;

  /// Capture after raw down; pass to delayed recognizer callbacks.
  int get inputEpoch => _epoch;

  bool get isDragging => _gesture?.mode != null;
  bool get isDoubleTapZooming => _gesture?.zoomY != null;
  bool get _canZoom =>
      _doubleTapZoomEnabled && dragMode == PatchMapDragMode.pan;
  int? get zoomCandidatePointer =>
      _gesture?.zoomCandidate == true ? _gesture!.pointer : null;

  void configureDoubleTapZoom(bool enabled) {
    _doubleTapZoomEnabled = enabled;
    if (!_canZoom) endDoubleTapZoom();
  }

  void endDoubleTapZoom() {
    if (isDoubleTapZooming) _gesture = null;
    _gesture?.zoomCandidate = false;
  }

  PatchMapPosition position(Offset local, Offset global) => PatchMapPosition(
    world: camera.localToWorld(local),
    local: local,
    global: global,
  );

  void _emit(PatchMapInputEvent event) {
    if (_disposed) return;
    try {
      notify(event);
    } catch (_) {
      // Host failures do not interrupt input cleanup or frame scheduling.
    }
  }

  void _frame({bool paint = true}) {
    if (_disposed || !_active) return;
    try {
      (paint ? onNeedFrame : onNeedNotification)();
    } catch (_) {
      // Host failures do not interrupt input cleanup or frame scheduling.
    }
  }

  void pointerDown(
    int pointer,
    Offset local,
    Offset global, {
    int buttons = 1,
    bool touch = false,
    int? firstTap,
  }) {
    if (_disposed || !_active) return;
    if (buttons == 1) {
      _pointers.add(pointer);
      if (_pointers.length > 1) {
        cancel(PatchMapEndReason.multitouch);
        return;
      }
    }
    final previous = _recognition;
    final zoomCandidate =
        _canZoom &&
        touch &&
        firstTap != null &&
        previous?.pointer == firstTap &&
        previous!.zoomTap &&
        (local - previous.tapStart).distance <= dragSlop;
    final epoch = _cancel(PatchMapEndReason.cancelled);
    if (_disposed || !_active || _epoch != epoch) return;
    final p = position(local, global);
    if (buttons == 1) {
      _gesture = _Gesture(pointer, p, touch)..zoomCandidate = zoomCandidate;
    }
    final snapshot = currentGeometry();
    final target = snapshot == null
        ? null
        : query.point(snapshot, p.world, camera.rotation);
    _recognition = _Recognition(_epoch, pointer, p, target, local);
    _emit(
      PatchMapInputEvent(
        kind: PatchMapInputKind.down,
        pointer: pointer,
        position: p,
        target: target,
      ),
    );
  }

  void pointerMove(int pointer, Offset local, Offset global) {
    if (_disposed || !_active || _pointers.length != 1) return;
    final gesture = _gesture;
    if (gesture == null || gesture.pointer != pointer) return;
    final zoomY = gesture.zoomY;
    if (zoomY != null) {
      _zoom(gesture, local.dy, zoomY);
      return;
    }
    final p = position(local, global), snapshot = currentGeometry();
    // Result callbacks may change the camera; this sample's world position and
    // upright hit geometry must still use the same captured camera.
    final rotation = camera.rotation;
    final displacement = gesture.mode == null
        ? local - gesture.start.local
        : null;
    if (displacement != null && displacement.distance > dragSlop) {
      _epoch++;
      _recognition = null;
      if (gesture.zoomCandidate &&
          _canZoom &&
          displacement.dy.abs() >= 1.5 * displacement.dx.abs() &&
          claimDoubleTapZoom?.call(pointer) == true) {
        if (identical(_gesture, gesture)) gesture.zoomY = local.dy;
        return;
      }
      if (!identical(_gesture, gesture)) return;
      gesture.mode = dragMode;
      _emit(_event(gesture, PatchMapInputKind.dragStart, p));
      // A callback can dispose/reset this coordinator. Do not resurrect work.
      if (!identical(_gesture, gesture) || _disposed) return;
    }
    final cameraChanged = _interpret(gesture, p, snapshot, rotation);
    if (gesture.mode != null) {
      final needFrame = _pendingMove == null;
      _pendingMove = _PendingMove(gesture, p);
      if (cameraChanged) {
        _frame();
      } else if (needFrame) {
        _frame(paint: false);
      }
    }
  }

  void _zoom(_Gesture gesture, double y, double previousY) {
    if (!y.isFinite || y == previousY) return;
    gesture.zoomY = y;
    final scale = camera.scale * math.pow(2, (y - previousY) / 160);
    if (!scale.isFinite || scale <= 0) return;
    try {
      if (camera.zoomAtCenter(scale)) _frame();
    } on ArgumentError {
      // An extreme sample can be finite but outside the transform's range.
    }
  }

  bool _interpret(
    _Gesture gesture,
    PatchMapPosition p,
    GeometrySnapshot? snapshot,
    double rotation,
  ) {
    var cameraChanged = false;
    switch (gesture.mode) {
      case PatchMapDragMode.pan:
        cameraChanged = camera.pan(p.local - gesture.last.local);
      case PatchMapDragMode.range:
        gesture.range = Rect.fromPoints(gesture.start.world, p.world);
        gesture.objects = snapshot == null
            ? const []
            : query.range(
                snapshot,
                Affine.identity.projectRect(gesture.range!),
                rotation,
              );
      case PatchMapDragMode.paint:
      case null when dragMode == PatchMapDragMode.paint:
        // Include the first raw segment even before paint crosses drag slop.
        if (snapshot != null) {
          for (final value in query.segment(
            snapshot,
            gesture.last.world,
            p.world,
            rotation,
          )) {
            gesture.painted.putIfAbsent(value.id, () => value);
          }
        }
      case null:
        break;
    }
    gesture.last = p;
    return cameraChanged;
  }

  void pointerUp(int pointer, Offset local, Offset global) {
    if (_disposed) return;
    final gesture = _gesture;
    _pointers.remove(pointer);
    if (gesture == null || gesture.pointer != pointer) return;
    if (gesture.zoomY != null) {
      _gesture = null;
      return;
    }
    final p = position(local, global), snapshot = currentGeometry();
    final cameraChanged = _interpret(gesture, p, snapshot, camera.rotation);
    _gesture = null;
    _pendingMove = null;
    if (cameraChanged) _frame();
    if (gesture.mode != null) {
      _emit(
        _event(
          gesture,
          PatchMapInputKind.dragEnd,
          p,
          PatchMapEndReason.completed,
        ),
      );
    } else {
      final target = snapshot == null
          ? null
          : query.point(snapshot, p.world, camera.rotation);
      _recognition = _Recognition(
        _epoch,
        pointer,
        p,
        target,
        gesture.start.local,
        zoomTap:
            gesture.touch &&
            !gesture.holdRecognized &&
            (local - gesture.start.local).distance <= dragSlop,
      );
      _emit(
        PatchMapInputEvent(
          kind: PatchMapInputKind.up,
          pointer: pointer,
          position: p,
          target: target,
        ),
      );
    }
  }

  void pointerCancel(int pointer) {
    _pointers.remove(pointer);
    if (_gesture?.pointer == pointer) cancel(PatchMapEndReason.cancelled);
  }

  void hover(int pointer, Offset local, Offset global) {
    if (_disposed || !_active || _pointers.isNotEmpty) return;
    final p = position(local, global), snapshot = currentGeometry();
    _emit(
      PatchMapInputEvent(
        kind: PatchMapInputKind.hover,
        pointer: pointer,
        position: p,
        target: snapshot == null
            ? null
            : query.point(snapshot, p.world, camera.rotation),
      ),
    );
  }

  void leave(int pointer, Offset local, Offset global) {
    if (!_disposed) {
      _emit(
        PatchMapInputEvent(
          kind: PatchMapInputKind.leave,
          pointer: pointer,
          position: position(local, global),
        ),
      );
    }
  }

  /// Recognizers must not send onTapDown as a classified tap. Use onTap only;
  /// Flutter's double-tap arena then suppresses the corresponding single taps.
  /// Recognition uses the epoch's captured raw position/target, never a later
  /// camera or publication.
  void recognizedTap({int? epoch}) => _recognized(PatchMapInputKind.tap, epoch);
  void recognizedDoubleTap({int? epoch, int? pointer}) {
    if (pointer == null || pointer == _recognition?.pointer) {
      _recognized(PatchMapInputKind.doubleTap, epoch);
    }
  }

  void recognizedSecondaryTap({int? epoch}) =>
      _recognized(PatchMapInputKind.secondaryTap, epoch);
  void recognizedLongPress({int? epoch}) =>
      _recognized(PatchMapInputKind.longPress, epoch);
  void _recognized(PatchMapInputKind kind, int? epoch) {
    if (_disposed ||
        !_active ||
        _pointers.length > 1 ||
        isDragging ||
        (epoch != null && epoch != _epoch)) {
      return;
    }
    final sample = _recognition;
    if (sample == null || sample.epoch != _epoch) return;
    final gesture = _gesture;
    if (kind == PatchMapInputKind.longPress && gesture != null) {
      gesture
        ..zoomCandidate = false
        ..holdRecognized = true;
    }
    _emit(
      PatchMapInputEvent(
        kind: kind,
        position: sample.position,
        target: sample.target,
      ),
    );
  }

  /// Applies absolute scale and any new rotation. Returns the applied angle
  /// only when this gesture changed it.
  /// Single-pointer scale callbacks cannot compete with raw pan/range/paint.
  double? cameraGesture({
    required int pointerCount,
    required Offset localAnchor,
    required double scale,
    required double? rotation,
  }) {
    if (_disposed || !_active || pointerCount < 2) return null;
    final epoch = _cancel(PatchMapEndReason.multitouch);
    if (_disposed || !_active || _epoch != epoch) return null;
    final previousRotation = camera.rotation;
    if (!camera.transformAround(
      localAnchor,
      scale: scale,
      rotation: rotation,
    )) {
      return null;
    }
    final appliedRotation = camera.rotation;
    _frame();
    return appliedRotation == previousRotation ? null : appliedRotation;
  }

  void wheel({required Offset localAnchor, required double scaleFactor}) {
    if (_disposed || !_active) return;
    if (!scaleFactor.isFinite || scaleFactor <= 0) {
      throw ArgumentError.value(scaleFactor);
    }
    final epoch = _cancel(PatchMapEndReason.cancelled);
    if (_disposed || !_active || _epoch != epoch) return;
    if (camera.transformAround(
      localAnchor,
      scale: camera.scale * scaleFactor,
    )) {
      _frame();
    }
  }

  /// The frame owner invokes once; this never re-hits a later publication.
  void onFrame() {
    final pending = _pendingMove;
    _pendingMove = null;
    if (!_disposed && _active && pending != null) {
      _emit(
        _event(pending.gesture, PatchMapInputKind.dragMove, pending.position),
      );
    }
  }

  void cancel(PatchMapEndReason reason) {
    _cancel(reason);
  }

  int _cancel(PatchMapEndReason reason) {
    final cancellationEpoch = ++_epoch;
    _recognition = null;
    final gesture = _gesture;
    _gesture = null;
    _pendingMove = null;
    if (gesture?.mode != null) {
      _emit(_event(gesture!, PatchMapInputKind.dragEnd, gesture.last, reason));
    }
    return cancellationEpoch;
  }

  void reset() {
    cancel(PatchMapEndReason.replaced);
    _pointers.clear();
    query.reset();
    selection.reset();
  }

  void setActive(bool active) {
    if (_disposed || _active == active) return;
    _active = active;
    if (!active) {
      cancel(PatchMapEndReason.inactive);
      _pointers.clear();
    }
  }

  void dispose() {
    if (_disposed) return;
    _disposed = true;
    _recognition = null;
    _gesture = null;
    _pendingMove = null;
    _pointers.clear();
    query.reset();
    selection.dispose();
  }

  PatchMapInputEvent _event(
    _Gesture gesture,
    PatchMapInputKind kind,
    PatchMapPosition p, [
    PatchMapEndReason? reason,
  ]) => PatchMapInputEvent(
    kind: kind,
    pointer: gesture.pointer,
    position: p,
    mode: gesture.mode,
    reason: reason,
    range: gesture.range,
    objects: gesture.mode == PatchMapDragMode.paint
        ? gesture.painted.values
        : gesture.objects,
  );
}

final class _Gesture {
  _Gesture(this.pointer, this.start, this.touch) : last = start;
  final int pointer;
  final PatchMapPosition start;
  final bool touch;
  PatchMapPosition last;
  bool zoomCandidate = false, holdRecognized = false;
  double? zoomY;
  PatchMapDragMode? mode;
  Rect? range;
  List<PatchMapObject> objects = const [];
  final painted = <String, PatchMapObject>{};
}

final class _PendingMove {
  const _PendingMove(this.gesture, this.position);
  final _Gesture gesture;
  final PatchMapPosition position;
}

final class _Recognition {
  const _Recognition(
    this.epoch,
    this.pointer,
    this.position,
    this.target,
    this.tapStart, {
    this.zoomTap = false,
  });
  final int epoch, pointer;
  final PatchMapPosition position;
  final PatchMapObject? target;
  final Offset tapStart;
  final bool zoomTap;
}
