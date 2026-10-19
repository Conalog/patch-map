import 'dart:async';
import 'dart:ui' as ui;

import '../../frame/resource_retirement.dart';
import '../resource_budget.dart';
import 'image_decode.dart';
import 'image_source.dart';
import 'image_source_store.dart';
import 'image_transport.dart';

final class RasterImageResult {
  const RasterImageResult._(this.image, this.failure);
  const RasterImageResult.success(ui.Image image) : this._(image, null);
  const RasterImageResult.failed(ImageResourceFailure failure)
    : this._(null, failure);

  /// Borrowed until the lease is released. Never dispose this handle directly.
  final ui.Image? image;
  final ImageResourceFailure? failure;
}

final class RasterImageLease {
  RasterImageLease._(this._store, this._entry);
  final RasterImageStore _store;
  final _ImageEntry _entry;
  bool _released = false;
  bool get isReleased => _released;
  ui.Image? get image => _released || _store.isClosed ? null : _entry.image;
  ImageResourceFailure? get failure => _entry.failure;
  int get sharedReferenceCount => _entry.references;

  /// A respecified failed identity starts a new future. Old attempts remain
  /// settled failures; callers use onChanged or read ready again for retries.
  Future<RasterImageResult> get ready => _entry.result.future.then(
    (value) => _released || _store.isClosed
        ? RasterImageResult.failed(
            _store.isClosed ? _closedFailure : _cancelledFailure,
          )
        : value,
  );
  RasterImageLease retain() {
    if (_released || _store.isClosed) throw StateError('Image lease is closed');
    return _store._retain(_entry);
  }

  bool release() {
    if (_released) return false;
    _released = true;
    _store._release(_entry);
    return true;
  }
}

const _closedFailure = ImageResourceFailure(
  ImageFailureKind.closed,
  'Image store closed',
);
const _cancelledFailure = ImageResourceFailure(
  ImageFailureKind.cancelled,
  'Image no longer referenced',
);

enum _ImageState {
  sourceQueued,
  sourceWaiting,
  inspectQueued,
  inspect,
  decodeQueued,
  decode,
  ready,
  failed,
  cancelled,
}

final class _ImageEntry {
  _ImageEntry(this.source, this.initialLoad);
  final RasterImageSource source;
  final bool initialLoad;
  bool isRetry = false;
  var state = _ImageState.sourceQueued;
  int references = 0;
  var result = Completer<RasterImageResult>();
  ImageResourceFailure? failure;
  ImageSourceLease? sourceLease;
  RasterImageDescriptor? descriptor;
  ResourceBudgetLease? compressedCopy, outputCharge, preparingCharge;
  ui.Image? image;
}

/// One widget's native raster owner across old/new generations. Pass the same
/// sources owner to SVG and raster to share transport slots and source bytes.
/// Constructor transport ports create a private source owner for standalone
/// use; injected sources are never closed/activated by this raster owner.
/// Output capacity denial is finite failure, not an indefinite FIFO wait.
final class RasterImageStore {
  RasterImageStore({
    required this.outputBudget,
    required this.retirement,
    ImageSourceStore? sources,
    ImageTransferFactory? transferFactory,
    ImageAssetLoader? assetLoader,
    ImageInspector? inspect,
    ImageSchedule? schedule,
    this.onChanged,
    bool active = true,
  }) : assert(
         sources == null ||
             (transferFactory == null &&
                 assetLoader == null &&
                 schedule == null),
       ),
       sources =
           sources ??
           ImageSourceStore(
             transferFactory: transferFactory,
             assetLoader: assetLoader,
             schedule: schedule,
             active: active,
           ),
       _ownsSources = sources == null,
       _inspect = inspect ?? inspectRasterImage,
       _active = active {
    if (_ownsSources) this.sources.onSpaceAvailable = retryDenied;
  }
  static const singleSourceBytes = ImageSourceStore.singleSourceBytes,
      sourceLimitBytes = ImageSourceStore.sourceLimitBytes;
  static const payloadLimitBytes = ImageSourceStore.payloadLimitBytes,
      maximumTransfers = ImageSourceStore.maximumTransfers;
  static const preparingLimitBytes = 128 * 1024 * 1024,
      maximumDecodes = 2,
      maximumAxis = 8192,
      maximumPixels = 16777216;
  static const attemptDeadline = ImageSourceStore.attemptDeadline;
  final ResourceBudget outputBudget;
  final ResourceRetirement retirement;
  final ImageSourceStore sources;
  final bool _ownsSources;
  final ImageInspector _inspect;
  void Function(Object identity)? onChanged;
  final _preparingBudget = ResourceBudget(limitBytes: preparingLimitBytes);
  final _entries = <Object, _ImageEntry>{},
      _sourceQueued = <Object, _ImageEntry>{},
      _inspections = <Object, _ImageEntry>{},
      _decodes = <Object, _ImageEntry>{};
  bool _active, _closed = false, _pumping = false;
  int _inspectCount = 0, _decodeCount = 0, _references = 0;
  Object? lastNotificationError;
  bool get isClosed => _closed;
  bool get isActive => _active;
  int get transferCount => sources.transferCount;
  int get inspectingCount => _inspectCount;
  int get decodingCount => _decodeCount;
  int get sourceBytes => sources.sourceBytes;
  int get payloadBytes => sources.payloadBytes;
  int get bufferedSourceBytes => sources.bufferedSourceBytes;
  int get preparingBytes => _preparingBudget.chargedBytes;
  int get referenceCount => _references;
  int get entryCount => _entries.length;
  int get queuedTransfers => sources.queuedTransfers + _sourceQueued.length;
  int get queuedDecodes => _decodes.length;

