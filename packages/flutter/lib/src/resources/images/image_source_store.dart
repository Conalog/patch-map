import 'dart:async';
import 'dart:math';
import 'dart:typed_data';

import '../resource_budget.dart';
import 'image_source.dart';
import 'image_transport.dart';

final class ImageSourceResult {
  const ImageSourceResult._(this.bytes, this.failure);
  const ImageSourceResult.success(Uint8List bytes) : this._(bytes, null);
  const ImageSourceResult.failed(ImageResourceFailure failure)
    : this._(null, failure);

  /// Borrowed read-only bytes; keep the source lease until all reads finish.
  final Uint8List? bytes;
  final ImageResourceFailure? failure;
}

final class ImageSourceLease {
  ImageSourceLease._(this._store, this._entry);
  final ImageSourceStore _store;
  final _ImageEntry _entry;
  bool _released = false;
  bool get isReleased => _released;
  Uint8List? get bytes =>
      _released || _store.isClosed ? null : _entry.bytes?.asUnmodifiableView();
  ImageResourceFailure? get failure => _entry.failure;
  Future<ImageSourceResult> get ready => _entry.result.future.then(
    (value) => _released || _store.isClosed
        ? ImageSourceResult.failed(
            _store.isClosed ? _closedFailure : _cancelledFailure,
          )
        : value,
  );
  ImageSourceLease retain() {
    if (_released || _store.isClosed) {
      throw StateError('Source lease is closed');
    }
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
  'Image source store closed',
);
const _cancelledFailure = ImageResourceFailure(
  ImageFailureKind.cancelled,
  'Source no longer referenced',
);

enum _ImageState {
  transferQueued,
  transfer,
  retryWaiting,
  flattenQueued,
  ready,
  failed,
  cancelled,
}

final class _ImageEntry {
  _ImageEntry(this.source, this.automaticRetry);
  final RasterImageSource source;
  final bool automaticRetry;
  var state = _ImageState.transferQueued;
  var references = 0, attempts = 0, receivedLength = 0, bufferedLength = 0;
  var result = Completer<ImageSourceResult>();
  ImageResourceFailure? failure;
  Uint8List? bytes;
  List<Uint8List>? pages;
  ResourceBudgetLease? sourceCharge;
  _TransferAttempt? transfer;
  void Function()? cancelDelay;
}

/// One widget's shared URL/asset byte owner, used by SVG and raster preparation
/// across old/new generations. No alias resolution, text parsing or decoding.
/// Source leases are uncached after their last reference. The 64 MiB logical
/// bound includes owned payload plus bounded flatten/native-transfer copies.
final class ImageSourceStore {
  ImageSourceStore({
    ImageTransferFactory? transferFactory,
    ImageAssetLoader? assetLoader,
    ImageSchedule? schedule,
    this.onSpaceAvailable,
    bool active = true,
  }) : _transferFactory =
           transferFactory ?? imageTransferFactory(assetLoader: assetLoader),
       _schedule = schedule ?? scheduleImageTimer,
       _active = active {
    _sourceBudget = ResourceBudget(
      limitBytes: sourceLimitBytes,
      onSpaceAvailable: _spaceAvailable,
    );
  }
  static const singleSourceBytes = imageSourceByteLimit,
      sourceLimitBytes = 64 * 1024 * 1024;
  static const _sourcePageBytes = 64 * 1024;
  static const payloadLimitBytes = sourceLimitBytes - singleSourceBytes,
      maximumTransfers = 16;
  static const attemptDeadline = Duration(seconds: 20);
  final ImageTransferFactory _transferFactory;
  final ImageSchedule _schedule;
  late final ResourceBudget _sourceBudget;
  void Function()? onSpaceAvailable;
  final _entries = <Object, _ImageEntry>{},
      _transfers = <Object, _ImageEntry>{},
      _flattenings = <Object, _ImageEntry>{};
  bool _active, _closed = false, _pumping = false;
  int _transferCount = 0,
      _payloadBytes = 0,
      _references = 0,
      _bufferedBytes = 0;
  Object? lastNotificationError;
  bool get isClosed => _closed;
  bool get isActive => _active;
  int get transferCount => _transferCount;
  int get sourceBytes => _sourceBudget.chargedBytes;
  int get payloadBytes => _payloadBytes;
  int get referenceCount => _references;
  int get entryCount => _entries.length;
  int get queuedTransfers => _transfers.length;

