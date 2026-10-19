import 'dart:async';
import 'dart:typed_data';
import 'dart:ui' as ui;

import '../../frame/resource_retirement.dart';
import '../resource_budget.dart';

/// Creation identity excludes color, placement and changing bar height. One
/// fixed representative width belongs to one generation's pool.
final class BarMaskPlan {
  BarMaskPlan._(
    this.representativeWidth,
    this.radius,
    this.threeWidth,
    this.nineWidth,
    this.height,
  );
  static const density = 6.0, pad = .5, maximumDimension = 4096;
  final double representativeWidth, radius;
  final int threeWidth, nineWidth, height;
  int get estimatedBytes => (threeWidth + nineWidth) * height * 4;
  bool get threeSliceUsable => representativeWidth >= 2 * radius;
  double get threeSourceRight => (representativeWidth + 2 * pad) * density;
  late final List<double> sourceAxis = List.unmodifiable([
    0.0,
    (pad + radius) * density,
    (pad + radius + 2) * density,
    (2 * pad + 2 * radius + 2) * density,
  ]);

  static BarMaskPlan? tryCreate(double representativeWidth, double radius) {
    if (!representativeWidth.isFinite ||
        representativeWidth <= 0 ||
        !radius.isFinite ||
        radius < 0) {
      return null;
    }
    final wide = (representativeWidth + 2 * pad) * density;
    final square = (2 * radius + 2 + 2 * pad) * density;
    if (!wide.isFinite ||
        !square.isFinite ||
        wide > maximumDimension ||
        square > maximumDimension) {
      return null;
    }
    return BarMaskPlan._(
      representativeWidth,
      radius,
      wide.ceil(),
      square.ceil(),
      square.ceil(),
    );
  }
}

/// Borrowed white masks and clamp/medium shaders. Handles must keep their
/// reference until the renderer no longer borrows either native object.
final class BarMasks {
  BarMasks._(
    this.plan,
    this.threeImage,
    this.nineImage,
    this.threeShader,
    this.nineShader,
  );
  final BarMaskPlan plan;
  final ui.Image threeImage, nineImage;
  final ui.ImageShader threeShader, nineShader;
  int get bytes =>
      (threeImage.width * threeImage.height +
          nineImage.width * nineImage.height) *
      4;
  var _disposed = false;
  bool get isDisposed => _disposed;

  void dispose() {
    if (_disposed) return;
    _disposed = true;
    threeShader.dispose();
    nineShader.dispose();
    threeImage.dispose();
    nineImage.dispose();
  }
}

typedef BarMaskCreator = Future<BarMasks> Function(BarMaskPlan plan);
typedef BarMaskRasterizer =
    Future<ui.Image> Function(ui.Picture picture, int width, int height);

/// Owns partial pictures/images/shaders until one complete pair is transferred.
/// The rasterizer port supports native platform adaptation and failure probes;
/// a returned Image transfers ownership here, even if later preparation fails.
Future<BarMasks> createBarMasks(
  BarMaskPlan plan, {
  BarMaskRasterizer? rasterize,
}) async {
  final images = <ui.Image>[], shaders = <ui.ImageShader>[];
  var transferred = false;
  try {
    for (final width in [plan.representativeWidth, 2 * plan.radius + 2]) {
      final recorder = ui.PictureRecorder();
      final canvas = ui.Canvas(recorder)..scale(BarMaskPlan.density);
      canvas.drawRRect(
        ui.RRect.fromRectAndRadius(
          ui.Rect.fromLTWH(
            BarMaskPlan.pad,
            BarMaskPlan.pad,
            width,
            2 * plan.radius + 2,
          ),
          ui.Radius.circular(plan.radius),
        ),
        ui.Paint()..color = const ui.Color(0xffffffff),
      );
      final picture = recorder.endRecording();
      try {
        final pixels = images.isEmpty ? plan.threeWidth : plan.nineWidth;
        final image = await (rasterize == null
            ? picture.toImage(pixels, plan.height)
            : rasterize(picture, pixels, plan.height));
        images.add(image);
      } finally {
        picture.dispose();
      }
      final matrix = Float64List(16);
      for (final i in [0, 5, 10, 15]) {
        matrix[i] = 1;
      }
      shaders.add(
        ui.ImageShader(
          images.last,
          ui.TileMode.clamp,
          ui.TileMode.clamp,
          matrix,
          filterQuality: ui.FilterQuality.medium,
        ),
      );
    }
    final masks = BarMasks._(
      plan,
      images[0],
      images[1],
      shaders[0],
      shaders[1],
    );
    if (masks.bytes != plan.estimatedBytes) {
      throw StateError(
        'Bar mask raster dimensions do not match the reservation',
      );
    }
    transferred = true;
    return masks;
  } finally {
    if (!transferred) {
      for (final shader in shaders) {
        shader.dispose();
      }
      for (final image in images) {
        image.dispose();
      }
    }
  }
}

