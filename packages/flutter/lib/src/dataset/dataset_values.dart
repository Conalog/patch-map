import 'dart:collection';

/// A schema diagnostic from the detached JSON admission boundary.
class DatasetException implements Exception {
  const DatasetException(this.code, this.path, this.message);
  final String code;
  final String path;
  final String message;
  @override
  String toString() => '$code at $path: $message';
}

const missing = Object();
Never invalid(String path, String message) =>
    throw DatasetException('INVALID_VALUE', path, message);
Map<String, Object?> record(Object? value, String path) {
  if (value is! Map || value.keys.any((key) => key is! String)) {
    invalid(path, 'value must be a string-keyed object');
  }
  return value is Map<String, Object?> ? value : value.cast<String, Object?>();
}

List<Object?> array(Object? value, String path) {
  if (value is! List) invalid(path, 'value must be an array');
  return value.cast<Object?>();
}

Object? field(Map<String, Object?> value, String key) =>
    value.containsKey(key) ? value[key] : missing;
Object? required(Map<String, Object?> value, String key, String path) {
  if (!value.containsKey(key)) {
    invalid('$path.$key', 'required field is missing');
  }
  return value[key];
}

void known(Map<String, Object?> value, Iterable<String> accepted, String path) {
  final unknown = value.keys.where((key) => !accepted.contains(key)).toList()
    ..sort();
  if (unknown.isNotEmpty) {
    throw DatasetException(
      'UNKNOWN_FIELD',
      '$path.${unknown.first}',
      'field is not in the closed schema',
    );
  }
}

String string(Object? value, String path) {
  if (value is! String) invalid(path, 'value must be a string');
  return value;
}

bool boolean(Object? value, String path) {
  if (value is! bool) invalid(path, 'value must be a boolean');
  return value;
}

num number(Object? value, String path, {num? min, num? max}) {
  if (value is! num || !value.isFinite) {
    invalid(path, 'value must be a finite number');
  }
  if (min != null && value < min || max != null && value > max) {
    invalid(path, 'number is outside the accepted range');
  }
  return value;
}

String choice(Object? value, String path, Iterable<String> accepted) {
  if (value is! String || !accepted.contains(value)) {
    invalid(path, 'unsupported value');
  }
  return value;
}

Map<String, Object?> frozen(Map<String, Object?> value) =>
    Map.unmodifiable(value);
Object? cloneJson(Object? value, String path, [Set<Object>? ancestors]) {
  if (value == null || value is String || value is bool) return value;
  if (value is num) return number(value, path);
  if (value is! Map && value is! List) {
    invalid(path, 'value must be JSON-cloneable');
  }
  final parents = ancestors ?? HashSet<Object>.identity();
  if (!parents.add(value)) invalid(path, 'cyclic values are not accepted');
  try {
    if (value is List) {
      return List<Object?>.unmodifiable([
        for (var i = 0; i < value.length; i++)
          cloneJson(value[i], '$path[$i]', parents),
      ]);
    }
    final input = record(value, path);
    return frozen({
      for (final entry in input.entries)
        entry.key: cloneJson(entry.value, '$path.${entry.key}', parents),
    });
  } finally {
    parents.remove(value);
  }
}

Map<String, Object?> fixedSize(Object? value, String path) {
  if (value is num) {
    final size = number(value, path, min: 0);
    return frozen({'width': size, 'height': size});
  }
  final input = record(value, path);
  known(input, ['width', 'height'], path);
  return frozen({
    for (final key in ['width', 'height'])
      key: number(required(input, key, path), '$path.$key', min: 0),
  });
}

Object componentSize(Object? value, String path) {
  if (value is Map) {
    final input = record(value, path);
    if (input.containsKey('value') || input.containsKey('unit')) {
      return dimension(input, path);
    }
    known(input, ['width', 'height'], path);
    return frozen({
      for (final key in ['width', 'height'])
        key: dimension(required(input, key, path), '$path.$key'),
    });
  }
  return dimension(value, path);
}

