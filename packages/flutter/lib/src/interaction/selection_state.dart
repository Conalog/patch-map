import '../api/events.dart';
import '../geometry/geometry_snapshot.dart';
import 'input_query.dart';

final class SelectionResult {
  SelectionResult(Iterable<PatchMapObject> selected, Iterable<String> missing)
    : selected = List.unmodifiable(selected),
      missing = List.unmodifiable(missing);
  final List<PatchMapObject> selected;
  final List<String> missing;
}

/// Single ID authority. Input recognition never implicitly changes selection;
/// direct commands validate identities but deliberately bypass the input filter.
final class SelectionState {
  SelectionState({
    required this.currentGeometry,
    required this.query,
    required this.notify,
  });
  final GeometrySnapshot? Function() currentGeometry;
  final InputQuery query;
  final void Function(PatchMapInputEvent event) notify;
  final _ids = <String>{};
  bool _disposed = false;

  /// Borrowed synchronous view for the renderer; the selection owner alone mutates it.
  Iterable<String> get ids => _ids;
  List<PatchMapObject> get selected {
    final snapshot = currentGeometry();
    if (snapshot == null) return const [];
    return List.unmodifiable([
      for (final id in _ids)
        if (snapshot[id] case final node?) query.object(node),
    ]);
  }

  SelectionResult set(Iterable<String> ids) => _change(ids, 'set');
  SelectionResult add(Iterable<String> ids) => _change(ids, 'add');
  SelectionResult remove(Iterable<String> ids) => _change(ids, 'remove');
  SelectionResult toggle(Iterable<String> ids) => _change(ids, 'toggle');
  SelectionResult clear() => set(const []);

  SelectionResult _change(Iterable<String> input, String mode) {
    if (_disposed) throw StateError('Selection state is disposed');
    final snapshot = currentGeometry();
    final accepted = <String>{}, missing = <String>[];
    for (final id in input.toSet()) {
      final node = snapshot?[id];
      if (node == null || node.isContainer) {
        missing.add(id);
      } else {
        accepted.add(id);
      }
    }
    final before = selected;
    final next = mode == 'set' ? accepted : Set<String>.of(_ids);
    switch (mode) {
      case 'add':
        next.addAll(accepted);
      case 'remove':
        next.removeAll(accepted);
      case 'toggle':
        for (final id in accepted) {
          if (!next.remove(id)) next.add(id);
        }
    }
    final added = next.difference(_ids), removed = _ids.difference(next);
    _ids
      ..clear()
      ..addAll(next);
    final result = selected;
    if (added.isNotEmpty || removed.isNotEmpty) {
      notify(
        PatchMapInputEvent(
          kind: PatchMapInputKind.selectionChange,
          objects: result,
          added: result.where((value) => added.contains(value.id)),
          removed: before.where((value) => removed.contains(value.id)),
        ),
      );
    }
    return SelectionResult(result, missing);
  }

  void reset() {
    if (!_disposed) clear();
  }

  void dispose() {
    _disposed = true;
    _ids.clear();
  }
}
