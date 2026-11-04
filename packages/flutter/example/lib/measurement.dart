import 'dart:async';
import 'dart:convert';
import 'dart:developer';
import 'dart:ui' show FramePhase, PlatformDispatcher;

import 'package:conalog_patch_map/conalog_patch_map.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';

/// Experiment host telemetry only. Frames are selected by engine frame numbers;
/// they remain whole-app timings, not package/GPU/display latency proofs.
final class Measurements {
  Measurements() {
    SchedulerBinding.instance.addTimingsCallback(_timings);
  }
  final _frames = <FrameTiming>[];
  final _timingWaiters = <_TimingWaiter>[];
  int _latestFrameNumber = 0;
  int _totalFrames = 0;
  bool _closed = false;
  int get totalFrames => _totalFrames;
  void _timings(List<FrameTiming> frames) {
    if (_closed) return;
    _totalFrames += frames.length;
    _frames.addAll(frames);
    if (_frames.length > 10000) _frames.removeRange(0, _frames.length - 10000);
    for (final frame in frames) {
      if (frame.frameNumber > _latestFrameNumber) {
        _latestFrameNumber = frame.frameNumber;
      }
    }
    for (final waiter in _timingWaiters) {
      if (_latestFrameNumber >= waiter.endFrame && !waiter.done.isCompleted) {
        waiter.done.complete(true);
      }
    }
  }

  /// The engine flushes its final timing batch without another frame. This wait
  /// never changes package completion and does not prove display presentation.
  Future<bool> _waitForTimings(
    int endFrame, {
    Duration timeout = const Duration(seconds: 10),
  }) async {
    if (_latestFrameNumber >= endFrame) return true;
    if (_closed) return false;
    final waiter = _TimingWaiter(endFrame);
    _timingWaiters.add(waiter);
    try {
      return await waiter.done.future.timeout(timeout, onTimeout: () => false);
    } finally {
      _timingWaiters.remove(waiter);
    }
  }

  /// Include frames submitted while an earlier raster is completing. A delayed
  /// animation tail must not enter the CPU window without its frame timing.
  Future<({int frame, bool complete})> _drainFrames(int startFrame) async {
    final deadline = Stopwatch()..start();
    final scheduler = SchedulerBinding.instance;
    var endFrame = PlatformDispatcher.instance.frameData.frameNumber;
    while (!_closed) {
      final remaining = const Duration(seconds: 10) - deadline.elapsed;
      if (remaining <= Duration.zero) break;
      if (endFrame > startFrame &&
          !await _waitForTimings(endFrame, timeout: remaining)) {
        break;
      }
      if (scheduler.hasScheduledFrame) {
        final remaining = const Duration(seconds: 10) - deadline.elapsed;
        if (remaining <= Duration.zero) break;
        try {
          // A frame is already scheduled; this does not request a host frame.
          await scheduler.endOfFrame.timeout(remaining);
        } on TimeoutException {
          break;
        }
      }
      final current = PlatformDispatcher.instance.frameData.frameNumber;
      if (current == endFrame && !scheduler.hasScheduledFrame) {
        return (frame: endFrame, complete: true);
      }
      endFrame = current;
    }
    return (frame: endFrame, complete: false);
  }