Object dimension(Object? value, String path) {
  if (value is num) return number(value, path, min: 0);
  if (value is String) {
    const term = r'[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:px|%)';
    if (RegExp(r'^(?:\d+(?:\.\d+)?|\.\d+)%$').hasMatch(value) ||
        RegExp('^calc\\($term(?: \\+ $term| - $term)*\\)\$').hasMatch(value)) {
      return value;
    }
    invalid(
      path,
      'dimension must be a nonnegative percentage or strict calc()',
    );
  }
  final input = record(value, path);
  known(input, ['value', 'unit'], path);
  return frozen({
    'value': number(required(input, 'value', path), '$path.value', min: 0),
    'unit': choice(required(input, 'unit', path), '$path.unit', ['px', '%']),
  });
}

Map<String, Object?> gap(Object? value, String path) {
  if (identical(value, missing)) return frozen({'x': 0, 'y': 0});
  if (value is num) {
    final n = number(value, path, min: 0);
    return frozen({'x': n, 'y': n});
  }
  final input = record(value, path);
  known(input, ['x', 'y'], path);
  return frozen({
    for (final key in ['x', 'y'])
      key: input.containsKey(key)
          ? number(input[key], '$path.$key', min: 0)
          : 0,
  });
}

Map<String, Object?> edges(Object? value, String path) {
  if (identical(value, missing)) value = 0;
  if (value is num) {
    final n = number(value, path);
    return frozen({
      for (final key in ['top', 'right', 'bottom', 'left']) key: n,
    });
  }
  final input = record(value, path);
  known(input, ['x', 'y', 'top', 'right', 'bottom', 'left'], path);
  final x = input.containsKey('x') ? number(input['x'], '$path.x') : 0;
  final y = input.containsKey('y') ? number(input['y'], '$path.y') : 0;
  return frozen({
    for (final key in ['top', 'right', 'bottom', 'left'])
      key: input.containsKey(key)
          ? number(input[key], '$path.$key')
          : (key == 'top' || key == 'bottom' ? y : x),
  });
}

Object radius(Object? value, String path) {
  if (identical(value, missing)) return 0;
  if (value is num) return number(value, path, min: 0);
  if (value is List) {
    if (value.length != 4) {
      invalid(path, 'corner radius array must contain four entries');
    }
    return List<Object?>.unmodifiable([
      for (var i = 0; i < 4; i++) number(value[i], '$path[$i]', min: 0),
    ]);
  }
  final input = record(value, path);
  const keys = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];
  known(input, keys, path);
  return frozen({
    for (final key in keys)
      key: input.containsKey(key)
          ? number(input[key], '$path.$key', min: 0)
          : 0,
  });
}

Map<String, Object?> attrs(Object? value, String path) {
  final input = record(value, path);
  if (input.containsKey('angle') && input.containsKey('rotation')) {
    invalid(path, 'angle and rotation are mutually exclusive');
  }
  for (final key in [
    'x',
    'y',
    'angle',
    'rotation',
    'zIndex',
    'scaleX',
    'scaleY',
  ]) {
    if (input.containsKey(key)) number(input[key], '$path.$key');
  }
  if (input.containsKey('alpha')) {
    number(input['alpha'], '$path.alpha', min: 0, max: 1);
  }
  for (final key in ['scale', 'skew', 'pivot']) {
    if (!input.containsKey(key)) continue;
    final value = input[key];
    if (value is num) {
      number(value, '$path.$key');
    } else {
      final vector = record(value, '$path.$key');
      known(vector, ['x', 'y'], '$path.$key');
      for (final axis in ['x', 'y']) {
        number(required(vector, axis, '$path.$key'), '$path.$key.$axis');
      }
    }
  }
  return cloneJson(input, path)! as Map<String, Object?>;
}
