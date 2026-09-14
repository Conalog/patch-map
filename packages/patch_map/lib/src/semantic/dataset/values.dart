import '../../model/json.dart';

Never invalid(String path, String detail, [String code = 'INVALID_VALUE']) =>
    throw PatchMapDatasetError(code, path, detail);

JsonMap record(Object? value, String path) {
  if (value is! Map || value.keys.any((key) => key is! String))
    invalid(path, 'expected string-keyed object');
  return value.cast<String, dynamic>();
}

void known(JsonMap value, Iterable<String> fields, String path) {
  final bad = value.keys.where((key) => !fields.contains(key)).toList()..sort();
  if (bad.isNotEmpty)
    invalid(
      '$path.${bad.first}',
      'field is not in the closed schema',
      'UNKNOWN_FIELD',
    );
}

dynamic requiredValue(JsonMap value, String key, String path) {
  if (!value.containsKey(key))
    invalid('$path.$key', 'required field is missing');
  return value[key];
}

num finite(Object? value, String path, {num? min, num? max}) {
  if (value is! num ||
      !value.isFinite ||
      (min != null && value < min) ||
      (max != null && value > max)) {
    invalid(
      path,
      'expected finite number${min == null ? '' : ' >= $min'}${max == null ? '' : ' <= $max'}',
    );
  }
  return value;
}

String string(Object? value, String path) {
  if (value is! String) invalid(path, 'expected string');
  return value;
}

bool boolean(Object? value, String path) {
  if (value is! bool) invalid(path, 'expected boolean');
  return value;
}

String enumeration(Object? value, Iterable<String> accepted, String path) {
  if (value is! String || !accepted.contains(value))
    invalid(path, 'invalid enum value');
  return value;
}

List<dynamic> array(Object? value, String path) {
  if (value is! List) invalid(path, 'expected array');
  return value;
}

JsonMap fixedSize(Object? value, String path) {
  if (value is num) {
    final size = finite(value, path, min: 0);
    return {'width': size, 'height': size};
  }
  final v = record(value, path);
  known(v, ['width', 'height'], path);
  return {
    for (final axis in ['width', 'height'])
      axis: finite(requiredValue(v, axis, path), '$path.$axis', min: 0),
  };
}

dynamic dimension(Object? value, String path) {
  if (value is num) return finite(value, path, min: 0);
  if (value is String) {
    const term = r'[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:px|%)';
    if (RegExp(r'^(?:\d+(?:\.\d+)?|\.\d+)%$').hasMatch(value) ||
        RegExp('^calc\\($term(?: \\+ $term| - $term)*\\)\$').hasMatch(value))
      return value;
    invalid(path, 'expected percentage or strict calc()');
  }
  final v = record(value, path);
  known(v, ['value', 'unit'], path);
  return {
    'value': finite(requiredValue(v, 'value', path), '$path.value', min: 0),
    'unit': enumeration(requiredValue(v, 'unit', path), [
      'px',
      '%',
    ], '$path.unit'),
  };
}

dynamic componentSize(Object? value, String path) {
  if (value is! Map) return dimension(value, path);
  final v = record(value, path);
  if (v.containsKey('value') || v.containsKey('unit'))
    return dimension(value, path);
  known(v, ['width', 'height'], path);
  return {
    for (final key in ['width', 'height'])
      key: dimension(requiredValue(v, key, path), '$path.$key'),
  };
}

JsonMap gap(Object? value, String path) {
  if (value is num) {
    final v = finite(value, path, min: 0);
    return {'x': v, 'y': v};
  }
  final v = record(value, path);
  known(v, ['x', 'y'], path);
  return {
    for (final key in ['x', 'y'])
      key: v.containsKey(key) ? finite(v[key], '$path.$key', min: 0) : 0,
  };
}

JsonMap edges(Object? value, String path) {
  if (value is num) {
    final v = finite(value, path);
    return {
      for (final key in ['top', 'right', 'bottom', 'left']) key: v,
    };
  }
  final v = record(value, path);
  known(v, ['x', 'y', 'top', 'right', 'bottom', 'left'], path);
  final x = v.containsKey('x') ? finite(v['x'], '$path.x') : 0;
  final y = v.containsKey('y') ? finite(v['y'], '$path.y') : 0;
  return {
    for (final key in ['top', 'right', 'bottom', 'left'])
      key: v.containsKey(key)
          ? finite(v[key], '$path.$key')
          : (key == 'top' || key == 'bottom' ? y : x),
  };
}

dynamic radius(Object? value, String path) {
  if (value is num) return finite(value, path, min: 0);
  if (value is List) {
    if (value.length != 4) invalid(path, 'radius requires four corners');
    return [for (var i = 0; i < 4; i++) finite(value[i], '$path[$i]', min: 0)];
  }
  final v = record(value, path);
  const keys = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];
  known(v, keys, path);
  return {
    for (final key in keys)
      key: v.containsKey(key) ? finite(v[key], '$path.$key', min: 0) : 0,
  };
}

JsonMap attrs(Object? value, String path) {
  final v = record(value, path);
  if (v.containsKey('angle') && v.containsKey('rotation'))
    invalid(path, 'angle and rotation are mutually exclusive');
  for (final key in [
    'x',
    'y',
    'angle',
    'rotation',
    'zIndex',
    'scaleX',
    'scaleY',
  ]) {
    if (v.containsKey(key)) finite(v[key], '$path.$key');
  }
  if (v.containsKey('alpha')) finite(v['alpha'], '$path.alpha', min: 0, max: 1);
  for (final key in ['scale', 'skew', 'pivot']) {
    if (!v.containsKey(key)) continue;
    final field = v[key];
    if (field is num) {
      finite(field, '$path.$key');
      continue;
    }
    final vector = record(field, '$path.$key');
    known(vector, ['x', 'y'], '$path.$key');
    for (final axis in ['x', 'y']) {
      finite(requiredValue(vector, axis, '$path.$key'), '$path.$key.$axis');
    }
  }
  return cloneJson(v, path: path) as JsonMap;
}
