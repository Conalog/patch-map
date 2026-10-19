import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import '../../frame/resource_retirement.dart';
import '../resource_budget.dart';
import 'svg_vectors.dart';

typedef SvgImageRasterizer =
    Future<ui.Image> Function(ui.Picture picture, int width, int height);

/// Composition may route both bar and SVG creation through one FIFO scheduler.
/// Without this hook, the local four-job limit does not bound other owners.
typedef SvgImageScheduler =
    Future<ui.Image> Function(Future<ui.Image> Function() create);

/// A caller-owned vector fallback plus a borrowed optional raster image.
/// The caller retains this lease until its last submitted frame stops borrowing.
final class SvgImageLease {
  SvgImageLease._(this._store, this._vectorLease, this.sourceReferenceCount) {
    vectorReady = _vectorLease.ready.then((value) {
      if (!_released) _vector = value;
      return value;
    });
    vectorReady.ignore();
  }
  final SvgImageStore _store;
  final SvgVectorLease _vectorLease;

  /// Whole-diagram count for this source/style identity, compiled by renderer.
  final int sourceReferenceCount;
  late final Future<SvgVector> vectorReady;
  SvgVector? _vector;
  _ImageEntry? _entry;
  bool _released = false;
  bool get isReleased => _released;
  SvgVector? get vector => _released ? null : _vector;

  /// Null means keep painting the vector. Hidden demand cancels queued work;
  /// a running native conversion remains charged until actual settlement.
  ui.Image? resolve({
    required ui.Size logicalSize,
    required double scale,
    required double devicePixelRatio,
    bool visible = true,
  }) {
    if (_released) throw StateError('SVG image lease is released');
    if (!logicalSize.isFinite ||
        logicalSize.width < 0 ||
        logicalSize.height < 0 ||
        !scale.isFinite ||
        scale < 0 ||
        !devicePixelRatio.isFinite ||
        devicePixelRatio <= 0) {
      throw ArgumentError('SVG image demand must be finite and nonnegative');
    }
    final vector = _vector;
    final demand = vector == null
        ? 0.0
        : math.max(
                logicalSize.width / vector.intrinsicSize.width,
                logicalSize.height / vector.intrinsicSize.height,
              ) *
              math.max(
                vector.intrinsicSize.width,
                vector.intrinsicSize.height,
              ) *
              scale *
              devicePixelRatio;
    final level =
        visible &&
            !logicalSize.isEmpty &&
            sourceReferenceCount >= 16 &&
            demand > 0
        ? _level(demand)
        : null;
    if (_store.isClosed || vector == null || level == null) {
      _detach();
      return null;
    }
    final key = (vector.source.identity, vector.tint.toARGB32(), level);
    if (_entry?.key != key) {
      _detach();
      _entry = _store._acquire(key, vector, _vectorLease);
    }
    return _entry?.image;
  }

  void _detach() {
    final entry = _entry;
    _entry = null;
    if (entry != null) _store._release(entry);
  }

  bool release() {
    if (_released) return false;
    _released = true;
    _detach();
    _vector = null;
    _vectorLease.release();
    return true;
  }
}

/// Generation-local raster sharing; no source loading, scene traversal, timer,
/// frame scheduling or hidden-demand preparation. Inject the same 2 MiB budget
/// as bars. Reserved, live and retiring charges all remain in that accountant.
final class SvgImageStore {
  SvgImageStore({
    required this.budget,
    required this.retirement,
    SvgImageRasterizer? rasterize,
    this.schedule,
    this.onReady,
    bool active = true,
  }) : _rasterize =
           rasterize ??
           ((picture, width, height) => picture.toImage(width, height)),
       _active = active;
  static const maximumPreparing = 4;
  final ResourceBudget budget;
  final ResourceRetirement retirement;
  final SvgImageRasterizer _rasterize;
  final SvgImageScheduler? schedule;
  void Function()? onReady;
  final _entries = <(String, int, int), _ImageEntry>{};
  final _queued = <(String, int, int), _ImageEntry>{};
  final _denied = <(String, int, int), _ImageEntry>{};
  final _failed = <(String, int, int)>{};
  bool _active, _closed = false, _pumping = false;
  int _running = 0;
  bool get isClosed => _closed;
  int get preparingCount => _running;
  int get queuedCount => _queued.length;
  int get deniedCount => _denied.length;
  int get entryCount => _entries.length;
  Object? lastCreationError, lastNotificationError;

  SvgImageLease acquire(
    SvgVectorLease vector, {
    required int sourceReferenceCount,
  }) {
    if (_closed) throw StateError('SVG image store is closed');
    if (sourceReferenceCount < 0) throw RangeError.value(sourceReferenceCount);
    return SvgImageLease._(this, vector.retain(), sourceReferenceCount);
  }