/// A reference to a radius's preparation/live masks. Denial and optimization
/// failure resolve [ready] to null, retaining Canvas fallback. A space-change
/// retry starts a new ready future and notifies [BarMaskPool.onReady] on success.
final class BarMaskHandle {
  BarMaskHandle._(this._pool, this._entry);
  final BarMaskPool _pool;
  final _Entry _entry;
  var _released = false;
  bool get isReleased => _released;
  int get sharedReferenceCount => _entry.references;
  BarMasks? get masks => _released || _pool.isClosed ? null : _entry.masks;
  Future<BarMasks?> get ready => _entry.result.future.then(
    (value) => _released || _pool.isClosed ? null : value,
  );
  BarMaskHandle retain() {
    if (_released) throw StateError('Cannot retain a released bar mask handle');
    return _pool._retain(_entry);
  }

  bool release() {
    if (_released) return false;
    _released = true;
    _pool._release(_entry);
    return true;
  }
}

enum _State { queued, denied, running, ready, failed, unusable, retired }

final class _Entry {
  _Entry(this.radius, this.plan, this.state);
  final double radius;
  final BarMaskPlan? plan;
  _State state;
  var references = 0;
  var result = Completer<BarMasks?>();
  BarMasks? masks;
  ResourceBudgetLease? reservation;
}

/// One generation's resource owner. All image bytes, including reservations and
/// safe retirement, are charged to the injected shared budget. This pool owns
/// neither the budget nor retirement lifetime and schedules no frames/timers.
final class BarMaskPool {
  BarMaskPool({
    required this.representativeWidth,
    required this.budget,
    required this.retirement,
    BarMaskCreator? creator,
    this.onReady,
    bool active = true,
  }) : _creator = creator ?? createBarMasks,
       _active = active {
    if (!representativeWidth.isFinite || representativeWidth < 0) {
      throw ArgumentError.value(representativeWidth, 'representativeWidth');
    }
  }
  static const unusedLimitBytes = 1024 * 1024, maximumPreparing = 4;
  final double representativeWidth;
  final ResourceBudget budget;
  final ResourceRetirement retirement;
  final BarMaskCreator _creator;
  void Function()? onReady;
  final _entries = <double, _Entry>{};
  final _queued = <double, _Entry>{};
  final _denied = <double, _Entry>{};
  final _unused = <double, _Entry>{};
  final _failed = <double>{};
  var _active = true, _closed = false, _pumping = false;
  var _running = 0, _unusedBytes = 0, _references = 0;
  Object? lastCreationError, lastNotificationError;
  bool get isClosed => _closed;
  bool get isActive => _active;
  int get preparingCount => _running;
  int get queuedCount => _queued.length;
  int get deniedCount => _denied.length;
  int get unusedBytes => _unusedBytes;
  int get referenceCount => _references;
  int get entryCount => _entries.length;
  bool failed(double radius) => _failed.contains(radius);

  BarMaskHandle acquire(double radius) {
    if (_closed) throw StateError('Bar mask pool is closed');
    var entry = _entries[radius];
    if (entry != null) return _retain(entry);
    final plan = BarMaskPlan.tryCreate(representativeWidth, radius);
    entry = _Entry(
      radius,
      plan,
      plan == null
          ? _State.unusable
          : _failed.contains(radius)
          ? _State.failed
          : _State.queued,
    );
    if (plan != null) _entries[radius] = entry;
    final handle = _retain(entry);
    if (entry.state == _State.queued) {
      _queued[radius] = entry;
      _pump();
    } else {
      entry.result.complete(null);
    }
    return handle;
  }

  BarMaskHandle _retain(_Entry entry) {
    if (_closed) throw StateError('Bar mask pool is closed');
    if (_unused.remove(entry.radius) != null) {
      _unusedBytes -= entry.masks!.bytes;
    }
    entry.references++;
    _references++;
    return BarMaskHandle._(this, entry);
  }

  void _release(_Entry entry) {
    entry.references--;
    _references--;
    if (entry.references > 0 || _closed) return;
    switch (entry.state) {
      case _State.running:
        // Keep the slot/reservation/entry. A reacquire joins this same job.
        break;
      case _State.ready:
        _unused[entry.radius] = entry;
        _unusedBytes += entry.masks!.bytes;
        _trimUnused();
      default:
        _queued.remove(entry.radius);
        _denied.remove(entry.radius);
        if (identical(_entries[entry.radius], entry)) {
          _entries.remove(entry.radius);
        }
        if (!entry.result.isCompleted) entry.result.complete(null);
    }
  }

  void setActive(bool active) {
    if (_closed || _active == active) return;
    _active = active;
    if (active) _pump();
  }

