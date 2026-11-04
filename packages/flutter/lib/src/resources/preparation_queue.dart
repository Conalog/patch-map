import 'dart:async';
import 'dart:collection';

/// A queued operation can be dropped only before its native creator starts.
/// Once started, its slot and resources remain owned until actual settlement.
final class PreparationCancellation {
  bool _started = false, _cancelled = false;
  void Function()? _onCancel;

  bool cancel() {
    if (_started) return false;
    _cancelled = true;
    _onCancel?.call();
    _onCancel = null;
    return true;
  }
}

/// Neutral settlement for work whose creator was never invoked.
final class PreparationCancelled implements Exception {
  const PreparationCancelled();
}

typedef PreparationScheduler<T> =
    Future<T> Function(
      Future<T> Function() create,
      PreparationCancellation cancellation,
    );

/// One widget-wide FIFO for bar/SVG optimization image creation. A running
/// native operation occupies its slot until settlement, even after closure.
final class PreparationQueue {
  PreparationQueue({this.maximumConcurrent = 4});
  final int maximumConcurrent;
  final _waiting = Queue<void Function()>();
  bool _active = true, _closed = false;
  int _running = 0;
  int get running => _running;

  Future<T> schedule<T>(
    Future<T> Function() create, {
    PreparationCancellation? cancellation,
  }) {
    if (_closed) return Future.error(StateError('preparation queue is closed'));
    final result = Completer<T>();
    final token = cancellation ?? PreparationCancellation();
    late final void Function() start;
    void cancel() {
      _waiting.remove(start);
      if (!result.isCompleted) {
        result.completeError(const PreparationCancelled());
      }
    }

    start = () {
      token._onCancel = null;
      if (_closed || token._cancelled) {
        cancel();
        return;
      }
      token._started = true;
      _running++;
      Future<T>.sync(
        create,
      ).then(result.complete, onError: result.completeError).whenComplete(() {
        _running--;
        _pump();
      });
    };
    token._onCancel = cancel;
    _waiting.add(start);
    _pump();
    return result.future;
  }

  void setActive(bool value) {
    _active = value;
    _pump();
  }

  void _pump() {
    while (!_closed &&
        _active &&
        _running < maximumConcurrent &&
        _waiting.isNotEmpty) {
      _waiting.removeFirst()();
    }
  }

  void close() {
    if (_closed) return;
    _closed = true;
    while (_waiting.isNotEmpty) {
      _waiting.removeFirst()();
    }
  }
}
