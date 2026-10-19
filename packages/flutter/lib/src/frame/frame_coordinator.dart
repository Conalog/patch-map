import 'package:flutter/foundation.dart';
import 'package:flutter/scheduler.dart';

/// A witness emitted by an actual painter, not by scheduling a frame.
final class PaintSubmission {
  const PaintSubmission(this.generation, this.revision);
  final int generation, revision;
}

/// The widget's single owner for invalidation and animation scheduling.
///
/// Session publication is deliberately outside this class. A paint witness is
/// acknowledged after that frame's rendering pipeline has submitted its scene;
/// it is neither a raster/GPU fence nor an animation-completion notification.
final class FrameCoordinator extends ChangeNotifier {
  FrameCoordinator({
    required this.onFrame,
    required this.onSubmitted,
    required this.onError,
    SchedulerBinding? scheduler,
  }) : _scheduler = scheduler ?? SchedulerBinding.instance;

  /// Advance displayed transitions. Return true only while more frames are
  /// needed. The timestamp belongs to Flutter's animation time domain.
  final bool Function(Duration timestamp) onFrame;
  final void Function(PaintSubmission submission) onSubmitted;
  final void Function(Object error, StackTrace stack) onError;
  final SchedulerBinding _scheduler;
  bool _active = true, _closed = false, _dirty = false;
  int? _scheduled;
  PaintSubmission? _painted;
  bool _postFramePending = false;

  bool get active => _active && !_closed;
  bool get scheduled => _scheduled != null;

  void invalidate() {
    if (_closed) return;
    _dirty = true;
    _schedule();
  }

  void setActive(bool value) {
    if (_closed || value == _active) return;
    _active = value;
    if (!value) {
      final id = _scheduled;
      if (id != null) _scheduler.cancelFrameCallbackWithId(id);
      _scheduled = null;
      _painted = null;
    } else {
      // Repaint after resume even when a paused engine already painted the
      // revision: pending obligations require an active submitted witness.
      invalidate();
    }
  }

  void _schedule() {
    if (!active || _scheduled != null || !_dirty) return;
    _scheduled = _scheduler.scheduleFrameCallback(_beginFrame);
  }

  void _beginFrame(Duration timestamp) {
    _scheduled = null;
    if (!active) return;
    _dirty = false;
    try {
      final animate = onFrame(timestamp);
      if (!active) return;
      notifyListeners();
      if (animate) _dirty = true;
      _schedule();
    } catch (error, stack) {
      _dirty = false;
      onError(error, stack);
    }
  }

  /// Called only after this publication's drawing commands were recorded.
  /// A painter that fails partway through must report failure instead.
  void didPaint(int generation, int revision) {
    if (!active) return;
    _painted = PaintSubmission(generation, revision);
    if (_postFramePending) return;
    _postFramePending = true;
    _scheduler.addPostFrameCallback((_) {
      _postFramePending = false;
      final submitted = _painted;
      _painted = null;
      if (!active || submitted == null) return;
      onSubmitted(submitted);
    });
  }

  @override
  void dispose() {
    if (_closed) return;
    _closed = true;
    final id = _scheduled;
    if (id != null) _scheduler.cancelFrameCallbackWithId(id);
    _scheduled = null;
    _painted = null;
    super.dispose();
  }
}
