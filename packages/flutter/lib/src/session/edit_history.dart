import 'dart:ui' show Offset;

import '../api/edit_history.dart';
import '../api/target.dart';
import '../api/update.dart';
import '../dataset/dataset_reader.dart';
import '../geometry/affine.dart' show localTranslation;
import '../presentation/field_operations.dart' show presentationEqual;
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

  void recordAddition(
    DatasetDocument added,
    List<String> before,
    List<String> after,
  ) => _append(EditHistoryEntry._(const {}, before, after, added: added));

  void recordRelation(
    RelationEdit relation,
    List<String> before,
    List<String> after,
  ) => _append(EditHistoryEntry._(const {}, before, after, relation: relation));

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
    this._afterSelection, {
    this.added,
    this.relation,
  });

  final Map<String, _PositionChange> _positions;
  final List<String> _beforeSelection, _afterSelection;
  final DatasetDocument? added;
  final RelationEdit? relation;
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

typedef RelationVersion = ({
  DatasetTarget authored,
  Map<String, Object?> effective,
});

final class RelationEdit {
  RelationEdit(
    this.before,
    this.after,
    this.index, {
    required this.changesLinks,
    required this.metadataKeys,
  });

  RelationVersion before;
  final RelationVersion? after;
  final int index;
  final bool changesLinks;
  final Set<String> metadataKeys;
  String get id => before.authored.id;
  String? get parentId => before.authored.parentId;

  RelationVersion? version({required bool redo}) => redo ? after : before;

  bool matches(Map<String, Object?> current, Map<String, Object?> expected) {
    if (changesLinks &&
        !presentationEqual(current['links'], expected['links'])) {
      return false;
    }
    if (metadataKeys.isEmpty) return true;
    final raw = (current['attrs'] as Map?)?['metadata'];
    if (raw != null && raw is! Map<String, Object?>) return false;
    final currentMetadata = _metadata(current);
    final expectedMetadata = _metadata(expected);
    return metadataKeys.every(
      (key) =>
          currentMetadata.containsKey(key) ==
              expectedMetadata.containsKey(key) &&
          presentationEqual(currentMetadata[key], expectedMetadata[key]),
    );
  }

  Map<String, Object?> apply(
    Map<String, Object?> current,
    Map<String, Object?> desired,
  ) {
    final result = Map<String, Object?>.of(current);
    if (changesLinks) result['links'] = desired['links'];
    if (metadataKeys.isNotEmpty) {
      final attrs = <String, Object?>{
        ...?(current['attrs'] as Map<String, Object?>?),
      };
      final metadata = Map<String, Object?>.of(_metadata(current));
      final desiredMetadata = _metadata(desired);
      for (final key in metadataKeys) {
        if (desiredMetadata.containsKey(key)) {
          metadata[key] = desiredMetadata[key];
        } else {
          metadata.remove(key);
        }
      }
      if (metadata.isEmpty && (desired['attrs'] as Map?)?['metadata'] == null) {
        attrs.remove('metadata');
      } else {
        attrs['metadata'] = Map<String, Object?>.unmodifiable(metadata);
      }
      if (attrs.isEmpty && desired['attrs'] == null) {
        result.remove('attrs');
      } else {
        result['attrs'] = Map<String, Object?>.unmodifiable(attrs);
      }
    }
    return Map<String, Object?>.unmodifiable(result);
  }

  Map<String, Object?> _metadata(Map<String, Object?> data) =>
      (data['attrs'] as Map?)?['metadata'] as Map<String, Object?>? ?? const {};
}

typedef _PositionChange = (Offset, Offset);
bool _xChanged(_PositionChange change) => change.$1.dx != change.$2.dx;
bool _yChanged(_PositionChange change) => change.$1.dy != change.$2.dy;
