/// Sorts object keys and freezes already-validated resource JSON recursively.
/// Each resource resolver retains its own validation and diagnostic contract.
Object? canonicalResourceJson(Object? value) {
  if (value is Map<String, Object?>) {
    final keys = value.keys.toList()..sort();
    return Map<String, Object?>.unmodifiable({
      for (final key in keys) key: canonicalResourceJson(value[key]),
    });
  }
  if (value is List) {
    return List<Object?>.unmodifiable(value.map(canonicalResourceJson));
  }
  return value;
}
