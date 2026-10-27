import '../dataset/dataset_styles.dart';
import '../dataset/dataset_values.dart';

Map<String, Object?> partialEdges(Object? value, String path) {
  if (value is num) return edges(value, path);
  final input = record(value, path);
  known(input, ['x', 'y', 'top', 'right', 'bottom', 'left'], path);
  final result = <String, Object?>{};
  if (input.containsKey('x')) {
    final n = number(input['x'], '$path.x');
    result.addAll({'left': n, 'right': n});
  }
  if (input.containsKey('y')) {
    final n = number(input['y'], '$path.y');
    result.addAll({'top': n, 'bottom': n});
  }
  for (final key in ['top', 'right', 'bottom', 'left']) {
    if (input.containsKey(key)) result[key] = number(input[key], '$path.$key');
  }
  return frozen(result);
}

Map<String, Object?> partialGap(Object? value, String path) {
  if (value is num) return gap(value, path);
  final input = record(value, path);
  known(input, ['x', 'y'], path);
  return frozen({
    for (final key in input.keys) key: number(input[key], '$path.$key', min: 0),
  });
}

Map<String, Object?> partialAttrs(
  Object? value,
  String path,
  Map<String, Object?> baseline,
) {
  final input = record(value, path);
  final angle = input.containsKey('angle') || baseline.containsKey('angle');
  final rotation =
      input.containsKey('rotation') || baseline.containsKey('rotation');
  if (angle && rotation) {
    invalid(path, 'angle and rotation are mutually exclusive');
  }
  validateAttrsScalars(input, path);
  for (final key in ['scale', 'skew', 'pivot']) {
    if (!input.containsKey(key)) continue;
    final vector = input[key];
    if (vector is num) {
      number(vector, '$path.$key');
    } else {
      final values = record(vector, '$path.$key');
      known(values, ['x', 'y'], '$path.$key');
      final old = baseline[key];
      for (final axis in ['x', 'y']) {
        if (values.containsKey(axis)) {
          number(values[axis], '$path.$key.$axis');
        } else if (old is! Map || !old.containsKey(axis)) {
          invalid('$path.$key.$axis', 'required vector coordinate is missing');
        }
      }
    }
  }
  return cloneJson(input, path)! as Map<String, Object?>;
}

Object partialSize(
  Object? value,
  String path, {
  required bool component,
  required Object? baseline,
  required bool axisReset,
}) {
  if (value is! Map ||
      value.containsKey('value') ||
      value.containsKey('unit')) {
    return component ? componentSize(value, path) : fixedSize(value, path);
  }
  final input = record(value, path);
  known(input, ['width', 'height'], path);
  for (final axis in ['width', 'height']) {
    if (!input.containsKey(axis) && _sizeAxis(baseline, axis) == null) {
      invalid('$path.$axis', 'size axis is missing');
    }
  }
  return frozen({
    for (final key in input.keys)
      key: input[key] == null && axisReset
          ? null
          : component
          ? _partialDimension(
              input[key],
              '$path.$key',
              _sizeAxis(baseline, key),
            )
          : number(input[key], '$path.$key', min: 0),
  });
}

Object _partialDimension(Object? value, String path, Object? baseline) {
  if (value is! Map) return dimension(value, path);
  final input = record(value, path);
  known(input, ['value', 'unit'], path);
  final old = dimensionRecord(baseline);
  for (final key in ['value', 'unit']) {
    if (!input.containsKey(key) && !old.containsKey(key)) {
      invalid('$path.$key', 'dimension field is missing');
    }
  }
  return frozen({
    if (input.containsKey('value'))
      'value': number(input['value'], '$path.value', min: 0),
    if (input.containsKey('unit'))
      'unit': choice(input['unit'], '$path.unit', ['px', '%']),
  });
}

Object? _sizeAxis(Object? value, String axis) {
  if (value is Map && !value.containsKey('value')) return value[axis];
  return value;
}

