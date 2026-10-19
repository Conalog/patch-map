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
    InputFilter? filter,
    InputHitGeometryProvider? exactGeometry,
    this.dragSlop = kTouchSlop,
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
  final void Function() onNeedFrame;
  final double dragSlop;
  final InputQuery query;
  late final SelectionState selection;
  PatchMapDragMode dragMode = PatchMapDragMode.pan;
  final _pointers = <int>{};
  _Gesture? _gesture;
  _PendingMove? _pendingMove;
  bool _disposed = false, _active = true;
  Object? lastCallbackError;
  int _epoch = 0;
  _Recognition? _recognition;

  /// Capture after raw down; pass to delayed recognizer callbacks.
  int get inputEpoch => _epoch;

  bool get isDragging => _gesture?.mode != null;
  bool get isDisposed => _disposed;
  PatchMapPosition position(Offset local, Offset global) => PatchMapPosition(
    world: camera.localToWorld(local),
    local: local,
    global: global,
  );

  void _emit(PatchMapInputEvent event) {
    if (_disposed) return;
    try {
      notify(event);
    } catch (error) {
      lastCallbackError = error;
    }
  }

  void _frame() {
    if (_disposed || !_active) return;
    try {
      onNeedFrame();
    } catch (error) {
      lastCallbackError = error;
    }
  }

  void pointerDown(
    int pointer,
    Offset local,
    Offset global, {
    int buttons = 1,
  }) {
    if (_disposed || !_active) return;
    if (buttons != 1) {
      final epoch = _cancel(PatchMapEndReason.cancelled);
      if (_disposed || !_active || _epoch != epoch) return;
      final p = position(local, global), snapshot = currentGeometry();
      final target = snapshot == null
          ? null
          : query.point(snapshot, p.world, camera.rotation);
      _recognition = _Recognition(_epoch, p, target);
      _emit(
        PatchMapInputEvent(
          kind: PatchMapInputKind.down,
          pointer: pointer,
          position: p,
          target: target,
        ),
      );
      return;
    }
    _pointers.add(pointer);
    if (_pointers.length > 1) {
      cancel(PatchMapEndReason.multitouch);
      return;
    }
    final epoch = _cancel(PatchMapEndReason.cancelled);
    if (_disposed || !_active || _epoch != epoch) return;
    final p = position(local, global);
    _gesture = _Gesture(pointer, p);
    final snapshot = currentGeometry();
    final target = snapshot == null
        ? null
        : query.point(snapshot, p.world, camera.rotation);
    _recognition = _Recognition(_epoch, p, target);
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
    final p = position(local, global), snapshot = currentGeometry();
    if (gesture.mode == null &&
        (local - gesture.start.local).distance > dragSlop) {
      gesture.mode = dragMode;
      _epoch++;
      _recognition = null;
      _emit(_event(gesture, PatchMapInputKind.dragStart, p));
      // A callback can dispose/reset this coordinator. Do not resurrect work.
      if (!identical(_gesture, gesture) || _disposed) return;
    }
    _interpret(gesture, p, snapshot);
    if (gesture.mode != null) {
      final needFrame = _pendingMove == null;
      _pendingMove = _PendingMove(gesture, p);
      if (needFrame) _frame();
    }
  }

  bool _interpret(
    _Gesture gesture,
    PatchMapPosition p,
    GeometrySnapshot? snapshot,
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
                camera.rotation,
              );
      case PatchMapDragMode.paint:
        if (snapshot != null) {
          for (final value in query.segment(
            snapshot,
            gesture.last.world,
            p.world,
            camera.rotation,
          )) {
            gesture.painted.putIfAbsent(value.id, () => value);
          }
        }
      case null:
        // Keep the first raw segment for paint recognition, even below slop.
        if (snapshot != null && dragMode == PatchMapDragMode.paint) {
          for (final value in query.segment(
            snapshot,
            gesture.last.world,
            p.world,
            camera.rotation,
          )) {
            gesture.painted.putIfAbsent(value.id, () => value);
          }
        }
    }
    gesture.last = p;
    return cameraChanged;
  }

  void pointerUp(int pointer, Offset local, Offset global) {
    if (_disposed) return;
    final gesture = _gesture;
    _pointers.remove(pointer);
    if (gesture == null || gesture.pointer != pointer) return;
    final p = position(local, global), snapshot = currentGeometry();
    final cameraChanged = _interpret(gesture, p, snapshot);
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
      _recognition = _Recognition(_epoch, p, target);
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
  /// Recognition uses the epoch's captured raw position/target; the supplied
  /// recognizer coordinates never re-hit a later camera or publication.
  void recognizedTap(Offset local, Offset global, {int? epoch}) =>
      _recognized(PatchMapInputKind.tap, local, global, epoch);
  void recognizedDoubleTap(Offset local, Offset global, {int? epoch}) =>
      _recognized(PatchMapInputKind.doubleTap, local, global, epoch);
  void recognizedSecondaryTap(Offset local, Offset global, {int? epoch}) =>
      _recognized(PatchMapInputKind.secondaryTap, local, global, epoch);
  void recognizedLongPress(Offset local, Offset global, {int? epoch}) =>
      _recognized(PatchMapInputKind.longPress, local, global, epoch);
  void _recognized(
    PatchMapInputKind kind,
    Offset local,
    Offset global,
    int? epoch,
  ) {
    if (_disposed ||
        !_active ||
        _pointers.length > 1 ||
        isDragging ||
        (epoch != null && epoch != _epoch)) {
      return;
    }
    final sample = _recognition;
    if (sample == null || sample.epoch != _epoch) return;
    _emit(
      PatchMapInputEvent(
        kind: kind,
        position: sample.position,
        target: sample.target,
      ),
    );
  }

  /// Absolute scale/rotation supplied by the host recognizer's gesture baseline.
  /// Single-pointer scale callbacks cannot compete with raw pan/range/paint.
  void cameraGesture({
    required int pointerCount,
    required Offset localAnchor,
    required double scale,
    required double rotation,
  }) {
    if (_disposed || !_active || pointerCount < 2) return;
    final epoch = _cancel(PatchMapEndReason.multitouch);
    if (_disposed || !_active || _epoch != epoch) return;
    if (camera.transformAround(localAnchor, scale: scale, rotation: rotation)) {
      _frame();
    }
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
  _Gesture(this.pointer, this.start) : last = start;
  final int pointer;
  final PatchMapPosition start;
  PatchMapPosition last;
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
  const _Recognition(this.epoch, this.position, this.target);
  final int epoch;
  final PatchMapPosition position;
  final PatchMapObject? target;
}
