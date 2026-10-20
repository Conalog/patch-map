import 'dart:collection';

import '../api/target.dart';
import '../dataset/dataset_reader.dart';
import '../dataset/dataset_values.dart';
import '../dataset/dataset_styles.dart' show stroke;
import 'field_operations.dart';
import 'partial_values.dart' show dimensionRecord, isStrokePath;
import 'record_delta.dart';

/// Resolves sparse operations with copy-on-change maps and shared untouched data.
class PresentationResolver {
  const PresentationResolver();

  Map<PatchMapTarget, Map<String, Object?>> resolve(
    DatasetDocument document,
    PresentationPlan batch, {
    Map<String, Object?>? Function(PatchMapTarget)? current,
  }) {
    final resolved = <PatchMapTarget, Map<String, Object?>>{};
    for (final patch in batch.patches) {
      final authored = authoredRecord(document, patch.target);
      resolved[patch.target] = resolvePatch(
        authored,
        current?.call(patch.target) ?? authored,
        patch,
      );
    }
    return UnmodifiableMapView(resolved);
  }

  Map<String, Object?> resolvePatch(
    Map<String, Object?> authored,
    Map<String, Object?> current,
    PresentationPatch patch, {
    bool remember = true,
  }) => resolveDelta(authored, current, patch, remember: remember).after;

  RecordDelta resolveDelta(
    Map<String, Object?> authored,
    Map<String, Object?> current,
    PresentationPatch patch, {
    bool remember = true,
  }) {
    final ready = patch.resolution;
    if (ready != null &&
        identical(ready.authored, authored) &&
        identical(ready.delta.before, current)) {
      return ready.delta;
    }
    var result = current;
    // Only this call owns the root copy. Nested records remain immutable and
    // shared; no partially assigned map is exposed to a caller or publication.
    var ownedRoot = false;
    final requestedFields = patch.requestedFields;
    for (final operation in patch.operations) {
      final reset = operation.kind == FieldOperationKind.reset;
      final expected = reset
          ? readAuthoredField(authored, operation.path)
          : (exists: true, value: operation.value);
      result = _assign(
        result,
        operation.path,
        0,
        expected.value,
        remove: !expected.exists,
        ownedRoot: ownedRoot,
      );
      ownedRoot = !identical(result, current);
    }
    // The mutable root is local to this call and is never assigned again after
    // this handoff. Protect it without copying its entries a second time.
    final value = ownedRoot ? UnmodifiableMapView(result) : current;
    // A lone assignment already proved its group's value differs in _assign.
    // Only size representation equivalence, whole attrs, and multi-operation
    // cancellation need another comparison of the final candidate.
    final singleChangedGroup =
        ownedRoot &&
        patch.operations.length == 1 &&
        requestedFields != RecordFields.size &&
        requestedFields & (requestedFields - 1) == 0;
    final fields = singleChangedGroup
        ? requestedFields
        : recordChangedFields(current, value, requestedFields);
    final delta = RecordDelta(before: current, after: value, fields: fields);
    if (remember) patch.resolution = (authored: authored, delta: delta);
    return delta;
  }
}

Map<String, Object?> authoredRecord(
  DatasetDocument document,
  PatchMapTarget address,
) {
  final target = document.targets[address.id];
  if (target == null) {
    throw DatasetException(
      'MISSING_TARGET',
      address.id,
      'element target does not exist',
    );
  }
  if (address.componentId == null) return target.data;
  final component = target.components[address.componentId];
  if (component == null) {
    throw DatasetException(
      'MISSING_TARGET',
      address.toString(),
      'component target does not exist',
    );
  }
  return component;
}

({bool exists, Object? value}) readAuthoredField(
  Map<String, Object?> authored,
  List<String> path,
) => readField(authored, path);

Map<String, Object?> _assign(
  Map<String, Object?> current,
  List<String> path,
  int index,
  Object? value, {
  required bool remove,
  bool ownedRoot = false,
}) {
  final key = path[index];
  if (index == path.length - 1) {
    if (!remove &&
        value is Map<String, Object?> &&
        current[key] is! Map<String, Object?> &&
        isStrokePath(path)) {
      value = stroke(value, 'effective.stroke');
    }
    if (remove
        ? !current.containsKey(key)
        : current.containsKey(key) && presentationEqual(current[key], value)) {
      return current;
    }
    final result = index == 0 && ownedRoot
        ? current
        : Map<String, Object?>.of(current);
    if (remove) {
      result.remove(key);
    } else {
      result[key] = value;
    }
    return index == 0 ? result : UnmodifiableMapView(result);
  }
  Object? old = current[key];
  var introducedStroke = false;
  if (index == 0 &&
      key == 'size' &&
      old != null &&
      (old is! Map<String, Object?> || old.containsKey('value'))) {
    old = frozen({'width': old, 'height': old});
  }
  if ((key == 'width' || key == 'height') &&
      index == 1 &&
      path.first == 'size' &&
      old is! Map<String, Object?>) {
    old = dimensionRecord(old);
  }
  if (old is! Map<String, Object?> &&
      isStrokePath(path.sublist(0, index + 1))) {
    old = stroke(missing, 'effective.stroke');
    introducedStroke = true;
  }
  final child = old is Map<String, Object?> ? old : const <String, Object?>{};
  final next = _assign(child, path, index + 1, value, remove: remove);
  if (identical(child, next) && !introducedStroke) return current;
  if (presentationEqual(current[key], next)) return current;
  final result = index == 0 && ownedRoot
      ? current
      : Map<String, Object?>.of(current);
  result[key] = next;
  return index == 0 ? result : UnmodifiableMapView(result);
}
