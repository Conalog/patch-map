part of 'controller.dart';

class _HistorySnapshot {
  _HistorySnapshot(
    this.dataset,
    Map<String, JsonMap> overlays,
    List<String> selected,
    Object? companion,
  ) : selected = List.of(selected),
      companion = cloneJson(companion);
  final PatchMapDataset dataset;
  final List<String> selected;
  final Object? companion;
}

class _HistoryEntry {
  _HistoryEntry(this.before, this.after, this.actionId);
  final _HistorySnapshot before;
  _HistorySnapshot after;
  final String? actionId;
  bool editorBoundary = false;
}

class PatchMapHistoryApi {
  PatchMapHistoryApi._(this._c, this.capacity);
  final PatchMapController _c;
  final int capacity;
  final _entries = <_HistoryEntry>[];
  int _cursor = 0;
  bool _closed = false;
  final _listeners = <void Function(JsonMap)>{};
  JsonMap get state => {
    'capacity': capacity,
    'depth': _entries.length,
    'cursor': _cursor,
    'undoDepth': _cursor,
    'redoDepth': _entries.length - _cursor,
    'canUndo': _cursor > 0,
    'canRedo': _cursor < _entries.length,
    'destroyed': _c.destroyed,
  };
  PatchMapDisposer onChange(void Function(JsonMap) listener) {
    _listeners.add(listener);
    return () => _listeners.remove(listener);
  }

  void _emit() {
    final published = freezeJson(state) as JsonMap;
    for (final listener in List.of(_listeners)) {
      if (_listeners.contains(listener))
        _c._call(() {
          if (_listeners.contains(listener)) listener(published);
        });
    }
  }

  bool _record(
    _HistorySnapshot before,
    _HistorySnapshot after,
    String? actionId,
  ) {
    if (capacity == 0) return false;
    if (_cursor < _entries.length)
      _entries.removeRange(_cursor, _entries.length);
    if (!_closed &&
        actionId != null &&
        _entries.isNotEmpty &&
        _entries.last.actionId == actionId) {
      _entries.last.after = after;
    } else {
      _entries.add(_HistoryEntry(before, after, actionId));
    }
    _closed = false;
    while (_entries.length > capacity) {
      _entries.removeAt(0);
    }
    _cursor = _entries.length;
    return true;
  }

  PatchMapResult undo() => _apply('undo');
  PatchMapResult redo() => _apply('redo');
  PatchMapResult _apply(String direction) {
    final previous = _c.revisionStamp;
    final available = direction == 'undo'
        ? _cursor > 0
        : _cursor < _entries.length;
    var status = 'unavailable';
    Object? companion;
    if (available) {
      final entry = _entries[direction == 'undo' ? _cursor - 1 : _cursor];
      final snapshot = direction == 'undo' ? entry.before : entry.after;
      final ids = snapshot.selected
          .where((id) => _selectionExists(snapshot.dataset, id))
          .toList();
      final overlays = Map<String, JsonMap>.of(_c._overlays)
        ..removeWhere(
          (key, _) =>
              !snapshot.dataset.nodes.containsKey(key.split('\u0000').first),
        );
      final interactionChanged =
          !_equal(ids, _c.selection._ids) ||
          !_equal(snapshot.companion, _c._companion) ||
          entry.editorBoundary;
      final next = PatchMapRevisionTuple(
        _c._sceneRevision + 1,
        _c._viewRevision,
        _c._interactionRevision + (interactionChanged ? 1 : 0),
      );
      final bars = _c._prepareBars({}, snapshot.dataset, overlays);
      if (_c._accept(snapshot.dataset, bars.overlay ?? overlays, ids, next)) {
        _c._installBars(bars);
        _c._dataset = snapshot.dataset;
        _c._overlays = overlays;
        _c.selection._ids = ids;
        _c._companion = cloneJson(snapshot.companion);
        companion = cloneJson(snapshot.companion);
        _c._sceneRevision++;
        _c._interactionRevision = next.interaction;
        _cursor += direction == 'undo' ? -1 : 1;
        _closed = true;
        status = 'committed';
        _c._publish(selectionChanged: false, historyChanged: true);
      } else {
        status = 'refused';
      }
    }
    return PatchMapResult({
      'status': status,
      'changed': status == 'committed',
      'direction': direction,
      'previousRevisions': previous,
      'revisions': _c.revisionStamp,
      'sceneRevision': _c._sceneRevision,
      'semanticHash': _c.dataset.semanticHash,
      'history': state,
      'companion': companion,
    });
  }