  RasterImageLease acquire(
    RasterImageSource source, {
    bool initialLoad = true,
  }) {
    if (_closed) throw StateError('Image store is closed');
    final existing = _entries[source.identity];
    if (existing != null) return _retain(existing);
    final entry = _ImageEntry(source, initialLoad);
    _entries[source.identity] = entry;
    _sourceQueued[source.identity] = entry;
    final lease = _retain(entry);
    _pump();
    return lease;
  }

  RasterImageLease _retain(_ImageEntry entry) {
    entry.references++;
    _references++;
    return RasterImageLease._(this, entry);
  }

  bool retryFailed(Object identity) {
    if (_closed) return false;
    final entry = _entries[identity];
    if (entry == null ||
        entry.references == 0 ||
        entry.state != _ImageState.failed) {
      return false;
    }
    sources.retryFailed(identity);
    entry.isRetry = true;
    entry.result = Completer<RasterImageResult>();
    entry.failure = null;
    entry.state = _ImageState.sourceQueued;
    _sourceQueued[identity] = entry;
    _pump();
    return true;
  }

  void setActive(bool value) {
    if (_closed) return;
    _active = value;
    if (_ownsSources) sources.setActive(value);
    _pump();
  }

  /// Rechecks queued compressed-copy and decode slots. A settled output
  /// capacity failure is retried only by explicit value respecification.
  void retryDenied() => _pump();
  bool _needed(_ImageEntry entry) =>
      !_closed && entry.references > 0 && entry.state != _ImageState.cancelled;
  void _release(_ImageEntry entry) {
    entry.references--;
    _references--;
    if (entry.references != 0 || _closed) return;
    _cancel(entry, _cancelledFailure);
    _pump();
  }

  void _cancel(_ImageEntry entry, ImageResourceFailure reason) {
    _sourceQueued.remove(entry.source.identity);
    _inspections.remove(entry.source.identity);
    _decodes.remove(entry.source.identity);
    final prior = entry.state;
    entry.state = _ImageState.cancelled;
    if (!entry.result.isCompleted) {
      entry.result.complete(RasterImageResult.failed(reason));
    }
    _remove(entry);
    if (prior == _ImageState.inspect || prior == _ImageState.decode) return;
    _releaseSource(entry);
    _disposeDescriptor(entry);
    _retireImage(entry);
  }

  void close() {
    if (_closed) return;
    _closed = true;
    onChanged = null;
    for (final entry in List<_ImageEntry>.of(_entries.values)) {
      _cancel(entry, _closedFailure);
    }
    if (_ownsSources) sources.close();
  }

  void _pump() {
    if (_closed || !_active || _pumping) return;
    _pumping = true;
    try {
      while (!_closed &&
          _active &&
          _decodeCount < maximumDecodes &&
          _decodes.isNotEmpty) {
        final entry = _decodes.values.first;
        final bytes = entry.descriptor!.width * entry.descriptor!.height * 4;
        if (bytes > outputBudget.availableBytes || outputBudget.isClosed) {
          _decodes.remove(entry.source.identity);
          _fail(
            entry,
            const ImageResourceFailure(
              ImageFailureKind.outputBudget,
              'Image output capacity is unavailable',
            ),
          );
          continue;
        }
        if (bytes > _preparingBudget.availableBytes) break;
        entry.outputCharge = outputBudget.tryReserve(bytes)!;
        entry.preparingCharge = _preparingBudget.tryReserve(bytes)!;
        _decodes.remove(entry.source.identity);
        entry.state = _ImageState.decode;
        _decodeCount++;
        unawaited(_runDecode(entry));
      }
      while (!_closed &&
          _active &&
          _inspectCount < maximumDecodes &&
          _inspections.isNotEmpty) {
        final entry = _inspections.values.first;
        if (sources.isClosed) {
          _inspections.remove(entry.source.identity);
          _fail(entry, _closedFailure);
          continue;
        }
        final copy = sources.tryReserveCopy(entry.sourceLease!.bytes!.length);
        if (copy == null) break;
        _inspections.remove(entry.source.identity);
        entry.state = _ImageState.inspect;
        _inspectCount++;
        unawaited(_runInspect(entry, copy));
      }
      while (!_closed && _active && _sourceQueued.isNotEmpty) {
        final entry = _sourceQueued.values.first;
        _sourceQueued.remove(entry.source.identity);
        if (sources.isClosed) {
          _fail(entry, _closedFailure);
          continue;
        }
        entry.state = _ImageState.sourceWaiting;
        entry.sourceLease = sources.acquireSourceBytes(
          entry.source,
          initialLoad: entry.initialLoad && !entry.isRetry,
        );
        unawaited(_runSource(entry));
      }
    } finally {
      _pumping = false;
    }
  }