  /// Owned Dart payload allocation, excluding reserved unused capacity and
  /// native compressed copies. Pending cancellation remains counted.
  int get bufferedSourceBytes => _bufferedBytes;

  ImageSourceLease acquireSourceBytes(
    RasterImageSource source, {
    bool initialLoad = true,
  }) {
    if (_closed) throw StateError('Image source store is closed');
    final existing = _entries[source.identity];
    if (existing != null) return _retain(existing);
    final entry = _ImageEntry(source, initialLoad);
    _entries[source.identity] = entry;
    _transfers[source.identity] = entry;
    final lease = _retain(entry);
    _pump();
    return lease;
  }

  ImageSourceLease _retain(_ImageEntry entry) {
    entry.references++;
    _references++;
    return ImageSourceLease._(this, entry);
  }

  bool retryFailed(Object identity) {
    if (_closed) return false;
    final entry = _entries[identity];
    if (entry == null ||
        entry.references == 0 ||
        entry.state != _ImageState.failed) {
      return false;
    }
    entry.result = Completer<ImageSourceResult>();
    entry.failure = null;
    entry.attempts = 3;
    entry.state = _ImageState.transferQueued;
    _transfers[identity] = entry;
    _pump();
    return true;
  }

  /// Reserves a temporary/native compressed copy inside the SAME 64 MiB total.
  /// The caller owns this token until the actual copy/descriptor settles and
  /// is disposed. Closing this owner preserves outstanding copy charges.
  ResourceBudgetLease? tryReserveCopy(int bytes) {
    if (bytes < 0 || bytes > singleSourceBytes) {
      throw RangeError.range(bytes, 0, singleSourceBytes, 'bytes');
    }
    return _sourceBudget.tryReserve(bytes);
  }

  void setActive(bool value) {
    if (!_closed) {
      _active = value;
      _pump();
    }
  }

  void _release(_ImageEntry entry) {
    entry.references--;
    _references--;
    if (entry.references != 0) return;
    _cancel(entry, _cancelledFailure);
    _pump();
  }

  void _cancel(_ImageEntry entry, ImageResourceFailure reason) {
    entry.cancelDelay?.call();
    entry.cancelDelay = null;
    _transfers.remove(entry.source.identity);
    _flattenings.remove(entry.source.identity);
    final running = entry.state == _ImageState.transfer;
    entry.state = _ImageState.cancelled;
    entry.transfer?.abort(reason);
    if (!entry.result.isCompleted) {
      entry.result.complete(ImageSourceResult.failed(reason));
    } else {
      // Released handles must not themselves retain the completed byte value.
      entry.result = Completer<ImageSourceResult>()
        ..complete(ImageSourceResult.failed(reason));
    }
    _remove(entry);
    if (!running) _releaseSource(entry);
  }

  void close() {
    if (_closed) return;
    _closed = true;
    onSpaceAvailable = null;
    for (final entry in List<_ImageEntry>.of(_entries.values)) {
      // A ready source may still be read by uncancellable native preparation.
      // Its outstanding lease, not owner closure, ends that byte lifetime.
      if (entry.state != _ImageState.ready) _cancel(entry, _closedFailure);
    }
    _sourceBudget.close();
  }

  bool _needed(_ImageEntry entry) =>
      !_closed && entry.references > 0 && entry.state != _ImageState.cancelled;
  void _pump() {
    if (_closed || !_active || _pumping) return;
    _pumping = true;
    try {
      while (!_closed && _active && _flattenings.isNotEmpty) {
        final entry = _flattenings.values.first;
        final copy = _sourceBudget.tryReserve(entry.receivedLength);
        if (copy == null) break;
        _flattenings.remove(entry.source.identity);
        try {
          entry.bytes = _flatten(entry);
          _setBuffered(entry, entry.bytes!.length);
          _resizeSource(entry, entry.bytes!.length);
          if (_needed(entry)) _ready(entry);
        } catch (error) {
          _fail(
            entry,
            ImageResourceFailure(
              ImageFailureKind.invalidSource,
              'Cannot assemble image source',
              cause: error,
            ),
          );
        } finally {
          _safeRelease(copy);
        }
      }
      while (!_closed &&
          _active &&
          _transferCount < maximumTransfers &&
          _transfers.isNotEmpty) {
        if (_payloadBytes + singleSourceBytes > payloadLimitBytes) break;
        final charge = _sourceBudget.tryReserve(singleSourceBytes);
        if (charge == null) break;
        final entry = _transfers.values.first;
        _transfers.remove(entry.source.identity);
        entry.sourceCharge = charge;
        _payloadBytes += singleSourceBytes;
        entry.state = _ImageState.transfer;
        _transferCount++;
        unawaited(_runTransfer(entry));
      }
    } finally {
      _pumping = false;
    }
  }