  PatchMapResult clear() => _clear('host');
  PatchMapResult _clear(String reason) {
    final changed = _entries.isNotEmpty;
    _entries.clear();
    _cursor = 0;
    _closed = true;
    if (changed) _emit();
    return PatchMapResult({
      'changed': changed,
      'reason': reason,
      'history': state,
    });
  }
}

class PatchMapSelectionApi {
  PatchMapSelectionApi._(this._c);
  final PatchMapController _c;
  List<String> _ids = [];
  List<String> get ids => List.unmodifiable(_ids);
  final _listeners = <void Function(List<String>)>{};
  final _pointerListeners = <void Function(JsonMap)>{};
  PatchMapDisposer onChange(void Function(List<String>) listener) {
    _listeners.add(listener);
    return () => _listeners.remove(listener);
  }

  PatchMapDisposer onPointerChange(void Function(JsonMap) listener) {
    _pointerListeners.add(listener);
    return () => _pointerListeners.remove(listener);
  }

  List<String> set(Object targets) => _change(targets, 'set');
  List<String> add(Object targets) => _change(targets, 'add');
  List<String> remove(Object targets) => _change(targets, 'remove');
  List<String> toggle(Object targets) => _change(targets, 'toggle');
  List<String> clear() => set(<String>[]);
  List<String> _change(Object input, String operation) {
    _c._assertLive();
    final Set<String> requested;
    if (input is PatchMapTargetSet) {
      requested = _c.targets._resolve(input, duplicates: true).map((target) {
        if (target.componentId == null) return target.id;
        final match = _c.targets.get(target)!;
        return '${target.id}::${match.type}:${target.componentId}';
      }).toSet();
    } else if (input is String ||
        input is List && input.every((v) => v is String)) {
      requested = (input is String ? [input] : (input as List).cast<String>())
          .where((id) => _selectionExists(_c.dataset, id))
          .toSet();
    } else {
      requested = _c.targets
          ._resolve(input, duplicates: true)
          .where((target) => _c.targets.get(target) != null)
          .map((target) => target.id)
          .toSet();
    }
    final next = operation == 'set' ? <String>{} : _ids.toSet();
    for (final id in requested) {
      if (operation == 'remove' || operation == 'toggle' && next.contains(id)) {
        next.remove(id);
      } else {
        next.add(id);
      }
    }
    if (_equal(next.toList(), _ids)) return ids;
    if (!_c._canCommit)
      throw const PatchMapException(
        'NOT_READY',
        'Selection requires an attached surface',
      );
    final tuple = PatchMapRevisionTuple(
      _c._sceneRevision,
      _c._viewRevision,
      _c._interactionRevision + 1,
    );
    if (!_c._accept(_c.dataset, _c._overlays, next.toList(), tuple))
      throw const PatchMapException('NOT_READY', 'Surface refused selection');
    _ids = next.toList();
    _c._interactionRevision++;
    _c._publish(selectionChanged: true);
    return ids;
  }

  void _emit() {
    final published = ids;
    for (final listener in List.of(_listeners)) {
      if (_listeners.contains(listener))
        _c._call(() {
          if (_listeners.contains(listener)) listener(published);
        });
    }
  }

  /// Native host binding: actual pointer-origin publication, separate from set.
  List<String> fromPointer(Object targets, {bool toggle = false}) {
    final before = _ids.toSet();
    final result = toggle ? this.toggle(targets) : set(targets);
    final after = _ids.toSet();
    if (before.length != after.length || !before.containsAll(after)) {
      final event = <String, dynamic>{
        'source': 'pointer',
        'selected': _ids.map((id) => {'id': id}).toList(),
        'added': after.difference(before).map((id) => {'id': id}).toList(),
        'removed': before.difference(after).map((id) => {'id': id}).toList(),
        'interactionRevision': _c._interactionRevision,
      };
      for (final listener in List.of(_pointerListeners)) {
        _c._call(() => listener(_cloneMap(event)));
      }
    }
    return result;
  }
}

