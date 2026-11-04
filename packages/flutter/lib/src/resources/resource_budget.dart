/// The lifetime of one charge, independent of native resource ownership.
enum ResourceBudgetState { reserved, live, retiring, released }

/// Constant-time logical byte accounting shared by resource owners.
///
/// Reserve before starting creation. A lease remains charged during creation,
/// live use and safe retirement. Logical cancellation does not release it:
/// uncancellable work must settle before its caller releases the lease.
/// Limits and resource disposal belong to the caller, not this accountant.
final class ResourceBudget {
  ResourceBudget({required this.limitBytes, void Function()? onSpaceAvailable})
    : _onSpaceAvailable = onSpaceAvailable {
    _validateBytes(limitBytes, 'limitBytes');
  }

  final int limitBytes;
  void Function()? _onSpaceAvailable;
  var _closed = false;
  var _reservedBytes = 0;
  var _liveBytes = 0;
  var _retiringBytes = 0;

  bool get isClosed => _closed;
  int get reservedBytes => _reservedBytes;
  int get liveBytes => _liveBytes;
  int get retiringBytes => _retiringBytes;
  int get chargedBytes => _reservedBytes + _liveBytes + _retiringBytes;
  int get availableBytes => limitBytes - chargedBytes;

  /// Returns null without changing accounting when closed or out of space.
  ResourceBudgetLease? tryReserve(int bytes) {
    _validateBytes(bytes, 'bytes');
    if (_closed || bytes > availableBytes) return null;
    _reservedBytes += bytes;
    return ResourceBudgetLease._(this, bytes);
  }

  /// Stops admission and detaches notifications without clearing outstanding
  /// charges. Existing leases may still shrink, retire and release.
  void close() {
    _closed = true;
    _onSpaceAvailable = null;
  }

  void _adjust(ResourceBudgetState state, int delta) {
    switch (state) {
      case ResourceBudgetState.reserved:
        _reservedBytes += delta;
      case ResourceBudgetState.live:
        _liveBytes += delta;
      case ResourceBudgetState.retiring:
        _retiringBytes += delta;
      case ResourceBudgetState.released:
        throw StateError('A released lease cannot hold a charge.');
    }
  }

  // Notify only after a decrease is fully committed. The callback may reserve
  // again synchronously. If it throws, accounting remains committed.
  void _notifySpaceAvailable() => _onSpaceAvailable?.call();
}

/// The explicit ownership token for one reservation and resulting resource.
///
/// Transfer the token along with a prepared resource, then call [promote].
/// A prepare failure can release directly in finally. After [retire], release
/// only when the caller's frame/native lifetime owner confirms safe disposal.
/// The budget does not retain a collection of tokens or scan them per frame.
final class ResourceBudgetLease {
  ResourceBudgetLease._(this._budget, this._bytes);

  final ResourceBudget _budget;
  int _bytes;
  var _state = ResourceBudgetState.reserved;

  int get bytes => _bytes;
  ResourceBudgetState get state => _state;

  /// Atomically adjusts this charge. Failed growth preserves the old charge.
  ///
  /// Shrinking is allowed after budget closure and during retirement. Retiring
  /// leases cannot grow. Released leases reject all resizing.
  bool tryResize(int bytes) {
    _validateBytes(bytes, 'bytes');
    _requireUnreleased();
    final delta = bytes - _bytes;
    if (delta > 0 &&
        (_budget.isClosed ||
            _state == ResourceBudgetState.retiring ||
            delta > _budget.availableBytes)) {
      return false;
    }
    if (delta == 0) return true;
    _budget._adjust(_state, delta);
    _bytes = bytes;
    if (delta < 0) _budget._notifySpaceAvailable();
    return true;
  }

  /// Transfers a prepared reservation to live ownership without freeing space.
  /// Late creation after budget closure must be disposed and released instead.
  void promote() {
    if (_state != ResourceBudgetState.reserved || _budget.isClosed) {
      throw StateError('Only an open reservation can become live.');
    }
    _transfer(ResourceBudgetState.live);
  }

  /// Marks live work for safe retirement without freeing any space.
  void retire() {
    if (_state != ResourceBudgetState.live) {
      throw StateError('Only a live lease can retire.');
    }
    _transfer(ResourceBudgetState.retiring);
  }

  void _transfer(ResourceBudgetState next) {
    _budget._adjust(_state, -_bytes);
    _budget._adjust(next, _bytes);
    _state = next;
  }

  /// Releases once, returning false on subsequent calls. Native disposal and
  /// settlement of uncancellable work must happen before calling this method.
  bool release() {
    if (_state == ResourceBudgetState.released) return false;
    final releasedBytes = _bytes;
    _budget._adjust(_state, -releasedBytes);
    _bytes = 0;
    _state = ResourceBudgetState.released;
    if (releasedBytes > 0) _budget._notifySpaceAvailable();
    return true;
  }

  void _requireUnreleased() {
    if (_state == ResourceBudgetState.released) {
      throw StateError('A released lease cannot be resized.');
    }
  }
}

void _validateBytes(int bytes, String name) {
  if (bytes < 0) throw RangeError.value(bytes, name, 'must be nonnegative');
}