  Future<void> _runTransfer(_ImageEntry entry) async {
    final attempt = _TransferAttempt();
    entry.transfer = attempt;
    void Function()? cancelDeadline;
    ImageResourceFailure? failure;
    try {
      entry.attempts++;
      attempt.operation = _transferFactory(entry.source);
      if (entry.source.isNetwork) {
        cancelDeadline = _schedule(
          attemptDeadline,
          () => attempt.abort(
            const ImageResourceFailure(
              ImageFailureKind.deadline,
              'Image transfer exceeded 20 seconds',
              transient: true,
            ),
          ),
        );
      }
      final response = await attempt.operation!.response;
      if (attempt.reason != null) throw attempt.reason!;
      final length = response.contentLength;
      if (length != null && (length < 0 || length > singleSourceBytes)) {
        throw const ImageResourceFailure(
          ImageFailureKind.sourceTooLarge,
          'Image source exceeds 20 MiB',
        );
      }
      final owned = response.ownedBytes;
      final capacity =
          owned?.buffer.lengthInBytes ?? length ?? singleSourceBytes;
      if (capacity > singleSourceBytes || owned?.isEmpty == true) {
        throw const ImageResourceFailure(
          ImageFailureKind.sourceTooLarge,
          'Asset backing buffer exceeds 20 MiB or is empty',
        );
      }
      _resizeSource(entry, capacity);
      if (attempt.reason != null) throw attempt.reason!;
      if (owned != null) {
        entry.bytes = owned;
        _setBuffered(entry, capacity);
      } else {
        // Coalesce unknown streams into pages so retained allocation depends
        // on the payload size, regardless of how the transport chunks it.
        final buffer = length == null ? null : Uint8List(length);
        if (buffer != null) _setBuffered(entry, buffer.length);
        entry.pages = length == null ? <Uint8List>[] : null;
        final result = Completer<void>();
        attempt.readResult = result;
        var used = 0;
        attempt.subscription = response.bytes.listen(
          (chunk) {
            if (attempt.reason != null || result.isCompleted) return;
            if (chunk.length > capacity - used) {
              attempt.abort(
                const ImageResourceFailure(
                  ImageFailureKind.sourceTooLarge,
                  'Image stream exceeded its bounded source length',
                ),
              );
              return;
            }
            if (buffer == null) {
              _bufferUnknownChunk(entry, chunk, used);
            } else {
              buffer.setRange(used, used + chunk.length, chunk);
            }
            used += chunk.length;
            entry.receivedLength = used;
          },
          onError: (Object error, StackTrace stack) {
            if (!result.isCompleted) result.completeError(error, stack);
          },
          onDone: () {
            if (result.isCompleted) return;
            if (length != null && used != length) {
              result.completeError(
                const ImageResourceFailure(
                  ImageFailureKind.transport,
                  'Truncated image response',
                  transient: true,
                ),
              );
            } else if (used == 0) {
              result.completeError(
                const ImageResourceFailure(
                  ImageFailureKind.invalidSource,
                  'Empty image response',
                ),
              );
            } else {
              entry.bytes = buffer;
              result.complete();
            }
          },
          cancelOnError: true,
        );
        await result.future;
      }
      if (attempt.reason != null) throw attempt.reason!;
    } catch (error) {
      failure =
          attempt.reason ??
          (error is ImageResourceFailure
              ? error
              : ImageResourceFailure(
                  ImageFailureKind.transport,
                  'Image transfer failed',
                  transient: entry.source.isNetwork,
                  cause: error,
                ));
    } finally {
      cancelDeadline?.call();
      await attempt.finish();
      entry.transfer = null;
      _transferCount--;
    }
    if (!_needed(entry)) {
      _releaseSource(entry);
      _remove(entry);
    } else if (failure != null) {
      _releaseSource(entry);
      if (failure.transient &&
          entry.source.isNetwork &&
          entry.automaticRetry &&
          entry.attempts < 3) {
        entry.state = _ImageState.retryWaiting;
        entry.cancelDelay = _schedule(
          Duration(milliseconds: entry.attempts == 1 ? 500 : 1000),
          () {
            entry.cancelDelay = null;
            if (!_needed(entry)) return;
            entry.state = _ImageState.transferQueued;
            _transfers[entry.source.identity] = entry;
            _pump();
          },
        );
      } else {
        _fail(entry, failure);
      }
    } else {
      if (entry.pages != null) {
        entry.state = _ImageState.flattenQueued;
        _flattenings[entry.source.identity] = entry;
      } else {
        _ready(entry);
      }
    }
    _pump();
  }