  Future<Measurement> request(
    String id,
    Future<PatchMapResult> Function() submit, {
    required Map<String, Object?> tags,
    bool emit = false,
    Future<void> Function()? activity,
  }) async {
    // Drain preceding raster work before starting the process CPU window. This
    // is an experiment host: an inactive/removed surface times out as incomplete.
    final previousFrame = PlatformDispatcher.instance.frameData.frameNumber;
    final startTimingsComplete = !emit || await _waitForTimings(previousFrame);
    final cpuBefore = emit ? await hostTelemetry('cpu') : null;
    final startFrame = PlatformDispatcher.instance.frameData.frameNumber;
    final activityDone = activity?.call();
    final timeline = TimelineTask()..start('patchmap/$id', arguments: tags);
    final watch = Stopwatch()..start();
    late PatchMapResult result;
    try {
      result = await submit();
    } finally {
      watch.stop();
      timeline.finish();
    }
    final responseMs = watch.elapsedMicroseconds / 1000;
    // Observe concurrent camera motion and the default 200ms bar tail. Select
    // by the engine clock, not when batched FrameTiming callbacks happen to arrive.
    await activityDone;
    await Future<void>.delayed(const Duration(milliseconds: 250));
    final drained = await _drainFrames(startFrame);
    final endFrame = drained.frame;
    final timingsComplete = startTimingsComplete && drained.complete;
    // Include raster execution for selected frames, even when it finishes after
    // the animation tail. The delayed callback's idle time adds no process CPU.
    final cpuAfter = emit ? await hostTelemetry('cpu') : null;
    final memory = emit ? await hostTelemetry('memory') : null;
    final captured = framesBetween(_frames, startFrame, endFrame);
    final count = captured.length;
    final measurement = Measurement(
      responseMs,
      captured,
      result,
      timingsComplete: timingsComplete,
    );
    if (emit) {
      logRecord({
        'event': 'sample',
        'id': id,
        ...tags,
        'responseMs': responseMs,
        'cpuBefore': cpuBefore,
        'cpuAfter': cpuAfter,
        'memoryAfter': memory,
        'frameCount': count,
        'timingsComplete': timingsComplete,
        'startTimingsComplete': startTimingsComplete,
        'cpuWindow': 'through-selected-raster-timings',
        'frameP95Ms': measurement.p95Ms,
        'outcome': result.outcome.name,
        'superseded': result.superseded,
        'failureCount': result.failures.length,
        'frameWindow': 'engine-frame-number-v2',
        'frameStartExclusive': startFrame,
        'frameEndInclusive': endFrame,
      });
      for (var i = 0; i < captured.length; i++) {
        final frame = captured[i];
        logRecord({
          'event': 'frame',
          'id': id,
          'index': i,
          'buildUs': frame.buildDuration.inMicroseconds,
          'rasterUs': frame.rasterDuration.inMicroseconds,
          'totalUs': frame.totalSpan.inMicroseconds,
          'vsyncUs': frame.timestampInMicroseconds(FramePhase.vsyncStart),
          'frameNumber': frame.frameNumber,
        });
      }
    }
    return measurement;
  }

  void close() {
    _closed = true;
    SchedulerBinding.instance.removeTimingsCallback(_timings);
    _frames.clear();
    for (final waiter in _timingWaiters) {
      if (!waiter.done.isCompleted) waiter.done.complete(false);
    }
  }
}

final class _TimingWaiter {
  _TimingWaiter(this.endFrame);
  final int endFrame;
  final done = Completer<bool>();
}

final class Measurement {
  const Measurement(
    this.responseMs,
    this.frames,
    this.result, {
    this.timingsComplete = true,
  });
  final double responseMs;
  final List<FrameTiming> frames;
  final PatchMapResult result;
  final bool timingsComplete;
  double get p95Ms =>
      percentile(frames.map((frame) => frame.totalSpan.inMicroseconds / 1000));
}

double percentile(Iterable<double> values) {
  final sorted = values.toList()..sort();
  return sorted.isEmpty
      ? 0
      : sorted[((sorted.length * .95).ceil() - 1).clamp(0, sorted.length - 1)];
}

void logRecord(Map<String, Object?> record) {
  final json = jsonEncode(record);
  final ascii = StringBuffer();
  for (final unit in json.codeUnits) {
    if (unit > 127) {
      ascii.write('\\u${unit.toRadixString(16).padLeft(4, '0')}');
    } else {
      ascii.writeCharCode(unit);
    }
  }
  debugPrintSynchronously('PATCHMAP_BENCHMARK $ascii');
}

/// onBeginFrame uses a target presentation time on this engine, which is neither
/// FrameTiming.buildStart nor vsyncStart. Match their shared frame number instead.
List<FrameTiming> framesBetween(
  Iterable<FrameTiming> frames,
  int startFrame,
  int endFrame,
) => frames
    .where(
      (frame) =>
          frame.frameNumber > startFrame && frame.frameNumber <= endFrame,
    )
    .toList(growable: false);

const _telemetry = MethodChannel('patchmap-example/measurement');
Future<Map<Object?, Object?>?> hostTelemetry(String method) async {
  if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return null;
  try {
    return await _telemetry.invokeMapMethod<Object?, Object?>(method);
  } on MissingPluginException {
    return null;
  }
}