  _ImageEntry _acquire(
    (String, int, int) key,
    SvgVector vector,
    SvgVectorLease lease,
  ) {
    var entry = _entries[key];
    if (entry != null) {
      entry.references++;
      return entry;
    }
    final size = vector.intrinsicSize;
    final ratio = key.$3 / math.max(size.width, size.height);
    entry = _ImageEntry(
      key,
      vector,
      lease.retain(),
      math.max(1, (size.width * ratio).ceil()),
      math.max(1, (size.height * ratio).ceil()),
    );
    _entries[key] = entry;
    if (_failed.contains(key)) {
      entry.state = _State.failed;
    } else {
      _queued[key] = entry;
      _pump();
    }
    return entry;
  }

  void _release(_ImageEntry entry) {
    if (--entry.references != 0) return;
    if (entry.state == _State.running) return;
    _remove(entry);
  }

  void setActive(bool active) {
    if (_closed || _active == active) return;
    _active = active;
    if (active) _pump();
  }

  /// Composition calls this only after shared-budget space actually changes.
  /// Repeated resolve calls never reattempt a denied reservation.
  void retryDenied() {
    if (_closed) return;
    for (final entry in _denied.values) {
      if (entry.references > 0) {
        entry.state = _State.queued;
        _queued[entry.key] = entry;
      }
    }
    _denied.clear();
    _pump();
  }

  void _pump() {
    if (_pumping || _closed || !_active) return;
    _pumping = true;
    try {
      while (!_closed &&
          _active &&
          _running < maximumPreparing &&
          _queued.isNotEmpty) {
        final entry = _queued.remove(_queued.keys.first)!;
        if (entry.references == 0) continue;
        final reservation = budget.tryReserve(entry.bytes);
        if (reservation == null) {
          entry.state = _State.denied;
          _denied[entry.key] = entry;
          continue;
        }
        entry.reservation = reservation;
        entry.state = _State.running;
        _running++;
        _prepare(entry).ignore();
      }
    } finally {
      _pumping = false;
    }
  }

  Future<void> _prepare(_ImageEntry entry) async {
    ui.Image? temporary;
    ui.Picture? scaled;
    var published = false;
    try {
      Future<ui.Image> create() async {
        final recorder = ui.PictureRecorder();
        final canvas = ui.Canvas(recorder)
          ..scale(
            entry.width / entry.vector.intrinsicSize.width,
            entry.height / entry.vector.intrinsicSize.height,
          );
        canvas.drawPicture(entry.vector.picture);
        scaled = recorder.endRecording();
        return _rasterize(scaled!, entry.width, entry.height);
      }

      temporary = await (schedule == null ? create() : schedule!(create));
      if (temporary.width != entry.width || temporary.height != entry.height) {
        throw StateError('SVG rasterizer returned unexpected dimensions');
      }
      if (!_closed && !budget.isClosed && entry.references > 0) {
        entry.reservation!.promote();
        entry.image = temporary;
        temporary = null;
        entry.state = _State.ready;
        published = true;
      }
    } catch (error) {
      lastCreationError = error;
      _failed.add(entry.key);
      entry.state = _State.failed;
    } finally {
      scaled?.dispose();
      temporary?.dispose();
      _running--;
      if (!published) {
        entry.state = _State.failed;
        _releaseCharge(entry);
        if (_closed || entry.references == 0) _remove(entry);
      }
    }
    _pump();
    if (published && !_closed) {
      try {
        onReady?.call();
      } catch (error) {
        lastNotificationError = error;
      }
    }
  }

  void _releaseCharge(_ImageEntry entry) {
    final charge = entry.reservation;
    entry.reservation = null;
    try {
      charge?.release();
    } catch (error) {
      lastNotificationError = error;
    }
  }

  void _remove(_ImageEntry entry) {
    if (identical(_entries[entry.key], entry)) _entries.remove(entry.key);
    _queued.remove(entry.key);
    _denied.remove(entry.key);
    final image = entry.image;
    entry.image = null;
    if (image != null) {
      entry.reservation!.retire();
      retirement.enqueue(() {
        try {
          image.dispose();
        } finally {
          _releaseCharge(entry);
        }
      });
    }
    entry.lease.release();
  }

  /// Pending conversion keeps its charge and vector until settlement. Existing
  /// borrowed images use the injected frame retirement boundary for disposal.
  void close() {
    if (_closed) return;
    _closed = true;
    _active = false;
    onReady = null;
    for (final entry in _entries.values.toList(growable: false)) {
      if (entry.state != _State.running) _remove(entry);
    }
    _queued.clear();
    _denied.clear();
  }
}

enum _State { queued, denied, running, ready, failed }

final class _ImageEntry {
  _ImageEntry(this.key, this.vector, this.lease, this.width, this.height);
  final (String, int, int) key;
  final SvgVector vector;
  final SvgVectorLease lease;
  final int width, height;
  int get bytes => width * height * 4;
  int references = 1;
  _State state = _State.queued;
  ui.Image? image;
  ResourceBudgetLease? reservation;
}

int? _level(double demand) {
  for (final value in const [192, 384, 768, 1536]) {
    if (demand <= value) return value;
  }
  return null;
}