  void _bufferUnknownChunk(_ImageEntry entry, List<int> chunk, int used) {
    final pages = entry.pages!;
    var copied = 0;
    while (copied < chunk.length) {
      if (used == entry.bufferedLength) {
        final page = Uint8List(min(_sourcePageBytes, singleSourceBytes - used));
        pages.add(page);
        _setBuffered(entry, used + page.length);
      }
      final page = pages.last;
      final available = entry.bufferedLength - used;
      final start = page.length - available;
      final count = min(available, chunk.length - copied);
      page.setRange(start, start + count, chunk, copied);
      copied += count;
      used += count;
    }
  }

  void _ready(_ImageEntry entry) {
    entry.state = _ImageState.ready;
    if (!entry.result.isCompleted) {
      entry.result.complete(
        ImageSourceResult.success(entry.bytes!.asUnmodifiableView()),
      );
    }
  }

  void _resizeSource(_ImageEntry entry, int bytes) {
    _payloadBytes += bytes - entry.sourceCharge!.bytes;
    entry.sourceCharge!.tryResize(bytes);
    _pump();
  }

  void _releaseSource(_ImageEntry entry) {
    _setBuffered(entry, 0);
    entry.bytes = null;
    entry.pages = null;
    entry.receivedLength = 0;
    final charge = entry.sourceCharge;
    entry.sourceCharge = null;
    if (charge != null) {
      _payloadBytes -= charge.bytes;
      _safeRelease(charge);
    }
  }

  void _setBuffered(_ImageEntry entry, int bytes) {
    _bufferedBytes += bytes - entry.bufferedLength;
    entry.bufferedLength = bytes;
  }

  void _fail(_ImageEntry entry, ImageResourceFailure failure) {
    _releaseSource(entry);
    entry.failure = failure;
    entry.state = _ImageState.failed;
    if (!entry.result.isCompleted) {
      entry.result.complete(ImageSourceResult.failed(failure));
    }
  }

  void _remove(_ImageEntry entry) {
    if (identical(_entries[entry.source.identity], entry)) {
      _entries.remove(entry.source.identity);
    }
  }

  void _safeRelease(ResourceBudgetLease? charge) {
    try {
      charge?.release();
    } catch (error) {
      lastNotificationError = error;
    }
  }

  void _spaceAvailable() {
    _pump();
    try {
      onSpaceAvailable?.call();
    } catch (error) {
      lastNotificationError = error;
    }
  }
}

final class _TransferAttempt {
  ImageTransfer? operation;
  StreamSubscription<List<int>>? subscription;
  Completer<void>? readResult;
  ImageResourceFailure? reason;
  Future<void>? _stopping;
  void abort(ImageResourceFailure failure) {
    if (reason != null) return;
    reason = failure;
    _stopping = _stop();
  }

  Future<void> _stop() async {
    // Both must settle. Neither logical cancellation nor deadline gives back a
    // slot while a non-cooperative transport/native API is still running.
    try {
      await Future.wait<void>([
        if (operation != null) Future.sync(operation!.cancel),
        if (subscription != null) Future.sync(subscription!.cancel),
      ]);
    } catch (_) {
      /* transport error is represented by reason/response */
    }
    final result = readResult;
    if (reason != null && result != null && !result.isCompleted) {
      result.completeError(reason!);
    }
  }

  Future<void> finish() => _stopping ??= _stop();
}

Uint8List _flatten(_ImageEntry entry) {
  final result = Uint8List(entry.receivedLength);
  var offset = 0;
  for (final page in entry.pages!) {
    final count = min(page.length, result.length - offset);
    result.setRange(offset, offset + count, page);
    offset += count;
  }
  entry.pages = null;
  return result;
}