  Future<void> _runSource(_ImageEntry entry) async {
    final result = await entry.sourceLease!.ready;
    if (!_needed(entry)) {
      _releaseSource(entry);
      _remove(entry);
    } else if (result.failure != null) {
      _fail(entry, result.failure!);
    } else {
      entry.state = _ImageState.inspectQueued;
      _inspections[entry.source.identity] = entry;
    }
    _pump();
  }

  Future<void> _runInspect(_ImageEntry entry, ResourceBudgetLease copy) async {
    RasterImageDescriptor? descriptor;
    ImageResourceFailure? failure;
    try {
      descriptor = await _inspect(entry.sourceLease!.bytes!);
      if (descriptor.width <= 0 ||
          descriptor.height <= 0 ||
          descriptor.width > maximumAxis ||
          descriptor.height > maximumAxis ||
          descriptor.width * descriptor.height > maximumPixels) {
        throw const ImageResourceFailure(
          ImageFailureKind.dimensions,
          'Image dimensions exceed 8192 per axis or 16777216 pixels',
        );
      }
    } catch (error) {
      failure = error is ImageResourceFailure
          ? error
          : ImageResourceFailure(
              ImageFailureKind.decode,
              'Image descriptor inspection failed',
              cause: error,
            );
    } finally {
      _inspectCount--;
      _releaseSource(entry);
    }
    if (!_needed(entry) || failure != null) {
      descriptor?.dispose();
      _safeRelease(copy);
      if (_needed(entry)) {
        _fail(entry, failure!);
      } else {
        _remove(entry);
      }
    } else {
      entry.descriptor = descriptor;
      entry.compressedCopy = copy;
      entry.state = _ImageState.decodeQueued;
      _decodes[entry.source.identity] = entry;
    }
    _pump();
  }

  Future<void> _runDecode(_ImageEntry entry) async {
    ui.Image? image;
    ImageResourceFailure? failure;
    try {
      image = await entry.descriptor!.decode();
      if (image.width != entry.descriptor!.width ||
          image.height != entry.descriptor!.height) {
        throw const ImageResourceFailure(
          ImageFailureKind.decode,
          'Decoded image dimensions differ from descriptor',
        );
      }
    } catch (error) {
      failure = error is ImageResourceFailure
          ? error
          : ImageResourceFailure(
              ImageFailureKind.decode,
              'Image codec failed',
              cause: error,
            );
    } finally {
      _disposeDescriptor(entry);
      _safeRelease(entry.preparingCharge);
      entry.preparingCharge = null;
      _decodeCount--;
    }
    if (!_needed(entry) || failure != null || outputBudget.isClosed) {
      image?.dispose();
      _safeRelease(entry.outputCharge);
      entry.outputCharge = null;
      if (_needed(entry)) {
        _fail(
          entry,
          failure ??
              const ImageResourceFailure(
                ImageFailureKind.outputBudget,
                'Output budget closed',
              ),
        );
      } else {
        _remove(entry);
      }
    } else {
      entry.outputCharge!.promote();
      entry.image = image;
      entry.state = _ImageState.ready;
      entry.result.complete(RasterImageResult.success(image!));
      _notify(entry);
    }
    _pump();
  }

  void _releaseSource(_ImageEntry entry) {
    final lease = entry.sourceLease;
    entry.sourceLease = null;
    lease?.release();
  }

  void _disposeDescriptor(_ImageEntry entry) {
    entry.descriptor?.dispose();
    entry.descriptor = null;
    _safeRelease(entry.compressedCopy);
    entry.compressedCopy = null;
  }

  void _retireImage(_ImageEntry entry) {
    final image = entry.image, charge = entry.outputCharge;
    entry.image = null;
    entry.outputCharge = null;
    if (image == null) return;
    charge!.retire();
    retirement.enqueue(() {
      try {
        image.dispose();
      } finally {
        _safeRelease(charge);
      }
    });
  }

  void _fail(_ImageEntry entry, ImageResourceFailure failure) {
    _releaseSource(entry);
    _disposeDescriptor(entry);
    entry.failure = failure;
    entry.state = _ImageState.failed;
    if (!entry.result.isCompleted) {
      entry.result.complete(RasterImageResult.failed(failure));
    }
    _notify(entry);
  }

  void _notify(_ImageEntry entry) {
    if (_closed || entry.references == 0) return;
    try {
      onChanged?.call(entry.source.identity);
    } catch (error) {
      lastNotificationError = error;
    }
  }

  void _safeRelease(ResourceBudgetLease? lease) {
    try {
      lease?.release();
    } catch (error) {
      lastNotificationError = error;
    }
  }

  void _remove(_ImageEntry entry) {
    if (identical(_entries[entry.source.identity], entry)) {
      _entries.remove(entry.source.identity);
    }
  }
}
