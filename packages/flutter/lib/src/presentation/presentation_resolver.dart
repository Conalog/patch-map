import '../api/target.dart';
import '../dataset/dataset_reader.dart';
import '../dataset/dataset_values.dart';
import '../dataset/dataset_styles.dart' show stroke;
import 'field_operations.dart';
import 'partial_values.dart' show dimensionRecord, isStrokePath;

/// Resolves sparse operations with copy-on-change maps and shared untouched data.
class PresentationResolver {
  const PresentationResolver();

  Map<PatchMapTarget, Map<String, Object?>> resolve(
    DatasetDocument document,
    PresentationPlan batch, {
    Map<String, Object?>? Function(PatchMapTarget)? current,
  }) => Map.unmodifiable({
    for (final patch in batch.patches)
      patch.target: resolvePatch(
        authoredRecord(document, patch.target),
        current?.call(patch.target) ?? authoredRecord(document, patch.target),
        patch,
      ),
  });

  Map<String, Object?> resolvePatch(
    Map<String, Object?> authored,
    Map<String, Object?> current,
    PresentationPatch patch, {
    bool remember = true,
  }) {
    final ready = patch.resolution;
    if (ready != null &&
        identical(ready.authored, authored) &&
        identical(ready.base, current)) {
      return ready.value;
    }
    var result = current;
    // Only this call owns the root copy. Nested records remain immutable and
    // shared; no partially assigned map is exposed to a caller or publication.
    var ownedRoot = false;
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
    final value = ownedRoot ? frozen(result) : current;
    if (remember) {
      patch.resolution = (authored: authored, base: current, value: value);
    }
    return value;
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
    return index == 0 ? result : frozen(result);
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
  return index == 0 ? result : frozen(result);
}
