import 'dart:async';
import 'dart:collection';

/// One widget-wide FIFO for bar/SVG optimization image creation. A running
/// native operation occupies its slot until settlement, even after closure.
final class PreparationQueue {
  PreparationQueue({this.maximumConcurrent = 4});
  final int maximumConcurrent;
  final _waiting = Queue<void Function()>();
  bool _active = true, _closed = false;
  int _running = 0;
  int get running => _running;

  Future<T> schedule<T>(Future<T> Function() create) {
    if (_closed) return Future.error(StateError('preparation queue is closed'));
    final result = Completer<T>();
    _waiting.add(() {
      if (_closed) {
        result.completeError(StateError('preparation queue is closed'));
        return;
      }
      _running++;
      Future<T>.sync(
        create,
      ).then(result.complete, onError: result.completeError).whenComplete(() {
        _running--;
        _pump();
      });
    });
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