  /// Called by the composition root only on shared-budget space changes.
  /// It is also safe while inactive; starts wait until [setActive] enables them.
  void retryDenied() {
    if (_closed) return;
    final entries = _denied.values.toList(growable: false);
    _denied.clear();
    for (final entry in entries) {
      if (entry.references == 0) continue;
      entry.state = _State.queued;
      entry.result = Completer<BarMasks?>();
      _queued[entry.radius] = entry;
    }
    _pump();
  }

  /// Shared-budget consumers may request FIFO reclamation before falling back.
  /// Returns scheduled bytes; charges remain until safe retirement actually
  /// runs. Retire only enough unused masks to cover the current shortfall.
  int retireUnusedFor(int requiredAvailableBytes) {
    if (requiredAvailableBytes < 0) {
      throw RangeError.value(requiredAvailableBytes);
    }
    if (_closed || requiredAvailableBytes > budget.limitBytes) return 0;
    final available = budget.availableBytes;
    var scheduled = 0;
    while (available + scheduled < requiredAvailableBytes &&
        _unused.isNotEmpty) {
      final oldest = _unused.values.first;
      scheduled += oldest.masks!.bytes;
      _retire(oldest);
    }
    return scheduled;
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
        final bytes = entry.plan!.estimatedBytes;
        retireUnusedFor(bytes);
        if (_closed) break;
        if (entry.references == 0) continue;
        if (!_active) {
          // A synchronous budget-space callback may deactivate the pool while
          // retiring an old mask. Keep this unstarted head ahead of the tail.
          final tail = Map<double, _Entry>.of(_queued);
          _queued.clear();
          _queued[entry.radius] = entry;
          _queued.addAll(tail);
          break;
        }
        final reservation = budget.tryReserve(bytes);
        if (reservation == null) {
          entry.state = _State.denied;
          _denied[entry.radius] = entry;
          entry.result.complete(null);
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

  Future<void> _prepare(_Entry entry) async {
    BarMasks? temporary;
    var published = false;
    final reservation = entry.reservation!;
    try {
      temporary = await _creator(entry.plan!);
      if (temporary.bytes != entry.plan!.estimatedBytes) {
        throw StateError('Bar mask creator returned unexpected dimensions');
      }
      if (!_closed && !budget.isClosed) {
        reservation.promote();
        entry.masks = temporary;
        temporary = null;
        entry.state = _State.ready;
        published = true;
        entry.result.complete(entry.masks);
      } else {
        if (!entry.result.isCompleted) entry.result.complete(null);
        _entries.remove(entry.radius);
      }
    } catch (error) {
      // The creator owns partial results until it returns a complete pair.
      // Notification callbacks below never enter this failure-identity path.
      lastCreationError = error;
      _failed.add(entry.radius);
      entry.state = _State.failed;
      if (!entry.result.isCompleted) entry.result.complete(null);
      if (entry.references == 0) _entries.remove(entry.radius);
    } finally {
      temporary?.dispose();
      try {
        if (!published) {
          entry.reservation = null;
          _releaseReservation(reservation);
        }
      } finally {
        _running--;
      }
    }
    if (published && entry.references == 0 && entry.masks != null) {
      _unused[entry.radius] = entry;
      _unusedBytes += entry.masks!.bytes;
      _trimUnused();
    }
    _pump();
    if (published && !_closed && entry.references > 0 && entry.masks != null) {
      try {
        onReady?.call();
      } catch (error) {
        lastNotificationError = error;
      }
    }
  }

  void _trimUnused() {
    while (_unusedBytes > unusedLimitBytes && _unused.isNotEmpty) {
      _retire(_unused.values.first);
    }
  }

  void _retire(_Entry entry) {
    if (_unused.remove(entry.radius) != null) {
      _unusedBytes -= entry.masks!.bytes;
    }
    _entries.remove(entry.radius);
    final masks = entry.masks!;
    final reservation = entry.reservation!;
    entry.masks = null;
    entry.reservation = null;
    entry.state = _State.retired;
    reservation.retire();
    retirement.enqueue(() {
      try {
        masks.dispose();
      } finally {
        _releaseReservation(reservation);
      }
    });
  }

  void _releaseReservation(ResourceBudgetLease reservation) {
    try {
      reservation.release();
    } catch (error) {
      lastNotificationError = error;
    }
  }

  /// Detaches notifications and retires live masks. Uncancellable creation
  /// retains its slot and reservation until its actual completion cleanup.
  void close() {
    if (_closed) return;
    _closed = true;
    _active = false;
    onReady = null;
    _queued.clear();
    _denied.clear();
    for (final entry in _entries.values.toList(growable: false)) {
      if (entry.state == _State.running) continue;
      if (entry.masks != null) {
        _retire(entry);
      } else {
        _entries.remove(entry.radius);
        if (!entry.result.isCompleted) entry.result.complete(null);
      }
    }
  }
}
