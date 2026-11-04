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
    Duration Function()? animationClock,
  }) : _scheduler = scheduler ?? SchedulerBinding.instance,
       _animationClock = animationClock ?? _elapsedClock();

  /// Advance displayed transitions. Return true only while more frames are
  /// needed. Time is sampled when the callback actually runs. A queued vsync
  /// may predate synchronous input preparation by more than a whole transition.
  final bool Function(Duration timestamp) onFrame;
  final void Function(PaintSubmission submission) onSubmitted;
  final void Function(Object error, StackTrace stack) onError;
  final SchedulerBinding _scheduler;
  final Duration Function() _animationClock;
  bool _active = true, _closed = false, _dirty = false;
  bool _notificationPending = false, _inFrame = false;
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

  /// Deliver coalesced input without invalidating unchanged drawing commands.
  void requestNotification() {
    if (_closed) return;
    _notificationPending = true;
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
    if (!active ||
        _inFrame ||
        _scheduled != null ||
        (!_dirty && !_notificationPending)) {
      return;
    }
    _scheduled = _scheduler.scheduleFrameCallback(_beginFrame);
  }

  void _beginFrame(Duration timestamp) {
    _scheduled = null;
    if (!active) return;
    final paintNeeded = _dirty;
    _dirty = false;
    _notificationPending = false;
    _inFrame = true;
    try {
      final animate = onFrame(_animationClock());
      if (!active) return;
      // A host callback can invalidate selection, camera or publication. Fold
      // that work into this frame, but retain any newly queued notification.
      final paint = paintNeeded || _dirty || animate;
      _dirty = false;
      if (paint) notifyListeners();
      // Carry paint demand through the final animation tick, even when that
      // tick reports no further animation frames.
      if (animate) _dirty = true;
    } catch (error, stack) {
      _dirty = false;
      onError(error, stack);
    } finally {
      _inFrame = false;
      _schedule();
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

Duration Function() _elapsedClock() {
  // A monotonic clock only: it schedules no timer or independent frame loop.
  final clock = Stopwatch()..start();
  return () => clock.elapsed;
}
