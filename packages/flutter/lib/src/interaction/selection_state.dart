import '../api/events.dart';
import '../geometry/geometry_snapshot.dart';
import 'input_query.dart';

final class SelectionResult {
  SelectionResult._(this.selected, Iterable<String> missing)
    : missing = List.unmodifiable(missing);
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
  // Only selected public JSON objects are retained, never nodes or layouts.
  List<PatchMapObject> _selected = const [];
  bool _disposed = false;

  /// Borrowed synchronous view for the renderer; the selection owner alone mutates it.
  Iterable<String> get ids => _ids;
  List<PatchMapObject> get selected {
    final snapshot = currentGeometry();
    if (snapshot == null) {
      return _selected = const [];
    }
    return _projectSelected(snapshot);
  }

  PatchMapObject? _object(
    GeometrySnapshot snapshot,
    String id, [
    PatchMapObject? cached,
  ]) {
    final node = snapshot[id];
    if (node == null) return null;
    // Retained commits may mutate node.data without replacing the node.
    if (cached != null &&
        identical(cached.effectiveData, node.data) &&
        identical(cached.authoredData, node.target.data) &&
        cached.type == node.target.type &&
        cached.gridId ==
            (node.target.row == null ? null : node.target.parentId) &&
        cached.row == node.target.row &&
        cached.column == node.target.column) {
      return cached;
    }
    return query.object(node);
  }

  List<PatchMapObject> _projectSelected(GeometrySnapshot snapshot) {
    List<PatchMapObject>? changed;
    Map<String, PatchMapObject>? byId;
    var index = 0, previousIndex = 0;
    for (final id in _ids) {
      PatchMapObject? cached;
      if (previousIndex < _selected.length) {
        // Removal shifts retain their old order. Only a real reorder needs
        // random lookup; initial selection and append never build this map.
        if (_selected[previousIndex].id != id) {
          while (previousIndex < _selected.length &&
              !_ids.contains(_selected[previousIndex].id)) {
            previousIndex++;
          }
        }
        if (previousIndex < _selected.length) {
          if (_selected[previousIndex].id == id) {
            cached = _selected[previousIndex++];
          } else {
            byId ??= {for (final object in _selected) object.id: object};
            cached = byId[id];
          }
        }
      }
      final object = _object(snapshot, id, cached);
      if (object == null) continue;
      if (changed != null) {
        changed.add(object);
      } else if (index >= _selected.length ||
          !identical(object, _selected[index])) {
        changed = [for (var i = 0; i < index; i++) _selected[i], object];
      }
      index++;
    }
    if (changed != null) {
      _selected = List.unmodifiable(changed);
    } else if (index != _selected.length) {
      _selected = List.unmodifiable(_selected.take(index));
    }
    return _selected;
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
    if (mode == 'add' && accepted.every(_ids.contains) ||
        mode == 'remove' && !accepted.any(_ids.contains) ||
        mode == 'toggle' && accepted.isEmpty) {
      return SelectionResult._(
        snapshot == null ? const [] : _projectSelected(snapshot),
        missing,
      );
    }
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
    // A same-set command may still reorder selection without a change event.
    final order = _ids.iterator;
    final sameOrder =
        next.length == _ids.length &&
        next.every((id) => order.moveNext() && order.current == id);
    if (sameOrder) {
      return SelectionResult._(
        snapshot == null ? _selected = const [] : _projectSelected(snapshot),
        missing,
      );
    }
    final added = next.difference(_ids), removed = _ids.difference(next);
    final removedObjects = <PatchMapObject>[
      if (snapshot != null)
        for (final id in removed) ?_object(snapshot, id),
    ];
    _ids
      ..clear()
      ..addAll(next);
    final result = snapshot == null
        ? _selected = const <PatchMapObject>[]
        : _projectSelected(snapshot);
    if (added.isNotEmpty || removed.isNotEmpty) {
      notify(
        PatchMapInputEvent(
          kind: PatchMapInputKind.selectionChange,
          objects: result,
          added: result.where((value) => added.contains(value.id)),
          removed: removedObjects,
        ),
      );
    }
    return SelectionResult._(result, missing);
  }

  void reset() {
    if (!_disposed) clear();
  }

  void dispose() {
    _disposed = true;
    _ids.clear();
    _selected = const [];
  }
}