class PatchMapPresentationApi {
  PatchMapPresentationApi._(this._c);
  final PatchMapController _c;
  final Map<String, JsonMap> _layers = {};
  int _revision = 0;
  Map<String, double> get _alpha {
    final values = <String, double>{};
    for (final layer in _layers.values) {
      for (final entry in (layer['values'] as Map<String, double>).entries) {
        values[entry.key] = (values[entry.key] ?? 1) * entry.value;
      }
    }
    return Map.unmodifiable(values);
  }

  PatchMapResult set(String key, JsonMap layer) {
    _c._assertLive();
    if ((!layer.containsKey('matched') && !layer.containsKey('unmatched')) ||
        [
          'matched',
          'unmatched',
        ].any((k) => layer.containsKey(k) && layer[k] == null) ||
        key.trim().isEmpty ||
        layer.keys.any(
          (k) => !{'scope', 'targets', 'matched', 'unmatched'}.contains(k),
        ))
      throw const PatchMapException(
        'INVALID_INPUT',
        'Invalid presentation layer',
      );
    if (layer['scope'] is! PatchMapTargetSet)
      throw const PatchMapException(
        'INVALID_INPUT',
        'Scope must be a target set',
      );
    final scope = _c.targets._resolve(layer['scope'] as Object);
    final requested = _c.targets._resolve(
      layer['targets'] as Object,
      duplicates: true,
    );
    final keys = scope.map((t) => t.key).toSet();
    final targetKeys = requested.map((t) => t.key).toSet();
    double alpha(Object? input) {
      if (input == null) return 1;
      final paint = _map(input);
      final n = _number(paint['alphaMultiplier'], double.nan);
      if (paint.length != 1 || n < 0 || n > 1 || !n.isFinite)
        throw const PatchMapException(
          'INVALID_INPUT',
          'Invalid alpha multiplier',
        );
      return n;
    }

    final matched = alpha(layer['matched']),
        unmatched = alpha(layer['unmatched']);
    final values = {
      for (final target in scope)
        target.key: targetKeys.contains(target.key) ? matched : unmatched,
    };
    final next = <String, dynamic>{'values': values};
    final changed = !_equal(_layers[key], next);
    if (changed) {
      _layers[key] = next;
      _revision++;
      _c._notify();
    }
    return PatchMapResult({
      'changed': changed,
      'revision': _revision,
      'scopeCount': scope.length,
      'targetCount': targetKeys.length,
      'matchedCount': targetKeys.intersection(keys).length,
      'unmatchedCount': keys.difference(targetKeys).length,
      'ignoredTargetCount': targetKeys.difference(keys).length,
    });
  }

  bool clear(String key) {
    _c._assertLive();
    if (key.trim().isEmpty) {
      throw const PatchMapException(
        'INVALID_INPUT',
        'Invalid presentation layer key',
      );
    }
    if (_layers.remove(key) == null) return false;
    _revision++;
    _c._notify();
    return true;
  }
}

class PatchMapPointerApi {
  PatchMapPointerApi._(this._c);
  final PatchMapController _c;
  final _hover = <void Function(JsonMap)>{},
      _tooltip = <void Function(JsonMap)>{};
  PatchMapDisposer onHover(void Function(JsonMap) listener) {
    _hover.add(listener);
    return () => _hover.remove(listener);
  }

  PatchMapDisposer onTooltip(void Function(JsonMap) listener) {
    _tooltip.add(listener);
    return () => _tooltip.remove(listener);
  }

  void publishHover(JsonMap event) {
    for (final listener in List.of(_hover)) {
      _c._call(() => listener(_cloneMap(event)));
    }
  }

  void publishTooltip(JsonMap event) {
    for (final listener in List.of(_tooltip)) {
      _c._call(() => listener(_cloneMap(event)));
    }
  }
}

bool _selectionExists(PatchMapDataset dataset, String id) {
  if (dataset.nodes.containsKey(id)) return true;
  final separator = id.lastIndexOf('::');
  if (separator < 0) return false;
  final node = dataset.nodes[id.substring(0, separator)];
  if (node == null) return false;
  final address = id.substring(separator + 2), colon = address.indexOf(':');
  if (colon < 0) return false;
  return node.components.any(
    (value) =>
        value['type'] == address.substring(0, colon) &&
        value['id'] == address.substring(colon + 1),
  );
}
