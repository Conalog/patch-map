import 'dart:ui' show Offset;

import '../api/edit_history.dart';
import '../api/target.dart';
import '../api/update.dart';
import '../geometry/affine.dart' show localTranslation;
import '../presentation/record_delta.dart';

/// One bounded history for committed edits and editor selections.
final class EditHistory {
  EditHistory(this.limit);

  final int limit;
  final _entries = <EditHistoryEntry>[];
  int _cursor = 0;
  bool get isEmpty => _entries.isEmpty;

  PatchMapEditHistoryState state({required bool active, required bool busy}) {
    final redoDepth = _entries.length - _cursor;
    return (
      undoDepth: _cursor,
      redoDepth: redoDepth,
      canUndo: active && !busy && _cursor > 0,
      canRedo: active && !busy && redoDepth > 0,
      isBusy: busy,
    );
  }

  void recordPositions(
    Map<PatchMapTarget, RecordDelta> changes,
    Iterable<String> Function()? selection,
  ) {
    final positions = <String, _PositionChange>{};
    for (final entry in changes.entries) {
      final before = localTranslation(entry.value.before);
      final after = localTranslation(entry.value.after);
      if (before != after) positions[entry.key.id] = (before, after);
    }
    if (positions.isEmpty) return;

    final selected = selection?.call().toList() ?? const <String>[];
    _append(EditHistoryEntry._(positions, selected, selected));
  }

  bool recordSelection(Iterable<String> before, Iterable<String> after) {
    final previous = before.toSet();
    final next = after.toSet();
    if (previous.length == next.length && previous.containsAll(next)) {
      return false;
    }
    _append(EditHistoryEntry._(const {}, previous.toList(), next.toList()));
    return true;
  }

  void _append(EditHistoryEntry entry) {
    _entries.replaceRange(_cursor, _entries.length, [entry]);
    if (_entries.length > limit) _entries.removeAt(0);
    _cursor = _entries.length;
  }

  EditHistoryEntry? at({required bool redo}) {
    final index = redo ? _cursor : _cursor - 1;
    return index < 0 || index >= _entries.length ? null : _entries[index];
  }

  void advance({required bool redo}) => _cursor += redo ? 1 : -1;

  bool conflicts(PatchMapTarget target, RecordDelta delta) {
    if (target.componentId != null ||
        delta.fields & RecordFields.attrsTransform == 0) {
      return false;
    }
    final before = localTranslation(delta.before);
    final after = localTranslation(delta.after);
    final x = before.dx != after.dx, y = before.dy != after.dy;
    if (!x && !y) return false;
    return _entries.any((entry) {
      final position = entry._positions[target.id];
      return position != null &&
          (x && _xChanged(position) || y && _yChanged(position));
    });
  }

  void clear() {
    _entries.clear();
    _cursor = 0;
  }
}

final class EditHistoryEntry {
  EditHistoryEntry._(
    this._positions,
    this._beforeSelection,
    this._afterSelection,
  );

  final Map<String, _PositionChange> _positions;
  final List<String> _beforeSelection, _afterSelection;
  bool get hasPositions => _positions.isNotEmpty;
  Iterable<String> get ids => _positions.keys;

  List<String> selection({required bool redo}) =>
      redo ? _afterSelection : _beforeSelection;

  bool matches(
    bool redo,
    Map<String, Object?>? Function(PatchMapTarget) current,
    bool Function(String) canMove,
  ) {
    return _positions.entries.every((entry) {
      final data = current(PatchMapTarget(entry.key));
      if (data == null || !canMove(entry.key)) return false;
      final position = entry.value;
      final expected = redo ? position.$1 : position.$2;
      final actual = localTranslation(data);
      return (!_xChanged(position) || actual.dx == expected.dx) &&
          (!_yChanged(position) || actual.dy == expected.dy);
    });
  }

  List<PatchMapUpdate> updates({required bool redo}) => [
    for (final entry in _positions.entries)
      PatchMapUpdate(PatchMapTarget(entry.key), {
        'attrs': {
          if (_xChanged(entry.value))
            'x': (redo ? entry.value.$2 : entry.value.$1).dx,
          if (_yChanged(entry.value))
            'y': (redo ? entry.value.$2 : entry.value.$1).dy,
        },
      }),
  ];
}

typedef _PositionChange = (Offset, Offset);
bool _xChanged(_PositionChange change) => change.$1.dx != change.$2.dx;
bool _yChanged(_PositionChange change) => change.$1.dy != change.$2.dy;
