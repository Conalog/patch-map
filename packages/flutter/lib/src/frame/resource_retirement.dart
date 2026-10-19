/// Retires package-owned native handles after a submitted frame. This queue
/// never schedules frames independently of the frame coordinator.
final class ResourceRetirement {
  final _pending = <void Function()>[];
  bool _closed = false;
  int get pendingCount => _pending.length;

  void enqueue(void Function() dispose) {
    if (_closed) {
      dispose();
    } else {
      _pending.add(dispose);
    }
  }

  void flush() {
    if (_pending.isEmpty) return;
    final ready = List<void Function()>.of(_pending);
    _pending.clear();
    for (final dispose in ready) {
      dispose();
    }
  }

  void close() {
    _closed = true;
    flush();
  }
}