Map<String, Object?> dimensionRecord(Object? value) {
  if (value is num) return {'value': value, 'unit': 'px'};
  if (value is String && value.endsWith('%')) {
    return {
      'value': num.parse(value.substring(0, value.length - 1)),
      'unit': '%',
    };
  }
  return value is Map<String, Object?> ? value : const {};
}

Map<String, Object?> partialTextStyle(
  Object? value,
  String path, {
  required bool item,
  required Map<String, Object?> baseline,
}) {
  final input = record(value, path);
  final normalized = textStyle(
    input,
    path,
    item: item,
    defaults: false,
    partial: true,
  );
  final auto = input['autoFont'];
  if (auto is Map) {
    final old = baseline['autoFont'];
    final min = auto.containsKey('min')
        ? auto['min']
        : old is Map
        ? old['min']
        : null;
    final max = auto.containsKey('max')
        ? auto['max']
        : old is Map
        ? old['max']
        : null;
    if (min is num && max is num && min > max) {
      invalid('$path.autoFont', 'autoFont min must not exceed max');
    }
  }
  final tags = input['tagStyles'];
  if (tags is Map) {
    // Tag style schemas have already been checked, including cycle detection.
    // Only cross-field autoFont limits require the corresponding prior tag.
    final oldTags = baseline['tagStyles'];
    for (final key in tags.keys) {
      final tag = tags[key];
      final old = oldTags is Map ? oldTags[key] : null;
      _checkTagRanges(tag, old, '$path.tagStyles.$key');
    }
  }
  return normalized;
}

void _checkTagRanges(Object? value, Object? baseline, String path) {
  if (value is! Map) return;
  final auto = value['autoFont'];
  final old = baseline is Map ? baseline['autoFont'] : null;
  if (auto is Map) {
    final min = auto.containsKey('min')
        ? auto['min']
        : old is Map
        ? old['min']
        : null;
    final max = auto.containsKey('max')
        ? auto['max']
        : old is Map
        ? old['max']
        : null;
    if (min is num && max is num && min > max) {
      invalid('$path.autoFont', 'autoFont min must not exceed max');
    }
  }
  final tags = value['tagStyles'];
  final oldTags = baseline is Map ? baseline['tagStyles'] : null;
  if (tags is Map) {
    for (final key in tags.keys) {
      _checkTagRanges(
        tags[key],
        oldTags is Map ? oldTags[key] : null,
        '$path.tagStyles.$key',
      );
    }
  }
}

Object partialSource(
  Object? value,
  String path, {
  required String type,
  required bool atomic,
  required Object? baseline,
}) {
  if (atomic) {
    return type == 'bar' ? rectTexture(value, path) : assetSource(value, path);
  }
  if (value is String) {
    if (type == 'bar') return rectTexture(value, path);
    return value;
  }
  final input = record(value, path);
  if (baseline is! Map) {
    if (type == 'image' || type == 'icon' || input.containsKey('src')) {
      return assetSource(input, path);
    }
    return rectTexture(input, path);
  }
  final asset =
      type == 'image' ||
      type == 'icon' ||
      input.containsKey('src') ||
      baseline.containsKey('src');
  if (asset) {
    final result = assetSource(input, path, partial: true);
    if (!input.containsKey('src') && !baseline.containsKey('src')) {
      invalid('$path.src', 'source descriptor requires src');
    }
    if (baseline.keys.any(
      (key) => !['src', 'data', 'format', 'parser', 'loadParser'].contains(key),
    )) {
      invalid(path, 'cannot merge asset source into a rectangular source');
    }
    return result;
  }
  return rectTexture(input, path, partial: true);
}

/// Whether a path names a schema stroke, rather than an attrs extension key.
bool isStrokePath(List<String> path) {
  final index = path.length - 1;
  if (path[index] != 'stroke') return false;
  if (index == 0) return true;
  if (path.first != 'style') return false;
  var field = 1;
  while (field < index && path[field] == 'tagStyles') {
    field += 2;
  }
  return field == index;
}
