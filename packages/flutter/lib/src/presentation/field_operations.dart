import '../api/target.dart';

/// Reset is a barrier; subsequent child assignments remain ordered after it.
enum FieldOperationKind { reset, wholeSet, childrenSet }

class FieldOperation {
  FieldOperation(this.kind, Iterable<String> path, this.value)
    : path = List.unmodifiable(path);
  final FieldOperationKind kind;
  final List<String> path;
  final Object? value;
}

class PresentationPatch {
  PresentationPatch(this.target, Iterable<FieldOperation> operations)
    : operations = List.unmodifiable(operations);
  final PatchMapTarget target;
  final List<FieldOperation> operations;

  /// A bounded, identity-guarded computation memo, never pending state. Merging
  /// operations creates a new patch; rebasing against another record misses.
  ({
    Map<String, Object?> authored,
    Map<String, Object?> base,
    Map<String, Object?> value,
  })?
  resolution;
}

/// A detached claim about a caller-specified path, without request ownership.
class PresentationClaim {
  PresentationClaim(
    this.target,
    Iterable<String> path,
    this.expectedValue, {
    required this.exists,
  }) : path = List.unmodifiable(path);

  /// Operations already own an immutable path; no caller collection is shared.
  PresentationClaim.fromOperation(
    this.target,
    FieldOperation operation,
    this.expectedValue, {
    required this.exists,
  }) : path = operation.path;
  final PatchMapTarget target;
  final List<String> path;
  final Object? expectedValue;
  final bool exists;

  bool isSatisfiedBy(Map<String, Object?> effective) {
    final found = readField(effective, path);
    return found.exists == exists &&
        (!exists || presentationEqual(found.value, expectedValue));
  }
}

/// A pending value plan contains no request history or completion ownership.
class PresentationPlan {
  PresentationPlan(Iterable<PresentationPatch> patches)
    : patches = List.unmodifiable(patches);
  final List<PresentationPatch> patches;
}

/// Admission claims belong to this request; the session retains them separately.
class PresentationBatch extends PresentationPlan {
  PresentationBatch(super.patches, Iterable<PresentationClaim> claims)
    : claims = List.unmodifiable(claims);
  final List<PresentationClaim> claims;
}

({bool exists, Object? value}) readField(Object? value, Iterable<String> path) {
  var current = value;
  final keys = path.toList();
  for (var i = 0; i < keys.length; i++) {
    final key = keys[i];
    if (i == 1 &&
        keys.first == 'size' &&
        (key == 'width' || key == 'height') &&
        current != null &&
        (current is! Map<String, Object?> || current.containsKey('value'))) {
      continue;
    }
    if (i == 2 &&
        keys.first == 'size' &&
        (keys[1] == 'width' || keys[1] == 'height')) {
      if (current is num && (key == 'value' || key == 'unit')) {
        current = key == 'value' ? current : 'px';
        continue;
      }
      if (current is String &&
          current.endsWith('%') &&
          (key == 'value' || key == 'unit')) {
        current = key == 'value'
            ? num.parse(current.substring(0, current.length - 1))
            : '%';
        continue;
      }
    }
    if (current is! Map<String, Object?> || !current.containsKey(key)) {
      return (exists: false, value: null);
    }
    current = current[key];
  }
  return (exists: true, value: current);
}

bool presentationEqual(Object? left, Object? right) {
  if (identical(left, right) || left == right) return true;
  if (left is List && right is List) {
    if (left.length != right.length) return false;
    for (var i = 0; i < left.length; i++) {
      if (!presentationEqual(left[i], right[i])) return false;
    }
    return true;
  }
  if (left is Map && right is Map) {
    if (left.length != right.length) return false;
    for (final key in left.keys) {
      if (!right.containsKey(key) ||
          !presentationEqual(left[key], right[key])) {
        return false;
      }
    }
    return true;
  }
  return false;
}
